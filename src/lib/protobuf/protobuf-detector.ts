/* eslint-disable @typescript-eslint/no-explicit-any */
export class ProtobufDetector {

  static isProtobuf(data: any): boolean {

    if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
      return true;
    }

    //check MessageEvent data
    if (data && typeof data === 'object' && 'data' in data) {
      return this.isProtobuf(data.data);
    }

    //string data - check if it looks like JSON
    if (typeof data === 'string') {
      //if it starts with { or [,
      const trimmed = data.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        return false;
      }
      
      //check if it contains non-printable characters (binary data)
      for (let i = 0; i < Math.min(data.length, 50); i++) {
        const code = data.charCodeAt(i);
        if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
          return true;
        }
      }
    }

    return false;
  }

  static toUint8Array(data: any): Uint8Array | null {
    if (data instanceof Uint8Array) {
      return data;
    }

    if (data instanceof ArrayBuffer) {
      return new Uint8Array(data);
    }

    if (data && typeof data === 'object' && 'data' in data) {
      return this.toUint8Array(data.data);
    }
		
    if (typeof data === 'string') {
      const encoder = new TextEncoder();
      return encoder.encode(data);
    }

    return null;
  }
}