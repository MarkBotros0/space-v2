import { EmptyState, Screen } from "../../src/ui";

export default function UsersScreen() {
  return (
    <Screen edges={["top", "left", "right"]}>
      <EmptyState title="Users" message="This screen isn't built yet." />
    </Screen>
  );
}
