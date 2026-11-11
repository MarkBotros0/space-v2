import { View } from "react-native";

import { Text } from "../../../design/ui";
import { joinMeta } from "../../../lib/join-meta";
import { toggleChoice } from "../answer-model";
import { ChoiceRow } from "./choice-row";
import type { QuestionProps } from "./props";

/** "Choose N": checkboxes; once N are ticked the rest are disabled, not refused afterwards. */
export function MultiChoice({ question, index, answer, onChange, disabled }: QuestionProps<"MULTI_CHOICE">) {
  const picked = answer.optionIds;
  const full = picked.length >= question.choose;
  return (
    <View className="flex-col gap-2">
      <Text variant="caption" className="text-muted-foreground">
        {joinMeta([`Choose ${question.choose}`, `${picked.length} selected`])}
      </Text>
      {question.options.map((option, optionIndex) => {
        const checked = picked.includes(option.id);
        return (
          <ChoiceRow
            key={option.id}
            role="checkbox"
            label={option.label}
            accessibilityLabel={`Answer ${index + 1} option ${optionIndex + 1}: ${option.label}`}
            checked={checked}
            disabled={disabled || (full && !checked)}
            onPress={() => onChange(toggleChoice(answer, option.id, question.choose))}
          />
        );
      })}
    </View>
  );
}
