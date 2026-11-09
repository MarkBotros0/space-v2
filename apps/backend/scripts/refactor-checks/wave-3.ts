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
