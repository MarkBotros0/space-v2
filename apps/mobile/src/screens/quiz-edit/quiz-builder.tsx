import { useState } from "react";
import { Plus } from "lucide-react-native";
import { View } from "react-native";
import { useRouter } from "expo-router";

import { QuestionEditor } from "../../components/QuestionEditor";
import { FormErrorBox } from "../../design/forms/form-parts";
import { PageTitle } from "../../design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { ShellFrame } from "../../design/layout/shell-frame";
import { iconWithClassName } from "../../design/lib/icon";
import { Badge, Button, EmptyState, Text } from "../../design/ui";
import { useAddQuestion, usePublishQuiz } from "../../hooks/use-quiz-authoring";
import { useQuizAuthoringDetail } from "../../hooks/use-quizzes";
import { apiErrorMessage } from "../../lib/api-error";
import { QuestionRow } from "./question-row";
import { QuizSettings } from "./quiz-settings";

iconWithClassName(Plus);

export function QuizBuilder({ id }: { id: number }) {
  const router = useRouter();
  const { data, isPending, isError, refetch, isRefetching } = useQuizAuthoringDetail(id, true);
  const add = useAddQuestion(id);
  const publish = usePublishQuiz(id);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  let body;
  if (isPending) body = <RouteSkeleton />;
  else if (isError) body = <RouteError onRetry={() => void refetch()} />;
  else if (!data.canManage)
    body = (
      <EmptyState
        title="Not available"
        description="Only an admin of this quiz's season can edit it."
      />
    );
  else {
    const published = data.publishedAt !== null;
    const count = data.questions.length;
    body = (
      <View className="flex-col gap-4">
        <QuizSettings quiz={data} onError={setError} />

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
                <Badge variant={published ? "success" : "warning"}>
                  {published ? "Published" : "Draft"}
                </Badge>
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
    );
  }

  return (
    <ShellFrame onRefresh={() => void refetch()} refreshing={isRefetching}>
      <View className="flex-col gap-4">
        <View>
          <PageTitle title={data?.title ?? "Edit quiz"} />
        </View>
        {body}
      </View>
    </ShellFrame>
  );
}
