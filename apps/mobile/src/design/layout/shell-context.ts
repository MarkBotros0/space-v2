import { useContext } from "react";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

/** v1 shell-frame.tsx <main> bottom padding that keeps content clear of the tab bar. */
export const SHELL_BOTTOM_PADDING = 96;

/**
 * v1's `pb-24` is the tab bar's 16px offset + its 64px height + a 16px gap.
 * The native bar sits at max(16, bottom inset) (floating-tab-bar.tsx), so
 * above a 3-button nav bar a flat 96px leaves the last row under the bar;
 * the padding follows the bar instead. 96 when there is no inset (and
 * outside a SafeAreaProvider).
 */
export function useShellBottomPadding(): number {
  const insets = useContext(SafeAreaInsetsContext);
  return Math.max(16, insets?.bottom ?? 0) + SHELL_BOTTOM_PADDING - 16;
}
