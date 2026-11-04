import { Check } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import type { QuizQuestionStudent, StudentQuizDetail } from "@space/shared";

import { ShellFrame } from "../../design/layout/shell-frame";
import { cn } from "../../design/lib/cn";
import { iconWithClassName } from "../../design/lib/icon";
import {
  Badge,
  Button as ButtonV1,
  ConfirmDialog,
  Text as TextV1,
  Textarea,
} from "../../design/ui";
import { useSubmitAttempt } from "../../hooks/use-quizzes";
import { apiErrorMessage } from "../../lib/api-error";
import { QCARD, QuizHeader } from "./quiz-header";
import { useQuizAnswers, type Answer } from "./use-quiz-answers";

iconWithClassName(Check);

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
        <TextV1 className="text-xs font-bold text-muted-foreground">{`Q${index + 1}`}</TextV1>
        <Badge variant={q.type === "MCQ" ? "teal" : "outline"}>
          {q.type === "MCQ" ? "Multiple choice" : "Essay"}
        </Badge>
        <TextV1 className="text-xs text-muted-foreground">{`${q.points} pt${q.points === 1 ? "" : "s"}`}</TextV1>
      </View>
      <TextV1 className="mt-2 text-sm font-semibold text-brand-navy-900 dark:text-foreground">
        {q.prompt}
      </TextV1>
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
                  "flex-row items-center gap-3 rounded-[14px] border px-4 py-3",
                  selected ? "border-ring bg-accent" : "border-control-border bg-surface",
                )}
              >
                <View
                  className={cn(
                    "size-5 shrink-0 items-center justify-center rounded-full border",
                    selected ? "border-brand-teal-600 bg-brand-teal-600" : "border-control-border",
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
          onChangeText={(text) => onChange({ text })}
        />
      )}
    </View>
  );
}

export function AttemptForm({ detail, id }: { detail: StudentQuizDetail; id: number }) {
  const { answers, setAnswer, flush, saveState, isComplete, savePending } = useQuizAnswers(
    detail,
    id,
  );
  const submit = useSubmitAttempt(id);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

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
        {detail.questions.map((q, index) => (
          <AttemptQuestion
            key={q.id}
            q={q}
            index={index}
            answer={answers[q.id]}
            onChange={(patch) => setAnswer(q, patch)}
          />
        ))}

        {saveState !== "idle" ? (
          <TextV1
            className={cn(
              "text-xs",
              saveState === "error" ? "text-error-600" : "text-muted-foreground",
            )}
          >
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
          disabled={!isComplete || savePending || submit.isPending}
          onPress={() => setConfirmOpen(true)}
        >
          Submit quiz
        </ButtonV1>
        {!isComplete ? (
          <TextV1 className="text-xs text-muted-foreground">
            Answer every question to submit.
          </TextV1>
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
