import type { SessionUser } from "../auth/tokens";
import { isAdminOfSeason, isMentor, isSuper } from "../rbac";

/**
 * Which seasons a caller may see report data for.
 *
 * `null` means "this surface is not theirs at all" — the caller gets 403
 * before any query runs. That is deliberate for LEADER: v1 excluded leaders
 * from this domain by not having a leader route (R109), and the v2 route tree
 * is flat and role-driven, so `/reports` exists as a file regardless of role
 * and is hidden only by navFor. Domain 4 already found one ported endpoint
 * that trusted groupLeaderIds without checking the target; a leader-scoped
 * report is a reasonable future feature and must not arrive by accident as
 * "the whole season, filtered on the client" (spec D6 #4).
 *
 * An ADMIN with no seasons returns an EMPTY permitted list, not null: they may
 * open the screen, it is simply empty (R2). Distinguishing the two matters —
 * 403 would tell an admin their account is broken.
 */
export type ReportScope = { kind: "all" } | { kind: "seasons"; seasonIds: number[] };

export function reportScopeFor(user: SessionUser): ReportScope | null {
  // MENTOR's remit is read-all-students (rbac.ts:41-43) and v1 gives them an
  // unscoped engagement CSV (R45), so "all" here is a port, not a widening.
  // SUPER gains the engagement view that v1's per-role page tree denied them
  // while its export route handed them the same data (spec D17) — a deliberate
  // divergence, recorded in this plan's ledger row 10.
  if (isSuper(user) || isMentor(user)) return { kind: "all" };
  if (user.role === "ADMIN") return { kind: "seasons", seasonIds: user.seasonAdminIds };
  return null;
}

/**
 * Who may download a season's full workbook.
 *
 * MENTOR is refused. v1's endpoint allows MENTOR any season id (R85) and the
 * only thing preventing it is that /mentor/reports never renders the button
 * (R86) — the domain's clearest example of authorization by absence of a
 * control. A mentor's remit is read-all-STUDENTS; a season workbook is also
 * every quiz score and every assignment status, which is nearer a leader's
 * remit than a mentor's (spec D6 #3).
 *
 * isAdminOfSeason short-circuits for SUPER and pairs the ADMIN role with the
 * seasonAdminIds claim (ruling C7), so a stray SeasonAdmin row naming a
 * student grants nothing.
 */
export function canExportSeasonWorkbook(user: SessionUser, seasonId: number): boolean {
  return isAdminOfSeason(user, seasonId);
}
