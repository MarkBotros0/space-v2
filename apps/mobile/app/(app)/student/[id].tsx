import { useLocalSearchParams } from "expo-router";
import type { EnrollmentHistoryItem } from "@space/shared";

import { useStudentDetail, type StudentDetail } from "../../../src/hooks/use-students";
import { formatDate } from "../../../src/lib/format";
import { useSessionStore } from "../../../src/store/session";
import { useTheme } from "../../../src/theme";
import { Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../../src/ui";

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
  // (spec 06 §4.2) and the client renders what its arm carries, deriving
  // and requesting nothing extra.
  if ("phone" in p && p.phone) rows.push(["Phone", p.phone]);
  if ("dateOfBirth" in p && p.dateOfBirth) rows.push(["Date of birth", formatDate(p.dateOfBirth)]);
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

function EnrollmentRow({ item }: { item: EnrollmentHistoryItem }) {
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
    </Card>
  );
}

export default function StudentDetailScreen() {
  const theme = useTheme();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const parsed = Number(rawId);
  const id = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

  const { data, isPending, isError, refetch } = useStudentDetail(id, role);

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {id === null ? (
        <EmptyState title="Not found" message="That student link isn't valid." />
      ) : isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load this student." onRetry={() => void refetch()} />
      ) : (
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
              data.enrollments.map((e) => <EnrollmentRow key={e.enrollmentId} item={e} />)
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}
