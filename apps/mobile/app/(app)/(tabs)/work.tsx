import { Screen } from "../../../src/design/layout/screen";
import { NAV_ICONS } from "../../../src/design/icons/nav-icon";
import { EmptyState } from "../../../src/design/ui";
import { WorkScreen } from "../../../src/screens/work/work-screen";
import { useRole } from "../../../src/store/session";

/**
 * /work — the student's To do tab: open assignments and quizzes (P2-1, split 2026-11-06). A tab for no other
 * role, so a staff deep link gets what every shared route says, not a student's
 * reads. An alumnus who isn't studying has the STUDENT role and never reaches this
 * far: (app)'s layout sends them to /dashboard first (isBlockedForAlumni). One
 * studying in a community-wide season (isStudyingAlumnus) gets this tab like any student.
 */
export default function WorkTab() {
  const role = useRole();
  if (role !== "STUDENT") {
    return (
      <Screen title="To do">
        <EmptyState icon={NAV_ICONS.todo} title="To do" description="This screen isn't available for your role." />
      </Screen>
    );
  }
  return <WorkScreen />;
}
