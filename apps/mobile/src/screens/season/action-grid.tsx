/**
 * A season's actions as a two-column grid of tiles, icon over label: what an
 * admin does to a season reads at a glance, instead of a long list of rows
 * (owner, 2026-11-07). Tiles dim on press; nothing moves.
 */
import type { LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";

import { iconWithClassName } from "../../design/lib/icon";
import { usePressDim } from "../../design/motion";
import { Text } from "../../design/ui/text";

export type SeasonAction = {
  label: string;
  /** A few words under the label, e.g. "Place students in groups". */
  hint?: string;
  icon: LucideIcon;
  onPress: () => void;
};

function ActionTile({ action }: { action: SeasonAction }) {
  const press = usePressDim();
  const Icon = action.icon;
  iconWithClassName(Icon);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      accessibilityHint={action.hint}
      onPress={action.onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      className="min-w-[140px] flex-1 basis-[45%]"
    >
      <Animated.View style={press.animatedStyle}>
        <View className="min-h-[92px] flex-col gap-2 rounded-group bg-surface p-4">
          <View className="size-9 items-center justify-center rounded-full bg-info-soft">
            <Icon size={18} className="text-info" />
          </View>
          <View className="flex-col">
            <Text variant="headline" numberOfLines={2}>
              {action.label}
            </Text>
            {action.hint ? (
              <Text variant="caption" numberOfLines={2} className="text-muted-foreground">
                {action.hint}
              </Text>
            ) : null}
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export function ActionGrid({ actions }: { actions: SeasonAction[] }) {
  if (actions.length === 0) return null;
  return (
    <View testID="season-actions" className="flex-row flex-wrap gap-3">
      {actions.map((a) => (
        <ActionTile key={a.label} action={a} />
      ))}
    </View>
  );
}
