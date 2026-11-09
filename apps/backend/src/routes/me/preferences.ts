import { Router } from "express";
// Relative, not "@space/shared" — the rootDir emit trap (see routes/auth.ts).
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  notificationPreferencesSchema,
} from "../../../../../packages/shared/src/index";

import { db } from "../../db/client";
import { apiOk } from "../../lib/api-response";
import { requireAuth, requireUser } from "../../middleware/require-auth";
import { parseOr400 } from "../../lib/http/validate";

export const mePreferencesRouter = Router();

const PREFERENCE_SELECT = {
  assignmentCreated: true,
  submissionReviewed: true,
  sessionRescheduled: true,
  lowAttendanceFlag: true,
  mentorFollowup: true,
  quizGraded: true,
  quizPublished: true,
  submissionReceived: true,
  sessionCancelled: true,
  announcement: true,
} as const;

/**
 * The caller's own notification preferences — every key.
 *
 * v1 read the sixth column from the database and dropped it on the floor while
 * projecting to a five-field type (§5, R56), which is why `quizGraded` could
 * never be turned off. The contract is derived from the enum
 * (packages/shared/src/notification.ts), so a new type without a key is a compile
 * error rather than a silently unreachable toggle.
 *
 * No row means opted in to everything (R6) — the row is created lazily, on
 * first save, and most users have none (R59).
 */
mePreferencesRouter.get("/notification-preferences", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const row = await db.notificationPreference.findUnique({
    where: { userId: user.userId },
    select: PREFERENCE_SELECT,
  });
  return apiOk(res, { preferences: row ?? DEFAULT_NOTIFICATION_PREFERENCES });
});

/**
 * Replace them. PUT, not PATCH: the body carries every key, so there is no
 * way for a client that has not been updated to leave a new key at its default
 * without saying so.
 *
 * The target row is never an input (R54) — `user.userId` comes from the
 * verified token, so one user cannot write another's preferences no matter
 * what the body says.
 */
mePreferencesRouter.put("/notification-preferences", requireAuth, async (req, res) => {
  const user = requireUser(req);

  const parsed = parseOr400(notificationPreferencesSchema, req.body, res, "Every notification preference is required.");
  if (parsed === null) return;

  const preferences = await db.notificationPreference.upsert({
    where: { userId: user.userId },
    update: parsed,
    create: { userId: user.userId, ...parsed },
    select: PREFERENCE_SELECT,
  });

  return apiOk(res, { preferences });
});
