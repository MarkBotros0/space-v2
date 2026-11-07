import type {
  NotificationEntityType,
  NotificationTarget,
} from "../../../../packages/shared/src/index";

/**
 * The one place a stored `Notification.link` becomes a route-independent
 * target (spec D1).
 *
 * Every stored notification carries a v1 role-prefixed web
 * path chosen by the producer, not by the recipient's role (R3) — and the
 * scheme is already broken inside v1, where a mentor holding a GroupLeader row
 * gets a /leader link that bounces them (R4). v2's routes are flat, so the
 * string is meaningless to a device. Notification has no entity columns, so
 * this parses the link instead, one row of NOTIFICATION_LINK_PATTERNS per
 * shape a producer writes.
 *
 * Do NOT let a screen parse the path. One function, one place, one test table.
 */

/** How a pattern's capture group becomes `entityId`. */
type LinkIdKind = "none" | "number" | "publicId";

export const NOTIFICATION_LINK_PATTERNS: readonly {
  re: RegExp;
  entityType: NotificationEntityType;
  id: LinkIdKind;
}[] = [
  // ASSIGNMENT_CREATED, SUBMISSION_REVIEWED (v1 assignment-actions.ts:91, submission-actions.ts:197)
  { re: /^\/student\/assignments\/(\d+)$/, entityType: "assignment", id: "number" },
  // QUIZ_GRADED (v1 quiz-actions.ts:167, :483, :554), QUIZ_PUBLISHED — the list, not a quiz
  { re: /^\/student\/quizzes$/, entityType: "quiz", id: "none" },
  // SESSION_RESCHEDULED (v1 session-actions.ts:167), SESSION_CANCELLED
  { re: /^\/student\/calendar$/, entityType: "calendar", id: "none" },
  // MENTOR_FOLLOWUP, LOW_ATTENDANCE_FLAG (v1 note-actions.ts:84, attendance-notifications.ts:65)
  { re: /^\/admin\/students\/(\d+)$/, entityType: "student", id: "number" },
  // LOW_ATTENDANCE_FLAG to leaders (v1 attendance-notifications.ts:73)
  { re: /^\/leader\/students\/(\d+)$/, entityType: "student", id: "number" },
  // SUBMISSION_RECEIVED (v2-only). v1's leader review page has the same path
  // (jpc-space src/app/leader/submissions/[publicId]), so the mailed web link
  // opens the same submission. Addressed by publicId: every submission route
  // takes it, and newPublicId()'s alphabet is [0-9A-Za-z].
  { re: /^\/leader\/submissions\/([0-9A-Za-z]+)$/, entityType: "submission", id: "publicId" },
  // ANNOUNCEMENT (v2-only): the post's detail screen.
  { re: /^\/news\/(\d+)$/, entityType: "announcement", id: "number" },
];

export function parseNotificationLink(link: string | null): NotificationTarget | null {
  if (!link) return null;
  // Relative paths only: a stored absolute URL is not a route this app owns,
  // and treating it as one would let a link written elsewhere pick a screen.
  if (!link.startsWith("/")) return null;

  const path = link.split("?")[0]?.replace(/\/+$/, "") ?? "";
  const normalised = path === "" ? "/" : path;

  for (const { re, entityType, id } of NOTIFICATION_LINK_PATTERNS) {
    const match = re.exec(normalised);
    if (!match) continue;
    if (entityType === "submission") {
      return id === "publicId" && match[1] ? { entityType, entityId: match[1] } : null;
    }
    return { entityType, entityId: id === "number" ? Number(match[1]) : null };
  }
  return null;
}
