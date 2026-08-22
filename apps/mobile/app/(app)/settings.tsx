import { EmptyState, Screen } from "../../src/ui";

export default function SettingsScreen() {
  return (
    <Screen edges={["top", "left", "right"]}>
      <EmptyState title="Settings" message="This screen isn't built yet." />
    </Screen>
  );
}
