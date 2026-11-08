import { useRouter } from "expo-router";
import { View } from "react-native";
import { UPCOMING_EVENTS_LIMIT, type StaffSeasonDashboard } from "@space/shared";

import { UpcomingEventsCard } from "../../components/dashboard/UpcomingEventsCard";
import { InlineError, RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { PeoplePreview } from "../../design/home/people-preview";
import { SeasonPulse, staffPulseFigures } from "../../design/home/season-pulse";
import { EmptyState } from "../../design/ui";
import { useSeasonStaffDashboard } from "../../hooks/use-dashboard";
import { useUpcomingEvents } from "../../hooks/use-events";
import { useCurrentSeasonId } from "../../hooks/use-seasons";
import { useStaffToday } from "../../hooks/use-staff-today";
import { firstName } from "../../lib/format";
import { joinMeta } from "../../lib/join-meta";
import { AnnouncementsHomeCard } from "../announcements/announcements-home-card";
import { OverdueCallout } from "../season-end/overdue-callout";
import { useSessionStore } from "../../store/session";
import { fromDashboardSession, LiveSessionHero } from "./live-session-hero";
import { NeedsActionList } from "./needs-action-list";

/** The season at a glance, then its students at risk by name. */
function SeasonFigures({ data }: { data: StaffSeasonDashboard }) {
  const router = useRouter();
  const { progress, cohort, season } = data;
  return (
    <>
      <PeoplePreview
        header="Students at risk"
        people={cohort.atRisk.map((r) => ({
          id: r.studentUserId,
          name: r.studentName,
          reason: joinMeta([
            `${r.submissionsCompleted}/${r.submissionsExpected} submitted`,
            r.attendanceTotal > 0 && `${r.attendancePct}% attendance`,
          ]),
        }))}
        total={cohort.atRiskTotal}
        onOpen={(id) => router.push({ pathname: "/student/[id]", params: { id: String(id) } })}
        onSeeAll={() =>
          router.push({ pathname: "/attention/at-risk", params: { seasonId: String(season.id) } })
        }
      />
      <SeasonPulse
        title={season.title}
        progressPct={progress.pct}
        sessionsHeld={progress.sessionsHeld}
        sessionsTotal={progress.sessionsTotal}
        figures={staffPulseFigures(cohort.meanAttendancePct, cohort.studentCount)}
        onPress={() => router.push({ pathname: "/seasons/[code]", params: { code: season.code } })}
      />
    </>
  );
}

/**
 * Admin Home (owner, 2026-11-07: less of a stacked list): the live session,
 * what needs action as coloured tiles, the students at risk by name, the
 * season at a glance (its ring opens the season), events. Assignments and
 * quizzes live on the Work tab. `useStaffToday` and the dashboard share query
 * keys with every list they open, so nothing is fetched twice.
 */
export function AdminToday() {
  const name = useSessionStore((s) => s.user?.name ?? null);
  const current = useCurrentSeasonId();
  const today = useStaffToday("ADMIN");
  const dash = useSeasonStaffDashboard(today.scopeSeasonId);
  const events = useUpcomingEvents(UPCOMING_EVENTS_LIMIT);

  const refresh = () => {
    today.refetch();
    if (today.scopeSeasonId !== null) void dash.refetch();
    void events.refetch();
  };

  let body;
  if (current.isPending) body = <RouteSkeleton />;
  else if (current.isError) body = <RouteError onRetry={current.refetch} />;
  else if (current.seasonId === null)
    // V2-ONLY no-season branch keeps the events card (D19).
    body = (
      <>
        <EmptyState title="No season yet" description="There is no season for you to manage yet." />
        <UpcomingEventsCard query={events} />
      </>
    );
  else {
    const next = dash.data?.nextSession;
    const hero =
      dash.data && next ? (
        <LiveSessionHero session={fromDashboardSession(next, dash.data.season.title)} />
      ) : null;
    const live = next?.isInProgress === true;
    body = (
      <>
        {/* Time-critical first (a session in progress, overdue seasons), then the card. */}
        {live ? hero : null}
        <OverdueCallout />
        <AnnouncementsHomeCard />
        {live ? null : hero}
        {today.isPending ? (
          <RouteSkeleton />
        ) : (
          <NeedsActionList
            needs={today.needs}
            scopeSeasonId={today.scopeSeasonId}
            onRetry={today.refetch}
          />
        )}
        {dash.isPending ? (
          <RouteSkeleton />
        ) : dash.isError || !dash.data ? (
          <InlineError
            message="Couldn't load the season figures."
            onRetry={() => void dash.refetch()}
          />
        ) : (
          <SeasonFigures data={dash.data} />
        )}
        <UpcomingEventsCard query={events} />
      </>
    );
  }

  const named = (name ?? "").trim() !== "";
  return (
    <Screen
      title={named ? `Hi, ${firstName(name)}` : "Home"}
      compactTitle="Home"
      home
      refreshing={today.isRefetching || dash.isRefetching || events.isRefetching}
      onRefresh={refresh}
    >
      <View className="flex-col gap-4">
        {/* A season body places the card itself, under what is time-critical. */}
        {current.isPending || current.isError || current.seasonId === null ? (
          <AnnouncementsHomeCard />
        ) : null}
        {body}
      </View>
    </Screen>
  );
}
