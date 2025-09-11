export type MarketType = 'spot' | 'futures' | 'dex';

export interface PriceData {
  exchange: string;
  symbol: string;
  price: number;
  timestamp: number;
  type: MarketType;
  volume?: number;
}

export interface TokenConfig {
  ticker: string;
  exchanges: {
    name: string;
    markets: MarketType[];
  }[];
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
  futuresWsUrl?: string;
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
  marketType?: MarketType;
}

export interface TokenListingInfo {
  ticker: string;
  exchanges: {
    [exchangeName: string]: {
      spot: boolean;
      futures: boolean;
      symbol?: string;
    };
  };
  dexAvailability: {
    [chain: string]: boolean;
  };
}

// WebSocket message types for different exchanges
export type BinanceTickerMessage = {
  e: '24hrTicker';
  s: string;  // symbol
  c: string;  // close price
  v: string;  // volume
  E: number;  // event time
};

export type MEXCSpotTickerMessage = {
  c: string;  // channel
  d: {
    s: string;  // symbol
    b: string;  // bid price
    a: string;  // ask price
    v: string;  // volume
    t: number;  // timestamp
  };
};

export type MEXCFuturesTickerMessage = {
  channel: string;
  data: {
    symbol: string;
    lastPrice: string;
    volume: string;
    timestamp: number;
  };
};

// Exchange listing response types
export interface BinanceExchangeInfo {
  symbols: Array<{
    symbol: string;
    status: string;
    baseAsset: string;
    quoteAsset: string;
  }>;
}

export interface MEXCExchangeInfo {
  symbols: Array<{
    symbol: string;
    status: string;
    baseAsset: string;
    quoteAsset: string;
  }>;
}

export interface MEXCFuturesInfo {
  data: Array<{
    symbol: string;
    state: number;
    displayName: string;
  }>;
}