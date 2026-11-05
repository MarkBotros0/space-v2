import { Linking, View } from "react-native";
import type { MySeason } from "@space/shared";

import { NavIcon } from "../../design/icons/nav-icon";
import { cn } from "../../design/lib/cn";
import { GroupedList, ListRow, Text } from "../../design/ui";
import { ListSectionHeader } from "../../design/ui/grouped-list";
import { initialsOf } from "../../lib/initials";

function Initials({ text }: { text: string }) {
  return (
    <View className="size-9 items-center justify-center rounded-full bg-brand-navy-100 dark:bg-brand-navy-900">
      <Text
        variant="caption"
        maxFontSizeMultiplier={1.15}
        className="font-bold text-brand-navy-800 dark:text-brand-navy-100"
      >
        {text}
      </Text>
    </View>
  );
}

function Members({ members }: { members: NonNullable<MySeason["group"]>["members"] }) {
  return (
    <View className="mt-3">
      <ListSectionHeader>{`Members (${members.length})`}</ListSectionHeader>
      <View className="flex-row flex-wrap gap-1.5 px-4">
        {members.map((member) => (
          <View
            key={member.id}
            className={cn(
              "flex-row items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5",
              member.isYou
                ? "border border-brand-teal-300 bg-brand-teal-100 dark:border-brand-teal-900 dark:bg-brand-teal-950"
                : "bg-muted/60",
            )}
          >
            <View className="size-6 items-center justify-center rounded-full bg-card">
              <Text
                maxFontSizeMultiplier={1.15}
                variant="caption"
                className="font-bold text-brand-navy-800 dark:text-brand-navy-100"
              >
                {initialsOf(member.name, "?")}
              </Text>
            </View>
            <Text
              variant="caption"
              numberOfLines={1}
              className={cn(
                "max-w-32 font-medium",
                member.isYou ? "text-brand-teal-800 dark:text-brand-teal-200" : "text-foreground",
              )}
            >
              {member.isYou ? "You" : (member.name ?? "—")}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** The student's group: its name and description, its leaders (email opens mail), the member chips. */
export function GroupSection({ group }: { group: NonNullable<MySeason["group"]> }) {
  return (
    <View>
      <GroupedList header="Your group">
        <ListRow
          title={group.name}
          subtitle={group.description ?? undefined}
          subtitleLines={4}
          leading={
            <View className="size-9 items-center justify-center rounded-full bg-brand-navy-100 dark:bg-brand-navy-900">
              <NavIcon name="groups" size={16} className="text-brand-navy-800 dark:text-brand-navy-100" />
            </View>
          }
        />
        {group.leaders.length === 0 ? (
          <View className="min-h-[52px] justify-center px-4 py-2">
            <Text variant="subhead" className="italic text-muted-foreground">
              No leaders assigned yet.
            </Text>
          </View>
        ) : (
          group.leaders.map((leader) => (
            <ListRow
              key={leader.id}
              title={leader.name}
              subtitle={leader.email}
              leading={<Initials text={initialsOf(leader.name, leader.email.charAt(0).toUpperCase() || "?")} />}
              trailing={
                <Text variant="caption" className="text-muted-foreground">
                  Leader
                </Text>
              }
              trailingLabel="Leader"
              onPress={() => void Linking.openURL(`mailto:${leader.email}`)}
            />
          ))
        )}
      </GroupedList>
      <Members members={group.members} />
    </View>
  );
}
