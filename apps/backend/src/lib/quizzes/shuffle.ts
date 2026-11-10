import { randomInt } from "node:crypto";

/** A random seed in [1, 2^31 - 1]. */
export function newShuffleSeed(): number {
  return randomInt(1, 2 ** 31);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic shuffle: same seed and salt give the same order whatever order the input is in. Never mutates. */
export function seededOrder<T extends { id: number }>(items: T[], seed: number, salt: number): T[] {
  const out = [...items].sort((a, b) => a.id - b.id);
  const next = mulberry32((seed ^ Math.imul(salt, 0x9e3779b1)) >>> 0);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const held = out[i] as T;
    out[i] = out[j] as T;
    out[j] = held;
  }
  return out;
}
