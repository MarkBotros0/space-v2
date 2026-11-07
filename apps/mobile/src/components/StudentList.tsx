import { useState, type ReactNode } from "react";
import { useRouter } from "expo-router";
import { View } from "react-native";
import type { StudentListItem, StudentListStatus, UserRole } from "@space/shared";

import { NAV_ICONS } from "../design/icons/nav-icon";
import { RouteError, RouteSkeleton } from "../design/layout/route-states";
import { Screen } from "../design/layout/screen";
import { Button, ChoiceChip, EmptyState, GroupedList, ListRow, SearchField } from "../design/ui";
import { DEFAULT_STUDENT_VIEW, useStudentList, type StudentListView } from "../hooks/use-students";
import { joinMeta } from "../lib/join-meta";
import {
  StudentFilterSheet,
  activeFilterCount,
} from "../screens/students-list/student-filter-sheet";
import {
  ActiveStudentRow,
  AlumnusRow,
  DroppedStudentRow,
} from "../screens/students-list/student-rows";
import { useDebouncedSearch } from "../screens/students-list/use-debounced-search";
import { useSessionStore } from "../store/session";

/** Who may open each list: the screen mirrors the endpoint's per-surface gate. */
export const ALUMNI_ROLES: readonly UserRole[] = ["SUPER", "ADMIN", "MENTOR"];
export const DROPPED_ROLES: readonly UserRole[] = ["SUPER", "ADMIN"];

const COPY = {
  active: {
    Row: ActiveStudentRow,
    icon: NAV_ICONS.students,
    emptyTitle: "No students yet",
    emptyDescription: "Students will appear here once they're enrolled.",
    subtitle: (n: number) => `${n} ${n === 1 ? "student" : "students"} in your seasons`,
  },
  alumni: {
    Row: AlumnusRow,
    icon: NAV_ICONS.alumni,
    emptyTitle: "No alumni yet",
    emptyDescription: "Students you graduate will appear here.",
    subtitle: (n: number) => `${n} graduated ${n === 1 ? "student" : "students"} from your seasons`,
  },
  dropped: {
    Row: DroppedStudentRow,
    icon: NAV_ICONS.dropped,
    emptyTitle: "No dropped students",
    emptyDescription: "Students who leave a season without graduating will show up here.",
    subtitle: (n: number) => `${n} ${n === 1 ? "student" : "students"} dropped from your seasons`,
  },
} as const;

export interface StudentListProps {
  status: StudentListStatus;
  /** Mirrors the endpoint's per-surface role gate — the screen never asks for a 403. */
  allowedRoles: readonly UserRole[];
  title: string;
  /** Rendered with the page's other header buttons — e.g. "New student" for SUPER. */
  headerAction?: ReactNode;
  /** Inside another screen (the admin's Groups tab): the list without its own Screen. */
  embedded?: boolean;
}

/**
 * v1 /admin/students, /alumni and /dropped (and, for SUPER, the same pages
 * under /super): title, count line, search, v1's DataTable (phone cards).
 */
export function StudentList({
  status,
  allowedRoles,
  title,
  headerAction,
  embedded = false,
}: StudentListProps) {
  const router = useRouter();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const allowed = role !== null && allowedRoles.includes(role);
  const { search, q, setSearch, commit } = useDebouncedSearch();
  const [view, setView] = useState<StudentListView>(DEFAULT_STUDENT_VIEW);
  const [filtering, setFiltering] = useState(false);
  const {
    data,
    isPending,
    isError,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useStudentList(status, q, allowed, view);

  if (!allowed) {
    return (
      <Screen title={title}>
        <EmptyState title={title} description="This list isn't available for your role." />
      </Screen>
    );
  }

  const students = data?.pages.flatMap((p) => p.students) ?? [];
  const total = data?.pages[0]?.total ?? 0;
  const copy = COPY[status];
  const filtered = q !== "" || view.groupId !== null;
  const filters = activeFilterCount(view);

  let body: ReactNode;
  if (isPending) body = <RouteSkeleton />;
  else if (isError) body = <RouteError onRetry={() => void refetch()} />;
  else if (students.length === 0)
    body = (
      <EmptyState
        icon={copy.icon}
        title={filtered ? "No matches" : copy.emptyTitle}
        description={
          q
            ? "No students match your search."
            : view.groupId !== null
              ? "No students are in that group."
              : copy.emptyDescription
        }
      />
    );
  else
    body = (
      <>
        <GroupedList>
          {students.map((item) => (
            <copy.Row
              // Dropped rows are enrollment-keyed (R43): one student can
              // appear once per dropped season, so the user id collides.
              key={item.droppedEnrollment?.enrollmentId ?? item.id}
              item={item as StudentListItem}
            />
          ))}
        </GroupedList>
        {hasNextPage ? (
          <Button
            variant="outline"
            disabled={isFetchingNextPage}
            onPress={() => void fetchNextPage()}
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        ) : null}
      </>
    );

  const showAlumni = role !== null && ALUMNI_ROLES.includes(role);
  const showDropped = role !== null && DROPPED_ROLES.includes(role);

  const content = (
    <View className="flex-col gap-3">
      {status === "active" && (showAlumni || showDropped) ? (
        <GroupedList>
          {showAlumni ? (
            <ListRow title="Alumni" chevron onPress={() => router.push("/students/alumni")} />
          ) : null}
          {showDropped ? (
            <ListRow
              title="Dropped students"
              chevron
              onPress={() => router.push("/students/dropped")}
            />
          ) : null}
        </GroupedList>
      ) : null}
      <SearchField
        accessibilityLabel="Search students"
        value={search}
        onChangeText={setSearch}
        placeholder="Search students"
        onSubmitEditing={commit}
      />
      {status === "active" ? (
        <>
          <ChoiceChip
            label={joinMeta(["Filter", filters > 0 ? filters : null])}
            accessibilityLabel={filters > 0 ? `Filter, ${filters} active` : "Filter"}
            selected={filters > 0}
            onPress={() => setFiltering(true)}
          />
          <StudentFilterSheet
            open={filtering}
            onClose={() => setFiltering(false)}
            view={view}
            onChange={setView}
          />
        </>
      ) : null}
      {body}
    </View>
  );
  if (embedded) return content;
  return (
    <Screen
      title={title}
      // The real population under the current filters (D14) — v1
      // printed the fetched row count as if it were the total.
      subtitle={data ? copy.subtitle(total) : undefined}
      trailing={headerAction}
      onRefresh={() => void refetch()}
      refreshing={isRefetching}
    >
      {content}
    </Screen>
  );
}
