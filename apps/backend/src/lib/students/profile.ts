import type { Prisma } from "../../generated/prisma/client";
import { db } from "../../db/client";
// Relative, not "@space/shared" — same emit trap routes/auth.ts documents.
import type { CreateStudentBody, UpdateStudentBody } from "../../../../../packages/shared/src/index";
import { ApiError, toApiError } from "../api-error";
import { mintInvite, type IssuedInvite } from "../invites";
// Through the index, which re-exports lib/students/create (a unit test mocks it there).
import { createStudentRows } from "../queries/students";
import { newPersonRefusal, readSeatSeason } from "../roles";

/**
 * POST /students' transaction: the seat check for the season, the rows, and
 * the invite. A refusal is an ApiError thrown before anything is written; a
 * lost email race surfaces as Prisma's unique violation, which the route maps.
 */
export async function createStudentWithInvite(
  actorId: number,
  body: CreateStudentBody,
): Promise<{ student: { id: number; email: string }; issued: IssuedInvite }> {
  return db.$transaction(async (tx) => {
    if (body.seasonId != null) {
      const season = await readSeatSeason(tx, body.seasonId);
      if (!season) throw new ApiError("not_found", "Season not found.", 404);
      const refusal = await newPersonRefusal(tx, body.name, season);
      if (refusal) throw toApiError(refusal);
    }
    // One writer for these rows (D-16.8): the bulk importer calls exactly
    // this function, so the two paths cannot drift apart the way v1's did.
    // Plan 10's invite stays below, outside it — the importer never mints one.
    const [student] = await createStudentRows(
      tx,
      [
        {
          name: body.name,
          email: body.email,
          university: body.university ?? null,
          faculty: body.faculty ?? null,
          universityGraduationYear: body.universityGraduationYear ?? null,
          phone: body.phone ?? null,
          dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
          notes: body.notes ?? null,
        },
      ],
      body.seasonId != null ? { kind: "season", seasonId: body.seasonId } : { kind: "none" },
    );
    if (!student) throw new Error("createStudentRows returned no row for one input");
    // Plan 10 Decision 1 — spec 06 D7 / spec 11 §7: creation and
    // invitation are ONE operation, exactly as POST /users does it. The
    // invite is minted in this transaction (a rolled-back student can't
    // have an invite) and mailed after commit (a mail failure can't roll
    // back the student). It stays here, after the row writes, not in
    // createStudentRows: the importer must keep sending nothing (its R55).
    // mintInvite, not issueInvite: a brand-new account holds no older invite
    // to expire.
    const issued = await mintInvite(tx, student.id, actorId);
    return { student, issued };
  });
}

/** PATCH /students/:id's write: the User columns, then the profile (upserted). */
export async function saveStudentRecord(
  id: number,
  userData: Prisma.UserUpdateInput,
  profileData: Prisma.StudentProfileUpdateInput,
  body: UpdateStudentBody,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: userData,
    });
    // Upsert, not update: every creation path makes a profile row today,
    // but v1's unconditional update throws for a STUDENT without one
    // (spec 06 §2's flagged hazard) — the upsert closes that hole without
    // a schema change.
    await tx.studentProfile.upsert({
      where: { userId: id },
      update: profileData,
      create: {
        userId: id,
        university: body.university ?? null,
        faculty: body.faculty ?? null,
        universityGraduationYear: body.universityGraduationYear ?? null,
        notes: body.notes ?? null,
      },
    });
  });
}
