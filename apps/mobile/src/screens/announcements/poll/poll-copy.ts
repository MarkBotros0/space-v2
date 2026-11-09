/** Every string the poll card shows, in one place (spec "The app" -> "The post"). */
export const POLL_COPY = {
  headerOne: "Poll · Pick one",
  headerAny: "Poll · Pick any",
  closed: "Closed",
  vote: "Vote",
  changeVote: "Change vote",
  yourVote: "Your vote",
  seeWhoVoted: "See who voted",
  closePoll: "Close poll",
  reopenPoll: "Reopen poll",
  formerMember: "Former member",
  noVoters: "No votes yet",
  pollChanged: "The poll changed. Have another look.",
  voteFailed: "Couldn't save your vote.",
  closeFailed: "Couldn't close the poll.",
  reopenFailed: "Couldn't reopen the poll.",
  votersFailed: "Couldn't load who voted.",
} as const;

export function pollHeader(allowsMultiple: boolean): string {
  return allowsMultiple ? POLL_COPY.headerAny : POLL_COPY.headerOne;
}

/** "1 person voted" / "N people voted". */
export function votersFooter(count: number): string {
  return count === 1 ? "1 person voted" : `${count} people voted`;
}

/** Share of voters (not votes), so a several-answer poll can add up past 100. */
export function pollPercent(votes: number, voterCount: number): number {
  return voterCount === 0 ? 0 : Math.round((votes / voterCount) * 100);
}

/** What a screen reader says for one result row: "Option, 12 votes, 40 percent, your vote". */
export function resultRowLabel(label: string, votes: number, pct: number, mine: boolean): string {
  return `${label}, ${votes} ${votes === 1 ? "vote" : "votes"}, ${pct} percent${mine ? ", your vote" : ""}`;
}
