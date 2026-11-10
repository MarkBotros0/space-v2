import type { AssignmentCompletionRow, AttendancePoint, EngagementBand } from "@space/shared";
// VALUE import — relative, six levels up (see the note in engagement.ts).
import { BAND_ORDER } from "../../../../../../packages/shared/src/index";

import type { EnrollmentStatus } from "../../../generated/prisma/client";
import { orgDayKey } from "../../org-time";
import { expectedStudentIds } from "./expected";
import { byScoreThenId, type ScoredReportRow } from "./rows";

/*
 * The engagement summary's arithmetic, apart from its reads (BE-005): every
 * function here is pure over rows buildEngagementSummary already loaded.
 */

interface SummaryEnrollment {
  seasonId: number;
  studentUserId: number;
  groupId: number | null;
  status: EnrollmentStatus;
  enrolledAt: Date;
  droppedAt: Date | null;
}

interface TrendSession {
  id: number;
  seasonId: number;
  title: string;
  startsAt: Date;
}

interface CompletionAssignment {
  id: number;
  seasonId: number;
  title: string;
  isAllGroups: boolean;
  targets: Array<{ groupId: number }>;
}

/** The students under each key: rows grouped by `key`, studentUserId collected. */
export function setsBy<T extends { studentUserId: number }>(rows: T[], key: (row: T) => number) {
  const map = new Map<number, Set<number>>();
  for (const row of rows) {
    const set = map.get(key(row)) ?? new Set<number>();
    set.add(row.studentUserId);
    map.set(key(row), set);
  }
  return map;
}

export function bySeason<T extends { seasonId: number }>(rows: T[]) {
  const map = new Map<number, T[]>();
  for (const row of rows) {
    const list = map.get(row.seasonId) ?? [];
    list.push(row);
    map.set(row.seasonId, list);
  }
  return map;
}

export function attendanceTrendPoints(
  sessions: TrendSession[],
  enrollmentsBySeason: Map<number, SummaryEnrollment[]>,
  presentBySession: Map<number, Set<number>>,
  seasonTitleById: Map<number, string>,
): AttendancePoint[] {
  return sessions.map((s) => {
    // The roster AS IT STOOD at this session's instant. v1 divided by today's
    // ACTIVE count (R10, R11) while counting attendance rows from students who
    // have since withdrawn (R12), so pct could exceed 100 and nothing clamped
    // it. Restricting the numerator to the same set makes presentCount <=
    // expectedCount hold by construction — no clamp, which would only hide the
    // next bug (ruling C5's closing line).
    const eligible = new Set<number>();
    for (const e of enrollmentsBySeason.get(s.seasonId) ?? []) {
      const joined = e.enrolledAt.getTime() <= s.startsAt.getTime();
      const stillOn = e.droppedAt === null || e.droppedAt.getTime() > s.startsAt.getTime();
      if (joined && stillOn) eligible.add(e.studentUserId);
    }
    const present = presentBySession.get(s.id) ?? new Set<number>();
    let presentCount = 0;
    for (const id of present) if (eligible.has(id)) presentCount += 1;

    return {
      sessionId: s.id,
      seasonId: s.seasonId,
      seasonTitle: seasonTitleById.get(s.seasonId) ?? "",
      title: s.title,
      startsAt: s.startsAt.toISOString(),
      dayKey: orgDayKey(s.startsAt), // X13: the label's day is the org's, not the device's
      presentCount,
      expectedCount: eligible.size,
      // null, not 0: a session that ran before anybody enrolled has no
      // percentage, and plotting it at zero draws a cliff that never happened
      // (fixes R13).
      pct: eligible.size > 0 ? Math.round((presentCount / eligible.size) * 100) : null,
    };
  });
}

export function completionRows(
  assignments: CompletionAssignment[],
  enrollmentsBySeason: Map<number, SummaryEnrollment[]>,
  submittedBy: Map<number, Set<number>>,
): AssignmentCompletionRow[] {
  return assignments.map((a) => {
    // v1 counted GroupStudent rows (R20) — then a table unique on
    // studentUserId across the ENTIRE database (R21, fixed by Plan 18 M1), so
    // it held one group per student regardless of season.
    const expectedIds = expectedStudentIds(enrollmentsBySeason.get(a.seasonId) ?? [], a);
    // Intersecting the numerator is the fix for R23: v1 counted submissions
    // from ANY student against a denominator of targeted students, so the bar
    // could exceed 100 and neither end was clamped.
    const submitters = submittedBy.get(a.id) ?? new Set<number>();
    let completed = 0;
    for (const id of submitters) if (expectedIds.has(id)) completed += 1;

    return {
      assignmentId: a.id,
      seasonId: a.seasonId,
      title: a.title,
      targeting: a.isAllGroups ? "all_groups" : "targeted",
      completed,
      expected: expectedIds.size,
      // null for a targeted assignment with no AssignmentTarget rows. v1 showed
      // 0 %, which reads as total cohort failure and is a mis-configured
      // assignment (R22).
      completionRate: expectedIds.size > 0 ? Math.round((completed / expectedIds.size) * 100) : null,
    };
  });
}

/** The band pie, and every AT_RISK row in report order. */
export function foldBands(rows: ScoredReportRow[]) {
  const bandCounts = new Map<EngagementBand, number>(BAND_ORDER.map((b) => [b, 0]));
  for (const r of rows) bandCounts.set(r.band, (bandCounts.get(r.band) ?? 0) + 1);
  return {
    bands: BAND_ORDER.map((band) => ({ band, count: bandCounts.get(band) ?? 0 })),
    atRiskAll: rows.filter((r) => r.band === "AT_RISK").sort(byScoreThenId),
  };
}
