import { useRouter } from "expo-router";

import { useDeleteAccountFlow } from "../../components/DeleteAccount";
import { GroupedList, ListRow } from "../../design/ui/grouped-list";
import { ThemeToggle } from "../../design/ui/theme-toggle";
import { useLogout } from "../../hooks/use-session";

/**
 * What More holds, for a role with no More tab (MENTOR): Notifications, the theme,
 * Sign out and Delete account, under the profile.
 */
export function AccountActions() {
  const router = useRouter();
  const logout = useLogout();
  const deleteFlow = useDeleteAccountFlow();
  return (
    <>
      <GroupedList>
        <ListRow title="Notifications" chevron onPress={() => router.push("/notifications")} />
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
    </>
  );
}
