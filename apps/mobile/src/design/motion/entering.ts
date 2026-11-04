import { FadeIn, FadeInDown } from "react-native-reanimated";
import { DURATION } from "./tokens";

const MAX_STAGGERED = 8;
const STAGGER_MS = 35;
const RISE_PX = 6;

/**
 * Entering animation for the index-th row of a list: fade plus a 6px rise,
 * staggered by 35ms for the first eight rows. Rows from the ninth on get none.
 * Reduced motion gets a plain fade.
 */
export function listItemEntering(index: number, reduced: boolean) {
  if (reduced) return FadeIn.duration(DURATION.fast);
  if (index >= MAX_STAGGERED) return undefined;
  return FadeInDown.duration(DURATION.base)
    .delay(Math.min(index, MAX_STAGGERED - 1) * STAGGER_MS)
    .withInitialValues({ opacity: 0, transform: [{ translateY: RISE_PX }] });
}
