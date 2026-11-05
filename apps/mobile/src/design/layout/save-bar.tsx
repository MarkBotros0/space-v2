/**
 * Pinned primary action. `SaveBar` is for full screens: pass it as
 * `Screen`'s `footer`, which pins it outside the scroll view, rides it on the
 * keyboard and pads the content by its height; there it draws only its body.
 * Rendered anywhere else it pins itself above the floating tab bar
 * (useShellBottomPadding) and rides up with the keyboard, but nothing pads
 * the content for it. `SaveBarBody` is the shared look, reused by the
 * sheet's `SheetSaveBar`.
 */
import { useContext } from "react";
import { View } from "react-native";

import { useKeyboardBottomOffset } from "../lib/keyboard-offset";
import { Button } from "../ui/button";
import { Text } from "../ui/text";
import { ScreenFooterContext, useShellBottomPadding } from "./shell-context";

type SaveBarProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  hint?: string;
  /** Blocks the primary action only. */
  disabled?: boolean;
  /** A second, quieter action beside the primary (Save draft beside Submit). */
  secondary?: { label: string; onPress: () => void; disabled?: boolean };
  /** The button look; a bar that confirms a destructive action passes "destructive". Default "primary". */
  variant?: "primary" | "destructive";
  /**
   * Short form for a bar squeezed by the keyboard: no hint, and the secondary
   * sits beside the primary instead of above it. Default off.
   */
  compact?: boolean;
};

function SaveBarBody({ label, onPress, loading, hint, disabled, secondary, variant = "primary", compact }: SaveBarProps) {
  const sideBySide = compact && secondary;
  return (
    <View className="gap-2 border-t border-separator bg-surface px-4 pt-3">
      {hint && !compact ? (
        <Text variant="caption" className="text-muted-foreground">
          {hint}
        </Text>
      ) : null}
      <View className={sideBySide ? "flex-row gap-2" : "gap-2"}>
        {secondary ? (
          <Button
            variant="secondary"
            onPress={secondary.onPress}
            disabled={secondary.disabled}
            className={sideBySide ? "min-w-0 flex-1" : "w-full"}
          >
            {secondary.label}
          </Button>
        ) : null}
        <Button
          variant={variant}
          onPress={onPress}
          loading={loading}
          disabled={disabled}
          className={sideBySide ? "min-w-0 flex-1" : "w-full"}
        >
          {label}
        </Button>
      </View>
    </View>
  );
}

function SaveBar(props: SaveBarProps) {
  const inFooter = useContext(ScreenFooterContext);
  const offset = useKeyboardBottomOffset(useShellBottomPadding());
  if (inFooter) {
    return (
      <View testID="save-bar">
        <SaveBarBody {...props} />
      </View>
    );
  }
  return (
    <View testID="save-bar" style={{ position: "absolute", left: 0, right: 0, bottom: offset }}>
      <SaveBarBody {...props} />
    </View>
  );
}

export { SaveBar, SaveBarBody };
export type { SaveBarProps };
