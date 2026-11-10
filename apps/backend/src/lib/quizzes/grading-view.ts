import type { QuizGradingAnswer } from "../../../../../packages/shared/src/index";
import type { Prisma } from "../../generated/prisma/client";
import { toScore } from "./score";

/*
 * The grader's view of an attempt (R103): the answer key next to what the
 * student chose, per type, in the author's order. Staff-only — the route gates
 * it on canGradeQuiz. Never reuse these selects for a student read.
 */

export const GRADING_QUESTION_SELECT = {
  id: true,
  order: true,
  type: true,
  prompt: true,
  points: true,
  quizOptions: { select: { id: true, position: true, label: true, isCorrect: true, side: true, matchId: true } },
  quizBlanks: { select: { id: true, position: true, expected: true } },
} as const satisfies Prisma.QuizQuestionSelect;

export const GRADING_ANSWER_SELECT = {
  questionId: true,
  text: true,
  isCorrect: true,
  pointsAwarded: true,
  selections: { select: { optionId: true, matchedOptionId: true } },
  blanks: { select: { blankId: true, text: true, isCorrect: true } },
} as const satisfies Prisma.QuizAnswerSelect;

type GradingQuestionRow = Prisma.QuizQuestionGetPayload<{ select: typeof GRADING_QUESTION_SELECT }>;
type GradingAnswerRow = Prisma.QuizAnswerGetPayload<{ select: typeof GRADING_ANSWER_SELECT }>;

const byPosition = <T extends { position: number }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => a.position - b.position);

function optionsOf(q: GradingQuestionRow) {
  return byPosition(q.quizOptions).map((o) => ({ id: o.id, label: o.label, isCorrect: o.isCorrect }));
}

function matchingAnswer(q: GradingQuestionRow, a: GradingAnswerRow | undefined) {
  const labelOf = new Map(q.quizOptions.map((o) => [o.id, o.label]));
  const lefts = byPosition(q.quizOptions.filter((o) => o.side === "LEFT"));
  return {
    pairs: lefts.flatMap((l) =>
      l.matchId === null
        ? []
        : [{ leftId: l.id, left: l.label, rightId: l.matchId, right: labelOf.get(l.matchId) ?? "" }],
    ),
    chosen: (a?.selections ?? []).flatMap((s) =>
      s.matchedOptionId === null ? [] : [{ leftId: s.optionId, rightId: s.matchedOptionId }],
    ),
  };
}

/**
 * An essay's mark. A legacy essay was marked with points, not right/wrong: its
 * `pointsAwarded` is kept as it is and it shows as marked (right when it earned
 * anything).
 */
function essayCorrect(a: GradingAnswerRow | undefined): boolean | null {
  if (!a) return null;
  if (a.isCorrect !== null) return a.isCorrect;
  const points = toScore(a.pointsAwarded);
  return points === null ? null : points > 0;
}

/** One question of one attempt as the grader sees it. */
function toGradingAnswer(q: GradingQuestionRow, a: GradingAnswerRow | undefined): QuizGradingAnswer {
  const base = {
    questionId: q.id,
    prompt: q.prompt,
    points: q.points,
    pointsAwarded: toScore(a?.pointsAwarded ?? null),
  };
  const selected = (a?.selections ?? []).map((s) => s.optionId);
  switch (q.type) {
    case "SINGLE_CHOICE":
    case "TRUE_FALSE":
      return { ...base, type: q.type, options: optionsOf(q), selectedOptionId: selected[0] ?? null };
    case "MULTI_CHOICE":
      return { ...base, type: "MULTI_CHOICE", options: optionsOf(q), selectedOptionIds: selected };
    case "MATCHING":
      return { ...base, type: "MATCHING", ...matchingAnswer(q, a) };
    case "FILL_BLANK":
      return {
        ...base,
        type: "FILL_BLANK",
        blanks: byPosition(q.quizBlanks).map((b) => {
          const given = a?.blanks.find((x) => x.blankId === b.id);
          return {
            blankId: b.id,
            position: b.position,
            expected: b.expected,
            text: given?.text ?? null,
            correct: given?.isCorrect ?? null,
          };
        }),
      };
    case "ESSAY":
      return { ...base, type: "ESSAY", text: a?.text ?? null, correct: essayCorrect(a) };
    case "MCQ":
      throw new Error(`Question ${q.id} is a legacy MCQ; the quiz-types backfill should have converted it.`);
  }
}

/** An attempt's answers over the quiz's questions, in the author's order. */
export function gradingAnswers(questions: GradingQuestionRow[], answers: GradingAnswerRow[]): QuizGradingAnswer[] {
  const answerBy = new Map(answers.map((a) => [a.questionId, a]));
  return [...questions].sort((a, b) => a.order - b.order).map((q) => toGradingAnswer(q, answerBy.get(q.id)));
}
