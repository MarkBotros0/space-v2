import { useRef, useState } from "react";
import { View } from "react-native";

import { textDirection } from "../../../design/lib/text-direction";
import { ContentText, FieldError, FormField, Input, Label, PillButton, Text, Textarea } from "../../../design/ui";
import { blankContext, insertBlankWithAnswer, syncBlankAnswers } from "./editor-model";

/**
 * Fill in the blank: the sentence with its gaps, and the expected answer for
 * each gap. "Insert blank" puts a gap at the cursor; the answer fields follow
 * the gaps in the sentence, one each. Leaders see the answers while marking;
 * students never do before the answers are released.
 */
export function FillBlankEditor({
  prompt,
  answers,
  errors,
  onChange,
}: {
  prompt: string;
  answers: string[];
  errors: Record<string, string>;
  onChange: (next: { prompt: string; answers: string[] }) => void;
}) {
  // Where the next blank goes; null until the field reports a cursor (then the end).
  const cursor = useRef<number | null>(null);

  const setPrompt = (next: string) => onChange({ prompt: next, answers: syncBlankAnswers(next, answers) });

  // Set once after an insert so the caret sits after the new blank, then released on the next report.
  const [caret, setCaret] = useState<{ start: number; end: number } | undefined>(undefined);

  // Free typing keeps answers by index (syncBlankAnswers); an insert puts the new answer at its gap.
  const addBlank = () => {
    const at = insertBlankWithAnswer(prompt, cursor.current ?? prompt.length, answers);
    cursor.current = at.cursor;
    setCaret({ start: at.cursor, end: at.cursor });
    onChange({ prompt: at.prompt, answers: at.answers });
  };

  return (
    <View className="flex-col gap-3">
      <FormField
        label="Question"
        description="Write the sentence, then tap Insert blank where each gap goes."
        error={errors.prompt}
      >
        <Textarea
          accessibilityLabel="Question prompt"
          value={prompt}
          onChangeText={setPrompt}
          selection={caret}
          onSelectionChange={(e) => {
            cursor.current = e.nativeEvent.selection.end;
            setCaret(undefined);
          }}
          placeholder="In the {{blank}} was the Word."
          direction={textDirection(prompt)}
          className="min-h-16"
        />
      </FormField>
      <PillButton label="Insert blank" onPress={addBlank} className="self-start" />

      <View className="flex-col gap-2">
        <Label>Answers</Label>
        {answers.length === 0 ? (
          <Text variant="caption" className="text-muted-foreground">
            No blanks yet.
          </Text>
        ) : (
          <Text variant="caption" className="text-muted-foreground">
            Leaders see these while marking.
          </Text>
        )}
        {answers.map((answer, index) => {
          const n = index + 1;
          const error = errors[`answers.${index}`];
          return (
            <View key={index} className="flex-col gap-1">
              {/* The words before the gap, so a shifted answer after free typing is visible. */}
              <ContentText variant="caption" className="font-semibold text-muted-foreground">
                {`Blank ${n}, ${blankContext(prompt, index)}`}
              </ContentText>
              <Input
                accessibilityLabel={`Answer for blank ${n}`}
                value={answer}
                onChangeText={(v) => onChange({ prompt, answers: answers.map((a, i) => (i === index ? v : a)) })}
                direction={textDirection(answer)}
                aria-invalid={error !== undefined}
                accessibilityHint={error}
              />
              <FieldError>{error}</FieldError>
            </View>
          );
        })}
        <FieldError>{errors.answers}</FieldError>
      </View>
    </View>
  );
}
