import { useState } from "react";
import { Pressable, View } from "react-native";
import {
  quizQuestionRequestSchema,
  type QuizQuestionAuthoring,
  type QuizQuestionInput,
  type QuizQuestionType,
} from "@space/shared";

import { Check, Plus, Trash2 } from "lucide-react-native";

import { cn } from "../design/lib/cn";
import { iconWithClassName } from "../design/lib/icon";
import { Button, Input, Text, Textarea } from "../design/ui";

iconWithClassName(Check, Plus, Trash2);

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
export function QuestionEditor({
  initial,
  submitting,
  serverError,
  onSubmit,
  onCancel,
}: QuestionEditorProps) {
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
    setCorrectIndex((prev) =>
      prev === null || prev === index ? null : prev > index ? prev - 1 : prev,
    );
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
    // v1 quiz-builder.tsx QuestionForm: `rounded-xl border border-brand-teal-600/40 bg-card p-4`.
    <View className="flex-col gap-3 rounded-xl border border-brand-teal-600/40 bg-card p-4">
      <View className="flex-row flex-wrap items-center gap-2">
        {(["MCQ", "ESSAY"] as const).map((t) => (
          <Pressable
            key={t}
            accessibilityRole="radio"
            accessibilityLabel={t === "MCQ" ? "Multiple choice" : "Essay"}
            accessibilityState={{ checked: type === t }}
            onPress={() => setType(t)}
            className={cn(
              "rounded-lg border px-3 py-1.5",
              type === t
                ? "border-brand-teal-600 bg-brand-teal-600/10"
                : "border-border active:border-brand-teal-500",
            )}
          >
            <Text
              className={cn(
                "text-xs font-bold",
                type === t
                  ? "text-brand-teal-700 dark:text-brand-teal-300"
                  : "text-muted-foreground",
              )}
            >
              {t === "MCQ" ? "Multiple choice" : "Essay"}
            </Text>
          </Pressable>
        ))}
        <View className="ml-auto flex-row items-center gap-1">
          <Text className="text-xs font-semibold text-muted-foreground">Points</Text>
          <Input
            accessibilityLabel="Points"
            value={points}
            onChangeText={setPoints}
            keyboardType="number-pad"
            className="h-8 w-16"
          />
        </View>
      </View>

      <View className="flex-col gap-1">
        <Text className="text-xs font-semibold text-muted-foreground">Question</Text>
        <Textarea
          accessibilityLabel="Question prompt"
          value={prompt}
          onChangeText={setPrompt}
          placeholder="What is…?"
          className="min-h-16"
        />
      </View>

      {type === "MCQ" ? (
        <View className="flex-col gap-2">
          <Text className="text-xs font-semibold text-muted-foreground">
            Options (tap the circle to mark the correct answer)
          </Text>
          {options.map((option, index) => (
            <View key={index} className="flex-row items-center gap-2">
              <Pressable
                accessibilityRole="radio"
                accessibilityLabel={`Mark option ${index + 1} correct`}
                accessibilityState={{ selected: correctIndex === index }}
                onPress={() => setCorrectIndex(index)}
                className={cn(
                  "size-9 shrink-0 items-center justify-center rounded-full border",
                  correctIndex === index ? "border-success-600 bg-success-600" : "border-border",
                )}
              >
                <Check
                  size={16}
                  className={correctIndex === index ? "text-white" : "text-transparent"}
                />
              </Pressable>
              <Input
                accessibilityLabel={`Option ${index + 1}`}
                value={option}
                onChangeText={(value) =>
                  setOptions((prev) => prev.map((o, i) => (i === index ? value : o)))
                }
                placeholder={`Option ${index + 1}`}
                className="flex-1"
              />
              {options.length > 2 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  accessibilityLabel={`Remove option ${index + 1}`}
                  onPress={() => removeOption(index)}
                >
                  <Trash2 size={16} className="text-muted-foreground" />
                </Button>
              ) : null}
            </View>
          ))}
          {options.length < MAX_OPTIONS ? (
            <Button
              className="self-start"
              variant="ghost"
              size="sm"
              onPress={() => setOptions((prev) => [...prev, ""])}
            >
              <Plus size={16} className="text-foreground" />
              Add option
            </Button>
          ) : null}
        </View>
      ) : null}

      {error ? <Text className="text-xs text-error-600">{error}</Text> : null}

      <View className="flex-row gap-2">
        <Button size="sm" disabled={submitting} onPress={submit}>
          {submitting ? "Saving…" : initial ? "Save" : "Add question"}
        </Button>
        <Button variant="ghost" size="sm" disabled={submitting} onPress={onCancel}>
          Cancel
        </Button>
      </View>
    </View>
  );
}
