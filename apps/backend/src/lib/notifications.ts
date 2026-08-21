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

export async function createNotificationsBulk(
  userIds: number[],
  payload: Omit<CreateNotificationInput, "userId">,
): Promise<void> {
  if (userIds.length === 0) return;

  const prefs = await db.notificationPreference.findMany({
    where: { userId: { in: userIds } },
  });
  const prefField = PREF_FIELD[payload.type];
  // A user with no preference row has not opted out — defaults are all true.
  const optedOut = new Set(prefs.filter((p) => p[prefField] === false).map((p) => p.userId));
  const targets = userIds.filter((id) => !optedOut.has(id));
  if (targets.length === 0) return;

  await db.notification.createMany({
    data: targets.map((userId) => ({
      userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      link: payload.link,
    })),
  });

  const users = await db.user.findMany({
    where: { id: { in: targets } },
    select: { email: true },
  });
  // Fire-and-forget: mail must never delay or fail the request that triggered
  // it. allSettled so one bad address cannot reject the batch.
  void Promise.allSettled(
    users.map((u) =>
      sendNotificationEmail(u.email, payload.title, payload.body ?? null, payload.link ?? null),
    ),
  );
}
