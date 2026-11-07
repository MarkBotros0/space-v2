import { View } from "react-native";

import { Switch, Text } from "../../design/ui";

export const COMMUNITY_WIDE_DESCRIPTION =
  "Everyone can take part as a student, alumni too. It runs alone: no other season can be active.";

/**
 * SUPER's community-wide switch. Settled while the season is a draft; once it has
 * started the answer is written out, since the switch can no longer move.
 */
export function CommunityWideField({
  value,
  editable,
  onChange,
}: {
  value: boolean;
  editable: boolean;
  onChange: (next: boolean) => void;
}) {
  if (!editable) {
    return (
      <View className="flex-col gap-1">
        <Text className="text-sm font-semibold text-foreground">Community-wide season</Text>
        <Text variant="body" className="text-foreground">
          {value ? "Yes" : "No"}. It can&apos;t change now the season has started.
        </Text>
      </View>
    );
  }
  return (
    <View className="flex-col gap-1">
      <View className="flex-row items-center gap-3">
        <Text className="min-w-0 flex-1 text-sm font-semibold text-foreground" onPress={() => onChange(!value)}>
          Community-wide season
        </Text>
        <Switch accessibilityLabel="Community-wide season" checked={value} onCheckedChange={onChange} />
      </View>
      <Text variant="subhead" className="text-muted-foreground">
        {COMMUNITY_WIDE_DESCRIPTION}
      </Text>
    </View>
  );
}
