import { useRouter } from "expo-router";
import { View } from "react-native";

import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { ShellFrame } from "../../design/layout/shell-frame";
import { Button } from "../../design/ui/button";
import { Card } from "../../design/ui/card";
import { Text } from "../../design/ui/text";
import { useQuizAuthoringDetail } from "../../hooks/use-quizzes";
import { ReleaseResultsCard } from "../quiz-grade/release-results";

/** LEADER / ADMIN / SUPER: the quiz's questions with the answer key, plus Grade and Edit. */
export function StaffPreview({ id }: { id: number }) {
  const router = useRouter();
  const { data, isPending, isError, refetch } = useQuizAuthoringDetail(id, true);

  if (isPending) {
    return (
      <ShellFrame>
        <RouteSkeleton />
      </ShellFrame>
    );
  }
  if (isError) {
    return (
      <ShellFrame>
        <RouteError onRetry={() => void refetch()} />
      </ShellFrame>
    );
  }

  return (
    <ShellFrame>
      <View className="flex-col gap-2">
        <Card className="flex-col gap-2 p-4">
          <Text className="text-lg font-semibold">{data.title}</Text>
          <Text className="text-sm font-medium text-muted-foreground">
            {data.kind === "PAPER" ? "Paper" : data.publishedAt === null ? "Online · Draft" : "Online · Published"}
          </Text>
          <Button size="lg" onPress={() => router.push({ pathname: "/quiz/[id]/grade", params: { id: String(id) } })}>
            Grade this quiz
          </Button>
          {data.canManage ? (
            <Button
              size="lg"
              variant="secondary"
              onPress={() => router.push({ pathname: "/quiz/[id]/edit", params: { id: String(id) } })}
            >
              Edit quiz
            </Button>
          ) : null}
        </Card>
        <ReleaseResultsCard quiz={data} />
        {data.kind === "PAPER" ? (
          <Text>This is a paper quiz — there are no questions to preview.</Text>
        ) : (
          data.questions.map((q, index) => (
            <Card key={q.id} className="p-4">
              <Text className="text-xs text-muted-foreground">{`Question ${index + 1}`}</Text>
              <Text className="text-sm font-medium">{q.prompt}</Text>
              <Text className="text-xs text-muted-foreground">
                {`${q.points} ${q.points === 1 ? "point" : "points"}`}
              </Text>
              {q.options.map((option, optionIndex) => (
                <Text key={optionIndex}>{`${optionIndex + 1}. ${option}`}</Text>
              ))}
              {q.correctIndex !== null && q.options[q.correctIndex] !== undefined ? (
                <Text className="text-sm font-medium">{`Correct answer: ${q.options[q.correctIndex]}`}</Text>
              ) : null}
            </Card>
          ))
        )}
      </View>
    </ShellFrame>
  );
}
