import type { NotificationTarget } from "@space/shared";

/**
 * A notification's target → a route in this app.
 *
 * The server derives `target` from the stored v1 path in one place
 * (apps/backend/src/lib/notification-target.ts, spec D1); this is the other
 * half — one switch, one place, no screen parsing anything. Every arm points
 * at a route file that exists by this plan (Plan 1's assignment/[id], now
 * assignment/[id]/index.tsx via Plan 5; Plan 7's student/[id], now
 * student/[id]/index.tsx via Plan 10); typed routes make a missing one a
 * compile error.
 *
 * The `student` arm has no list fallback: every v1 student link carries an id
 * (/admin|leader/students/:id), so entityId is never null for it. The switch
 * still falls back to the roster rather than asserting, so a future null
 * cannot crash the inbox.
 */
export type NotificationRoute =
  | { pathname: "/assignment/[id]"; params: { id: string } }
  | { pathname: "/assignments" }
  | { pathname: "/quizzes" }
  | { pathname: "/calendar" }
  | { pathname: "/student/[id]"; params: { id: string } }
  | { pathname: "/students" };

export function routeForTarget(target: NotificationTarget | null): NotificationRoute | null {
  if (!target) return null;

  switch (target.entityType) {
    case "assignment":
      return target.entityId === null
        ? { pathname: "/assignments" }
        : { pathname: "/assignment/[id]", params: { id: String(target.entityId) } };
    case "quiz":
      return { pathname: "/quizzes" };
    case "calendar":
      return { pathname: "/calendar" };
    case "student":
      return target.entityId === null
        ? { pathname: "/students" }
        : { pathname: "/student/[id]", params: { id: String(target.entityId) } };
  }
}
