/**
 * The End review's first part (season passing, spec 2026-11-12 "Ending the season"): the criteria
 * the scores below are computed with, pre-filled from the season and changed here for this End in
 * the passing outlook's `CriteriaSheet`. End stores what it ends with. A season with nothing at all
 * to count has no scores, so there is nothing to change.
 */
import type { PassCriteria, PassingNumberKey } from "@space/shared";
import { View } from "react-native";

import { Button, Text } from "../../design/ui";
import { WEIGHT_KEYS } from "../season-passing/criteria-model";
import { NUMBER_LABELS } from "../season-passing/outlook-model";

const NOTHING = "Nothing to count this season, so nobody has a score. Everyone starts as Passed.";

/** What the criteria line can't say: they are only suggested, or a weight moved off an empty number. */
function criteriaNotes(p: { isDefault: boolean; changed: boolean; ignored: PassingNumberKey[] }): string[] {
  const notes: string[] = [];
  if (p.changed) notes.push("Changed for this End. The season keeps them once it ends.");
  else if (p.isDefault) notes.push("Suggested criteria: nobody has saved criteria for this season yet.");
  if (!p.changed) {
    for (const key of p.ignored) {
      notes.push(`${NUMBER_LABELS[key]} has nothing to count this season, so its weight moved to the others.`);
    }
  }
  return notes;
}

export function CriteriaStep({
  criteria,
  isDefault,
  changed,
  ignored,
  anything,
  onChange,
}: {
  criteria: PassCriteria;
  isDefault: boolean;
  /** The admin changed them here. */
  changed: boolean;
  /** Numbers the season's own criteria weight but the season has nothing for. */
  ignored: PassingNumberKey[];
  /** The season has a session, an assignment or a quiz. */
  anything: boolean;
  onChange: () => void;
}) {
  return (
    <View className="flex-col gap-2 rounded-group bg-surface p-4">
      <Text variant="headline" accessibilityRole="header">
        Pass criteria
      </Text>
      {WEIGHT_KEYS.map((key) => (
        <Text key={key} variant="body">{`${NUMBER_LABELS[key]} ${criteria.weights[key]}%`}</Text>
      ))}
      <Text variant="body">{`Pass mark ${criteria.passMark}`}</Text>
      {(anything ? criteriaNotes({ isDefault, changed, ignored }) : [NOTHING]).map((note) => (
        <Text key={note} variant="caption" className="text-muted-foreground">
          {note}
        </Text>
      ))}
      {anything ? (
        <Button variant="secondary" size="sm" className="mt-1 self-start" onPress={onChange}>
          Change criteria
        </Button>
      ) : null}
    </View>
  );
}
