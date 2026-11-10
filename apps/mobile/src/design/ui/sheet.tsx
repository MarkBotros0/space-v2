/**
 * Redesign bottom sheet on RN Modal (transparent) + Reanimated + a
 * gesture-handler pan. In: SHEET_IN_MS ease-out, stopping dead (no spring, no
 * overshoot: owner, 2026-11-07); out: DURATION.base, exits faster than
 * entrances; backdrop fades. Drag down past 30% of the sheet's
 * height, or release faster than 800, to dismiss; otherwise it eases back
 * (never overscrolls above rest). Reduced motion: a DURATION.fast opacity
 * crossfade with the sheet at its final position.
 * The Modal is its own window on Android, so it gets its own
 * GestureHandlerRootView. Bottom clearance is `keyboardBottomOffset`: the
 * safe-area inset, or while the keyboard is open the keyboard's top (on
 * Android that is the reported height plus the nav-bar inset, since the
 * edge-to-edge dialog window is not resized; see lib/keyboard-offset.ts).
 * `SheetSaveBar` is pinned to the sheet's bottom and pads itself by the same offset;
 * a sheet with a footer pads its content by the bar's height, one without pads it
 * by the offset itself (final review C1), so the keyboard never covers its fields.
 * The Animated.Views take only styles; their classes sit on plain Views inside
 * them (classes on an Animated.View are dropped on device). The panel keeps
 * `maxHeight: 90%` on the Animated.View (a percentage of the screen-filling
 * parent) and its surface `shrink`s inside it so the ScrollView still scrolls.
 */
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { Modal as RNModal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { GestureDetector, GestureHandlerRootView, usePanGesture } from "react-native-gesture-handler";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { DURATION, EASE_OUT, useReducedMotion } from "../motion";
import { useKeyboardInset } from "../lib/keyboard-inset";
import { useKeyboardBottomOffset } from "../lib/keyboard-offset";
import { SaveBarBody, type SaveBarProps } from "../layout/save-bar";
import { Text } from "./text";

/** A sheet's entrance: long enough to show where it came from, never bouncing. */
const SHEET_IN_MS = 260;
const DISMISS_FRACTION = 0.3;
const DISMISS_VELOCITY = 800;
const OFFSCREEN = 1000;
/**
 * The bar's own padding under its button (matching its `pt-3`), kept on top of
 * the inset or keyboard. Without it the button sat flush on a 3-button nav bar
 * (sweep s90-11); gesture nav only looked right because its inset is mostly empty.
 */
const BAR_BOTTOM_PADDING = 12;

const styles = StyleSheet.create({ panel: { maxHeight: "90%" } });

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children?: ReactNode;
  footer?: ReactNode;
  /**
   * Lift the whole sheet above the keyboard instead of padding its content: for a
   * short sheet whose input is the point (a picker's search), which would
   * otherwise sit entirely under the keyboard (owner, 2026-11-07).
   */
  avoidKeyboard?: boolean;
};

const BarHeightContext = createContext<(h: number) => void>(() => {});

function Sheet({ open, onClose, title, children, footer, avoidKeyboard = false }: SheetProps) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(open);
  const [height, setHeight] = useState(0);
  const [barHeight, setBarHeight] = useState(0);
  const { scrollProps } = useKeyboardInset({ clampToViewport: true });
  const offset = useKeyboardBottomOffset();
  const insetBottom = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  // The keyboard is up when the offset is more than the inset alone.
  const lift = avoidKeyboard && offset > insetBottom ? offset : 0;
  const openRef = useRef(open);
  openRef.current = open;
  const translateY = useSharedValue(OFFSCREEN);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (open) {
      setMounted(true);
      if (reduced) {
        translateY.value = 0;
        progress.value = withTiming(1, { duration: DURATION.fast });
      } else {
        translateY.value = withTiming(0, { duration: SHEET_IN_MS, easing: EASE_OUT });
        progress.value = withTiming(1, { duration: DURATION.base });
      }
      return;
    }
    if (reduced) {
      progress.value = withTiming(0, { duration: DURATION.fast }, (done) => {
        if (done) scheduleOnRN(unmount);
      });
    } else {
      translateY.value = withTiming(Math.max(height, 1) + 40, {
        duration: DURATION.base,
        easing: Easing.in(Easing.cubic),
      });
      progress.value = withTiming(0, { duration: DURATION.base }, (done) => {
        if (done) scheduleOnRN(unmount);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reduced]);

  function unmount() {
    // A reopen during the exit animation must not be unmounted by its stale callback.
    if (openRef.current) return;
    setMounted(false);
  }

  const pan = usePanGesture({
    runOnJS: true,
    activeOffsetY: [-8, 8],
    onUpdate: (e) => {
      translateY.value = Math.max(0, e.translationY);
    },
    onDeactivate: (e) => {
      const far = e.translationY > height * DISMISS_FRACTION;
      // Ask the parent to close; if it refuses (open stays true) the sheet must come back,
      // and if it agrees the open effect below takes over and animates the exit.
      if (far || e.velocityY > DISMISS_VELOCITY) onClose();
      translateY.value = withTiming(0, { duration: DURATION.fast, easing: EASE_OUT });
    },
  });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: reduced ? progress.value : 1,
    transform: [{ translateY: reduced ? 0 : translateY.value }],
  }));

  if (!mounted) return null;

  return (
    <RNModal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <View style={StyleSheet.absoluteFill} className="justify-end" pointerEvents={open ? "auto" : "none"}>
          <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]} pointerEvents="none">
            <View className="flex-1 bg-black/40" />
          </Animated.View>
          <Pressable
            testID="sheet-backdrop"
            accessibilityLabel="Close"
            accessibilityRole="button"
            style={StyleSheet.absoluteFill}
            onPress={onClose}
          />
          <Animated.View
            testID="sheet"
            style={[styles.panel, { marginBottom: lift }, sheetStyle]}
            onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
          >
            <View className="shrink rounded-t-sheet bg-surface">
              <GestureDetector gesture={pan}>
                <View testID="sheet-header" className="min-h-[44px] items-center justify-center pb-2 pt-3">
                  <View className="h-1 w-10 rounded-full bg-separator" />
                  {title ? (
                    <Text variant="headline" accessibilityRole="header" className="mt-3 px-4 text-foreground">
                      {title}
                    </Text>
                  ) : null}
                </View>
              </GestureDetector>
              <BarHeightContext.Provider value={setBarHeight}>
                <ScrollView
                  testID="sheet-scroll"
                  {...scrollProps}
                  contentContainerStyle={{
                    paddingHorizontal: 16,
                    paddingBottom: footer ? barHeight + 16 : (lift ? 0 : offset) + 16,
                  }}
                >
                  {children}
                </ScrollView>
                {footer ? (
                  <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
                    {footer}
                  </View>
                ) : null}
              </BarHeightContext.Provider>
            </View>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </RNModal>
  );
}

/**
 * Pinned primary action for a sheet. Its opaque background runs to the sheet's
 * very bottom and the inset (or the keyboard) is padding inside it, so scrolled
 * content never shows in a strip under the bar (sweep K2, 3-button phones).
 */
function SheetSaveBar(props: SaveBarProps) {
  const bottom = useKeyboardBottomOffset();
  const setBarHeight = useContext(BarHeightContext);
  return (
    <View
      testID="sheet-save-bar"
      className="bg-surface"
      style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingBottom: bottom + BAR_BOTTOM_PADDING }}
      onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}
    >
      <SaveBarBody {...props} />
    </View>
  );
}

export { Sheet, SheetSaveBar };
