import { BaseExchange } from './base-exchange';
import { BinanceExchange, BinanceFuturesExchange } from './binance';

export const SUPPORTED_EXCHANGES = {
  //Spot exchanges
  'binance': BinanceExchange,
  //Futures exchanges
  'binance-futures': BinanceFuturesExchange,

  //Spot
  'mexc': MexcExchange,
  //Futures
  'mexc-futures': MexcFuturesExchange,

} as const;

export type SupportedExchange = keyof typeof SUPPORTED_EXCHANGES;



export class ExchangeFactory {

	//create exchange instance
  static createExchange(exchangeName: string): BaseExchange | null {
    const ExchangeClass = SUPPORTED_EXCHANGES[exchangeName as SupportedExchange];
    
    if (!ExchangeClass) {
      console.error(`Unsupported exchange: ${exchangeName}`);
      return null;
    }
    
    try {
      return new ExchangeClass();
    } catch (error) {
      console.error(`Failed to create ${exchangeName} exchange:`, error);
      return null;
    }
  }
  
  //get list of supported exchanges
  static getSupportedExchanges(): string[] {
    return Object.keys(SUPPORTED_EXCHANGES);
  }

  //Check if exchange is supported
  static isSupported(exchangeName: string): boolean {
    return exchangeName in SUPPORTED_EXCHANGES;
  }
  
  //get spot exchanges only
  static getSpotExchanges(): string[] {
    return ['binance', 'mexc', 'okx', 'bybit'];
  }

  //get futures exchanges only
  static getFuturesExchanges(): string[] {
    return ['binance-futures', 'mexc', 'okx-futures', 'bybit-futures'];
  }
}