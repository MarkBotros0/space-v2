import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { VISIBILITY_LABELS } from "../screens/events/event-form";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? (f === "node_modules" ? [] : walk(p)) : [p];
  });

describe("event visibility copy", () => {
  it("the audience option reads Alumni only", () => {
    expect(VISIBILITY_LABELS.ALUMNI_ONLY).toBe("Alumni only");
  });

  it("'Alumni & staff' appears nowhere in src or .maestro", () => {
    const roots = [join(__dirname, ".."), join(__dirname, "..", "..", ".maestro")];
    const hits = roots
      .flatMap(walk)
      .filter((p) => !p.endsWith("alumni-only-copy.test.ts"))
      .filter((p) => readFileSync(p, "utf8").includes("Alumni & staff"));
    expect(hits).toEqual([]);
  });
});
