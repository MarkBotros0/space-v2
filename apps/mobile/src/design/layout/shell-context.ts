import { createContext, useContext } from "react";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

/** v1 shell-frame.tsx <main> bottom padding that keeps content clear of the tab bar. */
export const SHELL_BOTTOM_PADDING = 96;

/**
 * Whether the floating tab bar is drawn under this screen. The tabs layout
 * provides `true`, the `(app)` stack (detail screens, which have no pill)
 * provides `false` around it (ruling R15). Default `true`: a screen rendered
 * outside either layout (most tests) keeps the tab-bar padding.
 */
export const TabBarPresenceContext = createContext(true);

/**
 * v1's `pb-24` is the tab bar's 16px offset + its 64px height + a 16px gap.
 * The native bar sits at max(16, bottom inset) (floating-tab-bar.tsx), so
 * above a 3-button nav bar a flat 96px leaves the last row under the bar;
 * the padding follows the bar instead. 96 when there is no inset (and
 * outside a SafeAreaProvider). Without a tab bar (detail screens) the last
 * row only needs to clear the bottom inset, plus the 16px gap.
 */
export function useShellBottomPadding(): number {
  const insets = useContext(SafeAreaInsetsContext);
  const hasTabBar = useContext(TabBarPresenceContext);
  const bottom = Math.max(16, insets?.bottom ?? 0);
  return hasTabBar ? bottom + SHELL_BOTTOM_PADDING - 16 : bottom + 16;
}
