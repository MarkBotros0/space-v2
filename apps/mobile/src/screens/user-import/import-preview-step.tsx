import type { ReactNode } from "react";
import { View } from "react-native";
import type { ImportRowStatus, StudentImportPreview } from "@space/shared";

import { FormErrorBox } from "../../design/forms/form-parts";
import {
  Badge,
  Button,
  Card,
  CardContent,
  DataTable,
  EmptyState,
  Text,
  type DataTableColumn,
} from "../../design/ui";
import type { StudentImportFlow } from "./use-student-import-flow";

type PreviewRow = StudentImportPreview["rows"][number];

const STATUS_BADGE: Record<
  ImportRowStatus,
  { variant: "success" | "warning" | "error"; label: string }
> = {
  new: { variant: "success", label: "New" },
  exists: { variant: "warning", label: "Skip · already here" },
  duplicate: { variant: "warning", label: "Skip · repeated" },
  invalid: { variant: "error", label: "Invalid" },
  previously_removed: { variant: "warning", label: "Skip · removed" },
};

const COLUMNS: DataTableColumn<PreviewRow>[] = [
  {
    key: "name",
    header: "Name",
    cell: (r) => <Text className="font-medium">{r.name || "—"}</Text>,
  },
  {
    key: "email",
    header: "Email",
    cell: (r) => <Text className="text-muted-foreground">{r.email || "—"}</Text>,
  },
  { key: "row", header: "Row", cell: (r) => `Row ${r.rowNumber}` },
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

/** Step 2: the server's classification of every pasted row, the filter, and the commit. */
export function ImportPreviewStep({
  header,
  preview,
  flow,
}: {
  header: ReactNode;
  preview: StudentImportPreview;
  flow: StudentImportFlow;
}) {
  const { filter, shownCount, visibleRows, importable, newRows, existingRows, needsSeason } = flow;
  const shown = visibleRows.slice(0, shownCount);
  return (
    <View className="flex-col gap-4">
      {header}
      <Card>
        <CardContent className="pt-6">
          <View className="flex-col gap-3">
            <Text className="text-sm text-muted-foreground">
              {`${preview.counts.total} rows · ${preview.counts.new} new · ${preview.counts.exists} already here · ${preview.counts.duplicate} repeated · ${preview.counts.invalid} invalid`}
            </Text>
            {preview.counts.previously_removed > 0 ? (
              <Text className="text-xs text-muted-foreground">
                {`${preview.counts.previously_removed} previously removed — restore those from the users screen.`}
              </Text>
            ) : null}
            <Text className="text-xs text-muted-foreground">
              {`Read as ${preview.delimiter === "tab" ? "tab" : "comma"}-separated · columns: ${preview.detectedColumns.join(", ")}`}
            </Text>
            {preview.unrecognisedColumns.length > 0 ? (
              <View className="rounded-md bg-warning-50 px-3 py-2 dark:bg-warning-950">
                {/* D-16.12: v1 never says what it FAILED to detect, which is the half that matters. */}
                <Text className="text-sm font-medium text-warning-800 dark:text-warning-200">
                  {`${preview.unrecognisedColumns.length} column(s) not recognised`}
                </Text>
                <Text className="text-xs text-warning-700 dark:text-warning-300">
                  {`${preview.unrecognisedColumns.map((c) => `"${c}"`).join(", ")} — these were ignored.`}
                </Text>
              </View>
            ) : null}
            <View className="flex-row gap-2">
              <Button
                size="sm"
                variant={filter === "attention" ? "default" : "outline"}
                onPress={() => flow.setFilter("attention")}
              >
                Needs attention
              </Button>
              <Button
                size="sm"
                variant={filter === "all" ? "default" : "outline"}
                onPress={() => flow.setFilter("all")}
              >
                All
              </Button>
            </View>
            {shown.length === 0 ? (
              <EmptyState title="Nothing to show" description="No rows match this filter." />
            ) : (
              <DataTable columns={COLUMNS} rows={shown} rowKey={(r) => r.rowNumber} />
            )}
            {visibleRows.length > shownCount ? (
              <Button variant="outline" onPress={flow.showMore}>
                {`Show more (${visibleRows.length - shownCount} left)`}
              </Button>
            ) : null}
            {flow.mode === "season" ? (
              <View className="flex-col gap-2">
                <Button
                  variant={flow.enrolExisting ? "default" : "outline"}
                  onPress={flow.toggleEnrolExisting}
                >
                  Also enrol people already in the system
                </Button>
                {flow.enrolExisting && !flow.enrolConfirmed ? (
                  <View className="flex-col gap-2">
                    {/* D-16.7: `enroll` changes existing records, so it is never armed by the toggle alone. */}
                    <Text className="text-xs text-muted-foreground">
                      {`This will also enrol ${preview.counts.exists} existing student(s) into this season. Their names, notes and other details will not be changed.`}
                    </Text>
                    <Button onPress={flow.confirmEnrol}>Yes, enrol them too</Button>
                  </View>
                ) : null}
              </View>
            ) : null}
            <FormErrorBox message={flow.localError} />
            <Button
              disabled={needsSeason || importable.length === 0 || flow.commitPending}
              onPress={flow.runCommit}
            >
              {needsSeason
                ? "Choose a season before importing"
                : importable.length === 0
                  ? "Nothing to import"
                  : `Import ${newRows.length} student${newRows.length === 1 ? "" : "s"}${
                      existingRows.length > 0 ? `, enrol ${existingRows.length}` : ""
                    }`}
            </Button>
            <Button variant="outline" onPress={() => flow.setStep("paste")}>
              Back
            </Button>
          </View>
        </CardContent>
      </Card>
    </View>
  );
}
