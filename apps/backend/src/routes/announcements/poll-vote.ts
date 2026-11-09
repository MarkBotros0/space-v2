import type { Request, Response } from "express";

import { apiError, apiOk, forbidden } from "../../lib/api-response";

import { announcementFlags, canVotePoll, isPollClosed } from "../../lib/permissions";
import { findReadableAnnouncement } from "../../lib/queries/announcements";
import { replaceVote } from "../../lib/announcements/poll-vote";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";
import { parseOr400 } from "../../lib/http/validate";
import { requireUser } from "../../middleware/require-auth";
import { pollVoteRequestSchema } from "../../../../../packages/shared/src/index";
import { loadPollView } from "./poll-serialize";
import { unreadIdsAmong } from "./read";
import { toDetail } from "./serialize";

/**
 * PUT /announcements/:id/poll/vote: replace the caller's whole vote. Answers
 * the post with its fresh poll, so the app needs no refetch. Not audited.
 */
export async function castVote(req: Request, res: Response) {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "post");
  if (id === null) return;
  const row = await findReadableAnnouncement(user, id);
  // 404, not 403: a post the caller may not read looks like one that isn't there.
  if (!row) return notFound(res, "Post");
  if (!row.poll) return notFound(res, "Poll");
  if (announcementFlags(user, row).seasonFinished)
    return apiError(res, "season_finished", "This season has finished.", 409);
  // A closed poll falls through to the locked check below and answers poll_closed.
  const closed = isPollClosed(row, row.poll);
  if (!closed && !canVotePoll(user, row, closed)) return forbidden(res);
  const parsed = parseOr400(pollVoteRequestSchema, req.body, res, "Invalid vote.");
  if (parsed === null) return;
  await replaceVote(user, row, parsed);

  const unread = await unreadIdsAmong(user, [row.id]);
  return apiOk(res, toDetail(row, !unread.has(row.id), announcementFlags(user, row), await loadPollView(user, row)));
}
