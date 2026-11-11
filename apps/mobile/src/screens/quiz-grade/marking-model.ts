/**
 * The leader's right/wrong marks for one attempt, pure (spec "Marking (leaders)"). One mark per
 * blank of each fill-in-the-blank question and one per essay (`blankId: null`); every other type
 * is marked by the server. The server refuses a partial payload (`marks_incomplete`), so the
 * sheet saves only once `marksComplete` holds.
 */
import type { MarkAttemptInput, QuizGradingAttempt } from "@space/shared";

type Answer = QuizGradingAttempt["answers"][number];

/** One item's mark as the leader has it so far; `correct` null = not marked yet. */
export type ItemMark = { questionId: number; blankId: number | null; correct: boolean | null };

/**
 * An essay marked with points before right/wrong existed: it earned neither nothing nor full
 * marks, so a right/wrong mark would overwrite the leader's points. Shown read-only.
 */
export function isLegacyEssay(a: Answer): boolean {
  return a.type === "ESSAY" && a.pointsAwarded !== null && a.pointsAwarded !== 0 && a.pointsAwarded !== a.points;
}

/** Whether any of the attempt's essays carries legacy points (the attempt is then read-only). */
export function hasLegacyMarks(attempt: QuizGradingAttempt): boolean {
  return attempt.answers.some(isLegacyEssay);
}

/** The leader-marked items in the author's order, seeded from what the server holds. */
export function initialMarks(attempt: QuizGradingAttempt): ItemMark[] {
  return attempt.answers.flatMap((a): ItemMark[] => {
    if (a.type === "ESSAY") return [{ questionId: a.questionId, blankId: null, correct: a.correct }];
    if (a.type !== "FILL_BLANK") return [];
    return [...a.blanks]
      .sort((x, y) => x.position - y.position)
      .map((b) => ({ questionId: a.questionId, blankId: b.blankId, correct: b.correct }));
  });
}

/** The marks with one item set right or wrong. */
export function setMark(marks: ItemMark[], questionId: number, blankId: number | null, correct: boolean): ItemMark[] {
  return marks.map((m) => (m.questionId === questionId && m.blankId === blankId ? { ...m, correct } : m));
}

/** How many items are marked, for the "N of M marked" hint. */
export function markedCount(marks: ItemMark[]): number {
  return marks.filter((m) => m.correct !== null).length;
}

/**
 * Every item has a right or wrong. `marks` always holds one entry per leader-marked item: it is
 * seeded by `initialMarks` and re-seeded whenever the server's attempt changes.
 */
export function marksComplete(marks: ItemMark[]): boolean {
  return markedCount(marks) === marks.length;
}

/** The request body. Throws on an unmarked item: call it only once `marksComplete` holds. */
export function toMarkInput(marks: ItemMark[]): MarkAttemptInput {
  return {
    marks: marks.map(({ questionId, blankId, correct }) => {
      if (correct === null) throw new Error(`Question ${questionId} is not marked yet.`);
      return { questionId, blankId, correct };
    }),
  };
}
