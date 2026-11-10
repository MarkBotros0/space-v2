// apps/mobile/src/hooks/use-report-export.ts
import { useMutation, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { exportFilename, exportManifestSchema, type ExportManifest } from "@space/shared";

import { downloadAndShare, type DownloadAndShareOptions } from "../lib/export-download";
import { queryKeys } from "../lib/query-keys";
import { apiGet } from "../lib/api-request";

/**
 * The workbook's shape, without building it.
 *
 * Only the season workbook gets a manifest. It is a students x (sessions +
 * quizzes + assignments) matrix and can be multi-megabyte; the engagement
 * export is one row per enrolment and its size is already predictable from the
 * summary's `enrollmentCount`.
 */
export function useSeasonWorkbookManifest(seasonId: number | null, enabled: boolean): UseQueryResult<ExportManifest> {
  return useQuery({
    queryKey: queryKeys.reports.exportManifest(seasonId),
    queryFn: () => apiGet(`/api/v1/seasons/${seasonId}/exports/manifest`, exportManifestSchema),
    enabled: enabled && seasonId !== null,
  });
}

/**
 * A mutation, not a query: an export is an action with a side effect (the share
 * sheet), it must not be re-run on focus or reconnect, and its result is not
 * cacheable — the file is deleted the moment the sheet closes. Callers say what
 * to export; the paths live here (refactor FE-012).
 */
export function useReportExport() {
  const mutation = useMutation({
    mutationFn: (options: DownloadAndShareOptions) => downloadAndShare(options),
  });
  return {
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    /** The engagement export for one season, or for the caller's whole report scope. */
    exportEngagement: ({
      seasonId,
      scopeLabel,
      exportDay,
    }: {
      seasonId: number | null;
      scopeLabel: string;
      exportDay: string;
    }) =>
      mutation.mutate({
        path:
          seasonId === null
            ? "/api/v1/reports/engagement/export"
            : `/api/v1/reports/engagement/export?seasonId=${seasonId}`,
        // The SAME builder the server uses for Content-Disposition, so the
        // name in the share sheet and the name in the header cannot drift
        // (D-17.16). The local path must be chosen before any header is
        // visible, which is why this is shared code and not a header parse.
        // exportDay is the server's org-zone day (ruling X13), not
        // `new Date()` on the device: the server stamps
        // orgDayKey(now) on Content-Disposition, and a device clock
        // in UTC or another zone names a different day near midnight.
        filename: exportFilename("engagement", scopeLabel, exportDay),
        dialogTitle: `Engagement — ${scopeLabel}`,
      }),
    /** A season's workbook, named and sized by its manifest. */
    exportWorkbook: (seasonId: number, manifest: ExportManifest) =>
      mutation.mutate({
        path: `/api/v1/seasons/${seasonId}/exports/workbook`,
        filename: manifest.filename,
        dialogTitle: manifest.scopeDescription,
        estimatedBytes: manifest.estimatedBytes,
      }),
  };
}
