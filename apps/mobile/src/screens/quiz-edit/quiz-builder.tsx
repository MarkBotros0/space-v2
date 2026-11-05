import { useState } from "react";
import { Plus } from "lucide-react-native";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { updateQuizRequestSchema, type QuizAuthoringDetail } from "@space/shared";

import { QuestionEditor } from "../../components/QuestionEditor";
import { FormErrorBox } from "../../design/forms/form-parts";
import { FormScreen } from "../../design/layout/form-screen";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { iconWithClassName } from "../../design/lib/icon";
import { Button, EmptyState, StatusChip, Text } from "../../design/ui";
import { useAddQuestion, usePublishQuiz, useUpdateQuiz } from "../../hooks/use-quiz-authoring";
import { useQuizAuthoringDetail } from "../../hooks/use-quizzes";
import { apiErrorMessage } from "../../lib/api-error";
import { firstErrorByField } from "../../lib/form-errors";
import { QuestionRow } from "./question-row";
import { QuizSettings } from "./quiz-settings";

iconWithClassName(Plus);

const MAX_SCORE_MESSAGE = "Max score must be a whole number from 1 to 1000.";

function QuizForm({
  data,
  onRefresh,
  refreshing,
}: {
  data: QuizAuthoringDetail;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const router = useRouter();
  const id = data.id;
  const add = useAddQuestion(id);
  const publish = usePublishQuiz(id);
  const update = useUpdateQuiz(id);
  const [adding, setAdding] = useState(false);
  const [editingRows, setEditingRows] = useState(0);
  const [addError, setAddError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(data.title);
  const [maxScore, setMaxScore] = useState(String(data.maxScore));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  const isPaper = data.kind === "PAPER";
  const titleChanged = title !== data.title;
  const scoreLocked = data.gradeCount > 0;
  const scoreChanged = isPaper && !scoreLocked && maxScore !== String(data.maxScore);
  const dirty = titleChanged || scoreChanged;

  const questionOpen = adding || editingRows > 0;

  const save = () => {
    if (!dirty || questionOpen) return;
    const body: { title?: string; maxScore?: number } = {};
    if (titleChanged) body.title = title;
    if (scoreChanged) body.maxScore = maxScore.trim() === "" ? Number.NaN : Number(maxScore);
    const parsed = updateQuizRequestSchema.safeParse(body);
    if (!parsed.success) {
      const byField = firstErrorByField(parsed.error);
      const next: Record<string, string> = {};
      if ("title" in byField) next.title = "Enter a title.";
      if ("maxScore" in byField) next.maxScore = MAX_SCORE_MESSAGE;
      if (Object.keys(next).length === 0)
        next.form = Object.values(byField)[0] ?? "Check the quiz.";
      setErrors(next);
      return;
    }
    setErrors({});
    setSaveError(null);
    update.mutate(body, {
      onError: (err) => setSaveError(apiErrorMessage(err, "Couldn't save the quiz.")),
    });
  };

  const saveHint = questionOpen
    ? "Finish or cancel the question above first."
    : (saveError ??
      errors.form ??
      (Object.keys(errors).length > 0
        ? "Fix the fields marked above."
        : dirty
          ? undefined
          : "Nothing to save yet."));

  const published = data.publishedAt !== null;
  const count = data.questions.length;
  return (
    <FormScreen
      title={data.title}
      saveLabel="Save changes"
      saving={update.isPending}
      saveHint={saveHint}
      onSave={save}
      onRefresh={onRefresh}
      refreshing={refreshing}
    >
      <View className="flex-col gap-4">
        <QuizSettings
          kind={data.kind}
          title={title}
          maxScore={maxScore}
          locked={scoreLocked}
          errors={errors}
          onTitle={setTitle}
          onMaxScore={setMaxScore}
        />

        {data.kind === "PAPER" ? (
          <View className="flex-col gap-3 rounded-group bg-surface dark:border dark:border-separator p-4">
            <Text className="text-sm">
              This is a paper quiz — it has no questions. Grade it from the grade sheet.
            </Text>
            <Button
              className="self-start"
              variant="outline"
              onPress={() =>
                router.push({ pathname: "/quiz/[id]/grade", params: { id: String(id) } })
              }
            >
              Open grade sheet
            </Button>
          </View>
        ) : (
          <>
            {/* v1's publish bar. */}
            <View className="flex-col gap-3 rounded-group bg-surface dark:border dark:border-separator p-4">
              <View className="flex-row flex-wrap items-center gap-2">
                <StatusChip
                  tone={published ? "ok" : "warn"}
                  label={published ? "Published" : "Draft"}
                />
                <Text className="text-sm text-muted-foreground">
                  {`${count} question${count === 1 ? "" : "s"} · ${data.maxScore} pts`}
                </Text>
              </View>
              <Button
                className="self-start"
                variant={published ? "outline" : "default"}
                size="sm"
                disabled={publish.isPending}
                onPress={() => {
                  setError(null);
                  publish.mutate(!published, {
                    onError: (err) =>
                      setError(apiErrorMessage(err, "Couldn't change the publish state.")),
                  });
                }}
              >
                {published ? "Unpublish" : "Publish"}
              </Button>
            </View>
            {!data.canEditStructure ? (
              <Text className="text-xs text-muted-foreground">
                Students have started this quiz, so its questions can no longer change.
              </Text>
            ) : null}
            {count === 0 && !adding ? (
              <EmptyState
                title="No questions yet"
                description="Add multiple-choice or essay questions, then publish the quiz."
              />
            ) : (
              <View className="flex-col gap-2">
                {data.questions.map((q, index) => (
                  <QuestionRow
                    key={q.id}
                    quiz={data}
                    question={q}
                    index={index}
                    editable={data.canEditStructure}
                    onError={setError}
                    onEditingChange={(on) => setEditingRows((n) => Math.max(0, n + (on ? 1 : -1)))}
                  />
                ))}
              </View>
            )}
            {data.canEditStructure ? (
              adding ? (
                <QuestionEditor
                  submitting={add.isPending}
                  serverError={addError}
                  onCancel={() => setAdding(false)}
                  onSubmit={(payload) =>
                    add.mutate(payload, {
                      onSuccess: () => {
                        setAdding(false);
                        setAddError(null);
                      },
                      onError: (err) =>
                        setAddError(apiErrorMessage(err, "Couldn't add the question.")),
                    })
                  }
                />
              ) : (
                <Button
                  className="self-start"
                  variant="outline"
                  size="sm"
                  onPress={() => setAdding(true)}
                >
                  <Plus size={16} className="text-foreground" />
                  Add question
                </Button>
              )
            ) : null}
          </>
        )}
        <FormErrorBox message={error} />
      </View>
    </FormScreen>
  );
}

export function QuizBuilder({ id }: { id: number }) {
  const { data, isPending, isError, refetch, isRefetching } = useQuizAuthoringDetail(id, true);

  if (data?.canManage) {
    return <QuizForm data={data} onRefresh={() => void refetch()} refreshing={isRefetching} />;
  }
  let body;
  if (isPending) body = <RouteSkeleton />;
  else if (isError) body = <RouteError onRetry={() => void refetch()} />;
  else
    body = (
      <EmptyState
        title="Not available"
        description="Only an admin of this quiz's season can edit it."
      />
    );
  return (
    <Screen
      title={data?.title ?? "Edit quiz"}
      onRefresh={() => void refetch()}
      refreshing={isRefetching}
    >
      {body}
    </Screen>
  );
}
