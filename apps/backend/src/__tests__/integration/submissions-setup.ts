import type { Express } from "express";

import { db } from "../../db/client";
import { newPublicId } from "../../lib/public-id";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

export interface SubmissionFixtures {
  seasonId: number;
  assignmentId: number;
  publicId: string;
  studentUserId: number;
  leaderUserId: number;
  groupAId: number;
  mentorToken: string;
  ownerToken: string;
  peerToken: string;
  leaderToken: string;
  adminToken: string;
}

/** The submissions suites' shared beforeAll body, returning what it set. */
export async function seedSubmissionFixtures(app: Express): Promise<SubmissionFixtures> {
  await cleanupTestData();

  const season = await createTestSeason();
  const seasonId = season.id;

  const owner = await createTestUser("owner", "STUDENT");
  const peer = await createTestUser("peer", "STUDENT");
  const leader = await createTestUser("leader", "LEADER");
  const admin = await createTestUser("admin", "ADMIN");
  const studentUserId = owner.id;

  const group = await db.group.create({
    data: {
      seasonId,
      name: "Group A",
      leaders: { create: { userId: leader.id } },
      students: { create: { studentUserId: owner.id } },
    },
    select: { id: true },
  });
  const groupAId = group.id;
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  // groupId on the enrolment as well as the GroupStudent row above. v1's group
  // form writes both, so this is what real data looks like — and since ruling
  // C9 made the per-season enrolment the authority on membership, an enrolment
  // without it describes a student in no group at all.
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: owner.id, groupId: group.id, status: "ACTIVE" },
      { seasonId, studentUserId: peer.id, status: "ACTIVE" },
    ],
  });

  const assignment = await db.assignment.create({
    data: {
      seasonId,
      title: "Essay",
      description: "Write it",
      isAllGroups: true,
      dueAt: new Date("2099-04-01T00:00:00.000Z"),
    },
    select: { id: true },
  });
  const assignmentId = assignment.id;

  // Same generator production uses — publicId is a @unique column, and a
  // hand-rolled short id collides with a previous interrupted run (Ruling F2).
  const publicId = newPublicId();
  await db.submission.create({
    data: { assignmentId, studentUserId: owner.id, publicId, status: "DRAFT", text: "first draft" },
  });

  const mentor = await createTestUser("mentor", "MENTOR");

  const ownerToken = await login(app, owner.email);
  const peerToken = await login(app, peer.email);
  const leaderToken = await login(app, leader.email);
  const leaderUserId = leader.id;
  const adminToken = await login(app, admin.email);
  const mentorToken = await login(app, mentor.email);

  return {
    seasonId,
    assignmentId,
    publicId,
    studentUserId,
    leaderUserId,
    groupAId,
    mentorToken,
    ownerToken,
    peerToken,
    leaderToken,
    adminToken,
  };
}

/** A submission of the owner's on a brand-new assignment, in a known state. */
export async function seedSubmissionFor(
  seasonId: number,
  studentUserId: number,
  status: "SUBMITTED" | "DRAFT",
  title: string,
): Promise<string> {
  const assignment = await db.assignment.create({
    data: { seasonId, title, isAllGroups: true },
    select: { id: true },
  });
  const pid = newPublicId();
  await db.submission.create({
    data: {
      assignmentId: assignment.id,
      studentUserId,
      publicId: pid,
      status,
      text: "work",
      submittedAt: status === "SUBMITTED" ? new Date() : null,
    },
  });
  return pid;
}
