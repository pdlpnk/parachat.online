import "server-only";

import { encodeBase64Url } from "./encoding";

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const textEncoder = new TextEncoder();

export interface IssuedSessionToken {
  readonly value: string;
  readonly hash: string;
}

export class SessionTokenManager {
  private readonly keyPromise: Promise<CryptoKey>;

  constructor(secret: string) {
    this.keyPromise = crypto.subtle.importKey(
      "raw",
      textEncoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  }

  async digest(value: string) {
    const key = await this.keyPromise;
    const digest = await crypto.subtle.sign("HMAC", key, textEncoder.encode(value));
    return encodeBase64Url(new Uint8Array(digest));
  }

  isValid(value: string) {
    return TOKEN_PATTERN.test(value);
  }

  async issue(): Promise<IssuedSessionToken> {
    const value = encodeBase64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
    return { value, hash: await this.digest(value) };
  }
}
