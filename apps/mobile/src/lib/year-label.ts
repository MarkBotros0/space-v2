/** A bare number ("3") reads as "Year 3"; anything else ("3rd", "Medicine") is shown as typed. */
export function yearLabel(year: string | null | undefined): string | null {
  const y = year?.trim();
  return y && /^\d+$/.test(y) ? `Year ${y}` : (y ?? null);
}
