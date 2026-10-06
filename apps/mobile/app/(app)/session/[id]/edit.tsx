// Stub — replaced by a later task of Plan 6.
import { useLocalSearchParams } from "expo-router";

import { Screen, Text } from "../../../../src/ui";

export default function EditSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen edges={["top", "left", "right"]}>
      <Text variant="heading">{`Edit session ${id}`}</Text>
    </Screen>
  );
}
