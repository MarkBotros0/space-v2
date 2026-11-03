import { useRouter } from "expo-router";

import { useQuizAuthoringDetail } from "../../hooks/use-quizzes";
import { useTheme } from "../../theme";
import { Button, Card, ErrorState, LoadingState, Screen, Text } from "../../ui";

/** LEADER / ADMIN / SUPER: the quiz's questions with the answer key, plus Grade and Edit. */
export function StaffPreview({ id }: { id: number }) {
  const theme = useTheme();
  const router = useRouter();
  const { data, isPending, isError, refetch } = useQuizAuthoringDetail(id, true);

  if (isPending) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <LoadingState />
      </Screen>
    );
  }
  if (isError) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <ErrorState message="Couldn't load this quiz." onRetry={refetch} />
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      <Card style={{ marginBottom: theme.spacing.sm, gap: theme.spacing.sm }}>
        <Text variant="heading">{data.title}</Text>
        <Text variant="label" color={theme.colors.neutral[600]}>
          {data.kind === "PAPER"
            ? "Paper"
            : data.publishedAt === null
              ? "Online · Draft"
              : "Online · Published"}
        </Text>
        <Button
          title="Grade this quiz"
          onPress={() => router.push({ pathname: "/quiz/[id]/grade", params: { id: String(id) } })}
        />
        {data.canManage ? (
          <Button
            title="Edit quiz"
            variant="secondary"
            onPress={() => router.push({ pathname: "/quiz/[id]/edit", params: { id: String(id) } })}
          />
        ) : null}
      </Card>
      {data.kind === "PAPER" ? (
        <Text variant="body">This is a paper quiz — there are no questions to preview.</Text>
      ) : (
        data.questions.map((q, index) => (
          <Card key={q.id} style={{ marginBottom: theme.spacing.sm }}>
            <Text
              variant="caption"
              color={theme.colors.neutral[600]}
            >{`Question ${index + 1}`}</Text>
            <Text variant="label">{q.prompt}</Text>
            <Text variant="caption" color={theme.colors.neutral[600]}>
              {`${q.points} ${q.points === 1 ? "point" : "points"}`}
            </Text>
            {q.options.map((option, optionIndex) => (
              <Text key={optionIndex} variant="body">{`${optionIndex + 1}. ${option}`}</Text>
            ))}
            {q.correctIndex !== null && q.options[q.correctIndex] !== undefined ? (
              <Text variant="label">{`Correct answer: ${q.options[q.correctIndex]}`}</Text>
            ) : null}
          </Card>
        ))
      )}
    </Screen>
  );
}
