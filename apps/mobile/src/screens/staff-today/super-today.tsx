import { useRouter } from "expo-router";
import { View } from "react-native";
import { UPCOMING_EVENTS_LIMIT } from "@space/shared";

import { UpcomingEventsCard } from "../../components/dashboard/UpcomingEventsCard";
import { InlineError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { GroupedList, ListRow, Text } from "../../design/ui";
import { useUpcomingEvents } from "../../hooks/use-events";
import { useOrganisationReport } from "../../hooks/use-reports";
import { useStaffToday } from "../../hooks/use-staff-today";
import { firstName } from "../../lib/format";
import { liveSessions, nextSession } from "../../lib/staff-today";
import { useSessionStore } from "../../store/session";
import { fromListItem, LiveSessionHero } from "./live-session-hero";
import { NeedsActionList } from "./needs-action-list";

const Count = ({ value }: { value: string }) => (
  <Text variant="headline" tabular className="text-muted-foreground">
    {value}
  </Text>
);

/**
 * Super Today: live sessions across every active season, what needs action,
 * then the organisation figures (the old four stat cards, now rows). The
 * figures share the Reports query key; the events count reads `total` from
 * the very response the events card renders (D19).
 */
export function SuperToday() {
  const router = useRouter();
  const name = useSessionStore((s) => s.user?.name ?? null);
  const today = useStaffToday("SUPER");
  const org = useOrganisationReport(true);
  const events = useUpcomingEvents(UPCOMING_EVENTS_LIMIT);

  const refresh = () => {
    today.refetch();
    void org.refetch();
    void events.refetch();
  };

  const now = new Date();
  const live = liveSessions(today.sessions, now, today.orgToday);
  const hero = live[0] ?? nextSession(today.sessions, now, today.orgToday);

  const named = (name ?? "").trim() !== "";
  return (
    <Screen
      title={named ? `Hi, ${firstName(name)}` : "Today"}
      compactTitle="Today"
      home
      refreshing={today.isRefetching || org.isRefetching || events.isRefetching}
      onRefresh={refresh}
    >
      <View className="flex-col gap-4">
        {hero ? <LiveSessionHero session={fromListItem(hero, live.length > 0)} /> : null}
        {live.length > 1 ? (
          <GroupedList header="Also happening now">
            {live.slice(1).map((s, i) => {
              const row = fromListItem(s, true);
              return (
                <ListRow
                  key={s.id}
                  index={i}
                  title={row.title}
                  subtitle={row.meta}
                  chevron
                  onPress={() => router.push({ pathname: "/session/[id]", params: { id: String(s.id) } })}
                />
              );
            })}
          </GroupedList>
        ) : null}
        {today.isPending ? (
          <RouteSkeleton />
        ) : (
          <NeedsActionList needs={today.needs} scopeSeasonId={today.scopeSeasonId} onRetry={today.refetch} />
        )}
        {org.isPending ? (
          <RouteSkeleton />
        ) : org.isError ? (
          <InlineError message="Couldn't load the organisation figures." onRetry={() => void org.refetch()} />
        ) : (
          <GroupedList>
            <ListRow
              title="Students (not graduated)"
              trailing={<Count value={String(org.data.totalStudentsNotGraduated)} />}
              trailingLabel={String(org.data.totalStudentsNotGraduated)}
              chevron
              onPress={() => router.push("/students")}
            />
            <ListRow
              title="Alumni"
              trailing={<Count value={String(org.data.totalAlumni)} />}
              trailingLabel={String(org.data.totalAlumni)}
              chevron
              onPress={() => router.push("/students/alumni")}
            />
            <ListRow
              title="Seasons"
              subtitle="All statuses"
              trailing={<Count value={String(org.data.seasons.length)} />}
              trailingLabel={String(org.data.seasons.length)}
              chevron
              onPress={() => router.push("/seasons")}
            />
            <ListRow
              title="Upcoming events"
              subtitle="From today, next 12 months"
              trailing={<Count value={events.data ? String(events.data.total) : "—"} />}
              trailingLabel={events.data ? String(events.data.total) : "not loaded"}
              chevron
              onPress={() => router.push("/events")}
            />
          </GroupedList>
        )}
        <UpcomingEventsCard query={events} />
      </View>
    </Screen>
  );
}
