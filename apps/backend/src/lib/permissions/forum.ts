import { db } from "../../db/client";
import type { SessionUser } from "../auth/tokens";
import { groupIdInSeason } from "../queries/enrollment";
import { isAdminOfSeason, isLeaderOfGroup, isMentor, isSuper } from "../rbac";
import { hasActiveEnrollment, staffScopeForSeason } from "./season";
import { leadsStudentInSeason } from "./submission";
import { liveAssignment } from "../db/live";

/**
 * Who may comment on a forum post (a FORUM part's work).
 *
 * v1's `canCommentOnForumSubmission` is the one gate in domain 14 that would
 * have survived an API — it re-reads the target, re-checks the type and the
 * flag, and compares live group membership. Two changes:
 *
 *  1. Membership resolves through `SeasonEnrollment`, not `GroupStudent`
 *     (ruling C9). Before Plan 18 M1 `GroupStudent` was global and answered
 *     "what group is this student in now" — the wrong question for an
 *     assignment in a season they may since have left.
 *  2. LEADER is admitted for groups they lead (spec 14 §10 D3). In v1 both
 *     LEADER and MENTOR fall through to `return false`, so a leader cannot
 *     participate in — or moderate — the discussion of their own group. That is
 *     an omission by missing `if`, not a policy. MENTOR stays read-only.
 *
 * Also new: a DRAFT target is refused. v1 read only `assignmentId` from the
 * target row, so a group-mate's unposted draft was a valid comment target for
 * anyone who could name its sequential id (spec 14 R43).
 *
 * The target is a work row: it must be the post on a FORUM part (an essay or a
 * video is never a comment target) of a live assignment, on a part whose
 * comments are on.
 */
export async function canCommentOnForumPost(user: SessionUser, workId: number): Promise<boolean> {
  const post = await db.assignmentPartWork.findFirst({
    where: { id: workId, part: { kind: "FORUM", assignment: liveAssignment } },
    select: {
      studentUserId: true,
      status: true,
      part: { select: { allowComments: true, assignment: { select: { seasonId: true } } } },
    },
  });
  if (!post) return false;
  if (!post.part.allowComments) return false;
  if (post.status === "DRAFT") return false;
  const seasonId = post.part.assignment.seasonId;

  if (isSuper(user)) return true;
  if (isAdminOfSeason(user, seasonId)) return true;

  const authorGroupId = await groupIdInSeason(post.studentUserId, seasonId);
  if (authorGroupId === null) return false;

  if (user.role === "LEADER") return isLeaderOfGroup(user, authorGroupId);
  if (user.role === "STUDENT") {
    // A finished season is locked: group membership survives End and
    // withdrawal, so the place in the season must still be live.
    if (!(await hasActiveEnrollment(user, seasonId))) return false;
    const mine = await groupIdInSeason(user.userId, seasonId);
    return mine !== null && mine === authorGroupId;
  }
  return false;
}

/**
 * Who may remove a comment.
 *
 * v1: the author, SUPER, or an ADMIN of the assignment's season — but the
 * delete control renders only for the viewer's own comments and no staff screen
 * shows a thread at all, so the staff half of that rule has never been
 * exercisable (spec 14 R49/R52/R53). LEADER is added for the same reason as
 * above. The post's own author is NOT admitted for someone else's comment:
 * owning a thread is not moderating it.
 */
export async function canDeleteForumComment(user: SessionUser, commentId: number): Promise<boolean> {
  const comment = await db.forumComment.findUnique({
    where: { id: commentId },
    select: {
      authorUserId: true,
      partWork: {
        select: { studentUserId: true, part: { select: { assignment: { select: { seasonId: true } } } } },
      },
    },
  });
  if (!comment) return false;
  const post = comment.partWork;
  const ctx = await commentDeleteCtx(user, post.part.assignment.seasonId, post.studentUserId);
  return canDeleteLoadedComment(user, comment, ctx);
}

/**
 * What canDeleteLoadedComment needs beyond the comment itself. It is the same
 * for every comment under one post, so a list builds it once per post instead
 * of re-reading each comment (refactor BE-071). Each fact is read only for the
 * role whose rule needs it.
 */
export interface CommentDeleteCtx {
  seasonId: number;
  /** A student's place in the season is live (only read for a STUDENT). */
  liveStudent: boolean;
  /** The caller leads the post's author in this season (only read for a LEADER who isn't its admin). */
  leadsPostAuthor: boolean;
}

export async function commentDeleteCtx(
  user: SessionUser,
  seasonId: number,
  postAuthorId: number,
): Promise<CommentDeleteCtx> {
  const ctx: CommentDeleteCtx = { seasonId, liveStudent: false, leadsPostAuthor: false };
  if (isSuper(user)) return ctx;
  if (user.role === "STUDENT") return { ...ctx, liveStudent: await hasActiveEnrollment(user, seasonId) };
  if (isAdminOfSeason(user, seasonId)) return ctx;
  if (user.role === "LEADER")
    return { ...ctx, leadsPostAuthor: await leadsStudentInSeason(user, postAuthorId, seasonId) };
  return ctx;
}

/**
 * The delete rule over a loaded comment, shared by DELETE (through
 * canDeleteForumComment) and every list's `canDelete`, so the two cannot drift.
 * No write path accepts changes in a finished season: a student deletes their
 * own comment only while their place in the season is live.
 */
export function canDeleteLoadedComment(
  user: SessionUser,
  comment: { authorUserId: number },
  ctx: CommentDeleteCtx,
): boolean {
  if (isSuper(user)) return true;
  if (user.role === "STUDENT") return comment.authorUserId === user.userId && ctx.liveStudent;
  if (isAdminOfSeason(user, ctx.seasonId)) return true;
  if (user.role === "LEADER") return ctx.leadsPostAuthor;
  return false;
}

/**
 * Whose posts this caller may read on a forum assignment.
 *
 * `groupIds: null` means every group in the season. The staff arm is new
 * capability — v1 has no staff forum screen whatsoever, so nobody could see a
 * thread to moderate it (spec 14 §10 D2/D3).
 *
 * No group targeting: an assignment is for the whole season, so a student with
 * a live place in it reads their own group's thread. Staff read by their scope
 * in the season (`staffScopeForSeason`: SUPER and the season's ADMIN every
 * group, a LEADER the groups they lead); a MENTOR reads every group.
 */
export type ForumAudience = { kind: "student"; groupId: number | null } | { kind: "staff"; groupIds: number[] | null };

export async function forumAudienceFor(user: SessionUser, assignmentId: number): Promise<ForumAudience | null> {
  const assignment = await db.assignment.findFirst({
    where: { id: assignmentId, ...liveAssignment },
    select: { seasonId: true },
  });
  if (!assignment) return null;
  const { seasonId } = assignment;

  if (user.role === "STUDENT") {
    if (!(await hasActiveEnrollment(user, seasonId))) return null;
    return { kind: "student", groupId: await groupIdInSeason(user.userId, seasonId) };
  }
  if (isMentor(user)) return { kind: "staff", groupIds: null };
  const scope = await staffScopeForSeason(user, seasonId);
  if (scope === null) return null;
  return { kind: "staff", groupIds: scope.kind === "season" ? null : scope.groupIds };
}
