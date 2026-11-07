import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiError, apiOk } from "../../lib/api-response";
import { notifyAnnouncement } from "../../lib/announcement-notifications";
import { auditLog } from "../../lib/audit";
import { parseId } from "../../lib/parse-id";
import {
  announcementFlags,
  canDeleteAnnouncement,
  canEditAnnouncement,
  canPostTo,
} from "../../lib/permissions";
import { announcementVisibilityFilter } from "../../lib/queries/announcements";
import { requireUser } from "../../middleware/require-auth";
import { forbidden } from "../respond";
import {
  createAnnouncementRequestSchema,
  updateAnnouncementRequestSchema,
} from "../../../../../packages/shared/src/index";
import { ANNOUNCEMENT_SELECT, toDetail } from "./serialize";

export async function createPost(req: Request, res: Response) {
  const user = requireUser(req);
  const parsed = createAnnouncementRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid post.", 400);
  const input = parsed.data;
  const seasonId = input.audience === "SEASON" ? input.seasonId : null;

  const verdict = await canPostTo(user, { audience: input.audience, seasonId: seasonId ?? undefined });
  if (verdict === "not_found") return apiError(res, "not_found", "Season not found.", 404);
  if (verdict === "forbidden") return forbidden(res);
  if (verdict === "season_draft") return apiError(res, "season_draft", "This season hasn't started yet.", 409);
  if (verdict === "season_finished") return apiError(res, "season_finished", "This season has finished.", 409);

  const row = await db.announcement.create({
    data: { audience: input.audience, seasonId, title: input.title, body: input.body, authorId: user.userId },
    select: ANNOUNCEMENT_SELECT,
  });
  auditLog("announcement.create", user.userId, row.id, seasonId !== null ? { season: seasonId } : {});
  notifyAnnouncement(row);
  return apiOk(res, toDetail(row, true, announcementFlags(user, row)), 201);
}

/** A post the caller can read, or null (404 for the unknown and the invisible alike). */
async function loadReadable(user: ReturnType<typeof requireUser>, id: number) {
  return db.announcement.findFirst({
    where: { AND: [{ id }, await announcementVisibilityFilter(user)] },
    select: ANNOUNCEMENT_SELECT,
  });
}

export async function updatePost(req: Request, res: Response) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid post id.", 400);
  const row = await loadReadable(user, id);
  if (!row) return apiError(res, "not_found", "Post not found.", 404);
  if (announcementFlags(user, row).seasonFinished) {
    return apiError(res, "season_finished", "This season has finished.", 409);
  }
  if (!canEditAnnouncement(user, row)) return forbidden(res);
  const parsed = updateAnnouncementRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid post.", 400);

  const updated = await db.announcement.update({
    where: { id },
    data: { ...parsed.data, editedAt: new Date() },
    select: ANNOUNCEMENT_SELECT,
  });
  auditLog("announcement.update", user.userId, id, updated.seasonId !== null ? { season: updated.seasonId } : {});
  // The author has seen their own post.
  return apiOk(res, toDetail(updated, true, announcementFlags(user, updated)));
}

export async function deletePost(req: Request, res: Response) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid post id.", 400);
  const row = await loadReadable(user, id);
  if (!row) return apiError(res, "not_found", "Post not found.", 404);
  if (!canDeleteAnnouncement(user, row)) return forbidden(res);

  await db.announcement.deleteMany({ where: { id } });
  auditLog("announcement.delete", user.userId, id, row.seasonId !== null ? { season: row.seasonId } : {});
  return res.status(204).end();
}
