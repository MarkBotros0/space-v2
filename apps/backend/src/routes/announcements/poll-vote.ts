import type { Request, Response } from "express";

import { db } from "../../db/client";
import { lockPoll } from "../../lib/announcement-poll-lock";
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

type VoteOutcome = "ok" | "not_found" | "season_finished" | "poll_closed" | "poll_changed" | "bad_options";

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

  const outcome = await db.$transaction(async (tx): Promise<VoteOutcome> => {
    const found = await tx.announcementPoll.findUnique({
      where: { announcementId: id },
      select: { id: true },
    });
    if (!found) return "not_found";
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
    if (!poll) return "not_found";
    const fresh = { ...row, season: poll.announcement.season };
    if (announcementFlags(user, fresh).seasonFinished) return "season_finished";
    if (isPollClosed(fresh, poll) || !canVotePoll(user, fresh, false)) return "poll_closed";
    if (poll.version !== version) return "poll_changed";
    const onPoll = new Set(poll.options.map((o) => o.id));
    const unique = new Set(optionIds);
    if (unique.size !== optionIds.length) return "bad_options";
    if (!optionIds.every((o) => onPoll.has(o))) return "bad_options";
    if (!poll.allowsMultiple && optionIds.length > 1) return "bad_options";

    // pollId comes from the locked row, never from the client.
    await tx.announcementPollVote.deleteMany({ where: { pollId: poll.id, userId: user.userId } });
    await tx.announcementPollVote.createMany({
      data: optionIds.map((optionId) => ({ pollId: poll.id, optionId, userId: user.userId })),
    });
    return "ok";
  });

  switch (outcome) {
    case "not_found":
      return apiError(res, "not_found", "Poll not found.", 404);
    case "season_finished":
      return apiError(res, "season_finished", "This season has finished.", 409);
    case "poll_closed":
      return apiError(res, "poll_closed", "This poll is closed.", 409);
    case "poll_changed":
      return apiError(res, "poll_changed", "This poll has changed. Check the options and vote again.", 409);
    case "bad_options":
      return apiError(res, "bad_request", "Invalid vote.", 400);
    case "ok": {
      const unread = await unreadIdsAmong(user, [row.id]);
      return apiOk(
        res,
        toDetail(row, !unread.has(row.id), announcementFlags(user, row), await loadPollView(user, row)),
      );
    }
  }
}
