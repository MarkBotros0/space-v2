import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiError, apiOk, apiNoContent } from "../../lib/api-response";
import { notifyAnnouncement } from "../../lib/announcement-notifications";
import { auditLog } from "../../lib/audit";
import { parseId } from "../../lib/parse-id";
import { announcementFlags, canDeleteAnnouncement, canEditAnnouncement, canPostTo } from "../../lib/permissions";
import { announcementVisibilityFilter } from "../../lib/queries/announcements";
import { requireUser } from "../../middleware/require-auth";
import { forbidden } from "../respond";
import {
  createAnnouncementRequestSchema,
  updateAnnouncementRequestSchema,
} from "../../../../../packages/shared/src/index";
import { loadPollView } from "./poll-serialize";
import { createPollFor, editPollInTx, type PollEditOutcome } from "./poll-write";
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

  // The post and its poll land together or not at all.
  const row = await db.$transaction(async (tx) => {
    const created = await tx.announcement.create({
      data: { audience: input.audience, seasonId, body: input.body, authorId: user.userId },
      select: { id: true },
    });
    if (input.poll) await createPollFor(tx, created.id, input.poll);
    return tx.announcement.findUniqueOrThrow({ where: { id: created.id }, select: ANNOUNCEMENT_SELECT });
  });
  auditLog("announcement.create", user.userId, row.id, seasonId !== null ? { season: seasonId } : {});
  notifyAnnouncement(row);
  return apiOk(res, toDetail(row, true, announcementFlags(user, row), await loadPollView(user, row)), 201);
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

  const { body, poll, confirmVoteLoss } = parsed.data;

  // An absent poll is never read or locked, so a message-only edit leaves votes and version alone.
  const result = await db.$transaction(async (tx) => {
    const outcome: PollEditOutcome = await editPollInTx(tx, id, poll, confirmVoteLoss === true);
    if (outcome.kind !== "ok") return { outcome, updated: null };
    const updated = await tx.announcement.update({
      where: { id },
      data: { body, editedAt: new Date() },
      select: ANNOUNCEMENT_SELECT,
    });
    return { outcome, updated };
  });
  const { outcome, updated } = result;
  if (outcome.kind === "bad_options") return apiError(res, "bad_request", "Invalid poll.", 400);
  if (outcome.kind === "votes_lost") {
    return apiError(res, "poll_votes_lost", "This change would remove votes.", 409, { votes: outcome.votes });
  }
  if (!updated) return apiError(res, "not_found", "Post not found.", 404);
  const scope = updated.seasonId !== null ? { season: updated.seasonId } : {};
  auditLog("announcement.update", user.userId, id, scope);
  if (outcome.pollChanged) auditLog("announcement.poll.update", user.userId, id, scope);
  // The author has seen their own post.
  return apiOk(res, toDetail(updated, true, announcementFlags(user, updated), await loadPollView(user, updated)));
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
  return apiNoContent(res);
}
