// apps/backend/src/__tests__/google-token.test.ts
/**
 * verifyGoogleIdToken against a local key set: the checks that keep a token
 * minted for another app, by another issuer, or for an unverified address
 * from signing anyone in. No network, no database.
 */
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTVerifyGetKey,
  type KeyLike,
} from "jose";

import { verifyGoogleIdToken } from "../lib/auth/google";

const AUD = "web-client.apps.googleusercontent.com";
let keys: JWTVerifyGetKey;
let privateKey: KeyLike;
let otherKey: KeyLike;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  otherKey = (await generateKeyPair("RS256")).privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" };
  keys = createLocalJWKSet({ keys: [jwk] });
});

interface Claims {
  aud?: string;
  iss?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  exp?: string | number;
  key?: KeyLike;
}

function sign(claims: Claims = {}): Promise<string> {
  const {
    aud = AUD,
    iss = "https://accounts.google.com",
    sub = "1234567890",
    email = "ann@jpc.test",
    email_verified = true,
    exp = "5m",
    key = privateKey,
  } = claims;
  return new SignJWT({ email, email_verified })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(iss)
    .setAudience(aud)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key);
}

describe("verifyGoogleIdToken", () => {
  it("returns the Google identity for a good token", async () => {
    await expect(verifyGoogleIdToken(await sign(), [AUD], keys)).resolves.toEqual({
      sub: "1234567890",
      email: "ann@jpc.test",
    });
  });

  it("accepts the bare issuer Google also uses", async () => {
    const token = await sign({ iss: "accounts.google.com" });
    await expect(verifyGoogleIdToken(token, [AUD], keys)).resolves.not.toBeNull();
  });

  it("accepts any of the configured audiences", async () => {
    const token = await sign({ aud: "ios.apps.googleusercontent.com" });
    await expect(
      verifyGoogleIdToken(token, [AUD, "ios.apps.googleusercontent.com"], keys),
    ).resolves.not.toBeNull();
  });

  it.each<[string, Claims]>([
    ["another app's audience", { aud: "someone-else.apps.googleusercontent.com" }],
    ["another issuer", { iss: "https://evil.example" }],
    ["an expired token", { exp: Math.floor(Date.now() / 1000) - 60 }],
    ["an unverified email", { email_verified: false }],
    ["no email", { email: "" }],
  ])("refuses %s", async (_label, claims) => {
    await expect(verifyGoogleIdToken(await sign(claims), [AUD], keys)).resolves.toBeNull();
  });

  it("refuses a token signed by a key that isn't Google's", async () => {
    await expect(
      verifyGoogleIdToken(await sign({ key: otherKey }), [AUD], keys),
    ).resolves.toBeNull();
  });

  it("refuses garbage", async () => {
    await expect(verifyGoogleIdToken("not-a-jwt", [AUD], keys)).resolves.toBeNull();
  });

  it("refuses everything when no client ID is configured", async () => {
    await expect(verifyGoogleIdToken(await sign(), [], keys)).resolves.toBeNull();
  });
});
