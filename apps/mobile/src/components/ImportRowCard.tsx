// apps/mobile/src/components/ImportRowCard.tsx
import { View } from "react-native";
import type { ImportRowStatus, StudentImportPreview } from "@space/shared";

import { useTheme } from "../theme";
import { Card, Text } from "../ui";

type PreviewRow = StudentImportPreview["rows"][number];

const STATUS_LABEL: Record<ImportRowStatus, string> = {
  new: "New",
  exists: "Skip · already here",
  duplicate: "Skip · repeated",
  invalid: "Invalid",
};

/**
 * One row, one card. v1 renders a four-column DataTable
 * (`student-import-form.tsx:148-164`); that does not fit 375px and must not be
 * ported (spec §10c). The counts card above the list carries the meaning the
 * table was carrying by adjacency.
 */
export function ImportRowCard({ row }: { row: PreviewRow }) {
  const theme = useTheme();
  const tone =
    row.status === "new"
      ? theme.colors.success[600]
      : row.status === "invalid"
        ? theme.colors.error[600]
        : theme.colors.neutral[600];

  return (
    <Card style={{ marginBottom: theme.spacing.sm }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.sm }}>
        <Text variant="heading">{row.name || "—"}</Text>
        <Text variant="label" color={tone}>
          {STATUS_LABEL[row.status]}
        </Text>
      </View>
      <Text variant="label" color={theme.colors.neutral[600]}>
        {row.email || "—"}
      </Text>
      {/* The row number is the operator's only way back to their sheet. */}
      <Text variant="caption" color={theme.colors.neutral[600]}>
        {`Row ${row.rowNumber}${row.message ? ` · ${row.message}` : ""}`}
      </Text>
    </Card>
  );
}
