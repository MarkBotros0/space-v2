import { db } from "../../db/client";
import type { SessionUser } from "../auth/tokens";
import { isAdminOfSeason, isMentor, isSuper } from "../rbac";

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
 * Null (from the functions below) when the caller may not mark this session at all.
 */
export type AttendanceScope =
  | { kind: "season" }
  | { kind: "groups"; seasonId: number; groupIds: number[] };

/**
 * The same question at season granularity: may this caller act on staff-only
 * data in this season, and if so over which students?
 *
 * Extracted so every roster-shaped read — attendance, the assignment tracker,
 * anything later that lists students by name and email — narrows identically.
 * Two hand-written copies of this would drift, and the first one already
 * shipped a leak by being written once and then not applied.
 */
export async function staffScopeForSeason(
  user: SessionUser,
  seasonId: number,
): Promise<AttendanceScope | null> {
  if (isSuper(user)) return { kind: "season" };
  if (isAdminOfSeason(user, seasonId)) return { kind: "season" };
  if (user.role !== "LEADER") return null;
  if (user.groupLeaderIds.length === 0) return null;
  const groupsInSeason = await db.group.findMany({
    where: { seasonId, id: { in: user.groupLeaderIds } },
    select: { id: true },
  });
  if (groupsInSeason.length === 0) return null;
  return { kind: "groups", seasonId, groupIds: groupsInSeason.map((g) => g.id) };
}

/** The season a session belongs to, or null when it does not exist. */
async function sessionSeasonId(sessionId: number): Promise<number | null> {
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { seasonId: true },
  });
  return session?.seasonId ?? null;
}

export async function attendanceScopeFor(
  user: SessionUser,
  sessionId: number,
): Promise<AttendanceScope | null> {
  if (isSuper(user)) return { kind: "season" };
  const seasonId = await sessionSeasonId(sessionId);
  if (seasonId === null) return null;
  return staffScopeForSeason(user, seasonId);
}

export async function canMarkAttendance(user: SessionUser, sessionId: number): Promise<boolean> {
  return (await attendanceScopeFor(user, sessionId)) !== null;
}

/** Editing an assignment is a season-admin power; leading a group is not enough. */
export function canManageAssignment(user: SessionUser, seasonId: number): boolean {
  return isAdminOfSeason(user, seasonId);
}

/**
 * Authoring interactive video questions on a session.
 *
 * Season-scoped ADMIN + SUPER only — not a group LEADER, not a MENTOR. Ported
 * from v1's `canManageSessionVideo`, which is one of the gates v1 got right;
 * what v1 lacked was any gate on the *reads*, one of which carries the answer
 * key for every question (spec 13 R68/R73).
 */
export async function canManageSessionVideo(
  user: SessionUser,
  sessionId: number,
): Promise<boolean> {
  if (isSuper(user)) return true;
  const seasonId = await sessionSeasonId(sessionId);
  if (seasonId === null) return false;
  return isAdminOfSeason(user, seasonId);
}

/**
 * A student with a live place in this season: an ACTIVE enrolment in an ACTIVE,
 * non-deleted season. A draft's roster doesn't count until it starts, and a
 * finished season is locked.
 *
 * Deliberately stricter than `canAccessSeason`, whose student branch accepts
 * any `SeasonEnrollment` row whatever its status. v1 gated the video answer and
 * progress actions on that looser predicate while the page that rendered the
 * player required `status: "ACTIVE"` — so a dropped or completed student could
 * not open the page and could still answer (spec 13 R51, §10 D9). This is the
 * rule v1 intended, made real.
 *
 * If alumni are ever meant to keep access to a past season's material, that is
 * a separate named rule, not a side effect of a permissive gate.
 */
export async function hasActiveEnrollment(user: SessionUser, seasonId: number): Promise<boolean> {
  if (user.role !== "STUDENT") return false;
  const enrollment = await db.seasonEnrollment.findUnique({
    where: { studentUserId_seasonId: { studentUserId: user.userId, seasonId } },
    select: { status: true, season: { select: { status: true, deletedAt: true } } },
  });
  return (
    enrollment?.status === "ACTIVE" &&
    enrollment.season.status === "ACTIVE" &&
    enrollment.season.deletedAt === null
  );
}

/** Which seasons a calendar request may read (Plan 6 D-16.7). */
export type CalendarScope = { kind: "active" } | { kind: "seasons"; seasonIds: number[] };

/**
 * The season set behind GET /api/v1/sessions, derived from the role — never
 * from the query. `seasonId` NARROWS within the caller's set; outside it the
 * answer is "forbidden", never a widened read (C8).
 */
export async function calendarScopeFor(
  user: SessionUser,
  seasonId: number | null,
): Promise<CalendarScope | "forbidden" | "not_found"> {
  if (seasonId !== null) {
    const live = await db.season.findFirst({ where: { id: seasonId, deletedAt: null }, select: { id: true } });
    if (!live) return "not_found";
  }

  if (isSuper(user)) {
    return seasonId !== null ? { kind: "seasons", seasonIds: [seasonId] } : { kind: "active" };
  }

  if (user.role === "ADMIN") {
    if (seasonId !== null) {
      return isAdminOfSeason(user, seasonId) ? { kind: "seasons", seasonIds: [seasonId] } : "forbidden";
    }
    const live = await db.season.findMany({
      where: { id: { in: user.seasonAdminIds }, deletedAt: null },
      select: { id: true },
    });
    return { kind: "seasons", seasonIds: live.map((s) => s.id) };
  }

  if (user.role === "LEADER") {
    // One query instead of v1's per-season N+1 (spec 03 R85).
    const groups = await db.group.findMany({
      where: { id: { in: user.groupLeaderIds }, season: { deletedAt: null } },
      select: { seasonId: true },
    });
    const led = [...new Set(groups.map((g) => g.seasonId))];
    if (seasonId !== null) {
      return led.includes(seasonId) ? { kind: "seasons", seasonIds: [seasonId] } : "forbidden";
    }
    return { kind: "seasons", seasonIds: led };
  }

  // STUDENT keeps the pinned-season route; MENTOR has no calendar (spec 03 §9).
  return "forbidden";
}
