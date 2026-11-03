import type { EngagementBand, EngagementReportRow, ResolvedScope } from "@space/shared";
// VALUE import — relative, six levels up (see the note in engagement.ts).
import { bandFor } from "../../../../../../packages/shared/src/index";

import { db } from "../../../db/client";
import { computeEngagementForSeasons } from "../engagement";

export interface EngagementListOptions {
  limit: number;
  cursor?: string;
  band?: EngagementBand;
}

/** The fields the at-risk order reads — satisfied by report rows and EngagementRow alike. */
export interface ScoreOrderKey {
  score: number;
  studentUserId: number;
  seasonId: number;
}

/**
 * score ascending, then studentUserId, then seasonId — total and stable.
 * Exported so the dashboard's at-risk preview (spec 19 §8) sorts exactly as
 * the Reports list does; one order, two screens.
 */
export function byScoreThenId(a: ScoreOrderKey, b: ScoreOrderKey): number {
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
export function toReportRows(rows: Awaited<ReturnType<typeof computeEngagementForSeasons>>): ScoredReportRow[] {
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
async function loadStudentEmails(ids: number[]): Promise<Map<number, string>> {
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
function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): number {
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
