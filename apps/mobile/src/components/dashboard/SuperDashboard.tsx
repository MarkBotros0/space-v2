import { useRouter } from "expo-router";
import { UPCOMING_EVENTS_LIMIT } from "@space/shared";

import { useUpcomingEvents } from "../../hooks/use-events";
import { useOrganisationReport } from "../../hooks/use-reports";
import { ErrorState, LoadingState, Text } from "../../ui";
import { DashboardFrame } from "./DashboardFrame";
import { StatTile, TileRow } from "./StatTile";
import { UpcomingEventsCard } from "./UpcomingEventsCard";

/**
 * Organisation tiles from Plan 15's roll-up — the same query key as the SUPER
 * Reports screen, so one cache entry and one definition (spec 19 §7). The
 * events tile reads `total` from the very response the card renders (D19).
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
    <DashboardFrame onRefresh={refresh} refreshing={org.isRefetching || events.isRefetching}>
      <Text variant="title">Organisation</Text>
      {org.isPending ? (
        <LoadingState />
      ) : org.isError ? (
        <ErrorState
          message="Couldn't load the organisation summary."
          onRetry={() => void org.refetch()}
        />
      ) : (
        <TileRow>
          {/* D20: student ACCOUNTS not graduated — the label says so (spec 17 D4). */}
          <StatTile
            label="Students (not graduated)"
            value={String(org.data.totalStudentsNotGraduated)}
            onPress={() => router.push("/students")}
          />
          <StatTile
            label="Alumni"
            value={String(org.data.totalAlumni)}
            onPress={() => router.push("/students/alumni")}
          />
          {/* v1 R12: every non-deleted season, any status — NOT activeSeasonCount. */}
          <StatTile
            label="Seasons"
            value={String(org.data.seasons.length)}
            caption="All statuses"
            onPress={() => router.push("/seasons")}
          />
        </TileRow>
      )}
      <TileRow>
        <StatTile
          label="Upcoming events"
          value={events.data ? String(events.data.total) : "—"}
          caption="From today, next 12 months"
          onPress={() => router.push("/events")}
        />
      </TileRow>
      <UpcomingEventsCard query={events} />
    </DashboardFrame>
  );
}
