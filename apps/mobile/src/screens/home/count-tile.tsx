/**
 * What is waiting, as a grid of coloured tiles: a big number, what it counts,
 * and the tile opens the list behind it (owner, 2026-11-07: Home was a stack
 * of plain rows; make it clear and vivid, not boring). The colour is never the
 * only signal: the label and the count say the same in words.
 *
 * `CountGrid` shows only the counts with something in them (owner, 2026-11-09:
 * a zero took as much room as real work, and the green "All clear" tiles were
 * the loudest thing on a quiet Home). When every count is zero it is one quiet
 * "All caught up" row instead. Tones: `info` for ordinary work waiting
 * (submissions, quizzes), `warn` for what is late or due, `bad` for people at
 * risk.
 */
import { CircleCheck, type LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";

import { cn } from "../../design/lib/cn";
import { iconWithClassName } from "../../design/lib/icon";
import { usePressDim } from "../../design/motion";
import { Text } from "../../design/ui/text";

iconWithClassName(CircleCheck);

type CountTone = "warn" | "bad" | "info";

const TONE: Record<CountTone | "ok", { box: string; icon: string }> = {
  warn: { box: "bg-warn-soft", icon: "text-warn" },
  bad: { box: "bg-bad-soft", icon: "text-bad" },
  info: { box: "bg-info-soft", icon: "text-info" },
  ok: { box: "bg-ok-soft", icon: "text-ok" },
};

export type CountTileProps = {
  /** "Essays to review" — what the number counts. */
  label: string;
  value: number;
  icon: LucideIcon;
  /** The colour while there is something waiting; zero is always green, with a check for the icon. */
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
            {label}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

/** The one row a grid becomes when nothing is waiting. */
export function AllCaughtUp({ label = "All caught up" }: { label?: string }) {
  return (
    <View
      testID="all-caught-up"
      accessible
      accessibilityLabel={label}
      className="min-h-[52px] flex-row items-center gap-3 rounded-group bg-surface px-4 py-3"
    >
      <CircleCheck size={20} className="shrink-0 text-ok" />
      <Text variant="body" className="min-w-0 flex-1">
        {label}
      </Text>
    </View>
  );
}

export function CountGrid({ tiles, clearLabel }: { tiles: CountTileProps[]; clearLabel?: string }) {
  const waiting = tiles.filter((t) => t.value > 0);
  if (waiting.length === 0) return <AllCaughtUp label={clearLabel} />;
  return (
    <View testID="count-grid" className="flex-row flex-wrap gap-3">
      {waiting.map((t) => (
        <CountTile key={t.label} {...t} />
      ))}
    </View>
  );
}
