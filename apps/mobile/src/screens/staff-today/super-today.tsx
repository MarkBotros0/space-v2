import { useRouter } from "expo-router";
import { CalendarDays, GraduationCap, Layers, Users } from "lucide-react-native";
import { View } from "react-native";
import { UPCOMING_EVENTS_LIMIT } from "@space/shared";

import { UpcomingEventsCard } from "../../components/dashboard/UpcomingEventsCard";
import { InlineError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { FigureGrid } from "../../design/home/figure-tile";
import { GroupedList, ListRow, ListSectionHeader } from "../../design/ui";
import { useUpcomingEvents } from "../../hooks/use-events";
import { useOrganisationReport } from "../../hooks/use-reports";
import { useStaffToday } from "../../hooks/use-staff-today";
import { firstName } from "../../lib/format";
import { OverdueCallout } from "../season-end/overdue-callout";
import { liveSessions, nextSession } from "../../lib/staff-today";
import { useSessionStore } from "../../store/session";
import { fromListItem, LiveSessionHero } from "./live-session-hero";
import { NeedsActionList } from "./needs-action-list";

/**
 * Super Today: live sessions across every active season, what needs action,
 * then the organisation figures as a grid of tiles (owner, 2026-11-07). The
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
      title={named ? `Hi, ${firstName(name)}` : "Home"}
      compactTitle="Home"
      home
      refreshing={today.isRefetching || org.isRefetching || events.isRefetching}
      onRefresh={refresh}
    >
      <View className="flex-col gap-4">
        {hero ? <LiveSessionHero session={fromListItem(hero, live.length > 0)} /> : null}
        {live.length > 1 ? (
          <GroupedList header="Also happening now">
            {live.slice(1).map((s) => {
              const row = fromListItem(s, true);
              return (
                <ListRow
                  key={s.id}
                  title={row.title}
                  subtitle={row.meta}
                  chevron
                  onPress={() =>
                    router.push({ pathname: "/session/[id]", params: { id: String(s.id) } })
                  }
                />
              );
            })}
          </GroupedList>
        ) : null}
        <OverdueCallout />
        {today.isPending ? (
          <RouteSkeleton />
        ) : (
          <NeedsActionList
            needs={today.needs}
            scopeSeasonId={today.scopeSeasonId}
            onRetry={today.refetch}
          />
        )}
        {org.isPending ? (
          <RouteSkeleton />
        ) : org.isError ? (
          <InlineError
            message="Couldn't load the organisation figures."
            onRetry={() => void org.refetch()}
          />
        ) : (
          <View className="gap-2">
            <ListSectionHeader className="pb-0">Organisation</ListSectionHeader>
            <FigureGrid
              tiles={[
                {
                  label: "Students (not graduated)",
                  value: String(org.data.totalStudentsNotGraduated),
                  icon: Users,
                  onPress: () => router.push("/students"),
                },
                {
                  label: "Alumni",
                  value: String(org.data.totalAlumni),
                  icon: GraduationCap,
                  onPress: () => router.push("/students/alumni"),
                },
                {
                  label: "Seasons",
                  value: String(org.data.seasons.length),
                  icon: Layers,
                  onPress: () => router.push("/seasons"),
                },
                {
                  label: "Upcoming events",
                  value: events.data ? String(events.data.total) : "—",
                  icon: CalendarDays,
                  onPress: () => router.push("/events"),
                },
              ]}
            />
          </View>
        )}
        <UpcomingEventsCard query={events} />
      </View>
    </Screen>
  );
}
