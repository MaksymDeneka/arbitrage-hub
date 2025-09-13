/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseExchange } from './base-exchange';
import { PriceData, BinanceTickerMessage, MarketType } from '../types';

export class BinanceExchange extends BaseExchange {
  constructor() {
    super('binance', ['spot', 'futures']);
  }

  async checkTokenListing(ticker: string): Promise<{
    spot: boolean;
    futures: boolean;
    symbol?: string;
  }> {
    try {
      const symbol = `${ticker.toUpperCase()}USDT`;

      // Check spot listing
      const spotResponse = await fetch(`https://api.binance.com/api/v3/exchangeInfo`);
      const spotData = await spotResponse.json();

      const spotListed =
        spotData.symbols?.some((s: any) => s.symbol === symbol && s.status === 'TRADING') || false;

      // Check futures listing
      const futuresResponse = await fetch(`https://fapi.binance.com/fapi/v1/exchangeInfo`);
      const futuresData = await futuresResponse.json();

      const futuresListed =
        futuresData.symbols?.some((s: any) => s.symbol === symbol && s.status === 'TRADING') ||
        false;

      return {
        spot: spotListed,
        futures: futuresListed,
        symbol: symbol,
      };
    } catch (error) {
      console.error('Binance token listing check failed:', error);
      return { spot: false, futures: false };
    }
  }

  async connectSpot(ticker: string): Promise<void> {
    const symbol = ticker.toLowerCase();

    const streams = [
      `${symbol}usdt@ticker`,
      //  `${symbol}usdt@bookTicker`
    ];

    const wsUrl = `wss://stream.binance.com:9443/ws/${streams.join('/')}`;

    console.log(`🔗 Connecting to Binance SPOT: ${ticker}`);
    this.setupWebSocket(wsUrl, ticker, 'spot');
  }

  async connectFutures(ticker: string): Promise<void> {
    const symbol = ticker.toLowerCase();

    const streams = [
      `${symbol}usdt@ticker`,
      //  `${symbol}usdt@bookTicker`
    ];

    const wsUrl = `wss://fstream.binance.com/ws/${streams.join('/')}`;

    console.log(`🔗 Connecting to Binance FUTURES: ${ticker}`);
    this.setupWebSocket(wsUrl, ticker, 'futures');
  }

async parseMessage(data: any, marketType: MarketType): Promise<PriceData | null> {
  try {
    if (data && typeof data === 'object' && 'data' in data && 'stream' in data) {
      return this.parseMessage((data as any).data, marketType);
    }
    if (data.e === '24hrTicker') {
      return this.parseTicker(data, marketType);
    }
    if (data.e === 'bookTicker') {
      return this.parseBookTicker(data, marketType);
    }
    if (Array.isArray(data)) {
      for (const item of data) {
        const parsed = await this.parseMessage(item, marketType);
        if (parsed) return parsed;
      }
    }
    return null;
  } catch (error) {
    console.warn(`Binance ${marketType} parse error:`, error);
    return null;
  }
}

  private parseTicker(data: BinanceTickerMessage, marketType: MarketType): PriceData {
    return {
      exchange: marketType === 'spot' ? 'binance' : 'binance-futures',
      symbol: data.s,
      price: parseFloat(data.c),
      timestamp: data.E || Date.now(),
      type: marketType,
      volume: parseFloat(data.v || '0'),
    };
  }

  private parseBookTicker(data: any, marketType: MarketType): PriceData {
    const bidPrice = parseFloat(data.b);
    const askPrice = parseFloat(data.a);
    const midPrice = (bidPrice + askPrice) / 2;

    return {
      exchange: marketType === 'spot' ? 'binance' : 'binance-futures',
      symbol: data.s,
      price: midPrice,
      timestamp: Date.now(),
      type: marketType,
      volume: 0,
    };
  }

  subscribe(ticker: string, marketType: MarketType): void {
    console.log(`Subscribed to Binance ${marketType.toUpperCase()} streams for ${ticker}`);
    // No explicit subscription needed for Binance - streams are specified in URL
  }
}
