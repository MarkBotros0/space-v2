import { useRouter } from "expo-router";
import type { UseQueryResult } from "@tanstack/react-query";
import { Linking, View } from "react-native";
import type { DashboardSession, SessionDetail } from "@space/shared";

import { StudentCheckInCard } from "../../components/check-in/StudentCheckInCard";
import { Button, HeroCard } from "../../design/ui";
import { dayCue } from "../../lib/calendar-grid";
import { formatWallTime, formatWeekdayDay, formatMinutes } from "../../lib/format";

const NEXT_SESSION = "Next session";

/**
 * The one thing that matters now. The cue counts org days from the server's
 * today, so a device in another timezone agrees with the calendar. The check-in
 * action reads the session screen's own query and cache (P2-3); if that fails,
 * the card stays without it. "Join stream" only while the session runs (D13).
 */
export function NextSessionHero({
  session,
  todayOrgDay,
  detail,
}: {
  session: DashboardSession | null;
  todayOrgDay: string;
  detail: UseQueryResult<SessionDetail>;
}) {
  const router = useRouter();
  if (session === null) return <HeroCard eyebrow={NEXT_SESSION} title="No upcoming sessions." />;

  const cue = dayCue(session.dayKey, todayOrgDay);
  const eyebrow = session.isInProgress
    ? "Happening now"
    : cue
      ? `${NEXT_SESSION} · ${cue}`
      : NEXT_SESSION;
  const where = session.location ? ` · ${session.location}` : "";
  const stream = session.isInProgress ? session.youtubeUrl : null;
  const hasAction = detail.data !== undefined || detail.isPending || stream !== null;

  return (
    <HeroCard
      tone="brand"
      eyebrow={eyebrow}
      title={session.title}
      meta={`${formatWeekdayDay(session.dayKey)} · ${formatWallTime(session.time)} · ${formatMinutes(session.durationMinutes)}${where}`}
      onTitlePress={() =>
        router.push({ pathname: "/session/[id]", params: { id: String(session.id) } })
      }
      action={
        hasAction ? (
          <View className="w-full gap-2">
            {detail.data ? (
              <StudentCheckInCard detail={detail.data} onHero />
            ) : detail.isPending ? (
              // Holds the button's height so the list below doesn't jump when it lands.
              <View className="min-h-[46px]" />
            ) : null}
            {stream ? (
              <Button variant="onHero" onPress={() => void Linking.openURL(stream)}>
                Join stream
              </Button>
            ) : null}
          </View>
        ) : undefined
      }
    />
  );
}
