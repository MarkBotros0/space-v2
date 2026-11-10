import { useState, type ReactNode } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { AssignmentDetail, AssignmentWriteBody } from "@space/shared";

import { AssignmentForm, valuesFromDetail } from "../../../../src/screens/assignment-form/assignment-form";
import { useAssignmentDetail } from "../../../../src/hooks/use-assignments";
import { useUpdateAssignment } from "../../../../src/hooks/use-assignment-writes";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import { plural } from "../../../../src/lib/plural";
import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { Screen } from "../../../../src/design/layout/screen";
import { EmptyState } from "../../../../src/design/ui";
import { toast } from "../../../../src/design/ui/toaster";

/** The toast after a save that sent submitted work back to To do. */
function reopenedMessage(n: number): string {
  return `Saved. ${plural(n, "student")} ${n === 1 ? "has" : "have"} to submit again.`;
}

function EditForm({ detail }: { detail: AssignmentDetail }) {
  const router = useRouter();
  const update = useUpdateAssignment(detail.id);
  const [serverError, setServerError] = useState<string | null>(null);
  // A save the server wants confirmed: the body to re-send, and how many students it touches.
  const [pending, setPending] = useState<{ body: AssignmentWriteBody; students: number } | null>(null);

  const save = (body: AssignmentWriteBody, confirm: boolean) => {
    setServerError(null);
    update.mutate(confirm ? { ...body, confirm: true } : body, {
      onSuccess: (result) => {
        if (result.kind === "confirm") {
          setPending({ body, students: result.students });
          return;
        }
        setPending(null);
        if (result.reopened > 0) toast.success(reopenedMessage(result.reopened));
        // Back to the detail screen this was opened from, not a second copy of
        // it on the stack; useUpdateAssignment has seeded its cache already.
        router.back();
      },
      onError: (err) => {
        setPending(null);
        setServerError(apiErrorMessage(err, "Couldn't save the assignment."));
      },
    });
  };

  const initial = valuesFromDetail(detail);
  return (
    <AssignmentForm
      title="Edit assignment"
      subtitle={detail.title}
      initial={initial}
      assignmentId={detail.id}
      savedReminder={{
        reminder: initial.reminder,
        dueDay: initial.dueDay,
        dueTime: initial.dueTime,
        line: detail.reminderLine,
      }}
      submitLabel="Save changes"
      submitting={update.isPending}
      serverError={serverError}
      onSubmit={(body) => save(body, false)}
      confirm={
        pending === null
          ? null
          : { students: pending.students, onConfirm: () => save(pending.body, true), onCancel: () => setPending(null) }
      }
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
