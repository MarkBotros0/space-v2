# space-v2 Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `space-v2` pnpm + Turborepo monorepo with an Expo mobile app and an Express backend, carrying one working login path end to end.

**Architecture:** Two apps (`apps/mobile`, `apps/backend`) share Zod contracts through `packages/shared` (consumed as TypeScript source, no build step) and tooling through `packages/config`. The backend ports v1's `/api/v1` auth into Express against the same staging Postgres database, staying token-compatible with v1.

**Tech Stack:** pnpm 10, Turborepo 2, TypeScript 5.9 strict, Express 5, Prisma 7 (`@prisma/adapter-pg`), `jose`, `bcryptjs`, Zod, jest + ts-jest + supertest, Expo SDK 54, expo-router, React Query, Zustand, axios, jest-expo + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-08-20-space-v2-monorepo-design.md`

## Global Constraints

- Package scope is `@space/*`. Internal deps use `workspace:*`.
- Node `>=24`, pnpm `>=10`. Root `package.json` sets `"packageManager": "pnpm@10.30.3"`.
- `.npmrc` must contain `shamefully-hoist=true`. React Native's Metro cannot resolve pnpm's nested symlinks.
- TypeScript strict everywhere: `strict`, `noImplicitAny`, `noUncheckedIndexedAccess`, `forceConsistentCasingInFileNames`. **No `any`** — use `unknown` plus a type guard.
- Prisma 7 does not generate into `node_modules`. Client output is `src/generated/prisma`; import from there, never from `@prisma/client`.
- **Passwords are bcryptjs.** The shared database's existing `passwordHash` values are bcrypt.
- **Access tokens:** `jose`, HS256, secret is `AUTH_SECRET` (same value as v1), audience `"jpc-mobile"`, subject `String(userId)`, TTL 900 seconds.
- **Refresh tokens:** 32 random bytes base64url; stored only as a sha256 hex digest; TTL 30 days; rotated and revoked on use.
- Response envelope: success `{ "data": ... }`, failure `{ "error": { "code", "message" } }`.
- No Prisma migrations are created in this plan. `prisma/migrations/` is copied verbatim from v1.
- Never read `process.env` in application code outside `src/lib/config.ts`.
- Files are kebab-case. Types/classes PascalCase. Env vars SCREAMING_SNAKE_CASE.
- Commit after every task.

---

### Task 1: Workspace root

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.npmrc`, `.prettierrc`, `tsconfig.json`

**Interfaces:**
- Consumes: nothing.
- Produces: root scripts `build`, `dev`, `lint`, `typecheck`, `test`, `format`, `clean`, each delegating to `turbo run <task>`. Workspace globs `apps/*` and `packages/*`.

- [ ] **Step 1: Create `.npmrc`**

```
shamefully-hoist=true
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- [ ] **Step 3: Create root `package.json`**

```json
{
  "name": "space-v2",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@10.30.3",
  "engines": {
    "node": ">=24.0.0",
    "pnpm": ">=10.0.0"
  },
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test:unit test:integration",
    "test:unit": "turbo run test:unit",
    "format": "prettier --write \"**/*.{ts,tsx,js,json,md}\"",
    "clean": "turbo run clean"
  },
  "devDependencies": {
    "prettier": "^3.2.5",
    "turbo": "^2.0.0",
    "typescript": "^5.9.3"
  }
}
```

- [ ] **Step 4: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*", ".env"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "build/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "test:unit": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    // Never cached: these tests hit the shared staging database, which Turborepo
    // cannot see. A cache hit would report success for a database that may be
    // unreachable or changed since the run that populated the cache.
    "test:integration": {
      "dependsOn": ["^build"],
      "cache": false,
      "outputs": []
    },
    "clean": {
      "cache": false
    }
  }
}
```

- [ ] **Step 5: Create `.prettierrc`**

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 6: Create root `tsconfig.json`**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true,
    "target": "ES2024",
    "module": "CommonJS",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  },
  "exclude": ["node_modules"]
}
```

- [ ] **Step 7: Install and verify**

Run: `pnpm install`
Expected: completes, creates `pnpm-lock.yaml` and root `node_modules`.

Run: `pnpm turbo run typecheck`
Expected: succeeds with no packages matched (there are none yet). If Turbo errors about zero tasks, that is acceptable at this stage — the check is that Turbo itself resolves and runs.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold pnpm + turborepo workspace root"
```

---

### Task 2: packages/config

**Files:**
- Create: `packages/config/package.json`, `packages/config/tsconfig/base.json`, `packages/config/tsconfig/node.json`, `packages/config/tsconfig/react-native.json`, `packages/config/eslint/index.js`, `packages/config/eslint/native.js`, `packages/config/prettier/index.js`

**Interfaces:**
- Consumes: nothing.
- Produces: package `@space/config` with exports `./tsconfig/base.json`, `./tsconfig/node.json`, `./tsconfig/react-native.json`, `./eslint`, `./eslint-native`, `./prettier`.

- [ ] **Step 1: Create `packages/config/package.json`**

```json
{
  "name": "@space/config",
  "version": "0.1.0",
  "private": true,
  "exports": {
    "./eslint": "./eslint/index.js",
    "./eslint-native": "./eslint/native.js",
    "./prettier": "./prettier/index.js",
    "./tsconfig/base.json": "./tsconfig/base.json",
    "./tsconfig/node.json": "./tsconfig/node.json",
    "./tsconfig/react-native.json": "./tsconfig/react-native.json"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.0.0",
    "eslint-config-prettier": "^9.1.0",
    "eslint-plugin-react": "^7.34.2",
    "eslint-plugin-react-hooks": "^5.0.0",
    "eslint-plugin-react-native": "^4.1.0"
  }
}
```

- [ ] **Step 2: Create `packages/config/tsconfig/base.json`**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true,
    "target": "ES2024",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 3: Create `packages/config/tsconfig/node.json`**

```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "node",
    "lib": ["ES2024"],
    "declaration": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 4: Create `packages/config/tsconfig/react-native.json`**

```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2024", "DOM"],
    "jsx": "react-jsx",
    "allowJs": true,
    "noEmit": true
  }
}
```

- [ ] **Step 5: Create `packages/config/prettier/index.js`**

```js
module.exports = {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  printWidth: 100,
};
```

- [ ] **Step 6: Create `packages/config/eslint/index.js`**

```js
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");
const prettier = require("eslint-config-prettier");

module.exports = [
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  prettier,
];
```

- [ ] **Step 7: Create `packages/config/eslint/native.js`**

```js
const base = require("./index.js");
const react = require("eslint-plugin-react");
const reactHooks = require("eslint-plugin-react-hooks");
const reactNative = require("eslint-plugin-react-native");

module.exports = [
  ...base,
  {
    files: ["**/*.tsx"],
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-native": reactNative,
    },
    settings: { react: { version: "detect" } },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react/jsx-uses-react": "off",
      "react/react-in-jsx-scope": "off",
    },
  },
];
```

- [ ] **Step 8: Verify the configs load**

Run: `pnpm install`
Run: `node -e "require('./packages/config/eslint/native.js'); require('./packages/config/prettier/index.js'); console.log('configs load')"`
Expected: prints `configs load` with no exception.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add shared eslint, tsconfig, and prettier configs"
```

---

### Task 3: packages/shared — auth contracts

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/jest.config.js`, `packages/shared/src/index.ts`, `packages/shared/src/auth.ts`, `packages/shared/src/__tests__/auth.test.ts`

**Interfaces:**
- Consumes: `@space/config`.
- Produces, all exported from `@space/shared`:
  - `loginRequestSchema` — Zod, `{ email: string (email), password: string (min 1) }`; type `LoginRequest`
  - `refreshRequestSchema` — Zod, `{ refreshToken: string (min 1) }`; type `RefreshRequest`
  - `authUserSchema` — Zod, `{ id: number, name: string, email: string, role: UserRole }`; type `AuthUser`
  - `sessionSchema` — Zod, `{ accessToken: string, expiresIn: number, refreshToken: string }`; type `Session`
  - `loginResponseSchema` — `sessionSchema` extended with `{ user: authUserSchema }`; type `LoginResponse`
  - `userRoleSchema` — Zod enum; type `UserRole`
- **Critical:** `main` is `./src/index.ts` with no build step. Do not add a `build` script that emits `dist`.

- [ ] **Step 1: Create `packages/shared/package.json`**

```json
{
  "name": "@space/shared",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test:unit": "jest",
    "lint": "eslint src"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@space/config": "workspace:*",
    "@types/jest": "^29.5.12",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.4",
    "typescript": "^5.9.3"
  }
}
```

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

```json
{
  "extends": "@space/config/tsconfig/node.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/shared/jest.config.js`**

```js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
};
```

- [ ] **Step 4: Write the failing test**

Create `packages/shared/src/__tests__/auth.test.ts`:

```ts
import { loginRequestSchema, refreshRequestSchema, loginResponseSchema } from "../auth";

describe("loginRequestSchema", () => {
  it("accepts a valid email and password", () => {
    const result = loginRequestSchema.safeParse({
      email: "student@jpc.test",
      password: "hunter2",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed email", () => {
    const result = loginRequestSchema.safeParse({ email: "not-an-email", password: "hunter2" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty password", () => {
    const result = loginRequestSchema.safeParse({ email: "student@jpc.test", password: "" });
    expect(result.success).toBe(false);
  });
});

describe("refreshRequestSchema", () => {
  it("rejects an empty refresh token", () => {
    expect(refreshRequestSchema.safeParse({ refreshToken: "" }).success).toBe(false);
  });
});

describe("loginResponseSchema", () => {
  it("accepts a full session payload", () => {
    const result = loginResponseSchema.safeParse({
      accessToken: "jwt.value.here",
      expiresIn: 900,
      refreshToken: "opaque-refresh",
      user: { id: 1, name: "Sara", email: "sara@jpc.test", role: "STUDENT" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown role", () => {
    const result = loginResponseSchema.safeParse({
      accessToken: "jwt.value.here",
      expiresIn: 900,
      refreshToken: "opaque-refresh",
      user: { id: 1, name: "Sara", email: "sara@jpc.test", role: "WIZARD" },
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm --filter @space/shared test:unit`
Expected: FAIL — cannot find module `../auth`.

- [ ] **Step 6: Write `packages/shared/src/auth.ts`**

The role values must match v1's `UserRole` enum exactly. Confirm them against `D:\Projects\JPC\jpc-space\prisma\schema.prisma` line 23 before writing, and use that list verbatim.

```ts
import { z } from "zod";

export const userRoleSchema = z.enum(["SUPER", "SEASON_ADMIN", "LEADER", "STUDENT", "MENTOR"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const authUserSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  email: z.string().email(),
  role: userRoleSchema,
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const sessionSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
  refreshToken: z.string().min(1),
});
export type Session = z.infer<typeof sessionSchema>;

export const loginResponseSchema = sessionSchema.extend({
  user: authUserSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;
```

- [ ] **Step 7: Create `packages/shared/src/index.ts`**

```ts
export * from "./auth";
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm --filter @space/shared test:unit`
Expected: PASS — 6 tests.

Run: `pnpm --filter @space/shared typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add shared auth contracts"
```

---

### Task 4: Backend Prisma port

**Files:**
- Create: `apps/backend/package.json`, `apps/backend/tsconfig.json`, `apps/backend/.env.example`, `apps/backend/.env`, `apps/backend/src/lib/config.ts`, `apps/backend/src/db/client.ts`
- Copy: `apps/backend/prisma/schema.prisma` and `apps/backend/prisma/migrations/` from `D:\Projects\JPC\jpc-space\prisma\`

**Interfaces:**
- Consumes: `@space/config`.
- Produces:
  - `config` — typed object from `src/lib/config.ts` with `databaseUrl: string`, `authSecret: string`, `port: number`, `nodeEnv: string`
  - `db` — the Prisma client singleton, default export absent; named export `db` from `src/db/client.ts`

- [ ] **Step 1: Copy the schema and migrations verbatim**

```bash
mkdir -p apps/backend/prisma
cp "D:/Projects/JPC/jpc-space/prisma/schema.prisma" apps/backend/prisma/schema.prisma
cp -r "D:/Projects/JPC/jpc-space/prisma/migrations" apps/backend/prisma/migrations
```

Run: `ls apps/backend/prisma/migrations | wc -l`
Expected: `19` (18 migration directories plus `migration_lock.toml`).

Do not edit any file under `migrations/`. Changing a migration's contents changes its checksum and breaks the shared `_prisma_migrations` table.

- [ ] **Step 2: Create `apps/backend/package.json`**

```json
{
  "name": "@space/backend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "ts-node-dev --respawn --transpile-only -r tsconfig-paths/register src/server.ts",
    "start": "node dist/server.js",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit",
    "test:unit": "jest --testPathIgnorePatterns \"/integration/\"",
    "test:integration": "jest --runInBand --testPathPattern integration",
    "clean": "rm -rf dist src/generated",
    "db:generate": "prisma generate",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "@prisma/adapter-pg": "^7.7.0",
    "@prisma/client": "^7.4.2",
    "@space/shared": "workspace:*",
    "bcryptjs": "^3.0.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^5.0.0",
    "express-rate-limit": "^7.3.1",
    "helmet": "^8.0.0",
    "jose": "^5.9.6",
    "morgan": "^1.10.0",
    "pg": "^8.20.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@space/config": "workspace:*",
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/jest": "^29.5.12",
    "@types/morgan": "^1.9.9",
    "@types/node": "^24.0.0",
    "@types/pg": "^8.20.0",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "prisma": "^7.4.2",
    "supertest": "^7.0.0",
    "ts-jest": "^29.1.4",
    "ts-node": "^10.9.2",
    "ts-node-dev": "^2.0.0",
    "tsconfig-paths": "^4.2.0",
    "typescript": "^5.9.3"
  }
}
```

Note there is no `postinstall` running `prisma generate`. Generation is an explicit step, because the generated client lands in `src/generated/prisma` and is gitignored.

- [ ] **Step 3: Create `apps/backend/tsconfig.json`**

`rootDir` spans the repo so the no-build `@space/shared` sources compile alongside the backend. This is the setting the spec flags as failing only at build time if wrong.

```json
{
  "extends": "@space/config/tsconfig/node.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "../..",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*", "../../packages/shared/src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create `apps/backend/.env.example`**

```
# Same staging database as jpc-space. Copy the value from D:\Projects\JPC\jpc-space\.env
DATABASE_URL=
# Must be byte-identical to jpc-space's AUTH_SECRET or tokens will not interoperate
AUTH_SECRET=
PORT=4000
NODE_ENV=development
```

- [ ] **Step 5: Create `apps/backend/.env` with the real values**

Copy `DATABASE_URL` and `AUTH_SECRET` from `D:\Projects\JPC\jpc-space\.env` verbatim. Set `PORT=4000` and `NODE_ENV=development`.

`.env` is gitignored — never commit it.

- [ ] **Step 6: Write the failing test for config**

Create `apps/backend/src/__tests__/config.test.ts`:

```ts
describe("config", () => {
  it("exposes the validated environment", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    process.env.AUTH_SECRET = "test-secret-value";
    process.env.PORT = "4000";
    const { config } = await import("../lib/config");
    expect(config.databaseUrl).toBe("postgresql://user:pass@localhost:5432/db");
    expect(config.authSecret).toBe("test-secret-value");
    expect(config.port).toBe(4000);
  });
});
```

Create `apps/backend/jest.config.js`:

```js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@space/shared$": "<rootDir>/../../packages/shared/src/index.ts",
  },
};
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `pnpm --filter @space/backend test:unit`
Expected: FAIL — cannot find module `../lib/config`.

- [ ] **Step 8: Write `apps/backend/src/lib/config.ts`**

```ts
import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.string().default("development"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment: ${parsed.error.message}`);
}

export const config = {
  databaseUrl: parsed.data.DATABASE_URL,
  authSecret: parsed.data.AUTH_SECRET,
  port: parsed.data.PORT,
  nodeEnv: parsed.data.NODE_ENV,
} as const;
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `pnpm --filter @space/backend test:unit`
Expected: PASS.

- [ ] **Step 10: Generate the Prisma client and write the singleton**

Run: `pnpm --filter @space/backend db:generate`
Expected: writes to `apps/backend/src/generated/prisma`.

Create `apps/backend/src/db/client.ts`:

```ts
import { PrismaPg } from "@prisma/adapter-pg";

import { config } from "@/lib/config";
import { PrismaClient } from "@/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: config.databaseUrl });

export const db = new PrismaClient({ adapter });
```

- [ ] **Step 11: Verify the client connects to the shared database**

Run: `pnpm --filter @space/backend exec ts-node --transpile-only -r tsconfig-paths/register -e "import('./src/db/client').then(async ({ db }) => { console.log('users:', await db.user.count()); await db.\$disconnect(); })"`
Expected: prints a user count without error. A non-zero count confirms the connection reaches the existing staging data.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: port prisma schema and migrations, add config and db client"
```

---

### Task 5: Express app and health route

**Files:**
- Create: `apps/backend/src/app.ts`, `apps/backend/src/server.ts`, `apps/backend/src/lib/api-response.ts`, `apps/backend/src/routes/health.ts`, `apps/backend/src/__tests__/integration/health.test.ts`

**Interfaces:**
- Consumes: `db` from Task 4, `config` from Task 4.
- Produces:
  - `apiOk<T>(res: Response, data: T, status?: number): Response`
  - `apiError(res: Response, code: string, message: string, status: number): Response`
  - `createApp(): Express` from `src/app.ts` — exported separately from `server.ts` so supertest can mount it without binding a port.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/__tests__/integration/health.test.ts`:

```ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";

afterAll(async () => {
  await db.$disconnect();
});

describe("GET /health", () => {
  it("reports ok and reaches the database", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ok");
    expect(res.body.data.database).toBe("up");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @space/backend test:integration -- health`
Expected: FAIL — cannot find module `../app`.

- [ ] **Step 3: Write `apps/backend/src/lib/api-response.ts`**

```ts
import type { Response } from "express";

export function apiOk<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json({ data });
}

export function apiError(res: Response, code: string, message: string, status: number): Response {
  return res.status(status).json({ error: { code, message } });
}
```

- [ ] **Step 4: Write `apps/backend/src/routes/health.ts`**

```ts
import { Router } from "express";

import { db } from "@/db/client";
import { apiOk, apiError } from "@/lib/api-response";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  try {
    await db.$queryRaw`SELECT 1`;
    return apiOk(res, { status: "ok", database: "up" });
  } catch {
    return apiError(res, "database_unavailable", "Database is not reachable.", 503);
  }
});
```

- [ ] **Step 5: Write `apps/backend/src/app.ts`**

```ts
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import morgan from "morgan";

import { config } from "@/lib/config";
import { healthRouter } from "@/routes/health";

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: "*", methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"] }));
  app.use(express.json());
  if (config.nodeEnv !== "test") {
    app.use(morgan("dev"));
  }

  app.use(healthRouter);

  return app;
}
```

- [ ] **Step 6: Write `apps/backend/src/server.ts`**

```ts
import { createApp } from "@/app";
import { config } from "@/lib/config";

createApp().listen(config.port, () => {
  console.log(`space-v2 backend listening on :${config.port}`);
});
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter @space/backend test:integration -- health`
Expected: PASS.

- [ ] **Step 8: Verify the dev server boots**

Run: `pnpm --filter @space/backend dev`
Then in another shell: `curl http://localhost:4000/health`
Expected: `{"data":{"status":"ok","database":"up"}}`. Stop the server.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add express app with health route"
```

---

### Task 6: Auth token library

**Files:**
- Create: `apps/backend/src/lib/auth/tokens.ts`, `apps/backend/src/lib/auth/scopes.ts`, `apps/backend/src/lib/auth/credentials.ts`, `apps/backend/src/__tests__/tokens.test.ts`

**Interfaces:**
- Consumes: `db`, `config`.
- Produces:
  - `interface SessionUser { userId: number; role: UserRole; seasonAdminIds: number[]; groupLeaderIds: number[]; activeSeasonId: number | null; graduationYear: number | null }`
  - `signAccessToken(user: SessionUser): Promise<{ token: string; expiresIn: number }>`
  - `verifyAccessToken(token: string): Promise<SessionUser | null>`
  - `issueSession(userId: number, userAgent?: string | null): Promise<{ session: IssuedSession; user: SessionUser } | null>`
  - `rotateRefreshToken(rawToken: string, userAgent?: string | null): Promise<IssuedSession | null>`
  - `revokeRefreshToken(rawToken: string): Promise<void>`
  - `interface IssuedSession { accessToken: string; expiresIn: number; refreshToken: string }`
  - `loadScopes(userId: number): Promise<Scopes>`
  - `verifyCredentials(email: string, password: string): Promise<VerifiedUser | null>`
  - `interface VerifiedUser { id: number; email: string; name: string; role: UserRole }`

This is a port. Read `D:\Projects\JPC\jpc-space\src\lib\auth\tokens.ts`, `scopes.ts`, and `credentials.ts` and translate them, changing only the imports (`@/lib/db` becomes `@/db/client`, `@/generated/prisma/enums` becomes the `UserRole` type from `@space/shared`). **Do not change** the constants, the audience, the hash algorithm, or the claim names.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/__tests__/tokens.test.ts`:

```ts
import { jwtVerify } from "jose";

import { config } from "../lib/config";
import { signAccessToken, verifyAccessToken, type SessionUser } from "../lib/auth/tokens";

const user: SessionUser = {
  userId: 42,
  role: "STUDENT",
  seasonAdminIds: [],
  groupLeaderIds: [7],
  activeSeasonId: 3,
  graduationYear: null,
};

describe("access tokens", () => {
  it("signs with the jpc-mobile audience and a 15 minute ttl", async () => {
    const { token, expiresIn } = await signAccessToken(user);
    expect(expiresIn).toBe(900);

    const { payload } = await jwtVerify(token, new TextEncoder().encode(config.authSecret), {
      audience: "jpc-mobile",
    });
    expect(payload.sub).toBe("42");
    expect(payload.role).toBe("STUDENT");
    expect(payload.groupLeaderIds).toEqual([7]);
    expect(payload.activeSeasonId).toBe(3);
  });

  it("round-trips through verifyAccessToken", async () => {
    const { token } = await signAccessToken(user);
    await expect(verifyAccessToken(token)).resolves.toEqual(user);
  });

  it("returns null for a token signed with a different secret", async () => {
    const { SignJWT } = await import("jose");
    const foreign = await new SignJWT({ role: "STUDENT" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("42")
      .setAudience("jpc-mobile")
      .setExpirationTime("900s")
      .sign(new TextEncoder().encode("a-different-secret"));
    await expect(verifyAccessToken(foreign)).resolves.toBeNull();
  });

  it("returns null for a token with the wrong audience", async () => {
    const { SignJWT } = await import("jose");
    const foreign = await new SignJWT({ role: "STUDENT" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("42")
      .setAudience("some-other-app")
      .setExpirationTime("900s")
      .sign(new TextEncoder().encode(config.authSecret));
    await expect(verifyAccessToken(foreign)).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @space/backend test:unit -- tokens`
Expected: FAIL — cannot find module `../lib/auth/tokens`.

- [ ] **Step 3: Write `apps/backend/src/lib/auth/scopes.ts`**

```ts
import { db } from "@/db/client";

export interface Scopes {
  seasonAdminIds: number[];
  groupLeaderIds: number[];
  activeSeasonId: number | null;
  graduationYear: number | null;
}

export async function loadScopes(userId: number): Promise<Scopes> {
  const [adminRows, leaderRows, profile, account] = await Promise.all([
    db.seasonAdmin.findMany({ where: { userId }, select: { seasonId: true } }),
    db.groupLeader.findMany({ where: { userId }, select: { groupId: true } }),
    db.studentProfile.findUnique({ where: { userId }, select: { activeSeasonId: true } }),
    db.user.findUnique({ where: { id: userId }, select: { graduationYear: true } }),
  ]);
  return {
    seasonAdminIds: adminRows.map((r) => r.seasonId),
    groupLeaderIds: leaderRows.map((r) => r.groupId),
    activeSeasonId: profile?.activeSeasonId ?? null,
    graduationYear: account?.graduationYear ?? null,
  };
}
```

- [ ] **Step 4: Write `apps/backend/src/lib/auth/tokens.ts`**

```ts
import { createHash, randomBytes } from "node:crypto";

import { SignJWT, jwtVerify } from "jose";
import type { UserRole } from "@space/shared";

import { db } from "@/db/client";
import { config } from "@/lib/config";
import { loadScopes } from "@/lib/auth/scopes";

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const AUDIENCE = "jpc-mobile";

export interface SessionUser {
  userId: number;
  role: UserRole;
  seasonAdminIds: number[];
  groupLeaderIds: number[];
  activeSeasonId: number | null;
  graduationYear: number | null;
}

export interface IssuedSession {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}

function secret(): Uint8Array {
  return new TextEncoder().encode(config.authSecret);
}

export async function signAccessToken(
  user: SessionUser,
): Promise<{ token: string; expiresIn: number }> {
  const token = await new SignJWT({
    role: user.role,
    seasonAdminIds: user.seasonAdminIds,
    groupLeaderIds: user.groupLeaderIds,
    activeSeasonId: user.activeSeasonId,
    graduationYear: user.graduationYear,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.userId))
    .setIssuedAt()
    .setAudience(AUDIENCE)
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(secret());
  return { token, expiresIn: ACCESS_TTL_SECONDS };
}

export async function verifyAccessToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { audience: AUDIENCE });
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId <= 0) return null;
    return {
      userId,
      role: payload.role as UserRole,
      seasonAdminIds: (payload.seasonAdminIds as number[] | undefined) ?? [],
      groupLeaderIds: (payload.groupLeaderIds as number[] | undefined) ?? [],
      activeSeasonId: (payload.activeSeasonId as number | null | undefined) ?? null,
      graduationYear: (payload.graduationYear as number | null | undefined) ?? null,
    };
  } catch {
    return null;
  }
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

async function issueRefreshToken(
  userId: number,
  userAgent?: string | null,
): Promise<{ token: string; expiresAt: Date }> {
  const raw = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  await db.refreshToken.create({
    data: { tokenHash: hashToken(raw), userId, expiresAt, userAgent: userAgent ?? null },
  });
  return { token: raw, expiresAt };
}

export async function issueSession(
  userId: number,
  userAgent?: string | null,
): Promise<{ session: IssuedSession; user: SessionUser } | null> {
  const dbUser = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!dbUser || dbUser.deletedAt) return null;

  const scopes = await loadScopes(dbUser.id);
  const user: SessionUser = { userId: dbUser.id, role: dbUser.role as UserRole, ...scopes };
  const access = await signAccessToken(user);
  const refresh = await issueRefreshToken(user.userId, userAgent);
  return {
    session: {
      accessToken: access.token,
      expiresIn: access.expiresIn,
      refreshToken: refresh.token,
    },
    user,
  };
}

export async function rotateRefreshToken(
  rawToken: string,
  userAgent?: string | null,
): Promise<IssuedSession | null> {
  const record = await db.refreshToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!record || record.revokedAt || record.expiresAt < new Date()) return null;

  await db.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });

  const issued = await issueSession(record.userId, userAgent);
  return issued?.session ?? null;
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
  await db.refreshToken.updateMany({
    where: { tokenHash: hashToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
```

- [ ] **Step 5: Write `apps/backend/src/lib/auth/credentials.ts`**

```ts
import bcrypt from "bcryptjs";
import type { UserRole } from "@space/shared";

import { db } from "@/db/client";

export interface VerifiedUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<VerifiedUser | null> {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return null;
  if (user.deletedAt) return null;
  if (!user.passwordHash) return null; // invite not yet accepted

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as UserRole,
  };
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @space/backend test:unit -- tokens`
Expected: PASS — 4 tests.

- [ ] **Step 7: Verify token compatibility with v1**

This is the check the spec calls out as the token-drift risk. Mint a token from v1 and verify it with the port:

```bash
cd "D:/Projects/JPC/jpc-space" && npx tsx -e "import('./src/lib/auth/tokens.ts').then(async (m) => console.log(JSON.stringify(await m.signAccessToken({ userId: 42, role: 'STUDENT', seasonAdminIds: [], groupLeaderIds: [7], activeSeasonId: 3, graduationYear: null }))))"
```

Take the `token` value and verify it against the port:

```bash
cd "D:/Projects/JPC/space-v2/apps/backend" && pnpm exec ts-node --transpile-only -r tsconfig-paths/register -e "import('./src/lib/auth/tokens').then(async (m) => console.log(await m.verifyAccessToken(process.argv[1])))" "<paste-token>"
```

Expected: prints the `SessionUser` object, not `null`. If it prints `null`, the secret or audience diverged — fix before continuing.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: port auth token, scope, and credential libraries from v1"
```

---

### Task 7: Login and refresh routes

**Files:**
- Create: `apps/backend/src/routes/auth.ts`, `apps/backend/src/__tests__/integration/auth-routes.test.ts`
- Modify: `apps/backend/src/app.ts` — mount `authRouter` at `/api/v1/auth`

**Interfaces:**
- Consumes: `verifyCredentials`, `issueSession`, `rotateRefreshToken` from Task 6; `loginRequestSchema`, `refreshRequestSchema` from Task 3; `apiOk`, `apiError` from Task 5.
- Produces: `authRouter` — an Express `Router` exposing `POST /login` and `POST /refresh`, mounted under `/api/v1/auth`.

The tests need a real user in the shared staging database. They create one in `beforeAll` with a known bcrypt password and delete it in `afterAll`, so they never depend on existing seed data.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/__tests__/integration/auth-routes.test.ts`:

```ts
import bcrypt from "bcryptjs";
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";

const EMAIL = "space-v2-test@jpc.test";
const PASSWORD = "correct-horse-battery";

let userId: number;

beforeAll(async () => {
  const user = await db.user.create({
    data: {
      email: EMAIL,
      name: "Test User",
      role: "STUDENT",
      passwordHash: await bcrypt.hash(PASSWORD, 10),
    },
  });
  userId = user.id;
});

afterAll(async () => {
  await db.refreshToken.deleteMany({ where: { userId } });
  await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

describe("POST /api/v1/auth/login", () => {
  it("returns a session and user for valid credentials", async () => {
    const res = await request(createApp())
      .post("/api/v1/auth/login")
      .send({ email: EMAIL, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.expiresIn).toBe(900);
    expect(res.body.data.refreshToken).toEqual(expect.any(String));
    expect(res.body.data.user).toEqual({
      id: userId,
      name: "Test User",
      email: EMAIL,
      role: "STUDENT",
    });
  });

  it("returns invalid_credentials for a wrong password", async () => {
    const res = await request(createApp())
      .post("/api/v1/auth/login")
      .send({ email: EMAIL, password: "wrong" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("invalid_credentials");
  });

  it("returns bad_request for a malformed body", async () => {
    const res = await request(createApp())
      .post("/api/v1/auth/login")
      .send({ email: "not-an-email", password: "" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });
});

describe("POST /api/v1/auth/refresh", () => {
  it("rotates a valid refresh token", async () => {
    const login = await request(createApp())
      .post("/api/v1/auth/login")
      .send({ email: EMAIL, password: PASSWORD });
    const first = login.body.data.refreshToken;

    const res = await request(createApp())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: first });

    expect(res.status).toBe(200);
    expect(res.body.data.refreshToken).not.toBe(first);
  });

  it("rejects reuse of an already-rotated token", async () => {
    const login = await request(createApp())
      .post("/api/v1/auth/login")
      .send({ email: EMAIL, password: PASSWORD });
    const first = login.body.data.refreshToken;

    await request(createApp()).post("/api/v1/auth/refresh").send({ refreshToken: first });
    const reuse = await request(createApp())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: first });

    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe("invalid_token");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @space/backend test:integration -- auth-routes`
Expected: FAIL — 404s, because `/api/v1/auth/login` is not mounted.

- [ ] **Step 3: Write `apps/backend/src/routes/auth.ts`**

```ts
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { loginRequestSchema, refreshRequestSchema } from "@space/shared";

import { verifyCredentials } from "@/lib/auth/credentials";
import { issueSession, rotateRefreshToken } from "@/lib/auth/tokens";
import { apiOk, apiError } from "@/lib/api-response";

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 });

export const authRouter = Router();

authRouter.post("/login", authLimiter, async (req, res) => {
  const parsed = loginRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", "Email and password are required.", 400);
  }

  const verified = await verifyCredentials(parsed.data.email, parsed.data.password);
  if (!verified) {
    return apiError(res, "invalid_credentials", "Incorrect email or password.", 401);
  }

  const issued = await issueSession(verified.id, req.get("user-agent"));
  if (!issued) {
    return apiError(res, "invalid_credentials", "Incorrect email or password.", 401);
  }

  return apiOk(res, {
    ...issued.session,
    user: {
      id: verified.id,
      name: verified.name,
      email: verified.email,
      role: verified.role,
    },
  });
});

authRouter.post("/refresh", async (req, res) => {
  const parsed = refreshRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", "refreshToken is required.", 400);
  }

  const session = await rotateRefreshToken(parsed.data.refreshToken, req.get("user-agent"));
  if (!session) {
    return apiError(res, "invalid_token", "Refresh token is invalid or expired.", 401);
  }

  return apiOk(res, session);
});
```

- [ ] **Step 4: Mount the router in `apps/backend/src/app.ts`**

Add the import alongside the existing `healthRouter` import:

```ts
import { authRouter } from "@/routes/auth";
```

And mount it directly after `app.use(healthRouter);`:

```ts
  app.use("/api/v1/auth", authRouter);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @space/backend test:integration -- auth-routes`
Expected: PASS — 5 tests.

- [ ] **Step 6: Run the whole backend suite**

Run: `pnpm --filter @space/backend test:unit && pnpm --filter @space/backend test:integration`
Expected: all suites pass.

Run: `pnpm --filter @space/backend typecheck`
Expected: no errors.

Run: `pnpm --filter @space/backend build`
Expected: emits `dist/` with no errors. This is where a wrong `rootDir` would surface.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add login and refresh routes"
```

---

### Task 8: Mobile app scaffold

**Files:**
- Create: `apps/mobile/package.json`, `apps/mobile/app.json`, `apps/mobile/tsconfig.json`, `apps/mobile/babel.config.js`, `apps/mobile/metro.config.js`, `apps/mobile/jest.config.js`, `apps/mobile/.env.example`, `apps/mobile/app/_layout.tsx`, `apps/mobile/app/index.tsx`, `apps/mobile/src/__tests__/smoke.test.tsx`

**Interfaces:**
- Consumes: `@space/shared`, `@space/config`.
- Produces: an Expo app whose entry is `expo-router/entry`, with Metro configured to resolve the workspace root so `@space/shared` TypeScript sources load.

- [ ] **Step 1: Create `apps/mobile/package.json`**

```json
{
  "name": "@space/mobile",
  "version": "0.1.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "dev": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "lint": "eslint app src",
    "typecheck": "tsc --noEmit",
    "test:unit": "jest"
  },
  "dependencies": {
    "@react-native-async-storage/async-storage": "^2.2.0",
    "@space/shared": "workspace:*",
    "@tanstack/react-query": "^5.90.21",
    "axios": "^1.7.2",
    "expo": "~54.0.35",
    "expo-constants": "~18.0.13",
    "expo-linking": "~8.0.12",
    "expo-router": "~6.0.24",
    "expo-secure-store": "~15.0.8",
    "expo-status-bar": "~3.0.9",
    "react": "19.1.0",
    "react-native": "0.81.5",
    "react-native-safe-area-context": "5.6.2",
    "react-native-screens": "~4.16.0",
    "zustand": "^5.0.11"
  },
  "devDependencies": {
    "@babel/core": "^7.24.0",
    "@space/config": "workspace:*",
    "@testing-library/react-native": "^13.0.0",
    "@types/jest": "^29.5.12",
    "@types/react": "~19.1.17",
    "babel-preset-expo": "~54.0.10",
    "jest": "^29.7.0",
    "jest-expo": "~54.0.17",
    "react-test-renderer": "19.1.0",
    "typescript": "^5.9.3"
  }
}
```

- [ ] **Step 2: Create `apps/mobile/app.json`**

```json
{
  "expo": {
    "name": "JPC Space",
    "slug": "space-v2",
    "version": "0.1.0",
    "scheme": "spacev2",
    "orientation": "portrait",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": true,
    "plugins": ["expo-router", "expo-secure-store"],
    "extra": {
      "apiBaseUrl": "http://localhost:4000"
    }
  }
}
```

- [ ] **Step 3: Create `apps/mobile/babel.config.js`**

```js
module.exports = function (api) {
  api.cache(true);
  return { presets: ["babel-preset-expo"] };
};
```

- [ ] **Step 4: Create `apps/mobile/metro.config.js`**

Metro must watch the workspace root, or it cannot resolve `@space/shared`'s TypeScript sources.

```js
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
```

- [ ] **Step 5: Create `apps/mobile/tsconfig.json`**

```json
{
  "extends": "@space/config/tsconfig/react-native.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["app/**/*", "src/**/*", "*.ts", "*.tsx"]
}
```

- [ ] **Step 6: Create `apps/mobile/jest.config.js`**

```js
module.exports = {
  preset: "jest-expo",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["**/__tests__/**/*.test.tsx", "**/__tests__/**/*.test.ts"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg))",
  ],
};
```

- [ ] **Step 7: Create `apps/mobile/.env.example`**

```
EXPO_PUBLIC_API_BASE_URL=http://localhost:4000
```

- [ ] **Step 8: Write the smoke test**

Create `apps/mobile/src/__tests__/smoke.test.tsx`:

```tsx
import { loginRequestSchema } from "@space/shared";

describe("workspace wiring", () => {
  it("resolves shared contracts from the mobile app", () => {
    expect(loginRequestSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
  });
});
```

- [ ] **Step 9: Run the test to verify it fails**

Run: `pnpm --filter @space/mobile test:unit`
Expected: FAIL — module `@space/shared` not resolved, because dependencies are not installed yet.

- [ ] **Step 10: Install and create the router entry**

Run: `pnpm install`

Create `apps/mobile/app/_layout.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";

const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  );
}
```

Create `apps/mobile/app/index.tsx`:

```tsx
import { Text, View } from "react-native";

export default function Index() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>JPC Space</Text>
    </View>
  );
}
```

- [ ] **Step 11: Run the test to verify it passes**

Run: `pnpm --filter @space/mobile test:unit`
Expected: PASS.

Run: `pnpm --filter @space/mobile typecheck`
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: scaffold expo mobile app with expo-router"
```

---

### Task 9: Mobile API client with refresh interceptor

**Files:**
- Create: `apps/mobile/src/lib/api-client.ts`, `apps/mobile/src/lib/token-storage.ts`, `apps/mobile/src/__tests__/api-client.test.ts`

**Interfaces:**
- Consumes: `@space/shared` types.
- Produces:
  - `saveSession(session: Session): Promise<void>`, `loadAccessToken(): Promise<string | null>`, `loadRefreshToken(): Promise<string | null>`, `clearSession(): Promise<void>` from `token-storage.ts`
  - `apiClient` — a configured axios instance, and `login(email: string, password: string): Promise<LoginResponse>` from `api-client.ts`

The interceptor must refresh **once** for concurrent 401s. Several screens firing parallel queries otherwise trigger several rotations, and because rotation revokes the presented token, all but one would fail.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/__tests__/api-client.test.ts`:

```ts
import { refreshAccessToken, __resetRefreshState } from "../lib/api-client";

jest.mock("../lib/token-storage", () => ({
  loadAccessToken: jest.fn(async () => "old-access"),
  loadRefreshToken: jest.fn(async () => "old-refresh"),
  saveSession: jest.fn(async () => undefined),
  clearSession: jest.fn(async () => undefined),
}));

describe("refreshAccessToken", () => {
  beforeEach(() => {
    __resetRefreshState();
  });

  it("issues only one refresh for concurrent callers", async () => {
    let calls = 0;
    const rotate = jest.fn(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 10));
      return { accessToken: "new-access", expiresIn: 900, refreshToken: "new-refresh" };
    });

    const results = await Promise.all([
      refreshAccessToken(rotate),
      refreshAccessToken(rotate),
      refreshAccessToken(rotate),
    ]);

    expect(calls).toBe(1);
    expect(results).toEqual(["new-access", "new-access", "new-access"]);
  });

  it("returns null and clears the session when rotation fails", async () => {
    const rotate = jest.fn(async () => null);
    await expect(refreshAccessToken(rotate)).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @space/mobile test:unit -- api-client`
Expected: FAIL — cannot find module `../lib/api-client`.

- [ ] **Step 3: Write `apps/mobile/src/lib/token-storage.ts`**

```ts
import * as SecureStore from "expo-secure-store";
import type { Session } from "@space/shared";

const ACCESS_KEY = "space.accessToken";
const REFRESH_KEY = "space.refreshToken";

export async function saveSession(session: Session): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_KEY, session.accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, session.refreshToken);
}

export async function loadAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

export async function loadRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}
```

- [ ] **Step 4: Write `apps/mobile/src/lib/api-client.ts`**

```ts
import axios from "axios";
import Constants from "expo-constants";
import type { LoginResponse, Session } from "@space/shared";

import { clearSession, loadAccessToken, loadRefreshToken, saveSession } from "./token-storage";

const baseURL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  "http://localhost:4000";

export const apiClient = axios.create({ baseURL, timeout: 15000 });

export type RotateFn = (refreshToken: string) => Promise<Session | null>;

let inFlight: Promise<string | null> | null = null;

/** Test seam — clears the shared in-flight refresh promise between cases. */
export function __resetRefreshState(): void {
  inFlight = null;
}

async function rotateViaApi(refreshToken: string): Promise<Session | null> {
  try {
    const res = await axios.post(`${baseURL}/api/v1/auth/refresh`, { refreshToken });
    return res.data.data as Session;
  } catch {
    return null;
  }
}

/**
 * Refresh the access token, collapsing concurrent callers onto a single
 * rotation. Rotation revokes the presented refresh token, so a second
 * simultaneous call would always fail.
 */
export async function refreshAccessToken(rotate: RotateFn = rotateViaApi): Promise<string | null> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const refreshToken = await loadRefreshToken();
    if (!refreshToken) return null;

    const session = await rotate(refreshToken);
    if (!session) {
      await clearSession();
      return null;
    }

    await saveSession(session);
    return session.accessToken;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

apiClient.interceptors.request.use(async (requestConfig) => {
  const token = await loadAccessToken();
  if (token) {
    requestConfig.headers.set("Authorization", `Bearer ${token}`);
  }
  return requestConfig;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || error.response?.status !== 401 || !error.config) {
      return Promise.reject(error);
    }

    const original = error.config as typeof error.config & { _retried?: boolean };
    if (original._retried) return Promise.reject(error);
    original._retried = true;

    const token = await refreshAccessToken();
    if (!token) return Promise.reject(error);

    original.headers?.set("Authorization", `Bearer ${token}`);
    return apiClient.request(original);
  },
);

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await apiClient.post("/api/v1/auth/login", { email, password });
  const data = res.data.data as LoginResponse;
  await saveSession(data);
  return data;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @space/mobile test:unit -- api-client`
Expected: PASS — 2 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add mobile api client with single-flight refresh"
```

---

### Task 10: Login screen and placeholder home

**Files:**
- Create: `apps/mobile/src/store/session.ts`, `apps/mobile/app/login.tsx`, `apps/mobile/app/home.tsx`, `apps/mobile/src/__tests__/login-screen.test.tsx`
- Modify: `apps/mobile/app/index.tsx` — redirect to `/login`

**Interfaces:**
- Consumes: `login` from Task 9, `AuthUser` from Task 3.
- Produces: `useSessionStore` — Zustand store with `user: AuthUser | null` and `setUser(user: AuthUser | null): void`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/__tests__/login-screen.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import LoginScreen from "../../app/login";
import { login } from "../lib/api-client";

jest.mock("../lib/api-client", () => ({ login: jest.fn() }));

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace }) }));

describe("LoginScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("navigates home on a successful login", async () => {
    (login as jest.Mock).mockResolvedValue({
      accessToken: "a",
      expiresIn: 900,
      refreshToken: "r",
      user: { id: 1, name: "Sara", email: "sara@jpc.test", role: "STUDENT" },
    });

    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText("Email"), "sara@jpc.test");
    fireEvent.changeText(screen.getByPlaceholderText("Password"), "hunter2");
    fireEvent.press(screen.getByText("Sign in"));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/home"));
  });

  it("shows an error message when login fails", async () => {
    (login as jest.Mock).mockRejectedValue(new Error("nope"));

    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText("Email"), "sara@jpc.test");
    fireEvent.changeText(screen.getByPlaceholderText("Password"), "wrong");
    fireEvent.press(screen.getByText("Sign in"));

    await waitFor(() =>
      expect(screen.getByText("Incorrect email or password.")).toBeTruthy(),
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @space/mobile test:unit -- login-screen`
Expected: FAIL — cannot find module `../../app/login`.

- [ ] **Step 3: Write `apps/mobile/src/store/session.ts`**

```ts
import { create } from "zustand";
import type { AuthUser } from "@space/shared";

interface SessionState {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));
```

- [ ] **Step 4: Write `apps/mobile/app/login.tsx`**

```tsx
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { login } from "@/lib/api-client";
import { useSessionStore } from "@/store/session";

export default function LoginScreen() {
  const router = useRouter();
  const setUser = useSessionStore((s) => s.setUser);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      const result = await login(email, password);
      setUser(result.user);
      router.replace("/home");
    } catch {
      setError("Incorrect email or password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 28, fontWeight: "600", marginBottom: 12 }}>JPC Space</Text>

      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12 }}
      />
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12 }}
      />

      {error ? <Text style={{ color: "#b00020" }}>{error}</Text> : null}

      <Pressable
        onPress={onSubmit}
        disabled={busy}
        style={{ backgroundColor: "#1f2937", borderRadius: 8, padding: 14, alignItems: "center" }}
      >
        <Text style={{ color: "white", fontWeight: "600" }}>Sign in</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 5: Write `apps/mobile/app/home.tsx`**

```tsx
import { Text, View } from "react-native";

import { useSessionStore } from "@/store/session";

export default function HomeScreen() {
  const user = useSessionStore((s) => s.user);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
      <Text style={{ fontSize: 20, fontWeight: "600" }}>Signed in</Text>
      <Text>{user ? `${user.name} — ${user.role}` : "No session"}</Text>
    </View>
  );
}
```

- [ ] **Step 6: Replace `apps/mobile/app/index.tsx`**

```tsx
import { Redirect } from "expo-router";

export default function Index() {
  return <Redirect href="/login" />;
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter @space/mobile test:unit -- login-screen`
Expected: PASS — 2 tests.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add login screen and placeholder home"
```

---

### Task 11: Full-stack verification and documentation

**Files:**
- Create: `README.md`, `CLAUDE.md`
- Modify: `.gitignore` — confirm it covers `node_modules/`, `.env`, `dist/`, `.turbo/`, `.expo/`, `src/generated/`, `coverage/`

**Interfaces:**
- Consumes: everything above.
- Produces: no code. This task proves the whole pipeline green and documents how to run it.

- [ ] **Step 1: Run every task across the workspace**

Run: `pnpm typecheck`
Expected: all four packages pass.

Run: `pnpm lint`
Expected: all packages pass.

Run: `pnpm test`
Expected: shared, backend, and mobile `test:unit` suites pass, then the backend
`test:integration` suite passes against the staging database. The integration
task is uncached, so it re-runs every time — a second `pnpm test` should still
execute it rather than reporting a cache hit.

Run: `pnpm build`
Expected: backend emits `dist/`; other packages have no build step.

If any of these fail, fix the cause before continuing. Do not proceed with a red suite.

- [ ] **Step 2: Verify login end to end against a real user**

Start the backend: `pnpm --filter @space/backend dev`

In another shell, log in as a real staging user (substitute real credentials):

```bash
curl -s -X POST http://localhost:4000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"<real-staging-email>","password":"<password>"}'
```

Expected: a `{"data":{...}}` body containing `accessToken`, `expiresIn: 900`, `refreshToken`, and the `user` object. This confirms bcryptjs verifies the existing hash — the single most important compatibility check in the plan.

Then rotate the token:

```bash
curl -s -X POST http://localhost:4000/api/v1/auth/refresh -H "Content-Type: application/json" -d '{"refreshToken":"<paste>"}'
```

Expected: a new session with a different `refreshToken`.

- [ ] **Step 3: Verify the mobile app logs in**

Run: `pnpm --filter @space/mobile dev`

Open the app, enter the same staging credentials, and confirm it lands on the home screen showing the user's name and role.

If the device is not the host machine, `EXPO_PUBLIC_API_BASE_URL` must point at the host's LAN address rather than `localhost`.

- [ ] **Step 4: Write `README.md`**

```markdown
# space-v2

Mobile-first rebuild of JPC Space. pnpm + Turborepo monorepo.

## Apps

| Path | Package | What it is |
|---|---|---|
| `apps/mobile` | `@space/mobile` | Expo (React Native) app, expo-router |
| `apps/backend` | `@space/backend` | Express API, Prisma, Postgres |
| `packages/shared` | `@space/shared` | Zod contracts shared by both |
| `packages/config` | `@space/config` | eslint, tsconfig, prettier |

## Prerequisites

- Node.js 24+
- pnpm 10+
- Access to the JPC staging Postgres database

## Setup

```bash
pnpm install
cp apps/backend/.env.example apps/backend/.env
# Fill DATABASE_URL and AUTH_SECRET with the same values as jpc-space/.env
pnpm --filter @space/backend db:generate
```

## Running

```bash
pnpm dev                          # everything
pnpm --filter @space/backend dev  # API on :4000
pnpm --filter @space/mobile dev   # Expo
```

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm test        # unit suites, then backend integration against staging
pnpm test:unit   # unit only, no database needed
pnpm build
```

## Database

This repo shares the staging database with `jpc-space` (v1). `prisma/schema.prisma`
and `prisma/migrations/` are copies of v1's — **do not create migrations here**.
Any schema change is a coordinated change across both repos.
```

- [ ] **Step 5: Write `CLAUDE.md`**

```markdown
# space-v2 — Claude Context

Mobile-first rebuild of JPC Space (`D:\Projects\JPC\jpc-space` is v1 and still runs).

## Layout

- `apps/mobile` — Expo + expo-router, React Query, Zustand, tokens in expo-secure-store
- `apps/backend` — Express 5, Prisma 7, ports v1's `/api/v1`
- `packages/shared` — Zod contracts. **No build step**; `main` is `src/index.ts`
- `packages/config` — eslint, tsconfig, prettier

## Hard constraints

- **Shared staging database with v1.** No migrations are created here.
  `prisma/migrations/` is a verbatim copy of v1's.
- **Passwords are bcryptjs.** Existing hashes are bcrypt; any other algorithm
  locks out every user.
- **Tokens must stay v1-compatible:** `jose` HS256, secret `AUTH_SECRET`
  (same value as v1), audience `jpc-mobile`, 900s TTL, subject `String(userId)`.
- **Prisma 7 generates to `src/generated/prisma`.** Never import `@prisma/client`.
- **No `process.env` outside `src/lib/config.ts`.**
- `.npmrc` sets `shamefully-hoist=true` — Metro cannot resolve pnpm's nested symlinks.

## Response envelope

Success `{ "data": ... }`, failure `{ "error": { "code", "message" } }`.
Login-path codes: `bad_request` 400, `invalid_credentials` 401, `invalid_token` 401.

## Commands

```
pnpm dev / build / lint / typecheck / test / test:unit
pnpm --filter @space/backend db:generate
```

## Docs

- Design: `docs/superpowers/specs/2026-08-20-space-v2-monorepo-design.md`
- Plan: `docs/superpowers/plans/2026-08-20-space-v2-scaffold.md`
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: add README and CLAUDE.md, verify full pipeline"
```

---

## Done when

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` all pass from the root.
- A real staging user logs in through `POST /api/v1/auth/login` and receives a session.
- A v1-issued access token verifies against the ported `verifyAccessToken`.
- The mobile app signs that user in and shows their name and role.
