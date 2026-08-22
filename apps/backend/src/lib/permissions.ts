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

/**
 * Which students a caller may see and mark on a session.
 *
 * "Who may touch attendance at all" and "whose attendance may they touch" are
 * different questions, and v1 only ever answered the first one in code. Its
 * leader restriction lived entirely in the page: the leader's attendance page
 * passed `user.groupLeaderIds` into the roster query
 * (`src/app/leader/sessions/[id]/attendance/page.tsx:23`) while the action
 * underneath accepted any student in the season
 * (`src/lib/attendance-actions.ts:35-71`). v1's own `/api/v1` roster route had
 * already dropped the argument, and this backend ported that route — so the
 * restriction vanished at exactly the point an API made the other students
 * reachable.
 *
 * Returns null when the caller may not mark this session at all.
 */
export type AttendanceScope =
  | { kind: "season" }
  | { kind: "groups"; seasonId: number; groupIds: number[] };

export async function attendanceScopeFor(
  user: SessionUser,
  sessionId: number,
): Promise<AttendanceScope | null> {
  if (isSuper(user)) return { kind: "season" };
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { seasonId: true },
  });
  if (!session) return null;
  if (isAdminOfSeason(user, session.seasonId)) return { kind: "season" };
  if (user.role !== "LEADER") return null;
  if (user.groupLeaderIds.length === 0) return null;
  const groupsInSeason = await db.group.findMany({
    where: { seasonId: session.seasonId, id: { in: user.groupLeaderIds } },
    select: { id: true },
  });
  if (groupsInSeason.length === 0) return null;
  return {
    kind: "groups",
    seasonId: session.seasonId,
    groupIds: groupsInSeason.map((g) => g.id),
  };
}

export async function canMarkAttendance(user: SessionUser, sessionId: number): Promise<boolean> {
  return (await attendanceScopeFor(user, sessionId)) !== null;
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
