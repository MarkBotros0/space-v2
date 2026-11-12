/**
 * The End review's state: the criteria shown (the season's, fitted to what it has to count, until
 * the admin changes them), the results the admin set by hand and their notes. Everything else is
 * derived through `end-review-model`, so a changed weight or a reloaded check re-scores every row
 * and re-selects only the rows nobody touched; what the admin chose survives a reload.
 */
import { useState } from "react";
import type { PassCriteria, SeasonEndCheck } from "@space/shared";

import {
  buildEndRequest,
  clearAll,
  fittedCriteria,
  refit,
  scoreRows,
  selectAllOnTrack,
  selectionFor,
  type EndResult,
  type Selection,
} from "./end-review-model";

export function useEndReview(check: SeasonEndCheck | undefined) {
  const [chosen, setChosen] = useState<PassCriteria | null>(null);
  const [hand, setHand] = useState<Selection>({});
  const [notes, setNotes] = useState<Record<number, string>>({});

  const criteria = check ? (chosen ? refit(chosen, check) : fittedCriteria(check)) : null;
  const rows = check && criteria ? scoreRows(check.students, criteria) : [];
  const selection = selectionFor(rows, hand);
  const notPass = rows.filter((r) => selection[r.userId] === "NOT_PASSED").length;

  return {
    criteria,
    /** The admin changed the criteria here. */
    changed: chosen !== null,
    rows,
    selection,
    notes,
    pass: rows.length - notPass,
    notPass,
    setCriteria: setChosen,
    /** One student's result from the sheet. A result left as the score set it stays the score's. */
    choose: (userId: number, draft: { result: EndResult; reason: string }) => {
      if (draft.result !== selection[userId] || userId in hand) {
        setHand((h) => ({ ...h, [userId]: draft.result }));
      }
      setNotes((n) => ({ ...n, [userId]: draft.reason }));
    },
    selectAllOnTrack: () => {
      const next = selectAllOnTrack(selection, rows);
      setHand((h) => {
        const out = { ...h };
        for (const r of rows) if (r.onTrack === true) out[r.userId] = next[r.userId] ?? "PASSED";
        return out;
      });
    },
    clear: () => setHand(clearAll(rows)),
    /** The End POST for what the screen shows now; null before the check is in. */
    request: () => (check && criteria ? buildEndRequest(check, criteria, selection, notes) : null),
  };
}
