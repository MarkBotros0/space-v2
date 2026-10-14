// Gives the reference users (users.json) one known password so the v2 app can
// log in as them on the shared test database. Their original hashes are saved
// first (600) and restore-reference-passwords.mjs puts them back.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import pg from "pg";
import { readDatabaseUrl } from "./lib/db-url.mjs";
import { mergeBackup } from "./lib/password-backup.mjs";
import { USERS_FILE } from "./lib/paths.mjs";

export const PASSWORD_FILE = path.join(os.homedir(), ".secrets/jpc-v1-reference-password");
export const BACKUP_FILE = path.join(os.homedir(), ".secrets/jpc-reference-password-backup.json");

const emails = Object.values(JSON.parse(readFileSync(USERS_FILE, "utf8"))).filter(Boolean).map((u) => u.email);
const client = new pg.Client({ connectionString: readDatabaseUrl() });
await client.connect();

// Save every original before any update: users already in the backup keep
// their first-saved hash (a re-read would return the test hash), users new
// to users.json are added.
const saved = existsSync(BACKUP_FILE) ? JSON.parse(readFileSync(BACKUP_FILE, "utf8")) : [];
const { rows } = await client.query(`select email, "passwordHash" from "User" where email = any($1::text[])`, [emails]);
writeFileSync(BACKUP_FILE, JSON.stringify(mergeBackup(saved, rows)), { mode: 0o600 });
if (!existsSync(PASSWORD_FILE)) {
  writeFileSync(PASSWORD_FILE, randomBytes(18).toString("base64url"), { mode: 0o600 });
}
const hash = await bcrypt.hash(readFileSync(PASSWORD_FILE, "utf8").trim(), 10);
const { rowCount } = await client.query(`update "User" set "passwordHash" = $1 where email = any($2::text[])`, [hash, emails]);
await client.end();
console.log(`updated ${rowCount} reference users; originals saved for restore`);
