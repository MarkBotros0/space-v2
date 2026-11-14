/**
 * What /seasons/[code] shows for a season, decided apart from the screen (refactor FE-001): the
 * season rules, the tiles in order and the next step. Pure, so the owner-ruled order and copy are
 * unit-tested; the route maps each key to its icon and where it goes.
 */
import { isSeasonFinished, type SeasonStatus } from "@space/shared";

import { countOf } from "../../lib/plural";

export type OverviewTileKey = "sessions" | "assignments" | "quizzes" | "passing" | "end" | "results";
interface OverviewTile {
  key: OverviewTileKey;
  label: string;
  hint?: string;
}

export type OverviewNextStepKey = "start" | "duplicate" | "end";
interface OverviewNextStep {
  key: OverviewNextStepKey;
  title: string;
  body: string;
  actionLabel: string;
  tone: "info" | "warn";
}

interface SeasonOverviewModel {
  /** A finished season is locked (owner, 2026-11-07): read, never changed. */
  finished: boolean;
  /** The server says this caller administers it (C4), and it hasn't finished. */
  canAdminister: boolean;
  /** Administers it or is a Super, and it hasn't finished. */
  manage: boolean;
  /** ACTIVE and past its end date, by the org's day. */
  pastEnd: boolean;
  tiles: OverviewTile[];
  nextStep: OverviewNextStep | null;
}

interface OverviewSeason {
  status: SeasonStatus;
  endDate: string;
  canAdminister: boolean;
  sessionCount: number;
  assignmentCount: number;
  quizCount: number;
}

export function seasonOverviewModel(
  season: OverviewSeason,
  {
    isSuper,
    today,
    leads = false,
  }: {
    isSuper: boolean;
    today: string;
    /** The caller leads a group in this season: they read the passing outlook for their groups. */
    leads?: boolean;
  },
): SeasonOverviewModel {
  const finished = isSeasonFinished(season.status);
  const canAdminister = season.canAdminister && !finished;
  const manage = (season.canAdminister || isSuper) && !finished;
  const pastEnd = season.status === "ACTIVE" && today > season.endDate.slice(0, 10);

  // Each tile names what it opens (owner, 2026-11-07: not "Manage ..." on every card) and how many
  // it holds, "None yet" for none (owner, 2026-11-13: all three alike).
  const counted = (n: number, noun: string, plural?: string) =>
    n === 0 ? "None yet" : n === 1 ? countOf(1, noun) : `${n}\u00a0${plural ?? `${noun}s`}`;
  const sessions: OverviewTile = { key: "sessions", label: "Sessions", hint: counted(season.sessionCount, "session") };
  // Quizzes first and Sessions after Assignments (owner, 2026-11-13: "make the sessions card in the
  // bottom and swap it with the quizzes").
  const tiles: OverviewTile[] = manage
    ? [
        { key: "quizzes", label: "Quizzes", hint: counted(season.quizCount, "quiz", "quizzes") },
        { key: "assignments", label: "Assignments", hint: counted(season.assignmentCount, "assignment") },
        sessions,
      ]
    : [sessions];
  // Season passing: admin, super and the season's leaders, while it runs (End takes over after).
  if (season.status === "ACTIVE" && (manage || leads)) {
    tiles.push({ key: "passing", label: "Passing", hint: "Who is on track" });
  }
  // Past its end date, End season is the next step instead of a tile.
  if (season.status === "ACTIVE" && manage && !pastEnd) {
    tiles.push({ key: "end", label: "End season", hint: "Results and graduation" });
  }
  // Results after End: a super, or the season's admin (season passing; the server also lets a
  // former admin in, who reaches them from Reports' History since End closes this page to them).
  if ((isSuper || season.canAdminister) && finished) tiles.push({ key: "results", label: "Results", hint: "Who passed" });

  return {
    finished,
    canAdminister,
    manage,
    pastEnd,
    tiles,
    nextStep: nextStepFor(season.status, { isSuper, finished, pastEnd, manage }),
  };
}

function nextStepFor(
  status: SeasonStatus,
  s: { isSuper: boolean; finished: boolean; pastEnd: boolean; manage: boolean },
): OverviewNextStep | null {
  if (s.isSuper && status === "DRAFT") {
    return {
      key: "start",
      title: "This season is a draft",
      body: "Nobody sees it until it starts. Set up its groups and people, then start it.",
      actionLabel: "Start season",
      tone: "info",
    };
  }
  if (s.isSuper && s.finished) {
    return {
      key: "duplicate",
      title: "This season has finished",
      body: "It's read-only now. Duplicate it to start the next one as a draft.",
      actionLabel: "Duplicate as a draft",
      tone: "info",
    };
  }
  if (s.pastEnd && s.manage) {
    return {
      key: "end",
      title: "The end date has passed",
      body: "End the season to record who passed and lock it.",
      actionLabel: "End season",
      tone: "warn",
    };
  }
  return null;
}
