import { ethers } from 'ethers';
import { PriceData } from '../types';
import { priceStore } from '../price-store';

//precompiled ABI for faster contract calls
const UNISWAP_V2_PAIR_ABI = [
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
];

const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

interface ChainConfig {
  name: string;
  rpcUrl: string;
  wethAddress: string;
  usdtAddress: string;
  factoryAddress?: string;
}

//CHAIN CONFIGURATIONS
const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  eth: {
    name: 'Ethereum',
    rpcUrl: process.env.ETH_RPC_URL || 'https://rpc.ankr.com/eth',
    wethAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    usdtAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    factoryAddress: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
  },
  bsc: {
    name: 'BSC',
    rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
    wethAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
    usdtAddress: '0x55d398326f99059fF775485246999027B3197955',
    factoryAddress: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
  },
  polygon: {
    name: 'Polygon',
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://rpc-mainnet.matic.quiknode.pro',
    wethAddress: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC
    usdtAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    factoryAddress: '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32',
  },
  arbitrum: {
    name: 'Arbitrum',
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    wethAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    usdtAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    factoryAddress: '0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9',
  },
};

export class DEXPriceFetcher {
  private providers = new Map<string, ethers.JsonRpcProvider>();
  private contracts = new Map<string, ethers.Contract>();
  private priceCache = new Map<string, { price: number; timestamp: number }>();
  private readonly CACHE_DURATION = 10000; // 10 seconds cache

  constructor() {
    this.initializeProviders();
  }

  /**
   * INITIALIZE RPC PROVIDERS
   * Pre-create providers for all supported chains
   */
  private initializeProviders(): void {
    for (const [chain, config] of Object.entries(CHAIN_CONFIGS)) {
      try {
        const provider = new ethers.JsonRpcProvider(config.rpcUrl);
        this.providers.set(chain, provider);
        console.log(`✅ Initialized ${config.name} provider`);
      } catch (error) {
        console.error(`❌ Failed to initialize ${config.name} provider:`, error);
      }
    }
  }

  /**
   * GET PRICE FROM DEX CONTRACT
   * Main price fetching method with caching
   */
  async getPrice(chain: string, contractAddress: string, ticker: string): Promise<number> {
    const cacheKey = `${chain}-${contractAddress}`;

    // Check cache first
    const cached = this.priceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.price;
    }

    try {
      const price = await this.fetchPriceFromContract(chain, contractAddress);

      // Cache the result
      this.priceCache.set(cacheKey, {
        price,
        timestamp: Date.now(),
      });

      // Update price store
      const priceData: PriceData = {
        exchange: `${chain}-dex`,
        symbol: ticker,
        price,
        timestamp: Date.now(),
        type: 'dex',
      };

      priceStore.updatePrice(ticker, `${chain}-dex`, priceData);

      return price;
    } catch (error) {
      console.error(`Failed to fetch price from ${chain}:`, error);
      throw error;
    }
  }

  /**
   * FETCH PRICE FROM UNISWAP V2 STYLE CONTRACT
   * Works with PancakeSwap, Uniswap, SushiSwap, etc.
   */
  private async fetchPriceFromContract(chain: string, contractAddress: string): Promise<number> {
    const provider = this.providers.get(chain);
    if (!provider) {
      throw new Error(`Provider not found for chain: ${chain}`);
    }

    const config = CHAIN_CONFIGS[chain];
    if (!config) {
      throw new Error(`Chain config not found: ${chain}`);
    }

    //get or create contract instance
    let pairContract = this.contracts.get(`${chain}-${contractAddress}`);
    if (!pairContract) {
      pairContract = new ethers.Contract(contractAddress, UNISWAP_V2_PAIR_ABI, provider);
      this.contracts.set(`${chain}-${contractAddress}`, pairContract);
    }

    //fetch reserves and token info
    const [reserves, token0Address, token1Address] = await Promise.all([
      pairContract.getReserves(),
      pairContract.token0(),
      pairContract.token1(),
    ]);

    const [reserve0, reserve1] = reserves;

    //determine which token is USDT/USDC (stable coin)
    const isToken0Stable = this.isStableCoin(token0Address, config);
    const isToken1Stable = this.isStableCoin(token1Address, config);

    if (!isToken0Stable && !isToken1Stable) {
      //neither token is stable, try to find USD price through WETH
      return this.calculatePriceViaWETH(
        chain,
        token0Address,
        token1Address,
        reserve0,
        reserve1,
        config,
      );
    }

    // Calculate price: stable_reserve / token_reserve
    const price = isToken0Stable
      ? Number(reserve0) / Number(reserve1)
      : Number(reserve1) / Number(reserve0);

    return price;
  }

  private isStableCoin(address: string, config: ChainConfig): boolean {
    const stableCoins = [
      config.usdtAddress.toLowerCase(),
      '0xa0b86a33e6441c8c6d0fe5c93ed31c3b86c57b48', //USDC
    ];

    return stableCoins.includes(address.toLowerCase());
  }

  private async calculatePriceViaWETH(
    chain: string,
    token0: string,
    token1: string,
    reserve0: bigint,
    reserve1: bigint,
    config: ChainConfig,
  ): Promise<number> {
    //NEED TO FETCH WETH PRICE !!!!!!!!!!!!!!!!!!!!!!!!!!!

    const isToken0WETH = token0.toLowerCase() === config.wethAddress.toLowerCase();
    const isToken1WETH = token1.toLowerCase() === config.wethAddress.toLowerCase();

    if (!isToken0WETH && !isToken1WETH) {
      throw new Error('Cannot determine USD price - no stable coin or WETH pair');
    }

    //МУЛЯЖ!!!!
    const WETH_USD_PRICE = 4200;

    const wethReserve = isToken0WETH ? reserve0 : reserve1;
    const tokenReserve = isToken0WETH ? reserve1 : reserve0;

    const tokenPriceInWETH = Number(wethReserve) / Number(tokenReserve);
    return tokenPriceInWETH * WETH_USD_PRICE;
  }

  startMonitoring(
    chain: string,
    contractAddress: string,
    ticker: string,
    intervalMs: number = 500,
  ): () => void {
    console.log(`Starting DEX monitoring: ${chain} - ${ticker}`);

    const fetchPrice = async () => {
      try {
        await this.getPrice(chain, contractAddress, ticker);
      } catch (error) {
        console.error(`DEX price fetch failed for ${chain}-${ticker}:`, error);
      }
    };

    //initial fetch
    fetchPrice();

    //set up interval
    const intervalId = setInterval(fetchPrice, intervalMs);

    //return cleanup function
    return () => {
      clearInterval(intervalId);
      console.log(`Stopped DEX monitoring: ${chain} - ${ticker}`);
    };
  }

  getSupportedChains(): string[] {
    return Object.keys(CHAIN_CONFIGS);
  }

  clearCache(): void {
    this.priceCache.clear();
  }
}

export const dexPriceFetcher = new DEXPriceFetcher();
