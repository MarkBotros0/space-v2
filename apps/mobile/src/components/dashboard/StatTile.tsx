import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { useTheme } from "../../theme";
import { Card, Text } from "../../ui";

export interface StatTileProps {
  label: string;
  value: string;
  caption?: string;
  onPress?: () => void;
  /** "warning" highlights a count that needs attention (v1 R71). No red tiers (spec 19 D2). */
  tone?: "neutral" | "warning";
}

/** v1's stat-card: the whole tile is the link when it has a destination. */
export function StatTile({ label, value, caption, onPress, tone = "neutral" }: StatTileProps) {
  const theme = useTheme();
  const body = (
    <Card style={{ flex: 1 }}>
      <Text variant="caption" color={theme.colors.neutral[600]}>
        {label}
      </Text>
      <Text
        variant="title"
        color={tone === "warning" ? theme.colors.warning[700] : theme.colors.neutral[900]}
      >
        {value}
      </Text>
      {caption ? (
        <Text variant="caption" color={theme.colors.neutral[600]}>
          {caption}
        </Text>
      ) : null}
    </Card>
  );
  const a11yLabel = `${label}: ${value}`;

  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      onPress={onPress}
      style={{ flexBasis: "47%", flexGrow: 1 }}
    >
      {body}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={a11yLabel} style={{ flexBasis: "47%", flexGrow: 1 }}>
      {body}
    </View>
  );
}

export function TileRow({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: theme.spacing.sm,
        marginBottom: theme.spacing.sm,
      }}
    >
      {children}
    </View>
  );
}
