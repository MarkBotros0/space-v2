import { useRouter } from "expo-router";
import { useState } from "react";

import { StudentForm } from "../../../src/components/StudentForm";
import { useSeasons } from "../../../src/hooks/use-seasons";
import { useCreateStudent } from "../../../src/hooks/use-students";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { emptyStudentForm, toCreateStudentBody } from "../../../src/lib/student-form";
import { useSessionStore } from "../../../src/store/session";
import { useTheme } from "../../../src/theme";
import { EmptyState, ErrorState, Screen, Text } from "../../../src/ui";

/**
 * /students/new (spec 06 §9). SUPER-only, like POST /students (Plan 7). The
 * account is created with no password and the server mails an invite in the
 * same operation (Plan 10 Decision 1) — v1's "temp password is ChangeMe123!"
 * notice (spec 11 R43) has nothing to say here and is not ported.
 */
export default function NewStudentScreen() {
  const theme = useTheme();
  const router = useRouter();
  const isSuper = useSessionStore((s) => s.user?.role === "SUPER");
  const seasons = useSeasons(isSuper);
  const createStudent = useCreateStudent();
  const [serverError, setServerError] = useState<string | null>(null);

  if (!isSuper) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="New student" message="Only SUPER accounts can create students." />
      </Screen>
    );
  }

  // Enrollment targets: seasons that are running or about to (a new
  // enrollment in a finished season would be history written backwards).
  const seasonOptions = (seasons.data ?? [])
    .filter((s) => s.status === "ACTIVE" || s.status === "DRAFT")
    .map((s) => ({ id: s.id, title: s.title }));

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      <Text variant="title">New student</Text>
      <Text variant="body" color={theme.colors.neutral[600]}>
        They'll get an email invite to choose their own password. No temporary password is created.
      </Text>
      {seasons.isError ? (
        <ErrorState message="Couldn't load seasons." onRetry={() => void seasons.refetch()} />
      ) : null}
      <StudentForm
        initial={emptyStudentForm()}
        seasonOptions={seasonOptions}
        seasonLabel="Enroll in season (optional)"
        showSeason
        showNotes
        submitTitle="Create and send invite"
        submitting={createStudent.isPending}
        serverError={serverError}
        onSubmit={(values) => {
          setServerError(null);
          createStudent.mutate(toCreateStudentBody(values), {
            onSuccess: (created) =>
              router.replace({ pathname: "/student/[id]", params: { id: String(created.id) } }),
            onError: (err) => setServerError(apiErrorMessage(err, "Couldn't create the student.")),
          });
        }}
      />
    </Screen>
  );
}
