import { Router } from "express";
// Relative, not "@space/shared" — the rootDir emit trap (see routes/auth.ts).
import { OWN_PROFILE_FIELDS, updateOwnProfileInputSchema } from "../../../../../packages/shared/src/index";

import { db } from "../../db/client";
import { apiOk, apiError } from "../../lib/api-response";
import { dateFromDay } from "../../lib/org-time";
import { loadMyProfile } from "../../lib/queries/me";
import { isAlumnusNotStudying } from "../../lib/rbac";
import { requireAuth, requireUser } from "../../middleware/require-auth";

export const meProfileRouter = Router();

const STUDENTS_ONLY = "This is only available to students and alumni.";

const OWN_PROFILE_KEYS: ReadonlySet<string> = new Set(OWN_PROFILE_FIELDS);

meProfileRouter.get("/profile", requireAuth, async (req, res) => {
  const user = requireUser(req);
  if (user.role !== "STUDENT") return apiError(res, "forbidden", STUDENTS_ONLY, 403);
  const profile = await loadMyProfile(user.userId);
  if (!profile) return apiError(res, "not_found", "Profile not found.", 404);
  return apiOk(res, { profile });
});

/*
 * The student's own profile fields — and nothing else (Plan 11 Decision 1,
 * spec 18 D2/D8). Name and address are PATCH /me; email is staff-only; notes
 * and activeSeasonId never (R23). Keys are checked RAW, before the schema,
 * so the refusal names the field instead of v1's silent drop (R24).
 *
 * phone and dateOfBirth are User columns since 2026-11-06 and PATCH /me
 * writes them too; they are still accepted here so the student form saves
 * in one call.
 */
meProfileRouter.patch("/profile", requireAuth, async (req, res) => {
  const user = requireUser(req);
  if (user.role !== "STUDENT") return apiError(res, "forbidden", STUDENTS_ONLY, 403);
  if (isAlumnusNotStudying(user)) {
    return apiError(
      res,
      "forbidden",
      "Alumni records are read-only — contact the JPC team to update your details.",
      403,
    );
  }
  if (typeof req.body !== "object" || req.body === null || Array.isArray(req.body)) {
    return apiError(res, "bad_request", "Invalid profile body.", 400);
  }
  for (const key of Object.keys(req.body as Record<string, unknown>)) {
    if (!OWN_PROFILE_KEYS.has(key)) {
      return apiError(res, "forbidden_field", `Field "${key}" is not editable here.`, 403);
    }
  }
  const parsed = updateOwnProfileInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", parsed.error.issues[0]?.message ?? "Invalid profile body.", 400);
  }
  if (!(await loadMyProfile(user.userId))) return apiError(res, "not_found", "Profile not found.", 404);

  const body = parsed.data;
  // Prisma reads `undefined` as "leave the column alone" — exactly PATCH.
  const data = {
    university: body.university,
    faculty: body.faculty,
    universityGraduationYear: body.universityGraduationYear,
  };
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.userId },
      data: { phone: body.phone, dateOfBirth: dateFromDay(body.dateOfBirth) },
    });
    // Upsert, as Plan 7 does: v1's unconditional update threw for a STUDENT
    // with no profile row (spec 06 §2).
    await tx.studentProfile.upsert({
      where: { userId: user.userId },
      create: { userId: user.userId, ...data },
      update: data,
    });
  });

  const profile = await loadMyProfile(user.userId);
  if (!profile) return apiError(res, "not_found", "Profile not found.", 404);
  return apiOk(res, { profile });
});
