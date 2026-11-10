import { db } from "../../../db/client";
import { liveAssignment } from "../../db/live";
import { seasonParticipant } from "../../queries/season-participants";
import { findLiveSeason } from "../../queries/seasons";
import { quizWhere } from "./load";

export const KEY_SYMBOLS: Array<[string, string]> = [
  ["P", "Present"],
  ["A", "Absent"],
  ["L", "Late — see the note about recorded minutes below"],
  ["(blank)", "No record for this student and session"],
  ["Submitted", "Every part done and submitted"],
  ["2 of 3 done", "Parts done so far; not submitted yet"],
  ["Not submitted", "No part done yet"],
];

export interface SheetSummary {
  name: string;
  columnCount: number;
  rowCount: number;
}

export interface SeasonWorkbookSummary {
  seasonCode: string;
  seasonTitle: string;
  rowCount: number;
  sheets: SheetSummary[];
  estimatedBytes: number;
}

/**
 * The manifest's numbers, without building anything.
 *
 * Four counts and a season lookup. The point is that a phone can be told "38
 * students × 14 sessions, about 40 kB" before it commits to a download on a
 * cellular connection (spec §7).
 */
export async function summariseSeasonWorkbook(seasonId: number): Promise<SeasonWorkbookSummary | null> {
  const season = await findLiveSeason(seasonId, { code: true, title: true });
  if (!season) return null;

  const now = new Date();
  const [rowCount, sessionCount, quizCount, assignmentCount] = await Promise.all([
    db.seasonEnrollment.count({ where: { seasonId, ...seasonParticipant } }),
    db.session.count({ where: { seasonId, startsAt: { lte: now } } }),
    db.quiz.count({ where: quizWhere(seasonId) }),
    db.assignment.count({ where: { seasonId, ...liveAssignment } }),
  ]);

  const sheets: SheetSummary[] = [
    { name: "Attendance", columnCount: 4 + sessionCount, rowCount },
    { name: "Grades", columnCount: 4 + quizCount, rowCount },
    { name: "Assignments", columnCount: 4 + assignmentCount, rowCount },
    { name: "Key", columnCount: 2, rowCount: KEY_SYMBOLS.length + 8 },
  ];

  return {
    seasonCode: season.code,
    seasonTitle: season.title,
    rowCount,
    sheets,
    estimatedBytes: estimateBytes(sheets),
  };
}

/**
 * A heuristic, and labelled as one on the contract.
 *
 * XLSX is a zip of XML, so the only honest way to know the size is to build the
 * file — which is the thing the manifest exists to avoid. ~12 bytes of
 * compressed XML per cell plus a fixed overhead has been close enough to warn a
 * user before a multi-megabyte download, which is all it is for.
 */
export function estimateBytes(sheets: SheetSummary[]): number {
  const cells = sheets.reduce((n, s) => n + s.columnCount * (s.rowCount + 1), 0);
  return 8 * 1024 + cells * 12;
}
