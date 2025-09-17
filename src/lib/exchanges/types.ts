export interface GateSpotWS {
  time: number;
  time_ms: number;
  channel: string;
  event: string;
  result: {
    currency_pair: string;
    last: string;
    lowest_ask: string;
    highest_bid: string;
    change_percentage: string;
    base_volume: string;
    quote_volume: string;
    high_24h: string;
    low_24h: string;
  };
}

export interface GateFuturesWS {
  time: number;
  time_ms: number;
  channel: string;
  event: string;
  result: GateFuturesWSResult[];
}
export interface GateFuturesWSResult {
  contract: string;
  last: string;
  change_percentage: string;
  funding_rate: string;
  funding_rate_indicative: string;
  mark_price: string;
  index_price: string;
  total_size: string;
  volume_24h: string;
  volume_24h_btc: string;
  volume_24h_usd: string;
  quanto_base_rate: string;
  volume_24h_quote: string;
  volume_24h_settle: string;
  volume_24h_base: string;
  low_24h: string;
  high_24h: string;
}
