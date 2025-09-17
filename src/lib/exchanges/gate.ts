import { MarketType, PriceData } from '../types';
import { BaseExchange } from './base-exchange';
import { GateFuturesWS, GateSpotWS } from './types';

export class GateExchange extends BaseExchange {
  constructor() {
    super('gate', ['spot', 'futures']);
    this.requiresSubscription = { spot: true, futures: true };
  }

  async checkTokenListing(ticker: string): Promise<{
    spot: boolean;
    futures: boolean;
    symbol?: string;
  }> {
    try {
      const symbol = ticker.toUpperCase();
      const fSymbol = `${ticker.toUpperCase()}_USDT`;

      const spotResponse = await fetch(`https://api.gateio.ws/api/v4/spot/currencies/${symbol}`);
      const spotData = await spotResponse.json();
      const spotListed = !(spotData.delisted && spotData.disabled);

      const futuresResponse = await fetch(
        `https://api.gateio.ws/api/v4/futures/usdt/contracts/${fSymbol}`,
      );
      const futuresData = await futuresResponse.json();
      const futuresListed = futuresData.status === 'trading';

      return {
        spot: spotListed,
        futures: futuresListed,
        symbol: `${symbol}USDT`,
      };
    } catch (error) {
      console.error('Gate token listing check failed:', error);
      return { spot: false, futures: false };
    }
  }

  async connectSpot(ticker: string): Promise<void> {
    const wsUrl = `wss://api.gateio.ws/ws/v4/`;
    this.setupWebSocket(wsUrl, ticker, 'spot');
  }

  async connectFutures(ticker: string): Promise<void> {
    const wsUrl = `wss://fx-ws.gateio.ws/v4/ws/usdt`;
    this.setupWebSocket(wsUrl, ticker, 'futures');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parseMessage(data: any, marketType: MarketType): PriceData | null {
    try {
      if (marketType === 'spot') {
        return this.parseSpotMessage(data);
      } else {
        return this.parseFuturesMessage(data);
      }
    } catch (error) {
      console.warn(`GATE ${marketType} parse error:`, error);
      return null;
    }
  }

  private parseSpotMessage(data: GateSpotWS): PriceData | null {
    const symbol = `${this.ticker.toUpperCase()}USDT`;
    try {
      if (typeof data === 'string') {
        data = JSON.parse(data);
      }
      console.log(`[GATE] SPOT price: ${data.result.last}`);

      return {
        exchange: 'gate',
        symbol: symbol,
        price: parseFloat(data.result.last),
        timestamp: Date.now(),
        type: 'spot',
        volume: parseFloat(data.result.quote_volume || '0'),
      };
    } catch (error) {
      console.warn('[GATE] Spot JSON parsing failed:', error);
      return null;
    }
  }
  private parseFuturesMessage(data: GateFuturesWS): PriceData | null {
    const symbol = `${this.ticker.toUpperCase()}USDT`;
    try {
      if (typeof data === 'string') {
        data = JSON.parse(data);
      }
      console.log(`[GATE] FUTURES price: ${data.result[0].last}`);
      return {
        exchange: 'gate-futures',
        symbol: symbol,
        price: parseFloat(data.result[0].last),
        timestamp: Date.now(),
        type: 'futures',
        volume: parseFloat(data.result[0].volume_24h_quote || '0'),
      };
    } catch (error) {
      console.warn('[GATE] Futures JSON parsing failed:', error);
      return null;
    }
  }

  subscribe(ticker: string, marketType: MarketType): void {
    const symbol = `${ticker.toUpperCase()}_USDT`;

    if (marketType === 'spot') {
      this.sendMessage(
        JSON.stringify({
          time: Date.now(),
          channel: 'spot.tickers',
          event: 'subscribe',
          payload: [symbol],
        }),
        'spot',
      );

      console.log(`[GATE] Subscribed to spot ticker for ${symbol}`);
    } else {
      this.sendMessage(
        JSON.stringify({
          time: Date.now(),
          channel: 'futures.tickers',
          event: 'subscribe',
          payload: [symbol],
        }),
        'futures',
      );

      console.log(`[GATE] Subscribed to futures ticker for ${symbol}`);
    }
  }
}
