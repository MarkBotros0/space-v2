/**
 * Port of v1 src/components/students/stat-card.tsx.
 * Native differences: Link → Pressable (active:opacity-80 for hover:opacity-80);
 * navy's bg-gradient-to-br is an expo-linear-gradient layer; ring-1 → border;
 * the value's <Flame> child is the `icon="flame"` prop.
 */
import { LinearGradient } from "expo-linear-gradient";
import { Flame } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, View } from "react-native";

import { cn } from "../lib/cn";
import { iconWithClassName } from "../lib/icon";
import { shadowStyle } from "../lib/shadow";
import { Text } from "../ui/text";

const { colors } = require("../theme/tailwind-theme.js") as {
  colors: Record<"brand-navy", Record<string, string>>;
};

iconWithClassName(Flame);

type Variant = "white" | "navy" | "teal";

const BOX: Record<Variant, string> = {
  white: "border border-border bg-card",
  navy: "overflow-hidden dark:border dark:border-white/10",
  teal: "border border-brand-teal-200 bg-brand-teal-100 dark:border-brand-teal-900 dark:bg-brand-teal-950",
};
const VALUE: Record<Variant, string> = {
  white: "text-brand-navy-900 dark:text-foreground",
  navy: "text-white",
  teal: "text-brand-teal-900 dark:text-brand-teal-100",
};
const LABEL: Record<Variant, string> = {
  white: "text-muted-foreground",
  navy: "text-brand-teal-300",
  teal: "text-brand-teal-700 dark:text-brand-teal-300",
};
const SUB: Record<Variant, string> = {
  white: "text-muted-foreground",
  navy: "text-white/40",
  teal: "text-brand-teal-600 dark:text-brand-teal-400",
};
// v1 navy: shadow-[0_4px_20px_rgba(31,50,96,0.25)]
const NAVY_GLOW = { boxShadow: "0px 4px 20px 0px rgba(31, 50, 96, 0.25)" };

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
  const { colorScheme } = useColorScheme();
  const stops: [string, string] =
    colorScheme === "dark"
      ? [colors["brand-navy"]["800"]!, colors["brand-navy"]["600"]!]
      : [colors["brand-navy"]["900"]!, colors["brand-navy"]["700"]!];
  const body = (
    <>
      {variant === "navy" ? (
        <LinearGradient
          colors={stops}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
        />
      ) : null}
      {/* Same for the value: CSS keeps "100%" on one line, spilling into the padding. */}
      <View className="-mx-3 flex-row items-center justify-center gap-1">
        {icon === "flame" ? <Flame testID="stat-card-flame" size={24} className="text-warning-500" /> : null}
        <Text numberOfLines={1} className={cn("text-3xl font-black leading-none", VALUE[variant])}>
          {value}
        </Text>
      </View>
      {/* CSS never breaks inside a word, so v1's "ASSIGNMENTS" overflows into
          the tile's padding; React Native would break it mid-word. The label
          gets 12px of the padding on each side instead, and at most two lines:
          at a large font scale a word that still doesn't fit shrinks rather
          than splitting ("ASSIGNME / NTS"), and "ABSENCE BUDGET LEFT" stays at two
          lines instead of three. */}
      <Text
        numberOfLines={Math.min(2, label.trim().split(/\s+/).length)}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        className={cn("-mx-3 text-center text-[10px] font-bold uppercase tracking-widest", LABEL[variant])}
      >
        {label}
      </Text>
      {sublabel ? <Text className={cn("text-center text-[10px]", SUB[variant])}>{sublabel}</Text> : null}
    </>
  );
  const box = cn("flex-1 flex-col items-center justify-center gap-1 rounded-2xl p-4", BOX[variant], className);
  const style = variant === "white" ? shadowStyle("soft") : variant === "navy" ? NAVY_GLOW : undefined;
  const a11y = `${label}: ${value}`;
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={a11y}
        onPress={onPress}
        className={cn(box, "active:opacity-80")}
        style={style}
      >
        {body}
      </Pressable>
    );
  }
  return (
    <View accessible accessibilityLabel={a11y} className={box} style={style}>
      {body}
    </View>
  );
}
