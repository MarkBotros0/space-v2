import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";
import type { StudentListStatus, UserRole } from "@space/shared";

import { RouteError, RouteSkeleton } from "../design/layout/route-states";
import { Screen } from "../design/layout/screen";
import { EmptyState, FilterButton, GroupedList, SearchField } from "../design/ui";
import { DEFAULT_STUDENT_VIEW, useStudentList, type StudentListView } from "../hooks/use-students";
import { StudentFilterSheet, activeFilterCount } from "../screens/students-list/student-filter-sheet";
import { ActiveStudentRow, AlumnusRow, DroppedStudentRow } from "../screens/students-list/student-rows";
import { useDebouncedSearch } from "../hooks/use-debounced-search";
import { useRole } from "../store/session";
import { studentListCopy } from "../screens/students-list/copy";
import { LoadMoreButton } from "../design/ui/load-more-button";

/** Who may open each list: the screen mirrors the endpoint's per-surface gate. */
const ALUMNI_ROLES: readonly UserRole[] = ["SUPER", "ADMIN", "MENTOR"];
const DROPPED_ROLES: readonly UserRole[] = ["SUPER", "ADMIN"];

const ROWS = { active: ActiveStudentRow, alumni: AlumnusRow, dropped: DroppedStudentRow } as const;

interface StudentListProps {
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
  const role = useRole();
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
  const { data, isPending, isError, refetch, isRefetching, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useStudentList(shown, q, allowed, view);

  if (!allowed) {
    return (
      <Screen title={title}>
        <EmptyState title={title} description="This list isn't available for your role." />
      </Screen>
    );
  }

  const students = data?.pages.flatMap((p) => p.students) ?? [];
  const total = data?.pages[0]?.total ?? 0;
  const copy = studentListCopy({ audience: mentor ? "mentor" : "staff", shown, view, q });
  const Row = ROWS[shown];
  const filters = activeFilterCount(view) + (shown !== "active" ? 1 : 0);

  let body: ReactNode;
  if (isPending) body = <RouteSkeleton />;
  else if (isError) body = <RouteError onRetry={() => void refetch()} />;
  else if (students.length === 0)
    body = <EmptyState icon={copy.icon} title={copy.emptyTitle} description={copy.emptyDescription} />;
  else
    body = (
      <>
        <GroupedList>
          {students.map((item) => (
            <Row
              // Dropped rows are enrollment-keyed (R43): one student can
              // appear once per dropped season, so the user id collides.
              key={item.droppedEnrollment?.enrollmentId ?? item.id}
              item={item}
              seasonless={mentor}
            />
          ))}
        </GroupedList>
        <LoadMoreButton query={{ hasNextPage, isFetchingNextPage, fetchNextPage }} loadingLabel="Loading…" />
      </>
    );

  const content = (
    <View className="flex-col gap-3">
      {/* Owner 2026-11-07: Filter is an icon button in the search row. */}
      <View className="flex-row items-center gap-2">
        <SearchField
          accessibilityLabel={copy.searchLabel}
          value={search}
          onChangeText={setSearch}
          placeholder={copy.searchLabel}
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
      subtitle={data ? copy.subtitle(total) : undefined}
      trailing={headerAction}
      onRefresh={() => void refetch()}
      refreshing={isRefetching}
    >
      {content}
    </Screen>
  );
}
