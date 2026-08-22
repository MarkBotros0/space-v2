import { EmptyState, Screen } from "../../src/ui";

export default function CalendarScreen() {
  return (
    <Screen edges={["top", "left", "right"]}>
      <EmptyState title="Calendar" message="This screen isn't built yet." />
    </Screen>
  );
}
