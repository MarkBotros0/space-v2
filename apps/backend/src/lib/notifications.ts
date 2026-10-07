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
  /** Rows written. One per distinct recipient, always — see below. */
  written: number;
  /** Recipients whose *outbound* channels were suppressed by their preference. */
  suppressed: number;
}

/**
 * Fan out one notification to many recipients.
 *
 * Divergence from v1, ruled in spec D4: the in-app row is the user's history
 * and is **always** written. v1 filtered opted-out recipients out before the
 * insert (R8), so "off" meant "no record" — a user who only wanted the emails
 * to stop had to give up their inbox too, and with push arriving that single
 * boolean would be governing three channels. Here the preference governs
 * outbound channels only: email now, push at cutover.
 *
 * Consequence, accepted deliberately: v1 renders the same table with no
 * preference filter, so an opted-out user's v1 inbox stops being empty.
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
  const targets = [...new Set(userIds)];
  if (targets.length === 0) return { written: 0, suppressed: 0 };

  const prefs = await db.notificationPreference.findMany({
    where: { userId: { in: targets } },
  });
  const prefField = PREF_FIELD[payload.type];
  // A user with no preference row has not opted out — defaults are all true
  // (R6). Only the literal `false` suppresses (R7).
  const optedOut = new Set(prefs.filter((p) => p[prefField] === false).map((p) => p.userId));

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

  const mailTargets = targets.filter((id) => !optedOut.has(id));
  if (mailTargets.length > 0) {
    const users = await db.user.findMany({
      where: { id: { in: mailTargets } },
      select: { email: true },
    });
    // Fire-and-forget: mail must never delay or fail the request that
    // triggered it. allSettled so one bad address cannot reject the batch.
    void Promise.allSettled(
      users.map((u) =>
        sendNotificationEmail(u.email, payload.title, payload.body ?? null, payload.link ?? null),
      ),
    );
  }

  return { written: targets.length, suppressed: optedOut.size };
}
