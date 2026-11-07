import { Screen } from "../../../src/design/layout/screen";
import { NAV_ICONS } from "../../../src/design/icons/nav-icon";
import { EmptyState } from "../../../src/design/ui";
import { SubmittedScreen } from "../../../src/screens/work/work-screen";
import { useSessionStore } from "../../../src/store/session";

/**
 * /submitted — what the student handed in and its grading (owner, 2026-11-06). A tab for no other
 * role, so a staff deep link gets what every shared route says, not a student's
 * reads. An alumnus who isn't studying has the STUDENT role and never reaches this
 * far: (app)'s layout sends them to /dashboard first (isBlockedForAlumni). One
 * studying in a community-wide season (isStudyingAlumnus) gets this tab like any student.
 */
export default function SubmittedTab() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  if (role !== "STUDENT") {
    return (
      <Screen title="Submitted">
        <EmptyState
          icon={NAV_ICONS.submitted}
          title="Submitted"
          description="This screen isn't available for your role."
        />
      </Screen>
    );
  }
  return <SubmittedScreen />;
}
