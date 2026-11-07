
/**
 * Spec 06 D15: User, StudentProfile and SeasonEnrollment carry no
 * createdById/updatedById, so there is no record of who graduated, dropped or
 * deleted a student in the database. Instead every state-changing student write (and
 * every account create, role change, deactivation and reactivation) leaves
 * one server-log line naming WHO did WHAT to WHOM.
 *
 * Never a field value: a graduation year, a drop reason or a name is personal
 * data and stays out of logs (the spec's "without logging any field value").
 * The signature makes that structural — it accepts ids only.
 */
export type AuditOperation =
  | "student.graduate"
  | "student.delete"
  | "enrollment.drop"
  | "enrollment.restore"
  // Adding to a season, taking off a draft, overriding a block. The season rides
  // along as a scope id.
  | "enrollment.add"
  | "enrollment.remove"
  | "enrollment.override"
  // Account changes (users admin). A role change names neither role: the
  // subject id plus the user row is enough to reconstruct it, and the line
  // stays ids-only like the rest.
  | "user.create"
  | "user.role_change"
  // Correcting a stored student's year. Setting or clearing one is Graduate's.
  | "user.graduation_year_change"
  | "user.deactivate"
  | "user.reactivate"
  // The account holder deleting their own account (DELETE /me).
  | "user.self_delete"
  // Season admin grants (SUPER-only). The subject is the user; the season
  // rides along as a scope id.
  | "season.admin_add"
  | "season.admin_remove"
  // Ending a season, and a later correction of one student's result.
  | "season.start"
  | "season.end"
  | "season.result_correct";

/** Extra ids that locate a change — ids only, like the rest of the line. */
export type AuditScope = {
  season?: number;
  /** A super let this past the rule it would otherwise have failed. */
  override?: true;
};

export function formatAuditLine(
  operation: AuditOperation,
  actorId: number,
  subjectId: number,
  scope: AuditScope = {},
): string {
  const season = scope.season !== undefined ? ` season=${scope.season}` : "";
  const override = scope.override ? " override=true" : "";
  return `[audit] ${operation} actor=${actorId} subject=${subjectId}${season}${override}`;
}

export function auditLog(
  operation: AuditOperation,
  actorId: number,
  subjectId: number,
  scope: AuditScope = {},
): void {
  console.info(formatAuditLine(operation, actorId, subjectId, scope));
}
