import type { Express } from "express";

import { db } from "../../db/client";
import {
  cleanupTestData,
  createTestSeason,
  createTestUser,
  login,
  testEventTitle,
} from "./fixtures";

export interface EventFixtures {
  seasonId: number;
  allEventId: number;
  alumniEventId: number;
  seasonEventId: number;
  otherSeasonEventId: number;
  studentToken: string;
  alumnusToken: string;
  leaderToken: string;
  adminToken: string;
  mentorToken: string;
  superToken: string;
}

/** The events suites' shared beforeAll body, returning what it set. */
export async function seedEventFixtures(app: Express): Promise<EventFixtures> {
  await cleanupTestData();

  const season = await createTestSeason();
  const otherSeason = await createTestSeason();
  const seasonId = season.id;

  const student = await createTestUser("evstudent", "STUDENT");
  const alumnus = await createTestUser("evalumnus", "STUDENT");
  const leader = await createTestUser("evleader", "LEADER");
  const admin = await createTestUser("evadmin", "ADMIN");
  const mentor = await createTestUser("evmentor", "MENTOR");
  const superUser = await createTestUser("evsuper", "SUPER");

  // An alumnus is role STUDENT with a graduationYear — the whole of spec 15's
  // headline defect turns on that. `graduationYear` is a column on User
  // (schema.prisma:111), not on StudentProfile, and login reads it from there
  // into the token's `graduationYear` claim.
  await db.user.update({ where: { id: alumnus.id }, data: { graduationYear: 2098 } });
  await db.studentProfile.create({
    data: { userId: alumnus.id },
  });
  await db.studentProfile.create({
    data: { userId: student.id },
  });

  const group = await db.group.create({
    data: { seasonId, name: "Group A", leaders: { create: { userId: leader.id } } },
    select: { id: true },
  });
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: student.id, groupId: group.id, status: "ACTIVE" },
      { seasonId, studentUserId: alumnus.id, groupId: group.id, status: "COMPLETED" },
    ],
  });

  const events = await db.$transaction([
    db.jpcEvent.create({
      data: {
        title: testEventTitle("all"),
        date: new Date("2099-06-01T00:00:00.000Z"),
        visibility: "ALL",
      },
      select: { id: true },
    }),
    db.jpcEvent.create({
      data: {
        title: testEventTitle("alumni"),
        date: new Date("2099-06-02T00:00:00.000Z"),
        visibility: "ALUMNI_ONLY",
      },
      select: { id: true },
    }),
    db.jpcEvent.create({
      data: {
        title: testEventTitle("season"),
        date: new Date("2099-06-03T00:00:00.000Z"),
        visibility: "SEASON",
        seasonId,
      },
      select: { id: true },
    }),
    db.jpcEvent.create({
      data: {
        title: testEventTitle("otherseason"),
        date: new Date("2099-06-04T00:00:00.000Z"),
        visibility: "SEASON",
        seasonId: otherSeason.id,
      },
      select: { id: true },
    }),
  ]);
  const allEventId = events[0].id;
  const alumniEventId = events[1].id;
  const seasonEventId = events[2].id;
  const otherSeasonEventId = events[3].id;

  const studentToken = await login(app, student.email);
  const alumnusToken = await login(app, alumnus.email);
  const leaderToken = await login(app, leader.email);
  const adminToken = await login(app, admin.email);
  const mentorToken = await login(app, mentor.email);
  const superToken = await login(app, superUser.email);

  return {
    seasonId,
    allEventId,
    alumniEventId,
    seasonEventId,
    otherSeasonEventId,
    studentToken,
    alumnusToken,
    leaderToken,
    adminToken,
    mentorToken,
    superToken,
  };
}
