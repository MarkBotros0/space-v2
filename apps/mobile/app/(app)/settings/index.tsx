import { useRouter } from "expo-router";

import { Screen } from "../../../src/design/layout/screen";
import { GroupedList, ListRow } from "../../../src/design/ui/grouped-list";

/**
 * The settings hub: two destinations (owner, 2026-11-06). One route for every
 * role, ZERO role branches — spec 18 R3: every write underneath is
 * self-scoped (subject from the token, never the body). Do not add an
 * org-wide control here, ever — spec 18 §9's last row is the whole point.
 *
 * Not here, on purpose: passwords (only "Forgot password?" on sign-in sets a
 * new one), and Sign out / Delete account (they live on More; MENTOR, who has
 * no More tab, finds them on Profile).
 */
export default function SettingsScreen() {
  const router = useRouter();
  return (
    <Screen title="Settings">
      <GroupedList>
        <ListRow
          title="Profile details"
          subtitle="Name, phone, date of birth and address."
          chevron
          onPress={() => router.push("/settings/profile")}
        />
        <ListRow
          title="Notification settings"
          subtitle="Push on this phone and what you're notified about."
          subtitleLines={2}
          chevron
          onPress={() => router.push("/settings/notifications")}
        />
      </GroupedList>
    </Screen>
  );
}
