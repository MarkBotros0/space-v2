/**
 * One line saying where a season is in its life, for the top of its page:
 * "Starts in 3 days", "Day 4 of 11", "Ended Nov 17, 2026". Season dates are
 * calendar days (the ISO date part, spec 02 D12); `today` is the org's day key
 * when the caller has it, else the phone's.
 */
import type { SeasonDetail } from "@space/shared";

import { formatSeasonDay } from "../../lib/format";

const DAY_MS = 86_400_000;
const dayNumber = (key: string) => Math.round(Date.parse(`${key}T00:00:00Z`) / DAY_MS);
const plural = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

export function phoneDayKey(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function seasonTimeline(
  season: Pick<SeasonDetail, "status" | "startDate" | "endDate">,
  today: string,
): { label: string; tone: "info" | "warn" | "neutral" } {
  const t = dayNumber(today);
  const start = dayNumber(season.startDate.slice(0, 10));
  const end = dayNumber(season.endDate.slice(0, 10));
  if (season.status === "COMPLETED" || season.status === "ARCHIVED") {
    return { label: `Ended ${formatSeasonDay(season.endDate)}`, tone: "neutral" };
  }
  if (season.status === "DRAFT") {
    if (start > t) return { label: `Starts in ${plural(start - t)}`, tone: "info" };
    if (start === t) return { label: "Due to start today", tone: "info" };
    return { label: `Was due to start ${formatSeasonDay(season.startDate)}`, tone: "warn" };
  }
  if (t > end) return { label: "Past its end date", tone: "warn" };
  if (t < start) return { label: `Starts in ${plural(start - t)}`, tone: "info" };
  return { label: `Day ${t - start + 1} of ${end - start + 1}`, tone: "info" };
}
