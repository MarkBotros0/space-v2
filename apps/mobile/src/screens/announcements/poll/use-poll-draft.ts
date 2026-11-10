/**
 * The poll a post form is editing (refactor FE-080): the poll as edited, the poll as the screen
 * opened, and whether an edit should send it. `initial` is rebuilt from every refetch, so the
 * comparison is against the poll as opened, never the latest: comparing against the latest would
 * treat another manager's later edit as ours and send it back.
 */
import { useState } from "react";
import type { PollInput } from "@space/shared";

import { EMPTY_POLL } from "./poll-editor";

/** Same multi-pick setting, then the same option ids and labels in order. */
export function samePoll(a: PollInput | null, b: PollInput | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.allowsMultiple === b.allowsMultiple &&
    a.options.length === b.options.length &&
    a.options.every((o, i) => o.id === b.options[i]!.id && o.label === b.options[i]!.label)
  );
}

/**
 * What an edit sends about the poll: nothing when it is the poll as opened, so a message-only save
 * can't undo another manager's poll edit made meanwhile; else the poll (null once removed).
 */
export function pollPatch(opened: PollInput | null, poll: PollInput | null): { poll?: PollInput | null } {
  return samePoll(opened, poll) ? {} : { poll };
}

export function usePollDraft(initial: PollInput | null) {
  const [poll, setPoll] = useState<PollInput | null>(initial);
  const [opened] = useState<PollInput | null>(initial);
  return {
    poll,
    setPoll,
    opened,
    changed: !samePoll(opened, poll),
    add: () => setPoll(EMPTY_POLL),
    remove: () => setPoll(null),
  };
}
