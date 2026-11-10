import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import type { SessionUser } from "../auth/tokens";
import { isMentor, isSuper } from "../rbac";
import { seasonParticipant } from "./season-participants";
import { ANNOUNCEMENT_UNREAD_DAYS } from "../../../../../packages/shared/src/index";
import { MS_PER_DAY } from "../org-time";
import { liveSeason } from "../db/live";
import { ledGroupSeasonIds } from "./led-groups";

export const ANNOUNCEMENT_PAGE_ORDER: Prisma.AnnouncementOrderByWithRelationInput[] = [
  { createdAt: "desc" },
  { id: "desc" },
];

/** The seasons a viewer's staff scopes or enrolments reach (live or finished). */
async function readableSeasonIds(user: SessionUser): Promise<number[]> {
  const ids = new Set<number>(user.seasonAdminIds);
  const [ledSeasonIds, enrolments] = await Promise.all([
    ledGroupSeasonIds(user),
    db.seasonEnrollment.findMany({
      where: { studentUserId: user.userId, ...seasonParticipant },
      select: { seasonId: true },
    }),
  ]);
  for (const id of ledSeasonIds) ids.add(id);
  for (const e of enrolments) ids.add(e.seasonId);
  return [...ids];
}

/**
 * "May read". SUPER reads everything. A mentor reads community posts only
 * (nothing season-shaped). Everyone else reads community posts plus the posts
 * of every season they are a participant, admin or leader of; a soft-deleted
 * season's posts are hidden.
 */
export async function announcementVisibilityFilter(user: SessionUser): Promise<Prisma.AnnouncementWhereInput> {
  if (isSuper(user)) return {};
  const branches: Prisma.AnnouncementWhereInput[] = [{ audience: "COMMUNITY" }];
  if (!isMentor(user)) {
    const seasonIds = await readableSeasonIds(user);
    if (seasonIds.length > 0) {
      branches.push({
        audience: "SEASON",
        seasonId: { in: seasonIds },
        season: liveSeason,
      });
    }
  }
  return { OR: branches };
}

/** The seasons the user is live in: serving or enrolled, in an ACTIVE season. */
async function liveSeasonIds(user: SessionUser): Promise<number[]> {
  if (isSuper(user) || isMentor(user)) return [];
  const ids = new Set<number>(user.seasonAdminIds);
  if (user.activeSeasonId != null) ids.add(user.activeSeasonId);
  for (const id of await ledGroupSeasonIds(user)) ids.add(id);
  return [...ids];
}

/**
 * "Unread" is narrower than "may read": addressed to the user (community, or a
 * season they are live in), newer than their account and within 30 days, not
 * their own post, and not yet read. The caller ANDs it with the visibility filter.
 */
export async function announcementUnreadFilter(
  user: SessionUser,
  userCreatedAt: Date,
  now: Date,
): Promise<Prisma.AnnouncementWhereInput> {
  const windowStart = new Date(now.getTime() - ANNOUNCEMENT_UNREAD_DAYS * MS_PER_DAY);
  const since = userCreatedAt > windowStart ? userCreatedAt : windowStart;
  const live = await liveSeasonIds(user);
  const addressed: Prisma.AnnouncementWhereInput[] = [{ audience: "COMMUNITY" }];
  if (live.length > 0) {
    addressed.push({
      audience: "SEASON",
      seasonId: { in: live },
      season: { status: "ACTIVE", ...liveSeason },
    });
  }
  return {
    AND: [
      { createdAt: { gt: since } },
      { reads: { none: { userId: user.userId } } },
      { OR: [{ authorId: null }, { authorId: { not: user.userId } }] },
      { OR: addressed },
    ],
  };
}

export function encodeAnnouncementCursor(row: { createdAt: Date; id: number }): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString("base64url");
}

/** Null when the cursor is not one this module wrote. */
export function announcementCursorFilter(cursor: string): Prisma.AnnouncementWhereInput | null {
  const [iso, rawId, ...rest] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  const createdAt = iso ? new Date(iso) : null;
  const id = Number(rawId);
  if (rest.length > 0 || !createdAt || Number.isNaN(createdAt.getTime())) return null;
  if (!Number.isInteger(id) || id <= 0) return null;
  return { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] };
}

/** What every announcement read selects; serialize.ts turns it into the wire shapes. */
export const ANNOUNCEMENT_SELECT = {
  id: true,
  audience: true,
  seasonId: true,
  body: true,
  authorId: true,
  createdAt: true,
  editedAt: true,
  season: { select: { title: true, status: true } },
  author: { select: { name: true, deletedAt: true } },
  poll: { select: { closedAt: true } },
} as const;

export interface AnnouncementRow {
  id: number;
  audience: "COMMUNITY" | "SEASON";
  seasonId: number | null;
  body: string;
  authorId: number | null;
  createdAt: Date;
  editedAt: Date | null;
  season: { title: string; status: string } | null;
  author: { name: string; deletedAt: Date | null } | null;
  poll: { closedAt: Date | null } | null;
}

/**
 * A post the caller may read, with ANNOUNCEMENT_SELECT, or null. The unknown and
 * the invisible look alike, so callers answer both with 404, never 403.
 */
export async function findReadableAnnouncement(user: SessionUser, id: number): Promise<AnnouncementRow | null> {
  return db.announcement.findFirst({
    where: { AND: [{ id }, await announcementVisibilityFilter(user)] },
    select: ANNOUNCEMENT_SELECT,
  });
}
