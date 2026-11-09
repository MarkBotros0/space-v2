import type {
  AssignmentCompletionRow,
  AttendancePoint,
  EngagementBand,
  EngagementReportRow,
  ResolvedScope,
} from "@space/shared";
// VALUE import — relative, six levels up (see the note in engagement.ts).
import { BAND_ORDER } from "../../../../../../packages/shared/src/index";

import { db } from "../../../db/client";
import { orgDayKey } from "../../org-time";
import { computeEngagementForSeasons } from "../engagement";
import { expectedStudentIds } from "./expected";
import { byScoreThenId, toReportRows, withEmails } from "./rows";

export interface EngagementSummaryOptions {
  trendLimit: number;
  from?: Date;
  to?: Date;
}

export interface EngagementSummaryResult {
  scope: ResolvedScope;
  attendanceTrend: AttendancePoint[];
  completion: AssignmentCompletionRow[];
  bands: Array<{ band: EngagementBand; count: number }>;
  atRisk: EngagementReportRow[];
  atRiskTotal: number;
  cohortSize: number;
  enrollmentCount: number;
  generatedAt: string;
  exportDay: string;
}

const EMPTY_BANDS = () => BAND_ORDER.map((band) => ({ band, count: 0 }));

/**
 * The engagement report, in eleven queries — six here plus the five inside
 * computeEngagementForSeasons — and eleven whether the cohort is four students
 * or four hundred, across one season or twenty.
 *
 * v1 cost `1 + 1 + S + 1 + A + 1 + 4E` round trips of which `S + 4E` were
 * strictly sequential (R10, R24, R29), and fetched every attendance row in
 * every past session in scope to compute one integer per session (R17). It is
 * the heaviest read in the product and it sits on the MENTOR tab bar. Under
 * React Query — which refetches on mount, on focus and on reconnect — that
 * shape re-issues the whole fan-out every time the app returns to the
 * foreground.
 */
export async function buildEngagementSummary(
  scope: ResolvedScope,
  options: EngagementSummaryOptions,
): Promise<EngagementSummaryResult> {
  const now = new Date();
  const generatedAt = now.toISOString();
  // The org-zone day for the client's export filename (X13) — the same
  // function routes/exports.ts stamps on Content-Disposition.
  const exportDay = orgDayKey(now);
  const seasonIds = scope.seasonIds;
  if (seasonIds.length === 0) {
    return {
      scope,
      attendanceTrend: [],
      completion: [],
      bands: EMPTY_BANDS(),
      atRisk: [],
      atRiskTotal: 0,
      cohortSize: 0,
      enrollmentCount: 0,
      generatedAt,
      exportDay,
    };
  }

  // `to` and the "past sessions only" cut are BOTH `lte` on startsAt. Spreading
  // them into one object silently drops whichever comes first, so a `to` in the
  // future would un-bound the query and plot sessions that have not happened.
  // Take the minimum once, explicitly.
  const upper = options.to && options.to.getTime() < now.getTime() ? options.to : now;

  // Q1 — the trend window: the most recent N sessions, fetched descending and
  // reversed for display. v1 fetched every past session in scope and every
  // attendance row hanging off it (R17).
  const windowed = await db.session.findMany({
    where: {
      seasonId: { in: seasonIds },
      startsAt: { lte: upper, ...(options.from ? { gte: options.from } : {}) },
    },
    orderBy: { startsAt: "desc" },
    take: options.trendLimit,
    select: { id: true, seasonId: true, title: true, startsAt: true },
  });
  const sessions = [...windowed].reverse();

  // Q2 — EVERY enrolment in scope, whatever its status, with the two columns
  // that make a historical roster possible. Withdrawn and completed students
  // were on the roster at the time and must count in a past session's
  // denominator (spec D3). This one fetch also serves the targeting map and the
  // cohort counts below — the replacement for v1's per-season count loop (R10)
  // and per-assignment count fan-out (R24).
  const enrollments = await db.seasonEnrollment.findMany({
    where: { seasonId: { in: seasonIds } },
    select: {
      seasonId: true,
      studentUserId: true,
      groupId: true,
      status: true,
      enrolledAt: true,
      droppedAt: true,
    },
  });

  // Q3 — present-marks on the windowed sessions only, two columns.
  const attendance =
    sessions.length === 0
      ? []
      : await db.attendance.findMany({
          where: {
            sessionId: { in: sessions.map((s) => s.id) },
            status: { in: ["PRESENT", "LATE"] },
          },
          select: { sessionId: true, studentUserId: true },
        });
  const presentBySession = new Map<number, Set<number>>();
  for (const row of attendance) {
    const set = presentBySession.get(row.sessionId) ?? new Set<number>();
    set.add(row.studentUserId);
    presentBySession.set(row.sessionId, set);
  }

  const enrollmentsBySeason = new Map<number, typeof enrollments>();
  for (const e of enrollments) {
    const list = enrollmentsBySeason.get(e.seasonId) ?? [];
    list.push(e);
    enrollmentsBySeason.set(e.seasonId, list);
  }
  const seasonTitleById = new Map(scope.seasons.map((s) => [s.id, s.title]));

  const attendanceTrend: AttendancePoint[] = sessions.map((s) => {
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

  // Q4 — assignments and their targets.
  const assignments = await db.assignment.findMany({
    where: { seasonId: { in: seasonIds }, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      seasonId: true,
      title: true,
      isAllGroups: true,
      targets: { select: { groupId: true } },
    },
  });

  // Q5 — non-DRAFT submissions on them. Two columns; the studentUserId is what
  // makes the numerator intersectable with the expected set.
  const submissions =
    assignments.length === 0
      ? []
      : await db.submission.findMany({
          where: {
            assignmentId: { in: assignments.map((a) => a.id) },
            status: { not: "DRAFT" },
          },
          select: { assignmentId: true, studentUserId: true },
        });
  const submittedBy = new Map<number, Set<number>>();
  for (const row of submissions) {
    const set = submittedBy.get(row.assignmentId) ?? new Set<number>();
    set.add(row.studentUserId);
    submittedBy.set(row.assignmentId, set);
  }

  const completion: AssignmentCompletionRow[] = assignments.map((a) => {
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

  // Q6..Q10 — domain 9's aggregation, called once for the whole scope.
  const rows = toReportRows(await computeEngagementForSeasons(seasonIds));

  const bandCounts = new Map<EngagementBand, number>(BAND_ORDER.map((b) => [b, 0]));
  for (const r of rows) bandCounts.set(r.band, (bandCounts.get(r.band) ?? 0) + 1);

  const atRiskAll = rows.filter((r) => r.band === "AT_RISK").sort(byScoreThenId);

  return {
    scope,
    attendanceTrend,
    completion,
    bands: BAND_ORDER.map((band) => ({ band, count: bandCounts.get(band) ?? 0 })),
    // The cap is v1's (R33). What is new is atRiskTotal beside it: a reader
    // currently cannot tell whether ten is all of them (spec D16).
    atRisk: await withEmails(atRiskAll.slice(0, 10)),
    atRiskTotal: atRiskAll.length,
    // Two numbers, because they differ and v1 conflated them: bucket counts
    // count ENROLMENTS, so a two-season student is counted twice and the pie's
    // total exceeds the headcount (R27, R32).
    cohortSize: new Set(rows.map((r) => r.studentUserId)).size,
    enrollmentCount: rows.length,
    generatedAt,
    exportDay,
  };
}
