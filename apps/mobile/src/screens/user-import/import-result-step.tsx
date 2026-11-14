import { CheckCircle2 } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import type { StudentImportResult } from "@space/shared";

import { iconWithClassName } from "../../design/lib/icon";
import { Button, Text } from "../../design/ui";

iconWithClassName(CheckCircle2);

/** Step 3: the counts, every row that wasn't created and why, and the way on. */
export function ImportResultStep({
  header,
  result,
  onViewUsers,
  onStartOver,
}: {
  header: ReactNode;
  result: StudentImportResult;
  onViewUsers: () => void;
  onStartOver: () => void;
}) {
  const notCreated = result.rows.filter((r) => r.outcome !== "created");
  return (
    <View className="flex-col gap-4">
      {header}
      <View className="flex-row items-start gap-3 rounded-control bg-ok-soft px-4 py-3">
        <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-success-600" />
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-success-800 dark:text-success-200">Import complete</Text>
          <Text className="text-sm text-success-700 dark:text-success-300">
            {`${result.created} created · ${result.enrolled} enrolled · ${result.skipped} skipped`}
          </Text>
          {/* Spec R55: import sends nothing. Invites go from the Community tab. */}
          <Text className="mt-1 text-sm text-success-700 dark:text-success-300">
            No invites were sent. New accounts can't sign in until they are invited: on the Community tab, the Send
            invites row sends them.
          </Text>
        </View>
      </View>
      <Text className="text-xs text-muted-foreground">
        It is safe to run the same paste again — anyone already in the system is skipped, never duplicated.
      </Text>
      {notCreated.map((r) => (
        <View key={r.rowNumber} className="rounded-group bg-surface p-3 dark:border dark:border-separator">
          <Text className="text-sm font-medium">{`Row ${r.rowNumber} · ${r.email}`}</Text>
          <Text className="text-xs text-muted-foreground">{r.message ?? r.outcome}</Text>
        </View>
      ))}
      <View className="flex-col gap-2">
        <Button onPress={onViewUsers}>View community</Button>
        <Button variant="secondary" onPress={onStartOver}>
          Import another file
        </Button>
      </View>
    </View>
  );
}
