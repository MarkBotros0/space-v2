import { db } from "../db/client";
import { AttendanceStatus } from "../generated/prisma/enums";

import { createNotificationsBulk } from "./notifications";

/** If a student has 2+ consecutive ABSENTs in this season, flag them as high-risk
 *  to their group leaders and season admins (each with a link they can actually open). */
export async function flagLowAttendance(
  sessionId: number,
  entries: { studentUserId: number; status: AttendanceStatus }[],
): Promise<void> {
  const absentStudents = entries
    .filter((e) => e.status === AttendanceStatus.ABSENT)
    .map((e) => e.studentUserId);
  if (absentStudents.length === 0) return;

  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { id: true, seasonId: true, startsAt: true },
  });
  if (!session) return;

  for (const studentUserId of absentStudents) {
    const recent = await db.attendance.findMany({
      where: {
        studentUserId,
        session: { seasonId: session.seasonId, startsAt: { lte: session.startsAt } },
      },
      orderBy: { session: { startsAt: "desc" } },
      take: 2,
      select: { status: true },
    });
    if (recent.length < 2) continue;
    if (!recent.every((r) => r.status === AttendanceStatus.ABSENT)) continue;

    const membership = await db.groupStudent.findUnique({
      where: { studentUserId },
      select: { groupId: true },
    });
    if (!membership) continue;

    const leaders = await db.groupLeader.findMany({
      where: { groupId: membership.groupId },
      select: { userId: true },
    });
    const admins = await db.seasonAdmin.findMany({
      where: { seasonId: session.seasonId },
      select: { userId: true },
    });
    const adminIds = admins.map((a) => a.userId);
    const leaderOnlyIds = leaders
      .map((l) => l.userId)
      .filter((id) => !adminIds.includes(id));
    const student = await db.user.findUnique({
      where: { id: studentUserId },
      select: { name: true },
    });
    const title = `${student?.name ?? "A student"} is at high risk — 2 consecutive absences`;
    const body = "Consider reaching out for a check-in.";
    // Each recipient gets a link they can actually open: admins → admin view, leaders → leader view.
    if (adminIds.length > 0) {
      await createNotificationsBulk(adminIds, {
        type: "LOW_ATTENDANCE_FLAG",
        title,
        body,
        link: `/admin/students/${studentUserId}`,
      });
    }
    if (leaderOnlyIds.length > 0) {
      await createNotificationsBulk(leaderOnlyIds, {
        type: "LOW_ATTENDANCE_FLAG",
        title,
        body,
        link: `/leader/students/${studentUserId}`,
      });
    }
  }
}
