import { isAlumnus, type NavAudience, type UserRole } from "@space/shared";

export type DashboardBranch = UserRole | "ALUMNI";

/**
 * Which Home a user sees — the same audience rule as `navFor` (`isAlumnus`).
 * One route, six branches (spec 19 §9).
 */
export function dashboardBranchFor(audience: Pick<NavAudience, "role" | "graduationYear">): DashboardBranch {
  if (isAlumnus(audience)) return "ALUMNI";
  return audience.role;
}
