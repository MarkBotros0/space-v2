import { useLocalSearchParams } from "expo-router";

import { NAV_ICONS } from "../../../src/design/icons/nav-icon";
import { ShellFrame } from "../../../src/design/layout/shell-frame";
import { EmptyState } from "../../../src/design/ui";
import { seasonParam } from "../../../src/lib/season-param";
import { LeaderQueue } from "../../../src/screens/leader-submissions";
import { StaffPendingQueue } from "../../../src/screens/staff-queue/pending-queue";
import { useRole } from "../../../src/store/session";

/** The Submissions tab: the leader's review queue, a pending list for other staff. */
export default function SubmissionsScreen() {
  const role = useRole();
  const seasonId = seasonParam(useLocalSearchParams<{ seasonId?: string }>().seasonId);
  // STUDENT gets 403 from GET /submissions; no user means nothing to ask for.
  const isStaff = role !== null && role !== "STUDENT";

  if (role === "LEADER") return <LeaderQueue />;
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
