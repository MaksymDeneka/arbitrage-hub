import { decodePushDataV3ApiWrapper, PushDataV3ApiWrapper } from '@/lib/protobuf/push-wrapper';

class ProtobufManager {
  handleMEXCMessage(input: ArrayBuffer | Uint8Array) {
    try {
      const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
      const wrapper: PushDataV3ApiWrapper = decodePushDataV3ApiWrapper(u8);

      if (wrapper.publicAggreDeals?.deals?.length) {
        const firstDeal = wrapper.publicAggreDeals.deals[0];
        console.log('Price:', firstDeal.price, 'Quantity:', firstDeal.quantity);
        return firstDeal;
      }

      console.warn('Wrapper decoded but no deals field:', wrapper);
      console.warn(`inside of wrapper ${wrapper.publicAggreDeals?.deals}`);
      return null;
    } catch (err) {
      console.error('Failed to decode wrapper:', err);
      return null;
    }
  }
}

export const protobufManager = new ProtobufManager();
