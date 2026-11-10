import type { MarkAttemptInput } from "@space/shared";

import { db } from "../../db/client";
import { leaderMark, type MarkableQuestion } from "./marking";
import { sumScores } from "./score";

type LeaderMarkRow = {
  questionId: number;
  pointsAwarded: number;
  /** Whole-answer right/wrong: an essay's mark, or every blank of a FILL_BLANK right. */
  isCorrect: boolean | null;
  blankMarks: { blankId: number; correct: boolean }[];
};

/**
 * Records an attempt's leader marks and its new totals, all or none, and marks
 * it GRADED by the caller. autoScore is trusted as stored and never recomputed
 * (R73); the caller has checked every leader-marked item is marked exactly once.
 *
 * The answer row is upserted: an attempt that ended with a leader-marked
 * question unanswered still gets its 0 on record. A blank the student left
 * without a row has nothing to mark, so `updateMany` simply touches no row.
 */
export async function recordLeaderMarks(
  attemptId: number,
  perQuestion: LeaderMarkRow[],
  scores: { manualScore: number; totalScore: number },
  gradedById: number,
  gradedAt: Date,
): Promise<void> {
  await db.$transaction(async (tx) => {
    for (const q of perQuestion) {
      const mark = { pointsAwarded: q.pointsAwarded, isCorrect: q.isCorrect };
      const answer = await tx.quizAnswer.upsert({
        where: { attemptId_questionId: { attemptId, questionId: q.questionId } },
        create: { attemptId, questionId: q.questionId, ...mark },
        update: mark,
        select: { id: true },
      });
      for (const b of q.blankMarks) {
        await tx.quizAnswerBlank.updateMany({
          where: { answerId: answer.id, blankId: b.blankId },
          data: { isCorrect: b.correct },
        });
      }
    }
    await tx.quizAttempt.update({
      where: { id: attemptId },
      data: { ...scores, status: "GRADED", gradedById, gradedAt },
    });
  });
}

type Mark = MarkAttemptInput["marks"][number];
type Refusal = { code: "mark_out_of_range" | "marks_incomplete"; message: string; status: 400 | 409 };

/** A mark that names nothing markable in this attempt, or names an item twice. */
function outOfRange(byId: Map<number, MarkableQuestion>, marks: Mark[]): Refusal | null {
  const seen = new Set<string>();
  for (const m of marks) {
    const q = byId.get(m.questionId);
    const fits =
      q !== undefined && (q.type === "ESSAY" ? m.blankId === null : q.blanks.some((b) => b.id === m.blankId));
    if (!fits) return { code: "mark_out_of_range", message: "That mark is not for this attempt.", status: 400 };
    const key = `${m.questionId}:${m.blankId ?? "-"}`;
    if (seen.has(key)) return { code: "mark_out_of_range", message: "That item is marked twice.", status: 400 };
    seen.add(key);
  }
  return null;
}

/**
 * The leader's marks checked against the attempt's leader-marked questions and
 * turned into the rows to record. One mark per ESSAY (`blankId` null) and one
 * per blank of a FILL_BLANK, all required: a partial payload would otherwise
 * quietly lower the total (R72).
 */
export function planLeaderMarks(
  leaderQuestions: MarkableQuestion[],
  marks: Mark[],
): { refusal: Refusal } | { rows: LeaderMarkRow[]; manualScore: number } {
  const byId = new Map(leaderQuestions.map((q) => [q.id, q]));
  const refusal = outOfRange(byId, marks);
  if (refusal) return { refusal };

  const rows: LeaderMarkRow[] = [];
  for (const q of leaderQuestions) {
    const own = marks.filter((m) => m.questionId === q.id);
    const needed = q.type === "ESSAY" ? 1 : q.blanks.length;
    if (own.length !== needed) {
      return { refusal: { code: "marks_incomplete", message: "Mark every blank and essay first.", status: 409 } };
    }
    rows.push({
      questionId: q.id,
      pointsAwarded: leaderMark(q, own),
      isCorrect: own.every((m) => m.correct),
      blankMarks: own.flatMap((m) => (m.blankId === null ? [] : [{ blankId: m.blankId, correct: m.correct }])),
    });
  }
  return { rows, manualScore: sumScores(rows.map((r) => r.pointsAwarded)) };
}
