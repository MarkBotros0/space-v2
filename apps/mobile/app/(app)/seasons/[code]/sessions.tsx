import { isSeasonFinished } from "@space/shared";
import type { ReactNode } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { Screen } from "../../../../src/design/layout/screen";
import { phoneDayKey } from "../../../../src/design/seasons/season-timeline";
import { CalendarList } from "../../../../src/design/sessions/calendar-list";
import { EmptyState } from "../../../../src/design/ui";
import { useStaffOrgToday } from "../../../../src/hooks/use-dashboard";
import { useSeasonByCode } from "../../../../src/hooks/use-seasons";
import { useSeasonSessions } from "../../../../src/hooks/use-sessions";
import { useIsSuper } from "../../../../src/store/session";

/**
 * A season's sessions (owner, 2026-11-07: a Sessions card on the overview opens
 * them, in place of the list under it and the New session tile). Whoever
 * administers the season adds one here and marks attendance from a row.
 */
export default function SeasonSessionsScreen() {
  const router = useRouter();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = typeof raw === "string" && raw.length > 0 ? raw : null;
  const isSuper = useIsSuper();
  const detail = useSeasonByCode(code);
  const sessions = useSeasonSessions(detail.data?.id ?? null);
  // A finished season's sessions are read, never changed (owner, 2026-11-07).
  const finished = isSeasonFinished(detail.data?.status);
  const manage = detail.data !== undefined && (detail.data.canAdminister || isSuper) && !finished;
  // The org's day for the status badges; only those who read the season's dashboard ask.
  const orgToday = useStaffOrgToday(
    detail.data && (detail.data.canAdminister || isSuper) ? detail.data.id : null,
  ).today;

  let body: ReactNode;
  if (code === null) body = <EmptyState title="Not found" description="That season link isn't valid." />;
  else if (detail.isError) body = <RouteError onRetry={() => void detail.refetch()} />;
  else if (detail.isPending || sessions.isPending) body = <RouteSkeleton />;
  else if (sessions.isError) body = <RouteError onRetry={() => void sessions.refetch()} />;
  else {
    const s = detail.data;
    body = (
      <CalendarList
        sessions={sessions.data}
        today={orgToday ?? phoneDayKey()}
        onOpen={(id) => router.push({ pathname: "/session/[id]", params: { id: String(id) } })}
        onMarkAttendance={
          manage ? (id) => router.push({ pathname: "/session/[id]/attendance", params: { id: String(id) } }) : undefined
        }
        onCreate={
          s.canAdminister && !finished
            ? () => router.push({ pathname: "/session/new", params: { seasonId: String(s.id) } })
            : undefined
        }
      />
    );
  }

  return (
    <Screen
      title="Sessions"
      subtitle={detail.data?.title}
      refreshing={sessions.isRefetching}
      onRefresh={() => {
        if (detail.data) void sessions.refetch();
      }}
    >
      {body}
    </Screen>
  );
}
