import { Router, type Request, type Response } from "express";

import { db } from "../db/client";
import type { Prisma } from "../generated/prisma/client";
import { apiOk, apiError } from "../lib/api-response";
import { parseId } from "../lib/parse-id";
import { isUniqueViolation } from "../lib/prisma-errors";
import { newPublicId } from "../lib/public-id";
import {
  assignmentDetailPayload,
  listAssignmentsForSeason,
  listAssignmentsForStudent,
  loadAssignmentById,
} from "../lib/queries/assignments";
import {
  assignStudentsToGroups,
  GroupOutsideSeasonError,
  listGroupsForSeason,
  listSeasonRoster,
  setGroupStudents,
  unassignStudentsFromGroups,
  validateGroupWrite,
} from "../lib/queries/groups";
import { loadSeasonDetail } from "../lib/queries/seasons";
import { listSessionsForSeason } from "../lib/queries/sessions";
import { canAccessSeason, canManageAssignment } from "../lib/permissions";
import { isAdminOfSeason, isMentor, isSuper } from "../lib/rbac";
import { requireAuth, requireUser } from "../middleware/require-auth";
import {
  assignmentColumns,
  bodyErrorMessage,
  notifyAssignmentCreated,
  targetedStudentIds,
  validateAssignmentRefs,
} from "../lib/assignment-writes";
import {
  createAssignmentRequestSchema,
  duplicateSeasonRequestSchema,
  groupAssignmentsRequestSchema,
  groupWriteRequestSchema,
  isValidSeasonCode,
  SEASON_ADMIN_EDITABLE_FIELDS,
  seasonAdminPatchSchema,
  seasonWriteRequestSchema,
  slugifySeasonCode,
} from "../../../../packages/shared/src/index";

export const seasonsRouter = Router();

// requireAuth is attached per route (ruling X5): /api/v1/seasons is a shared
// prefix — Plans 12, 15 and 17 mount their own routers on it — so a router-level
// use(requireAuth) here would answer their requests, and every unknown path,
// with 401 instead of the not_found envelope.

seasonsRouter.get("/", requireAuth, async (req, res) => {
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
});

/**
 * Resolve a season code (spec 02 §7, Plan 6 D-16.2). The mobile app is
 * code-addressed (/seasons/[code]); the API stays canonical on id (spec 02
 * D8). Never overload /:id with codes — a numeric code is a legal slug.
 * Registered before every /:id/* route, or /by-code/roster would match
 * /:id/roster with id "by-code".
 */
seasonsRouter.get("/by-code/:code", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const code = String(req.params.code);
  if (code.length === 0 || code.length > 200) return apiError(res, "bad_request", "Invalid season code.", 400);

  const found = await db.season.findFirst({ where: { code, deletedAt: null }, select: { id: true } });
  if (!found) return apiError(res, "not_found", "Season not found.", 404);
  if (!(await canAccessSeason(user, found.id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const season = await loadSeasonDetail(user, found.id);
  if (!season) return apiError(res, "not_found", "Season not found.", 404);
  return apiOk(res, season);
});

seasonsRouter.get("/:id", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  if (!(await canAccessSeason(user, id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const season = await loadSeasonDetail(user, id);
  if (!season) return apiError(res, "not_found", "Season not found.", 404);
  return apiOk(res, season);
});

const ADMIN_EDITABLE = new Set<string>(SEASON_ADMIN_EDITABLE_FIELDS);

const codeTaken = (res: Response) =>
  apiError(res, "code_taken", "A season with that code already exists.", 409);

seasonsRouter.post("/", requireAuth, async (req, res) => {
  const user = requireUser(req);
  // Spec 02 D3: creation is SUPER-only (v1's canCreateSeason).
  if (!isSuper(user)) return apiError(res, "forbidden", "You don't have access to this.", 403);

  const parsed = seasonWriteRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid season body.", 400);
  const body = parsed.data;

  // v1 R7: the check has no deletedAt filter — a soft-deleted season keeps its code.
  const clash = await db.season.findUnique({ where: { code: body.code }, select: { id: true } });
  if (clash) return codeTaken(res);

  try {
    const season = await db.season.create({
      data: {
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
        createdById: user.userId,
        updatedById: user.userId,
      },
      select: { id: true, code: true },
    });
    return apiOk(res, season, 201);
  } catch (err) {
    // D15: the race loser's P2002 becomes the same answer as the pre-check.
    if (isUniqueViolation(err)) return codeTaken(res);
    throw err;
  }
});

seasonsRouter.patch("/:id", requireAuth, async (req, res) => {
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
        data: {
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
          updatedById: user.userId,
        },
        select: { id: true, code: true },
      });
      return apiOk(res, season);
    } catch (err) {
      if (isUniqueViolation(err)) return codeTaken(res);
      throw err;
    }
  }

  if (!isAdminOfSeason(user, id)) return apiError(res, "forbidden", "You don't have access to this.", 403);

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
});

seasonsRouter.delete("/:id", requireAuth, async (req, res) => {
  const user = requireUser(req);
  if (!isSuper(user)) return apiError(res, "forbidden", "You don't have access to this.", 403);
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
});

seasonsRouter.post("/:id/duplicate", requireAuth, async (req, res) => {
  const user = requireUser(req);
  // R54: canCreateSeason (SUPER), not the source's admin rights.
  if (!isSuper(user)) return apiError(res, "forbidden", "You don't have access to this.", 403);
  const sourceId = parseId(req.params.id);
  if (sourceId === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  const parsed = duplicateSeasonRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid duplicate body.", 400);
  const input = parsed.data;

  // D6: v1 had no deletedAt guard here and would clone a deleted season.
  const source = await db.season.findFirst({
    where: { id: sourceId, deletedAt: null },
    select: {
      program: true, description: true, startDate: true,
      absenceBudgetMinutes: true, absenceWeightMinutes: true,
      groups: { select: { id: true, name: true, description: true } },
      sessions: {
        select: {
          id: true, title: true, startsAt: true, durationMinutes: true,
          location: true, youtubeUrl: true, description: true, recurrenceGroupId: true,
        },
      },
      assignments: {
        where: { deletedAt: null },
        select: {
          title: true, description: true, dueAt: true, isAllGroups: true, type: true,
          forumMinWords: true, forumAllowComments: true, maxFileSizeMb: true,
          allowedMimeCategories: true, sessionId: true,
          targets: { select: { groupId: true } },
        },
      },
    },
  });
  if (!source) return apiError(res, "not_found", "Season not found.", 404);

  const code = slugifySeasonCode(input.code || `${source.program} ${input.year}`);
  if (!isValidSeasonCode(code)) {
    return apiError(res, "invalid_code", "Code must be 2–40 lowercase letters, numbers, and dashes.", 400);
  }
  const clash = await db.season.findUnique({ where: { code }, select: { id: true } });
  if (clash) return codeTaken(res);

  const startDate = new Date(input.startDate);
  const offsetMs = startDate.getTime() - source.startDate.getTime();
  const shift = (d: Date) => new Date(d.getTime() + offsetMs);

  try {
    const created = await db.$transaction(async (tx) => {
      const season = await tx.season.create({
        data: {
          code,
          title: `${source.program} ${input.year}`,
          program: source.program,
          year: input.year,
          description: source.description,
          startDate,
          endDate: new Date(input.endDate),
          status: "DRAFT",
          absenceBudgetMinutes: source.absenceBudgetMinutes,
          absenceWeightMinutes: source.absenceWeightMinutes,
          createdById: user.userId,
          updatedById: user.userId,
        },
        select: { id: true, code: true },
      });

      // R57/R61: name and description only — no GroupLeader, no GroupStudent.
      const groupIdMap = new Map<number, number>();
      for (const g of source.groups) {
        const clone = await tx.group.create({
          data: { seasonId: season.id, name: g.name, description: g.description },
          select: { id: true },
        });
        groupIdMap.set(g.id, clone.id);
      }

      // Divergence (spec 02 D5, ruling C10): one FRESH id per source series.
      const recurrenceIdMap = new Map<string, string>();
      const freshRecurrenceId = (old: string): string => {
        const existing = recurrenceIdMap.get(old);
        if (existing) return existing;
        const minted = newPublicId();
        recurrenceIdMap.set(old, minted);
        return minted;
      };

      const sessionIdMap = new Map<number, number>();
      for (const s of source.sessions) {
        const clone = await tx.session.create({
          data: {
            seasonId: season.id,
            title: s.title,
            startsAt: shift(s.startsAt),
            durationMinutes: s.durationMinutes,
            location: s.location,
            youtubeUrl: s.youtubeUrl,
            description: s.description,
            recurrenceGroupId: s.recurrenceGroupId ? freshRecurrenceId(s.recurrenceGroupId) : null,
          },
          select: { id: true },
        });
        sessionIdMap.set(s.id, clone.id);
      }

      for (const a of source.assignments) {
        const clone = await tx.assignment.create({
          data: {
            seasonId: season.id,
            // R59: remapped to the cloned session, never the source's.
            sessionId: a.sessionId ? (sessionIdMap.get(a.sessionId) ?? null) : null,
            title: a.title,
            description: a.description,
            dueAt: a.dueAt ? shift(a.dueAt) : null,
            isAllGroups: a.isAllGroups,
            type: a.type,
            forumMinWords: a.forumMinWords,
            forumAllowComments: a.forumAllowComments,
            maxFileSizeMb: a.maxFileSizeMb,
            allowedMimeCategories: a.allowedMimeCategories,
            createdById: user.userId,
            updatedById: user.userId,
          },
          select: { id: true },
        });
        if (!a.isAllGroups) {
          // R60: only remappable targets; an unmappable one is dropped.
          const groupIds = a.targets
            .map((t) => groupIdMap.get(t.groupId))
            .filter((gid): gid is number => gid !== undefined);
          if (groupIds.length > 0) {
            await tx.assignmentTarget.createMany({
              data: groupIds.map((groupId) => ({ assignmentId: clone.id, groupId })),
            });
          }
        }
      }

      return season;
    });
    return apiOk(res, created, 201);
  } catch (err) {
    if (isUniqueViolation(err)) return codeTaken(res);
    throw err;
  }
});

seasonsRouter.get("/:id/groups", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const seasonId = parseId(req.params.id);
  if (seasonId === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  if (!(await canAccessSeason(user, seasonId))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  // The scope lives in the query, so a group the caller may not see is never
  // read at all. A leader now sees only the groups they lead: v1 handed them
  // every group in the season, which is a roster of other people's students
  // with a headcount attached.
  const groups = await listGroupsForSeason(user, seasonId);
  return apiOk(res, { groups: groups ?? [] });
});

seasonsRouter.post("/:id/groups", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const seasonId = parseId(req.params.id);
  if (seasonId === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  if (!isAdminOfSeason(user, seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const season = await db.season.findUnique({ where: { id: seasonId }, select: { id: true } });
  if (!season) return apiError(res, "not_found", "Season not found.", 404);

  const parsed = groupWriteRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid group body.", 400);

  const refusal = await validateGroupWrite(seasonId, parsed.data);
  if (refusal) return apiError(res, refusal.code, refusal.message, 409);

  const group = await db.$transaction(async (tx) => {
    const created = await tx.group.create({
      data: {
        seasonId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
      },
      select: { id: true },
    });
    if (parsed.data.leaderIds.length > 0) {
      await tx.groupLeader.createMany({
        data: parsed.data.leaderIds.map((userId) => ({ groupId: created.id, userId })),
        skipDuplicates: true,
      });
    }
    await setGroupStudents(tx, seasonId, created.id, parsed.data.studentIds);
    return created;
  });

  return apiOk(res, { id: group.id }, 201);
});

seasonsRouter.get("/:id/sessions", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const seasonId = parseId(req.params.id);
  if (seasonId === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  if (!(await canAccessSeason(user, seasonId))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const sessions = await listSessionsForSeason(seasonId, {
    includeCheckInToken: user.role !== "STUDENT",
  });
  return apiOk(res, { sessions });
});

seasonsRouter.get("/:id/assignments", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const seasonId = parseId(req.params.id);
  if (seasonId === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  if (!(await canAccessSeason(user, seasonId))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  // Students get a different row shape — their own status per assignment,
  // rather than the season-wide submission/expected counts staff see.
  const assignments =
    user.role === "STUDENT"
      ? await listAssignmentsForStudent(user.userId, seasonId)
      : await listAssignmentsForSeason(seasonId);

  return apiOk(res, { assignments });
});

seasonsRouter.post("/:id/assignments", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const seasonId = parseId(req.params.id);
  if (seasonId === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  // v1 canCreateAssignment = isAdminOfSeason (SUPER passes) — permissions.ts:273-278.
  if (!canManageAssignment(user, seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const season = await db.season.findFirst({
    where: { id: seasonId, deletedAt: null },
    select: { id: true },
  });
  if (!season) return apiError(res, "not_found", "Season not found.", 404);

  const parsed = createAssignmentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", bodyErrorMessage(parsed.error, "Invalid assignment body."), 400);
  }
  const body = parsed.data;

  const refusal = await validateAssignmentRefs(seasonId, body);
  if (refusal) return apiError(res, refusal.code, refusal.message, 400);

  const columns = assignmentColumns(body);
  // R84: the row and its targets commit together.
  const created = await db.$transaction(async (tx) => {
    const assignment = await tx.assignment.create({
      data: { seasonId, ...columns, createdById: user.userId, updatedById: user.userId },
      select: { id: true },
    });
    if (!body.isAllGroups) {
      await tx.assignmentTarget.createMany({
        data: body.groupIds.map((groupId) => ({ assignmentId: assignment.id, groupId })),
      });
    }
    return assignment;
  });

  // R65: fan-out after the commit, never inside it.
  await notifyAssignmentCreated(
    { id: created.id, title: body.title, dueAt: columns.dueAt },
    await targetedStudentIds(seasonId, body.isAllGroups, body.groupIds),
  );

  const detail = await loadAssignmentById(created.id);
  // Unreachable — the row was written above — but the loader is nullable.
  if (!detail) return apiError(res, "not_found", "Assignment not found.", 404);
  return apiOk(res, assignmentDetailPayload(detail, { isStudent: false, canManage: true, mySubmission: null }), 201);
});

/** Season-admin only (spec 05 §4 — v1's roster page required canEditSeason). */
async function requireLiveSeasonAdmin(
  req: Request,
  res: Response,
): Promise<number | null> {
  const user = requireUser(req);
  const seasonId = parseId(req.params.id);
  if (seasonId === null) {
    apiError(res, "bad_request", "Invalid season id.", 400);
    return null;
  }
  if (!isAdminOfSeason(user, seasonId)) {
    apiError(res, "forbidden", "You don't have access to this.", 403);
    return null;
  }
  const season = await db.season.findFirst({ where: { id: seasonId, deletedAt: null }, select: { id: true } });
  if (!season) {
    apiError(res, "not_found", "Season not found.", 404);
    return null;
  }
  return seasonId;
}

seasonsRouter.get("/:id/roster", requireAuth, async (req, res) => {
  const seasonId = await requireLiveSeasonAdmin(req, res);
  if (seasonId === null) return;
  return apiOk(res, { roster: await listSeasonRoster(seasonId) });
});

/**
 * Bulk group assignment (spec 05 §7, Plan 6 D-16.12). Non-null groupIds go
 * through assignStudentsToGroups — the same function Plan 17's importer
 * commits through — and nulls through unassignStudentsFromGroups, in ONE
 * transaction: a group outside the season refuses everything.
 */
seasonsRouter.put("/:id/group-assignments", requireAuth, async (req, res) => {
  const seasonId = await requireLiveSeasonAdmin(req, res);
  if (seasonId === null) return;

  const parsed = groupAssignmentsRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid assignments.", 400);

  const toAssign: { studentUserId: number; groupId: number }[] = [];
  const toUnassign: number[] = [];
  for (const a of parsed.data.assignments) {
    if (a.groupId === null) toUnassign.push(a.studentUserId);
    else toAssign.push({ studentUserId: a.studentUserId, groupId: a.groupId });
  }

  try {
    const result = await db.$transaction(
      async (tx) => {
        const assigned = await assignStudentsToGroups(tx, seasonId, toAssign);
        const unassigned = await unassignStudentsFromGroups(tx, seasonId, toUnassign);
        return {
          assigned: assigned.assigned,
          unassigned: unassigned.unassigned,
          skippedStudentIds: [...assigned.skippedStudentIds, ...unassigned.skippedStudentIds],
        };
      },
      // Four statements per student, 500 students max (spec 05 R56).
      { timeout: 30_000 },
    );
    return apiOk(res, result);
  } catch (err) {
    if (err instanceof GroupOutsideSeasonError) {
      return apiError(res, "group_outside_season", err.message, 400);
    }
    throw err;
  }
});
