import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError } from "../../lib/api-response";
import { sendInviteEmail } from "../../lib/email";
import { issueInvite, type IssuedInvite } from "../../lib/invites";
import { parseId } from "../../lib/parse-id";
import { canEditStudent } from "../../lib/permissions";
import { isUniqueViolation } from "../../lib/prisma-errors";
import { createStudentRows } from "../../lib/queries/students";
import { isSuper } from "../../lib/rbac";
import { requireUser } from "../../middleware/require-auth";
import {
  createStudentRequestSchema,
  updateStudentRequestSchema,
} from "../../../../../packages/shared/src/index";
import { forbidden } from "../respond";

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

export async function createStudent(req: Request, res: Response) {
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
    if (isUniqueViolation(err)) {
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

  if (!(await canEditStudent(user, id))) {
    return forbidden(res);
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
    if (isUniqueViolation(err)) {
      return apiError(res, "email_taken", "A user with that email already exists.", 409);
    }
    throw err;
  }

  return apiOk(res, { id });
}
