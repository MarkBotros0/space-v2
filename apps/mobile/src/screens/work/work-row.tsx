import { useRouter } from "expo-router";
import { View } from "react-native";

import { ListRow, Skeleton, StatusChip, Text } from "../../design/ui";
import type { WorkRow } from "./work-model";

function trailing(row: WorkRow) {
  if (row.chip) return <StatusChip {...row.chip} />;
  if (row.score) {
    return (
      <Text variant="headline" tabular>
        {row.score}
      </Text>
    );
  }
  return undefined;
}

/** One row of work, on Today and the Work tab. A row with no `href` is not a button. */
export function WorkListRow({
  row,
  index,
  subtitleLines,
}: {
  row: WorkRow;
  index: number;
  subtitleLines?: number;
}) {
  const router = useRouter();
  const href = row.href;
  return (
    <ListRow
      index={index}
      title={row.title}
      subtitle={row.subtitle}
      titleLines={2}
      subtitleLines={subtitleLines}
      trailing={trailing(row)}
      chevron={href !== null}
      onPress={href !== null ? () => router.push(href) : undefined}
    />
  );
}

/** Holds a list's place while the quiz list loads, so nothing claims "caught up" early. */
export function WorkLoadingRow() {
  return (
    <View accessible accessibilityLabel="Loading" className="p-4">
      <Skeleton className="h-5" />
    </View>
  );
}
