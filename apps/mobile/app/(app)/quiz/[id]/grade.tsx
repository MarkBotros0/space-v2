import { useLocalSearchParams } from "expo-router";

import { Screen, Text } from "../../../../src/ui";

export default function QuizGradeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen edges={["top", "left", "right"]}>
      <Text variant="heading">Grade quiz {id}</Text>
    </Screen>
  );
}
