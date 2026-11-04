/**
 * Legacy StatCard, kept so its call sites compile, drawn like the redesign's
 * StatTile: a flat group (radius 16, no shadow or gradient), the value on the
 * large-title size with tabular numerals, the label a caption. `white` is
 * `surface`, `navy` the primary fill, `teal` the info tone; each text colour is
 * the token that reads on its fill in both themes. Pressable cards take the
 * spring press scale (the Animated.View carries only the scale; the look is on
 * the plain View inside it). The label never breaks mid-word: one word stays on
 * one line and shrinks, several take at most two lines.
 * Plans 02–05 move the call sites to StatTile and delete this file.
 */
import { Flame } from "lucide-react-native";
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";

import { usePressScale } from "../motion";
import { cn } from "../lib/cn";
import { iconWithClassName } from "../lib/icon";
import { Text } from "../ui/text";

iconWithClassName(Flame);

type Variant = "white" | "navy" | "teal";

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
  const look = cn("flex-1 flex-col items-center justify-center gap-0.5 rounded-[16px] p-4", BOX[variant]);
  const a11y = `${label}: ${value}`;
  const body = (
    <>
      <View className="flex-row items-center justify-center gap-1">
        {icon === "flame" ? <Flame testID="stat-card-flame" size={24} className="text-warn" /> : null}
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
        numberOfLines={Math.min(2, label.trim().split(/\s+/).length)}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        maxFontSizeMultiplier={1.3}
        className={cn("-mx-2 text-center font-medium", LABEL[variant])}
      >
        {label}
      </Text>
      {sublabel ? (
        <Text variant="caption" maxFontSizeMultiplier={1.3} className={cn("text-center", LABEL[variant])}>
          {sublabel}
        </Text>
      ) : null}
    </>
  );
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={a11y}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        className={cn("flex-1", className)}
      >
        <Animated.View style={[{ flexGrow: 1 }, press.animatedStyle]}>
          <View className={look}>{body}</View>
        </Animated.View>
      </Pressable>
    );
  }
  return (
    <View accessible accessibilityLabel={a11y} className={cn(look, className)}>
      {body}
    </View>
  );
}
