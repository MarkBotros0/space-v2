import { View } from "react-native";
import { classLabel, type PassCriteria, type SeasonEndCheck } from "@space/shared";

import { Button, GroupedList, ListRow, StatusChip, Text } from "../../design/ui";
import { reviewRowView, type ScoredRow, type Selection } from "./end-review-model";

type Row = SeasonEndCheck["students"][number];

/**
 * Every student with the result the season will end with, their score and their three numbers.
 * A student whose score reaches the pass mark starts as Passed, one below it as Did not pass (no
 * score: Passed); "Select all on track" and "Clear" change many at once and a tap opens one. The
 * result is said in words on every row, never by colour alone, and a result chosen against the
 * score says so.
 */
export function ReviewList({
  students,
  rows,
  selection,
  criteria,
  graduating,
  year,
  onOpen,
  onSelectOnTrack,
  onClear,
}: {
  students: Row[];
  /** Each student's score under the criteria shown. */
  rows: ScoredRow[];
  selection: Selection;
  criteria: PassCriteria;
  /** This season's pass makes them alumni: staff of any kind should know before End. */
  graduating: boolean;
  /** The season's own year: passing puts them in this year's class (JPCS-YY). */
  year: number | null;
  onOpen: (student: Row) => void;
  onSelectOnTrack: () => void;
  onClear: () => void;
}) {
  const scored = new Map(rows.map((r) => [r.userId, r]));
  const anyOnTrack = rows.some((r) => r.onTrack === true);
  return (
    <View className="flex-col gap-2">
      <Text variant="headline" accessibilityRole="header">
        Students
      </Text>
      <Text variant="subhead" className="text-muted-foreground">
        A student whose score reaches the pass mark starts as Passed. Tap a student to change their result.
      </Text>
      {graduating ? (
        <Text variant="subhead" className="font-semibold text-foreground">
          {year === null ? "Passing this season graduates them" : `Passing makes them ${classLabel(year)}`}
        </Text>
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        {anyOnTrack ? (
          <Button variant="secondary" size="sm" onPress={onSelectOnTrack}>
            Select all on track
          </Button>
        ) : null}
        <Button variant="secondary" size="sm" onPress={onClear}>
          Clear
        </Button>
      </View>
      <GroupedList>
        {students.map((s) => {
          const row = scored.get(s.userId);
          if (!row) return null;
          const view = reviewRowView(s, row, selection[s.userId] ?? "PASSED", criteria);
          return (
            <ListRow
              key={s.userId}
              title={s.name}
              detail={s.graduationYear === null ? undefined : classLabel(s.graduationYear)}
              subtitle={view.lines.join("\n")}
              subtitleLines={null}
              trailing={<StatusChip tone={view.chip.tone} label={view.chip.label} />}
              trailingLabel={view.chip.label}
              trailingPlacement="below"
              chevron
              onPress={() => onOpen(s)}
            />
          );
        })}
      </GroupedList>
    </View>
  );
}
