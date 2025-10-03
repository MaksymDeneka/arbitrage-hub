import { BaseExchange } from './base-exchange';
import { MarketType } from '../types';
import { BinanceExchange } from './binance';
import { MEXCExchange } from './mexc';
import { GateExchange } from './gate';
import { BitGetExchange } from './bitget';

export class ExchangeFactory {
  private static exchangeInstances = new Map<string, BaseExchange>();

  static createExchange(exchangeName: string): BaseExchange | null {

    if (this.exchangeInstances.has(exchangeName)) {
      return this.exchangeInstances.get(exchangeName)!;
    }

    let exchange: BaseExchange | null = null;

    switch (exchangeName.toLowerCase()) {
      case 'binance':
        exchange = new BinanceExchange();
        break;
      case 'mexc':
        exchange = new MEXCExchange();
        break;
      case 'gate':
        exchange = new GateExchange();
        break;
      case 'bitget':
        exchange = new BitGetExchange();
        break;
      default:
        console.error(`Unknown exchange: ${exchangeName}`);
        return null;
    }

    if (exchange) {
      this.exchangeInstances.set(exchangeName, exchange);
    }

    return exchange;
  }

  static getSupportedExchanges(): { name: string; markets: MarketType[] }[] {
    return [
      { name: 'binance', markets: ['spot', 'futures'] },
      { name: 'mexc', markets: ['spot', 'futures'] },
      { name: 'gate', markets: ['spot', 'futures'] },
      { name: 'bitget', markets: ['spot', 'futures'] },
    ];
  }

  static isExchangeSupported(exchangeName: string): boolean {
    return this.getSupportedExchanges().some(ex => 
      ex.name.toLowerCase() === exchangeName.toLowerCase()
    );
  }

  static getExchangeMarkets(exchangeName: string): MarketType[] {
    const exchange = this.getSupportedExchanges().find(ex => 
      ex.name.toLowerCase() === exchangeName.toLowerCase()
    );
    return exchange?.markets || [];
  }

  // Clear cached instances
  static clearCache(): void {
    this.exchangeInstances.clear();
  }
}
