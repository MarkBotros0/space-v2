import { useRouter } from "expo-router";
import { useState } from "react";

import { StudentForm } from "../../../src/components/StudentForm";
import { useSeasons } from "../../../src/hooks/use-seasons";
import { useCreateStudent } from "../../../src/hooks/use-students";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { emptyStudentForm, toCreateStudentBody } from "../../../src/lib/student-form";
import { useSessionStore } from "../../../src/store/session";
import { RouteError } from "../../../src/design/layout/route-states";
import { Screen } from "../../../src/design/layout/screen";
import { EmptyState, toast } from "../../../src/design/ui";

/**
 * /students/new (spec 06 §9). SUPER-only, like POST /students (Plan 7). The
 * account is created with no password and the server mails an invite in the
 * same operation (Plan 10 Decision 1) — v1's "temp password is ChangeMe123!"
 * notice (spec 11 R43) has nothing to say here and is not ported.
 */
export default function NewStudentScreen() {
  const router = useRouter();
  const isSuper = useSessionStore((s) => s.user?.role === "SUPER");
  const seasons = useSeasons(isSuper);
  const createStudent = useCreateStudent();
  const [serverError, setServerError] = useState<string | null>(null);

  if (!isSuper) {
    return (
      <Screen title="New student">
        <EmptyState title="New student" description="Only SUPER accounts can create students." />
      </Screen>
    );
  }

  // Enrollment targets: seasons that are running or about to (a new
  // enrollment in a finished season would be history written backwards).
  const seasonOptions = (seasons.data ?? [])
    .filter((s) => s.status === "ACTIVE" || s.status === "DRAFT")
    .map((s) => ({ id: s.id, title: s.title }));

  return (
    <StudentForm
      title="New student"
      subtitle="They'll get an email invite to choose their own password. No temporary password is created."
      notice={seasons.isError ? <RouteError onRetry={() => void seasons.refetch()} /> : null}
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
          onSuccess: (created) => {
            // The student exists either way; an undelivered invite is
            // withdrawn server-side, so Users offers "Send invite" again.
            if (created.inviteSent) {
              toast.success("Student created. Their invite is on its way.");
            } else {
              toast.error(
                "Student created, but the invite email couldn't be sent. Use Send invite on their account in Users once email works.",
              );
            }
            router.replace({ pathname: "/student/[id]", params: { id: String(created.id) } });
          },
          onError: (err) => setServerError(apiErrorMessage(err, "Couldn't create the student.")),
        });
      }}
    />
  );
}
