import { AlertTriangle } from "lucide-react-native";
import { View } from "react-native";
import { UPCOMING_EVENTS_LIMIT } from "@space/shared";

import { UpcomingEventsCard } from "../../components/dashboard/UpcomingEventsCard";
import { InlineError, RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { iconWithClassName } from "../../design/lib/icon";
import { Text } from "../../design/ui";
import { DASHBOARD_STALE_TIME, useStudentDashboard } from "../../hooks/use-dashboard";
import { useUpcomingEvents } from "../../hooks/use-events";
import { useStudentQuizList } from "../../hooks/use-quizzes";
import { usePullRefresh } from "../../hooks/use-pull-refresh";
import { useRefreshOnResume } from "../../hooks/use-refresh-on-resume";
import { useMyAttendance, useSeasonHistory } from "../../hooks/use-self-service";
import { useSessionDetail } from "../../hooks/use-session-detail";
import { firstName, formatLongDay } from "../../lib/format";
import { DEFAULT_STALE_TIME } from "../../lib/query-client";
import { useSessionStore } from "../../store/session";
import { BetweenSeasons } from "./between-seasons";
import { AnnouncementsHomeCard } from "../announcements/announcements-home-card";
import { NextSessionHero } from "./next-session-hero";
import { OpenWorkList } from "./open-work-list";
import { TodayFigures } from "./today-figures";

iconWithClassName(AlertTriangle);

function LateCallout({ count }: { count: number }) {
  return (
    <View className="flex-row items-center gap-2 rounded-control bg-warn-soft p-3">
      <AlertTriangle size={16} className="shrink-0 text-warn" />
      <Text variant="subhead" className="min-w-0 flex-1 text-warn">
        {`${count} ${count === 1 ? "assignment" : "assignments"} submitted late this season`}
      </Text>
    </View>
  );
}

/**
 * The student's Today: what to do now, first. Next session and its check-in,
 * then the work that is open, then the figures. Copy rulings kept from v2:
 * "Absence budget left" (D14), "Join stream" only while a session runs (D13),
 * the events card with its empty state (D19). The season-bound reads are gated
 * on what the server says, so a student who isn't enrolled sends none of them.
 */
export function StudentToday() {
  const name = useSessionStore((s) => s.user?.name ?? null);
  const activeSeasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);

  const dash = useStudentDashboard(activeSeasonId);
  const data = dash.data;
  const seasonId = data?.season?.id ?? null;
  const nextId = data?.nextSession?.id ?? null;

  const attendance = useMyAttendance(activeSeasonId);
  const events = useUpcomingEvents(UPCOMING_EVENTS_LIMIT);
  const detail = useSessionDetail(nextId);
  const quizzes = useStudentQuizList(seasonId);
  // Between seasons: no season in the token, or the dashboard says there isn't one.
  const between = activeSeasonId === null || (data !== undefined && data.season === null);
  const history = useSeasonHistory(activeSeasonId, between);

  const pull = usePullRefresh(() =>
    Promise.all([
      dash.refetch(),
      events.refetch(),
      // `enabled` gates only the automatic run: guard the manual ones too.
      activeSeasonId !== null ? attendance.refetch() : null,
      nextId !== null ? detail.refetch() : null,
      seasonId !== null ? quizzes.refetch() : null,
      between ? history.refetch() : null,
    ]),
  );

  // This tab stays mounted, so nothing else re-reads it: back on it, or back in
  // the app the next morning, whatever is past its freshness is read again. By
  // the clock: a query's own stale timer may not have fired yet after a sleep.
  useRefreshOnResume(() => {
    const queries = [
      { q: dash, freshFor: DASHBOARD_STALE_TIME },
      { q: events, freshFor: DEFAULT_STALE_TIME },
      ...(activeSeasonId !== null ? [{ q: attendance, freshFor: DEFAULT_STALE_TIME }] : []),
      ...(nextId !== null ? [{ q: detail, freshFor: DEFAULT_STALE_TIME }] : []),
      ...(seasonId !== null ? [{ q: quizzes, freshFor: DEFAULT_STALE_TIME }] : []),
      ...(between ? [{ q: history, freshFor: DEFAULT_STALE_TIME }] : []),
    ];
    for (const { q, freshFor } of queries) {
      if (q.dataUpdatedAt > 0 && Date.now() - q.dataUpdatedAt >= freshFor) {
        void q.refetch({ cancelRefetch: false });
      }
    }
  });

  const late = data?.assignments?.lateSubmittedCount ?? 0;
  const checkInFirst = detail.data?.checkInOpen === true && detail.data.myAttendance === null;
  const hero = data ? (
    <NextSessionHero session={data.nextSession} todayOrgDay={data.todayOrgDay} detail={detail} />
  ) : null;

  // A failed read keeps what's on screen, but says so: a pull that changes nothing must explain why.
  const stale = dash.isError ? (
    <InlineError
      message="Couldn't refresh. This may be out of date."
      onRetry={() => void dash.refetch()}
    />
  ) : null;

  return (
    <Screen
      home
      title={`Hi, ${firstName(name)}`}
      subtitle={data ? formatLongDay(data.todayOrgDay) : undefined}
      compactTitle="Home"
      onRefresh={pull.onRefresh}
      refreshing={pull.refreshing}
    >
      {dash.isPending ? (
        <RouteSkeleton />
      ) : data === undefined ? (
        // Only with nothing to show: a failed background read keeps the hero and an open sheet.
        <RouteError onRetry={() => void dash.refetch()} />
      ) : data.season ? (
        <View className="flex-col gap-4">
          {stale}
          {/* Owner 2026-11-07: the season first, then the session, then To do; while
              check-in is open and they haven't checked in, the session leads. */}
          {checkInFirst ? hero : null}
          <AnnouncementsHomeCard />
          <TodayFigures data={data} attendance={attendance} />
          {checkInFirst ? null : hero}
          <OpenWorkList
            open={data.assignments?.open ?? []}
            quizzes={quizzes}
            todayOrgDay={data.todayOrgDay}
          />
          {late > 0 ? <LateCallout count={late} /> : null}
          <UpcomingEventsCard query={events} />
        </View>
      ) : (
        <View className="flex-col gap-4">
          {stale}
          <AnnouncementsHomeCard />
          <BetweenSeasons history={history} />
          <UpcomingEventsCard query={events} />
        </View>
      )}
    </Screen>
  );
}
