import { View } from "react-native";
import type { MySeason } from "@space/shared";

import { NavIcon } from "../../design/icons/nav-icon";
import { Text } from "../../design/ui";
import { ListSectionHeader } from "../../design/ui/grouped-list";
import { PersonPill } from "../../design/ui/person-pill";
import { initialsOf } from "../../lib/initials";

type Group = NonNullable<MySeason["group"]>;

function Label({ children }: { children: string }) {
  return (
    <Text variant="caption" className="font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </Text>
  );
}

/**
 * The student's group as one card (owner, 2026-11-07: not the group and its
 * leader as list rows): the name and description, who leads it, and the members,
 * each as a pill.
 */
export function GroupSection({ group }: { group: Group }) {
  return (
    <View>
      <ListSectionHeader>Your group</ListSectionHeader>
      <View testID="group-card" className="flex-col gap-4 rounded-group bg-surface p-4">
        <View className="flex-row items-center gap-3">
          <View className="size-11 shrink-0 items-center justify-center rounded-full bg-brand-navy-100 dark:bg-brand-navy-900">
            <NavIcon name="groups" size={20} className="text-brand-navy-800 dark:text-brand-navy-100" />
          </View>
          <View className="min-w-0 flex-1">
            <Text variant="headline" numberOfLines={2}>
              {group.name}
            </Text>
            {group.description ? (
              <Text variant="subhead" numberOfLines={4} className="text-muted-foreground">
                {group.description}
              </Text>
            ) : null}
          </View>
        </View>
        <View className="flex-col gap-2">
          <Label>{group.leaders.length > 1 ? "Leaders" : "Leader"}</Label>
          {group.leaders.length === 0 ? (
            <Text variant="subhead" className="text-muted-foreground">
              No leaders assigned yet.
            </Text>
          ) : (
            <View className="flex-row flex-wrap gap-1.5">
              {group.leaders.map((leader) => (
                <PersonPill
                  key={leader.id}
                  name={leader.name}
                  initials={initialsOf(leader.name, leader.email.charAt(0).toUpperCase() || "?")}
                />
              ))}
            </View>
          )}
        </View>
        <View className="h-px bg-separator" />
        <View className="flex-col gap-2">
          <Label>{`Members (${group.members.length})`}</Label>
          <View className="flex-row flex-wrap gap-1.5">
            {group.members.map((member) => (
              <PersonPill
                key={member.id}
                name={member.isYou ? "You" : (member.name ?? "—")}
                initials={initialsOf(member.name, "?")}
                you={member.isYou}
              />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}
