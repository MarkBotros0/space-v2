import { db } from "../../../db/client";

/**
 * "Absent lately" (owner, 2026-11-07): the student's last two marked sessions
 * that have started, in any season that isn't deleted, were both ABSENT. A LATE
 * or PRESENT mark breaks the run; fewer than two marks is never absent lately.
 * One query over every student, a window per student: the mentor's Students
 * filter and Home figure both use it, ANDed with the list's own scope.
 */
export async function absentLatelyStudentIds(now = new Date()): Promise<number[]> {
  const rows = await db.$queryRaw<{ studentUserId: number }[]>`
    SELECT t."studentUserId"
    FROM (
      SELECT a."studentUserId", a."status",
             ROW_NUMBER() OVER (
               PARTITION BY a."studentUserId"
               ORDER BY s."startsAt" DESC, s."id" DESC
             ) AS rn
      FROM "Attendance" a
      JOIN "Session" s ON s."id" = a."sessionId"
      JOIN "Season" se ON se."id" = s."seasonId"
      WHERE s."startsAt" <= ${now} AND se."deletedAt" IS NULL
    ) t
    WHERE t.rn <= 2
    GROUP BY t."studentUserId"
    HAVING COUNT(*) = 2 AND BOOL_AND(t."status" = 'ABSENT')
  `;
  return rows.map((r) => Number(r.studentUserId));
}
