import { db } from "../../db/client";
import { ApiError } from "../api-error";
import { isCheckInOpen, isStudentCheckInWindow } from "../check-in";
import { MS_PER_MINUTE } from "../org-time";

/**
 * A student's check-in with a session's token (POST /sessions/check-in). Every
 * refusal is an ApiError thrown before the one write; the codes, messages and
 * statuses are the route's, in the same order.
 */
export async function checkInStudent(
  userId: number,
  token: string,
  now: Date,
): Promise<{ status: "PRESENT" | "LATE"; minutesLate: number }> {
  const session = await db.session.findUnique({
    where: { checkInToken: token },
    select: {
      id: true,
      seasonId: true,
      startsAt: true,
      checkInOpenAt: true,
      checkInClosedAt: true,
    },
  });
  if (!session) throw new ApiError("invalid_token", "Check-in token is invalid.", 404);

  // Checked separately from isCheckInOpen so "never opened" stays distinguishable from "opened and since expired".
  if (!session.checkInOpenAt) throw new ApiError("not_open", "Check-in is not open yet.", 409);
  if (!isCheckInOpen(session, now)) throw new ApiError("closed", "Check-in has closed.", 409);

  const enrollment = await db.seasonEnrollment.findUnique({
    where: { studentUserId_seasonId: { studentUserId: userId, seasonId: session.seasonId } },
    select: { status: true, season: { select: { status: true } } },
  });
  // A draft's roster doesn't count yet, and the session's existence says nothing.
  if (!enrollment || enrollment.status !== "ACTIVE" || enrollment.season.status !== "ACTIVE") {
    throw new ApiError("not_enrolled", "You're not enrolled in this season.", 403);
  }

  // Opened early by an admin, but students wait for the hour before the start (owner, 2026-11-08).
  if (!isStudentCheckInWindow(session.startsAt, now)) {
    throw new ApiError("not_open", "Check-in opens an hour before the session.", 409);
  }

  const existing = await db.attendance.findUnique({
    where: { sessionId_studentUserId: { sessionId: session.id, studentUserId: userId } },
    select: { checkedInAt: true, status: true },
  });
  if (existing?.checkedInAt) throw new ApiError("already_checked_in", "Already checked in.", 409);

  // Ruling C3: lateness is measured from the session's START — not from when
  // an admin pressed "Open check-in" (spec 04 R63, D1), which made a punctual
  // student LATE whenever the console opened early. The threshold is zero:
  // there is no `Season.lateThresholdMinutes` (C3 over spec 04 D1's
  // 15-minute grace). Rows v1 wrote still mean "minutes since opening";
  // C3 accepts that divergence (the workbook withholds those minutes).
  const minutesLate = Math.max(0, Math.floor((now.getTime() - session.startsAt.getTime()) / MS_PER_MINUTE));
  const status: "PRESENT" | "LATE" = minutesLate > 0 ? "LATE" : "PRESENT";

  await db.attendance.upsert({
    where: { sessionId_studentUserId: { sessionId: session.id, studentUserId: userId } },
    create: {
      sessionId: session.id,
      studentUserId: userId,
      status,
      checkedInAt: now,
      lateMinutes: status === "LATE" ? minutesLate : null,
      markedById: userId,
      markedAt: now,
    },
    update: {
      status,
      checkedInAt: now,
      lateMinutes: status === "LATE" ? minutesLate : null,
    },
  });

  return { status, minutesLate };
}
