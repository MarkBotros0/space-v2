import { Check, Clock, X } from "lucide-react-native";
import { View } from "react-native";
import type { StudentQuizDetail } from "@space/shared";

import { Eyebrow } from "../../design/layout/page-title";
import { ShellFrame } from "../../design/layout/shell-frame";
import { iconWithClassName } from "../../design/lib/icon";
import { Badge, Text as TextV1 } from "../../design/ui";
import { QCARD, QuizHeader } from "./quiz-header";

iconWithClassName(Check, Clock, X);

/** v1 Result: SUBMITTED and GRADED both list the answers (B2-15). */
export function ResultView({ detail }: { detail: StudentQuizDetail }) {
  const graded = detail.status === "GRADED";
  return (
    <ShellFrame>
      <View className="flex-col gap-3">
        <QuizHeader detail={detail} />
        <View
          className="flex-row items-center justify-between rounded-group bg-surface dark:border dark:border-separator p-5"
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
              <TextV1 className="text-2xl font-black text-brand-teal-800 dark:text-brand-teal-300">
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
          <View key={q.id} className={QCARD}>
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
                  {q.pointsAwarded !== null
                    ? `${q.pointsAwarded}/${q.points} pts`
                    : `${q.points} pts`}
                </TextV1>
              )}
            </View>
            <TextV1 className="mt-1 text-sm font-semibold text-brand-navy-900 dark:text-foreground">
              {q.prompt}
            </TextV1>
            {q.type === "MCQ" ? (
              <TextV1 className="mt-1 text-sm text-muted-foreground">
                {`Your answer: ${q.selectedIndex !== null ? (q.options[q.selectedIndex] ?? "—") : "—"}`}
              </TextV1>
            ) : (
              <TextV1 className="mt-1 rounded-control bg-muted/40 px-3 py-2 text-sm text-foreground">
                {q.text || "—"}
              </TextV1>
            )}
          </View>
        ))}
      </View>
    </ShellFrame>
  );
}
