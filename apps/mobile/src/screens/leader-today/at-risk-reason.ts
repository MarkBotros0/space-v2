import { AT_RISK_PCT, type EngagementRow } from "@space/shared";

/**
 * Why a student is on the at-risk list (R33). Names only what is below
 * `AT_RISK_PCT`, so a good value is never shown as the problem; words and
 * numbers only, never colour. Mirrors `isAtRisk`'s guards: a figure with
 * nothing behind it (no sessions yet, nothing assigned) is not a reason.
 */
export function atRiskReason(r: EngagementRow): string {
  const reasons: string[] = [];
  if (r.attendanceTotal > 0 && r.attendancePct < AT_RISK_PCT) {
    reasons.push(`Attendance ${r.attendancePct}%`);
  }
  if (r.submissionsExpected > 0 && r.submissionPct < AT_RISK_PCT) {
    reasons.push(`${r.submissionsCompleted} of ${r.submissionsExpected} submitted`);
  }
  return reasons.join(" · ");
}
