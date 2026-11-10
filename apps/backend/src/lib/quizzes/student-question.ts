// Relative, not "@space/shared" — same emit trap routes/auth.ts documents.
import type { QuizQuestionStudent } from "../../../../../packages/shared/src/index";
import type { Prisma } from "../../generated/prisma/client";
import type { QuizOptionSide, QuizQuestionType } from "../../generated/prisma/enums";
import { toScore } from "./score";
import { seededOrder } from "./shuffle";

/*
 * The student's view of a question. Two selects, on purpose:
 *
 * - `STUDENT_QUESTION_SELECT` / `STUDENT_ANSWER_SELECT` are the ONLY ones a read
 *   may use before the answers are released. They never select `isCorrect`,
 *   `matchId`, `expected` or `pointsAwarded`, so the key is not even loaded.
 *   `_count` with a filter returns how many options are correct (MULTI_CHOICE's
 *   "Choose N"), a number the spec says is not itself the key.
 * - `REVIEW_QUESTION_SELECT` / `REVIEW_ANSWER_SELECT` add the key and the marks,
 *   for the `answers` stage only.
 *
 * The raw-JSON tests in quizzes-attempts-routes are the guarantee; these selects
 * and `withReview` are how it holds.
 */

const COUNT_CORRECT = { _count: { select: { quizOptions: { where: { isCorrect: true } } } } } as const;

export const STUDENT_QUESTION_SELECT = {
  id: true,
  order: true,
  type: true,
  prompt: true,
  points: true,
  quizOptions: { select: { id: true, position: true, label: true, side: true } },
  quizBlanks: { select: { id: true, position: true } },
  ...COUNT_CORRECT,
} as const satisfies Prisma.QuizQuestionSelect;

export const REVIEW_QUESTION_SELECT = {
  ...STUDENT_QUESTION_SELECT,
  quizOptions: { select: { id: true, position: true, label: true, side: true, isCorrect: true, matchId: true } },
  quizBlanks: { select: { id: true, position: true, expected: true } },
} as const satisfies Prisma.QuizQuestionSelect;

export const STUDENT_ANSWER_SELECT = {
  questionId: true,
  text: true,
  selections: { select: { optionId: true, matchedOptionId: true } },
  blanks: { select: { blankId: true, text: true } },
} as const satisfies Prisma.QuizAnswerSelect;

export const REVIEW_ANSWER_SELECT = {
  ...STUDENT_ANSWER_SELECT,
  isCorrect: true,
  pointsAwarded: true,
  blanks: { select: { blankId: true, text: true, isCorrect: true } },
} as const satisfies Prisma.QuizAnswerSelect;

/** A question from either select; the key fields exist only on a review row. */
export type StudentQuestionRow = {
  id: number;
  order: number;
  type: QuizQuestionType;
  prompt: string;
  points: number;
  quizOptions: {
    id: number;
    position: number;
    label: string;
    side: QuizOptionSide | null;
    isCorrect?: boolean;
    matchId?: number | null;
  }[];
  quizBlanks: { id: number; position: number; expected?: string }[];
  /** Options with isCorrect: the "Choose N" count. */
  _count: { quizOptions: number };
};

/** An answer from either select; the marks exist only on a review row. */
export type StudentAnswerRow = {
  text: string | null;
  selections: { optionId: number; matchedOptionId: number | null }[];
  blanks: { blankId: number; text: string; isCorrect?: boolean | null }[];
  isCorrect?: boolean | null;
  pointsAwarded?: Prisma.Decimal | number | null;
};

type Opts = { seed: number; withReview: boolean };
type Option = StudentQuestionRow["quizOptions"][number];

/** Second salt for MATCHING's right column, so the two columns shuffle independently. */
const RIGHT_SALT = 1_000_003;

const byPosition = <T extends { position: number }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => a.position - b.position);
const shown = (o: Option) => ({ id: o.id, label: o.label });

/** Fail closed: a review built from a row loaded without the key is a bug, not an empty review. */
function assertKeyLoaded(row: StudentQuestionRow): void {
  const missing =
    row.quizOptions.some((o) => o.isCorrect === undefined || o.matchId === undefined) ||
    row.quizBlanks.some((b) => b.expected === undefined);
  if (missing) throw new Error(`Question ${row.id}: review needs REVIEW_QUESTION_SELECT`);
}

function choiceReview(row: StudentQuestionRow) {
  return { correctOptionIds: row.quizOptions.filter((o) => o.isCorrect === true).map((o) => o.id) };
}

function matchingQuestion(row: StudentQuestionRow, a: StudentAnswerRow | undefined, opts: Opts) {
  const lefts = row.quizOptions.filter((o) => o.side === "LEFT");
  const rights = row.quizOptions.filter((o) => o.side === "RIGHT");
  const pairs = (a?.selections ?? []).flatMap((s) =>
    s.matchedOptionId === null ? [] : [{ leftId: s.optionId, rightId: s.matchedOptionId }],
  );
  const matchOf = new Map(lefts.map((l) => [l.id, l.matchId ?? null]));
  return {
    type: "MATCHING" as const,
    left: seededOrder(lefts, opts.seed, row.id).map(shown),
    right: seededOrder(rights, opts.seed, row.id + RIGHT_SALT).map(shown),
    answer: { pairs },
    review: opts.withReview
      ? {
          pairs: pairs.map((p) => ({ ...p, correct: matchOf.get(p.leftId) === p.rightId })),
          correctPairs: byPosition(lefts).flatMap((l) =>
            l.matchId === null || l.matchId === undefined ? [] : [{ leftId: l.id, rightId: l.matchId }],
          ),
        }
      : null,
  };
}

function fillBlankQuestion(row: StudentQuestionRow, a: StudentAnswerRow | undefined, withReview: boolean) {
  const blanks = byPosition(row.quizBlanks);
  const given = new Map((a?.blanks ?? []).map((b) => [b.blankId, b]));
  return {
    type: "FILL_BLANK" as const,
    blanks: blanks.map((b) => ({ id: b.id, position: b.position })),
    answer: {
      blanks: blanks.flatMap((b) => {
        const g = given.get(b.id);
        return g ? [{ blankId: b.id, text: g.text }] : [];
      }),
    },
    review: withReview
      ? {
          blanks: blanks.map((b) => ({
            blankId: b.id,
            correct: given.get(b.id)?.isCorrect ?? null,
            expected: b.expected ?? "",
          })),
        }
      : null,
  };
}

function singleQuestion(row: StudentQuestionRow, a: StudentAnswerRow | undefined, opts: Opts) {
  const type = row.type === "TRUE_FALSE" ? "TRUE_FALSE" : "SINGLE_CHOICE";
  // True/false is never shuffled; single choice always is.
  const options = type === "TRUE_FALSE" ? byPosition(row.quizOptions) : seededOrder(row.quizOptions, opts.seed, row.id);
  return {
    type,
    options: options.map(shown),
    answer: { optionId: a?.selections[0]?.optionId ?? null },
    review: opts.withReview ? choiceReview(row) : null,
  } as const;
}

function multiQuestion(row: StudentQuestionRow, a: StudentAnswerRow | undefined, opts: Opts) {
  return {
    type: "MULTI_CHOICE" as const,
    options: seededOrder(row.quizOptions, opts.seed, row.id).map(shown),
    choose: row._count.quizOptions,
    answer: { optionIds: (a?.selections ?? []).map((s) => s.optionId).sort((x, y) => x - y) },
    review: opts.withReview ? choiceReview(row) : null,
  };
}

/** The type-specific part of a student question. */
function typed(row: StudentQuestionRow, a: StudentAnswerRow | undefined, opts: Opts) {
  const { withReview } = opts;
  switch (row.type) {
    case "SINGLE_CHOICE":
    case "TRUE_FALSE":
      return singleQuestion(row, a, opts);
    case "MULTI_CHOICE":
      return multiQuestion(row, a, opts);
    case "MATCHING":
      return matchingQuestion(row, a, opts);
    case "FILL_BLANK":
      return fillBlankQuestion(row, a, withReview);
    case "ESSAY":
      return {
        type: "ESSAY" as const,
        answer: { text: a?.text ?? "" },
        review: withReview ? { correct: a?.isCorrect ?? null } : null,
      };
    case "MCQ":
      throw new Error(`Question ${row.id} is a legacy MCQ; the quiz-types backfill should have converted it.`);
  }
}

/**
 * A stored question as the student sees it. Without `withReview` nothing of the
 * key or the marking is read from the row, whatever the row holds.
 */
export function toStudentQuestion(
  row: StudentQuestionRow,
  answer: StudentAnswerRow | undefined,
  opts: Opts,
): QuizQuestionStudent {
  if (opts.withReview) assertKeyLoaded(row);
  return {
    id: row.id,
    order: row.order,
    prompt: row.prompt,
    points: row.points,
    pointsAwarded: opts.withReview ? toScore(answer?.pointsAwarded ?? null) : null,
    ...typed(row, answer, opts),
  };
}
