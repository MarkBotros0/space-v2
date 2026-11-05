import { View } from "react-native";

import { NAV_ICONS } from "../../design/icons/nav-icon";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { EmptyState, GroupedList, Progress, statusChip, StatusChip, Text } from "../../design/ui";
import { useMySeason } from "../../hooks/use-self-service";
import { formatDate } from "../../lib/format";
import { GroupSection } from "../../screens/season/group-section";
import { UpcomingSection } from "../../screens/season/upcoming-section";
import { useSessionStore } from "../../store/session";

/**
 * The student's `/season` (v1 app/student/season/page.tsx, G21). One read,
 * GET /me/season (Plan 11 Decision 5): progress and "upcoming" are
 * server-derived (C4) and the group comes from this season's enrollment (C9).
 * Progress says "Session N of M" (spec 02 R29).
 */
export function StudentSeason() {
  const seasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  const { data, isPending, isError, refetch, isRefetching } = useMySeason(seasonId);

  const refresh = () => {
    if (seasonId !== null) void refetch();
  };
  const noSeason = (
    <Screen title="Current season">
      <EmptyState
        icon={NAV_ICONS.season}
        title="No active season"
        description="An admin will enroll you when you're ready."
      />
    </Screen>
  );
  if (seasonId === null || data === null) return noSeason;
  if (isPending || isError) {
    return (
      <Screen title="Current season">
        {isPending ? <RouteSkeleton /> : <RouteError onRetry={() => void refetch()} />}
      </Screen>
    );
  }

  const { completedSessions, totalSessions, pct } = data.progress;
  const chip = statusChip("season", data.status);
  return (
    <Screen
      title={data.title}
      subtitle={totalSessions > 0 ? `Session ${completedSessions} of ${totalSessions}` : undefined}
      onRefresh={refresh}
      refreshing={isRefetching}
    >
      <View className="flex-col gap-5">
        <View className="flex-col gap-2">
          {totalSessions > 0 ? (
            <>
              <Progress value={pct} label="Season progress" showValue />
              <Text variant="caption" className="text-muted-foreground">
                {pct >= 100 ? "Complete" : `${totalSessions - completedSessions} to go`}
              </Text>
            </>
          ) : null}
          <View className="flex-row flex-wrap items-center gap-2">
            <StatusChip {...chip} />
            <Text variant="caption" className="text-muted-foreground">
              {`${formatDate(data.startDate)} – ${formatDate(data.endDate)}`}
            </Text>
          </View>
        </View>
        {data.group ? <GroupSection group={data.group} /> : null}
        {data.description ? (
          <GroupedList header="About this season">
            <View className="px-4 py-3">
              <Text variant="body">{data.description}</Text>
            </View>
          </GroupedList>
        ) : null}
        <UpcomingSection upcoming={data.upcoming} />
      </View>
    </Screen>
  );
}
