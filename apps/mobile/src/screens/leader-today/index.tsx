import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { ClipboardCheck, FileText } from "lucide-react-native";
import { View } from "react-native";
import { UPCOMING_EVENTS_LIMIT, type StaffSeasonDashboard } from "@space/shared";

import { UpcomingEventsCard } from "../../components/dashboard/UpcomingEventsCard";
import { Screen } from "../../design/layout/screen";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { EmptyState } from "../../design/ui/empty-state";
import { CountGrid, type CountTileProps } from "../../design/home/count-tile";
import { PeoplePreview } from "../../design/home/people-preview";
import { SeasonPulse, staffPulseFigures } from "../../design/home/season-pulse";
import { ListSectionHeader } from "../../design/ui/grouped-list";
import { useSeasonStaffDashboard } from "../../hooks/use-dashboard";
import { useUpcomingEvents } from "../../hooks/use-events";
import { useCurrentSeasonId } from "../../hooks/use-seasons";
import { firstName } from "../../lib/format";
import { useSessionStore } from "../../store/session";
import { AnnouncementsHomeCard } from "../announcements/announcements-home-card";
import { atRiskReason } from "./at-risk-reason";
import { LeaderSessionSection, isOnTheDay } from "./session-section";
import { useLiveTodayRefresh } from "./use-live-refresh";

/** Season ring first, then `card` (Home's Announcements card), then the session (owner, 2026-11-08). */
function Body({ data, card }: { data: StaffSeasonDashboard; card: ReactNode }) {
  const router = useRouter();
  const { progress, cohort, submissions, quizzes } = data;
  // The figures count this season only, so the leader's queue opens on the
  // same season; otherwise "3 waiting" lands on a cross-season list showing
  // a different number.
  const toSubmissions = () => router.push({ pathname: "/submissions", params: { seasonId: String(data.season.id) } });
  const toGroup = () => router.push("/groups");
  const hasQuizzes = quizzes.total > 0 || quizzes.drafts > 0;
  const tiles: CountTileProps[] = [
    {
      label: "Submissions to review",
      value: submissions.pendingReview,
      icon: FileText,
      tone: "info",
      onPress: toSubmissions,
    },
    ...(hasQuizzes
      ? [
          {
            label: "Quizzes to grade",
            value: quizzes.pending,
            icon: ClipboardCheck,
            tone: "info" as const,
            onPress: () => router.push("/quizzes"),
          },
        ]
      : []),
  ];
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
        <CountGrid tiles={tiles} />
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
 * boring"): the session to run and, on its day, who is missing; the group's
 * season at a glance; what is waiting as coloured tiles; the students at risk
 * by name; events.
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
        {/* With no season body to place it, the card leads. */}
        {state || !data ? <AnnouncementsHomeCard /> : null}
        {state ?? (data ? <Body data={data} card={<AnnouncementsHomeCard />} /> : null)}
        {/* V2-ONLY no-season branch keeps the events card (D19). */}
        {noSeason || data ? <UpcomingEventsCard query={events} /> : null}
      </View>
    </Screen>
  );
}
