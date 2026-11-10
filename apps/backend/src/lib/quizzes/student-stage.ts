/**
 * Which screen a student is on for an ONLINE quiz (spec "What students see"):
 * before, during, handed in and waiting for marking, score only, or the answers.
 *
 * The score shows once any attempt is GRADED, with no release needed. Question
 * text, options, their own answers and right/wrong show only at `answers`, which
 * needs the admin's release — a student taking it later can't learn the answers
 * from one who took it first. A retake in progress is always `in_progress`.
 */
type QuizStage = "not_started" | "in_progress" | "submitted" | "graded" | "answers";

export function studentQuizStage(
  latest: { status: string } | null,
  bestGraded: boolean,
  answersReleased: boolean,
): QuizStage {
  if (latest === null) return "not_started";
  if (latest.status === "IN_PROGRESS") return "in_progress";
  if (bestGraded) return answersReleased ? "answers" : "graded";
  return "submitted";
}
