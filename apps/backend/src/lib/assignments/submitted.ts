import type { Prisma } from "../../generated/prisma/client";

/*
 * The one definition of a submitted assignment: the student tapped Submit in the app
 * (`Submission.submittedAt`), or staff marked it submitted (`SubmissionStaffMark`). Every count
 * reads it from here (progress, the season list, engagement, reports, the workbook, reminders,
 * My work, End); `submitted-definition.test.ts` refuses a reader that spells only the first half.
 * `submittedAt` alone still means "tapped Submit" in the writes that need exactly that (submit,
 * standing, reopen, essay review).
 */

/** A Submission filter: submitted in the app or marked by staff. It sets `OR`; nest it under `AND` beside another. */
export const SUBMITTED_WHERE = {
  OR: [{ submittedAt: { not: null } }, { staffMark: { isNot: null } }],
} satisfies Prisma.SubmissionWhereInput;

/** Select the mark beside a Submission's own columns. */
export const STAFF_MARK_SELECT = {
  staffMark: { select: { markedAt: true, markedBy: { select: { id: true, name: true } } } },
} satisfies Prisma.SubmissionSelect;

export function isSubmitted(s: { submittedAt: Date | null; staffMark: object | null }): boolean {
  return s.submittedAt !== null || s.staffMark !== null;
}
