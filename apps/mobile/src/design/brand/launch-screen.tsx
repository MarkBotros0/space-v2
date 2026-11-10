/**
 * The launch screen (owner, 2026-11-07; hand-over 2026-11-10): the logo
 * writes itself once per cold start, on the app's own background, over the
 * boot gate. The native splash is that same plain colour (app.json), so the
 * hand-off is invisible.
 *
 * Once written, the letters fade and the logo's two dots become the loader:
 * they gather in the centre and circle each other for as long as boot takes
 * (at least half a turn). When boot has settled (`ready`: session restored,
 * ruled out, or offered a retry) the circle they trace opens onto the app
 * underneath, and the screen is gone. Boot runs underneath the whole time.
 * Steps and timings: launch-motion.ts; drawing: launch-dots.tsx.
 *
 * Reduced motion: the logo is whole at once, it crossfades away in
 * DURATION.base when boot is done, and a spinner shows under it only if boot
 * is still going LOADING_HINT_MS later.
 *
 * Mounted at the root and dropped for good on onGone, so it never plays again
 * in the same process (foregrounding the app does not remount the root).
 * Every step is a timer, not an animation callback: no state waits on motion.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, useWindowDimensions, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useColorScheme } from "nativewind";

import { DURATION, EASE_OUT, useReducedMotion } from "../motion";
import { logoInk } from "../theme/brand";
import { useThemeColors } from "../theme/use-theme-colors";
import { LaunchDots, type LaunchPhase } from "./launch-dots";
import { LAUNCH, LAUNCH_LOGO_SIZE } from "./launch-motion";
import { LogoWriting } from "./logo-writing";

export const LOADING_HINT_MS = 3000;

const FILL = { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } as const;

export function LaunchScreen({ ready, onGone }: { ready: boolean; onGone: () => void }) {
  const reduced = useReducedMotion();
  const colors = useThemeColors();
  const { colorScheme } = useColorScheme();
  const window = useWindowDimensions();
  const [size, setSize] = useState({ width: window.width, height: window.height });
  const [written, setWritten] = useState(false);
  const phase = useLaunchPhase(written && !reduced, ready, onGone);
  const fading = useReducedFade(written && reduced, ready, onGone);

  const letters = useSharedValue(1);
  useEffect(() => {
    if (phase === "gathering") letters.value = withTiming(0, { duration: LAUNCH.lettersOutMs, easing: EASE_OUT });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);
  const lettersStyle = useAnimatedStyle(() => ({ opacity: letters.value }));

  const leaving = phase === "opening" || fading.leaving;
  return (
    <Animated.View
      testID="launch-screen"
      pointerEvents={leaving ? "none" : "auto"}
      style={[FILL, fading.style]}
      onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      <LaunchDots
        phase={phase}
        width={size.width}
        height={size.height}
        background={colors.background ?? "transparent"}
        ink={logoInk(colorScheme === "dark" ? "dark" : "light")}
      />
      <View accessibilityViewIsModal className="flex-1 items-center justify-center">
        <Animated.View style={lettersStyle}>
          <LogoWriting size={LAUNCH_LOGO_SIZE} hideDots={phase !== "logo"} onDone={() => setWritten(true)} />
        </Animated.View>
        {/* The circling dots are the loader: named for screen readers while boot runs. */}
        {phase !== "logo" && phase !== "opening" && !ready ? (
          <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading" style={FILL} />
        ) : null}
        {/* Below the logo without moving it off centre. */}
        {fading.slow && !ready ? (
          <View className="absolute inset-x-0 items-center" style={{ top: "66%" }}>
            <ActivityIndicator accessibilityLabel="Loading" color={colors.primary} />
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

/**
 * The steps after the writing: hold, gather, spin (at least minSpinMs, then
 * until `ready`), open, gone. `active` is false until the logo is written,
 * and stays false under reduced motion.
 */
function useLaunchPhase(active: boolean, ready: boolean, onGone: () => void): LaunchPhase {
  const [phase, setPhase] = useState<LaunchPhase>("logo");
  const [spunEnough, setSpunEnough] = useState(false);

  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (phase === "logo") timer = setTimeout(() => setPhase("gathering"), LAUNCH.holdMs);
    if (phase === "gathering") timer = setTimeout(() => setPhase("spinning"), LAUNCH.gatherMs);
    if (phase === "spinning") timer = setTimeout(() => setSpunEnough(true), LAUNCH.minSpinMs);
    if (phase === "opening") timer = setTimeout(onGone, LAUNCH.openMs);
    return () => clearTimeout(timer);
    // onGone's identity must not restart a step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, phase]);

  useEffect(() => {
    if (phase === "spinning" && spunEnough && ready) setPhase("opening");
  }, [phase, spunEnough, ready]);

  return phase;
}

/** Reduced motion: a DURATION.base crossfade once boot is done, and the slow-boot spinner. */
function useReducedFade(active: boolean, ready: boolean, onGone: () => void) {
  const [slow, setSlow] = useState(false);
  const opacity = useSharedValue(1);
  const leaving = active && ready;

  useEffect(() => {
    if (!active || ready) return;
    const timer = setTimeout(() => setSlow(true), LOADING_HINT_MS);
    return () => clearTimeout(timer);
  }, [active, ready]);

  useEffect(() => {
    if (!leaving) return;
    opacity.value = withTiming(0, { duration: DURATION.base });
    const timer = setTimeout(onGone, DURATION.base);
    return () => clearTimeout(timer);
    // onGone's identity must not restart the fade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return { slow, leaving, style };
}
