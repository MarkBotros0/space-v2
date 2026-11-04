import { useState } from "react";
import { View, type TextInputProps } from "react-native";
import {
  formatTimestamp,
  parseTimestamp,
  videoQuestionInputSchema,
  type VideoQuestionAdmin,
} from "@space/shared";

import {
  useVideoQuestions,
  useVideoQuestionWrites,
  useVideoQuizResults,
} from "../hooks/use-video-quiz";
import { FormErrorBox } from "../design/forms/form-parts";
import { InlineError } from "../design/layout/route-states";
import { Button } from "../design/ui/button";
import { Card } from "../design/ui/card";
import { FormField } from "../design/ui/form-field";
import { Input } from "../design/ui/input";
import { Skeleton } from "../design/ui/skeleton";
import { Text } from "../design/ui/text";
import { apiErrorMessage } from "../lib/api-error";
import { ChoiceChips } from "./ChoiceChips";

const MAX_OPTIONS = 6;
const TIMESTAMP_HINT = "Use m:ss or h:mm:ss (for example 2:30).";

interface FormState {
  /** Null while adding. */
  editingId: number | null;
  timestamp: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  points: string;
}

const EMPTY_FORM: FormState = {
  editingId: null,
  timestamp: "",
  prompt: "",
  options: ["", ""],
  correctIndex: 0,
  points: "1",
};

/** A labelled text field; the label doubles as the input's accessibility label. */
function LabelledInput({
  label,
  error,
  ...props
}: Omit<TextInputProps, "accessibilityLabel"> & { label: string; error?: string }) {
  return (
    <FormField label={label} error={error}>
      <Input accessibilityLabel={label} {...props} />
    </FormField>
  );
}

/**
 * Results for a session's video quiz: a table nobody had in v1. Rendered for
 * authors (inside the editor) and for a LEADER on their own (the server narrows
 * a leader to their groups).
 */
export function VideoQuizResultsTable({ sessionId }: { sessionId: number }) {
  const results = useVideoQuizResults(sessionId, true);
  return (
    <Card className="flex-col gap-2 p-4">
      <Text className="text-lg font-semibold">Results</Text>
      {results.isPending ? (
        <View accessible accessibilityLabel="Loading">
          <Skeleton className="h-16" />
        </View>
      ) : results.isError ? (
        <InlineError message="Couldn't load the results." onRetry={() => void results.refetch()} />
      ) : results.data.rows.length === 0 ? (
        <Text className="text-muted-foreground">No students to show yet.</Text>
      ) : (
        results.data.rows.map((row) => (
          <View key={row.studentUserId} className="flex-row justify-between gap-2">
            <Text className="min-w-0 flex-1">{row.studentName ?? `Student ${row.studentUserId}`}</Text>
            <Text className="shrink-0 text-sm font-medium">{`${row.answeredCount} / ${row.questionCount}`}</Text>
            <Text className="shrink-0 text-sm font-medium">{`${row.earnedPoints} / ${row.totalPoints} pts`}</Text>
            <Text
              className="shrink-0 text-sm font-medium"
              accessibilityLabel={row.completedAt ? "Completed" : "Not completed"}
            >
              {row.completedAt ? "✓" : "–"}
            </Text>
          </View>
        ))
      )}
    </Card>
  );
}

export function VideoQuestionsEditor({ sessionId }: { sessionId: number }) {
  const questions = useVideoQuestions(sessionId, true);
  const { create, update, remove } = useVideoQuestionWrites(sessionId);

  const [form, setForm] = useState<FormState | null>(null);
  const [timestampError, setTimestampError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [armedDelete, setArmedDelete] = useState<number | null>(null);

  const patch = (changes: Partial<FormState>): void =>
    setForm((f) => (f === null ? f : { ...f, ...changes }));

  const openAdd = (): void => {
    setStatus(null);
    setFormError(null);
    setTimestampError(undefined);
    setForm(EMPTY_FORM);
  };

  const openEdit = (q: VideoQuestionAdmin): void => {
    setStatus(null);
    setFormError(null);
    setTimestampError(undefined);
    setForm({
      editingId: q.id,
      timestamp: formatTimestamp(q.atSeconds),
      prompt: q.prompt,
      options: [...q.options],
      correctIndex: q.correctIndex,
      points: String(q.points),
    });
  };

  const onSave = (): void => {
    if (form === null) return;
    setFormError(null);
    // Parsed where the input is: v1 sent the raw string, the server rejected it
    // with a generic message and the editor discarded the field errors (R28).
    const atSeconds = parseTimestamp(form.timestamp);
    if (atSeconds === null) {
      setTimestampError(TIMESTAMP_HINT);
      return;
    }
    setTimestampError(undefined);

    const parsed = videoQuestionInputSchema.safeParse({
      atSeconds,
      prompt: form.prompt,
      options: form.options,
      correctIndex: form.correctIndex,
      points: Number(form.points),
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Check the question and try again.");
      return;
    }

    if (form.editingId === null) {
      create.mutate(parsed.data, {
        onSuccess: () => {
          setForm(null);
          setStatus("Question added.");
        },
        onError: (err) => setFormError(apiErrorMessage(err, "Couldn't save the question.")),
      });
      return;
    }
    update.mutate(
      { questionId: form.editingId, input: parsed.data },
      {
        onSuccess: (res) => {
          setForm(null);
          const lines: string[] = [];
          if (res.regradedCount > 0) {
            lines.push(`${res.regradedCount} recorded answers were re-graded.`);
          }
          if (res.pointsChanged) {
            lines.push("Points changed — every student's score for this question moved.");
          }
          setStatus(lines.length > 0 ? lines.join(" ") : "Question updated.");
        },
        onError: (err) => setFormError(apiErrorMessage(err, "Couldn't save the question.")),
      },
    );
  };

  const onDelete = (q: VideoQuestionAdmin): void => {
    // RN has no window.confirm: two presses, the second naming the real count.
    if (armedDelete !== q.id) {
      setArmedDelete(q.id);
      return;
    }
    setArmedDelete(null);
    remove.mutate(q.id, {
      onSuccess: (res) => setStatus(`${res.responsesRemoved} recorded answers were removed.`),
      onError: (err) => setStatus(apiErrorMessage(err, "Couldn't delete the question.")),
    });
  };

  return (
    <View className="mt-4 flex-col gap-4">
      <Text className="text-lg font-semibold">Video questions</Text>
      {questions.isPending ? (
        <View accessible accessibilityLabel="Loading">
          <Skeleton className="h-24 rounded-2xl" />
        </View>
      ) : questions.isError ? (
        <InlineError message="Couldn't load the questions." onRetry={() => void questions.refetch()} />
      ) : (
        <>
          {questions.data.length === 0 ? (
            <Text className="text-muted-foreground">No questions yet.</Text>
          ) : (
            questions.data.map((q) => (
              <Card key={q.id} className="flex-col gap-1 p-4">
                <Text className="text-sm font-medium">{formatTimestamp(q.atSeconds)}</Text>
                <Text>{q.prompt}</Text>
                <Text className="text-xs text-muted-foreground">
                  {`Correct answer: ${q.options[q.correctIndex] ?? ""}`}
                </Text>
                <Text className="text-xs text-muted-foreground">{`${q.responseCount} answers recorded`}</Text>
                <View className="flex-row flex-wrap gap-2">
                  <Button variant="outline" onPress={() => openEdit(q)}>
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={remove.isPending && remove.variables === q.id}
                    onPress={() => onDelete(q)}
                  >
                    {armedDelete === q.id ? `Delete ${q.responseCount} answers?` : "Delete"}
                  </Button>
                </View>
              </Card>
            ))
          )}
          {status ? <Text className="text-sm font-medium">{status}</Text> : null}

          {form === null ? (
            <Button variant="secondary" size="lg" onPress={openAdd}>
              Add question
            </Button>
          ) : (
            <Card className="flex-col gap-2 p-4">
              <LabelledInput
                label="Timestamp"
                value={form.timestamp}
                onChangeText={(v) => patch({ timestamp: v })}
                error={timestampError}
                placeholder="2:30"
                autoCapitalize="none"
              />
              <LabelledInput label="Question" value={form.prompt} onChangeText={(v) => patch({ prompt: v })} />
              {form.options.map((option, index) => (
                <LabelledInput
                  key={index}
                  label={`Option ${index + 1}`}
                  value={option}
                  onChangeText={(v) => patch({ options: form.options.map((o, i) => (i === index ? v : o)) })}
                />
              ))}
              {form.options.length < MAX_OPTIONS ? (
                <Button
                  variant="outline"
                  className="self-start"
                  onPress={() => patch({ options: [...form.options, ""] })}
                >
                  Add option
                </Button>
              ) : null}
              <ChoiceChips
                label="Correct answer"
                options={form.options.map((_, i) => ({ value: i, label: `Answer ${i + 1}` }))}
                value={form.correctIndex}
                onChange={(v) => patch({ correctIndex: v })}
              />
              <LabelledInput
                label="Points"
                value={form.points}
                onChangeText={(v) => patch({ points: v })}
                keyboardType="number-pad"
              />
              <FormErrorBox message={formError} />
              <View className="flex-col gap-2">
                <Button size="lg" disabled={create.isPending || update.isPending} onPress={onSave}>
                  {create.isPending || update.isPending ? "Saving…" : "Save question"}
                </Button>
                <Button size="lg" variant="outline" onPress={() => setForm(null)}>
                  Cancel
                </Button>
              </View>
            </Card>
          )}
        </>
      )}
      <VideoQuizResultsTable sessionId={sessionId} />
    </View>
  );
}
