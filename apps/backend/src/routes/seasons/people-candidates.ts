import type { Request, Response } from "express";
import type { PeopleCandidate } from "@space/shared";

import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { apiOk, forbidden } from "../../lib/api-response";
import { findPreviousSeasonId, listSourceSeasons } from "../../lib/queries/previous-season";
import { attendancePctForEnrollments } from "../../lib/queries/students/history";
import { isAdminOfSeason } from "../../lib/rbac";
import {
  activeRolesFor,
  describeActiveRole,
  describeBlock,
  loadHistory,
  standingsFrom,
  type HistoryEntry,
} from "../../lib/roles";
import { requireUser } from "../../middleware/require-auth";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";
import { liveSeason, liveUser } from "../../lib/db/live";

/**
 * Who a season's people picker lists: non-alumni student accounts, or in a
 * community-wide season every student account, alumni too. Super and Mentor
 * stay out by role; stored ADMIN/LEADER no longer exist after roles:convert.
 */
function poolFor(season: { isCommunityWide: boolean }): Prisma.UserWhereInput {
  return season.isCommunityWide
    ? { ...liveUser, role: "STUDENT" }
    : { ...liveUser, role: "STUDENT", graduationYear: null };
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

/** Each finished season's place and how it ended, for "add the people who passed <season>". */
function placesOf(history: HistoryEntry[]): PeopleCandidate["places"] {
  return history
    .filter((h) => h.seasonStatus !== "ACTIVE")
    .map((h) => ({
      seasonId: h.seasonId,
      outcome: h.enrollmentStatus === "WITHDRAWN" ? "dropped" : h.result === "PASSED" ? "passed" : "not_passed",
    }));
}

function outcomeOf(h: HistoryEntry): NonNullable<PeopleCandidate["last"]>["outcome"] {
  if (h.enrollmentStatus === "WITHDRAWN") return "DROPPED";
  return h.result ?? "COMPLETED";
}

/**
 * `GET /seasons/:id/people-candidates`: the people picker's rows, with each
 * person's last season and whether they can be added, in words. SUPER, or that
 * season's admin; either may override a block (owner, 2026-11-07).
 */
export async function listPeopleCandidates(req: Request, res: Response) {
  const user = requireUser(req);
  const seasonId = idParam(res, req.params.id, "season");
  if (seasonId === null) return;
  if (!isAdminOfSeason(user, seasonId)) return forbidden(res);

  const season = await db.season.findFirst({
    where: { id: seasonId, ...liveSeason },
    select: { id: true, title: true, program: true, status: true, requiredProgram: true, isCommunityWide: true },
  });
  if (!season) return notFound(res, "Season");

  const people = await db.user.findMany({
    where: poolFor(season),
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true, graduationYear: true },
  });
  const ids = people.map((p) => p.id);

  const [history, roles, here, admins, leaders] = await Promise.all([
    loadHistory(db, ids, seasonId),
    activeRolesFor(db, ids),
    db.seasonEnrollment.findMany({
      where: { seasonId, studentUserId: { in: ids } },
      select: { studentUserId: true, status: true },
    }),
    // activeRolesFor only sees ACTIVE seasons: a DRAFT's own staff are read here.
    db.seasonAdmin.findMany({ where: { seasonId, userId: { in: ids } }, select: { userId: true } }),
    db.groupLeader.findMany({ where: { group: { seasonId }, userId: { in: ids } }, select: { userId: true } }),
  ]);
  const servingHere = new Set([...admins, ...leaders].map((r) => r.userId));
  const standings = standingsFrom(ids, history, season);
  const hereBy = new Map(here.map((e) => [e.studentUserId, e]));
  const lasts = new Map(ids.map((id) => [id, latestOf(history.get(id) ?? [])]));
  const pcts = await attendancePctForEnrollments(
    [...lasts.entries()].flatMap(([studentUserId, h]) =>
      h ? [{ id: h.enrollmentId, studentUserId, seasonId: h.seasonId, enrolledAt: h.enrolledAt }] : [],
    ),
  );

  const rows: PeopleCandidate[] = people.map((p) => {
    const lastEntry = lasts.get(p.id) ?? null;
    const last: PeopleCandidate["last"] = lastEntry
      ? {
          seasonTitle: lastEntry.seasonTitle,
          outcome: outcomeOf(lastEntry),
          attendancePct: pcts.get(lastEntry.enrollmentId) ?? null,
        }
      : null;
    const base = {
      id: p.id,
      name: p.name,
      pool: p.graduationYear === null ? ("student" as const) : ("alumni" as const),
      last,
      overridable: false,
      places: placesOf(history.get(p.id) ?? []),
    };

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
        // Whoever may read this list administers the season, and may override (owner, 2026-11-07).
        overridable: true,
      };
    }
    if (!role && servingHere.has(p.id)) {
      return {
        ...base,
        availability: "in_role",
        reason: `${p.name} is serving in this season.`,
        selectable: season.status === "DRAFT",
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
  const listedPassers = new Map<number, number>();
  for (const r of rows) {
    for (const pl of r.places) {
      if (pl.outcome === "passed") listedPassers.set(pl.seasonId, (listedPassers.get(pl.seasonId) ?? 0) + 1);
    }
  }
  const [sources, previousId] = await Promise.all([
    listSourceSeasons(db, season.id, listedPassers, ids),
    findPreviousSeasonId(db, season),
  ]);
  return apiOk(res, {
    season: {
      id: season.id,
      title: season.title,
      requiredProgram: season.requiredProgram,
      isCommunityWide: season.isCommunityWide,
      suggestedSourceId: sources.some((s) => s.id === previousId) ? previousId : null,
      sources,
    },
    people: rows,
  });
}
