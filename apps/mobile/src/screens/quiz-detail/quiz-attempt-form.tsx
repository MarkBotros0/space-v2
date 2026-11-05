import { Check } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import type { QuizQuestionStudent, StudentQuizDetail } from "@space/shared";

import { Screen } from "../../design/layout/screen";
import { SaveBar } from "../../design/layout/save-bar";
import { cn } from "../../design/lib/cn";
import { iconWithClassName } from "../../design/lib/icon";
import { Badge, ConfirmDialog, Text, Textarea } from "../../design/ui";
import { useSubmitAttempt } from "../../hooks/use-quizzes";
import { apiErrorMessage } from "../../lib/api-error";
import { useIsOnline } from "../../lib/online";
import { reportOutcome } from "../../lib/outcome";
import { QCARD, quizTitleProps } from "./quiz-header";
import { useQuizAnswers, type Answer } from "./use-quiz-answers";

iconWithClassName(Check);

const SUBMIT_FAILED = "Couldn't submit the quiz. Check your connection and try again.";

/** One question of the attempt: MCQ options as radios, an essay as a textarea. */
function AttemptQuestion({
  q,
  index,
  answer: a,
  onChange,
}: {
  q: QuizQuestionStudent;
  index: number;
  answer: Answer | undefined;
  onChange: (patch: { selectedIndex?: number | null; text?: string }) => void;
}) {
  return (
    <View className={QCARD}>
      <View className="flex-row items-center gap-2">
        <Text variant="caption" className="font-bold text-muted-foreground">{`Q${index + 1}`}</Text>
        <Badge variant={q.type === "MCQ" ? "teal" : "outline"}>
          {q.type === "MCQ" ? "Multiple choice" : "Essay"}
        </Badge>
        <Text variant="caption" className="text-muted-foreground">{`${q.points} pt${q.points === 1 ? "" : "s"}`}</Text>
      </View>
      <Text variant="headline" className="mt-2">
        {q.prompt}
      </Text>
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
                onPress={() => onChange({ selectedIndex: optionIndex })}
                className={cn(
                  "min-h-11 flex-row items-center gap-3 rounded-control border px-4 py-3",
                  selected ? "border-ring bg-accent" : "border-control-border bg-surface",
                )}
              >
                <View
                  className={cn(
                    "size-5 shrink-0 items-center justify-center rounded-full border",
                    selected ? "border-ring bg-ring" : "border-control-border",
                  )}
                >
                  {selected ? <Check size={12} className="text-primary-foreground" /> : null}
                </View>
                <Text
                  variant="subhead"
                  className={cn(
                    "min-w-0 flex-1 font-medium",
                    selected ? "text-accent-foreground" : "text-foreground",
                  )}
                >
                  {option}
                </Text>
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
          onChangeText={(text) => onChange({ text })}
        />
      )}
    </View>
  );
}

export function AttemptForm({ detail, id }: { detail: StudentQuizDetail; id: number }) {
  const { answers, setAnswer, flush, hasUnsentOffline, saveState, isComplete, savePending } =
    useQuizAnswers(detail, id);
  const submit = useSubmitAttempt(id);
  const online = useIsOnline();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const onSubmit = async () => {
    // The server checks completeness too (409 attempt_incomplete); the disabled
    // button is the courtesy, this is the rule.
    if (!isComplete) return;
    if (hasUnsentOffline()) {
      reportOutcome("error", SUBMIT_FAILED);
      return;
    }
    if (!(await flush())) {
      reportOutcome("error", "Couldn't save your answers, so the quiz wasn't submitted.");
      return;
    }
    submit.mutate(undefined, {
      // The screen swaps to the result as the cache updates, so the toast (global) is
      // what confirms it while the bar is still in view.
      onSuccess: () => reportOutcome("success", "Quiz submitted."),
      onError: (err) => reportOutcome("error", apiErrorMessage(err, SUBMIT_FAILED)),
    });
  };

  // Feedback lives in the pinned bar's hint, where it stays in view: how many
  // are answered, and the autosave state.
  const answered = detail.questions.filter((q) => {
    const a = answers[q.id];
    return q.type === "MCQ" ? a?.selectedIndex != null : (a?.text ?? "").trim().length > 0;
  }).length;
  const saveLabel =
    saveState === "saving" ? (online ? "Saving…" : "Waiting for connection") : saveState === "saved" ? "Saved" : saveState === "error" ? "Not saved" : null;
  const progress = `${answered} of ${detail.questions.length} answered`;
  const hint = [progress, saveLabel].filter(Boolean).join(" · ");

  return (
    <Screen
      {...quizTitleProps(detail)}
      footer={
        <SaveBar
          label="Submit quiz"
          hint={hint}
          disabled={!isComplete || savePending || submit.isPending}
          disabledReason={isComplete ? undefined : progress}
          loading={submit.isPending}
          onPress={() => setConfirmOpen(true)}
          secondary={
            saveState === "error" ? { label: "Retry save", onPress: () => void flush() } : undefined
          }
        />
      }
    >
      <View className="flex-col gap-3">
        {detail.questions.map((q, index) => (
          <AttemptQuestion
            key={q.id}
            q={q}
            index={index}
            answer={answers[q.id]}
            onChange={(patch) => setAnswer(q, patch)}
          />
        ))}
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
    </Screen>
  );
}
