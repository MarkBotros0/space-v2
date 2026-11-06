/**
 * Select fragment for a student's derived current season: their newest ACTIVE
 * enrolment in a live ACTIVE season (the rule `loadScopes` uses). Spread it
 * into a `User` select as `seasonEnrollments`, then read `[0]?.season.title`.
 */
export const currentSeasonEnrollmentSelect = {
  where: { status: "ACTIVE" as const, season: { status: "ACTIVE" as const, deletedAt: null } },
  orderBy: [{ enrolledAt: "desc" as const }, { id: "desc" as const }],
  take: 1,
  select: { season: { select: { title: true } } },
};
