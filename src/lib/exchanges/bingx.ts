/* eslint-disable @typescript-eslint/no-explicit-any */
import { MarketType, PriceData } from '../types';
import { BaseExchange } from './base-exchange';

export class BingXExchange extends BaseExchange {
  constructor() {
    super('bingx', ['spot', 'futures']);
    this.requiresSubscription = { spot: true, futures: true };
  }

  async checkTokenListing(ticker: string): Promise<{
    spot: boolean;
    futures: boolean;
    symbol?: string;
  }> {
    try {
      const symbol = `${ticker.toUpperCase()}-USDT`;

      const spotResponse = await fetch(
        `https://open-api.bingx.com/openApi/spot/v1/common/symbols?symbol=${symbol}`,
      );
      const spotData = await spotResponse.json();
      const spotListed = spotData.data.symbols[0].status === 1;

      const futuresResponse = await fetch(
        `https://open-api.bingx.com/openApi/swap/v2/quote/contracts?symbol=${symbol}`,
      );
      const futuresData = await futuresResponse.json();
      const futuresListed = futuresData.data[0].status === 1;

      return {
        spot: spotListed,
        futures: futuresListed,
        symbol: `${symbol}USDT`,
      };
    } catch (error) {
      console.error('BingX token listing check failed:', error);
      return { spot: false, futures: false };
    }
  }

  async connectSpot(ticker: string): Promise<void> {
    const wsUrl = `wss://ws.bitget.com/v2/ws/public`;
    this.setupWebSocket(wsUrl, ticker, 'spot');
  }

  async connectFutures(ticker: string): Promise<void> {
    const wsUrl = `wss://ws.bitget.com/v2/ws/public`;
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
      console.warn(`BingX ${marketType} parse error:`, error);
      return null;
    }
  }

  private parseSpotMessage(data: any): PriceData | null {
    const symbol = `${this.ticker.toUpperCase()}USDT`;
    try {
      if (typeof data === 'string') data = JSON.parse(data);
      // console.log(`SPOT response`, data);
      if (data.event && data.event !== 'update') {
        // subscription ack, ignore
        return null;
      }

      if (!Array.isArray(data.data) || data.data.length === 0) return null;
      const ticker = data.data[0];

      //console.log(`[GATE] SPOT RESPONSE: ${JSON.stringify(data, null, 2)}`);
      // console.log(`[BitGet] SPOT price: ${ticker.lastPr}`);

      return {
        exchange: 'bingx',
        symbol: symbol,
        price: parseFloat(ticker.lastPr),
        timestamp: Date.now(),
        type: 'spot',
        volume: parseFloat(ticker.quoteVolume || '0'),
      };
    } catch (error) {
      console.warn('[BingX] Spot JSON parsing failed:', error);
      return null;
    }
  }
  private parseFuturesMessage(data: any): PriceData | null {
    const symbol = `${this.ticker.toUpperCase()}USDT`;
    // console.log(`[BitGet] FUTURES RESPONSE: ${JSON.stringify(data, null, 2)}`);

    try {
      if (typeof data === 'string') data = JSON.parse(data);

      if (data.event && data.event !== 'update') {
        // subscription ack, ignore
        return null;
      }

      if (!Array.isArray(data.data) || data.data.length === 0) return null;
      const ticker = data.data[0];
      console.log(`[BingX] Futures price: ${ticker.lastPr}`);

      return {
        exchange: 'bingx-futures',
        symbol,
        price: parseFloat(ticker.lastPr),
        timestamp: Date.now(),
        type: 'futures',
        volume: parseFloat(ticker.quoteVolume || '0'),
      };
    } catch (error) {
      console.warn('[BingX] Futures JSON parsing failed:', error, data);
      return null;
    }
  }

  subscribe(ticker: string, marketType: MarketType): void {
    const symbol = `${ticker.toUpperCase()}USDT`;

    if (marketType === 'spot') {
      this.sendMessage(
        JSON.stringify({
          op: 'subscribe',
          args: [
            {
              instType: 'SPOT',
              channel: 'ticker',
              instId: symbol,
            },
          ],
        }),
        'spot',
      );

      console.log(`[BingX] Subscribed to spot ticker for ${symbol}`);
    } else {
      this.sendMessage(
        JSON.stringify({
          op: 'subscribe',
          args: [
            {
              instType: 'USDT-FUTURES',
              channel: 'ticker',
              instId: symbol,
            },
          ],
        }),
        'futures',
      );

      console.log(`[BingX] Subscribed to futures ticker for ${symbol}`);
    }
  }
}
