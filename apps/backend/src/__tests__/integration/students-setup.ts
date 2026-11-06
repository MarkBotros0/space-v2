import type { Express } from "express";

import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

// Shared seed for the students-*-routes suites (split from the original
// students-routes.test.ts). Each suite calls it from its own beforeAll.

export interface StudentFixtures {
  seasonAId: number;
  seasonBId: number;
  groupId: number;
  superToken: string;
  adminToken: string; // season admin of A only
  mentorToken: string;
  leaderToken: string; // leads the one group in A
  student1Id: number; // enrolled in A (group-linked via the ENROLLMENT row) and in B
  student1Token: string;
  student2Id: number; // enrolled in B only
  alumnusId: number; // graduationYear set, COMPLETED enrollment in A
  droppedId: number; // WITHDRAWN enrollment in A, no group
  droppedEnrollmentId: number;
  deletedDroppedId: number; // soft-deleted user with a WITHDRAWN enrollment (D12)
}

/** The original suite's beforeAll body, verbatim, returning what it set. */
export async function seedStudentFixtures(app: Express): Promise<StudentFixtures> {
  await cleanupTestData();

  const seasonAId = (await createTestSeason()).id;
  const seasonBId = (await createTestSeason()).id;

  const superUser = await createTestUser("super", "SUPER");
  const admin = await createTestUser("admin", "ADMIN");
  await db.seasonAdmin.create({ data: { seasonId: seasonAId, userId: admin.id } });
  const mentor = await createTestUser("mentor", "MENTOR");
  const leader = await createTestUser("leader", "LEADER");

  const group = await db.group.create({
    data: { seasonId: seasonAId, name: "Group A", leaders: { create: { userId: leader.id } } },
    select: { id: true },
  });
  const groupId = group.id;

  const student1 = await createTestUser("student-one", "STUDENT");
  const student1Id = student1.id;
  // Phone is account-level (User) since 2026-11-06.
  await db.user.update({ where: { id: student1Id }, data: { phone: "+20 100 000 0000" } });
  await db.studentProfile.create({
    data: {
      userId: student1Id,
      university: "Test University",
      faculty: "Engineering",
      universityGraduationYear: 2027,
      notes: "Internal staff note",
    },
  });
  // The group link lives on the ENROLLMENT row only — deliberately NO
  // GroupStudent row, so any scope that quietly falls back to GroupStudent
  // (v1's unreachable leader branch, students-query.ts:50-55) fails the
  // leader tests below (ruling C9).
  await db.seasonEnrollment.create({
    data: { studentUserId: student1Id, seasonId: seasonAId, groupId, status: "ACTIVE" },
  });
  // A second, group-less enrollment in B: the leader detail test (Task 3)
  // proves row scoping by seeing 1 of these 2.
  await db.seasonEnrollment.create({
    data: { studentUserId: student1Id, seasonId: seasonBId, status: "COMPLETED", completedAt: new Date() },
  });

  const student2 = await createTestUser("student-two", "STUDENT");
  const student2Id = student2.id;
  await db.studentProfile.create({ data: { userId: student2Id } });
  await db.seasonEnrollment.create({
    data: { studentUserId: student2Id, seasonId: seasonBId, status: "ACTIVE" },
  });

  const alumnus = await createTestUser("alumnus", "STUDENT");
  const alumnusId = alumnus.id;
  await db.user.update({ where: { id: alumnusId }, data: { graduationYear: 2024 } });
  await db.studentProfile.create({ data: { userId: alumnusId, university: "Alumni University" } });
  await db.seasonEnrollment.create({
    data: { studentUserId: alumnusId, seasonId: seasonAId, status: "COMPLETED", completedAt: new Date() },
  });

  const dropped = await createTestUser("dropped", "STUDENT");
  const droppedId = dropped.id;
  await db.studentProfile.create({ data: { userId: droppedId } });
  const droppedEnrollment = await db.seasonEnrollment.create({
    data: {
      studentUserId: droppedId,
      seasonId: seasonAId,
      status: "WITHDRAWN",
      droppedAt: new Date("2099-06-01T00:00:00.000Z"),
      dropReason: "Moved away",
    },
    select: { id: true },
  });
  const droppedEnrollmentId = droppedEnrollment.id;

  const deletedDropped = await createTestUser("deleted-dropped", "STUDENT");
  const deletedDroppedId = deletedDropped.id;
  await db.seasonEnrollment.create({
    data: { studentUserId: deletedDroppedId, seasonId: seasonAId, status: "WITHDRAWN", droppedAt: new Date() },
  });
  await db.user.update({ where: { id: deletedDroppedId }, data: { deletedAt: new Date() } });

  const superToken = await login(app, superUser.email);
  const adminToken = await login(app, admin.email);
  const mentorToken = await login(app, mentor.email);
  const leaderToken = await login(app, leader.email);
  const student1Token = await login(app, student1.email);

  return {
    seasonAId,
    seasonBId,
    groupId,
    superToken,
    adminToken,
    mentorToken,
    leaderToken,
    student1Id,
    student1Token,
    student2Id,
    alumnusId,
    droppedId,
    droppedEnrollmentId,
    deletedDroppedId,
  };
}
