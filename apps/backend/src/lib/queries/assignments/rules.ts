/**
 * Ruling C4: derived once here, never re-derived by a renderer. v1 computed the
 * equivalent comparison at five separate sites with no shared helper.
 *
 * Both of these compare instants, so they need no timezone. Anything that
 * buckets by *day* does (ruling C2) and must not use these.
 */
export function isOverdue(dueAt: Date | null, now: Date): boolean {
  return dueAt !== null && dueAt.getTime() < now.getTime();
}

export function isLate(submittedAt: Date | null, dueAt: Date | null): boolean {
  return submittedAt !== null && dueAt !== null && submittedAt.getTime() > dueAt.getTime();
}
