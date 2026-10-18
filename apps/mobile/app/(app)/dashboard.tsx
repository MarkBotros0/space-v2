import { AlumniDashboard } from "../../src/components/dashboard/AlumniDashboard";
import { MentorDashboard } from "../../src/components/dashboard/MentorDashboard";
import { AdminDashboard, LeaderDashboard } from "../../src/components/dashboard/StaffDashboard";
import { StudentDashboard } from "../../src/components/dashboard/StudentDashboard";
import { SuperDashboard } from "../../src/components/dashboard/SuperDashboard";
import { dashboardBranchFor } from "../../src/lib/dashboard-branch";
import { RouteSkeleton } from "../../src/design/layout/route-states";
import { ShellFrame } from "../../src/design/layout/shell-frame";
import { useSessionStore } from "../../src/store/session";

/**
 * Home — one route, one branch per audience (spec 19 §9, Phase 0 D1). Each
 * branch owns its queries, its loading/error/empty states and its
 * pull-to-refresh; the shell owns the notification bell.
 * The old per-screen assignment card is gone on purpose: its counts are now the
 * server's (spec 19 D15).
 */
export default function DashboardScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const graduationYear = useSessionStore((s) => s.scopes?.graduationYear ?? null);

  // The (app) layout only mounts for a signed-in user; this covers the frame
  // between boot and the session landing in the store.
  if (role === null) {
    return (
      <ShellFrame>
        <RouteSkeleton />
      </ShellFrame>
    );
  }

  switch (dashboardBranchFor({ role, graduationYear })) {
    case "SUPER":
      return <SuperDashboard />;
    case "ADMIN":
      return <AdminDashboard />;
    case "LEADER":
      return <LeaderDashboard />;
    case "MENTOR":
      return <MentorDashboard />;
    case "STUDENT":
      return <StudentDashboard />;
    case "ALUMNI":
      return <AlumniDashboard />;
  }
}
