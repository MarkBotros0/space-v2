import { Router } from "express";

import { db } from "../db/client";
import { Prisma } from "../generated/prisma/client";
import { apiOk, apiError } from "../lib/api-response";
import { auditLog } from "../lib/audit";
import { revokeAllRefreshTokensForUser, type SessionUser } from "../lib/auth/tokens";
import { sendInviteEmail } from "../lib/email";
import { issueInvite, type IssuedInvite } from "../lib/invites";
import { parseId } from "../lib/parse-id";
import { canEditStudent, canViewStudent } from "../lib/permissions";
import {
  createStudentRows,
  enrollStudentInSeason,
  listStudents,
  loadStudentAttendanceHistory,
  loadStudentDetail,
  loadStudentSubmissions,
  type StudentDetailView,
} from "../lib/queries/students";
import { isAdminOfSeason, isSuper } from "../lib/rbac";
import {
  createEnrollmentRequestSchema,
  createStudentRequestSchema,
  graduateStudentRequestSchema,
  studentListQuerySchema,
  updateEnrollmentRequestSchema,
  updateStudentRequestSchema,
} from "../../../../packages/shared/src/index";
import { requireAuth, requireUser } from "../middleware/require-auth";

export const studentsRouter = Router();

studentsRouter.use(requireAuth);

/**
 * One endpoint, three list surfaces: ?status=active|alumni|dropped. This is
 * also why no /students/alumni literal route exists to be shadowed by (or to
 * shadow) "/:id". Scope is per-role (spec 06 §4.1); dropped rows are
 * enrollment-keyed (R43).
 */
studentsRouter.get("/", async (req, res) => {
  const user = requireUser(req);
  const parsed = studentListQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid query.", 400);

  const result = await listStudents(user, parsed.data);
  if (result === null) return apiError(res, "forbidden", "You don't have access to this.", 403);
  return apiOk(res, result);
});

/**
 * Which of the three §4.2 shapes this caller receives. SUPER and ADMIN read
 * everything; the subject reads their own personal data but never the
 * staff-only internal notes (R23); MENTOR and LEADER get the narrow cut —
 * v1 delivered them the full object and relied on React props to not render
 * it (§4.2's LEADER column), which an endpoint cannot do.
 */
function detailViewFor(user: SessionUser, studentUserId: number): StudentDetailView {
  if (isSuper(user) || user.role === "ADMIN") return "internal";
  if (user.userId === studentUserId) return "private";
  return "public";
}

studentsRouter.get("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid student id.", 400);

  // The gate lives in the handler, not in a call-site convention (R70/C8).
  if (!(await canViewStudent(user, id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const detail = await loadStudentDetail(id, detailViewFor(user, id), user);
  if (!detail) return apiError(res, "not_found", "Student not found.", 404);
  return apiOk(res, detail);
});

/**
 * The two history sub-resources (REG-83, v1's student record). Staff only — a
 * student gets neither, their own record included — and row-scoped by the same
 * rule as the detail's enrolments plus the narrower submission/attendance
 * gates (see canReadEnrollmentHistory). 403 before 404, as the detail does, so
 * an out-of-scope id and a missing one look the same to a scoped caller.
 */
async function resolveHistoryTarget(
  req: Parameters<typeof requireUser>[0],
  res: Parameters<typeof apiError>[0],
): Promise<{ user: SessionUser; id: number } | null> {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) {
    apiError(res, "bad_request", "Invalid student id.", 400);
    return null;
  }
  if (user.role === "STUDENT" || !(await canViewStudent(user, id))) {
    apiError(res, "forbidden", "You don't have access to this.", 403);
    return null;
  }
  const exists = await db.user.findFirst({
    where: { id, role: "STUDENT", deletedAt: null },
    select: { id: true },
  });
  if (!exists) {
    apiError(res, "not_found", "Student not found.", 404);
    return null;
  }
  return { user, id };
}

studentsRouter.get("/:id/attendance", async (req, res) => {
  const target = await resolveHistoryTarget(req, res);
  if (!target) return;
  return apiOk(res, { history: await loadStudentAttendanceHistory(target.user, target.id) });
});

studentsRouter.get("/:id/submissions", async (req, res) => {
  const target = await resolveHistoryTarget(req, res);
  if (!target) return;
  return apiOk(res, { submissions: await loadStudentSubmissions(target.user, target.id) });
});

/**
 * Per-role PATCH allowlists, checked against the RAW body keys before the
 * schema runs (a schema parse cannot distinguish "sent null" from "absent"
 * after the fact for refusal purposes — and refusal must name the key).
 *
 * - The subject edits their own StudentProfile columns only — the same six
 *   PATCH /me/profile accepts (Plan 11 Decision 1). `name` belongs to
 *   PATCH /me and `email` is staff-only (spec 18 D2/D8: changing a login
 *   identifier without verification is an account-takeover primitive). Never
 *   `notes` or `activeSeasonId` (R23). v1 silently dropped those from a
 *   self-edit (R24); an API that pretends a write worked teaches clients to
 *   trust it, so this refuses with `forbidden_field` instead.
 * - ADMIN adds `name`, `email` and `notes`. NOT `activeSeasonId`: repointing
 *   a student's season is the same unscoped power v1's create leaked to
 *   every admin (§4.3), and it follows creation to SUPER in v2.
 * - SUPER: everything (allowlist `null` = unchecked).
 */
const SELF_EDITABLE = new Set([
  "university", "year", "phone", "dateOfBirth", "spiritualBackground", "gifts",
]);
const ADMIN_EDITABLE = new Set([...SELF_EDITABLE, "name", "email", "notes"]);

studentsRouter.post("/", async (req, res) => {
  const user = requireUser(req);
  // v2 ruling (roadmap Plan 7): creation is SUPER-only. v1 admitted any ADMIN
  // with no season scoping at all — an admin could create a student pointed
  // at any season in the system (spec 06 §4.3, D4).
  if (!isSuper(user)) {
    return apiError(res, "forbidden", "Only a super user can create students.", 403);
  }

  const parsed = createStudentRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid student body.", 400);
  const body = parsed.data;

  if (body.seasonId != null) {
    const season = await db.season.findFirst({
      where: { id: body.seasonId, deletedAt: null },
      select: { id: true },
    });
    if (!season) return apiError(res, "not_found", "Season not found.", 404);
  }

  // Friendly 409 first; the P2002 catch below converts the race loser to the
  // same answer instead of a 500 (v1 raised the raw Prisma error, R18). Note
  // R19 stands: User.email is @unique at the database level, so a
  // soft-deleted student's address stays reserved — freeing it needs a
  // migration (C1, cutover list).
  const clash = await db.user.findUnique({ where: { email: body.email }, select: { id: true } });
  if (clash) return apiError(res, "email_taken", "A user with that email already exists.", 409);

  let created: { id: number; email: string };
  let invite: IssuedInvite;
  try {
    const result = await db.$transaction(async (tx) => {
      // One writer for these rows (D-16.8): the bulk importer calls exactly
      // this function, so the two paths cannot drift apart the way v1's did.
      // Plan 10's invite stays below, in the route — the importer never mints one.
      const [student] = await createStudentRows(
        tx,
        [
          {
            name: body.name,
            email: body.email,
            university: body.university ?? null,
            year: body.year ?? null,
            phone: body.phone ?? null,
            dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
            spiritualBackground: body.spiritualBackground ?? null,
            gifts: body.gifts ?? null,
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
      // back the student). This line stays in the ROUTE, after the row
      // writes: Plan 17 extracts the block above into createStudentRows, and
      // its importer must keep sending nothing (its R55).
      const issued = await issueInvite(tx, student.id, user.userId);
      return { student, issued };
    });
    created = result.student;
    invite = result.issued;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return apiError(res, "email_taken", "A user with that email already exists.", 409);
    }
    throw err;
  }

  // Best-effort, after commit (R25). The log names the user id and the error
  // — never the address or the code (Plan 9 Decision 2).
  try {
    await sendInviteEmail(created.email, invite.raw, invite.expiresAt);
  } catch (err) {
    console.error(
      `[invites] failed to send invite email for user ${created.id}:`,
      err instanceof Error ? err.message : err,
    );
  }

  return apiOk(res, created, 201);
});

studentsRouter.patch("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid student id.", 400);
  if (typeof req.body !== "object" || req.body === null || Array.isArray(req.body)) {
    return apiError(res, "bad_request", "Invalid student body.", 400);
  }

  const student = await db.user.findFirst({
    where: { id, role: "STUDENT", deletedAt: null },
    select: { id: true },
  });
  if (!student) return apiError(res, "not_found", "Student not found.", 404);

  if (!(await canEditStudent(user, id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const allowed = isSuper(user) ? null : user.userId === id ? SELF_EDITABLE : ADMIN_EDITABLE;
  if (allowed) {
    for (const key of Object.keys(req.body as Record<string, unknown>)) {
      if (!allowed.has(key)) {
        return apiError(res, "forbidden_field", `Field "${key}" is not editable by your role.`, 403);
      }
    }
  }

  const parsed = updateStudentRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid student body.", 400);
  const body = parsed.data;

  if (body.email !== undefined) {
    const clash = await db.user.findUnique({ where: { email: body.email }, select: { id: true } });
    if (clash && clash.id !== id) {
      return apiError(res, "email_taken", "A user with that email already exists.", 409);
    }
  }

  // The pointer must name a live season the student is ACTIVE in (spec 06
  // D1: pointer and enrollment agree). Without this a stale id is a P2003
  // foreign-key 500, and a season the student never joined silently splits
  // the two definitions of "in this season" again (R13). `null` clears and
  // needs no check; `undefined` leaves the column alone.
  if (body.activeSeasonId !== undefined && body.activeSeasonId !== null) {
    const season = await db.season.findFirst({
      where: { id: body.activeSeasonId, deletedAt: null },
      select: { id: true },
    });
    if (!season) return apiError(res, "not_found", "Season not found.", 404);
    const enrollment = await db.seasonEnrollment.findUnique({
      where: { studentUserId_seasonId: { studentUserId: id, seasonId: body.activeSeasonId } },
      select: { status: true },
    });
    if (enrollment?.status !== "ACTIVE") {
      return apiError(res, "not_enrolled", "The student has no active enrollment in that season.", 409);
    }
  }

  // Prisma treats `undefined` as "leave the column alone", which is exactly
  // this endpoint's PATCH contract — absent keys pass through untouched,
  // explicit nulls clear.
  const profileData = {
    university: body.university,
    year: body.year,
    phone: body.phone,
    dateOfBirth:
      body.dateOfBirth === undefined
        ? undefined
        : body.dateOfBirth
          ? new Date(body.dateOfBirth)
          : null,
    spiritualBackground: body.spiritualBackground,
    gifts: body.gifts,
    notes: body.notes,
    activeSeasonId: body.activeSeasonId,
  };

  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { name: body.name, email: body.email },
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
          year: body.year ?? null,
          phone: body.phone ?? null,
          dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
          spiritualBackground: body.spiritualBackground ?? null,
          gifts: body.gifts ?? null,
          notes: body.notes ?? null,
          activeSeasonId: body.activeSeasonId ?? null,
        },
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return apiError(res, "email_taken", "A user with that email already exists.", 409);
    }
    throw err;
  }

  return apiOk(res, { id });
});

/**
 * Explicit enrollment — the endpoint v1 never had (spec 06 §7): its only
 * creation paths were "be added to a group" (which destroyed history, D2)
 * and CSV import. Group membership is NOT set here: groupId belongs to the
 * groups endpoints (PATCH /groups/:id → setGroupStudents), one writer per
 * fact, per-season membership through the enrollment (C9).
 */
studentsRouter.post("/:id/enrollments", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid student id.", 400);

  const parsed = createEnrollmentRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid enrollment body.", 400);
  const { seasonId } = parsed.data;

  // Season-admin power over the TARGET season; SUPER passes inside the
  // predicate. Gate before any lookup — a refused caller learns nothing.
  if (!isAdminOfSeason(user, seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const season = await db.season.findFirst({
    where: { id: seasonId, deletedAt: null },
    select: { id: true },
  });
  if (!season) return apiError(res, "not_found", "Season not found.", 404);

  const student = await db.user.findFirst({
    where: { id, role: "STUDENT", deletedAt: null },
    select: { id: true },
  });
  if (!student) return apiError(res, "not_found", "Student not found.", 404);

  try {
    // R2 / R47 / D1 live in enrollStudentInSeason, which the bulk importer
    // calls too (Plan 17 D-16.8): one enrolment per student per season, EVER
    // (a WITHDRAWN row is history, not an obstacle); entry always ACTIVE; an
    // UNSET profile pointer is pointed at the season, never stolen.
    const outcome = await db.$transaction((tx) => enrollStudentInSeason(tx, id, seasonId));
    if (outcome === "already_enrolled") {
      return apiError(res, "already_enrolled", "This student already has an enrollment in that season.", 409);
    }
    const enrollment = await db.seasonEnrollment.findUniqueOrThrow({
      where: { studentUserId_seasonId: { studentUserId: id, seasonId } },
      select: { id: true, seasonId: true, status: true },
    });
    return apiOk(res, enrollment, 201);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return apiError(res, "already_enrolled", "This student already has an enrollment in that season.", 409);
    }
    throw err;
  }
});

/**
 * The enrollment state machine's only two transitions, both out of ACTIVE
 * (R48–R50): → WITHDRAWN (drop, with optional reason) and → COMPLETED.
 * Addressed by (student, season) — the natural unique key — rather than a
 * bare enrollment id: the bare-id shape is exactly what let v1's document
 * delete lose its row-scoped gate unnoticed (D5's lesson, applied here).
 * The row is transitioned in place, never deleted, never resurrected.
 */
studentsRouter.patch("/:id/enrollments/:seasonId", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  const seasonId = parseId(req.params.seasonId);
  if (id === null || seasonId === null) {
    return apiError(res, "bad_request", "Invalid student or season id.", 400);
  }

  const parsed = updateEnrollmentRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid enrollment body.", 400);

  // R64's gate, moved BEFORE the lookup: v1 fetched the enrollment first and
  // gated second, so a refused caller still learned whether an arbitrary id
  // existed (R65).
  if (!isAdminOfSeason(user, seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const enrollment = await db.seasonEnrollment.findUnique({
    where: { studentUserId_seasonId: { studentUserId: id, seasonId } },
    select: { id: true, status: true },
  });
  if (!enrollment) return apiError(res, "not_found", "Enrollment not found.", 404);
  if (enrollment.status !== "ACTIVE") {
    // R49 (drop refuses non-ACTIVE) generalised to both transitions; there
    // is no path out of a terminal state (R50).
    return apiError(res, "not_active", "Only an active enrollment can be completed or dropped.", 409);
  }

  const updated = await db.seasonEnrollment.update({
    where: { id: enrollment.id },
    data:
      parsed.data.status === "WITHDRAWN"
        ? { status: "WITHDRAWN", droppedAt: new Date(), dropReason: parsed.data.dropReason ?? null }
        : { status: "COMPLETED", completedAt: new Date() },
    select: { id: true, status: true },
  });
  auditLog(
    parsed.data.status === "WITHDRAWN" ? "enrollment.drop" : "enrollment.complete",
    user.userId,
    id,
  );
  return apiOk(res, updated);
});

/**
 * Graduation (Plan 10 Decision 2). SUPER-only — the one action in this domain
 * gated on isSuper alone (R55). One transaction:
 *   - set graduationYear (the alumnus marker; role stays STUDENT, R57),
 *   - complete EVERY ACTIVE enrollment — v1 completed only the one matching
 *     activeSeasonId and left the rest ACTIVE forever (R48/R60), keeping an
 *     alumnus on rosters, in at-risk counts and (R53) in season access,
 *   - clear activeSeasonId (R56).
 * Terminal enrollments are history and are not touched. Irreversible (R61):
 * a second graduation is refused rather than silently overwriting the year.
 */
studentsRouter.post("/:id/graduate", async (req, res) => {
  const user = requireUser(req);
  if (!isSuper(user)) {
    return apiError(res, "forbidden", "Only a super user can graduate students.", 403);
  }
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid student id.", 400);

  const parsed = graduateStudentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", parsed.error.issues[0]?.message ?? "Invalid graduation year.", 400);
  }
  const { graduationYear } = parsed.data;

  const outcome = await db.$transaction(async (tx) => {
    const student = await tx.user.findFirst({
      where: { id, role: "STUDENT", deletedAt: null },
      select: { graduationYear: true },
    });
    if (!student) return "not_found" as const;
    // Guarded write: of two concurrent graduations exactly one matches
    // `graduationYear: null`; the other sees count 0 and is refused.
    const marked = await tx.user.updateMany({
      where: { id, graduationYear: null },
      data: { graduationYear },
    });
    if (marked.count === 0) return "already_graduated" as const;
    const completed = await tx.seasonEnrollment.updateMany({
      where: { studentUserId: id, status: "ACTIVE" },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    // updateMany, not update: a STUDENT without a profile row (spec 06 §2's
    // hazard) must not turn a graduation into a 500.
    await tx.studentProfile.updateMany({ where: { userId: id }, data: { activeSeasonId: null } });
    return { enrollmentsCompleted: completed.count };
  });

  if (outcome === "not_found") return apiError(res, "not_found", "Student not found.", 404);
  if (outcome === "already_graduated") {
    return apiError(res, "already_graduated", "This student has already graduated.", 409);
  }

  auditLog("student.graduate", user.userId, id);
  return apiOk(res, { id, graduationYear, enrollmentsCompleted: outcome.enrollmentsCompleted });
});

/**
 * Soft delete (Plan 10 Decision 3; spec 06 D13 "keep soft delete as
 * DELETE /students/:id"). SUPER-only. One transaction — v1 stamped User and
 * StudentProfile in two separate statements (R86) — that also revokes every
 * refresh token (spec 11 D6: deactivation revokes). Nothing cascades (R87):
 * enrollments, attendance, submissions and notes are history. A SUPER undoes
 * this through POST /users/:id/reactivate, which clears both stamps.
 */
studentsRouter.delete("/:id", async (req, res) => {
  const user = requireUser(req);
  if (!isSuper(user)) {
    return apiError(res, "forbidden", "Only a super user can delete students.", 403);
  }
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid student id.", 400);

  const deletedAt = new Date();
  const deleted = await db.$transaction(async (tx) => {
    const marked = await tx.user.updateMany({
      where: { id, role: "STUDENT", deletedAt: null },
      data: { deletedAt },
    });
    if (marked.count === 0) return false;
    await tx.studentProfile.updateMany({ where: { userId: id }, data: { deletedAt } });
    await revokeAllRefreshTokensForUser(tx, id);
    return true;
  });
  if (!deleted) return apiError(res, "not_found", "Student not found.", 404);

  auditLog("student.delete", user.userId, id);
  return apiOk(res, { id, deletedAt: deletedAt.toISOString() });
});
