import { EmptyState, Screen } from "../../src/ui";

export default function NotesScreen() {
  return (
    <Screen edges={["top", "left", "right"]}>
      <EmptyState title="Notes" message="This screen isn't built yet." />
    </Screen>
  );
}
