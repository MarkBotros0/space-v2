/**
 * The launch screen's background and its two travelling dots (owner,
 * 2026-11-10; the motion is described in launch-motion.ts). One full-screen
 * SVG: the background is a path with a circular hole that opens onto the app
 * beneath, and the dots are drawn here from the moment they leave the logo
 * (LogoWriting then hides its own dots, so the hand-over is invisible).
 *
 * The caller steps `phase`; each step starts its own timing here. Nothing
 * waits on an animation: the caller's timers decide when a step ends.
 * The animated components take only props (no className, see CLAUDE.md).
 */
import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  type SharedValue,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";

import { EASE_OUT } from "../motion";
import {
  backgroundPath,
  dotPosition,
  LAUNCH,
  LAUNCH_DOT_RADIUS,
  logoDotsOnScreen,
  openingTurn,
  openRadius,
  type Point,
} from "./launch-motion";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type LaunchPhase = "logo" | "gathering" | "spinning" | "opening";

export function LaunchDots({
  phase,
  width,
  height,
  background,
  ink,
}: {
  phase: LaunchPhase;
  width: number;
  height: number;
  background: string;
  ink: string;
}) {
  const gather = useSharedValue(0);
  const angle = useSharedValue(0);
  const open = useSharedValue(0);

  useEffect(() => {
    if (phase === "gathering") gather.value = withTiming(1, { duration: LAUNCH.gatherMs, easing: EASE_OUT });
    if (phase === "spinning") {
      gather.value = 1;
      // The launch loader: one steady turn per period, until boot is ready.
      angle.value = withRepeat(withTiming(2 * Math.PI, { duration: LAUNCH.spinPeriodMs, easing: Easing.linear }), -1);
    }
    if (phase === "opening") {
      gather.value = 1;
      cancelAnimation(angle);
      angle.value = withTiming(angle.value + openingTurn(), { duration: LAUNCH.openMs, easing: EASE_OUT });
      open.value = withTiming(1, { duration: LAUNCH.openMs, easing: EASE_OUT });
    }
    // The shared values are stable; only the phase starts a step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => () => cancelAnimation(angle), [angle]);

  const centre = { x: width / 2, y: height / 2 };
  const far = openRadius(width, height);
  const [top, bottom] = logoDotsOnScreen(width, height);

  const holeProps = useAnimatedProps(() => {
    const radius = LAUNCH.orbitRadius + (far - LAUNCH.orbitRadius) * open.value;
    return { d: backgroundPath(width, height, centre, open.value > 0 ? radius - LAUNCH.orbitRadius : 0) };
  });

  const moving = phase !== "logo";
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} testID="launch-dots">
      <AnimatedPath fill={background} fillRule="evenodd" animatedProps={holeProps} />
      {moving ? (
        <>
          <Dot index={0} from={top} centre={centre} far={far} gather={gather} angle={angle} open={open} ink={ink} />
          <Dot index={1} from={bottom} centre={centre} far={far} gather={gather} angle={angle} open={open} ink={ink} />
        </>
      ) : null}
    </Svg>
  );
}

function Dot({
  index,
  from,
  centre,
  far,
  gather,
  angle,
  open,
  ink,
}: {
  index: 0 | 1;
  from: Point;
  centre: Point;
  far: number;
  gather: SharedValue<number>;
  angle: SharedValue<number>;
  open: SharedValue<number>;
  ink: string;
}) {
  const animatedProps = useAnimatedProps(() => {
    const p = dotPosition(index, from, centre, far, gather.value, angle.value, open.value);
    return { cx: p.x, cy: p.y };
  });
  return <AnimatedCircle r={LAUNCH_DOT_RADIUS} fill={ink} animatedProps={animatedProps} />;
}
