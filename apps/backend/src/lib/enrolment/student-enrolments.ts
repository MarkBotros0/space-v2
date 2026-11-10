import { db } from "../../db/client";
import { ApiError, toApiError } from "../api-error";
import { markSessionsStale } from "../auth/session-validity";
import { liveUser } from "../db/live";
import { lockPeople, readSeatSeason, restoreStudentSeat, seatStudents } from "../roles";
import { isSeasonFinished } from "../seasons/status";

export const ALREADY_ENROLLED = "This student already has an enrollment in that season.";

const seasonFinished = () => new ApiError("season_finished", "This season has finished.", 409);

/**
 * `POST /students/:id/enrollments`' write. R2 / R47 / D1 live in
 * enrollStudentsInSeason, which the bulk importer reaches too (Plan 17 D-16.8):
 * one enrolment per student per season, EVER (a WITHDRAWN row is history, not an
 * obstacle); entry always ACTIVE; the student's sessions go stale so the derived
 * current season is re-read. Who may join is `seatStudents`, which writes
 * nothing for a refused person, so every refusal leaves the season untouched.
 * A lost race surfaces as Prisma's unique violation, which the route maps.
 */
export async function enrolStudent(id: number, seasonId: number): Promise<void> {
  await db.$transaction(async (tx) => {
    const season = await readSeatSeason(tx, seasonId);
    if (!season) throw new ApiError("not_found", "Season not found.", 404);
    if (isSeasonFinished(season.status)) throw seasonFinished();

    const student = await tx.user.findFirst({
      where: { id, role: "STUDENT", ...liveUser },
      select: { id: true },
    });
    if (!student) throw new ApiError("not_found", "Student not found.", 404);

    const { refused } = await seatStudents(tx, season, [id]);
    const refusal = refused[0]?.refusal;
    if (refusal?.code === "in_season") throw new ApiError("already_enrolled", ALREADY_ENROLLED, 409);
    if (refusal) throw toApiError(refusal);
  });
}

/**
 * Dropping's write: ACTIVE to WITHDRAWN (R48–R50), in place. A seat write like
 * any other: the season's share lock, then the person, then the row. The update
 * is conditional, so the late refusals follow an update that matched no row.
 */
export async function dropEnrolment(
  id: number,
  seasonId: number,
  dropReason: string | null | undefined,
): Promise<{ id: number; status: string }> {
  return db.$transaction(async (tx) => {
    const season = await readSeatSeason(tx, seasonId);
    if (!season) throw enrolmentNotFound();
    if (isSeasonFinished(season.status)) throw seasonFinished();
    // A draft's row is a plan: dropping would leave a "Did not finish" for a season they were never in.
    if (season.status === "DRAFT") {
      throw new ApiError("season_draft", "This season hasn't started. Remove them from it instead.", 409);
    }
    await lockPeople(tx, [id]);

    const where = { studentUserId: id, seasonId };
    // Conditional, so a row that moved on since it was last read is never overwritten.
    const [row] = await tx.seasonEnrollment.updateManyAndReturn({
      where: { ...where, status: "ACTIVE" },
      data: { status: "WITHDRAWN", droppedAt: new Date(), dropReason: dropReason ?? null },
      select: { id: true, status: true },
    });
    if (!row) {
      const exists = await tx.seasonEnrollment.count({ where });
      // R49: only an active row can be dropped; a restore is the one way back (R50).
      if (exists > 0) throw new ApiError("not_active", "Only an active enrollment can be dropped.", 409);
      throw enrolmentNotFound();
    }
    // The student's derived current season may have just changed.
    await markSessionsStale(tx, [id]);
    return row;
  });
}

/** Restore's write: the season's share lock, then the person's, as adding does. */
export async function restoreEnrolment(
  id: number,
  seasonId: number,
  actor: { id: number; override: boolean },
): Promise<{ id: number; status: string }> {
  return db.$transaction(async (tx) => {
    const season = await readSeatSeason(tx, seasonId);
    if (!season) throw new ApiError("not_found", "Season not found.", 404);
    if (isSeasonFinished(season.status)) throw seasonFinished();
    const outcome = await restoreStudentSeat(tx, season, id, actor);
    if ("code" in outcome) throw toApiError(outcome);
    return { id: outcome.id, status: outcome.status };
  });
}

const enrolmentNotFound = () => new ApiError("not_found", "Enrollment not found.", 404);
