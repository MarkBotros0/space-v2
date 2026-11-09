import type { Request, Response } from "express";

import { db } from "../../db/client";
import { lockPoll } from "../../lib/announcement-poll-lock";
import { ApiError } from "../../lib/api-error";
import { apiError, apiOk } from "../../lib/api-response";
import { parseId } from "../../lib/parse-id";
import { announcementFlags, canVotePoll, isPollClosed } from "../../lib/permissions";
import { announcementVisibilityFilter } from "../../lib/queries/announcements";
import { requireUser } from "../../middleware/require-auth";
import { forbidden } from "../respond";
import { pollVoteRequestSchema } from "../../../../../packages/shared/src/index";
import { loadPollView } from "./poll-serialize";
import { unreadIdsAmong } from "./read";
import { ANNOUNCEMENT_SELECT, toDetail } from "./serialize";

// Refusals found under the poll lock. Thrown, so the transaction rolls back and
// the error handler answers them (lib/api-error.ts).
const POLL_GONE = () => new ApiError("not_found", "Poll not found.", 404);
const SEASON_FINISHED = () => new ApiError("season_finished", "This season has finished.", 409);
const POLL_CLOSED = () => new ApiError("poll_closed", "This poll is closed.", 409);
const POLL_CHANGED = () =>
  new ApiError("poll_changed", "This poll has changed. Check the options and vote again.", 409);
const BAD_VOTE = () => new ApiError("bad_request", "Invalid vote.", 400);

/**
 * PUT /announcements/:id/poll/vote: replace the caller's whole vote. Answers
 * the post with its fresh poll, so the app needs no refetch. Not audited.
 */
export async function castVote(req: Request, res: Response) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid post id.", 400);
  const row = await db.announcement.findFirst({
    where: { AND: [{ id }, await announcementVisibilityFilter(user)] },
    select: ANNOUNCEMENT_SELECT,
  });
  // 404, not 403: a post the caller may not read looks like one that isn't there.
  if (!row) return apiError(res, "not_found", "Post not found.", 404);
  if (!row.poll) return apiError(res, "not_found", "Poll not found.", 404);
  if (announcementFlags(user, row).seasonFinished)
    return apiError(res, "season_finished", "This season has finished.", 409);
  // A closed poll falls through to the locked check below and answers poll_closed.
  const closed = isPollClosed(row, row.poll);
  if (!closed && !canVotePoll(user, row, closed)) return forbidden(res);
  const parsed = pollVoteRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid vote.", 400);
  const { version, optionIds } = parsed.data;

  await db.$transaction(async (tx) => {
    const found = await tx.announcementPoll.findUnique({
      where: { announcementId: id },
      select: { id: true },
    });
    if (!found) throw POLL_GONE();
    await lockPoll(tx, found.id);
    // Re-read under the lock: an edit or close may have committed since the checks above.
    const poll = await tx.announcementPoll.findUnique({
      where: { id: found.id },
      select: {
        id: true,
        version: true,
        allowsMultiple: true,
        closedAt: true,
        options: { select: { id: true } },
        announcement: { select: { season: { select: { status: true } } } },
      },
    });
    if (!poll) throw POLL_GONE();
    const fresh = { ...row, season: poll.announcement.season };
    if (announcementFlags(user, fresh).seasonFinished) throw SEASON_FINISHED();
    if (isPollClosed(fresh, poll) || !canVotePoll(user, fresh, false)) throw POLL_CLOSED();
    if (poll.version !== version) throw POLL_CHANGED();
    const onPoll = new Set(poll.options.map((o) => o.id));
    const unique = new Set(optionIds);
    if (unique.size !== optionIds.length) throw BAD_VOTE();
    if (!optionIds.every((o) => onPoll.has(o))) throw BAD_VOTE();
    if (!poll.allowsMultiple && optionIds.length > 1) throw BAD_VOTE();

    // pollId comes from the locked row, never from the client.
    await tx.announcementPollVote.deleteMany({ where: { pollId: poll.id, userId: user.userId } });
    await tx.announcementPollVote.createMany({
      data: optionIds.map((optionId) => ({ pollId: poll.id, optionId, userId: user.userId })),
    });
  });

  const unread = await unreadIdsAmong(user, [row.id]);
  return apiOk(res, toDetail(row, !unread.has(row.id), announcementFlags(user, row), await loadPollView(user, row)));
}
