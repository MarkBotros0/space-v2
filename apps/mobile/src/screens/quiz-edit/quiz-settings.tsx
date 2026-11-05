import { useState } from "react";
import { View } from "react-native";
import type { QuizAuthoringDetail } from "@space/shared";

import { Button, Input, Text } from "../../design/ui";
import { useUpdateQuiz } from "../../hooks/use-quiz-authoring";
import { apiErrorMessage } from "../../lib/api-error";

/** V2-ONLY (v1's builder had no settings block): rename and, for paper, the max score. */
export function QuizSettings({
  quiz,
  onError,
}: {
  quiz: QuizAuthoringDetail;
  onError: (m: string | null) => void;
}) {
  const update = useUpdateQuiz(quiz.id);
  const [title, setTitle] = useState(quiz.title);
  const [maxScore, setMaxScore] = useState(String(quiz.maxScore));

  const save = (body: { title?: string; maxScore?: number }) => {
    onError(null);
    update.mutate(body, {
      onError: (err) => onError(apiErrorMessage(err, "Couldn't save the quiz.")),
    });
  };

  return (
    <View className="flex-col gap-3 rounded-group bg-surface dark:border dark:border-separator p-4">
      <View className="flex-col gap-1">
        <Text className="text-xs font-semibold text-muted-foreground">Quiz title</Text>
        <Input accessibilityLabel="Quiz title" value={title} onChangeText={setTitle} />
      </View>
      <Button
        className="self-start"
        variant="outline"
        size="sm"
        disabled={update.isPending}
        onPress={() => save({ title })}
      >
        Save title
      </Button>
      {quiz.kind === "PAPER" ? (
        <>
          {/* Refused server-side once grades exist (quiz_has_grades). */}
          <View className="flex-col gap-1">
            <Text className="text-xs font-semibold text-muted-foreground">Max score</Text>
            <Input
              accessibilityLabel="Max score"
              value={maxScore}
              onChangeText={setMaxScore}
              keyboardType="number-pad"
            />
          </View>
          <Button
            className="self-start"
            variant="outline"
            size="sm"
            onPress={() => save({ maxScore: Number(maxScore) })}
          >
            Save max score
          </Button>
        </>
      ) : null}
    </View>
  );
}
