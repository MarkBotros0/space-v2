// apps/backend/src/lib/queries/organisation-report.ts
import type { OrganisationReport } from "@space/shared";

import { db } from "../../db/client";

/**
 * The organisation roll-up — student and alumni totals, per-season enrolment
 * tallies, distinct leader counts, alumni by graduation year.
 *
 * This shares NO metric with the engagement report: no attendance, no
 * submissions, no assignments, no engagement score, no per-student row, no
 * season filter (R61). It is a different report model, not a superset, and
 * merging the two behind one endpoint with a mode flag would invent a
 * relationship v1 does not have (spec §7 note (b)).
 *
 * Four queries in two waves, against v1's four of which two were unbounded
 * row-fetches whose only purpose was a JS tally (R55, R57).
 */
export async function buildOrganisationReport(): Promise<OrganisationReport> {
  const generatedAt = new Date().toISOString();

  const [studentTally, seasons] = await Promise.all([
    // ONE query for three figures. Prisma emits a `null` group for students
    // with no graduationYear, which is exactly v1's totalStudents population
    // (R51); every other group is an alumni year (R52, R57). v1 issued two
    // counts plus a row-per-alumnus fetch to tally in JS, with an unreachable
    // null guard inside the loop because the where clause already excluded
    // them (R58).
    db.user.groupBy({
      by: ["graduationYear"],
      where: { role: "STUDENT", deletedAt: null },
      _count: { _all: true },
    }),
    db.season.findMany({
      where: { deletedAt: null },
      orderBy: [{ year: "desc" }, { program: "asc" }],
      select: { id: true, code: true, title: true, program: true, year: true, status: true },
    }),
  ]);

  const seasonIds = seasons.map((s) => s.id);

  const [enrolmentTally, leaderRows] = await Promise.all([
    db.seasonEnrollment.groupBy({
      by: ["seasonId", "status"],
      where: { seasonId: { in: seasonIds } },
      _count: { _all: true },
    }),
    // The one row-fetch left in this file. "Distinct leaders per season" is not
    // expressible as a Prisma groupBy across the Group join, and it is bounded
    // by leader assignments (a handful per group), not by anything that grows
    // with the cohort. v1 fetched the same rows nested inside every season and
    // deduped in JS (R56); this is the same dedupe over a flat, filtered set.
    db.groupLeader.findMany({
      where: { group: { seasonId: { in: seasonIds } } },
      select: { userId: true, group: { select: { seasonId: true } } },
    }),
  ]);

  let totalStudentsNotGraduated = 0;
  let totalAlumni = 0;
  const alumniByYear: Array<{ year: number; count: number }> = [];
  for (const row of studentTally) {
    const n = row._count._all;
    if (row.graduationYear === null) {
      totalStudentsNotGraduated += n;
    } else {
      totalAlumni += n;
      alumniByYear.push({ year: row.graduationYear, count: n });
    }
  }
  alumniByYear.sort((a, b) => b.year - a.year);

  const counts = new Map<number, { active: number; completed: number; withdrawn: number }>();
  for (const row of enrolmentTally) {
    const entry = counts.get(row.seasonId) ?? { active: 0, completed: 0, withdrawn: 0 };
    if (row.status === "ACTIVE") entry.active = row._count._all;
    else if (row.status === "COMPLETED") entry.completed = row._count._all;
    else if (row.status === "WITHDRAWN") entry.withdrawn = row._count._all;
    counts.set(row.seasonId, entry);
  }

  const leadersBySeason = new Map<number, Set<number>>();
  for (const row of leaderRows) {
    const set = leadersBySeason.get(row.group.seasonId) ?? new Set<number>();
    set.add(row.userId);
    leadersBySeason.set(row.group.seasonId, set);
  }

  return {
    totalStudentsNotGraduated,
    totalAlumni,
    // From the list already in hand — the one JS tally v1 did that costs
    // nothing (R59).
    activeSeasonCount: seasons.filter((s) => s.status === "ACTIVE").length,
    seasons: seasons.map((s) => {
      const c = counts.get(s.id) ?? { active: 0, completed: 0, withdrawn: 0 };
      return {
        seasonId: s.id,
        code: s.code,
        program: s.program,
        year: s.year,
        title: s.title,
        status: s.status,
        activeCount: c.active,
        completedCount: c.completed,
        // Named for the enum member it counts. v1's `droppedCount` renamed
        // WITHDRAWN at the data layer, so a reader of the type could not tell
        // which enum value it meant (R54).
        withdrawnCount: c.withdrawn,
        leaderCount: leadersBySeason.get(s.id)?.size ?? 0,
      };
    }),
    alumniByYear,
    generatedAt,
  };
}
