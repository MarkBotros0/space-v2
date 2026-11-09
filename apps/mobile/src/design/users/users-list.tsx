/**
 * Port of v1 src/components/users/users-list.tsx as grouped rows: avatar,
 * name (or the email when there is no name) over email, role and last login,
 * the derived status as a chip, and a chevron to the edit page. `renderAction`
 * is v2-only: the row's one light action (Invite / Resend), a pill on the right
 * (owner, 2026-11-08: the big button under every row made the list twice as
 * tall). It sits beside the row, not inside it, so a screen reader reaches it
 * as its own button; the chip moves under the meta line and is read with the row.
 */
import type { ReactNode } from "react";
import { View } from "react-native";
import { userStatusSchema, type UserListItem, type UserStatus } from "@space/shared";

import { formatDate, keepTogether } from "../../lib/format";
import { initialsOf } from "../../lib/initials";
import { joinMeta } from "../../lib/join-meta";
import { USER_ROLE_LABELS } from "../../lib/user-role-labels";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { GroupedList, ListRow } from "../ui/grouped-list";
import { StatusChip, statusChip } from "../ui/status-chip";

/** "No invite" is what users see for `pending`; the shared table says "Pending". Call site only. */
function userStatusChip(status: UserStatus) {
  const spec = statusChip("user", status);
  return status === "pending" ? { ...spec, label: "No invite" } : spec;
}

/** A `status` route param, or undefined when it names nothing we filter by. */
export function parseUserStatus(value: unknown): UserStatus | undefined {
  const parsed = userStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** Role and last login; the date stays whole when the line wraps, the rest may wrap. */
function rowMeta(row: UserListItem): string {
  return joinMeta([
    USER_ROLE_LABELS[row.role],
    row.lastLoginAt ? `Last login ${keepTogether(formatDate(row.lastLoginAt))}` : "Never signed in",
  ]);
}

export function UsersList({
  rows,
  onOpen,
  renderAction,
}: {
  rows: UserListItem[];
  onOpen: (row: UserListItem) => void;
  renderAction?: (row: UserListItem) => ReactNode;
}) {
  return (
    <GroupedList>
      {rows.map((row) => {
        const action = renderAction?.(row);
        const chip = userStatusChip(row.status);
        return (
          <View key={row.id} className="flex-row items-center">
            <View className="min-w-0 flex-1">
              <ListRow
                title={row.name || row.email}
                detail={row.name ? row.email : undefined}
                subtitle={rowMeta(row)}
                titleLines={2}
                subtitleLines={3}
                leading={
                  <Avatar size="sm">
                    <AvatarFallback>{initialsOf(row.name, row.email[0]?.toUpperCase() ?? "?")}</AvatarFallback>
                  </Avatar>
                }
                footer={<StatusChip {...chip} />}
                trailingLabel={chip.label}
                chevron={!action}
                className={action ? "pr-2" : undefined}
                onPress={() => onOpen(row)}
              />
            </View>
            {action ? <View className="shrink-0 pr-4">{action}</View> : null}
          </View>
        );
      })}
    </GroupedList>
  );
}
