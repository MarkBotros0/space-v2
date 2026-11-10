import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiError, apiOk, apiNoContent, forbidden } from "../../lib/api-response";
import { notifyAnnouncement } from "../../lib/announcement-notifications";
import { auditLog } from "../../lib/audit";
import { announcementFlags, canDeleteAnnouncement, canEditAnnouncement, canPostTo } from "../../lib/permissions";
import { findReadableAnnouncement } from "../../lib/queries/announcements";
import { createAnnouncement, updateAnnouncement } from "../../lib/announcements/posts";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";
import { parseOr400 } from "../../lib/http/validate";
import { requireUser } from "../../middleware/require-auth";
import {
  createAnnouncementRequestSchema,
  updateAnnouncementRequestSchema,
} from "../../../../../packages/shared/src/index";
import { loadPollView } from "./poll-serialize";
import { toDetail } from "./serialize";

export async function createPost(req: Request, res: Response) {
  const user = requireUser(req);
  const input = parseOr400(createAnnouncementRequestSchema, req.body, res, "Invalid post.");
  if (input === null) return;
  const seasonId = input.audience === "SEASON" ? input.seasonId : null;

  const verdict = await canPostTo(user, { audience: input.audience, seasonId: seasonId ?? undefined });
  if (verdict === "not_found") return notFound(res, "Season");
  if (verdict === "forbidden") return forbidden(res);
  if (verdict === "season_draft") return apiError(res, "season_draft", "This season hasn't started yet.", 409);
  if (verdict === "season_finished") return apiError(res, "season_finished", "This season has finished.", 409);

  const row = await createAnnouncement(user.userId, input, seasonId);
  auditLog("announcement.create", user.userId, row.id, seasonId !== null ? { season: seasonId } : {});
  notifyAnnouncement(row);
  return apiOk(res, toDetail(row, true, announcementFlags(user, row), await loadPollView(user, row)), 201);
}

export async function updatePost(req: Request, res: Response) {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "post");
  if (id === null) return;
  const row = await findReadableAnnouncement(user, id);
  if (!row) return notFound(res, "Post");
  if (announcementFlags(user, row).seasonFinished) {
    return apiError(res, "season_finished", "This season has finished.", 409);
  }
  if (!canEditAnnouncement(user, row)) return forbidden(res);
  const parsed = parseOr400(updateAnnouncementRequestSchema, req.body, res, "Invalid post.");
  if (parsed === null) return;

  const { body, poll, confirmVoteLoss } = parsed;

  const { row: updated, pollChanged } = await updateAnnouncement(id, body, poll, confirmVoteLoss === true);
  const scope = updated.seasonId !== null ? { season: updated.seasonId } : {};
  auditLog("announcement.update", user.userId, id, scope);
  if (pollChanged) auditLog("announcement.poll.update", user.userId, id, scope);
  // The author has seen their own post.
  return apiOk(res, toDetail(updated, true, announcementFlags(user, updated), await loadPollView(user, updated)));
}

export async function deletePost(req: Request, res: Response) {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "post");
  if (id === null) return;
  const row = await findReadableAnnouncement(user, id);
  if (!row) return notFound(res, "Post");
  if (!canDeleteAnnouncement(user, row)) return forbidden(res);

  await db.announcement.deleteMany({ where: { id } });
  auditLog("announcement.delete", user.userId, id, row.seasonId !== null ? { season: row.seasonId } : {});
  return apiNoContent(res);
}
