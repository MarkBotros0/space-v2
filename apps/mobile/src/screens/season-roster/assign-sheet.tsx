import { Check } from "lucide-react-native";
import type { SeasonRosterRow } from "@space/shared";

import { iconWithClassName } from "../../design/lib/icon";
import { Button, GroupedList, ListRow, Sheet } from "../../design/ui";

iconWithClassName(Check);

export const ROSTER_UNASSIGNED_LABEL = "Unassigned";

type Group = { id: number; name: string };

/**
 * One student's group, as a bottom sheet: the season's groups as rows.
 * Picking one stages it on the roster (nothing is sent until the page's
 * Save) and closes the sheet. On a draft it also offers "Remove from season". `current` is the staged group, else the saved one.
 */
export function AssignSheet({
  student,
  current,
  groups,
  onClose,
  onPick,
  onRemove,
}: {
  student: SeasonRosterRow | null;
  current: number | null;
  groups: Group[];
  onClose: () => void;
  onPick: (groupId: number | null) => void;
  /** Only a draft season's roster offers it; the caller asks to confirm. */
  onRemove?: () => void;
}) {
  const options: { id: number | null; name: string }[] = [
    { id: null, name: ROSTER_UNASSIGNED_LABEL },
    ...groups,
  ];
  return (
    <Sheet
      open={student !== null}
      onClose={onClose}
      title={student ? `Group for ${student.name ?? student.email}` : undefined}
    >
      <GroupedList>
        {options.map((o) => (
          <ListRow
            key={o.id ?? "none"}
            title={o.name}
            trailing={current === o.id ? <Check size={18} className="text-primary" /> : undefined}
            trailingLabel={current === o.id ? "Selected" : ""}
            onPress={() => onPick(o.id)}
          />
        ))}
      </GroupedList>
      {onRemove ? (
        <Button variant="destructive" className="mt-4 self-start" onPress={onRemove}>
          Remove from season
        </Button>
      ) : null}
    </Sheet>
  );
}
