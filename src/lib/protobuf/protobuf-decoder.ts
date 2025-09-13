import * as protobuf from 'protobufjs';
import { PriceData } from '../types';

export class MEXCProtobufDecoder {
  private root: protobuf.Root | null = null;
  private PublicDealsV3Api: protobuf.Type | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      //protobuf schema
      this.root = protobuf.Root.fromJSON({
        nested: {
          PublicDealsV3Api: {
            fields: {
              deals: {
                rule: 'repeated',
                type: 'PublicDealsV3ApiItem',
                id: 1
              },
              eventType: {
                type: 'string',
                id: 2
              }
            }
          },
          PublicDealsV3ApiItem: {
            fields: {
              price: {
                type: 'string',
                id: 1
              },
              quantity: {
                type: 'string',
                id: 2
              },
              tradeType: {
                type: 'int32',
                id: 3
              },
              time: {
                type: 'int64',
                id: 4
              }
            }
          }
        }
      });

      this.PublicDealsV3Api = this.root.lookupType('PublicDealsV3Api');
      this.initialized = true;
      
      console.log('[MEXC] Protobuf decoder initialized successfully');
    } catch (error) {
      console.error('[MEXC] Failed to initialize protobuf decoder:', error);
      throw error;
    }
  }

  async decodeDealsMessage(buffer: ArrayBuffer | Uint8Array): Promise<PriceData | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.PublicDealsV3Api) {
      throw new Error('Protobuf decoder not properly initialized');
    }

    try {
      //convert ArrayBuffer to Uint8Array
      const uint8Array = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
      
      //decode the protobuf message
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const decoded = this.PublicDealsV3Api.decode(uint8Array) as any;
      
      console.log('[MEXC] Decoded protobuf message:', {
        eventType: decoded.eventType,
        dealsCount: decoded.deals?.length || 0
      });

      if (!decoded.deals || decoded.deals.length === 0) {
        console.warn('[MEXC] No deals found in protobuf message');
        return null;
      }

      //get the most recent deal
      const latestDeal = decoded.deals[0];
      
      if (!latestDeal.price) {
        console.warn('[MEXC] Latest deal has no price');
        return null;
      }

      const price = parseFloat(latestDeal.price);
      const quantity = parseFloat(latestDeal.quantity || '0');
      const timestamp = latestDeal.time ? Number(latestDeal.time) : Date.now();

      console.log(`[MEXC] Protobuf parsed SPOT - Price: ${price}, Quantity: ${quantity}, Time: ${timestamp}`);

      return {
        exchange: 'mexc',
        symbol: 'UNKNOWN', //will be set by the exchange handler
        price: price,
        timestamp: timestamp,
        type: 'spot',
        volume: quantity
      };

    } catch (error) {
      console.error('[MEXC] Protobuf decode error:', error);
      return null;
    }
  }

  isValidProtobufMessage(buffer: ArrayBuffer | Uint8Array): boolean {
    try {
      if (!this.initialized || !this.PublicDealsV3Api) {
        return false;
      }

      const uint8Array = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
      
      // Try to decode without throwing
      const decoded = this.PublicDealsV3Api.decode(uint8Array);
      return decoded && typeof decoded === 'object';
    } catch {
      return false;
    }
  }
}