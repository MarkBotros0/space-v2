import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";
import {
  seasonDetailSchema,
  seasonListItemSchema,
  type SeasonDetail,
  type SeasonListItem,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";
import { useSessionStore } from "../store/session";

const seasonListSchema = z.array(seasonListItemSchema);

export function useSeasons(enabled = true): UseQueryResult<SeasonListItem[]> {
  return useQuery({
    queryKey: queryKeys.seasons.list(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/seasons");
      return seasonListSchema.parse(res.data.data.seasons);
    },
    enabled,
  });
}

export function useSeasonDetail(id: number | null): UseQueryResult<SeasonDetail> {
  return useQuery({
    queryKey: queryKeys.seasons.detail(id),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/seasons/${id}`);
      return seasonDetailSchema.parse(res.data.data);
    },
    enabled: id !== null,
  });
}

/**
 * v1's rule, verbatim in effect (spec 02 D11; spec 19 R18/D9): the ACTIVE
 * season with the latest `startDate`, else ANY season with the latest
 * `startDate` — `jpc-space/src/app/admin/calendar/page.tsx:18-26` and
 * `app/admin/dashboard/page.tsx:22-30` both run
 * `findFirst({ where: { ..., status: "ACTIVE" }, orderBy: { startDate: "desc" } })`
 * then the same without the status filter.
 *
 * It sorts here rather than trusting list order: `GET /api/v1/seasons` is
 * ordered `year desc, title asc`, so two ACTIVE seasons in one year would
 * otherwise resolve alphabetically, not to the latest-starting one. ISO
 * strings of one format compare correctly as strings. Exported so the rule is
 * tested on its own, not only through a screen.
 */
export function pickCurrentSeasonId(seasons: SeasonListItem[]): number | null {
  const latestFirst = [...seasons].sort((a, b) =>
    a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0,
  );
  const active = latestFirst.find((s) => s.status === "ACTIVE");
  return (active ?? latestFirst[0])?.id ?? null;
}

export interface CurrentSeason {
  seasonId: number | null;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Which season "now" means for this user — the one place every staff screen
 * gets it (ruling X8).
 *
 * A student's is pinned by the server (`scopes.activeSeasonId`, read from
 * their StudentProfile). Staff have no such pin — `activeSeasonId` is ALWAYS
 * null for ADMIN/LEADER/SUPER/MENTOR — so theirs is derived from the
 * role-scoped seasons list the API already returns. Defined once here instead
 * of copy-pasted per screen the way v1 did it across three pages. The list
 * query is disabled for students, so their path costs no request.
 */
export function useCurrentSeasonId(): CurrentSeason {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const pinned = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  const isStudent = role === "STUDENT";
  const seasons = useSeasons(role !== null && !isStudent);

  const refetch = () => {
    if (role !== null && !isStudent) void seasons.refetch();
  };

  if (role === null) return { seasonId: null, isPending: false, isError: false, refetch };
  if (isStudent) return { seasonId: pinned, isPending: false, isError: false, refetch };
  if (seasons.isPending) return { seasonId: null, isPending: true, isError: false, refetch };
  if (seasons.isError) return { seasonId: null, isPending: false, isError: true, refetch };
  return { seasonId: pickCurrentSeasonId(seasons.data), isPending: false, isError: false, refetch };
}
