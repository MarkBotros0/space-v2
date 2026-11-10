/**
 * One line saying where a season is in its life, for the top of its page:
 * "Starts in 3 days", "Day 4 of 11", "Ended Nov 17, 2026". Season dates are
 * calendar days (the ISO date part, spec 02 D12); `today` is the org's day key
 * when the caller has it, else the phone's.
 */
import { isSeasonFinished } from "@space/shared";
import type { SeasonDetail } from "@space/shared";

import { formatSeasonDay } from "../../lib/format";
import { MS_PER_MINUTE, MS_PER_DAY } from "../../lib/time";
import { plural } from "../../lib/plural";

const dayNumber = (key: string) => Math.round(Date.parse(`${key}T00:00:00Z`) / MS_PER_DAY);
export function phoneDayKey(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * MS_PER_MINUTE);
  return local.toISOString().slice(0, 10);
}

export function seasonTimeline(
  season: Pick<SeasonDetail, "status" | "startDate" | "endDate">,
  today: string,
): { label: string; tone: "info" | "warn" | "neutral" } {
  const t = dayNumber(today);
  const start = dayNumber(season.startDate.slice(0, 10));
  const end = dayNumber(season.endDate.slice(0, 10));
  if (isSeasonFinished(season.status)) {
    return { label: `Ended ${formatSeasonDay(season.endDate)}`, tone: "neutral" };
  }
  if (season.status === "DRAFT") {
    if (start > t) return { label: `Starts in ${plural(start - t, "day")}`, tone: "info" };
    if (start === t) return { label: "Due to start today", tone: "info" };
    return { label: `Was due to start ${formatSeasonDay(season.startDate)}`, tone: "warn" };
  }
  if (t > end) return { label: "Past its end date", tone: "warn" };
  if (t < start) return { label: `Starts in ${plural(start - t, "day")}`, tone: "info" };
  return { label: `Day ${t - start + 1} of ${end - start + 1}`, tone: "info" };
}
