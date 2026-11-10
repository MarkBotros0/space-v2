import type { UseQueryResult } from "@tanstack/react-query";
import { Linking, View } from "react-native";
import type { DashboardSession, SessionDetail } from "@space/shared";

import { CheckInWatcher, StudentCheckInCard, checkInVisible } from "../check-in/student-check-in-card";
import { SessionHomeCard } from "../home/session-card";
import { Button } from "../../design/ui";

/**
 * The student's session on Home. The cue counts org days from the server's
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
  // No Check In while check-in isn't open (owner, 2026-11-07); the watcher brings it in when it opens.
  const showCheckIn = detail.data !== undefined && checkInVisible(detail.data);
  const stream = session?.isInProgress ? session.youtubeUrl : null;
  const hasAction = showCheckIn || stream !== null;

  return (
    <>
      {session && detail.data && !showCheckIn ? <CheckInWatcher detail={detail.data} /> : null}
      <SessionHomeCard
        session={session}
        todayKey={todayOrgDay}
        action={
          hasAction
            ? (onBrand) => (
                <View className="w-full gap-2">
                  {showCheckIn && detail.data ? <StudentCheckInCard detail={detail.data} onHero={onBrand} /> : null}
                  {stream ? (
                    <Button variant={onBrand ? "onHero" : "primary"} onPress={() => void Linking.openURL(stream)}>
                      Join stream
                    </Button>
                  ) : null}
                </View>
              )
            : undefined
        }
      />
    </>
  );
}
