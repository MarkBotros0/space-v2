import type { QuizQuestionStudent, StudentQuizDetail } from "@space/shared";

import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { toScore } from "../../lib/quizzes/score";
import { bestGraded } from "../../lib/quizzes/best-attempt";
import { seededOrder } from "../../lib/quizzes/shuffle";
import { studentQuizStage } from "../../lib/quizzes/student-stage";
import {
  REVIEW_ANSWER_SELECT,
  REVIEW_QUESTION_SELECT,
  STUDENT_ANSWER_SELECT,
  STUDENT_QUESTION_SELECT,
  toStudentQuestion,
  type StudentAnswerRow,
  type StudentQuestionRow,
} from "../../lib/quizzes/student-question";

/**
 * The student projection, in stages (spec "What students see"):
 *
 * - `in_progress`: every question with the student's own answers, in this
 *   attempt's shuffled order. Loaded with the KEYLESS selects.
 * - `submitted` / `graded`: no questions at all — no text, no options, no own
 *   answers — only the score once graded.
 * - `answers` (released): the best graded attempt's questions with its answers,
 *   right/wrong per item and the correct answer. The only read that loads the key.
 *
 * What protects the key, stated exactly: (1) the raw-JSON integration tests,
 * the guarantee; (2) no pre-release path selects `isCorrect`, `matchId` or
 * `expected` (see lib/quizzes/student-question.ts); (3) `toStudentQuestion`
 * reads nothing of the key unless asked for a review, and refuses a review
 * from a keyless row. The loader's return type is the shared wire type with
 * its two timestamps as `Date` (the backend hands Dates to res.json()).
 */
type StudentQuizDetailRow = Omit<StudentQuizDetail, "submittedAt" | "gradedAt"> & {
  submittedAt: Date | null;
  gradedAt: Date | null;
};

type AttemptRow = {
  id: number;
  attemptNumber: number;
  status: "IN_PROGRESS" | "SUBMITTED" | "GRADED";
  totalScore: Prisma.Decimal | null;
  shuffleSeed: number;
  submittedAt: Date | null;
  gradedAt: Date | null;
};

/** Question order for an attempt: shuffled by its seed when the quiz says so, else the author's. */
function orderFor<Q extends { id: number; order: number }>(questions: Q[], shuffle: boolean, seed: number): Q[] {
  return shuffle ? seededOrder(questions, seed, 0) : [...questions].sort((a, b) => a.order - b.order);
}

function project(
  questions: StudentQuestionRow[],
  answers: (StudentAnswerRow & { questionId: number })[],
  opts: { shuffle: boolean; seed: number; withReview: boolean },
): QuizQuestionStudent[] {
  const byQuestion = new Map(answers.map((a) => [a.questionId, a]));
  return orderFor(questions, opts.shuffle, opts.seed).map((q) =>
    toStudentQuestion(q, byQuestion.get(q.id), { seed: opts.seed, withReview: opts.withReview }),
  );
}

/** The open attempt's questions, keyless. */
async function inProgressQuestions(quizId: number, attempt: AttemptRow, shuffle: boolean) {
  const [questions, answers] = await Promise.all([
    db.quizQuestion.findMany({ where: { quizId }, select: STUDENT_QUESTION_SELECT }),
    db.quizAnswer.findMany({ where: { attemptId: attempt.id }, select: STUDENT_ANSWER_SELECT }),
  ]);
  return project(questions, answers, { shuffle, seed: attempt.shuffleSeed, withReview: false });
}

/** The best graded attempt's questions with the key and the marks. Only once answers are released. */
async function reviewQuestions(quizId: number, attempt: AttemptRow, shuffle: boolean) {
  const [questions, answers] = await Promise.all([
    db.quizQuestion.findMany({ where: { quizId }, select: REVIEW_QUESTION_SELECT }),
    db.quizAnswer.findMany({ where: { attemptId: attempt.id }, select: REVIEW_ANSWER_SELECT }),
  ]);
  return project(questions, answers, { shuffle, seed: attempt.shuffleSeed, withReview: true });
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
      shuffleQuestions: true,
      // "Answers released" since the quiz-types plan; the column keeps its name.
      resultsReleasedAt: true,
      session: { select: { title: true } },
      _count: { select: { questions: true } },
    },
  });
  // R32: a non-ONLINE or unpublished quiz simply does not exist for a student.
  if (!quiz || quiz.kind !== "ONLINE" || quiz.publishedAt === null) return null;

  const attempts: AttemptRow[] = await db.quizAttempt.findMany({
    where: { quizId, studentUserId },
    orderBy: { attemptNumber: "desc" },
    select: {
      id: true,
      attemptNumber: true,
      status: true,
      totalScore: true,
      shuffleSeed: true,
      submittedAt: true,
      gradedAt: true,
    },
  });
  const latest = attempts[0] ?? null;
  const best = bestGraded(attempts);
  const answersReleased = quiz.resultsReleasedAt !== null;
  const stage = studentQuizStage(latest, best !== null, answersReleased);

  let questions: QuizQuestionStudent[] = [];
  if (stage === "in_progress" && latest) questions = await inProgressQuestions(quizId, latest, quiz.shuffleQuestions);
  if (stage === "answers" && best) questions = await reviewQuestions(quizId, best, quiz.shuffleQuestions);

  return {
    id: quiz.id,
    title: quiz.title,
    kind: quiz.kind,
    seasonId: quiz.seasonId,
    maxScore: quiz.maxScore,
    sessionTitle: quiz.session?.title ?? null,
    ...attemptFields(latest, best),
    stage,
    questionCount: quiz._count.questions,
    questions,
    readOnly,
    answersReleased,
  };
}

/** The latest attempt's place, and the best graded attempt's score. */
function attemptFields(latest: AttemptRow | null, best: AttemptRow | null) {
  return {
    attemptId: latest?.id ?? null,
    attemptNumber: latest?.attemptNumber ?? 0,
    status: latest?.status ?? null,
    // autoScore/manualScore deliberately absent: v1 sent both and rendered
    // neither. totalScore is the only score a student is shown — the best graded one.
    totalScore: best ? toScore(best.totalScore) : null,
    submittedAt: latest?.submittedAt ?? null,
    gradedAt: best?.gradedAt ?? null,
  };
}
