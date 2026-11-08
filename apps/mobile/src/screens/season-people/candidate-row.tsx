import { memo } from "react";
import { Pressable, View } from "react-native";
import type { PeopleCandidate } from "@space/shared";

import { Button } from "../../design/ui/button";
import { Checkbox } from "../../design/ui/checkbox";
import { Text } from "../../design/ui/text";
import { lastLine, rowLabel, sourceLine } from "./model";
import type { SourceSeason } from "./source";

type Props = {
  person: PeopleCandidate;
  selected: boolean;
  /** The season's admin or a super admin agreed to add them past their block. */
  overridden: boolean;
  /** Ticked on purpose although they didn't pass the chosen season. */
  chosen: boolean;
  /** The season passers are brought in from, for "Did not pass GBV 2025". */
  source: SourceSeason | null;
  onToggle: (id: number) => void;
  onOverride: (person: PeopleCandidate) => void;
};

function Lines({
  person,
  overridden,
  chosen,
  source,
}: {
  person: PeopleCandidate;
  overridden: boolean;
  chosen: boolean;
  source: SourceSeason | null;
}) {
  const last = lastLine(person);
  const fromSource = sourceLine(person, source);
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <Text variant="body" className="font-medium text-foreground">
        {person.name}
      </Text>
      {last ? (
        <Text variant="subhead" className="text-muted-foreground">
          {last}
        </Text>
      ) : null}
      {fromSource ? (
        <Text variant="subhead" className="text-foreground">
          {fromSource}
        </Text>
      ) : null}
      {person.reason ? (
        <Text variant="subhead" className="text-foreground">
          {person.reason}
        </Text>
      ) : null}
      {overridden ? (
        <Text variant="subhead" className="font-medium text-foreground">
          Added with an override
        </Text>
      ) : chosen ? (
        <Text variant="subhead" className="font-medium text-foreground">
          Added by choice
        </Text>
      ) : null}
    </View>
  );
}

const ROW = "min-h-[44px] flex-row items-center gap-3 border-b border-separator bg-surface px-4 py-3";

/**
 * One person. Tickable (available, already passed, in a role on a draft, or
 * overridden): the whole row is the checkbox. Otherwise no tick box: the
 * reason is plain text at full contrast, spoken with the name, and whoever
 * administers the season gets an Override button beside it (not inside the
 * spoken label).
 */
function CandidateRowBase({ person, selected, overridden, chosen, source, onToggle, onOverride }: Props) {
  const label = [rowLabel(person), sourceLine(person, source)].filter(Boolean).join(". ");
  if (person.selectable || overridden) {
    return (
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked: selected }}
        onPress={() => onToggle(person.id)}
        className={ROW}
      >
        {/* Drawn only: the row above is the control, so a screen reader meets one checkbox. */}
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Checkbox checked={selected} onCheckedChange={() => {}} accessibilityLabel={person.name} />
        </View>
        <Lines person={person} overridden={overridden} chosen={chosen && selected} source={source} />
      </Pressable>
    );
  }
  return (
    <View className={ROW}>
      <View accessible accessibilityLabel={label} className="min-w-0 flex-1">
        <Lines person={person} overridden={false} chosen={false} source={source} />
      </View>
      {person.overridable ? (
        <Button
          variant="secondary"
          size="sm"
          accessibilityLabel={`Override ${person.name}`}
          onPress={() => onOverride(person)}
          className="shrink-0"
        >
          Override
        </Button>
      ) : null}
    </View>
  );
}

export const CandidateRow = memo(CandidateRowBase);
