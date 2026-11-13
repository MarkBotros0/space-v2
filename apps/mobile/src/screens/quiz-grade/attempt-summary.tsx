/**
 * The top of the attempt sheet (owner, 2026-11-13: "make the button in the top"): where the attempt
 * stands, its score, and what can be done to it, before the answers. "Allow a retake" (was "Reopen
 * retake") asks first, inline: a second modal over the sheet is dropped on iOS. The admin's own
 * score (plan 4) shows here with Enter / Edit score for the season's admin.
 */
import type { QuizGradingAttempt } from "@space/shared";
import { RotateCcw } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";

import { adminScoreLabel } from "./attempt-subtitle";
import { iconWithClassName } from "../../design/lib/icon";
import { Button } from "../../design/ui/button";
import { StatusChip, type ChipSpec } from "../../design/ui/status-chip";
import { Text } from "../../design/ui/text";
import { formatDate, formatScore } from "../../lib/format";

iconWithClassName(RotateCcw);

const RETAKE_LABEL = "Allow a retake";

/** The attempt's standing as a word and a tone; never the tone alone. */
function attemptStanding(status: QuizGradingAttempt["status"]): ChipSpec {
  if (status === "GRADED") return { tone: "ok", label: "Graded" };
  if (status === "IN_PROGRESS") return { tone: "info", label: "In progress" };
  return { tone: "warn", label: "Waiting for marking" };
}

/** The retake action, with its icon. Shared with the live screen's row sheet. */
export function RetakeButton({ onPress, disabled }: { onPress: () => void; disabled: boolean }) {
  return (
    <Button size="sm" variant="secondary" onPress={onPress} disabled={disabled}>
      <RotateCcw size={16} className="text-foreground" />
      {RETAKE_LABEL}
    </Button>
  );
}

export function AttemptSummary({
  attempt,
  maxScore,
  canScore,
  onScore,
  onRetake,
  retaking,
}: {
  attempt: QuizGradingAttempt;
  maxScore: number;
  canScore: boolean;
  onScore: () => void;
  onRetake: () => void;
  retaking: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const graded = attempt.status === "GRADED";
  // A student with the admin's score has no retake: the server refuses one until it is cleared.
  const mayRetake = attempt.status !== "IN_PROGRESS" && attempt.adminScore === null;
  const admin = attempt.adminScore;
  const when = attempt.submittedAt ? ` · ${formatDate(attempt.submittedAt)}` : "";
  return (
    <View className="flex-col gap-3 rounded-group bg-background p-4">
      <View className="flex-row flex-wrap items-center gap-2">
        <StatusChip {...attemptStanding(attempt.status)} />
        <Text variant="caption" className="text-muted-foreground">{`Attempt ${attempt.attemptNumber}${when}`}</Text>
      </View>
      <Text variant="title" tabular>
        {graded ? `${formatScore(attempt.totalScore ?? 0)} / ${maxScore}` : `Out of ${maxScore}`}
      </Text>
      {admin ? <Text variant="subhead">{adminScoreLabel(admin.score, maxScore)}</Text> : null}
      {asking ? (
        <View className="flex-col gap-2">
          <Text variant="subhead">
            {`Give ${attempt.studentName ?? "this student"} a fresh attempt? This one stays here, and their best score counts.`}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <Button size="sm" variant="plain" onPress={() => setAsking(false)} disabled={retaking}>
              Cancel
            </Button>
            <Button size="sm" onPress={onRetake} loading={retaking}>
              {RETAKE_LABEL}
            </Button>
          </View>
        </View>
      ) : mayRetake || canScore ? (
        <View className="flex-row flex-wrap gap-2">
          {mayRetake ? <RetakeButton onPress={() => setAsking(true)} disabled={retaking} /> : null}
          {canScore ? (
            <Button variant="secondary" size="sm" onPress={onScore}>
              {admin ? "Edit manual score" : "Enter score manually"}
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
