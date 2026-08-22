import { EmptyState, Screen } from "../../src/ui";

export default function SeasonScreen() {
  return (
    <Screen edges={["top", "left", "right"]}>
      <EmptyState title="My Season" message="This screen isn't built yet." />
    </Screen>
  );
}
