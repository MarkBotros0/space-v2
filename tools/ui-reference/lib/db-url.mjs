import { readFileSync } from "node:fs";
import path from "node:path";
import { V1_SOURCE_DIR } from "./paths.mjs";

/** The shared test database URL from jpc-space/.env (read-only). Never printed. */
export function readDatabaseUrl() {
  const env = readFileSync(path.join(V1_SOURCE_DIR, ".env"), "utf8");
  const m = env.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
  if (!m) throw new Error("DATABASE_URL not found in jpc-space/.env");
  return m[1];
}
