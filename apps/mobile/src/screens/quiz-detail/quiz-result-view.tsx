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

type Stage = StudentQuizDetail["stage"];

/** The line under the chip; none for the admin's score without a graded attempt, which has no answers to wait for. */
function stageLine(stage: Stage, adminOnly: boolean): string | null {
  if (adminOnly) return null;
  if (stage === "submitted") return "Your score appears once it's marked.";
  return stage === "graded" ? "Answers appear when your admin releases them." : "Your answers are marked below.";
}

/**
 * Where the student stands after handing in (owner, 2026-11-10): submitted shows only that; graded
 * shows the score; answers adds the review. Questions are drawn from the `answers` stage ONLY:
 * whatever the cache still holds from the attempt is never shown before then. The admin's score
 * (plan 4) shows at once with its note, labelled as theirs; without a graded attempt of their own
 * there are no answers to wait for, so the release line is left out.
 */
export function ResultView({ detail }: { detail: StudentQuizDetail }) {
  const admin = detail.adminScore;
  const stage = admin ? (detail.stage === "answers" ? "answers" : "graded") : detail.stage;
  const submitted = stage === "submitted";
  const score = admin ? admin.score : detail.totalScore;
  // The admin's score with no graded attempt behind it: no answers to wait for.
  const line = stageLine(stage, admin !== null && detail.status !== "GRADED");
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
          {admin ? <Text variant="headline">Score entered by your admin</Text> : null}
          {line !== null ? (
            <Text variant="subhead" className="text-muted-foreground">
              {line}
            </Text>
          ) : null}
          {score !== null && !submitted ? (
            <View className="flex-row">
              <StatTile value={formatScore(score)} suffix={` / ${formatScore(detail.maxScore)}`} label="Score" />
            </View>
          ) : null}
          {admin?.notes ? <Text variant="body">{admin.notes}</Text> : null}
        </View>
        {stage === "answers"
          ? detail.questions.map((q, index) => <QuestionReview key={q.id} q={q} index={index} />)
          : null}
      </View>
    </Screen>
  );
}
