import type { QuizQuestionStudent, StudentQuizDetail } from "@space/shared";

import { db } from "../../db/client";

/**
 * The student projection.
 *
 * NEVER SELECTS correctIndex. v1's equivalent had exactly this property and
 * said so in a comment (quiz-query.ts:373-374) — but it lived in the same file
 * as the two reads that DO return the key, so the protection was one "let's
 * reuse this query" refactor away from evaporating.
 *
 * What protects it here, stated exactly (no stronger claim):
 * 1. The raw-JSON integration test — the guarantee. It fails on any
 *    path by which the key reaches the response.
 * 2. `toStudentQuestion` below returns an object LITERAL typed as the shared
 *    `QuizQuestionStudent`, so TypeScript's excess-property check rejects a
 *    `correctIndex: q.correctIndex` line added to it. It does NOT catch a
 *    spread (`...q`) or a select widened and passed through some other way —
 *    structural typing allows extra keys on non-literals — which is why (1)
 *    exists and is the one that must never be weakened.
 * The loader's return type is `StudentQuizDetailRow`: the shared wire type
 * with its two timestamps as `Date` (the backend hands Dates to res.json()).
 */
type StudentQuizDetailRow = Omit<StudentQuizDetail, "submittedAt" | "gradedAt"> & {
  submittedAt: Date | null;
  gradedAt: Date | null;
};

interface StudentQuestionSource {
  id: number;
  order: number;
  type: "MCQ" | "ESSAY";
  prompt: string;
  points: number;
  options: string[];
}
interface StudentAnswerSource {
  selectedIndex: number | null;
  text: string | null;
  isCorrect: boolean | null;
  pointsAwarded: number | null;
}

function toStudentQuestion(
  q: StudentQuestionSource,
  a: StudentAnswerSource | undefined,
): QuizQuestionStudent {
  return {
    id: q.id,
    order: q.order,
    type: q.type,
    prompt: q.prompt,
    points: q.points,
    options: q.options,
    selectedIndex: a?.selectedIndex ?? null,
    text: a?.text ?? null,
    // Null until submit (R52/R54), so nothing leaks mid-attempt.
    isCorrect: a?.isCorrect ?? null,
    pointsAwarded: a?.pointsAwarded ?? null,
  };
}

export async function loadStudentQuizDetail(
  quizId: number,
  studentUserId: number,
  readOnly: boolean,
): Promise<StudentQuizDetailRow | null> {
  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: {
      id: true,
      title: true,
      kind: true,
      seasonId: true,
      maxScore: true,
      publishedAt: true,
      session: { select: { title: true } },
      questions: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          type: true,
          prompt: true,
          points: true,
          options: true,
          // correctIndex is absent on purpose. Do not add it "for the review
          // screen" — the student's own isCorrect/pointsAwarded is the review.
        },
      },
    },
  });
  // R32: a non-ONLINE or unpublished quiz simply does not exist for a student.
  if (!quiz || quiz.kind !== "ONLINE" || quiz.publishedAt === null) return null;

  const attempt = await db.quizAttempt.findFirst({
    where: { quizId, studentUserId },
    orderBy: { attemptNumber: "desc" },
    select: {
      id: true,
      attemptNumber: true,
      status: true,
      totalScore: true,
      submittedAt: true,
      gradedAt: true,
      answers: {
        select: {
          questionId: true,
          selectedIndex: true,
          text: true,
          isCorrect: true,
          pointsAwarded: true,
        },
      },
    },
  });
  const answerByQuestion = new Map((attempt?.answers ?? []).map((a) => [a.questionId, a]));

  return {
    id: quiz.id,
    title: quiz.title,
    kind: quiz.kind,
    seasonId: quiz.seasonId,
    maxScore: quiz.maxScore,
    sessionTitle: quiz.session?.title ?? null,
    attemptId: attempt?.id ?? null,
    attemptNumber: attempt?.attemptNumber ?? 0,
    status: attempt?.status ?? null,
    // autoScore/manualScore deliberately absent: v1 sent both and rendered
    // neither. totalScore is the only score a student is shown.
    totalScore: attempt?.totalScore ?? null,
    submittedAt: attempt?.submittedAt ?? null,
    gradedAt: attempt?.gradedAt ?? null,
    questions: quiz.questions.map((q) => toStudentQuestion(q, answerByQuestion.get(q.id))),
    readOnly,
  };
}
