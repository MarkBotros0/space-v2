import type {
  NotificationEntityType,
  NotificationTarget,
} from "../../../../packages/shared/src/index";

/**
 * The one place a stored `Notification.link` becomes a route-independent
 * target (spec D1).
 *
 * Every notification in the shared database carries a v1 role-prefixed web
 * path chosen by the producer, not by the recipient's role (R3) — and the
 * scheme is already broken inside v1, where a mentor holding a GroupLeader row
 * gets a /leader link that bounces them (R4). v2's routes are flat, so the
 * string is meaningless to a device. The clean fix is two columns; the schema
 * is frozen (C1), so this parses instead, and Plan 18's M4 backfills the
 * columns with SQL that mirrors NOTIFICATION_LINK_PATTERNS one row per entry.
 *
 * Do NOT let a screen parse the path. One function, one place, one test table.
 */
export const NOTIFICATION_LINK_PATTERNS: readonly {
  re: RegExp;
  entityType: NotificationEntityType;
  hasId: boolean;
}[] = [
  // ASSIGNMENT_CREATED, SUBMISSION_REVIEWED (v1 assignment-actions.ts:91, submission-actions.ts:197)
  { re: /^\/student\/assignments\/(\d+)$/, entityType: "assignment", hasId: true },
  // QUIZ_GRADED (v1 quiz-actions.ts:167, :483, :554) — the list, not a quiz
  { re: /^\/student\/quizzes$/, entityType: "quiz", hasId: false },
  // SESSION_RESCHEDULED (v1 session-actions.ts:167)
  { re: /^\/student\/calendar$/, entityType: "calendar", hasId: false },
  // MENTOR_FOLLOWUP, LOW_ATTENDANCE_FLAG (v1 note-actions.ts:84, attendance-notifications.ts:65)
  { re: /^\/admin\/students\/(\d+)$/, entityType: "student", hasId: true },
  // LOW_ATTENDANCE_FLAG to leaders (v1 attendance-notifications.ts:73)
  { re: /^\/leader\/students\/(\d+)$/, entityType: "student", hasId: true },
];

export function parseNotificationLink(link: string | null): NotificationTarget | null {
  if (!link) return null;
  // Relative paths only: a stored absolute URL is not a route this app owns,
  // and treating it as one would let a link written elsewhere pick a screen.
  if (!link.startsWith("/")) return null;

  const path = link.split("?")[0]?.replace(/\/+$/, "") ?? "";
  const normalised = path === "" ? "/" : path;

  for (const { re, entityType, hasId } of NOTIFICATION_LINK_PATTERNS) {
    const match = re.exec(normalised);
    if (match) return { entityType, entityId: hasId ? Number(match[1]) : null };
  }
  return null;
}
