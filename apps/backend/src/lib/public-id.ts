import { randomBytes } from "node:crypto";

// URL-safe alphabet: digits + ASCII letters. 62^10 ≈ 8.4 × 10^17 — collision-safe
// for this scale. Same alphabet and length as v1's nanoid-based generator, so
// ids from the two backends are indistinguishable.
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const LENGTH = 10;

// v1 uses nanoid v5, which is ESM-only. This backend compiles to CommonJS, so
// requiring it would throw ERR_REQUIRE_ESM at runtime — it typechecks and then
// fails on the first check-in. node:crypto has no such problem.
//
// 256 is not a multiple of 62, so bytes at or above the largest multiple (248)
// are discarded rather than folded with %, which would bias the first four
// letters of every id.
const MAX_ACCEPTABLE = Math.floor(256 / ALPHABET.length) * ALPHABET.length;

export function newPublicId(): string {
  let out = "";
  while (out.length < LENGTH) {
    for (const byte of randomBytes(LENGTH)) {
      if (byte >= MAX_ACCEPTABLE) continue;
      out += ALPHABET[byte % ALPHABET.length];
      if (out.length === LENGTH) break;
    }
  }
  return out;
}
