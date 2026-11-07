import { View } from "react-native";
import type { QuizKind } from "@space/shared";

import { FormField, Input } from "../../design/ui";

/** V2-ONLY (v1's builder had no settings block): rename and, for paper, the max score. Saved from its sheet (QuizDetailsSheet). */
export function QuizSettings({
  kind,
  title,
  maxScore,
  locked,
  errors,
  onTitle,
  onMaxScore,
}: {
  kind: QuizKind;
  title: string;
  maxScore: string;
  /** Grades exist: the server refuses a new max score (quiz_has_grades). */
  locked: boolean;
  errors: Record<string, string>;
  onTitle: (v: string) => void;
  onMaxScore: (v: string) => void;
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
      ) : null}
    </View>
  );
}
