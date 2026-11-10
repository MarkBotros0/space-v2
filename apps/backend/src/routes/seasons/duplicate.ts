import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError } from "../../lib/api-response";
import { isUniqueViolation } from "../../lib/prisma-errors";
import { cloneSeason, loadDuplicateSource } from "../../lib/seasons/duplicate";
import { isSuper } from "../../lib/rbac";
import { requireRole } from "../../middleware/require-auth";
import {
  duplicateSeasonRequestSchema,
  isValidSeasonCode,
  slugifySeasonCode,
} from "../../../../../packages/shared/src/index";
import { codeTaken } from "./crud";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";
import { parseOr400 } from "../../lib/http/validate";

export async function duplicateSeason(req: Request, res: Response) {
  // R54: canCreateSeason (SUPER), not the source's admin rights.
  const user = requireRole(req, res, isSuper);
  if (!user) return;
  const sourceId = idParam(res, req.params.id, "season");
  if (sourceId === null) return;

  const parsed = parseOr400(duplicateSeasonRequestSchema, req.body, res, "Invalid duplicate body.");
  if (parsed === null) return;
  const input = parsed;

  const source = await loadDuplicateSource(sourceId);
  if (!source) return notFound(res, "Season");

  const code = slugifySeasonCode(input.code || `${source.program} ${input.year}`);
  if (!isValidSeasonCode(code)) {
    return apiError(res, "invalid_code", "Code must be 2–40 lowercase letters, numbers, and dashes.", 400);
  }
  const clash = await db.season.findUnique({ where: { code }, select: { id: true } });
  if (clash) return codeTaken(res);

  const startDate = new Date(input.startDate);

  try {
    const created = await cloneSeason(
      source,
      { code, year: input.year, startDate, endDate: new Date(input.endDate) },
      user.userId,
    );
    return apiOk(res, created, 201);
  } catch (err) {
    if (isUniqueViolation(err)) return codeTaken(res);
    throw err;
  }
}
