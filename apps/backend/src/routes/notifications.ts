// apps/backend/src/routes/notifications.ts
import { Router } from "express";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { parseNotificationLink } from "../lib/notification-target";
import { requireAuth, requireUser } from "../middleware/require-auth";
import {
  markReadRequestSchema,
  notificationListQuerySchema,
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
 * Ordered by `id` desc rather than v1's `createdAt` desc: a fan-out written by
 * one `createMany` gives every row the same `createdAt` (R18), which makes a
 * createdAt cursor ambiguous exactly where the pages are densest. Insertion
 * order is the same order for every row that matters and it is unique.
 *
 * This endpoint writes nothing. v1 never marked on render either (R48, R49) —
 * but v2's client refetches on mount, on focus and on reconnect, so if it did,
 * every return to the app would be a write. Ruling C6.
 */
notificationsRouter.get("/", async (req, res) => {
  const user = requireUser(req);

  const parsed = notificationListQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid query.", 400);
  const { cursor, limit, unreadOnly } = parsed.data;

  const where = { userId: user.userId, ...(unreadOnly ? { readAt: null } : {}) };

  // One extra row tells us whether another page exists without a second count
  // query — the same shape as the submissions queue.
  const rows = await db.notification.findMany({
    where,
    orderBy: { id: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: LIST_SELECT,
  });

  const page = rows.slice(0, limit);

  // A real count, not a filter over the page: v1 counted unread by filtering
  // the 100 rows it had already fetched, so past 100 the header silently
  // understated (R37). Indexed by @@index([userId, readAt]).
  const unreadCount = await db.notification.count({
    where: { userId: user.userId, readAt: null },
  });

  return apiOk(res, {
    items: page.map(toWire),
    nextCursor: rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
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
 * Mark read — the explicit write.
 *
 * One endpoint, not v1's two: its single-id action was exported and never
 * called (R47), and ruling C12 says unreachable code is not a specification.
 *
 * The `userId` clause is the whole security model here. `ids` is
 * client-supplied and is NOT an ownership assertion — a forged id updates zero
 * rows only because the `where` narrows it (R43, spec §4). Never reduce this
 * to `updateMany({ where: { id: { in: ids } } })`.
 *
 * `readAt: null` keeps repeats free and keeps `readAt` stable once set (R44),
 * which is what makes the client's debounced batching safe.
 */
notificationsRouter.post("/read", async (req, res) => {
  const user = requireUser(req);

  const parsed = markReadRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid mark-read body.", 400);
  const body = parsed.data;

  const result = await db.notification.updateMany({
    where: {
      userId: user.userId,
      readAt: null,
      ...("ids" in body ? { id: { in: body.ids } } : {}),
    },
    data: { readAt: new Date() },
  });

  return apiOk(res, { marked: result.count });
});
