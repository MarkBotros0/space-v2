import type { Prisma } from "../../generated/prisma/client";
import type { QuizQuestionType } from "../../generated/prisma/enums";
import { round2 } from "./score";

export type MarkableQuestion = {
  id: number;
  type: QuizQuestionType;
  points: number;
  options: { id: number; isCorrect: boolean; side: "LEFT" | "RIGHT" | null; matchId: number | null }[];
  blanks: { id: number }[];
};

export type StoredAnswer = {
  selections: { optionId: number; matchedOptionId: number | null }[];
  blanks: { blankId: number; text: string; isCorrect: boolean | null }[];
  text: string | null;
  isCorrect: boolean | null;
};

/** What marking and answer validation load: server-side only, never a student response. */
export const MARKABLE_QUESTION_SELECT = {
  id: true,
  type: true,
  points: true,
  quizOptions: { select: { id: true, isCorrect: true, side: true, matchId: true } },
  quizBlanks: { select: { id: true } },
} as const satisfies Prisma.QuizQuestionSelect;

export function toMarkable(
  row: Prisma.QuizQuestionGetPayload<{ select: typeof MARKABLE_QUESTION_SELECT }>,
): MarkableQuestion {
  return { id: row.id, type: row.type, points: row.points, options: row.quizOptions, blanks: row.quizBlanks };
}

/** Typed text counts as an answer only when it isn't blank: the one test for an essay or a blank. */
export const hasAnswerText = (s: string | null | undefined): boolean => (s ?? "").trim().length > 0;

/** FILL_BLANK and ESSAY are marked by a leader; every other type is marked here. */
export function isLeaderMarked(type: QuizQuestionType): boolean {
  return type === "FILL_BLANK" || type === "ESSAY";
}

export function isAnswered(q: MarkableQuestion, a: StoredAnswer | undefined): boolean {
  if (!a) return false;
  switch (q.type) {
    case "MULTI_CHOICE":
      return a.selections.length >= 1;
    case "MATCHING": {
      const lefts = q.options.filter((o) => o.side === "LEFT");
      return (
        lefts.length > 0 &&
        lefts.every((l) => a.selections.some((s) => s.optionId === l.id && s.matchedOptionId !== null))
      );
    }
    case "FILL_BLANK":
      return (
        q.blanks.length > 0 && q.blanks.every((b) => hasAnswerText(a.blanks.find((x) => x.blankId === b.id)?.text))
      );
    case "ESSAY":
      return hasAnswerText(a.text);
    default:
      // MCQ (legacy), SINGLE_CHOICE, TRUE_FALSE
      return a.selections.length === 1;
  }
}

const NONE = { pointsAwarded: 0, isCorrect: false };

function markMulti(q: MarkableQuestion, a: StoredAnswer): { pointsAwarded: number; isCorrect: boolean } {
  const correct = q.options.filter((o) => o.isCorrect);
  if (correct.length === 0) return NONE;
  const ticked = new Set(a.selections.map((s) => s.optionId));
  const correctTicked = correct.filter((o) => ticked.has(o.id)).length;
  const anyWrong = q.options.some((o) => !o.isCorrect && ticked.has(o.id));
  return {
    pointsAwarded: round2((correctTicked / correct.length) * q.points),
    isCorrect: correctTicked === correct.length && !anyWrong,
  };
}

function markMatching(q: MarkableQuestion, a: StoredAnswer): { pointsAwarded: number; isCorrect: boolean } {
  const lefts = q.options.filter((o) => o.side === "LEFT");
  if (lefts.length === 0) return NONE;
  const right = lefts.filter((l) => {
    const sel = a.selections.find((s) => s.optionId === l.id);
    return sel !== undefined && l.matchId !== null && sel.matchedOptionId === l.matchId;
  }).length;
  return { pointsAwarded: round2((right / lefts.length) * q.points), isCorrect: right === lefts.length };
}

/** Marks the auto types; throws for a leader-marked type. Unanswered earns 0. */
export function autoMark(
  q: MarkableQuestion,
  a: StoredAnswer | undefined,
): { pointsAwarded: number; isCorrect: boolean } {
  if (isLeaderMarked(q.type)) throw new Error(`Question type ${q.type} is marked by a leader, not automatically`);
  if (!a) return NONE;
  // A partly answered multi-choice or matching still earns its share, so those mark whatever is there.
  if (q.type === "MULTI_CHOICE") return markMulti(q, a);
  if (q.type === "MATCHING") return markMatching(q, a);
  if (!isAnswered(q, a)) return NONE;
  const picked = a.selections[0];
  const right = picked !== undefined && q.options.some((o) => o.id === picked.optionId && o.isCorrect);
  return right ? { pointsAwarded: q.points, isCorrect: true } : NONE;
}

/** Points for a leader-marked question from the leader's per-blank (or whole-answer) marks. */
export function leaderMark(
  q: MarkableQuestion,
  marks: { blankId: number | null; correct?: boolean; points?: number }[],
): number {
  if (q.type === "ESSAY") {
    const m = marks[0];
    if (m?.points !== undefined) return m.points;
    return m?.correct ? q.points : 0;
  }
  if (q.blanks.length === 0) return 0;
  const right = q.blanks.filter((b) => marks.some((m) => m.blankId === b.id && m.correct)).length;
  return round2((right / q.blanks.length) * q.points);
}
