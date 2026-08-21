import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../theme";

export type ScreenEdge = "top" | "bottom" | "left" | "right";

const ALL_EDGES: ScreenEdge[] = ["top", "bottom", "left", "right"];

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Applies the standard `spacing.md` padding. Default `true`; set `false` for a full-bleed screen. */
  padded?: boolean;
  /**
   * Which safe-area insets to apply as padding. Default is all four. Task 7's
   * tab bar already consumes the bottom inset, so tab screens pass
   * `edges={["top", "left", "right"]}` to avoid double padding.
   */
  edges?: ScreenEdge[];
  /** Merged with (not replacing) the outer container's own style. */
  style?: StyleProp<ViewStyle>;
  /** Merged with (not replacing) the content container's own style — the scrollable inner style when `scroll`/`onRefresh` is set. */
  contentContainerStyle?: StyleProp<ViewStyle>;
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
export function Screen({
  children,
  scroll = false,
  onRefresh,
  refreshing = false,
  padded = true,
  edges = ALL_EDGES,
  style,
  contentContainerStyle,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const insetStyle: ViewStyle = {
    paddingTop: edges.includes("top") ? insets.top : 0,
    paddingBottom: edges.includes("bottom") ? insets.bottom : 0,
    paddingLeft: edges.includes("left") ? insets.left : 0,
    paddingRight: edges.includes("right") ? insets.right : 0,
  };

  const baseStyle: ViewStyle = {
    flex: 1,
    backgroundColor: theme.colors.neutral[50],
  };

  const paddingStyle: ViewStyle | undefined = padded ? { padding: theme.spacing.md } : undefined;

  if (scroll || onRefresh) {
    return (
      <ScrollView
        style={[baseStyle, style]}
        // Insets live here, not on `style`, on purpose: putting them on the
        // ScrollView's own `style` clips content at the inset instead of
        // letting it scroll under the notch. `flexGrow: 1` is what stops a
        // `flex: 1` child (e.g. EmptyState/ErrorState) from collapsing to
        // zero height — a plain `{ padding }` contentContainerStyle gives
        // the content no flex basis to grow into.
        contentContainerStyle={[insetStyle, { flexGrow: 1 }, paddingStyle, contentContainerStyle]}
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

  return (
    <View style={[baseStyle, insetStyle, paddingStyle, style, contentContainerStyle]}>
      {children}
    </View>
  );
}
