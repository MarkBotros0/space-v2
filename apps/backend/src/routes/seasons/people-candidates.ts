import type { Request, Response } from "express";
import type { PeopleCandidate } from "@space/shared";

import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { apiOk, apiError } from "../../lib/api-response";
import { parseId } from "../../lib/parse-id";
import { attendancePctForEnrollments } from "../../lib/queries/students/history";
import { isAdminOfSeason, isSuper } from "../../lib/rbac";
import {
  activeRolesFor,
  describeActiveRole,
  describeBlock,
  loadHistory,
  standingsFrom,
  type HistoryEntry,
} from "../../lib/roles";
import { requireUser } from "../../middleware/require-auth";
import { forbidden } from "../respond";

/**
 * Who a season's people picker lists. Build 3 widens this for community-wide
 * seasons (alumni as students); until the flag exists, every season is regular
 * and the pool is non-alumni student accounts.
 */
function poolFor(_season: { id: number }): Prisma.UserWhereInput {
  return { deletedAt: null, role: "STUDENT", graduationYear: null };
}

type Availability = PeopleCandidate["availability"];
const RANK: Record<Availability, number> = {
  available: 0,
  already_passed: 1,
  did_not_pass: 2,
  never_finished: 2,
  in_role: 2,
  in_season: 2,
};

/** Latest ended enrolment: how the person's last season went. */
function latestOf(history: HistoryEntry[]): HistoryEntry | null {
  let latest: HistoryEntry | null = null;
  for (const h of history) {
    if (!latest || h.endedAt.getTime() > latest.endedAt.getTime()) latest = h;
  }
  return latest;
}

function outcomeOf(h: HistoryEntry): NonNullable<PeopleCandidate["last"]>["outcome"] {
  if (h.enrollmentStatus === "WITHDRAWN") return "DROPPED";
  return h.result ?? "COMPLETED";
}

/**
 * `GET /seasons/:id/people-candidates`: the people picker's rows, with each
 * person's last season and whether they can be added, in words. SUPER, or that
 * season's admin; only SUPER can override a block.
 */
export async function listPeopleCandidates(req: Request, res: Response) {
  const user = requireUser(req);
  const seasonId = parseId(req.params.id);
  if (seasonId === null) return apiError(res, "bad_request", "Invalid season id.", 400);
  if (!isAdminOfSeason(user, seasonId)) return forbidden(res);

  const season = await db.season.findFirst({
    where: { id: seasonId, deletedAt: null },
    select: { id: true, title: true, program: true, status: true, requiredProgram: true },
  });
  if (!season) return apiError(res, "not_found", "Season not found.", 404);

  const people = await db.user.findMany({
    where: poolFor(season),
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
  const ids = people.map((p) => p.id);

  const [history, roles, here] = await Promise.all([
    loadHistory(db, ids, seasonId),
    activeRolesFor(db, ids),
    db.seasonEnrollment.findMany({
      where: { seasonId, studentUserId: { in: ids } },
      select: { studentUserId: true, status: true },
    }),
  ]);
  const standings = standingsFrom(ids, history, season);
  const hereBy = new Map(here.map((e) => [e.studentUserId, e]));
  const lasts = new Map(ids.map((id) => [id, latestOf(history.get(id) ?? [])]));
  const pcts = await attendancePctForEnrollments(
    [...lasts.entries()].flatMap(([studentUserId, h]) =>
      h ? [{ id: h.enrollmentId, studentUserId, seasonId: h.seasonId, enrolledAt: h.enrolledAt }] : [],
    ),
  );

  const callerIsSuper = isSuper(user);
  const rows: PeopleCandidate[] = people.map((p) => {
    const lastEntry = lasts.get(p.id) ?? null;
    const last: PeopleCandidate["last"] = lastEntry
      ? {
          seasonTitle: lastEntry.seasonTitle,
          outcome: outcomeOf(lastEntry),
          attendancePct: pcts.get(lastEntry.enrollmentId) ?? null,
        }
      : null;
    const base = { id: p.id, name: p.name, last, overridable: false };

    const enrolment = hereBy.get(p.id);
    if (enrolment) {
      const dropped = enrolment.status === "WITHDRAWN";
      return {
        ...base,
        availability: "in_season",
        reason: dropped ? "Dropped - only a super admin can bring them back" : "Already in this season",
        selectable: false,
      };
    }
    const role = roles.get(p.id);
    const standing = standings.get(p.id)!;
    if (standing.kind === "blocked") {
      const didNotPass = standing.reason === "did_not_pass";
      const phrase = describeBlock(standing, season.requiredProgram);
      const block = phrase.charAt(0).toUpperCase() + phrase.slice(1);
      return {
        ...base,
        availability: didNotPass ? "did_not_pass" : "never_finished",
        // The block comes first: it needs an override, the role only a draft.
        reason: role ? `${block}. ${describeActiveRole(p.name, role)}` : block,
        // An override lives on the enrolment row, and anyone with a row here is in_season above.
        selectable: false,
        overridable: callerIsSuper,
      };
    }
    if (role) {
      return {
        ...base,
        availability: "in_role",
        reason: describeActiveRole(p.name, role),
        // A draft holds the person; the Start checklist catches the clash.
        selectable: season.status === "DRAFT",
      };
    }
    if (standing.kind === "already_passed") {
      return {
        ...base,
        availability: "already_passed",
        reason: `Already passed ${standing.programSeasonTitle}`,
        selectable: true,
      };
    }
    return { ...base, availability: "available", reason: null, selectable: true };
  });

  rows.sort((a, b) => RANK[a.availability] - RANK[b.availability] || a.name.localeCompare(b.name) || a.id - b.id);
  return apiOk(res, { season: { id: season.id, title: season.title, requiredProgram: season.requiredProgram }, people: rows });
}
