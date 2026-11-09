/**
 * A text field as the API takes it: null when blank. Trimmed by default; a
 * description passes `{ trim: false }` to keep what was typed (its edges
 * included), as those forms always have.
 */
export function blankToNull(value: string, { trim = true }: { trim?: boolean } = {}): string | null {
  if (value.trim() === "") return null;
  return trim ? value.trim() : value;
}
