/**
 * Community-model preflight. Run from apps/backend:
 *   pnpm preflight:community            read-only: prints host, violations, what would change
 *   pnpm preflight:community --apply    refuses if violations exist or any enrolment already has a result,
 *                                       else backfills in one transaction
 *
 * The backfill is deliberately NOT in the migration: `migrate deploy` also
 * can reach a database v1 still writes.
 */
import { db } from "../src/db/client";
import { config } from "../src/lib/config";
import { printReviewLists } from "./community-preflight-review";

/** Every way the data breaks "zero or one active role". Each list is one rule. */
export interface Violations {
  /** A leader with more than one group in one ACTIVE season. */
  leadersWithManyGroups: { userId: number; seasonId: number; groups: number }[];
  /** A leader with groups in more than one ACTIVE season. */
  leadersInManySeasons: { userId: number; seasons: number }[];
  /** Someone who administers more than one ACTIVE season. */
  adminsInManySeasons: { userId: number; seasons: number }[];
  /** An admin of one ACTIVE season who leads a group in another. The same season is allowed. */
  adminAndLeaderAcrossSeasons: { userId: number; adminSeasonId: number; leaderSeasonId: number }[];
  /** A student with an ACTIVE enrolment in more than one ACTIVE season. */
  studentsInManySeasons: { userId: number; seasons: number }[];
  /** A MENTOR holding a SeasonAdmin row in an ACTIVE season. */
  mentorsWithSeasonAdmin: { userId: number; seasonId: number }[];
  /** A MENTOR holding a GroupLeader row in an ACTIVE season. */
  mentorsWithGroupLeader: { userId: number; seasonId: number }[];
  /** A SUPER holding a SeasonAdmin or GroupLeader row in an ACTIVE season. */
  supersWithSeasonRoles: { userId: number; seasonId: number; row: "admin" | "leader" }[];
  /** A non-student, or anyone serving in an ACTIVE season, who also holds an ACTIVE enrolment in one. */
  staffWithActiveEnrollment: { userId: number; seasonId: number }[];
}

/** "Active" means a role in a season whose status is ACTIVE. Draft, finished and deleted seasons don't count. */
const ACTIVE_SEASON = { status: "ACTIVE" as const, deletedAt: null };
/** A soft-deleted account holds no role. */
const LIVE_USER = { deletedAt: null };

const groupBy = <T>(rows: T[], key: (row: T) => number) => {
  const out = new Map<number, T[]>();
  for (const row of rows) out.set(key(row), [...(out.get(key(row)) ?? []), row]);
  return out;
};
/** Users with more than one distinct season among their rows. */
const inManySeasons = (rows: { userId: number; seasonId: number }[]) =>
  [...groupBy(rows, (r) => r.userId)]
    .map(([userId, own]) => ({ userId, seasons: new Set(own.map((r) => r.seasonId)).size }))
    .filter((v) => v.seasons > 1);

export async function findRoleRuleViolations(): Promise<Violations> {
  const [leaderRows, adminRows, enrolmentRows] = await Promise.all([
    db.groupLeader.findMany({
      where: { group: { season: ACTIVE_SEASON }, user: LIVE_USER },
      select: { userId: true, user: { select: { role: true } }, group: { select: { seasonId: true } } },
    }),
    db.seasonAdmin.findMany({
      where: { season: ACTIVE_SEASON, user: LIVE_USER },
      select: { userId: true, seasonId: true, user: { select: { role: true } } },
    }),
    db.seasonEnrollment.findMany({
      where: { status: "ACTIVE", season: ACTIVE_SEASON, studentUser: LIVE_USER },
      select: { studentUserId: true, seasonId: true, studentUser: { select: { role: true } } },
    }),
  ]);
  const leaders = leaderRows.map((r) => ({ userId: r.userId, seasonId: r.group.seasonId, role: r.user.role }));
  const admins = adminRows.map((r) => ({ userId: r.userId, seasonId: r.seasonId, role: r.user.role }));
  const enrolments = enrolmentRows.map((r) => ({
    userId: r.studentUserId,
    seasonId: r.seasonId,
    role: r.studentUser.role,
  }));
  // Super and Mentor are permanent roles, reported by their own rules below.
  const seasonal = (r: { role: string }) => r.role !== "SUPER" && r.role !== "MENTOR";

  const perLeaderSeason = new Map<string, { userId: number; seasonId: number; groups: number }>();
  for (const r of leaders) {
    const key = `${r.userId}:${r.seasonId}`;
    const cur = perLeaderSeason.get(key) ?? { userId: r.userId, seasonId: r.seasonId, groups: 0 };
    cur.groups += 1;
    perLeaderSeason.set(key, cur);
  }

  const adminAndLeaderAcrossSeasons: Violations["adminAndLeaderAcrossSeasons"] = [];
  const leadsBy = groupBy(leaders.filter(seasonal), (r) => r.userId);
  for (const [userId, own] of groupBy(admins.filter(seasonal), (r) => r.userId)) {
    const pairs = own.flatMap((a) =>
      (leadsBy.get(userId) ?? [])
        .filter((l) => l.seasonId !== a.seasonId)
        .map((l) => ({ userId, adminSeasonId: a.seasonId, leaderSeasonId: l.seasonId })),
    );
    if (pairs[0]) adminAndLeaderAcrossSeasons.push(pairs[0]);
  }

  const serving = new Set([...leaders, ...admins].map((r) => r.userId));
  const onlyRole = (rows: typeof leaders, role: string) => rows.filter((r) => r.role === role);
  const asRow = ({ userId, seasonId }: { userId: number; seasonId: number }) => ({ userId, seasonId });

  return {
    leadersWithManyGroups: [...perLeaderSeason.values()].filter((v) => v.groups > 1),
    leadersInManySeasons: inManySeasons(leaders),
    adminsInManySeasons: inManySeasons(admins.filter(seasonal)),
    adminAndLeaderAcrossSeasons,
    studentsInManySeasons: inManySeasons(enrolments),
    mentorsWithSeasonAdmin: onlyRole(admins, "MENTOR").map(asRow),
    mentorsWithGroupLeader: onlyRole(leaders, "MENTOR").map(asRow),
    supersWithSeasonRoles: [
      ...onlyRole(admins, "SUPER").map((r) => ({ ...asRow(r), row: "admin" as const })),
      ...onlyRole(leaders, "SUPER").map((r) => ({ ...asRow(r), row: "leader" as const })),
    ],
    staffWithActiveEnrollment: enrolments.filter((e) => e.role !== "STUDENT" || serving.has(e.userId)).map(asRow),
  };
}

export function countViolations(v: Violations): number {
  return Object.values(v).reduce((sum: number, rows: unknown[]) => sum + rows.length, 0);
}

/**
 * Why `--apply` must not run, or null when it may. Only reads. The backfill turns
 * a null result into PASSED, which is right exactly once: before go-live every
 * null means "finished before results existed"; after it, a null is a legitimate
 * outcome (a deleted account at End), so a second run would invent passes. A fresh
 * copy of the old database has no results at all.
 */
export async function applyRefusal(violations: Violations): Promise<string | null> {
  if (countViolations(violations) > 0) return "fix the role-rule violations above first.";
  try {
    const withResult = await db.seasonEnrollment.count({ where: { result: { not: null } } });
    if (withResult > 0) {
      return `${withResult} enrolment(s) already have a result; --apply only runs on a database with none.`;
    }
  } catch (err) {
    if (!isMissingResultColumn(err)) throw err;
    return "the database isn't migrated yet (no `result` column): run the migrations first.";
  }
  return null;
}

/** Prisma's "column does not exist": the community-model migration hasn't reached this database. */
function isMissingResultColumn(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2022";
}

/**
 * The read-only run. Violations come first and read no new column, so they print
 * on a database the migration hasn't reached, which is when they are most useful.
 */
export async function readOnlyReport(log: (...args: unknown[]) => void): Promise<void> {
  const violations = await findRoleRuleViolations();
  log("Role-rule violations:", JSON.stringify(violations, null, 2));
  await printReviewLists(log);
  try {
    log("Would change:", await backfillResults({ dryRun: true }));
  } catch (err) {
    if (!isMissingResultColumn(err)) throw err;
    log("The `result` column is missing: this database isn't migrated yet.");
    log("Unknown until it is: what the backfill would change, and whether --apply is allowed.");
    return;
  }
  log("--apply would be:", (await applyRefusal(violations)) ?? "allowed");
}

interface BackfillOptions {
  /** Limit the backfill to these seasons (tests use it to stay on their own fixtures). */
  seasonIds?: number[];
  /** Count only; write nothing. */
  dryRun?: boolean;
}

/** Several minutes' worth of seasons is still one all-or-nothing run. */
const BACKFILL_TIMEOUT_MS = 120_000;

export async function backfillResults(
  opts: BackfillOptions = {},
): Promise<{ markedPassed: number; completedStale: number }> {
  const inSeasons = opts.seasonIds ? { seasonId: { in: opts.seasonIds } } : {};
  const finished = { status: { in: ["COMPLETED" as const, "ARCHIVED" as const] } };
  const now = new Date();

  // In a finished season only: a COMPLETED student in a season still running
  // graduated part-way, and has no result to give yet.
  const completedWhere = { ...inSeasons, status: "COMPLETED" as const, result: null, season: finished };
  const staleWhere = { ...inSeasons, status: "ACTIVE" as const, season: finished };

  if (opts.dryRun) {
    return {
      markedPassed: await db.seasonEnrollment.count({ where: completedWhere }),
      completedStale: await db.seasonEnrollment.count({ where: staleWhere }),
    };
  }

  return db.$transaction(
    async (tx) => {
      const passed = await tx.seasonEnrollment.updateMany({
        where: completedWhere,
        data: { result: "PASSED", resultSetAt: now },
      });
      // One write per season, however many students it stranded.
      const staleSeasons = await tx.season.findMany({
        where: {
          ...finished,
          ...(opts.seasonIds ? { id: { in: opts.seasonIds } } : {}),
          enrollments: { some: { status: "ACTIVE" } },
        },
        select: { id: true, endDate: true },
      });
      let completedStale = 0;
      for (const season of staleSeasons) {
        const closed = await tx.seasonEnrollment.updateMany({
          where: { seasonId: season.id, status: "ACTIVE" },
          data: { status: "COMPLETED", completedAt: season.endDate, result: "PASSED", resultSetAt: now },
        });
        completedStale += closed.count;
      }
      return { markedPassed: passed.count, completedStale };
    },
    { timeout: BACKFILL_TIMEOUT_MS },
  );
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  console.log(`Database host: ${new URL(config.databaseUrl).hostname}`);

  if (!apply) {
    await readOnlyReport(console.log);
    console.log("Read-only run. Pass --apply to backfill.");
    return;
  }
  const violations = await findRoleRuleViolations();
  console.log("Role-rule violations:", JSON.stringify(violations, null, 2));
  const refusal = await applyRefusal(violations);
  if (refusal) throw new Error(`Refusing to --apply: ${refusal}`);
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
