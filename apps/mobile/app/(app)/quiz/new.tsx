import { useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { createQuizRequestSchema, type QuizKind } from "@space/shared";

import { useCreateQuiz, type CreateQuizInput } from "../../../src/hooks/use-quiz-authoring";
import { useCurrentSeasonId } from "../../../src/hooks/use-seasons";
import { useSeasonSessions } from "../../../src/hooks/use-sessions";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { formatDayKey } from "../../../src/lib/format";
import { useSessionStore } from "../../../src/store/session";
import { useTheme } from "../../../src/theme";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text } from "../../../src/ui";

/**
 * v1 create-quiz-form.tsx, as a screen. Creating is a season-admin power
 * (POST /quizzes is isAdminOfSeason-gated), so only ADMIN/SUPER get the form;
 * the server stays the gate. Defaults mirror v1: PAPER, max score 100.
 * The season is the staff current season (ruling X8); a session is optional
 * (spec D12 — the column is nullable).
 */
function NewQuizForm() {
  const theme = useTheme();
  const router = useRouter();
  const current = useCurrentSeasonId();
  const sessions = useSeasonSessions(current.seasonId);
  const create = useCreateQuiz();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<QuizKind>("PAPER");
  const [maxScore, setMaxScore] = useState("100");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (current.isPending) return <LoadingState />;
  if (current.isError) return <ErrorState message="Couldn't load your seasons." onRetry={current.refetch} />;
  const seasonId = current.seasonId;
  if (seasonId === null) {
    return <EmptyState title="No season" message="You aren't an admin of a season yet." />;
  }

  const submit = () => {
    const body: CreateQuizInput =
      kind === "PAPER"
        ? { seasonId, sessionId, title, kind, ...(maxScore.trim() === "" ? {} : { maxScore: Number(maxScore) }) }
        : { seasonId, sessionId, title, kind };
    const parsed = createQuizRequestSchema.safeParse(body);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the quiz details.");
      return;
    }
    setError(null);
    create.mutate(body, {
      onSuccess: ({ id }) =>
        router.replace(
          kind === "ONLINE"
            ? { pathname: "/quiz/[id]/edit", params: { id: String(id) } }
            : { pathname: "/quiz/[id]/grade", params: { id: String(id) } },
        ),
      onError: (err) => setError(apiErrorMessage(err, "Couldn't create the quiz.")),
    });
  };

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <Text variant="heading">New quiz</Text>
      <Input label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Week 3 Quiz" />
      <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
        <Button title="Paper" variant={kind === "PAPER" ? "primary" : "secondary"} onPress={() => setKind("PAPER")} />
        <Button title="Online" variant={kind === "ONLINE" ? "primary" : "secondary"} onPress={() => setKind("ONLINE")} />
      </View>
      {kind === "PAPER" ? (
        <Input label="Max score" value={maxScore} onChangeText={setMaxScore} keyboardType="number-pad" />
      ) : (
        <Text variant="caption" color={theme.colors.neutral[600]}>
          An online quiz's max score is the sum of its question points.
        </Text>
      )}
      <Text variant="label">Session (optional)</Text>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected: sessionId === null }}
        onPress={() => setSessionId(null)}
      >
        <Text variant="body">{sessionId === null ? "✓ No session" : "No session"}</Text>
      </Pressable>
      {(sessions.data ?? []).map((s) => (
        <Pressable
          key={s.id}
          accessibilityRole="radio"
          accessibilityState={{ selected: sessionId === s.id }}
          onPress={() => setSessionId(s.id)}
        >
          <Text variant="body">{s.title}</Text>
          <Text variant="caption" color={theme.colors.neutral[600]}>
            {sessionId === s.id ? `✓ ${formatDayKey(s.dayKey)}` : formatDayKey(s.dayKey)}
          </Text>
        </Pressable>
      ))}
      {error ? <Text variant="label" color={theme.colors.error[500]}>{error}</Text> : null}
      <Button
        title={kind === "ONLINE" ? "Create & add questions" : "Create quiz"}
        onPress={submit}
        loading={create.isPending}
      />
    </Card>
  );
}

export default function NewQuizScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {role === "ADMIN" || role === "SUPER" ? (
        <NewQuizForm />
      ) : (
        <EmptyState title="Not available" message="Only a season admin can create quizzes." />
      )}
    </Screen>
  );
}
