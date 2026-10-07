import type { NavAudience, UserRole } from "@space/shared";

export type DashboardBranch = UserRole | "ALUMNI";

/**
 * Which Home a user sees — the same audience rule as `navFor` (an alumnus is a
 * STUDENT with a graduationYear). One route, six branches (spec 19 §9).
 */
export function dashboardBranchFor(audience: NavAudience): DashboardBranch {
  if (audience.role === "STUDENT" && audience.graduationYear != null) return "ALUMNI";
  return audience.role;
}
