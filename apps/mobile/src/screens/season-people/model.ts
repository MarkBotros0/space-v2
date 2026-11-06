import type { PeopleCandidate } from "@space/shared";

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

/** Available, then already passed (no headers), then each unavailable kind under its header. */
export function buildItems(people: PeopleCandidate[]): PeopleItem[] {
  const row = (person: PeopleCandidate): PeopleItem => ({ kind: "row", key: String(person.id), person });
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

/** The titles present among the people, for the "Last season" choices. */
export function lastSeasonTitles(people: PeopleCandidate[]): string[] {
  return [...new Set(people.flatMap((p) => (p.last ? [p.last.seasonTitle] : [])))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/** What "Select all available" ticks: available rows only. Already passed and in-role are ticked by hand. */
export function selectAllTargets(visible: PeopleCandidate[]): number[] {
  return visible.filter((p) => p.availability === "available" && p.selectable).map((p) => p.id);
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
