import { Check } from "lucide-react-native";
import type { StudentListSort, StudentListStatus } from "@space/shared";

import { iconWithClassName } from "../../design/lib/icon";
import { GroupedList, ListRow, SegmentedControl, Sheet, SheetSaveBar } from "../../design/ui";
import { useAllGroups, useSeasonGroups } from "../../hooks/use-groups";
import { useSeasons } from "../../hooks/use-seasons";
import type { StudentListView } from "../../hooks/use-students";

iconWithClassName(Check);

const SORTS: { value: StudentListSort; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "university", label: "University" },
  { value: "season", label: "Season" },
  { value: "group", label: "Group" },
];

/** The mentor sorts by what isn't season-shaped (owner, 2026-11-07). */
const MENTOR_SORTS = SORTS.filter((o) => o.value === "name" || o.value === "university");

/** How many filters are in force: a season, a group, a sort, Absent lately. */
export function activeFilterCount(view: StudentListView): number {
  return (
    (view.seasonId !== null ? 1 : 0) +
    (view.groupId !== null ? 1 : 0) +
    (view.sort !== null ? 1 : 0) +
    (view.absentLately ? 1 : 0)
  );
}

const SHOW_LABEL: Record<StudentListStatus, string> = {
  active: "Students",
  alumni: "Alumni",
  dropped: "Dropped",
};

const SEASON_STATUS = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
} as const;

const tick = (on: boolean) => ({
  trailing: on ? <Check size={18} className="text-primary" /> : undefined,
  trailingLabel: on ? "Selected" : "",
});

/**
 * v1's group select, sort select and direction toggle, as a sheet. Each pick
 * applies at once (the list is server-side, REG-82), so "Done" only closes it.
 * With `bySeason` (a Super, owner 2026-11-07) a Season section comes first, and
 * groups are offered only once a season is picked: that season's own. With
 * `mentor` (owner, 2026-11-07) nothing season-shaped: no groups, sorted by name
 * or university, and a Who section with Absent lately.
 */
export function StudentFilterSheet({
  open,
  onClose,
  view,
  onChange,
  bySeason = false,
  mentor = false,
  show,
}: {
  open: boolean;
  onClose: () => void;
  view: StudentListView;
  onChange: (view: StudentListView) => void;
  bySeason?: boolean;
  mentor?: boolean;
  /** Who the list shows: students, alumni or dropped (each the caller may read). */
  show?: {
    value: StudentListStatus;
    options: StudentListStatus[];
    onChange: (next: StudentListStatus) => void;
  };
}) {
  // Season, group and sort narrow the students list; alumni and dropped have their own order.
  const narrowing = show === undefined || show.value === "active";
  const { groups } = useAllGroups(open && !bySeason);
  const seasons = useSeasons(open && bySeason);
  const seasonGroups = useSeasonGroups(bySeason && open ? view.seasonId : null);
  const groupOptions: { id: number | "none" | null; label: string }[] = bySeason
    ? [
        { id: null, label: "All groups" },
        ...(seasonGroups.data ?? []).map((g) => ({ id: g.id, label: g.name })),
      ]
    : [
        { id: null, label: "All groups" },
        { id: "none", label: "Unassigned" },
        ...groups.map((g) => ({ id: g.id, label: `${g.name} · ${g.seasonTitle}` })),
      ];
  const showGroups = narrowing && !mentor && (!bySeason || view.seasonId !== null);
  const sorts = mentor ? MENTOR_SORTS : SORTS;
  const sort = view.sort ?? "name";
  return (
    <Sheet open={open} onClose={onClose} title="Filter" footer={<SheetSaveBar label="Done" onPress={onClose} />}>
      {show && show.options.length > 1 ? (
        <GroupedList header="Show" className="mb-4">
          {show.options.map((o) => (
            <ListRow
              key={o}
              title={SHOW_LABEL[o]}
              {...tick(show.value === o)}
              onPress={() => show.onChange(o)}
            />
          ))}
        </GroupedList>
      ) : null}
      {mentor && narrowing ? (
        <GroupedList header="Who" className="mb-4">
          <ListRow
            title="Everyone"
            {...tick(!view.absentLately)}
            onPress={() => onChange({ ...view, absentLately: false })}
          />
          <ListRow
            title="Absent lately"
            subtitle="Missed their last two sessions"
            {...tick(view.absentLately)}
            onPress={() => onChange({ ...view, absentLately: true })}
          />
        </GroupedList>
      ) : null}
      {bySeason && narrowing ? (
        <GroupedList header="Season" className="mb-4">
          <ListRow
            title="All seasons"
            {...tick(view.seasonId === null)}
            onPress={() => onChange({ ...view, seasonId: null, groupId: null })}
          />
          {(seasons.data ?? []).map((season) => (
            <ListRow
              key={season.id}
              title={season.title}
              subtitle={SEASON_STATUS[season.status]}
              {...tick(view.seasonId === season.id)}
              // A group belongs to one season, so a new season clears it.
              onPress={() => onChange({ ...view, seasonId: season.id, groupId: null })}
            />
          ))}
        </GroupedList>
      ) : null}
      {showGroups ? (
        <GroupedList header="Group" className="mb-4">
          {groupOptions.map((o) => (
            <ListRow
              key={String(o.id)}
              title={o.label}
              {...tick(view.groupId === o.id)}
              onPress={() => onChange({ ...view, groupId: o.id })}
            />
          ))}
        </GroupedList>
      ) : null}
      {narrowing ? (
        <>
          <GroupedList header="Sort by">
            {sorts.map((o) => (
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
        </>
      ) : null}
    </Sheet>
  );
}
