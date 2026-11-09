import { db } from "../../../db/client";
import type { SessionUser } from "../../auth/tokens";
import { orgDayKey } from "../../org-time";
import type { SeasonOutcome } from "../../../../../../packages/shared/src/season-lifecycle";
import { attendancePct } from "../attendance-pct";
import { outcomeOf } from "./outcome";

/*
 * Season history: past enrolments only (anything not ACTIVE), for students and
 * alumni alike. The subject is the token's, never a parameter (spec 02 D13).
 */

interface SeasonHistoryCurriculumItem {
  sessionId: number;
  title: string;
  startsAt: Date;
  dayKey: string;
}

export interface SeasonHistoryRow {
  seasonId: number;
  code: string;
  title: string;
  startDate: Date;
  endDate: Date;
  groupName: string | null;
  outcome: SeasonOutcome;
  attendancePct: number;
  curriculum: SeasonHistoryCurriculumItem[];
}

export async function loadSeasonHistory(user: SessionUser): Promise<SeasonHistoryRow[]> {
  // R33: one row per past enrolment, enrolledAt desc. R34: no submissions,
  // feedback, notes or reasons are selected — ever.
  const enrollments = await db.seasonEnrollment.findMany({
    where: {
      studentUserId: user.userId,
      status: { not: "ACTIVE" },
      // Deleted: spec 02 D2 (diverges from v1 R38). DRAFT: being taken off a draft's
      // roster is not a season the student finished or left.
      season: { deletedAt: null, status: { not: "DRAFT" } },
    },
    orderBy: { enrolledAt: "desc" },
    select: {
      seasonId: true,
      status: true,
      result: true,
      season: { select: { code: true, title: true, startDate: true, endDate: true } },
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
    return {
      seasonId: e.seasonId,
      code: e.season.code,
      title: e.season.title,
      startDate: e.season.startDate,
      endDate: e.season.endDate,
      groupName: e.group?.name ?? null,
      outcome: outcomeOf(e.status, e.result),
      // R36/R37: PRESENT+LATE over every session the season has now (spec 02 D14).
      attendancePct: attendancePct(attendedBySeason.get(e.seasonId) ?? 0, curriculum.length),
      curriculum,
    };
  });
}
