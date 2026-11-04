/**
 * Redesign bottom sheet on RN Modal (transparent) + Reanimated + a
 * gesture-handler pan. In: SPRING.gentle; out: DURATION.base timing, exits
 * faster than entrances; backdrop fades. Drag down past 30% of the sheet's
 * height, or release faster than 800, to dismiss; otherwise it springs back
 * (never overscrolls above rest). Reduced motion: a DURATION.fast opacity
 * crossfade with the sheet at its final position.
 * The Modal is its own window on Android, so it gets its own
 * GestureHandlerRootView. Bottom clearance is the safe-area inset, replaced
 * (not added to) by the keyboard height while the keyboard is open.
 * `SheetSaveBar` is pinned to the sheet's bottom and lifted by the same offset.
 * The Animated.Views take only styles; their classes sit on plain Views inside
 * them (classes on an Animated.View are dropped on device). The panel keeps
 * `maxHeight: 90%` on the Animated.View (a percentage of the screen-filling
 * parent) and its surface `shrink`s inside it so the ScrollView still scrolls.
 */
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { Modal as RNModal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { GestureDetector, GestureHandlerRootView, usePanGesture } from "react-native-gesture-handler";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { DURATION, SPRING, useReducedMotion } from "../motion";
import { useKeyboardHeight, useKeyboardInset } from "../lib/keyboard-inset";
import { SaveBarBody, type SaveBarProps } from "../layout/save-bar";
import { Text } from "./text";

const DISMISS_FRACTION = 0.3;
const DISMISS_VELOCITY = 800;
const OFFSCREEN = 1000;

const styles = StyleSheet.create({ panel: { maxHeight: "90%" } });

type SheetProps = { open: boolean; onClose: () => void; title?: string; children?: ReactNode; footer?: ReactNode };

const BarHeightContext = createContext<(h: number) => void>(() => {});

/** Bottom clearance: the keyboard height while it is open, else the safe-area inset (never both). */
function useBottomOffset(keyboard: number): number {
  const insets = useSafeAreaInsets();
  return keyboard > 0 ? keyboard : insets.bottom;
}

function Sheet({ open, onClose, title, children, footer }: SheetProps) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(open);
  const [height, setHeight] = useState(0);
  const [barHeight, setBarHeight] = useState(0);
  const { inset, scrollProps } = useKeyboardInset();
  const bottom = useBottomOffset(inset);
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
        translateY.value = withSpring(0, SPRING.gentle);
        progress.value = withTiming(1, { duration: DURATION.base });
      }
      return;
    }
    if (reduced) {
      progress.value = withTiming(0, { duration: DURATION.fast }, (done) => {
        if (done) scheduleOnRN(unmount);
      });
    } else {
      translateY.value = withTiming(Math.max(height, 1) + 40, { duration: DURATION.base, easing: Easing.in(Easing.cubic) });
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
      translateY.value = withSpring(0, SPRING.gentle);
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
            style={[styles.panel, sheetStyle]}
            onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
          >
            <View className="shrink rounded-t-[24px] bg-surface">
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
                  {...scrollProps}
                  contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: barHeight + bottom + 16 }}
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

/** Pinned primary action for a sheet: sits at the sheet bottom, lifted by the keyboard. */
function SheetSaveBar(props: SaveBarProps) {
  const bottom = useBottomOffset(useKeyboardHeight());
  const setBarHeight = useContext(BarHeightContext);
  return (
    <View
      testID="sheet-save-bar"
      style={{ position: "absolute", left: 0, right: 0, bottom }}
      onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}
    >
      <SaveBarBody {...props} />
    </View>
  );
}

export { Sheet, SheetSaveBar };
export type { SheetProps };
