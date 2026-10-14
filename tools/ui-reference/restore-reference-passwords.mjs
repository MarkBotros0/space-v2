// Puts back the reference users' original password hashes saved by
// set-reference-passwords.mjs, then deletes the backup.
import { existsSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { readDatabaseUrl } from "./lib/db-url.mjs";

const BACKUP_FILE = path.join(os.homedir(), ".secrets/jpc-reference-password-backup.json");
if (!existsSync(BACKUP_FILE)) {
  console.log("no backup to restore");
  process.exit(0);
}
const rows = JSON.parse(readFileSync(BACKUP_FILE, "utf8"));
const client = new pg.Client({ connectionString: readDatabaseUrl() });
await client.connect();
for (const r of rows) {
  await client.query(`update "User" set "passwordHash" = $1 where email = $2`, [r.passwordHash, r.email]);
}
await client.end();
rmSync(BACKUP_FILE);
console.log(`restored ${rows.length} reference users' original passwords`);
