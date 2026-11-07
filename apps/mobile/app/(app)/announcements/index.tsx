import { Screen } from "../../../src/design/layout/screen";
import { EmptyState } from "../../../src/design/ui";

/** Placeholder: Task 7 replaces it with the Announcements feed. */
export default function AnnouncementsScreen() {
  return (
    <Screen title="Announcements">
      <EmptyState title="No announcements yet" />
    </Screen>
  );
}
