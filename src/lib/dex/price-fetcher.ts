import { ethers } from 'ethers';
import { PriceData } from '../types';
import { priceStore } from '../price-store';

// Precompiled ABIs
const UNISWAP_V2_PAIR_ABI = [
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
];

const UNISWAP_V2_FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) view returns (address pair)',
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
  usdcAddress: string;
  factoryAddress: string;
  wethUsdtPair: string;
}

//CHAIN CONFIGURATIONS
const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  eth: {
    name: 'Ethereum',
    rpcUrl:
      process.env.ETH_RPC_URL ||
      'https://rpc.ankr.com/eth/7f707d2d7be4b92c171fe0fd2939423b4f1427f092df12b75773ef7777e3b631',
    wethAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    usdtAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    usdcAddress: '0xA0b86a33E6441c8C6d0fe5C93ed31C3b86C57B48',
    factoryAddress: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    wethUsdtPair: '0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852', // WETH/USDT pair
  },
  bsc: {
    name: 'BSC',
    rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
    wethAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
    usdtAddress: '0x55d398326f99059fF775485246999027B3197955',
    usdcAddress: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    factoryAddress: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
    wethUsdtPair: '0x16b9a82891338f9bA80E2D6970FddA79D1eb0daE', // WBNB/USDT pair
  },
  polygon: {
    name: 'Polygon',
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://rpc-mainnet.matic.quiknode.pro',
    wethAddress: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC
    usdtAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    usdcAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    factoryAddress: '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32',
    wethUsdtPair: '0x604229c960e5CACF2aaEAc8Be68Ac07BA9dF81c3', // WMATIC/USDT pair
  },
  arbitrum: {
    name: 'Arbitrum',
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    wethAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    usdtAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    usdcAddress: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
    factoryAddress: '0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9',
    wethUsdtPair: '0xcda53B1F66614552F834cEeF361A8D12a0B8DaD8', // WETH/USDT pair
  },
};

export class DEXPriceFetcher {
  private providers = new Map<string, ethers.JsonRpcProvider>();
  private contracts = new Map<string, ethers.Contract>();
  private wethPriceCache: { price: number; timestamp: number } | null = null;
  private readonly WETH_CACHE_DURATION = 3000; // 3 seconds for WETH price cache

  constructor() {
    this.initializeProviders();
  }

  //create providers for all supported chains
  private initializeProviders(): void {
    for (const [chain, config] of Object.entries(CHAIN_CONFIGS)) {
      try {
        const provider = new ethers.JsonRpcProvider(config.rpcUrl, undefined, {
          staticNetwork: true,
        });
        this.providers.set(chain, provider);
        console.log(`Initialized ${config.name} provider`);
      } catch (error) {
        console.error(`Failed to initialize ${config.name} provider:`, error);
      }
    }
  }

  async getTokenPrice(chain: string, tokenAddress: string, ticker: string): Promise<number> {
    try {
      const price = await this.fetchTokenPriceFromDEX(chain, tokenAddress);

      //update price store
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
      console.error(`Failed to fetch price for ${ticker} on ${chain}:`, error);
      throw error;
    }
  }

  private async fetchTokenPriceFromDEX(chain: string, tokenAddress: string): Promise<number> {
    const provider = this.providers.get(chain);
    if (!provider) {
      throw new Error(`Provider not found for chain: ${chain}`);
    }

    const config = CHAIN_CONFIGS[chain];
    if (!config) {
      throw new Error(`Chain config not found: ${chain}`);
    }

    //try to find TOKEN/USDT pair
    let pairAddress = await this.findTokenPair(chain, tokenAddress, config.usdtAddress);
    let isUSDT = true;

    if (pairAddress === ethers.ZeroAddress) {
      //try USDC
      pairAddress = await this.findTokenPair(chain, tokenAddress, config.usdcAddress);
      isUSDT = false;
    }

    if (pairAddress === ethers.ZeroAddress) {
      //fallback with WETH
      pairAddress = await this.findTokenPair(chain, tokenAddress, config.wethAddress);
      if (pairAddress === ethers.ZeroAddress) {
        throw new Error(`No suitable pair found for token ${tokenAddress} on ${chain}`);
      }

      return this.calculatePriceViaWETH(chain, pairAddress, tokenAddress, config);
    }

    const pairContract = new ethers.Contract(pairAddress, UNISWAP_V2_PAIR_ABI, provider);

    const [reserves, token0Address, token1Address] = await Promise.all([
      pairContract.getReserves(),
      pairContract.token0(),
      pairContract.token1(),
    ]);

    const [reserve0, reserve1] = reserves;

    const targetToken = tokenAddress.toLowerCase();
    const isToken0Target = token0Address.toLowerCase() === targetToken;

    if (!isToken0Target && token1Address.toLowerCase() !== targetToken) {
      throw new Error(`Token ${tokenAddress} not found in pair ${pairAddress}`);
    }

    const [token0Decimals, token1Decimals] = await this.getTokenDecimals(
      provider,
      token0Address,
      token1Address,
    );

    const reserve0Adjusted = Number(reserve0) / Math.pow(10, token0Decimals);
    const reserve1Adjusted = Number(reserve1) / Math.pow(10, token1Decimals);

    const price = isToken0Target
      ? reserve1Adjusted / reserve0Adjusted // stable/token
      : reserve0Adjusted / reserve1Adjusted; // stable/token

    return price;
  }

  //find token pair using factory contract
  private async findTokenPair(chain: string, tokenA: string, tokenB: string): Promise<string> {
    const provider = this.providers.get(chain);
    const config = CHAIN_CONFIGS[chain];

    if (!provider || !config) {
      return ethers.ZeroAddress;
    }

    try {
      const factoryContract = new ethers.Contract(
        config.factoryAddress,
        UNISWAP_V2_FACTORY_ABI,
        provider,
      );

      const pairAddress = await factoryContract.getPair(tokenA, tokenB);
      return pairAddress;
    } catch (error) {
      console.error(`Error finding pair for ${tokenA}/${tokenB} on ${chain}:`, error);
      return ethers.ZeroAddress;
    }
  }

  private async getTokenDecimals(
    provider: ethers.JsonRpcProvider,
    token0: string,
    token1: string,
  ): Promise<[number, number]> {
    try {
      const token0Contract = new ethers.Contract(token0, ERC20_ABI, provider);
      const token1Contract = new ethers.Contract(token1, ERC20_ABI, provider);

      const [decimals0, decimals1] = await Promise.all([
        token0Contract.decimals(),
        token1Contract.decimals(),
      ]);

      return [Number(decimals0), Number(decimals1)];
    } catch (error) {
      console.warn('Could not fetch token decimals, using default 18:', error);
      return [18, 18];
    }
  }

  //calculate price via WETH (for tokens that only have WETH pairs)
  private async calculatePriceViaWETH(
    chain: string,
    pairAddress: string,
    tokenAddress: string,
    config: ChainConfig,
  ): Promise<number> {
    const provider = this.providers.get(chain);
    if (!provider) {
      throw new Error(`Provider not found for chain: ${chain}`);
    }

    //get WETH price in USD
    const wethPrice = await this.getWETHPrice(chain);

    //get pair contract
    const pairContract = new ethers.Contract(pairAddress, UNISWAP_V2_PAIR_ABI, provider);

    const [reserves, token0Address, token1Address] = await Promise.all([
      pairContract.getReserves(),
      pairContract.token0(),
      pairContract.token1(),
    ]);

    const [reserve0, reserve1] = reserves;

    //determine which token is WETH and which is TARGET
    const isToken0WETH = token0Address.toLowerCase() === config.wethAddress.toLowerCase();
    const isToken0Target = token0Address.toLowerCase() === tokenAddress.toLowerCase();

    if (!isToken0WETH && token1Address.toLowerCase() !== config.wethAddress.toLowerCase()) {
      throw new Error('WETH not found in pair');
    }

    //get decimals
    const [token0Decimals, token1Decimals] = await this.getTokenDecimals(
      provider,
      token0Address,
      token1Address,
    );

    const reserve0Adjusted = Number(reserve0) / Math.pow(10, token0Decimals);
    const reserve1Adjusted = Number(reserve1) / Math.pow(10, token1Decimals);

    let tokenPriceInWETH: number;

    if (isToken0Target) {
      //Token is token0, WETH is token1
      tokenPriceInWETH = reserve1Adjusted / reserve0Adjusted;
    } else {
      //Token is token1, WETH is token0
      tokenPriceInWETH = reserve0Adjusted / reserve1Adjusted;
    }

    return tokenPriceInWETH * wethPrice;
  }

  //get WETH price from WETH/USDT pair
  private async getWETHPrice(chain: string): Promise<number> {
    //cache for WETH price
    if (
      this.wethPriceCache &&
      Date.now() - this.wethPriceCache.timestamp < this.WETH_CACHE_DURATION
    ) {
      return this.wethPriceCache.price;
    }

    const provider = this.providers.get(chain);
    const config = CHAIN_CONFIGS[chain];

    if (!provider || !config) {
      throw new Error(`Cannot fetch WETH price for chain: ${chain}`);
    }

    try {
      const pairContract = new ethers.Contract(config.wethUsdtPair, UNISWAP_V2_PAIR_ABI, provider);

      const [reserves, token0Address, token1Address] = await Promise.all([
        pairContract.getReserves(),
        pairContract.token0(),
        pairContract.token1(),
      ]);

      const [reserve0, reserve1] = reserves;

      //determine which token is WETH
      const isToken0WETH = token0Address.toLowerCase() === config.wethAddress.toLowerCase();

      //get decimals
      const [token0Decimals, token1Decimals] = await this.getTokenDecimals(
        provider,
        token0Address,
        token1Address,
      );

      //calculate WETH price
      const reserve0Adjusted = Number(reserve0) / Math.pow(10, token0Decimals);
      const reserve1Adjusted = Number(reserve1) / Math.pow(10, token1Decimals);

      const wethPrice = isToken0WETH
        ? reserve1Adjusted / reserve0Adjusted // USDT/WETH
        : reserve0Adjusted / reserve1Adjusted; // USDT/WETH

      // Cache the result
      this.wethPriceCache = {
        price: wethPrice,
        timestamp: Date.now(),
      };

      return wethPrice;
    } catch (error) {
      console.error(`Failed to fetch WETH price on ${chain}:`, error);
      throw error;
    }
  }

  startMonitoring(
    chain: string,
    tokenAddress: string,
    ticker: string,
    intervalMs: number = 500,
  ): () => void {
    console.log(`Starting DEX monitoring: ${chain} - ${ticker} (${tokenAddress})`);

    const fetchPrice = async () => {
      try {
        await this.getTokenPrice(chain, tokenAddress, ticker);
      } catch (error) {
        console.error(`DEX price fetch failed for ${chain}-${ticker}:`, error);
      }
    };

    fetchPrice();

    const intervalId = setInterval(fetchPrice, intervalMs);

    return () => {
      clearInterval(intervalId);
      console.log(`Stopped DEX monitoring: ${chain} - ${ticker}`);
    };
  }

  getSupportedChains(): string[] {
    return Object.keys(CHAIN_CONFIGS);
  }

  clearWETHCache(): void {
    this.wethPriceCache = null;
  }
}

export const dexPriceFetcher = new DEXPriceFetcher();
