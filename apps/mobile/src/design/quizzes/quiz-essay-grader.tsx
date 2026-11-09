/**
 * Port of v1 components/quizzes/quiz-essay-grader.tsx, as the body of one
 * attempt's sheet. v2 differences (B3-11): the server is the bound on marks
 * (D7), so the client only checks for whole numbers, with v1's message;
 * "Reopen retake" shows on SUBMITTED attempts too, for every grader (spec 12 D5).
 * The sheet owns the awards and the save; this draws the answers and the essay inputs.
 */
import type { QuizGradingAttempt } from "@space/shared";
import { Check, RotateCcw, X } from "lucide-react-native";
import { View } from "react-native";

import { cn } from "../lib/cn";
import { iconWithClassName } from "../lib/icon";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Text } from "../ui/text";

iconWithClassName(Check, X, RotateCcw);

type EssayAwards = Record<number, string>;

/** The essay marks as typed so far, seeded from what the server holds. */
export function initialAwards(attempt: QuizGradingAttempt): EssayAwards {
  const init: EssayAwards = {};
  for (const a of attempt.answers) {
    if (a.type === "ESSAY") init[a.questionId] = a.pointsAwarded === null ? "" : String(a.pointsAwarded);
  }
  return init;
}

/**
 * Every essay, always: the server refuses a partial payload (awards_incomplete).
 * Returns the payload, or the message to show.
 */
export function parseAwards(
  attempt: QuizGradingAttempt,
  awards: EssayAwards,
): { awards: { questionId: number; points: number }[] } | { error: string } {
  const parsed: { questionId: number; points: number }[] = [];
  for (const a of attempt.answers) {
    if (a.type !== "ESSAY") continue;
    const raw = (awards[a.questionId] ?? "").trim();
    if (!/^\d+$/.test(raw)) return { error: `Enter 0–${a.points} points for each written answer.` };
    parsed.push({ questionId: a.questionId, points: Number(raw) });
  }
  return { awards: parsed };
}

export function ReopenButton({ onPress, disabled }: { onPress: () => void; disabled: boolean }) {
  return (
    <Button size="sm" variant="secondary" className="self-start" onPress={onPress} disabled={disabled}>
      <RotateCcw size={16} className="text-foreground" />
      Reopen retake
    </Button>
  );
}

export function QuizAttemptAnswers({
  attempt,
  awards,
  onAward,
}: {
  attempt: QuizGradingAttempt;
  awards: EssayAwards;
  onAward: (questionId: number, value: string) => void;
}) {
  return (
    <View className="flex-col gap-3">
      {attempt.answers.map((a, i) => (
        <View key={a.questionId} className={cn(i > 0 && "border-t border-separator pt-3")}>
          <Text variant="subhead" className="font-semibold text-foreground">
            {a.prompt}
          </Text>
          {a.type === "MCQ" ? (
            <View className="mt-1 flex-row items-center gap-2">
              {a.isCorrect ? <Check size={16} className="text-ok" /> : <X size={16} className="text-bad" />}
              <Text variant="subhead" className="shrink text-muted-foreground">
                {a.selectedIndex !== null ? (a.options[a.selectedIndex] ?? "—") : "—"}
                {a.correctIndex !== null && !a.isCorrect ? (
                  <Text variant="subhead" className="text-ok">{` (correct: ${a.options[a.correctIndex] ?? ""})`}</Text>
                ) : null}
              </Text>
              <Text
                variant="caption"
                tabular
                className="ml-auto text-muted-foreground"
              >{`${a.pointsAwarded ?? 0}/${a.points}`}</Text>
            </View>
          ) : (
            <View className="mt-1 flex-col gap-2">
              <Text variant="subhead" className="rounded-control bg-surface-raised px-3 py-2 text-foreground">
                {a.text || "—"}
              </Text>
              <View className="flex-row flex-wrap items-center gap-2">
                <Text variant="caption" className="font-medium text-muted-foreground">
                  Points
                </Text>
                <Input
                  accessibilityLabel={`Marks for ${a.prompt}`}
                  keyboardType="number-pad"
                  value={awards[a.questionId] ?? ""}
                  onChangeText={(v) => onAward(a.questionId, v)}
                  className="w-20"
                />
                <Text variant="caption" className="text-muted-foreground">{`/ ${a.points}`}</Text>
              </View>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}
