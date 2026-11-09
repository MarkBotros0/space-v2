/**
 * Refactor Wave 3 data checks (docs/refactor-plan.md, D7). Read-only: it runs
 * SELECTs and SHOW only, and prints the database host, never the URL.
 * Run from apps/backend against each real environment before its Wave 3
 * migrations are deployed:
 *   pnpm check:wave-3
 *
 * Each check says what the migration will do with what it finds. Losing those
 * rows is acceptable (D9); the check is there so nothing is a surprise.
 */
import { db } from "../../src/db/client";
import { config } from "../../src/lib/config";
import { databaseHost } from "../lib/db-host";

interface Check {
  step: string;
  title: string;
  /** Returns the finding, and whether it blocks the deploy (ok: false). */
  run: () => Promise<{ ok: boolean; detail: string }>;
}

async function count(sql: TemplateStringsArray): Promise<number> {
  const rows = await db.$queryRaw<{ n: bigint }[]>(sql);
  return Number(rows[0]?.n ?? 0);
}

export const CHECKS: Check[] = [
  {
    step: "3.7",
    title: "the app's connections use the UTC session time zone",
    // The pg adapter sends a Date as its UTC wall-clock time with no offset, and
    // reads a timestamptz back by overwriting the offset with +00:00. After the
    // timestamptz conversion both are right only when the session TimeZone is UTC
    // (RateLimitHit.resetAt already depends on it). Not UTC: do not deploy 3.7.
    run: async () => {
      const rows = await db.$queryRaw<{ tz: string }[]>`SELECT current_setting('TimeZone') AS tz`;
      const tz = rows[0]?.tz ?? "unknown";
      return { ok: tz === "UTC" || tz === "Etc/UTC", detail: `TimeZone = ${tz}` };
    },
  },
  {
    step: "3.7",
    title: "User.dateOfBirth values that are not at UTC midnight (become their UTC day)",
    run: async () => {
      const n = await count`
        SELECT count(*) AS n FROM "User"
        WHERE "dateOfBirth" IS NOT NULL AND "dateOfBirth" <> date_trunc('day', "dateOfBirth")`;
      return { ok: true, detail: `${n} row(s)` };
    },
  },
  {
    step: "3.8",
    title: "accounts whose emails differ only in case (the migration fails until they are resolved)",
    run: async () => {
      const n = await count`
        SELECT count(*) AS n FROM (
          SELECT lower(trim("email")) FROM "User" GROUP BY 1 HAVING count(*) > 1
        ) dup`;
      return { ok: n === 0, detail: `${n} address(es)` };
    },
  },
  {
    step: "3.8",
    title: "emails the migration will trim or lowercase",
    run: async () => {
      const n = await count`SELECT count(*) AS n FROM "User" WHERE "email" <> lower(trim("email"))`;
      return { ok: true, detail: `${n} row(s)` };
    },
  },
  {
    step: "3.9",
    title:
      "rows the integrity guards clean up first (older duplicate IN_PROGRESS attempts deleted, duplicate group names suffixed, out-of-range values reset)",
    run: async () => {
      const [attempts, groups, seasons, sessions, questions] = await Promise.all([
        count`SELECT count(*) AS n FROM (
                SELECT "quizId", "studentUserId", count(*) - 1 AS extra FROM "QuizAttempt"
                WHERE "status" = 'IN_PROGRESS' GROUP BY 1, 2 HAVING count(*) > 1) d`,
        count`SELECT coalesce(sum(c - 1), 0) AS n FROM (
                SELECT count(*) AS c FROM "Group" GROUP BY "seasonId", "name" HAVING count(*) > 1) d`,
        count`SELECT count(*) AS n FROM "Season"
              WHERE "endDate" < "startDate" OR "absenceBudgetMinutes" < 0 OR "absenceWeightMinutes" <= 0`,
        count`SELECT count(*) AS n FROM "Session" WHERE "durationMinutes" <= 0`,
        count`SELECT (SELECT count(*) FROM "QuizQuestion" WHERE "points" < 0)
                   + (SELECT count(*) FROM "SessionVideoQuestion" WHERE "points" < 0) AS n`,
      ]);
      return {
        ok: true,
        detail:
          `${attempts} quiz/student pair(s) with several IN_PROGRESS attempts, ${groups} group name(s), ` +
          `${seasons} season(s), ${sessions} session(s), ${questions} question(s)`,
      };
    },
  },
];

async function main(): Promise<void> {
  console.log(`Wave 3 checks on host ${databaseHost(config.databaseUrl)} (read-only)\n`);
  let blocked = false;
  for (const check of CHECKS) {
    const { ok, detail } = await check.run();
    if (!ok) blocked = true;
    console.log(`${ok ? "ok     " : "BLOCKED"} [${check.step}] ${check.title}: ${detail}`);
  }
  console.log(blocked ? "\nDo not deploy the blocked steps; see the comment on each check." : "\nNothing blocks.");
  process.exitCode = blocked ? 1 : 0;
}

if (require.main === module) {
  main()
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : "check failed");
      process.exitCode = 1;
    })
    .finally(() => void db.$disconnect());
}
