import { EmptyState, Screen } from "../../src/ui";

export default function MoreScreen() {
  return (
    <Screen edges={["top", "left", "right"]}>
      <EmptyState title="More" message="This screen isn't built yet." />
    </Screen>
  );
}
