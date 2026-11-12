/**
 * A non-negative score with at most two decimals from a text field ("7", "7.5", "7,25"), or
 * null when it is not one. A grade is `Decimal(8,2)` (owner, 2026-11-12).
 */
export function parseMark(value: string): number | null {
  const trimmed = value.trim();
  return /^\d+([.,]\d{1,2})?$/.test(trimmed) ? Number(trimmed.replace(",", ".")) : null;
}
