import { useLocalSearchParams } from "expo-router";

import { Screen, Text } from "../../../../src/ui";

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen edges={["top", "left", "right"]}>
      <Text variant="heading">Session {id}</Text>
    </Screen>
  );
}
