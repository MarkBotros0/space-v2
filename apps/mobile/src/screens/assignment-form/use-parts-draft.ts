/**
 * The Parts tab's state: the parts in order, and the one waiting for its
 * remove to be confirmed. The reducer is pure and tested on its own; a part's
 * position is its index, and its `key` stays with it through moves.
 */
import { useReducer, useState } from "react";
import type { AssignmentPartInput } from "@space/shared";

import type { PartDraft } from "../../lib/assignment-form-values";

export interface PartsDraft {
  parts: PartDraft[];
  /** The key of the part whose remove is waiting for "Remove" in the dialog. */
  removing: string | null;
}

type PartsDraftAction =
  | { type: "add"; part: PartDraft }
  | { type: "edit"; key: string; part: AssignmentPartInput }
  | { type: "move"; key: string; by: -1 | 1 }
  | { type: "askRemove"; key: string }
  | { type: "cancelRemove" }
  | { type: "confirmRemove" };

export const EMPTY_PARTS_DRAFT: PartsDraft = { parts: [], removing: null };

/** An assignment holds at most one forum (spec). */
export function canAddForum(parts: readonly PartDraft[]): boolean {
  return !parts.some((p) => p.kind === "FORUM");
}

let lastKey = 0;
/** A key for a part that has no id yet. Client-only: it never goes to the server. */
export function newPartKey(): string {
  lastKey += 1;
  return `new-${lastKey}`;
}

function move(state: PartsDraft, key: string, by: -1 | 1): PartsDraft {
  const from = state.parts.findIndex((p) => p.key === key);
  const to = from + by;
  if (from < 0 || to < 0 || to >= state.parts.length) return state;
  const parts = [...state.parts];
  const [moved] = parts.splice(from, 1);
  if (moved === undefined) return state;
  parts.splice(to, 0, moved);
  return { ...state, parts };
}

export function partsDraftReducer(state: PartsDraft, action: PartsDraftAction): PartsDraft {
  switch (action.type) {
    case "add":
      if (action.part.kind === "FORUM" && !canAddForum(state.parts)) return state;
      return { ...state, parts: [...state.parts, action.part] };
    case "edit":
      return {
        ...state,
        parts: state.parts.map((p) => (p.key === action.key ? { ...action.part, id: p.id, key: p.key } : p)),
      };
    case "move":
      return move(state, action.key, action.by);
    case "askRemove":
      return state.parts.some((p) => p.key === action.key) ? { ...state, removing: action.key } : state;
    case "cancelRemove":
      return { ...state, removing: null };
    case "confirmRemove":
      return { parts: state.parts.filter((p) => p.key !== state.removing), removing: null };
  }
}

/** A part's change since the last save, or null when it is as saved. */
export type PartStanding = "new" | "edited" | "moved" | null;

/** Same settings, whatever order the fields were written in. */
function sameSettings(a: PartDraft, b: PartDraft): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every(
    (k) => JSON.stringify(a[k as keyof PartDraft] ?? null) === JSON.stringify(b[k as keyof PartDraft] ?? null),
  );
}

/**
 * How a part differs from the saved assignment (owner, 2026-11-13: "show somehow that one of the parts
 * is edited and needs to be saved"): new, edited, moved, or as saved.
 */
export function partStanding(part: PartDraft, index: number, saved: readonly PartDraft[]): PartStanding {
  const before = saved.findIndex((p) => p.key === part.key);
  if (before < 0) return "new";
  if (!sameSettings(saved[before]!, part)) return "edited";
  return before === index ? null : "moved";
}

/** How many saved parts this draft removes. */
export function removedCount(parts: readonly PartDraft[], saved: readonly PartDraft[]): number {
  return saved.filter((s) => !parts.some((p) => p.key === s.key)).length;
}

/** The reducer with its actions named, for the form. */
export function usePartsDraft(initial: PartDraft[]) {
  const [state, dispatch] = useReducer(partsDraftReducer, { parts: initial, removing: null });
  // What was saved when the form opened: the yardstick for "not saved yet".
  const [saved] = useState(initial);
  return {
    ...state,
    saved,
    forumAllowed: canAddForum(state.parts),
    add: (part: AssignmentPartInput) => dispatch({ type: "add", part: { ...part, key: newPartKey() } }),
    edit: (key: string, part: AssignmentPartInput) => dispatch({ type: "edit", key, part }),
    move: (key: string, by: -1 | 1) => dispatch({ type: "move", key, by }),
    askRemove: (key: string) => dispatch({ type: "askRemove", key }),
    cancelRemove: () => dispatch({ type: "cancelRemove" }),
    confirmRemove: () => dispatch({ type: "confirmRemove" }),
  };
}
export type PartsDraftControls = ReturnType<typeof usePartsDraft>;
