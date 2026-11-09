import type { DashboardSession, LeaderSessionCheckIn } from "@space/shared";
import { useRouter } from "expo-router";
import { Linking, View } from "react-native";

import { Button } from "../../design/ui/button";
import { PeoplePreview } from "../../design/home/people-preview";
import { SessionHomeCard } from "../../design/home/session-card";
import { deviceTodayKey } from "../../lib/calendar-grid";
import { unbreakable } from "../../lib/format";

/** Names shown before "See all N". */
const NAMED = 5;

/** The session is on its day or running: the leader needs who is still missing. */
export function isOnTheDay(session: DashboardSession | null, now?: Date): boolean {
  return !!session && (session.isInProgress || session.dayKey === deviceTodayKey(now));
}

/**
 * The session to run and, on its day, who is still unmarked. A session that is
 * not today is a plain card with its day cue; `checkIn` is the leader's own
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
  const missing = onTheDay ? (checkIn?.notCheckedIn ?? []) : [];
  const attendance = { pathname: "/session/[id]/attendance", params: { id } } as const;
  const note =
    onTheDay && checkIn
      ? `${unbreakable(`${checkIn.present + checkIn.late} present`)} · ${unbreakable(`${checkIn.notCheckedIn.length} not checked in`)}`
      : undefined;

  return (
    <View className="gap-4">
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
      <PeoplePreview
        header="Not checked in"
        people={missing.slice(0, NAMED).map((m) => ({ id: m.id, name: m.name }))}
        total={missing.length}
        onOpen={(sid) => router.push({ pathname: "/student/[id]", params: { id: String(sid) } })}
        onSeeAll={() => router.push(attendance)}
      />
    </View>
  );
}
