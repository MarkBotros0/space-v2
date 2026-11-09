import type { MeScopes, MeUser } from "@space/shared";

/**
 * Ruling C7 on the client: SUPER passes; otherwise the ADMIN role AND the claim
 * for that season. A stray SeasonAdmin row on a STUDENT grants nothing here
 * (stricter than lib/rbac.ts, which only excludes MENTOR; the derived role
 * makes the two agree on every token the server issues).
 */
export function isAdminOfSeasonForUi(
  user: Pick<MeUser, "role"> | null,
  scopes: MeScopes | null,
  seasonId: number,
): boolean {
  if (!user || !scopes) return false;
  if (user.role === "SUPER") return true;
  return user.role === "ADMIN" && scopes.seasonAdminIds.includes(seasonId);
}
