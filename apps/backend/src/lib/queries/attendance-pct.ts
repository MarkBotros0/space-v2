/**
 * PRESENT + LATE over every session the season has now, rounded; 0 with no
 * sessions (spec 02 D14, R36/R37). The one definition: season history and the
 * season end check both use it.
 */
export function attendancePct(attended: number, totalSessions: number): number {
  return totalSessions > 0 ? Math.round((attended / totalSessions) * 100) : 0;
}
