/**
 * Prisma CLI config — used only by `prisma migrate` (db:migrate:deploy and
 * db:migrate:status). The app never reads it: it connects through the pg
 * driver adapter with the URL from src/lib/config.ts.
 *
 * The URL is read lazily from DATABASE_URL (loaded from .env) rather than with
 * prisma/config's env(), which throws when unset and would break
 * `prisma generate` in CI, where no database exists. This file is CLI tooling,
 * the one deliberate exception to "no process.env outside src/lib/config.ts".
 */
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
