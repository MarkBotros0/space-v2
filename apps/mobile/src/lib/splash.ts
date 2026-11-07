import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";

/**
 * The longest the native splash stays up waiting for fonts and theme. It no
 * longer waits for the session: the LaunchScreen (design/brand) covers that,
 * on the same plain background, writing the logo.
 */
export const SPLASH_MAX_WAIT_MS = 3000;

/** Call once at module scope, before the root layout's first render. */
export function keepSplashUntilReady(): void {
  // Rejects only when the splash is already gone (e.g. a fast refresh in
  // development); nothing to do then.
  void SplashScreen.preventAutoHideAsync().catch(() => undefined);
}

/**
 * Hides the native splash once `ready` (fonts and theme in place), so a cold
 * start goes straight from the splash to the LaunchScreen on the same colour
 * instead of splash → blank. Hides after SPLASH_MAX_WAIT_MS regardless.
 */
export function useHideSplashWhen(ready: boolean): void {
  useEffect(() => {
    const timer = setTimeout(hideSplash, SPLASH_MAX_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (ready) hideSplash();
  }, [ready]);
}

function hideSplash(): void {
  void SplashScreen.hideAsync().catch(() => undefined);
}
