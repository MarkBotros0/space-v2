import type { Request, Response } from "express";

import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { apiOk, apiError, forbidden } from "../../lib/api-response";
import { isUniqueViolation } from "../../lib/prisma-errors";
import { findLiveSeason, loadSeasonDetail } from "../../lib/queries/seasons";
import { canAccessSeason } from "../../lib/permissions";
import { isAdminOfSeason, isMentor, isSuper } from "../../lib/rbac";
import { requireUser, requireRole } from "../../middleware/require-auth";
import {
  SEASON_ADMIN_EDITABLE_FIELDS,
  OWN_PROGRAM_MESSAGE,
  COMMUNITY_WIDE_RULES_MESSAGE,
  seasonAdminPatchSchema,
  seasonWriteRequestSchema,
} from "../../../../../packages/shared/src/index";
import { isSeasonFinished, liveSeasonStatus } from "../../lib/seasons/status";
import { seasonColumns, statusChangeError } from "../../lib/seasons/status-change";
import { deleteSeasonNow } from "../../lib/seasons/delete";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";
import { parseOr400 } from "../../lib/http/validate";
import { liveSeason } from "../../lib/db/live";

export async function listSeasons(req: Request, res: Response) {
  const user = requireUser(req);

  // The visibility rule is expressed as a Prisma filter rather than a
  // post-fetch filter so a season a user cannot see is never read at all.
  //
  // Explicitly typed, not inferred: without a contextual type these object
  // literals infer `deletedAt: any` under any compiler that has
  // strictNullChecks off (TS7018), which is how this broke a deploy whose
  // toolchain did not use tsconfig.build.json. The annotation also catches a
  // mistyped filter key here rather than at runtime.
  const where: Prisma.SeasonWhereInput =
    isSuper(user) || isMentor(user)
      ? { ...liveSeason }
      : user.role === "ADMIN"
        ? { ...liveSeason, id: { in: user.seasonAdminIds } }
        : user.role === "LEADER"
          ? {
              // A former leader has no access to a finished season, so it must
              // not be listed: Today would pick it and get a 403 on every open.
              // The claim, not the rows: loadScopes hides a draft from someone
              // leading in an ACTIVE season, and canAccessSeason reads it too.
              ...liveSeason,
              status: liveSeasonStatus,
              groups: { some: { id: { in: user.groupLeaderIds } } },
            }
          : { ...liveSeason, enrollments: { some: { studentUserId: user.userId } } };

  const seasons = await db.season.findMany({
    where,
    orderBy: [{ year: "desc" }, { title: "asc" }],
    select: {
      id: true,
      code: true,
      title: true,
      program: true,
      year: true,
      status: true,
      isCommunityWide: true,
      startDate: true,
      endDate: true,
    },
  });

  apiOk(res, { seasons });
}

/**
 * Resolve a season code (spec 02 §7, Plan 6 D-16.2). The mobile app is
 * code-addressed (/seasons/[code]); the API stays canonical on id (spec 02
 * D8). Never overload /:id with codes — a numeric code is a legal slug.
 * Registered before every /:id/* route, or /by-code/roster would match
 * /:id/roster with id "by-code".
 */
export async function getSeasonByCode(req: Request, res: Response) {
  const user = requireUser(req);
  const code = String(req.params.code);
  if (code.length === 0 || code.length > 200) return apiError(res, "bad_request", "Invalid season code.", 400);

  const found = await db.season.findFirst({ where: { code, ...liveSeason }, select: { id: true } });
  if (!found) return notFound(res, "Season");
  if (!(await canAccessSeason(user, found.id))) return forbidden(res);

  const season = await loadSeasonDetail(user, found.id);
  if (!season) return notFound(res, "Season");
  return apiOk(res, season);
}

export async function getSeason(req: Request, res: Response) {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "season");
  if (id === null) return;

  if (!(await canAccessSeason(user, id))) return forbidden(res);

  const season = await loadSeasonDetail(user, id);
  if (!season) return notFound(res, "Season");
  return apiOk(res, season);
}

const ADMIN_EDITABLE = new Set<string>(SEASON_ADMIN_EDITABLE_FIELDS);

export const codeTaken = (res: Response) => apiError(res, "code_taken", "A season with that code already exists.", 409);

export async function createSeason(req: Request, res: Response) {
  // Spec 02 D3: creation is SUPER-only (v1's canCreateSeason).
  const user = requireRole(req, res, isSuper);
  if (!user) return;

  const parsed = parseOr400(seasonWriteRequestSchema, req.body, res, "Invalid season body.");
  if (parsed === null) return;
  const body = parsed;
  // No season skips Start: it runs the checks and moves the people.
  if (body.status !== "DRAFT") return apiError(res, "bad_request", "A new season is created as a draft.", 400);

  if (body.isCommunityWide && (body.graduatesOnPass || body.requiredProgram)) {
    return apiError(res, "community_wide_rules", COMMUNITY_WIDE_RULES_MESSAGE, 409);
  }

  // v1 R7: the check has no deletedAt filter — a soft-deleted season keeps its code.
  const clash = await db.season.findUnique({ where: { code: body.code }, select: { id: true } });
  if (clash) return codeTaken(res);

  try {
    const season = await db.season.create({
      data: { ...seasonColumns(body), createdById: user.userId, updatedById: user.userId },
      select: { id: true, code: true },
    });
    return apiOk(res, season, 201);
  } catch (err) {
    // D15: the race loser's P2002 becomes the same answer as the pre-check.
    if (isUniqueViolation(err)) return codeTaken(res);
    throw err;
  }
}

export async function updateSeason(req: Request, res: Response) {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "season");
  if (id === null) return;

  const existing = await findLiveSeason(id, {
    id: true,
    status: true,
    requiredProgram: true,
    graduatesOnPass: true,
    isCommunityWide: true,
  });
  if (!existing) return notFound(res, "Season");

  if (isSuper(user)) {
    // SUPER: v1's full-body update, title re-derived (R10).
    const parsed = parseOr400(seasonWriteRequestSchema, req.body, res, "Invalid season body.");
    if (parsed === null) return;
    const body = parsed;
    const clash = await db.season.findFirst({ where: { code: body.code, NOT: { id } }, select: { id: true } });
    if (clash) return codeTaken(res);
    // The program may have changed under a requirement already set.
    const requiredAfter = body.requiredProgram === undefined ? existing.requiredProgram : body.requiredProgram;
    if (requiredAfter === body.program) {
      return apiError(res, "bad_request", OWN_PROGRAM_MESSAGE, 400);
    }
    // Who may join is settled before the season starts.
    if (
      body.requiredProgram !== undefined &&
      body.requiredProgram !== existing.requiredProgram &&
      existing.status !== "DRAFT"
    ) {
      return apiError(
        res,
        "season_not_draft",
        "The required program can only change while the season is a draft.",
        409,
      );
    }
    // Fixed at Start: who may study is settled before anyone is seated for real.
    if (
      body.isCommunityWide !== undefined &&
      body.isCommunityWide !== existing.isCommunityWide &&
      existing.status !== "DRAFT"
    ) {
      return apiError(res, "season_started", "This season has started, so this can't change.", 409);
    }
    const wideAfter = body.isCommunityWide ?? existing.isCommunityWide;
    const graduatesAfter = body.graduatesOnPass ?? existing.graduatesOnPass;
    if (wideAfter && (graduatesAfter || requiredAfter)) {
      return apiError(res, "community_wide_rules", COMMUNITY_WIDE_RULES_MESSAGE, 409);
    }
    // Until the season has finished; End reads it under the season's lock, and the
    // write below only lands while the status is still the one checked here.
    const finished = isSeasonFinished(existing.status);
    if (finished && body.graduatesOnPass !== undefined && body.graduatesOnPass !== existing.graduatesOnPass) {
      return apiError(
        res,
        "season_finished",
        "Whether a season graduates people can't change once it has finished.",
        409,
      );
    }
    const blocked = statusChangeError(existing.status, body.status);
    if (blocked) return apiError(res, blocked.code, blocked.message, 409);
    try {
      // Only if the status is still the one checked above: this body carries a
      // status, so a Start landing in between would otherwise be undone.
      const { count } = await db.season.updateMany({
        where: { id, status: existing.status, ...liveSeason },
        data: { ...seasonColumns(body), updatedById: user.userId },
      });
      if (count === 0) {
        return apiError(res, "season_changed", "This season just changed. Reload it and try again.", 409);
      }
      return apiOk(res, { id, code: body.code });
    } catch (err) {
      if (isUniqueViolation(err)) return codeTaken(res);
      throw err;
    }
  }

  if (!isAdminOfSeason(user, id)) return forbidden(res);

  // Spec 02 D3: v1's canEditSeason let a season ADMIN rename, restatus and
  // delete. The allowlist is checked on the raw keys BEFORE parsing so an
  // identity field is a 403, not a silently-stripped 200.
  const raw: Record<string, unknown> = typeof req.body === "object" && req.body !== null ? req.body : {};
  if (Object.keys(raw).some((key) => !ADMIN_EDITABLE.has(key))) {
    return apiError(res, "forbidden_field", "Season identity fields are SUPER-only.", 403);
  }
  const parsed = parseOr400(seasonAdminPatchSchema, raw, res, "Invalid season body.");
  if (parsed === null) return;

  const season = await db.season.update({
    where: { id },
    data: { ...parsed, updatedById: user.userId },
    select: { id: true, code: true },
  });
  return apiOk(res, season);
}

export async function deleteSeason(req: Request, res: Response) {
  const user = requireRole(req, res, isSuper);
  if (!user) return;
  const id = idParam(res, req.params.id, "season");
  if (id === null) return;

  // Product decision on spec 02 D4 (recorded in the Revision note): v1
  // checked nothing and stranded children. v2 refuses while the season has
  // ANY enrollment or session — archive it (status ARCHIVED) instead. D4's
  // `force` escape hatch is not offered: a soft-deleted season with sessions
  // stays reachable by id everywhere (R50), which is the state D4 objects to.
  await deleteSeasonNow(id, user.userId);
  return apiOk(res, { deleted: true });
}
