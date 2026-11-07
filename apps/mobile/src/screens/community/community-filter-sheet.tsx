import { Check } from "lucide-react-native";
import type { UserRole, UserStatus } from "@space/shared";

import { iconWithClassName } from "../../design/lib/icon";
import { GroupedList, ListRow, Sheet, SheetSaveBar } from "../../design/ui";

iconWithClassName(Check);

/** Who: everyone, or one role (a season role is derived from live seats, server-side). */
export const COMMUNITY_ROLES: { role: UserRole | undefined; label: string }[] = [
  { role: undefined, label: "Everyone" },
  { role: "STUDENT", label: "Students" },
  { role: "LEADER", label: "Leaders" },
  { role: "ADMIN", label: "Admins" },
  { role: "MENTOR", label: "Mentors" },
  { role: "SUPER", label: "Supers" },
];

/** Where their account stands. */
export const COMMUNITY_STATUSES: { status: UserStatus | undefined; label: string }[] = [
  { status: undefined, label: "Any" },
  { status: "active", label: "Active" },
  { status: "invited", label: "Invited" },
  { status: "pending", label: "No invite yet" },
  { status: "inactive", label: "Inactive" },
];

export interface CommunityFilters {
  role: UserRole | undefined;
  status: UserStatus | undefined;
}

export function communityFilterCount(f: CommunityFilters): number {
  return (f.role !== undefined ? 1 : 0) + (f.status !== undefined ? 1 : 0);
}

const tick = (on: boolean) => ({
  trailing: on ? <Check size={18} className="text-primary" /> : undefined,
  trailingLabel: on ? "Selected" : "",
});

/** The Community tab's filters, as a sheet. Each pick applies at once; Done closes it. */
export function CommunityFilterSheet({
  open,
  onClose,
  filters,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  filters: CommunityFilters;
  onChange: (next: CommunityFilters) => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filter the community"
      footer={<SheetSaveBar label="Done" onPress={onClose} />}
    >
      <GroupedList header="Role" className="mb-4">
        {COMMUNITY_ROLES.map((r) => (
          <ListRow
            key={r.label}
            title={r.label}
            {...tick(filters.role === r.role)}
            onPress={() => onChange({ ...filters, role: r.role })}
          />
        ))}
      </GroupedList>
      <GroupedList header="Account">
        {COMMUNITY_STATUSES.map((s) => (
          <ListRow
            key={s.label}
            title={s.label}
            {...tick(filters.status === s.status)}
            onPress={() => onChange({ ...filters, status: s.status })}
          />
        ))}
      </GroupedList>
    </Sheet>
  );
}
