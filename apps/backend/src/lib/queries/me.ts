import { db } from "../../db/client";
import type { AttendanceStatus, SeasonStatus } from "../../generated/prisma/enums";
import type { SessionUser } from "../auth/tokens";
import { costMinutesFor, streakFrom, type AttendanceBudget } from "../attendance-budget";
import { orgDayKey } from "../org-time";
import { isAlumnus } from "../rbac";
import { computeAttendanceBudget } from "./attendance-budget";
import { loadSeasonProgress } from "./sessions";

/*
 * The student's own reads. Every function takes the SessionUser and reads
 * `user.userId` — the subject is the token's, never a parameter (spec 02 D13:
 * v1's loadSeasonHistory took any studentUserId and was safe only because
 * both call sites happened to pass their own).
 */

// ---------------------------------------------------------------------------
// Season history — v1 lib/season-history-query.ts:18-80
// ---------------------------------------------------------------------------

export interface SeasonHistoryCurriculumItem {
  sessionId: number;
  title: string;
  startsAt: Date;
  dayKey: string;
}

export interface SeasonHistoryRow {
  seasonId: number;
  title: string;
  startDate: Date;
  endDate: Date;
  groupName: string | null;
  attendancePct: number;
  curriculum: SeasonHistoryCurriculumItem[];
}

export async function loadSeasonHistory(user: SessionUser): Promise<SeasonHistoryRow[]> {
  // R35, decided from the token (Plan 11 Decision 3): a current student's
  // history excludes the season they are in; an alumnus sees everything.
  const excludeSeasonId = isAlumnus(user) ? null : user.activeSeasonId;

  // R33: one row per enrollment, enrolledAt desc, whatever its status.
  // R34: no submissions, feedback or notes are selected — ever.
  const enrollments = await db.seasonEnrollment.findMany({
    where: {
      studentUserId: user.userId,
      // No season.deletedAt filter: v1 lists deleted seasons too (02-seasons
      // R38; v1 parity 2026-10-09).
      ...(excludeSeasonId !== null ? { seasonId: { not: excludeSeasonId } } : {}),
    },
    orderBy: { enrolledAt: "desc" },
    select: {
      seasonId: true,
      season: { select: { title: true, startDate: true, endDate: true } },
      group: { select: { name: true } },
    },
  });
  if (enrollments.length === 0) return []; // R41

  const seasonIds = enrollments.map((e) => e.seasonId);
  const [sessions, attended] = await Promise.all([
    db.session.findMany({
      where: { seasonId: { in: seasonIds } },
      orderBy: { startsAt: "asc" }, // R39
      select: { id: true, title: true, startsAt: true, seasonId: true },
    }),
    db.attendance.findMany({
      where: {
        studentUserId: user.userId,
        status: { in: ["PRESENT", "LATE"] },
        session: { seasonId: { in: seasonIds } },
      },
      select: { session: { select: { seasonId: true } } },
    }),
  ]);

  const curricula = new Map<number, SeasonHistoryCurriculumItem[]>();
  for (const s of sessions) {
    const list = curricula.get(s.seasonId) ?? [];
    list.push({ sessionId: s.id, title: s.title, startsAt: s.startsAt, dayKey: orgDayKey(s.startsAt) });
    curricula.set(s.seasonId, list);
  }
  const attendedBySeason = new Map<number, number>();
  for (const a of attended) {
    attendedBySeason.set(a.session.seasonId, (attendedBySeason.get(a.session.seasonId) ?? 0) + 1);
  }

  return enrollments.map((e) => {
    const curriculum = curricula.get(e.seasonId) ?? [];
    const present = attendedBySeason.get(e.seasonId) ?? 0;
    return {
      seasonId: e.seasonId,
      title: e.season.title,
      startDate: e.season.startDate,
      endDate: e.season.endDate,
      groupName: e.group?.name ?? null,
      // R36/R37: PRESENT+LATE over every session the season has now, rounded;
      // 0 with no sessions. Retroactive by design (spec 02 D14 — accepted).
      attendancePct: curriculum.length > 0 ? Math.round((present / curriculum.length) * 100) : 0,
      curriculum,
    };
  });
}

// ---------------------------------------------------------------------------
// Current season — v1 app/student/season/page.tsx:40-89
// ---------------------------------------------------------------------------

export const UPCOMING_LIMIT = 3;

export interface MySeason {
  id: number;
  code: string;
  title: string;
  description: string | null;
  status: SeasonStatus;
  startDate: Date;
  endDate: Date;
  progress: { completedSessions: number; totalSessions: number; pct: number };
  group: {
    id: number;
    name: string;
    description: string | null;
    leaders: { id: number; name: string; email: string }[];
    members: { id: number; name: string; isYou: boolean }[];
  } | null;
  upcoming: { id: number; title: string; startsAt: Date; dayKey: string; location: string | null }[];
}

export async function loadMySeason(user: SessionUser, now: Date = new Date()): Promise<MySeason | null> {
  const seasonId = user.activeSeasonId;
  if (seasonId === null) return null; // R28

  const season = await db.season.findFirst({
    // No deletedAt filter — a soft-deleted active season stays visible to its
    // students, as v1 (02-seasons R27; v1 parity 2026-10-09).
    where: { id: seasonId },
    select: { id: true, code: true, title: true, description: true, status: true, startDate: true, endDate: true },
  });
  if (!season) return null;

  const [enrollment, upcoming, progress] = await Promise.all([
    // Ruling C9: the group for THIS season comes from the enrollment. v1 read
    // GroupStudent with no season filter (R31/R88) and could show last
    // season's group beside this season's progress.
    db.seasonEnrollment.findUnique({
      where: { studentUserId_seasonId: { studentUserId: user.userId, seasonId } },
      select: {
        group: {
          select: {
            id: true,
            name: true,
            description: true,
            leaders: {
              orderBy: { user: { name: "asc" } },
              select: { user: { select: { id: true, name: true, email: true } } },
            },
          },
        },
      },
    }),
    db.session.findMany({
      where: { seasonId, startsAt: { gte: now } }, // R30
      orderBy: { startsAt: "asc" },
      take: UPCOMING_LIMIT,
      select: { id: true, title: true, startsAt: true, location: true },
    }),
    loadSeasonProgress(seasonId, now),
  ]);

  const group = enrollment?.group ?? null;
  // Members = ACTIVE enrollments in this group for this season — the same rule
  // groupListItemSchema.studentCount uses (C9), so the two never disagree.
  const members = group
    ? await db.seasonEnrollment.findMany({
        where: { seasonId, groupId: group.id, status: "ACTIVE", studentUser: { deletedAt: null } },
        orderBy: { studentUser: { name: "asc" } },
        select: { studentUser: { select: { id: true, name: true } } },
      })
    : [];

  return {
    ...season,
    // Plan 11's contract keeps its names and its 0 for an empty season; the
    // count itself is the shared definition (spec 19 §7).
    progress: {
      completedSessions: progress.sessionsHeld,
      totalSessions: progress.sessionsTotal,
      pct: progress.pct ?? 0,
    },
    group: group
      ? {
          id: group.id,
          name: group.name,
          description: group.description,
          leaders: group.leaders.map((l) => l.user),
          // R89: peers by name only — never an email.
          members: members.map((m) => ({
            id: m.studentUser.id,
            name: m.studentUser.name,
            isYou: m.studentUser.id === user.userId,
          })),
        }
      : null,
    upcoming: upcoming.map((s) => ({ ...s, dayKey: orgDayKey(s.startsAt) })),
  };
}

// ---------------------------------------------------------------------------
// Attendance — v1 app/student/attendance/page.tsx:44-72 + engagement streak
// ---------------------------------------------------------------------------

export interface MyAttendanceSessionRow {
  sessionId: number;
  title: string;
  startsAt: Date;
  dayKey: string;
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
    // No deletedAt filter (02-seasons R27; v1 parity 2026-10-09).
    where: { id: user.activeSeasonId },
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

// ---------------------------------------------------------------------------
// Own profile — v1 app/student/profile/page.tsx, app/alumni/profile/page.tsx
// ---------------------------------------------------------------------------

export interface MyProfileRow {
  name: string;
  email: string;
  avatarPath: string | null;
  graduationYear: number | null;
  activeSeasonTitle: string | null;
  university: string | null;
  year: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  spiritualBackground: string | null;
  gifts: string | null;
}

/**
 * Deliberately NOT GET /students/:id with id = self (spec 06 §7): `notes` is
 * not in this select at all, so no future flag can leak it (R23, R71).
 */
export async function loadMyProfile(userId: number): Promise<MyProfileRow | null> {
  const row = await db.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      name: true,
      email: true,
      avatarPath: true,
      graduationYear: true,
      studentProfile: {
        select: {
          university: true,
          year: true,
          phone: true,
          dateOfBirth: true,
          spiritualBackground: true,
          gifts: true,
          activeSeason: { select: { title: true, deletedAt: true } },
        },
      },
    },
  });
  if (!row) return null;
  const p = row.studentProfile;
  return {
    name: row.name,
    email: row.email,
    avatarPath: row.avatarPath,
    graduationYear: row.graduationYear,
    activeSeasonTitle: p?.activeSeason && p.activeSeason.deletedAt === null ? p.activeSeason.title : null,
    university: p?.university ?? null,
    year: p?.year ?? null,
    phone: p?.phone ?? null,
    // A calendar date stored at UTC midnight (Plan 11 Decision 11).
    dateOfBirth: p?.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : null,
    spiritualBackground: p?.spiritualBackground ?? null,
    gifts: p?.gifts ?? null,
  };
}
