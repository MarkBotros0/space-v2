import type { Express } from "express";

import { db } from "../../db/client";
import { createAssignmentWithParts, seedTextWork, setSubmitted } from "./assignment-reads-setup";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

export interface SubmissionFixtures {
  seasonId: number;
  assignmentId: number;
  /** The essay part of `assignmentId`. */
  partId: number;
  /** The owner's DRAFT essay work on `partId` ("first draft"). */
  publicId: string;
  studentUserId: number;
  peerUserId: number;
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
  // groupId on the enrolment as well as the GroupStudent row above: since
  // ruling C9 made the per-season enrolment the authority on membership, an
  // enrolment without it describes a student in no group at all.
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: owner.id, groupId: group.id, status: "ACTIVE" },
      { seasonId, studentUserId: peer.id, status: "ACTIVE" },
    ],
  });

  const assignment = await createAssignmentWithParts(
    { seasonId, title: "Essay", description: "Write it", dueAt: new Date("2099-04-01T00:00:00.000Z") },
    [{ kind: "ESSAY", prompt: "What did you learn?" }],
  );
  const assignmentId = assignment.id;
  const partId = assignment.partIds[0]!;
  const work = await seedTextWork(assignmentId, partId, owner.id, "DRAFT", { text: "first draft" });

  const mentor = await createTestUser("mentor", "MENTOR");

  return {
    seasonId,
    assignmentId,
    partId,
    publicId: work.publicId,
    studentUserId,
    peerUserId: peer.id,
    leaderUserId: leader.id,
    groupAId,
    mentorToken: await login(app, mentor.email),
    ownerToken: await login(app, owner.email),
    peerToken: await login(app, peer.email),
    leaderToken: await login(app, leader.email),
    adminToken: await login(app, admin.email),
  };
}

/**
 * The student's essay on a brand-new one-essay assignment, in a known state.
 * A handed-in essay (SUBMITTED, REVIEWED) also stamps the assignment submitted,
 * as Submit would. Returns the essay work's publicId.
 */
export async function seedSubmissionFor(
  seasonId: number,
  studentUserId: number,
  status: "SUBMITTED" | "DRAFT" | "REVIEWED",
  title: string,
  opts: { dueAt?: Date | null; submittedAt?: Date; text?: string } = {},
): Promise<string> {
  const a = await createAssignmentWithParts({ seasonId, title, dueAt: opts.dueAt ?? null }, [
    { kind: "ESSAY", prompt: `${title}?` },
  ]);
  const work = await seedTextWork(a.id, a.partIds[0]!, studentUserId, status, {
    at: opts.submittedAt,
    text: opts.text ?? "work",
  });
  if (status !== "DRAFT") await setSubmitted(a.id, studentUserId, opts.submittedAt ?? new Date());
  return work.publicId;
}
