import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import type { SessionUser } from "../auth/tokens";
import { isMentor, isSuper } from "../rbac";
import { seasonParticipant } from "./season-participants";
import { ANNOUNCEMENT_UNREAD_DAYS } from "../../../../../packages/shared/src/index";
import { MS_PER_DAY } from "../org-time";

export const ANNOUNCEMENT_PAGE_ORDER: Prisma.AnnouncementOrderByWithRelationInput[] = [
  { createdAt: "desc" },
  { id: "desc" },
];

/** The seasons a viewer's staff scopes or enrolments reach (live or finished). */
async function readableSeasonIds(user: SessionUser): Promise<number[]> {
  const ids = new Set<number>(user.seasonAdminIds);
  const [groups, enrolments] = await Promise.all([
    user.groupLeaderIds.length > 0
      ? db.group.findMany({
          where: { id: { in: user.groupLeaderIds } },
          select: { seasonId: true },
        })
      : Promise.resolve([]),
    db.seasonEnrollment.findMany({
      where: { studentUserId: user.userId, ...seasonParticipant },
      select: { seasonId: true },
    }),
  ]);
  for (const g of groups) ids.add(g.seasonId);
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
        season: { deletedAt: null },
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
  if (user.groupLeaderIds.length > 0) {
    const groups = await db.group.findMany({
      where: { id: { in: user.groupLeaderIds } },
      select: { seasonId: true },
    });
    for (const g of groups) ids.add(g.seasonId);
  }
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
      season: { status: "ACTIVE", deletedAt: null },
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
