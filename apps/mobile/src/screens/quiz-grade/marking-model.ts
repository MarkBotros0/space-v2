/**
 * The leader's marks for one attempt, pure (spec "Marking (leaders)"). One mark per blank of each
 * fill-in-the-blank question, right or wrong, and one per essay (`blankId: null`), the points
 * given from 0 to the question's points (owner 2026-11-13: "I can give 1 mark from a total of 2").
 * Every other type is marked by the server, and so is a blank or essay left empty (wrong). The
 * server refuses a partial payload (`marks_incomplete`), so the sheet saves only once
 * `marksComplete` holds.
 */
import type { MarkAttemptInput, QuizGradingAttempt } from "@space/shared";

/**
 * One item's mark as the leader has it so far. A blank uses `correct` (null = not marked yet); an
 * essay (`blankId` null) uses `points` (null = not marked yet), out of `max`.
 */
export type ItemMark = {
  questionId: number;
  blankId: number | null;
  correct: boolean | null;
  points: number | null;
  max: number;
};

/**
 * A blank or essay the student left empty: the server marked it wrong when the attempt closed and
 * refuses a mark on it, so it is shown as wrong and never offered for marking.
 */
export function isLeftEmpty(text: string | null): boolean {
  return (text ?? "").trim().length === 0;
}

/**
 * An essay's points as the server holds them, whole and within the question's points, or null when
 * not marked yet. Points from before marks were whole (v1 allowed any) round to the nearest.
 */
function essayPoints(pointsAwarded: number | null, max: number): number | null {
  if (pointsAwarded === null) return null;
  return Math.min(max, Math.max(0, Math.round(pointsAwarded)));
}

/** The leader-marked items the student answered, in the author's order, seeded from what the server holds. */
export function initialMarks(attempt: QuizGradingAttempt): ItemMark[] {
  return attempt.answers.flatMap((a): ItemMark[] => {
    if (a.type === "ESSAY") {
      if (isLeftEmpty(a.text)) return [];
      return [
        {
          questionId: a.questionId,
          blankId: null,
          correct: null,
          points: essayPoints(a.pointsAwarded, a.points),
          max: a.points,
        },
      ];
    }
    if (a.type !== "FILL_BLANK") return [];
    return [...a.blanks]
      .sort((x, y) => x.position - y.position)
      .filter((b) => !isLeftEmpty(b.text))
      .map((b) => ({ questionId: a.questionId, blankId: b.blankId, correct: b.correct, points: null, max: 0 }));
  });
}

/** The marks with one blank set right or wrong. */
export function setMark(marks: ItemMark[], questionId: number, blankId: number, correct: boolean): ItemMark[] {
  return marks.map((m) => (m.questionId === questionId && m.blankId === blankId ? { ...m, correct } : m));
}

/** The marks with one essay given `points`, kept whole and within 0 and its points. */
export function setPoints(marks: ItemMark[], questionId: number, points: number): ItemMark[] {
  return marks.map((m) =>
    m.questionId === questionId && m.blankId === null
      ? { ...m, points: Math.min(m.max, Math.max(0, Math.round(points))) }
      : m,
  );
}

const isMarked = (m: ItemMark) => (m.blankId === null ? m.points !== null : m.correct !== null);

/** How many items are marked, for the "N of M marked" hint. */
export function markedCount(marks: ItemMark[]): number {
  return marks.filter(isMarked).length;
}

/**
 * Every item has its mark. `marks` always holds one entry per leader-marked item: it is seeded by
 * `initialMarks` and re-seeded whenever the server's attempt changes.
 */
export function marksComplete(marks: ItemMark[]): boolean {
  return markedCount(marks) === marks.length;
}

/** The request body. Throws on an unmarked item: call it only once `marksComplete` holds. */
export function toMarkInput(marks: ItemMark[]): MarkAttemptInput {
  return {
    marks: marks.map(({ questionId, blankId, correct, points }) => {
      if (blankId === null) {
        if (points === null) throw new Error(`Question ${questionId} is not marked yet.`);
        return { questionId, blankId, points };
      }
      if (correct === null) throw new Error(`Question ${questionId} is not marked yet.`);
      return { questionId, blankId, correct };
    }),
  };
}
