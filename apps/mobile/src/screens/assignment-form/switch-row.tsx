/**
 * A labelled switch the whole row of which toggles it: a 44pt target for the
 * 24pt switch, read as one switch with the label as its name.
 */
import { Pressable, View } from "react-native";

import { Switch } from "../../design/ui/switch";
import { Text } from "../../design/ui/text";

export function SwitchRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      className="min-h-[44px] flex-row items-center gap-3"
    >
      <View className="min-w-0 flex-1 flex-col">
        <Text variant="body" className="text-foreground">
          {label}
        </Text>
        {description ? (
          <Text variant="caption" className="text-muted-foreground">
            {description}
          </Text>
        ) : null}
      </View>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Switch checked={checked} />
      </View>
    </Pressable>
  );
}
