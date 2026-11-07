import { NotificationPreferences } from "../../../src/components/NotificationPreferences";
import { Screen } from "../../../src/design/layout/screen";

/** Notification settings: a More entry (Profile for MENTOR). */
export default function NotificationSettingsScreen() {
  return (
    <Screen title="Notification settings">
      <NotificationPreferences />
    </Screen>
  );
}
