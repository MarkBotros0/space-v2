import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../theme";

export type ScreenEdge = "top" | "bottom" | "left" | "right";

// `readonly` so the default value below can't be mutated by a caller and
// leak that mutation to every other consumer of the default.
const ALL_EDGES: readonly ScreenEdge[] = ["top", "bottom", "left", "right"] as const;

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
  edges?: readonly ScreenEdge[];
  /**
   * Merged with (not replacing) the container's own style. In the scroll
   * branch this lands on the `ScrollView` itself (a different node than
   * `contentContainerStyle`, so there's no overlap to resolve). In the
   * non-scroll branch both `style` and `contentContainerStyle` land on the
   * same `View`; `style` is applied last there and wins on any overlapping
   * key.
   */
  style?: StyleProp<ViewStyle>;
  /**
   * Merged with (not replacing) the content container's own style — the
   * scrollable inner style when `scroll`/`onRefresh` is set. In the
   * non-scroll branch, where this and `style` apply to the same node,
   * `style` wins on overlapping keys.
   */
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

  // One padding value per edge — the standard `spacing.md` padding (when
  // `padded`) plus that edge's safe-area inset (when the edge is included in
  // `edges`) — summed onto a single edge-specific key. This must NOT be
  // split into a `padding` shorthand plus separate per-edge overrides on the
  // same style node: React Native/Yoga resolves a specific edge (Edge::Left)
  // before the shorthand (Edge::All) regardless of array order, so a
  // `padding` shorthand sharing a style object with explicit
  // paddingLeft/paddingRight is silently ignored for those edges. That was
  // the bug — `padded` had no effect and every scrolling screen lost its
  // horizontal gutter.
  const pad = padded ? theme.spacing.md : 0;
  const paddingStyle: ViewStyle = {
    paddingTop: pad + (edges.includes("top") ? insets.top : 0),
    paddingBottom: pad + (edges.includes("bottom") ? insets.bottom : 0),
    paddingLeft: pad + (edges.includes("left") ? insets.left : 0),
    paddingRight: pad + (edges.includes("right") ? insets.right : 0),
  };

  const baseStyle: ViewStyle = {
    flex: 1,
    backgroundColor: theme.colors.neutral[50],
  };

  if (scroll || onRefresh) {
    return (
      <ScrollView
        style={[baseStyle, style]}
        // Padding (standard + insets) lives here, not on the ScrollView's
        // own `style`, on purpose: putting it on `style` clips content at
        // the inset instead of letting it scroll under the notch.
        // `flexGrow: 1` is what stops a `flex: 1` child (e.g.
        // EmptyState/ErrorState) from collapsing to zero height — a plain
        // `{ padding }` contentContainerStyle gives the content no flex
        // basis to grow into.
        contentContainerStyle={[paddingStyle, { flexGrow: 1 }, contentContainerStyle]}
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
    <View style={[baseStyle, paddingStyle, contentContainerStyle, style]}>
      {children}
    </View>
  );
}
