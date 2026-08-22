import { EmptyState, Screen } from "../../src/ui";

export default function SubmissionsScreen() {
  return (
    <Screen edges={["top", "left", "right"]}>
      <EmptyState title="Submissions" message="This screen isn't built yet." />
    </Screen>
  );
}
