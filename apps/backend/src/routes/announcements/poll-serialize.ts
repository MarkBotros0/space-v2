import { db } from "../../db/client";
import type { SessionUser } from "../../lib/auth/tokens";
import { canManagePoll, canSeePollNames, canVotePoll, isPollClosed } from "../../lib/permissions";
import type { AnnouncementPoll } from "../../../../../packages/shared/src/index";
import type { AnnouncementRow } from "./serialize";

const POLL_SELECT = {
  id: true,
  version: true,
  allowsMultiple: true,
  closedAt: true,
  options: { orderBy: { position: "asc" }, select: { id: true, label: true } },
} as const;

/**
 * The poll as this viewer may see it, or null for a post without one. Counts
 * come from the vote rows as they are, so someone who has since lost access
 * keeps their vote in the tally.
 */
export async function loadPollView(user: SessionUser, row: AnnouncementRow): Promise<AnnouncementPoll | null> {
  if (!row.poll) return null;
  const poll = await db.announcementPoll.findUnique({
    where: { announcementId: row.id },
    select: POLL_SELECT,
  });
  if (!poll) return null;

  const closed = isPollClosed(row, poll);
  const canManage = canManagePoll(user, row);
  const [perOption, perUser, mine] = await Promise.all([
    db.announcementPollVote.groupBy({
      by: ["optionId"],
      where: { pollId: poll.id },
      _count: { _all: true },
    }),
    db.announcementPollVote.groupBy({
      by: ["userId"],
      where: { pollId: poll.id },
      _count: { _all: true },
    }),
    db.announcementPollVote.findMany({
      where: { pollId: poll.id, userId: user.userId },
      select: { optionId: true },
    }),
  ]);
  const myOptionIds = mine.map((v) => v.optionId);
  const showCounts = canManage || myOptionIds.length > 0 || closed;
  const counts = new Map(perOption.map((c) => [c.optionId, c._count._all]));
  const multiPickers = perUser.filter((u) => u._count._all > 1);

  return {
    version: poll.version,
    allowsMultiple: poll.allowsMultiple,
    closed,
    canVote: canVotePoll(user, row, closed),
    canManage,
    canSeeNames: canSeePollNames(user, row),
    myOptionIds,
    voterCount: showCounts ? perUser.length : null,
    multiPickVoters: canManage ? multiPickers.length : null,
    multiPickVotes: canManage ? multiPickers.reduce((sum, u) => sum + u._count._all, 0) : null,
    options: poll.options.map((o) => ({
      id: o.id,
      label: o.label,
      votes: showCounts ? (counts.get(o.id) ?? 0) : null,
    })),
  };
}
