import { useRouter } from "expo-router";
import { Users } from "lucide-react-native";
import { View } from "react-native";
import { AT_RISK_PCT, UPCOMING_EVENTS_LIMIT, type StaffSeasonDashboard } from "@space/shared";

import { UpcomingEventsCard } from "../../components/dashboard/UpcomingEventsCard";
import { Screen } from "../../design/layout/screen";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { EmptyState } from "../../design/ui/empty-state";
import { GroupedList, ListRow, ListSectionHeader } from "../../design/ui/grouped-list";
import { StatTile } from "../../design/ui/stat-tile";
import { Text } from "../../design/ui/text";
import { useSeasonStaffDashboard } from "../../hooks/use-dashboard";
import { useUpcomingEvents } from "../../hooks/use-events";
import { useCurrentSeasonId } from "../../hooks/use-seasons";
import { firstName } from "../../lib/format";
import { useSessionStore } from "../../store/session";
import { atRiskReason } from "./at-risk-reason";
import { LeaderSessionSection, isOnTheDay } from "./session-section";
import { useLiveTodayRefresh } from "./use-live-refresh";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const count = (n: number) => (
  <Text variant="body" tabular>
    {String(n)}
  </Text>
);

function Body({ data }: { data: StaffSeasonDashboard }) {
  const router = useRouter();
  const { progress, cohort, submissions, quizzes } = data;
  const mean = cohort.meanAttendancePct;
  // The figures count this season only, so the leader's queue opens on the
  // same season; otherwise "3 waiting" lands on a cross-season list showing
  // a different number.
  const toSubmissions = () =>
    router.push({ pathname: "/submissions", params: { seasonId: String(data.season.id) } });
  const toQuizzes = () => router.push("/quizzes");
  const student = (id: number) => () =>
    router.push({ pathname: "/student/[id]", params: { id: String(id) } });

  return (
    <>
      <LeaderSessionSection session={data.nextSession} checkIn={data.leaderSession} />

      <GroupedList header="To review">
        <ListRow
          title="Submissions waiting"
          trailing={count(submissions.pendingReview)}
          trailingLabel={String(submissions.pendingReview)}
          chevron
          onPress={toSubmissions}
        />
        <ListRow
          title="Reviewed"
          trailing={count(submissions.reviewed)}
          trailingLabel={String(submissions.reviewed)}
          chevron
          onPress={toSubmissions}
        />
        {quizzes.total > 0 || quizzes.drafts > 0 ? (
          <ListRow
            title="Quizzes to grade"
            subtitle={
              quizzes.drafts > 0
                ? `${quizzes.drafts} quiz ${plural(quizzes.drafts, "draft", "drafts")} not yet published`
                : undefined
            }
            trailing={count(quizzes.pending)}
            trailingLabel={String(quizzes.pending)}
            chevron
            onPress={toQuizzes}
          />
        ) : null}
        {quizzes.total > 0 || quizzes.drafts > 0 ? (
          <ListRow
            title="Fully graded"
            trailing={count(quizzes.fullyGraded)}
            trailingLabel={String(quizzes.fullyGraded)}
            chevron
            onPress={toQuizzes}
          />
        ) : null}
      </GroupedList>

      {cohort.atRisk.length === 0 ? (
        <View className="gap-1.5">
          <ListSectionHeader>Your students at risk</ListSectionHeader>
          <EmptyState
            icon={Users}
            title="Nobody at risk"
            description={`No student has attendance or submissions below ${AT_RISK_PCT}%.`}
          />
        </View>
      ) : (
        <GroupedList header="Your students at risk">
          {cohort.atRisk.map((r) => (
            <ListRow
              key={`${r.studentUserId}:${r.seasonId}`}
              title={r.studentName}
              titleLines={2}
              subtitle={atRiskReason(r)}
              chevron
              onPress={student(r.studentUserId)}
            />
          ))}
          {cohort.atRiskTotal > cohort.atRisk.length ? (
            <ListRow
              title={`See all ${cohort.atRiskTotal}`}
              chevron
              onPress={() => router.push("/groups")}
            />
          ) : null}
        </GroupedList>
      )}

      <View className="gap-1.5">
        <ListSectionHeader>This season</ListSectionHeader>
        <View className="flex-row flex-wrap gap-3">
          <StatTile
            label="Students"
            value={cohort.studentCount}
            onPress={() => router.push("/groups")}
          />
          <StatTile label="Attendance" value={mean ?? "—"} suffix={mean !== null ? "%" : undefined} />
          <StatTile
            label={`Season progress · Session ${progress.sessionsHeld} of ${progress.sessionsTotal}`}
            value={progress.pct ?? 0}
            suffix="%"
          />
        </View>
      </View>
    </>
  );
}

/** The leader's Today: the session to run, who is missing, what to review. */
export function LeaderToday() {
  const name = useSessionStore((s) => s.user?.name ?? null);
  const current = useCurrentSeasonId();
  const dash = useSeasonStaffDashboard(current.seasonId);
  const events = useUpcomingEvents(UPCOMING_EVENTS_LIMIT);
  useLiveTodayRefresh({
    enabled: current.seasonId !== null,
    // Never restarts a read already in flight (the first load on a cold launch).
    refetch: () => dash.refetch({ cancelRefetch: false }),
    isStale: dash.isStale,
    live: current.seasonId !== null && isOnTheDay(dash.data?.nextSession ?? null),
  });

  const refresh = () => {
    current.refetch();
    if (current.seasonId !== null) void dash.refetch();
    void events.refetch();
  };

  const noSeason = !current.isPending && !current.isError && current.seasonId === null;
  const state = current.isPending ? (
    <RouteSkeleton />
  ) : current.isError ? (
    <RouteError onRetry={current.refetch} />
  ) : current.seasonId === null ? (
    <EmptyState title="No season yet" description="There is no season for you to manage yet." />
  ) : dash.isPending ? (
    <RouteSkeleton />
  ) : dash.isError ? (
    <RouteError onRetry={() => void dash.refetch()} />
  ) : null;

  const named = (name ?? "").trim() !== "";
  const data = dash.data;
  return (
    <Screen
      home
      title={named ? `Hi, ${firstName(name)}` : "Home"}
      compactTitle="Home"
      subtitle={data ? data.groups.map((g) => g.name).join(", ") || "Your group" : undefined}
      refreshing={dash.isRefetching || events.isRefetching}
      onRefresh={refresh}
    >
      <View className="flex-col gap-4">
        {state ?? (data ? <Body data={data} /> : null)}
        {/* V2-ONLY no-season branch keeps the events card (D19). */}
        {noSeason || data ? <UpcomingEventsCard query={events} /> : null}
      </View>
    </Screen>
  );
}
