import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiError, apiOk, apiNoContent } from "../../lib/api-response";

import { announcementFlags } from "../../lib/permissions";
import {
  ANNOUNCEMENT_PAGE_ORDER,
  ANNOUNCEMENT_SELECT,
  findReadableAnnouncement,
  announcementCursorFilter,
  announcementUnreadFilter,
  announcementVisibilityFilter,
  encodeAnnouncementCursor,
} from "../../lib/queries/announcements";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";
import { pageOf } from "../../lib/pagination";
import { requireUser } from "../../middleware/require-auth";
import { ANNOUNCEMENT_PAGE_SIZE } from "../../../../../packages/shared/src/index";
import { loadPollView } from "./poll-serialize";
import { toDetail, toListItem } from "./serialize";

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

export async function unreadIdsAmong(user: SessionUser, ids: number[]): Promise<Set<number>> {
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
  const { page, nextCursor } = pageOf(rows, ANNOUNCEMENT_PAGE_SIZE, encodeAnnouncementCursor);
  const unread = await unreadIdsAmong(
    user,
    page.map((r) => r.id),
  );
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
  const id = idParam(res, req.params.id, "post");
  if (id === null) return;
  const row = await findReadableAnnouncement(user, id);
  // 404, not 403: a post the caller may not read looks like one that isn't there.
  if (!row) return notFound(res, "Post");
  const unread = await unreadIdsAmong(user, [row.id]);
  return apiOk(res, toDetail(row, !unread.has(row.id), announcementFlags(user, row), await loadPollView(user, row)));
}

export async function markRead(req: Request, res: Response) {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "post");
  if (id === null) return;
  const readable = await findReadableAnnouncement(user, id);
  if (!readable) return notFound(res, "Post");
  await db.announcementRead.createMany({
    data: [{ announcementId: id, userId: user.userId }],
    skipDuplicates: true,
  });
  return apiNoContent(res);
}
