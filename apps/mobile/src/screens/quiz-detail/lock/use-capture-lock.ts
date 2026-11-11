import { addScreenshotListener, allowScreenCaptureAsync, preventScreenCaptureAsync } from "expo-screen-capture";
import { useEffect, useRef } from "react";

const KEY = "quiz-attempt";

/**
 * While `active`, the OS blocks screenshots, screen recording and the app-switcher snapshot
 * (one call, same on iPhone and Android), and `onScreenshot` fires if a screenshot is still
 * reported. The block is released when `active` turns false or the screen unmounts.
 */
export function useCaptureLock(active: boolean, onScreenshot: () => void) {
  const latest = useRef(onScreenshot);
  latest.current = onScreenshot;

  useEffect(() => {
    if (!active) return;
    void preventScreenCaptureAsync(KEY).catch(() => undefined);
    const sub = addScreenshotListener(() => latest.current());
    return () => {
      sub.remove();
      void allowScreenCaptureAsync(KEY).catch(() => undefined);
    };
  }, [active]);
}
