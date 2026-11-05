import { useRouter } from "expo-router";
import { AlertTriangle } from "lucide-react-native";
import { View } from "react-native";
import { UPCOMING_EVENTS_LIMIT } from "@space/shared";

import { UpcomingEventsCard } from "../../components/dashboard/UpcomingEventsCard";
import { NAV_ICONS } from "../../design/icons/nav-icon";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { iconWithClassName } from "../../design/lib/icon";
import { EmptyState, GroupedList, ListRow, Text } from "../../design/ui";
import { useStudentDashboard } from "../../hooks/use-dashboard";
import { useUpcomingEvents } from "../../hooks/use-events";
import { useStudentQuizList } from "../../hooks/use-quizzes";
import { useMyAttendance } from "../../hooks/use-self-service";
import { useSessionDetail } from "../../hooks/use-session-detail";
import { firstName, formatLongDay } from "../../lib/format";
import { useSessionStore } from "../../store/session";
import { NextSessionHero } from "./next-session-hero";
import { OpenWorkList } from "./open-work-list";
import { TodayFigures } from "./today-figures";

iconWithClassName(AlertTriangle);

function LateCallout({ count }: { count: number }) {
  return (
    <View className="flex-row items-center gap-2 rounded-control bg-warn-soft p-3">
      <AlertTriangle size={16} className="shrink-0 text-warn" />
      <Text variant="subhead" className="min-w-0 flex-1 text-warn">
        {`${count} ${count === 1 ? "assignment" : "assignments"} submitted late this season`}
      </Text>
    </View>
  );
}

/**
 * The student's Today: what to do now, first. Next session and its check-in,
 * then the work that is open, then the figures. Copy rulings kept from v2:
 * "Absence budget left" (D14), "Join stream" only while a session runs (D13),
 * the events card with its empty state (D19). The season-bound reads are gated
 * on what the server says, so a student who isn't enrolled sends none of them.
 */
export function StudentToday() {
  const router = useRouter();
  const name = useSessionStore((s) => s.user?.name ?? null);
  const activeSeasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);

  const dash = useStudentDashboard(activeSeasonId);
  const data = dash.data;
  const seasonId = data?.season?.id ?? null;
  const nextId = data?.nextSession?.id ?? null;

  const attendance = useMyAttendance(activeSeasonId);
  const events = useUpcomingEvents(UPCOMING_EVENTS_LIMIT);
  const detail = useSessionDetail(nextId);
  const quizzes = useStudentQuizList(seasonId);

  const refresh = () => {
    void dash.refetch();
    void events.refetch();
    // `enabled` gates only the automatic run: guard the manual ones too.
    if (activeSeasonId !== null) void attendance.refetch();
    if (nextId !== null) void detail.refetch();
    if (seasonId !== null) void quizzes.refetch();
  };

  const late = data?.assignments?.lateSubmittedCount ?? 0;

  return (
    <Screen
      home
      title={`Hi, ${firstName(name)}`}
      subtitle={data ? formatLongDay(data.todayOrgDay) : undefined}
      compactTitle="Today"
      onRefresh={refresh}
      refreshing={
        dash.isRefetching ||
        attendance.isRefetching ||
        events.isRefetching ||
        detail.isRefetching ||
        quizzes.isRefetching
      }
    >
      {dash.isPending ? (
        <RouteSkeleton />
      ) : dash.isError ? (
        <RouteError onRetry={() => void dash.refetch()} />
      ) : data?.season ? (
        <View className="flex-col gap-4">
          <NextSessionHero
            session={data.nextSession}
            todayOrgDay={data.todayOrgDay}
            detail={detail}
          />
          <OpenWorkList
            open={data.assignments?.open ?? []}
            quizzes={quizzes}
            todayOrgDay={data.todayOrgDay}
          />
          {late > 0 ? <LateCallout count={late} /> : null}
          <TodayFigures data={data} attendance={attendance} />
          <UpcomingEventsCard query={events} />
        </View>
      ) : (
        <View className="flex-col gap-4">
          <EmptyState
            icon={NAV_ICONS.season}
            title="Not enrolled yet"
            description="Contact your leader or admin to be enrolled in a season."
          />
          <GroupedList header="While you wait">
            <ListRow title="Complete your profile" chevron onPress={() => router.push("/profile")} />
          </GroupedList>
          <UpcomingEventsCard query={events} />
        </View>
      )}
    </Screen>
  );
}
