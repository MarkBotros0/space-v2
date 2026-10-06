import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { QuizAuthoringDetail, QuizQuestionAuthoring } from "@space/shared";

import { QuestionEditor } from "../../../../src/components/QuestionEditor";
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
import { useTheme } from "../../../../src/theme";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text } from "../../../../src/ui";

function QuizSettings({ quiz, onError }: { quiz: QuizAuthoringDetail; onError: (m: string | null) => void }) {
  const theme = useTheme();
  const update = useUpdateQuiz(quiz.id);
  const [title, setTitle] = useState(quiz.title);
  const [maxScore, setMaxScore] = useState(String(quiz.maxScore));

  const save = (body: { title?: string; maxScore?: number }) => {
    onError(null);
    update.mutate(body, { onError: (err) => onError(apiErrorMessage(err, "Couldn't save the quiz.")) });
  };

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <Input label="Quiz title" value={title} onChangeText={setTitle} />
      <Button title="Save title" variant="secondary" onPress={() => save({ title })} loading={update.isPending} />
      {quiz.kind === "PAPER" ? (
        <>
          {/* Refused server-side once grades exist (quiz_has_grades). */}
          <Input label="Max score" value={maxScore} onChangeText={setMaxScore} keyboardType="number-pad" />
          <Button title="Save max score" variant="secondary" onPress={() => save({ maxScore: Number(maxScore) })} />
        </>
      ) : null}
    </Card>
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
  const theme = useTheme();
  const update = useUpdateQuestion(quiz.id);
  const remove = useDeleteQuestion(quiz.id);
  const reorder = useReorderQuestions(quiz.id);
  const [editing, setEditing] = useState(false);
  const [armed, setArmed] = useState(false);
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
    if (!armed) {
      setArmed(true);
      return;
    }
    onError(null);
    remove.mutate(question.id, {
      onError: (err) => {
        setArmed(false);
        onError(apiErrorMessage(err, "Couldn't delete the question."));
      },
    });
  };

  const correct =
    question.type === "MCQ" && question.correctIndex !== null ? question.options[question.correctIndex] : undefined;

  return (
    <Card style={{ marginTop: theme.spacing.sm, gap: theme.spacing.xs }}>
      <Text variant="body">{`${n}. ${question.prompt}`}</Text>
      <Text variant="caption" color={theme.colors.neutral[600]}>
        {`${question.type === "MCQ" ? "Multiple choice" : "Essay"} · ${question.points} pt${question.points === 1 ? "" : "s"}`}
      </Text>
      {question.type === "MCQ"
        ? question.options.map((o, i) => (
            <Text key={i} variant="label">{`${String.fromCharCode(65 + i)}. ${o}`}</Text>
          ))
        : null}
      {correct !== undefined ? <Text variant="label">{`Correct answer: ${correct}`}</Text> : null}
      {editable ? (
        editing ? (
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
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
            <Button
              title="Up"
              variant="ghost"
              accessibilityLabel={`Move question ${n} up`}
              disabled={index === 0 || reorder.isPending}
              onPress={() => move(-1)}
            />
            <Button
              title="Down"
              variant="ghost"
              accessibilityLabel={`Move question ${n} down`}
              disabled={index === ids.length - 1 || reorder.isPending}
              onPress={() => move(1)}
            />
            <Button title="Edit" variant="secondary" accessibilityLabel={`Edit question ${n}`} onPress={() => setEditing(true)} />
            <Button
              title={armed ? "Really delete?" : "Delete"}
              variant="ghost"
              accessibilityLabel={armed ? `Really delete question ${n}` : `Delete question ${n}`}
              loading={remove.isPending}
              onPress={onDelete}
            />
          </View>
        )
      ) : null}
    </Card>
  );
}

function QuizBuilder({ id }: { id: number }) {
  const theme = useTheme();
  const router = useRouter();
  const { data, isPending, isError, refetch, isRefetching } = useQuizAuthoringDetail(id, true);
  const add = useAddQuestion(id);
  const publish = usePublishQuiz(id);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isPending) return <LoadingState />;
  if (isError) return <ErrorState message="Couldn't load this quiz." onRetry={() => void refetch()} />;
  if (!data.canManage) {
    return <EmptyState title="Not available" message="Only an admin of this quiz's season can edit it." />;
  }

  const published = data.publishedAt !== null;

  return (
    <Screen edges={["top", "left", "right"]} scroll onRefresh={() => void refetch()} refreshing={isRefetching}>
      <Text variant="title">{data.title}</Text>
      <Text variant="label" color={theme.colors.neutral[600]}>
        {`${published ? "Published" : "Draft"} · ${data.maxScore} points`}
      </Text>
      <QuizSettings quiz={data} onError={setError} />

      {data.kind === "PAPER" ? (
        <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
          <Text variant="body">This is a paper quiz — it has no questions. Grade it from the grade sheet.</Text>
          <Button
            title="Open grade sheet"
            variant="secondary"
            onPress={() => router.push({ pathname: "/quiz/[id]/grade", params: { id: String(id) } })}
          />
        </Card>
      ) : (
        <>
          <Button
            title={published ? "Unpublish" : "Publish"}
            variant={published ? "secondary" : "primary"}
            style={{ marginTop: theme.spacing.md }}
            loading={publish.isPending}
            onPress={() => {
              setError(null);
              publish.mutate(!published, {
                onError: (err) => setError(apiErrorMessage(err, "Couldn't change the publish state.")),
              });
            }}
          />
          {!data.canEditStructure ? (
            <Text variant="label" style={{ marginTop: theme.spacing.sm }}>
              Students have started this quiz, so its questions can no longer change.
            </Text>
          ) : null}
          {data.questions.length === 0 ? (
            <EmptyState title="No questions yet" message="Add multiple-choice or essay questions, then publish the quiz." />
          ) : (
            data.questions.map((q, index) => (
              <QuestionRow
                key={q.id}
                quiz={data}
                question={q}
                index={index}
                editable={data.canEditStructure}
                onError={setError}
              />
            ))
          )}
          {data.canEditStructure ? (
            adding ? (
              <Card style={{ marginTop: theme.spacing.md }}>
                <QuestionEditor
                  submitting={add.isPending}
                  serverError={addError}
                  onCancel={() => setAdding(false)}
                  onSubmit={(body) =>
                    add.mutate(body, {
                      onSuccess: () => {
                        setAdding(false);
                        setAddError(null);
                      },
                      onError: (err) => setAddError(apiErrorMessage(err, "Couldn't add the question.")),
                    })
                  }
                />
              </Card>
            ) : (
              <Button title="Add question" style={{ marginTop: theme.spacing.md }} onPress={() => setAdding(true)} />
            )
          ) : null}
        </>
      )}
      {error ? (
        <Text variant="label" color={theme.colors.error[500]} style={{ marginTop: theme.spacing.sm }}>
          {error}
        </Text>
      ) : null}
    </Screen>
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
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Not available" message="Only a season admin can edit quizzes." />
      </Screen>
    );
  }
  if (id === null) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Not found" message="That quiz doesn't exist." />
      </Screen>
    );
  }
  return <QuizBuilder id={id} />;
}
