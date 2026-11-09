/**
 * Characterization test for the refactor (docs/refactor-plan.md, Wave 0).
 *
 * Pins the schema that prisma/migrations produces: every column (type,
 * nullability, default), index and constraint in `public`. Code-only waves
 * must leave it unchanged; a schema wave updates the snapshot in the same
 * commit as its migration, so every schema change shows up as a reviewable
 * diff (`jest --config jest.integration.config.js schema-snapshot -u`).
 *
 * Read-only: it only queries the catalog.
 */
import { db } from "../../db/client";

jest.setTimeout(60000);

afterAll(async () => {
  await db.$disconnect();
});

const IGNORED_TABLE = "_prisma_migrations";

describe("database schema", () => {
  it("has exactly these columns", async () => {
    const rows = await db.$queryRaw<
      {
        table_name: string;
        column_name: string;
        data_type: string;
        is_nullable: string;
        column_default: string | null;
      }[]
    >`
      SELECT table_name, column_name,
             CASE WHEN data_type = 'USER-DEFINED' THEN udt_name ELSE data_type END AS data_type,
             is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name <> ${IGNORED_TABLE}
      ORDER BY table_name, column_name`;
    const lines = rows.map(
      (r) =>
        `${r.table_name}.${r.column_name} ${r.data_type}${r.is_nullable === "NO" ? " NOT NULL" : ""}` +
        (r.column_default ? ` DEFAULT ${r.column_default}` : ""),
    );
    expect(lines).toMatchSnapshot();
  });

  it("has exactly these indexes", async () => {
    const rows = await db.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename <> ${IGNORED_TABLE}
      ORDER BY tablename, indexname`;
    expect(rows.map((r) => r.indexdef)).toMatchSnapshot();
  });

  it("has exactly these constraints", async () => {
    const rows = await db.$queryRaw<{ line: string }[]>`
      SELECT c.conrelid::regclass::text || ' ' || c.conname || ': ' || pg_get_constraintdef(c.oid) AS line
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.conrelid::regclass::text <> ${IGNORED_TABLE}
      ORDER BY 1`;
    expect(rows.map((r) => r.line)).toMatchSnapshot();
  });

  it("has exactly these enums", async () => {
    const rows = await db.$queryRaw<{ line: string }[]>`
      SELECT t.typname || ': ' || string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS line
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      GROUP BY t.typname ORDER BY t.typname`;
    expect(rows.map((r) => r.line)).toMatchSnapshot();
  });
});
