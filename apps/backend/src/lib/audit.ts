
/**
 * Spec 06 D15: User, StudentProfile and SeasonEnrollment carry no
 * createdById/updatedById, so there is no record of who graduated, dropped or
 * deleted a student — and adding the columns is a migration (ruling C1;
 * recorded for cutover). Until then every state-changing student write (and
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
  | "enrollment.complete"
  // Account changes (users admin). A role change names neither role: the
  // subject id plus the user row is enough to reconstruct it, and the line
  // stays ids-only like the rest.
  | "user.create"
  | "user.role_change"
  | "user.deactivate"
  | "user.reactivate";

export function formatAuditLine(operation: AuditOperation, actorId: number, subjectId: number): string {
  return `[audit] ${operation} actor=${actorId} subject=${subjectId}`;
}

export function auditLog(operation: AuditOperation, actorId: number, subjectId: number): void {
  console.info(formatAuditLine(operation, actorId, subjectId));
}
