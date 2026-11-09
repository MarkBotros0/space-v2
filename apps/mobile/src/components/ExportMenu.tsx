// apps/mobile/src/components/ExportMenu.tsx
import { useState } from "react";
import { View } from "react-native";
import { exportFilename } from "@space/shared";

import { useReportExport, useSeasonWorkbookManifest } from "../hooks/use-report-export";
import { Button, GroupedList, ListRow, Sheet, Text } from "../design/ui";

interface ExportMenuProps {
  seasonId: number | null;
  scopeLabel: string;
  canExportWorkbook: boolean;
  exportDay: string;
  /**
   * Admin and super: one "Export" button (for the title row) that opens a
   * sheet with the same actions. Default false keeps the mentor's inline buttons.
   */
  sheet?: boolean;
}

function kb(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${Math.round(bytes / (1024 * 1024))} MB` : `${Math.round(bytes / 1024)} KB`;
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
export function ExportMenu({ seasonId, scopeLabel, canExportWorkbook, exportDay, sheet = false }: ExportMenuProps) {
  const exportMutation = useReportExport();
  const manifest = useSeasonWorkbookManifest(seasonId, canExportWorkbook);
  const [open, setOpen] = useState(false);

  const exportEngagement = () =>
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
    });

  const exportWorkbook = () =>
    exportMutation.mutate({
      path: `/api/v1/seasons/${seasonId}/exports/workbook`,
      filename: manifest.data!.filename,
      dialogTitle: manifest.data!.scopeDescription,
      estimatedBytes: manifest.data!.estimatedBytes,
    });

  const workbookTitle = manifest.data ? `Export season workbook (~${kb(manifest.data.estimatedBytes)})` : "";

  const status = (
    <>
      {exportMutation.isPending ? <Text className="text-xs text-muted-foreground">Preparing your file…</Text> : null}

      {exportMutation.isError ? (
        <Text className="text-xs text-error-600">{errorText(exportMutation.error)}</Text>
      ) : null}
    </>
  );

  if (sheet) {
    // The sheet stays open while the file prepares, so "Preparing your file…"
    // and a failure are read in the same place the action was taken.
    return (
      <>
        <Button variant="outline" accessibilityLabel="Export" onPress={() => setOpen(true)}>
          Export
        </Button>
        <Sheet open={open} onClose={() => setOpen(false)} title="Export">
          <View className="flex-col gap-3 pb-4">
            <GroupedList>
              <ListRow title="Export engagement" subtitle={scopeLabel} onPress={exportEngagement} />
              {canExportWorkbook && manifest.data ? <ListRow title={workbookTitle} onPress={exportWorkbook} /> : null}
            </GroupedList>
            {status}
          </View>
        </Sheet>
      </>
    );
  }

  return (
    <View className="flex-col gap-2">
      <Button className="self-start" variant="outline" onPress={exportEngagement}>
        Export engagement
      </Button>

      {canExportWorkbook && manifest.data ? (
        <Button className="self-start" variant="outline" onPress={exportWorkbook}>
          {workbookTitle}
        </Button>
      ) : null}

      {status}
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
