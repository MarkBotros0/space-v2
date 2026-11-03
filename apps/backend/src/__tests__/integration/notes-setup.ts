// apps/backend/src/__tests__/integration/notes-setup.ts
//
// Shared setup for the notes-*-routes suites, split out of the original
// notes-routes.test.ts. Not a test file (jest's testMatch is *.test.ts).
import type { Express } from "express";

import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

export interface NotesFixtures {
  seasonId: number;
  studentUserId: number;
  adminUserId: number;
  mentorsNoteId: number;
  adminsNoteId: number;
  leadersNoteId: number;
  legacyHtmlNoteId: number;
  superToken: string;
  adminToken: string;
  mentorToken: string;
  insideLeaderToken: string;
  outsideLeaderToken: string;
  studentToken: string;
}

/** The original suite's beforeAll body, verbatim, returning what it set. */
export async function seedNotesFixtures(app: Express): Promise<NotesFixtures> {
  await cleanupTestData();

  const season = await createTestSeason();
  const seasonId = season.id;

  const student = await createTestUser("note-subject", "STUDENT");
  const insideLeader = await createTestUser("note-inside-leader", "LEADER");
  const outsideLeader = await createTestUser("note-outside-leader", "LEADER");
  const admin = await createTestUser("note-admin", "ADMIN");
  const mentor = await createTestUser("note-mentor", "MENTOR");
  const superUser = await createTestUser("note-super", "SUPER");
  const studentUserId = student.id;
  const adminUserId = admin.id;

  const groupA = await db.group.create({
    data: { seasonId, name: "Group A", leaders: { create: { userId: insideLeader.id } } },
    select: { id: true },
  });
  const groupB = await db.group.create({
    data: { seasonId, name: "Group B", leaders: { create: { userId: outsideLeader.id } } },
    select: { id: true },
  });

  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  // Ruling C9: the enrolment carries the per-season group, and it is what every
  // gate here consults. groupB exists so outsideLeader is a real leader in the
  // same season who simply does not lead THIS student.
  await db.seasonEnrollment.create({
    data: { seasonId, studentUserId: student.id, groupId: groupA.id, status: "ACTIVE" },
  });
  expect(groupB.id).not.toBe(groupA.id);

  // Three notes, one per visibility, each by a different author. Bodies are
  // invented placeholder text — never real pastoral content.
  const mentorsNote = await db.engagementNote.create({
    data: {
      studentUserId: student.id,
      authorUserId: mentor.id,
      seasonId,
      body: "<p>space-v2-test mentors-only observation</p>",
      visibility: "MENTORS",
    },
    select: { id: true },
  });
  const mentorsNoteId = mentorsNote.id;

  const adminsNote = await db.engagementNote.create({
    data: {
      studentUserId: student.id,
      authorUserId: admin.id,
      seasonId,
      body: "<p>space-v2-test admins-only observation</p>",
      visibility: "ADMINS",
    },
    select: { id: true },
  });
  const adminsNoteId = adminsNote.id;

  const leadersNote = await db.engagementNote.create({
    data: {
      studentUserId: student.id,
      authorUserId: insideLeader.id,
      seasonId,
      body: "<p>space-v2-test leaders-only observation</p>",
      visibility: "LEADERS",
    },
    select: { id: true },
  });
  const leadersNoteId = leadersNote.id;

  // A row in v1's exact stored format: TipTap HTML, entities and a script tag.
  // This is what the shared database already contains, and the read path has
  // to cope with it (ruling C11 — sanitise on read for everything stored).
  const legacy = await db.engagementNote.create({
    data: {
      studentUserId: student.id,
      authorUserId: insideLeader.id,
      seasonId,
      body: "<p>Legacy &amp; <b>bold</b></p><p>second line</p><script>alert(1)</script>",
      visibility: "LEADERS",
    },
    select: { id: true },
  });
  const legacyHtmlNoteId = legacy.id;

  const superToken = await login(app, superUser.email);
  const adminToken = await login(app, admin.email);
  const mentorToken = await login(app, mentor.email);
  const insideLeaderToken = await login(app, insideLeader.email);
  const outsideLeaderToken = await login(app, outsideLeader.email);
  const studentToken = await login(app, student.email);

  return {
    seasonId,
    studentUserId,
    adminUserId,
    mentorsNoteId,
    adminsNoteId,
    leadersNoteId,
    legacyHtmlNoteId,
    superToken,
    adminToken,
    mentorToken,
    insideLeaderToken,
    outsideLeaderToken,
    studentToken,
  };
}
