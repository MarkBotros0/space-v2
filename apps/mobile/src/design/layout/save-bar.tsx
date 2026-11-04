/**
 * Pinned primary action. `SaveBar` is for full screens: it sits above the
 * floating tab bar (useShellBottomPadding) and rides up with the keyboard.
 * `SaveBarBody` is the shared look, reused by the sheet's `SheetSaveBar`.
 */
import { View } from "react-native";

import { useKeyboardBottomOffset } from "../lib/keyboard-offset";
import { Button } from "../ui/button";
import { Text } from "../ui/text";
import { useShellBottomPadding } from "./shell-context";

type SaveBarProps = { label: string; onPress: () => void; loading?: boolean; hint?: string };

function SaveBarBody({ label, onPress, loading, hint }: SaveBarProps) {
  return (
    <View className="gap-2 border-t border-separator bg-surface px-4 pt-3">
      {hint ? (
        <Text variant="caption" className="text-muted-foreground">
          {hint}
        </Text>
      ) : null}
      <Button onPress={onPress} loading={loading} className="w-full">
        {label}
      </Button>
    </View>
  );
}

function SaveBar(props: SaveBarProps) {
  const offset = useKeyboardBottomOffset(useShellBottomPadding());
  return (
    <View testID="save-bar" style={{ position: "absolute", left: 0, right: 0, bottom: offset }}>
      <SaveBarBody {...props} />
    </View>
  );
}

export { SaveBar, SaveBarBody };
export type { SaveBarProps };
