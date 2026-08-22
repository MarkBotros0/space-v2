import { EmptyState, Screen } from "../../src/ui";

export default function AssignmentsScreen() {
  return (
    <Screen edges={["top", "left", "right"]}>
      <EmptyState title="Assignments" message="This screen isn't built yet." />
    </Screen>
  );
}
