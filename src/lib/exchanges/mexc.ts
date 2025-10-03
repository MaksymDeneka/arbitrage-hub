/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseExchange } from './base-exchange';
import { PriceData, MarketType } from '../types';
import { protobufManager } from '../protobuf/protobuf-manager';

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
    const wsUrl = `wss://wbs-api.mexc.com/ws`;
    this.setupWebSocket(wsUrl, ticker, 'spot');
  }

  async connectFutures(ticker: string): Promise<void> {
    const wsUrl = `wss://contract.mexc.com/edge`;
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
    const symbol = `${this.ticker.toUpperCase()}USDT`;
    const deal = protobufManager.handleMEXCMessage(data);
    if (deal) {
      // console.log(`[MEXC] SPOT price: ${deal.price}`);
      return {
        exchange: 'mexc',
        symbol: symbol,
        price: parseFloat(deal.price || '0'),
        timestamp: Date.now(),
        type: 'spot',
      };
    }
    return null;
  }

  private parseFuturesMessage(data: any): PriceData | null {
    try {
      // console.log(`[MEXC] FUTURES RESPONSE: ${JSON.stringify(data, null, 2)}`);

      if (typeof data === 'string') {
        if (['success', 'pong', 'subscribed'].includes(data)) {
          console.log(`[MEXC] Futures control message: ${data}`);
          return null;
        }
        try {
          data = JSON.parse(data);
        } catch {
          console.warn('[MEXC] Futures received non-JSON string:', data);
          return null;
        }
      }

      if (data && data.channel) {
        if (['rs.error', 'pong', 'sub.ticker'].includes(data.channel)) return null;

        if (data.channel === 'push.ticker') {
          const t = data.data;
          if (!t) return null;
          // console.log(`[MEXC] Futures price: ${t.lastPrice}`);
          return {
            exchange: 'mexc-futures',
            symbol: t.symbol,
            price: parseFloat(t.lastPrice),
            timestamp: t.timestamp || Date.now(),
            type: 'futures',
            volume: parseFloat(t.volume || '0'),
          };
        }

        if (data.channel === 'push.depth') {
          const d = data.data;
          if (!d?.bids?.length || !d?.asks?.length) return null;
          const mid = (parseFloat(d.bids[0][0]) + parseFloat(d.asks[0][0])) / 2;
          return {
            exchange: 'mexc-futures',
            symbol: d.symbol,
            price: mid,
            timestamp: d.timestamp || Date.now(),
            type: 'futures',
            volume: 0,
          };
        }

        return null;
      }

      if (data && typeof data === 'object' && 'lastPrice' in data && 'symbol' in data) {
        // console.log(`[MEXC] Futures price: ${data.lastPrice}`);
        return {
          exchange: 'mexc-futures',
          symbol: data.symbol,
          price: parseFloat(data.lastPrice),
          timestamp: data.timestamp || Date.now(),
          type: 'futures',
          volume: parseFloat(data.volume24 || '0'),
        };
      }

      return null;
    } catch (error) {
      console.warn('[MEXC] Futures JSON parsing failed:', error);
      return null;
    }
  }

  subscribe(ticker: string, marketType: MarketType): void {
    const symbol =
      marketType === 'spot' ? `${ticker.toUpperCase()}USDT` : `${ticker.toUpperCase()}_USDT`;

    if (marketType === 'spot') {
      this.sendMessage(
        JSON.stringify({
          method: 'SUBSCRIPTION',
          params: [`spot@public.aggre.deals.v3.api.pb@100ms@${symbol}`],
          // params: [`spot@public.aggre.bookTicker.v3.api.pb@100ms@${symbol}`],
        }),
        'spot',
      );

      console.log(`[MEXC] Subscribed to protobuf deals stream for ${symbol}`);
    } else {
      this.sendMessage(
        JSON.stringify({
          method: 'sub.ticker',
          param: { symbol },
        }),
        'futures',
      );

      console.log(`[MEXC] Subscribed to futures ticker for ${symbol}`);
    }
  }
}
