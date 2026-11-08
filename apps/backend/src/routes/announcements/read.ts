import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiError, apiOk } from "../../lib/api-response";
import { parseId } from "../../lib/parse-id";
import { announcementFlags } from "../../lib/permissions";
import {
  ANNOUNCEMENT_PAGE_ORDER,
  announcementCursorFilter,
  announcementUnreadFilter,
  announcementVisibilityFilter,
  encodeAnnouncementCursor,
} from "../../lib/queries/announcements";
import { requireUser } from "../../middleware/require-auth";
import { ANNOUNCEMENT_PAGE_SIZE } from "../../../../../packages/shared/src/index";
import { ANNOUNCEMENT_SELECT, toDetail, toListItem } from "./serialize";

import type { Prisma } from "../../generated/prisma/client";
import type { SessionUser } from "../../lib/auth/tokens";

/** The unread filter for this viewer, loading the account's age from the database, never the token. */
async function unreadWhereFor(user: SessionUser): Promise<Prisma.AnnouncementWhereInput> {
  const account = await db.user.findUnique({
    where: { id: user.userId },
    select: { createdAt: true },
  });
  // Fail closed: no account row means nothing is unread.
  if (!account) return { id: -1 };
  return announcementUnreadFilter(user, account.createdAt, new Date());
}

async function unreadIdsAmong(user: SessionUser, ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const rows = await db.announcement.findMany({
    where: { AND: [{ id: { in: ids } }, await unreadWhereFor(user)] },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

export async function listFeed(req: Request, res: Response) {
  const user = requireUser(req);
  const rawCursor = req.query.cursor;
  if (rawCursor !== undefined && (typeof rawCursor !== "string" || rawCursor === "")) {
    return apiError(res, "bad_request", "Invalid cursor.", 400);
  }
  const cursorWhere = rawCursor ? announcementCursorFilter(rawCursor as string) : null;
  if (rawCursor && !cursorWhere) return apiError(res, "bad_request", "Invalid cursor.", 400);

  const visible = await announcementVisibilityFilter(user);
  const rows = await db.announcement.findMany({
    where: cursorWhere ? { AND: [visible, cursorWhere] } : visible,
    orderBy: ANNOUNCEMENT_PAGE_ORDER,
    take: ANNOUNCEMENT_PAGE_SIZE + 1,
    select: ANNOUNCEMENT_SELECT,
  });
  const page = rows.slice(0, ANNOUNCEMENT_PAGE_SIZE);
  const last = page[page.length - 1];
  const nextCursor = rows.length > ANNOUNCEMENT_PAGE_SIZE && last ? encodeAnnouncementCursor(last) : null;
  const unread = await unreadIdsAmong(user, page.map((r) => r.id));
  return apiOk(res, {
    items: page.map((r) => toListItem(r, !unread.has(r.id))),
    nextCursor,
  });
}

export async function unreadSummary(req: Request, res: Response) {
  const user = requireUser(req);
  const where = { AND: [await announcementVisibilityFilter(user), await unreadWhereFor(user)] };
  const [count, latest] = await Promise.all([
    db.announcement.count({ where }),
    db.announcement.findFirst({ where, orderBy: ANNOUNCEMENT_PAGE_ORDER, select: ANNOUNCEMENT_SELECT }),
  ]);
  return apiOk(res, { count, latest: latest ? toListItem(latest, false) : null });
}

export async function getOne(req: Request, res: Response) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid post id.", 400);
  const row = await db.announcement.findFirst({
    where: { AND: [{ id }, await announcementVisibilityFilter(user)] },
    select: ANNOUNCEMENT_SELECT,
  });
  // 404, not 403: a post the caller may not read looks like one that isn't there.
  if (!row) return apiError(res, "not_found", "Post not found.", 404);
  const unread = await unreadIdsAmong(user, [row.id]);
  return apiOk(res, toDetail(row, !unread.has(row.id), announcementFlags(user, row)));
}

export async function markRead(req: Request, res: Response) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid post id.", 400);
  const readable = await db.announcement.findFirst({
    where: { AND: [{ id }, await announcementVisibilityFilter(user)] },
    select: { id: true },
  });
  if (!readable) return apiError(res, "not_found", "Post not found.", 404);
  await db.announcementRead.createMany({
    data: [{ announcementId: id, userId: user.userId }],
    skipDuplicates: true,
  });
  return res.status(204).end();
}
