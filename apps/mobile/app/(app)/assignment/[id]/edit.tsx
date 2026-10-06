import { useState, type ReactNode } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { AssignmentDetail } from "@space/shared";

import { AssignmentForm, valuesFromDetail } from "../../../../src/components/assignment-form";
import { useAssignmentDetail, useAssignmentTracker } from "../../../../src/hooks/use-assignments";
import { useUpdateAssignment } from "../../../../src/hooks/use-assignment-writes";
import { useSeasonGroups } from "../../../../src/hooks/use-groups";
import { useSeasonSessions } from "../../../../src/hooks/use-sessions";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import { EmptyState, ErrorState, LoadingState, Screen } from "../../../../src/ui";

function EditForm({ detail }: { detail: AssignmentDetail }) {
  const router = useRouter();
  const groups = useSeasonGroups(detail.seasonId);
  const sessions = useSeasonSessions(detail.seasonId);
  // Only feeds the narrowing warning — a failure must not block editing.
  const tracker = useAssignmentTracker(detail.id);
  const update = useUpdateAssignment(detail.id);
  const [serverError, setServerError] = useState<string | null>(null);

  if (groups.isPending || sessions.isPending) return <LoadingState />;
  if (groups.isError || sessions.isError) {
    return (
      <ErrorState
        message="Couldn't load this season's groups and sessions."
        onRetry={() => {
          void groups.refetch();
          void sessions.refetch();
        }}
      />
    );
  }

  return (
    <AssignmentForm
      initial={valuesFromDetail(detail)}
      groups={groups.data}
      sessions={sessions.data}
      trackerRows={tracker.data?.rows}
      submitLabel="Save changes"
      submitting={update.isPending}
      serverError={serverError}
      onSubmit={(payload) => {
        setServerError(null);
        update.mutate(payload, {
          onSuccess: () => router.replace({ pathname: "/assignment/[id]", params: { id: String(detail.id) } }),
          onError: (err) => setServerError(apiErrorMessage(err, "Couldn't save the assignment.")),
        });
      }}
    />
  );
}

/** v1 /admin/season/[code]/assignments/[id]/edit — the same form, pre-filled; a full replace. */
export default function EditAssignmentScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const parsed = Number(rawId);
  const id = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  const detail = useAssignmentDetail(id);

  let body: ReactNode;
  if (id === null) {
    body = <EmptyState title="Not found" message="That assignment link isn't valid." />;
  } else if (detail.isPending) {
    body = <LoadingState />;
  } else if (detail.isError) {
    body = <ErrorState message="Couldn't load this assignment." onRetry={() => void detail.refetch()} />;
  } else if (!detail.data.canManage) {
    // The server's flag (C4), mirroring the PATCH gate; the gate itself is the server's.
    body = <EmptyState title="Not available" message="You can't edit this assignment." />;
  } else {
    body = <EditForm detail={detail.data} />;
  }

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {body}
    </Screen>
  );
}
