/**
 * Community model, Build 2: move stored ADMIN and LEADER accounts to STUDENT.
 * Their authority already comes from season rows (lib/auth/scopes.ts), so this
 * changes nobody's derived role and needs no session change. It only clears a
 * column that no longer means anything.
 *
 * Run from apps/backend, on a database the owner names:
 *   pnpm roles:convert            read-only: prints the plan
 *   pnpm roles:convert --apply    refuses if anyone lacks a graduationYear, else
 *                                 converts in one transaction. Safe to re-run.
 *
 * Not a migration: a migration must never change `User.role` values, since the
 * old Neon database is kept and v1 still reads them.
 */
import { db } from "../src/db/client";
import { config } from "../src/lib/config";

interface PersonRow {
  id: number;
  email: string;
  role: string;
  graduationYear: number | null;
  deletedAt: Date | null;
}

export interface ConversionPlan {
  convert: (PersonRow & { from: string; to: "STUDENT" })[];
  /** Staff with no graduationYear would become current students, not alumni. */
  refused: PersonRow[];
}

const STORED_STAFF = ["ADMIN", "LEADER"] as const;
const isStoredStaff = (role: string) => (STORED_STAFF as readonly string[]).includes(role);

export function planConversion(rows: PersonRow[]): ConversionPlan {
  const staff = rows.filter((r) => isStoredStaff(r.role));
  return {
    convert: staff
      .filter((r) => r.graduationYear !== null)
      .map((r) => ({ ...r, from: r.role, to: "STUDENT" as const })),
    refused: staff.filter((r) => r.graduationYear === null),
  };
}

type Reader = Pick<typeof db, "user">;
const readStoredStaff = (client: Reader): Promise<PersonRow[]> =>
  client.user.findMany({
    where: { role: { in: [...STORED_STAFF] } },
    select: { id: true, email: true, role: true, graduationYear: true, deletedAt: true },
    orderBy: { id: "asc" },
  });

/** Plans inside the transaction, so what it writes is what it just read. */
export async function applyConversion(): Promise<{ converted: number }> {
  return db.$transaction(
    async (tx) => {
      const { convert, refused } = planConversion(await readStoredStaff(tx));
      if (refused.length > 0) {
        throw new Error(
          `Refusing to --apply: ${refused.length} account(s) have no graduation year: ` +
            refused.map((r) => r.email).join(", "),
        );
      }
      if (convert.length === 0) return { converted: 0 };

      await tx.user.updateMany({
        where: { id: { in: convert.map((c) => c.id) } },
        data: { role: "STUDENT" },
      });
      for (const person of convert) {
        await tx.studentProfile.upsert({
          where: { userId: person.id },
          update: {},
          create: { userId: person.id, deletedAt: person.deletedAt },
        });
      }
      return { converted: convert.length };
    },
    { timeout: 120_000 },
  );
}

/**
 * Direct or pooled, never the host or URL. A malformed URL answers "unknown":
 * letting `new URL` throw would print the input, credentials included.
 */
export function databaseHostType(databaseUrl: string): "direct" | "pooled" | "unknown" {
  try {
    return /pooled|pooler/.test(new URL(databaseUrl).hostname) ? "pooled" : "direct";
  } catch {
    return "unknown";
  }
}

async function main(): Promise<void> {
  console.log(`Database host type: ${databaseHostType(config.databaseUrl)}`);

  if (process.argv.includes("--apply")) {
    console.log("Converted:", (await applyConversion()).converted);
    return;
  }
  const { convert, refused } = planConversion(await readStoredStaff(db));
  console.log(`Would convert ${convert.length}:`);
  for (const c of convert) console.log(`  ${c.email}: ${c.from} -> ${c.to}`);
  console.log(`Refused, no graduation year (${refused.length}):`);
  for (const r of refused) console.log(`  ${r.email}: ${r.role}`);
  console.log("Read-only run. Pass --apply to convert.");
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
