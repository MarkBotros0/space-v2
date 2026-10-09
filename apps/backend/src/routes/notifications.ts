// apps/backend/src/routes/notifications.ts
import { Router } from "express";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { parseNotificationLink } from "../lib/notification-target";
import { requireAuth, requireUser } from "../middleware/require-auth";
import {
  markReadRequestSchema,
  NOTIFICATION_INBOX_LIMIT,
} from "../../../../packages/shared/src/index";

export const notificationsRouter = Router();

// Allowed by ruling X5: this router owns /api/v1/notifications outright, so a
// router-level requireAuth cannot turn another router's unknown path into 401.
notificationsRouter.use(requireAuth);

const LIST_SELECT = {
  id: true,
  type: true,
  title: true,
  body: true,
  link: true,
  readAt: true,
  createdAt: true,
} as const;

type Row = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
};

function toWire(row: Row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    // Derived here, once, never on a client (spec D1).
    target: parseNotificationLink(row.link),
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The caller's own inbox.
 *
 * Everything in this domain is self-service (spec §4): `userId` comes from the
 * verified token and appears in the `where` clause itself, never as a filter
 * applied after the rows are fetched and never as a request parameter. Ruling
 * C8.
 *
 * v1's list (notifications-page.tsx:14-27; R33, R39): the newest 100 rows,
 * createdAt desc, one list, no cursor and no read-state filter. `id` desc is
 * the tie-break for a fan-out written by one `createMany` (same createdAt, R18).
 *
 * This endpoint writes nothing. v1 never marked on render either (R48, R49) —
 * but v2's client refetches on mount, on focus and on reconnect, so if it did,
 * every return to the app would be a write. Ruling C6.
 */
notificationsRouter.get("/", async (req, res) => {
  const user = requireUser(req);

  const rows = await db.notification.findMany({
    where: { userId: user.userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: NOTIFICATION_INBOX_LIMIT,
    select: LIST_SELECT,
  });

  // A real count, not a filter over the page: v1 counted unread by filtering
  // the 100 rows it had already fetched, so past 100 the header silently
  // understated (R37). Indexed by @@index([userId, readAt]).
  const unreadCount = await db.notification.count({
    where: { userId: user.userId, readAt: null },
  });

  return apiOk(res, {
    items: rows.map(toWire),
    unreadCount,
  });
});

/**
 * The badge's endpoint.
 *
 * Separate from the list so rendering a number never fetches 20 rows. v1 paid
 * for both on every authenticated page render, for every role, whether or not
 * the bell was ever opened (R36) — and this count must not ride on `GET /me`,
 * which the client caches as session identity (spec D11).
 */
notificationsRouter.get("/unread-count", async (req, res) => {
  const user = requireUser(req);
  const unreadCount = await db.notification.count({
    where: { userId: user.userId, readAt: null },
  });
  return apiOk(res, { unreadCount });
});

/**
 * Mark all read — the explicit write, and the only one (v1
 * notification-actions.ts:8-12). v1's single-id action was exported and never
 * called (R47) and opening a notification leaves it unread (R48), so there is
 * no `ids` form.
 *
 * The `userId` clause is the whole security model here (R43, spec §4).
 * `readAt: null` keeps repeats free and keeps `readAt` stable once set (R44).
 */
notificationsRouter.post("/read", async (req, res) => {
  const user = requireUser(req);

  const parsed = markReadRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid mark-read body.", 400);
  const result = await db.notification.updateMany({
    where: {
      userId: user.userId,
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  return apiOk(res, { marked: result.count });
});
