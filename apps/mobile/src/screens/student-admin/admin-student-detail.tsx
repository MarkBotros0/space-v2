/**
 * SUPER and ADMIN on /student/[id] (v1 app/admin/students/[id]): name and
 * email in the title, mail/call, Edit profile, Graduate, V2-ONLY Delete and a
 * per-season Drop (Remove on a draft), each only where `studentActionsFor` (the server's rules)
 * allows. Five sections behind wrapping ChoiceChips; a section's queries mount
 * the first time it opens and stay mounted (spec 06 §9). Delete leaves for
 * the list with dismissTo (CLAUDE.md navigation table).
 */
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { Alert, Linking, View } from "react-native";
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
import { NoteSheet } from "../../design/students/note-sheet";
import { Button } from "../../design/ui/button";
import { ChoiceChip } from "../../design/ui/choice-chip";
import { StatusChip } from "../../design/ui/status-chip";
import { useDeleteStudent, useStudentDetail } from "../../hooks/use-students";
import { apiErrorMessage } from "../../lib/api-error";
import { queryKeys } from "../../lib/query-keys";
import { studentActionsFor } from "../../lib/student-actions";
import { useSessionStore } from "../../store/session";
import { AdminEngagement } from "./admin-engagement";
import { AdminProfileSection } from "./admin-profile-section";
import { BringBackDialogs } from "./bring-back-dialogs";
import { RemoveFromDraftDialog } from "./remove-from-draft-dialog";
import { AdminSeasonsSection } from "./admin-seasons-section";

type Section = "profile" | "seasons" | "attendance" | "submissions" | "notes";
const SECTIONS: { value: Section; label: string }[] = [
  { value: "profile", label: "Profile" },
  { value: "seasons", label: "Seasons" },
  { value: "attendance", label: "Attendance" },
  { value: "submissions", label: "Submissions" },
  { value: "notes", label: "Notes" },
];

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
  const [section, setSection] = useState<Section>("profile");
  const [opened, setOpened] = useState<Set<Section>>(() => new Set<Section>(["profile"]));
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
  const choose = (s: Section) => {
    setSection(s);
    setOpened((prev) => new Set(prev).add(s));
  };
  const lazy = (s: Section, node: ReactNode) => (opened.has(s) ? node : null);

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
  const p = data.profile;
  const phone = "phone" in p ? p.phone : null;
  return (
    <Screen title={data.name} subtitle={data.email} refreshing={isRefetching} onRefresh={refresh}>
      <View className="flex-col gap-4">
        <View className="flex-row flex-wrap gap-2">
          {data.graduationYear !== null ? (
            <StatusChip tone="ok" label={`Alumnus · School of ${data.graduationYear}`} />
          ) : null}
          {p.activeSeasonTitle ? <StatusChip tone="info" label={p.activeSeasonTitle} /> : null}
          {data.currentGroup ? <StatusChip tone="neutral" label={data.currentGroup.name} /> : null}
        </View>
        <View testID="student-actions" className="flex-row flex-wrap gap-2">
          {phone ? (
            <Button variant="secondary" onPress={() => void Linking.openURL(`tel:${phone}`)}>
              Call
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
          {actions.canGraduate ? (
            <Button variant="secondary" onPress={() => setGraduateOpen(true)}>
              Graduate
            </Button>
          ) : null}
        </View>

        <AdminEngagement studentId={data.id} />

        <View className="flex-row flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <ChoiceChip
              key={s.value}
              label={s.label}
              selected={section === s.value}
              onPress={() => choose(s.value)}
            />
          ))}
        </View>

        {/* An opened section stays mounted (hidden) so its cache and scroll state survive a switch. */}
        <View className={section === "profile" ? undefined : "hidden"}>
          <AdminProfileSection profile={p} exception={data.graduatedByException} />
        </View>
        <View className={section === "seasons" ? undefined : "hidden"}>
          <AdminSeasonsSection
            enrollments={data.enrollments}
            dropFor={(e) => (actions.canDrop(e) ? () => setDropTarget(e) : null)}
            removeFor={(e) => (actions.canRemove(e) ? () => setRemoveTarget(e) : null)}
            restoreFor={(e) => (actions.canRestore(e) ? () => setRestoreTarget(e) : null)}
          />
        </View>
        <View className={section === "attendance" ? undefined : "hidden"}>
          {lazy("attendance", <GroupedAttendanceTab studentId={data.id} />)}
        </View>
        <View className={section === "submissions" ? undefined : "hidden"}>
          {lazy("submissions", <GroupedSubmissionsTab studentId={data.id} />)}
        </View>
        <View className={section === "notes" ? undefined : "hidden"}>
          {lazy(
            "notes",
            <GroupedNotesTab studentId={data.id} canWriteNote onWrite={() => setNoteOpen(true)} />,
          )}
        </View>

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
