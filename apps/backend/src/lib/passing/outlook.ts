import {
  meetsMark,
  passingPcts,
  pointsShort,
  usableWeights,
  weakestNumber,
  weightedScore,
  type PassingOutlook,
  type PassingOutlookRow,
} from "../../../../../packages/shared/src/index";
import { db } from "../../db/client";
import type { SessionUser } from "../auth/tokens";
import { liveUser } from "../db/live";
import type { AttendanceScope } from "../permissions";
import { isAdminOfSeason } from "../rbac";
import { seasonParticipant } from "../queries/season-participants";
import { loadPassCriteria } from "./criteria";
import { loadPassingNumbers } from "./numbers";

/*
 * The passing outlook (spec "Passing outlook"): during the season, every student on the caller's
 * roster with their score against the pass mark, those below it first. Admin and super see the
 * season; a leader their own groups' students, read-only on the criteria. The score is a helper:
 * it shows who is below the mark and which number pulls them down.
 */

/**
 * The outlook of a live season the caller passed `staffScopeForSeason` for (`scope` is its answer).
 * A weight on a number the season has nothing for counts as 0 and is named in `weightsIgnored`.
 */
export async function loadPassingOutlook(
  user: SessionUser,
  season: { id: number; status: string },
  scope: AttendanceScope,
): Promise<PassingOutlook> {
  const roster = await db.seasonEnrollment.findMany({
    where: {
      seasonId: season.id,
      ...seasonParticipant,
      studentUser: liveUser,
      ...(scope.kind === "groups" ? { groupId: { in: scope.groupIds } } : {}),
    },
    select: { studentUserId: true, studentUser: { select: { name: true } }, group: { select: { name: true } } },
  });
  // The season-wide view asks for the roster (null); a leader's view names their students, who are
  // the roster's own rows read above.
  const ids = scope.kind === "season" ? null : roster.map((r) => r.studentUserId);
  const [{ criteria, isDefault }, { available, numbers }] = await Promise.all([
    loadPassCriteria(season.id),
    loadPassingNumbers(season.id, ids),
  ]);
  const { weights, ignored } = usableWeights(criteria.weights, available);

  const rows: PassingOutlookRow[] = [];
  for (const r of roster) {
    const n = numbers.get(r.studentUserId);
    if (!n) continue;
    const pcts = passingPcts(n);
    const { score, rescaled } = weightedScore(pcts, weights);
    const below = meetsMark(score, criteria.passMark) === false;
    rows.push({
      userId: r.studentUserId,
      name: r.studentUser.name,
      groupName: r.group?.name ?? null,
      numbers: n,
      score,
      rescaled,
      pointsShort: below && score !== null ? pointsShort(score, criteria.passMark) : null,
      weakest: weakestNumber(pcts, weights),
    });
  }
  rows.sort(byOutlookOrder);

  return {
    criteria,
    isDefault,
    available,
    weightsIgnored: ignored,
    canEditCriteria: isAdminOfSeason(user, season.id) && season.status === "ACTIVE",
    onTrack: rows.filter((r) => r.score !== null && r.pointsShort === null).length,
    below: rows.filter((r) => r.pointsShort !== null).length,
    rows,
  };
}

/** Below the mark (most short first), then no score, then on track; by name within each. */
function byOutlookOrder(a: PassingOutlookRow, b: PassingOutlookRow): number {
  const band = (r: PassingOutlookRow) => (r.pointsShort !== null ? 0 : r.score === null ? 1 : 2);
  return (
    band(a) - band(b) ||
    (b.pointsShort ?? 0) - (a.pointsShort ?? 0) ||
    a.name.localeCompare(b.name) ||
    a.userId - b.userId
  );
}
