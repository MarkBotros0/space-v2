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

/**
 * A staff screen's chosen season (Plan 6 D-16.16): defaults to the same
 * "current" season every staff screen uses (Plan 4's pickCurrentSeasonId,
 * ruling X8) and lets the user pick any season the role-scoped list holds.
 * Replaces v1's redirect-to-one-season pages (spec 03 R86, spec 05 R91).
 * A picked id that is no longer in the list falls back to the default.
 */
export function useStaffSeasonSelection(enabled: boolean): StaffSeasonSelection {
  const query = useSeasons(enabled);
  const [picked, setPicked] = useState<number | null>(null);
  const seasons = query.data ?? [];
  const seasonId =
    picked !== null && seasons.some((s) => s.id === picked) ? picked : pickCurrentSeasonId(seasons);

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
