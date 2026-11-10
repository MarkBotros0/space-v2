import { CheckCircle2 } from "lucide-react-native";
import { View } from "react-native";
import type { GroupImportPreview, GroupImportResult } from "@space/shared";

import { iconWithClassName } from "../../design/lib/icon";
import { Button, Text } from "../../design/ui";

iconWithClassName(CheckCircle2);

/** What the apply did: the server's counts, and each row it skipped (no active enrolment). */
export function GroupImportResultStep({
  preview,
  result,
  onImportAnother,
}: {
  preview: GroupImportPreview;
  result: GroupImportResult;
  onImportAnother: () => void;
}) {
  const skipped = new Set(result.skippedStudentIds);
  const skippedRows = preview.rows.filter((r) => r.studentUserId !== null && skipped.has(r.studentUserId));
  return (
    <View className="flex-col gap-4">
      <View className="flex-row items-start gap-3 rounded-control bg-ok-soft px-4 py-3">
        <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-success-600" />
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-success-800 dark:text-success-200">Assignments applied</Text>
          {/* The APPLIED count from the server (spec R80/D5), never the request. */}
          <Text className="text-sm text-success-700 dark:text-success-300">
            {`${result.assigned} assigned · ${result.skipped} skipped`}
          </Text>
        </View>
      </View>
      {skippedRows.map((r) => (
        <View key={r.rowNumber} className="rounded-group bg-surface p-3 dark:border dark:border-separator">
          <Text className="text-sm font-medium">{`Row ${r.rowNumber} · ${r.email}`}</Text>
          <Text className="text-xs text-muted-foreground">Not placed — no active enrolment in this season.</Text>
        </View>
      ))}
      <Button variant="secondary" className="self-end" onPress={onImportAnother}>
        Import another file
      </Button>
    </View>
  );
}
