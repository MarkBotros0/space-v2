import { EmptyState, Screen } from "../../../src/ui";

export default function DroppedStudentsScreen() {
  return (
    <Screen edges={["top", "left", "right"]}>
      <EmptyState title="Dropped Students" message="This screen isn't built yet." />
    </Screen>
  );
}
