// Task 9 replaces the body
import { Screen, Text } from "../../../src/ui";

export default function NewAssignmentScreen() {
  return (
    <Screen edges={["top", "left", "right"]}>
      <Text variant="heading">New assignment</Text>
    </Screen>
  );
}
