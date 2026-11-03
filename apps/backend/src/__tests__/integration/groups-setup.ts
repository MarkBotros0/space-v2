import type { Express } from "express";

import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

// Shared seed for the groups-*-routes suites (split from the original
// groups-routes.test.ts). Each suite calls it from its own beforeAll.

export interface GroupFixtures {
  seasonId: number;
  groupAId: number;
  groupBId: number;
  superToken: string;
  leaderToken: string;
  studentToken: string;
  outsiderToken: string;
  strayGrantToken: string;
}

/** The original suite's beforeAll body, verbatim, returning what it set. */
export async function seedGroupFixtures(app: Express): Promise<GroupFixtures> {
  await cleanupTestData();

  const season = await createTestSeason();
  const seasonId = season.id;

  const superUser = await createTestUser("super", "SUPER");
  const leader = await createTestUser("leader", "LEADER");
  const student = await createTestUser("student", "STUDENT");
  const outsider = await createTestUser("outsider", "STUDENT");

  const groupA = await db.group.create({
    data: {
      seasonId,
      name: "Group A",
      description: "First group",
      leaders: { create: { userId: leader.id } },
      students: { create: { studentUserId: student.id } },
    },
    select: { id: true },
  });
  const groupAId = groupA.id;

  const groupB = await db.group.create({
    data: { seasonId, name: "Group B" },
    select: { id: true },
  });
  const groupBId = groupB.id;

  await db.seasonEnrollment.create({
    data: { seasonId, studentUserId: student.id, groupId: groupAId, status: "ACTIVE" },
  });

  // A STUDENT carrying grant rows they should never have. v1 writes both join
  // tables from unvalidated request input, so this row is reachable in the
  // shared database; loadScopes reads the tables with no role filter, so the
  // claims land in the token. Created before login because claims are baked in
  // at issue time.
  const strayGrant = await createTestUser("stray-grant", "STUDENT");
  await db.groupLeader.create({ data: { groupId: groupBId, userId: strayGrant.id } });
  await db.seasonAdmin.create({ data: { seasonId, userId: strayGrant.id } });

  const superToken = await login(app, superUser.email);
  const leaderToken = await login(app, leader.email);
  const studentToken = await login(app, student.email);
  const outsiderToken = await login(app, outsider.email);
  const strayGrantToken = await login(app, strayGrant.email);

  return {
    seasonId,
    groupAId,
    groupBId,
    superToken,
    leaderToken,
    studentToken,
    outsiderToken,
    strayGrantToken,
  };
}
