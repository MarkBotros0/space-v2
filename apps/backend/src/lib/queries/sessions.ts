import { db } from "../../db/client";

export interface SessionListRow {
  id: number;
  title: string;
  startsAt: Date;
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

/**
 * Possession of `checkInToken` is what authorises a check-in, so it must never
 * reach students — a student holding it could mark themselves present without
 * attending, or pass it to someone who is absent.
 */
export async function listSessionsForSeason(
  seasonId: number,
  { includeCheckInToken = true }: { includeCheckInToken?: boolean } = {},
): Promise<SessionListRow[]> {
  const rows = await db.session.findMany({
    where: { seasonId },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      title: true,
      startsAt: true,
      durationMinutes: true,
      location: true,
      recurrenceGroupId: true,
      checkInToken: includeCheckInToken,
      checkInOpenAt: true,
      checkInClosedAt: true,
      _count: { select: { attendance: true } },
      season: { select: { id: true, code: true, title: true } },
    },
  });
  return rows.map((s) => ({
    id: s.id,
    title: s.title,
    startsAt: s.startsAt,
    durationMinutes: s.durationMinutes,
    location: s.location,
    recurrenceGroupId: s.recurrenceGroupId,
    attendanceMarked: s._count.attendance > 0,
    seasonId: s.season.id,
    seasonCode: s.season.code,
    seasonTitle: s.season.title,
    checkInToken: includeCheckInToken ? (s.checkInToken ?? null) : null,
    checkInOpenAt: s.checkInOpenAt,
    checkInClosedAt: s.checkInClosedAt,
  }));
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
