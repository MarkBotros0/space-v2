/**
 * "Submitted" has one definition (lib/assignments/submitted.ts): tapped Submit in the app, or
 * marked submitted by staff. A reader that spells `submittedAt: { not: null }` on a Submission
 * query counts only the first and silently disagrees with every other count. The writes that
 * really mean "tapped Submit" (the submit itself, the standing and reopen rules, essay review)
 * are the only files allowed to say it.
 *
 * What it can't catch: a count made in JS over rows already read (`s.submittedAt !== null`
 * instead of `isSubmitted(s)`), a filter built in a variable or spread from elsewhere, raw SQL,
 * and a Submission query whose call or relation key sits more than 600 characters before the
 * filter (the look-back `modelAt` reads). Review those by hand.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(__dirname, "..");
const ALLOWED = new Set(
  ["submitted", "submit", "standing", "writes", "part-changes", "essay-review"].map((f) => `lib/assignments/${f}.ts`),
);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "__tests__" || name === "generated") return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

/** The Prisma model a `submittedAt: { not: null }` at `at` filters: the nearest call or relation before it. */
function modelAt(text: string, at: number): string {
  const before = text.slice(Math.max(0, at - 600), at);
  const pattern = /\b(?:db|tx|client)\.(\w+)\.|\b(submissions?|partWork|assignmentPartWork|works?)\s*:\s*\{/g;
  let last = "";
  for (const m of before.matchAll(pattern)) last = (m[1] ?? m[2])!;
  return last;
}

function offenders(): string[] {
  return sourceFiles(SRC).flatMap((file) => {
    const rel = relative(SRC, file).split("\\").join("/");
    if (ALLOWED.has(rel)) return [];
    const text = readFileSync(file, "utf8");
    return [...text.matchAll(/submittedAt:\s*\{\s*not:\s*null\s*\}/g)]
      .filter((m) => ["submission", "submissions"].includes(modelAt(text, m.index)))
      .map((m) => `${rel}:${text.slice(0, m.index).split("\n").length}`);
  });
}

describe("one definition of a submitted assignment", () => {
  it("no Submission query outside the allowed files spells submittedAt: { not: null }", () => {
    expect(offenders()).toEqual([]);
  });

  it("the guard sees a Submission query and ignores an essay one", () => {
    const sub = "db.submission.findMany({ where: { assignmentId, submittedAt: { not: null } } })";
    const work = "db.assignmentPartWork.findMany({ where: { submittedAt: { not: null } } })";
    const relation = "_count: { select: { submissions: { where: { submittedAt: { not: null } } } } }";
    expect(modelAt(sub, sub.indexOf("submittedAt"))).toBe("submission");
    expect(modelAt(work, work.indexOf("submittedAt"))).toBe("assignmentPartWork");
    expect(modelAt(relation, relation.indexOf("submittedAt"))).toBe("submissions");
  });
});
