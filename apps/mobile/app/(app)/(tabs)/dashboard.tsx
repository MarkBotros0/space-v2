import { AlumniDashboard } from "../../../src/components/dashboard/AlumniDashboard";
import { MentorDashboard } from "../../../src/components/dashboard/MentorDashboard";
import { dashboardBranchFor } from "../../../src/lib/dashboard-branch";
import { LeaderToday } from "../../../src/screens/leader-today";
import { RouteSkeleton } from "../../../src/design/layout/route-states";
import { ShellFrame } from "../../../src/design/layout/shell-frame";
import { AdminToday } from "../../../src/screens/staff-today/admin-today";
import { SuperToday } from "../../../src/screens/staff-today/super-today";
import { StudentToday } from "../../../src/screens/today/student-today";
import { useSessionStore, useRole } from "../../../src/store/session";

/**
 * Home — one route, one branch per audience (spec 19 §9, Phase 0 D1). Each
 * branch owns its queries, its loading/error/empty states and its
 * pull-to-refresh, and renders its frame with `home`: Home is the one screen
 * with the notification bell and the user menu (ruling R13).
 * The old per-screen assignment card is gone on purpose: its counts are now the
 * server's (spec 19 D15).
 */
export default function DashboardScreen() {
  const role = useRole();
  const graduationYear = useSessionStore((s) => s.scopes?.graduationYear ?? null);
  const activeSeasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);

  // The (app) layout only mounts for a signed-in user; this covers the frame
  // between boot and the session landing in the store.
  if (role === null) {
    return (
      <ShellFrame home>
        <RouteSkeleton />
      </ShellFrame>
    );
  }

  switch (dashboardBranchFor({ role, graduationYear, activeSeasonId })) {
    case "SUPER":
      return <SuperToday />;
    case "ADMIN":
      return <AdminToday />;
    case "LEADER":
      return <LeaderToday />;
    case "MENTOR":
      return <MentorDashboard />;
    case "STUDENT":
      return <StudentToday />;
    case "ALUMNI":
      return <AlumniDashboard />;
  }
}
