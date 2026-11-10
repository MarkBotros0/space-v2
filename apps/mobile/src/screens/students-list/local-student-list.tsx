/**
 * Every list of students in the app (owner, 2026-11-07): a search field over
 * the names, the rows shown a page at a time with "Show more", and, when the
 * rows carry a group, a header per group. The caller says what a row opens
 * and what sits at its end (a status, an Edit button). Searching and paging
 * are on the phone: these lists are one season's people, which the server
 * already sends whole.
 */
import { type ReactNode, useMemo, useState } from "react";
import { View } from "react-native";

import { initialsOf } from "../../lib/initials";
import { NAV_ICONS } from "../../design/icons/nav-icon";
import { EmptyState } from "../../design/ui/empty-state";
import { GroupedList, ListRow } from "../../design/ui/grouped-list";
import { PillButton } from "../../design/ui/pill-button";
import { SearchField } from "../../design/ui/search-field";
import { Text } from "../../design/ui/text";

/** How many rows show before "Show more", and how many each press adds. */
const STUDENT_PAGE = 20;

type LocalStudentRow = {
  id: number | string;
  name: string;
  /** Rows with a group are listed under it, groups in name order. */
  group?: string | null;
  subtitle?: string;
};

function Initials({ name }: { name: string }) {
  return (
    <View className="size-9 items-center justify-center rounded-full bg-neutral-soft">
      <Text variant="caption" className="font-semibold text-foreground">
        {initialsOf(name, "?")}
      </Text>
    </View>
  );
}

/** Lower-case, accent- and space-insensitive: "Mína  Adel" matches "mina a". */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export function LocalStudentList<T extends LocalStudentRow>({
  items,
  onPress,
  trailing,
  trailingLabel,
  header,
  emptyTitle = "No students",
  emptyDescription,
  searchPlaceholder = "Search students",
  pageSize = STUDENT_PAGE,
}: {
  items: T[];
  onPress?: (item: T) => void;
  trailing?: (item: T) => ReactNode;
  /** What the trailing slot says, for screen readers, when it isn't a chip. */
  trailingLabel?: (item: T) => string | undefined;
  /** A header over the whole list when the rows have no groups. */
  header?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  searchPlaceholder?: string;
  pageSize?: number;
}) {
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(pageSize);
  const matches = useMemo(() => {
    const q = fold(query);
    const sorted = [...items].sort(
      (a, b) => (a.group ?? "").localeCompare(b.group ?? "") || a.name.localeCompare(b.name),
    );
    return q ? sorted.filter((i) => fold(i.name).includes(q)) : sorted;
  }, [items, query]);
  const page = matches.slice(0, shown);
  const grouped = items.some((i) => i.group);
  const sections: { title: string | undefined; rows: T[] }[] = [];
  for (const row of page) {
    const title = grouped ? (row.group ?? "No group") : header;
    const last = sections[sections.length - 1];
    if (last && last.title === title) last.rows.push(row);
    else sections.push({ title, rows: [row] });
  }

  if (items.length === 0) {
    return <EmptyState icon={NAV_ICONS.students} title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <View testID="student-list" className="flex-col gap-4">
      {items.length > 5 ? (
        <SearchField
          value={query}
          onChangeText={(t) => {
            setQuery(t);
            setShown(pageSize);
          }}
          placeholder={searchPlaceholder}
        />
      ) : null}
      {matches.length === 0 ? (
        <Text variant="subhead" className="px-1 text-muted-foreground">
          No student matches "{query.trim()}".
        </Text>
      ) : (
        sections.map((section, i) => (
          <GroupedList key={`${section.title ?? ""}-${i}`} header={section.title}>
            {section.rows.map((item) => (
              <ListRow
                key={item.id}
                title={item.name}
                titleLines={2}
                subtitle={item.subtitle}
                leading={<Initials name={item.name} />}
                trailing={trailing?.(item)}
                trailingLabel={trailingLabel?.(item)}
                chevron={!!onPress}
                onPress={onPress ? () => onPress(item) : undefined}
              />
            ))}
          </GroupedList>
        ))
      )}
      {matches.length > shown ? (
        <View className="flex-row items-center justify-between gap-2 px-1">
          <Text variant="caption" className="text-muted-foreground">
            {`Showing ${shown} of ${matches.length}`}
          </Text>
          <PillButton label="Show more" onPress={() => setShown((n) => n + pageSize)} />
        </View>
      ) : null}
    </View>
  );
}
