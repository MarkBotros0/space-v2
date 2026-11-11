import type { QuizQuestionStudent } from "@space/shared";

type Of<T extends QuizQuestionStudent["type"]> = Extract<QuizQuestionStudent, { type: T }>;

/**
 * One option of a choice question, marked once the answers are out. `mine`: the student picked it.
 * `isAnswerKey`: it is one of the right options. `correct`: the student handled this option right
 * (picked a key option or left a wrong one alone), so a wrong tick and a missed key are both `false`.
 */
export type ChoiceRow = { id: number; label: string; mine: boolean; correct: boolean; isAnswerKey: boolean };

/** One left item of a matching question: what the student paired it with, and the right partner. */
export type MatchRow = { left: string; mine: string | null; correctRight: string; correct: boolean };

/** One gap of a fill-in-the-blank question: what the student wrote and what was expected. */
export type BlankRow = { index: number; text: string; expected: string; correct: boolean | null };

/** The options of a single, multiple choice or true/false question, in the order the student saw them. */
export function reviewRows(q: Of<"SINGLE_CHOICE" | "TRUE_FALSE" | "MULTI_CHOICE">): ChoiceRow[] {
  const key = new Set(q.review?.correctOptionIds ?? []);
  const picked = new Set(
    q.type === "MULTI_CHOICE" ? q.answer.optionIds : q.answer.optionId === null ? [] : [q.answer.optionId],
  );
  return q.options.map((o) => {
    const mine = picked.has(o.id);
    const isAnswerKey = key.has(o.id);
    return { id: o.id, label: o.label, mine, correct: mine === isAnswerKey, isAnswerKey };
  });
}

/** A matching question's left items with the student's partner and the right one. */
export function matchRows(q: Of<"MATCHING">): MatchRow[] {
  const right = (id: number | undefined) => q.right.find((r) => r.id === id)?.label ?? null;
  return q.left.map((l) => {
    const mineId = q.answer.pairs.find((p) => p.leftId === l.id)?.rightId;
    const keyId = q.review?.correctPairs.find((p) => p.leftId === l.id)?.rightId;
    const verdict = q.review?.pairs.find((p) => p.leftId === l.id)?.correct;
    return { left: l.label, mine: right(mineId), correctRight: right(keyId) ?? "", correct: verdict ?? false };
  });
}

/** A fill-in-the-blank question's gaps, numbered from 1 in reading order. */
export function blankRows(q: Of<"FILL_BLANK">): BlankRow[] {
  return [...q.blanks]
    .sort((a, b) => a.position - b.position)
    .map((b, i) => {
      const r = q.review?.blanks.find((x) => x.blankId === b.id);
      return {
        index: i + 1,
        text: q.answer.blanks.find((x) => x.blankId === b.id)?.text ?? "",
        expected: r?.expected ?? "",
        correct: r?.correct ?? null,
      };
    });
}

export type Verdict = "right" | "wrong" | "partly" | "pending";

/** How a question went, from the points it earned (null: not marked). */
export function verdictOf(q: QuizQuestionStudent): Verdict {
  if (q.pointsAwarded === null) return "pending";
  if (q.pointsAwarded >= q.points) return "right";
  return q.pointsAwarded > 0 ? "partly" : "wrong";
}
