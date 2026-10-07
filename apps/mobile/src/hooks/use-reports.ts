// apps/mobile/src/hooks/use-reports.ts
import { useInfiniteQuery, useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  engagementStudentPageSchema,
  engagementSummarySchema,
  organisationReportSchema,
  type EngagementBand,
  type EngagementSummary,
  type OrganisationReport,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

function scopeQuery(seasonId: number | null): string {
  return seasonId === null ? "" : `?seasonId=${seasonId}`;
}

/**
 * The engagement summary.
 *
 * `enabled` is passed by the screen rather than derived here: the two roles
 * that must NOT call this (LEADER, STUDENT) get a 403, and a query that fires
 * only to be refused surfaces as an error card on a screen that should simply
 * say the surface is not theirs (spec D6 #4).
 *
 * The response is PARSED, not cast, so a backend drift fails at this boundary
 * rather than handing a malformed summary to four charts. That matters more
 * here than elsewhere: every value on this screen is a number with no
 * independent source of truth on the device.
 */
export function useEngagementReport(
  seasonId: number | null,
  enabled: boolean,
): UseQueryResult<EngagementSummary> {
  return useQuery({
    queryKey: queryKeys.reports.engagement(seasonId),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/reports/engagement${scopeQuery(seasonId)}`);
      return engagementSummarySchema.parse(res.data.data);
    },
    enabled,
  });
}

/**
 * More at-risk rows, paged, on the same screen.
 *
 * The summary caps its at-risk list at 10 (R33) and the cohort lives behind a
 * separately-gated endpoint (spec D6 #2). Rather than a second route file, the
 * card grows a "Show more" that pages this in place — mobile users should not
 * have to download a spreadsheet to read ten more rows (spec §9), and a route
 * for it would widen this plan's screen scope.
 */
export function useEngagementStudents(
  seasonId: number | null,
  band: EngagementBand | null,
  enabled: boolean,
) {
  return useInfiniteQuery({
    queryKey: queryKeys.reports.engagementStudents(seasonId, band),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (seasonId !== null) params.set("seasonId", String(seasonId));
      if (band !== null) params.set("band", band);
      if (pageParam) params.set("cursor", pageParam);
      params.set("limit", "50");
      const res = await apiClient.get(`/api/v1/reports/engagement/students?${params.toString()}`);
      return engagementStudentPageSchema.parse(res.data.data);
    },
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  });
}

/** SUPER only — the endpoint refuses everyone else (R50, R107). */
export function useOrganisationReport(enabled: boolean): UseQueryResult<OrganisationReport> {
  return useQuery({
    queryKey: queryKeys.reports.organisation(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/reports/organisation");
      return organisationReportSchema.parse(res.data.data);
    },
    enabled,
  });
}
