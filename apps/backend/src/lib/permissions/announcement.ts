import { db } from "../../db/client";
import type { SessionUser } from "../auth/tokens";
import { isAdminOfSeason, isSuper } from "../rbac";
import { isSeasonFinished } from "../seasons/status";

export interface AnnouncementFlags {
  canEdit: boolean;
  canDelete: boolean;
  seasonFinished: boolean;
}

export interface AnnouncementRowForAuth {
  audience: "COMMUNITY" | "SEASON";
  seasonId: number | null;
  authorId: number | null;
  season: { status: string } | null;
}

export function isFinished(row: AnnouncementRowForAuth): boolean {
  return isSeasonFinished(row.season?.status);
}

/** Super, or the author while they still admin the post's season. A community post is Super-only. */
function isOwnerOrSuper(user: SessionUser, row: AnnouncementRowForAuth): boolean {
  if (isSuper(user)) return true;
  return (
    row.audience === "SEASON" &&
    row.seasonId !== null &&
    row.authorId === user.userId &&
    isAdminOfSeason(user, row.seasonId)
  );
}

/** Nobody edits a finished season's post, a Super included. */
export function canEditAnnouncement(user: SessionUser, row: AnnouncementRowForAuth): boolean {
  return !isFinished(row) && isOwnerOrSuper(user, row);
}

/** As edit, except a Super may still delete a finished season's post (owner, 2026-11-07). */
export function canDeleteAnnouncement(user: SessionUser, row: AnnouncementRowForAuth): boolean {
  return isFinished(row) ? isSuper(user) : isOwnerOrSuper(user, row);
}

/** The detail screen's buttons, derived from the same predicates PATCH and DELETE use. */
export function announcementFlags(user: SessionUser, row: AnnouncementRowForAuth): AnnouncementFlags {
  return {
    canEdit: canEditAnnouncement(user, row),
    canDelete: canDeleteAnnouncement(user, row),
    seasonFinished: isFinished(row),
  };
}

export interface PostTarget {
  audience: "COMMUNITY" | "SEASON";
  seasonId?: number;
}
export type PostVerdict = "ok" | "forbidden" | "season_draft" | "season_finished" | "not_found";

/**
 * May this user post to the target? Permission comes before the season's
 * status, so an outsider never learns whether a season is a draft.
 */
export async function canPostTo(user: SessionUser, target: PostTarget): Promise<PostVerdict> {
  if (target.audience === "COMMUNITY") return isSuper(user) ? "ok" : "forbidden";
  if (target.seasonId === undefined) return "not_found";
  const season = await db.season.findFirst({
    where: { id: target.seasonId, deletedAt: null },
    select: { status: true },
  });
  if (!season) return "not_found";
  if (!isAdminOfSeason(user, target.seasonId)) return "forbidden";
  if (season.status === "DRAFT") return "season_draft";
  if (season.status !== "ACTIVE") return "season_finished";
  return "ok";
}

/** Where this user may post: a Super the community and every active season, an admin their active seasons. */
export async function postTargetsFor(
  user: SessionUser,
): Promise<{ community: boolean; seasons: { id: number; code: string; title: string }[] }> {
  const community = isSuper(user);
  const ids = user.seasonAdminIds;
  if (!community && (user.role === "MENTOR" || ids.length === 0)) return { community, seasons: [] };
  const seasons = await db.season.findMany({
    where: { status: "ACTIVE", deletedAt: null, ...(community ? {} : { id: { in: ids } }) },
    orderBy: { id: "asc" },
    select: { id: true, code: true, title: true },
  });
  return { community, seasons };
}
