import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { StudentForm } from "../../../../src/components/StudentForm";
import { useStudentDetail, useUpdateStudent } from "../../../../src/hooks/use-students";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import { studentActionsFor } from "../../../../src/lib/student-actions";
import { studentFormFromDetail, toUpdateStudentBody } from "../../../../src/lib/student-form";
import { useSessionStore } from "../../../../src/store/session";
import { PageTitle } from "../../../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { ShellFrame } from "../../../../src/design/layout/shell-frame";
import { EmptyState } from "../../../../src/design/ui";

/**
 * /student/[id]/edit — spec 06 §9's edit page, for SUPER and for an ADMIN
 * whose season the student is ACTIVE in (Plan 7's canEditStudent). Fixes v1's
 * dead ADMIN Edit link (§4.3). The student's own edit is Plan 11's /profile.
 */
export default function EditStudentScreen() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const scopes = useSessionStore((s) => s.scopes);
  const role = user?.role ?? null;
  const staff = role === "SUPER" || role === "ADMIN";
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const parsed = Number(rawId);
  const id = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

  const { data, isPending, isError, refetch } = useStudentDetail(staff ? id : null, role);
  const update = useUpdateStudent();
  const [serverError, setServerError] = useState<string | null>(null);

  if (!staff) {
    return (
      <ShellFrame>
        <EmptyState
          title="Edit student"
          description="Only SUPER and ADMIN accounts can edit students."
        />
      </ShellFrame>
    );
  }
  if (id === null) {
    return (
      <ShellFrame>
        <EmptyState title="Not found" description="That student link isn't valid." />
      </ShellFrame>
    );
  }
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

  const actions = studentActionsFor(user, scopes, data);
  if (!actions.canEdit) {
    return (
      <ShellFrame>
        <EmptyState
          title="Edit student"
          description="You can edit a student only while they have an active enrollment in a season you run."
        />
      </ShellFrame>
    );
  }

  const initial = studentFormFromDetail(data);
  // The pointer may only name a season the student is ACTIVE in (Plan 7 S16).
  const seasonOptions = data.enrollments
    .filter((e) => e.status === "ACTIVE")
    .map((e) => ({ id: e.seasonId, title: e.seasonTitle }));

  return (
    <ShellFrame>
      <View className="flex-col gap-4">
        <PageTitle title={`Edit ${data.name}`} />
        <StudentForm
          key={data.id}
          initial={initial}
          seasonOptions={seasonOptions}
          seasonLabel="Active season"
          showSeason={actions.canEditSeasonPointer}
          showNotes
          submitTitle="Save changes"
          submitting={update.isPending}
          serverError={serverError}
          onCancel={() => router.back()}
          onSubmit={(values) => {
            setServerError(null);
            update.mutate(
              {
                id: data.id,
                body: toUpdateStudentBody(values, initial, {
                  includeSeasonPointer: actions.canEditSeasonPointer,
                }),
              },
              {
                onSuccess: () => router.back(),
                onError: (err) => setServerError(apiErrorMessage(err, "Couldn't save changes.")),
              },
            );
          }}
        />
      </View>
    </ShellFrame>
  );
}
