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
import { type LayoutChangeEvent, View } from "react-native";

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
  /** `SaveBar` only: reports the bar's height, so the screen can leave room under its content. */
  onLayout?: (e: LayoutChangeEvent) => void;
};

function SaveBarBody({ label, onPress, loading, hint, disabled, secondary }: Omit<SaveBarProps, "onLayout">) {
  return (
    <View className="gap-2 border-t border-separator bg-surface px-4 pt-3">
      {hint ? (
        <Text variant="caption" className="text-muted-foreground">
          {hint}
        </Text>
      ) : null}
      {secondary ? (
        <Button variant="secondary" onPress={secondary.onPress} disabled={secondary.disabled} className="w-full">
          {secondary.label}
        </Button>
      ) : null}
      <Button onPress={onPress} loading={loading} disabled={disabled} className="w-full">
        {label}
      </Button>
    </View>
  );
}

function SaveBar({ onLayout, ...props }: SaveBarProps) {
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
    <View testID="save-bar" onLayout={onLayout} style={{ position: "absolute", left: 0, right: 0, bottom: offset }}>
      <SaveBarBody {...props} />
    </View>
  );
}

export { SaveBar, SaveBarBody };
export type { SaveBarProps };
