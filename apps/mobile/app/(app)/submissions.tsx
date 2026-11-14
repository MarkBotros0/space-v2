import { useLocalSearchParams } from "expo-router";

import { NAV_ICONS } from "../../src/design/icons/nav-icon";
import { ShellFrame } from "../../src/design/layout/shell-frame";
import { EmptyState } from "../../src/design/ui";
import { seasonParam } from "../../src/lib/season-param";
import { StaffWork } from "../../src/screens/staff-work";
import { StaffPendingQueue } from "../../src/screens/staff-queue/pending-queue";
import { useRole } from "../../src/store/session";

/**
 * /submissions: a pending list for staff. A LEADER has Work instead (owner 2026-11-14: the essay
 * lives inside its assignment), so an old link to here opens their Work.
 */
export default function SubmissionsScreen() {
  const role = useRole();
  const seasonId = seasonParam(useLocalSearchParams<{ seasonId?: string }>().seasonId);
  // STUDENT gets 403 from GET /submissions; no user means nothing to ask for.
  const isStaff = role !== null && role !== "STUDENT";

  if (role === "LEADER") return <StaffWork canAuthor={false} />;
  if (isStaff) return <StaffPendingQueue seasonId={seasonId} />;
  return (
    <ShellFrame>
      <EmptyState
        icon={NAV_ICONS.submissions}
        title="Submissions"
        description="This screen isn't available for your role."
      />
    </ShellFrame>
  );
}
