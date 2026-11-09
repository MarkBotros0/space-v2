import type { Prisma } from "../../../generated/prisma/client";
import { markSessionsStale } from "../../auth/session-validity";
import { finishedSeasonStatus } from "../../seasons/status";

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
  { kind: "season"; seasonId: number } | { kind: "alumni"; graduationYear: number } | { kind: "none" };

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
 * A FLAT STATEMENT COUNT FOR THE WHOLE BATCH — createManyAndReturn, one
 * createMany for profiles and `enrollStudentsInSeason` for enrolments. v1 issued two or three
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
      university: i.university,
      faculty: i.faculty,
      universityGraduationYear: i.universityGraduationYear,
      notes: i.notes,
    })),
  });

  if (target.kind === "season") {
    await enrollStudentsInSeason(
      tx,
      target.seasonId,
      inputs.map((i) => ({ studentUserId: idFor(i.email) })),
    );
  }

  return created;
}

export type NewEnrollment = {
  studentUserId: number;
  /** A super let this person in past a block. */
  override?: { byId: number; at: Date };
};

/**
 * The ONE write that enrols existing or new students in a season — Plan 7's
 * rules (D-16.7/D-16.8; spec 06 D1/R2): entry is always ACTIVE (R47), and
 * everyone's sessions go stale in the same transaction, so their derived
 * current-season claim is re-read on the next refresh. Two statements for the
 * whole batch, however large.
 *
 * It decides nothing about who may join: `seatStudents` in `lib/roles` runs the
 * check and, under the people's locks, keeps out anyone with a row here. One
 * enrolment per student per season, EVER: a row of any status is never touched
 * (a WITHDRAWN row is history, not an obstacle). A concurrent writer that holds
 * no lock can still lose the unique-index race (P2002); the caller's P2002
 * handling answers it and the whole transaction rolls back.
 */
export async function enrollStudentsInSeason(
  tx: Prisma.TransactionClient,
  seasonId: number,
  rows: NewEnrollment[],
): Promise<void> {
  if (rows.length === 0) return;
  await tx.seasonEnrollment.createMany({
    data: rows.map((r) => ({
      studentUserId: r.studentUserId,
      seasonId,
      status: "ACTIVE" as const,
      overrideById: r.override?.byId ?? null,
      overrideAt: r.override?.at ?? null,
    })),
  });
  await markSessionsStale(
    tx,
    rows.map((r) => r.studentUserId),
  );
}

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
    where: { id, role: "STUDENT", deletedAt: null },
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
  const who = { id: { in: ids }, role: "STUDENT" as const, deletedAt: null, graduationYear: null };
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
      season: { graduatesOnPass: true, status: finishedSeasonStatus, deletedAt: null },
    },
    select: { season: { select: { year: true } } },
  });
  return rows.map((row) => row.season.year);
}
