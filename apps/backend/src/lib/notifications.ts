import { db } from "../db/client";
import type { NotificationType } from "../generated/prisma/enums";
import { pushContent, shouldPush } from "../../../../packages/shared/src/index";

import { runInBackground } from "./background";
import { parseNotificationLink } from "./notification-target";
import { sendPushToUsers } from "./push";

interface CreateNotificationInput {
  userId: number;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}

/**
 * NotificationType → the matching Boolean column on NotificationPreference.
 * Typed as a full Record so adding a NotificationType without a preference
 * column is a compile error rather than a silent opt-out failure. Two types
 * may share a column (ASSIGNMENT_REMINDER answers to `assignmentCreated`).
 */
const PREF_FIELD = {
  ASSIGNMENT_CREATED: "assignmentCreated",
  SUBMISSION_REVIEWED: "submissionReviewed",
  SESSION_RESCHEDULED: "sessionRescheduled",
  LOW_ATTENDANCE_FLAG: "lowAttendanceFlag",
  MENTOR_FOLLOWUP: "mentorFollowup",
  QUIZ_GRADED: "quizGraded",
  QUIZ_PUBLISHED: "quizPublished",
  SUBMISSION_RECEIVED: "submissionReceived",
  SESSION_CANCELLED: "sessionCancelled",
  ANNOUNCEMENT: "announcement",
  // Shares the assignments setting: no column of its own.
  ASSIGNMENT_REMINDER: "assignmentCreated",
} as const satisfies Record<NotificationType, string>;

interface BulkNotificationResult {
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
 * to stop had to give up their inbox too, and with push that single boolean
 * would govern three channels. Here the preference governs the outbound
 * channel only: push. (Notification emails were removed, owner 2026-11-07:
 * notifications reach people in the app's inbox and by push, never by email.)
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
      // Keep writing v1's path verbatim: every stored row, old and new, uses
      // those shapes, and the route-independent target is derived from them
      // on read (lib/notification-target.ts). Spec D1.
      link: payload.link,
    })),
  });

  // A type the user turned off stops push (spec D4). Only devices that
  // registered a token are reached.
  const pushTargets = targets.filter((id) => !optedOut.has(id));
  if (pushTargets.length > 0 && shouldPush(payload.type)) {
    runInBackground(
      "notification-push",
      sendPushToUsers(pushTargets, {
        ...pushContent(payload.type, payload.title, payload.body ?? null),
        data: { type: payload.type, target: parseNotificationLink(payload.link ?? null) },
      }),
    );
  }

  return { written: targets.length, suppressed: optedOut.size };
}
