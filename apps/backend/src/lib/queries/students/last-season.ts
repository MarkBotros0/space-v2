import type { StudentListItem } from "@space/shared";

import { db } from "../../../db/client";
import type { SessionUser } from "../../auth/tokens";
import { staffRosterWhere } from "../../permissions";
import { finishedSeasonStatus } from "../../seasons/status";

/**
 * A list row's season line (owner, 2026-11-07): its active season, else the
 * latest finished one the student completed. One query for the whole page,
 * limited to the seasons this caller may read, as the active one is.
 */
export async function withLastSeason(items: StudentListItem[], user: SessionUser): Promise<StudentListItem[]> {
  const ids = items.filter((i) => i.activeSeasonTitle === null).map((i) => i.id);
  if (ids.length === 0) return items.map((i) => ({ ...i, lastSeasonTitle: null }));
  const rows = await db.seasonEnrollment.findMany({
    where: {
      studentUserId: { in: ids },
      status: "COMPLETED",
      season: { status: finishedSeasonStatus, deletedAt: null },
      ...(staffRosterWhere(user) ?? {}),
    },
    orderBy: [{ season: { endDate: "desc" } }, { id: "desc" }],
    select: { studentUserId: true, season: { select: { title: true } } },
  });
  const latest = new Map<number, string>();
  for (const r of rows) if (!latest.has(r.studentUserId)) latest.set(r.studentUserId, r.season.title);
  return items.map((i) => ({
    ...i,
    lastSeasonTitle: i.activeSeasonTitle === null ? (latest.get(i.id) ?? null) : null,
  }));
}
