import { NotificationPreferences } from "../../../src/screens/settings/notification-preferences";
import { Screen } from "../../../src/design/layout/screen";

/** Notification settings: opened from More's Settings and the gear on Notifications. */
export default function NotificationSettingsScreen() {
  return (
    <Screen title="Notification settings">
      <NotificationPreferences />
    </Screen>
  );
}
