import { writeFileSync, mkdirSync } from "node:fs";
import pg from "pg";
import { readDatabaseUrl } from "./lib/db-url.mjs";
import { REF_ROOT, USERS_FILE } from "./lib/paths.mjs";

// The user with the most attached rows per role, so lists are populated.
const ACTIVITY = `(
  (select count(*) from "Submission" s where s."studentUserId" = u.id) +
  (select count(*) from "Attendance" a where a."studentUserId" = u.id) +
  (select count(*) from "GroupLeader" gl where gl."userId" = u.id) * 50 +
  (select count(*) from "SeasonAdmin" sa where sa."userId" = u.id) * 50
)`;

const QUERIES = {
  student: `role = 'STUDENT' and "graduationYear" is null`,
  alumni: `role = 'STUDENT' and "graduationYear" is not null`,
  leader: `role = 'LEADER'`,
  admin: `role = 'ADMIN'`,
  super: `role = 'SUPER'`,
  mentor: `role = 'MENTOR'`,
};

const client = new pg.Client({ connectionString: readDatabaseUrl() });
await client.connect();
await client.query("SET default_transaction_read_only = on");
const users = {};
for (const [role, where] of Object.entries(QUERIES)) {
  const { rows } = await client.query(
    `select u.email, u.name from "User" u where ${where} and u."deletedAt" is null
     order by ${ACTIVITY} desc, u.id asc limit 1`,
  );
  users[role] = rows[0] ?? null;
  console.log(`${role}: ${rows[0] ? "found" : "NO USER"}`);
}
await client.end();
mkdirSync(REF_ROOT, { recursive: true });
writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), { mode: 0o600 });
