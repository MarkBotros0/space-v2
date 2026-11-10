/**
 * The season people picker's selection, as one reducer (refactor FE-002): who is ticked, who was
 * ticked past a block (overridden) or past "they didn't pass" (chosen), the season whose passers
 * were ticked and which ticks that added, the open "Add anyway?" question and the notice above
 * Save. The rules here are the picker's; PeopleList keeps the layout and the request.
 */
import { useMemo, useReducer } from "react";
import type { PeopleCandidate } from "@space/shared";

import { isStraggler } from "./source";

export interface PeopleSelection {
  selected: ReadonlySet<number>;
  /** Ticked past a block, with "Add anyway"; sent as overrideUserIds. */
  overridden: ReadonlySet<number>;
  /** Ticked on purpose although they didn't pass the chosen season or dropped out. */
  chosen: ReadonlySet<number>;
  /** The season to bring passers in from; undefined until the list first loads. */
  sourceId: number | null | undefined;
  /** What choosing that season ticked, so choosing another unticks only those. */
  autoTicked: number[];
  asking: { person: PeopleCandidate; kind: "override" | "choice" } | null;
  notice: string | null;
}

type PeopleSelectionAction =
  | { type: "chooseSource"; id: number | null; ticks: number[] }
  | { type: "toggle"; id: number; person: PeopleCandidate | undefined }
  | { type: "ask"; person: PeopleCandidate }
  | { type: "confirmAsk" }
  | { type: "cancelAsk" }
  | { type: "selectAll"; targets: number[] }
  | { type: "notice"; message: string | null }
  | { type: "pruneAfterRefusal"; kept: number[]; message: string | null };

export const INITIAL_SELECTION: PeopleSelection = {
  selected: new Set(),
  overridden: new Set(),
  chosen: new Set(),
  sourceId: undefined,
  autoTicked: [],
  asking: null,
  notice: null,
};

const withId = (set: ReadonlySet<number>, id: number) => new Set(set).add(id);

export function peopleSelectionReducer(s: PeopleSelection, action: PeopleSelectionAction): PeopleSelection {
  switch (action.type) {
    case "chooseSource": {
      const selected = new Set(s.selected);
      for (const t of s.autoTicked) selected.delete(t);
      for (const t of action.ticks) selected.add(t);
      return { ...s, sourceId: action.id, selected, autoTicked: action.ticks };
    }
    case "toggle": {
      const { id, person } = action;
      const cleared = { ...s, notice: null };
      if (person && !s.selected.has(id) && !s.chosen.has(id) && isStraggler(person, s.sourceId ?? null)) {
        return { ...cleared, asking: { person, kind: "choice" } };
      }
      const selected = new Set(s.selected);
      if (!selected.delete(id)) selected.add(id);
      return { ...cleared, selected };
    }
    case "ask":
      return { ...s, asking: { person: action.person, kind: "override" } };
    case "confirmAsk": {
      if (!s.asking) return s;
      const { id } = s.asking.person;
      return {
        ...s,
        overridden: s.asking.kind === "override" ? withId(s.overridden, id) : s.overridden,
        chosen: s.asking.kind === "choice" ? withId(s.chosen, id) : s.chosen,
        selected: withId(s.selected, id),
        asking: null,
      };
    }
    case "cancelAsk":
      return { ...s, asking: null };
    case "selectAll": {
      const allTicked = action.targets.length > 0 && action.targets.every((id) => s.selected.has(id));
      const selected = new Set(s.selected);
      for (const id of action.targets) {
        if (allTicked) selected.delete(id);
        else selected.add(id);
      }
      return { ...s, notice: null, selected };
    }
    case "notice":
      return { ...s, notice: action.message };
    case "pruneAfterRefusal":
      return { ...s, selected: new Set(action.kept), notice: action.message };
  }
}

/** The reducer with one bound function per action; the functions are stable across renders. */
export function usePeopleSelection() {
  const [state, dispatch] = useReducer(peopleSelectionReducer, INITIAL_SELECTION);
  const actions = useMemo(
    () => ({
      chooseSource: (id: number | null, ticks: number[]) => dispatch({ type: "chooseSource", id, ticks }),
      toggle: (id: number, person: PeopleCandidate | undefined) => dispatch({ type: "toggle", id, person }),
      ask: (person: PeopleCandidate) => dispatch({ type: "ask", person }),
      confirmAsk: () => dispatch({ type: "confirmAsk" }),
      cancelAsk: () => dispatch({ type: "cancelAsk" }),
      selectAll: (targets: number[]) => dispatch({ type: "selectAll", targets }),
      notice: (message: string | null) => dispatch({ type: "notice", message }),
      pruneAfterRefusal: (kept: number[], message: string | null) =>
        dispatch({ type: "pruneAfterRefusal", kept, message }),
    }),
    [],
  );
  return [state, actions] as const;
}
