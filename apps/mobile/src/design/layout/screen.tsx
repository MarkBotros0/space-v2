/**
 * The redesign's screen frame (plan 01 Task 10; replaces v1's web-style top
 * bar). It owns the top safe-area inset and the offline strip under it, a
 * large title in the scroll content that collapses into a pinned
 * `CompactHeader` once scrolled past, Home's bell and user menu (`home`,
 * ruling R13), the bottom padding that clears the pill (or, on a detail
 * screen, just the inset: `useShellBottomPadding`), the keyboard inset, and
 * the scroll direction the pill hides and returns on (`useTabBarScroll`).
 *
 * Without a `title` there is no large title and no compact header: the
 * screens still on `ShellFrame` render their own `PageTitle` in the content
 * until their batch moves them here.
 */
import { cssInterop } from "nativewind";
import { type ReactNode, useContext } from "react";
import { type LayoutChangeEvent, RefreshControl, View } from "react-native";
import Animated, {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { cn } from "../lib/cn";
import { useKeyboardInset } from "../lib/keyboard-inset";
import { useReducedMotion } from "../motion";
import { HomeActions } from "./home-actions";
import { type BackTarget, CompactHeader, compactHeaderFade, LargeTitle } from "./large-title";
import { OfflineBanner } from "./offline-banner";
import { TabBarPresenceContext, useShellBottomPadding } from "./shell-context";
import {
  INITIAL_SCROLL_STEP,
  type ScrollStep,
  scrollDirectionStep,
  useTabBarScroll,
} from "./tab-bar-scroll";

cssInterop(Animated.ScrollView, {
  className: "style",
  contentContainerClassName: "contentContainerStyle",
});

/** Until the large title has been laid out, nothing counts as scrolled past it. */
const NOT_MEASURED = Number.MAX_SAFE_INTEGER;

export type ScreenProps = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  back?: BackTarget;
  /** Actions beside the large title. */
  trailing?: ReactNode;
  /** Home only: the notification bell and the user menu in the title row. */
  home?: boolean;
  refreshing?: boolean;
  /** Adds pull-to-refresh. */
  onRefresh?: () => void;
  /** `false` for a screen that lays out its own list or fills the space. */
  scroll?: boolean;
  /** Extra classes on the content container (ShellFrame's v1 page tint). */
  contentClassName?: string;
};

/**
 * The top safe-area inset with the offline strip under it, around a screen's
 * body. `Screen` uses it; a screen that renders its own list (a FlatList)
 * wraps the list in it so it gets the same top.
 */
export function ScreenChrome({ children }: { children: ReactNode }) {
  const top = useContext(SafeAreaInsetsContext)?.top ?? 0;
  return (
    <View testID="screen" className="flex-1 bg-background" style={{ paddingTop: top }}>
      <OfflineBanner />
      {children}
    </View>
  );
}

export function Screen({
  children,
  title,
  subtitle,
  back,
  trailing,
  home = false,
  refreshing = false,
  onRefresh,
  scroll = true,
  contentClassName,
}: ScreenProps) {
  const bottom = useShellBottomPadding();
  const hasTabBar = useContext(TabBarPresenceContext);
  const reduced = useReducedMotion();
  const { onScrollDirection } = useTabBarScroll();

  const scrollY = useSharedValue(0);
  const titleBottom = useSharedValue(NOT_MEASURED);
  const progress = useSharedValue(0);
  const step = useSharedValue<ScrollStep>(INITIAL_SCROLL_STEP);
  // The scroll handler runs on the UI thread, so the keyboard reads the
  // offset from it when it needs one instead of tracking every frame.
  const keyboard = useKeyboardInset({ getOffset: () => scrollY.value });

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
      if (!hasTabBar) return;
      const prev = step.value;
      const next = scrollDirectionStep(
        prev,
        e.contentOffset.y,
        e.layoutMeasurement.height,
        e.contentSize.height,
      );
      step.value = next;
      // Only a change crosses to the JS thread, never every frame.
      if (next.dir !== null && (next.dir !== prev.dir || next.atEnd !== prev.atEnd)) {
        scheduleOnRN(onScrollDirection, next.dir, next.atEnd);
      }
    },
  });

  useAnimatedReaction(
    () => scrollY.value > titleBottom.value,
    (collapsed, was) => {
      if (collapsed === was) return;
      // The first run (was === null) places the header without a fade.
      progress.value = compactHeaderFade(collapsed ? 1 : 0, !reduced && was !== null);
    },
  );

  const onTitleLayout = (e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    titleBottom.value = y + height;
  };

  const actions =
    trailing || home ? (
      <>
        {trailing}
        {home ? <HomeActions /> : null}
      </>
    ) : null;
  const heading =
    title || subtitle || back || actions ? (
      <LargeTitle
        title={title}
        subtitle={subtitle}
        back={back}
        trailing={actions}
        onLayout={onTitleLayout}
      />
    ) : null;

  if (!scroll) {
    return (
      <ScreenChrome>
        <View
          className={cn("flex-1 px-4 pt-4", contentClassName)}
          style={{ paddingBottom: bottom }}
        >
          {heading}
          {children}
        </View>
      </ScreenChrome>
    );
  }

  return (
    <ScreenChrome>
      <View className="flex-1">
        <Animated.ScrollView
          ref={keyboard.scrollProps.ref}
          onScroll={onScroll}
          scrollEventThrottle={keyboard.scrollProps.scrollEventThrottle}
          onContentSizeChange={keyboard.scrollProps.onContentSizeChange}
          keyboardShouldPersistTaps={keyboard.scrollProps.keyboardShouldPersistTaps}
          className="flex-1"
          contentContainerClassName={cn("px-4 pt-4", contentClassName)}
          contentContainerStyle={{ paddingBottom: Math.max(bottom, keyboard.inset + 16) }}
          refreshControl={
            onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
          }
        >
          {heading}
          {children}
        </Animated.ScrollView>
        {title ? <CompactHeader title={title} progress={progress} /> : null}
      </View>
    </ScreenChrome>
  );
}
