import { EmptyState, Screen } from "../../src/ui";

export default function ReportsScreen() {
  return (
    <Screen edges={["top", "left", "right"]}>
      <EmptyState title="Reports" message="This screen isn't built yet." />
    </Screen>
  );
}
