import { useState, type ReactNode } from "react";
import { parseCheckInCode, type SessionDetail } from "@space/shared";

import { useCheckIn } from "../../hooks/use-check-in";
import { checkInRefusalCode, type CheckInOutcome } from "../../lib/check-in-result";
import { formatSessionTime } from "../../lib/format";
import { useTheme } from "../../theme";
import { Button, Card, Input, Text } from "../../ui";
import { CheckInResult } from "./CheckInResult";
import { QrScanner } from "./QrScanner";

type Mode = "idle" | "scanning" | "entering";
const NOT_A_CODE = "That doesn't look like a check-in code.";

/**
 * The student's check-in on /session/[id] (v1 student-checkin-button.tsx).
 * Unlike v1 it POSTS the token rather than navigating to a write-on-render
 * page (R69/R72, spec 04 D3). Whether check-in is open is the server's
 * `checkInOpen` (C4) — never the client's own three-hour sum (R51, R73).
 */
export function StudentCheckInCard({ detail }: { detail: SessionDetail }) {
  const theme = useTheme();
  const checkIn = useCheckIn();
  const [mode, setMode] = useState<Mode>("idle");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | undefined>(undefined);
  const [outcome, setOutcome] = useState<CheckInOutcome | null>(null);

  const submit = (token: string) => {
    setMode("idle");
    setOutcome(null);
    checkIn.mutate(token, {
      onSuccess: (data) => setOutcome({ kind: "checked_in", status: data.status, minutesLate: data.minutesLate }),
      onError: (err) => setOutcome({ kind: "refused", code: checkInRefusalCode(err) }),
    });
  };

  const submitTyped = () => {
    const token = parseCheckInCode(code);
    if (!token) {
      setCodeError(NOT_A_CODE);
      return;
    }
    setCodeError(undefined);
    setCode("");
    submit(token);
  };

  const checkedInAt = detail.myAttendance?.checkedInAt ?? null;
  let body: ReactNode;
  if (outcome?.kind === "checked_in") {
    body = <CheckInResult outcome={outcome} />;
  } else if (checkedInAt !== null) {
    body = <Text variant="body">{`You checked in at ${formatSessionTime(checkedInAt)}.`}</Text>;
  } else if (!detail.checkInOpen && outcome === null) {
    body = (
      <Text variant="body" color={theme.colors.neutral[600]}>
        Check-in isn't open right now.
      </Text>
    );
  } else {
    let controls: ReactNode;
    if (checkIn.isPending) {
      controls = <Text variant="body">Checking you in…</Text>;
    } else if (mode === "scanning") {
      controls = <QrScanner onCode={submit} onCancel={() => setMode("idle")} />;
    } else if (mode === "entering") {
      controls = (
        <>
          <Input
            label="Check-in code"
            value={code}
            onChangeText={setCode}
            autoCapitalize="none"
            autoCorrect={false}
            error={codeError}
          />
          <Button title="Check in" onPress={submitTyped} />
          <Button title="Cancel" variant="ghost" onPress={() => setMode("idle")} />
        </>
      );
    } else {
      controls = (
        <>
          <Button title="Scan QR code" onPress={() => setMode("scanning")} />
          <Button title="Enter code" variant="secondary" onPress={() => setMode("entering")} />
        </>
      );
    }
    body = (
      <>
        {outcome ? <CheckInResult outcome={outcome} /> : null}
        {controls}
      </>
    );
  }

  return (
    <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
      <Text variant="heading">Your check-in</Text>
      {body}
    </Card>
  );
}
