import { useState } from "react";
import { Plus } from "lucide-react-native";
import { View } from "react-native";
import { useRouter } from "expo-router";
import type { QuizAuthoringDetail } from "@space/shared";

import { QuestionEditor } from "../../components/QuestionEditor";
import { FormErrorBox } from "../../design/forms/form-parts";
import { InlineError, RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { SaveBar } from "../../design/layout/save-bar";
import { Screen } from "../../design/layout/screen";
import { iconWithClassName } from "../../design/lib/icon";
import { haptic } from "../../design/motion";
import { Button, EmptyState, ListSectionHeader, PillButton, StatusChip, Text, toast } from "../../design/ui";
import { useAddQuestion, usePublishQuiz } from "../../hooks/use-quiz-authoring";
import { useQuizAuthoringDetail } from "../../hooks/use-quizzes";
import { apiErrorMessage } from "../../lib/api-error";
import { ReleaseResultsCard } from "../quiz-grade/release-results";
import { QuestionRow } from "./question-row";
import { QuizDetailsSheet } from "./quiz-details-sheet";
import { plural } from "../../lib/plural";

iconWithClassName(Plus);

/**
 * The quiz at a glance: its name with Edit, what it is, and where it stands.
 * A published quiz is unpublished from here; publishing is the page's footer.
 */
function QuizSummary({
  quiz,
  onEdit,
  onUnpublish,
  unpublishing,
}: {
  quiz: QuizAuthoringDetail;
  onEdit: () => void;
  onUnpublish: () => void;
  unpublishing: boolean;
}) {
  const isPaper = quiz.kind === "PAPER";
  const published = quiz.publishedAt !== null;
  const meta = isPaper
    ? `Paper quiz · out of ${quiz.maxScore}`
    : `Online quiz · ${plural(quiz.questions.length, "question")} · ${quiz.maxScore} pts`;
  return (
    <View testID="quiz-summary" className="flex-col gap-3 rounded-group bg-surface p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text variant="headline">{quiz.title}</Text>
          <Text variant="subhead" className="text-muted-foreground">
            {meta}
          </Text>
          {quiz.sessionTitle ? (
            <Text variant="caption" className="text-muted-foreground">
              {`Session: ${quiz.sessionTitle}`}
            </Text>
          ) : null}
        </View>
        <PillButton label="Edit" accessibilityLabel="Edit quiz details" onPress={onEdit} className="shrink-0" />
      </View>
      {isPaper ? null : (
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <StatusChip tone={published ? "ok" : "warn"} label={published ? "Published" : "Draft"} />
          {published ? (
            <PillButton
              label={unpublishing ? "Unpublishing…" : "Unpublish"}
              accessibilityLabel="Unpublish quiz"
              onPress={onUnpublish}
            />
          ) : (
            <Text variant="caption" className="text-muted-foreground">
              Students can't see it yet
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

function QuizForm({
  data,
  onRefresh,
  refreshing,
  refreshFailed,
}: {
  data: QuizAuthoringDetail;
  refreshFailed: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const router = useRouter();
  const id = data.id;
  const add = useAddQuestion(id);
  const publish = usePublishQuiz(id);
  const [adding, setAdding] = useState(false);
  const [editingRows, setEditingRows] = useState(0);
  const [addError, setAddError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const isPaper = data.kind === "PAPER";
  const published = data.publishedAt !== null;
  const count = data.questions.length;
  const questionOpen = adding || editingRows > 0;

  const setPublished = (next: boolean) => {
    setError(null);
    publish.mutate(next, {
      onSuccess: () => {
        if (next) haptic("success");
        toast.success(next ? "Quiz published. Students can take it now." : "Quiz unpublished.");
      },
      onError: (err) => setError(apiErrorMessage(err, "Couldn't change the publish state.")),
    });
  };

  // One action for the page: a draft's Publish. Questions save one by one and
  // the details save from their sheet, so there is nothing else to save here.
  const publishBlocked =
    count === 0 ? "Add a question to publish." : questionOpen ? "Finish the question first." : undefined;
  const footer =
    isPaper || published ? undefined : (
      <SaveBar
        label="Publish quiz"
        onPress={() => setPublished(true)}
        loading={publish.isPending}
        disabled={publishBlocked !== undefined}
        disabledReason={publishBlocked}
        hint={publishBlocked ?? "Students in the season are told when it's published."}
      />
    );

  return (
    <Screen title="Edit quiz" footer={footer} onRefresh={onRefresh} refreshing={refreshing}>
      <View className="flex-col gap-6">
        {refreshFailed ? <InlineError message="Couldn't refresh this quiz." onRetry={onRefresh} /> : null}
        <QuizSummary
          quiz={data}
          onEdit={() => setDetailsOpen(true)}
          onUnpublish={() => setPublished(false)}
          unpublishing={publish.isPending}
        />
        <FormErrorBox message={error} />

        {isPaper ? (
          <View className="flex-col gap-3">
            <Text variant="subhead" className="text-muted-foreground">
              A paper quiz has no questions. Enter the marks on the grade sheet.
            </Text>
            <Button
              className="self-start"
              onPress={() => router.push({ pathname: "/quiz/[id]/grade", params: { id: String(id) } })}
            >
              Open grade sheet
            </Button>
          </View>
        ) : (
          <View className="flex-col gap-3">
            <ListSectionHeader className="pb-0">{`Questions (${count})`}</ListSectionHeader>
            {!data.canEditStructure ? (
              <Text variant="caption" className="text-muted-foreground">
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
                      onError: (err) => setAddError(apiErrorMessage(err, "Couldn't add the question.")),
                    })
                  }
                />
              ) : (
                <Button variant="secondary" onPress={() => setAdding(true)}>
                  <Plus size={16} className="text-foreground" />
                  Add question
                </Button>
              )
            ) : null}
          </View>
        )}

        {published || isPaper ? <ReleaseResultsCard quiz={data} /> : null}
      </View>
      <QuizDetailsSheet
        key={`${data.title}-${data.maxScore}`}
        quiz={data}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
      />
    </Screen>
  );
}

export function QuizBuilder({ id }: { id: number }) {
  const { data, isPending, isError, refetch, isRefetching } = useQuizAuthoringDetail(id, true);

  if (data?.canManage) {
    return <QuizForm data={data} onRefresh={() => void refetch()} refreshing={isRefetching} refreshFailed={isError} />;
  }
  let body;
  if (isPending) body = <RouteSkeleton />;
  else if (isError) body = <RouteError onRetry={() => void refetch()} />;
  else body = <EmptyState title="Not available" description="Only an admin of this quiz's season can edit it." />;
  return (
    <Screen title={data?.title ?? "Edit quiz"} onRefresh={() => void refetch()} refreshing={isRefetching}>
      {body}
    </Screen>
  );
}
