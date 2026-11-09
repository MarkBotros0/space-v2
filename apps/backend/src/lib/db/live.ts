/**
 * The soft-delete filters, named once (refactor DB-024). User, Season,
 * Assignment and StudentProfile are soft-deleted (`deletedAt` set); a "live"
 * row is one whose `deletedAt` is null. Prisma 7 has no query middleware that
 * reaches nested selects and relation filters, so every read spells the filter
 * itself: spell it with these, never a literal `deletedAt: null`.
 *
 * Spread a fragment into a `where`, or use it as a relation filter:
 *
 *     db.season.findFirst({ where: { id, ...liveSeason } })
 *     { student: liveUser }            // to-one relation filter
 *
 * A path that must see deleted rows (restore, the inactive list, the
 * email-taken check, "Former member") passes `withDeleted` instead, so the
 * choice is visible at the call site.
 */
export const liveUser = { deletedAt: null } as const;
export const liveSeason = { deletedAt: null } as const;
export const liveAssignment = { deletedAt: null } as const;
export const liveStudentProfile = { deletedAt: null } as const;

/** Deliberately include soft-deleted rows. An empty filter, named for the reader. */
export const withDeleted = {} as const;
