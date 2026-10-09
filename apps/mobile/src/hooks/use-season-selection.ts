import { useState } from "react";
import type { SeasonListItem } from "@space/shared";

import { pickCurrentSeasonId, useSeasons } from "./use-seasons";

export interface StaffSeasonSelection {
  seasons: SeasonListItem[];
  seasonId: number | null;
  season: SeasonListItem | null;
  setSeasonId: (id: number) => void;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
}

export interface StaffSeasonSelectionOptions {
  /** The default when nothing is picked. Defaults to pickCurrentSeasonId (ACTIVE first, X8). */
  pickDefault?: (seasons: SeasonListItem[]) => number | null;
  /** An initial pick, e.g. a `seasonId` route param (D-16.16, R97). */
  initialSeasonId?: number | null;
}

/**
 * A staff screen's chosen season (Plan 6 D-16.16). The default follows v1's
 * redirect rule for the screen (`pickDefault`): the calendar's newest ACTIVE
 * season (R86) or /groups' newest season of any status (R91). A picked id that
 * is no longer in the list falls back to the default.
 */
export function useStaffSeasonSelection(
  enabled: boolean,
  options: StaffSeasonSelectionOptions = {},
): StaffSeasonSelection {
  const query = useSeasons(enabled);
  const [picked, setPicked] = useState<number | null>(options.initialSeasonId ?? null);
  const seasons = query.data ?? [];
  const pickDefault = options.pickDefault ?? pickCurrentSeasonId;
  const seasonId =
    picked !== null && seasons.some((s) => s.id === picked) ? picked : pickDefault(seasons);

  return {
    seasons,
    seasonId,
    season: seasons.find((s) => s.id === seasonId) ?? null,
    setSeasonId: setPicked,
    isPending: enabled && query.isPending,
    isError: enabled && query.isError,
    refetch: () => {
      if (enabled) void query.refetch();
    },
  };
}
