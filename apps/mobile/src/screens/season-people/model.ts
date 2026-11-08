import type { PeopleCandidate } from "@space/shared";

import { isStraggler, outcomeIn, passersToTick, type SourceSeason } from "./source";

type Availability = PeopleCandidate["availability"];

export const ANY_SEASON = "any";

export type PeopleFilters = {
  query: string;
  /** A season title, or `ANY_SEASON`. */
  lastSeason: string;
  availableOnly: boolean;
};

export type PeopleItem =
  | { kind: "header"; key: string; title: string }
  | { kind: "row"; key: string; person: PeopleCandidate };

/** Unavailable kinds in the order they are listed, with their section header. */
const SECTIONS: { availability: Availability; title: string }[] = [
  { availability: "did_not_pass", title: "Did not pass" },
  { availability: "never_finished", title: "Hasn't finished" },
  { availability: "in_role", title: "Already in a role" },
  { availability: "in_season", title: "Already in this season" },
];

/** Search, "Last season" and "Available" compose; each narrows the one before. */
export function filterPeople(people: PeopleCandidate[], f: PeopleFilters): PeopleCandidate[] {
  const q = f.query.trim().toLowerCase();
  return people.filter(
    (p) =>
      (q === "" || p.name.toLowerCase().includes(q)) &&
      (f.lastSeason === ANY_SEASON || p.last?.seasonTitle === f.lastSeason) &&
      (!f.availableOnly || p.availability === "available"),
  );
}

const row = (person: PeopleCandidate): PeopleItem => ({ kind: "row", key: String(person.id), person });

/** Available, then already passed (no headers), then each unavailable kind under its header. */
function standingItems(people: PeopleCandidate[]): PeopleItem[] {
  const items: PeopleItem[] = [];
  for (const kind of ["available", "already_passed"] as const) {
    items.push(...people.filter((p) => p.availability === kind).map(row));
  }
  for (const { availability, title } of SECTIONS) {
    const rows = people.filter((p) => p.availability === availability);
    if (rows.length === 0) continue;
    items.push({ kind: "header", key: `header-${availability}`, title }, ...rows.map(row));
  }
  return items;
}

/**
 * The list's rows. With a season to bring people in from: its passers who can
 * join, then those who didn't pass it or dropped out (ticked only on purpose),
 * then everyone else as without one.
 */
export function buildItems(people: PeopleCandidate[], source: SourceSeason | null = null): PeopleItem[] {
  if (!source) return standingItems(people);
  const passers = new Set(passersToTick(people, source.id));
  const stragglers = people.filter((p) => !passers.has(p.id) && isStraggler(p, source.id));
  const apart = new Set([...passers, ...stragglers.map((p) => p.id)]);
  const rest = people.filter((p) => !apart.has(p.id));
  const items: PeopleItem[] = [];
  if (passers.size > 0) {
    items.push(
      { kind: "header", key: "header-passed", title: `Passed ${source.title} (${passers.size})` },
      ...people.filter((p) => passers.has(p.id)).map(row),
    );
  }
  if (stragglers.length > 0) {
    items.push({ kind: "header", key: "header-stragglers", title: `Didn't finish ${source.title}` }, ...stragglers.map(row));
  }
  const others = standingItems(rest);
  if (others.length > 0 && items.length > 0 && others[0]!.kind === "row") {
    items.push({ kind: "header", key: "header-rest", title: "Everyone else" });
  }
  return [...items, ...others];
}

/** Why a row sits under "Didn't finish": shown on the row, in words. */
export function sourceLine(p: PeopleCandidate, source: SourceSeason | null): string | null {
  if (!source) return null;
  const o = outcomeIn(p, source.id);
  if (o === "not_passed") return `Did not pass ${source.title}`;
  if (o === "dropped") return `Dropped out of ${source.title}`;
  return null;
}

/** The titles present among the people, for the "Last season" choices. */
export function lastSeasonTitles(people: PeopleCandidate[]): string[] {
  return [...new Set(people.flatMap((p) => (p.last ? [p.last.seasonTitle] : [])))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export type Pool = PeopleCandidate["pool"];

/** Who the Students / Alumni tab lists. */
export function inPool(people: PeopleCandidate[], pool: Pool): PeopleCandidate[] {
  return people.filter((p) => p.pool === pool);
}

/**
 * What "Select all available" ticks: available rows matching the filters, across
 * both tabs (the tab is not a filter). Already passed and in-role are ticked by hand.
 */
export function selectAllTargets(people: PeopleCandidate[], filters: PeopleFilters): number[] {
  return filterPeople(people, filters)
    .filter((p) => p.availability === "available" && p.selectable)
    .map((p) => p.id);
}

const OUTCOME: Record<NonNullable<PeopleCandidate["last"]>["outcome"], string> = {
  PASSED: "Passed",
  NOT_PASSED: "Did not pass",
  DROPPED: "Dropped",
  COMPLETED: "Completed",
};

/** `GBV 2026 - Passed - 88%`, or null for someone with no earlier season. */
export function lastLine(p: PeopleCandidate): string | null {
  if (!p.last) return null;
  const pct = p.last.attendancePct === null ? null : `${p.last.attendancePct}%`;
  return [p.last.seasonTitle, OUTCOME[p.last.outcome], pct].filter((x) => x !== null).join(" - ");
}

/** The block, in words, for the override question: `did not pass GBV 2026`, `haven't finished GBV`. */
export function blockPhrase(p: PeopleCandidate, requiredProgram: string | null): string {
  if (p.availability === "did_not_pass") {
    const title = /^Did not pass (.+?)(?:\. |$)/.exec(p.reason ?? "")?.[1];
    return title ? `did not pass ${title}` : "did not pass the required program";
  }
  return requiredProgram ? `haven't finished ${requiredProgram}` : "haven't finished the required program";
}

/** The whole row's spoken label: name, last season and the reason. */
export function rowLabel(p: PeopleCandidate): string {
  return [p.name, lastLine(p), p.reason].filter((x) => x !== null && x !== "").join(". ");
}
