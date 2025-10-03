/* eslint-disable @typescript-eslint/no-explicit-any */
import { BinanceExchange } from './exchanges/binance';
import { BitGetExchange } from './exchanges/bitget';
import { GateExchange } from './exchanges/gate';
import { MEXCExchange } from './exchanges/mexc';
import { MarketType, TokenListingInfo } from './types';

interface ExchangeInstance {
  name: string;
  instance: any;
  supportedMarkets: MarketType[];
}

class TokenDiscoveryService {
  private exchanges: ExchangeInstance[] = [
    {
      name: 'binance',
      instance: new BinanceExchange(),
      supportedMarkets: ['spot', 'futures'],
    },
    {
      name: 'mexc',
      instance: new MEXCExchange(),
      supportedMarkets: ['spot', 'futures'],
    },
    {
      name: 'gate',
      instance: new GateExchange(),
      supportedMarkets: ['spot', 'futures'],
    },
    {
      name: 'bitget',
      instance: new BitGetExchange(),
      supportedMarkets: ['spot', 'futures'],
    },
  ];

  async discoverToken(ticker: string): Promise<TokenListingInfo> {
    console.log(`🔍 Discovering listings for ${ticker}...`);

    const result: TokenListingInfo = {
      ticker,
      exchanges: {},
      dexAvailability: {},
    };

    // Check all exchanges in parallel
    const exchangePromises = this.exchanges.map(async (exchange) => {
      try {
        const listing = await exchange.instance.checkTokenListing(ticker);
        result.exchanges[exchange.name] = listing;

        console.log(`${exchange.name}: spot=${listing.spot}, futures=${listing.futures}`);
      } catch (error) {
        console.error(`Failed to check ${exchange.name}:`, error);
        result.exchanges[exchange.name] = {
          spot: false,
          futures: false,
        };
      }
    });

    const dexPromise = this.checkDEXAvailability(ticker);

    await Promise.allSettled([...exchangePromises, dexPromise]);

    result.dexAvailability = await dexPromise;

    return result;
  }

  // PLACEHOLDER !!!!!!!!!!!! RETURNS FALSE
  private async checkDEXAvailability(ticker: string): Promise<{ [chain: string]: boolean }> {
    const chains = ['bsc', 'eth', 'polygon', 'arbitrum'];
    const availability: { [chain: string]: boolean } = {};

    const promises = chains.map(async (chain) => {
      try {
        availability[chain] = false;
      } catch (error) {
        console.error(`Failed to check ${chain} for ${ticker}:`, error);
        availability[chain] = false;
      }
    });

    await Promise.allSettled(promises);
    return availability;
  }

  // Get available exchanges for a ticker with their supported markets
  async getAvailableExchanges(ticker: string): Promise<
    {
      name: string;
      markets: MarketType[];
      listed: { spot: boolean; futures: boolean };
    }[]
  > {
    const discovery = await this.discoverToken(ticker);

    return this.exchanges
      .map((exchange) => ({
        name: exchange.name,
        markets: exchange.supportedMarkets,
        listed: discovery.exchanges[exchange.name] || { spot: false, futures: false },
      }))
      .filter((exchange) => exchange.listed.spot || exchange.listed.futures);
  }

  // Get recommended configuration based on token availability
  async getRecommendedConfig(
    ticker: string,
    thresholdPercent: number = 1,
  ): Promise<{
    ticker: string;
    exchanges: { name: string; markets: MarketType[] }[];
    dexContracts: { [chain: string]: string | undefined };
    thresholdPercent: number;
    recommendations: string[];
  }> {
    const discovery = await this.discoverToken(ticker);
    const recommendations: string[] = [];

    const exchanges: { name: string; markets: MarketType[] }[] = [];

    // Build exchange list based on availability
    for (const [exchangeName, listing] of Object.entries(discovery.exchanges)) {
      const markets: MarketType[] = [];

      if (listing.spot) {
        markets.push('spot');
        recommendations.push(`✅ ${exchangeName} spot market available`);
      }

      if (listing.futures) {
        markets.push('futures');
        recommendations.push(`✅ ${exchangeName} futures market available`);
      }

      if (markets.length > 0) {
        exchanges.push({ name: exchangeName, markets });
      } else {
        recommendations.push(`❌ ${exchangeName} does not list ${ticker}`);
      }
    }

    // Check DEX availability
    const dexContracts: { [chain: string]: string | undefined } = {};
    for (const [chain, available] of Object.entries(discovery.dexAvailability)) {
      if (available) {
        recommendations.push(`✅ DEX liquidity found on ${chain}`);
        // You would set actual contract addresses here
        // dexContracts[chain] = contractAddress;
      } else {
        recommendations.push(`❌ No DEX liquidity found on ${chain}`);
      }
    }

    if (exchanges.length === 0) {
      recommendations.push(
        `⚠️  No exchanges found for ${ticker}. Please verify the ticker symbol.`,
      );
    }

    return {
      ticker,
      exchanges,
      dexContracts,
      thresholdPercent,
      recommendations,
    };
  }

  // Quick check if token exists on any exchange
  async isTokenListed(ticker: string): Promise<boolean> {
    try {
      const discovery = await this.discoverToken(ticker);

      return Object.values(discovery.exchanges).some((listing) => listing.spot || listing.futures);
    } catch (error) {
      console.error(`Error checking if ${ticker} is listed:`, error);
      return false;
    }
  }

  // Add new exchange to the discovery service
  addExchange(name: string, instance: any, supportedMarkets: MarketType[]): void {
    // Check if exchange already exists
    const existingIndex = this.exchanges.findIndex((ex) => ex.name === name);

    if (existingIndex >= 0) {
      this.exchanges[existingIndex] = { name, instance, supportedMarkets };
    } else {
      this.exchanges.push({ name, instance, supportedMarkets });
    }
  }

  // Get all supported exchanges
  getSupportedExchanges(): { name: string; markets: MarketType[] }[] {
    return this.exchanges.map((ex) => ({
      name: ex.name,
      markets: [...ex.supportedMarkets],
    }));
  }
}

export const tokenDiscovery = new TokenDiscoveryService();
