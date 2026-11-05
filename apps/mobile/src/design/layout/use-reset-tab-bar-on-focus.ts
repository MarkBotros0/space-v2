import { useFocusEffect } from "expo-router";
import { useCallback } from "react";

import { resetTabBarScroll } from "./tab-bar-scroll";

/**
 * Called by the tabs layout: whenever the tabs gain focus again (back from a
 * detail screen on the stack above) the pill is shown, whatever the screen
 * that scrolled it away left behind. Tab changes are handled by the pill.
 */
export function useResetTabBarOnFocus(): void {
  useFocusEffect(useCallback(() => resetTabBarScroll(), []));
}
