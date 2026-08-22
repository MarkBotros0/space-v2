import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";
import { sessionListItemSchema, type SessionListItem } from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

const sessionListSchema = z.array(sessionListItemSchema);

async function fetchSeasonSessions(seasonId: number): Promise<SessionListItem[]> {
  const res = await apiClient.get(`/api/v1/seasons/${seasonId}/sessions`);
  // Parse, don't cast — same reasoning as api-client.ts's auth responses: a
  // backend drift here should fail loudly at the client boundary instead of
  // handing a malformed session into the UI.
  return sessionListSchema.parse(res.data.data.sessions);
}

/**
 * Sessions for a season, scoped by `scopes.activeSeasonId` from the session
 * store. That id is nullable — a user can be signed in with no active season
 * (freshly enrolled nowhere yet, or between seasons) — so this is a
 * *dependent* query: `enabled` gates the fetch on `seasonId` actually being a
 * number, and the query key only takes a `number` so a caller can never build
 * a cache entry keyed on `null`. Passing `null` through simply skips the
 * network call rather than firing a request against a nonsensical URL.
 */
export function useSeasonSessions(seasonId: number | null): UseQueryResult<SessionListItem[]> {
  return useQuery({
    queryKey: queryKeys.sessions.bySeason(seasonId),
    queryFn: () => fetchSeasonSessions(seasonId as number),
    enabled: seasonId !== null,
  });
}
