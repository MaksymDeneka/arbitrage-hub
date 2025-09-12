/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseExchange } from './base-exchange';
import { PriceData, MarketType } from '../types';

export class MEXCExchange extends BaseExchange {
  constructor() {
    super('mexc', ['spot', 'futures']);
    this.requiresSubscription = { spot: true, futures: true };
  }

  async checkTokenListing(ticker: string): Promise<{
    spot: boolean;
    futures: boolean;
    symbol?: string;
  }> {
    try {
      const symbol = `${ticker.toUpperCase()}USDT`;
      const fSymbol = `${ticker.toUpperCase()}_USDT`;

      const spotResponse = await fetch(`https://api.mexc.com/api/v3/exchangeInfo?symbol=${symbol}`);
      const spotData = await spotResponse.json();

      const spotListed =
        spotData.symbols?.some((s: any) => s.symbol === symbol && s.status === '1') || false;

      const futuresResponse = await fetch(
        `https://contract.mexc.com/api/v1/contract/detail?symbol=${fSymbol}`,
      );
      const futuresData = await futuresResponse.json();
      const futuresListed =
        futuresData?.data?.symbol === `${ticker.toUpperCase()}_USDT` &&
        futuresData.data.state === 0;

      return {
        spot: spotListed,
        futures: futuresListed,
        symbol: symbol,
      };
    } catch (error) {
      console.error('MEXC token listing check failed:', error);
      return { spot: false, futures: false };
    }
  }

  async connectSpot(ticker: string): Promise<void> {
    // const symbol = `${ticker.toUpperCase()}USDT`;
    const wsUrl = `wss://wbs.mexc.com/ws`;

    console.log(`🔗 Connecting to MEXC SPOT: ${ticker}`);
    this.setupWebSocket(wsUrl, ticker, 'spot');
  }

  async connectFutures(ticker: string): Promise<void> {
    const wsUrl = `wss://contract.mexc.com/ws`;

    console.log(`🔗 Connecting to MEXC FUTURES: ${ticker}`);
    this.setupWebSocket(wsUrl, ticker, 'futures');
  }

  parseMessage(data: any, marketType: MarketType): PriceData | null {
    try {
      if (marketType === 'spot') {
        return this.parseSpotMessage(data);
      } else {
        return this.parseFuturesMessage(data);
      }
    } catch (error) {
      console.warn(`MEXC ${marketType} parse error:`, error);
      return null;
    }
  }

  private parseSpotMessage(data: any): PriceData | null {
    if (data.c === 'spot@public.bookTicker.v3.api') {
      const tickerData = data.d;
      if (!tickerData) return null;

      const bidPrice = parseFloat(tickerData.b);
      const askPrice = parseFloat(tickerData.a);
      const midPrice = (bidPrice + askPrice) / 2;
			console.log(`[MEXC] SPOT Parsed update:`, midPrice);

      return {
        exchange: 'mexc',
        symbol: tickerData.s,
        price: midPrice,
        timestamp: tickerData.t || Date.now(),
        type: 'spot',
        volume: parseFloat(tickerData.v || '0'),
      };
    }

    if (data.c === 'spot@public.deals.v3.api') {
      const dealData = data.d;
      if (!dealData || !dealData.deals || dealData.deals.length === 0) return null;

      const latestDeal = dealData.deals[0];
      return {
        exchange: 'mexc',
        symbol: dealData.s,
        price: parseFloat(latestDeal.p),
        timestamp: latestDeal.t || Date.now(),
        type: 'spot',
        volume: parseFloat(latestDeal.v || '0'),
      };
    }

    return null;
  }

  private parseFuturesMessage(data: any): PriceData | null {
    if (data.channel === 'push.ticker') {
      const tickerData = data.data;
      if (!tickerData) return null;
			
			console.log(`[MEXC] FUTURES Parsed update:`, parseFloat(tickerData.lastPrice));

      return {
        exchange: 'mexc-futures',
        symbol: tickerData.symbol,
        price: parseFloat(tickerData.lastPrice),
        timestamp: tickerData.timestamp || Date.now(),
        type: 'futures',
        volume: parseFloat(tickerData.volume || '0'),
      };
    }

    if (data.channel === 'push.depth') {
      const depthData = data.data;
      if (!depthData || !depthData.bids || !depthData.asks) return null;

      const bestBid = depthData.bids[0]?.[0];
      const bestAsk = depthData.asks[0]?.[0];

      if (!bestBid || !bestAsk) return null;

      const midPrice = (parseFloat(bestBid) + parseFloat(bestAsk)) / 2;

      return {
        exchange: 'mexc-futures',
        symbol: depthData.symbol,
        price: midPrice,
        timestamp: depthData.timestamp || Date.now(),
        type: 'futures',
        volume: 0,
      };
    }

    return null;
  }

  subscribe(ticker: string, marketType: MarketType): void {
    const symbol =
      marketType === 'spot' ? `${ticker.toUpperCase()}USDT` : `${ticker.toUpperCase()}_USDT`;

    if (marketType === 'spot') {
      // Subscribe to spot book ticker and deals
      this.sendMessage(
        JSON.stringify({
          method: 'SUBSCRIPTION',
          params: [`spot@public.bookTicker.v3.api@${symbol}`],
        }),
        'spot',
      );

      this.sendMessage(
        JSON.stringify({
          method: 'SUBSCRIPTION',
          params: [`spot@public.deals.v3.api@${symbol}`],
        }),
        'spot',
      );
    } else {
      // Subscribe to futures ticker and depth
      this.sendMessage(
        JSON.stringify({
          method: 'sub.ticker',
          param: { symbol },
        }),
        'futures',
      );

      this.sendMessage(
        JSON.stringify({
          method: 'sub.depth',
          param: { symbol, limit: 20 },
        }),
        'futures',
      );
    }

    console.log(`Subscribed to MEXC ${marketType.toUpperCase()} streams for ${ticker}`);
  }
}
