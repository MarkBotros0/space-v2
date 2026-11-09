import { useLocalSearchParams } from "expo-router";

import { useSeasonByCode } from "./use-seasons";

/** A `[code]` route param: a non-empty string, else null. */
export function seasonCodeParam(raw: unknown): string | null {
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/**
 * The season a `/seasons/[code]/…` route names, and its detail query. With
 * `enabled` false the code reads as null and nothing is fetched (a screen only
 * one role may open). A null `code` is the "That season link isn't valid" case.
 */
export function useSeasonRoute({ enabled = true }: { enabled?: boolean } = {}) {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = enabled ? seasonCodeParam(raw) : null;
  const season = useSeasonByCode(code);
  return { code, season };
}
