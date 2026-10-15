import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Check, Clock, X } from "lucide-react-native";
import { Pressable, View } from "react-native";
import type { QuizQuestionStudent, StudentQuizDetail } from "@space/shared";

import { Eyebrow } from "../../../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { ShellFrame } from "../../../../src/design/layout/shell-frame";
import { cn } from "../../../../src/design/lib/cn";
import { iconWithClassName } from "../../../../src/design/lib/icon";
import { shadowStyle } from "../../../../src/design/lib/shadow";
import {
  Badge,
  Button as ButtonV1,
  ConfirmDialog,
  Text as TextV1,
  Textarea,
} from "../../../../src/design/ui";
import {
  useQuizAuthoringDetail,
  useSaveAnswers,
  useStartAttempt,
  useStudentQuizDetail,
  useSubmitAttempt,
  type AnswerInput,
} from "../../../../src/hooks/use-quizzes";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import { parsePositiveInt } from "../../../../src/lib/params";
import { useSessionStore } from "../../../../src/store/session";
import { useTheme } from "../../../../src/theme";
import {
  Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text,
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

iconWithClassName(ArrowLeft, Check, Clock, X);

type SaveState = "idle" | "saving" | "saved" | "error";

function isAnswered(q: QuizQuestionStudent, a: { selectedIndex: number | null; text: string }): boolean {
  return q.type === "MCQ" ? a.selectedIndex !== null : a.text.trim().length > 0;
}

/** v1 quiz page header: "← Quizzes" link, title (text-xl), session line. */
function QuizHeader({ detail }: { detail: StudentQuizDetail }) {
  const router = useRouter();
  return (
    <View>
      <Pressable accessibilityRole="link" onPress={() => router.back()} className="flex-row items-center gap-1 self-start">
        <ArrowLeft size={12} className="text-brand-teal-700 dark:text-brand-teal-300" />
        <TextV1 className="text-xs font-semibold text-brand-teal-700 dark:text-brand-teal-300">Quizzes</TextV1>
      </Pressable>
      <TextV1 accessibilityRole="header" className="mt-1 text-xl font-black text-brand-navy-900 dark:text-foreground">
        {detail.title}
      </TextV1>
      {detail.sessionTitle ? <TextV1 className="text-sm text-muted-foreground">{detail.sessionTitle}</TextV1> : null}
    </View>
  );
}

const QCARD = "rounded-2xl border border-border bg-card p-4";

/** v1 Result: SUBMITTED and GRADED both list the answers (B2-15). */
function ResultView({ detail }: { detail: StudentQuizDetail }) {
  const graded = detail.status === "GRADED";
  return (
    <ShellFrame>
      <View className="flex-col gap-3">
        <QuizHeader detail={detail} />
        <View
          className="flex-row items-center justify-between rounded-2xl border border-border bg-card p-5"
          style={shadowStyle("soft")}
        >
          <View className="min-w-0 flex-1">
            <TextV1 className="text-sm font-bold text-brand-navy-900 dark:text-foreground">
              {graded ? "Graded" : "Submitted"}
            </TextV1>
            <TextV1 className="text-xs text-muted-foreground">
              {graded ? "Your quiz has been graded." : "Awaiting grading for the written answers."}
            </TextV1>
          </View>
          {graded ? (
            <View className="items-end">
              <TextV1 className="text-2xl font-black text-brand-teal-700 dark:text-brand-teal-300">
                {String(detail.totalScore ?? 0)}
                <TextV1 className="text-sm font-semibold text-muted-foreground">{`/${detail.maxScore}`}</TextV1>
              </TextV1>
              <Eyebrow>Score</Eyebrow>
            </View>
          ) : (
            <Badge variant="warning">
              <Clock size={12} className="text-warning-800 dark:text-warning-200" />
              Pending
            </Badge>
          )}
        </View>
        {detail.questions.map((q, index) => (
          <View key={q.id} className={QCARD} style={shadowStyle("soft")}>
            <View className="flex-row items-center justify-between gap-2">
              <TextV1 className="text-xs font-bold text-muted-foreground">{`Q${index + 1}`}</TextV1>
              {/* The student is told which MCQ was wrong, never what was right (R34). */}
              {q.type === "MCQ" && q.isCorrect !== null ? (
                q.isCorrect ? (
                  <Badge variant="success">
                    <Check size={12} className="text-success-800 dark:text-success-200" />
                    Correct
                  </Badge>
                ) : (
                  <Badge variant="error">
                    <X size={12} className="text-error-800 dark:text-error-200" />
                    Incorrect
                  </Badge>
                )
              ) : (
                <TextV1 className="text-xs text-muted-foreground">
                  {q.pointsAwarded !== null ? `${q.pointsAwarded}/${q.points} pts` : `${q.points} pts`}
                </TextV1>
              )}
            </View>
            <TextV1 className="mt-1 text-sm font-semibold text-brand-navy-900 dark:text-foreground">{q.prompt}</TextV1>
            {q.type === "MCQ" ? (
              <TextV1 className="mt-1 text-sm text-muted-foreground">
                {`Your answer: ${q.selectedIndex !== null ? (q.options[q.selectedIndex] ?? "—") : "—"}`}
              </TextV1>
            ) : (
              <TextV1 className="mt-1 rounded-lg bg-muted/40 px-3 py-2 text-sm text-foreground">{q.text || "—"}</TextV1>
            )}
          </View>
        ))}
      </View>
    </ShellFrame>
  );
}

function AttemptForm({ detail, id }: { detail: StudentQuizDetail; id: number }) {
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
  const [confirmOpen, setConfirmOpen] = useState(false);

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
    <ShellFrame>
      <View className="flex-col gap-3">
        <QuizHeader detail={detail} />
        {detail.questions.map((q, index) => {
          const a = answers[q.id];
          return (
            <View key={q.id} className={QCARD} style={shadowStyle("soft")}>
              <View className="flex-row items-center gap-2">
                <TextV1 className="text-xs font-bold text-muted-foreground">{`Q${index + 1}`}</TextV1>
                <Badge variant={q.type === "MCQ" ? "teal" : "outline"}>
                  {q.type === "MCQ" ? "Multiple choice" : "Essay"}
                </Badge>
                <TextV1 className="text-xs text-muted-foreground">{`${q.points} pt${q.points === 1 ? "" : "s"}`}</TextV1>
              </View>
              <TextV1 className="mt-2 text-sm font-semibold text-brand-navy-900 dark:text-foreground">{q.prompt}</TextV1>
              {q.type === "MCQ" ? (
                <View className="mt-3 flex-col gap-2">
                  {q.options.map((option, optionIndex) => {
                    const selected = a?.selectedIndex === optionIndex;
                    return (
                      <Pressable
                        key={optionIndex}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`Answer ${index + 1} option ${optionIndex + 1}: ${option}`}
                        onPress={() => setAnswer(q, { selectedIndex: optionIndex })}
                        className={cn(
                          "flex-row items-center gap-3 rounded-xl border px-4 py-3",
                          selected ? "border-brand-teal-600 bg-brand-teal-600/10" : "border-border bg-card",
                        )}
                      >
                        <View
                          className={cn(
                            "size-5 shrink-0 items-center justify-center rounded-full border",
                            selected ? "border-brand-teal-600 bg-brand-teal-600" : "border-border",
                          )}
                        >
                          {selected ? <Check size={12} className="text-white" /> : null}
                        </View>
                        <TextV1
                          className={cn(
                            "flex-1 text-sm font-medium",
                            selected ? "text-brand-teal-700 dark:text-brand-teal-300" : "text-foreground",
                          )}
                        >
                          {option}
                        </TextV1>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <Textarea
                  accessibilityLabel={`Answer ${index + 1}`}
                  className="mt-3"
                  placeholder="Write your answer…"
                  value={a?.text ?? ""}
                  onChangeText={(text) => setAnswer(q, { text })}
                />
              )}
            </View>
          );
        })}

        {saveState !== "idle" ? (
          <TextV1 className={cn("text-xs", saveState === "error" ? "text-error-600" : "text-muted-foreground")}>
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Not saved"}
          </TextV1>
        ) : null}
        {saveState === "error" ? (
          <ButtonV1 variant="outline" size="sm" className="self-start" onPress={() => void flush()}>
            Retry save
          </ButtonV1>
        ) : null}
        {submitError ? <TextV1 className="text-xs text-error-600">{submitError}</TextV1> : null}
        <ButtonV1
          className="self-start"
          disabled={!isComplete || save.isPending || submit.isPending}
          onPress={() => setConfirmOpen(true)}
        >
          Submit quiz
        </ButtonV1>
        {!isComplete ? (
          <TextV1 className="text-xs text-muted-foreground">Answer every question to submit.</TextV1>
        ) : null}
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Submit quiz?"
          description="You can't change your answers after submitting."
          confirmLabel="Submit"
          pending={submit.isPending}
          onConfirm={() => {
            setConfirmOpen(false);
            void onSubmit();
          }}
        />
      </View>
    </ShellFrame>
  );
}

function StudentRunner({ id }: { id: number }) {
  const { data, isPending, isError, refetch } = useStudentQuizDetail(id);
  const start = useStartAttempt(id);
  const [startError, setStartError] = useState<string | null>(null);

  if (isPending || isError) {
    return (
      <ShellFrame>{isPending ? <RouteSkeleton /> : <RouteError onRetry={() => void refetch()} />}</ShellFrame>
    );
  }

  if (data.status === "IN_PROGRESS") return <AttemptForm detail={data} id={id} />;
  if (data.status === "GRADED" || data.status === "SUBMITTED") return <ResultView detail={data} />;

  const n = data.questions.length;
  return (
    <ShellFrame>
      <View className="flex-col gap-3">
        <QuizHeader detail={data} />
        <View className="flex-col gap-3 rounded-2xl border border-border bg-card p-5" style={shadowStyle("soft")}>
          <TextV1 className="text-sm text-muted-foreground">
            {`${n} question${n === 1 ? "" : "s"} · ${data.maxScore} points. You have one attempt — answer every question before submitting.`}
          </TextV1>
          {/* The only thing that creates an attempt — never a render (ruling C6). */}
          <ButtonV1
            className="self-start"
            disabled={start.isPending}
            onPress={() => {
              setStartError(null);
              start.mutate(undefined, {
                onError: (err) => setStartError(apiErrorMessage(err, "Couldn't start the quiz.")),
              });
            }}
          >
            {start.isPending ? "Starting…" : "Start quiz"}
          </ButtonV1>
          {startError ? <TextV1 className="text-xs text-error-600">{startError}</TextV1> : null}
        </View>
      </View>
    </ShellFrame>
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
        {data.canManage ? (
          <Button
            title="Edit quiz"
            variant="secondary"
            onPress={() => router.push({ pathname: "/quiz/[id]/edit", params: { id: String(id) } })}
          />
        ) : null}
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
