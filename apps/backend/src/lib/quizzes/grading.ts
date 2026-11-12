import type { MarkAttemptInput } from "@space/shared";

import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { ApiError } from "../api-error";
import { lockSeasonForStaffWrite } from "../seasons/staff-write-lock";
import { lockAttempt, STORED_ANSWER_SELECT } from "./mark-and-close";
import {
  hasAnswerText,
  leaderMark,
  MARKABLE_QUESTION_SELECT,
  toMarkable,
  type MarkableQuestion,
  type StoredAnswer,
} from "./marking";
import { round2, sumScores, toScore } from "./score";

type LeaderMarkRow = {
  questionId: number;
  pointsAwarded: number;
  /** Whole-answer right/wrong: an essay given all its points, or every blank of a FILL_BLANK right. */
  isCorrect: boolean | null;
  blankMarks: { blankId: number; correct: boolean }[];
};

type Mark = MarkAttemptInput["marks"][number];
type Refusal = { code: "mark_out_of_range" | "marks_incomplete"; message: string; status: 400 | 409 };

const itemKey = (questionId: number, blankId: number | null) => `${questionId}:${blankId ?? "-"}`;

/**
 * The leader-marked items the student left empty, as `itemKey`s. Ruling C-a:
 * they were marked wrong when the attempt closed and are never the leader's to mark.
 */
function emptyItems(questions: MarkableQuestion[], answerBy: Map<number, StoredAnswer>): Set<string> {
  const empty = new Set<string>();
  for (const q of questions) {
    const a = answerBy.get(q.id);
    if (q.type === "ESSAY" && !hasAnswerText(a?.text)) empty.add(itemKey(q.id, null));
    for (const b of q.type === "FILL_BLANK" ? q.blanks : []) {
      if (!hasAnswerText(a?.blanks.find((x) => x.blankId === b.id)?.text)) empty.add(itemKey(q.id, b.id));
    }
  }
  return empty;
}

/**
 * Points belong to essays only, whole and at most the question's points (owner 2026-11-13); a
 * blank is right or wrong.
 */
function markShapeRefusal(q: MarkableQuestion, m: Mark): Refusal | null {
  if (m.points === undefined) return null;
  if (q.type !== "ESSAY") {
    return { code: "mark_out_of_range", message: "Mark each blank right or wrong.", status: 400 };
  }
  if (m.points > q.points) {
    return { code: "mark_out_of_range", message: `This question is worth ${q.points} at most.`, status: 400 };
  }
  return null;
}

/** A mark that names nothing markable in this attempt, names an item twice, or names an empty one. */
function outOfRange(byId: Map<number, MarkableQuestion>, marks: Mark[], empty: ReadonlySet<string>): Refusal | null {
  const seen = new Set<string>();
  for (const m of marks) {
    const q = byId.get(m.questionId);
    const fits =
      q !== undefined && (q.type === "ESSAY" ? m.blankId === null : q.blanks.some((b) => b.id === m.blankId));
    if (!fits) return { code: "mark_out_of_range", message: "That mark is not for this attempt.", status: 400 };
    const shapeRefusal = markShapeRefusal(q, m);
    if (shapeRefusal) return shapeRefusal;
    const key = itemKey(m.questionId, m.blankId);
    if (empty.has(key)) {
      return { code: "mark_out_of_range", message: "That item was left empty, so it is already wrong.", status: 400 };
    }
    if (seen.has(key)) return { code: "mark_out_of_range", message: "That item is marked twice.", status: 400 };
    seen.add(key);
  }
  return null;
}

/**
 * The leader's marks checked against the attempt's leader-marked questions and
 * turned into the rows to record. One mark per ESSAY (`blankId` null) and one
 * per blank of a FILL_BLANK, all required except the `empty` ones (C-a), which
 * count as wrong: a partial payload would otherwise quietly lower the total
 * (R72). A question left wholly empty was recorded at close and needs no row.
 */
export function planLeaderMarks(
  leaderQuestions: MarkableQuestion[],
  marks: Mark[],
  empty: ReadonlySet<string> = new Set(),
): { refusal: Refusal } | { rows: LeaderMarkRow[]; manualScore: number } {
  const byId = new Map(leaderQuestions.map((q) => [q.id, q]));
  const refusal = outOfRange(byId, marks, empty);
  if (refusal) return { refusal };

  const rows: LeaderMarkRow[] = [];
  for (const q of leaderQuestions) {
    const own = marks.filter((m) => m.questionId === q.id);
    const items: (number | null)[] = q.type === "ESSAY" ? [null] : q.blanks.map((b) => b.id);
    const needed = items.filter((blankId) => !empty.has(itemKey(q.id, blankId))).length;
    if (own.length !== needed) {
      return { refusal: { code: "marks_incomplete", message: "Mark every blank and essay first.", status: 409 } };
    }
    if (needed === 0) continue;
    const pointsAwarded = leaderMark(q, own);
    rows.push({
      questionId: q.id,
      pointsAwarded,
      // Whole-answer right only when it earned every point: an essay given part of its points is
      // not right (the student sees "Partly right" from the points), nor a blank marked wrong.
      isCorrect:
        q.type === "ESSAY" ? pointsAwarded >= q.points : own.length === items.length && own.every((m) => m.correct),
      blankMarks: own.flatMap((m) => (m.blankId === null ? [] : [{ blankId: m.blankId, correct: m.correct === true }])),
    });
  }
  return { rows, manualScore: sumScores(rows.map((r) => r.pointsAwarded)) };
}

/** Writes the marks. Every marked blank was answered, so its row exists; `update` fails loudly if not (C-b). */
async function recordLeaderMarks(tx: Prisma.TransactionClient, attemptId: number, rows: LeaderMarkRow[]) {
  for (const q of rows) {
    const mark = { pointsAwarded: q.pointsAwarded, isCorrect: q.isCorrect };
    const answer = await tx.quizAnswer.update({
      where: { attemptId_questionId: { attemptId, questionId: q.questionId } },
      data: mark,
      select: { id: true },
    });
    for (const b of q.blankMarks) {
      await tx.quizAnswerBlank.update({
        where: { answerId_blankId: { answerId: answer.id, blankId: b.blankId } },
        data: { isCorrect: b.correct },
      });
    }
  }
}

/**
 * A leader marks a closed attempt: checked, recorded and GRADED, all or none,
 * under the Season FOR SHARE (`lockSeasonForStaffWrite`: a re-grade of a GRADED
 * attempt lands wholly before End's recompute or waits and finds the season
 * ended) and then the attempt row lock (C-c), so two first grades at once run one after
 * the other and only the first sees a change. autoScore is trusted as stored
 * and never recomputed (R73): recomputing it would need the questions as they
 * were when taken, which nothing records. `scoreChanged` is D8's rule for
 * telling the student: a first grade or a different total, never a re-save.
 */
export async function gradeAttempt(
  quizId: number,
  attemptId: number,
  marks: Mark[],
  gradedById: number,
  season: { id: number; mayWriteFinished: boolean },
): Promise<{ scoreChanged: boolean }> {
  return db.$transaction(async (tx) => {
    await lockSeasonForStaffWrite(tx, season.id, season.mayWriteFinished);
    const locked = await lockAttempt(tx, attemptId);
    if (!locked || locked.status === "IN_PROGRESS") {
      throw new ApiError("attempt_not_submitted", "This attempt has not been submitted.", 409);
    }
    // Sequential: one transaction is one connection (pg warns on parallel queries on it).
    const rows = await tx.quizQuestion.findMany({
      where: { quizId, type: { in: ["FILL_BLANK", "ESSAY"] } },
      select: MARKABLE_QUESTION_SELECT,
    });
    const answers = await tx.quizAnswer.findMany({ where: { attemptId }, select: STORED_ANSWER_SELECT });
    const attempt = await tx.quizAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      select: { autoScore: true, totalScore: true },
    });
    const questions = rows.map(toMarkable);
    const answerBy = new Map<number, StoredAnswer>(answers.map((a) => [a.questionId, a]));
    const plan = planLeaderMarks(questions, marks, emptyItems(questions, answerBy));
    if ("refusal" in plan) throw new ApiError(plan.refusal.code, plan.refusal.message, plan.refusal.status);

    const totalScore = round2((toScore(attempt.autoScore) ?? 0) + plan.manualScore);
    const scoreChanged = locked.status !== "GRADED" || toScore(attempt.totalScore) !== totalScore;
    await recordLeaderMarks(tx, attemptId, plan.rows);
    await tx.quizAttempt.update({
      where: { id: attemptId },
      data: {
        manualScore: plan.manualScore,
        totalScore,
        status: "GRADED",
        // Nothing marked (every leader item was left empty, GRADED at close): nobody graded it (R64),
        // so a re-save of an empty payload leaves gradedById and gradedAt as they are.
        ...(plan.rows.length > 0 ? { gradedById, gradedAt: new Date() } : {}),
      },
    });
    return { scoreChanged };
  });
}
