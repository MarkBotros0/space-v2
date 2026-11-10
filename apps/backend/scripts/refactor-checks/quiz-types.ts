/**
 * Quiz question types data checks (docs/superpowers/plans/2026-11-10-quiz-question-types.md,
 * Task 1). Read-only: it runs SELECTs only, and prints the database host, never the URL.
 * Run from apps/backend against each real environment before 20261112040000_quiz_backfill_options
 * is deployed:
 *   pnpm check:quiz-types
 *
 * The backfill turns every MCQ question into SINGLE_CHOICE option rows and every selectedIndex
 * into a selection row. Each check counts what will not copy cleanly and says what the
 * migration does with it. None blocks: the app is unpublished and these are test quizzes; the
 * check is there so nothing is a surprise.
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

const SAMPLE = 10;

/** The query selects `n` (count(*) OVER ()) and `id`, ordered, with LIMIT 10. */
async function sample(sql: TemplateStringsArray): Promise<string> {
  const rows = await db.$queryRaw<{ n: bigint; id: number }[]>(sql);
  const n = Number(rows[0]?.n ?? 0);
  return n === 0 ? "0 row(s)" : `${n} row(s), ids ${rows.map((r) => r.id).join(", ")}${n > SAMPLE ? ", ..." : ""}`;
}

export const CHECKS: Check[] = [
  {
    step: "20261112040000",
    title: "MCQ questions whose correctIndex is missing or past the options (they get no correct option)",
    run: async () => {
      const detail = await sample`
        SELECT count(*) OVER () AS n, "id" FROM "QuizQuestion"
        WHERE "type" = 'MCQ'
          AND ("correctIndex" IS NULL OR "correctIndex" < 0 OR "correctIndex" >= cardinality("options"))
        ORDER BY "id" LIMIT 10`;
      return { ok: true, detail };
    },
  },
  {
    step: "20261112040000",
    title: "MCQ answers whose selectedIndex is past the question's options (they get no selection)",
    run: async () => {
      const detail = await sample`
        SELECT count(*) OVER () AS n, a."id" FROM "QuizAnswer" a
        JOIN "QuizQuestion" q ON q."id" = a."questionId"
        WHERE q."type" = 'MCQ'
          AND (a."selectedIndex" < 0 OR a."selectedIndex" >= cardinality(q."options"))
        ORDER BY a."id" LIMIT 10`;
      return { ok: true, detail };
    },
  },
  {
    step: "20261112040000",
    title: "MCQ questions with fewer than two options (they become single choice as they are)",
    run: async () => {
      const detail = await sample`
        SELECT count(*) OVER () AS n, "id" FROM "QuizQuestion"
        WHERE "type" = 'MCQ' AND cardinality("options") < 2
        ORDER BY "id" LIMIT 10`;
      return { ok: true, detail };
    },
  },
];

async function main(): Promise<void> {
  console.log(`Quiz question types checks on host ${databaseHost(config.databaseUrl)} (read-only)\n`);
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
