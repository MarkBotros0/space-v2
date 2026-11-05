import type { Express } from "express";

import { db } from "../../db/client";
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

/** A published ONLINE quiz: one MCQ (2 points) and optionally one essay (5). */
export async function buildPublishedQuizIn(
  seasonId: number,
  sessionId: number,
  opts: { withEssay: boolean },
) {
  const quiz = await db.quiz.create({
    data: { seasonId, sessionId, title: "Runner quiz", kind: "ONLINE", maxScore: 0 },
    select: { id: true },
  });
  const mcq = await db.quizQuestion.create({
    data: {
      quizId: quiz.id, order: 0, type: "MCQ",
      prompt: "Capital of France?", points: 2,
      options: ["London", "Paris"], correctIndex: 1,
    },
    select: { id: true },
  });
  let essay = { id: 0 };
  if (opts.withEssay) {
    essay = await db.quizQuestion.create({
      data: {
        quizId: quiz.id, order: 1, type: "ESSAY",
        prompt: "Discuss the reading.", points: 5, options: [], correctIndex: null,
      },
      select: { id: true },
    });
  }
  await db.quiz.update({
    where: { id: quiz.id },
    data: { maxScore: opts.withEssay ? 7 : 2, publishedAt: new Date() },
  });
  return { quizId: quiz.id, mcqId: mcq.id, essayId: essay.id };
}
