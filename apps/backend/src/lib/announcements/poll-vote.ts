import { db } from "../../db/client";
import type { PollVoteRequest } from "../../../../../packages/shared/src/index";
import { lockPoll } from "../announcement-poll-lock";
import { ApiError } from "../api-error";
import type { SessionUser } from "../auth/tokens";
import { announcementFlags, canVotePoll, isPollClosed } from "../permissions";
import type { AnnouncementRow } from "../queries/announcements";

// Refusals found under the poll lock. Thrown, so the transaction rolls back and
// the error handler answers them (lib/api-error.ts).
const POLL_GONE = () => new ApiError("not_found", "Poll not found.", 404);
const SEASON_FINISHED = () => new ApiError("season_finished", "This season has finished.", 409);
const POLL_CLOSED = () => new ApiError("poll_closed", "This poll is closed.", 409);
const POLL_CHANGED = () =>
  new ApiError("poll_changed", "This poll has changed. Check the options and vote again.", 409);
const BAD_VOTE = () => new ApiError("bad_request", "Invalid vote.", 400);

/** The vote's options, checked against the poll as read under its lock. */
function checkOptions(poll: { allowsMultiple: boolean; options: { id: number }[] }, optionIds: number[]): void {
  const onPoll = new Set(poll.options.map((o) => o.id));
  if (new Set(optionIds).size !== optionIds.length) throw BAD_VOTE();
  if (!optionIds.every((o) => onPoll.has(o))) throw BAD_VOTE();
  if (!poll.allowsMultiple && optionIds.length > 1) throw BAD_VOTE();
}

/**
 * Replaces the caller's whole vote on `row`'s poll. Everything the route checked
 * before is checked again under the poll lock, since an edit or close may have
 * committed in between; the refusals are thrown as ApiError.
 */
export async function replaceVote(user: SessionUser, row: AnnouncementRow, vote: PollVoteRequest): Promise<void> {
  const { version, optionIds } = vote;
  await db.$transaction(async (tx) => {
    const found = await tx.announcementPoll.findUnique({ where: { announcementId: row.id }, select: { id: true } });
    if (!found) throw POLL_GONE();
    await lockPoll(tx, found.id);
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
    checkOptions(poll, optionIds);

    // pollId comes from the locked row, never from the client.
    await tx.announcementPollVote.deleteMany({ where: { pollId: poll.id, userId: user.userId } });
    await tx.announcementPollVote.createMany({
      data: optionIds.map((optionId) => ({ pollId: poll.id, optionId, userId: user.userId })),
    });
  });
}
