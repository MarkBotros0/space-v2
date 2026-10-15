/**
 * Port of v1 components/quizzes/quiz-essay-grader.tsx (one attempt card).
 * v2 differences (B3-11): the server is the bound on marks (D7), so the
 * client only checks for whole numbers, with v1's message; "Reopen retake"
 * shows on SUBMITTED attempts too, for every grader (spec 12 D5).
 */
import type { QuizGradingAttempt } from "@space/shared";
import { Check, RotateCcw, X } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";

import { cn } from "../lib/cn";
import { iconWithClassName } from "../lib/icon";
import { shadowStyle } from "../lib/shadow";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Text } from "../ui/text";

iconWithClassName(Check, X, RotateCcw);

const NAVY = "text-brand-navy-900 dark:text-foreground";

export function ReopenButton({ onPress, disabled }: { onPress: () => void; disabled: boolean }) {
  return (
    <Button size="sm" variant="outline" onPress={onPress} disabled={disabled}>
      <RotateCcw size={16} className="text-foreground" />
      Reopen retake
    </Button>
  );
}

export function QuizAttemptCard({
  attempt,
  maxScore,
  hasEssays,
  saving,
  reopening,
  error,
  onSave,
  onReopen,
}: {
  attempt: QuizGradingAttempt;
  maxScore: number;
  hasEssays: boolean;
  saving: boolean;
  reopening: boolean;
  error: string | null;
  onSave: (awards: { questionId: number; points: number }[]) => void;
  onReopen: () => void;
}) {
  const [awards, setAwards] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    for (const a of attempt.answers) {
      if (a.type === "ESSAY") init[a.questionId] = a.pointsAwarded === null ? "" : String(a.pointsAwarded);
    }
    return init;
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const graded = attempt.status === "GRADED";

  const save = () => {
    setLocalError(null);
    // Every essay, always: the server refuses a partial payload (awards_incomplete).
    const parsed: { questionId: number; points: number }[] = [];
    for (const a of attempt.answers) {
      if (a.type !== "ESSAY") continue;
      const raw = (awards[a.questionId] ?? "").trim();
      if (!/^\d+$/.test(raw)) {
        setLocalError(`Enter 0–${a.points} points for each written answer.`);
        return;
      }
      parsed.push({ questionId: a.questionId, points: Number(raw) });
    }
    onSave(parsed);
  };

  const shownError = localError ?? error;
  return (
    <View className="rounded-2xl border border-border bg-card p-4" style={shadowStyle("soft")}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className={`text-sm font-bold ${NAVY}`}>{attempt.studentName ?? "Student"}</Text>
          <Text className="text-xs text-muted-foreground">
            {`Attempt ${attempt.attemptNumber} · ${graded ? `Graded · ${attempt.totalScore ?? 0}/${maxScore}` : "Awaiting grading"}`}
          </Text>
        </View>
        <Badge variant={graded ? "success" : "warning"}>{graded ? "Graded" : "Submitted"}</Badge>
      </View>

      <View className="mt-3 flex-col gap-3">
        {attempt.answers.map((a, i) => (
          <View key={a.questionId} className={cn(i > 0 && "border-t border-border pt-3")}>
            <Text className={`text-sm font-semibold ${NAVY}`}>{a.prompt}</Text>
            {a.type === "MCQ" ? (
              <View className="mt-1 flex-row items-center gap-2">
                {a.isCorrect ? (
                  <Check size={16} className="text-success-600" />
                ) : (
                  <X size={16} className="text-error-600" />
                )}
                <Text className="shrink text-sm text-muted-foreground">
                  {a.selectedIndex !== null ? (a.options[a.selectedIndex] ?? "—") : "—"}
                  {a.correctIndex !== null && !a.isCorrect ? (
                    <Text className="text-sm text-success-700 dark:text-success-300">{` (correct: ${a.options[a.correctIndex] ?? ""})`}</Text>
                  ) : null}
                </Text>
                <Text className="ml-auto text-xs text-muted-foreground">{`${a.pointsAwarded ?? 0}/${a.points}`}</Text>
              </View>
            ) : (
              <View className="mt-1 flex-col gap-2">
                <Text className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-foreground">{a.text || "—"}</Text>
                <View className="flex-row items-center gap-2">
                  <Text className="text-xs font-semibold text-muted-foreground">Points</Text>
                  <Input
                    size="sm"
                    accessibilityLabel={`Marks for ${a.prompt}`}
                    keyboardType="number-pad"
                    value={awards[a.questionId] ?? ""}
                    onChangeText={(v) => setAwards((prev) => ({ ...prev, [a.questionId]: v }))}
                    className="w-20"
                  />
                  <Text className="text-xs text-muted-foreground">{`/ ${a.points}`}</Text>
                </View>
              </View>
            )}
          </View>
        ))}
      </View>

      {shownError ? <Text className="mt-2 text-xs text-error-600">{shownError}</Text> : null}

      <View className="mt-3 flex-row flex-wrap gap-2">
        {hasEssays ? (
          <Button size="sm" onPress={save} disabled={saving}>
            {saving ? "Saving…" : graded ? "Update grade" : "Save grade"}
          </Button>
        ) : null}
        {attempt.status !== "IN_PROGRESS" ? <ReopenButton onPress={onReopen} disabled={reopening} /> : null}
      </View>
    </View>
  );
}
