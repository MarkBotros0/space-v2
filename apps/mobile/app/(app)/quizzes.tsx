import { EmptyState, Screen } from "../../src/ui";

export default function QuizzesScreen() {
  return (
    <Screen edges={["top", "left", "right"]}>
      <EmptyState title="Quizzes" message="This screen isn't built yet." />
    </Screen>
  );
}
