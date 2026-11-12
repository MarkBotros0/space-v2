import type { QuizQuestionStudent, StudentQuizDetail } from "@space/shared";

import { db } from "../../db/client";
import { ADMIN_SCORE_WHERE } from "../../lib/quizzes/admin-score";
import type { Prisma } from "../../generated/prisma/client";
import { bestGraded, countingScore } from "../../lib/quizzes/best-attempt";
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
 *   answers — only the score once graded. The admin's score (plan 4) is the score
 *   whenever there is one, and reads as `graded` on its own.
 * - `answers` (released): the best graded attempt's questions with its answers,
 *   right/wrong per item and the correct answer. The only read that loads the key.
 *   It needs an in-app graded attempt: the admin's score alone never reaches it.
 *
 * What protects the key, stated exactly: (1) the raw-JSON integration tests,
 * the guarantee; (2) no pre-release path selects `isCorrect`, `matchId` or
 * `expected` (see lib/quizzes/student-question.ts); (3) `toStudentQuestion`
 * reads nothing of the key unless asked for a review, and refuses a review
 * from a keyless row. The loader's return type is the shared wire type with
 * its two timestamps as `Date` (the backend hands Dates to res.json()).
 */
type StudentQuizDetailRow = Omit<
  StudentQuizDetail,
  "submittedAt" | "gradedAt" | "startsFrom" | "startsUntil" | "deadlineAt" | "serverNow"
> & {
  submittedAt: Date | null;
  gradedAt: Date | null;
  startsFrom: Date | null;
  startsUntil: Date | null;
  deadlineAt: Date | null;
  serverNow: Date;
};

type AttemptRow = {
  id: number;
  attemptNumber: number;
  status: "IN_PROGRESS" | "SUBMITTED" | "GRADED";
  totalScore: Prisma.Decimal | null;
  shuffleSeed: number;
  submittedAt: Date | null;
  gradedAt: Date | null;
  deadlineAt: Date | null;
  endReason: StudentQuizDetail["endReason"];
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
      startsFrom: true,
      startsUntil: true,
      timeLimitMinutes: true,
      // "Answers released" since the quiz-types plan; the column keeps its name.
      resultsReleasedAt: true,
      session: { select: { title: true } },
      _count: { select: { questions: true } },
    },
  });
  // R32: a non-ONLINE or unpublished quiz simply does not exist for a student.
  if (!quiz || quiz.kind !== "ONLINE" || quiz.publishedAt === null) return null;

  const adminRow = await db.quizGrade.findFirst({
    where: { quizId, studentUserId, ...ADMIN_SCORE_WHERE },
    select: { score: true, notes: true, gradedAt: true },
  });
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
      deadlineAt: true,
      endReason: true,
    },
  });
  const latest = attempts[0] ?? null;
  const best = bestGraded(attempts);
  const answersReleased = quiz.resultsReleasedAt !== null;
  const stage = studentQuizStage(latest, best !== null, answersReleased, adminRow !== null);

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
    ...attemptFields(latest),
    ...scoreFields(adminRow, attempts, best),
    stage,
    questionCount: quiz._count.questions,
    questions,
    readOnly,
    answersReleased,
    startsFrom: quiz.startsFrom,
    startsUntil: quiz.startsUntil,
    timeLimitMinutes: quiz.timeLimitMinutes,
    deadlineAt: latest?.deadlineAt ?? null,
    // The countdown's reference: the phone corrects its own clock by this.
    serverNow: new Date(),
    endReason: latest?.endReason ?? null,
  };
}

/** The latest attempt's place. */
function attemptFields(latest: AttemptRow | null) {
  return {
    attemptId: latest?.id ?? null,
    attemptNumber: latest?.attemptNumber ?? 0,
    status: latest?.status ?? null,
    submittedAt: latest?.submittedAt ?? null,
  };
}

type AdminRow = { score: Prisma.Decimal | null; notes: string | null; gradedAt: Date | null };

/**
 * The score the student is shown and when it was given: the admin's score when there is one
 * (plan 4, with its note), else the best graded attempt's. autoScore/manualScore are deliberately
 * absent: v1 sent both and rendered neither. totalScore is the only score a student is shown.
 */
function scoreFields(adminRow: AdminRow | null, attempts: AttemptRow[], best: AttemptRow | null) {
  const counting = countingScore(adminRow, attempts);
  const adminScore =
    adminRow && counting?.source === "manual" ? { score: counting.score, notes: adminRow.notes } : null;
  return {
    totalScore: counting?.score ?? null,
    gradedAt: adminScore ? (adminRow?.gradedAt ?? null) : (best?.gradedAt ?? null),
    adminScore,
  };
}
