import { ethers } from 'ethers';
import { PriceData } from '../types';
import { priceStore } from '../price-store';

// Precompiled ABIs for faster contract calls
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

// CHAIN CONFIGURATIONS with proper checksummed addresses
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
    wethUsdtPair: '0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852',
  },
  bsc: {
    name: 'BSC',
    rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
    wethAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    usdtAddress: '0x55d398326f99059fF775485246999027B3197955',
    usdcAddress: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    factoryAddress: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
    wethUsdtPair: '0x16b9a82891338f9bA80E2D6970FddA79D1eb0daE',
  },
  polygon: {
    name: 'Polygon',
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://rpc-mainnet.matic.quiknode.pro',
    wethAddress: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    usdtAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    usdcAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    factoryAddress: '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32',
    wethUsdtPair: '0x604229c960e5CACF2aaEAc8Be68Ac07BA9dF81c3',
  },
  arbitrum: {
    name: 'Arbitrum',
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    wethAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    usdtAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    usdcAddress: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
    factoryAddress: '0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9',
    wethUsdtPair: '0xcda53B1F66614552F834cEeF361A8D12a0B8DaD8',
  },
};

export class DEXPriceFetcher {
  private providers = new Map<string, ethers.JsonRpcProvider>();
  private factoryContracts = new Map<string, ethers.Contract>();
  private wethPrice: number | null = null;
  private lastWethUpdate = 0;
  private readonly WETH_UPDATE_INTERVAL = 3000; // 3 seconds

  constructor() {
    this.initializeProviders();
    this.preloadWethPrice();
  }

  private initializeProviders(): void {
    for (const [chain, config] of Object.entries(CHAIN_CONFIGS)) {
      try {
        // Optimize provider settings for speed
        const provider = new ethers.JsonRpcProvider(config.rpcUrl, undefined, {
          staticNetwork: true,
          batchStallTime: 10, // Reduce batch stall time for faster responses
          batchMaxSize: 100,
        });

        // Pre-create factory contract
        const factoryContract = new ethers.Contract(
          config.factoryAddress,
          UNISWAP_V2_FACTORY_ABI,
          provider
        );

        this.providers.set(chain, provider);
        this.factoryContracts.set(chain, factoryContract);
        console.log(`Initialized ${config.name} provider and factory`);
      } catch (error) {
        console.error(`Failed to initialize ${config.name}:`, error);
      }
    }
  }

  // Preload WETH price in background
  private async preloadWethPrice(): Promise<void> {
    try {
      await this.updateWethPrice('eth'); // Default to Ethereum for WETH price
    } catch (error) {
      console.warn('Failed to preload WETH price:', error);
    }
  }

  async getTokenPrice(chain: string, tokenAddress: string, ticker: string): Promise<number> {
    try {
      // Ensure address is properly checksummed
      const checksummedAddress = ethers.getAddress(tokenAddress.toLowerCase());
      
      const price = await this.fetchTokenPriceOptimized(chain, checksummedAddress);

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
      console.error(`Failed to fetch price for ${ticker} on ${chain}:`, error);
      throw error;
    }
  }

  // Optimized price fetching with parallel calls
  private async fetchTokenPriceOptimized(chain: string, tokenAddress: string): Promise<number> {
    const provider = this.providers.get(chain);
    const factory = this.factoryContracts.get(chain);
    const config = CHAIN_CONFIGS[chain];

    if (!provider || !factory || !config) {
      throw new Error(`Chain ${chain} not properly initialized`);
    }

    // Ensure all addresses are checksummed
    const checksummedToken = ethers.getAddress(tokenAddress);
    const checksummedUSDT = ethers.getAddress(config.usdtAddress);
    const checksummedUSDC = ethers.getAddress(config.usdcAddress);
    const checksummedWETH = ethers.getAddress(config.wethAddress);

    try {
      // Try to find pairs in parallel for speed
      const [usdtPair, usdcPair, wethPair] = await Promise.allSettled([
        factory.getPair(checksummedToken, checksummedUSDT),
        factory.getPair(checksummedToken, checksummedUSDC),
        factory.getPair(checksummedToken, checksummedWETH),
      ]);

      // Process results and find valid pairs
      let targetPair: string | null = null;
      let stableAddress: string | null = null;
      let stableDecimals = 6; // Default for USDT/USDC

      if (usdtPair.status === 'fulfilled' && usdtPair.value !== ethers.ZeroAddress) {
        targetPair = usdtPair.value;
        stableAddress = checksummedUSDT;
        stableDecimals = 6; // USDT has 6 decimals
      } else if (usdcPair.status === 'fulfilled' && usdcPair.value !== ethers.ZeroAddress) {
        targetPair = usdcPair.value;
        stableAddress = checksummedUSDC;
        stableDecimals = 6; // USDC has 6 decimals
      } else if (wethPair.status === 'fulfilled' && wethPair.value !== ethers.ZeroAddress) {
        targetPair = wethPair.value;
        stableAddress = checksummedWETH;
        stableDecimals = 18; // WETH has 18 decimals
      }

      if (!targetPair || !stableAddress) {
        throw new Error(`No trading pair found for token ${checksummedToken} on ${chain}`);
      }

      // Get price from the pair
      if (stableAddress === checksummedWETH) {
        return this.calculatePriceViaWETH(provider, targetPair, checksummedToken, checksummedWETH, chain);
      } else {
        return this.calculateDirectPrice(provider, targetPair, checksummedToken, stableAddress, stableDecimals);
      }
    } catch (error) {
      console.error(`Error fetching price for ${checksummedToken}:`, error);
      throw error;
    }
  }

  // Calculate direct USD price from TOKEN/USDT or TOKEN/USDC pair
  private async calculateDirectPrice(
    provider: ethers.JsonRpcProvider,
    pairAddress: string,
    tokenAddress: string,
    stableAddress: string,
    stableDecimals: number
  ): Promise<number> {
    const pairContract = new ethers.Contract(pairAddress, UNISWAP_V2_PAIR_ABI, provider);

    // Get all data in parallel for speed
    const [reservesResult, token0Result, token1Result, tokenDecimalsResult] = await Promise.allSettled([
      pairContract.getReserves(),
      pairContract.token0(),
      pairContract.token1(),
      this.getTokenDecimals(provider, tokenAddress),
    ]);

    if (reservesResult.status !== 'fulfilled' || token0Result.status !== 'fulfilled' || token1Result.status !== 'fulfilled') {
      throw new Error('Failed to fetch pair data');
    }

    const [reserve0, reserve1] = reservesResult.value;
    const token0 = ethers.getAddress(token0Result.value);
    const token1 = ethers.getAddress(token1Result.value);
    const tokenDecimals = tokenDecimalsResult.status === 'fulfilled' ? tokenDecimalsResult.value : 18;

    // Determine token positions
    const tokenIsToken0 = token0 === ethers.getAddress(tokenAddress);
    
    if (!tokenIsToken0 && token1 !== ethers.getAddress(tokenAddress)) {
      throw new Error(`Token ${tokenAddress} not found in pair`);
    }

    // Calculate price correctly: stable_amount / token_amount
    let tokenReserve: bigint;
    let stableReserve: bigint;

    if (tokenIsToken0) {
      tokenReserve = reserve0;
      stableReserve = reserve1;
    } else {
      tokenReserve = reserve1;
      stableReserve = reserve0;
    }

    // Convert to proper decimals and calculate price
    const tokenReserveAdjusted = Number(tokenReserve) / Math.pow(10, tokenDecimals);
    const stableReserveAdjusted = Number(stableReserve) / Math.pow(10, stableDecimals);

    // Price = stable_amount / token_amount (how many USD for 1 token)
    const price = stableReserveAdjusted / tokenReserveAdjusted;

    if (price <= 0 || !isFinite(price)) {
      throw new Error('Invalid price calculation result');
    }

    return price;
  }

  // Calculate price via WETH with live WETH price
  private async calculatePriceViaWETH(
    provider: ethers.JsonRpcProvider,
    pairAddress: string,
    tokenAddress: string,
    wethAddress: string,
    chain: string
  ): Promise<number> {
    // Update WETH price if needed
    await this.updateWethPriceIfNeeded(chain);

    if (!this.wethPrice) {
      throw new Error('WETH price not available');
    }

    const pairContract = new ethers.Contract(pairAddress, UNISWAP_V2_PAIR_ABI, provider);

    // Get all data in parallel
    const [reservesResult, token0Result, token1Result, tokenDecimalsResult] = await Promise.allSettled([
      pairContract.getReserves(),
      pairContract.token0(),
      pairContract.token1(),
      this.getTokenDecimals(provider, tokenAddress),
    ]);

    if (reservesResult.status !== 'fulfilled' || token0Result.status !== 'fulfilled' || token1Result.status !== 'fulfilled') {
      throw new Error('Failed to fetch pair data');
    }

    const [reserve0, reserve1] = reservesResult.value;
    const token0 = ethers.getAddress(token0Result.value);
    const token1 = ethers.getAddress(token1Result.value);
    const tokenDecimals = tokenDecimalsResult.status === 'fulfilled' ? tokenDecimalsResult.value : 18;

    // Determine positions
    const tokenIsToken0 = token0 === ethers.getAddress(tokenAddress);
    
    let tokenReserve: bigint;
    let wethReserve: bigint;

    if (tokenIsToken0) {
      tokenReserve = reserve0;
      wethReserve = reserve1;
    } else {
      tokenReserve = reserve1;
      wethReserve = reserve0;
    }

    // Calculate token price in WETH
    const tokenReserveAdjusted = Number(tokenReserve) / Math.pow(10, tokenDecimals);
    const wethReserveAdjusted = Number(wethReserve) / Math.pow(10, 18); // WETH has 18 decimals

    const tokenPriceInWeth = wethReserveAdjusted / tokenReserveAdjusted;
    const tokenPriceInUsd = tokenPriceInWeth * this.wethPrice;

    if (tokenPriceInUsd <= 0 || !isFinite(tokenPriceInUsd)) {
      throw new Error('Invalid price calculation via WETH');
    }

    return tokenPriceInUsd;
  }

  // Update WETH price if cache is stale
  private async updateWethPriceIfNeeded(chain: string): Promise<void> {
    const now = Date.now();
    if (now - this.lastWethUpdate > this.WETH_UPDATE_INTERVAL) {
      await this.updateWethPrice(chain);
    }
  }

  // Get live WETH price
  private async updateWethPrice(chain: string): Promise<void> {
    const provider = this.providers.get(chain);
    const config = CHAIN_CONFIGS[chain];

    if (!provider || !config) return;

    try {
      const wethUsdtContract = new ethers.Contract(config.wethUsdtPair, UNISWAP_V2_PAIR_ABI, provider);

      const [reserves, token0] = await Promise.all([
        wethUsdtContract.getReserves(),
        wethUsdtContract.token0(),
      ]);

      const [reserve0, reserve1] = reserves;
      const token0Address = ethers.getAddress(token0);
      const wethAddress = ethers.getAddress(config.wethAddress);

      // Determine if WETH is token0 or token1
      const wethIsToken0 = token0Address === wethAddress;

      let wethReserve: bigint;
      let usdtReserve: bigint;

      if (wethIsToken0) {
        wethReserve = reserve0;
        usdtReserve = reserve1;
      } else {
        wethReserve = reserve1;
        usdtReserve = reserve0;
      }

      // WETH: 18 decimals, USDT: 6 decimals
      const wethReserveAdjusted = Number(wethReserve) / Math.pow(10, 18);
      const usdtReserveAdjusted = Number(usdtReserve) / Math.pow(10, 6);

      this.wethPrice = usdtReserveAdjusted / wethReserveAdjusted;
      this.lastWethUpdate = Date.now();
    } catch (error) {
      console.error(`Failed to update WETH price on ${chain}:`, error);
    }
  }

  // Fast token decimals fetch with fallback
  private async getTokenDecimals(provider: ethers.JsonRpcProvider, tokenAddress: string): Promise<number> {
    try {
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const decimals = await tokenContract.decimals();
      return Number(decimals);
    } catch (error) {
      console.warn(`Could not fetch decimals for ${tokenAddress}, using 18:`, error);
      return 18;
    }
  }

  // Start monitoring without any caching for maximum speed
  startMonitoring(
    chain: string,
    tokenAddress: string,
    ticker: string,
    intervalMs: number = 300, // Faster default interval
  ): () => void {
    console.log(`Starting high-speed DEX monitoring: ${chain} - ${ticker} (${tokenAddress})`);

    const fetchPrice = async () => {
      try {
        const startTime = Date.now();
        await this.getTokenPrice(chain, tokenAddress, ticker);
        const duration = Date.now() - startTime;
        
        if (duration > 1000) {
          console.warn(`Slow price fetch for ${ticker}: ${duration}ms`);
        }
      } catch (error) {
        console.error(`DEX price fetch failed for ${chain}-${ticker}:`, error);
      }
    };

    // Initial fetch
    fetchPrice();

    // Set up high-frequency interval
    const intervalId = setInterval(fetchPrice, intervalMs);

    return () => {
      clearInterval(intervalId);
      console.log(`Stopped DEX monitoring: ${chain} - ${ticker}`);
    };
  }

  getSupportedChains(): string[] {
    return Object.keys(CHAIN_CONFIGS);
  }
}

export const dexPriceFetcher = new DEXPriceFetcher();