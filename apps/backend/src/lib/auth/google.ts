import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from "jose";

import { db } from "../../db/client";
import type { VerifiedUser } from "./credentials";
import { findUserByEmail } from "./find-user-by-email";

/** Google's published signing keys; jose caches and refreshes them itself. */
const GOOGLE_JWKS_URL = new URL("https://www.googleapis.com/oauth2/v3/certs");
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

let googleKeys: JWTVerifyGetKey | null = null;
function defaultKeys(): JWTVerifyGetKey {
  googleKeys ??= createRemoteJWKSet(GOOGLE_JWKS_URL);
  return googleKeys;
}

interface GoogleIdentity {
  /** Google's stable account id. */
  sub: string;
  email: string;
}

/**
 * Checks a Google ID token: Google's signature (RS256), issuer, expiry, and an
 * audience that is one of OUR client IDs, so a token minted for some other
 * app can't sign anyone in here. Only a verified email counts.
 *
 * `null` means the token is not acceptable. Anything else thrown (Google's
 * key endpoint unreachable) propagates, so the error handler answers 500
 * rather than calling a good token bad.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  audiences: readonly string[],
  keys: JWTVerifyGetKey = defaultKeys(),
): Promise<GoogleIdentity | null> {
  if (audiences.length === 0) return null;
  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, keys, {
      issuer: GOOGLE_ISSUERS,
      audience: [...audiences],
      algorithms: ["RS256"],
    }));
  } catch (err) {
    if (err instanceof errors.JOSEError && !(err instanceof errors.JWKSTimeout)) return null;
    throw err;
  }
  const { sub, email, email_verified: emailVerified } = payload;
  if (typeof sub !== "string" || sub.length === 0) return null;
  if (typeof email !== "string" || email.length === 0) return null;
  if (emailVerified !== true) return null;
  return { sub, email };
}

/**
 * The account a verified Google address signs in to. Google never creates an
 * account: the address must already belong to a live user (owner: the
 * community is invite-only). Someone invited but not yet set up may sign in
 * this way too; stamping lastLoginAt marks the account active, exactly as a
 * first password sign-in would.
 */
export async function findGoogleUser(email: string): Promise<VerifiedUser | null> {
  const user = await findUserByEmail(email, { id: true, email: true, name: true, deletedAt: true });
  if (!user || user.deletedAt) return null;

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { id: user.id, email: user.email, name: user.name };
}
