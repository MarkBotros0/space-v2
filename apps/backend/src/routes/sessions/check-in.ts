import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, forbidden } from "../../lib/api-response";
import { CHECK_IN_WINDOW_MS, checkInState } from "../../lib/check-in";
import { orgWallTime } from "../../lib/org-time";
import { newPublicId } from "../../lib/public-id";
import { isAdminOfSeason } from "../../lib/rbac";
import { requireUser } from "../../middleware/require-auth";
import { checkInStudent } from "../../lib/sessions/check-in";
import { checkInRequestSchema } from "../../../../../packages/shared/src/index";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";
import { parseOr400 } from "../../lib/http/validate";

export async function studentCheckIn(req: Request, res: Response) {
  const user = requireUser(req);

  const parsed = parseOr400(checkInRequestSchema, req.body, res, "Missing check-in token.");
  if (parsed === null) return;

  return apiOk(res, await checkInStudent(user.userId, parsed.token, new Date()));
}

export async function openCheckIn(req: Request, res: Response) {
  const user = requireUser(req);
  const sessionId = idParam(res, req.params.id, "session");
  if (sessionId === null) return;

  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { seasonId: true, checkInToken: true },
  });
  if (!session) return notFound(res, "Session");
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
  const sessionId = idParam(res, req.params.id, "session");
  if (sessionId === null) return;

  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { seasonId: true },
  });
  if (!session) return notFound(res, "Session");
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
  const id = idParam(res, req.params.id, "session");
  if (id === null) return;

  const session = await db.session.findUnique({
    where: { id },
    select: { seasonId: true, checkInToken: true, checkInOpenAt: true, checkInClosedAt: true },
  });
  if (!session) return notFound(res, "Session");
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
  const id = idParam(res, req.params.id, "session");
  if (id === null) return;

  const session = await db.session.findUnique({ where: { id }, select: { seasonId: true } });
  if (!session) return notFound(res, "Session");
  if (!isAdminOfSeason(user, session.seasonId)) return forbidden(res);

  const checkInToken = newPublicId();
  await db.session.update({ where: { id }, data: { checkInToken } });
  return apiOk(res, { checkInToken });
}
