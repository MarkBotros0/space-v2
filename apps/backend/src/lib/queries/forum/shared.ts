import { db } from "../../../db/client";
import { type ForumAudience } from "../../permissions";
import { groupIdInSeason } from "../assignments";
import { liveAssignment } from "../../db/live";

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

/** A FORUM part with what the forum surface needs of it and its assignment. */
export interface ForumPartRow {
  id: number;
  assignmentId: number;
  seasonId: number;
  dueAt: Date | null;
  prompt: string;
  minWords: number | null;
  allowComments: boolean;
  postToRead: boolean;
}

/**
 * The one existence check for the forum surface: the part must be the FORUM
 * part of this live assignment. That is what makes every forum endpoint refuse
 * an essay or video part, or a part named under another assignment (404),
 * rather than serve an empty thread — and because routes call this before
 * `forumAudienceFor`, the answer is 404 for every caller, never a 403 that
 * depends on who is asking.
 */
export async function loadForumPart(assignmentId: number, partId: number): Promise<ForumPartRow | null> {
  const part = await db.assignmentPart.findFirst({
    where: { id: partId, assignmentId, kind: "FORUM", assignment: liveAssignment },
    select: {
      id: true,
      prompt: true,
      minWords: true,
      allowComments: true,
      postToRead: true,
      assignment: { select: { seasonId: true, dueAt: true } },
    },
  });
  if (!part) return null;
  return {
    id: part.id,
    assignmentId,
    seasonId: part.assignment.seasonId,
    dueAt: part.assignment.dueAt,
    prompt: part.prompt ?? "",
    minWords: part.minWords,
    allowComments: part.allowComments,
    postToRead: part.postToRead,
  };
}

/** The caller's own forum work on this part, if any (looked up by caller, never by a client id, R3). */
export function ownForumWork(partId: number, studentUserId: number) {
  return db.assignmentPartWork.findUnique({
    where: { partId_studentUserId: { partId, studentUserId } },
    select: { publicId: true, text: true, status: true },
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
