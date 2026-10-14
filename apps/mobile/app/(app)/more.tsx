import { useRouter } from "expo-router";

import { MoreMenu } from "../../src/design/layout/more-menu";
import { ShellFrame } from "../../src/design/layout/shell-frame";
import { useLogout } from "../../src/hooks/use-session";
import { navHref } from "../../src/lib/nav-routes";
import { useSessionStore } from "../../src/store/session";

/** v1 /<role>/more → components/layout/more-menu.tsx. Items come from navFor (B2-5). */
export default function MoreScreen() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const nav = useSessionStore((s) => s.nav());
  const logout = useLogout();

  if (!user || !nav) return <ShellFrame>{null}</ShellFrame>;

  return (
    <ShellFrame>
      <MoreMenu
        role={user.role}
        userName={user.name}
        nav={nav}
        onNavigate={(href) => {
          const target = navHref(href);
          if (target) router.push(target);
        }}
        onSignOut={() => void logout()}
      />
    </ShellFrame>
  );
}
