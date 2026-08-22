import { EmptyState, Screen } from "../../../src/ui";

export default function StudentsScreen() {
  return (
    <Screen edges={["top", "left", "right"]}>
      <EmptyState title="Students" message="This screen isn't built yet." />
    </Screen>
  );
}
