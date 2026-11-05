import { useRouter } from "expo-router";
import { View } from "react-native";
import { UPCOMING_EVENTS_LIMIT, type StaffSeasonDashboard } from "@space/shared";

import { UpcomingEventsCard } from "../../components/dashboard/UpcomingEventsCard";
import { InlineError, RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { EmptyState, GroupedList, ListRow, StatTile } from "../../design/ui";
import { useSeasonStaffDashboard } from "../../hooks/use-dashboard";
import { useUpcomingEvents } from "../../hooks/use-events";
import { useCurrentSeasonId } from "../../hooks/use-seasons";
import { useStaffToday } from "../../hooks/use-staff-today";
import { firstName } from "../../lib/format";
import { joinMeta } from "../../lib/join-meta";
import { useSessionStore } from "../../store/session";
import { fromDashboardSession, LiveSessionHero } from "./live-session-hero";
import { NeedsActionList } from "./needs-action-list";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function Figures({ data }: { data: StaffSeasonDashboard }) {
  const router = useRouter();
  const { progress, cohort, submissions, quizzes, season } = data;
  const mean = cohort.meanAttendancePct;
  const showQuizzes = quizzes.total > 0 || quizzes.drafts > 0;
  return (
    <>
      <View className="flex-row flex-wrap gap-3">
        <StatTile label="Attendance" value={mean ?? "—"} suffix={mean === null ? undefined : "%"} />
        <StatTile label={`Progress · Session ${progress.sessionsHeld}/${progress.sessionsTotal}`} value={`${progress.pct ?? 0}%`} />
        <StatTile label="Students" value={cohort.studentCount} />
      </View>
      <GroupedList>
        <ListRow
          title="Season"
          subtitle={season.title}
          chevron
          onPress={() => router.push({ pathname: "/seasons/[code]", params: { code: season.code } })}
        />
        <ListRow title="Students" chevron onPress={() => router.push("/students")} />
        <ListRow
          title="Assignments"
          subtitle={joinMeta([`${submissions.reviewed} reviewed`, `${submissions.pendingReview} pending review`])}
          chevron
          onPress={() => router.push("/assignments")}
        />
        {showQuizzes ? (
          <ListRow
            title="Quizzes"
            subtitle={joinMeta([
              `${quizzes.pending} pending`,
              `${quizzes.fullyGraded} fully graded`,
              quizzes.drafts > 0 && `${quizzes.drafts} quiz ${plural(quizzes.drafts, "draft", "drafts")} not yet published`,
            ])}
            chevron
            onPress={() => router.push("/quizzes")}
          />
        ) : null}
      </GroupedList>
      {cohort.atRisk.length > 0 ? (
        <GroupedList header="Students at risk">
          {cohort.atRisk.map((r, i) => (
            <ListRow
              key={`${r.studentUserId}:${r.seasonId}`}
              index={i}
              title={r.studentName}
              subtitle={joinMeta([
                `${r.submissionsCompleted}/${r.submissionsExpected} submitted`,
                r.attendanceTotal > 0 && `${r.attendancePct}% attendance`,
              ])}
              chevron
              onPress={() =>
                router.push({ pathname: "/student/[id]", params: { id: String(r.studentUserId) } })
              }
            />
          ))}
        </GroupedList>
      ) : null}
    </>
  );
}

/**
 * Admin Today: the live session, what needs action, then the season's figures
 * (the old dashboard, below the action). `useStaffToday` and the dashboard
 * share query keys with every list they open, so nothing is fetched twice.
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
    body = (
      <>
        {dash.data && next ? <LiveSessionHero session={fromDashboardSession(next, dash.data.season.title)} /> : null}
        {today.isPending ? (
          <RouteSkeleton />
        ) : (
          <NeedsActionList needs={today.needs} scopeSeasonId={today.scopeSeasonId} onRetry={today.refetch} />
        )}
        {dash.isPending ? (
          <RouteSkeleton />
        ) : dash.isError || !dash.data ? (
          <InlineError message="Couldn't load the season figures." onRetry={() => void dash.refetch()} />
        ) : (
          <Figures data={dash.data} />
        )}
        <UpcomingEventsCard query={events} />
      </>
    );
  }

  const named = (name ?? "").trim() !== "";
  return (
    <Screen
      title={named ? `Hi, ${firstName(name)}` : "Today"}
      compactTitle="Today"
      home
      refreshing={today.isRefetching || dash.isRefetching || events.isRefetching}
      onRefresh={refresh}
    >
      <View className="flex-col gap-4">{body}</View>
    </Screen>
  );
}
