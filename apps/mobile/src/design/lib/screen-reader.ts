import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * True while VoiceOver or TalkBack is on. Starts false and follows the OS
 * (`screenReaderChanged`). The floating pill stays shown while it is on: a
 * screen reader does not scroll the way that hides it, and a tab moved
 * off-screen behind `pointerEvents="none"` cannot be activated reliably.
 */
export function useScreenReaderEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((on) => {
        // Only "on" changes anything: the state starts false.
        if (live && on) setEnabled(true);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("screenReaderChanged", setEnabled);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return enabled;
}
