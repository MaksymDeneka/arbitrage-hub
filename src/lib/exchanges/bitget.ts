/* eslint-disable @typescript-eslint/no-explicit-any */
import { MarketType, PriceData } from '../types';
import { BaseExchange } from './base-exchange';

export class BitGetExchange extends BaseExchange {
  constructor() {
    super('bitget', ['spot', 'futures']);
    this.requiresSubscription = { spot: true, futures: true };
  }

  async checkTokenListing(ticker: string): Promise<{
    spot: boolean;
    futures: boolean;
    symbol?: string;
  }> {
    try {
      const symbol = `${ticker.toUpperCase()}USDT`;
      // const fSymbol = `${ticker.toUpperCase()}_USDT`;

      const spotResponse = await fetch(
        `https://api.bitget.com/api/v2/spot/public/symbols?symbol=${symbol}`,
      );
      const spotData = await spotResponse.json();
      const spotListed = spotData.data[0].status === 'online';
      // const spotListed = !(spotData.delisted && spotData.disabled);

      const futuresResponse = await fetch(
        `https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES&symbol=${symbol}`,
      );
      const futuresData = await futuresResponse.json();
      const fListData = futuresData.data[0].symbolStatus;
      const futuresListed = fListData === 'normal' || fListData === 'listed';

      return {
        spot: spotListed,
        futures: futuresListed,
        symbol: `${symbol}USDT`,
      };
    } catch (error) {
      console.error('BitGet token listing check failed:', error);
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
      console.warn(`BitGet ${marketType} parse error:`, error);
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
        exchange: 'bitget',
        symbol: symbol,
        price: parseFloat(ticker.lastPr),
        timestamp: Date.now(),
        type: 'spot',
        volume: parseFloat(ticker.quoteVolume || '0'),
      };
    } catch (error) {
      console.warn('[BitGet] Spot JSON parsing failed:', error);
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
      console.log(`[BitGet] Futures price: ${ticker.lastPr}`);

      return {
        exchange: 'bitget-futures',
        symbol,
        price: parseFloat(ticker.lastPr),
        timestamp: Date.now(),
        type: 'futures',
        volume: parseFloat(ticker.quoteVolume || '0'),
      };
    } catch (error) {
      console.warn('[BitGet] Futures JSON parsing failed:', error, data);
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

      console.log(`[BitGet] Subscribed to spot ticker for ${symbol}`);
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

      console.log(`[BitGet] Subscribed to futures ticker for ${symbol}`);
    }
  }
}
