/**
 * The check-in success moment: a tone disc with a check that draws itself
 * (DURATION.slow), then the season ring pulses once (SPRING.gentle). The
 * haptic fires once on mount. Reduced motion: the check is drawn and the ring
 * at rest from the first frame; the haptic stays. No state waits on the motion.
 * Classes stay on plain Views; the animated components take only props/styles.
 */
import { useEffect, useRef } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { DURATION, haptic, SPRING, useReducedMotion } from "../../design/motion";
import { useThemeColors } from "../../design/theme/use-theme-colors";
import { Button, ProgressRing, RingCaption, RingValue, Text } from "../../design/ui";
import { checkInCopy, type CheckInOutcome } from "../../lib/check-in-result";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const CHECK = "M7 12.5 L10.5 16 L17 8.5";
const CHECK_LENGTH = 16;
const DISC = 72;

type Checked = Extract<CheckInOutcome, { kind: "checked_in" }>;

export function CheckInSuccess({
  outcome,
  attendance,
  onDone,
}: {
  outcome: Checked;
  attendance: { attended: number; total: number } | null;
  /** When given, a Done button closes the surrounding sheet. */
  onDone?: () => void;
}) {
  const reduced = useReducedMotion();
  const colors = useThemeColors();
  const copy = checkInCopy(outcome);
  const late = outcome.status === "LATE";
  const draw = useSharedValue(reduced ? 1 : 0);
  const pulse = useSharedValue(1);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    haptic("success");
    if (reduced) return;
    draw.value = withTiming(1, { duration: DURATION.slow, easing: Easing.out(Easing.cubic) });
    pulse.value = withSequence(
      withTiming(1, { duration: DURATION.slow }),
      withSpring(1.08, SPRING.gentle),
      withSpring(1, SPRING.gentle),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkProps = useAnimatedProps(() => ({
    strokeDashoffset: CHECK_LENGTH * (1 - draw.value),
  }));
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const pct = attendance ? Math.round((attendance.attended / attendance.total) * 100) : 0;

  return (
    <View className="items-center gap-4 py-2">
      <View
        testID="check-in-disc"
        accessibilityLiveRegion="polite"
        className={`items-center justify-center rounded-full ${late ? "bg-warn-soft" : "bg-ok-soft"}`}
        style={{ width: DISC, height: DISC }}
      >
        <Svg width={36} height={36} viewBox="0 0 24 24">
          <AnimatedPath
            d={CHECK}
            fill="none"
            stroke={late ? colors.warn : colors.ok}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={`${CHECK_LENGTH} ${CHECK_LENGTH}`}
            animatedProps={checkProps}
          />
        </Svg>
      </View>
      <View className="items-center gap-1">
        <Text variant="title" accessibilityRole="header" className="text-center">
          {copy.title}
        </Text>
        {copy.message ? (
          <Text variant="body" className="text-center text-muted-foreground">
            {copy.message}
          </Text>
        ) : null}
      </View>
      {attendance ? (
        <View className="items-center gap-2">
          <Animated.View style={ringStyle}>
            <View>
              <ProgressRing value={pct} size={96} strokeWidth={8}>
                <RingValue>{`${pct}%`}</RingValue>
                <RingCaption>{"Attended"}</RingCaption>
              </ProgressRing>
            </View>
          </Animated.View>
          <Text variant="subhead" className="text-center text-muted-foreground">
            {`Season attendance · ${attendance.attended} of ${attendance.total} sessions`}
          </Text>
        </View>
      ) : null}
      {onDone ? (
        <Button className="self-stretch" onPress={onDone}>
          Done
        </Button>
      ) : null}
    </View>
  );
}
