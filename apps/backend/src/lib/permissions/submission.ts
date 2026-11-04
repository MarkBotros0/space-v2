import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import type { SessionUser } from "../auth/tokens";
import { groupIdInSeason } from "../queries/enrollment";
import { isAdminOfSeason, isLeaderOfGroup, isMentor, isSuper } from "../rbac";

/**
 * Does this LEADER lead the group the student is enrolled in *for this season*?
 *
 * Ruling C9: the group comes from SeasonEnrollment, never GroupStudent.
 * While GroupStudent was global (before Plan 18 M1) asking it answered "what
 * group are they in now", which gave a leader access to old work from
 * students who had since joined their group, while denying access to their
 * own students' past work. The enrolment is still the authority.
 */
export async function leadsStudentInSeason(
  user: SessionUser,
  studentUserId: number,
  seasonId: number,
): Promise<boolean> {
  const groupId = await groupIdInSeason(studentUserId, seasonId);
  return groupId !== null && isLeaderOfGroup(user, groupId);
}

/** A submission's author and season, or null when it does not exist. */
async function submissionSubject(
  submissionId: number,
): Promise<{ studentUserId: number; seasonId: number } | null> {
  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    select: {
      studentUserId: true,
      assignment: { select: { seasonId: true } },
    },
  });
  if (!submission) return null;
  return { studentUserId: submission.studentUserId, seasonId: submission.assignment.seasonId };
}

/**
 * Is this submission a DRAFT someone other than its author is asking for?
 *
 * A DRAFT is the student's unfinished work (owner decision, 2026-11): it
 * exists only for its author. Every route that addresses a submission by
 * publicId answers a hidden draft with 404, exactly as if the row did not
 * exist, before any role check — a 403 would tell staff the draft is there.
 * RETURNED is not a draft: it was turned in and sent back, and stays visible.
 */
export function isHiddenDraft(
  user: SessionUser,
  submission: { status: string; studentUserId: number },
): boolean {
  return submission.status === "DRAFT" && submission.studentUserId !== user.userId;
}

export async function canViewSubmission(user: SessionUser, submissionId: number): Promise<boolean> {
  if (isSuper(user) || isMentor(user)) return true;

  const submission = await submissionSubject(submissionId);
  if (!submission) return false;

  if (submission.studentUserId === user.userId) return true;
  if (isAdminOfSeason(user, submission.seasonId)) return true;

  // The student's group *for this assignment's season* (ruling C9).
  if (user.role === "LEADER") {
    return leadsStudentInSeason(user, submission.studentUserId, submission.seasonId);
  }

  return false;
}

/**
 * Who may record a verdict on a submission.
 *
 * Strictly narrower than canViewSubmission, and deliberately not derived from
 * it: a MENTOR reads every submission in the system but reviews none, and the
 * author reads their own but must never review it. Deriving one from the other
 * is exactly how a read gate becomes a write gate by accident.
 */
export async function canReviewSubmission(
  user: SessionUser,
  submissionId: number,
): Promise<boolean> {
  if (isSuper(user)) return true;

  const submission = await submissionSubject(submissionId);
  if (!submission) return false;

  // The author never reviews their own work, whatever else they are.
  if (submission.studentUserId === user.userId) return false;
  if (isAdminOfSeason(user, submission.seasonId)) return true;
  if (user.role !== "LEADER") return false;

  return leadsStudentInSeason(user, submission.studentUserId, submission.seasonId);
}

/**
 * Whose submissions sit in this caller's review queue.
 *
 * Extracted verbatim from `GET /api/v1/submissions` so the dashboard's
 * "pending review" / "reviewed" counts are computed over exactly the rows the
 * tile opens (spec 19 D11). A second hand-written scope would let the count
 * and the queue disagree.
 *
 * A LEADER's scope cannot be one Prisma filter: the constraint is "the
 * student's enrolment *in this assignment's season* names a group I lead",
 * which relates two branches of the query. The pairs are resolved first and
 * expanded into an OR, bounded by the leader's own roster (C9).
 *
 * Returns null when the queue is empty by construction (a STUDENT, or a leader
 * with no enrolments in their groups).
 */
export async function submissionQueueScopeFor(
  user: SessionUser,
): Promise<Prisma.SubmissionWhereInput | null> {
  if (isSuper(user) || isMentor(user)) return {};
  if (user.role === "ADMIN") return { assignment: { seasonId: { in: user.seasonAdminIds } } };
  if (user.role !== "LEADER") return null;

  const groups = await db.group.findMany({
    where: { id: { in: user.groupLeaderIds } },
    select: { id: true },
  });
  const enrollments = await db.seasonEnrollment.findMany({
    where: { groupId: { in: groups.map((g) => g.id) } },
    select: { studentUserId: true, seasonId: true },
  });
  if (enrollments.length === 0) return null;
  return {
    OR: enrollments.map((e) => ({
      studentUserId: e.studentUserId,
      assignment: { seasonId: e.seasonId },
    })),
  };
}
