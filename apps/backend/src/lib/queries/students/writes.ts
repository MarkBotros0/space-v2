import type { Prisma } from "../../../generated/prisma/client";

export interface NewStudentInput {
  name: string;
  email: string;
  university: string | null;
  faculty: string | null;
  universityGraduationYear: number | null;
  /** Written to User (account-level since 2026-11-06), not StudentProfile. */
  phone: string | null;
  dateOfBirth: Date | null;
  notes: string | null;
}

export type StudentCreateTarget =
  | { kind: "season"; seasonId: number }
  | { kind: "alumni"; graduationYear: number }
  | { kind: "none" };

/**
 * The ONE write path that creates students. `POST /api/v1/students` and the
 * bulk importer both call it, so a form-created student and an imported
 * student are the same kind of account (decision D-16.8).
 *
 * v1 has two paths that disagree: `createStudentAction` sets a temporary
 * password (`jpc-space/src/lib/student-actions.ts:59`, the hard-coded
 * `ChangeMe123!`) while `commitStudentImport` writes `passwordHash: null`
 * (`student-import.ts:260`) — the spec records this at R46 as "the two paths
 * produce differently-initialised accounts". v2 has one path and it issues no
 * credential of any kind. There is no shared default password in this
 * codebase; credentials arrive when an invite is accepted (Plan 9), and that
 * is the only place a hash is ever written — with bcryptjs. Nothing here
 * hashes anything, and nothing here may ever log one.
 *
 * `role` is forced, never taken from input: no importer and no form can
 * create anything but a STUDENT (spec R47).
 *
 * THREE STATEMENTS FOR THE WHOLE BATCH — createManyAndReturn, then one
 * createMany for profiles and one for enrolments. v1 issued two or three
 * statements per row, each in its own transaction (R45/R46), which is why its
 * commit could not be atomic. This shape is what makes D-16.5's
 * all-or-nothing 2000-row import affordable inside one transaction.
 *
 * The caller is responsible for having de-duplicated `inputs` by email: a
 * batch containing the same address twice violates `User.email @unique` and
 * takes the whole transaction down.
 */
export async function createStudentRows(
  tx: Prisma.TransactionClient,
  inputs: NewStudentInput[],
  target: StudentCreateTarget,
): Promise<{ id: number; email: string }[]> {
  if (inputs.length === 0) return [];

  const created = await tx.user.createManyAndReturn({
    data: inputs.map((i) => ({
      name: i.name,
      // Stored EXACTLY as given. Comparison is case-insensitive (D-16.6);
      // storage is not, because v1's login looks the address up verbatim.
      email: i.email,
      role: "STUDENT" as const,
      graduationYear: target.kind === "alumni" ? target.graduationYear : null,
      phone: i.phone,
      dateOfBirth: i.dateOfBirth,
      passwordHash: null,
    })),
    select: { id: true, email: true },
  });

  // Map back by email rather than by array position: createManyAndReturn's
  // ordering is not part of its contract, and a silent misalignment here
  // would attach one student's pastoral notes to another student's account.
  const idByEmail = new Map(created.map((c) => [c.email.toLowerCase(), c.id]));
  const idFor = (email: string): number => {
    const id = idByEmail.get(email.toLowerCase());
    if (id === undefined) {
      // Unreachable unless the insert silently dropped a row; failing here
      // aborts the transaction, which is the correct outcome.
      throw new Error("createStudentRows: no created row for an input email");
    }
    return id;
  };

  await tx.studentProfile.createMany({
    data: inputs.map((i) => ({
      userId: idFor(i.email),
      // The pointer and the enrolment below name the same season by
      // construction — the two definitions of "in this season" cannot drift.
      activeSeasonId: target.kind === "season" ? target.seasonId : null,
      university: i.university,
      faculty: i.faculty,
      universityGraduationYear: i.universityGraduationYear,
      notes: i.notes,
    })),
  });

  if (target.kind === "season") {
    await tx.seasonEnrollment.createMany({
      data: inputs.map((i) => ({
        studentUserId: idFor(i.email),
        seasonId: target.seasonId,
        status: "ACTIVE" as const,
      })),
    });
  }

  return created;
}

/**
 * Enrol one student in one season — Plan 7's `POST /students/:id/enrollments`
 * rules, in the one place both that route and the bulk importer call
 * (D-16.7/D-16.8; spec 06 D1/R2):
 *
 *  - one enrolment per student per season, EVER: an existing row of any
 *    status is "already_enrolled" and is not touched (a WITHDRAWN row is
 *    history, not an obstacle — re-admission is not invented here);
 *  - entry is always ACTIVE (R47);
 *  - the profile pointer is set only when UNSET — never stolen from a season
 *    that already holds it. updateMany so a student with no profile row is a
 *    no-op rather than a throw, exactly as Plan 7's guarded update behaved.
 *
 * A concurrent caller can still lose the unique-index race (P2002); the
 * caller's existing P2002 handling answers it (409 already_enrolled on the
 * route, 409 import_conflict on the importer, whose transaction rolls back).
 */
export async function enrollStudentInSeason(
  tx: Prisma.TransactionClient,
  studentUserId: number,
  seasonId: number,
): Promise<"enrolled" | "already_enrolled"> {
  const existing = await tx.seasonEnrollment.findUnique({
    where: { studentUserId_seasonId: { studentUserId, seasonId } },
    select: { id: true },
  });
  if (existing) return "already_enrolled";

  await tx.seasonEnrollment.create({
    data: { studentUserId, seasonId, status: "ACTIVE" },
  });
  await tx.studentProfile.updateMany({
    where: { userId: studentUserId, activeSeasonId: null },
    data: { activeSeasonId: seasonId },
  });
  return "enrolled";
}
