import type { Express } from "express";

import { db } from "../../db/client";
import type { QuizQuestionType } from "../../generated/prisma/enums";
import { addQuizQuestion } from "../../lib/quizzes/questions";
import type { QuizQuestionRequest } from "../../lib/quizzes/question-rows";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

/**
 * Shared fixtures for the quizzes-*-routes integration suites. Each suite
 * calls seedQuizFixtures() from its own beforeAll and cleanupTestData() from
 * its own afterAll, so every file creates and removes its own rows.
 */
export interface QuizFixtures {
  seasonId: number;
  otherSeasonId: number;
  sessionId: number;
  ownStudentId: number;
  otherGroupStudentId: number;
  superToken: string;
  adminToken: string;
  otherAdminToken: string;
  leaderToken: string;
  studentToken: string;
}

export async function seedQuizFixtures(app: Express): Promise<QuizFixtures> {
  await cleanupTestData();

  const season = await createTestSeason();
  const seasonId = season.id;
  const otherSeason = await createTestSeason();
  const otherSeasonId = otherSeason.id;

  const superUser = await createTestUser("super", "SUPER");
  const admin = await createTestUser("admin", "ADMIN");
  const otherAdmin = await createTestUser("otheradmin", "ADMIN");
  const leader = await createTestUser("leader", "LEADER");
  const student = await createTestUser("student", "STUDENT");
  const otherStudent = await createTestUser("otherstudent", "STUDENT");
  const ownStudentId = student.id;
  const otherGroupStudentId = otherStudent.id;

  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  // The D1 fixture: an ADMIN of a DIFFERENT season. v1 let this user write
  // grades into any season at all, because its season check ran only for LEADER.
  await db.seasonAdmin.create({ data: { seasonId: otherSeasonId, userId: otherAdmin.id } });

  const groupA = await db.group.create({
    data: {
      seasonId,
      name: "Group A",
      leaders: { create: { userId: leader.id } },
      students: { create: { studentUserId: student.id } },
    },
    select: { id: true },
  });
  const groupB = await db.group.create({
    data: { seasonId, name: "Group B" },
    select: { id: true },
  });

  // Ruling C9: membership for a season is the enrolment's groupId, not
  // its GroupStudent mirror.
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: student.id, groupId: groupA.id, status: "ACTIVE" },
      { seasonId, studentUserId: otherStudent.id, groupId: groupB.id, status: "ACTIVE" },
    ],
  });

  const session = await db.session.create({
    data: {
      seasonId,
      title: "Week 1",
      startsAt: new Date("2099-03-01T18:00:00.000Z"),
      durationMinutes: 90,
    },
    select: { id: true },
  });
  const sessionId = session.id;

  const superToken = await login(app, superUser.email);
  const adminToken = await login(app, admin.email);
  const otherAdminToken = await login(app, otherAdmin.email);
  const leaderToken = await login(app, leader.email);
  const studentToken = await login(app, student.email);

  return {
    seasonId,
    otherSeasonId,
    sessionId,
    ownStudentId,
    otherGroupStudentId,
    superToken,
    adminToken,
    otherAdminToken,
    leaderToken,
    studentToken,
  };
}

/**
 * QUIZ_GRADED rows for the suite's student. v1's link for this type is the
 * bare list path `/student/quizzes` (ruling X1), so a row cannot be tied to
 * one quiz by its link — and every quiz in this file grades the same
 * `ownStudentId`, while notifications are only cleaned in beforeAll/afterAll.
 * So every notification assertion in Tasks 4–6 is a DELTA from a baseline
 * taken inside the same test, never an absolute count. The suite runs
 * --runInBand and `ownStudentId` belongs to this file alone, so nothing else
 * writes these rows mid-test. (Tasks 5 and 6 append below and reuse this.)
 */
export async function quizGradedCountFor(ownStudentId: number): Promise<number> {
  return db.notification.count({
    where: { userId: ownStudentId, type: "QUIZ_GRADED", link: "/student/quizzes" },
  });
}

type SampleType = Exclude<QuizQuestionType, "MCQ">;

/** One sample question per type, for quizzes that need a mix. */
const SAMPLE_BY_TYPE: Record<SampleType, QuizQuestionRequest> = {
  SINGLE_CHOICE: {
    type: "SINGLE_CHOICE",
    prompt: "Capital of France?",
    points: 2,
    options: [
      { label: "London", isCorrect: false },
      { label: "Paris", isCorrect: true },
    ],
  },
  MULTI_CHOICE: {
    type: "MULTI_CHOICE",
    prompt: "Pick the primes",
    points: 3,
    options: [
      { label: "2", isCorrect: true },
      { label: "3", isCorrect: true },
      { label: "4", isCorrect: false },
    ],
  },
  TRUE_FALSE: { type: "TRUE_FALSE", prompt: "The sky is blue.", points: 1, correct: true },
  MATCHING: {
    type: "MATCHING",
    prompt: "Match country to capital",
    points: 4,
    pairs: [
      { left: "France", right: "Paris" },
      { left: "Italy", right: "Rome" },
    ],
  },
  FILL_BLANK: { type: "FILL_BLANK", prompt: "Paris is in {{blank}}.", points: 2, answers: ["France"] },
  ESSAY: { type: "ESSAY", prompt: "Discuss the reading.", points: 5 },
};

/**
 * A published ONLINE quiz built through `addQuizQuestion`: one single-choice
 * question (2 points), an essay (5) when `withEssay`, then one sample of each
 * `withTypes` entry in order. Released by default, so suites about grading see
 * what a student sees once results are out; `released: false` holds them back
 * (quizzes-release-routes). `mcqId` is the single-choice question's id (the
 * name predates the six types); `questionIds` lists every question in order.
 */
export async function buildPublishedQuizIn(
  seasonId: number,
  sessionId: number,
  opts: { withEssay: boolean; withTypes?: SampleType[]; released?: boolean },
) {
  const quiz = await db.quiz.create({
    data: { seasonId, sessionId, title: "Runner quiz", kind: "ONLINE", maxScore: 0 },
    select: { id: true },
  });
  const choice = await addQuizQuestion(quiz.id, SAMPLE_BY_TYPE.SINGLE_CHOICE);
  const questionIds = [choice.id];
  let essayId = 0;
  if (opts.withEssay) {
    essayId = (await addQuizQuestion(quiz.id, SAMPLE_BY_TYPE.ESSAY)).id;
    questionIds.push(essayId);
  }
  for (const type of opts.withTypes ?? []) {
    questionIds.push((await addQuizQuestion(quiz.id, SAMPLE_BY_TYPE[type])).id);
  }
  // addQuizQuestion keeps maxScore at the sum of question points.
  await db.quiz.update({
    where: { id: quiz.id },
    data: { publishedAt: new Date(), resultsReleasedAt: opts.released === false ? null : new Date() },
  });
  return { quizId: quiz.id, mcqId: choice.id, essayId, questionIds };
}

/**
 * Moves the student's latest attempt straight to SUBMITTED or GRADED, as the
 * submit and marking paths would leave it, without going through them. The
 * student-read suites test what each stage shows, not how it is reached.
 */
export async function setLatestAttempt(
  quizId: number,
  studentUserId: number,
  data: { status: "SUBMITTED" | "GRADED"; totalScore?: number },
): Promise<number> {
  const latest = await db.quizAttempt.findFirstOrThrow({
    where: { quizId, studentUserId },
    orderBy: { attemptNumber: "desc" },
    select: { id: true },
  });
  const now = new Date();
  const score = data.totalScore ?? 0;
  await db.quizAttempt.update({
    where: { id: latest.id },
    data:
      data.status === "GRADED"
        ? { status: "GRADED", submittedAt: now, autoScore: score, manualScore: 0, totalScore: score, gradedAt: now }
        : { status: "SUBMITTED", submittedAt: now },
  });
  return latest.id;
}

/** A question's option and blank rows with their key, in author order, for building answers and marks. */
export async function keyOf(questionId: number) {
  const [options, blanks] = await Promise.all([
    db.quizOption.findMany({
      where: { questionId },
      orderBy: { position: "asc" },
      select: { id: true, label: true, isCorrect: true, side: true, matchId: true },
    }),
    db.quizBlank.findMany({ where: { questionId }, orderBy: { position: "asc" }, select: { id: true } }),
  ]);
  const optionId = (label: string) => {
    const found = options.find((o) => o.label === label);
    if (!found) throw new Error(`No option "${label}" on question ${questionId}`);
    return found.id;
  };
  return {
    optionId,
    lefts: options.filter((o) => o.side === "LEFT"),
    rights: options.filter((o) => o.side === "RIGHT"),
    blankIds: blanks.map((b) => b.id),
  };
}

/** Stores a pick of the option labelled `label`, marked as given, and returns the option id. */
export async function pickOption(
  attemptId: number,
  questionId: number,
  label: string,
  mark: { isCorrect: boolean; pointsAwarded: number },
): Promise<number> {
  const option = await db.quizOption.findFirstOrThrow({ where: { questionId, label }, select: { id: true } });
  await db.quizAnswer.create({
    data: { attemptId, questionId, ...mark, selections: { create: { optionId: option.id } } },
  });
  return option.id;
}
