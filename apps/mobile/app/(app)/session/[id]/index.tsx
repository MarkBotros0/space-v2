import { useLocalSearchParams } from "expo-router";

import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { Screen } from "../../../../src/design/layout/screen";
import { EmptyState } from "../../../../src/design/ui";
import { useSessionDetail } from "../../../../src/hooks/use-session-detail";
import { isNotFoundError } from "../../../../src/lib/api-error";
import { parsePositiveInt } from "../../../../src/lib/params";
import { AdminSessionBody, LeaderSessionBody } from "../../../../src/screens/session-detail/staff-session-bodies";
import { StudentSessionBody } from "../../../../src/screens/session-detail/student-session-body";
import { useSessionStore, useRole } from "../../../../src/store/session";

export { LIVE_ROSTER_REFRESH_MS } from "../../../../src/screens/session-detail/check-in-cards";

function SessionDetailBody({ id }: { id: number }) {
  const role = useRole();
  const seasonAdminIds = useSessionStore((s) => s.scopes?.seasonAdminIds);
  const { data, isPending, isError, error, refetch, isRefetching } = useSessionDetail(id);

  if (isPending) {
    return (
      <Screen>
        <RouteSkeleton />
      </Screen>
    );
  }
  // A 404 is an answer, not a failure: a student whose enrolment is no
  // longer ACTIVE still sees the season's sessions on the calendar, but the
  // API refuses them the detail (REG-77). A retry could never succeed.
  if (isError && isNotFoundError(error)) {
    return (
      <Screen>
        <EmptyState title="Not available" description="This session isn't available to you." />
      </Screen>
    );
  }
  // A failed background read keeps the session on screen: this query polls.
  if (data === undefined) {
    return (
      <Screen>
        <RouteError onRetry={() => void refetch()} />
      </Screen>
    );
  }

  const body = { data, refetch: () => void refetch(), isRefetching };
  if (role === "STUDENT") return <StudentSessionBody data={data} refetch={refetch} />;
  if (role === "LEADER") return <LeaderSessionBody {...body} />;

  // v1 showed the console only to an admin OF the season; the API also lets any
  // SUPER through (isAdminOfSeason), so the app narrows it (REG-79).
  const showConsole = data.canManageCheckIn && (role !== "SUPER" || (seasonAdminIds ?? []).includes(data.seasonId));

  return <AdminSessionBody {...body} showConsole={showConsole} />;
}

export default function SessionDetailScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = parsePositiveInt(raw);
  if (id === null) {
    return (
      <Screen>
        <EmptyState title="Not found" description="That session doesn't exist." />
      </Screen>
    );
  }
  return <SessionDetailBody id={id} />;
}
