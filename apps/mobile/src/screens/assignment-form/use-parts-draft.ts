/**
 * The Parts tab's state: the parts in order, and the one waiting for its
 * remove to be confirmed. The reducer is pure and tested on its own; a part's
 * position is its index, and its `key` stays with it through moves.
 */
import { useReducer } from "react";
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

/** The reducer with its actions named, for the form. */
export function usePartsDraft(initial: PartDraft[]) {
  const [state, dispatch] = useReducer(partsDraftReducer, { parts: initial, removing: null });
  return {
    ...state,
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
