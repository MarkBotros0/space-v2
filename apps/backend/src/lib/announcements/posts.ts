import { db } from "../../db/client";
import type { CreateAnnouncementRequest, PollInput } from "../../../../../packages/shared/src/index";
import { ApiError } from "../api-error";
import { ANNOUNCEMENT_SELECT, type AnnouncementRow } from "../queries/announcements";
import { createPollFor, editPollInTx } from "./poll-write";

/** A post and its poll, written together or not at all. The caller has checked `canPostTo`. */
export async function createAnnouncement(
  authorId: number,
  input: CreateAnnouncementRequest,
  seasonId: number | null,
): Promise<AnnouncementRow> {
  return db.$transaction(async (tx) => {
    const created = await tx.announcement.create({
      data: { audience: input.audience, seasonId, body: input.body, authorId },
      select: { id: true },
    });
    if (input.poll) await createPollFor(tx, created.id, input.poll);
    return tx.announcement.findUniqueOrThrow({ where: { id: created.id }, select: ANNOUNCEMENT_SELECT });
  });
}

/**
 * PATCH: the body, and the poll when one is sent, in one transaction. An absent
 * poll is never read or locked, so a message-only edit leaves votes and version
 * alone. Throws 400 for a foreign option id and 409 `poll_votes_lost` (with the
 * count) when the edit would drop votes without `confirmVoteLoss`; nothing is
 * written then.
 */
export async function updateAnnouncement(
  id: number,
  body: string,
  poll: PollInput | null | undefined,
  confirmVoteLoss: boolean,
): Promise<{ row: AnnouncementRow; pollChanged: boolean }> {
  return db.$transaction(async (tx) => {
    const outcome = await editPollInTx(tx, id, poll, confirmVoteLoss);
    if (outcome.kind === "bad_options") throw new ApiError("bad_request", "Invalid poll.", 400);
    if (outcome.kind === "votes_lost") {
      throw new ApiError("poll_votes_lost", "This change would remove votes.", 409, { votes: outcome.votes });
    }
    const row = await tx.announcement.update({
      where: { id },
      data: { body, editedAt: new Date() },
      select: ANNOUNCEMENT_SELECT,
    });
    return { row, pollChanged: outcome.pollChanged };
  });
}
