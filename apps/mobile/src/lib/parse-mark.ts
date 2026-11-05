/** A whole non-negative number from a text field, or null when it is not one. */
export function parseMark(value: string): number | null {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}
