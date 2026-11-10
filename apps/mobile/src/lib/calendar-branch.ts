import { isAlumnusNotStudying, type NavAudience } from "@space/shared";

export type CalendarBranch = "UNAVAILABLE" | "LEADS_NOTHING" | "LEADER" | "SUPER" | "ADMIN" | "ALUMNI" | "STUDENT";

/**
 * Which calendar a user sees (refactor FE-060), in this order: a mentor has none (spec 03 §9), a
 * leader who leads no group is told so, leaders, supers and admins get their own, an alumnus not
 * studying gets the alumni calendar, everyone else the student's.
 */
export function calendarBranchFor(audience: NavAudience | null, groupLeaderIds: readonly number[]): CalendarBranch {
  const role = audience?.role ?? null;
  if (role === "MENTOR") return "UNAVAILABLE";
  if (role === "LEADER") return groupLeaderIds.length === 0 ? "LEADS_NOTHING" : "LEADER";
  if (role === "SUPER" || role === "ADMIN") return role;
  if (audience && isAlumnusNotStudying(audience)) return "ALUMNI";
  return "STUDENT";
}
