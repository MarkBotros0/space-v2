import { Screen } from "../../../src/design/layout/screen";
import { NAV_ICONS } from "../../../src/design/icons/nav-icon";
import { EmptyState } from "../../../src/design/ui";
import { WorkScreen } from "../../../src/screens/work/work-screen";
import { useSessionStore } from "../../../src/store/session";

/**
 * /work — the student's merged assignments and quizzes (P2-1). A tab for no other
 * role, so a staff deep link gets what every shared route says, not a student's
 * reads. An alumnus has the STUDENT role and never reaches this far: (app)'s
 * layout sends them to /dashboard first (isBlockedForAlumni).
 */
export default function WorkTab() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  if (role !== "STUDENT") {
    return (
      <Screen title="Work">
        <EmptyState
          icon={NAV_ICONS.assignments}
          title="Work"
          description="This screen isn't available for your role."
        />
      </Screen>
    );
  }
  return <WorkScreen />;
}
