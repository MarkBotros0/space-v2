/**
 * The launch screen (owner, 2026-11-07): the logo writes itself once per cold
 * start, on the app's own background, over the boot gate. The native splash
 * is that same plain colour (app.json), so the hand-off is invisible.
 *
 * It leaves once the writing is done AND boot has settled (`ready`: session
 * restored, ruled out, or offered a retry), with a DURATION.base fade. Boot
 * keeps running underneath the whole time, so the logo never adds a wait of
 * its own beyond the 2.5 s of writing. If boot is still going LOADING_HINT_MS
 * after the writing ends, a spinner appears under the logo so a slow network
 * is not a frozen screen.
 *
 * Mounted at the root and dropped for good on onGone, so it never plays again
 * in the same process (foregrounding the app does not remount the root).
 * The fade is a timer, not an animation callback: no state waits on motion.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { DURATION } from "../motion";
import { useThemeColors } from "../theme/use-theme-colors";
import { LogoWriting } from "./logo-writing";

export const LOADING_HINT_MS = 3000;

export function LaunchScreen({ ready, onGone }: { ready: boolean; onGone: () => void }) {
  const colors = useThemeColors();
  const [written, setWritten] = useState(false);
  const [slow, setSlow] = useState(false);
  const opacity = useSharedValue(1);
  const leaving = written && ready;

  useEffect(() => {
    if (!written || ready) return;
    const timer = setTimeout(() => setSlow(true), LOADING_HINT_MS);
    return () => clearTimeout(timer);
  }, [written, ready]);

  useEffect(() => {
    if (!leaving) return;
    opacity.value = withTiming(0, { duration: DURATION.base });
    const timer = setTimeout(onGone, DURATION.base);
    return () => clearTimeout(timer);
    // onGone's identity must not restart the fade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      testID="launch-screen"
      pointerEvents={leaving ? "none" : "auto"}
      style={[{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }, fade]}
    >
      <View accessibilityViewIsModal className="flex-1 items-center justify-center bg-background">
        <LogoWriting onDone={() => setWritten(true)} />
        {/* Below the logo without moving it off centre. */}
        {slow && !ready ? (
          <View className="absolute inset-x-0 items-center" style={{ top: "66%" }}>
            <ActivityIndicator accessibilityLabel="Loading" color={colors.primary} />
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}
