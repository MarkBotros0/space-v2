import { useRouter } from "expo-router";

import { useDeleteAccountFlow } from "../../../src/components/DeleteAccount";
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
        onSignOut={() => void logout()}
        onDeleteAccount={deleteFlow.request}
      />
      {deleteFlow.dialog}
    </>
  );
}
