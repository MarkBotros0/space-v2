import type { Prisma } from "../../generated/prisma/client";
import { lockPoll } from "../../lib/announcement-poll-lock";
import type { PollInput } from "../../../../../packages/shared/src/index";
import { planPollEdit, type CurrentPoll, type PollEdit, type PollEditPlan } from "./poll-edit-plan";

export { planPollEdit } from "./poll-edit-plan";

type Tx = Prisma.TransactionClient;

/** A post's new poll at version 1; options take the list's order. */
export async function createPollFor(tx: Tx, announcementId: number, input: PollInput): Promise<void> {
  await tx.announcementPoll.create({
    data: {
      announcementId,
      allowsMultiple: input.allowsMultiple,
      options: { create: input.options.map((o, position) => ({ label: o.label, position })) },
    },
  });
}

/** Applies a plan from `planPollEdit`. Call it inside the transaction that read `current` under the lock. */
export async function applyPollEdit(
  tx: Tx,
  announcementId: number,
  pollId: number | null,
  plan: PollEdit,
): Promise<void> {
  switch (plan.kind) {
    case "none":
    case "invalid":
      return;
    case "create":
      return createPollFor(tx, announcementId, plan.poll);
    case "delete":
      // Options and votes go with it (cascade).
      if (pollId !== null) await tx.announcementPoll.delete({ where: { id: pollId } });
      return;
    case "update":
      if (pollId !== null) await applyUpdate(tx, pollId, plan);
      return;
  }
}

async function applyUpdate(tx: Tx, pollId: number, plan: PollEditPlan): Promise<void> {
  if (plan.clearUserIds.length > 0) {
    await tx.announcementPollVote.deleteMany({ where: { pollId, userId: { in: plan.clearUserIds } } });
  }
  if (plan.removeOptionIds.length > 0) {
    // Their votes go with them (cascade).
    await tx.announcementPollOption.deleteMany({ where: { pollId, id: { in: plan.removeOptionIds } } });
  }
  for (const k of plan.keep) {
    // pollId in the filter: an option id is only ever changed on its own poll.
    await tx.announcementPollOption.updateMany({
      where: { id: k.id, pollId },
      data: { label: k.label, position: k.position },
    });
  }
  if (plan.create.length > 0) {
    await tx.announcementPollOption.createMany({
      data: plan.create.map((c) => ({ pollId, label: c.label, position: c.position })),
    });
  }
  await tx.announcementPoll.update({
    where: { id: pollId },
    data: {
      allowsMultiple: plan.allowsMultiple,
      ...(plan.bumpVersion ? { version: { increment: 1 } } : {}),
    },
  });
}

export type PollEditOutcome =
  | { kind: "ok"; pollChanged: boolean }
  | { kind: "bad_options" }
  | { kind: "votes_lost"; votes: number };

/**
 * PATCH's poll part, inside the caller's transaction. Locks the post (so two
 * edits can't both add a poll) and then its poll, reads the current options and
 * votes under the lock, and plans and applies the edit. Writes nothing when it
 * would lose votes without `confirmVoteLoss`, or when an option id is foreign.
 */
export async function editPollInTx(
  tx: Tx,
  announcementId: number,
  next: PollInput | null | undefined,
  confirmVoteLoss: boolean,
): Promise<PollEditOutcome> {
  if (next === undefined) return { kind: "ok", pollChanged: false };
  await tx.$queryRaw`SELECT "id" FROM "Announcement" WHERE "id" = ${announcementId} FOR UPDATE`;
  const found = await tx.announcementPoll.findUnique({ where: { announcementId }, select: { id: true } });
  let current: CurrentPoll | null = null;
  if (found) {
    await lockPoll(tx, found.id);
    const poll = await tx.announcementPoll.findUnique({
      where: { id: found.id },
      select: {
        allowsMultiple: true,
        options: { orderBy: { position: "asc" }, select: { id: true, label: true } },
        votes: { select: { optionId: true, userId: true } },
      },
    });
    current = poll;
  }
  const plan = planPollEdit(current, next);
  if (plan.kind === "invalid") return { kind: "bad_options" };
  if (plan.lostVotes > 0 && !confirmVoteLoss) return { kind: "votes_lost", votes: plan.lostVotes };
  await applyPollEdit(tx, announcementId, found?.id ?? null, plan);
  const pollChanged = plan.kind === "create" || plan.kind === "delete" || plan.bumpVersion;
  return { kind: "ok", pollChanged };
}
