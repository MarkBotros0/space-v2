import type { RecurrenceScope } from "@space/shared";

import { db } from "../../db/client";
import { orgWallClockToInstant } from "../../lib/org-time";

/**
 * A session write's start as an instant. Plan 6 D-16.6: the mobile form
 * sends org wall-clock fields (startDay + startTime — Plan 5's dueDay/dueTime
 * split) and the conversion happens HERE, in ORG_TIMEZONE; the device never
 * composes an instant. The shared schema guarantees exactly one form is present.
 */
export function sessionStartFrom(body: { startsAt?: string; startDay?: string; startTime?: string }): Date {
  if (body.startDay !== undefined && body.startTime !== undefined) {
    return orgWallClockToInstant(body.startDay, body.startTime);
  }
  if (body.startsAt !== undefined) return new Date(body.startsAt);
  throw new Error("unreachable: the session write schema requires a start");
}

export interface SeriesAnchor {
  id: number;
  seasonId: number;
  recurrenceGroupId: string | null;
  startsAt: Date;
}

/**
 * v1's siblingsInScope (recurrence.ts), with ruling C10 applied: the series
 * is ALWAYS fenced to the anchor's season. v1 matched on recurrenceGroupId
 * alone, and duplication cloned that id verbatim, so a series edit or delete
 * reached into another season — data loss gated only by the anchor's admin
 * check. "future" keeps the anchor and everything at or after it.
 */
export async function resolveSeriesTargets(
  anchor: SeriesAnchor,
  scope: RecurrenceScope,
): Promise<{ id: number; startsAt: Date }[]> {
  if (scope === "one" || anchor.recurrenceGroupId === null) {
    return [{ id: anchor.id, startsAt: anchor.startsAt }];
  }
  const series = await db.session.findMany({
    where: { recurrenceGroupId: anchor.recurrenceGroupId, seasonId: anchor.seasonId },
    select: { id: true, startsAt: true },
    orderBy: { startsAt: "asc" },
  });
  return scope === "future" ? series.filter((s) => s.startsAt.getTime() >= anchor.startsAt.getTime()) : series;
}
