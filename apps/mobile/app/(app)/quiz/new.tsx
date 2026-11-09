import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { createQuizRequestSchema, type QuizKind } from "@space/shared";

import { ToggleButtons } from "../../../src/design/forms/form-parts";
import { FormScreen } from "../../../src/design/layout/form-screen";
import { RouteError, RouteSkeleton } from "../../../src/design/layout/route-states";
import { Screen } from "../../../src/design/layout/screen";
import { Combobox, EmptyState, FormField, Input, Text } from "../../../src/design/ui";
import { useCreateQuiz, type CreateQuizInput } from "../../../src/hooks/use-quiz-authoring";
import { useCurrentSeasonId } from "../../../src/hooks/use-seasons";
import { useSeasonSessions } from "../../../src/hooks/use-sessions";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { firstErrorByField } from "../../../src/lib/form-errors";
import { formatDayKey } from "../../../src/lib/format";
import { parsePositiveInt } from "../../../src/lib/params";
import { useRole } from "../../../src/store/session";

/**
 * v1 create-quiz-form.tsx, as a screen. Creating is a season-admin power
 * (POST /quizzes is isAdminOfSeason-gated), so only ADMIN/SUPER get the form;
 * the server stays the gate. Defaults mirror v1: PAPER, max score 100.
 * The season is the staff current season (ruling X8); a session is optional
 * (spec D12 — the column is nullable).
 *
 * Opened from a session's "+ Add quiz" (v1's CreateQuizForm lived on the
 * session page and always sent that session and ITS season), the route
 * carries `sessionId` and `seasonId`: the session is preselected and the quiz
 * goes into the session's season, not whichever season is current.
 */
function NewQuizForm() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sessionId?: string; seasonId?: string }>();
  const paramSeasonId = parsePositiveInt(params.seasonId);
  const paramSessionId = parsePositiveInt(params.sessionId);
  const current = useCurrentSeasonId();
  const seasonId = paramSeasonId ?? current.seasonId;
  const sessions = useSeasonSessions(seasonId);
  const create = useCreateQuiz();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<QuizKind>("PAPER");
  const [maxScore, setMaxScore] = useState("100");
  const [sessionId, setSessionId] = useState<number | null>(paramSessionId);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  if (paramSeasonId === null) {
    if (current.isPending)
      return (
        <NewQuizFrame>
          <RouteSkeleton />
        </NewQuizFrame>
      );
    if (current.isError) {
      return (
        <NewQuizFrame>
          <RouteError onRetry={current.refetch} />
        </NewQuizFrame>
      );
    }
  }
  if (seasonId === null) {
    return (
      <NewQuizFrame>
        <EmptyState title="No season" description="You aren't an admin of a season yet." />
      </NewQuizFrame>
    );
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
    const blankTitle = title.trim() === "";
    if (!parsed.success || blankTitle) {
      const next = parsed.success ? {} : firstErrorByField(parsed.error);
      if (blankTitle) next.title = "Enter a title.";
      setErrors(next);
      return;
    }
    setErrors({});
    setServerError(null);
    create.mutate(body, {
      onSuccess: ({ id }) =>
        router.replace(
          kind === "ONLINE"
            ? { pathname: "/quiz/[id]/edit", params: { id: String(id) } }
            : { pathname: "/quiz/[id]/grade", params: { id: String(id) } },
        ),
      onError: (err) => setServerError(apiErrorMessage(err, "Couldn't create the quiz.")),
    });
  };

  const saveHint =
    serverError ?? errors.form ?? (Object.keys(errors).length > 0 ? "Fix the fields marked above." : undefined);

  return (
    <FormScreen
      title="New quiz"
      subtitle="Add a quiz to this season."
      saveLabel={kind === "ONLINE" ? "Create & add questions" : "Create"}
      saving={create.isPending}
      saveHint={saveHint}
      onSave={submit}
    >
      <View className="flex-col gap-4">
        <ToggleButtons
          options={[
            { value: "PAPER", label: "Paper (enter grades)" },
            { value: "ONLINE", label: "Online (questions)" },
          ]}
          value={kind}
          onChange={setKind}
        />
        <FormField label="Title" required error={errors.title}>
          <Input accessibilityLabel="Title" value={title} onChangeText={setTitle} placeholder="e.g. Week 3 Quiz" />
        </FormField>
        {kind === "PAPER" ? (
          <FormField label="Max score" error={errors.maxScore}>
            <Input
              accessibilityLabel="Max score"
              value={maxScore}
              onChangeText={setMaxScore}
              keyboardType="number-pad"
            />
          </FormField>
        ) : (
          <Text variant="caption" className="text-muted-foreground">
            You'll add questions and publish on the next screen.
          </Text>
        )}
        {/* V2-ONLY: v1 created a quiz from a session's card, so the session was implicit. */}
        <FormField label="Session (optional)">
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
        </FormField>
      </View>
    </FormScreen>
  );
}

function NewQuizFrame({ children }: { children: ReactNode }) {
  return (
    <Screen title="New quiz" subtitle="Add a quiz to this season.">
      {children}
    </Screen>
  );
}

export default function NewQuizScreen() {
  const role = useRole();
  if (role === "ADMIN" || role === "SUPER") return <NewQuizForm />;
  return (
    <NewQuizFrame>
      <EmptyState title="Not available" description="Only a season admin can create quizzes." />
    </NewQuizFrame>
  );
}
