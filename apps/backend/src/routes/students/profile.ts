import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError, forbidden } from "../../lib/api-response";
import { deliverInvite, type IssuedInvite } from "../../lib/invites";
import { canEditStudent } from "../../lib/permissions";
import { isUniqueViolation } from "../../lib/prisma-errors";
import { createStudentWithInvite, saveStudentRecord } from "../../lib/students/profile";
import { isAdminOfSeason, isSuper } from "../../lib/rbac";
import { requireUser } from "../../middleware/require-auth";
import { createStudentRequestSchema, updateStudentRequestSchema } from "../../../../../packages/shared/src/index";
import { isSeasonFinished } from "../../lib/seasons/status";
import { EMAIL_EXISTS } from "../../lib/error-messages";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";
import { parseOr400 } from "../../lib/http/validate";
import { liveSeason, liveUser } from "../../lib/db/live";

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
  const parsed = parseOr400(createStudentRequestSchema, req.body, res, "Invalid student body.");
  if (parsed === null) return;
  const body = parsed;

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
      where: { id: body.seasonId, ...liveSeason },
      select: { id: true, status: true },
    });
    if (!season) return notFound(res, "Season");
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
    ({ student: created, issued: invite } = await createStudentWithInvite(user.userId, body));
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
  const id = idParam(res, req.params.id, "student");
  if (id === null) return;
  if (typeof req.body !== "object" || req.body === null || Array.isArray(req.body)) {
    return apiError(res, "bad_request", "Invalid student body.", 400);
  }

  const student = await db.user.findFirst({
    where: { id, role: "STUDENT", ...liveUser },
    select: { id: true },
  });
  if (!student) return notFound(res, "Student");

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

  const parsed = parseOr400(updateStudentRequestSchema, req.body, res, "Invalid student body.");
  if (parsed === null) return;
  const body = parsed;

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
    await saveStudentRecord(id, userData, profileData, body);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return apiError(res, "email_taken", EMAIL_EXISTS, 409);
    }
    throw err;
  }

  return apiOk(res, { id });
}
