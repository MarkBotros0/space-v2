// Prisma CLI config for the cutover ONLY (Plan 18). Never imported by the app.
// Prisma auto-loads `prisma.config.ts`, not this file, so `db:generate`, tests
// and CI never see it; it is used only as `--config prisma.cutover.config.ts`.
//
// It deliberately does NOT import "dotenv/config": apps/backend/.env points at
// the shared database, and a CLI that silently picked it up is how a migration
// reaches production by accident. DATABASE_URL must be supplied in the shell,
// by the operator, for the one database the command is meant for.
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
