import type { PeopleCandidate, PeopleCandidatesResponse } from "@space/shared";

/**
 * "Add the people who passed <season>" (owner, 2026-11-07): the admin picks a
 * finished season, its passers are ticked, and anyone who didn't pass it or
 * dropped out is listed apart and only ticked on purpose.
 */
export type SourceSeason = PeopleCandidatesResponse["season"]["sources"][number];
type Outcome = PeopleCandidate["places"][number]["outcome"];

export function outcomeIn(p: PeopleCandidate, sourceId: number): Outcome | null {
  return p.places.find((pl) => pl.seasonId === sourceId)?.outcome ?? null;
}

/** Passers who can join as they stand: what choosing the season ticks. */
export function passersToTick(people: PeopleCandidate[], sourceId: number): number[] {
  return people
    .filter(
      (p) =>
        outcomeIn(p, sourceId) === "passed" &&
        p.selectable &&
        (p.availability === "available" || p.availability === "already_passed"),
    )
    .map((p) => p.id);
}

/** Didn't pass it or dropped out, and could be added: ticked only after a question. */
export function isStraggler(p: PeopleCandidate, sourceId: number | null): boolean {
  if (sourceId === null || !p.selectable) return false;
  const o = outcomeIn(p, sourceId);
  return o === "not_passed" || o === "dropped";
}

/** The question's words: `did not pass GBV 2025`, `dropped out of GBV 2025`. */
export function stragglerPhrase(p: PeopleCandidate, source: SourceSeason): string {
  return outcomeIn(p, source.id) === "dropped" ? `dropped out of ${source.title}` : `did not pass ${source.title}`;
}

/**
 * Which season opens chosen: the one named in the link (`?from=`), else the
 * suggested one while a draft has nobody in it yet; otherwise none, since
 * adding to a running season is a late addition, one by one.
 */
export function initialSourceId(
  data: PeopleCandidatesResponse,
  opts: { from: number | null; isDraft: boolean },
): number | null {
  const known = (id: number | null) => id !== null && data.season.sources.some((s) => s.id === id);
  if (known(opts.from)) return opts.from;
  const empty = !data.people.some((p) => p.availability === "in_season");
  return opts.isDraft && empty && known(data.season.suggestedSourceId) ? data.season.suggestedSourceId : null;
}

/** The suggestion on the season page: the usual previous season and how many of its passers can join. */
export function seasonSuggestion(
  data: PeopleCandidatesResponse,
): { source: SourceSeason; count: number } | null {
  const source = data.season.sources.find((s) => s.id === data.season.suggestedSourceId);
  if (!source) return null;
  const count = passersToTick(data.people, source.id).length;
  return count > 0 ? { source, count } : null;
}

/** `We ticked the 12 people who passed GBV 2025. Untick anyone who isn't coming.` */
export function sourceBanner(source: SourceSeason, ticked: number): string {
  const who = ticked === 1 ? "the 1 person" : `the ${ticked} people`;
  const lead =
    ticked === 0
      ? `Everyone who passed ${source.title} is already in this season or can't join it.`
      : `We ticked ${who} who passed ${source.title}. Untick anyone who isn't coming this season.`;
  if (source.graduated === 0) return lead;
  const grads =
    source.graduated === 1
      ? "1 more graduated and is an alumnus now."
      : `${source.graduated} more graduated and are alumni now.`;
  return `${lead} ${grads}`;
}
