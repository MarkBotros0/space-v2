/**
 * The Reports subtitle. With no season picked the chip row says "All seasons",
 * but the server labels a one-season scope by that season's title, so the line
 * says both ("Showing all seasons (GBV 2026).") rather than contradicting the chip.
 */
export function scopeLine(
  seasonId: number | null,
  scope: { label: string; seasons: Array<{ title: string }> },
): string {
  if (seasonId === null && scope.seasons.length === 1 && scope.label !== "All seasons") {
    return `Showing all seasons (${scope.label}).`;
  }
  return `Scoped to ${scope.label}.`;
}
