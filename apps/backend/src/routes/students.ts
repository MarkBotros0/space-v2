import { Router } from "express";

import { db } from "../db/client";
import { Prisma } from "../generated/prisma/client";
import { apiOk, apiError } from "../lib/api-response";
import type { SessionUser } from "../lib/auth/tokens";
import { parseId } from "../lib/parse-id";
import { canEditStudent, canViewStudent } from "../lib/permissions";
import { listStudents, loadStudentDetail, type StudentDetailView } from "../lib/queries/students";
import { isSuper } from "../lib/rbac";
import {
  createStudentRequestSchema,
  studentListQuerySchema,
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
 * Per-role PATCH allowlists, checked against the RAW body keys before the
 * schema runs (a schema parse cannot distinguish "sent null" from "absent"
 * after the fact for refusal purposes — and refusal must name the key).
 *
 * - The subject edits their own identity and contact fields (R22) but never
 *   `notes` or `activeSeasonId` (R23). v1 silently dropped those from a
 *   self-edit (R24); an API that pretends a write worked teaches clients to
 *   trust it, so this refuses with `forbidden_field` instead.
 * - ADMIN adds `notes`. NOT `activeSeasonId`: repointing a student's season
 *   is the same unscoped power v1's create leaked to every admin (§4.3), and
 *   it follows creation to SUPER in v2.
 * - SUPER: everything (allowlist `null` = unchecked).
 */
// Plan 11 Task 4 later removes "name" and "email" from SELF_EDITABLE (spec
// 18 D8) and re-spreads ADMIN_EDITABLE so staff keep them.
const SELF_EDITABLE = new Set([
  "name", "email", "university", "year", "phone", "dateOfBirth", "spiritualBackground", "gifts",
]);
const ADMIN_EDITABLE = new Set([...SELF_EDITABLE, "notes"]);

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

  try {
    const created = await db.$transaction(async (tx) => {
      const student = await tx.user.create({
        data: {
          email: body.email,
          name: body.name,
          role: "STUDENT", // forced, never an input (R14)
          // D7: no password. Credentials come from Plan 9's invites; v1's
          // hard-coded ChangeMe123! and its plaintext log line (R16/R17) are
          // deliberately not ported. Never log a credential.
          passwordHash: null,
          studentProfile: {
            create: {
              // D1: pointer and enrollment agree by construction.
              activeSeasonId: body.seasonId ?? null,
              university: body.university ?? null,
              year: body.year ?? null,
              phone: body.phone ?? null,
              dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
              spiritualBackground: body.spiritualBackground ?? null,
              gifts: body.gifts ?? null,
              notes: body.notes ?? null,
            },
          },
        },
        select: { id: true, email: true },
      });
      if (body.seasonId != null) {
        // The enrollment v1's form never created (R15) — the fix
        // commitStudentImport already models (student-import.ts:253-273).
        await tx.seasonEnrollment.create({
          data: { studentUserId: student.id, seasonId: body.seasonId, status: "ACTIVE" },
        });
      }
      return student;
    });
    return apiOk(res, created, 201);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return apiError(res, "email_taken", "A user with that email already exists.", 409);
    }
    throw err;
  }
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
