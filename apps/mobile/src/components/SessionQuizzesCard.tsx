import { useRouter } from "expo-router";
import { Pressable } from "react-native";

import { useSessionQuizzes } from "../hooks/use-session-quizzes";
import { useTheme } from "../theme";
import { Card, ErrorState, Text } from "../ui";

/**
 * The session's quizzes for staff (G18; v1 leader/sessions/[id] shows the
 * card only when there are quizzes). A row opens the quiz's staff preview
 * (`/quiz/[id]`, Plan 8 Task 11b). Renders nothing while loading or when empty.
 */
export function SessionQuizzesCard({ sessionId }: { sessionId: number }) {
  const theme = useTheme();
  const router = useRouter();
  const quizzes = useSessionQuizzes(sessionId, true);
  if (quizzes.isPending) return null;
  if (quizzes.isError) {
    return (
      <Card style={{ marginTop: theme.spacing.md }}>
        <ErrorState message="Couldn't load this session's quizzes." onRetry={() => void quizzes.refetch()} />
      </Card>
    );
  }
  if (quizzes.data.length === 0) return null;
  return (
    <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
      <Text variant="heading">Quizzes</Text>
      {quizzes.data.map((q) => (
        <Pressable
          key={q.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/quiz/[id]", params: { id: String(q.id) } })}
        >
          <Text variant="body">{q.title}</Text>
          <Text variant="caption" color={theme.colors.neutral[600]}>
            {q.kind === "ONLINE" && q.publishedAt === null ? `Max score: ${q.maxScore} · Draft` : `Max score: ${q.maxScore}`}
          </Text>
        </Pressable>
      ))}
    </Card>
  );
}
