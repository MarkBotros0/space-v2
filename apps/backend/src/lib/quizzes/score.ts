import type { Prisma } from "../../generated/prisma/client";

/** Prisma Decimal serialises as a string; every response converts with this. */
export function toScore(d: Prisma.Decimal | number | null): number | null {
  if (d === null) return null;
  if (typeof d === "number") return d;
  return Number(d.toFixed(2));
}

/** Half-up to two decimals. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Sum, rounding once at the end; nulls count as zero. */
export function sumScores(values: (number | null)[]): number {
  return round2(values.reduce<number>((total, v) => total + (v ?? 0), 0));
}
