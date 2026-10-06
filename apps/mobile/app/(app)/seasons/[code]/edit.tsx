// Stub — replaced by a later task of Plan 6.
import { useLocalSearchParams } from "expo-router";

import { Screen, Text } from "../../../../src/ui";

export default function SeasonEditScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return (
    <Screen edges={["top", "left", "right"]}>
      <Text variant="heading">{`Edit season ${code}`}</Text>
    </Screen>
  );
}
