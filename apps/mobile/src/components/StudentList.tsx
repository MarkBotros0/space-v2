import { useState, type ReactNode } from "react";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import type { StudentListItem, StudentListStatus, UserRole } from "@space/shared";

import { useStudentList } from "../hooks/use-students";
import { formatDate } from "../lib/format";
import { useSessionStore } from "../store/session";
import { useTheme } from "../theme";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text } from "../ui";

function subtitleFor(status: StudentListStatus, item: StudentListItem): string {
  if (status === "alumni") {
    return [`Class of ${item.graduationYear ?? "—"}`, item.university]
      .filter(Boolean)
      .join(" · ");
  }
  if (status === "dropped") {
    const d = item.droppedEnrollment;
    if (!d) return item.email;
    return [d.seasonTitle, d.droppedAt ? formatDate(d.droppedAt) : null]
      .filter(Boolean)
      .join(" · ");
  }
  return (
    [item.university, item.activeSeasonTitle, item.currentGroupName].filter(Boolean).join(" · ") ||
    item.email
  );
}

function StudentRow({ status, item }: { status: StudentListStatus; item: StudentListItem }) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/student/[id]", params: { id: String(item.id) } })}
    >
      <Card style={{ marginBottom: theme.spacing.sm }}>
        <Text variant="heading">{item.name}</Text>
        <Text variant="label" color={theme.colors.neutral[600]}>
          {subtitleFor(status, item)}
        </Text>
        {status === "dropped" && item.droppedEnrollment?.dropReason ? (
          <Text variant="caption" color={theme.colors.neutral[600]}>
            {item.droppedEnrollment.dropReason}
          </Text>
        ) : null}
      </Card>
    </Pressable>
  );
}

export interface StudentListProps {
  status: StudentListStatus;
  /** Mirrors the endpoint's per-surface role gate — the screen never asks for a 403. */
  allowedRoles: readonly UserRole[];
  title: string;
  /** Rendered above the search field, inside the allowed branch — e.g. "New student" for SUPER. */
  headerAction?: ReactNode;
}

export function StudentList({ status, allowedRoles, title, headerAction }: StudentListProps) {
  const theme = useTheme();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const allowed = role !== null && allowedRoles.includes(role);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const {
    data,
    isPending,
    isError,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useStudentList(status, q, allowed);

  if (!allowed) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title={title} message="This list isn't available for your role." />
      </Screen>
    );
  }

  const students = data?.pages.flatMap((p) => p.students) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  return (
    <Screen
      edges={["top", "left", "right"]}
      onRefresh={() => void refetch()}
      refreshing={isRefetching}
    >
      {headerAction ?? null}
      <Input
        label="Search students"
        value={search}
        onChangeText={setSearch}
        returnKeyType="search"
        onSubmitEditing={() => setQ(search.trim())}
      />
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState
          message="Couldn't load students. Check your connection and try again."
          onRetry={() => void refetch()}
        />
      ) : students.length === 0 ? (
        <EmptyState
          title={title}
          message={q ? "No students match your search." : "Nothing here yet."}
        />
      ) : (
        <>
          <Text variant="caption" color={theme.colors.neutral[600]}>
            {/* The real population under the current filters (D14) — v1
                printed the fetched row count as if it were the total. */}
            {`${total} total`}
          </Text>
          {students.map((item) => (
            <StudentRow
              // Dropped rows are enrollment-keyed (R43): one student can
              // appear once per dropped season, so the user id collides.
              key={item.droppedEnrollment?.enrollmentId ?? item.id}
              status={status}
              item={item}
            />
          ))}
          {hasNextPage ? (
            <Button
              title="Load more"
              variant="secondary"
              onPress={() => void fetchNextPage()}
              loading={isFetchingNextPage}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}
