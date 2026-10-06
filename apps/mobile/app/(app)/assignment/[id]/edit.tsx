// Task 9 replaces the body
import { useLocalSearchParams } from "expo-router";

import { Screen, Text } from "../../../../src/ui";

export default function EditAssignmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen edges={["top", "left", "right"]}>
      <Text variant="heading">{`Edit assignment ${id}`}</Text>
    </Screen>
  );
}
