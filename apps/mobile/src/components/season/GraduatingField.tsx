import { View } from "react-native";

import { Switch, Text } from "../../design/ui";

/** SUPER's graduating switch, written out once the season has finished and it can no longer move. */
export function GraduatingField({
  value,
  editable,
  onChange,
}: {
  value: boolean;
  editable: boolean;
  onChange: (next: boolean) => void;
}) {
  if (!editable) {
    return (
      <View className="flex-col gap-1">
        <Text className="text-sm font-semibold text-foreground">Graduating season</Text>
        <Text variant="body" className="text-foreground">
          {value ? "Yes" : "No"}. It can&apos;t change now the season has finished.
        </Text>
      </View>
    );
  }
  return (
    <View className="flex-col gap-1">
      <View className="flex-row items-center gap-3">
        <Text className="min-w-0 flex-1 text-sm font-semibold text-foreground" onPress={() => onChange(!value)}>
          Graduating season
        </Text>
        <Switch accessibilityLabel="Graduating season" checked={value} onCheckedChange={onChange} />
      </View>
      <Text variant="subhead" className="text-muted-foreground">
        Everyone who passes becomes an alumnus when the season ends, School of the season&apos;s year.
      </Text>
    </View>
  );
}
