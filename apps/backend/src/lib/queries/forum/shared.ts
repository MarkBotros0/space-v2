import { db } from "../../../db/client";
import { type ForumAudience } from "../../permissions";
import { groupIdInSeason } from "../assignments";

/**
 * The one place a forum author's name is produced.
 *
 * v1 falls back to the author's email address when `name` is blank (spec 14
 * R30), so every student in a group sees the address of any group-mate who has
 * not set a name. These are young people's addresses, and `email` is not
 * selected anywhere in this module precisely so the fallback cannot come back.
 */
export function displayNameFor(name: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : "Group member";
}

interface ForumAssignmentRow {
  id: number;
  seasonId: number;
  dueAt: Date | null;
  forumMinWords: number | null;
  forumAllowComments: boolean;
  forumPostToRead: boolean;
}

/**
 * The one existence check for the forum surface. `type: "FORUM"` in the where
 * is what makes every forum endpoint refuse a standard assignment (404) rather
 * than serve an empty thread — and because routes call this before
 * `forumAudienceFor`, the answer is 404 for every caller, never a 403 that
 * depends on who is asking.
 */
export async function loadForumAssignment(assignmentId: number): Promise<ForumAssignmentRow | null> {
  return db.assignment.findFirst({
    where: { id: assignmentId, deletedAt: null, type: "FORUM" },
    select: {
      id: true,
      seasonId: true,
      dueAt: true,
      forumMinWords: true,
      forumAllowComments: true,
      forumPostToRead: true,
    },
  });
}

/**
 * Is this post's author inside the audience the caller was granted? The feed
 * scopes by group; the comments read must too, or a publicId (unguessable, but
 * still a bearer of nothing) would be enough to read another group's thread.
 */
export async function postInAudience(
  audience: ForumAudience,
  seasonId: number,
  authorUserId: number,
): Promise<boolean> {
  if (audience.kind === "staff" && audience.groupIds === null) return true;
  const authorGroup = await groupIdInSeason(authorUserId, seasonId);
  if (authorGroup === null) return false;
  return audience.kind === "student"
    ? audience.groupId === authorGroup
    : (audience.groupIds ?? []).includes(authorGroup);
}
