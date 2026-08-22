import { EmptyState, Screen } from "../../src/ui";

export default function HistoryScreen() {
  return (
    <Screen edges={["top", "left", "right"]}>
      <EmptyState title="History" message="This screen isn't built yet." />
    </Screen>
  );
}
