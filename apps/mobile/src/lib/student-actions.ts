import type { EnrollmentHistoryItem, MeScopes, MeUser } from "@space/shared";

/**
 * Ruling C7 on the client, mirroring apps/backend/src/lib/rbac.ts
 * isAdminOfSeason: SUPER passes; otherwise the ADMIN role AND the claim for
 * that season. A stray SeasonAdmin row on a STUDENT grants nothing here
 * either.
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

export interface StudentActions {
  /** Plan 7's canEditStudent: SUPER, or an ADMIN with an ACTIVE enrollment in one of their seasons. */
  canEdit: boolean;
  /** Only SUPER may move activeSeasonId (Plan 7's ADMIN_EDITABLE excludes it). */
  canEditSeasonPointer: boolean;
  /** R55 + R63: SUPER, and only while not yet graduated. */
  canGraduate: boolean;
  canDelete: boolean;
  /** R64 per row — fixes R68's Drop buttons for seasons the viewer doesn't run. */
  canDrop: (enrollment: EnrollmentHistoryItem) => boolean;
}

/**
 * Which lifecycle controls the student detail renders (Plan 10 Decision 6).
 * Every rule mirrors a server gate, so no rendered button can 403; the server
 * still enforces each one regardless.
 */
export function studentActionsFor(
  user: Pick<MeUser, "role"> | null,
  scopes: MeScopes | null,
  student: { graduationYear: number | null; enrollments: readonly EnrollmentHistoryItem[] },
): StudentActions {
  const isSuper = user?.role === "SUPER";
  const isAdminWithActiveRow =
    user?.role === "ADMIN" &&
    student.enrollments.some((e) => e.status === "ACTIVE" && isAdminOfSeasonForUi(user, scopes, e.seasonId));

  return {
    canEdit: isSuper || isAdminWithActiveRow,
    canEditSeasonPointer: isSuper,
    canGraduate: isSuper && student.graduationYear === null,
    canDelete: isSuper,
    canDrop: (e) => e.status === "ACTIVE" && isAdminOfSeasonForUi(user, scopes, e.seasonId),
  };
}
