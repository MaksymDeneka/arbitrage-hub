/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  PublicAggreDealsV3Api,
  PublicAggreDealsV3ApiItem,
} from "./public-aggre-deals";


export interface PushDataV3ApiWrapper {
  channel?: string;
  publicAggreDeals?: PublicAggreDealsV3Api;

  publicDeals?: any;
  publicIncreaseDepths?: any;
  publicLimitDepths?: any;
  privateOrders?: any;
  publicBookTicker?: any;
  privateDeals?: any;
  privateAccount?: any;
  publicSpotKline?: any;
  publicMiniTicker?: any;
  publicMiniTickers?: any;
  publicBookTickerBatch?: any;
  publicIncreaseDepthsBatch?: any;
  publicAggreDepths?: any;
  publicAggreBookTicker?: any;


  symbol?: string;

  symbolId?: string;

  createTime?: number | Long;

  sendTime?: number | Long;
}

export interface Long {
  low: number;
  high: number;
  unsigned: boolean;
}

export function decodePushDataV3ApiWrapper(
  binary: Uint8Array | ArrayBuffer
): PushDataV3ApiWrapper;

export function encodePushDataV3ApiWrapper(
  message: PushDataV3ApiWrapper
): Uint8Array;
