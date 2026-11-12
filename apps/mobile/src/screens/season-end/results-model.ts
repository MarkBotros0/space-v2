/**
 * The words of one row on a finished season's Results (season passing, spec 2026-11-12 "After
 * End"): the score End stored, whether the result went against it, and the staff reason, one fact
 * per line. A season ended before weighted passing has no stored score and says so. Pure, so the
 * copy is tested apart from the screen.
 */
import type { SeasonResultRow, SeasonResultsResponse } from "@space/shared";

import type { ChipSpec } from "../../design/ui/status-chip";
import { rowLabel } from "./end-review-model";

const ENDED_BEFORE = "Ended before weighted passing";

function resultChip(r: SeasonResultRow): ChipSpec {
  if (r.result === "PASSED") return { tone: "ok", label: "Passed" };
  if (r.result === "NOT_PASSED") return { tone: "bad", label: "Did not pass" };
  return { tone: "neutral", label: "No result" };
}

export function resultRowView(
  r: SeasonResultRow,
  criteria: SeasonResultsResponse["criteria"],
): { chip: ChipSpec; lines: string[] } {
  const lines: string[] = [];
  if (r.groupName) lines.push(r.groupName);
  if (criteria === null || r.numbers === null) {
    lines.push(ENDED_BEFORE);
    lines.push(`Attendance ${r.attendancePct}%`);
  } else {
    lines.push(r.passScore === null ? "No score" : `Score ${r.passScore.toFixed(1)}`);
    // The server says whether the result goes against the stored score; the words are End's.
    if (r.againstScore && r.result) lines.push(rowLabel(r.result, r.result === "NOT_PASSED") ?? "");
  }
  if (r.reason) lines.push(r.reason);
  return { chip: resultChip(r), lines: lines.filter((l) => l !== "") };
}
