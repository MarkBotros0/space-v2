import { db } from "../../db/client";
import { lockPoll } from "../announcement-poll-lock";
import { ApiError } from "../api-error";
import type { SessionUser } from "../auth/tokens";
import { announcementFlags } from "../permissions";
import type { AnnouncementRow } from "../queries/announcements";

/**
 * Closes (`close`) or reopens `row`'s poll under its lock. Idempotent. The
 * season is read again under the lock, since it may have finished since the
 * route's checks; the refusals are thrown as ApiError.
 */
export async function setPollClosed(user: SessionUser, row: AnnouncementRow, close: boolean): Promise<void> {
  await db.$transaction(async (tx) => {
    const found = await tx.announcementPoll.findUnique({ where: { announcementId: row.id }, select: { id: true } });
    if (!found) throw new ApiError("not_found", "Poll not found.", 404);
    await lockPoll(tx, found.id);
    const poll = await tx.announcementPoll.findUnique({
      where: { id: found.id },
      select: { announcement: { select: { season: { select: { status: true } } } } },
    });
    if (!poll) throw new ApiError("not_found", "Poll not found.", 404);
    if (announcementFlags(user, { ...row, season: poll.announcement.season }).seasonFinished) {
      throw new ApiError("season_finished", "This season has finished.", 409);
    }
    await tx.announcementPoll.update({
      where: { id: found.id },
      data: close ? { closedAt: new Date(), closedById: user.userId } : { closedAt: null, closedById: null },
    });
  });
}
