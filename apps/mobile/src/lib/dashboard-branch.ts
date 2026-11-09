import { isAlumnus, isStudyingAlumnus, type NavAudience, type UserRole } from "@space/shared";

type DashboardBranch = UserRole | "ALUMNI";

/**
 * Which Home a user sees — the same audience rule as `navFor`: an alumnus has
 * their own, unless studying.
 * One route, six branches (spec 19 §9).
 */
export function dashboardBranchFor(audience: NavAudience): DashboardBranch {
  if (isAlumnus(audience) && !isStudyingAlumnus(audience)) return "ALUMNI";
  return audience.role;
}
