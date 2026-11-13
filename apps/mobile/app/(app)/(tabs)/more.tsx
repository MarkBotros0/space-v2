import { useRouter } from "expo-router";

import { useDeleteAccountFlow } from "../../../src/screens/profile/delete-account";
import { useSignOutFlow } from "../../../src/screens/profile/sign-out";
import { MoreMenu } from "../../../src/design/layout/more-menu";
import { Screen } from "../../../src/design/layout/screen";
import { useLogout } from "../../../src/hooks/use-session";
import { navHref } from "../../../src/lib/nav-routes";
import { useSessionStore } from "../../../src/store/session";

/** v1 /<role>/more → components/layout/more-menu.tsx. Items come from navFor (B2-5). */
export default function MoreScreen() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const nav = useSessionStore((s) => s.nav());
  const logout = useLogout();
  const deleteFlow = useDeleteAccountFlow();
  const signOutFlow = useSignOutFlow(logout);

  if (!user || !nav) return <Screen title="More">{null}</Screen>;

  return (
    <>
      <MoreMenu
        role={user.role}
        userName={user.name}
        nav={nav}
        onNavigate={(href) => {
          const target = navHref(href);
          if (target) router.push(target);
        }}
        onOpenProfile={() => router.push("/profile")}
        onSignOut={signOutFlow.request}
        onDeleteAccount={deleteFlow.request}
      />
      {signOutFlow.dialog}
      {deleteFlow.dialog}
    </>
  );
}
