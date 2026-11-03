import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError } from "../../lib/api-response";
import { parseId } from "../../lib/parse-id";
import { isUniqueViolation } from "../../lib/prisma-errors";
import { newPublicId } from "../../lib/public-id";
import { isSuper } from "../../lib/rbac";
import { requireUser } from "../../middleware/require-auth";
import {
  duplicateSeasonRequestSchema,
  isValidSeasonCode,
  slugifySeasonCode,
} from "../../../../../packages/shared/src/index";
import { forbidden } from "../respond";
import { codeTaken } from "./crud";

export async function duplicateSeason(req: Request, res: Response) {
  const user = requireUser(req);
  // R54: canCreateSeason (SUPER), not the source's admin rights.
  if (!isSuper(user)) return forbidden(res);
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
}
