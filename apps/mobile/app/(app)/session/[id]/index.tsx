import { useLocalSearchParams } from "expo-router";

import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { ShellFrame } from "../../../../src/design/layout/shell-frame";
import { EmptyState } from "../../../../src/design/ui";
import { useSessionDetail } from "../../../../src/hooks/use-session-detail";
import { parsePositiveInt } from "../../../../src/lib/params";
import {
  AdminSessionBody,
  LeaderSessionBody,
} from "../../../../src/screens/session-detail/staff-session-bodies";
import { StudentSessionBody } from "../../../../src/screens/session-detail/student-session-body";
import { useSessionStore } from "../../../../src/store/session";

export { LIVE_ROSTER_REFRESH_MS } from "../../../../src/screens/session-detail/check-in-cards";

function SessionDetailBody({ id }: { id: number }) {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const seasonAdminIds = useSessionStore((s) => s.scopes?.seasonAdminIds);
  const { data, isPending, isError, refetch, isRefetching } = useSessionDetail(id);

  if (isPending) {
    return (
      <ShellFrame>
        <RouteSkeleton />
      </ShellFrame>
    );
  }
  if (isError) {
    return (
      <ShellFrame>
        <RouteError onRetry={() => void refetch()} />
      </ShellFrame>
    );
  }

  const body = { data, refetch: () => void refetch(), isRefetching };
  if (role === "STUDENT") return <StudentSessionBody {...body} />;
  if (role === "LEADER") return <LeaderSessionBody {...body} />;

  // v1 showed the console only to an admin OF the season; the API also lets any
  // SUPER through (isAdminOfSeason), so the app narrows it (REG-79).
  const showConsole =
    data.canManageCheckIn && (role !== "SUPER" || (seasonAdminIds ?? []).includes(data.seasonId));

  return <AdminSessionBody {...body} showConsole={showConsole} />;
}

export default function SessionDetailScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = parsePositiveInt(raw);
  if (id === null) {
    return (
      <ShellFrame>
        <EmptyState title="Not found" description="That session doesn't exist." />
      </ShellFrame>
    );
  }
  return <SessionDetailBody id={id} />;
}
