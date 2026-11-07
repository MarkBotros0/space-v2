/**
 * A few named people who need a look (students at risk, not checked in), with
 * their initials and why, and See all for the rest. Short on purpose: Home
 * points at the list, it isn't the list.
 */
import { View } from "react-native";

import { initialsOf } from "../../lib/initials";
import { GroupedList, ListRow } from "../ui/grouped-list";
import { Text } from "../ui/text";

export type PreviewPerson = { id: number; name: string; reason?: string };

function Initials({ name }: { name: string }) {
  return (
    <View className="size-9 items-center justify-center rounded-full bg-bad-soft">
      <Text variant="caption" className="font-semibold text-bad">
        {initialsOf(name, "?")}
      </Text>
    </View>
  );
}

export function PeoplePreview({
  header,
  people,
  total,
  onOpen,
  onSeeAll,
}: {
  header: string;
  people: PreviewPerson[];
  /** How many there are in all; See all shows when it is more than the rows. */
  total: number;
  onOpen: (id: number) => void;
  onSeeAll?: () => void;
}) {
  if (people.length === 0) return null;
  return (
    <GroupedList
      header={header}
      headerAction={
        onSeeAll && total > people.length
          ? { label: `See all ${total}`, onPress: onSeeAll }
          : undefined
      }
    >
      {people.map((p) => (
        <ListRow
          key={p.id}
          title={p.name}
          titleLines={2}
          subtitle={p.reason}
          leading={<Initials name={p.name} />}
          chevron
          onPress={() => onOpen(p.id)}
        />
      ))}
    </GroupedList>
  );
}
