/** The finished season page: what the season was, how it ended, and the three lists behind it. */
import { useRouter } from "expo-router";
import { View } from "react-native";
import { seasonOutcomeLabel, type SeasonOutcome, type SeasonRecord } from "@space/shared";

import { GroupedList, ListRow, StatusChip, Text } from "../../design/ui";
import type { ChipSpec } from "../../design/ui";
import { countOf } from "../../lib/plural";
import { formatSeasonDay } from "../../lib/format";

/** Passed reads as good news; every other ending is stated, never coloured as a failure. */
export function outcomeChip(outcome: SeasonOutcome, suffix?: string): ChipSpec {
  const label = seasonOutcomeLabel(outcome);
  return { tone: outcome === "PASSED" ? "ok" : "neutral", label: suffix ? `${label} - ${suffix}` : label };
}

export function SeasonOverview({ record }: { record: SeasonRecord }) {
  const router = useRouter();
  const params = { seasonId: String(record.season.id) };
  return (
    <View className="gap-4">
      <View className="gap-2 rounded-group bg-surface p-4">
        <Text variant="subhead" className="text-muted-foreground">
          {`${formatSeasonDay(record.season.startDate)} – ${formatSeasonDay(record.season.endDate)}`}
        </Text>
        <View className="flex-row flex-wrap gap-1.5">
          <StatusChip tone="neutral" label="Finished" />
          <StatusChip {...outcomeChip(record.outcome, `${record.attendancePct}% attendance`)} />
        </View>
        {record.groupName ? <Text variant="body">{`Group: ${record.groupName}`}</Text> : null}
      </View>
      <GroupedList>
        <ListRow
          index={0}
          title={`Assignments (${record.assignments.length})`}
          chevron
          onPress={() => router.push({ pathname: "/past-season/[seasonId]/assignments", params })}
        />
        <ListRow
          index={1}
          title={`Quizzes (${record.quizzes.length})`}
          chevron
          onPress={() => router.push({ pathname: "/past-season/[seasonId]/quizzes", params })}
        />
        <ListRow
          index={2}
          title={`Attendance (${countOf(record.attendance.length, "session")})`}
          chevron
          onPress={() => router.push({ pathname: "/past-season/[seasonId]/attendance", params })}
        />
      </GroupedList>
    </View>
  );
}
