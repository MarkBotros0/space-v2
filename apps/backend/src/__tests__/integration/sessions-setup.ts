import type { Express } from "express";

import { db } from "../../db/client";
import { newPublicId } from "../../lib/public-id";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

export interface SessionFixtures {
  seasonId: number;
  sessionId: number;
  superToken: string;
  adminToken: string;
  studentToken: string;
  outsiderToken: string;
  studentUserId: number;
  // checkInToken is @unique on Session; generating it rather than hard-coding
  // a literal avoids a collision with a leftover row from an interrupted
  // previous run.
  checkInToken: string;
}

/** The sessions suites' shared beforeAll body, returning what it set. */
export async function seedSessionFixtures(app: Express): Promise<SessionFixtures> {
  await cleanupTestData();

  const season = await createTestSeason();
  const seasonId = season.id;

  const superUser = await createTestUser("super", "SUPER");
  const adminUser = await createTestUser("admin", "ADMIN");
  const student = await createTestUser("student", "STUDENT");
  const outsider = await createTestUser("outsider", "STUDENT");
  const studentUserId = student.id;

  await db.seasonAdmin.create({ data: { seasonId, userId: adminUser.id } });
  await db.seasonEnrollment.create({
    data: { seasonId, studentUserId: student.id, status: "ACTIVE" },
  });

  const checkInToken = newPublicId();
  const session = await db.session.create({
    data: {
      seasonId,
      title: "Session One",
      description: "A test session",
      startsAt: new Date("2099-03-01T18:00:00.000Z"),
      durationMinutes: 90,
      location: "Hall",
      checkInToken,
    },
    select: { id: true },
  });
  const sessionId = session.id;

  const superToken = await login(app, superUser.email);
  const adminToken = await login(app, adminUser.email);
  const studentToken = await login(app, student.email);
  const outsiderToken = await login(app, outsider.email);

  return {
    seasonId,
    sessionId,
    superToken,
    adminToken,
    studentToken,
    outsiderToken,
    studentUserId,
    checkInToken,
  };
}
