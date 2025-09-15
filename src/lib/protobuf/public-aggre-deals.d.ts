/* eslint-disable @typescript-eslint/no-explicit-any */
// public-deals.d.ts

export interface PublicAggreDealsV3ApiItem {
  price?: string;
  quantity?: string;
  tradeType?: number;
  time?: {
    low: number;
    high: number;
    unsigned: boolean;
  } | number;
}

export interface PublicAggreDealsV3Api {
  deals?: PublicAggreDealsV3ApiItem[];
  eventType?: string;
}

export interface Long {
  low: number;
  high: number;
  unsigned: boolean;
}

export function encodePublicAggreDealsV3Api(message: PublicAggreDealsV3Api): Uint8Array;
export function decodePublicAggreDealsV3Api(binary: Uint8Array): PublicAggreDealsV3Api;

export function encodePublicAggreDealsV3ApiItem(message: PublicAggreDealsV3ApiItem): Uint8Array;
export function decodePublicAggreDealsV3ApiItem(binary: Uint8Array): PublicAggreDealsV3ApiItem;

// Utility functions (these are internal but exported, so we declare them)
export function intToLong(value: number): Long;
export function wrapByteBuffer(bytes: Uint8Array): {
  bytes: Uint8Array;
  offset: number;
  limit: number;
};
export function toUint8Array(bb: any): Uint8Array;