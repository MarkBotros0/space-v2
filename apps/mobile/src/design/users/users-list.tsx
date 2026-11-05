/**
 * Port of v1 src/components/users/users-list.tsx as grouped rows: avatar,
 * name (or the email when there is no name) over email, role and last login,
 * the derived status as a chip, and a chevron to the edit page. `renderActions`
 * is v2-only: the row-level invite button, under the row.
 */
import type { ReactNode } from "react";
import { View } from "react-native";
import { userStatusSchema, type UserListItem, type UserStatus } from "@space/shared";

import { formatDate } from "../../lib/format";
import { initialsOf } from "../../lib/initials";
import { joinMeta } from "../../lib/join-meta";
import { USER_ROLE_LABELS } from "../../lib/user-role-labels";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { GroupedList, ListRow } from "../ui/grouped-list";
import { StatusChip, statusChip } from "../ui/status-chip";

/** "No invite" is what users see for `pending`; the shared table says "Pending". Call site only. */
export function userStatusChip(status: UserStatus) {
  const spec = statusChip("user", status);
  return status === "pending" ? { ...spec, label: "No invite" } : spec;
}

/** A `status` route param, or undefined when it names nothing we filter by. */
export function parseUserStatus(value: unknown): UserStatus | undefined {
  const parsed = userStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/**
 * The email on its own line (it never shares a line with the role, so a wrap can't
 * strand a "·" or split the address), then role and last login joined by joinMeta.
 */
function rowSubtitle(row: UserListItem): string {
  const meta = joinMeta([
    USER_ROLE_LABELS[row.role],
    row.lastLoginAt ? `Last login ${formatDate(row.lastLoginAt)}` : "Never signed in",
  ]);
  return row.name ? `${row.email}\n${meta}` : meta;
}

export function UsersList({
  rows,
  onOpen,
  renderActions,
}: {
  rows: UserListItem[];
  onOpen: (row: UserListItem) => void;
  renderActions?: (row: UserListItem) => ReactNode;
}) {
  return (
    <GroupedList>
      {rows.map((row, i) => {
        const actions = renderActions?.(row);
        return (
          <View key={row.id}>
            <ListRow
              index={i}
              title={row.name || row.email}
              subtitle={rowSubtitle(row)}
              titleLines={2}
              subtitleLines={4}
              leading={
                <Avatar size="sm">
                  <AvatarFallback>
                    {initialsOf(row.name, row.email[0]?.toUpperCase() ?? "?")}
                  </AvatarFallback>
                </Avatar>
              }
              trailing={<StatusChip {...userStatusChip(row.status)} />}
              chevron
              onPress={() => onOpen(row)}
            />
            {actions ? <View className="items-start px-4 pb-3">{actions}</View> : null}
          </View>
        );
      })}
    </GroupedList>
  );
}
