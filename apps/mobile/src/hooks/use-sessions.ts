import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";
import {
  sessionListItemSchema,
  sessionRangeResponseSchema,
  type SessionListItem,
  type SessionRange,
} from "@space/shared";

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

export interface SessionRangeParams {
  seasonId: number | null;
  from: string | null;
  to: string | null;
}

/**
 * GET /api/v1/sessions (Plan 6 D-16.7): the role decides which seasons; the
 * window defaults server-side to org-midnight today + 8 calendar weeks. Pass
 * `from` (= the previous `to`) for "Later", `to` (= the previous `from`) for
 * "Earlier" — the server owns every org-day boundary (C2).
 */
export function useSessionRange(params: SessionRangeParams, enabled: boolean): UseQueryResult<SessionRange> {
  return useQuery({
    queryKey: queryKeys.sessions.range(params),
    queryFn: async () => {
      const query: Record<string, string | number> = {};
      if (params.seasonId !== null) query.seasonId = params.seasonId;
      if (params.from !== null) query.from = params.from;
      if (params.to !== null) query.to = params.to;
      const res = await apiClient.get("/api/v1/sessions", { params: query });
      return sessionRangeResponseSchema.parse(res.data.data);
    },
    enabled,
  });
}

/**
 * Every session of several seasons (v1 leader calendar: the union of each led
 * season's sessions, sorted by start). Same keys as useSeasonSessions, so the
 * cache is shared. B3-6: GET /sessions is still windowed (D-16.7 amendment
 * not implemented), so the leader reads each season instead.
 */
export function useLedSeasonSessions(seasonIds: number[]): {
  sessions: SessionListItem[];
  isPending: boolean;
  isError: boolean;
  isRefetching: boolean;
  refetch: () => void;
} {
  const results = useQueries({
    queries: seasonIds.map((id) => ({
      queryKey: queryKeys.sessions.bySeason(id),
      queryFn: () => fetchSeasonSessions(id),
    })),
  });
  const sessions = results
    .flatMap((r) => r.data ?? [])
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id - b.id);
  return {
    sessions,
    isPending: results.some((r) => r.isPending),
    isError: results.some((r) => r.isError),
    isRefetching: results.some((r) => r.isRefetching),
    refetch: () => results.forEach((r) => void r.refetch()),
  };
}
