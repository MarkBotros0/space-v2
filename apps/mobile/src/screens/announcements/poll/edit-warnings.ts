import type { AnnouncementPoll, PollInput } from "@space/shared";

const votes = (n: number) => (n === 1 ? "1 vote" : `${n} votes`);
const people = (n: number) => (n === 1 ? "1 person" : `${n} people`);

/**
 * What an edit does to votes already cast, in the spec's words. `losesVotes` is true when
 * votes are deleted (a removed option, the poll, or several-to-one), which the server only
 * accepts with `confirmVoteLoss`; a rename alone warns but loses nothing.
 */
export function editWarnings(
  current: AnnouncementPoll | null,
  next: PollInput | null,
): { lines: string[]; losesVotes: boolean; lostVotes: number | null } {
  const lines: string[] = [];
  let losesVotes = false;
  /** Votes the lossy lines name; null once a line only knows people (several to one). */
  let lostVotes: number | null = 0;
  if (current === null) return { lines, losesVotes, lostVotes };

  if (next === null) {
    const total = current.options.reduce((sum, o) => sum + (o.votes ?? 0), 0);
    if (total > 0) {
      lines.push(`Removes the poll and its ${votes(total)}`);
      losesVotes = true;
      lostVotes = total;
    }
    return { lines, losesVotes, lostVotes };
  }

  const kept = new Map<number, string>();
  for (const o of next.options) if (o.id !== undefined) kept.set(o.id, o.label.trim());

  for (const o of current.options) {
    const n = o.votes ?? 0;
    if (n === 0) continue;
    const label = kept.get(o.id);
    if (label === undefined) {
      lines.push(`Removing ‘${o.label}’ deletes its ${votes(n)}`);
      losesVotes = true;
      if (lostVotes !== null) lostVotes += n;
    } else if (label !== o.label.trim()) {
      lines.push(`Votes stay with the new wording: ‘${o.label}’ → ‘${label}’ (${votes(n)})`);
    }
  }

  const multi = current.multiPickVoters ?? 0;
  if (current.allowsMultiple && !next.allowsMultiple && multi > 0) {
    lines.push(`${people(multi)} who picked more than one answer will need to vote again`);
    losesVotes = true;
    lostVotes = null;
  }
  return { lines, losesVotes, lostVotes };
}
