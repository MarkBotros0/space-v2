import type { SeasonHistoryRow } from "@space/shared";

type BetweenSeasonsState =
  | { kind: "first" }
  | { kind: "finished"; row: SeasonHistoryRow }
  | { kind: "dropped"; row: SeasonHistoryRow };

/**
 * What a student with no current season sees on Today, from their newest past enrolment
 * (the server orders history by `enrolledAt` desc). Dropped is told apart from finished
 * so a student who was removed is never shown a "finished" card with a result.
 */
export function betweenSeasonsState(rows: SeasonHistoryRow[]): BetweenSeasonsState {
  const row = rows[0];
  if (!row) return { kind: "first" };
  return row.outcome === "DROPPED" ? { kind: "dropped", row } : { kind: "finished", row };
}
