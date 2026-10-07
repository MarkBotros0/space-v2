import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { parseCheckInCode } from "@space/shared";

import { CheckInResult } from "../../src/components/check-in/CheckInResult";
import { useCheckIn } from "../../src/hooks/use-check-in";
import { checkInRefusalCode, type CheckInOutcome } from "../../src/lib/check-in-result";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Button, Screen, Text } from "../../src/ui";

/**
 * `spacev2://checkin/<token>` (v1 app/checkin/[token]/page.tsx). Outside the
 * (app) tab shell, like v1's standalone page (R70). Two deliberate changes:
 *  - it NEVER writes on open (spec 04 D3, ruling C6): v1 checked in as a side
 *    effect of rendering (R69), so a refresh or a link preview re-ran it.
 *    Here the write is the "Check in" press.
 *  - anonymous → /login?returnTo=/checkin/<token> → back here (R56). Only a
 *    well-formed token is carried; anything else goes to plain /login.
 * The boot gate (app/_layout.tsx) has resolved the session before this mounts.
 */
export default function CheckInLinkScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { token: raw } = useLocalSearchParams<{ token: string }>();
  const status = useSessionStore((s) => s.status);
  const checkIn = useCheckIn();
  const [outcome, setOutcome] = useState<CheckInOutcome | null>(null);
  const token = typeof raw === "string" ? parseCheckInCode(raw) : null;

  if (status !== "authenticated") {
    return (
      <Redirect href={token ? { pathname: "/login", params: { returnTo: `/checkin/${token}` } } : "/login"} />
    );
  }

  const confirm = (value: string) =>
    checkIn.mutate(value, {
      onSuccess: (data) => setOutcome({ kind: "checked_in", status: data.status, minutesLate: data.minutesLate }),
      onError: (err) => setOutcome({ kind: "refused", code: checkInRefusalCode(err) }),
    });

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center", gap: theme.spacing.md }}>
        <Text variant="title">Session check-in</Text>
        {token === null ? (
          <Text variant="body">This check-in link is not valid.</Text>
        ) : outcome ? (
          <CheckInResult outcome={outcome} />
        ) : (
          <>
            <Text variant="body">Check in to the session this code belongs to?</Text>
            <Button title="Check in" loading={checkIn.isPending} onPress={() => confirm(token)} />
          </>
        )}
        <Button title="Go to dashboard" variant="secondary" onPress={() => router.replace("/dashboard")} />
      </View>
    </Screen>
  );
}
