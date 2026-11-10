import { Check, X } from "lucide-react-native";
import { Pressable, View } from "react-native";
import type { StudentVideoQuestion } from "@space/shared";

import { cn } from "../../design/lib/cn";
import { iconWithClassName } from "../../design/lib/icon";
import { Button, Modal, ModalContent, ModalHeader, ModalTitle, Text } from "../../design/ui";

iconWithClassName(Check, X);

export interface AnswerFeedback {
  isCorrect: boolean;
  correctIndex: number;
}

/**
 * The question at the barrier. v1's QuestionModal ignores dismissal: no ×,
 * inert backdrop. The Android back button is an explicit exit — left alone it
 * would delete the gate (spec 13 §10 D15).
 */
export function VideoQuestionModal({
  question,
  feedback,
  pending,
  answerError,
  onAnswer,
  onContinue,
  onLeave,
}: {
  question: StudentVideoQuestion | null;
  feedback: AnswerFeedback | null;
  pending: boolean;
  answerError: string | null;
  onAnswer: (selectedIndex: number) => void;
  onContinue: () => void;
  onLeave: () => void;
}) {
  return (
    <Modal
      open={question !== null}
      onOpenChange={(next) => {
        if (!next) onLeave();
      }}
    >
      <ModalContent dismissible={false}>
        {question !== null ? (
          <>
            <ModalHeader>
              <ModalTitle>{question.prompt}</ModalTitle>
            </ModalHeader>
            <View className="flex-col gap-2">
              {question.options.map((option, index) => {
                const correct = feedback !== null && index === feedback.correctIndex;
                return (
                  <Pressable
                    key={`${question.id}-${index}`}
                    accessibilityRole="button"
                    disabled={pending || feedback !== null}
                    onPress={() => onAnswer(index)}
                    className={cn(
                      "flex-row items-center justify-between gap-2 rounded-control border px-4 py-3",
                      correct
                        ? "border-success-600 bg-success-600/10"
                        : "border-control-border bg-surface active:border-ring",
                    )}
                  >
                    <Text
                      className={cn(
                        "flex-1 text-sm font-medium",
                        correct ? "text-success-700 dark:text-success-300" : "text-foreground",
                      )}
                    >
                      {option}
                    </Text>
                    {correct ? <Check size={16} className="shrink-0 text-success-700 dark:text-success-300" /> : null}
                  </Pressable>
                );
              })}
              {answerError ? <Text className="text-xs text-error-600">{answerError}</Text> : null}
              {feedback !== null ? (
                <View className="mt-2 flex-col gap-3">
                  {feedback.isCorrect ? (
                    <View className="flex-row items-center gap-2">
                      <Check size={16} className="text-success-700 dark:text-success-300" />
                      <Text className="text-sm font-bold text-success-700 dark:text-success-300">Correct!</Text>
                    </View>
                  ) : (
                    <View className="flex-row items-center gap-2">
                      <X size={16} className="text-error-600" />
                      <Text className="flex-1 text-sm font-bold text-error-600">
                        Not quite — the correct answer is highlighted.
                      </Text>
                    </View>
                  )}
                  <Button onPress={onContinue}>Continue</Button>
                </View>
              ) : null}
              <Button variant="plain" onPress={onLeave}>
                Leave the quiz
              </Button>
            </View>
          </>
        ) : null}
      </ModalContent>
    </Modal>
  );
}
