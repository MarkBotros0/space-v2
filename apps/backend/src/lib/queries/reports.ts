// apps/backend/src/lib/queries/reports.ts
import type {
  AssignmentCompletionRow,
  AttendancePoint,
  EngagementBand,
  EngagementReportRow,
  ResolvedScope,
} from "@space/shared";
// VALUE import — relative, five levels up (see the note in engagement.ts).
import { BAND_ORDER, bandFor } from "../../../../../packages/shared/src/index";

import { db } from "../../db/client";
import { orgDayKey } from "../org-time";
import type { ReportScope } from "../permissions";
import { computeEngagementForSeasons } from "./engagement";

export interface EngagementSummaryOptions {
  trendLimit: number;
  from?: Date;
  to?: Date;
}

export interface EngagementListOptions {
  limit: number;
  cursor?: string;
  band?: EngagementBand;
}

/**
 * Turn "what the caller asked for" into "what the caller may have", by
 * INTERSECTION.
 *
 * v1's loadReportsData built its season filter from whatever integers the
 * caller passed and performed no authorization of any kind (R3); the gate lived
 * in whichever page called it. In v2 the ids arrive from a phone, so the
 * permitted set is a `where` clause and the request is a filter applied to the
 * result — never the other way round (ruling C8, spec §4 item 1).
 *
 * A requested id that is unknown, soft-deleted, or outside the caller's scope
 * is dropped silently and `truncated` is set. It is NOT a 403 and NOT a 404:
 * an error that distinguishes "exists but not yours" from "does not exist"
 * turns this endpoint into an existence oracle over the season table. It also
 * fixes R46, under which v1 answered an unknown id with a header-only CSV and
 * HTTP 200 — indistinguishable from "this season has no students".
 */
export async function resolveReportScope(
  scope: ReportScope,
  requestedIds: number[],
): Promise<ResolvedScope> {
  const permitted = await db.season.findMany({
    where: {
      deletedAt: null,
      ...(scope.kind === "seasons" ? { id: { in: scope.seasonIds } } : {}),
    },
    orderBy: [{ year: "desc" }, { title: "asc" }],
    select: { id: true, code: true, title: true },
  });

  const requested = new Set(requestedIds);
  const seasons = requestedIds.length > 0 ? permitted.filter((s) => requested.has(s.id)) : permitted;
  const truncated = requestedIds.length > 0 && seasons.length < requested.size;

  const label =
    seasons.length === 0
      ? "No seasons"
      : seasons.length === 1
        ? seasons[0]!.title
        : requestedIds.length === 0 && scope.kind === "all"
          ? "All seasons"
          : `${seasons.length} seasons`;

  return { seasonIds: seasons.map((s) => s.id), seasons, truncated, label };
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
    // Ruling C9: the expected set is ACTIVE enrolments in this assignment's
    // season, narrowed by the enrolment's group when the assignment is
    // targeted. v1 counted GroupStudent rows (R20) — a table unique on
    // studentUserId across the ENTIRE database (R21), so it holds one group per
    // student regardless of season and can never answer a per-season question.
    const expectedIds = new Set<number>();
    for (const e of enrollmentsBySeason.get(a.seasonId) ?? []) {
      if (e.status !== "ACTIVE") continue;
      if (a.isAllGroups || (e.groupId !== null && a.targets.some((t) => t.groupId === e.groupId))) {
        expectedIds.add(e.studentUserId);
      }
    }
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
      completionRate:
        expectedIds.size > 0 ? Math.round((completed / expectedIds.size) * 100) : null,
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

/** score ascending, then studentUserId, then seasonId — total and stable. */
function byScoreThenId(a: ScoredReportRow, b: ScoredReportRow): number {
  return a.score - b.score || a.studentUserId - b.studentUserId || a.seasonId - b.seasonId;
}

/** A report row before its email is attached — what sorting and banding need. */
export type ScoredReportRow = Omit<EngagementReportRow, "email">;

/**
 * Domain 9's row plus this domain's band. The band is computed HERE and
 * nowhere else, from the shared `bandFor`, so the at-risk list and the AT_RISK
 * slice are one predicate (D-17.2). Note the row deliberately drops domain 9's
 * `atRisk` boolean: `band === "AT_RISK"` is the same answer, and shipping both
 * is how a client ends up trusting the wrong one.
 */
function toReportRows(rows: Awaited<ReturnType<typeof computeEngagementForSeasons>>): ScoredReportRow[] {
  return rows.map((r) => ({
    score: r.score,
    attendancePct: r.attendancePct,
    submissionPct: r.submissionPct,
    attendanceTotal: r.attendanceTotal,
    attendancePresent: r.attendancePresent,
    submissionsExpected: r.submissionsExpected,
    submissionsCompleted: r.submissionsCompleted,
    studentUserId: r.studentUserId,
    // User.name is non-null in the schema; Plan 12's contract types it nullable.
    name: r.studentName ?? "",
    seasonId: r.seasonId,
    seasonTitle: r.seasonTitle ?? "",
    band: bandFor(r),
  }));
}

/**
 * The reports domain's own email lookup (Plan 12's EngagementRow has none, and
 * must not grow one — see the note under Step 3). Called with only the ids
 * about to be returned, never the whole cohort.
 */
export async function loadStudentEmails(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const users = await db.user.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, email: true },
  });
  return new Map(users.map((u) => [u.id, u.email]));
}

/** Attach emails to the rows being returned, in one query. */
export async function withEmails(rows: ScoredReportRow[]): Promise<EngagementReportRow[]> {
  const emails = await loadStudentEmails(rows.map((r) => r.studentUserId));
  return rows.map((r) => ({ ...r, email: emails.get(r.studentUserId) ?? "" }));
}

/**
 * The cursor is an opaque base64 of a numeric OFFSET into the ordering above.
 *
 * The row set is computed whole in a constant number of queries either way, so
 * an offset costs nothing here and a keyset cursor would buy nothing — there is
 * no LIMIT/OFFSET being pushed to Postgres to be slow. Do not "fix" this into a
 * keyset cursor; it would only add a compound comparator to maintain.
 */
export function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const n = Number(Buffer.from(cursor, "base64url").toString("utf8"));
  // A malformed cursor restarts the list rather than 400ing: it is a cache
  // artefact on the client, not user input worth an error screen.
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

export interface EngagementListResult {
  scope: ResolvedScope;
  rows: EngagementReportRow[];
  nextCursor: string | null;
  total: number;
}

/**
 * The cohort, paged and separately gated.
 *
 * v1 returned this array — every active student's name, email, season and three
 * scores — from the SAME function that fed the charts, to every caller,
 * including the two screens that render at most ten rows of it (R34). In v1 it
 * never leaves the server. Splitting it makes the expensive, sensitive half
 * separately gated, paged, and absent from the screen's first paint
 * (spec D6 #2).
 */
export async function listEngagementRows(
  scope: ResolvedScope,
  options: EngagementListOptions,
): Promise<EngagementListResult> {
  if (scope.seasonIds.length === 0) {
    return { scope, rows: [], nextCursor: null, total: 0 };
  }

  const all = toReportRows(await computeEngagementForSeasons(scope.seasonIds))
    .filter((r) => (options.band ? r.band === options.band : true))
    .sort(byScoreThenId);

  const offset = decodeCursor(options.cursor);
  const rows = await withEmails(all.slice(offset, offset + options.limit));
  const next = offset + rows.length;

  return {
    scope,
    rows,
    nextCursor: next < all.length ? encodeCursor(next) : null,
    total: all.length,
  };
}
