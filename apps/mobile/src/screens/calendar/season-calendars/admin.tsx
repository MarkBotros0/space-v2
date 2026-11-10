import { useRouter } from "expo-router";
import { Calendar as CalendarIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";

import { SeasonSwitcher } from "../../season/season-switcher";
import { RouteError, RouteSkeleton } from "../../../design/layout/route-states";
import { Screen } from "../../../design/layout/screen";
import { Button, EmptyState } from "../../../design/ui";
import { useStaffOrgToday } from "../../../hooks/use-dashboard";
import { useEvents } from "../../../hooks/use-events";
import { useStaffSeasonSelection } from "../../../hooks/use-season-selection";
import { useSeasonSessions } from "../../../hooks/use-sessions";

import { RoutedSeasonCalendar, sessionCount } from "./shared";

/**
 * ADMIN — v1 app/admin/season/[code]/calendar/page.tsx: "Calendar" with
 * "{n} sessions", an "Add session" button and v1's SeasonCalendar over every
 * session of the season. V2-ONLY kept: the season switcher (spec 03 §9; v1
 * forced one season via redirect, R86). Like the leader's (B3-6) it reads the
 * season's own session list rather than the windowed GET /sessions.
 */
export function AdminCalendar() {
  const router = useRouter();
  const selection = useStaffSeasonSelection(true);
  const sessions = useSeasonSessions(selection.seasonId);
  const events = useEvents();
  // The org's day; see LeaderCalendar.
  const orgToday = useStaffOrgToday(selection.seasonId);
  const eventRows = events.data ?? [];
  const rows = sessions.data ?? [];

  let body: ReactNode;
  if (selection.isPending || (selection.seasonId !== null && sessions.isPending) || orgToday.isPending)
    body = <RouteSkeleton />;
  else if (selection.isError) body = <RouteError onRetry={selection.refetch} />;
  else if (selection.seasonId === null)
    body = (
      <EmptyState icon={CalendarIcon} title="No season to show" description="You aren't assigned to a season yet." />
    );
  else if (sessions.isError) body = <RouteError onRetry={() => void sessions.refetch()} />;
  else
    body = (
      // key: switching season starts again from that season's anchor month.
      <RoutedSeasonCalendar key={selection.seasonId} sessions={rows} events={eventRows} today={orgToday.today} />
    );

  return (
    <Screen
      title="Calendar"
      onRefresh={() => {
        selection.refetch();
        void sessions.refetch();
        void events.refetch();
      }}
      refreshing={sessions.isRefetching}
      subtitle={sessions.isPending || selection.seasonId === null ? undefined : sessionCount(rows.length)}
      trailing={
        selection.seasonId !== null ? (
          <Button
            onPress={() =>
              router.push({
                pathname: "/session/new",
                params: { seasonId: String(selection.seasonId) },
              })
            }
          >
            Add session
          </Button>
        ) : undefined
      }
    >
      <View className="flex-col gap-4">
        <SeasonSwitcher seasons={selection.seasons} selectedId={selection.seasonId} onSelect={selection.setSeasonId} />
        {body}
      </View>
    </Screen>
  );
}
