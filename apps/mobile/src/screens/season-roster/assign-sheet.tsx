import { useEffect, useState } from "react";
import { Check } from "lucide-react-native";
import type { SeasonRosterRow } from "@space/shared";

import { iconWithClassName } from "../../design/lib/icon";
import { GroupedList, ListRow, Sheet, SheetSaveBar } from "../../design/ui";

iconWithClassName(Check);

export const ROSTER_UNASSIGNED_LABEL = "Unassigned";

type Group = { id: number; name: string };

/**
 * One student's group, as a bottom sheet: the season's groups as selectable
 * rows and a pinned Save. The page sends it through the roster's own
 * assignments write, so a student whose group did not change sends nothing
 * (v1 R100).
 */
export function AssignSheet({
  student,
  groups,
  saving,
  onClose,
  onSave,
}: {
  student: SeasonRosterRow | null;
  groups: Group[];
  saving: boolean;
  onClose: () => void;
  onSave: (groupId: number | null) => void;
}) {
  const [choice, setChoice] = useState<number | null>(null);
  const studentId = student?.userId;
  const current = student?.groupId ?? null;
  useEffect(() => {
    setChoice(current);
  }, [studentId, current]);

  const options: { id: number | null; name: string }[] = [
    { id: null, name: ROSTER_UNASSIGNED_LABEL },
    ...groups,
  ];
  const changed = choice !== current;
  return (
    <Sheet
      open={student !== null}
      onClose={onClose}
      title={student ? `Group for ${student.name ?? student.email}` : undefined}
      footer={
        <SheetSaveBar
          label={changed ? "Save" : "No change"}
          loading={saving}
          onPress={() => {
            if (changed) onSave(choice);
            else onClose();
          }}
        />
      }
    >
      <GroupedList>
        {options.map((o) => (
          <ListRow
            key={o.id ?? "none"}
            title={o.name}
            trailing={choice === o.id ? <Check size={18} className="text-primary" /> : undefined}
            trailingLabel={choice === o.id ? "Selected" : ""}
            onPress={() => setChoice(o.id)}
          />
        ))}
      </GroupedList>
    </Sheet>
  );
}
