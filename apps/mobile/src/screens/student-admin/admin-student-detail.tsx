/**
 * SUPER and ADMIN on /student/[id] (v1 app/admin/students/[id]): the name
 * over the current group, Edit profile and Graduate, this season at a glance,
 * the details (the phone row calls), then Seasons, Attendance, Submissions
 * and Notes behind choice chips, the same layout as the leader's page (owner,
 * 2026-11-07). V2-ONLY Delete and a per-season Drop (Remove on a draft) show
 * only where `studentActionsFor` (the server's rules) allows. Delete leaves
 * for the list with dismissTo (CLAUDE.md navigation table).
 */
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";
import type { EnrollmentHistoryItem } from "@space/shared";

import { DropEnrollmentSheet } from "../../components/DropEnrollmentSheet";
import { GraduateStudentSheet } from "../../components/GraduateStudentSheet";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import {
  GroupedAttendanceTab,
  GroupedNotesTab,
  GroupedSubmissionsTab,
} from "../../design/students/grouped-tabs";
import { EngagementSummary } from "../../design/students/engagement-summary";
import { NoteSheet } from "../../design/students/note-sheet";
import { studentSubtitle } from "../../design/students/student-detail-grouped";
import { StudentDetails } from "../../design/students/student-details";
import { type StudentSection, StudentSections } from "../../design/students/student-sections";
import { Button } from "../../design/ui/button";
import { StatusChip } from "../../design/ui/status-chip";
import { useDeleteStudent, useStudentDetail } from "../../hooks/use-students";
import { apiErrorMessage } from "../../lib/api-error";
import { queryKeys } from "../../lib/query-keys";
import { studentActionsFor } from "../../lib/student-actions";
import { useSessionStore } from "../../store/session";
import { BringBackDialogs } from "./bring-back-dialogs";
import { RemoveFromDraftDialog } from "./remove-from-draft-dialog";
import { AdminSeasonsSection } from "./admin-seasons-section";

export function AdminStudentDetail({ id }: { id: number }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useSessionStore((s) => s.user);
  const scopes = useSessionStore((s) => s.scopes);
  const { data, isPending, isError, refetch, isRefetching } = useStudentDetail(
    id,
    user?.role ?? null,
  );
  const deleteStudent = useDeleteStudent();
  const [noteOpen, setNoteOpen] = useState(false);
  const [graduateOpen, setGraduateOpen] = useState(false);
  const [dropTarget, setDropTarget] = useState<EnrollmentHistoryItem | null>(null);
  const [removeTarget, setRemoveTarget] = useState<EnrollmentHistoryItem | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<EnrollmentHistoryItem | null>(null);

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
                // dismissTo, not replace: pops this deleted student's detail off the stack.
                onSuccess: () => router.dismissTo("/students"),
                onError: (err) =>
                  Alert.alert("Couldn't delete", apiErrorMessage(err, "Try again.")),
              },
            ),
        },
      ],
    );
  };

  if (isPending || isError) {
    return (
      <Screen title="Student" refreshing={isRefetching} onRefresh={refresh}>
        {isPending ? <RouteSkeleton /> : <RouteError onRetry={() => void refetch()} />}
      </Screen>
    );
  }

  const actions = studentActionsFor(user, scopes, data);
  // Owner 2026-11-07: Submissions first, then Attendance, Notes and Seasons; the first opens.
  const sections: StudentSection[] = [
    { value: "submissions", label: "Submissions", render: () => <GroupedSubmissionsTab studentId={data.id} /> },
    { value: "attendance", label: "Attendance", render: () => <GroupedAttendanceTab studentId={data.id} /> },
    {
      value: "notes",
      label: "Notes",
      render: () => <GroupedNotesTab studentId={data.id} canWriteNote onWrite={() => setNoteOpen(true)} />,
    },
    {
      value: "seasons",
      label: "Seasons",
      render: () => (
        <AdminSeasonsSection
          enrollments={data.enrollments}
          dropFor={(e) => (actions.canDrop(e) ? () => setDropTarget(e) : null)}
          removeFor={(e) => (actions.canRemove(e) ? () => setRemoveTarget(e) : null)}
          restoreFor={(e) => (actions.canRestore(e) ? () => setRestoreTarget(e) : null)}
        />
      ),
    },
  ];
  return (
    <Screen title={data.name} subtitle={studentSubtitle(data)} refreshing={isRefetching} onRefresh={refresh}>
      <View className="flex-col gap-6">
        {data.graduationYear !== null ? (
          <StatusChip tone="ok" label={`Alumnus · School of ${data.graduationYear}`} className="self-start" />
        ) : null}
        {actions.canEdit || actions.canGraduate ? (
          <View testID="student-actions" className="flex-row flex-wrap gap-2">
            {actions.canEdit ? (
              <Button
                onPress={() =>
                  router.push({ pathname: "/student/[id]/edit", params: { id: String(data.id) } })
                }
              >
                Edit profile
              </Button>
            ) : null}
            {actions.canGraduate ? (
              <Button variant="secondary" onPress={() => setGraduateOpen(true)}>
                Graduate
              </Button>
            ) : null}
          </View>
        ) : null}

        <EngagementSummary studentId={data.id} />
        <StudentDetails profile={data.profile} exception={data.graduatedByException} />
        <StudentSections sections={sections} />

        {/* Destructive action: apart from the primary actions, at the bottom. */}
        {actions.canDelete ? (
          <View testID="student-danger-zone" className="mt-4 border-t border-border pt-4">
            <Button
              variant="destructive"
              disabled={deleteStudent.isPending}
              onPress={() => confirmDelete(data.id, data.name)}
            >
              Delete student
            </Button>
          </View>
        ) : null}
      </View>

      <NoteSheet open={noteOpen} onClose={() => setNoteOpen(false)} studentUserId={data.id} />
      {actions.canGraduate ? (
        <GraduateStudentSheet
          visible={graduateOpen}
          studentId={data.id}
          studentName={data.name}
          onClose={() => setGraduateOpen(false)}
        />
      ) : null}
      <BringBackDialogs
        studentId={data.id}
        studentName={data.name}
        enrollment={restoreTarget}
        onClose={() => setRestoreTarget(null)}
      />
      <RemoveFromDraftDialog
        studentId={data.id}
        studentName={data.name}
        enrollment={removeTarget}
        onClose={() => setRemoveTarget(null)}
      />
      <DropEnrollmentSheet
        studentId={data.id}
        enrollment={dropTarget}
        onClose={() => setDropTarget(null)}
      />
    </Screen>
  );
}
