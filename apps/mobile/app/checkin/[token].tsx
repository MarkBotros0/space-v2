import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { XCircle as InvalidIcon } from "lucide-react-native";
import { parseCheckInCode } from "@space/shared";

import { CheckInIcon, CheckInMessage, CheckInResult } from "../../src/components/check-in/CheckInResult";
import { CheckInSuccess } from "../../src/components/check-in/check-in-success";
import { Screen } from "../../src/design/layout/screen";
import { Button } from "../../src/design/ui";
import { useCheckIn } from "../../src/hooks/use-check-in";
import { useCheckInTally } from "../../src/hooks/use-check-in-tally";
import { checkInRefusalCode, type CheckInOutcome } from "../../src/lib/check-in-result";
import { useSessionStore } from "../../src/store/session";

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
  const router = useRouter();
  const { token: raw } = useLocalSearchParams<{ token: string }>();
  const status = useSessionStore((s) => s.status);
  const checkIn = useCheckIn();
  const tally = useCheckInTally();
  const [outcome, setOutcome] = useState<CheckInOutcome | null>(null);
  const token = typeof raw === "string" ? parseCheckInCode(raw) : null;

  if (status !== "authenticated") {
    return <Redirect href={token ? { pathname: "/login", params: { returnTo: `/checkin/${token}` } } : "/login"} />;
  }

  const confirm = (value: string) =>
    checkIn.mutate(value, {
      onSuccess: (data) => setOutcome({ kind: "checked_in", status: data.status, minutesLate: data.minutesLate }),
      onError: (err) => setOutcome({ kind: "refused", code: checkInRefusalCode(err) }),
    });

  return (
    <Screen title="Session check-in" back={null}>
      <View className="items-center gap-4 py-6">
        {token === null ? (
          <CheckInMessage
            icon={InvalidIcon}
            tone="error"
            title="Can't check in"
            message="This check-in link is not valid."
          />
        ) : outcome?.kind === "checked_in" ? (
          <CheckInSuccess outcome={outcome} attendance={tally} />
        ) : outcome ? (
          <CheckInResult outcome={outcome} />
        ) : (
          <>
            <CheckInMessage
              icon={CheckInIcon}
              tone="neutral"
              title="Check in to this session?"
              message="Check in to the session this code belongs to?"
            />
            <Button size="lg" disabled={checkIn.isPending} onPress={() => confirm(token)}>
              Check in
            </Button>
          </>
        )}
        {/* A root route: dismissTo lands on Today (the (app) stack mounts, Today under it) rather than replacing. */}
        <Button variant="plain" onPress={() => router.dismissTo("/dashboard")}>
          Go to Today
        </Button>
      </View>
    </Screen>
  );
}
