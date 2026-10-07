import { useState } from "react";
import { View } from "react-native";
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
import { apiErrorMessage } from "../lib/api-error";
import { useTheme } from "../theme";
import { Button, Card, ErrorState, Input, LoadingState, Text } from "../ui";
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

/**
 * Results for a session's video quiz: a table nobody had in v1. Rendered for
 * authors (inside the editor) and for a LEADER on their own (the server narrows
 * a leader to their groups).
 */
export function VideoQuizResultsTable({ sessionId }: { sessionId: number }) {
  const theme = useTheme();
  const results = useVideoQuizResults(sessionId, true);
  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <Text variant="heading">Results</Text>
      {results.isPending ? (
        <LoadingState />
      ) : results.isError ? (
        <ErrorState message="Couldn't load the results." onRetry={() => void results.refetch()} />
      ) : results.data.rows.length === 0 ? (
        <Text variant="body" color={theme.colors.neutral[600]}>
          No students to show yet.
        </Text>
      ) : (
        results.data.rows.map((row) => (
          <View
            key={row.studentUserId}
            style={{ flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.sm }}
          >
            <Text variant="body" style={{ flex: 1 }}>
              {row.studentName ?? `Student ${row.studentUserId}`}
            </Text>
            <Text variant="label">{`${row.answeredCount} / ${row.questionCount}`}</Text>
            <Text variant="label">{`${row.earnedPoints} / ${row.totalPoints} pts`}</Text>
            <Text variant="label" accessibilityLabel={row.completedAt ? "Completed" : "Not completed"}>
              {row.completedAt ? "✓" : "–"}
            </Text>
          </View>
        ))
      )}
    </Card>
  );
}

export function VideoQuestionsEditor({ sessionId }: { sessionId: number }) {
  const theme = useTheme();
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
    <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.md }}>
      <Text variant="heading">Video questions</Text>
      {questions.isPending ? (
        <LoadingState />
      ) : questions.isError ? (
        <ErrorState message="Couldn't load the questions." onRetry={() => void questions.refetch()} />
      ) : (
        <>
          {questions.data.length === 0 ? (
            <Text variant="body" color={theme.colors.neutral[600]}>
              No questions yet.
            </Text>
          ) : (
            questions.data.map((q) => (
              <Card key={q.id} style={{ gap: theme.spacing.xs }}>
                <Text variant="label">{formatTimestamp(q.atSeconds)}</Text>
                <Text variant="body">{q.prompt}</Text>
                <Text variant="caption" color={theme.colors.neutral[600]}>
                  {`Correct answer: ${q.options[q.correctIndex] ?? ""}`}
                </Text>
                <Text variant="caption" color={theme.colors.neutral[600]}>
                  {`${q.responseCount} answers recorded`}
                </Text>
                <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                  <Button title="Edit" variant="ghost" onPress={() => openEdit(q)} />
                  <Button
                    title={armedDelete === q.id ? `Delete ${q.responseCount} answers?` : "Delete"}
                    variant="ghost"
                    onPress={() => onDelete(q)}
                    loading={remove.isPending && remove.variables === q.id}
                  />
                </View>
              </Card>
            ))
          )}
          {status ? <Text variant="label">{status}</Text> : null}

          {form === null ? (
            <Button title="Add question" variant="secondary" onPress={openAdd} />
          ) : (
            <Card style={{ gap: theme.spacing.sm }}>
              <Input
                label="Timestamp"
                value={form.timestamp}
                onChangeText={(v) => patch({ timestamp: v })}
                error={timestampError}
                placeholder="2:30"
                autoCapitalize="none"
              />
              <Input label="Question" value={form.prompt} onChangeText={(v) => patch({ prompt: v })} />
              {form.options.map((option, index) => (
                <Input
                  key={index}
                  label={`Option ${index + 1}`}
                  value={option}
                  onChangeText={(v) =>
                    patch({ options: form.options.map((o, i) => (i === index ? v : o)) })
                  }
                />
              ))}
              {form.options.length < MAX_OPTIONS ? (
                <Button
                  title="Add option"
                  variant="ghost"
                  onPress={() => patch({ options: [...form.options, ""] })}
                />
              ) : null}
              <ChoiceChips
                label="Correct answer"
                options={form.options.map((_, i) => ({ value: i, label: `Answer ${i + 1}` }))}
                value={form.correctIndex}
                onChange={(v) => patch({ correctIndex: v })}
              />
              <Input
                label="Points"
                value={form.points}
                onChangeText={(v) => patch({ points: v })}
                keyboardType="number-pad"
              />
              {formError ? (
                <Text variant="label" color={theme.colors.error[500]}>
                  {formError}
                </Text>
              ) : null}
              <Button
                title="Save question"
                onPress={onSave}
                loading={create.isPending || update.isPending}
              />
              <Button title="Cancel" variant="ghost" onPress={() => setForm(null)} />
            </Card>
          )}
        </>
      )}
      <VideoQuizResultsTable sessionId={sessionId} />
    </View>
  );
}
