import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";
import type { EnrollmentHistoryItem } from "@space/shared";

import { DropEnrollmentSheet } from "../../../../src/components/DropEnrollmentSheet";
import { GraduateStudentSheet } from "../../../../src/components/GraduateStudentSheet";
import { PageTitle } from "../../../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { ShellFrame } from "../../../../src/design/layout/shell-frame";
import { StudentDetail as StudentDetailView } from "../../../../src/design/students/student-detail";
import { Button, EmptyState } from "../../../../src/design/ui";
import { useDeleteStudent, useStudentDetail } from "../../../../src/hooks/use-students";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import { queryKeys } from "../../../../src/lib/query-keys";
import { studentActionsFor } from "../../../../src/lib/student-actions";
import { useSessionStore } from "../../../../src/store/session";

/**
 * LEADER — v1 app/leader/students/[id] (B3-15). Pull-to-refresh invalidates
 * the student's queries; only mounted ones (the opened tabs) refetch.
 */
function LeaderStudentDetail({ id }: { id: number }) {
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch, isRefetching } = useStudentDetail(id, "LEADER");
  const refresh = () => {
    void refetch();
    for (const key of [
      queryKeys.engagement.student(id),
      queryKeys.students.attendance(id),
      queryKeys.students.submissions(id),
      queryKeys.notes.byStudent(id),
    ]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };
  return (
    <ShellFrame refreshing={isRefetching} onRefresh={refresh}>
      {isPending ? (
        <RouteSkeleton />
      ) : isError ? (
        <RouteError onRetry={() => void refetch()} />
      ) : (
        <View className="flex-col gap-4">
          <PageTitle title={data.name} subtitle={`${data.email} · leader view`} />
          {/* A leader who can open this page can write a note about the student (v1 canWriteNote). */}
          <StudentDetailView student={data} canWriteNote />
        </View>
      )}
    </ShellFrame>
  );
}

/**
 * SUPER, ADMIN, MENTOR (and a student on their own page) — v1 app/admin/students/[id]
 * (and /super, /mentor): the same StudentDetail as the leader's, with the admin
 * payload's extra profile fields, Edit profile / Graduate, and V2-ONLY Delete
 * and per-season Drop. The server decides what each role may do
 * (studentActionsFor mirrors it; spec 06 §4).
 */
function StaffStudentDetail({ id }: { id: number }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useSessionStore((s) => s.user);
  const scopes = useSessionStore((s) => s.scopes);
  const role = user?.role ?? null;
  const { data, isPending, isError, refetch, isRefetching } = useStudentDetail(id, role);
  const deleteStudent = useDeleteStudent();
  const [graduateOpen, setGraduateOpen] = useState(false);
  const [dropTarget, setDropTarget] = useState<EnrollmentHistoryItem | null>(null);

  const refresh = () => {
    void refetch();
    for (const key of [
      queryKeys.engagement.student(id),
      queryKeys.students.attendance(id),
      queryKeys.students.submissions(id),
      queryKeys.notes.byStudent(id),
    ]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const confirmDelete = (studentId: number, name: string) => {
    Alert.alert(
      `Delete ${name}?`,
      "They'll disappear from every list and be signed out everywhere. Their enrollment history, attendance and submissions are kept, and a SUPER can reactivate the account from Users.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            deleteStudent.mutate(
              { id: studentId },
              {
                onSuccess: () => router.replace("/students"),
                onError: (err) =>
                  Alert.alert("Couldn't delete", apiErrorMessage(err, "Try again.")),
              },
            ),
        },
      ],
    );
  };

  let body;
  if (isPending) body = <RouteSkeleton />;
  else if (isError) body = <RouteError onRetry={() => void refetch()} />;
  else {
    const actions = studentActionsFor(user, scopes, data);
    body = (
      <View className="flex-col gap-4">
        <PageTitle title={data.name} subtitle={data.email} />
        <StudentDetailView
          student={data}
          canWriteNote={role !== "STUDENT"}
          staffTabs={role !== "STUDENT"}
          dropFor={(e) => (actions.canDrop(e) ? () => setDropTarget(e) : null)}
          actions={
            <>
              {actions.canGraduate && data.graduationYear === null ? (
                <Button variant="outline" onPress={() => setGraduateOpen(true)}>
                  Graduate
                </Button>
              ) : null}
              {actions.canEdit ? (
                <Button
                  onPress={() =>
                    router.push({ pathname: "/student/[id]/edit", params: { id: String(data.id) } })
                  }
                >
                  Edit profile
                </Button>
              ) : null}
              {actions.canDelete ? (
                <Button
                  variant="ghost"
                  disabled={deleteStudent.isPending}
                  onPress={() => confirmDelete(data.id, data.name)}
                >
                  Delete student
                </Button>
              ) : null}
            </>
          }
        />
        {actions.canGraduate ? (
          <GraduateStudentSheet
            visible={graduateOpen}
            studentId={data.id}
            studentName={data.name}
            onClose={() => setGraduateOpen(false)}
          />
        ) : null}
        <DropEnrollmentSheet
          studentId={data.id}
          enrollment={dropTarget}
          onClose={() => setDropTarget(null)}
        />
      </View>
    );
  }

  return (
    <ShellFrame refreshing={isRefetching} onRefresh={refresh}>
      {body}
    </ShellFrame>
  );
}

export default function StudentDetailScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const parsed = Number(rawId);
  const id = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

  if (id === null) {
    return (
      <ShellFrame>
        <EmptyState title="Not found" description="That student link isn't valid." />
      </ShellFrame>
    );
  }
  if (role === "LEADER") return <LeaderStudentDetail id={id} />;
  return <StaffStudentDetail id={id} />;
}
