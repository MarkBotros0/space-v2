/**
 * The redesign's screen frame (plan 01 Task 10; replaces v1's web-style top
 * bar). It owns the top safe-area inset and the offline strip under it, a
 * large title in the scroll content that collapses into a pinned
 * `CompactHeader` once scrolled past, Home's bell and user menu (`home`,
 * ruling R13; as soon as they start to scroll under the top the compact
 * header, titled "Home", carries them, R31), the bottom padding that clears
 * the pill (or, on a detail screen, just the inset: `useShellBottomPadding`),
 * the keyboard inset, and
 * the scroll direction the pill hides and returns on (`useTabBarScroll`).
 * With `back` the compact header is a bar pinned above the scroll view that
 * always shows the back link; only its title fades in (ruling R16).
 *
 * `footer` (a `SaveBar`) is pinned outside the scroll view: above the pill
 * on a tab, on the bottom inset on a detail screen, and riding the keyboard
 * (`keyboardBottomOffset`) while it is open. It is measured, and the scroll
 * content pads by its height so the last field scrolls clear of it (final
 * review I4).
 *
 * Without a `title` there is no large title and no compact header (Home
 * excepted, above): the screens still on `ShellFrame` render their own
 * `PageTitle` in the content until their batch moves them here.
 */
import { cssInterop } from "nativewind";
import { type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { type LayoutChangeEvent, Platform, RefreshControl, View } from "react-native";
import Animated, {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { cn } from "../lib/cn";
import { usePullRefresh } from "../lib/pull-refresh";
import { useKeyboardInset } from "../lib/keyboard-inset";
import { keyboardBottomOffset } from "../lib/keyboard-offset";
import { useReducedMotion } from "../motion";
import { HomeActions } from "./home-actions";
import {
  BACK_TO_PREVIOUS,
  type BackTarget,
  CompactHeader,
  compactHeaderFade,
  LargeTitle,
} from "./large-title";
import { OfflineBanner } from "./offline-banner";
import { ScreenFooterContext, TabBarPresenceContext, useShellBottomPadding } from "./shell-context";
import {
  INITIAL_SCROLL_STEP,
  type ScrollStep,
  scrollDirectionStep,
  useTabBarScroll,
  useTabBarVisible,
} from "./tab-bar-scroll";

// Safe only while this ScrollView gets no animated style: css-interop flattens every
// inline style into one object, and Reanimated swaps an object holding an animated
// style for that style's initial value, dropping the classes (no-classname-on-animated.test.ts).
cssInterop(Animated.ScrollView, {
  className: "style",
  contentContainerClassName: "contentContainerStyle",
});

/** Until the large title has been laid out, nothing counts as scrolled past it. */
const NOT_MEASURED = Number.MAX_SAFE_INTEGER;
/** Padding under the footer's content, as under a sheet's save bar. */
const FOOTER_BOTTOM_PADDING = 12;

export type ScreenProps = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  /** Overrides the title in the collapsed header. Unset: the title, or "Home" on Home without one. */
  compactTitle?: string;
  /**
   * The pinned back bar. Unset: a screen on the stack (no tab bar) gets
   * `BACK_TO_PREVIOUS` (ruling R23), a tab gets none. `null` opts out.
   */
  back?: BackTarget | null;
  /** Actions beside the large title. */
  trailing?: ReactNode;
  /** Home only: the notification bell and the user menu in the title row. */
  home?: boolean;
  refreshing?: boolean;
  /** Adds pull-to-refresh. */
  onRefresh?: () => void;
  /** `false` for a screen that lays out its own list or fills the space. */
  scroll?: boolean;
  /** Extra classes on the content container. */
  contentClassName?: string;
  /**
   * Pinned under the content, outside the scroll view: a `SaveBar`. It sits
   * above the pill (tab) or the bottom inset (detail), rides the keyboard,
   * and the content pads by its measured height.
   */
  footer?: ReactNode;
};

/**
 * The top safe-area inset with the offline strip under it, around a screen's
 * body. `Screen` uses it; a screen that renders its own list (a FlatList)
 * wraps the list in it so it gets the same top, and passes `back` for the
 * pinned back bar `Screen` would give it (ruling R16).
 */
export function ScreenChrome({
  children,
  back,
}: {
  children: ReactNode;
  back?: BackTarget | null;
}) {
  const effective = useEffectiveBack(back);
  const top = useContext(SafeAreaInsetsContext)?.top ?? 0;
  return (
    <View testID="screen" className="flex-1 bg-background" style={{ paddingTop: top }}>
      <OfflineBanner />
      {effective ? <PinnedBackBar back={effective} /> : null}
      {children}
    </View>
  );
}

/** Ruling R23 (Screen passes `back={null}` to ScreenChrome: it draws its own bar beside the title). No tab bar under the screen means it was pushed, so it can go back. */
function useEffectiveBack(back: BackTarget | null | undefined): BackTarget | null {
  const hasTabBar = useContext(TabBarPresenceContext);
  if (back !== undefined) return back;
  return hasTabBar ? null : BACK_TO_PREVIOUS;
}

/** The back bar alone: no title to fade in, so its hairline stays hidden. */
function PinnedBackBar({ back }: { back: BackTarget }) {
  const progress = useSharedValue(0);
  return <CompactHeader back={back} progress={progress} />;
}

export function Screen({
  children,
  title,
  subtitle,
  compactTitle: compactTitleProp,
  back: backProp,
  trailing,
  home = false,
  refreshing = false,
  onRefresh,
  scroll = true,
  contentClassName,
  footer,
}: ScreenProps) {
  const bottom = useShellBottomPadding();
  const insetBottom = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  const [footerHeight, setFooterHeight] = useState(0);
  const footerHeightRef = useRef(0);
  footerHeightRef.current = footer ? footerHeight : 0;
  const hasTabBar = useContext(TabBarPresenceContext);
  const back = useEffectiveBack(backProp);
  const reduced = useReducedMotion();
  const { onScrollDirection } = useTabBarScroll();
  const pull = usePullRefresh(refreshing, onRefresh);

  const scrollY = useSharedValue(0);
  const titleBottom = useSharedValue(NOT_MEASURED);
  const progress = useSharedValue(0);
  const step = useSharedValue<ScrollStep>(INITIAL_SCROLL_STEP);
  // The scroll handler runs on the UI thread, so the keyboard reads the
  // offset from it when it needs one instead of tracking every frame.
  const keyboard = useKeyboardInset({
    getOffset: () => scrollY.value,
    getBarHeight: () => footerHeightRef.current,
  });
  // Above the pill on a tab, on the bottom inset on a detail screen; on the keyboard while it is open.
  const footerOffset = (closed: number) =>
    keyboardBottomOffset({ os: Platform.OS, keyboard: keyboard.inset, insetBottom, closed });
  const barVisible = useTabBarVisible();
  // While the pill is scrolled away the bar drops onto the inset, or the form shows through beneath it.
  const footerBottom = footerOffset(hasTabBar && barVisible ? bottom : insetBottom);
  // Reserved for the pill either way, so the padding doesn't move the content as the pill comes and goes.
  const contentBottom = footer
    ? footerHeight + footerOffset(hasTabBar ? bottom : insetBottom) + 16
    : Math.max(bottom, keyboard.offset + 16);
  const pinnedFooter = footer ? (
    <View
      testID="screen-footer"
      pointerEvents="box-none"
      className="bg-surface"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: footerBottom,
        paddingBottom: FOOTER_BOTTOM_PADDING,
      }}
      onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
    >
      <ScreenFooterContext.Provider value={true}>{footer}</ScreenFooterContext.Provider>
      {/* The pill floats clear of the bar: without this, the content shows through the gap. */}
      <View
        testID="screen-footer-backdrop"
        className="bg-surface"
        style={{ position: "absolute", left: 0, right: 0, top: "100%", height: footerBottom }}
      />
    </View>
  ) : null;

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

  // The pill came back without this screen asking (a tab change, a pop back to
  // the tabs, or the end of the content): forget the "down" it last reported,
  // or the next scroll down would not count as a change and the pill would
  // stay up until the direction flipped once (final review M2).
  useEffect(() => {
    if (barVisible && step.value.dir === "down") step.value = { ...step.value, dir: null };
  }, [barVisible, step]);

  // Home's compact header carries live controls, so JS must know when it shows.
  const [collapsed, setCollapsed] = useState(false);
  useAnimatedReaction(
    () => scrollY.value > titleBottom.value,
    (now, was) => {
      if (now === was) return;
      // The first run (was === null) places the header without a fade.
      progress.value = compactHeaderFade(now ? 1 : 0, !reduced && was !== null);
      if (home) scheduleOnRN(setCollapsed, now);
    },
  );

  // A large title collapses once scrolled past its bottom. Home's actions row
  // (bell, user menu) is live, so the compact bar takes over as soon as the row
  // starts to go under the top: waiting for its bottom left it half under the
  // status bar with no bar shown, on a short page partly scrolled (sweep s47-03).
  const onTitleLayout = (e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    titleBottom.value = home ? y : y + height;
  };

  // Home has no large title; once its actions row scrolls away the compact
  // header names it "Home" and carries the bell and user menu (R31).
  const compactTitle = compactTitleProp ?? title ?? (home ? "Home" : undefined);
  const actions =
    trailing || home ? (
      <>
        {trailing}
        {home ? <HomeActions /> : null}
      </>
    ) : null;
  const heading =
    title || subtitle || actions ? (
      <LargeTitle title={title} subtitle={subtitle} trailing={actions} onLayout={onTitleLayout} />
    ) : null;

  if (!scroll) {
    return (
      <ScreenChrome back={null}>
        {back ? <CompactHeader title={title} back={back} progress={progress} /> : null}
        <View
          className={cn("flex-1 px-4 pt-4", contentClassName)}
          style={{ paddingBottom: footer ? contentBottom : bottom }}
        >
          {heading}
          {children}
        </View>
        {pinnedFooter}
      </ScreenChrome>
    );
  }

  return (
    <ScreenChrome back={null}>
      {back ? <CompactHeader title={title} back={back} progress={progress} /> : null}
      <View className="flex-1">
        <Animated.ScrollView
          testID="screen-scroll"
          ref={keyboard.scrollProps.ref}
          onScroll={onScroll}
          scrollEventThrottle={keyboard.scrollProps.scrollEventThrottle}
          onContentSizeChange={keyboard.scrollProps.onContentSizeChange}
          keyboardShouldPersistTaps={keyboard.scrollProps.keyboardShouldPersistTaps}
          className="flex-1"
          contentContainerClassName={cn("px-4 pt-4", contentClassName)}
          contentContainerStyle={{ paddingBottom: contentBottom }}
          refreshControl={
            pull.onRefresh ? (
              <RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />
            ) : undefined
          }
        >
          {heading}
          {children}
        </Animated.ScrollView>
        {compactTitle && !back ? (
          <CompactHeader
            title={compactTitle}
            progress={progress}
            trailing={home ? <HomeActions /> : undefined}
            interactive={collapsed}
          />
        ) : null}
      </View>
      {pinnedFooter}
    </ScreenChrome>
  );
}
