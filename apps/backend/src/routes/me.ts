import { Router } from "express";
import type { UserRole } from "@space/shared";
// Relative, not "@space/shared" — the rootDir emit trap (see routes/auth.ts).
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  OWN_PROFILE_FIELDS,
  notificationPreferencesSchema,
  updateOwnProfileInputSchema,
  updateProfileRequestSchema,
} from "../../../../packages/shared/src/index";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { auditLog } from "../lib/audit";
import { invalidateSessions } from "../lib/auth/session-validity";
import { revokeAllRefreshTokensForUser } from "../lib/auth/tokens";
import { parseId } from "../lib/parse-id";
import { staffScopeForSeason } from "../lib/permissions";
import { loadMentorDashboard, loadSeasonStaffDashboard, loadStudentDashboard } from "../lib/queries/dashboard";
import { loadMyProfile } from "../lib/queries/me";
// The one 429 handler (ruling X4) — never a local copy.
import { isAlumnusNotStudying } from "../lib/rbac";
import { isLastActiveSuper, lockActiveSuperIds } from "../lib/super-guard";
import { requireAuth, requireUser } from "../middleware/require-auth";
import { meDevicesRouter } from "./me-devices";
import { meSeasonReadsRouter } from "./me-season-reads";
import { forbidden } from "./respond";

export const meRouter = Router();
meRouter.use(meDevicesRouter);
meRouter.use(meSeasonReadsRouter);

const ME_SELECT = {
  id: true,
  name: true,
  email: true,
  avatarPath: true,
  phone: true,
  dateOfBirth: true,
  address: true,
  passwordHash: true,
  deletedAt: true,
} as const;

type MeRow = {
  id: number;
  name: string;
  email: string;
  avatarPath: string | null;
  phone: string | null;
  dateOfBirth: Date | null;
  address: string | null;
  passwordHash: string | null;
  deletedAt: Date | null;
};

/** A calendar day stored at UTC midnight (Plan 11 Decision 11) → "YYYY-MM-DD". */
function dayFromDate(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** "YYYY-MM-DD" → its UTC midnight; `undefined` (absent) passes through. */
function dateFromDay(day: string | null | undefined): Date | null | undefined {
  if (day === undefined) return undefined;
  return day === null ? null : new Date(`${day}T00:00:00.000Z`);
}

/** The hash is reduced to a boolean before anything leaves this function. */
function toMeUser(row: MeRow, role: UserRole) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role,
    avatarPath: row.avatarPath,
    phone: row.phone,
    dateOfBirth: dayFromDate(row.dateOfBirth),
    address: row.address,
    hasPassword: row.passwordHash !== null,
  };
}

meRouter.get("/", requireAuth, async (req, res) => {
  const user = requireUser(req);

  const record = await db.user.findUnique({ where: { id: user.userId }, select: ME_SELECT });

  apiOk(res, {
    // Soft-deleted now yields null, which is what packages/shared/src/auth.ts
    // documented all along (spec 11 §7 / D6: "one of the two is lying" — the
    // code was).
    // The role and scopes come from the token, not the database: they are what
    // this token was minted with (loadScopes derived both, together), which is
    // what the client's permission checks must agree with until the next refresh.
    user: record && record.deletedAt === null ? toMeUser(record, user.role) : null,
    scopes: {
      seasonAdminIds: user.seasonAdminIds,
      groupLeaderIds: user.groupLeaderIds,
      activeSeasonId: user.activeSeasonId,
      // The client distinguishes an alumnus from an active student by
      // role === "STUDENT" && graduationYear != null. Without this field it
      // would have to decode the JWT itself to find out.
      graduationYear: user.graduationYear,
    },
  });
});

meRouter.patch("/", requireAuth, async (req, res) => {
  const user = requireUser(req);

  // strict() in the schema refuses a body userId outright — the v1 property
  // "no settings action accepts a subject id" preserved by construction
  // (spec 18 §4).
  const parsed = updateProfileRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", parsed.error.issues[0]?.message ?? "Invalid profile.", 400);
  }

  // Partial: Prisma reads `undefined` as "leave the column alone".
  const body = parsed.data;
  const updated = await db.user.update({
    where: { id: user.userId },
    data: {
      name: body.name,
      phone: body.phone,
      dateOfBirth: dateFromDay(body.dateOfBirth),
      address: body.address,
    },
    select: ME_SELECT,
  });
  // Returning the row closes v1's write-then-double-refresh (spec 18 R23).
  return apiOk(res, { user: toMeUser(updated, user.role) });
});

/**
 * The account holder deletes their own account (App Store guideline 5.1.1(v)).
 * Same soft delete as a SUPER's deactivation — deletedAt on the user and on a
 * student profile, every session revoked — plus this account's push devices,
 * so nothing reaches the phone afterwards. The rows that record what the
 * person did (submissions, attendance) stay: other people's history points at
 * them. The last active SUPER can't delete themselves (409 last_super), the
 * same guard deactivation has.
 */
meRouter.delete("/", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const deletedAt = new Date();

  const outcome = await db.$transaction(async (tx) => {
    const row = await tx.user.findUnique({
      where: { id: user.userId },
      select: { role: true, deletedAt: true },
    });
    if (!row || row.deletedAt) return "gone" as const;
    if (row.role === "SUPER") {
      const activeSuperIds = await lockActiveSuperIds(tx);
      if (isLastActiveSuper(activeSuperIds, user.userId)) return "last_super" as const;
    }
    await tx.user.update({ where: { id: user.userId }, data: { deletedAt } });
    await tx.studentProfile.updateMany({ where: { userId: user.userId }, data: { deletedAt } });
    await tx.deviceToken.deleteMany({ where: { userId: user.userId } });
    await revokeAllRefreshTokensForUser(tx, user.userId);
    await invalidateSessions(tx, user.userId);
    return "ok" as const;
  });

  if (outcome === "gone") return apiError(res, "not_found", "Account not found.", 404);
  if (outcome === "last_super") {
    return apiError(res, "last_super", "You're the only active SUPER account, so it can't be deleted.", 409);
  }
  auditLog("user.self_delete", user.userId, user.userId);
  return apiOk(res, { deletedAt: deletedAt.toISOString() });
});

const STUDENTS_ONLY = "This is only available to students and alumni.";

const OWN_PROFILE_KEYS: ReadonlySet<string> = new Set(OWN_PROFILE_FIELDS);

meRouter.get("/profile", requireAuth, async (req, res) => {
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
meRouter.patch("/profile", requireAuth, async (req, res) => {
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

const PREFERENCE_SELECT = {
  assignmentCreated: true,
  submissionReviewed: true,
  sessionRescheduled: true,
  lowAttendanceFlag: true,
  mentorFollowup: true,
  quizGraded: true,
  quizPublished: true,
  submissionReceived: true,
  sessionCancelled: true,
  announcement: true,
} as const;

/**
 * The caller's own notification preferences — every key.
 *
 * v1 read the sixth column from the database and dropped it on the floor while
 * projecting to a five-field type (§5, R56), which is why `quizGraded` could
 * never be turned off. The contract is derived from the enum
 * (packages/shared/src/notification.ts), so a new type without a key is a compile
 * error rather than a silently unreachable toggle.
 *
 * No row means opted in to everything (R6) — the row is created lazily, on
 * first save, and most users have none (R59).
 */
meRouter.get("/notification-preferences", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const row = await db.notificationPreference.findUnique({
    where: { userId: user.userId },
    select: PREFERENCE_SELECT,
  });
  return apiOk(res, { preferences: row ?? DEFAULT_NOTIFICATION_PREFERENCES });
});

/**
 * Replace them. PUT, not PATCH: the body carries every key, so there is no
 * way for a client that has not been updated to leave a new key at its default
 * without saying so.
 *
 * The target row is never an input (R54) — `user.userId` comes from the
 * verified token, so one user cannot write another's preferences no matter
 * what the body says.
 */
meRouter.put("/notification-preferences", requireAuth, async (req, res) => {
  const user = requireUser(req);

  const parsed = notificationPreferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", "Every notification preference is required.", 400);
  }

  const preferences = await db.notificationPreference.upsert({
    where: { userId: user.userId },
    update: parsed.data,
    create: { userId: user.userId, ...parsed.data },
    select: PREFERENCE_SELECT,
  });

  return apiOk(res, { preferences });
});

/**
 * The role dashboard's server-derived figures (spec 19 §7). A read with no
 * side effects (C6); requireAuth per route because /api/v1/me is shared with
 * the other self-service routes (X5).
 */
meRouter.get("/dashboard", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const now = new Date();

  // An alumnus's Home is /me + /events; this endpoint has nothing for them,
  // unless they're studying: then their Home is a student's.
  if (isAlumnusNotStudying(user)) return forbidden(res);
  // A student's season is their token's, never a parameter (D22, C8).
  if (user.role === "STUDENT") return apiOk(res, await loadStudentDashboard(user, now));
  if (user.role === "MENTOR") return apiOk(res, await loadMentorDashboard());

  const raw = req.query.seasonId;
  const seasonId = parseId(typeof raw === "string" ? raw : undefined);
  if (seasonId === null) {
    return apiError(res, "bad_request", "seasonId is required.", 400);
  }

  // The gate, not a where clause (spec §4 item 1): SUPER and the season's
  // admins get "season"; a LEADER gets their groups in it; everyone else null.
  const scope = await staffScopeForSeason(user, seasonId);
  if (scope === null) return forbidden(res);

  const dashboard = await loadSeasonStaffDashboard(user, seasonId, scope, now);
  if (!dashboard) return apiError(res, "not_found", "Season not found.", 404);
  return apiOk(res, dashboard);
});
