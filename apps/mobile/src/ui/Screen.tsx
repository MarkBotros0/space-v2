import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../theme";

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}

/**
 * Safe-area wrapper for every screen. Requires a mounted `SafeAreaProvider`
 * ancestor — `useSafeAreaInsets()` throws otherwise. Task 6 mounts the
 * provider in `app/_layout.tsx`; nothing renders `Screen` before Task 7, so
 * that ordering is safe. Tests must render through a `SafeAreaProvider` with
 * explicit `initialMetrics` (see `__tests__/helpers/render.tsx`) — a bare
 * provider never fires the `onLayout` the test renderer needs and renders no
 * children at all.
 */
export function Screen({ children, scroll = false, onRefresh, refreshing = false }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const containerStyle = {
    flex: 1,
    paddingTop: insets.top,
    paddingBottom: insets.bottom,
    paddingLeft: insets.left,
    paddingRight: insets.right,
    backgroundColor: theme.colors.neutral[50],
  };

  if (scroll || onRefresh) {
    return (
      <ScrollView
        style={containerStyle}
        contentContainerStyle={{ padding: theme.spacing.md }}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    );
  }

  return <View style={[containerStyle, { padding: theme.spacing.md }]}>{children}</View>;
}
