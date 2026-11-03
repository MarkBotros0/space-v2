import type { Express } from "express";

import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

// Shared seed for the seasons-*-routes suites (split from the original
// seasons-routes.test.ts). Each suite calls it from its own beforeAll.

export interface SeasonFixtures {
  seasonId: number;
  otherSeasonId: number;
  superToken: string;
  adminToken: string;
  studentToken: string;
  outsiderToken: string;
}

/** The original suite's beforeAll body, verbatim, returning what it set. */
export async function seedSeasonFixtures(app: Express): Promise<SeasonFixtures> {
  await cleanupTestData();

  const season = await createTestSeason();
  const seasonId = season.id;
  const other = await createTestSeason();
  const otherSeasonId = other.id;

  const superUser = await createTestUser("super", "SUPER");
  const adminUser = await createTestUser("admin", "ADMIN");
  const student = await createTestUser("student", "STUDENT");
  const outsider = await createTestUser("outsider", "STUDENT");

  // Admin is scoped to `seasonId` only — the token must not open otherSeasonId.
  await db.seasonAdmin.create({ data: { seasonId, userId: adminUser.id } });

  // Student is enrolled in `seasonId`. The outsider is enrolled nowhere.
  await db.seasonEnrollment.create({
    data: { seasonId, studentUserId: student.id, status: "ACTIVE" },
  });

  await db.group.create({
    data: {
      seasonId,
      name: "Test Group A",
      students: { create: { studentUserId: student.id } },
    },
  });

  const superToken = await login(app, superUser.email);
  const adminToken = await login(app, adminUser.email);
  const studentToken = await login(app, student.email);
  const outsiderToken = await login(app, outsider.email);

  return {
    seasonId,
    otherSeasonId,
    superToken,
    adminToken,
    studentToken,
    outsiderToken,
  };
}
