import { EmptyState, Screen } from "../../src/ui";

export default function ProfileScreen() {
  return (
    <Screen edges={["top", "left", "right"]}>
      <EmptyState title="Profile" message="This screen isn't built yet." />
    </Screen>
  );
}
