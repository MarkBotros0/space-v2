import { EmptyState, Screen } from "../../src/ui";

export default function DashboardScreen() {
  return (
    <Screen edges={["top", "left", "right"]}>
      <EmptyState title="Dashboard" message="This screen isn't built yet." />
    </Screen>
  );
}
