import { liveSeason } from "../../db/live";
/**
 * Select fragment for a student's derived current season: their newest ACTIVE
 * enrolment in a live ACTIVE season (the rule `loadScopes` uses). Spread it
 * into a `User` select as `seasonEnrollments`, then read `[0]?.season.title`. The season's id and
 * the enrolment's group come too, for the list's passing numbers (`withProgress`).
 */
export const currentSeasonEnrollmentSelect = {
  where: { status: "ACTIVE" as const, season: { status: "ACTIVE" as const, ...liveSeason } },
  orderBy: [{ enrolledAt: "desc" as const }, { id: "desc" as const }],
  take: 1,
  select: { groupId: true, season: { select: { id: true, title: true } } },
};
