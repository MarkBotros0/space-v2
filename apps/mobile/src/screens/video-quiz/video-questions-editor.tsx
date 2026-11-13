import { useState } from "react";
import { View } from "react-native";
import { formatTimestamp, type VideoQuestionAdmin } from "@space/shared";

import {
  useVideoQuestions,
  useVideoQuestionWrites,
  useVideoQuizResults,
  type VideoOwner,
} from "../../hooks/use-video-quiz";
import { InlineError } from "../../design/layout/route-states";
import { Button } from "../../design/ui/button";
import { Card } from "../../design/ui/card";
import { Skeleton } from "../../design/ui/skeleton";
import { Text } from "../../design/ui/text";
import { apiErrorMessage } from "../../lib/api-error";
import {
  EMPTY_VIDEO_QUESTION_FORM,
  formFromQuestion,
  updatedQuestionStatus,
  videoQuestionBody,
  type VideoQuestionFormState,
} from "../../lib/video-question-form";
import { VideoQuestionFormCard, type QuestionVideo } from "./video-question-form-card";

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

/**
 * The timed questions on a video: a session's, or a video part's of an
 * assignment. Each question saves on its own. A session's editor also shows
 * its results; a part's results are on the assignment's progress.
 */
export function VideoQuestionsEditor({
  owner,
  video,
  onFormOpenChange,
}: {
  owner: VideoOwner;
  /** The video, when known: the form picks the moment on it. */
  video?: QuestionVideo;
  /** The form opened or closed: the part sheet hides its own player meanwhile (one player at a time). */
  onFormOpenChange?: (open: boolean) => void;
}) {
  const questions = useVideoQuestions(owner, true);
  const { create, update, remove } = useVideoQuestionWrites(owner);

  const [form, setFormState] = useState<VideoQuestionFormState | null>(null);
  const setForm = (next: VideoQuestionFormState | null): void => {
    setFormState(next);
    onFormOpenChange?.(next !== null);
  };
  const close = (): void => setForm(null);
  const [timestampError, setTimestampError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [armedDelete, setArmedDelete] = useState<number | null>(null);

  const patch = (changes: Partial<VideoQuestionFormState>): void =>
    setFormState((f) => (f === null ? f : { ...f, ...changes }));

  const openAdd = (): void => {
    setStatus(null);
    setFormError(null);
    setTimestampError(undefined);
    // A new question starts at 0:00 when the time is picked on the video.
    setForm(video ? { ...EMPTY_VIDEO_QUESTION_FORM, timestamp: formatTimestamp(0) } : EMPTY_VIDEO_QUESTION_FORM);
  };

  const openEdit = (q: VideoQuestionAdmin): void => {
    setStatus(null);
    setFormError(null);
    setTimestampError(undefined);
    setForm(formFromQuestion(q));
  };

  const onSave = (): void => {
    if (form === null) return;
    setFormError(null);
    const body = videoQuestionBody(form);
    setTimestampError(body.ok || body.field !== "timestamp" ? undefined : body.message);
    if (!body.ok) {
      if (body.field === "form") setFormError(body.message);
      return;
    }

    if (form.editingId === null) {
      create.mutate(body.input, {
        onSuccess: () => {
          setForm(null);
          setStatus("Question added.");
        },
        onError: (err) => setFormError(apiErrorMessage(err, "Couldn't save the question.")),
      });
      return;
    }
    update.mutate(
      { questionId: form.editingId, input: body.input },
      {
        onSuccess: (res) => {
          setForm(null);
          setStatus(updatedQuestionStatus(res));
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
      {/* Ruling (I1): a part's question changes who is done with it; no dialog, this line says so. */}
      {owner.kind === "part" ? (
        <Text className="text-muted-foreground">
          Students who already finished this video will need to answer new questions.
        </Text>
      ) : null}
      {questions.isPending ? (
        <View accessible accessibilityLabel="Loading">
          <Skeleton className="h-24 rounded-group" />
        </View>
      ) : questions.isError ? (
        <InlineError message="Couldn't load the questions." onRetry={() => void questions.refetch()} />
      ) : (
        <>
          {questions.data.length === 0 ? (
            <Text className="text-muted-foreground">No questions yet.</Text>
          ) : (
            [...questions.data]
              .sort((a, b) => a.atSeconds - b.atSeconds)
              .map((q) => (
                <Card key={q.id} className="flex-col gap-1 p-4">
                  <Text className="text-sm font-medium">{formatTimestamp(q.atSeconds)}</Text>
                  <Text>{q.prompt}</Text>
                  <Text className="text-xs text-muted-foreground">
                    {`Correct answer: ${q.options[q.correctIndex] ?? ""}`}
                  </Text>
                  <Text className="text-xs text-muted-foreground">{`${q.responseCount} answers recorded`}</Text>
                  <View className="flex-row flex-wrap gap-2">
                    <Button variant="secondary" onPress={() => openEdit(q)}>
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
            <Button variant="secondary" size="md" onPress={openAdd}>
              Add question
            </Button>
          ) : (
            <VideoQuestionFormCard
              form={form}
              video={video}
              timestampError={timestampError}
              formError={formError}
              saving={create.isPending || update.isPending}
              onPatch={patch}
              onSave={onSave}
              onCancel={() => close()}
            />
          )}
        </>
      )}
      {owner.kind === "session" ? <VideoQuizResultsTable sessionId={owner.sessionId} /> : null}
    </View>
  );
}
