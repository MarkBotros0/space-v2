/**
 * v1's student list said "Due <day> · in <distance>" while a deadline was still
 * ahead, using date-fns `formatDistanceToNowStrict(dueAt)` (v1
 * student/assignments/page.tsx:98-104, spec 07 R48). Reproduced here with the
 * same unit thresholds and rounding so the phone shows v1's words without
 * device-clock arithmetic (C4). Null when there is no deadline or it passed.
 */
export function dueDistance(dueAt: Date | null, now: Date): string | null {
  if (dueAt === null || dueAt.getTime() <= now.getTime()) return null;
  const ms = dueAt.getTime() - now.getTime();
  const minutes = ms / 60_000;
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (minutes < 1) return plural(Math.round(ms / 1000), "second");
  if (minutes < 60) return plural(Math.round(minutes), "minute");
  if (minutes < 1440) return plural(Math.round(minutes / 60), "hour");
  if (minutes < 43_200) return plural(Math.round(minutes / 1440), "day");
  if (minutes < 525_600) {
    const months = Math.round(minutes / 43_200);
    return months === 12 ? "1 year" : plural(months, "month");
  }
  return plural(Math.round(minutes / 525_600), "year");
}
