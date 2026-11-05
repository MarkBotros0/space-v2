import type { UseQueryResult } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { View } from "react-native";
import type { DashboardDueItem, StudentQuizResult } from "@space/shared";

import { InlineError } from "../../design/layout/route-states";
import { GroupedList, ListRow, Skeleton, StatusChip, Text } from "../../design/ui";
import { WORK_HREF, todayWork, type WorkRow } from "../work/work-model";

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

/**
 * "What do I do now": overdue, returned, due this week, open quizzes (P2-5),
 * uncapped. It never says "caught up" until the quiz list has answered: while
 * that loads a placeholder holds the row, and if it fails the failure is shown.
 */
export function OpenWorkList({
  open,
  quizzes,
  todayOrgDay,
}: {
  open: DashboardDueItem[];
  quizzes: UseQueryResult<StudentQuizResult[]>;
  todayOrgDay: string;
}) {
  const router = useRouter();
  const rows = todayWork(open, quizzes.data ?? [], todayOrgDay);

  let empty = null;
  if (rows.length === 0) {
    if (quizzes.isPending) {
      empty = (
        <View accessible accessibilityLabel="Loading" className="p-4">
          <Skeleton className="h-5" />
        </View>
      );
    } else if (open.length > 0 || quizzes.isError) {
      empty = <ListRow title="Nothing due this week." />;
    } else {
      empty = <ListRow title="You're all caught up." />;
    }
  }

  return (
    <View className="gap-2">
      <GroupedList
        header="To do"
        headerAction={{ label: "See all", onPress: () => router.push(WORK_HREF) }}
      >
        {empty ??
          rows.map((row, i) => {
            const href = row.href;
            return (
              <ListRow
                key={row.key}
                index={i}
                title={row.title}
                subtitle={row.subtitle}
                titleLines={2}
                trailing={trailing(row)}
                chevron={href !== null}
                onPress={href !== null ? () => router.push(href) : undefined}
              />
            );
          })}
      </GroupedList>
      {quizzes.isError ? (
        <InlineError message="Couldn't load your quizzes." onRetry={() => void quizzes.refetch()} />
      ) : null}
    </View>
  );
}
