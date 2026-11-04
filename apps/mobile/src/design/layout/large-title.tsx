/**
 * The redesign's screen heading (spec goal 3): a large title in the scroll
 * content with trailing actions beside it, and the `CompactHeader` it
 * collapses into once scrolled past (`Screen` drives the fade). A detail
 * screen's back link lives in the CompactHeader's pinned bar, never in the
 * content, so it stays reachable and is announced once (ruling R16).
 */
import { type Href, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, type LayoutChangeEvent, StyleSheet, View } from "react-native";
import Animated, { type SharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";

import { iconWithClassName } from "../lib/icon";
import { DURATION } from "../motion";
import { Text } from "../ui/text";

iconWithClassName(ChevronLeft);

export type BackTarget = { label: string; href?: Href };

/**
 * The plain back link of a pushed screen that can be opened from several
 * places (More, Profile, a detail): Back to wherever that was.
 */
export const BACK_TO_PREVIOUS: BackTarget = { label: "Back" };

/** `href` pushes that route; without one it goes back to wherever the screen was opened from. */
export function BackLink({ label, href }: BackTarget) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label === BACK_TO_PREVIOUS.label ? label : `Back to ${label}`}
      hitSlop={4}
      onPress={() => (href ? router.push(href) : router.back())}
      className="-ml-1.5 min-h-[44px] flex-row items-center gap-0.5 self-start pr-2"
    >
      <ChevronLeft size={22} className="text-primary" />
      <Text
        variant="body"
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
        className="min-w-0 shrink text-primary"
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function LargeTitle({
  title,
  subtitle,
  trailing,
  onLayout,
}: {
  title?: string;
  subtitle?: string;
  trailing?: ReactNode;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const row = title || trailing;
  return (
    <View testID="large-title" onLayout={onLayout} className="mb-4">
      {row ? (
        <View className="flex-row items-center gap-3">
          <View className="min-w-0 flex-1">
            {title ? (
              <Text variant="largeTitle" accessibilityRole="header" className="text-foreground">
                {title}
              </Text>
            ) : null}
          </View>
          {trailing ? (
            <View className="shrink-0 flex-row flex-wrap items-center justify-end gap-2">
              {trailing}
            </View>
          ) : null}
        </View>
      ) : null}
      {subtitle ? (
        <Text variant="subhead" className="mt-1 text-muted-foreground">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The compact header's next opacity: a DURATION.fast fade, or the value
 * itself when it must not animate (reduced motion; its first placement).
 */
export function compactHeaderFade(to: 0 | 1, animate: boolean): number {
  "worklet";
  return animate ? withTiming(to, { duration: DURATION.fast }) : to;
}

/**
 * The bar the large title collapses into: pinned at the top of the scroll
 * area (under the top inset), the title in `headline` over a hairline.
 * `progress` (0 → 1) is the title's and hairline's opacity. The title never
 * takes touches and is hidden from screen readers: the large title in the
 * content is the header.
 *
 * Without `back` the whole bar fades in over the content once it has
 * scrolled past the large title. With `back` (a detail screen) the bar is
 * always there, in the layout above the scroll view, so the back link stays
 * reachable after the title collapses (ruling R16); only the title and the
 * hairline fade in beside it.
 */
export function CompactHeader({
  title,
  back,
  progress,
}: {
  title?: string;
  back?: BackTarget;
  progress: SharedValue<number>;
}) {
  const fade = useAnimatedStyle(() => ({ opacity: progress.value }));
  if (!back) {
    return (
      <Animated.View
        testID="compact-header"
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.pinned, fade]}
      >
        <View className="min-h-[44px] justify-center bg-background px-12 py-2">
          <CompactTitle title={title} />
        </View>
        <View className="bg-separator" style={styles.hairline} />
      </Animated.View>
    );
  }
  return (
    <View testID="back-bar" pointerEvents="box-none" className="bg-background">
      <View pointerEvents="box-none" className="min-h-[44px] flex-row items-center gap-2 px-4">
        <View className="max-w-[45%] shrink-0">
          <BackLink {...back} />
        </View>
        {title ? (
          <Animated.View
            testID="compact-header"
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.fill, fade]}
          >
            <View className="py-2">
              <CompactTitle title={title} />
            </View>
          </Animated.View>
        ) : null}
      </View>
      <Animated.View style={[styles.hairline, fade]}>
        <View className="flex-1 bg-separator" />
      </Animated.View>
    </View>
  );
}

function CompactTitle({ title }: { title?: string }) {
  return (
    <Text
      variant="headline"
      numberOfLines={1}
      maxFontSizeMultiplier={1.3}
      className="text-center text-foreground"
    >
      {title}
    </Text>
  );
}

const styles = StyleSheet.create({
  pinned: { position: "absolute", top: 0, left: 0, right: 0 },
  fill: { flex: 1, minWidth: 0 },
  hairline: { height: StyleSheet.hairlineWidth },
});
