/**
 * What is waiting, as a grid of coloured tiles: a big number, what it counts,
 * and the tile opens the list behind it (owner, 2026-11-07: Home was a stack
 * of plain rows; make it clear and vivid, not boring). A zero reads "All
 * clear" in green, so a quiet day looks like one. The colour is never the only
 * signal: the label and the count say the same in words.
 */
import { CircleCheck, type LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";

import { cn } from "../lib/cn";
import { iconWithClassName } from "../lib/icon";
import { usePressDim } from "../motion";
import { Text } from "../ui/text";

iconWithClassName(CircleCheck);

export type CountTone = "warn" | "bad" | "info";

const TONE: Record<CountTone | "ok", { box: string; icon: string }> = {
  warn: { box: "bg-warn-soft", icon: "text-warn" },
  bad: { box: "bg-bad-soft", icon: "text-bad" },
  info: { box: "bg-info-soft", icon: "text-info" },
  ok: { box: "bg-ok-soft", icon: "text-ok" },
};

export type CountTileProps = {
  /** "Submissions to review" — what the number counts. */
  label: string;
  value: number;
  icon: LucideIcon;
  /** The colour while there is something waiting; zero is always green. */
  tone: CountTone;
  onPress?: () => void;
};

export function CountTile({ label, value, icon, tone, onPress }: CountTileProps) {
  const press = usePressDim();
  const clear = value === 0;
  const t = TONE[clear ? "ok" : tone];
  const Icon = clear ? CircleCheck : icon;
  iconWithClassName(Icon);
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${label}: ${clear ? "none, all clear" : value}`}
      disabled={!onPress}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      className="min-w-[140px] flex-1 basis-[45%]"
    >
      <Animated.View style={press.animatedStyle}>
        <View className={cn("min-h-[104px] justify-between gap-2 rounded-group p-4", t.box)}>
          <View className="flex-row items-start justify-between gap-2">
            <Text variant="largeTitle" tabular numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {String(value)}
            </Text>
            <Icon size={20} className={t.icon} />
          </View>
          <Text variant="subhead" numberOfLines={2} className="font-semibold text-foreground">
            {clear ? `${label} · All clear` : label}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export function CountGrid({ tiles }: { tiles: CountTileProps[] }) {
  return (
    <View testID="count-grid" className="flex-row flex-wrap gap-3">
      {tiles.map((t) => (
        <CountTile key={t.label} {...t} />
      ))}
    </View>
  );
}
