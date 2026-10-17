import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { createQuizRequestSchema, type QuizKind } from "@space/shared";

import { FormActions, FormErrorBox, ToggleButtons } from "../../../src/design/forms/form-parts";
import { PageTitle } from "../../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../../src/design/layout/route-states";
import { ShellFrame } from "../../../src/design/layout/shell-frame";
import { Card, CardContent, Combobox, EmptyState, Input, Text } from "../../../src/design/ui";
import { useCreateQuiz, type CreateQuizInput } from "../../../src/hooks/use-quiz-authoring";
import { useCurrentSeasonId } from "../../../src/hooks/use-seasons";
import { useSeasonSessions } from "../../../src/hooks/use-sessions";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { formatDayKey } from "../../../src/lib/format";
import { useSessionStore } from "../../../src/store/session";

/**
 * v1 create-quiz-form.tsx, as a screen. Creating is a season-admin power
 * (POST /quizzes is isAdminOfSeason-gated), so only ADMIN/SUPER get the form;
 * the server stays the gate. Defaults mirror v1: PAPER, max score 100.
 * The season is the staff current season (ruling X8); a session is optional
 * (spec D12 — the column is nullable).
 */
function NewQuizForm() {
  const router = useRouter();
  const current = useCurrentSeasonId();
  const sessions = useSeasonSessions(current.seasonId);
  const create = useCreateQuiz();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<QuizKind>("PAPER");
  const [maxScore, setMaxScore] = useState("100");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (current.isPending) return <RouteSkeleton />;
  if (current.isError) return <RouteError onRetry={current.refetch} />;
  const seasonId = current.seasonId;
  if (seasonId === null) {
    return <EmptyState title="No season" description="You aren't an admin of a season yet." />;
  }

  const submit = () => {
    const body: CreateQuizInput =
      kind === "PAPER"
        ? {
            seasonId,
            sessionId,
            title,
            kind,
            ...(maxScore.trim() === "" ? {} : { maxScore: Number(maxScore) }),
          }
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
    <View className="flex-col gap-3">
      <ToggleButtons
        options={[
          { value: "PAPER", label: "Paper (enter grades)" },
          { value: "ONLINE", label: "Online (questions)" },
        ]}
        value={kind}
        onChange={setKind}
      />
      <View className="flex-col gap-1">
        <Text className="text-xs font-semibold text-muted-foreground">Title</Text>
        <Input
          accessibilityLabel="Title"
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Week 3 Quiz"
        />
      </View>
      {kind === "PAPER" ? (
        <View className="flex-col gap-1">
          <Text className="text-xs font-semibold text-muted-foreground">Max score</Text>
          <Input
            accessibilityLabel="Max score"
            value={maxScore}
            onChangeText={setMaxScore}
            keyboardType="number-pad"
          />
        </View>
      ) : (
        <Text className="text-xs text-muted-foreground">
          You'll add questions and publish on the next screen.
        </Text>
      )}
      {/* V2-ONLY: v1 created a quiz from a session's card, so the session was implicit. */}
      <View className="flex-col gap-1">
        <Text className="text-xs font-semibold text-muted-foreground">Session (optional)</Text>
        <Combobox
          accessibilityLabel="Session"
          options={(sessions.data ?? []).map((s) => ({
            value: String(s.id),
            label: s.title,
            description: formatDayKey(s.dayKey),
          }))}
          value={sessionId === null ? null : String(sessionId)}
          onChange={(id) => setSessionId(id === null ? null : Number(id))}
          placeholder="No session"
          emptyMessage="No sessions for this season."
        />
      </View>
      <FormErrorBox message={error} />
      <FormActions
        submitLabel={kind === "ONLINE" ? "Create & add questions" : "Create"}
        pendingLabel="Creating…"
        pending={create.isPending}
        onSubmit={submit}
        onCancel={() => router.back()}
      />
    </View>
  );
}

export default function NewQuizScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  return (
    <ShellFrame>
      <View className="flex-col gap-4">
        <PageTitle title="New quiz" subtitle="Add a quiz to this season." />
        {role === "ADMIN" || role === "SUPER" ? (
          <Card>
            <CardContent className="pt-6">
              <NewQuizForm />
            </CardContent>
          </Card>
        ) : (
          <EmptyState title="Not available" description="Only a season admin can create quizzes." />
        )}
      </View>
    </ShellFrame>
  );
}
