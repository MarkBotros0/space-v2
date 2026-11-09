/**
 * Writes docs/database/erd.md from prisma/schema.prisma. Run from apps/backend:
 *   pnpm db:erd
 * after any schema change; src/__tests__/erd.test.ts fails while it is stale.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { renderErd } from "./erd/render";

export const SCHEMA_PATH = join(__dirname, "../prisma/schema.prisma");
export const ERD_PATH = join(__dirname, "../../../docs/database/erd.md");

if (require.main === module) {
  mkdirSync(dirname(ERD_PATH), { recursive: true });
  writeFileSync(ERD_PATH, renderErd(readFileSync(SCHEMA_PATH, "utf8")));
  console.log("Wrote docs/database/erd.md");
}
