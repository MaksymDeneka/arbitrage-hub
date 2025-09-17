import protobuf from 'protobufjs';

// Static message definitions - no dynamic loading needed
const root = new protobuf.Root();

// Define PublicAggreDealsV3ApiItem
const PublicAggreDealsV3ApiItem = new protobuf.Type("PublicAggreDealsV3ApiItem")
  .add(new protobuf.Field("price", 1, "string"))
  .add(new protobuf.Field("quantity", 2, "string"))
  .add(new protobuf.Field("tradeType", 3, "int32"))
  .add(new protobuf.Field("time", 4, "int64"));

// Define PublicAggreDealsV3Api
const PublicAggreDealsV3Api = new protobuf.Type("PublicAggreDealsV3Api")
  .add(new protobuf.Field("deals", 1, "PublicAggreDealsV3ApiItem", "repeated"))
  .add(new protobuf.Field("eventType", 2, "string"));

// Define PublicAggreBookTickerV3Api
const PublicAggreBookTickerV3Api = new protobuf.Type("PublicAggreBookTickerV3Api")
  .add(new protobuf.Field("bidPrice", 1, "string"))
  .add(new protobuf.Field("bidQuantity", 2, "string"))
  .add(new protobuf.Field("askPrice", 3, "string"))
  .add(new protobuf.Field("askQuantity", 4, "string"));

// Define the main wrapper
const PushDataV3ApiWrapper = new protobuf.Type("PushDataV3ApiWrapper")
  .add(new protobuf.Field("channel", 1, "string"))
  .add(new protobuf.Field("symbol", 3, "string", "optional"))
  .add(new protobuf.Field("symbolId", 4, "string", "optional"))
  .add(new protobuf.Field("createTime", 5, "int64", "optional"))
  .add(new protobuf.Field("sendTime", 6, "int64", "optional"))
  .add(new protobuf.Field("publicAggreDeals", 314, "PublicAggreDealsV3Api", "optional"))
  .add(new protobuf.Field("publicAggreBookTicker", 315, "PublicAggreBookTickerV3Api", "optional"));

// Add all types to root
root.add(PublicAggreDealsV3ApiItem);
root.add(PublicAggreDealsV3Api);
root.add(PublicAggreBookTickerV3Api);
root.add(PushDataV3ApiWrapper);

// TypeScript interfaces
export interface PublicAggreDealsV3ApiItem {
  price: string;
  quantity: string;
  tradeType: number;
  time: number;
}

export interface PublicAggreDealsV3Api {
  deals: PublicAggreDealsV3ApiItem[];
  eventType: string;
}

export interface PublicAggreBookTickerV3Api {
  bidPrice: string;
  bidQuantity: string;
  askPrice: string;
  askQuantity: string;
}

export interface PushDataV3ApiWrapper {
  channel: string;
  symbol?: string;
  symbolId?: string;
  createTime?: number;
  sendTime?: number;
  publicAggreDeals?: PublicAggreDealsV3Api;
  publicAggreBookTicker?: PublicAggreBookTickerV3Api;
}

// Export the decode function
export function decodePushDataV3ApiWrapper(buffer: Uint8Array): PushDataV3ApiWrapper {
  const message = PushDataV3ApiWrapper.decode(buffer);
  return PushDataV3ApiWrapper.toObject(message) as PushDataV3ApiWrapper;
}