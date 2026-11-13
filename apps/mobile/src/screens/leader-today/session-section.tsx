import type { DashboardSession, LeaderSessionCheckIn } from "@space/shared";
import { useRouter } from "expo-router";
import { Linking } from "react-native";

import { Button } from "../../design/ui/button";
import { SessionHomeCard } from "../home/session-card";
import { deviceTodayKey } from "../../lib/calendar-grid";
import { unbreakable } from "../../lib/format";

/** The session is on its day or running: the leader needs who is still missing. */
export function isOnTheDay(session: DashboardSession | null, now?: Date): boolean {
  return !!session && (session.isInProgress || session.dayKey === deviceTodayKey(now));
}

/**
 * The session to run; on its day the card counts who is present and who is not
 * checked in yet, and Mark attendance names them (owner 2026-11-14: no list
 * here, it repeated that screen). A session that is not today is a plain card
 * with its day cue; `checkIn` is the leader's own
 * groups and absent (`undefined`) is the same as `null`.
 */
export function LeaderSessionSection({
  session,
  checkIn,
  now,
}: {
  session: DashboardSession | null;
  checkIn?: LeaderSessionCheckIn | null;
  now?: Date;
}) {
  const router = useRouter();
  const onTheDay = isOnTheDay(session, now);
  if (!session) return <SessionHomeCard session={null} todayKey={deviceTodayKey(now)} />;

  const id = String(session.id);
  const attendance = { pathname: "/session/[id]/attendance", params: { id } } as const;
  const note =
    onTheDay && checkIn
      ? `${unbreakable(`${checkIn.present + checkIn.late} present`)} · ${unbreakable(`${checkIn.notCheckedIn.length} not checked in`)}`
      : undefined;

  return (
    <SessionHomeCard
      session={session}
      todayKey={deviceTodayKey(now)}
      note={note}
      // On its day the leader marks who came; a week out the card is plain and its title opens it.
      action={
        onTheDay
          ? (onBrand) => (
              <>
                <Button variant={onBrand ? "onHero" : "primary"} onPress={() => router.push(attendance)}>
                  Mark attendance
                </Button>
                {/* D13: a stream link only while the session is running. */}
                {session.isInProgress && session.youtubeUrl ? (
                  <Button variant="secondary" onPress={() => void Linking.openURL(session.youtubeUrl ?? "")}>
                    Join stream
                  </Button>
                ) : null}
              </>
            )
          : undefined
      }
    />
  );
}
