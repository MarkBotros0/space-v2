import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { createSessionRequestSchema, type CreateSessionInput } from "@space/shared";

import { SessionFields, emptySessionValues, sessionWriteFields, type SessionFormValues } from "../../../src/components/SessionForm";
import { useCreateSession } from "../../../src/hooks/use-session-writes";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { firstErrorByField } from "../../../src/lib/form-errors";
import { parsePositiveInt } from "../../../src/lib/params";
import { useTheme } from "../../../src/theme";
import { Button, Card, EmptyState, Input, Screen, Text } from "../../../src/ui";

/**
 * Create a session or weekly series (v1 /admin/season/[code]/calendar/new;
 * spec 03 §9; G5). Reached from the season detail's "New session" with
 * ?seasonId=. The server enforces isAdminOfSeason; a refusal shows its message.
 */
export default function NewSessionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { seasonId: raw } = useLocalSearchParams<{ seasonId: string }>();
  const seasonId = parsePositiveInt(raw);
  const create = useCreateSession();
  const [values, setValues] = useState<SessionFormValues>(emptySessionValues);
  const [repeat, setRepeat] = useState("1");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  if (seasonId === null) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="No season" message="Open a season first, then add a session to it." />
      </Screen>
    );
  }

  const submit = () => {
    setMessage(null);
    const body: CreateSessionInput = { seasonId, ...sessionWriteFields(values), repeatWeeks: Number(repeat) };
    const parsed = createSessionRequestSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(firstErrorByField(parsed.error));
      return;
    }
    setErrors({});
    create.mutate(body, {
      onSuccess: (created) => router.replace({ pathname: "/session/[id]", params: { id: String(created.id) } }),
      onError: (err) => setMessage(apiErrorMessage(err, "Couldn't create the session.")),
    });
  };

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      <Card style={{ gap: theme.spacing.sm }}>
        <Text variant="heading">New session</Text>
        <SessionFields values={values} onChange={setValues} errors={errors} />
        <Input
          label="Repeat weekly for (weeks)"
          value={repeat}
          onChangeText={setRepeat}
          keyboardType="number-pad"
          error={errors.repeatWeeks}
        />
        {message ? <Text variant="label" color={theme.colors.error[500]}>{message}</Text> : null}
        <Button title="Create session" onPress={submit} loading={create.isPending} />
      </Card>
    </Screen>
  );
}
