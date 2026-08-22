import { EmptyState, Screen } from "../../src/ui";

export default function SeasonsScreen() {
  return (
    <Screen edges={["top", "left", "right"]}>
      <EmptyState title="Seasons" message="This screen isn't built yet." />
    </Screen>
  );
}
