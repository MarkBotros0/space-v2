import { useRouter } from "expo-router";
import { View } from "react-native";
import type { SessionListItem } from "@space/shared";

import { NAV_ICONS } from "../../design/icons/nav-icon";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { EmptyState, GroupedList, ListRow } from "../../design/ui";
import { useStaffToday } from "../../hooks/use-staff-today";
import { useLedSeasonSessions } from "../../hooks/use-sessions";
import { formatWallTime, formatWeekdayDay } from "../../lib/format";
import { joinMeta } from "../../lib/join-meta";
import { unmarkedSessions } from "../../lib/staff-today";

const TITLE = "Sessions with no attendance";

function bySeason(sessions: SessionListItem[]): { seasonId: number; title: string; rows: SessionListItem[] }[] {
  const groups = new Map<number, { seasonId: number; title: string; rows: SessionListItem[] }>();
  for (const s of sessions) {
    const g = groups.get(s.seasonId) ?? { seasonId: s.seasonId, title: s.seasonTitle, rows: [] };
    g.rows.push(s);
    groups.set(s.seasonId, g);
  }
  return [...groups.values()];
}

/**
 * The list behind Today's "N sessions with no attendance": the same
 * `unmarkedSessions` over the same reads. A valid `seasonId` narrows to that
 * season (what ADMIN's Today passed); without one it is what `useStaffToday`
 * returned for the role (SUPER: every active season).
 */
export function SessionsWithoutAttendance({ role, seasonId }: { role: "ADMIN" | "SUPER"; seasonId: number | undefined }) {
  const router = useRouter();
  const today = useStaffToday(role);
  const led = useLedSeasonSessions(seasonId === undefined ? [] : [seasonId]);

  const scoped = seasonId !== undefined;
  const isPending = scoped ? led.isPending : today.isPending;
  const isError = scoped ? led.isError : !today.isPending && today.needs.unmarkedSessions === null;
  const unmarked = unmarkedSessions(scoped ? led.sessions : today.sessions, new Date());
  const groups = bySeason(unmarked);
  const refetch = scoped ? led.refetch : today.refetch;

  let body;
  if (isPending) body = <RouteSkeleton />;
  else if (isError) body = <RouteError onRetry={refetch} />;
  else if (unmarked.length === 0)
    body = (
      <EmptyState
        icon={NAV_ICONS.calendar}
        title="Nothing to mark"
        description="Every finished session has its attendance recorded."
      />
    );
  else
    body = (
      <View className="flex-col gap-4">
        {groups.map((g) => (
          <GroupedList key={g.seasonId} header={groups.length > 1 ? g.title : undefined}>
            {g.rows.map((s, i) => (
              <ListRow
                key={s.id}
                index={i}
                title={s.title}
                subtitle={joinMeta([formatWeekdayDay(s.dayKey), formatWallTime(s.startTime)])}
                chevron
                onPress={() => router.push({ pathname: "/session/[id]/attendance", params: { id: String(s.id) } })}
              />
            ))}
          </GroupedList>
        ))}
      </View>
    );

  return (
    <Screen title={TITLE} refreshing={scoped ? led.isRefetching : today.isRefetching} onRefresh={refetch}>
      {body}
    </Screen>
  );
}
