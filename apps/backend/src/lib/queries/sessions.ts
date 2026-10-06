import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { orgDayKey, orgWallTime } from "../org-time";
import type { CalendarScope } from "../permissions";

export interface SessionListRow {
  id: number;
  title: string;
  startsAt: Date;
  /** Org-calendar day of startsAt (Plan 4, X13). */
  dayKey: string;
  /** Org wall-clock "HH:mm" of startsAt (Plan 6, X13). */
  startTime: string;
  durationMinutes: number;
  location: string | null;
  recurrenceGroupId: string | null;
  attendanceMarked: boolean;
  seasonId: number;
  seasonCode: string;
  seasonTitle: string;
  checkInToken: string | null;
  checkInOpenAt: Date | null;
  checkInClosedAt: Date | null;
}

const SESSION_LIST_SELECT = {
  id: true,
  title: true,
  startsAt: true,
  durationMinutes: true,
  location: true,
  recurrenceGroupId: true,
  checkInToken: true,
  checkInOpenAt: true,
  checkInClosedAt: true,
  _count: { select: { attendance: true } },
  season: { select: { id: true, code: true, title: true } },
} as const satisfies Prisma.SessionSelect;

type SessionListSource = Prisma.SessionGetPayload<{ select: typeof SESSION_LIST_SELECT }>;

/**
 * Possession of `checkInToken` is what authorises a check-in, so it is
 * masked unless the caller may run check-in for that row's season — every
 * list path masks through here.
 */
function toSessionListRow(s: SessionListSource, includeToken: boolean): SessionListRow {
  return {
    id: s.id,
    title: s.title,
    startsAt: s.startsAt,
    dayKey: orgDayKey(s.startsAt),
    startTime: orgWallTime(s.startsAt),
    durationMinutes: s.durationMinutes,
    location: s.location,
    recurrenceGroupId: s.recurrenceGroupId,
    attendanceMarked: s._count.attendance > 0,
    seasonId: s.season.id,
    seasonCode: s.season.code,
    seasonTitle: s.season.title,
    checkInToken: includeToken ? (s.checkInToken ?? null) : null,
    checkInOpenAt: s.checkInOpenAt,
    checkInClosedAt: s.checkInClosedAt,
  };
}

/** Unchanged contract (Phase 0 / Plan 4): token for every non-student caller. */
export async function listSessionsForSeason(
  seasonId: number,
  { includeCheckInToken = true }: { includeCheckInToken?: boolean } = {},
): Promise<SessionListRow[]> {
  const rows = await db.session.findMany({
    where: { seasonId },
    orderBy: { startsAt: "asc" },
    select: SESSION_LIST_SELECT,
  });
  return rows.map((s) => toSessionListRow(s, includeCheckInToken));
}

/**
 * The multi-season calendar (Plan 6 D-16.7; v1 sessions-query.ts:64-116).
 * `active` is v1's "all ACTIVE, non-deleted seasons" (R23); `seasons` is an
 * explicit, already-authorized set. The window is half-open [from, to).
 */
export async function listSessionsInRange(
  scope: CalendarScope,
  window: { from: Date; to: Date },
  includeTokenFor: (seasonId: number) => boolean,
): Promise<SessionListRow[]> {
  const where: Prisma.SessionWhereInput = {
    startsAt: { gte: window.from, lt: window.to },
    ...(scope.kind === "active"
      ? { season: { status: "ACTIVE", deletedAt: null } }
      : { seasonId: { in: scope.seasonIds } }),
  };
  const rows = await db.session.findMany({ where, orderBy: { startsAt: "asc" }, select: SESSION_LIST_SELECT });
  return rows.map((s) => toSessionListRow(s, includeTokenFor(s.season.id)));
}

export interface AttendanceRosterEntry {
  studentUserId: number;
  name: string | null;
  email: string;
  groupName: string | null;
  status: "PRESENT" | "ABSENT" | "LATE" | null;
  notes: string | null;
  lateMinutes: number | null;
}

/**
 * Returns null when the session does not exist. v1 called Next's notFound()
 * here; outside Next the caller owns the 404.
 */
export async function loadAttendanceRoster(
  sessionId: number,
  groupIds?: number[],
): Promise<AttendanceRosterEntry[] | null> {
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { seasonId: true },
  });
  if (!session) return null;

  const enrollments = await db.seasonEnrollment.findMany({
    where: {
      seasonId: session.seasonId,
      status: "ACTIVE",
      ...(groupIds ? { groupId: { in: groupIds } } : {}),
    },
    select: {
      studentUserId: true,
      group: { select: { name: true } },
      studentUser: { select: { name: true, email: true } },
    },
    orderBy: [{ group: { name: "asc" } }, { studentUser: { name: "asc" } }],
  });

  const attendance = await db.attendance.findMany({
    where: { sessionId },
    select: { studentUserId: true, status: true, notes: true, lateMinutes: true },
  });
  const byStudent = new Map(attendance.map((a) => [a.studentUserId, a]));

  return enrollments.map((e) => {
    const a = byStudent.get(e.studentUserId);
    return {
      studentUserId: e.studentUserId,
      name: e.studentUser.name,
      email: e.studentUser.email,
      groupName: e.group?.name ?? null,
      status: a?.status ?? null,
      notes: a?.notes ?? null,
      lateMinutes: a?.lateMinutes ?? null,
    };
  });
}
