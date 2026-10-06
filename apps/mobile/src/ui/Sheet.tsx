import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../theme";
import { Text } from "./Text";

export interface SheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Bottom sheet (Plan 10 Decision 7) — v1's modals become sheets per the
 * mobile conventions (spec 06 §9). An RN Modal sliding up, a tappable
 * backdrop, and the bottom inset added to the sheet's own bottom padding
 * (per-edge only — never a `padding` shorthand plus overrides; Yoga resolves
 * the specific edge first, see Screen).
 */
export function Sheet({ visible, title, onClose, children }: SheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.black, opacity: 0.4 }]}
        />
        <View
          style={{
            backgroundColor: theme.colors.white,
            borderTopLeftRadius: theme.radii.lg,
            borderTopRightRadius: theme.radii.lg,
            paddingTop: theme.spacing.lg,
            paddingLeft: theme.spacing.md,
            paddingRight: theme.spacing.md,
            paddingBottom: insets.bottom + theme.spacing.lg,
            gap: theme.spacing.md,
          }}
        >
          <Text variant="heading" accessibilityRole="header">
            {title}
          </Text>
          {children}
        </View>
      </View>
    </Modal>
  );
}
