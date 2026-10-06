import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable } from "react-native";
import type { QuizQuestionStudent, StudentQuizDetail } from "@space/shared";

import {
  useQuizAuthoringDetail,
  useSaveAnswers,
  useStartAttempt,
  useStudentQuizDetail,
  useSubmitAttempt,
  type AnswerInput,
} from "../../../../src/hooks/use-quizzes";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import { formatDate } from "../../../../src/lib/format";
import { parsePositiveInt } from "../../../../src/lib/params";
import { useSessionStore } from "../../../../src/store/session";
import { useTheme } from "../../../../src/theme";
import {
  Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text,
} from "../../../../src/ui";

/**
 * How long after the last edit the pending answers are flushed.
 *
 * v1 saved each answer fire-and-forget and relied on re-saving everything at
 * submit to cover the losses (R55, R56). On a phone that assumption breaks: the
 * app is backgrounded, the network drops mid-quiz, and the "one sitting" never
 * happens — and because an IN_PROGRESS attempt has no expiry (R47) and blocks
 * the student from ever starting again (R45), a lost save is not a lost answer,
 * it is a stuck student. So: a real debounce, a batched PATCH, and a visible
 * save state.
 */
const SAVE_DEBOUNCE_MS = 1000;

type SaveState = "idle" | "saving" | "saved" | "error";

function isAnswered(q: QuizQuestionStudent, a: { selectedIndex: number | null; text: string }): boolean {
  return q.type === "MCQ" ? a.selectedIndex !== null : a.text.trim().length > 0;
}

function ResultView({ detail }: { detail: StudentQuizDetail }) {
  const theme = useTheme();
  return (
    <Screen edges={["top", "left", "right"]} scroll>
      <Card style={{ marginBottom: theme.spacing.sm }}>
        <Text variant="heading">{detail.title}</Text>
        {detail.totalScore !== null ? (
          <Text variant="heading">{`${detail.totalScore} / ${detail.maxScore}`}</Text>
        ) : null}
      </Card>
      {detail.questions.map((q, index) => {
        const answer =
          q.type === "MCQ"
            ? q.selectedIndex !== null
              ? (q.options[q.selectedIndex] ?? "")
              : "No answer"
            : (q.text ?? "No answer");
        return (
          <Card key={q.id} style={{ marginBottom: theme.spacing.sm }}>
            <Text variant="caption" color={theme.colors.neutral[600]}>{`Question ${index + 1}`}</Text>
            <Text variant="label">{q.prompt}</Text>
            <Text variant="body">{`Your answer: ${answer}`}</Text>
            {/* The student is told which MCQ was wrong, never what was right (R34). */}
            {q.isCorrect === true ? <Text variant="label">Correct</Text> : null}
            {q.isCorrect === false ? <Text variant="label">Incorrect</Text> : null}
            {q.pointsAwarded !== null ? (
              <Text variant="caption" color={theme.colors.neutral[600]}>
                {`${q.pointsAwarded} / ${q.points} points`}
              </Text>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}

function AttemptForm({ detail, id }: { detail: StudentQuizDetail; id: number }) {
  const theme = useTheme();
  const save = useSaveAnswers(id);
  const submit = useSubmitAttempt(id);
  const [answers, setAnswers] = useState<
    Record<number, { selectedIndex: number | null; text: string }>
  >(() =>
    Object.fromEntries(
      detail.questions.map((q) => [q.id, { selectedIndex: q.selectedIndex, text: q.text ?? "" }]),
    ),
  );
  // Always the latest answers, readable from the debounce timer's closure.
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const pendingRef = useRef<Set<number>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  /** One batched PATCH of everything edited since the last successful flush. */
  const flush = async (): Promise<boolean> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingRef.current.size === 0) return true;
    const payload: AnswerInput[] = detail.questions
      .filter((q) => pendingRef.current.has(q.id))
      .map((q) => {
        const a = answersRef.current[q.id];
        return q.type === "MCQ"
          ? { questionId: q.id, selectedIndex: a?.selectedIndex ?? null, text: null }
          : { questionId: q.id, selectedIndex: null, text: a?.text ?? "" };
      });
    setSaveState("saving");
    try {
      await save.mutateAsync(payload);
      pendingRef.current.clear();
      setSaveState("saved");
      return true;
    } catch {
      setSaveState("error");
      return false;
    }
  };

  const queueSave = (questionId: number) => {
    pendingRef.current.add(questionId);
    if (timerRef.current) clearTimeout(timerRef.current);
    setSaveState("saving");
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flush();
    }, SAVE_DEBOUNCE_MS);
  };

  const setAnswer = (q: QuizQuestionStudent, patch: { selectedIndex?: number | null; text?: string }) => {
    setAnswers((prev) => {
      const next = {
        ...prev,
        [q.id]: {
          selectedIndex: prev[q.id]?.selectedIndex ?? null,
          text: prev[q.id]?.text ?? "",
          ...patch,
        },
      };
      answersRef.current = next;
      return next;
    });
    queueSave(q.id);
  };

  const isComplete = detail.questions.every((q) => {
    const a = answers[q.id];
    return a !== undefined && isAnswered(q, a);
  });

  const onSubmit = async () => {
    setSubmitError(null);
    // The server checks completeness too (409 attempt_incomplete); the disabled
    // button is the courtesy, this is the rule.
    if (!isComplete) return;
    if (!(await flush())) return;
    submit.mutate(undefined, {
      onError: (err) => setSubmitError(apiErrorMessage(err, "Couldn't submit the quiz.")),
    });
  };

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      <Text variant="heading">{detail.title}</Text>
      {detail.questions.map((q, index) => {
        const a = answers[q.id];
        return (
          <Card key={q.id} style={{ marginBottom: theme.spacing.sm, gap: theme.spacing.sm }}>
            <Text variant="caption" color={theme.colors.neutral[600]}>{`Question ${index + 1}`}</Text>
            <Text variant="label">{q.prompt}</Text>
            <Text variant="caption" color={theme.colors.neutral[600]}>
              {`${q.points} ${q.points === 1 ? "point" : "points"}`}
            </Text>
            {q.type === "MCQ" ? (
              q.options.map((option, optionIndex) => {
                const selected = a?.selectedIndex === optionIndex;
                return (
                  <Pressable
                    key={optionIndex}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Answer ${index + 1} option ${optionIndex + 1}: ${option}`}
                    onPress={() => setAnswer(q, { selectedIndex: optionIndex })}
                    style={{
                      minHeight: 44,
                      justifyContent: "center",
                      paddingHorizontal: theme.spacing.md,
                      borderRadius: theme.radii.sm,
                      borderWidth: theme.borderWidths.thin,
                      borderColor: selected ? theme.colors.brand.navy[900] : theme.colors.neutral[300],
                      backgroundColor: selected ? theme.colors.neutral[100] : theme.colors.transparent,
                    }}
                  >
                    <Text variant="body">{option}</Text>
                  </Pressable>
                );
              })
            ) : (
              <Input
                label={`Answer ${index + 1}`}
                multiline
                numberOfLines={6}
                value={a?.text ?? ""}
                onChangeText={(text) => setAnswer(q, { text })}
              />
            )}
          </Card>
        );
      })}

      {saveState !== "idle" ? (
        <Text
          variant="label"
          color={saveState === "error" ? theme.colors.error[500] : theme.colors.neutral[600]}
        >
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Not saved"}
        </Text>
      ) : null}
      {saveState === "error" ? (
        <Button title="Retry save" variant="ghost" onPress={() => void flush()} />
      ) : null}
      {submitError ? (
        <Text variant="label" color={theme.colors.error[500]}>
          {submitError}
        </Text>
      ) : null}
      <Button
        title="Submit"
        onPress={() => void onSubmit()}
        disabled={!isComplete || save.isPending}
        loading={submit.isPending}
      />
    </Screen>
  );
}

function StudentRunner({ id }: { id: number }) {
  const theme = useTheme();
  const { data, isPending, isError, refetch } = useStudentQuizDetail(id);
  const start = useStartAttempt(id);
  const [startError, setStartError] = useState<string | null>(null);

  if (isPending) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <LoadingState />
      </Screen>
    );
  }
  if (isError) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <ErrorState message="Couldn't load this quiz." onRetry={refetch} />
      </Screen>
    );
  }

  if (data.status === "IN_PROGRESS") return <AttemptForm detail={data} id={id} />;
  if (data.status === "GRADED") return <ResultView detail={data} />;

  return (
    <Screen edges={["top", "left", "right"]}>
      <Card style={{ gap: theme.spacing.sm }}>
        <Text variant="heading">{data.title}</Text>
        {data.status === "SUBMITTED" ? (
          <Text variant="body">
            {`Submitted${data.submittedAt ? ` ${formatDate(data.submittedAt)}` : ""} — waiting to be marked.`}
          </Text>
        ) : (
          <>
            <Text variant="body">{`${data.questions.length} questions · ${data.maxScore} points`}</Text>
            {startError ? (
              <Text variant="label" color={theme.colors.error[500]}>
                {startError}
              </Text>
            ) : null}
            {/* The only thing that creates an attempt — never a render (ruling C6). */}
            <Button
              title="Start quiz"
              loading={start.isPending}
              onPress={() => {
                setStartError(null);
                start.mutate(undefined, {
                  onError: (err) => setStartError(apiErrorMessage(err, "Couldn't start the quiz.")),
                });
              }}
            />
          </>
        )}
      </Card>
    </Screen>
  );
}

function StaffPreview({ id }: { id: number }) {
  const theme = useTheme();
  const router = useRouter();
  const { data, isPending, isError, refetch } = useQuizAuthoringDetail(id, true);

  if (isPending) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <LoadingState />
      </Screen>
    );
  }
  if (isError) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <ErrorState message="Couldn't load this quiz." onRetry={refetch} />
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      <Card style={{ marginBottom: theme.spacing.sm, gap: theme.spacing.sm }}>
        <Text variant="heading">{data.title}</Text>
        <Text variant="label" color={theme.colors.neutral[600]}>
          {data.kind === "PAPER" ? "Paper" : data.publishedAt === null ? "Online · Draft" : "Online · Published"}
        </Text>
        <Button
          title="Grade this quiz"
          onPress={() => router.push({ pathname: "/quiz/[id]/grade", params: { id: String(id) } })}
        />
      </Card>
      {data.kind === "PAPER" ? (
        <Text variant="body">This is a paper quiz — there are no questions to preview.</Text>
      ) : (
        data.questions.map((q, index) => (
          <Card key={q.id} style={{ marginBottom: theme.spacing.sm }}>
            <Text variant="caption" color={theme.colors.neutral[600]}>{`Question ${index + 1}`}</Text>
            <Text variant="label">{q.prompt}</Text>
            <Text variant="caption" color={theme.colors.neutral[600]}>
              {`${q.points} ${q.points === 1 ? "point" : "points"}`}
            </Text>
            {q.options.map((option, optionIndex) => (
              <Text key={optionIndex} variant="body">{`${optionIndex + 1}. ${option}`}</Text>
            ))}
            {q.correctIndex !== null && q.options[q.correctIndex] !== undefined ? (
              <Text variant="label">{`Correct answer: ${q.options[q.correctIndex]}`}</Text>
            ) : null}
          </Card>
        ))
      )}
    </Screen>
  );
}

export default function QuizDetailScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = parsePositiveInt(rawId);
  const role = useSessionStore((s) => s.user?.role ?? null);

  if (id === null) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Not found" message="That quiz doesn't exist." />
      </Screen>
    );
  }
  if (role === "STUDENT") return <StudentRunner id={id} />;
  if (role === "LEADER" || role === "ADMIN" || role === "SUPER") return <StaffPreview id={id} />;
  return (
    <Screen edges={["top", "left", "right"]}>
      <EmptyState title="Quizzes" message="This screen isn't available for your role." />
    </Screen>
  );
}
