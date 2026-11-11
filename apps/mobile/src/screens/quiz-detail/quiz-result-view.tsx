import { TriangleAlert } from "lucide-react-native";
import { View } from "react-native";
import type { StudentQuizDetail } from "@space/shared";

import { Screen } from "../../design/layout/screen";
import { iconWithClassName } from "../../design/lib/icon";
import { StatTile, StatusChip, Text } from "../../design/ui";
import { formatScore } from "../../lib/format";
import { QuestionReview } from "./review/question-review";
import { quizTitleProps } from "./quiz-header";

iconWithClassName(TriangleAlert);

/** The third exit closed it (docs/superpowers/plans/2026-11-10-quiz-integrity.md "Global Constraints"). */
const ENDED_BY_EXITS =
  "Your attempt has ended because you left the quiz. Your answers were submitted. Ask your leader if this was a mistake.";

/**
 * Where the student stands after handing in (owner, 2026-11-10): submitted shows only that; graded
 * shows the score; answers adds the review. Questions are drawn from the `answers` stage ONLY:
 * whatever the cache still holds from the attempt is never shown before then.
 */
export function ResultView({ detail }: { detail: StudentQuizDetail }) {
  const stage = detail.stage;
  const submitted = stage === "submitted";
  return (
    <Screen {...quizTitleProps(detail)}>
      <View className="flex-col gap-3">
        <View className="flex-col gap-3 rounded-group bg-surface p-5">
          {submitted ? <StatusChip tone="neutral" label="Submitted" /> : <StatusChip tone="ok" label="Graded" />}
          {detail.endReason === "ENDED_BY_EXITS" ? (
            <View className="flex-row gap-2">
              <TriangleAlert
                size={18}
                className="mt-0.5 text-bad"
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
              <Text variant="subhead" className="flex-1">
                {ENDED_BY_EXITS}
              </Text>
            </View>
          ) : null}
          <Text variant="subhead" className="text-muted-foreground">
            {submitted
              ? "Your score appears once it's marked."
              : stage === "graded"
                ? "Answers appear when your admin releases them."
                : "Your answers are marked below."}
          </Text>
          {detail.totalScore !== null && !submitted ? (
            <View className="flex-row">
              <StatTile
                value={formatScore(detail.totalScore)}
                suffix={` / ${formatScore(detail.maxScore)}`}
                label="Score"
              />
            </View>
          ) : null}
        </View>
        {stage === "answers"
          ? detail.questions.map((q, index) => <QuestionReview key={q.id} q={q} index={index} />)
          : null}
      </View>
    </Screen>
  );
}
