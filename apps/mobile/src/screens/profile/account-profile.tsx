import { useRouter } from "expo-router";
import { View } from "react-native";

import { Screen } from "../../design/layout/screen";
import { Button } from "../../design/ui/button";
import { GroupedList, ListRow } from "../../design/ui/grouped-list";
import { useLogout } from "../../hooks/use-session";
import { useSessionStore } from "../../store/session";
import { IdentityCard } from "./identity-card";

/**
 * Every non-student role (Decision 2). MENTOR has Profile as a TAB but no More
 * tab, so this screen is their only route to Settings and to signing out on a
 * phone (spec 18 R9, R11 — v1's /mentor/profile never existed). Reads only the
 * session store: no student endpoint is called. The identity card is the one
 * card; the destinations are a grouped list. Nothing here is role-specific.
 */
export function AccountProfile() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const logout = useLogout();

  return (
    <Screen title="Profile">
      <View className="flex-col gap-4">
        {user ? <IdentityCard name={user.name} email={user.email} badge={user.role} /> : null}
        <GroupedList>
          <ListRow title="Settings" chevron index={0} onPress={() => router.push("/settings")} />
          <ListRow title="Notifications" chevron index={1} onPress={() => router.push("/notifications")} />
        </GroupedList>
        <Button variant="secondary" className="self-start" onPress={() => void logout()}>
          Sign out
        </Button>
      </View>
    </Screen>
  );
}
