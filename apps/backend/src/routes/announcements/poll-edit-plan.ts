import type { PollInput } from "../../../../../packages/shared/src/index";

/** The poll as it stands, read under its lock: options in position order and every vote row. */
export interface CurrentPoll {
  allowsMultiple: boolean;
  options: { id: number; label: string }[];
  votes: { optionId: number; userId: number }[];
}

interface Unchanged {
  kind: "none";
  lostVotes: 0;
  bumpVersion: false;
}

export interface PollEditPlan {
  kind: "update";
  lostVotes: number;
  bumpVersion: boolean;
  allowsMultiple: boolean;
  /** Kept options, renamed and re-positioned. */
  keep: { id: number; label: string; position: number }[];
  /** New options. */
  create: { label: string; position: number }[];
  /** Existing options missing from the list; their votes go with them. */
  removeOptionIds: number[];
  /** Several -> one: people who picked more than one lose their whole vote. */
  clearUserIds: number[];
}

export type PollEdit =
  | Unchanged
  | { kind: "invalid"; lostVotes: 0; bumpVersion: false }
  | { kind: "create"; lostVotes: 0; bumpVersion: false; poll: PollInput }
  | { kind: "delete"; lostVotes: number; bumpVersion: false }
  | PollEditPlan;

const NONE: Unchanged = { kind: "none", lostVotes: 0, bumpVersion: false };
const INVALID = { kind: "invalid", lostVotes: 0, bumpVersion: false } as const;

/**
 * What a PATCH's `poll` does to a post's poll, and how many votes it costs.
 * Pure: the caller reads `current` under the poll lock and applies the plan in
 * the same transaction, so `lostVotes` is the true count.
 *
 * `next` absent leaves the poll alone; null removes it; an object is the whole
 * new poll, where an option with an id keeps its votes and an id not on this
 * poll (or sent twice) is invalid.
 */
export function planPollEdit(current: CurrentPoll | null, next: PollInput | null | undefined): PollEdit {
  if (next === undefined) return NONE;
  if (current === null) {
    if (next === null) return NONE;
    if (next.options.some((o) => o.id !== undefined)) return INVALID;
    return { kind: "create", lostVotes: 0, bumpVersion: false, poll: next };
  }
  if (next === null) return { kind: "delete", lostVotes: current.votes.length, bumpVersion: false };

  const existing = new Map(current.options.map((o) => [o.id, o.label]));
  const sentIds = new Set<number>();
  for (const o of next.options) {
    if (o.id === undefined) continue;
    if (!existing.has(o.id) || sentIds.has(o.id)) return INVALID;
    sentIds.add(o.id);
  }

  const keep: PollEditPlan["keep"] = [];
  const create: PollEditPlan["create"] = [];
  next.options.forEach((o, position) => {
    if (o.id === undefined) create.push({ label: o.label, position });
    else keep.push({ id: o.id, label: o.label, position });
  });
  const removeOptionIds = current.options.filter((o) => !sentIds.has(o.id)).map((o) => o.id);

  let clearUserIds: number[] = [];
  if (current.allowsMultiple && !next.allowsMultiple) {
    const picks = new Map<number, number>();
    for (const v of current.votes) picks.set(v.userId, (picks.get(v.userId) ?? 0) + 1);
    clearUserIds = [...picks].filter(([, n]) => n > 1).map(([userId]) => userId);
  }

  const removed = new Set(removeOptionIds);
  const cleared = new Set(clearUserIds);
  // Each vote row counts once, whether it goes with its option or with its voter.
  const lostVotes = current.votes.filter((v) => removed.has(v.optionId) || cleared.has(v.userId)).length;

  const unchanged =
    current.allowsMultiple === next.allowsMultiple &&
    create.length === 0 &&
    removeOptionIds.length === 0 &&
    keep.every((k, i) => current.options[i]?.id === k.id && existing.get(k.id) === k.label);

  return {
    kind: "update",
    lostVotes,
    bumpVersion: !unchanged,
    allowsMultiple: next.allowsMultiple,
    keep,
    create,
    removeOptionIds,
    clearUserIds,
  };
}
