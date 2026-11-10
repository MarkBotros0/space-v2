import type { Prisma } from "../../generated/prisma/client";
import { markSessionsStale } from "../auth/session-validity";
import { finishedSeasonStatus } from "../seasons/status";
import { liveSeason, liveUser } from "../db/live";

/** Anything recorded for this person in this season. Remove and graduation both keep the row then. */
export async function hasWorkInSeason(
  tx: Prisma.TransactionClient,
  studentUserId: number,
  seasonId: number,
): Promise<boolean> {
  const select = { id: true };
  const submission = await tx.submission.findFirst({ where: { studentUserId, assignment: { seasonId } }, select });
  if (submission) return true;
  const attempt = await tx.quizAttempt.findFirst({ where: { studentUserId, quiz: { seasonId } }, select });
  if (attempt) return true;
  const attendance = await tx.attendance.findFirst({ where: { studentUserId, session: { seasonId } }, select });
  if (attendance) return true;
  return (await tx.quizGrade.findFirst({ where: { studentUserId, quiz: { seasonId } }, select })) !== null;
}

/** A draft's row goes entirely, with the group place it carries. The caller has checked `hasWorkInSeason`. */
export async function deleteDraftRow(
  tx: Prisma.TransactionClient,
  row: { id: number; seasonId: number; studentUserId: number },
): Promise<void> {
  await tx.groupStudent.deleteMany({ where: { seasonId: row.seasonId, studentUserId: row.studentUserId } });
  await tx.seasonEnrollment.delete({ where: { id: row.id } });
}

/**
 * A graduate's places on regular draft rosters (a community-wide season keeps its
 * alumni): a plan, not history, so they go, or a
 * COMPLETED row with no result would show in History once the draft starts. Work
 * recorded on one keeps it (the graduation then completes it), as Remove refuses.
 * Takes no season lock: the caller holds the people and the season comes first. A
 * Start racing this waits on the person and reads the roster after.
 */
async function clearDraftRows(tx: Prisma.TransactionClient, studentUserIds: number[]): Promise<void> {
  const rows = await tx.seasonEnrollment.findMany({
    where: {
      studentUserId: { in: studentUserIds },
      status: "ACTIVE",
      season: { status: "DRAFT", isCommunityWide: false },
    },
    select: { id: true, seasonId: true, studentUserId: true },
  });
  for (const row of rows) {
    if (!(await hasWorkInSeason(tx, row.studentUserId, row.seasonId))) await deleteDraftRow(tx, row);
  }
}

type GraduationOutcome = "not_found" | "already_graduated" | { enrollmentsCompleted: number };

/**
 * One person's graduation, as `POST /students/:id/graduate` and a corrected
 * result on a graduating season both do it: sets graduationYear (the alumnus marker; role stays
 * STUDENT, R57), completes every ACTIVE enrolment in a regular season with no result (R48/R60; a
 * community-wide season carries on), a
 * draft's row excepted (`clearDraftRows`), and
 * ends live access tokens so the new claims are picked up. Terminal enrolments
 * are history and aren't touched. Call it after `lockPeople`.
 */
export async function graduatePerson(
  tx: Prisma.TransactionClient,
  id: number,
  graduationYear: number,
  /** Set only by the rare exception: who, and why (trimmed). */
  exception?: { byId: number; reason: string },
): Promise<GraduationOutcome> {
  const student = await tx.user.findFirst({
    where: { id, role: "STUDENT", ...liveUser },
    select: { graduationYear: true },
  });
  if (!student) return "not_found";
  // Guarded write: of two concurrent graduations exactly one matches
  // `graduationYear: null`; the other sees count 0 and is refused.
  const marked = await tx.user.updateMany({
    where: { id, graduationYear: null },
    data: {
      graduationYear,
      ...(exception
        ? {
            graduationOverrideAt: new Date(),
            graduationOverrideById: exception.byId,
            graduationOverrideReason: exception.reason,
          }
        : {}),
    },
  });
  if (marked.count === 0) return "already_graduated";
  await clearDraftRows(tx, [id]);
  const completed = await tx.seasonEnrollment.updateMany({
    where: { studentUserId: id, status: "ACTIVE", season: { isCommunityWide: false } },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  await markSessionsStale(tx, [id]);
  return { enrollmentsCompleted: completed.count };
}

/**
 * A graduating season's End: everyone in `ids` who is a live student and not yet
 * an alumnus graduates, the same as `graduatePerson` but in a flat statement count
 * for the whole season. Any other live seat they hold ends too; the season being
 * ended has already closed its own. Returns who graduated. The caller holds their
 * locks and marks sessions stale.
 */
export async function graduatePassed(
  tx: Prisma.TransactionClient,
  ids: number[],
  graduationYear: number,
): Promise<number[]> {
  const who = { id: { in: ids }, role: "STUDENT" as const, ...liveUser, graduationYear: null };
  const graduating = (await tx.user.findMany({ where: who, select: { id: true } })).map((u) => u.id);
  if (graduating.length === 0) return [];
  await tx.user.updateMany({ where: { id: { in: graduating }, graduationYear: null }, data: { graduationYear } });
  await clearDraftRows(tx, graduating);
  await tx.seasonEnrollment.updateMany({
    where: { studentUserId: { in: graduating }, status: "ACTIVE", season: { isCommunityWide: false } },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  return graduating;
}

/**
 * The rule the graduate action checks: a COMPLETED, PASSED enrolment in a finished
 * season marked as graduating. Anyone else needs a super's override.
 */
export async function passedGraduatingYears(tx: Prisma.TransactionClient, studentUserId: number): Promise<number[]> {
  const rows = await tx.seasonEnrollment.findMany({
    where: {
      studentUserId,
      status: "COMPLETED",
      result: "PASSED",
      season: { graduatesOnPass: true, status: finishedSeasonStatus, ...liveSeason },
    },
    select: { season: { select: { year: true } } },
  });
  return rows.map((row) => row.season.year);
}
