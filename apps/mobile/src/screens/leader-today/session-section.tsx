import type { DashboardSession, LeaderSessionCheckIn } from "@space/shared";
import { useRouter } from "expo-router";
import { Linking, View } from "react-native";

import { Button } from "../../design/ui/button";
import { PeoplePreview } from "../../design/home/people-preview";
import { HeroCard } from "../../design/ui/hero-card";
import { dayCue, deviceTodayKey } from "../../lib/calendar-grid";
import { formatWallTime, formatWeekdayDay, unbreakable } from "../../lib/format";

/** Names shown before "See all N". */
const NAMED = 5;

/** The session is on its day or running: the leader needs who is still missing. */
export function isOnTheDay(session: DashboardSession | null, now?: Date): boolean {
  return !!session && (session.isInProgress || session.dayKey === deviceTodayKey(now));
}

/**
 * The session to run and, on its day, who is still unmarked. A session that is
 * not today shows only its day cue; `checkIn` is the leader's own groups and
 * absent (`undefined`) is the same as `null`.
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
  if (!session) return <HeroCard eyebrow="Next session" title="No upcoming sessions." />;

  const id = String(session.id);
  const today = deviceTodayKey(now);
  const onTheDay = isOnTheDay(session, now);
  const missing = onTheDay ? (checkIn?.notCheckedIn ?? []) : [];
  const attendance = { pathname: "/session/[id]/attendance", params: { id } } as const;
  const openSession = () => router.push({ pathname: "/session/[id]", params: { id } });

  // Each unit is one unbreakable run: the line breaks between them, never inside one.
  let meta = `${unbreakable(formatWeekdayDay(session.dayKey))} · ${unbreakable(formatWallTime(session.time))} · ${unbreakable(`${session.durationMinutes} min`)}${
    session.location ? ` · ${session.location}` : ""
  }`;
  if (onTheDay) {
    if (checkIn)
      meta += ` · ${unbreakable(`${checkIn.present + checkIn.late} present`)} · ${unbreakable(`${checkIn.notCheckedIn.length} not checked in`)}`;
  } else {
    const cue = dayCue(session.dayKey, today);
    if (cue) meta += ` · ${unbreakable(cue)}`;
  }

  return (
    <View className="gap-4">
      <HeroCard
        tone="brand"
        eyebrow={session.isInProgress ? "Happening now" : "Next session"}
        title={session.title}
        meta={meta}
        action={
          onTheDay ? (
            <>
              <Button variant="onHero" onPress={() => router.push(attendance)}>
                Take attendance
              </Button>
              <Button variant="secondary" onPress={openSession}>
                Open session
              </Button>
              {/* D13: a stream link only while the session is running. */}
              {session.isInProgress && session.youtubeUrl ? (
                <Button
                  variant="secondary"
                  onPress={() => void Linking.openURL(session.youtubeUrl ?? "")}
                >
                  Join stream
                </Button>
              ) : null}
            </>
          ) : (
            <Button variant="onHero" onPress={openSession}>
              Open session
            </Button>
          )
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
