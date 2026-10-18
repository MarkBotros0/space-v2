import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";

import { AssignmentForm, NEW_ASSIGNMENT_VALUES } from "../../../src/components/assignment-form";
import { useCreateAssignment } from "../../../src/hooks/use-assignment-writes";
import { useSeasonGroups } from "../../../src/hooks/use-groups";
import { PageTitle } from "../../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../../src/design/layout/route-states";
import { ShellFrame } from "../../../src/design/layout/shell-frame";
import { Card, CardContent, EmptyState } from "../../../src/design/ui";
import { useCurrentSeasonId, useSeasonDetail } from "../../../src/hooks/use-seasons";
import { useSeasonSessions } from "../../../src/hooks/use-sessions";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { useSessionStore } from "../../../src/store/session";

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
  const season = useSeasonDetail(current.seasonId);
  const create = useCreateAssignment();
  const [serverError, setServerError] = useState<string | null>(null);

  const seasonId = current.seasonId;
  let body: ReactNode;
  if (current.isPending) {
    body = <RouteSkeleton />;
  } else if (current.isError) {
    body = <RouteError onRetry={current.refetch} />;
  } else if (seasonId === null) {
    body = (
      <EmptyState title="No season" description="There's no season to add an assignment to." />
    );
  } else if (groups.isPending || sessions.isPending) {
    body = <RouteSkeleton />;
  } else if (groups.isError || sessions.isError) {
    body = (
      <RouteError
        onRetry={() => {
          void groups.refetch();
          void sessions.refetch();
        }}
      />
    );
  } else {
    body = (
      <Card>
        <CardContent className="pt-6">
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
                    router.replace({
                      pathname: "/assignment/[id]",
                      params: { id: String(created.id) },
                    }),
                  onError: (err) =>
                    setServerError(apiErrorMessage(err, "Couldn't create the assignment.")),
                },
              );
            }}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <ShellFrame>
      <View className="flex-col gap-4">
        <PageTitle
          title="New assignment"
          subtitle={season.data ? `Add to ${season.data.title}.` : "Add to this season."}
        />
        {body}
      </View>
    </ShellFrame>
  );
}

export default function NewAssignmentScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  // Checked before any hook runs in NewAssignment, so other roles cost no request.
  if (role !== "ADMIN" && role !== "SUPER") {
    return (
      <ShellFrame>
        <EmptyState
          title="Not available"
          description="Only season admins can create assignments."
        />
      </ShellFrame>
    );
  }
  return <NewAssignment />;
}
