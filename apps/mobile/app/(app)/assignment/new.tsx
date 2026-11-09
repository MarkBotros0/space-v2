import { useState, type ReactNode } from "react";
import { useRouter } from "expo-router";

import { AssignmentForm, NEW_ASSIGNMENT_VALUES } from "../../../src/components/assignment-form";
import { useCreateAssignment } from "../../../src/hooks/use-assignment-writes";
import { RouteError, RouteSkeleton } from "../../../src/design/layout/route-states";
import { Screen } from "../../../src/design/layout/screen";
import { EmptyState } from "../../../src/design/ui";
import { useCurrentSeasonId, useSeasonDetail } from "../../../src/hooks/use-seasons";
import { useSeasonSessions } from "../../../src/hooks/use-sessions";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { useRole } from "../../../src/store/session";

/**
 * v1 /admin/season/[code]/assignments/new, for useCurrentSeasonId's season
 * (X8). Offered to ADMIN and SUPER — the roles that can pass the server's
 * season-admin gate; the server still decides.
 */
function NewAssignment() {
  const router = useRouter();
  const current = useCurrentSeasonId();
  const sessions = useSeasonSessions(current.seasonId);
  const season = useSeasonDetail(current.seasonId);
  const create = useCreateAssignment();
  const [serverError, setServerError] = useState<string | null>(null);

  const seasonId = current.seasonId;
  const subtitle = season.data ? `Add to ${season.data.title}.` : "Add to this season.";
  let body: ReactNode;
  if (current.isPending) {
    body = <RouteSkeleton />;
  } else if (current.isError) {
    body = <RouteError onRetry={current.refetch} />;
  } else if (seasonId === null) {
    body = <EmptyState title="No season" description="There's no season to add an assignment to." />;
  } else if (sessions.isPending) {
    body = <RouteSkeleton />;
  } else if (sessions.isError) {
    body = <RouteError onRetry={() => void sessions.refetch()} />;
  } else {
    return (
      <AssignmentForm
        title="New assignment"
        subtitle={subtitle}
        initial={NEW_ASSIGNMENT_VALUES}
        sessions={sessions.data}
        submitLabel="Create assignment"
        submitting={create.isPending}
        serverError={serverError}
        onSubmit={(payload) => {
          setServerError(null);
          create.mutate(
            { seasonId, body: payload },
            {
              onSuccess: (created) =>
                router.replace({
                  pathname: "/assignment/[id]",
                  params: { id: String(created.id) },
                }),
              onError: (err) => setServerError(apiErrorMessage(err, "Couldn't create the assignment.")),
            },
          );
        }}
      />
    );
  }

  return (
    <Screen title="New assignment" subtitle={subtitle}>
      {body}
    </Screen>
  );
}

export default function NewAssignmentScreen() {
  const role = useRole();
  // Checked before any hook runs in NewAssignment, so other roles cost no request.
  if (role !== "ADMIN" && role !== "SUPER") {
    return (
      <Screen title="New assignment">
        <EmptyState title="Not available" description="Only season admins can create assignments." />
      </Screen>
    );
  }
  return <NewAssignment />;
}
