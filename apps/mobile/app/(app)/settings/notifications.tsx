import { NotificationPreferences } from "../../../src/components/NotificationPreferences";
import { Screen } from "../../../src/design/layout/screen";

/** Settings → Notification settings. */
export default function NotificationSettingsScreen() {
  return (
    <Screen title="Notifications">
      <NotificationPreferences />
    </Screen>
  );
}
