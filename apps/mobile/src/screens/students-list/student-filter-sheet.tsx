import { Check } from "lucide-react-native";
import type { StudentListSort } from "@space/shared";

import { iconWithClassName } from "../../design/lib/icon";
import { GroupedList, ListRow, SegmentedControl, Sheet, SheetSaveBar } from "../../design/ui";
import { useAllGroups } from "../../hooks/use-groups";
import type { StudentListView } from "../../hooks/use-students";

iconWithClassName(Check);

const SORTS: { value: StudentListSort; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "university", label: "University" },
  { value: "season", label: "Season" },
  { value: "group", label: "Group" },
];

/** How many filters are in force: a group, a sort. */
export function activeFilterCount(view: StudentListView): number {
  return (view.groupId !== null ? 1 : 0) + (view.sort !== null ? 1 : 0);
}

const tick = (on: boolean) => ({
  trailing: on ? <Check size={18} className="text-primary" /> : undefined,
  trailingLabel: on ? "Selected" : "",
});

/**
 * v1's group select, sort select and direction toggle, as a sheet. Each pick
 * applies at once (the list is server-side, REG-82), so "Done" only closes it.
 */
export function StudentFilterSheet({
  open,
  onClose,
  view,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  view: StudentListView;
  onChange: (view: StudentListView) => void;
}) {
  const { groups } = useAllGroups(open);
  const groupOptions: { id: number | "none" | null; label: string }[] = [
    { id: null, label: "All groups" },
    { id: "none", label: "Unassigned" },
    ...groups.map((g) => ({ id: g.id, label: `${g.name} · ${g.seasonTitle}` })),
  ];
  const sort = view.sort ?? "name";
  return (
    <Sheet open={open} onClose={onClose} title="Filter students" footer={<SheetSaveBar label="Done" onPress={onClose} />}>
      <GroupedList header="Group">
        {groupOptions.map((o) => (
          <ListRow
            key={String(o.id)}
            title={o.label}
            {...tick(view.groupId === o.id)}
            onPress={() => onChange({ ...view, groupId: o.id })}
          />
        ))}
      </GroupedList>
      <GroupedList header="Sort by" className="mt-4">
        {SORTS.map((o) => (
          <ListRow
            key={o.value}
            title={o.label}
            {...tick(sort === o.value)}
            onPress={() => onChange({ ...view, sort: o.value })}
          />
        ))}
      </GroupedList>
      <SegmentedControl
        className="mt-4"
        options={[
          { value: "asc", label: "A to Z" },
          { value: "desc", label: "Z to A" },
        ]}
        value={view.dir}
        onChange={(dir) => onChange({ ...view, sort, dir: dir === "desc" ? "desc" : "asc" })}
      />
    </Sheet>
  );
}
