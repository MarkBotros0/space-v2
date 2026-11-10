import { View } from "react-native";
import type { GroupImportPreview } from "@space/shared";

import { Badge, Button, DataTable, Text, type DataTableColumn } from "../../design/ui";

type GroupImportPreviewRow = GroupImportPreview["rows"][number];

const STATUS_BADGE: Record<
  GroupImportPreviewRow["status"],
  { variant: "success" | "warning" | "error" | "outline"; label: string }
> = {
  assign: { variant: "success", label: "Assign" },
  unchanged: { variant: "outline", label: "Unchanged" },
  no_student: { variant: "error", label: "No match" },
  no_group: { variant: "warning", label: "No group" },
  invalid: { variant: "error", label: "Invalid" },
};

const columns: DataTableColumn<GroupImportPreviewRow>[] = [
  {
    key: "row",
    header: "Row",
    cell: (r) => <Text className="text-muted-foreground">{String(r.rowNumber)}</Text>,
  },
  { key: "email", header: "Email", cell: (r) => r.email || "—" },
  { key: "group", header: "Group", cell: (r) => r.group || "—" },
  {
    key: "status",
    header: "Status",
    cell: (r) => (
      <View className="flex-col gap-0.5">
        <Badge variant={STATUS_BADGE[r.status].variant} className="self-start">
          {STATUS_BADGE[r.status].label}
        </Badge>
        {r.message ? <Text className="text-xs text-muted-foreground">{r.message}</Text> : null}
      </View>
    ),
  },
];

/** The preview's counts and per-row table, with Preview again. */
export function GroupImportPreviewStep({
  preview,
  rereading,
  onPreviewAgain,
}: {
  preview: GroupImportPreview;
  rereading: boolean;
  onPreviewAgain: () => void;
}) {
  const c = preview.counts;
  return (
    <View className="flex-col gap-3">
      <Text className="text-sm text-muted-foreground">
        {`${c.total} rows · ${c.assign} to assign · ${c.unchanged} unchanged · ${c.no_student} no match · ${c.no_group} no group · ${c.invalid} invalid`}
      </Text>
      <DataTable columns={columns} rows={preview.rows} rowKey={(r) => r.rowNumber} />
      <Button variant="secondary" className="self-start" disabled={rereading} onPress={onPreviewAgain}>
        Preview again
      </Button>
    </View>
  );
}
