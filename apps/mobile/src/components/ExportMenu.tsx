// apps/mobile/src/components/ExportMenu.tsx
import { View } from "react-native";
import { exportFilename } from "@space/shared";

import { useReportExport, useSeasonWorkbookManifest } from "../hooks/use-report-export";
import { useTheme } from "../theme";
import { Button, Text } from "../ui";

export interface ExportMenuProps {
  seasonId: number | null;
  scopeLabel: string;
  canExportWorkbook: boolean;
  exportDay: string;
}

function kb(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${Math.round(bytes / (1024 * 1024))} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

/**
 * Two buttons, and both are courtesy rather than security.
 *
 * v1's entire protection against a mentor pulling any season's workbook is that
 * /mentor/reports does not pass exportXlsxHref, so the button is not rendered
 * (R86) — "the authorization is the absence of a button". Here the endpoint
 * refuses on its own (lib/permissions.ts, spec D6 #3) and the integration suite
 * proves it; hiding the control just avoids offering a user something that can
 * only fail.
 */
export function ExportMenu({ seasonId, scopeLabel, canExportWorkbook, exportDay }: ExportMenuProps) {
  const theme = useTheme();
  const exportMutation = useReportExport();
  const manifest = useSeasonWorkbookManifest(seasonId, canExportWorkbook);

  return (
    <View style={{ gap: theme.spacing.xs, marginTop: theme.spacing.sm }}>
      <Button
        title="Export engagement"
        variant="secondary"
        onPress={() =>
          exportMutation.mutate({
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
          })
        }
      />

      {canExportWorkbook && manifest.data ? (
        <Button
          title={`Export season workbook (~${kb(manifest.data.estimatedBytes)})`}
          variant="secondary"
          onPress={() =>
            exportMutation.mutate({
              path: `/api/v1/seasons/${seasonId}/exports/workbook`,
              filename: manifest.data!.filename,
              dialogTitle: manifest.data!.scopeDescription,
              estimatedBytes: manifest.data!.estimatedBytes,
            })
          }
        />
      ) : null}

      {exportMutation.isPending ? (
        <Text variant="caption" color={theme.colors.neutral[600]}>
          Preparing your file…
        </Text>
      ) : null}

      {exportMutation.isError ? (
        <Text variant="caption" color={theme.colors.error[600]}>
          {errorText(exportMutation.error)}
        </Text>
      ) : null}
    </View>
  );
}

function errorText(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === "forbidden") return "Couldn't export. You don't have access to this.";
  if (code === "too_many_requests") return "Couldn't export. Too many exports — try again shortly.";
  if (code === "share_unavailable") return "Couldn't export. Sharing isn't available here.";
  if (code === "invalid_token") return "Couldn't export. Your session expired — sign in again.";
  return "Couldn't export. Please try again.";
}
