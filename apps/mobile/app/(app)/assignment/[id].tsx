import { useLocalSearchParams } from "expo-router";

import { Screen, Text } from "../../../src/ui";

export default function AssignmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen edges={["top", "left", "right"]}>
      <Text variant="heading">{`Assignment ${id}`}</Text>
    </Screen>
  );
}
