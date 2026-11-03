import type { ResolvedScope } from "@space/shared";

import { db } from "../../../db/client";
import type { ReportScope } from "../../permissions";

/**
 * Turn "what the caller asked for" into "what the caller may have", by
 * INTERSECTION.
 *
 * v1's loadReportsData built its season filter from whatever integers the
 * caller passed and performed no authorization of any kind (R3); the gate lived
 * in whichever page called it. In v2 the ids arrive from a phone, so the
 * permitted set is a `where` clause and the request is a filter applied to the
 * result — never the other way round (ruling C8, spec §4 item 1).
 *
 * A requested id that is unknown, soft-deleted, or outside the caller's scope
 * is dropped silently and `truncated` is set. It is NOT a 403 and NOT a 404:
 * an error that distinguishes "exists but not yours" from "does not exist"
 * turns this endpoint into an existence oracle over the season table. It also
 * fixes R46, under which v1 answered an unknown id with a header-only CSV and
 * HTTP 200 — indistinguishable from "this season has no students".
 */
export async function resolveReportScope(
  scope: ReportScope,
  requestedIds: number[],
): Promise<ResolvedScope> {
  const permitted = await db.season.findMany({
    where: {
      deletedAt: null,
      ...(scope.kind === "seasons" ? { id: { in: scope.seasonIds } } : {}),
    },
    orderBy: [{ year: "desc" }, { title: "asc" }],
    select: { id: true, code: true, title: true },
  });

  const requested = new Set(requestedIds);
  const seasons = requestedIds.length > 0 ? permitted.filter((s) => requested.has(s.id)) : permitted;
  const truncated = requestedIds.length > 0 && seasons.length < requested.size;

  const label =
    seasons.length === 0
      ? "No seasons"
      : seasons.length === 1
        ? seasons[0]!.title
        : requestedIds.length === 0 && scope.kind === "all"
          ? "All seasons"
          : `${seasons.length} seasons`;

  return { seasonIds: seasons.map((s) => s.id), seasons, truncated, label };
}
