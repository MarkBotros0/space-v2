import { useRouter } from "expo-router";
import { Linking } from "react-native";
import type { DashboardSession, SessionListItem } from "@space/shared";

import { Button, HeroCard } from "../../design/ui";
import { formatWallTime, formatWeekdayDay, formatMinutes } from "../../lib/format";
import { joinMeta } from "../../lib/join-meta";

export type HeroSession = {
  id: number;
  title: string;
  meta: string;
  inProgress: boolean;
  /** Only the admin's dashboard session carries one (D13). */
  youtubeUrl: string | null;
};

type Parts = {
  seasonTitle: string;
  dayKey: string;
  time: string;
  durationMinutes: number;
  location: string | null;
};
const metaOf = (p: Parts) =>
  joinMeta([
    p.seasonTitle,
    formatWeekdayDay(p.dayKey),
    formatWallTime(p.time),
    formatMinutes(p.durationMinutes),
    p.location,
  ]);

/** The admin's session: the dashboard's own `isInProgress` decides live. */
export function fromDashboardSession(s: DashboardSession, seasonTitle: string): HeroSession {
  return {
    id: s.id,
    title: s.title,
    meta: metaOf({ ...s, seasonTitle }),
    inProgress: s.isInProgress,
    youtubeUrl: s.youtubeUrl,
  };
}

/** A session from a season's list; `inProgress` is whether it is in the live set. */
export function fromListItem(s: SessionListItem, inProgress: boolean): HeroSession {
  return {
    id: s.id,
    title: s.title,
    meta: metaOf({ ...s, time: s.startTime }),
    inProgress,
    youtubeUrl: null,
  };
}

/**
 * The one session that matters now. Attendance is markable once a session has
 * started, so "Mark attendance" shows only while it is in progress (a next
 * session has not started); the stream link likewise only while live (D13).
 */
export function LiveSessionHero({ session }: { session: HeroSession }) {
  const router = useRouter();
  return (
    <HeroCard
      eyebrow={session.inProgress ? "Happening now" : "Next session"}
      title={session.title}
      meta={session.meta}
      action={
        <>
          {session.inProgress ? (
            <Button
              onPress={() =>
                router.push({
                  pathname: "/session/[id]/attendance",
                  params: { id: String(session.id) },
                })
              }
            >
              Mark attendance
            </Button>
          ) : null}
          <Button
            variant={session.inProgress ? "secondary" : "primary"}
            onPress={() =>
              router.push({ pathname: "/session/[id]", params: { id: String(session.id) } })
            }
          >
            Open session
          </Button>
          {session.inProgress && session.youtubeUrl ? (
            <Button
              variant="secondary"
              onPress={() => void Linking.openURL(session.youtubeUrl ?? "")}
            >
              Join stream
            </Button>
          ) : null}
        </>
      }
    />
  );
}
