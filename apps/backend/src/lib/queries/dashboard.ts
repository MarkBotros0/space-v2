// apps/backend/src/lib/queries/dashboard.ts
import { db } from "../../db/client";
import type { SessionUser } from "../auth/tokens";
import {
  isQuizDraft,
  mergeActivity,
  quizRollupFrom,
  summarizeStudentAssignments,
  type ActivityRow,
} from "../dashboard-figures";
import { orgDayKey, orgWallTime } from "../org-time";
import { submissionQueueScopeFor, type AttendanceScope } from "../permissions";
import { countGradedByQuiz, visibleStudentIdsForQuiz } from "../quiz-scope";
import { listAssignmentStatesForStudent } from "./assignments";
import { computeEngagementForSeasons } from "./engagement";
import { byScoreThenId } from "./reports";
import { loadCurrentOrNextSession, loadSeasonProgress, type CurrentOrNextSession } from "./sessions";
import {
  DASHBOARD_AT_RISK_PREVIEW,
  DUE_SOON_LIMIT,
  RECENT_ACTIVITY_LIMIT,
  meanAttendancePct,
} from "../../../../../packages/shared/src/index";

/*
 * GET /api/v1/me/dashboard — spec 19 §7. Every figure here is a CALL to the
 * function that owns it; nothing is re-derived (ruling C4). The query count
 * is constant per variant: it does not grow with the cohort, the number of
 * groups, or the number of seasons (spec §7 "Query budget").
 */

/** Org wall-clock day and time ride beside the instant (C2/X13). */
function toDashboardSession(s: CurrentOrNextSession) {
  return {
    id: s.id,
    title: s.title,
    startsAt: s.startsAt,
    dayKey: orgDayKey(s.startsAt),
    time: orgWallTime(s.startsAt),
    durationMinutes: s.durationMinutes,
    location: s.location,
    youtubeUrl: s.youtubeUrl,
    isInProgress: s.isInProgress,
  };
}

const SEASON_SELECT = { id: true, code: true, title: true, status: true } as const;

/**
 * The student's own Home. Season from the TOKEN's activeSeasonId — the same
 * value /me exposes — for both the title and the figures (D22; v1 mixed the
 * token's id with the database's title, R62). Roughly six queries.
 */
export async function loadStudentDashboard(user: SessionUser, now: Date) {
  const notEnrolled = {
    variant: "STUDENT" as const,
    season: null,
    progress: null,
    nextSession: null,
    assignments: null,
  };
  const seasonId = user.activeSeasonId;
  if (seasonId === null) return notEnrolled;

  const season = await db.season.findFirst({ where: { id: seasonId, deletedAt: null }, select: SEASON_SELECT });
  if (!season) return notEnrolled;

  const [progress, next, rows] = await Promise.all([
    loadSeasonProgress(seasonId, now),
    loadCurrentOrNextSession(seasonId, now),
    listAssignmentStatesForStudent(user.userId, seasonId, now),
  ]);

  return {
    variant: "STUDENT" as const,
    season,
    progress,
    nextSession: next ? toDashboardSession(next) : null,
    assignments: summarizeStudentAssignments(rows, DUE_SOON_LIMIT),
  };
}

/**
 * ADMIN / SUPER (scope "season") and LEADER (scope "groups"). The caller has
 * already passed `staffScopeForSeason`; `scope` is its answer. Returns null
 * when the season does not exist or is soft-deleted.
 */
export async function loadSeasonStaffDashboard(
  user: SessionUser,
  seasonId: number,
  scope: AttendanceScope,
  now: Date,
) {
  const season = await db.season.findFirst({ where: { id: seasonId, deletedAt: null }, select: SEASON_SELECT });
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
  const inSeason = { assignment: { seasonId, deletedAt: null } };

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

  return {
    variant: "SEASON_STAFF" as const,
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
  };
}

/** Active, non-graduated, non-deleted students — the at-risk cohort's people (D17, D18). */
const FEED_STUDENT = { role: "STUDENT" as const, deletedAt: null, graduationYear: null };

/**
 * The mentor's feed: cross-season by design (a mentor reads every student,
 * `canReadAllStudents`), stated here rather than inherited from a page that
 * forgot to filter (spec §4 item 3). Three bounded reads, merged in memory.
 * The at-risk list is NOT here: it is GET /reports/engagement (D17).
 */
export async function loadMentorDashboard() {
  const liveAssignment = { deletedAt: null, season: { deletedAt: null } };
  const [marks, submitted, reviewedRows] = await Promise.all([
    db.attendance.findMany({
      where: { studentUser: FEED_STUDENT, session: { season: { deletedAt: null } } },
      orderBy: [{ markedAt: "desc" }, { id: "desc" }],
      take: RECENT_ACTIVITY_LIMIT,
      select: {
        id: true,
        status: true,
        markedAt: true,
        studentUserId: true,
        studentUser: { select: { name: true } },
        session: { select: { title: true } },
      },
    }),
    db.submission.findMany({
      where: {
        status: { in: ["SUBMITTED", "REVIEWED", "RETURNED"] },
        submittedAt: { not: null },
        studentUser: FEED_STUDENT,
        assignment: liveAssignment,
      },
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      take: RECENT_ACTIVITY_LIMIT,
      select: {
        id: true,
        publicId: true,
        submittedAt: true,
        studentUserId: true,
        studentUser: { select: { name: true } },
        assignment: { select: { title: true } },
      },
    }),
    db.submission.findMany({
      where: {
        status: { in: ["REVIEWED", "RETURNED"] },
        reviewedAt: { not: null },
        studentUser: FEED_STUDENT,
        assignment: liveAssignment,
      },
      orderBy: [{ reviewedAt: "desc" }, { id: "desc" }],
      take: RECENT_ACTIVITY_LIMIT,
      select: {
        id: true,
        publicId: true,
        reviewedAt: true,
        studentUserId: true,
        studentUser: { select: { name: true } },
        assignment: { select: { title: true } },
      },
    }),
  ]);

  const rows: ActivityRow[] = [
    ...marks.map((m) => ({
      key: `att:${m.id}`,
      kind: "attendance" as const,
      at: m.markedAt,
      studentUserId: m.studentUserId,
      studentName: m.studentUser.name,
      subjectTitle: m.session.title,
      attendanceStatus: m.status,
      submissionPublicId: null,
    })),
    ...submitted.flatMap((s) =>
      s.submittedAt === null
        ? []
        : [
            {
              key: `sub:${s.id}`,
              kind: "submitted" as const,
              at: s.submittedAt,
              studentUserId: s.studentUserId,
              studentName: s.studentUser.name,
              subjectTitle: s.assignment.title,
              attendanceStatus: null,
              submissionPublicId: s.publicId,
            },
          ],
    ),
    // A review is its own event at reviewedAt (D18). v1 showed "received
    // feedback" at submittedAt, so a review written today on an old
    // submission never surfaced (R54).
    ...reviewedRows.flatMap((s) =>
      s.reviewedAt === null
        ? []
        : [
            {
              key: `rev:${s.id}`,
              kind: "reviewed" as const,
              at: s.reviewedAt,
              studentUserId: s.studentUserId,
              studentName: s.studentUser.name,
              subjectTitle: s.assignment.title,
              attendanceStatus: null,
              submissionPublicId: s.publicId,
            },
          ],
    ),
  ];

  return { variant: "MENTOR" as const, recentActivity: mergeActivity(rows, RECENT_ACTIVITY_LIMIT) };
}
