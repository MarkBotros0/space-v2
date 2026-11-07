import { useLocalSearchParams } from "expo-router";

import { useCurrentSeasonId, type CurrentSeason } from "./use-seasons";

/**
 * The season a staff list shows: the `seasonId` the link names (a season's
 * overview opens its Quizzes and Assignments this way, owner 2026-11-07), else
 * the current one (ruling X8).
 */
export function useSeasonParamOrCurrent(): CurrentSeason {
  const params = useLocalSearchParams<{ seasonId?: string }>();
  const current = useCurrentSeasonId();
  const raw = typeof params.seasonId === "string" ? Number(params.seasonId) : NaN;
  if (Number.isInteger(raw) && raw > 0) return { ...current, seasonId: raw, isPending: false, isError: false };
  return current;
}
