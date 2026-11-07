import { useRouter } from "expo-router";
import { View } from "react-native";

import { InlineError } from "../../design/layout/route-states";
import { GroupedList, Text } from "../../design/ui";
import { useStudentAssignments } from "../../hooks/use-assignments";
import { useStudentQuizList } from "../../hooks/use-quizzes";
import { latestSubmitted, WORK_HREF } from "../work/work-model";
import { WorkListRow, WorkLoadingRow } from "../work/work-row";

/**
 * The season page's submissions (owner, 2026-11-07): the last assignment handed
 * in and the last quiz taken, with their grading, and See all for the rest on
 * My work. The same reads as My work, so the two never disagree.
 */
export function SubmissionsSection({ seasonId }: { seasonId: number }) {
  const router = useRouter();
  const assignments = useStudentAssignments(seasonId);
  const quizzes = useStudentQuizList(seasonId);
  const seeAll = { label: "See all", onPress: () => router.push(WORK_HREF) };

  if (assignments.isError || quizzes.isError) {
    return (
      <InlineError
        message="Couldn't load your submissions."
        onRetry={() => {
          void assignments.refetch();
          void quizzes.refetch();
        }}
      />
    );
  }
  if (assignments.isPending || quizzes.isPending) {
    return (
      <GroupedList header="Your submissions" headerAction={seeAll}>
        <WorkLoadingRow />
      </GroupedList>
    );
  }
  const latest = latestSubmitted(assignments.data, quizzes.data);
  const rows = [latest.assignment, latest.quiz].filter((r) => r !== null);
  return (
    <GroupedList header="Your submissions" headerAction={seeAll}>
      {rows.length === 0 ? (
        <View className="min-h-[52px] justify-center px-4 py-3">
          <Text variant="subhead" className="text-muted-foreground">
            Nothing handed in yet.
          </Text>
        </View>
      ) : (
        rows.map((row) => <WorkListRow key={row.key} row={row} />)
      )}
    </GroupedList>
  );
}
