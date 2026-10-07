import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";

import { StudentForm } from "../../../../src/components/StudentForm";
import { useStudentDetail, useUpdateStudent } from "../../../../src/hooks/use-students";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import { studentActionsFor } from "../../../../src/lib/student-actions";
import { studentFormFromDetail, toUpdateStudentBody } from "../../../../src/lib/student-form";
import { useSessionStore } from "../../../../src/store/session";
import { EmptyState, ErrorState, LoadingState, Screen, Text } from "../../../../src/ui";

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
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Edit student" message="Only SUPER and ADMIN accounts can edit students." />
      </Screen>
    );
  }
  if (id === null) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Not found" message="That student link isn't valid." />
      </Screen>
    );
  }
  if (isPending) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <LoadingState />
      </Screen>
    );
  }
  if (isError) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <ErrorState message="Couldn't load this student." onRetry={() => void refetch()} />
      </Screen>
    );
  }

  const actions = studentActionsFor(user, scopes, data);
  if (!actions.canEdit) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState
          title="Edit student"
          message="You can edit a student only while they have an active enrollment in a season you run."
        />
      </Screen>
    );
  }

  const initial = studentFormFromDetail(data);
  // The pointer may only name a season the student is ACTIVE in (Plan 7 S16).
  const seasonOptions = data.enrollments
    .filter((e) => e.status === "ACTIVE")
    .map((e) => ({ id: e.seasonId, title: e.seasonTitle }));

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      <Text variant="title">{`Edit ${data.name}`}</Text>
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
        onSubmit={(values) => {
          setServerError(null);
          update.mutate(
            {
              id: data.id,
              body: toUpdateStudentBody(values, initial, { includeSeasonPointer: actions.canEditSeasonPointer }),
            },
            {
              onSuccess: () => router.back(),
              onError: (err) => setServerError(apiErrorMessage(err, "Couldn't save changes.")),
            },
          );
        }}
      />
    </Screen>
  );
}
