import { useRouter } from "expo-router";
import { View } from "react-native";

import { Screen } from "../../design/layout/screen";
import { GroupedList, ListRow } from "../../design/ui/grouped-list";
import { ThemeToggle } from "../../design/ui/theme-toggle";
import { useDeleteAccountFlow } from "../../components/DeleteAccount";
import { useLogout } from "../../hooks/use-session";
import { useSessionStore } from "../../store/session";
import { IdentityCard } from "./identity-card";

/**
 * Every non-student role (Decision 2). MENTOR has Profile as a TAB but no More
 * tab, so this screen is their only route to their settings and to signing out on a
 * phone (spec 18 R9, R11 — v1's /mentor/profile never existed). Reads only the
 * session store: no student endpoint is called. The identity card is the one
 * card; the destinations are a grouped list. Nothing here is role-specific.
 */
export function AccountProfile() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const logout = useLogout();
  const deleteFlow = useDeleteAccountFlow();

  return (
    <Screen title="Profile">
      <View className="flex-col gap-4">
        {user ? <IdentityCard name={user.name} email={user.email} badge={user.role} /> : null}
        <GroupedList>
          <ListRow title="Profile settings" chevron onPress={() => router.push("/settings/profile")} />
          <ListRow
            title="Notifications"
            chevron
            onPress={() => router.push("/notifications")}
          />
        </GroupedList>
        {/* MENTOR has no More tab: the theme and the account actions are here too. */}
        <GroupedList>
          <ListRow
            title="Appearance"
            subtitle="Switch between light and dark."
            subtitleLines={2}
            trailing={<ThemeToggle size="icon" />}
          />
        </GroupedList>
        <GroupedList>
          <ListRow title="Sign out" destructive onPress={() => void logout()} />
          <ListRow
            title="Delete account"
            subtitle="Removes your account and signs you out everywhere."
            subtitleLines={2}
            destructive
            onPress={deleteFlow.request}
          />
        </GroupedList>
        {deleteFlow.dialog}
      </View>
    </Screen>
  );
}
