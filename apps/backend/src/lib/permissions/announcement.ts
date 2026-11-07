import { db } from "../../db/client";
import type { SessionUser } from "../auth/tokens";
import { announcementVisibilityFilter } from "../queries/announcements";
import { isSuper } from "../rbac";

/** May this viewer read the post? A post they may not read looks like a missing one. */
export async function canReadAnnouncement(user: SessionUser, id: number): Promise<boolean> {
  const row = await db.announcement.findFirst({
    where: { id, ...(await announcementVisibilityFilter(user)) },
    select: { id: true },
  });
  return row !== null;
}

export interface AnnouncementFlags {
  canEdit: boolean;
  canDelete: boolean;
  seasonFinished: boolean;
}

/**
 * The detail screen's buttons. A season's post is edited by a Super, or by its
 * author while they still admin that season, and never once the season has
 * finished; a Super may still delete a finished season's post. A community
 * post has a Super for author, so Super is its only editor.
 */
export function announcementFlags(
  user: SessionUser,
  row: {
    audience: "COMMUNITY" | "SEASON";
    seasonId: number | null;
    authorId: number | null;
    season: { status: string } | null;
  },
): AnnouncementFlags {
  const seasonFinished = row.season?.status === "COMPLETED" || row.season?.status === "ARCHIVED";
  const isAuthorAdmin =
    row.audience === "SEASON" &&
    row.authorId === user.userId &&
    row.seasonId !== null &&
    user.seasonAdminIds.includes(row.seasonId);
  const canEdit = (isSuper(user) || isAuthorAdmin) && !seasonFinished;
  return { canEdit, canDelete: canEdit || (isSuper(user) && seasonFinished), seasonFinished };
}
