/**
 * The People card's Students level (owner, 2026-11-07): who is in the season,
 * in words, and the two ways in, named the same everywhere: Select from
 * community (people who already have an account) and Invite new (someone who
 * has never signed in). On a draft, the suggestion to bring in everyone who
 * passed the season this one follows.
 */
import { UserPlus, Users } from "lucide-react-native";
import { View } from "react-native";

import { iconWithClassName } from "../lib/icon";
import { Button } from "../ui/button";
import { Text } from "../ui/text";
import { LevelHeader } from "./level-header";
import { people } from "../../lib/plural";

iconWithClassName(UserPlus, Users);

export type StudentsSuggestion = { title: string; count: number; onAdd: () => void };

/** `Nobody is in GBV 2026 yet.` / `3 people are in GBV 2026. 1 isn't in a group yet.` */
export function studentsSummary(seasonTitle: string, count: number, ungrouped: number, groups: number): string {
  if (count === 0) return `Nobody is in ${seasonTitle} yet.`;
  const lead = `${people(count)} ${count === 1 ? "is" : "are"} in ${seasonTitle}.`;
  if (groups === 0) return lead;
  if (ungrouped === 0) return `${lead} ${count === 1 ? "They're" : "All are"} in a group.`;
  if (ungrouped === count) return `${lead} Nobody is in a group yet.`;
  return `${lead} ${ungrouped === 1 ? "1 isn't" : `${ungrouped} aren't`} in a group yet.`;
}

export function StudentsLevel({
  seasonTitle,
  count,
  ungrouped,
  groups,
  onSelectFromCommunity,
  onInviteNew,
  suggestion,
}: {
  seasonTitle: string;
  count: number;
  ungrouped: number;
  groups: number;
  /** Absent when the viewer can't add people, or the season has finished. */
  onSelectFromCommunity?: () => void;
  onInviteNew?: () => void;
  suggestion?: StudentsSuggestion | null;
}) {
  return (
    <View className="flex-col gap-3">
      <LevelHeader icon={Users} title={`Students (${count})`} />
      <View className="ml-12 flex-col gap-3">
        <Text variant="subhead" className="text-muted-foreground">
          {studentsSummary(seasonTitle, count, ungrouped, groups)}
        </Text>
        {suggestion ? (
          <View testID="students-suggestion" className="flex-col gap-2 rounded-control bg-info-soft p-3">
            <Text variant="subhead" className="font-semibold text-foreground">
              {`${people(suggestion.count)} passed ${suggestion.title}.`}
            </Text>
            <Text variant="subhead" className="text-foreground">
              Most seasons start with everyone who passed the last one.
            </Text>
            <Button size="sm" className="self-start" onPress={suggestion.onAdd}>
              {suggestion.count === 1 ? "Add the 1 who passed" : `Add the ${suggestion.count} who passed`}
            </Button>
          </View>
        ) : null}
      </View>
      {onSelectFromCommunity || onInviteNew ? (
        <View className="flex-col gap-2">
          <View className="flex-row flex-wrap gap-2">
            {onSelectFromCommunity ? (
              <Button variant="secondary" className="min-w-[140px] flex-1" onPress={onSelectFromCommunity}>
                <Users size={16} className="text-foreground" />
                Community
              </Button>
            ) : null}
            {onInviteNew ? (
              <Button variant="secondary" className="min-w-[140px] flex-1" onPress={onInviteNew}>
                <UserPlus size={16} className="text-foreground" />
                Invite new
              </Button>
            ) : null}
          </View>
          <Text variant="caption" className="text-muted-foreground">
            Community: people who already have an account. Invite new: someone who has never signed in. They get an
            email.
          </Text>
        </View>
      ) : null}
    </View>
  );
}
