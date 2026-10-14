// Pages the link crawl cannot reach (signed-out pages, notification pages
// opened from the bell, detail pages behind JS navigation). Ids come from the
// shared test database, read-only, so the pages show real content.
import { readFileSync } from "node:fs";
import pg from "pg";
import { readDatabaseUrl } from "./db-url.mjs";
import { MANIFEST_FILE, USERS_FILE } from "./paths.mjs";

export const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password"];

export async function extraPathsFor(role) {
  if (role === "public") return PUBLIC_PATHS;
  const paths = [`/${role}/notifications`];
  // checkin/[token] needs a signed-in student; a bogus token shows its error state.
  if (role === "student") paths.push("/checkin/not-a-real-token");
  const client = new pg.Client({ connectionString: readDatabaseUrl() });
  await client.connect();
  await client.query("SET default_transaction_read_only = on");
  try {
    if (role === "student") {
      const email = JSON.parse(readFileSync(USERS_FILE, "utf8")).student.email;
      const { rows } = await client.query(
        `select a."sessionId" as id from "Attendance" a join "User" u on u.id = a."studentUserId"
         where u.email = $1 order by a."sessionId" desc limit 1`,
        [email],
      );
      if (rows[0]) paths.push(`/student/sessions/${rows[0].id}`);
    }
    if (role === "leader") {
      const leader = JSON.parse(readFileSync(MANIFEST_FILE, "utf8")).roles.leader.pages;
      const session = leader.find((p) => p.pattern === "/leader/sessions/[id]");
      if (session) paths.push(`${session.exampleUrl}/attendance`);
    }
    if (role === "super") {
      const { rows } = await client.query(`select program, year from "Season" order by id desc limit 1`);
      if (rows[0]) {
        paths.push(`/super/seasons/year/${rows[0].year}`);
        paths.push(`/super/seasons/program/${encodeURIComponent(rows[0].program)}`);
      }
    }
  } finally {
    await client.end();
  }
  return paths;
}
