import { useState, type ReactNode } from "react";
import { useRouter } from "expo-router";

import { AssignmentForm, NEW_ASSIGNMENT_VALUES } from "../../../src/components/assignment-form";
import { useCreateAssignment } from "../../../src/hooks/use-assignment-writes";
import { useSeasonGroups } from "../../../src/hooks/use-groups";
import { useCurrentSeasonId } from "../../../src/hooks/use-seasons";
import { useSeasonSessions } from "../../../src/hooks/use-sessions";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { useSessionStore } from "../../../src/store/session";
import { EmptyState, ErrorState, LoadingState, Screen } from "../../../src/ui";

/**
 * v1 /admin/season/[code]/assignments/new, for useCurrentSeasonId's season
 * (X8). Offered to ADMIN and SUPER — the roles that can pass the server's
 * season-admin gate; the server still decides.
 */
function NewAssignment() {
  const router = useRouter();
  const current = useCurrentSeasonId();
  const groups = useSeasonGroups(current.seasonId);
  const sessions = useSeasonSessions(current.seasonId);
  const create = useCreateAssignment();
  const [serverError, setServerError] = useState<string | null>(null);

  const seasonId = current.seasonId;
  let body: ReactNode;
  if (current.isPending) {
    body = <LoadingState />;
  } else if (current.isError) {
    body = <ErrorState message="Couldn't load your seasons." onRetry={current.refetch} />;
  } else if (seasonId === null) {
    body = <EmptyState title="No season" message="There's no season to add an assignment to." />;
  } else if (groups.isPending || sessions.isPending) {
    body = <LoadingState />;
  } else if (groups.isError || sessions.isError) {
    body = (
      <ErrorState
        message="Couldn't load this season's groups and sessions."
        onRetry={() => {
          void groups.refetch();
          void sessions.refetch();
        }}
      />
    );
  } else {
    body = (
      <AssignmentForm
        initial={NEW_ASSIGNMENT_VALUES}
        groups={groups.data}
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
                router.replace({ pathname: "/assignment/[id]", params: { id: String(created.id) } }),
              onError: (err) => setServerError(apiErrorMessage(err, "Couldn't create the assignment.")),
            },
          );
        }}
      />
    );
  }

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {body}
    </Screen>
  );
}

export default function NewAssignmentScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  // Checked before any hook runs in NewAssignment, so other roles cost no request.
  if (role !== "ADMIN" && role !== "SUPER") {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Not available" message="Only season admins can create assignments." />
      </Screen>
    );
  }
  return <NewAssignment />;
}
