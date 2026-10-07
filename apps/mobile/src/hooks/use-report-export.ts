// apps/mobile/src/hooks/use-report-export.ts
import { useMutation, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { exportManifestSchema, type ExportManifest } from "@space/shared";

import { apiClient } from "../lib/api-client";
import { downloadAndShare, type DownloadAndShareOptions } from "../lib/export-download";
import { queryKeys } from "../lib/query-keys";

/**
 * The workbook's shape, without building it.
 *
 * Only the season workbook gets a manifest. It is a students x (sessions +
 * quizzes + assignments) matrix and can be multi-megabyte; the engagement
 * export is one row per enrolment and its size is already predictable from the
 * summary's `enrollmentCount`.
 */
export function useSeasonWorkbookManifest(
  seasonId: number | null,
  enabled: boolean,
): UseQueryResult<ExportManifest> {
  return useQuery({
    queryKey: queryKeys.reports.exportManifest(seasonId),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/seasons/${seasonId}/exports/manifest`);
      return exportManifestSchema.parse(res.data.data);
    },
    enabled: enabled && seasonId !== null,
  });
}

/**
 * A mutation, not a query: an export is an action with a side effect (the share
 * sheet), it must not be re-run on focus or reconnect, and its result is not
 * cacheable — the file is deleted the moment the sheet closes.
 */
export function useReportExport() {
  return useMutation({
    mutationFn: (options: DownloadAndShareOptions) => downloadAndShare(options),
  });
}
