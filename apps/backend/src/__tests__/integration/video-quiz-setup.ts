import type { Express } from "express";

import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

export interface VideoQuizFixtures {
  seasonId: number;
  sessionId: number;
  q1: number;
  q2: number;
  q3: number;
  studentId: number;
  studentToken: string;
  droppedToken: string;
  adminToken: string;
  leaderToken: string;
}

/** Wipes every answer and progress row on the session (the suites' beforeEach). */
export async function resetAnswers(sessionId: number): Promise<void> {
  await db.sessionVideoQuestionResponse.deleteMany({ where: { question: { sessionId } } });
  await db.sessionVideoProgress.deleteMany({ where: { sessionId } });
}

/** The video-quiz suites' shared beforeAll body, returning what it set. */
export async function seedVideoQuizFixtures(app: Express): Promise<VideoQuizFixtures> {
  await cleanupTestData();

  const season = await createTestSeason();
  const seasonId = season.id;

  const student = await createTestUser("vqstudent", "STUDENT");
  const droppedStudent = await createTestUser("vqdropped", "STUDENT");
  const admin = await createTestUser("vqadmin", "ADMIN");
  const leader = await createTestUser("vqleader", "LEADER");
  const studentId = student.id;

  const group = await db.group.create({
    data: { seasonId, name: "Group A", leaders: { create: { userId: leader.id } } },
    select: { id: true },
  });
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: student.id, groupId: group.id, status: "ACTIVE" },
      { seasonId, studentUserId: droppedStudent.id, groupId: group.id, status: "WITHDRAWN" },
    ],
  });

  const session = await db.session.create({
    data: {
      seasonId,
      title: "space-v2-test-video-session",
      startsAt: new Date("2099-03-01T18:00:00.000Z"),
      durationMinutes: 90,
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    },
    select: { id: true },
  });
  const sessionId = session.id;

  const created = await db.$transaction([
    db.sessionVideoQuestion.create({
      data: {
        sessionId,
        atSeconds: 30,
        prompt: "space-v2-test q1",
        options: ["a", "b"],
        correctIndex: 0,
        points: 2,
      },
      select: { id: true },
    }),
    db.sessionVideoQuestion.create({
      data: {
        sessionId,
        atSeconds: 60,
        prompt: "space-v2-test q2",
        options: ["a", "b", "c"],
        correctIndex: 2,
        points: 3,
      },
      select: { id: true },
    }),
    db.sessionVideoQuestion.create({
      data: {
        sessionId,
        atSeconds: 90,
        prompt: "space-v2-test q3",
        options: ["a", "b"],
        correctIndex: 1,
        points: 1,
      },
      select: { id: true },
    }),
  ]);
  const q1 = created[0].id;
  const q2 = created[1].id;
  const q3 = created[2].id;

  const studentToken = await login(app, student.email);
  const droppedToken = await login(app, droppedStudent.email);
  const adminToken = await login(app, admin.email);
  const leaderToken = await login(app, leader.email);

  return {
    seasonId,
    sessionId,
    q1,
    q2,
    q3,
    studentId,
    studentToken,
    droppedToken,
    adminToken,
    leaderToken,
  };
}
