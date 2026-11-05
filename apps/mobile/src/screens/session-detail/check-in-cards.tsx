import { useFocusEffect } from "expo-router";
import { QrCode, RotateCcw } from "lucide-react-native";
import { useCallback, useState } from "react";
import { View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import type { SessionDetail } from "@space/shared";

import { FormErrorBox } from "../../design/forms/form-parts";
import { InlineError } from "../../design/layout/route-states";
import { iconWithClassName } from "../../design/lib/icon";
import { CheckInAttendanceList } from "../../design/sessions/check-in-attendance-list";
import {
  Button as ButtonV1,
  Card as CardV1,
  CardContent,
  CardHeader,
  CardTitle,
  Text as TextV1,
} from "../../design/ui";
import { StatusChip } from "../../design/ui/status-chip";
import { useAttendanceRoster, useSaveAttendance } from "../../hooks/use-attendance";
import { useCheckInState, useRegenerateCheckIn } from "../../hooks/use-check-in";
import { useCloseCheckIn, useOpenCheckIn, useSessionDetail } from "../../hooks/use-session-detail";
import { apiErrorMessage } from "../../lib/api-error";
import { formatWallTime } from "../../lib/format";

/** v1's leader page refreshed every 10s while check-in was open (check-in-attendance-list.tsx:58). */
export const LIVE_ROSTER_REFRESH_MS = 10_000;

iconWithClassName(QrCode, RotateCcw);

/**
 * v1's attendance list with per-student override (CheckInAttendanceList).
 * Polled every 10s while open (v1 router.refresh). The override is one entry
 * through the batch write (spec 04 D7), carrying the stored notes and late
 * minutes v1's override wiped (R32).
 */
function CheckInRoster({ detail }: { detail: SessionDetail }) {
  const roster = useAttendanceRoster(detail.id);
  const save = useSaveAttendance(detail.id);
  const { refetch } = roster;
  // Same query key as the screen's own read, so this refetch is what moves
  // `detail` — the Open/Closed badge, and whether the roster polls at all.
  // Polling only the roster left both stuck at whatever they were on entry:
  // check-in opened or closed elsewhere (or expired) was never noticed.
  const { refetch: refetchDetail } = useSessionDetail(detail.id);

  // While the screen is focused only: tab screens stay mounted when left.
  useFocusEffect(
    useCallback(() => {
      const timer = setInterval(() => {
        void refetchDetail();
        if (detail.checkInOpen) void refetch();
      }, LIVE_ROSTER_REFRESH_MS);
      return () => clearInterval(timer);
    }, [detail.checkInOpen, refetch, refetchDetail]),
  );

  if (roster.isPending) {
    return <TextV1 className="py-4 text-center text-sm text-muted-foreground">Loading…</TextV1>;
  }
  if (roster.isError) {
    return <InlineError message="Couldn't load the roster." onRetry={() => void refetch()} />;
  }
  return (
    <CheckInAttendanceList
      rows={roster.data}
      pending={save.isPending}
      onDismiss={save.reset}
      error={save.isError ? apiErrorMessage(save.error, "Couldn't save the attendance.") : null}
      onOverride={(row, status, done) =>
        save.mutate(
          [
            {
              studentUserId: row.studentUserId,
              status,
              notes: row.notes,
              lateMinutes: status === "LATE" ? row.lateMinutes : null,
            },
          ],
          {
            onSuccess: () => {
              save.reset();
              done();
            },
          },
        )
      }
    />
  );
}

/** Leader, and a SUPER who is not this season's admin: v1's read-only card with an Open/Closed badge. */
export function LeaderCheckInCard({ detail }: { detail: SessionDetail }) {
  return (
    <View className="flex-col gap-4 rounded-group bg-surface p-4">
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <QrCode size={16} className="text-foreground" />
          <TextV1 variant="headline">Check-in</TextV1>
        </View>
        <StatusChip
          tone={detail.checkInOpen ? "ok" : "neutral"}
          label={detail.checkInOpen ? "Open" : "Closed"}
        />
      </View>
      <CheckInRoster detail={detail} />
    </View>
  );
}

/**
 * Season admins only (canManageCheckIn) — v1 admin session page's check-in
 * card: Regenerate QR + Open/Close in the header, "Closes at", the QR, then
 * the roster. The QR is a deliberate difference from the leader card.
 */
export function CheckInConsoleCard({ detail }: { detail: SessionDetail }) {
  const open = useOpenCheckIn(detail.id);
  const close = useCloseCheckIn(detail.id);
  const regenerate = useRegenerateCheckIn(detail.id);
  // The narrow admin-only read (D-16.9) — after an app restart, the open
  // session's QR comes back without a reopen and without the season-wide list.
  const checkIn = useCheckInState(detail.id, true);
  const token = checkIn.data?.checkInToken ?? open.token;
  const [error, setError] = useState<string | null>(null);
  const [regenArmed, setRegenArmed] = useState(false);

  /** Runs one of the three check-in writes, showing `failure` in the card if it fails. */
  const run = (
    mutation: { mutate: (v: undefined, o: { onError: (err: Error) => void }) => void },
    failure: string,
  ) => {
    setError(null);
    mutation.mutate(undefined, {
      onError: (err) => setError(apiErrorMessage(err, failure)),
    });
  };
  const onRegenerate = () => {
    // While open, a code on the room screen stops working — confirm (spec 03 §10 item 9).
    if (detail.checkInOpen && !regenArmed) {
      setRegenArmed(true);
      return;
    }
    setRegenArmed(false);
    run(regenerate, "Couldn't replace the code.");
  };

  return (
    <CardV1>
      <CardHeader>
        <View className="flex-row items-center gap-2">
          <QrCode size={16} className="text-foreground" />
          <CardTitle className="text-base">Check-in</CardTitle>
        </View>
        <View className="mt-2 flex-row flex-wrap items-center gap-2">
          {token ? (
            <ButtonV1
              variant="ghost"
              size="sm"
              disabled={regenerate.isPending}
              onPress={onRegenerate}
            >
              <RotateCcw size={16} className="text-foreground" />
              {regenArmed ? "Replace the code? The current one stops working." : "Regenerate code"}
            </ButtonV1>
          ) : null}
          {detail.checkInOpen ? (
            <ButtonV1
              variant="outline"
              size="sm"
              disabled={close.isPending}
              onPress={() => run(close, "Couldn't close check-in.")}
            >
              Close check-in
            </ButtonV1>
          ) : (
            <ButtonV1
              size="sm"
              disabled={open.isPending}
              onPress={() => run(open, "Couldn't open check-in.")}
            >
              Open check-in
            </ButtonV1>
          )}
        </View>
      </CardHeader>
      <CardContent className="flex-col gap-6">
        {detail.checkInOpen && checkIn.data?.expiresAtTime ? (
          <TextV1 className="text-xs text-muted-foreground">
            {`Closes at ${formatWallTime(checkIn.data.expiresAtTime)}`}
          </TextV1>
        ) : null}
        {detail.checkInOpen ? (
          token ? (
            <View className="items-center gap-2">
              <QRCode value={token} size={220} />
              <TextV1 className="text-xs text-muted-foreground">{`Code: ${token}`}</TextV1>
              {/* Spec 04 D3's risk, stated until the rotating-code upgrade lands. */}
              <TextV1 className="text-center text-xs text-muted-foreground">
                Anyone with this code can check in — keep it on the room screen only.
              </TextV1>
            </View>
          ) : (
            <TextV1 className="text-sm text-muted-foreground">Loading the check-in code…</TextV1>
          )
        ) : null}
        <FormErrorBox message={error} />
        <CheckInRoster detail={detail} />
      </CardContent>
    </CardV1>
  );
}
