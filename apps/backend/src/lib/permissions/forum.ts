import { db } from "../../db/client";
import type { SessionUser } from "../auth/tokens";
import { studentCanSeeAssignment } from "../queries/assignments";
import { groupIdInSeason } from "../queries/enrollment";
import { isAdminOfSeason, isLeaderOfGroup, isMentor, isSuper } from "../rbac";
import { hasActiveEnrollment, staffScopeForSeason } from "./season";
import { leadsStudentInSeason } from "./submission";

/**
 * Who may comment on a forum post.
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
 */
export async function canCommentOnForumSubmission(user: SessionUser, submissionId: number): Promise<boolean> {
  const sub = await db.submission.findUnique({
    where: { id: submissionId },
    select: {
      studentUserId: true,
      status: true,
      assignment: { select: { seasonId: true, type: true, forumAllowComments: true } },
    },
  });
  if (!sub) return false;
  if (sub.assignment.type !== "FORUM" || !sub.assignment.forumAllowComments) return false;
  if (sub.status === "DRAFT") return false;

  if (isSuper(user)) return true;
  if (isAdminOfSeason(user, sub.assignment.seasonId)) return true;

  const authorGroupId = await groupIdInSeason(sub.studentUserId, sub.assignment.seasonId);
  if (authorGroupId === null) return false;

  if (user.role === "LEADER") return isLeaderOfGroup(user, authorGroupId);
  if (user.role === "STUDENT") {
    // A finished season is locked: group membership survives End and
    // withdrawal, so the place in the season must still be live.
    if (!(await hasActiveEnrollment(user, sub.assignment.seasonId))) return false;
    const mine = await groupIdInSeason(user.userId, sub.assignment.seasonId);
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
      submission: {
        select: { studentUserId: true, assignment: { select: { seasonId: true } } },
      },
    },
  });
  if (!comment) return false;
  if (isSuper(user)) return true;

  const seasonId = comment.submission.assignment.seasonId;
  // No write path accepts changes in a finished season: a student deletes
  // their own comment only while their place in the season is live.
  if (user.role === "STUDENT") {
    return comment.authorUserId === user.userId && (await hasActiveEnrollment(user, seasonId));
  }
  if (isAdminOfSeason(user, seasonId)) return true;

  if (user.role === "LEADER") {
    return leadsStudentInSeason(user, comment.submission.studentUserId, seasonId);
  }
  return false;
}

/**
 * Whose posts this caller may read on a forum assignment.
 *
 * `groupIds: null` means every group in the season. The staff arm is new
 * capability — v1 has no staff forum screen whatsoever, so nobody could see a
 * thread to moderate it (spec 14 §10 D2/D3).
 */
export type ForumAudience = { kind: "student"; groupId: number | null } | { kind: "staff"; groupIds: number[] | null };

export async function forumAudienceFor(user: SessionUser, assignmentId: number): Promise<ForumAudience | null> {
  const assignment = await db.assignment.findFirst({
    where: { id: assignmentId, deletedAt: null, type: "FORUM" },
    select: { seasonId: true, isAllGroups: true, targets: { select: { groupId: true } } },
  });
  if (!assignment) return null;

  if (isSuper(user) || isMentor(user) || isAdminOfSeason(user, assignment.seasonId)) {
    return { kind: "staff", groupIds: null };
  }

  if (user.role === "LEADER") {
    const scope = await staffScopeForSeason(user, assignment.seasonId);
    if (scope === null || scope.kind !== "groups") return null;
    return { kind: "staff", groupIds: scope.groupIds };
  }

  if (user.role !== "STUDENT") return null;
  if (!(await hasActiveEnrollment(user, assignment.seasonId))) return null;
  // The targeting rule v1 enforced only by refusing to render the page (R15),
  // from the same helper the assignment reads use.
  const targeted = await studentCanSeeAssignment(
    user.userId,
    assignment.seasonId,
    assignment.isAllGroups,
    assignment.targets.map((t) => t.groupId),
  );
  if (!targeted) return null;
  return { kind: "student", groupId: await groupIdInSeason(user.userId, assignment.seasonId) };
}
