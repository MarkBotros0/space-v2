import { db } from "../../db/client";

/**
 * The grading list's students in name order (owner, 2026-11-13: "sort the students
 * alphabetically"), case and accents aside, a student with no name last, ties by id. The page is
 * the `limit` students after `cursor`, the last id of the page before; paging follows the same
 * order, so Load more never interleaves. A cursor no longer in the list (the student left the
 * season between pages) starts again from the top rather than dropping the rest.
 */
export async function studentPageByName(
  studentIds: number[],
  cursor: number | undefined,
  limit: number,
): Promise<{ pageIds: number[]; nameById: Map<number, string | null>; hasMore: boolean }> {
  const users = await db.user.findMany({ where: { id: { in: studentIds } }, select: { id: true, name: true } });
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  const sorted = [...studentIds].sort((a, b) => {
    const x = nameById.get(a) ?? null;
    const y = nameById.get(b) ?? null;
    if (x === null || y === null) return x === y ? a - b : x === null ? 1 : -1;
    return x.localeCompare(y, undefined, { sensitivity: "base" }) || a - b;
  });
  const after = cursor === undefined ? -1 : sorted.indexOf(cursor);
  const remaining = sorted.slice(after + 1);
  return { pageIds: remaining.slice(0, limit), nameById, hasMore: remaining.length > limit };
}
