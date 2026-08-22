import { EmptyState, Screen } from "../../src/ui";

export default function EventsScreen() {
  return (
    <Screen edges={["top", "left", "right"]}>
      <EmptyState title="JPC Events" message="This screen isn't built yet." />
    </Screen>
  );
}
