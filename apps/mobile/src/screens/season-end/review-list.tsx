import { View } from "react-native";
import type { SeasonEndCheck } from "@space/shared";

import { GroupedList, ListRow, StatusChip, Text } from "../../design/ui";
import { joinMeta } from "../../lib/join-meta";
import type { ResultDraft } from "./result-sheet";

type Row = SeasonEndCheck["students"][number];

/**
 * Every student with the verdict the season will end with. Everyone starts as
 * Passed; a tap opens the sheet to mark one Did not pass. The verdict is said in
 * words on every row, never by colour alone.
 */
export function ReviewList({
  students,
  staged,
  graduating,
  year,
  onOpen,
}: {
  students: Row[];
  /** This season's pass makes them alumni: staff of any kind should know before End. */
  graduating: boolean;
  /** The season's own year: passing makes them School of this year. */
  year: number | null;
  /** Verdicts the staff member changed, by user id. */
  staged: Record<number, ResultDraft>;
  onOpen: (student: Row) => void;
}) {
  return (
    <View className="flex-col gap-2">
      <Text variant="subhead" className="text-muted-foreground">
        Everyone passes unless you say otherwise. Tap a student to mark them as not passed.
      </Text>
      {graduating ? (
        <Text variant="subhead" className="font-semibold text-foreground">
          {year === null ? "Passing this season graduates them" : `Passing makes them School of ${year}`}
        </Text>
      ) : null}
      <GroupedList>
        {students.map((s) => {
          const notPassed = staged[s.userId]?.result === "NOT_PASSED";
          return (
            <ListRow
              key={s.userId}
              title={s.name}
              subtitle={joinMeta([s.groupName, `${s.attendancePct}% attendance`])}
              trailing={<StatusChip tone={notPassed ? "bad" : "ok"} label={notPassed ? "Did not pass" : "Passed"} />}
              trailingLabel={notPassed ? "Did not pass" : "Passed"}
              chevron
              onPress={() => onOpen(s)}
            />
          );
        })}
      </GroupedList>
    </View>
  );
}
