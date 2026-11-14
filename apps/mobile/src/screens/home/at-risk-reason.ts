import { AT_RISK_PCT, type EngagementRow } from "@space/shared";

import { joinMeta } from "../../lib/join-meta";
import { plural } from "../../lib/plural";

/**
 * Why a student is on the at-risk list (R33), each reason named by its area (owner 2026-11-14:
 * "0 of 1 submitted" didn't say of what): "Attendance 60% (3 of 5 sessions)", "Assignments: 0 of
 * 1 submitted". Names only what is below `AT_RISK_PCT`, so a good value is never shown as the
 * problem; words and numbers only, never colour. Mirrors `isAtRisk`'s guards: a figure with
 * nothing behind it (no sessions yet, nothing assigned) is not a reason. Quizzes are not part of
 * the at-risk rule, so they never appear here.
 */
type Figures = Pick<
  EngagementRow,
  | "attendanceTotal"
  | "attendancePct"
  | "attendancePresent"
  | "submissionsExpected"
  | "submissionPct"
  | "submissionsCompleted"
>;

/** Every at-risk list says it the same way: the leader's Home, the admin's Home and the full list. */
export function atRiskReason(r: Figures): string {
  const attendance =
    r.attendanceTotal > 0 && r.attendancePct < AT_RISK_PCT
      ? `Attendance ${r.attendancePct}% (${r.attendancePresent} of ${plural(r.attendanceTotal, "session")})`
      : null;
  const assignments =
    r.submissionsExpected > 0 && r.submissionPct < AT_RISK_PCT
      ? `Assignments: ${r.submissionsCompleted} of ${r.submissionsExpected} submitted`
      : null;
  return joinMeta([attendance, assignments]);
}
