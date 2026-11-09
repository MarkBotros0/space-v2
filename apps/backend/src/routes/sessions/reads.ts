import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError, forbidden } from "../../lib/api-response";
import { isCheckInOpen, isCheckInOpenForStudent } from "../../lib/check-in";
import { MS_PER_DAY, addWeeksInOrgTime, orgDayKey, orgWallClockToInstant, orgWallTime } from "../../lib/org-time";
import { parseId } from "../../lib/parse-id";
import {
  attendanceScopeFor,
  calendarScopeFor,
  canAccessSeason,
  canMarkAttendance,
  hasActiveEnrollment,
} from "../../lib/permissions";
import { listSessionsInRange } from "../../lib/queries/sessions";
import { isAdminOfSeason } from "../../lib/rbac";
import { requireUser } from "../../middleware/require-auth";
import {
  SESSION_RANGE_DEFAULT_WEEKS,
  SESSION_RANGE_MAX_DAYS,
  sessionRangeQuerySchema,
} from "../../../../../packages/shared/src/index";

/**
 * The multi-season calendar (Plan 6 D-16.7, G17). The season set comes from
 * the role (calendarScopeFor); the window is required in practice — v1's
 * super calendar was every session of every ACTIVE season, unbounded (spec
 * 03 R75). Day boundaries are org midnights (C2).
 */
export async function listSessions(req: Request, res: Response) {
  const user = requireUser(req);
  const parsed = sessionRangeQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid calendar window.", 400);
  const q = parsed.data;

  let from: Date;
  let to: Date;
  if (q.from && q.to) {
    from = new Date(q.from);
    to = new Date(q.to);
  } else if (q.from) {
    from = new Date(q.from);
    to = addWeeksInOrgTime(from, SESSION_RANGE_DEFAULT_WEEKS);
  } else if (q.to) {
    to = new Date(q.to);
    from = addWeeksInOrgTime(to, -SESSION_RANGE_DEFAULT_WEEKS);
  } else {
    from = orgWallClockToInstant(orgDayKey(new Date()), null);
    to = addWeeksInOrgTime(from, SESSION_RANGE_DEFAULT_WEEKS);
  }
  const span = to.getTime() - from.getTime();
  if (span <= 0 || span > SESSION_RANGE_MAX_DAYS * MS_PER_DAY) {
    return apiError(res, "bad_request", `The window must be positive and at most ${SESSION_RANGE_MAX_DAYS} days.`, 400);
  }

  const scope = await calendarScopeFor(user, q.seasonId ?? null);
  if (scope === "not_found") return apiError(res, "not_found", "Season not found.", 404);
  if (scope === "forbidden") return forbidden(res);

  // Tokens only for seasons the caller can actually run check-in for (spec
  // 04 §7): v1 handed them to every non-student, leaders included.
  const sessions = await listSessionsInRange(scope, { from, to }, (sid) => isAdminOfSeason(user, sid));
  return apiOk(res, {
    sessions,
    from,
    to,
    fromDayKey: orgDayKey(from),
    toDayKey: orgDayKey(new Date(to.getTime() - 1)),
  });
}

export async function getSession(req: Request, res: Response) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  // checkInToken is deliberately absent from this select — see
  // lib/queries/sessions.ts. Detail is readable by every season member, so
  // including it here would hand it to students.
  const session = await db.session.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      startsAt: true,
      durationMinutes: true,
      location: true,
      youtubeUrl: true,
      recurrenceGroupId: true,
      seasonId: true,
      season: { select: { code: true, title: true } },
      checkInOpenAt: true,
      checkInClosedAt: true,
    },
  });
  if (!session) return apiError(res, "not_found", "Session not found.", 404);

  // REG-77 (v1 student/sessions/[id]/page.tsx): a student sees the session only
  // with an ACTIVE enrolment, and is told 404 — not 403 — otherwise. This is
  // stricter than canAccessSeason, whose student branch admits any enrolment row.
  if (user.role === "STUDENT") {
    if (!(await hasActiveEnrollment(user, session.seasonId))) {
      return apiError(res, "not_found", "Session not found.", 404);
    }
  } else if (!(await canAccessSeason(user, session.seasonId))) {
    return forbidden(res);
  }

  const myAttendance =
    user.role === "STUDENT"
      ? await db.attendance.findUnique({
          where: { sessionId_studentUserId: { sessionId: id, studentUserId: user.userId } },
          select: { status: true, notes: true, lateMinutes: true, checkedInAt: true },
        })
      : null;

  return apiOk(res, {
    id: session.id,
    title: session.title,
    description: session.description,
    startsAt: session.startsAt,
    dayKey: orgDayKey(session.startsAt),
    startTime: orgWallTime(session.startsAt),
    durationMinutes: session.durationMinutes,
    location: session.location,
    youtubeUrl: session.youtubeUrl,
    recurrenceGroupId: session.recurrenceGroupId,
    seasonId: session.seasonId,
    seasonCode: session.season.code,
    seasonTitle: session.season.title,
    // A student is told it's open only from an hour before the start; staff see the real state.
    checkInOpen: user.role === "STUDENT" ? isCheckInOpenForStudent(session) : isCheckInOpen(session),
    myAttendance,
    canMarkAttendance: await canMarkAttendance(user, id),
    // Ruling C4: the client renders this and never re-derives it. It is the
    // exact predicate check-in-open/-close enforce below — a leader passes
    // canMarkAttendance (attendanceScopeFor) but not this, which is why the
    // console must not key off canMarkAttendance (spec 04 §9 row 2).
    canManageCheckIn: isAdminOfSeason(user, session.seasonId),
  });
}

/**
 * The session's quizzes for staff (v1 listQuizzesForSession, quiz-query.ts:
 * 141-170; Plan 6 D-16.10). Gated like the attendance roster: season
 * admins and leaders with a group in the season.
 */
export async function listSessionQuizzes(req: Request, res: Response) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  const exists = await db.session.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return apiError(res, "not_found", "Session not found.", 404);
  if ((await attendanceScopeFor(user, id)) === null) return forbidden(res);

  const quizzes = await db.quiz.findMany({
    where: { sessionId: id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      kind: true,
      maxScore: true,
      publishedAt: true,
      _count: { select: { questions: true } },
    },
  });
  return apiOk(res, {
    quizzes: quizzes.map((q) => ({
      id: q.id,
      title: q.title,
      kind: q.kind,
      maxScore: q.maxScore,
      questionCount: q._count.questions,
      publishedAt: q.publishedAt,
    })),
  });
}
