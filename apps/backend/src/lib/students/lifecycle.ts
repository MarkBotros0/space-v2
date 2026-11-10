import { db } from "../../db/client";
import { classLabel } from "@space/shared";
import { ApiError } from "../api-error";
import { invalidateSessions } from "../auth/session-validity";
import { revokeAllRefreshTokensForUser } from "../auth/tokens";
import { liveUser } from "../db/live";
import { lockPeople } from "../roles";
import { graduatePerson, passedGraduatingYears } from "./graduation";

/**
 * POST /students/:id/graduate's transaction (see the route for the rules).
 * Every refusal is an ApiError thrown before anything is written:
 * `already_graduated` from graduatePerson follows an update that matched no
 * row. Takes only the person's lock: a seat write reads graduationYear under it.
 */
export async function graduateStudentAccount(
  actorId: number,
  id: number,
  { graduationYear, override, overrideReason }: { graduationYear: number; override?: boolean; overrideReason?: string },
): Promise<{ enrollmentsCompleted: number; overridden: boolean }> {
  return db.$transaction(async (tx) => {
    await lockPeople(tx, [id]);
    const student = await tx.user.findFirst({
      where: { id, role: "STUDENT", ...liveUser },
      select: { name: true, graduationYear: true },
    });
    if (!student) throw studentNotFound();
    if (student.graduationYear !== null) throw alreadyGraduated();
    const passedYears = await passedGraduatingYears(tx, id);
    const qualified = passedYears.length > 0;
    if (!qualified && !override) {
      throw new ApiError("not_qualified", `${student.name} hasn't passed a graduating season.`, 409);
    }
    // A pass decides the class: a typed year can't put them in a different class.
    if (qualified && !passedYears.includes(graduationYear)) {
      const year = Math.max(...passedYears);
      throw new ApiError(
        "wrong_class",
        `${student.name} passed the ${year} season, so they're ${classLabel(year)}.`,
        409,
      );
    }
    // The reason is kept only when the exception was needed, and only here.
    const exception = qualified ? undefined : { byId: actorId, reason: overrideReason ?? "" };
    const done = await graduatePerson(tx, id, graduationYear, exception);
    if (done === "not_found") throw studentNotFound();
    if (done === "already_graduated") throw alreadyGraduated();
    return { ...done, overridden: !qualified };
  });
}

/**
 * DELETE /students/:id's transaction: stamps the user (a guarded update, so a
 * deleted or non-student id refuses having written nothing), then revokes
 * every refresh token and ends live access tokens (Plan 18 M13).
 */
export async function softDeleteStudent(id: number, deletedAt: Date): Promise<void> {
  await db.$transaction(async (tx) => {
    const marked = await tx.user.updateMany({
      where: { id, role: "STUDENT", ...liveUser },
      data: { deletedAt },
    });
    if (marked.count === 0) throw studentNotFound();
    await revokeAllRefreshTokensForUser(tx, id);
    await invalidateSessions(tx, id);
  });
}

const studentNotFound = () => new ApiError("not_found", "Student not found.", 404);
const alreadyGraduated = () => new ApiError("already_graduated", "This student has already graduated.", 409);
