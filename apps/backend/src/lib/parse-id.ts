/**
 * Every v1 route repeats `Number.isInteger(id) && id > 0` on its path param
 * before touching the database. This is that check, once.
 *
 * Returns null rather than throwing so callers keep v1's exact response:
 * apiError("bad_request", "Invalid <thing> id.", 400) with the noun spelled
 * the way that route spelled it.
 */
export function parseId(raw: string | string[] | undefined): number | null {
  // Express types a param as string | string[] once a route carries a
  // middleware argument (per-route requireAuth, ruling X5); a path param is
  // never actually an array, but an array is not an id.
  if (raw === undefined || Array.isArray(raw) || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}
