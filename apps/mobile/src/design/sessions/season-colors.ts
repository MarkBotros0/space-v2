/** Season colours for SUPER's all-seasons calendar (v1 SEASON_PALETTE) and the handlers every view shares. */
import type { JpcEventListItem } from "@space/shared";

export type SeasonColor = { box: string; text: string; bar?: string };
export type SeasonColors = Record<string, SeasonColor>;

export type Handlers = {
  onOpenSession: (id: number) => void;
  onOpenEvent: (event: JpcEventListItem) => void;
  /** Season code → chip colours; present only on SUPER's all-seasons calendar. */
  seasonColors?: SeasonColors;
};

/** v1 SEASON_PALETTE: `bg-X-800 text-X-300` chips that read the same in both themes. */
const SEASON_PALETTE: SeasonColor[] = [
  { box: "bg-info-800", text: "text-info-300" },
  { box: "bg-success-800", text: "text-success-300" },
  { box: "bg-warning-800", text: "text-warning-300" },
  { box: "bg-error-800", text: "text-error-300" },
  { box: "bg-brand-navy-700", text: "text-brand-teal-300" },
];
export const FALLBACK_SEASON: SeasonColor = {
  box: "bg-brand-navy-800",
  text: "text-brand-teal-400",
};

/** v1 builds the map from the season codes in first-seen order, cycling the palette. */
export function buildSeasonColors(sessions: { seasonCode: string }[]): SeasonColors {
  const out: SeasonColors = {};
  for (const code of new Set(sessions.map((s) => s.seasonCode))) {
    out[code] = SEASON_PALETTE[Object.keys(out).length % SEASON_PALETTE.length]!;
  }
  return out;
}
