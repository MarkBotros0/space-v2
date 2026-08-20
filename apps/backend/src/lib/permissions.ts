import { db } from "../db/client";

import type { SessionUser } from "./auth/tokens";
import { isAdminOfSeason, isLeaderOfGroup, isMentor, isSuper } from "./rbac";

export async function canAccessSeason(user: SessionUser, seasonId: number): Promise<boolean> {
  if (isSuper(user) || isMentor(user)) return true;
  if (isAdminOfSeason(user, seasonId)) return true;

  if (user.role === "LEADER") {
    if (user.groupLeaderIds.length === 0) return false;
    const groupInSeason = await db.group.findFirst({
      where: { seasonId, id: { in: user.groupLeaderIds } },
      select: { id: true },
    });
    return groupInSeason !== null;
  }

  if (user.role === "STUDENT") {
    if (user.activeSeasonId === seasonId) return true;
    const enrollment = await db.seasonEnrollment.findUnique({
      where: { studentUserId_seasonId: { studentUserId: user.userId, seasonId } },
      select: { id: true },
    });
    return enrollment !== null;
  }

  return false;
}

export async function canAccessGroup(user: SessionUser, groupId: number): Promise<boolean> {
  if (isSuper(user) || isMentor(user)) return true;
  if (isLeaderOfGroup(user, groupId)) return true;

  const group = await db.group.findUnique({
    where: { id: groupId },
    select: { seasonId: true },
  });
  if (!group) return false;
  if (isAdminOfSeason(user, group.seasonId)) return true;

  if (user.role === "STUDENT") {
    // GroupStudent is keyed by studentUserId alone — a student belongs to at
    // most one group at a time, across all seasons.
    const membership = await db.groupStudent.findUnique({
      where: { studentUserId: user.userId },
      select: { groupId: true },
    });
    return membership?.groupId === groupId;
  }

  return false;
}

export async function canMarkAttendance(user: SessionUser, sessionId: number): Promise<boolean> {
  if (isSuper(user)) return true;
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { seasonId: true },
  });
  if (!session) return false;
  if (isAdminOfSeason(user, session.seasonId)) return true;
  if (user.role !== "LEADER") return false;
  if (user.groupLeaderIds.length === 0) return false;
  const groupInSeason = await db.group.findFirst({
    where: { seasonId: session.seasonId, id: { in: user.groupLeaderIds } },
    select: { id: true },
  });
  return groupInSeason !== null;
}

export async function canViewSubmission(user: SessionUser, submissionId: number): Promise<boolean> {
  if (isSuper(user) || isMentor(user)) return true;

  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    select: {
      studentUserId: true,
      assignment: { select: { seasonId: true } },
    },
  });
  if (!submission) return false;

  if (submission.studentUserId === user.userId) return true;
  if (isAdminOfSeason(user, submission.assignment.seasonId)) return true;

  if (user.role === "LEADER") {
    const membership = await db.groupStudent.findUnique({
      where: { studentUserId: submission.studentUserId },
      select: { groupId: true },
    });
    if (!membership) return false;
    return isLeaderOfGroup(user, membership.groupId);
  }

  return false;
}
