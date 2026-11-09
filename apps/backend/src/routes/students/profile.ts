import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError, forbidden } from "../../lib/api-response";
import { deliverInvite, mintInvite, type IssuedInvite } from "../../lib/invites";
import { parseId } from "../../lib/parse-id";
import { canEditStudent } from "../../lib/permissions";
import { isUniqueViolation } from "../../lib/prisma-errors";
import { createStudentRows } from "../../lib/queries/students";
import { isAdminOfSeason, isSuper } from "../../lib/rbac";
import { newPersonRefusal, readSeatSeason, type SeatRefusal } from "../../lib/roles";
import { refusalStatus } from "../../lib/api-error";
import { requireUser } from "../../middleware/require-auth";
import { createStudentRequestSchema, updateStudentRequestSchema } from "../../../../../packages/shared/src/index";
import { isSeasonFinished } from "../../lib/seasons/status";
import { EMAIL_EXISTS } from "../../lib/error-messages";

/**
 * Per-role PATCH allowlists, checked against the RAW body keys before the
 * schema runs (a schema parse cannot distinguish "sent null" from "absent"
 * after the fact for refusal purposes — and refusal must name the key).
 *
 * - The subject edits their own profile fields only — the same five
 *   PATCH /me/profile accepts (Plan 11 Decision 1). `name` belongs to
 *   PATCH /me and `email` is staff-only (spec 18 D2/D8: changing a login
 *   identifier without verification is an account-takeover primitive). Never
 *   `notes` (R23), and never `activeSeasonId`, which is derived. v1 silently dropped those from a
 *   self-edit (R24); an API that pretends a write worked teaches clients to
 *   trust it, so this refuses with `forbidden_field` instead.
 * - ADMIN adds `name`, `email` and `notes`.
 * - SUPER: everything except `activeSeasonId`, which no role may send
 *   (derived from enrolments; refused for everyone before this table).
 */
const SELF_EDITABLE = new Set(["university", "faculty", "universityGraduationYear", "phone", "dateOfBirth"]);
const ADMIN_EDITABLE = new Set([...SELF_EDITABLE, "name", "email", "notes"]);

export async function createStudent(req: Request, res: Response) {
  const user = requireUser(req);
  const parsed = createStudentRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid student body.", 400);
  const body = parsed.data;

  // A Super creates anyone, with or without a season. A season's admin invites
  // a new person into that season only (owner, 2026-11-07), never seasonless:
  // v1 admitted any ADMIN with no scoping at all, pointed at any season (spec 06
  // §4.3, D4), which is what Plan 7 closed. The token's seasonAdminIds cover a
  // DRAFT or ACTIVE season; a finished one is refused below for everyone.
  if (!isSuper(user) && (body.seasonId == null || !isAdminOfSeason(user, body.seasonId))) {
    return apiError(res, "forbidden", "Only a super user or this season's admin can add people.", 403);
  }

  if (body.seasonId != null) {
    const season = await db.season.findFirst({
      where: { id: body.seasonId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!season) return apiError(res, "not_found", "Season not found.", 404);
    if (isSeasonFinished(season.status)) {
      return apiError(res, "season_finished", "This season has finished.", 409);
    }
  }

  // Friendly 409 first; the P2002 catch below converts the race loser to the
  // same answer instead of a 500 (v1 raised the raw Prisma error, R18). Note
  // R19 stands: User.email is @unique at the database level, so a
  // soft-deleted student's address stays reserved.
  const clash = await db.user.findUnique({ where: { email: body.email }, select: { id: true } });
  if (clash) return apiError(res, "email_taken", EMAIL_EXISTS, 409);

  let created: { id: number; email: string };
  let invite: IssuedInvite;
  try {
    type Created = { student: { id: number; email: string }; issued: IssuedInvite };
    const result = await db.$transaction(async (tx): Promise<{ refusal: SeatRefusal } | Created> => {
      if (body.seasonId != null) {
        const season = await readSeatSeason(tx, body.seasonId);
        if (!season) return { refusal: { code: "not_found", message: "Season not found." } };
        const refusal = await newPersonRefusal(tx, body.name, season);
        if (refusal) return { refusal };
      }
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
      // back the student). This line stays in the ROUTE, after the row
      // writes: Plan 17 extracts the block above into createStudentRows, and
      // its importer must keep sending nothing (its R55). mintInvite, not
      // issueInvite: a brand-new account holds no older invite to expire.
      const issued = await mintInvite(tx, student.id, user.userId);
      return { student, issued };
    });
    if ("refusal" in result) {
      const { code, message } = result.refusal;
      return apiError(res, code, message, refusalStatus(result.refusal));
    }
    created = result.student;
    invite = result.issued;
  } catch (err) {
    if (isUniqueViolation(err)) {
      return apiError(res, "email_taken", EMAIL_EXISTS, 409);
    }
    throw err;
  }

  // Mail AFTER commit (R25), exactly as POST /users does. The student exists
  // either way — failing the create over a mail outage would leave the
  // operator retyping a form for a row that already exists. An undelivered
  // invite is withdrawn again (deliverInvite), so the account reads "pending"
  // rather than "invited" with a code nobody received, and the response says so.
  const delivery = await deliverInvite(created.id, created.email, invite);

  return apiOk(res, { ...created, inviteSent: delivery === "sent" }, 201);
}

export async function updateStudent(req: Request, res: Response) {
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

  if (!(await canEditStudent(user, id))) return forbidden(res);

  // The current season is derived from enrolments; no role may set it.
  if (Object.prototype.hasOwnProperty.call(req.body, "activeSeasonId")) {
    return apiError(res, "forbidden_field", 'Field "activeSeasonId" is not editable by your role.', 403);
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
      return apiError(res, "email_taken", EMAIL_EXISTS, 409);
    }
  }

  // Prisma treats `undefined` as "leave the column alone", which is exactly
  // this endpoint's PATCH contract — absent keys pass through untouched,
  // explicit nulls clear.
  // phone and dateOfBirth are User columns (account-level since 2026-11-06).
  const userData = {
    name: body.name,
    email: body.email,
    phone: body.phone,
    dateOfBirth: body.dateOfBirth === undefined ? undefined : body.dateOfBirth ? new Date(body.dateOfBirth) : null,
  };
  const profileData = {
    university: body.university,
    faculty: body.faculty,
    universityGraduationYear: body.universityGraduationYear,
    notes: body.notes,
  };

  try {
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
  } catch (err) {
    if (isUniqueViolation(err)) {
      return apiError(res, "email_taken", EMAIL_EXISTS, 409);
    }
    throw err;
  }

  return apiOk(res, { id });
}
