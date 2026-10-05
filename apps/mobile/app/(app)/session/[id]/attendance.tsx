import { useLocalSearchParams } from "expo-router";

import { Screen, Text } from "../../../../src/ui";

export default function AttendanceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen edges={["top", "left", "right"]}>
      <Text variant="heading">{`Attendance for session ${id}`}</Text>
    </Screen>
  );
}
