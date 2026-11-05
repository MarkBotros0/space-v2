/**
 * Legacy StatCard, kept so its call sites compile, drawn like the redesign's
 * StatTile: a flat group (radius 16, no shadow or gradient), the value on the
 * large-title size with tabular numerals, the label a caption. `white` is
 * `surface`, `navy` the primary fill, `teal` the info tone; each text colour is
 * the token that reads on its fill in both themes. Pressable cards take the
 * spring press scale (the Animated.View carries only the scale; the look is on
 * the plain View inside it). Tiles in a row share it equally whatever their
 * content: every tile, pressable or not, is the same outer cell (TILE: flex 1,
 * basis 0, min width 0, no padding) with the look inside it. On device the
 * padded plain tile and the Pressable ones still came out unequal with the
 * classes on different elements (Yoga keeps a padded item's basis at its
 * padding); one unpadded cell for all of them leaves nothing to differ.
 * The label and its sublabel are one text in one style, laid out as at most
 * two balanced lines broken at spaces ("Absence budget / left this season").
 * numberOfLines is exactly that line count, so a line that would wrap (or
 * break a word mid-word) needs a line more and adjustsFontSizeToFit shrinks
 * the text instead: a word never breaks.
 * Plans 02–05 move the call sites to StatTile and delete this file.
 */
import { Flame } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";

import { usePressScale } from "../motion";
import { cn } from "../lib/cn";
import { iconWithClassName } from "../lib/icon";
import { Text } from "../ui/text";

iconWithClassName(Flame);

type Variant = "white" | "navy" | "teal";

/** The cell every tile is: an equal share of the row, never sized by its content. */
const styles = StyleSheet.create({ tile: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 } });

const BOX: Record<Variant, string> = {
  white: "bg-surface dark:border dark:border-separator",
  navy: "bg-primary",
  teal: "bg-info-soft",
};
const VALUE: Record<Variant, string> = {
  white: "text-foreground",
  navy: "text-primary-foreground",
  teal: "text-info",
};
const LABEL: Record<Variant, string> = {
  white: "text-muted-foreground",
  navy: "text-primary-foreground",
  teal: "text-info",
};

/**
 * The label words (label then sublabel) as one or two lines, split where the
 * longer line is shortest.
 */
export function statLabelLines(label: string, sublabel?: string): string[] {
  const words = `${label} ${sublabel ?? ""}`.trim().split(/\s+/);
  if (words.length < 2) return words;
  let best: string[] = [words.join(" ")];
  let bestLen = Number.MAX_SAFE_INTEGER;
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
    const len = Math.max(lines[0]!.length, lines[1]!.length);
    if (len < bestLen) {
      best = lines;
      bestLen = len;
    }
  }
  return best;
}

export function StatCard({
  label,
  value,
  sublabel,
  onPress,
  variant = "white",
  icon,
  className,
}: {
  label: string;
  value: string;
  sublabel?: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: "flame";
  className?: string;
}) {
  const press = usePressScale();
  const look = cn(
    "flex-1 flex-col items-center justify-center gap-0.5 rounded-group p-4",
    BOX[variant],
  );
  const lines = statLabelLines(label, sublabel);
  const a11y = `${label}: ${value}`;
  const body = (
    <>
      <View className="flex-row items-center justify-center gap-1">
        {icon === "flame" ? (
          <Flame testID="stat-card-flame" size={24} className="text-warn" />
        ) : null}
        <Text
          variant="largeTitle"
          tabular
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.4}
          maxFontSizeMultiplier={1.3}
          className={VALUE[variant]}
        >
          {value}
        </Text>
      </View>
      <Text
        variant="caption"
        numberOfLines={lines.length}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        maxFontSizeMultiplier={1.15}
        className={cn("-mx-2 self-stretch text-center font-medium", LABEL[variant])}
      >
        {lines.join("\n")}
      </Text>
    </>
  );
  return (
    <View testID="stat-card" style={styles.tile} className={className}>
      {onPress ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={a11y}
          onPress={onPress}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          className="flex-1"
        >
          <Animated.View style={[{ flexGrow: 1 }, press.animatedStyle]}>
            <View className={look}>{body}</View>
          </Animated.View>
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={a11y} className={look}>
          {body}
        </View>
      )}
    </View>
  );
}
