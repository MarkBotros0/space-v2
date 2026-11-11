import { db } from "../../db/client";
import { ApiError } from "../api-error";
import { isUniqueViolation } from "../prisma-errors";
import { loadStudentVideoQuiz } from "../queries/video-quiz";
import { questionsOf, type VideoOwner } from "./owner";
import { recordPartAnswer } from "./part-progress";

type Progress = { furthestSeconds: number; completedAt: Date | null };

/**
 * Records a student's first and only answer to a video question and moves
 * their progress forward, in one transaction (refactor BE-004). A second answer
 * to the same question fails on the unique index (questionId, studentUserId) —
 * that index IS the "one answer, no retries" rule — and the caller answers the
 * race loser with the answer already recorded (spec 13 §10 D14). For a video
 * part the progress is the part's work row (`recordPartAnswer`).
 */
async function recordVideoAnswer(input: {
  owner: VideoOwner;
  studentUserId: number;
  question: { id: number; atSeconds: number };
  selectedIndex: number;
  isCorrect: boolean;
  isLast: boolean;
}): Promise<Progress> {
  const { owner, studentUserId, question, isLast } = input;
  // A part's answer is part work: it moves the part's own progress row.
  if ("partId" in owner) {
    const { partId } = owner;
    const { selectedIndex, isCorrect } = input;
    return recordPartAnswer({ partId, studentUserId, questionId: question.id, selectedIndex, isCorrect });
  }
  const { sessionId } = owner;
  return db.$transaction(async (tx) => {
    await tx.sessionVideoQuestionResponse.create({
      data: { questionId: question.id, studentUserId, selectedIndex: input.selectedIndex, isCorrect: input.isCorrect },
    });
    const current = await tx.sessionVideoProgress.findUnique({
      where: { sessionId_studentUserId: { sessionId, studentUserId } },
      select: { furthestSeconds: true, completedAt: true },
    });
    // Math.max, never `{ set: ... }`. v1 wrote the question's atSeconds
    // absolutely (spec 13 R57), twenty lines above a comment promising
    // furthestSeconds "only ever moves forward" — unreachable through its own
    // UI because the barrier forced ascending order, trivially reachable
    // through an API.
    const furthestSeconds = Math.max(current?.furthestSeconds ?? 0, question.atSeconds);
    // Completion is derived here and asserted nowhere (spec 13 D3).
    const completedAt = current?.completedAt ?? (isLast ? new Date() : null);
    return tx.sessionVideoProgress.upsert({
      where: { sessionId_studentUserId: { sessionId, studentUserId } },
      create: { sessionId, studentUserId, furthestSeconds, completedAt },
      update: { furthestSeconds, completedAt },
      select: { furthestSeconds: true, completedAt: true },
    });
  });
}

/**
 * Saves how far a student has watched: idempotent and monotone. Read-then-write
 * inside a transaction, because v1 did it outside one and two concurrent saves
 * (visibilitychange and unmount fire together) could persist the lower value
 * (spec 13 R64). completedAt is never set or cleared here: the answer path
 * derives it (spec 13 D3).
 */
export async function saveVideoProgressSeconds(
  sessionId: number,
  studentUserId: number,
  seconds: number,
): Promise<Progress> {
  return db.$transaction(async (tx) => {
    const current = await tx.sessionVideoProgress.findUnique({
      where: { sessionId_studentUserId: { sessionId, studentUserId } },
      select: { furthestSeconds: true, completedAt: true },
    });
    const furthestSeconds = Math.max(current?.furthestSeconds ?? 0, seconds);
    return tx.sessionVideoProgress.upsert({
      where: { sessionId_studentUserId: { sessionId, studentUserId } },
      create: { sessionId, studentUserId, furthestSeconds },
      update: { furthestSeconds },
      select: { furthestSeconds: true, completedAt: true },
    });
  });
}

type AnswerReply = {
  isCorrect: boolean;
  correctIndex: number;
  furthestSeconds: number;
  completedAt: Date | null;
  nextQuestionId: number | null;
};

/** The recorded verdict, replayed: a repeat answer, or the loser of a double tap. */
async function replay(owner: VideoOwner, studentUserId: number, question: { id: number; correctIndex: number }) {
  const recorded = await db.sessionVideoQuestionResponse.findUnique({
    where: { questionId_studentUserId: { questionId: question.id, studentUserId } },
    select: { isCorrect: true },
  });
  if (!recorded) return null;
  const after = await loadStudentVideoQuiz(owner, studentUserId);
  return {
    isCorrect: recorded.isCorrect,
    correctIndex: question.correctIndex,
    furthestSeconds: after?.furthestSeconds ?? 0,
    completedAt: after?.completedAt ?? null,
    nextQuestionId: after?.nextQuestionId ?? null,
  };
}

/**
 * POST …/answers for a session or a video part, after the route's gate: range
 * check from the row (v1 R53), replay of an earlier answer before ordering, the
 * order gate (D-13.2: only the earliest unanswered question, else 409
 * `out_of_order`), then the write. Losing the unique-index race reads as the
 * answer already recorded, never a 500 (spec 13 §10 D14). `correctIndex` goes
 * back for the question just answered, and only then: the first answer is final.
 */
export async function answerVideoQuestionFor(
  owner: VideoOwner,
  studentUserId: number,
  body: { questionId: number; selectedIndex: number },
): Promise<AnswerReply> {
  // Scoping the lookup by owner is what makes a mismatched pair a 404 (spec 13 §7).
  const question = await db.sessionVideoQuestion.findFirst({
    where: { id: body.questionId, ...questionsOf(owner) },
    select: { id: true, atSeconds: true, options: true, correctIndex: true },
  });
  if (!question) throw new ApiError("not_found", "Question not found.", 404);
  if (body.selectedIndex >= question.options.length) {
    throw new ApiError("invalid_answer", "That is not one of the options.", 400);
  }

  const data = await loadStudentVideoQuiz(owner, studentUserId);
  if (data === null)
    throw new ApiError("not_found", "sessionId" in owner ? "Session not found." : "Part not found.", 404);

  const replayed = await replay(owner, studentUserId, question);
  if (replayed) return replayed;
  if (data.nextQuestionId !== question.id) {
    throw new ApiError("out_of_order", "Answer the earlier questions first.", 409);
  }

  const isCorrect = body.selectedIndex === question.correctIndex;
  const isLast = data.answeredCount + 1 === data.questions.length;
  let progress: Progress;
  try {
    progress = await recordVideoAnswer({
      owner,
      studentUserId,
      question,
      selectedIndex: body.selectedIndex,
      isCorrect,
      isLast,
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return (
      (await replay(owner, studentUserId, question)) ?? {
        isCorrect,
        correctIndex: question.correctIndex,
        furthestSeconds: 0,
        completedAt: null,
        nextQuestionId: null,
      }
    );
  }

  const index = data.questions.findIndex((q) => q.id === question.id);
  const nextQuestionId = isLast ? null : (data.questions[index + 1]?.id ?? null);
  return { isCorrect, correctIndex: question.correctIndex, ...progress, nextQuestionId };
}
