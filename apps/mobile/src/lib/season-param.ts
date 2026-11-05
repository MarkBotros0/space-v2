/** A positive integer season id from a route param, or undefined for any other value. */
export function seasonParam(raw: string | undefined): number | undefined {
  const n = Number(raw);
  return raw !== undefined && Number.isInteger(n) && n > 0 ? n : undefined;
}
