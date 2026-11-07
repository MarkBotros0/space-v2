/**
 * What a student is told about their quiz attempt. Until staff release the
 * results a graded attempt reads as SUBMITTED (handed in, waiting), so nothing
 * about the marking shows before everyone has had their turn: a student taking
 * it later can't learn the answers from one who took it first (owner, 2026-11-07).
 */
export function studentAttemptStatus<S extends string | null>(
  status: S,
  released: boolean,
): S | "SUBMITTED" {
  return status === "GRADED" && !released ? "SUBMITTED" : status;
}
