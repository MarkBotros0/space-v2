import { db } from "../../db/client";
import type { SeasonResultRow } from "../../../../../packages/shared/src/index";
import { attendancePct } from "./attendance-pct";
import { liveUser } from "../db/live";

/** Finished students of a season with their result; WITHDRAWN students have none and are left out. */
export async function loadSeasonResults(seasonId: number): Promise<SeasonResultRow[]> {
  const [enrollments, sessionCount, marks] = await Promise.all([
    db.seasonEnrollment.findMany({
      where: { seasonId, status: "COMPLETED", studentUser: liveUser },
      orderBy: { studentUser: { name: "asc" } },
      select: {
        studentUserId: true,
        result: true,
        resultReason: true,
        studentUser: { select: { name: true, graduationYear: true } },
        group: { select: { name: true } },
      },
    }),
    db.session.count({ where: { seasonId } }),
    db.attendance.findMany({
      where: { session: { seasonId }, status: { in: ["PRESENT", "LATE"] } },
      select: { studentUserId: true },
    }),
  ]);
  const attended = new Map<number, number>();
  for (const m of marks) attended.set(m.studentUserId, (attended.get(m.studentUserId) ?? 0) + 1);
  return enrollments.map((e) => ({
    userId: e.studentUserId,
    name: e.studentUser.name,
    isAlumnus: e.studentUser.graduationYear !== null,
    groupName: e.group?.name ?? null,
    attendancePct: attendancePct(attended.get(e.studentUserId) ?? 0, sessionCount),
    result: e.result,
    reason: e.resultReason,
  }));
}
