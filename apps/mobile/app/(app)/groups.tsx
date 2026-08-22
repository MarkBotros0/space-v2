import { EmptyState, Screen } from "../../src/ui";

export default function GroupsScreen() {
  return (
    <Screen edges={["top", "left", "right"]}>
      <EmptyState title="Groups" message="This screen isn't built yet." />
    </Screen>
  );
}
