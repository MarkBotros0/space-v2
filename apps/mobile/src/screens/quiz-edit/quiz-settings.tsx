import { View } from "react-native";
import { Pressable } from "../../design/ui/pressable";
import type { QuizKind } from "@space/shared";

import { FormField, Input, Switch, Text } from "../../design/ui";

/**
 * V2-ONLY (v1's builder had no settings block): rename; for paper, the max score; for online, whether
 * each attempt shuffles the question order. Saved from its sheet (QuizDetailsSheet).
 */
export function QuizSettings({
  kind,
  title,
  maxScore,
  locked,
  shuffle,
  shuffleLocked,
  errors,
  onTitle,
  onMaxScore,
  onShuffle,
}: {
  kind: QuizKind;
  title: string;
  maxScore: string;
  /** Grades exist: the server refuses a new max score (quiz_has_grades). */
  locked: boolean;
  /** Online only: each attempt gets its own question order. */
  shuffle: boolean;
  /** Attempts exist: the server refuses the change (quiz_has_attempts). */
  shuffleLocked: boolean;
  errors: Record<string, string>;
  onTitle: (v: string) => void;
  onMaxScore: (v: string) => void;
  onShuffle: (on: boolean) => void;
}) {
  return (
    <View className="flex-col gap-4">
      <FormField label="Quiz title" required error={errors.title}>
        <Input accessibilityLabel="Quiz title" value={title} onChangeText={onTitle} />
      </FormField>
      {kind === "PAPER" ? (
        // Refused server-side once grades exist (quiz_has_grades).
        <FormField
          label="Max score"
          description={locked ? "Max score is locked because grades have been entered." : undefined}
          error={errors.maxScore}
        >
          <Input
            accessibilityLabel="Max score"
            value={maxScore}
            onChangeText={onMaxScore}
            disabled={locked}
            keyboardType="number-pad"
          />
        </FormField>
      ) : (
        // The whole row is the switch, so the target is the row (44pt or taller), not the 24pt track.
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Shuffle questions"
          accessibilityState={{ checked: shuffle, disabled: shuffleLocked }}
          disabled={shuffleLocked}
          onPress={() => onShuffle(!shuffle)}
          className="min-h-11 flex-row items-center justify-between gap-3"
        >
          <View className="min-w-0 flex-1 flex-col gap-0.5">
            <Text variant="subhead" className="font-medium">
              Shuffle questions
            </Text>
            <Text variant="caption" className="text-muted-foreground">
              {shuffleLocked
                ? "Students have started this quiz, so its question order can no longer change."
                : "Each student gets the questions in their own order. Turn off when questions build on each other."}
            </Text>
          </View>
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Switch checked={shuffle} disabled={shuffleLocked} />
          </View>
        </Pressable>
      )}
    </View>
  );
}
