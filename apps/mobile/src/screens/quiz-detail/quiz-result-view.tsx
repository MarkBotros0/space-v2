import { View } from "react-native";
import type { QuizQuestionStudent, StudentQuizDetail } from "@space/shared";

import { Screen } from "../../design/layout/screen";
import { StatTile, StatusChip, Text, statusChip, type ChipSpec } from "../../design/ui";
import { QCARD, quizTitleProps } from "./quiz-header";

/**
 * Correctness as a word on every question (the chip is never colour alone). The
 * student is told which MCQ was wrong, never what was right (R34).
 */
function questionChip(q: QuizQuestionStudent): ChipSpec {
  if (q.type === "MCQ") {
    if (q.isCorrect === null) return { tone: "neutral", label: "Not graded yet" };
    return q.isCorrect ? { tone: "ok", label: "Correct" } : { tone: "bad", label: "Incorrect" };
  }
  return q.pointsAwarded !== null
    ? { tone: "ok", label: "Graded" }
    : { tone: "warn", label: "Awaiting grading" };
}

/** v1 Result: SUBMITTED and GRADED both list the answers (B2-15). */
export function ResultView({ detail }: { detail: StudentQuizDetail }) {
  const graded = detail.status === "GRADED";
  return (
    <Screen {...quizTitleProps(detail)}>
      <View className="flex-col gap-3">
        <View className="flex-col gap-3 rounded-group bg-surface p-5">
          <View className="flex-row flex-wrap items-center gap-1.5">
            <StatusChip {...statusChip("quizAttempt", graded ? "GRADED" : "SUBMITTED")} />
            {graded ? null : <StatusChip tone="warn" label="Pending" />}
          </View>
          <Text variant="subhead" className="text-muted-foreground">
            {graded ? "Your quiz has been graded." : "Awaiting grading for the written answers."}
          </Text>
          {graded ? (
            <View className="flex-row">
              <StatTile value={detail.totalScore ?? 0} suffix={`/${detail.maxScore}`} label="Score" />
            </View>
          ) : null}
        </View>
        {detail.questions.map((q, index) => (
          <View key={q.id} className={QCARD}>
            <View className="flex-row flex-wrap items-center justify-between gap-2">
              <Text variant="caption" className="font-bold text-muted-foreground">{`Q${index + 1}`}</Text>
              <View className="flex-row flex-wrap items-center gap-2">
                <Text variant="caption" tabular className="text-muted-foreground">
                  {q.pointsAwarded !== null ? `${q.pointsAwarded}/${q.points} pts` : `${q.points} pts`}
                </Text>
                <StatusChip {...questionChip(q)} />
              </View>
            </View>
            <Text variant="headline" className="mt-1">
              {q.prompt}
            </Text>
            {q.type === "MCQ" ? (
              <Text variant="subhead" className="mt-1 text-muted-foreground">
                {`Your answer: ${q.selectedIndex !== null ? (q.options[q.selectedIndex] ?? "—") : "—"}`}
              </Text>
            ) : (
              <Text variant="subhead" className="mt-1 rounded-control bg-muted/40 px-3 py-2 text-foreground">
                {q.text || "—"}
              </Text>
            )}
          </View>
        ))}
      </View>
    </Screen>
  );
}
