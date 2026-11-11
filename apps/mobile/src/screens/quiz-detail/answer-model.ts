import type { QuizAnswerInput, QuizQuestionStudent } from "@space/shared";

/** The student's working answer to one question: the `answer` field of its `QuizQuestionStudent`. */
export type DraftAnswer = QuizQuestionStudent["answer"];

type Pairs = { pairs: { leftId: number; rightId: number }[] };

const hasText = (s: string | undefined) => (s ?? "").trim().length > 0;

/** An answer of the wrong shape for its question counts as unanswered. */
function shaped<K extends string>(a: DraftAnswer, key: K): a is DraftAnswer & Record<K, unknown> {
  return key in a;
}

/** Same rules as the backend's `isAnswered` (lib/quizzes/marking.ts), on the student shape. */
export function isAnswered(q: QuizQuestionStudent, a: DraftAnswer): boolean {
  switch (q.type) {
    case "MULTI_CHOICE":
      return shaped(a, "optionIds") && (a.optionIds as number[]).length >= 1;
    case "MATCHING": {
      if (!shaped(a, "pairs")) return false;
      const pairs = a.pairs as Pairs["pairs"];
      return q.left.length > 0 && q.left.every((l) => pairs.some((p) => p.leftId === l.id));
    }
    case "FILL_BLANK": {
      if (!shaped(a, "blanks")) return false;
      const blanks = a.blanks as { blankId: number; text: string }[];
      return q.blanks.length > 0 && q.blanks.every((b) => hasText(blanks.find((x) => x.blankId === b.id)?.text));
    }
    case "ESSAY":
      return shaped(a, "text") && hasText(a.text as string);
    default:
      return shaped(a, "optionId") && a.optionId !== null;
  }
}

/** The request body for one question's answer. Blanks always list every blank, in the question's order. */
export function toAnswerInput(q: QuizQuestionStudent, a: DraftAnswer): QuizAnswerInput {
  switch (q.type) {
    case "MULTI_CHOICE":
      return { type: q.type, questionId: q.id, optionIds: shaped(a, "optionIds") ? (a.optionIds as number[]) : [] };
    case "MATCHING":
      return { type: q.type, questionId: q.id, pairs: shaped(a, "pairs") ? (a.pairs as Pairs["pairs"]) : [] };
    case "FILL_BLANK": {
      const have = shaped(a, "blanks") ? (a.blanks as { blankId: number; text: string }[]) : [];
      return {
        type: q.type,
        questionId: q.id,
        blanks: q.blanks.map((b) => ({ blankId: b.id, text: have.find((x) => x.blankId === b.id)?.text ?? "" })),
      };
    }
    case "ESSAY":
      return { type: q.type, questionId: q.id, text: shaped(a, "text") ? (a.text as string) : "" };
    default:
      return {
        type: q.type,
        questionId: q.id,
        optionId: shaped(a, "optionId") ? (a.optionId as number | null) : null,
      };
  }
}

/** Untick if present; tick only while fewer than `choose` are ticked. */
export function toggleChoice(a: { optionIds: number[] }, optionId: number, choose: number): { optionIds: number[] } {
  if (a.optionIds.includes(optionId)) return { optionIds: a.optionIds.filter((id) => id !== optionId) };
  return a.optionIds.length < choose ? { optionIds: [...a.optionIds, optionId] } : a;
}

/** Pair a left with a right, replacing any pair that already uses either. */
export function pairUp(a: Pairs, leftId: number, rightId: number): Pairs {
  return { pairs: [...a.pairs.filter((p) => p.leftId !== leftId && p.rightId !== rightId), { leftId, rightId }] };
}

export function unpair(a: Pairs, leftId: number): Pairs {
  return { pairs: a.pairs.filter((p) => p.leftId !== leftId) };
}
