import { useLocalSearchParams } from "expo-router";

import { Screen, Text } from "../../../src/ui";

export default function SubmissionReviewScreen() {
  const { publicId } = useLocalSearchParams<{ publicId: string }>();
  return (
    <Screen edges={["top", "left", "right"]}>
      <Text variant="heading">{`Submission ${publicId}`}</Text>
    </Screen>
  );
}
