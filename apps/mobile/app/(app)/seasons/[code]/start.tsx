import { Screen } from "../../../../src/design/layout/screen";
import { EmptyState } from "../../../../src/design/ui";

/**
 * Start season. PLACEHOLDER from Task 10 so the season screen's "Start season"
 * button has a typed route to open; Task 11 replaces this file with the real
 * checklist and the Start action.
 */
export default function StartSeasonScreen() {
  return (
    <Screen title="Start season">
      <EmptyState title="Not ready yet" description="Starting a season arrives in the next update." />
    </Screen>
  );
}
