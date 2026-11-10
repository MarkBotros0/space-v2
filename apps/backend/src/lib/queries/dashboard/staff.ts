// apps/backend/src/lib/queries/dashboard.ts
import { db } from "../../../db/client";
import type { SessionUser } from "../../auth/tokens";
import { isQuizDraft, quizRollupFrom } from "../../dashboard-figures";
import { orgDayKey } from "../../org-time";
import { submissionQueueScopeFor, type AttendanceScope } from "../../permissions";
import { countGradedByQuiz, visibleStudentIdsForQuiz } from "../../quiz-scope";
import { computeEngagementForSeasons } from "../engagement";
import { byScoreThenId } from "../reports";
import { loadAttendanceRoster, loadCurrentOrNextSession, loadSeasonProgress } from "../sessions";
import {
  DASHBOARD_AT_RISK_PREVIEW,
  meanAttendancePct,
  type LeaderSessionCheckIn,
} from "../../../../../../packages/shared/src/index";

/*
 * GET /api/v1/me/dashboard — spec 19 §7. Every figure here is a CALL to the
 * function that owns it; nothing is re-derived (ruling C4). The query count
 * is constant per variant: it does not grow with the cohort, the number of
 * groups, or the number of seasons (spec §7 "Query budget").
 */
import { SEASON_SELECT, toDashboardSession } from "./shared";
import { findLiveSeason } from "../seasons";
import { liveAssignment } from "../../db/live";

/**
 * The leader's groups checked in for the session on the card: one read of the
 * attendance screen's own roster, reduced. A student with no mark yet is
 * "not checked in"; a blank name falls back to the email.
 */
async function loadLeaderSessionCheckIn(sessionId: number, groupIds: number[]): Promise<LeaderSessionCheckIn | null> {
  const roster = await loadAttendanceRoster(sessionId, groupIds);
  if (!roster) return null;
  return {
    sessionId,
    total: roster.length,
    present: roster.filter((r) => r.status === "PRESENT").length,
    late: roster.filter((r) => r.status === "LATE").length,
    absent: roster.filter((r) => r.status === "ABSENT").length,
    notCheckedIn: roster
      .filter((r) => r.status === null)
      .map((r) => ({ id: r.studentUserId, name: r.name?.trim() || r.email })),
  };
}

/**
 * ADMIN / SUPER (scope "season") and LEADER (scope "groups"). The caller has
 * already passed `staffScopeForSeason`; `scope` is its answer. Returns null
 * when the season does not exist or is soft-deleted.
 */
export async function loadSeasonStaffDashboard(user: SessionUser, seasonId: number, scope: AttendanceScope, now: Date) {
  const season = await findLiveSeason(seasonId, SEASON_SELECT);
  if (!season) return null;

  // The leader's cohort: ACTIVE enrolments of THIS season in the groups they
  // lead (C9) — never GroupStudent, never another season's group (D7).
  const [groups, leaderEnrollments] =
    scope.kind === "groups"
      ? await Promise.all([
          db.group.findMany({
            where: { id: { in: scope.groupIds } },
            orderBy: [{ name: "asc" }, { id: "asc" }],
            select: { id: true, name: true },
          }),
          db.seasonEnrollment.findMany({
            where: { seasonId, status: "ACTIVE", groupId: { in: scope.groupIds } },
            select: { studentUserId: true },
          }),
        ])
      : [[], null];

  const queueScope = await submissionQueueScopeFor(user);
  const inSeason = { assignment: { seasonId, ...liveAssignment } };

  const [rows, progress, next, pendingReview, reviewed, quizzes, studentIds] = await Promise.all([
    computeEngagementForSeasons(
      [seasonId],
      leaderEnrollments ? { studentUserIds: leaderEnrollments.map((e) => e.studentUserId) } : {},
    ),
    loadSeasonProgress(seasonId, now),
    loadCurrentOrNextSession(seasonId, now),
    queueScope === null
      ? Promise.resolve(0)
      : db.submission.count({ where: { AND: [queueScope, inSeason, { status: "SUBMITTED" }] } }),
    queueScope === null
      ? Promise.resolve(0)
      : db.submission.count({
          where: { AND: [queueScope, inSeason, { status: { in: ["REVIEWED", "RETURNED"] } }] },
        }),
    db.quiz.findMany({ where: { seasonId }, select: { id: true, kind: true, publishedAt: true } }),
    visibleStudentIdsForQuiz(user, seasonId),
  ]);

  const visible = studentIds ?? [];
  const live = quizzes.filter((q) => !isQuizDraft(q));
  const gradedBy = await countGradedByQuiz(live, visible);

  // The one at-risk predicate (isAtRisk, already on each row) and the one
  // order (Plan 15's byScoreThenId). No 70 % rule, no colour tiers (D2).
  const atRiskAll = rows.filter((r) => r.atRisk).sort(byScoreThenId);

  // Leader scope only; the key is omitted for the season scope.
  const leaderSession =
    scope.kind === "groups"
      ? { leaderSession: next ? await loadLeaderSessionCheckIn(next.id, scope.groupIds) : null }
      : {};

  return {
    variant: "SEASON_STAFF" as const,
    todayOrgDay: orgDayKey(now),
    scope: scope.kind,
    season,
    groups,
    progress,
    nextSession: next ? toDashboardSession(next) : null,
    cohort: {
      studentCount: rows.length,
      meanAttendancePct: meanAttendancePct(rows),
      atRiskTotal: atRiskAll.length,
      atRisk: atRiskAll.slice(0, DASHBOARD_AT_RISK_PREVIEW),
    },
    submissions: { pendingReview, reviewed },
    quizzes: quizRollupFrom(quizzes, gradedBy, visible.length),
    ...leaderSession,
  };
}
