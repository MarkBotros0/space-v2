import type { Request, Response } from "express";

import { db } from "../../db/client";

import { apiError, apiOk, forbidden } from "../../lib/api-response";
import { auditLog } from "../../lib/audit";
import { parseId } from "../../lib/parse-id";
import { announcementFlags, canManagePoll, canSeePollNames } from "../../lib/permissions";
import { findReadableAnnouncement } from "../../lib/queries/announcements";
import { setPollClosed } from "../../lib/announcements/poll-close";
import { requireUser } from "../../middleware/require-auth";
import type { PollVotersResponse } from "../../../../../packages/shared/src/index";
import { loadPollView } from "./poll-serialize";
import { unreadIdsAmong } from "./read";
import { toDetail } from "./serialize";

/** Shared by close and reopen: pre-checks, then set or clear closedAt under the poll lock. */
async function setClosed(req: Request, res: Response, close: boolean) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid post id.", 400);
  const row = await findReadableAnnouncement(user, id);
  if (!row?.poll) return apiError(res, "not_found", "Poll not found.", 404);
  if (announcementFlags(user, row).seasonFinished)
    return apiError(res, "season_finished", "This season has finished.", 409);
  if (!canManagePoll(user, row)) return forbidden(res);

  await setPollClosed(user, row, close);
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
  const row = await findReadableAnnouncement(user, id);
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
