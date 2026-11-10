/**
 * The logo writing itself in front of the user (owner, 2026-11-07, timing
 * 2026-11-10): the J+P stroke and the C together, then both dots, 1.85 s. It is drawn
 * on the app's own background: navy ink in light mode, teal in dark
 * (`logoInk`, theme/brand.ts). One clock drives every mark, so the marks can
 * never drift apart.
 *
 * Reduced motion: the logo is whole from the first frame and onDone fires at
 * once; whoever shows it crossfades it away. Nothing waits on the animation
 * itself: onDone is a plain timer, so a dropped frame cannot strand the caller.
 * The animated components take only props (no className, see CLAUDE.md).
 */
import { useEffect } from "react";
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { useColorScheme } from "nativewind";

import { useReducedMotion } from "../motion";
import { logoInk } from "../theme/brand";
import {
  LOGO_DOT_RADIUS,
  LOGO_DOTS,
  LOGO_STROKE_WIDTH,
  LOGO_STROKES,
  LOGO_TIMELINE,
  LOGO_VIEWBOX,
  LOGO_WRITING_MS,
  markProgress,
} from "./logo-strokes";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Span = readonly [number, number];

/**
 * `hideDots`: the launch screen draws the two dots itself once they leave the
 * logo (launch-dots.tsx), at the same place, so the hand-over is invisible.
 */
export function LogoWriting({
  size = 168,
  onDone,
  hideDots = false,
}: {
  size?: number;
  onDone?: () => void;
  hideDots?: boolean;
}) {
  const reduced = useReducedMotion();
  const { colorScheme } = useColorScheme();
  const ink = logoInk(colorScheme === "dark" ? "dark" : "light");
  const clock = useSharedValue(reduced ? LOGO_WRITING_MS : 0);

  useEffect(() => {
    if (reduced) {
      onDone?.();
      return;
    }
    clock.value = withTiming(LOGO_WRITING_MS, { duration: LOGO_WRITING_MS, easing: Easing.linear });
    const timer = onDone ? setTimeout(onDone, LOGO_WRITING_MS) : undefined;
    return () => clearTimeout(timer);
    // Runs once: a new onDone identity must not restart the writing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Svg
      width={size}
      height={size}
      viewBox={LOGO_VIEWBOX}
      accessible
      accessibilityRole="image"
      accessibilityLabel="JPC Space"
      testID="logo-writing"
    >
      {LOGO_STROKES.map((stroke) => (
        <WritingStroke
          key={stroke.key}
          d={stroke.d}
          length={stroke.length}
          span={LOGO_TIMELINE[stroke.key]}
          clock={clock}
          ink={ink}
        />
      ))}
      {(hideDots ? [] : LOGO_DOTS).map((dot) => (
        <WritingDot key={dot.key} cx={dot.cx} cy={dot.cy} span={LOGO_TIMELINE[dot.key]} clock={clock} ink={ink} />
      ))}
    </Svg>
  );
}

function WritingStroke({
  d,
  length,
  span,
  clock,
  ink,
}: {
  d: string;
  length: number;
  span: Span;
  clock: SharedValue<number>;
  ink: string;
}) {
  const animatedProps = useAnimatedProps(() => {
    const p = markProgress(clock.value, span[0], span[1]);
    // Hidden until the pen lands: a round cap on an empty dash still paints a dot.
    return { strokeDashoffset: length * (1 - p), strokeOpacity: p > 0 ? 1 : 0 };
  });
  return (
    <AnimatedPath
      d={d}
      fill="none"
      stroke={ink}
      strokeWidth={LOGO_STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      // One unit of slack, so rounding never leaves a hairline gap at the end.
      strokeDasharray={[length + 1, length + 1]}
      animatedProps={animatedProps}
    />
  );
}

function WritingDot({
  cx,
  cy,
  span,
  clock,
  ink,
}: {
  cx: number;
  cy: number;
  span: Span;
  clock: SharedValue<number>;
  ink: string;
}) {
  const animatedProps = useAnimatedProps(() => ({
    r: LOGO_DOT_RADIUS * markProgress(clock.value, span[0], span[1]),
  }));
  return <AnimatedCircle cx={cx} cy={cy} fill={ink} animatedProps={animatedProps} />;
}
