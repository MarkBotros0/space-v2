import { useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react-native";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { QuizAuthoringDetail, QuizQuestionAuthoring } from "@space/shared";

import { QuestionEditor } from "../../../../src/components/QuestionEditor";
import { FormErrorBox } from "../../../../src/design/forms/form-parts";
import { BackLink, PageTitle } from "../../../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { ShellFrame } from "../../../../src/design/layout/shell-frame";
import { iconWithClassName } from "../../../../src/design/lib/icon";
import { Badge, Button, ConfirmDialog, EmptyState, Input, Text } from "../../../../src/design/ui";
import {
  useAddQuestion,
  useDeleteQuestion,
  usePublishQuiz,
  useReorderQuestions,
  useUpdateQuestion,
  useUpdateQuiz,
} from "../../../../src/hooks/use-quiz-authoring";
import { useQuizAuthoringDetail } from "../../../../src/hooks/use-quizzes";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import { parsePositiveInt } from "../../../../src/lib/params";
import { useSessionStore } from "../../../../src/store/session";

iconWithClassName(ChevronDown, ChevronUp, Pencil, Plus, Trash2);

/** V2-ONLY (v1's builder had no settings block): rename and, for paper, the max score. */
function QuizSettings({
  quiz,
  onError,
}: {
  quiz: QuizAuthoringDetail;
  onError: (m: string | null) => void;
}) {
  const update = useUpdateQuiz(quiz.id);
  const [title, setTitle] = useState(quiz.title);
  const [maxScore, setMaxScore] = useState(String(quiz.maxScore));

  const save = (body: { title?: string; maxScore?: number }) => {
    onError(null);
    update.mutate(body, {
      onError: (err) => onError(apiErrorMessage(err, "Couldn't save the quiz.")),
    });
  };

  return (
    <View className="flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <View className="flex-col gap-1">
        <Text className="text-xs font-semibold text-muted-foreground">Quiz title</Text>
        <Input accessibilityLabel="Quiz title" value={title} onChangeText={setTitle} />
      </View>
      <Button
        className="self-start"
        variant="outline"
        size="sm"
        disabled={update.isPending}
        onPress={() => save({ title })}
      >
        Save title
      </Button>
      {quiz.kind === "PAPER" ? (
        <>
          {/* Refused server-side once grades exist (quiz_has_grades). */}
          <View className="flex-col gap-1">
            <Text className="text-xs font-semibold text-muted-foreground">Max score</Text>
            <Input
              accessibilityLabel="Max score"
              value={maxScore}
              onChangeText={setMaxScore}
              keyboardType="number-pad"
            />
          </View>
          <Button
            className="self-start"
            variant="outline"
            size="sm"
            onPress={() => save({ maxScore: Number(maxScore) })}
          >
            Save max score
          </Button>
        </>
      ) : null}
    </View>
  );
}

function QuestionRow({
  quiz,
  question,
  index,
  editable,
  onError,
}: {
  quiz: QuizAuthoringDetail;
  question: QuizQuestionAuthoring;
  index: number;
  editable: boolean;
  onError: (m: string | null) => void;
}) {
  const update = useUpdateQuestion(quiz.id);
  const remove = useDeleteQuestion(quiz.id);
  const reorder = useReorderQuestions(quiz.id);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const n = index + 1;
  const ids = quiz.questions.map((q) => q.id);

  const move = (delta: -1 | 1) => {
    const target = index + delta;
    const next = [...ids];
    [next[index], next[target]] = [next[target] as number, next[index] as number];
    onError(null);
    reorder.mutate(next, { onError: (err) => onError(apiErrorMessage(err, "Couldn't reorder.")) });
  };

  const onDelete = () => {
    onError(null);
    remove.mutate(question.id, {
      onSuccess: () => setConfirming(false),
      onError: (err) => {
        setConfirming(false);
        onError(apiErrorMessage(err, "Couldn't delete the question."));
      },
    });
  };

  if (editing) {
    return (
      <QuestionEditor
        initial={question}
        submitting={update.isPending}
        serverError={serverError}
        onCancel={() => setEditing(false)}
        onSubmit={(body) =>
          update.mutate(
            { questionId: question.id, body },
            {
              onSuccess: () => setEditing(false),
              onError: (err) => setServerError(apiErrorMessage(err, "Couldn't save the question.")),
            },
          )
        }
      />
    );
  }

  const correct =
    question.type === "MCQ" && question.correctIndex !== null
      ? question.options[question.correctIndex]
      : undefined;

  return (
    <View className="flex-row items-start justify-between gap-3 rounded-xl border border-border bg-card p-4">
      <View className="min-w-0 flex-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-xs font-bold text-muted-foreground">{`Q${n}`}</Text>
          <Badge variant={question.type === "MCQ" ? "teal" : "outline"}>
            {question.type === "MCQ" ? "Multiple choice" : "Essay"}
          </Badge>
          <Text className="text-xs text-muted-foreground">{`${question.points} pt${question.points === 1 ? "" : "s"}`}</Text>
        </View>
        <Text className="mt-1 text-sm font-semibold text-brand-navy-900 dark:text-foreground">
          {question.prompt}
        </Text>
        {question.type === "MCQ" ? (
          <Text numberOfLines={1} className="mt-0.5 text-xs text-muted-foreground">
            {`Correct: ${correct ?? "—"}`}
          </Text>
        ) : null}
      </View>
      {editable ? (
        <View className="shrink-0 flex-row flex-wrap justify-end">
          {/* V2-ONLY: reorder (v1 had none; PATCH /quizzes/:id/order, spec 12). */}
          <Button
            variant="ghost"
            size="sm"
            accessibilityLabel={`Move question ${n} up`}
            disabled={index === 0 || reorder.isPending}
            onPress={() => move(-1)}
          >
            <ChevronUp size={16} className="text-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            accessibilityLabel={`Move question ${n} down`}
            disabled={index === ids.length - 1 || reorder.isPending}
            onPress={() => move(1)}
          >
            <ChevronDown size={16} className="text-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            accessibilityLabel={`Edit question ${n}`}
            onPress={() => setEditing(true)}
          >
            <Pencil size={16} className="text-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            accessibilityLabel={`Delete question ${n}`}
            onPress={() => setConfirming(true)}
          >
            <Trash2 size={16} className="text-error-600" />
          </Button>
        </View>
      ) : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete question?"
        description="This removes the question and any recorded answers. This cannot be undone."
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={onDelete}
      />
    </View>
  );
}

function QuizBuilder({ id }: { id: number }) {
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
          <View className="flex-col gap-3 rounded-2xl border border-border bg-card p-4">
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
            <View className="flex-col gap-3 rounded-2xl border border-border bg-card p-4">
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
          <BackLink
            icon
            label="Back to session"
            onPress={() =>
              data?.sessionId != null
                ? router.push({ pathname: "/session/[id]", params: { id: String(data.sessionId) } })
                : router.back()
            }
          />
          <PageTitle title={data?.title ?? "Edit quiz"} />
        </View>
        {body}
      </View>
    </ShellFrame>
  );
}

export default function QuizEditScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = parsePositiveInt(raw);
  const role = useSessionStore((s) => s.user?.role ?? null);

  // v1's builder route was requireRole(["ADMIN","SUPER"]) + canManageQuiz; the
  // role check here avoids a pointless fetch, and canManage (server-derived,
  // C4) is checked in QuizBuilder. The server enforces both on every write.
  if (role !== "ADMIN" && role !== "SUPER") {
    return (
      <ShellFrame>
        <EmptyState title="Not available" description="Only a season admin can edit quizzes." />
      </ShellFrame>
    );
  }
  if (id === null) {
    return (
      <ShellFrame>
        <EmptyState title="Not found" description="That quiz doesn't exist." />
      </ShellFrame>
    );
  }
  return <QuizBuilder id={id} />;
}
