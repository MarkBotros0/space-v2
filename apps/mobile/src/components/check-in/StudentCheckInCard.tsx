import { useFocusEffect } from "expo-router";
import { QrCode } from "lucide-react-native";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Pressable, View } from "react-native";
import { parseCheckInCode, type SessionDetail } from "@space/shared";

import { iconWithClassName } from "../../design/lib/icon";
import { Button, FormField, Input, Sheet, Text } from "../../design/ui";
import { LIVE_ROSTER_REFRESH_MS, useCheckIn } from "../../hooks/use-check-in";
import { useCheckInTally } from "../../hooks/use-check-in-tally";
import { useStudentDashboard } from "../../hooks/use-dashboard";
import { useSessionDetail } from "../../hooks/use-session-detail";
import { deviceTodayKey } from "../../lib/calendar-grid";
import { checkInCopy, checkInRefusalCode, type CheckInOutcome } from "../../lib/check-in-result";
import { formatSessionTime } from "../../lib/format";
import { CheckInResult } from "./CheckInResult";
import { CheckInSuccess } from "./check-in-success";
import { QrScanner } from "./QrScanner";

iconWithClassName(QrCode);

const NOT_A_CODE = "That doesn't look like a check-in code";

/**
 * The leader opens check-in while this card is on screen, and Today stays
 * mounted: without this the button stays disabled until a pull. Same query key
 * as the screen's read, so a refetch is what moves `detail`. On focus and on the
 * staff console's interval, only while focused, the session is today and the
 * student has no attendance yet. The org's today comes from the server (the
 * dashboard's cache on Today), the device's only until that answers.
 */
function useLiveCheckIn(detail: SessionDetail) {
  const { refetch, dataUpdatedAt } = useSessionDetail(detail.id);
  const today = useStudentDashboard(detail.seasonId).data?.todayOrgDay ?? deviceTodayKey();
  const watching = detail.dayKey === today && detail.myAttendance === null;
  const updatedAt = useRef(dataUpdatedAt);
  updatedAt.current = dataUpdatedAt;

  useFocusEffect(
    useCallback(() => {
      if (!watching) return;
      // A slow answer must not be cancelled by the next tick, or it never lands.
      const read = () => void refetch({ cancelRefetch: false });
      if (Date.now() - updatedAt.current >= LIVE_ROSTER_REFRESH_MS) read();
      const timer = setInterval(read, LIVE_ROSTER_REFRESH_MS);
      return () => clearInterval(timer);
    }, [watching, refetch]),
  );
}

/**
 * The student's check-in on /session/[id] (v1 student-checkin-button.tsx): a
 * full-width "Check In" button, disabled until check-in opens, that opens a
 * scan sheet. Unlike v1 it POSTS the token rather than navigating to a
 * write-on-render page (R69/R72, spec 04 D3), shows the result in the sheet,
 * and keeps a typed-code fallback. Whether check-in is open is the server's
 * `checkInOpen` (C4) — never the client's own three-hour sum (R51, R73).
 */
export function StudentCheckInCard({
  detail,
  onHero = false,
}: {
  detail: SessionDetail;
  onHero?: boolean;
}) {
  useLiveCheckIn(detail);
  const checkIn = useCheckIn();
  const tally = useCheckInTally();
  // isPending lags a render behind mutate(); a ref blocks a second submit in between.
  const inFlight = useRef(false);
  const [open, setOpen] = useState(false);
  const [entering, setEntering] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | undefined>(undefined);
  const [outcome, setOutcome] = useState<CheckInOutcome | null>(null);

  const checkedInAt = detail.myAttendance?.checkedInAt ?? null;
  // A leader's mark counts as much as a scan: there is nothing left to check in to.
  const marked = detail.myAttendance !== null && checkedInAt === null;
  const enabled = detail.checkInOpen && checkedInAt === null;

  const submit = (token: string) => {
    if (inFlight.current || checkIn.isPending) return;
    inFlight.current = true;
    setOutcome(null);
    checkIn.mutate(token, {
      onSuccess: (data) =>
        setOutcome({ kind: "checked_in", status: data.status, minutesLate: data.minutesLate }),
      onError: (err) => {
        const refused: CheckInOutcome = { kind: "refused", code: checkInRefusalCode(err) };
        setOutcome(refused);
        const copy = checkInCopy(refused);
        AccessibilityInfo.announceForAccessibility(`${copy.title}. ${copy.message ?? ""}`);
      },
      onSettled: () => {
        inFlight.current = false;
      },
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

  const openSheet = () => {
    setOutcome(null);
    setEntering(false);
    setOpen(true);
  };

  let sheet: ReactNode;
  if (checkIn.isPending) {
    sheet = (
      <Text variant="subhead" className="text-muted-foreground">
        Checking you in…
      </Text>
    );
  } else if (outcome?.kind === "checked_in") {
    sheet = <CheckInSuccess outcome={outcome} attendance={tally} onDone={() => setOpen(false)} />;
  } else if (outcome !== null) {
    sheet = (
      <View className="items-center gap-4 py-2">
        <CheckInResult outcome={outcome} />
        <Button className="self-stretch" onPress={() => setOpen(false)}>
          Done
        </Button>
      </View>
    );
  } else if (entering) {
    sheet = (
      <View className="flex-col gap-3">
        <FormField label="Check-in code" error={codeError}>
          <Input
            accessibilityLabel="Check-in code"
            value={code}
            onChangeText={setCode}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </FormField>
        <Button onPress={submitTyped}>Check in</Button>
        <Pressable
          accessibilityRole="link"
          onPress={() => setEntering(false)}
          className="min-h-[44px] items-center justify-center self-center"
        >
          <Text variant="subhead" className="text-muted-foreground">
            Scan instead
          </Text>
        </Pressable>
      </View>
    );
  } else {
    sheet = (
      <View className="flex-col gap-3">
        <QrScanner onCode={submit} onCancel={() => setOpen(false)} />
        <Pressable
          accessibilityRole="link"
          onPress={() => setEntering(true)}
          className="self-center"
        >
          <Text variant="subhead" className="min-h-[44px] py-3 text-muted-foreground">
            Enter code instead
          </Text>
        </Pressable>
      </View>
    );
  }

  const sheetTitle = checkIn.isPending
    ? "Checking in"
    : outcome?.kind === "checked_in"
      ? "Checked in"
      : outcome !== null
        ? "Check-in"
        : entering
          ? "Enter check-in code"
          : "Scan check-in code";

  const caption = onHero ? "text-hero-muted" : "text-muted-foreground";
  return (
    <View className="flex-col items-start gap-1.5">
      {checkedInAt === null && !marked ? (
        <Button
          variant={onHero ? "onHero" : "primary"}
          size="lg"
          className="min-h-[44px] w-full"
          disabled={!enabled}
          onPress={openSheet}
        >
          <QrCode
            size={16}
            className={onHero ? "text-on-hero-foreground" : "text-primary-foreground"}
          />
          Check In
        </Button>
      ) : null}
      {checkedInAt !== null ? (
        <Text
          variant="subhead"
          className={caption}
        >{`You checked in at ${formatSessionTime(checkedInAt)}.`}</Text>
      ) : !detail.checkInOpen && !marked ? (
        <Text variant="subhead" className={caption}>
          Check-in isn't open right now
        </Text>
      ) : null}
      <Sheet open={open} onClose={() => setOpen(false)} title={sheetTitle}>
        <View className="pb-4">
          {outcome === null && !checkIn.isPending && !entering ? (
            <Text variant="subhead" className="mb-3 text-muted-foreground">
              Point your camera at the QR code displayed by your leader.
            </Text>
          ) : null}
          {sheet}
        </View>
      </Sheet>
    </View>
  );
}
