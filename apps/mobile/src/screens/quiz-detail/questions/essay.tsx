import { Textarea } from "../../../design/ui";
import { textDirection } from "../../../design/lib/text-direction";
import { ANSWER_INPUT, type QuestionProps } from "./props";

/** Free text, written in the direction of the question. */
export function Essay({ question, index, answer, onChange, disabled }: QuestionProps<"ESSAY">) {
  return (
    <Textarea
      {...ANSWER_INPUT}
      accessibilityLabel={`Answer ${index + 1}`}
      direction={textDirection(question.prompt)}
      placeholder="Write your answer…"
      value={answer.text}
      disabled={disabled}
      onChangeText={(text) => onChange({ text })}
    />
  );
}
