import { useRouter } from "expo-router";
import { View } from "react-native";
import { UPCOMING_EVENTS_LIMIT } from "@space/shared";

import { PageTitle } from "../../design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { ShellFrame } from "../../design/layout/shell-frame";
import { StatCard } from "../../design/students/stat-card";
import { useUpcomingEvents } from "../../hooks/use-events";
import { useOrganisationReport } from "../../hooks/use-reports";
import { UpcomingEventsCard } from "./UpcomingEventsCard";

/**
 * v1 app/super/dashboard/page.tsx (B5-1): "Super Dashboard", four stat cards
 * in a 2×2 grid, then the upcoming-events card. The numbers come from Plan
 * 15's roll-up — the same query key as the SUPER Reports screen, so one cache
 * entry and one definition (spec 19 §7). The events card shows `total` from
 * the very response it renders (D19). V2 labels kept: D20 "Students (not
 * graduated)" and v1 R12's "all statuses" Seasons count.
 */
export function SuperDashboard() {
  const router = useRouter();
  const org = useOrganisationReport(true);
  const events = useUpcomingEvents(UPCOMING_EVENTS_LIMIT);

  const refresh = () => {
    void org.refetch();
    void events.refetch();
  };

  return (
    <ShellFrame onRefresh={refresh} refreshing={org.isRefetching || events.isRefetching}>
      <View className="flex-col gap-4">
        <PageTitle title="Super Dashboard" subtitle="Global system overview" />
        {org.isPending ? (
          <RouteSkeleton />
        ) : org.isError ? (
          <RouteError onRetry={() => void org.refetch()} />
        ) : (
          <>
            <View className="flex-row gap-3">
              <StatCard
                label="Students (not graduated)"
                value={String(org.data.totalStudentsNotGraduated)}
                onPress={() => router.push("/students")}
              />
              <StatCard
                label="Alumni"
                value={String(org.data.totalAlumni)}
                variant="teal"
                onPress={() => router.push("/students/alumni")}
              />
            </View>
            <View className="flex-row gap-3">
              <StatCard
                label="Seasons"
                value={String(org.data.seasons.length)}
                sublabel="All statuses"
                onPress={() => router.push("/seasons")}
              />
              <StatCard
                label="Upcoming events"
                value={events.data ? String(events.data.total) : "—"}
                sublabel="From today, next 12 months"
                onPress={() => router.push("/events")}
              />
            </View>
          </>
        )}
        <UpcomingEventsCard query={events} />
      </View>
    </ShellFrame>
  );
}
