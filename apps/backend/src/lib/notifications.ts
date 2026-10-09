import { db } from "../db/client";
import type { NotificationType } from "../generated/prisma/enums";

import { sendNotificationEmail } from "./email";

export interface CreateNotificationInput {
  userId: number;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}

/**
 * NotificationType → the matching Boolean column on NotificationPreference.
 * Typed as a full Record so adding a NotificationType without a preference
 * column is a compile error rather than a silent opt-out failure.
 */
const PREF_FIELD = {
  ASSIGNMENT_CREATED: "assignmentCreated",
  SUBMISSION_REVIEWED: "submissionReviewed",
  SESSION_RESCHEDULED: "sessionRescheduled",
  LOW_ATTENDANCE_FLAG: "lowAttendanceFlag",
  MENTOR_FOLLOWUP: "mentorFollowup",
  QUIZ_GRADED: "quizGraded",
} as const satisfies Record<NotificationType, string>;

export interface BulkNotificationResult {
  /** Rows written. One per distinct recipient who has not opted out. */
  written: number;
  /** Recipients skipped entirely (no row, no email) by their preference. */
  suppressed: number;
}

/**
 * Fan out one notification to many recipients.
 *
 * v1 semantics (jpc-space src/lib/notifications.ts:56-94, spec R8/R9/R11): an
 * opted-out recipient is filtered out **before** the insert, so the one
 * preference switch governs every channel — no in-app row, no email. If every
 * recipient opted out, nothing is written.
 *
 * Returns counts because v1 returned void and the caller could not learn what
 * happened (§6); domain 3's session write response needs the number
 * (`03-sessions.md` R17).
 */
export async function createNotificationsBulk(
  userIds: number[],
  payload: Omit<CreateNotificationInput, "userId">,
): Promise<BulkNotificationResult> {
  // Deduped: producers resolve recipients from more than one join table
  // (attendance-notifications.ts reads GroupLeader and SeasonAdmin), and
  // createMany has no skipDuplicates and no constraint to trip (R15).
  const recipients = [...new Set(userIds)];
  if (recipients.length === 0) return { written: 0, suppressed: 0 };

  const prefs = await db.notificationPreference.findMany({
    where: { userId: { in: recipients } },
  });
  const prefField = PREF_FIELD[payload.type];
  // A user with no preference row has not opted out — defaults are all true
  // (R6). Only the literal `false` suppresses (R7).
  const optedOut = new Set(prefs.filter((p) => p[prefField] === false).map((p) => p.userId));
  // v1 (notifications.ts:74-75): opted-out users are dropped before the insert.
  const targets = recipients.filter((id) => !optedOut.has(id));
  if (targets.length === 0) return { written: 0, suppressed: optedOut.size };

  await db.notification.createMany({
    data: targets.map((userId) => ({
      userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      // Keep writing v1's path verbatim: v1 is still in production against
      // this database and a notification it cannot open is a broken link for
      // real users. The route-independent target is derived on read
      // (lib/notification-target.ts). Spec D1.
      link: payload.link,
    })),
  });

  const users = await db.user.findMany({
    where: { id: { in: targets } },
    select: { email: true },
  });
  // Fire-and-forget: mail must never delay or fail the request that
  // triggered it. allSettled so one bad address cannot reject the batch.
  void Promise.allSettled(
    users.map((u) =>
      sendNotificationEmail(u.email, payload.title, payload.body ?? null, payload.link ?? null),
    ),
  );

  return { written: targets.length, suppressed: optedOut.size };
}
