/**
 * Alumni History on grouped rows, and the `SeasonGroup` that
 * design/students/season-history.tsx reuses: v1 always says "sessions"; each row
 * says how the season ended, in words (the outcome, not v1's blanket
 * "Participated"), and shows attendance % and curriculum. The rest of a season
 * is one row away, on the finished season page (the history contract is strict,
 * so nothing else reaches this list).
 */
import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { Pressable } from "../../design/ui/pressable";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { ChevronRight } from "lucide-react-native";
import type { UseQueryResult } from "@tanstack/react-query";
import type { SeasonHistoryRow } from "@space/shared";

import { NAV_ICONS } from "../../design/icons/nav-icon";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { iconWithClassName } from "../../design/lib/icon";
import { DURATION, useReducedMotion } from "../../design/motion";
import { EmptyState, GroupedList, ListRow, StatusChip, Text } from "../../design/ui";
import { formatDayKey, formatSeasonDay } from "../../lib/format";
import { outcomeChip } from "../past-season/season-overview";

iconWithClassName(ChevronRight);

function RotatingChevron({ open }: { open: boolean }) {
  const reduced = useReducedMotion();
  const turn = useSharedValue(open ? 90 : 0);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  useEffect(() => {
    const target = open ? 90 : 0;
    turn.value = reduced ? target : withTiming(target, { duration: DURATION.fast });
  }, [open, reduced, turn]);
  return (
    <Animated.View style={style}>
      <ChevronRight size={16} className="text-muted-foreground" />
    </Animated.View>
  );
}

function CurriculumToggle({ count, open, onPress }: { count: number; open: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      className="min-h-[44px] flex-row items-center justify-between gap-3 px-4 py-2"
    >
      {/* v1 always says "sessions", even for one. */}
      <Text variant="subhead" className="min-w-0 flex-1 font-semibold">
        {`Curriculum (${count} sessions)`}
      </Text>
      <RotatingChevron open={open} />
    </Pressable>
  );
}

export function SeasonGroup({ row }: { row: SeasonHistoryRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const count = row.curriculum.length;
  const rows = [
    <View key="head" className="flex-col gap-2 px-4 py-3">
      <View>
        <Text variant="headline">{row.title}</Text>
        <Text variant="caption" className="text-muted-foreground">
          {`${formatSeasonDay(row.startDate)} – ${formatSeasonDay(row.endDate)}${row.groupName ? ` · ${row.groupName}` : ""}`}
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-1.5">
        <StatusChip tone="neutral" label={`${row.attendancePct}% attended`} />
        <StatusChip {...outcomeChip(row.outcome)} />
      </View>
    </View>,
    <ListRow
      key="season"
      title="View your season"
      chevron
      onPress={() => router.push({ pathname: "/past-season/[seasonId]", params: { seasonId: String(row.seasonId) } })}
    />,
  ];
  if (count > 0) {
    rows.push(<CurriculumToggle key="toggle" count={count} open={open} onPress={() => setOpen((o) => !o)} />);
    if (open) {
      for (const s of row.curriculum) {
        rows.push(
          <View key={s.sessionId} className="flex-row items-start justify-between gap-3 px-4 py-2">
            <Text variant="subhead" className="min-w-0 flex-1 text-muted-foreground">
              {s.title}
            </Text>
            <Text variant="caption" className="shrink-0 text-muted-foreground">
              {formatDayKey(s.dayKey)}
            </Text>
          </View>,
        );
      }
    }
  }
  return <GroupedList>{rows}</GroupedList>;
}

export function AlumniHistory({ query }: { query: UseQueryResult<SeasonHistoryRow[]> }) {
  const { data, isPending, isError, refetch, isRefetching } = query;
  return (
    <Screen
      title="My History"
      subtitle="The seasons you journeyed through"
      onRefresh={() => void refetch()}
      refreshing={isRefetching}
    >
      {isPending ? (
        <RouteSkeleton />
      ) : isError ? (
        <RouteError onRetry={() => void refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={NAV_ICONS.season}
          title="No past seasons"
          description="Your completed seasons will appear here."
        />
      ) : (
        <View className="flex-col gap-3">
          {data.map((row) => (
            <SeasonGroup key={row.seasonId} row={row} />
          ))}
        </View>
      )}
    </Screen>
  );
}
