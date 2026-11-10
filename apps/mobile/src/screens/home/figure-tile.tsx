/**
 * Standing figures (students, alumni, seasons) as a grid of tiles: a number
 * with an icon and what it counts, opening its list. Neutral on purpose:
 * unlike a CountTile, nothing here is waiting on anyone.
 */
import type { LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";

import { iconWithClassName } from "../../design/lib/icon";
import { usePressDim } from "../../design/motion";
import { Text } from "../../design/ui/text";

export type FigureTileProps = {
  label: string;
  value: string;
  icon: LucideIcon;
  onPress?: () => void;
};

export function FigureTile({ label, value, icon: Icon, onPress }: FigureTileProps) {
  const press = usePressDim();
  iconWithClassName(Icon);
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${label}: ${value}`}
      disabled={!onPress}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      className="min-w-[140px] flex-1 basis-[45%]"
    >
      <Animated.View style={press.animatedStyle}>
        <View className="min-h-[96px] justify-between gap-2 rounded-group bg-surface p-4">
          <View className="flex-row items-start justify-between gap-2">
            <Text variant="title" tabular numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {value}
            </Text>
            <View className="size-8 items-center justify-center rounded-full bg-info-soft">
              <Icon size={16} className="text-info" />
            </View>
          </View>
          <Text variant="subhead" numberOfLines={2} className="text-muted-foreground">
            {label}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export function FigureGrid({ tiles }: { tiles: FigureTileProps[] }) {
  return (
    <View testID="figure-grid" className="flex-row flex-wrap gap-3">
      {tiles.map((t) => (
        <FigureTile key={t.label} {...t} />
      ))}
    </View>
  );
}
