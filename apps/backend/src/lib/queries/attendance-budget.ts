import { db } from "../../db/client";
import { budgetFrom, type AttendanceBudget } from "../attendance-budget";

export interface BudgetSeason {
  id: number;
  absenceBudgetMinutes: number;
  absenceWeightMinutes: number;
}

/**
 * v1 `computeAttendanceBudget` (lib/engagement.ts:109-151), minus its own
 * season lookup — callers already hold the season row. R91 kept: every
 * attendance row in the season counts, whatever the session's date.
 */
export async function computeAttendanceBudget(
  studentUserId: number,
  season: BudgetSeason,
): Promise<AttendanceBudget> {
  const [absentCount, late] = await Promise.all([
    db.attendance.count({
      where: { studentUserId, status: "ABSENT", session: { seasonId: season.id } },
    }),
    db.attendance.aggregate({
      where: { studentUserId, status: "LATE", session: { seasonId: season.id } },
      _count: { _all: true },
      _sum: { lateMinutes: true },
    }),
  ]);
  return budgetFrom({
    absentCount,
    lateCount: late._count._all,
    lateMinutesSum: late._sum.lateMinutes ?? 0,
    absenceWeightMinutes: season.absenceWeightMinutes,
    absenceBudgetMinutes: season.absenceBudgetMinutes,
  });
}
