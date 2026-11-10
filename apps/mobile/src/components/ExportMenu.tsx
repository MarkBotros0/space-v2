// apps/mobile/src/components/ExportMenu.tsx
import { useState } from "react";
import { View } from "react-native";

import { useReportExport, useSeasonWorkbookManifest } from "../hooks/use-report-export";
import { Button, GroupedList, ListRow, Sheet, Text } from "../design/ui";
import { formatBytes } from "../lib/format";

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

  const exportEngagement = () => exportMutation.exportEngagement({ seasonId, scopeLabel, exportDay });
  const exportWorkbook = () => {
    if (seasonId !== null && manifest.data) exportMutation.exportWorkbook(seasonId, manifest.data);
  };

  const workbookTitle = manifest.data ? `Export season workbook (~${formatBytes(manifest.data.estimatedBytes)})` : "";

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
        <Button variant="secondary" accessibilityLabel="Export" onPress={() => setOpen(true)}>
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
      <Button className="self-start" variant="secondary" onPress={exportEngagement}>
        Export engagement
      </Button>

      {canExportWorkbook && manifest.data ? (
        <Button className="self-start" variant="secondary" onPress={exportWorkbook}>
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
