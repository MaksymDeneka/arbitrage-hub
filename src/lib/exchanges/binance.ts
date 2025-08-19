import { BaseExchange } from './base-exchange';
import { PriceData, BinanceTickerMessage } from '../types';

export class BinanceExchange extends BaseExchange {
  constructor() {
    super('binance');
  }
  
  async connect(ticker: string): Promise<void> {
    const symbol = ticker.toLowerCase();
    
    //single websocket connection for multiple data streams
    const streams = [
      `${symbol}usdt@ticker`,        // 24hr ticker stats
      `${symbol}usdt@bookTicker`,    // Best bid/ask prices
      `${symbol}usdt_perp@ticker`    // Futures ticker (if available)
    ];
    
    const wsUrl = `wss://stream.binance.com:9443/ws/${streams.join('/')}`;
    
    console.log(`🔗 Connecting to Binance: ${ticker}`);
    this.setupWebSocket(wsUrl, ticker);
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parseMessage(data: any): PriceData | null {
    try {
      //handle individual ticker messages
      if (data.e === '24hrTicker') {
        return this.parseTicker(data);
      }
      
      //handle book ticker (best bid/ask)
      if (data.e === 'bookTicker') {
        return this.parseBookTicker(data);
      }
      
      //handle array of messages (stream response)
      if (Array.isArray(data)) {
        for (const item of data) {
          const parsed = this.parseMessage(item);
          if (parsed) return parsed;
        }
      }
      
      return null;
      
    } catch (error) {
      console.warn('Binance parse error:', error);
      return null;
    }
  }

  private parseTicker(data: BinanceTickerMessage): PriceData {
    return {
      exchange: 'binance',
      symbol: data.s,
      price: parseFloat(data.c), // Current price
      timestamp: data.E || Date.now(),
      type: data.s.includes('_PERP') ? 'futures' : 'spot',
      volume: parseFloat(data.v || '0')
    };
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseBookTicker(data: any): PriceData {
    const bidPrice = parseFloat(data.b);
    const askPrice = parseFloat(data.a);
    const midPrice = (bidPrice + askPrice) / 2;
    
    return {
      exchange: 'binance',
      symbol: data.s,
      price: midPrice,
      timestamp: Date.now(),
      type: 'spot',
      volume: 0
    };
  }
  
  //no subscription needed - streams are specified in URL
  subscribe(ticker: string): void {
    console.log(`Subscribed to Binance streams for ${ticker}`);
  }
}


//futures only monitoring
export class BinanceFuturesExchange extends BaseExchange {
  constructor() {
    super('binance-futures');
  }
  
  async connect(ticker: string): Promise<void> {
    const symbol = `${ticker.toLowerCase()}usdt`;
    
    const streams = [
      `${symbol}@ticker`,
      `${symbol}@bookTicker`
    ];
    
    const wsUrl = `wss://fstream.binance.com/ws/${streams.join('/')}`;
    
    console.log(`Connecting to Binance Futures: ${ticker}`);
    this.setupWebSocket(wsUrl, ticker);
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parseMessage(data: any): PriceData | null {
    try {
      if (data.e === '24hrTicker') {
        return {
          exchange: 'binance-futures',
          symbol: data.s,
          price: parseFloat(data.c),
          timestamp: data.E || Date.now(),
          type: 'futures',
          volume: parseFloat(data.v || '0')
        };
      }
      
      if (data.e === 'bookTicker') {
        const bidPrice = parseFloat(data.b);
        const askPrice = parseFloat(data.a);
        const midPrice = (bidPrice + askPrice) / 2;
        
        return {
          exchange: 'binance-futures',
          symbol: data.s,
          price: midPrice,
          timestamp: Date.now(),
          type: 'futures'
        };
      }
      
      return null;
      
    } catch (error) {
      console.warn('Binance Futures parse error:', error);
      return null;
    }
  }
  
  subscribe(ticker: string): void {
    console.log(`Subscribed to Binance Futures streams for ${ticker}`);
  }
}