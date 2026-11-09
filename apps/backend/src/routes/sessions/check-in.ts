import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError, forbidden } from "../../lib/api-response";
import { CHECK_IN_WINDOW_MS, checkInState, isCheckInOpen, isStudentCheckInWindow } from "../../lib/check-in";
import { orgWallTime } from "../../lib/org-time";
import { parseId } from "../../lib/parse-id";
import { newPublicId } from "../../lib/public-id";
import { isAdminOfSeason } from "../../lib/rbac";
import { requireUser } from "../../middleware/require-auth";
import { checkInRequestSchema } from "../../../../../packages/shared/src/index";

export async function studentCheckIn(req: Request, res: Response) {
  const user = requireUser(req);

  const parsed = checkInRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Missing check-in token.", 400);

  const session = await db.session.findUnique({
    where: { checkInToken: parsed.data.token },
    select: {
      id: true,
      seasonId: true,
      startsAt: true,
      checkInOpenAt: true,
      checkInClosedAt: true,
    },
  });
  if (!session) return apiError(res, "invalid_token", "Check-in token is invalid.", 404);

  const now = new Date();
  // Checked separately from isCheckInOpen so "never opened" stays distinguishable from "opened and since expired".
  if (!session.checkInOpenAt) return apiError(res, "not_open", "Check-in is not open yet.", 409);
  if (!isCheckInOpen(session, now)) return apiError(res, "closed", "Check-in has closed.", 409);

  const enrollment = await db.seasonEnrollment.findUnique({
    where: { studentUserId_seasonId: { studentUserId: user.userId, seasonId: session.seasonId } },
    select: { status: true, season: { select: { status: true } } },
  });
  // A draft's roster doesn't count yet, and the session's existence says nothing.
  if (!enrollment || enrollment.status !== "ACTIVE" || enrollment.season.status !== "ACTIVE") {
    return apiError(res, "not_enrolled", "You're not enrolled in this season.", 403);
  }

  // Opened early by an admin, but students wait for the hour before the start (owner, 2026-11-08).
  if (!isStudentCheckInWindow(session.startsAt, now)) {
    return apiError(res, "not_open", "Check-in opens an hour before the session.", 409);
  }

  const existing = await db.attendance.findUnique({
    where: { sessionId_studentUserId: { sessionId: session.id, studentUserId: user.userId } },
    select: { checkedInAt: true, status: true },
  });
  if (existing?.checkedInAt) {
    return apiError(res, "already_checked_in", "Already checked in.", 409);
  }

  // Ruling C3: lateness is measured from the session's START — not from when
  // an admin pressed "Open check-in" (spec 04 R63, D1), which made a punctual
  // student LATE whenever the console opened early. The threshold is zero:
  // there is no `Season.lateThresholdMinutes` (C3 over spec 04 D1's
  // 15-minute grace). Rows v1 wrote still mean "minutes since opening";
  // C3 accepts that divergence (the workbook withholds those minutes).
  const minutesLate = Math.max(0, Math.floor((now.getTime() - session.startsAt.getTime()) / 60_000));
  const status: "PRESENT" | "LATE" = minutesLate > 0 ? "LATE" : "PRESENT";

  await db.attendance.upsert({
    where: { sessionId_studentUserId: { sessionId: session.id, studentUserId: user.userId } },
    create: {
      sessionId: session.id,
      studentUserId: user.userId,
      status,
      checkedInAt: now,
      lateMinutes: status === "LATE" ? minutesLate : null,
      markedById: user.userId,
      markedAt: now,
    },
    update: {
      status,
      checkedInAt: now,
      lateMinutes: status === "LATE" ? minutesLate : null,
    },
  });

  return apiOk(res, { status, minutesLate });
}

export async function openCheckIn(req: Request, res: Response) {
  const user = requireUser(req);
  const sessionId = parseId(req.params.id);
  if (sessionId === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { seasonId: true, checkInToken: true },
  });
  if (!session) return apiError(res, "not_found", "Session not found.", 404);
  // Season admins only — not group leaders. Opening check-in is what makes
  // self-marking possible for a whole season's roster.
  if (!isAdminOfSeason(user, session.seasonId)) return forbidden(res);

  // Reuse an existing token so reopening does not invalidate a code already
  // displayed to a room.
  const checkInToken = session.checkInToken ?? newPublicId();
  await db.session.update({
    where: { id: sessionId },
    data: { checkInToken, checkInOpenAt: new Date(), checkInClosedAt: null },
  });

  return apiOk(res, { checkInToken });
}

export async function closeCheckIn(req: Request, res: Response) {
  const user = requireUser(req);
  const sessionId = parseId(req.params.id);
  if (sessionId === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { seasonId: true },
  });
  if (!session) return apiError(res, "not_found", "Session not found.", 404);
  if (!isAdminOfSeason(user, session.seasonId)) return forbidden(res);

  await db.session.update({
    where: { id: sessionId },
    data: { checkInClosedAt: new Date() },
  });

  return apiOk(res, { closed: true });
}

/**
 * Read the check-in state back (spec 04 §7, Plan 6 D-16.9). The narrow,
 * admin-only way to recover the token after an app restart — so the console
 * no longer depends on the season-wide session list for it.
 */
export async function getCheckIn(req: Request, res: Response) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  const session = await db.session.findUnique({
    where: { id },
    select: { seasonId: true, checkInToken: true, checkInOpenAt: true, checkInClosedAt: true },
  });
  if (!session) return apiError(res, "not_found", "Session not found.", 404);
  if (!isAdminOfSeason(user, session.seasonId)) return forbidden(res);

  const state = checkInState(session);
  const expiresAt =
    state === "open" && session.checkInOpenAt ? new Date(session.checkInOpenAt.getTime() + CHECK_IN_WINDOW_MS) : null;
  return apiOk(res, {
    state,
    isOpen: state === "open",
    checkInToken: session.checkInToken,
    checkInOpenAt: session.checkInOpenAt,
    checkInClosedAt: session.checkInClosedAt,
    expiresAt,
    expiresAtTime: expiresAt ? orgWallTime(expiresAt) : null,
  });
}

/**
 * Replace the check-in token (v1 regenerateCheckInTokenAction,
 * session-actions.ts:275-295, R40): both timestamps are left alone, so an
 * open window stays open under the new code and the old one stops working.
 */
export async function regenerateCheckIn(req: Request, res: Response) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  const session = await db.session.findUnique({ where: { id }, select: { seasonId: true } });
  if (!session) return apiError(res, "not_found", "Session not found.", 404);
  if (!isAdminOfSeason(user, session.seasonId)) return forbidden(res);

  const checkInToken = newPublicId();
  await db.session.update({ where: { id }, data: { checkInToken } });
  return apiOk(res, { checkInToken });
}
