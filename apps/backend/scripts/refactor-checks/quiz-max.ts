/**
 * Quiz scores above their quiz's max (docs/superpowers/plans/2026-11-12-season-passing.md, final
 * review I1). Read-only: it runs SELECTs only, and prints the database host, never the URL.
 * Run from apps/backend against each real environment before the next season is ended:
 *   pnpm check:quiz-max
 *
 * v1 had no cap on paper grades and kept an online attempt's total when its quiz's points were
 * edited down. Season passing counts each quiz at most its maxScore (`quizTotal` in
 * src/lib/passing/numbers.ts), so none of these blocks End any more; the check lists them so an
 * admin can correct the grade or the quiz before the season's scores are stored.
 */
import { db } from "../../src/db/client";
import { config } from "../../src/lib/config";
import { databaseHost } from "../lib/db-host";

interface Check {
  title: string;
  run: () => Promise<string>;
}

const SAMPLE = 10;

/** The query selects `n` (count(*) OVER ()) and `id`, ordered, with LIMIT 10. */
async function sample(sql: TemplateStringsArray): Promise<string> {
  const rows = await db.$queryRaw<{ n: bigint; id: number }[]>(sql);
  const n = Number(rows[0]?.n ?? 0);
  return n === 0 ? "0 row(s)" : `${n} row(s), ids ${rows.map((r) => r.id).join(", ")}${n > SAMPLE ? ", ..." : ""}`;
}

const CHECKS: Check[] = [
  {
    title: "QuizGrade rows (paper grades and admin scores) above their quiz's maxScore, ACTIVE seasons",
    run: () => sample`
      SELECT count(*) OVER () AS n, g."id" FROM "QuizGrade" g
      JOIN "Quiz" q ON q."id" = g."quizId"
      JOIN "Season" s ON s."id" = q."seasonId"
      WHERE s."status" = 'ACTIVE' AND s."deletedAt" IS NULL
        AND g."score" IS NOT NULL AND g."score" > q."maxScore"
      ORDER BY g."id" LIMIT 10`,
  },
  {
    title: "GRADED attempts on published ONLINE quizzes whose total is above the quiz's maxScore, ACTIVE seasons",
    run: () => sample`
      SELECT count(*) OVER () AS n, a."id" FROM "QuizAttempt" a
      JOIN "Quiz" q ON q."id" = a."quizId"
      JOIN "Season" s ON s."id" = q."seasonId"
      WHERE s."status" = 'ACTIVE' AND s."deletedAt" IS NULL
        AND q."kind" = 'ONLINE' AND q."publishedAt" IS NOT NULL
        AND a."status" = 'GRADED' AND a."totalScore" > q."maxScore"
      ORDER BY a."id" LIMIT 10`,
  },
];

async function main(): Promise<void> {
  console.log(`Quiz scores above max on host ${databaseHost(config.databaseUrl)} (read-only)\n`);
  for (const check of CHECKS) console.log(`${check.title}: ${await check.run()}`);
  console.log("\nNothing blocks: End counts each quiz at most its max. Correct the rows listed if they are wrong.");
}

if (require.main === module) {
  main()
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : "check failed");
      process.exitCode = 1;
    })
    .finally(() => void db.$disconnect());
}
