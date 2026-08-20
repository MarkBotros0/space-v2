/**
 * Every v1 route repeats `Number.isInteger(id) && id > 0` on its path param
 * before touching the database. This is that check, once.
 *
 * Returns null rather than throwing so callers keep v1's exact response:
 * apiError("bad_request", "Invalid <thing> id.", 400) with the noun spelled
 * the way that route spelled it.
 */
export function parseId(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}
