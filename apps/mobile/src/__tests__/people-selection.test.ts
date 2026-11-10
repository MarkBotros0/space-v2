/** The season people picker's selection rules as a reducer (refactor FE-002). */
import type { PeopleCandidate } from "@space/shared";

import {
  INITIAL_SELECTION,
  peopleSelectionReducer as reduce,
  type PeopleSelection,
} from "../screens/season-people/use-people-selection";

/** A candidate with `outcome` in season 5; only the fields the rules read matter. */
const person = (id: number, outcome: "passed" | "not_passed" | "dropped" | null = null) =>
  ({
    id,
    name: `P${id}`,
    selectable: true,
    places: outcome ? [{ seasonId: 5, outcome }] : [],
  }) as unknown as PeopleCandidate;

const ids = (s: ReadonlySet<number>) => [...s].sort((a, b) => a - b);
const run = (...actions: Parameters<typeof reduce>[1][]): PeopleSelection => actions.reduce(reduce, INITIAL_SELECTION);

describe("peopleSelectionReducer", () => {
  it("choosing a source ticks its passers; choosing another unticks only what the first ticked", () => {
    const s = run(
      { type: "toggle", id: 9, person: person(9) },
      { type: "chooseSource", id: 5, ticks: [1, 2] },
      { type: "chooseSource", id: 6, ticks: [3] },
    );
    expect(ids(s.selected)).toEqual([3, 9]);
    expect(s).toMatchObject({ sourceId: 6, autoTicked: [3] });
    expect(
      ids(run({ type: "chooseSource", id: 5, ticks: [1] }, { type: "chooseSource", id: null, ticks: [] }).selected),
    ).toEqual([]);
  });

  it("toggles an ordinary person on and off, and clears the notice", () => {
    const on = run({ type: "notice", message: "x" }, { type: "toggle", id: 4, person: person(4) });
    expect(ids(on.selected)).toEqual([4]);
    expect(on.notice).toBeNull();
    expect(ids(reduce(on, { type: "toggle", id: 4, person: person(4) }).selected)).toEqual([]);
  });

  it("asks before ticking someone who didn't pass or dropped out of the chosen season, then ticks them as chosen", () => {
    const base = run({ type: "chooseSource", id: 5, ticks: [] });
    for (const outcome of ["not_passed", "dropped"] as const) {
      const asked = reduce(base, { type: "toggle", id: 7, person: person(7, outcome) });
      expect(asked.selected.has(7)).toBe(false);
      expect(asked.asking).toMatchObject({ kind: "choice", person: { id: 7 } });
      const yes = reduce(asked, { type: "confirmAsk" });
      expect(ids(yes.selected)).toEqual([7]);
      expect(ids(yes.chosen)).toEqual([7]);
      expect(yes.asking).toBeNull();
      // Chosen once, they toggle without asking again.
      const off = reduce(yes, { type: "toggle", id: 7, person: person(7, outcome) });
      expect(reduce(off, { type: "toggle", id: 7, person: person(7, outcome) }).asking).toBeNull();
    }
  });

  it("doesn't ask with no source chosen, and cancel ticks nobody", () => {
    expect(run({ type: "toggle", id: 7, person: person(7, "not_passed") }).asking).toBeNull();
    const cancelled = run(
      { type: "chooseSource", id: 5, ticks: [] },
      { type: "toggle", id: 7, person: person(7, "not_passed") },
      { type: "cancelAsk" },
    );
    expect(cancelled.asking).toBeNull();
    expect(cancelled.selected.size).toBe(0);
  });

  it("an override ask ticks and marks them overridden", () => {
    const s = run({ type: "ask", person: person(8) }, { type: "confirmAsk" });
    expect(ids(s.selected)).toEqual([8]);
    expect(ids(s.overridden)).toEqual([8]);
    expect(s.chosen.size).toBe(0);
  });

  it("select all ticks every target, then unticks them all, leaving others", () => {
    const all = run({ type: "toggle", id: 9, person: person(9) }, { type: "selectAll", targets: [1, 2] });
    expect(ids(all.selected)).toEqual([1, 2, 9]);
    expect(ids(reduce(all, { type: "selectAll", targets: [1, 2] }).selected)).toEqual([9]);
    expect(run({ type: "selectAll", targets: [] }).selected.size).toBe(0);
  });

  it("after a refusal keeps only who can still join, with the notice", () => {
    const s = run(
      { type: "selectAll", targets: [1, 2, 3] },
      { type: "pruneAfterRefusal", kept: [1, 3], message: "Taken off." },
    );
    expect(ids(s.selected)).toEqual([1, 3]);
    expect(s.notice).toBe("Taken off.");
  });
});
