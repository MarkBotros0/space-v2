/**
 * Port of v1 src/components/users/users-list.tsx: a DataTable of User (avatar
 * with name over email, linking to the edit page), Role badge, Status badge
 * and Last login. The phone DataTable leads with the user and joins the rest
 * under it. `renderActions` is v2-only: the row-level invite button.
 */
import { Users } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import type { UserListItem, UserStatus } from "@space/shared";

import { formatDate } from "../../lib/format";
import { initialsOf } from "../../lib/initials";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { DataTable, type DataTableColumn } from "../ui/data-table";
import { EmptyState } from "../ui/empty-state";
import { Text } from "../ui/text";

type RoleBadge = "super" | "admin" | "leader" | "mentor" | "student";
const ROLE_BADGE: Record<UserListItem["role"], RoleBadge> = {
  SUPER: "super",
  ADMIN: "admin",
  LEADER: "leader",
  MENTOR: "mentor",
  STUDENT: "student",
};

/** v1's four states (R82); the server derives which one applies (R81). */
const STATUS: Record<
  UserStatus,
  { label: string; variant: "success" | "info" | "outline" | "warning" }
> = {
  active: { label: "Active", variant: "success" },
  invited: { label: "Invited", variant: "info" },
  pending: { label: "No invite", variant: "outline" },
  inactive: { label: "Inactive", variant: "warning" },
};

export function UsersList({
  rows,
  onOpen,
  renderActions,
}: {
  rows: UserListItem[];
  onOpen: (row: UserListItem) => void;
  renderActions?: (row: UserListItem) => ReactNode;
}) {
  const columns: DataTableColumn<UserListItem>[] = [
    {
      key: "user",
      header: "User",
      cell: (row) => (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Open ${row.name || row.email}`}
          className="flex-row items-center gap-2"
          onPress={() => onOpen(row)}
        >
          <Avatar size="sm">
            <AvatarFallback>
              {initialsOf(row.name, row.email[0]?.toUpperCase() ?? "?")}
            </AvatarFallback>
          </Avatar>
          <View className="min-w-0 flex-1">
            <Text className="font-medium">{row.name || row.email}</Text>
            <Text className="text-xs text-muted-foreground">{row.email}</Text>
          </View>
        </Pressable>
      ),
    },
    {
      key: "role",
      header: "Role",
      cell: (row) => (
        <Badge role={ROLE_BADGE[row.role]} textClassName="uppercase">
          {row.role}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <Badge variant={STATUS[row.status].variant}>{STATUS[row.status].label}</Badge>,
    },
    {
      key: "lastLogin",
      header: "Last login",
      cell: (row) =>
        row.lastLoginAt ? (
          <Text className="text-xs text-muted-foreground">{formatDate(row.lastLoginAt)}</Text>
        ) : (
          <Text className="text-xs italic text-muted-foreground">never</Text>
        ),
    },
    ...(renderActions
      ? [
          {
            key: "actions",
            header: "",
            cell: (row: UserListItem) => renderActions(row),
          } satisfies DataTableColumn<UserListItem>,
        ]
      : []),
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      emptyState={
        <EmptyState
          icon={Users}
          title="No users yet"
          description="Add the first user to get started."
        />
      }
    />
  );
}
