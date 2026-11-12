import type { Express } from "express";
import request from "supertest";

import { db } from "../../db/client";
import { bearer, cleanupTestData, createTestSeason, createTestUser, tokenFor } from "./fixtures";

/*
 * The staff-mark suites' world: an ACTIVE season with an admin, a super, a mentor, and two
 * groups, each with its own leader and one student (the owner in group A, the peer in group B).
 */
export interface StaffMarkWorld {
  seasonId: number;
  ownerId: number;
  peerId: number;
  adminId: number;
  leaderAId: number;
  tokens: {
    owner: string;
    peer: string;
    admin: string;
    super: string;
    leaderA: string;
    leaderB: string;
    mentor: string;
  };
}

export async function seedStaffMarkWorld(): Promise<StaffMarkWorld> {
  await cleanupTestData();
  const seasonId = (await createTestSeason()).id;
  const [owner, peer, admin, superUser, leaderA, leaderB, mentor] = await Promise.all([
    createTestUser("mark-owner", "STUDENT"),
    createTestUser("mark-peer", "STUDENT"),
    createTestUser("mark-admin", "ADMIN"),
    createTestUser("mark-super", "SUPER"),
    createTestUser("mark-leader-a", "LEADER"),
    createTestUser("mark-leader-b", "LEADER"),
    createTestUser("mark-mentor", "MENTOR"),
  ]);
  const groupA = await db.group.create({
    data: { seasonId, name: "Group A", leaders: { create: { userId: leaderA.id } } },
    select: { id: true },
  });
  const groupB = await db.group.create({
    data: { seasonId, name: "Group B", leaders: { create: { userId: leaderB.id } } },
    select: { id: true },
  });
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: owner.id, groupId: groupA.id, status: "ACTIVE" },
      { seasonId, studentUserId: peer.id, groupId: groupB.id, status: "ACTIVE" },
    ],
  });
  return {
    seasonId,
    ownerId: owner.id,
    peerId: peer.id,
    adminId: admin.id,
    leaderAId: leaderA.id,
    tokens: {
      owner: await tokenFor(owner.id),
      peer: await tokenFor(peer.id),
      admin: await tokenFor(admin.id),
      super: await tokenFor(superUser.id),
      leaderA: await tokenFor(leaderA.id),
      leaderB: await tokenFor(leaderB.id),
      mentor: await tokenFor(mentor.id),
    },
  };
}

export function markPath(assignmentId: number, studentUserId: number): string {
  return `/api/v1/assignments/${assignmentId}/submitted-marks/${studentUserId}`;
}

export function putMark(app: Express, assignmentId: number, studentUserId: number, token: string) {
  return request(app).put(markPath(assignmentId, studentUserId)).set(bearer(token)).send({});
}

export function deleteMark(app: Express, assignmentId: number, studentUserId: number, token: string) {
  return request(app).delete(markPath(assignmentId, studentUserId)).set(bearer(token));
}

/** The student's Submission with its mark, or null. */
export function submissionRow(assignmentId: number, studentUserId: number) {
  return db.submission.findUnique({
    where: { assignmentId_studentUserId: { assignmentId, studentUserId } },
    select: { id: true, submittedAt: true, staffMark: { select: { markedAt: true, markedById: true } } },
  });
}
