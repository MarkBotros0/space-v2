import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";
import { dateOnlyFromIso, type EnrollmentHistoryItem } from "@space/shared";

import { DropEnrollmentSheet } from "../../../../src/components/DropEnrollmentSheet";
import { GraduateStudentSheet } from "../../../../src/components/GraduateStudentSheet";
import { useDeleteStudent, useStudentDetail, type StudentDetail } from "../../../../src/hooks/use-students";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import { formatDayKey } from "../../../../src/lib/format";
import { studentActionsFor } from "../../../../src/lib/student-actions";
import { useSessionStore } from "../../../../src/store/session";
import { useTheme } from "../../../../src/theme";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../../../src/ui";

function enrollmentStatusLabel(status: EnrollmentHistoryItem["status"]): string {
  if (status === "COMPLETED") return "Completed";
  if (status === "WITHDRAWN") return "Dropped";
  return "Active";
}

function ProfileCard({ detail }: { detail: StudentDetail }) {
  const theme = useTheme();
  const p = detail.profile;
  const rows: [string, string][] = [];
  if (p.university) rows.push(["University", p.university]);
  if (p.year) rows.push(["Year", p.year]);
  if (p.gifts) rows.push(["Gifts", p.gifts]);
  // Present only on the private/internal arms — the server narrows by role
  // (spec 06 §4.2); the client renders what its arm carries.
  if ("phone" in p && p.phone) rows.push(["Phone", p.phone]);
  if ("dateOfBirth" in p && p.dateOfBirth) {
    // A calendar day, read without any timezone (Plan 10 Decision 8).
    rows.push(["Date of birth", formatDayKey(dateOnlyFromIso(p.dateOfBirth))]);
  }
  if ("spiritualBackground" in p && p.spiritualBackground) {
    rows.push(["Spiritual background", p.spiritualBackground]);
  }
  if (rows.length === 0) return null;

  return (
    <Card style={{ marginTop: theme.spacing.md }}>
      <Text variant="heading">Profile</Text>
      {rows.map(([label, value]) => (
        <Text key={label} variant="body">
          <Text variant="label" color={theme.colors.neutral[600]}>{`${label}: `}</Text>
          {value}
        </Text>
      ))}
    </Card>
  );
}

function EnrollmentRow({ item, onDrop }: { item: EnrollmentHistoryItem; onDrop: (() => void) | null }) {
  const theme = useTheme();
  return (
    <Card style={{ marginTop: theme.spacing.sm }}>
      <Text variant="body">{item.seasonTitle}</Text>
      <Text variant="label" color={theme.colors.neutral[600]}>
        {[enrollmentStatusLabel(item.status), item.groupName].filter(Boolean).join(" · ")}
      </Text>
      {item.dropReason ? (
        <Text variant="caption" color={theme.colors.neutral[600]}>
          {item.dropReason}
        </Text>
      ) : null}
      {onDrop ? <Button title="Drop" variant="ghost" onPress={onDrop} /> : null}
    </Card>
  );
}

export default function StudentDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const scopes = useSessionStore((s) => s.scopes);
  const role = user?.role ?? null;
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const parsed = Number(rawId);
  const id = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

  const { data, isPending, isError, refetch } = useStudentDetail(id, role);
  const deleteStudent = useDeleteStudent();
  const [graduateOpen, setGraduateOpen] = useState(false);
  const [dropTarget, setDropTarget] = useState<EnrollmentHistoryItem | null>(null);

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
                onError: (err) => Alert.alert("Couldn't delete", apiErrorMessage(err, "Try again.")),
              },
            ),
        },
      ],
    );
  };

  if (id === null) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Not found" message="That student link isn't valid." />
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load this student." onRetry={() => void refetch()} />
      ) : (
        (() => {
          const actions = studentActionsFor(user, scopes, data);
          return (
            <>
              <Text variant="title">{data.name}</Text>
              <Text variant="label" color={theme.colors.neutral[600]}>
                {data.email}
              </Text>
              {data.graduationYear !== null ? (
                <Text variant="label" color={theme.colors.neutral[600]}>
                  {`Alumnus — Class of ${data.graduationYear}`}
                </Text>
              ) : null}
              {data.currentGroup ? (
                <Text variant="label" color={theme.colors.neutral[600]}>
                  {`Current group: ${data.currentGroup.name}`}
                </Text>
              ) : null}

              {actions.canEdit || actions.canGraduate || actions.canDelete ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
                  {actions.canEdit ? (
                    <Button
                      title="Edit"
                      variant="secondary"
                      onPress={() =>
                        router.push({ pathname: "/student/[id]/edit", params: { id: String(data.id) } })
                      }
                    />
                  ) : null}
                  {actions.canGraduate ? (
                    <Button title="Graduate" variant="secondary" onPress={() => setGraduateOpen(true)} />
                  ) : null}
                  {actions.canDelete ? (
                    <Button
                      title="Delete student"
                      variant="ghost"
                      loading={deleteStudent.isPending}
                      onPress={() => confirmDelete(data.id, data.name)}
                    />
                  ) : null}
                </View>
              ) : null}

              <ProfileCard detail={data} />
              {"notes" in data.profile && data.profile.notes ? (
                <Card style={{ marginTop: theme.spacing.md }}>
                  <Text variant="heading">Internal notes</Text>
                  <Text variant="caption" color={theme.colors.neutral[600]}>
                    Staff only — the student never receives this field.
                  </Text>
                  <Text variant="body">{data.profile.notes}</Text>
                </Card>
              ) : null}
              <Card style={{ marginTop: theme.spacing.md }}>
                <Text variant="heading">Seasons</Text>
                {data.enrollments.length === 0 ? (
                  <Text variant="body" color={theme.colors.neutral[600]}>
                    No enrollments yet.
                  </Text>
                ) : (
                  data.enrollments.map((e) => (
                    <EnrollmentRow
                      key={e.enrollmentId}
                      item={e}
                      onDrop={actions.canDrop(e) ? () => setDropTarget(e) : null}
                    />
                  ))
                )}
              </Card>

              {actions.canGraduate ? (
                <GraduateStudentSheet
                  visible={graduateOpen}
                  studentId={data.id}
                  studentName={data.name}
                  onClose={() => setGraduateOpen(false)}
                />
              ) : null}
              <DropEnrollmentSheet studentId={data.id} enrollment={dropTarget} onClose={() => setDropTarget(null)} />
            </>
          );
        })()
      )}
    </Screen>
  );
}
