/**
 * A thin strip under the top inset (`Screen`) while the device is offline. Not a v1
 * port — v1 is a website and had no offline state. Queries are paused while
 * this shows (src/lib/online.ts), so it tells the user why nothing loads; it
 * goes away by itself on reconnect, when paused queries refetch.
 * Warning tokens in both themes, the same pairing as the student dashboard's
 * late notice.
 */
import { WifiOff } from "lucide-react-native";
import { View } from "react-native";

import { useIsOnline } from "../../lib/online";
import { Text } from "../ui/text";

export function OfflineBanner() {
  const online = useIsOnline();
  if (online) return null;
  return (
    <View
      testID="offline-banner"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className="flex-row items-center justify-center gap-1.5 border-b border-warning-200 bg-warning-50 px-4 py-1.5 dark:border-warning-900 dark:bg-warning-950"
    >
      <WifiOff size={14} className="shrink-0 text-warning-800 dark:text-warning-200" />
      <Text
        maxFontSizeMultiplier={1.3}
        className="min-w-0 shrink text-xs font-semibold text-warning-800 dark:text-warning-200"
      >
        {"You're offline. Data will refresh when you reconnect."}
      </Text>
    </View>
  );
}
