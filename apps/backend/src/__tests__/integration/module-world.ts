/**
 * One shared "world" for the per-module (per-role) suites: a season with two
 * groups, a leader and a student in each, a season admin, an admin of another
 * season, a mentor, a super and an alumnus, plus one of each thing the roles
 * read: session, assignment, submission, staff note, events and a quiz.
 *
 * Fake data only (the repo is public). Every row carries the test prefix so
 * cleanupTestData removes it.
 */
import type { Express } from "express";

import { db } from "../../db/client";
import { newPublicId } from "../../lib/public-id";
import { cleanupTestData, createTestSeason, createTestUser, login, testEventTitle } from "./fixtures";
import { createAssignmentWithParts, seedEssays } from "./assignment-reads-setup";

export interface ModuleWorld {
  seasonId: number;
  otherSeasonId: number;
  groupAId: number;
  groupBId: number;
  sessionId: number;
  otherSessionId: number;
  assignmentId: number;
  otherAssignmentId: number;
  submissionBPublicId: string;
  noteOnAId: number;
  eventAllId: number;
  eventAlumniId: number;
  quizId: number;
  ids: Record<Role, number>;
  tokens: Record<Role, string>;
}

export type Role =
  "super" | "admin" | "otherAdmin" | "leaderA" | "leaderB" | "mentor" | "studentA" | "studentB" | "alumnus";

export async function seedModuleWorld(app: Express): Promise<ModuleWorld> {
  await cleanupTestData();

  const seasonId = (await createTestSeason()).id;
  const otherSeasonId = (await createTestSeason({ year: 2100 })).id;

  const users = {
    super: await createTestUser("mw-super", "SUPER"),
    admin: await createTestUser("mw-admin", "ADMIN"),
    otherAdmin: await createTestUser("mw-other-admin", "ADMIN"),
    leaderA: await createTestUser("mw-leader-a", "LEADER"),
    leaderB: await createTestUser("mw-leader-b", "LEADER"),
    mentor: await createTestUser("mw-mentor", "MENTOR"),
    studentA: await createTestUser("mw-student-a", "STUDENT"),
    studentB: await createTestUser("mw-student-b", "STUDENT"),
    alumnus: await createTestUser("mw-alumnus", "STUDENT"),
  };
  const ids = Object.fromEntries(Object.entries(users).map(([k, v]) => [k, v.id])) as Record<Role, number>;

  for (const staff of [users.admin, users.otherAdmin, users.leaderA, users.leaderB, users.mentor]) {
    await db.user.update({ where: { id: staff.id }, data: { graduationYear: 2015 } });
  }
  await db.user.update({ where: { id: users.alumnus.id }, data: { graduationYear: 2020 } });

  await db.seasonAdmin.create({ data: { seasonId, userId: users.admin.id } });
  await db.seasonAdmin.create({ data: { seasonId: otherSeasonId, userId: users.otherAdmin.id } });

  const groupAId = (
    await db.group.create({
      data: { seasonId, name: "Group A", students: { create: { studentUserId: users.studentA.id } } },
      select: { id: true },
    })
  ).id;
  const groupBId = (
    await db.group.create({
      data: { seasonId, name: "Group B", students: { create: { studentUserId: users.studentB.id } } },
      select: { id: true },
    })
  ).id;
  await db.groupLeader.create({ data: { groupId: groupAId, userId: users.leaderA.id } });
  await db.groupLeader.create({ data: { groupId: groupBId, userId: users.leaderB.id } });

  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: users.studentA.id, groupId: groupAId, status: "ACTIVE" },
      { seasonId, studentUserId: users.studentB.id, groupId: groupBId, status: "ACTIVE" },
      { seasonId: otherSeasonId, studentUserId: users.alumnus.id, status: "COMPLETED" },
    ],
  });
  for (const s of [users.studentA, users.studentB]) {
    await db.studentProfile.create({ data: { userId: s.id } });
  }
  await db.studentProfile.create({ data: { userId: users.alumnus.id } });

  const sessionId = (
    await db.session.create({
      data: { seasonId, title: "MW Session", startsAt: new Date("2099-03-01T18:00:00.000Z"), durationMinutes: 60 },
      select: { id: true },
    })
  ).id;
  const otherSessionId = (
    await db.session.create({
      data: {
        seasonId: otherSeasonId,
        title: "MW Other Session",
        startsAt: new Date("2100-03-01T18:00:00.000Z"),
        durationMinutes: 60,
      },
      select: { id: true },
    })
  ).id;

  // One essay part each: an assignment is for the whole season.
  const assignmentId = (
    await createAssignmentWithParts({
      seasonId,
      title: "MW Assignment",
      description: "Write a page.",
      dueAt: new Date("2099-03-10T21:59:00.000Z"),
    })
  ).id;
  await db.assignment.update({ where: { id: assignmentId }, data: { createdById: users.admin.id } });
  const otherAssignmentId = (
    await createAssignmentWithParts({
      seasonId: otherSeasonId,
      title: "MW Other Assignment",
      dueAt: new Date("2100-03-10T21:59:00.000Z"),
    })
  ).id;

  // Student B's essay, handed in: its publicId is the review screen's handle.
  const submissionBPublicId = newPublicId();
  await seedEssays([
    {
      publicId: submissionBPublicId,
      assignmentId,
      studentUserId: users.studentB.id,
      text: "Student B's private answer",
      status: "SUBMITTED",
      submittedAt: new Date(),
    },
  ]);

  const noteOnAId = (
    await db.engagementNote.create({
      data: {
        studentUserId: users.studentA.id,
        authorUserId: users.leaderA.id,
        seasonId,
        body: "Staff-only pastoral note about A",
        visibility: "LEADERS",
      },
      select: { id: true },
    })
  ).id;

  const eventAllId = (
    await db.jpcEvent.create({
      data: { title: testEventTitle("mw-all"), date: new Date("2099-04-01T10:00:00.000Z"), visibility: "ALL" },
      select: { id: true },
    })
  ).id;
  const eventAlumniId = (
    await db.jpcEvent.create({
      data: {
        title: testEventTitle("mw-alumni"),
        date: new Date("2099-04-02T10:00:00.000Z"),
        visibility: "ALUMNI_ONLY",
      },
      select: { id: true },
    })
  ).id;

  const quizId = (
    await db.quiz.create({
      data: { seasonId, sessionId, title: "MW Quiz", kind: "PAPER", maxScore: 10, publishedAt: new Date() },
      select: { id: true },
    })
  ).id;

  const tokens = {} as Record<Role, string>;
  for (const [role, u] of Object.entries(users)) tokens[role as Role] = await login(app, u.email);

  return {
    seasonId,
    otherSeasonId,
    groupAId,
    groupBId,
    sessionId,
    otherSessionId,
    assignmentId,
    otherAssignmentId,
    submissionBPublicId,
    noteOnAId,
    eventAllId,
    eventAlumniId,
    quizId,
    ids,
    tokens,
  };
}

type Method = "get" | "post" | "patch" | "put" | "delete";
export type Probe = [Method, string, number, object?];

/**
 * Call every probe as one token and assert its status. All mismatches are
 * collected and reported together, so a failing role shows its whole drift
 * at once instead of one route per run. A 403 or 404 must also carry the
 * standard error envelope.
 */
export async function expectStatuses(app: Express, token: string, probes: Probe[]): Promise<void> {
  const request = (await import("supertest")).default;
  const mismatches: string[] = [];
  for (const [method, path, expected, body] of probes) {
    const call = request(app)[method](path).set("authorization", `Bearer ${token}`);
    const res = body ? await call.send(body) : await call;
    if (res.status !== expected) {
      mismatches.push(`${method.toUpperCase()} ${path}: expected ${expected}, got ${res.status}`);
    } else if (expected >= 400 && typeof res.body?.error?.code !== "string") {
      mismatches.push(`${method.toUpperCase()} ${path}: ${expected} without an error envelope`);
    }
  }
  expect(mismatches).toEqual([]);
}
