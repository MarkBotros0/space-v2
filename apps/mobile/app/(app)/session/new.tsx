import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { createSessionRequestSchema, type CreateSessionInput } from "@space/shared";

import {
  SessionFields,
  emptySessionValues,
  sessionWriteFields,
  type SessionFormValues,
} from "../../../src/components/SessionForm";
import { FormScreen } from "../../../src/design/layout/form-screen";
import { Screen } from "../../../src/design/layout/screen";
import { EmptyState, FormField, Input } from "../../../src/design/ui";
import { useSeasonDetail } from "../../../src/hooks/use-seasons";
import { useCreateSession } from "../../../src/hooks/use-session-writes";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { firstErrorByField } from "../../../src/lib/form-errors";
import { parsePositiveInt } from "../../../src/lib/params";

/**
 * Create a session or weekly series (v1 /admin/season/[code]/calendar/new;
 * spec 03 §9; G5). Reached from the season detail's "New session" with
 * ?seasonId=. The server enforces isAdminOfSeason; a refusal shows its message.
 */
export default function NewSessionScreen() {
  const router = useRouter();
  const { seasonId: raw } = useLocalSearchParams<{ seasonId: string }>();
  const seasonId = parsePositiveInt(raw);
  const season = useSeasonDetail(seasonId);
  const create = useCreateSession();
  const [values, setValues] = useState<SessionFormValues>(emptySessionValues);
  const [repeat, setRepeat] = useState("1");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  if (seasonId === null) {
    return (
      <Screen title="New session">
        <EmptyState
          title="No season"
          description="Open a season first, then add a session to it."
        />
      </Screen>
    );
  }

  const submit = () => {
    setMessage(null);
    const body: CreateSessionInput = {
      seasonId,
      ...sessionWriteFields(values),
      repeatWeeks: Number(repeat),
    };
    const parsed = createSessionRequestSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(firstErrorByField(parsed.error));
      return;
    }
    setErrors({});
    create.mutate(body, {
      onSuccess: (created) =>
        router.replace({ pathname: "/session/[id]", params: { id: String(created.id) } }),
      onError: (err) => setMessage(apiErrorMessage(err, "Couldn't create the session.")),
    });
  };

  return (
    <FormScreen
      title="New session"
      subtitle={
        season.data ? `Add a session to ${season.data.title}.` : "Add a session to this season."
      }
      saveLabel="Create session"
      saving={create.isPending}
      saveHint={
        message ?? (Object.keys(errors).length > 0 ? "Fix the fields marked above." : undefined)
      }
      onSave={submit}
    >
      <View className="flex-col gap-4">
        <SessionFields values={values} onChange={setValues} errors={errors} />
        <FormField
          label="Repeat weekly for (weeks)"
          description="Creates one occurrence per week, sharing a recurrence group."
          error={errors.repeatWeeks}
        >
          <Input
            accessibilityLabel="Repeat weekly for (weeks)"
            value={repeat}
            onChangeText={setRepeat}
            keyboardType="number-pad"
          />
        </FormField>
      </View>
    </FormScreen>
  );
}
