import { decodePublicAggreDealsV3Api, PublicAggreDealsV3Api } from './public-aggre-deals';

export class MEXCProtobufDecoder {
  decodeDealsMessage(buffer: ArrayBuffer): PublicAggreDealsV3Api {
    return decodePublicAggreDealsV3Api(new Uint8Array(buffer));
  }
}