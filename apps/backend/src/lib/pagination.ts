/**
 * One page of a `take: limit + 1` read: the extra row only says whether there
 * is another page. `nextCursor` is the last row's key, or null on the last page.
 */
export function pageOf<T, K>(rows: T[], limit: number, keyOf: (row: T) => K): { page: T[]; nextCursor: K | null } {
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return { page, nextCursor: rows.length > limit && last !== undefined ? keyOf(last) : null };
}
