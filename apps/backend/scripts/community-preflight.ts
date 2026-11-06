/**
 * Community-model preflight. Run from apps/backend:
 *   pnpm preflight:community            read-only: prints host, violations, what would change
 *   pnpm preflight:community --apply    refuses if violations exist, else backfills in one transaction
 *
 * The backfill is deliberately NOT in the migration: `migrate deploy` also
 * reaches Neon, which v1 still writes.
 */
import { db } from "../src/db/client";
import { config } from "../src/lib/config";

export interface Violations {
  /** A leader with more than one group in one ACTIVE season. */
  leadersWithManyGroups: { userId: number; seasonId: number; groups: number }[];
  /** An ADMIN who administers more than one ACTIVE season. */
  adminsInManySeasons: { userId: number; seasons: number }[];
  /** A MENTOR holding a SeasonAdmin row in an ACTIVE season. */
  mentorsWithSeasonAdmin: { userId: number; seasonId: number }[];
}

export async function findRoleRuleViolations(): Promise<Violations> {
  const leaderRows = await db.groupLeader.findMany({
    where: { group: { season: { status: "ACTIVE" } } },
    select: { userId: true, group: { select: { seasonId: true } } },
  });
  const perLeaderSeason = new Map<string, { userId: number; seasonId: number; groups: number }>();
  for (const r of leaderRows) {
    const key = `${r.userId}:${r.group.seasonId}`;
    const cur = perLeaderSeason.get(key) ?? { userId: r.userId, seasonId: r.group.seasonId, groups: 0 };
    cur.groups += 1;
    perLeaderSeason.set(key, cur);
  }

  const adminRows = await db.seasonAdmin.findMany({
    where: { season: { status: "ACTIVE" }, user: { role: "ADMIN" } },
    select: { userId: true },
  });
  const perAdmin = new Map<number, number>();
  for (const r of adminRows) perAdmin.set(r.userId, (perAdmin.get(r.userId) ?? 0) + 1);

  const mentorRows = await db.seasonAdmin.findMany({
    where: { season: { status: "ACTIVE" }, user: { role: "MENTOR" } },
    select: { userId: true, seasonId: true },
  });

  return {
    leadersWithManyGroups: [...perLeaderSeason.values()].filter((v) => v.groups > 1),
    adminsInManySeasons: [...perAdmin].filter(([, n]) => n > 1).map(([userId, seasons]) => ({ userId, seasons })),
    mentorsWithSeasonAdmin: mentorRows,
  };
}

export function countViolations(v: Violations): number {
  return v.leadersWithManyGroups.length + v.adminsInManySeasons.length + v.mentorsWithSeasonAdmin.length;
}

interface BackfillOptions {
  /** Limit the backfill to these seasons (tests use it to stay on their own fixtures). */
  seasonIds?: number[];
  /** Count only; write nothing. */
  dryRun?: boolean;
}

export async function backfillResults(
  opts: BackfillOptions = {},
): Promise<{ markedPassed: number; completedStale: number }> {
  const inSeasons = opts.seasonIds ? { seasonId: { in: opts.seasonIds } } : {};
  const now = new Date();

  const completedWhere = { ...inSeasons, status: "COMPLETED" as const, result: null };
  const staleWhere = { ...inSeasons, status: "ACTIVE" as const, season: { status: "COMPLETED" as const } };

  if (opts.dryRun) {
    return {
      markedPassed: await db.seasonEnrollment.count({ where: completedWhere }),
      completedStale: await db.seasonEnrollment.count({ where: staleWhere }),
    };
  }

  return db.$transaction(async (tx) => {
    const passed = await tx.seasonEnrollment.updateMany({
      where: completedWhere,
      data: { result: "PASSED", resultSetAt: now },
    });
    const stale = await tx.seasonEnrollment.findMany({
      where: staleWhere,
      select: { id: true, season: { select: { endDate: true } } },
    });
    for (const e of stale) {
      await tx.seasonEnrollment.update({
        where: { id: e.id },
        data: { status: "COMPLETED", completedAt: e.season.endDate, result: "PASSED", resultSetAt: now },
      });
    }
    return { markedPassed: passed.count, completedStale: stale.length };
  });
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  console.log(`Database host: ${new URL(config.databaseUrl).hostname}`);

  const violations = await findRoleRuleViolations();
  console.log("Role-rule violations:", JSON.stringify(violations, null, 2));

  if (!apply) {
    console.log("Would change:", await backfillResults({ dryRun: true }));
    console.log("Read-only run. Pass --apply to backfill.");
    return;
  }
  if (countViolations(violations) > 0) {
    throw new Error("Refusing to --apply: fix the role-rule violations above first.");
  }
  console.log("Backfilled:", await backfillResults());
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
