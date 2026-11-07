import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";
import type { StudentListItem, StudentListStatus, UserRole } from "@space/shared";

import { NAV_ICONS } from "../design/icons/nav-icon";
import { RouteError, RouteSkeleton } from "../design/layout/route-states";
import { Screen } from "../design/layout/screen";
import { Button, EmptyState, FilterButton, GroupedList, SearchField } from "../design/ui";
import { DEFAULT_STUDENT_VIEW, useStudentList, type StudentListView } from "../hooks/use-students";
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

/** The mentor's count line: no "your seasons" (owner, 2026-11-07). */
function mentorSubtitle(n: number, absent: boolean): string {
  const people = `${n} ${n === 1 ? "student" : "students"}`;
  return absent ? `${people} absent lately` : people;
}

export interface StudentListProps {
  status: StudentListStatus;
  /** Mirrors the endpoint's per-surface role gate — the screen never asks for a 403. */
  allowedRoles: readonly UserRole[];
  title: string;
  /** Rendered with the page's other header buttons — e.g. "New student" for SUPER. */
  headerAction?: ReactNode;
  /** Inside another screen (the admin's Groups tab): the list without its own Screen. */
  embedded?: boolean;
  /** Opens on the mentor's "Absent lately" (Home's card links `?absent=1`). */
  absentLately?: boolean;
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
  absentLately = false,
}: StudentListProps) {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const allowed = role !== null && allowedRoles.includes(role);
  const { search, q, setSearch, commit } = useDebouncedSearch();
  // The mentor sees nothing season-shaped (owner, 2026-11-07): rows, filters and copy.
  const mentor = role === "MENTOR";
  const [view, setView] = useState<StudentListView>({ ...DEFAULT_STUDENT_VIEW, absentLately: mentor && absentLately });
  useEffect(() => {
    if (mentor) setView((v) => ({ ...v, absentLately }));
  }, [mentor, absentLately]);
  // Who the list shows (owner, 2026-11-07: Alumni and Dropped are a filter, not
  // pages). Starts at the caller's; a link with ?show= changes it.
  const [picked, setShown] = useState<StudentListStatus>(status);
  useEffect(() => setShown(status), [status]);
  const showOptions: StudentListStatus[] = [
    "active",
    ...(role !== null && ALUMNI_ROLES.includes(role) ? (["alumni"] as const) : []),
    ...(role !== null && DROPPED_ROLES.includes(role) ? (["dropped"] as const) : []),
  ];
  // A list the role may not read is never asked for: the endpoint would refuse it.
  const shown = showOptions.includes(picked) ? picked : "active";
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
  } = useStudentList(shown, q, allowed, view);

  if (!allowed) {
    return (
      <Screen title={title}>
        <EmptyState title={title} description="This list isn't available for your role." />
      </Screen>
    );
  }

  const students = data?.pages.flatMap((p) => p.students) ?? [];
  const total = data?.pages[0]?.total ?? 0;
  const copy = COPY[shown];
  const filtered = q !== "" || view.groupId !== null || view.seasonId !== null || view.absentLately;
  const filters = activeFilterCount(view) + (shown !== "active" ? 1 : 0);

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
            : view.absentLately
              ? "Nobody has missed their last two sessions."
              : view.groupId !== null
              ? "No students are in that group."
              : view.seasonId !== null
                ? "No students are in that season."
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
              seasonless={mentor}
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

  const content = (
    <View className="flex-col gap-3">
      {/* Owner 2026-11-07: Filter is an icon button in the search row. */}
      <View className="flex-row items-center gap-2">
        <SearchField
          accessibilityLabel="Search students"
          value={search}
          onChangeText={setSearch}
          placeholder="Search students"
          onSubmitEditing={commit}
          className="min-w-0 flex-1"
        />
        <FilterButton active={filters} onPress={() => setFiltering(true)} />
      </View>
      <StudentFilterSheet
        open={filtering}
        onClose={() => setFiltering(false)}
        view={view}
        onChange={setView}
        bySeason={role === "SUPER"}
        mentor={mentor}
        show={{
          value: shown,
          options: showOptions,
          // Each list has its own rows and filters: start it afresh.
          onChange: (next) => {
            setShown(next);
            setView(DEFAULT_STUDENT_VIEW);
          },
        }}
      />
      {body}
    </View>
  );
  if (embedded) return content;
  return (
    <Screen
      title={title}
      // The real population under the current filters (D14) — v1
      // printed the fetched row count as if it were the total.
      subtitle={data ? (mentor ? mentorSubtitle(total, view.absentLately) : copy.subtitle(total)) : undefined}
      trailing={headerAction}
      onRefresh={() => void refetch()}
      refreshing={isRefetching}
    >
      {content}
    </Screen>
  );
}
