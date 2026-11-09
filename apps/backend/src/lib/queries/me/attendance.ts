import { db } from "../../../db/client";
import type { AttendanceStatus } from "../../../generated/prisma/enums";
import type { SessionUser } from "../../auth/tokens";
import { costMinutesFor, streakFrom, type AttendanceBudget } from "../../attendance-budget";
import { orgDayKey, orgWallTime } from "../../org-time";
import { computeAttendanceBudget } from "../attendance-budget";
import { liveSeason } from "../../db/live";

// ---------------------------------------------------------------------------
// Attendance — v1 app/student/attendance/page.tsx:44-72 + engagement streak
// ---------------------------------------------------------------------------

interface MyAttendanceSessionRow {
  sessionId: number;
  title: string;
  startsAt: Date;
  dayKey: string;
  startTime: string;
  status: AttendanceStatus | null;
  checkedInAt: Date | null;
  lateMinutes: number | null;
  costMinutes: number | null;
}

export interface MyAttendance {
  season: { id: number; title: string; absenceBudgetMinutes: number; absenceWeightMinutes: number } | null;
  budget: AttendanceBudget | null;
  streak: number;
  sessions: MyAttendanceSessionRow[];
}

export async function loadMyAttendance(user: SessionUser, now: Date = new Date()): Promise<MyAttendance> {
  const none: MyAttendance = { season: null, budget: null, streak: 0, sessions: [] };
  if (user.activeSeasonId === null) return none; // R93

  const season = await db.season.findFirst({
    where: { id: user.activeSeasonId, ...liveSeason },
    select: { id: true, title: true, absenceBudgetMinutes: true, absenceWeightMinutes: true },
  });
  if (!season) return none;

  const [budget, past] = await Promise.all([
    computeAttendanceBudget(user.userId, season),
    db.session.findMany({
      where: { seasonId: season.id, startsAt: { lte: now } }, // R94
      orderBy: { startsAt: "desc" },
      select: {
        id: true,
        title: true,
        startsAt: true,
        attendance: {
          where: { studentUserId: user.userId },
          select: { status: true, checkedInAt: true, lateMinutes: true },
        },
      },
    }),
  ]);

  const sessions = past.map((s) => {
    const record = s.attendance[0] ?? null;
    const status = record?.status ?? null;
    return {
      sessionId: s.id,
      title: s.title,
      startsAt: s.startsAt,
      dayKey: orgDayKey(s.startsAt),
      startTime: orgWallTime(s.startsAt),
      status,
      checkedInAt: record?.checkedInAt ?? null,
      lateMinutes: status === "LATE" ? (record?.lateMinutes ?? null) : null,
      costMinutes: costMinutesFor(status, record?.lateMinutes ?? null, season.absenceWeightMinutes),
    };
  });

  // The streak walks the SAME past-session list (spec 09 R69) — no second
  // query, unlike v1's separate computeAttendanceStreak scan (R70).
  return { season, budget, streak: streakFrom(sessions.map((s) => s.status)), sessions };
}
