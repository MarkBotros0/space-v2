import { View } from "react-native";

import { Label } from "../../../design/ui";
import { ChoiceRow } from "../../quiz-detail/questions/choice-row";

/** True or false: which one is right. Students always see True first (never shuffled). */
export function TrueFalseEditor({ correct, onChange }: { correct: boolean; onChange: (correct: boolean) => void }) {
  return (
    <View className="flex-col gap-2" accessibilityRole="radiogroup" accessibilityLabel="Correct answer">
      <Label>Correct answer</Label>
      {[true, false].map((value) => (
        <ChoiceRow
          key={String(value)}
          role="radio"
          label={value ? "True" : "False"}
          accessibilityLabel={value ? "True" : "False"}
          checked={correct === value}
          onPress={() => onChange(value)}
        />
      ))}
    </View>
  );
}
