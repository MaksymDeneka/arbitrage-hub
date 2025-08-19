export interface PriceData {
  exchange: string;
  symbol: string;
  price: number;
  timestamp: number;
  type: 'spot' | 'futures' | 'dex';
  volume?: number;
}

export interface TokenConfig {
  ticker: string;
  exchanges: string[];
  dexContracts: {
    bsc?: string;
    eth?: string;
    polygon?: string;
    arbitrum?: string;
  };
  thresholdPercent: number;
}

export interface ArbitrageOpportunity {
  buyFrom: PriceData;
  sellTo: PriceData;
  spread: number;
  profit: number;
  timestamp: number;
  profitPercent: number;
}

export interface ExchangeConfig {
  name: string;
  wsUrl: string;
  spotSymbolFormat: (ticker: string) => string;
  futuresSymbolFormat?: (ticker: string) => string;
  subscribeMessage: (symbol: string) => string;
  parseMessage: (data: unknown) => PriceData | null;
}

export interface ConnectionStatus {
  exchange: string;
  ticker: string;
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  lastUpdate?: number;
  errorMessage?: string;
}

//websocket message types for different exchanges

export type BinanceTickerMessage = {
  e: '24hrTicker';
  s: string;  // symbol
  c: string;  // close price
  v: string;  // volume
  E: number;  // event time
};