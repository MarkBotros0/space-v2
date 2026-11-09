import { isSeasonLive } from "@space/shared";

import { isAdminOfSeasonForUi } from "./season-admin";
import type { EnrollmentHistoryItem, MeScopes, MeUser } from "@space/shared";

interface StudentActions {
  /** Plan 7's canEditStudent: SUPER, or an ADMIN with an ACTIVE enrollment in one of their seasons. */
  canEdit: boolean;
  /** R55 + R63: SUPER, and only while not yet graduated. */
  canGraduate: boolean;
  canDelete: boolean;
  /** R64 per row — fixes R68's Drop buttons for seasons the viewer doesn't run. */
  canDrop: (enrollment: EnrollmentHistoryItem) => boolean;
  /** A draft's row is a plan: the same people take it off instead of dropping it (the server's `season_draft`). */
  canRemove: (enrollment: EnrollmentHistoryItem) => boolean;
  /** SUPER, on a dropped row of a season that has not finished (the server's `season_finished` gate). */
  canRestore: (enrollment: EnrollmentHistoryItem) => boolean;
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
    canGraduate: isSuper && student.graduationYear === null,
    canDelete: isSuper,
    canDrop: (e) =>
      e.status === "ACTIVE" && e.seasonStatus !== "DRAFT" && isAdminOfSeasonForUi(user, scopes, e.seasonId),
    canRemove: (e) =>
      e.status === "ACTIVE" && e.seasonStatus === "DRAFT" && isAdminOfSeasonForUi(user, scopes, e.seasonId),
    canRestore: (e) => isSuper && e.status === "WITHDRAWN" && isSeasonLive(e.seasonStatus),
  };
}
