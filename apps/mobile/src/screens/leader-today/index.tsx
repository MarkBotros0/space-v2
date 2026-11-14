import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { ClipboardCheck, FileText } from "lucide-react-native";
import { View } from "react-native";
import { UPCOMING_EVENTS_LIMIT, type StaffSeasonDashboard } from "@space/shared";

import { UpcomingEventsCard } from "../home/upcoming-events-card";
import { Screen } from "../../design/layout/screen";
import { queryStateView, RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { EmptyState } from "../../design/ui/empty-state";
import { CountTile } from "../home/count-tile";
import { PeoplePreview } from "../home/people-preview";
import { SeasonPulse, staffPulseFigures } from "../home/season-pulse";
import { ListSectionHeader } from "../../design/ui/grouped-list";
import { useSeasonStaffDashboard } from "../../hooks/use-dashboard";
import { useUpcomingEvents } from "../../hooks/use-events";
import { useCurrentSeasonId } from "../../hooks/use-seasons";
import { firstName } from "../../lib/format";
import { useSessionStore } from "../../store/session";
import { AnnouncementsHomeCard } from "../announcements/announcements-home-card";
import { atRiskReason } from "../home/at-risk-reason";
import { LeaderSessionSection, isOnTheDay } from "./session-section";
import { useLiveTodayRefresh } from "./use-live-refresh";

/** Season ring first, then `card` (Home's Announcements card), then the session (owner, 2026-11-08). */
function Body({ data, card }: { data: StaffSeasonDashboard; card: ReactNode }) {
  const router = useRouter();
  const { progress, cohort, submissions, quizzes } = data;
  // Work is the current season's, the same season these figures count (owner 2026-11-14).
  const toAssignments = () => router.push({ pathname: "/coursework", params: { tab: "assignments" } });
  const toGroup = () => router.push("/groups");
  // The students at risk are named in the list right below, so they get no tile of their own.

  return (
    <>
      <SeasonPulse
        // The header already names the group; the ring is the season's (owner, 2026-11-09).
        title={data.season.title}
        progressPct={progress.pct}
        sessionsHeld={progress.sessionsHeld}
        sessionsTotal={progress.sessionsTotal}
        figures={staffPulseFigures(cohort.meanAttendancePct, cohort.studentCount)}
        onPress={toGroup}
      />
      {card}
      <LeaderSessionSection session={data.nextSession} checkIn={data.leaderSession} />
      <View className="gap-2">
        <ListSectionHeader className="pb-0">Waiting for you</ListSectionHeader>
        {/* Always the two side by side, a zero included (owner 2026-11-14: "a split"). */}
        <View testID="waiting-split" className="flex-row gap-3">
          <CountTile
            label="Assignments to review"
            value={submissions.pendingReview}
            icon={FileText}
            tone="info"
            onPress={toAssignments}
          />
          <CountTile
            label="Quizzes to grade"
            value={quizzes.pending}
            icon={ClipboardCheck}
            tone="info"
            onPress={() => router.push({ pathname: "/coursework", params: { tab: "quizzes" } })}
          />
        </View>
      </View>
      <PeoplePreview
        header="Students at risk"
        people={cohort.atRisk.map((r) => ({
          id: r.studentUserId,
          name: r.studentName,
          reason: atRiskReason(r),
        }))}
        total={cohort.atRiskTotal}
        onOpen={(id) => router.push({ pathname: "/student/[id]", params: { id: String(id) } })}
        onSeeAll={toGroup}
      />
    </>
  );
}

/**
 * The leader's Home (owner, 2026-11-07: "very stacked… clear and vivid, not
 * boring"): the group's season at a glance; the session to run (who is missing
 * is on Mark attendance, owner 2026-11-14); assignments and quizzes waiting, as
 * two tiles side by side; the students at risk by name; events.
 */
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
  ) : (
    (queryStateView(dash) ?? null)
  );

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
        {/* With no season body to place it, the card leads. */}
        {state || !data ? <AnnouncementsHomeCard /> : null}
        {state ?? (data ? <Body data={data} card={<AnnouncementsHomeCard />} /> : null)}
        {/* V2-ONLY no-season branch keeps the events card (D19). */}
        {noSeason || data ? <UpcomingEventsCard query={events} /> : null}
      </View>
    </Screen>
  );
}
