import type { Request, Response } from "express";
import type { SeasonWriteBody } from "@space/shared";

import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { apiOk, apiError } from "../../lib/api-response";
import { parseId } from "../../lib/parse-id";
import { isUniqueViolation } from "../../lib/prisma-errors";
import { loadSeasonDetail } from "../../lib/queries/seasons";
import { canAccessSeason } from "../../lib/permissions";
import { isAdminOfSeason, isMentor, isSuper } from "../../lib/rbac";
import { requireUser } from "../../middleware/require-auth";
import {
  SEASON_ADMIN_EDITABLE_FIELDS,
  seasonAdminPatchSchema,
  seasonWriteRequestSchema,
} from "../../../../../packages/shared/src/index";
import { forbidden } from "../respond";

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
      ? { deletedAt: null }
      : user.role === "ADMIN"
        ? { deletedAt: null, id: { in: user.seasonAdminIds } }
        : user.role === "LEADER"
          ? {
              deletedAt: null,
              groups: { some: { leaders: { some: { userId: user.userId } } } },
            }
          : { deletedAt: null, enrollments: { some: { studentUserId: user.userId } } };

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

  const found = await db.season.findFirst({ where: { code, deletedAt: null }, select: { id: true } });
  if (!found) return apiError(res, "not_found", "Season not found.", 404);
  if (!(await canAccessSeason(user, found.id))) {
    return forbidden(res);
  }

  const season = await loadSeasonDetail(user, found.id);
  if (!season) return apiError(res, "not_found", "Season not found.", 404);
  return apiOk(res, season);
}

export async function getSeason(req: Request, res: Response) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  if (!(await canAccessSeason(user, id))) {
    return forbidden(res);
  }

  const season = await loadSeasonDetail(user, id);
  if (!season) return apiError(res, "not_found", "Season not found.", 404);
  return apiOk(res, season);
}

const ADMIN_EDITABLE = new Set<string>(SEASON_ADMIN_EDITABLE_FIELDS);

export const codeTaken = (res: Response) =>
  apiError(res, "code_taken", "A season with that code already exists.", 409);

/** The columns a SUPER's full-body write sets; the title is always re-derived (R10). */
function seasonColumns(body: SeasonWriteBody) {
  return {
    code: body.code,
    title: `${body.program} ${body.year}`,
    program: body.program,
    year: body.year,
    description: body.description ?? null,
    startDate: new Date(body.startDate),
    endDate: new Date(body.endDate),
    status: body.status,
    absenceBudgetMinutes: body.absenceBudgetMinutes,
    absenceWeightMinutes: body.absenceWeightMinutes,
  };
}

export async function createSeason(req: Request, res: Response) {
  const user = requireUser(req);
  // Spec 02 D3: creation is SUPER-only (v1's canCreateSeason).
  if (!isSuper(user)) return forbidden(res);

  const parsed = seasonWriteRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid season body.", 400);
  const body = parsed.data;

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
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  const existing = await db.season.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!existing) return apiError(res, "not_found", "Season not found.", 404);

  if (isSuper(user)) {
    // SUPER: v1's full-body update, title re-derived (R10).
    const parsed = seasonWriteRequestSchema.safeParse(req.body);
    if (!parsed.success) return apiError(res, "bad_request", "Invalid season body.", 400);
    const body = parsed.data;
    const clash = await db.season.findFirst({ where: { code: body.code, NOT: { id } }, select: { id: true } });
    if (clash) return codeTaken(res);
    try {
      const season = await db.season.update({
        where: { id },
        data: { ...seasonColumns(body), updatedById: user.userId },
        select: { id: true, code: true },
      });
      return apiOk(res, season);
    } catch (err) {
      if (isUniqueViolation(err)) return codeTaken(res);
      throw err;
    }
  }

  if (!isAdminOfSeason(user, id)) return forbidden(res);

  // Spec 02 D3: v1's canEditSeason let a season ADMIN rename, restatus and
  // delete. The allowlist is checked on the raw keys BEFORE parsing so an
  // identity field is a 403, not a silently-stripped 200.
  const raw: Record<string, unknown> =
    typeof req.body === "object" && req.body !== null ? req.body : {};
  if (Object.keys(raw).some((key) => !ADMIN_EDITABLE.has(key))) {
    return apiError(res, "forbidden_field", "Season identity fields are SUPER-only.", 403);
  }
  const parsed = seasonAdminPatchSchema.safeParse(raw);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid season body.", 400);

  const season = await db.season.update({
    where: { id },
    data: { ...parsed.data, updatedById: user.userId },
    select: { id: true, code: true },
  });
  return apiOk(res, season);
}

export async function deleteSeason(req: Request, res: Response) {
  const user = requireUser(req);
  if (!isSuper(user)) return forbidden(res);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  const existing = await db.season.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!existing) return apiError(res, "not_found", "Season not found.", 404);

  // Product decision on spec 02 D4 (recorded in the Revision note): v1
  // checked nothing and stranded children. v2 refuses while the season has
  // ANY enrollment or session — archive it (status ARCHIVED) instead. D4's
  // `force` escape hatch is not offered: a soft-deleted season with sessions
  // stays reachable by id everywhere (R50), which is the state D4 objects to.
  const [enrollments, sessions] = await Promise.all([
    db.seasonEnrollment.count({ where: { seasonId: id } }),
    db.session.count({ where: { seasonId: id } }),
  ]);
  if (enrollments > 0 || sessions > 0) {
    return apiError(
      res,
      "season_in_use",
      "This season has sessions or enrollments; archive it instead.",
      409,
    );
  }

  // R51: v1 left StudentProfile.activeSeasonId pointing at the deleted row.
  await db.$transaction([
    db.studentProfile.updateMany({ where: { activeSeasonId: id }, data: { activeSeasonId: null } }),
    db.season.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.userId } }),
  ]);
  return apiOk(res, { deleted: true });
}
