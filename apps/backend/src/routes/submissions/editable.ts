import type { Response } from "express";

import type { SubmissionStatus } from "../../generated/prisma/client";
import { apiError } from "../../lib/api-response";
import type { SessionUser } from "../../lib/auth/tokens";
import { hasActiveEnrollment } from "../../lib/permissions";

/** 409 for a student write to a submission that is no longer theirs to change. */
export function submissionLocked(res: Response) {
  return apiError(
    res,
    "submission_locked",
    "This submission has been submitted and can no longer be changed.",
    409,
  );
}

/**
 * The states in which a student may still change their own submission.
 *
 * Mirrors the mobile editor exactly (`assignment/[id]/index.tsx`: editable is
 * DRAFT or RETURNED). Once submitted the work is the reviewer's to judge, and
 * once reviewed the feedback refers to this text — a write after either would
 * leave a verdict on words the reviewer never saw, and `{submit:true}` on a
 * REVIEWED row would silently pull it back into the queue. The way back to
 * editable is a reviewer's returnForRevision, never a student write.
 */
export const EDITABLE_STATUSES: readonly SubmissionStatus[] = ["DRAFT", "RETURNED"];

export function isEditableStatus(status: SubmissionStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

/**
 * Why a student's write to their own submission must be refused, or null when
 * it may proceed. The caller has already established authorship.
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
