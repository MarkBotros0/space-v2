import { passingPcts, type StudentListItem } from "../../../../../../packages/shared/src/index";
import type { SessionUser } from "../../auth/tokens";
import { loadPassingNumbers } from "../../passing/numbers";
import { scopeCovers, scoreScopeForSeason } from "../../permissions";
import { isMentor } from "../../rbac";

/*
 * The students list's three numbers (spec "Progress for staff"): each row's attendance, assignments
 * and quiz percentages in its current season, when the caller may score the student there (the
 * engagement card's rule), never for a MENTOR, who sees nothing season-shaped (docs/rules/mentor.md).
 * Loaded per page, not per row: one scope check and one
 * `loadPassingNumbers` per season on the page, so a page of 20 costs what a page of 2 does.
 */

type Current = { seasonId: number; groupId: number | null } | null;

const pctOf = (x: number | null) => (x === null ? null : Math.round(x));

/** `items` with `progress` filled in; `current[i]` is `items[i]`'s current enrolment. */
export async function withProgress(
  items: StudentListItem[],
  user: SessionUser,
  current: Current[],
): Promise<StudentListItem[]> {
  if (isMentor(user)) return items.map((item) => ({ ...item, progress: null }));
  const bySeason = new Map<number, { id: number; groupId: number | null }[]>();
  items.forEach((item, i) => {
    const c = current[i];
    if (!c) return;
    bySeason.set(c.seasonId, [...(bySeason.get(c.seasonId) ?? []), { id: item.id, groupId: c.groupId }]);
  });

  const progressOf = new Map<number, NonNullable<StudentListItem["progress"]>>();
  await Promise.all(
    [...bySeason].map(async ([seasonId, students]) => {
      const scope = await scoreScopeForSeason(user, seasonId);
      const ids = students.filter((s) => scopeCovers(scope, s.groupId)).map((s) => s.id);
      if (ids.length === 0) return;
      // The ids are the rows' own ACTIVE enrolments in this season (the current-season rule).
      const { numbers } = await loadPassingNumbers(seasonId, ids);
      for (const [id, n] of numbers) {
        const p = passingPcts(n);
        progressOf.set(id, {
          attendancePct: pctOf(p.attendance),
          assignmentsPct: pctOf(p.assignments),
          quizPct: pctOf(p.quizzes),
        });
      }
    }),
  );
  return items.map((item) => ({ ...item, progress: progressOf.get(item.id) ?? null }));
}
