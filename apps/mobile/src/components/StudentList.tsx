import { useState, type ReactNode } from "react";
import { useRouter } from "expo-router";
import { GraduationCap, UserMinus, Users } from "lucide-react-native";
import { Pressable, View } from "react-native";
import type { StudentListItem, StudentListSort, StudentListStatus, UserRole } from "@space/shared";

import { PageTitle } from "../design/layout/page-title";
import { RouteError, RouteSkeleton } from "../design/layout/route-states";
import { ShellFrame } from "../design/layout/shell-frame";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
  type DataTableColumn,
} from "../design/ui";
import { useAllGroups } from "../hooks/use-groups";
import { DEFAULT_STUDENT_VIEW, useStudentList, type StudentListView } from "../hooks/use-students";
import { formatDate } from "../lib/format";
import { useSessionStore } from "../store/session";

/** Who may open each list: the screen mirrors the endpoint's per-surface gate. */
export const ALUMNI_ROLES: readonly UserRole[] = ["SUPER", "ADMIN", "MENTOR"];
export const DROPPED_ROLES: readonly UserRole[] = ["SUPER", "ADMIN"];

const SORT_ITEMS: Record<StudentListSort, string> = {
  name: "Sort: Name",
  university: "Sort: University",
  season: "Sort: Season",
  group: "Sort: Group",
};

const dash = <Text className="text-sm italic text-muted-foreground">—</Text>;

function initialsFor(name: string | null, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
  }
  return email[0]?.toUpperCase() ?? "?";
}

/** v1 students-list.tsx first column: avatar, name over email, the whole block a link. */
function StudentCell({ item }: { item: StudentListItem }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      className="flex-row items-center gap-2 self-start"
      onPress={() => router.push({ pathname: "/student/[id]", params: { id: String(item.id) } })}
    >
      <Avatar className="size-8">
        {/* No image: avatars are uploads, and uploads are off (gap note). */}
        <AvatarFallback>{initialsFor(item.name, item.email)}</AvatarFallback>
      </Avatar>
      <View className="flex-col">
        <Text className="font-medium">{item.name}</Text>
        <Text className="text-xs text-muted-foreground">{item.email}</Text>
      </View>
    </Pressable>
  );
}

function NameLink({ item }: { item: StudentListItem }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      className="self-start"
      onPress={() => router.push({ pathname: "/student/[id]", params: { id: String(item.id) } })}
    >
      <Text className="font-medium text-foreground">{item.name}</Text>
    </Pressable>
  );
}

const ACTIVE_COLUMNS: DataTableColumn<StudentListItem>[] = [
  { key: "name", header: "Student", cell: (row) => <StudentCell item={row} /> },
  {
    key: "university",
    header: "University",
    cell: (row) =>
      row.university ? (
        <Text className="text-sm">
          {row.university}
          {row.year ? (
            <Text className="text-sm text-muted-foreground">{` · ${row.year}`}</Text>
          ) : null}
        </Text>
      ) : (
        dash
      ),
  },
  {
    key: "season",
    header: "Season",
    cell: (row) =>
      row.activeSeasonTitle ? <Badge variant="outline">{row.activeSeasonTitle}</Badge> : dash,
  },
  {
    key: "group",
    header: "Group",
    cell: (row) =>
      row.currentGroupName ? <Badge variant="secondary">{row.currentGroupName}</Badge> : dash,
  },
];

const ALUMNI_COLUMNS: DataTableColumn<StudentListItem>[] = [
  { key: "name", header: "Alumnus", cell: (row) => <NameLink item={row} /> },
  {
    key: "graduationYear",
    header: "Class of",
    cell: (row) => (
      <Badge variant="success">
        {row.graduationYear === null ? "—" : String(row.graduationYear)}
      </Badge>
    ),
  },
  {
    key: "university",
    header: "University",
    cell: (row) => (row.university ? <Text className="text-sm">{row.university}</Text> : dash),
  },
];

const DROPPED_COLUMNS: DataTableColumn<StudentListItem>[] = [
  { key: "name", header: "Student", cell: (row) => <NameLink item={row} /> },
  {
    key: "season",
    header: "Dropped from",
    cell: (row) => <Badge variant="outline">{row.droppedEnrollment?.seasonTitle ?? "—"}</Badge>,
  },
  {
    key: "droppedAt",
    header: "Dropped on",
    cell: (row) => (
      <Text className="text-muted-foreground">
        {row.droppedEnrollment?.droppedAt ? formatDate(row.droppedEnrollment.droppedAt) : "—"}
      </Text>
    ),
  },
  {
    key: "reason",
    header: "Reason",
    cell: (row) =>
      row.droppedEnrollment?.dropReason ? (
        <Text className="text-sm">{row.droppedEnrollment.dropReason}</Text>
      ) : (
        dash
      ),
  },
];

const COPY = {
  active: {
    columns: ACTIVE_COLUMNS,
    icon: Users,
    emptyTitle: "No students yet",
    emptyDescription: "Students will appear here once they're enrolled.",
    subtitle: (n: number) => `${n} ${n === 1 ? "student" : "students"} in your seasons`,
  },
  alumni: {
    columns: ALUMNI_COLUMNS,
    icon: GraduationCap,
    emptyTitle: "No alumni yet",
    emptyDescription: "Students you graduate will appear here.",
    subtitle: (n: number) => `${n} graduated ${n === 1 ? "student" : "students"} from your seasons`,
  },
  dropped: {
    columns: DROPPED_COLUMNS,
    icon: UserMinus,
    emptyTitle: "No dropped students",
    emptyDescription: "Students who leave a season without graduating will show up here.",
    subtitle: (n: number) => `${n} ${n === 1 ? "student" : "students"} dropped from your seasons`,
  },
} as const;

/**
 * v1's group select, sort select and direction toggle (students-list.tsx),
 * server-side here (REG-82). V1 also filtered by season on the device; the
 * server has no season filter on this list (gap note).
 */
function StudentFilters({
  view,
  onChange,
}: {
  view: StudentListView;
  onChange: (view: StudentListView) => void;
}) {
  const { groups } = useAllGroups(true);
  const groupItems: Record<string, string> = {
    all: "All groups",
    none: "Unassigned",
    ...Object.fromEntries(groups.map((g) => [String(g.id), `${g.name} · ${g.seasonTitle}`])),
  };
  const groupValue = view.groupId === null ? "all" : String(view.groupId);
  return (
    <View className="flex-col gap-2">
      <Select
        items={groupItems}
        value={groupValue}
        onValueChange={(v) =>
          onChange({ ...view, groupId: v === "all" ? null : v === "none" ? "none" : Number(v) })
        }
      >
        <SelectTrigger accessibilityLabel="Group">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(groupItems).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <Select
            items={SORT_ITEMS}
            value={view.sort ?? "name"}
            onValueChange={(v) => onChange({ ...view, sort: v as StudentListSort })}
          >
            <SelectTrigger accessibilityLabel="Sort by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_ITEMS) as StudentListSort[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {SORT_ITEMS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </View>
        <Button
          variant="outline"
          size="sm"
          accessibilityLabel="Toggle sort direction"
          onPress={() =>
            onChange({
              ...view,
              sort: view.sort ?? "name",
              dir: view.dir === "asc" ? "desc" : "asc",
            })
          }
        >
          {view.dir === "asc" ? "↑ A–Z" : "↓ Z–A"}
        </Button>
      </View>
    </View>
  );
}

export interface StudentListProps {
  status: StudentListStatus;
  /** Mirrors the endpoint's per-surface role gate — the screen never asks for a 403. */
  allowedRoles: readonly UserRole[];
  title: string;
  /** Rendered with the page's other header buttons — e.g. "New student" for SUPER. */
  headerAction?: ReactNode;
}

/**
 * v1 /admin/students, /alumni and /dropped (and, for SUPER, the same pages
 * under /super): title, count line, search, v1's DataTable (phone cards).
 */
export function StudentList({ status, allowedRoles, title, headerAction }: StudentListProps) {
  const router = useRouter();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const allowed = role !== null && allowedRoles.includes(role);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [view, setView] = useState<StudentListView>(DEFAULT_STUDENT_VIEW);
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
      <ShellFrame>
        <EmptyState title={title} description="This list isn't available for your role." />
      </ShellFrame>
    );
  }

  const students = data?.pages.flatMap((p) => p.students) ?? [];
  const total = data?.pages[0]?.total ?? 0;
  const copy = COPY[status];

  let body: ReactNode;
  if (isPending) body = <RouteSkeleton />;
  else if (isError) body = <RouteError onRetry={() => void refetch()} />;
  else
    body = (
      <>
        <DataTable
          columns={copy.columns as DataTableColumn<StudentListItem>[]}
          // Dropped rows are enrollment-keyed (R43): one student can
          // appear once per dropped season, so the user id collides.
          rowKey={(item) => item.droppedEnrollment?.enrollmentId ?? item.id}
          rows={students}
          emptyState={
            <EmptyState
              icon={copy.icon}
              title={q || view.groupId !== null ? title : copy.emptyTitle}
              description={
                q
                  ? "No students match your search."
                  : view.groupId !== null
                    ? "No students are in that group."
                    : copy.emptyDescription
              }
            />
          }
        />
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

  return (
    <ShellFrame onRefresh={() => void refetch()} refreshing={isRefetching}>
      <View className="flex-col gap-4">
        <View className="flex-col gap-3">
          {/* The real population under the current filters (D14) — v1
              printed the fetched row count as if it were the total. */}
          <PageTitle title={title} subtitle={data ? copy.subtitle(total) : undefined} />
          {status === "active" ? (
            <View className="flex-row flex-wrap gap-2">
              {role !== null && ALUMNI_ROLES.includes(role) ? (
                <Button variant="outline" onPress={() => router.push("/students/alumni")}>
                  Alumni
                </Button>
              ) : null}
              {role !== null && DROPPED_ROLES.includes(role) ? (
                <Button variant="outline" onPress={() => router.push("/students/dropped")}>
                  Dropped students
                </Button>
              ) : null}
              {headerAction}
            </View>
          ) : (
            headerAction
          )}
        </View>
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Input
              accessibilityLabel="Search students"
              value={search}
              onChangeText={setSearch}
              placeholder="Search name, email, university…"
              returnKeyType="search"
              onSubmitEditing={() => setQ(search.trim())}
            />
          </View>
          <Button variant="outline" onPress={() => setQ(search.trim())}>
            Search
          </Button>
        </View>
        {status === "active" ? <StudentFilters view={view} onChange={setView} /> : null}
        {body}
      </View>
    </ShellFrame>
  );
}
