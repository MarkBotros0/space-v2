import { View } from "react-native";

import { textDirection } from "../../../design/lib/text-direction";
import { ChoiceRow } from "./choice-row";
import type { QuestionProps } from "./props";

/** Pick one: radios in the order the server sent (shuffled per attempt; true/false never is). */
export function SingleChoice({
  question,
  index,
  answer,
  onChange,
  disabled,
}: QuestionProps<"SINGLE_CHOICE" | "TRUE_FALSE">) {
  const direction = textDirection(question.prompt);
  return (
    <View accessibilityRole="radiogroup" className="flex-col gap-2">
      {question.options.map((option, optionIndex) => (
        <ChoiceRow
          key={option.id}
          direction={direction}
          role="radio"
          label={option.label}
          accessibilityLabel={`Answer ${index + 1} option ${optionIndex + 1}: ${option.label}`}
          checked={answer.optionId === option.id}
          disabled={disabled}
          onPress={() => onChange({ optionId: option.id })}
        />
      ))}
    </View>
  );
}
