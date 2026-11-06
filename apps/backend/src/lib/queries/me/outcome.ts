import type { EnrollmentResult, EnrollmentStatus } from "../../../generated/prisma/enums";
import type { SeasonOutcome } from "../../../../../../packages/shared/src/season-lifecycle";

/**
 * What a finished enrolment came to. A deleted account's or a graduate's
 * enrolment can be COMPLETED with no result; that is COMPLETED, not a pass.
 * An ACTIVE enrolment has no outcome yet: callers filter those out first.
 */
export function outcomeOf(status: EnrollmentStatus, result: EnrollmentResult | null): SeasonOutcome {
  if (status === "WITHDRAWN") return "DROPPED";
  if (result === "PASSED") return "PASSED";
  if (result === "NOT_PASSED") return "NOT_PASSED";
  return "COMPLETED";
}
