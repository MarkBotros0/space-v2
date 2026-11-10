import { db } from "../../db/client";
import { AttendanceStatus } from "../../generated/prisma/enums";

type Entry = { studentUserId: number; status: AttendanceStatus; notes?: string | null; lateMinutes?: number | null };

/**
 * Marks a session's attendance for every entry, all or none (PUT
 * /sessions/:id/attendance). The caller has already checked every student is
 * in its scope; it sends the low-attendance alerts after this commits.
 */
export async function saveAttendanceEntries(sessionId: number, entries: Entry[], markedById: number): Promise<void> {
  // One transaction so a partially-saved roster is impossible: either every
  // student in this batch is marked, or none is.
  await db.$transaction(
    entries.map((e) =>
      db.attendance.upsert({
        where: { sessionId_studentUserId: { sessionId, studentUserId: e.studentUserId } },
        update: {
          status: e.status,
          notes: e.notes ?? null,
          // Lateness is meaningless unless the status is LATE, and leaving a
          // stale value behind would corrupt attendance reporting.
          lateMinutes: e.status === AttendanceStatus.LATE ? (e.lateMinutes ?? null) : null,
          markedById,
          markedAt: new Date(),
        },
        create: {
          sessionId,
          studentUserId: e.studentUserId,
          status: e.status,
          notes: e.notes ?? null,
          lateMinutes: e.status === AttendanceStatus.LATE ? (e.lateMinutes ?? null) : null,
          markedById,
        },
      }),
    ),
  );
}
