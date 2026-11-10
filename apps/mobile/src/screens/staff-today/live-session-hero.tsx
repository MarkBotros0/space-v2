import { useRouter } from "expo-router";
import { Linking } from "react-native";
import type { DashboardSession } from "@space/shared";

import { SessionHomeCard } from "../home/session-card";
import { Button } from "../../design/ui";

/**
 * The admin's session on Home. Attendance is markable once a session has
 * started, so "Mark attendance" shows only while it is in progress, and the
 * stream link likewise (D13); before that the card is plain and its title opens
 * the session. The season ring above already names the season, so the meta
 * line doesn't repeat it.
 */
export function LiveSessionHero({ session, todayKey }: { session: DashboardSession; todayKey: string }) {
  const router = useRouter();
  return (
    <SessionHomeCard
      session={session}
      todayKey={todayKey}
      action={
        session.isInProgress
          ? (onBrand) => (
              <>
                <Button
                  variant={onBrand ? "onHero" : "primary"}
                  onPress={() =>
                    router.push({
                      pathname: "/session/[id]/attendance",
                      params: { id: String(session.id) },
                    })
                  }
                >
                  Mark attendance
                </Button>
                {session.youtubeUrl ? (
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
