import { useState } from "react";
import { Pressable, View } from "react-native";
import {
  quizQuestionRequestSchema,
  type QuizQuestionAuthoring,
  type QuizQuestionInput,
  type QuizQuestionType,
} from "@space/shared";

import { useTheme } from "../theme";
import { Button, Input, Text } from "../ui";

export interface QuestionEditorProps {
  /** Present when editing; absent when adding. */
  initial?: QuizQuestionAuthoring;
  submitting: boolean;
  /** A server error from the caller's mutation, shown under the form. */
  serverError: string | null;
  onSubmit: (body: QuizQuestionInput) => void;
  onCancel: () => void;
}

const MAX_OPTIONS = 6; // quizQuestionRequestSchema: options .max(6)

/**
 * One form for add and edit (v1 quiz-builder.tsx's QuestionForm). Validated
 * with the SAME shared schema the server parses, so the messages a phone shows
 * ("Add at least 2 options.", "Mark the correct answer.") are the server's own
 * refinements, not a hand-copied second set.
 */
export function QuestionEditor({ initial, submitting, serverError, onSubmit, onCancel }: QuestionEditorProps) {
  const theme = useTheme();
  const [type, setType] = useState<QuizQuestionType>(initial?.type ?? "MCQ");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [points, setPoints] = useState(initial ? String(initial.points) : "1");
  const [options, setOptions] = useState<string[]>(
    initial && initial.type === "MCQ" ? initial.options : ["", ""],
  );
  const [correctIndex, setCorrectIndex] = useState<number | null>(initial?.correctIndex ?? null);
  const [localError, setLocalError] = useState<string | null>(null);

  const removeOption = (index: number) => {
    setOptions((prev) => prev.filter((_, i) => i !== index));
    setCorrectIndex((prev) => (prev === null || prev === index ? null : prev > index ? prev - 1 : prev));
  };

  const submit = () => {
    const body: QuizQuestionInput =
      type === "ESSAY"
        ? { type, prompt, points: Number(points) }
        : { type, prompt, points: Number(points), options, correctIndex };
    const parsed = quizQuestionRequestSchema.safeParse(body);
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? "Check the question.");
      return;
    }
    setLocalError(null);
    onSubmit(body);
  };

  const error = localError ?? serverError;

  return (
    <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
      <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
        <Button
          title="Multiple choice"
          variant={type === "MCQ" ? "primary" : "secondary"}
          onPress={() => setType("MCQ")}
        />
        <Button
          title="Essay"
          variant={type === "ESSAY" ? "primary" : "secondary"}
          onPress={() => setType("ESSAY")}
        />
      </View>
      <Input label="Question prompt" value={prompt} onChangeText={setPrompt} multiline />
      <Input label="Points" value={points} onChangeText={setPoints} keyboardType="number-pad" />
      {type === "MCQ" ? (
        <>
          {options.map((option, index) => (
            <View key={index} style={{ gap: theme.spacing.xs }}>
              <Input
                label={`Option ${index + 1}`}
                value={option}
                onChangeText={(value) =>
                  setOptions((prev) => prev.map((o, i) => (i === index ? value : o)))
                }
              />
              <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityLabel={`Mark option ${index + 1} correct`}
                  accessibilityState={{ selected: correctIndex === index }}
                  onPress={() => setCorrectIndex(index)}
                >
                  <Text variant="label">{correctIndex === index ? "✓ Correct answer" : "Mark correct"}</Text>
                </Pressable>
                {options.length > 2 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove option ${index + 1}`}
                    onPress={() => removeOption(index)}
                  >
                    <Text variant="label" color={theme.colors.error[500]}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
          {options.length < MAX_OPTIONS ? (
            <Button title="Add option" variant="ghost" onPress={() => setOptions((prev) => [...prev, ""])} />
          ) : null}
        </>
      ) : null}
      {error ? <Text variant="label" color={theme.colors.error[500]}>{error}</Text> : null}
      <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
        <Button title="Save question" onPress={submit} loading={submitting} />
        <Button title="Cancel" variant="ghost" onPress={onCancel} />
      </View>
    </View>
  );
}
