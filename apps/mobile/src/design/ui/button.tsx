/**
 * Redesign Button: variants primary | secondary | destructive | plain, sizes
 * md (min-height 46) | sm (min-height 44), radius 14, spring press scale.
 * v1's names stay as aliases so no call site changes: default -> primary,
 * outline -> secondary, ghost/link -> plain (link keeps an underlined label),
 * default/lg/icon-lg -> md, xs/sm/icon/icon-xs/icon-sm -> sm.
 * The outer Pressable takes the caller's layout classes (self-start, flex-1,
 * w-full); the Animated.View inside it carries only the press scale, which
 * also runs under reduced motion (it is feedback, not travel), and the View
 * inside that carries the look. Classes never go on the Animated.View: on a
 * device css-interop merges them with the animated style and Reanimated drops
 * them (no-classname-on-animated.test.ts). No haptic here: haptics are for
 * selection and success moments.
 * Native note: a React Native column stretches a button, so a call site that
 * is a block in v1 adds `self-start`.
 */
import { cva } from "class-variance-authority";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, type PressableProps, View } from "react-native";
import Animated from "react-native-reanimated";

import { usePressScale } from "../motion";
import { useThemeColors } from "../theme/use-theme-colors";
import { cn } from "../lib/cn";
import { withTextRuns } from "../lib/text-runs";
import { Text } from "./text";

type Variant = "primary" | "secondary" | "destructive" | "plain";
type Size = "md" | "sm";
type LegacyVariant = "default" | "outline" | "ghost" | "link";
type LegacySize = "default" | "xs" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";
type VariantInput = Variant | LegacyVariant;
type SizeInput = Size | LegacySize;

const VARIANT_ALIAS: Record<VariantInput, Variant> = {
  primary: "primary", secondary: "secondary", destructive: "destructive", plain: "plain",
  default: "primary", outline: "secondary", ghost: "plain", link: "plain",
};
const SIZE_ALIAS: Record<SizeInput, Size> = {
  md: "md", sm: "sm", default: "md", lg: "md", "icon-lg": "md",
  xs: "sm", icon: "sm", "icon-xs": "sm", "icon-sm": "sm",
};
const ICON_SIZES = new Set<string>(["icon", "icon-xs", "icon-sm", "icon-lg"]);

const base = cva(
  "shrink-0 flex-row items-center justify-center gap-2 rounded-[14px] border border-transparent px-4",
  {
    variants: {
      variant: {
        primary: "bg-primary",
        secondary: "border-control-border bg-surface",
        destructive: "bg-bad-soft",
        plain: "bg-transparent",
      },
      size: { md: "min-h-[46px]", sm: "min-h-[44px]" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

const baseText = cva("", {
  variants: {
    variant: {
      primary: "text-primary-foreground",
      secondary: "text-foreground",
      destructive: "text-bad",
      plain: "text-foreground",
    },
    link: { true: "underline", false: "" },
  },
  defaultVariants: { variant: "primary", link: false },
});

type Opts = { variant?: VariantInput | null; size?: SizeInput | null };

function buttonVariants({ variant, size }: Opts = {}) {
  const icon = !!size && ICON_SIZES.has(size);
  return cn(
    base({ variant: VARIANT_ALIAS[variant ?? "primary"], size: SIZE_ALIAS[size ?? "md"] }),
    icon && "min-w-[44px] px-0",
  );
}

function buttonTextVariants({ variant }: Pick<Opts, "variant"> = {}) {
  return baseText({ variant: VARIANT_ALIAS[variant ?? "primary"], link: variant === "link" });
}

/** Icon size for children icons (v1 forced these through [&_svg]). */
const BUTTON_ICON_SIZE: Record<SizeInput, number> = {
  md: 16, sm: 16, default: 16, xs: 12, lg: 16, icon: 16, "icon-xs": 12, "icon-sm": 16, "icon-lg": 16,
};

type ButtonProps = Omit<PressableProps, "children"> & Opts & {
  className?: string;
  textClassName?: string;
  loading?: boolean;
  children?: ReactNode;
};

function Button({
  className, textClassName, variant = "primary", size = "md", loading = false, children, disabled, onPress, ...props
}: ButtonProps) {
  const press = usePressScale();
  const colors = useThemeColors();
  const blocked = !!disabled || loading;
  const resolved = VARIANT_ALIAS[variant ?? "primary"];
  const spinner = resolved === "primary" ? colors["primary-foreground"] : resolved === "destructive" ? colors["bad"] : colors["foreground"];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy: loading || undefined }}
      disabled={blocked}
      className={cn("shrink-0", className)}
      onPress={blocked ? undefined : onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      {...props}
    >
      <Animated.View style={press.animatedStyle}>
        <View className={cn(buttonVariants({ variant, size }), blocked && !loading && "opacity-50")}>
          {loading ? <ActivityIndicator testID="button-spinner" size="small" color={spinner} /> : null}
          {withTextRuns(children, (text, key) => (
            <Text
              key={key}
              variant="headline"
              numberOfLines={1}
              className={cn(buttonTextVariants({ variant }), textClassName)}
            >
              {text}
            </Text>
          ))}
        </View>
      </Animated.View>
    </Pressable>
  );
}

export { Button, buttonVariants, buttonTextVariants, BUTTON_ICON_SIZE };
