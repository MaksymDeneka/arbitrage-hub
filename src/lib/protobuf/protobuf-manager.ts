/* eslint-disable @typescript-eslint/no-explicit-any */
import { MEXCProtobufDecoder } from './protobuf-decoder';
import { ProtobufDetector } from './protobuf-detector';
import { PriceData } from '../types';

export class ProtobufManager {
  private mexcDecoder = new MEXCProtobufDecoder();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      await this.mexcDecoder.initialize();
      this.initialized = true;
      console.log('[ProtobufManager] Initialized successfully');
    } catch (error) {
      console.error('[ProtobufManager] Initialization failed:', error);
      throw error;
    }
  }

  async handleMEXCMessage(data: any, symbol: string): Promise<PriceData | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    //сheck whether it is protobuf data
    if (!ProtobufDetector.isProtobuf(data)) {
      return null;
    }

    //convert to Uint8Array
    const uint8Array = ProtobufDetector.toUint8Array(data);
    if (!uint8Array) {
      console.warn('[MEXC] Could not convert data to Uint8Array');
      return null;
    }

    const priceData = await this.mexcDecoder.decodeDealsMessage(uint8Array);
    
    if (priceData) {
      priceData.symbol = symbol;
    }

    return priceData;
  }

  isValidMEXCProtobuf(data: any): boolean {
    if (!this.initialized) return false;
    
    const uint8Array = ProtobufDetector.toUint8Array(data);
    if (!uint8Array) return false;

    return this.mexcDecoder.isValidProtobufMessage(uint8Array);
  }
}

export const protobufManager = new ProtobufManager();