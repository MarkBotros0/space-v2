import { useRouter } from "expo-router";
import { View } from "react-native";

import { PageTitle } from "../../design/layout/page-title";
import { ShellFrame } from "../../design/layout/shell-frame";
import { Button as ButtonV1 } from "../../design/ui";
import { useLogout } from "../../hooks/use-session";
import { useSessionStore } from "../../store/session";
import { IdentityCard } from "./identity-card";

/**
 * Every non-student role (Decision 2). MENTOR has Profile as a TAB but no More
 * tab, so this card is their only route to Settings and to signing out on a
 * phone (spec 18 R9, R11 — v1's /mentor/profile never existed). Reads only the
 * session store: no student endpoint is called. Drawn like the student's
 * identity card so it reads as the same screen.
 */
export function AccountProfile() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const logout = useLogout();

  return (
    <ShellFrame>
      <View className="flex-col gap-3">
        <PageTitle title="Profile" />
        {user ? <IdentityCard name={user.name} email={user.email} badge={user.role} /> : null}
        <View className="flex-col gap-2">
          <ButtonV1 onPress={() => router.push("/settings")}>Settings</ButtonV1>
          <ButtonV1 variant="outline" onPress={() => void logout()}>
            Sign out
          </ButtonV1>
        </View>
      </View>
    </ShellFrame>
  );
}
