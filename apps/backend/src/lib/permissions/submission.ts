import { db } from "../../db/client";
import type { Prisma, SubmissionStatus } from "../../generated/prisma/client";
import type { SessionUser } from "../auth/tokens";
import { groupIdInSeason } from "../queries/enrollment";
import { isAdminOfSeason, isLeaderOfGroup, isMentor, isSuper } from "../rbac";
import { hasActiveEnrollment } from "./season";

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

/**
 * A submission's author and season, or null when it does not exist. An essay
 * is gated through its Submission (`AssignmentPartWork.submissionId`): the
 * essay's student and season are the submission's.
 */
async function submissionSubject(submissionId: number): Promise<{ studentUserId: number; seasonId: number } | null> {
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
 * Is this essay a DRAFT someone other than its author is asking for?
 *
 * A DRAFT is the student's unfinished work (owner decision, 2026-11): it
 * exists only for its author until Submit hands it in. Every route that
 * addresses an essay by publicId answers a hidden draft with 404, exactly as
 * if the row did not exist, before any role check — a 403 would tell staff
 * the draft is there. RETURNED is not a draft: it was handed in and sent back,
 * and stays visible.
 */
export function isHiddenDraft(user: SessionUser, submission: { status: string; studentUserId: number }): boolean {
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
 * Who may record a verdict on an essay of this submission.
 *
 * Strictly narrower than canViewSubmission, and deliberately not derived from
 * it: a MENTOR reads every submission in the system but reviews none, and the
 * author reads their own but must never review it. Deriving one from the other
 * is exactly how a read gate becomes a write gate by accident.
 */
export async function canReviewSubmission(user: SessionUser, submissionId: number): Promise<boolean> {
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
 * Who may mark an assignment submitted for this student, or take the mark away (whoever made it):
 * the season's admin, a super, or the student's own leader in that season (ruling C9: the group
 * is the enrolment's). The season being ACTIVE is checked under its lock, in the service.
 */
export async function canMarkSubmitted(user: SessionUser, seasonId: number, studentUserId: number): Promise<boolean> {
  return isAdminOfSeason(user, seasonId) || leadsStudentInSeason(user, studentUserId, seasonId);
}

/**
 * Whose essays sit in this caller's review queue, as a filter over their
 * Submission (the queue and the dashboard apply it as `{ submission: scope }`).
 *
 * Shared with `GET /api/v1/submissions` so the dashboard's "pending review" /
 * "reviewed" counts are computed over exactly the rows the tile opens (spec 19
 * D11). A second hand-written scope would let the count and the queue disagree.
 *
 * A LEADER's scope cannot be one Prisma filter: the constraint is "the
 * student's enrolment *in this assignment's season* names a group I lead",
 * which relates two branches of the query. The pairs are resolved first and
 * expanded into an OR, bounded by the leader's own roster (C9).
 *
 * Returns null when the queue is empty by construction (a STUDENT, or a leader
 * with no enrolments in their groups).
 */
export async function submissionQueueScopeFor(user: SessionUser): Promise<Prisma.SubmissionWhereInput | null> {
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

/**
 * The states in which a student may still change their own essay (its text and
 * its files): DRAFT and RETURNED. Once handed in the essay is the reviewer's to
 * judge, and once reviewed the feedback refers to this text — a write after
 * either would leave a verdict on words the reviewer never saw. The way back
 * to editable is a reviewer's `return`, never a student write.
 */
export const EDITABLE_STATUSES: readonly SubmissionStatus[] = ["DRAFT", "RETURNED"];

function isEditableStatus(status: SubmissionStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

/**
 * Why a student's write to their own essay must be refused, or null when it
 * may proceed. The caller has already established authorship.
 *
 * Active enrolment, not `canAccessSeason`: that predicate's student branch
 * accepts any enrolment row whatever its status, so a dropped, completed or
 * alumni student could otherwise keep writing into a past season.
 */
export async function studentWriteRefusal(
  user: SessionUser,
  seasonId: number,
  status: SubmissionStatus,
): Promise<"forbidden" | "not_editable" | null> {
  if (!(await hasActiveEnrollment(user, seasonId))) return "forbidden";
  if (!isEditableStatus(status)) return "not_editable";
  return null;
}
