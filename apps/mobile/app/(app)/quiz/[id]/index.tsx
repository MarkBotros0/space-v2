import { useLocalSearchParams } from "expo-router";

import { Screen, Text } from "../../../../src/ui";

export default function QuizDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen edges={["top", "left", "right"]}>
      <Text variant="heading">Quiz {id}</Text>
    </Screen>
  );
}
