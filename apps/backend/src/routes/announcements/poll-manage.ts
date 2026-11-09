import type { Request, Response } from "express";

import { db } from "../../db/client";
import { lockPoll } from "../../lib/announcement-poll-lock";
import { apiError, apiOk } from "../../lib/api-response";
import { auditLog } from "../../lib/audit";
import { parseId } from "../../lib/parse-id";
import { announcementFlags, canManagePoll, canSeePollNames } from "../../lib/permissions";
import { announcementVisibilityFilter } from "../../lib/queries/announcements";
import { requireUser } from "../../middleware/require-auth";
import { forbidden } from "../respond";
import type { PollVotersResponse } from "../../../../../packages/shared/src/index";
import { loadPollView } from "./poll-serialize";
import { unreadIdsAmong } from "./read";
import { ANNOUNCEMENT_SELECT, toDetail } from "./serialize";

type Outcome = "ok" | "not_found" | "season_finished";

/** Shared by close and reopen: pre-checks, then set or clear closedAt under the poll lock. */
async function setClosed(req: Request, res: Response, close: boolean) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid post id.", 400);
  const row = await db.announcement.findFirst({
    where: { AND: [{ id }, await announcementVisibilityFilter(user)] },
    select: ANNOUNCEMENT_SELECT,
  });
  if (!row?.poll) return apiError(res, "not_found", "Poll not found.", 404);
  if (announcementFlags(user, row).seasonFinished)
    return apiError(res, "season_finished", "This season has finished.", 409);
  if (!canManagePoll(user, row)) return forbidden(res);

  const outcome = await db.$transaction(async (tx): Promise<Outcome> => {
    const found = await tx.announcementPoll.findUnique({
      where: { announcementId: id },
      select: { id: true },
    });
    if (!found) return "not_found";
    await lockPoll(tx, found.id);
    // Re-read under the lock: the season may have finished since the checks above.
    const poll = await tx.announcementPoll.findUnique({
      where: { id: found.id },
      select: { announcement: { select: { season: { select: { status: true } } } } },
    });
    if (!poll) return "not_found";
    if (announcementFlags(user, { ...row, season: poll.announcement.season }).seasonFinished) return "season_finished";
    await tx.announcementPoll.update({
      where: { id: found.id },
      data: close ? { closedAt: new Date(), closedById: user.userId } : { closedAt: null, closedById: null },
    });
    return "ok";
  });

  if (outcome === "not_found") return apiError(res, "not_found", "Poll not found.", 404);
  if (outcome === "season_finished") return apiError(res, "season_finished", "This season has finished.", 409);
  auditLog(
    close ? "announcement.poll.close" : "announcement.poll.reopen",
    user.userId,
    id,
    row.seasonId !== null ? { season: row.seasonId } : {},
  );
  const unread = await unreadIdsAmong(user, [row.id]);
  return apiOk(res, toDetail(row, !unread.has(row.id), announcementFlags(user, row), await loadPollView(user, row)));
}

/** POST /announcements/:id/poll/close (idempotent). */
export const closePoll = (req: Request, res: Response) => setClosed(req, res, true);

/** POST /announcements/:id/poll/reopen (idempotent). */
export const reopenPoll = (req: Request, res: Response) => setClosed(req, res, false);

/**
 * GET /announcements/:id/poll/voters: names per option for the poll's managers
 * (and a Super once the season has finished); 404 for anyone else. A voter who
 * lost access since still counts; a soft-deleted account reads name null.
 */
export async function listVoters(req: Request, res: Response) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid post id.", 400);
  const row = await db.announcement.findFirst({
    where: { AND: [{ id }, await announcementVisibilityFilter(user)] },
    select: ANNOUNCEMENT_SELECT,
  });
  if (!row?.poll || !canSeePollNames(user, row)) return apiError(res, "not_found", "Poll not found.", 404);
  const poll = await db.announcementPoll.findUnique({
    where: { announcementId: id },
    select: {
      options: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          label: true,
          votes: {
            orderBy: [{ createdAt: "asc" }, { userId: "asc" }],
            select: { user: { select: { name: true, deletedAt: true } } },
          },
        },
      },
    },
  });
  if (!poll) return apiError(res, "not_found", "Poll not found.", 404);
  const data: PollVotersResponse = {
    options: poll.options.map((o) => ({
      id: o.id,
      label: o.label,
      voters: o.votes.map((v) => ({ name: v.user.deletedAt ? null : v.user.name })),
    })),
  };
  return apiOk(res, data);
}
