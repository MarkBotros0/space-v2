import { useState, type ReactNode } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { AssignmentDetail } from "@space/shared";

import { AssignmentForm, valuesFromDetail } from "../../../../src/components/assignment-form";
import { useAssignmentDetail } from "../../../../src/hooks/use-assignments";
import { useUpdateAssignment } from "../../../../src/hooks/use-assignment-writes";
import { useSeasonSessions } from "../../../../src/hooks/use-sessions";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { Screen } from "../../../../src/design/layout/screen";
import { EmptyState } from "../../../../src/design/ui";

function EditForm({ detail }: { detail: AssignmentDetail }) {
  const router = useRouter();
  const sessions = useSeasonSessions(detail.seasonId);
  const update = useUpdateAssignment(detail.id);
  const [serverError, setServerError] = useState<string | null>(null);

  if (sessions.isPending) {
    return (
      <Screen title="Edit assignment" subtitle={detail.title}>
        <RouteSkeleton />
      </Screen>
    );
  }
  if (sessions.isError) {
    return (
      <Screen title="Edit assignment" subtitle={detail.title}>
        <RouteError onRetry={() => void sessions.refetch()} />
      </Screen>
    );
  }

  return (
    <AssignmentForm
      title="Edit assignment"
      subtitle={detail.title}
      initial={valuesFromDetail(detail)}
      sessions={sessions.data}
      submitLabel="Save changes"
      submitting={update.isPending}
      serverError={serverError}
      onSubmit={(payload) => {
        setServerError(null);
        update.mutate(payload, {
          // Back to the detail screen this was opened from, not a second
          // copy of it on the stack. useUpdateAssignment has already seeded
          // that screen's cache with the saved assignment, so it shows the
          // new values. A cold deep link still has Today underneath (R11),
          // so there is always somewhere to go back to.
          onSuccess: () => router.back(),
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

  if (id !== null && detail.data?.canManage) return <EditForm detail={detail.data} />;

  let body: ReactNode;
  if (id === null) {
    body = <EmptyState title="Not found" description="That assignment link isn't valid." />;
  } else if (detail.isPending) {
    body = <RouteSkeleton />;
  } else if (detail.isError) {
    body = <RouteError onRetry={() => void detail.refetch()} />;
  } else {
    // The server's flag (C4), mirroring the PATCH gate; the gate itself is the server's.
    body = <EmptyState title="Not available" description="You can't edit this assignment." />;
  }

  return (
    <Screen title="Edit assignment" subtitle={detail.data?.title}>
      {body}
    </Screen>
  );
}
