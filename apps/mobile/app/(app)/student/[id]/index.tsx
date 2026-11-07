import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import type { UserRole } from "@space/shared";

import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { Screen } from "../../../../src/design/layout/screen";
import { StudentDetailGrouped, studentSubtitle } from "../../../../src/design/students/student-detail-grouped";
import { MentorStudentPage } from "../../../../src/screens/mentor/mentor-student-page";
import { AdminStudentDetail } from "../../../../src/screens/student-admin/admin-student-detail";
import { EmptyState } from "../../../../src/design/ui";
import { useStudentDetail } from "../../../../src/hooks/use-students";
import { queryKeys } from "../../../../src/lib/query-keys";
import { useSessionStore } from "../../../../src/store/session";

/**
 * LEADER and MENTOR — v1 app/leader/students/[id] (B3-15) and app/mentor/students/[id];
 * the mentor's own page has nothing season-shaped (MentorStudentPage, owner 2026-11-07).
 * Neither has a lifecycle action (studentActionsFor, spec 06 §4); both write
 * notes (the server's canWriteNote). The STUDENT, whom the server lets read only
 * their own record, gets Profile and Seasons and nothing staff-only. Pull-to-refresh
 * invalidates the student's queries; only mounted ones (the opened tabs) refetch.
 */
function GroupedStudentPage({ id, role }: { id: number; role: UserRole | null }) {
  const queryClient = useQueryClient();
  const { data, isPending, refetch, isRefetching } = useStudentDetail(id, role);
  const refresh = () => {
    void refetch();
    for (const key of [
      queryKeys.engagement.student(id),
      queryKeys.students.attendance(id),
      queryKeys.students.submissions(id),
      queryKeys.notes.byStudent(id),
      queryKeys.followUps.all,
    ]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };
  // A failed background refresh keeps `data`: only a first load that failed
  // replaces the page, so an open tab and a dismissed note draft survive.
  if (!data) {
    return (
      <Screen title="Student" refreshing={isRefetching} onRefresh={refresh}>
        {isPending ? <RouteSkeleton /> : <RouteError onRetry={() => void refetch()} />}
      </Screen>
    );
  }
  if (role === "MENTOR") {
    // No group under the name: a group belongs to a season (owner, 2026-11-07).
    return (
      <Screen title={data.name} refreshing={isRefetching} onRefresh={refresh}>
        <MentorStudentPage student={data} />
      </Screen>
    );
  }
  const staff = role !== "STUDENT";
  return (
    <Screen title={data.name} subtitle={studentSubtitle(data)} refreshing={isRefetching} onRefresh={refresh}>
      <StudentDetailGrouped
        student={data}
        canWriteNote={staff}
        staffTabs={staff}
      />
    </Screen>
  );
}

export default function StudentDetailScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const parsed = Number(rawId);
  const id = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

  if (id === null) {
    return (
      <Screen>
        <EmptyState title="Not found" description="That student link isn't valid." />
      </Screen>
    );
  }
  if (role === "ADMIN" || role === "SUPER") return <AdminStudentDetail id={id} />;
  return <GroupedStudentPage id={id} role={role} />;
}
