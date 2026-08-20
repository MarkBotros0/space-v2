# space-v2 API Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the remaining 16 `/api/v1` endpoints from `jpc-space` (Next.js route handlers) into `space-v2`'s `apps/backend` (Express 5), so the Express service serves v1's complete mobile API surface.

**Architecture:** Each Next.js route handler becomes an Express route in `apps/backend/src/routes/`. v1's `withApiAuth` HOF becomes a `requireAuth` middleware that populates `req.user`; v1's `apiOk`/`apiError` already exist in v2 as `res`-taking equivalents. The supporting libraries v1's handlers import (`rbac.ts`, `auth/permissions.ts`, `groups-query.ts`, `sessions-query.ts`, `assignments-query.ts`, `attendance-notifications.ts`, `notifications.ts`, `email.ts`, `storage/*`, `public-id.ts`) are ported alongside, trimmed to only what these 16 endpoints actually call.

**Tech Stack:** Express 5, Prisma 7 (`@prisma/adapter-pg`), Zod 3, jose, multer 2, nodemailer, jest + ts-jest + supertest, TypeScript (CommonJS output).

**Spec:** `docs/superpowers/specs/2026-08-20-space-v2-monorepo-design.md`

**Source of truth for every port:** the corresponding file under `D:\Projects\JPC\jpc-space\src\`. Read it before writing the v2 version. Any intentional divergence must be justified in a code comment.

---

## Global Constraints

These apply to **every** task. They are not optional and not negotiable.

- **Never create or apply a database migration.** No `prisma migrate dev`, `prisma migrate deploy`, `prisma db push`, or `prisma migrate reset`. The database is shared live with `jpc-space`. `apps/backend/prisma/` is a verbatim copy of v1's; editing any file under `prisma/migrations/` changes its checksum and corrupts the shared `_prisma_migrations` table for **both** apps.
- **Never print secrets.** `AUTH_SECRET`, `DATABASE_URL`, `GMAIL_APP_PASSWORD`, real access/refresh tokens, and password hashes must never appear in commit messages, test output, reports, or logs.
- **`.env` is gitignored and must never be committed.** New env keys go in `.env.example` with placeholder values only.
- **Integration tests may only touch their own fixtures.** Every row an integration test creates must carry the prefix `space-v2-test-` in a unique column (`User.email`, `Season.code`). Every `deleteMany` must be filtered to that prefix. Never delete, update, or read-and-mutate a row that a real user owns.
- **Passwords are bcryptjs.** Any other algorithm locks out every existing user.
- **Token compatibility is a hard constraint.** Do not change `AUDIENCE`, claim names, TTLs, or the secret in `lib/auth/tokens.ts`. v1 and v2 must keep accepting each other's tokens during the transition.
- **Response envelope:** success is `{ "data": ... }`, failure is `{ "error": { "code": "...", "message": "..." } }`. Error codes and HTTP statuses must match v1 **exactly** — the mobile client keys off them.
- **Imports of `@space/shared` from `apps/backend/src` must be relative** (`../../../../packages/shared/src/index`), not the package name. `tsc`'s `rootDir` here is the repo root so it can also compile `packages/shared`; a bare specifier survives into `dist/` and resolves at runtime to TypeScript source, crashing the built server with `ERR_MODULE_NOT_FOUND`. See the comment block at the top of `apps/backend/src/routes/auth.ts`. Type-only imports are safe either way, but use relative for both so the rule needs no judgement call.
- **No `@/` path alias.** `tsc-alias` cannot rewrite aliases under `rootDir: "../.."`. Use relative imports throughout.
- **CommonJS output.** `packages/config/tsconfig/node.json` sets `"module": "CommonJS"`. ESM-only packages (notably `nanoid` v5) will throw `ERR_REQUIRE_ESM` at runtime. Do not add ESM-only dependencies.
- **No `OPTIONS` handlers.** v1 exports an explicit `OPTIONS` per route because Next.js has no global CORS middleware. v2 mounts `cors()` in `app.ts`, which answers preflight for every route. Do not port `apiPreflight`.
- **Express 5 forwards async rejections automatically.** An `async` route handler that throws sends the error to `errorHandler` without a wrapper. Do not write an `asyncHandler` helper.
- **Verification output must be genuine.** Paste real captured terminal output. Never reconstruct, summarise-as-if-captured, or edit a log.

---

## Scope

**In scope — the 16 endpoints:**

| # | Method | Path | v1 source |
|---|--------|------|-----------|
| 1 | POST | `/api/v1/auth/logout` | `auth/logout/route.ts` |
| 2 | GET | `/api/v1/me` | `me/route.ts` |
| 3 | GET | `/api/v1/seasons` | `seasons/route.ts` |
| 4 | GET | `/api/v1/seasons/:id` | `seasons/[id]/route.ts` |
| 5 | GET | `/api/v1/seasons/:id/groups` | `seasons/[id]/groups/route.ts` |
| 6 | GET | `/api/v1/seasons/:id/sessions` | `seasons/[id]/sessions/route.ts` |
| 7 | GET | `/api/v1/seasons/:id/assignments` | `seasons/[id]/assignments/route.ts` |
| 8 | GET | `/api/v1/groups/:id` | `groups/[id]/route.ts` |
| 9 | GET | `/api/v1/sessions/:id` | `sessions/[id]/route.ts` |
| 10 | GET | `/api/v1/sessions/:id/attendance` | `sessions/[id]/attendance/route.ts` |
| 11 | POST | `/api/v1/sessions/:id/attendance` | `sessions/[id]/attendance/route.ts` |
| 12 | POST | `/api/v1/sessions/:id/check-in-open` | `sessions/[id]/check-in-open/route.ts` |
| 13 | POST | `/api/v1/sessions/:id/check-in-close` | `sessions/[id]/check-in-close/route.ts` |
| 14 | POST | `/api/v1/sessions/check-in` | `sessions/check-in/route.ts` |
| 15 | GET | `/api/v1/assignments/:id` | `assignments/[id]/route.ts` |
| 16 | GET + PATCH | `/api/v1/submissions/:publicId` | `submissions/[publicId]/route.ts` |
| 17 | POST + DELETE | `/api/v1/submissions/:publicId/files` | `submissions/[publicId]/files/route.ts` |

(17 rows, 16 route files — `attendance` and `submissions/[publicId]` each carry two verbs.)

**Explicitly out of scope — do not port:**

- `GET /api/uploads/[...path]` — v1's file *download* route. It is not under `/api/v1`, so it is not part of this port. **Known gap:** the mobile app will need a download path for submission files. Flag it, do not build it here.
- `/api/reports/export`, `/api/season/export`, `/api/auth/[...nextauth]` — web-only surfaces.
- Every unused export in the ported query libs: `listSessionsForAllActiveSeasons`, `loadSessionById`, `loadGroupById`, `listLeadersForPicker`, `listStudentsForPicker`, `listGroupsForSelect`, `listSeasonRoster`, `loadSubmissionTracker`. YAGNI — none of the 16 endpoints call them.
- Every unused gate in `permissions.ts`: `canManageSessionVideo`, `canManageQuiz`, `canGradeQuiz`, `canReviewSubmission`, `canCommentOnForumSubmission`, `canViewStudent`, `canEditStudent`, `canWriteNote`, `getVisibleStudents`, `getStudentSeasonAccess`, `canCreateSeason`, `canEditSeason`, `canCreateAssignment`, `canEditAssignment`, `canManageNotifications`, `requireRole`.
- Every unused export in `notifications.ts`: `createNotification`, `unreadCount`, `listRecent`, `markRead`. Only `createNotificationsBulk` is reachable from these 16 endpoints.
- Every unused export in `email.ts`: only `sendNotificationEmail` (and its private helpers) is reachable.
- Mobile screens. This plan is backend-only.

---

## File Structure

**Created under `apps/backend/src/`:**

| File | Responsibility |
|------|----------------|
| `lib/auth/errors.ts` | `UnauthorizedError`, `ForbiddenError` — verbatim port |
| `lib/rbac.ts` | Pure, synchronous role/scope predicates over `SessionUser` |
| `lib/permissions.ts` | Async, DB-touching access gates (`canAccessSeason`, `canAccessGroup`, `canMarkAttendance`, `canViewSubmission`) |
| `lib/parse-id.ts` | `parseId` — the `Number.isInteger(n) && n > 0` check every route repeats |
| `lib/public-id.ts` | `newPublicId()` — 10-char URL-safe id, `node:crypto` based |
| `lib/email.ts` | `sendNotificationEmail` only, trimmed from v1 |
| `lib/notifications.ts` | `createNotificationsBulk` only, trimmed from v1 |
| `lib/attendance-notifications.ts` | `flagLowAttendance` — verbatim port |
| `lib/storage/index.ts` | `Storage` interface, `getStorage()`, `buildStorageKey()` |
| `lib/storage/local.ts` | `LocalFsStorage` |
| `lib/storage/s3.ts` | `S3Storage` stub — parity with v1 |
| `lib/queries/groups.ts` | `listGroupsForSeason` |
| `lib/queries/sessions.ts` | `listSessionsForSeason`, `loadAttendanceRoster` |
| `lib/queries/assignments.ts` | `listAssignmentsForSeason`, `listAssignmentsForStudent`, `loadAssignmentById` |
| `middleware/require-auth.ts` | Bearer-token → `req.user`, or 401 |
| `types/express.d.ts` | Augments `Express.Request` with `user?: SessionUser` |
| `routes/me.ts` | Endpoint 2 |
| `routes/seasons.ts` | Endpoints 3–7 |
| `routes/groups.ts` | Endpoint 8 |
| `routes/sessions.ts` | Endpoints 9–14 |
| `routes/assignments.ts` | Endpoint 15 |
| `routes/submissions.ts` | Endpoints 16–17 |

**Modified:**

| File | Change |
|------|--------|
| `src/app.ts` | Mount the new routers |
| `src/lib/config.ts` | Add `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `AUTH_URL`, `STORAGE_DRIVER`, `LOCAL_UPLOADS_DIR`, `MAX_UPLOAD_BYTES` |
| `src/routes/auth.ts` | Add `POST /logout` |
| `src/middleware/error-handler.ts` | Map `ForbiddenError` → 403, `UnauthorizedError` → 401 |
| `packages/shared/src/index.ts` | Re-export the new domain modules |
| `apps/backend/package.json` | Add `multer`, `nodemailer`, and their `@types` |
| `.env.example` | Document the new keys |

**Created under `packages/shared/src/`:**

`season.ts`, `group.ts`, `session.ts`, `assignment.ts`, `submission.ts`, `attendance.ts` — request Zod schemas and response TypeScript interfaces.

**Date convention for shared response types:** the backend returns Prisma `Date` objects, which `res.json()` serialises to ISO-8601 strings. Shared response interfaces therefore type every timestamp as `string`, and are consumed by the mobile client, not by the backend. The backend never imports a response interface — it would not typecheck against the `Date`-valued objects it builds.

**Integration-test fixtures:** `src/__tests__/integration/fixtures.ts` — created in Task 3, extended by later tasks. Every task that adds a fixture kind adds it here rather than duplicating setup.

---

### Task 1: Auth middleware, error mapping, `/me`, `/auth/logout`

Establishes the pattern every later task follows: `requireAuth` puts a `SessionUser` on `req`, `requireUser(req)` reads it back with non-nullable typing, and thrown `ForbiddenError`/`UnauthorizedError` become the right envelope via the central error handler.

**Files:**
- Create: `apps/backend/src/lib/auth/errors.ts`
- Create: `apps/backend/src/types/express.d.ts`
- Create: `apps/backend/src/middleware/require-auth.ts`
- Create: `apps/backend/src/routes/me.ts`
- Modify: `apps/backend/src/middleware/error-handler.ts`
- Modify: `apps/backend/src/routes/auth.ts`
- Modify: `apps/backend/src/app.ts`
- Test: `apps/backend/src/__tests__/integration/me-routes.test.ts`

**Interfaces:**
- Consumes: `verifyAccessToken`, `revokeRefreshToken`, `SessionUser` from `../lib/auth/tokens`; `apiOk`, `apiError` from `../lib/api-response`; `refreshRequestSchema` from the shared package.
- Produces:
  - `class UnauthorizedError extends Error` — `constructor(message?, code?, options?)`, `readonly code: string`
  - `class ForbiddenError extends Error` — same signature
  - `requireAuth: (req: Request, res: Response, next: NextFunction) => Promise<void>` — Express middleware
  - `requireUser: (req: Request) => SessionUser` — throws `UnauthorizedError` if unset
  - `meRouter: Router`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/__tests__/integration/me-routes.test.ts`:

```ts
import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";

jest.setTimeout(15000);

// Runs against the shared live staging database. Same discipline as
// auth-routes.test.ts: a unique email per run, and every cleanup scoped to the
// space-v2-test- prefix so a row outside this suite can never be touched.
const EMAIL_PREFIX = "space-v2-test-";
const EMAIL_SUFFIX = "@jpc.test";
const EMAIL = `${EMAIL_PREFIX}${randomUUID()}${EMAIL_SUFFIX}`;
const PASSWORD = "correct-horse-battery";

const testAccountFilter = { email: { startsWith: EMAIL_PREFIX, endsWith: EMAIL_SUFFIX } } as const;

const app = createApp();
let userId: number;
let accessToken: string;
let refreshToken: string;

beforeAll(async () => {
  await db.user.deleteMany({ where: testAccountFilter });
  const user = await db.user.create({
    data: {
      email: EMAIL,
      name: "Me Route Test User",
      role: "STUDENT",
      passwordHash: await bcrypt.hash(PASSWORD, 10),
    },
  });
  userId = user.id;

  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: EMAIL, password: PASSWORD });
  accessToken = login.body.data.accessToken;
  refreshToken = login.body.data.refreshToken;
});

afterAll(async () => {
  await db.refreshToken.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});

describe("GET /api/v1/me", () => {
  it("returns the user record and scopes for a valid token", async () => {
    const res = await request(app).get("/api/v1/me").set("authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user).toEqual({
      id: userId,
      name: "Me Route Test User",
      email: EMAIL,
      role: "STUDENT",
      avatarPath: null,
    });
    expect(res.body.data.scopes).toEqual({
      seasonAdminIds: [],
      groupLeaderIds: [],
      activeSeasonId: null,
    });
  });

  it("returns 401 when the Authorization header is missing", async () => {
    const res = await request(app).get("/api/v1/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("returns 401 when the scheme is not Bearer", async () => {
    const res = await request(app).get("/api/v1/me").set("authorization", `Basic ${accessToken}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("returns 401 for a malformed token", async () => {
    const res = await request(app).get("/api/v1/me").set("authorization", "Bearer not-a-jwt");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("revokes the refresh token so it can no longer be rotated", async () => {
    const logout = await request(app).post("/api/v1/auth/logout").send({ refreshToken });
    expect(logout.status).toBe(200);
    expect(logout.body.data).toEqual({ ok: true });

    const refresh = await request(app).post("/api/v1/auth/refresh").send({ refreshToken });
    expect(refresh.status).toBe(401);
    expect(refresh.body.error.code).toBe("invalid_token");
  });

  it("returns 400 when refreshToken is missing", async () => {
    const res = await request(app).post("/api/v1/auth/logout").send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("returns 200 for an unknown token (revocation is idempotent)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/logout")
      .send({ refreshToken: "no-such-token" });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/backend && pnpm jest --runInBand src/__tests__/integration/me-routes.test.ts
```

Expected: FAIL — `GET /api/v1/me` returns 404 (`not_found`) because no router is mounted there, and `POST /api/v1/auth/logout` returns 404.

- [ ] **Step 3: Port the error classes**

Create `apps/backend/src/lib/auth/errors.ts` — verbatim port of `jpc-space/src/lib/auth/errors.ts`:

```ts
export class UnauthorizedError extends Error {
  readonly code: string;
  constructor(message = "Not authenticated", code = "UNAUTHORIZED", options?: ErrorOptions) {
    super(message, options);
    this.name = "UnauthorizedError";
    this.code = code;
  }
}

export class ForbiddenError extends Error {
  readonly code: string;
  constructor(message = "Forbidden", code = "FORBIDDEN", options?: ErrorOptions) {
    super(message, options);
    this.name = "ForbiddenError";
    this.code = code;
  }
}
```

- [ ] **Step 4: Augment the Express request type**

Create `apps/backend/src/types/express.d.ts`:

```ts
import type { SessionUser } from "../lib/auth/tokens";

// requireAuth assigns req.user. It stays optional here because Express has no
// way to express "this property exists only downstream of that middleware" —
// route handlers call requireUser(req) to narrow it to a non-null SessionUser.
declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export {};
```

- [ ] **Step 5: Write the auth middleware**

Create `apps/backend/src/middleware/require-auth.ts`. This is v1's `withApiAuth` (`jpc-space/src/lib/api/auth.ts`) split into its two halves: the token check becomes middleware, and the `ForbiddenError`/`UnauthorizedError` mapping moves to the central error handler (Step 6), since Express 5 forwards async rejections there on its own.

```ts
import type { NextFunction, Request, Response } from "express";

import { apiError } from "../lib/api-response";
import { UnauthorizedError } from "../lib/auth/errors";
import { verifyAccessToken, type SessionUser } from "../lib/auth/tokens";

const UNAUTHORIZED_MESSAGE = "Missing or invalid access token.";

/** Resolve the SessionUser from a Bearer access token onto req.user, or 401. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    apiError(res, "unauthorized", UNAUTHORIZED_MESSAGE, 401);
    return;
  }

  const token = header.slice(7).trim();
  if (!token) {
    apiError(res, "unauthorized", UNAUTHORIZED_MESSAGE, 401);
    return;
  }

  const user = await verifyAccessToken(token);
  if (!user) {
    apiError(res, "unauthorized", UNAUTHORIZED_MESSAGE, 401);
    return;
  }

  req.user = user;
  next();
}

/**
 * Read back what requireAuth set. Throwing rather than returning null keeps
 * handlers free of non-null assertions: if this ever throws, the route was
 * mounted without requireAuth in front of it, which is a wiring bug, and the
 * error handler turns it into a 401 rather than a crash.
 */
export function requireUser(req: Request): SessionUser {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
}
```

- [ ] **Step 6: Map the auth errors in the error handler**

Modify `apps/backend/src/middleware/error-handler.ts`. Add the import:

```ts
import { ForbiddenError, UnauthorizedError } from "../lib/auth/errors";
```

and insert these two branches immediately after the `isBodyParseError` branch, before the `console.error(err)` line:

```ts
  // v1 mapped these inside withApiAuth; Express 5 forwards async rejections
  // here instead, so the mapping lives in one place for every route.
  if (err instanceof ForbiddenError) {
    apiError(res, "forbidden", "You don't have access to this.", 403);
    return;
  }

  if (err instanceof UnauthorizedError) {
    apiError(res, "unauthorized", "Not authenticated.", 401);
    return;
  }
```

The messages are copied verbatim from `jpc-space/src/lib/api/auth.ts` — the mobile client may surface them.

- [ ] **Step 7: Write the `/me` route**

Create `apps/backend/src/routes/me.ts` — port of `jpc-space/src/app/api/v1/me/route.ts`:

```ts
import { Router } from "express";

import { db } from "../db/client";
import { apiOk } from "../lib/api-response";
import { requireAuth, requireUser } from "../middleware/require-auth";

export const meRouter = Router();

meRouter.get("/", requireAuth, async (req, res) => {
  const user = requireUser(req);

  const record = await db.user.findUnique({
    where: { id: user.userId },
    select: { id: true, name: true, email: true, role: true, avatarPath: true },
  });

  apiOk(res, {
    user: record,
    // Scopes come from the token, not the database: they are what this token
    // was minted with, which is what the client's permission checks must agree
    // with until the next refresh.
    scopes: {
      seasonAdminIds: user.seasonAdminIds,
      groupLeaderIds: user.groupLeaderIds,
      activeSeasonId: user.activeSeasonId,
    },
  });
});
```

- [ ] **Step 8: Add the logout route**

Modify `apps/backend/src/routes/auth.ts`. Extend the existing tokens import to pull in `revokeRefreshToken`:

```ts
import { issueSession, rotateRefreshToken, revokeRefreshToken } from "../lib/auth/tokens";
```

and append this handler at the end of the file:

```ts
// v1's logout takes the refresh token in the body and is not access-token
// protected (jpc-space/src/app/api/v1/auth/logout/route.ts). Its body schema is
// identical to refresh's, so the same shared schema validates it.
//
// Intentional divergence from v1: the refresh limiter is applied. This endpoint
// performs an unauthenticated database write, and a legitimate client calls it
// once per session, so rate limiting costs nothing and closes a cheap
// write-amplification vector v1 left open.
authRouter.post("/logout", refreshLimiter, async (req, res) => {
  const parsed = refreshRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", "refreshToken is required.", 400);
  }

  // revokeRefreshToken uses updateMany, so an unknown or already-revoked token
  // is a no-op. Returning 200 either way means logout is idempotent and never
  // discloses whether a token existed.
  await revokeRefreshToken(parsed.data.refreshToken);
  return apiOk(res, { ok: true });
});
```

- [ ] **Step 9: Mount the `/me` router**

Modify `apps/backend/src/app.ts`. Add the import next to the existing route imports:

```ts
import { meRouter } from "./routes/me";
```

and mount it after the auth router, before `notFoundHandler`:

```ts
  app.use("/api/v1/me", meRouter);
```

- [ ] **Step 10: Run the test to verify it passes**

```bash
cd apps/backend && pnpm jest --runInBand src/__tests__/integration/me-routes.test.ts
```

Expected: PASS — 7 tests.

- [ ] **Step 11: Run typecheck, lint, and the unit suite**

```bash
pnpm turbo typecheck lint test:unit --filter=@space/backend
```

Expected: all three tasks succeed.

- [ ] **Step 12: Verify the built server still boots**

The relative-import rule exists because a bare `@space/shared` specifier breaks the compiled output. Prove the build is still runnable:

```bash
pnpm --filter=@space/backend build && node apps/backend/dist/apps/backend/src/server.js
```

Expected: the server logs its listening line with no `ERR_MODULE_NOT_FOUND`. Stop it with Ctrl-C. Paste the real captured output.

- [ ] **Step 13: Commit**

```bash
git add -A && git commit -m "feat(backend): add auth middleware, /me, and /auth/logout"
```

Use `git add -A`, not a narrowed path — an earlier round of this project lost `pnpm-lock.yaml` to a scoped `git add`.

---

### Task 2: RBAC predicates, permission gates, id parsing

The authorization layer the spec called for and the login slice never needed. Split deliberately in two: `rbac.ts` holds pure synchronous predicates over the token's claims (fully unit-testable, no database), `permissions.ts` holds the async gates that must query the database. Every remaining task depends on this one.

**Files:**
- Create: `apps/backend/src/lib/rbac.ts`
- Create: `apps/backend/src/lib/permissions.ts`
- Create: `apps/backend/src/lib/parse-id.ts`
- Test: `apps/backend/src/__tests__/rbac.test.ts`
- Test: `apps/backend/src/__tests__/parse-id.test.ts`

**Interfaces:**
- Consumes: `SessionUser` from `./auth/tokens`; `db` from `../db/client`.
- Produces, from `lib/rbac.ts` (all synchronous unless noted):
  - `isSuper(u: SessionUser): boolean`
  - `isAlumnus(u: SessionUser): boolean`
  - `isMentor(u: SessionUser): boolean`
  - `isAdminOfSeason(u: SessionUser, seasonId: number): boolean`
  - `isLeaderOfGroup(u: SessionUser, groupId: number): boolean`
  - `isLeaderInSeason(u: SessionUser, seasonId: number): Promise<boolean>`
  - `canReadAllStudents(u: SessionUser): boolean`
  - `canManageUsers(u: SessionUser): boolean`
- Produces, from `lib/permissions.ts` (all async):
  - `canAccessSeason(user: SessionUser, seasonId: number): Promise<boolean>`
  - `canAccessGroup(user: SessionUser, groupId: number): Promise<boolean>`
  - `canMarkAttendance(user: SessionUser, sessionId: number): Promise<boolean>`
  - `canViewSubmission(user: SessionUser, submissionId: number): Promise<boolean>`
- Produces, from `lib/parse-id.ts`:
  - `parseId(raw: string | undefined): number | null`

**Divergences from v1, both intentional:**
1. v1's `rbac.ts` declares its own `SessionUser` interface. v2 already has an identical one in `lib/auth/tokens.ts` (it is what `verifyAccessToken` returns). `rbac.ts` imports that type instead of redeclaring it — two copies would drift, and the token's shape is the authoritative one.
2. v1's `isLeaderInSeason` uses a dynamic `await import("@/lib/db")` to dodge a Next.js module cycle. v2 has no such cycle; use a normal top-level import.

- [ ] **Step 1: Write the failing unit tests**

Create `apps/backend/src/__tests__/rbac.test.ts`. Only the pure predicates are unit-tested here; the database-backed gates in `permissions.ts` are covered by the integration suites of the tasks that use them.

```ts
import {
  canManageUsers,
  canReadAllStudents,
  isAdminOfSeason,
  isAlumnus,
  isLeaderOfGroup,
  isMentor,
  isSuper,
} from "../lib/rbac";
import type { SessionUser } from "../lib/auth/tokens";

function user(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    userId: 1,
    role: "STUDENT",
    seasonAdminIds: [],
    groupLeaderIds: [],
    activeSeasonId: null,
    graduationYear: null,
    ...overrides,
  };
}

describe("isSuper", () => {
  it("is true only for SUPER", () => {
    expect(isSuper(user({ role: "SUPER" }))).toBe(true);
    expect(isSuper(user({ role: "ADMIN" }))).toBe(false);
    expect(isSuper(user({ role: "STUDENT" }))).toBe(false);
  });
});

describe("isAlumnus", () => {
  it("is true for a STUDENT with a graduation year", () => {
    expect(isAlumnus(user({ role: "STUDENT", graduationYear: 2024 }))).toBe(true);
  });

  it("is false for a STUDENT who has not graduated", () => {
    expect(isAlumnus(user({ role: "STUDENT", graduationYear: null }))).toBe(false);
  });

  it("is false for a non-STUDENT even with a graduation year", () => {
    expect(isAlumnus(user({ role: "LEADER", graduationYear: 2024 }))).toBe(false);
  });
});

describe("isMentor", () => {
  it("is true only for MENTOR", () => {
    expect(isMentor(user({ role: "MENTOR" }))).toBe(true);
    expect(isMentor(user({ role: "SUPER" }))).toBe(false);
  });
});

describe("isAdminOfSeason", () => {
  it("is true for SUPER regardless of scope", () => {
    expect(isAdminOfSeason(user({ role: "SUPER" }), 7)).toBe(true);
  });

  it("is true for an ADMIN scoped to that season", () => {
    expect(isAdminOfSeason(user({ role: "ADMIN", seasonAdminIds: [7, 9] }), 7)).toBe(true);
  });

  it("is false for an ADMIN scoped to a different season", () => {
    expect(isAdminOfSeason(user({ role: "ADMIN", seasonAdminIds: [9] }), 7)).toBe(false);
  });
});

describe("isLeaderOfGroup", () => {
  it("checks group scope, not role", () => {
    expect(isLeaderOfGroup(user({ role: "LEADER", groupLeaderIds: [3] }), 3)).toBe(true);
    expect(isLeaderOfGroup(user({ role: "LEADER", groupLeaderIds: [3] }), 4)).toBe(false);
  });

  it("is false for SUPER without an explicit group scope", () => {
    // Deliberate: this predicate answers "leads this specific group", which a
    // SUPER does not. Callers that mean "may act on this group" add isSuper.
    expect(isLeaderOfGroup(user({ role: "SUPER" }), 3)).toBe(false);
  });
});

describe("canReadAllStudents", () => {
  it("is true for SUPER and MENTOR only", () => {
    expect(canReadAllStudents(user({ role: "SUPER" }))).toBe(true);
    expect(canReadAllStudents(user({ role: "MENTOR" }))).toBe(true);
    expect(canReadAllStudents(user({ role: "ADMIN" }))).toBe(false);
    expect(canReadAllStudents(user({ role: "LEADER" }))).toBe(false);
  });
});

describe("canManageUsers", () => {
  it("is true for SUPER only", () => {
    expect(canManageUsers(user({ role: "SUPER" }))).toBe(true);
    expect(canManageUsers(user({ role: "ADMIN" }))).toBe(false);
  });
});
```

Create `apps/backend/src/__tests__/parse-id.test.ts`:

```ts
import { parseId } from "../lib/parse-id";

describe("parseId", () => {
  it("accepts a positive integer string", () => {
    expect(parseId("7")).toBe(7);
  });

  it("rejects zero and negatives", () => {
    expect(parseId("0")).toBeNull();
    expect(parseId("-1")).toBeNull();
  });

  it("rejects non-numeric and fractional input", () => {
    expect(parseId("abc")).toBeNull();
    expect(parseId("1.5")).toBeNull();
  });

  it("rejects undefined and the empty string", () => {
    expect(parseId(undefined)).toBeNull();
    // Number("") is 0, which the positivity check rejects — asserted so a
    // future refactor cannot regress it into returning 0.
    expect(parseId("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/backend && pnpm jest src/__tests__/rbac.test.ts src/__tests__/parse-id.test.ts
```

Expected: FAIL — "Cannot find module '../lib/rbac'" and "Cannot find module '../lib/parse-id'".

- [ ] **Step 3: Write `parseId`**

Create `apps/backend/src/lib/parse-id.ts`:

```ts
/**
 * Every v1 route repeats `Number.isInteger(id) && id > 0` on its path param
 * before touching the database. This is that check, once.
 *
 * Returns null rather than throwing so callers keep v1's exact response:
 * apiError("bad_request", "Invalid <thing> id.", 400) with the noun spelled
 * the way that route spelled it.
 */
export function parseId(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}
```

- [ ] **Step 4: Port the RBAC predicates**

Create `apps/backend/src/lib/rbac.ts` — port of `jpc-space/src/lib/rbac.ts`:

```ts
import { db } from "../db/client";

import type { SessionUser } from "./auth/tokens";

export function isSuper(u: SessionUser): boolean {
  return u.role === "SUPER";
}

/**
 * An alumnus is a graduated student — role stays STUDENT, but graduationYear is
 * set. Alumni get read-only access instead of the active-student experience.
 */
export function isAlumnus(u: SessionUser): boolean {
  return u.role === "STUDENT" && u.graduationYear != null;
}

export function isMentor(u: SessionUser): boolean {
  return u.role === "MENTOR";
}

export function isAdminOfSeason(u: SessionUser, seasonId: number): boolean {
  return u.role === "SUPER" || u.seasonAdminIds.includes(seasonId);
}

export function isLeaderOfGroup(u: SessionUser, groupId: number): boolean {
  return u.groupLeaderIds.includes(groupId);
}

export async function isLeaderInSeason(u: SessionUser, seasonId: number): Promise<boolean> {
  if (u.role === "SUPER") return true;
  if (u.seasonAdminIds.includes(seasonId)) return true;
  if (u.groupLeaderIds.length === 0) return false;
  const count = await db.group.count({
    where: {
      seasonId,
      id: { in: u.groupLeaderIds },
    },
  });
  return count > 0;
}

export function canReadAllStudents(u: SessionUser): boolean {
  return u.role === "SUPER" || u.role === "MENTOR";
}

export function canManageUsers(u: SessionUser): boolean {
  return u.role === "SUPER";
}
```

- [ ] **Step 5: Port the permission gates**

Create `apps/backend/src/lib/permissions.ts`. Port of the four gates from `jpc-space/src/lib/auth/permissions.ts` that the 16 endpoints actually reach — read that file and copy each function body exactly.

```ts
import { db } from "../db/client";

import type { SessionUser } from "./auth/tokens";
import { isAdminOfSeason, isLeaderOfGroup, isMentor, isSuper } from "./rbac";

export async function canAccessSeason(user: SessionUser, seasonId: number): Promise<boolean> {
  if (isSuper(user) || isMentor(user)) return true;
  if (isAdminOfSeason(user, seasonId)) return true;

  if (user.role === "LEADER") {
    if (user.groupLeaderIds.length === 0) return false;
    const groupInSeason = await db.group.findFirst({
      where: { seasonId, id: { in: user.groupLeaderIds } },
      select: { id: true },
    });
    return groupInSeason !== null;
  }

  if (user.role === "STUDENT") {
    if (user.activeSeasonId === seasonId) return true;
    const enrollment = await db.seasonEnrollment.findUnique({
      where: { studentUserId_seasonId: { studentUserId: user.userId, seasonId } },
      select: { id: true },
    });
    return enrollment !== null;
  }

  return false;
}

export async function canAccessGroup(user: SessionUser, groupId: number): Promise<boolean> {
  if (isSuper(user) || isMentor(user)) return true;
  if (isLeaderOfGroup(user, groupId)) return true;

  const group = await db.group.findUnique({
    where: { id: groupId },
    select: { seasonId: true },
  });
  if (!group) return false;
  if (isAdminOfSeason(user, group.seasonId)) return true;

  if (user.role === "STUDENT") {
    // GroupStudent is keyed by studentUserId alone — a student belongs to at
    // most one group at a time, across all seasons.
    const membership = await db.groupStudent.findUnique({
      where: { studentUserId: user.userId },
      select: { groupId: true },
    });
    return membership?.groupId === groupId;
  }

  return false;
}

export async function canMarkAttendance(user: SessionUser, sessionId: number): Promise<boolean> {
  if (isSuper(user)) return true;
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { seasonId: true },
  });
  if (!session) return false;
  if (isAdminOfSeason(user, session.seasonId)) return true;
  if (user.role !== "LEADER") return false;
  if (user.groupLeaderIds.length === 0) return false;
  const groupInSeason = await db.group.findFirst({
    where: { seasonId: session.seasonId, id: { in: user.groupLeaderIds } },
    select: { id: true },
  });
  return groupInSeason !== null;
}

export async function canViewSubmission(user: SessionUser, submissionId: number): Promise<boolean> {
  if (isSuper(user) || isMentor(user)) return true;

  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    select: {
      studentUserId: true,
      assignment: { select: { seasonId: true } },
    },
  });
  if (!submission) return false;

  if (submission.studentUserId === user.userId) return true;
  if (isAdminOfSeason(user, submission.assignment.seasonId)) return true;

  if (user.role === "LEADER") {
    const membership = await db.groupStudent.findUnique({
      where: { studentUserId: submission.studentUserId },
      select: { groupId: true },
    });
    if (!membership) return false;
    return isLeaderOfGroup(user, membership.groupId);
  }

  return false;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd apps/backend && pnpm jest src/__tests__/rbac.test.ts src/__tests__/parse-id.test.ts
```

Expected: PASS — 15 tests across 2 files.

- [ ] **Step 7: Run typecheck and lint**

```bash
pnpm turbo typecheck lint --filter=@space/backend
```

Expected: both succeed. `permissions.ts` has no consumer yet; `noUnusedLocals` is not enabled, so an as-yet-unimported module is fine.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(backend): port RBAC predicates and permission gates"
```

---

### Task 3: Shared enums, season contracts, integration fixtures, `GET /seasons` and `GET /seasons/:id`

The first RBAC-gated read endpoints, plus the two pieces of infrastructure every later task reuses: the shared domain enums and the integration-test fixture helper.

**Files:**
- Create: `packages/shared/src/enums.ts`
- Create: `packages/shared/src/season.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/backend/src/routes/seasons.ts`
- Modify: `apps/backend/src/app.ts`
- Create: `apps/backend/src/__tests__/integration/fixtures.ts`
- Test: `apps/backend/src/__tests__/integration/seasons-routes.test.ts`

**Interfaces:**
- Consumes: `canAccessSeason` from `../lib/permissions`; `isSuper`, `isMentor` from `../lib/rbac`; `parseId` from `../lib/parse-id`; `requireAuth`, `requireUser` from `../middleware/require-auth`.
- Produces, from `packages/shared/src/enums.ts`: `seasonStatusSchema`/`SeasonStatus`, `enrollmentStatusSchema`/`EnrollmentStatus`, `attendanceStatusSchema`/`AttendanceStatus`, `submissionStatusSchema`/`SubmissionStatus`, `assignmentTypeSchema`/`AssignmentType`.
- Produces, from `packages/shared/src/season.ts`: `SeasonListItem`, `SeasonDetail`, `SeasonDetailGroup` interfaces.
- Produces, from `apps/backend/src/routes/seasons.ts`: `seasonsRouter: Router` — mounted at `/api/v1/seasons`.
- Produces, from `fixtures.ts`: `TEST_PREFIX`, `EMAIL_SUFFIX`, `PASSWORD`, `testUserFilter`, `testEmail()`, `testSeasonCode()`, `createTestUser()`, `createTestSeason()`, `login()`, `cleanupTestData()`.

- [ ] **Step 1: Add the shared enum module**

Create `packages/shared/src/enums.ts`. These mirror `apps/backend/prisma/schema.prisma` exactly; they exist so the mobile client can name a status without importing the generated Prisma client.

```ts
import { z } from "zod";

// Mirrors the enums in prisma/schema.prisma. Kept as Zod enums rather than TS
// string unions so request bodies can validate against them on both sides.
export const seasonStatusSchema = z.enum(["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"]);
export type SeasonStatus = z.infer<typeof seasonStatusSchema>;

export const enrollmentStatusSchema = z.enum(["ACTIVE", "COMPLETED", "WITHDRAWN"]);
export type EnrollmentStatus = z.infer<typeof enrollmentStatusSchema>;

export const attendanceStatusSchema = z.enum(["PRESENT", "ABSENT", "LATE"]);
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;

export const submissionStatusSchema = z.enum(["DRAFT", "SUBMITTED", "REVIEWED", "RETURNED"]);
export type SubmissionStatus = z.infer<typeof submissionStatusSchema>;

export const assignmentTypeSchema = z.enum(["STANDARD", "FORUM"]);
export type AssignmentType = z.infer<typeof assignmentTypeSchema>;
```

- [ ] **Step 2: Add the shared season contracts**

Create `packages/shared/src/season.ts`:

```ts
import type { SeasonStatus } from "./enums";

// Response shapes for the mobile client.
//
// Every timestamp is `string`, not `Date`: the backend hands Prisma Date objects
// to res.json(), which serialises them to ISO-8601. These interfaces describe
// what arrives over the wire, so only the client should import them — the
// backend's own objects hold Dates and would not typecheck against these.

export interface SeasonListItem {
  id: number;
  code: string;
  title: string;
  program: string;
  year: number;
  status: SeasonStatus;
  startDate: string;
  endDate: string;
}

export interface SeasonDetailGroup {
  id: number;
  name: string;
  studentCount: number;
  leaderNames: string[];
}

export interface SeasonDetail {
  id: number;
  code: string;
  title: string;
  program: string;
  year: number;
  description: string | null;
  status: SeasonStatus;
  startDate: string;
  endDate: string;
  sessionCount: number;
  studentCount: number;
  groups: SeasonDetailGroup[];
}
```

- [ ] **Step 3: Re-export from the shared index**

Modify `packages/shared/src/index.ts`:

```ts
export * from "./auth";
export * from "./enums";
export * from "./season";
```

- [ ] **Step 4: Write the integration fixture helper**

Create `apps/backend/src/__tests__/integration/fixtures.ts`. This is the single place any integration suite creates or destroys data in the shared staging database.

```ts
import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import request from "supertest";
import type { Express } from "express";

import { db } from "../../db/client";

/**
 * Every row these helpers create carries this prefix in a unique, queryable
 * column — User.email and Season.code. Cleanup filters on the prefix and
 * nothing else, so no query here can reach a row a real user owns.
 */
export const TEST_PREFIX = "space-v2-test-";
export const EMAIL_SUFFIX = "@jpc.test";
export const PASSWORD = "correct-horse-battery";

export const testUserFilter = {
  email: { startsWith: TEST_PREFIX, endsWith: EMAIL_SUFFIX },
} as const;

export function testEmail(label: string): string {
  return `${TEST_PREFIX}${label}-${randomUUID()}${EMAIL_SUFFIX}`;
}

export function testSeasonCode(): string {
  return `${TEST_PREFIX}${randomUUID()}`;
}

export type TestRole = "SUPER" | "ADMIN" | "LEADER" | "STUDENT" | "MENTOR";

export async function createTestUser(
  label: string,
  role: TestRole,
): Promise<{ id: number; email: string }> {
  const email = testEmail(label);
  const user = await db.user.create({
    data: {
      email,
      name: `Test ${label}`,
      role,
      passwordHash: await bcrypt.hash(PASSWORD, 10),
    },
    select: { id: true, email: true },
  });
  return user;
}

export async function createTestSeason(
  overrides: { status?: "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED"; year?: number } = {},
): Promise<{ id: number; code: string }> {
  const code = testSeasonCode();
  const season = await db.season.create({
    data: {
      code,
      title: "Test Season",
      program: "TEST",
      year: overrides.year ?? 2099,
      status: overrides.status ?? "ACTIVE",
      startDate: new Date("2099-01-01T00:00:00.000Z"),
      endDate: new Date("2099-12-31T00:00:00.000Z"),
    },
    select: { id: true, code: true },
  });
  return season;
}

/** Log in through the real endpoint and return the access token. */
export async function login(app: Express, email: string): Promise<string> {
  const res = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
  if (res.status !== 200) {
    throw new Error(`fixture login failed for ${email}: ${res.status}`);
  }
  return res.body.data.accessToken as string;
}

/**
 * Remove everything the fixtures create, in explicit dependency order.
 *
 * Order is explicit rather than relying on cascades because two of the
 * Season relations are onDelete: Restrict (Group and SeasonEnrollment), so a
 * bare season.deleteMany would fail and leave rows behind in a database that
 * jpc-space is also using.
 *
 * Seasons are discovered by prefix, not by ids captured in this process, so an
 * interrupted previous run self-heals on the next run's beforeAll.
 */
export async function cleanupTestData(): Promise<void> {
  const seasons = await db.season.findMany({
    where: { code: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const seasonIds = seasons.map((s) => s.id);

  if (seasonIds.length > 0) {
    const inSeasons = { seasonId: { in: seasonIds } } as const;

    await db.attendance.deleteMany({ where: { session: inSeasons } });
    await db.submissionFile.deleteMany({
      where: { submission: { assignment: inSeasons } },
    });
    await db.submission.deleteMany({ where: { assignment: inSeasons } });
    await db.assignmentTarget.deleteMany({ where: { assignment: inSeasons } });
    await db.assignment.deleteMany({ where: inSeasons });
    await db.seasonEnrollment.deleteMany({ where: inSeasons });
    await db.groupLeader.deleteMany({ where: { group: inSeasons } });
    await db.groupStudent.deleteMany({ where: { group: inSeasons } });
    await db.group.deleteMany({ where: inSeasons });
    await db.session.deleteMany({ where: inSeasons });
    await db.seasonAdmin.deleteMany({ where: inSeasons });
    await db.studentProfile.deleteMany({ where: { activeSeasonId: { in: seasonIds } } });
    await db.season.deleteMany({ where: { id: { in: seasonIds } } });
  }

  await db.refreshToken.deleteMany({ where: { user: testUserFilter } });
  await db.studentProfile.deleteMany({ where: { user: testUserFilter } });
  await db.user.deleteMany({ where: testUserFilter });
}
```

- [ ] **Step 5: Write the failing test**

Create `apps/backend/src/__tests__/integration/seasons-routes.test.ts`:

```ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import {
  cleanupTestData,
  createTestSeason,
  createTestUser,
  login,
} from "./fixtures";

jest.setTimeout(30000);

const app = createApp();

let seasonId: number;
let otherSeasonId: number;
let superToken: string;
let adminToken: string;
let studentToken: string;
let outsiderToken: string;
let studentUserId: number;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;
  const other = await createTestSeason();
  otherSeasonId = other.id;

  const superUser = await createTestUser("super", "SUPER");
  const adminUser = await createTestUser("admin", "ADMIN");
  const student = await createTestUser("student", "STUDENT");
  const outsider = await createTestUser("outsider", "STUDENT");
  studentUserId = student.id;

  // Admin is scoped to `seasonId` only — the token must not open otherSeasonId.
  await db.seasonAdmin.create({ data: { seasonId, userId: adminUser.id } });

  // Student is enrolled in `seasonId`. The outsider is enrolled nowhere.
  await db.seasonEnrollment.create({
    data: { seasonId, studentUserId: student.id, status: "ACTIVE" },
  });

  await db.group.create({
    data: {
      seasonId,
      name: "Test Group A",
      students: { create: { studentUserId: student.id } },
    },
  });

  superToken = await login(app, superUser.email);
  adminToken = await login(app, adminUser.email);
  studentToken = await login(app, student.email);
  outsiderToken = await login(app, outsider.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/seasons", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/v1/seasons");
    expect(res.status).toBe(401);
  });

  it("returns both test seasons for a SUPER", async () => {
    const res = await request(app).get("/api/v1/seasons").set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.seasons.map((s: { id: number }) => s.id);
    expect(ids).toEqual(expect.arrayContaining([seasonId, otherSeasonId]));
  });

  it("returns only the scoped season for an ADMIN", async () => {
    const res = await request(app).get("/api/v1/seasons").set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.seasons.map((s: { id: number }) => s.id);
    expect(ids).toContain(seasonId);
    expect(ids).not.toContain(otherSeasonId);
  });

  it("returns only the enrolled season for a STUDENT", async () => {
    const res = await request(app).get("/api/v1/seasons").set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.seasons.map((s: { id: number }) => s.id);
    expect(ids).toContain(seasonId);
    expect(ids).not.toContain(otherSeasonId);
  });

  it("returns no test seasons for an unenrolled STUDENT", async () => {
    const res = await request(app).get("/api/v1/seasons").set("authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.seasons.map((s: { id: number }) => s.id);
    expect(ids).not.toContain(seasonId);
    expect(ids).not.toContain(otherSeasonId);
  });
});

describe("GET /api/v1/seasons/:id", () => {
  it("returns 400 for a non-numeric id", async () => {
    const res = await request(app).get("/api/v1/seasons/abc").set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("returns the season with counts and groups for a SUPER", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(seasonId);
    expect(res.body.data.program).toBe("TEST");
    expect(res.body.data.studentCount).toBe(1);
    expect(res.body.data.sessionCount).toBe(0);
    expect(res.body.data.groups).toHaveLength(1);
    expect(res.body.data.groups[0]).toEqual({
      id: expect.any(Number),
      name: "Test Group A",
      studentCount: 1,
      leaderNames: [],
    });
  });

  it("returns 403 for a student not enrolled in the season", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}`)
      .set("authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("returns 403 when an ADMIN reaches outside their season scope", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${otherSeasonId}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 404 for a season id that does not exist", async () => {
    const res = await request(app)
      .get("/api/v1/seasons/2147483000")
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("shows a student only their own group", async () => {
    // A second group the student does not belong to must not appear.
    await db.group.create({ data: { seasonId, name: "Test Group B" } });

    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}`)
      .set("authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.groups).toHaveLength(1);
    expect(res.body.data.groups[0].name).toBe("Test Group A");
    expect(studentUserId).toEqual(expect.any(Number));
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

```bash
cd apps/backend && pnpm jest --runInBand src/__tests__/integration/seasons-routes.test.ts
```

Expected: FAIL — every request returns 404 `not_found`, because `/api/v1/seasons` is not mounted.

- [ ] **Step 7: Write the seasons router**

Create `apps/backend/src/routes/seasons.ts`. Port of `jpc-space/src/app/api/v1/seasons/route.ts` and `seasons/[id]/route.ts` — read both before writing.

```ts
import { Router } from "express";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { parseId } from "../lib/parse-id";
import { canAccessSeason } from "../lib/permissions";
import { isMentor, isSuper } from "../lib/rbac";
import { requireAuth, requireUser } from "../middleware/require-auth";

export const seasonsRouter = Router();

seasonsRouter.use(requireAuth);

seasonsRouter.get("/", async (req, res) => {
  const user = requireUser(req);

  // The visibility rule is expressed as a Prisma filter rather than a
  // post-fetch filter so a season a user cannot see is never read at all.
  const where =
    isSuper(user) || isMentor(user)
      ? { deletedAt: null }
      : user.role === "ADMIN"
        ? { deletedAt: null, id: { in: user.seasonAdminIds } }
        : user.role === "LEADER"
          ? {
              deletedAt: null,
              groups: { some: { leaders: { some: { userId: user.userId } } } },
            }
          : { deletedAt: null, enrollments: { some: { studentUserId: user.userId } } };

  const seasons = await db.season.findMany({
    where,
    orderBy: [{ year: "desc" }, { title: "asc" }],
    select: {
      id: true,
      code: true,
      title: true,
      program: true,
      year: true,
      status: true,
      startDate: true,
      endDate: true,
    },
  });

  apiOk(res, { seasons });
});

seasonsRouter.get("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  if (!(await canAccessSeason(user, id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const season = await db.season.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      code: true,
      title: true,
      program: true,
      year: true,
      description: true,
      status: true,
      startDate: true,
      endDate: true,
      _count: { select: { sessions: true, enrollments: true } },
      groups: {
        // Students may only see their own group.
        where:
          user.role === "STUDENT" ? { students: { some: { studentUserId: user.userId } } } : {},
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          _count: { select: { students: true } },
          leaders: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });
  if (!season) return apiError(res, "not_found", "Season not found.", 404);

  return apiOk(res, {
    id: season.id,
    code: season.code,
    title: season.title,
    program: season.program,
    year: season.year,
    description: season.description,
    status: season.status,
    startDate: season.startDate,
    endDate: season.endDate,
    sessionCount: season._count.sessions,
    studentCount: season._count.enrollments,
    groups: season.groups.map((g) => ({
      id: g.id,
      name: g.name,
      studentCount: g._count.students,
      leaderNames: g.leaders.map((l) => l.user.name).filter((n): n is string => Boolean(n)),
    })),
  });
});
```

Note the ordering trap: `canAccessSeason` runs **before** the existence check, exactly as v1 does. A caller who cannot access seasons gets 403 whether or not the id exists, which is what stops the endpoint being an existence oracle.

- [ ] **Step 8: Mount the router**

Modify `apps/backend/src/app.ts` — add the import and mount it after `meRouter`:

```ts
import { seasonsRouter } from "./routes/seasons";
```

```ts
  app.use("/api/v1/seasons", seasonsRouter);
```

- [ ] **Step 9: Run the test to verify it passes**

```bash
cd apps/backend && pnpm jest --runInBand src/__tests__/integration/seasons-routes.test.ts
```

Expected: PASS — 11 tests.

- [ ] **Step 10: Confirm the fixtures left nothing behind**

The suite writes to a database `jpc-space` shares. Prove cleanup worked:

```bash
cd apps/backend && node -e "require('ts-node').register({transpileOnly:true});const {db}=require('./src/db/client');(async()=>{console.log('seasons:',await db.season.count({where:{code:{startsWith:'space-v2-test-'}}}));console.log('users:',await db.user.count({where:{email:{startsWith:'space-v2-test-'}}}));await db.\$disconnect();})()"
```

Expected: `seasons: 0` and `users: 0`. If either is non-zero, fix `cleanupTestData` before continuing — do not proceed with orphaned rows in the shared database.

- [ ] **Step 11: Run the full checks**

```bash
pnpm turbo typecheck lint test:unit --filter=@space/backend --filter=@space/shared
```

Expected: all succeed.

- [ ] **Step 12: Commit**

```bash
git add -A && git commit -m "feat(backend): port GET /seasons and GET /seasons/:id"
```

---

### Task 4: Groups — `GET /seasons/:id/groups` and `GET /groups/:id`

**Files:**
- Create: `packages/shared/src/group.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/backend/src/lib/queries/groups.ts`
- Create: `apps/backend/src/routes/groups.ts`
- Modify: `apps/backend/src/routes/seasons.ts`
- Modify: `apps/backend/src/app.ts`
- Test: `apps/backend/src/__tests__/integration/groups-routes.test.ts`

**Interfaces:**
- Consumes: `canAccessSeason`, `canAccessGroup` from `../lib/permissions`; `parseId`; `requireAuth`, `requireUser`.
- Produces, from `lib/queries/groups.ts`:
  - `interface GroupListRow { id: number; name: string; description: string | null; studentCount: number; leaderNames: string[]; seasonCode: string; seasonTitle: string }`
  - `listGroupsForSeason(seasonId: number, opts?: { onlyStudentUserId?: number }): Promise<GroupListRow[]>`
- Produces, from `routes/groups.ts`: `groupsRouter: Router` — mounted at `/api/v1/groups`.
- Produces, from `packages/shared/src/group.ts`: `GroupListItem`, `GroupMember`, `GroupDetail`.

- [ ] **Step 1: Add the shared group contracts**

Create `packages/shared/src/group.ts`:

```ts
// Wire shapes — see the note in season.ts on why timestamps are strings.

export interface GroupListItem {
  id: number;
  name: string;
  description: string | null;
  studentCount: number;
  leaderNames: string[];
  seasonCode: string;
  seasonTitle: string;
}

export interface GroupMember {
  id: number;
  name: string | null;
  email: string;
}

export interface GroupDetail {
  id: number;
  name: string;
  description: string | null;
  seasonId: number;
  seasonCode: string;
  seasonTitle: string;
  leaders: GroupMember[];
  students: GroupMember[];
}
```

Add `export * from "./group";` to `packages/shared/src/index.ts`.

- [ ] **Step 2: Write the failing test**

Create `apps/backend/src/__tests__/integration/groups-routes.test.ts`:

```ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(30000);

const app = createApp();

let seasonId: number;
let groupAId: number;
let groupBId: number;
let superToken: string;
let leaderToken: string;
let studentToken: string;
let outsiderToken: string;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;

  const superUser = await createTestUser("super", "SUPER");
  const leader = await createTestUser("leader", "LEADER");
  const student = await createTestUser("student", "STUDENT");
  const outsider = await createTestUser("outsider", "STUDENT");

  const groupA = await db.group.create({
    data: {
      seasonId,
      name: "Group A",
      description: "First group",
      leaders: { create: { userId: leader.id } },
      students: { create: { studentUserId: student.id } },
    },
    select: { id: true },
  });
  groupAId = groupA.id;

  const groupB = await db.group.create({
    data: { seasonId, name: "Group B" },
    select: { id: true },
  });
  groupBId = groupB.id;

  await db.seasonEnrollment.create({
    data: { seasonId, studentUserId: student.id, groupId: groupAId, status: "ACTIVE" },
  });

  superToken = await login(app, superUser.email);
  leaderToken = await login(app, leader.email);
  studentToken = await login(app, student.email);
  outsiderToken = await login(app, outsider.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/seasons/:id/groups", () => {
  it("returns every group in the season for a SUPER", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/groups`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.groups).toHaveLength(2);
    const a = res.body.data.groups.find((g: { id: number }) => g.id === groupAId);
    expect(a).toEqual({
      id: groupAId,
      name: "Group A",
      description: "First group",
      studentCount: 1,
      leaderNames: ["Test leader"],
      seasonCode: expect.any(String),
      seasonTitle: "Test Season",
    });
  });

  it("narrows the list to a student's own group", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/groups`)
      .set("authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.groups).toHaveLength(1);
    expect(res.body.data.groups[0].id).toBe(groupAId);
  });

  it("returns 403 for a user with no access to the season", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/groups`)
      .set("authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 400 for a non-numeric season id", async () => {
    const res = await request(app)
      .get("/api/v1/seasons/abc/groups")
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/groups/:id", () => {
  it("returns leaders and students for a SUPER", async () => {
    const res = await request(app)
      .get(`/api/v1/groups/${groupAId}`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(groupAId);
    expect(res.body.data.seasonId).toBe(seasonId);
    expect(res.body.data.leaders).toEqual([
      { id: expect.any(Number), name: "Test leader", email: expect.any(String) },
    ]);
    expect(res.body.data.students).toEqual([
      { id: expect.any(Number), name: "Test student", email: expect.any(String) },
    ]);
  });

  it("lets the group's own leader read it", async () => {
    const res = await request(app)
      .get(`/api/v1/groups/${groupAId}`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(200);
  });

  it("refuses a leader on a group they do not lead", async () => {
    const res = await request(app)
      .get(`/api/v1/groups/${groupBId}`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(403);
  });

  it("lets a student read their own group but not another", async () => {
    const own = await request(app)
      .get(`/api/v1/groups/${groupAId}`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(own.status).toBe(200);

    const other = await request(app)
      .get(`/api/v1/groups/${groupBId}`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(other.status).toBe(403);
  });

  it("returns 400 for a non-numeric id and 403 for a missing one", async () => {
    const bad = await request(app)
      .get("/api/v1/groups/abc")
      .set("authorization", `Bearer ${superToken}`);
    expect(bad.status).toBe(400);

    // canAccessGroup short-circuits to true for SUPER before the group is read,
    // so a non-existent id reaches the query and 404s — matching v1.
    const missing = await request(app)
      .get("/api/v1/groups/2147483000")
      .set("authorization", `Bearer ${superToken}`);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("not_found");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd apps/backend && pnpm jest --runInBand src/__tests__/integration/groups-routes.test.ts
```

Expected: FAIL — 404 `not_found` on every request.

- [ ] **Step 4: Port the groups query**

Create `apps/backend/src/lib/queries/groups.ts` — port of `listGroupsForSeason` from `jpc-space/src/lib/groups-query.ts`. The other exports in that file are out of scope (see the plan's Scope section).

```ts
import { db } from "../../db/client";

export interface GroupListRow {
  id: number;
  name: string;
  description: string | null;
  studentCount: number;
  leaderNames: string[];
  seasonCode: string;
  seasonTitle: string;
}

/**
 * `onlyStudentUserId` narrows the list to that student's own group. Students may
 * only see their own group and its leaders, so the scope is applied in the query
 * rather than filtered out of the response.
 */
export async function listGroupsForSeason(
  seasonId: number,
  { onlyStudentUserId }: { onlyStudentUserId?: number } = {},
): Promise<GroupListRow[]> {
  const rows = await db.group.findMany({
    where: {
      seasonId,
      ...(onlyStudentUserId ? { students: { some: { studentUserId: onlyStudentUserId } } } : {}),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      _count: { select: { students: true } },
      leaders: { select: { user: { select: { name: true } } } },
      season: { select: { code: true, title: true } },
    },
  });
  return rows.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    studentCount: g._count.students,
    leaderNames: g.leaders.map((l) => l.user.name).filter((n): n is string => Boolean(n)),
    seasonCode: g.season.code,
    seasonTitle: g.season.title,
  }));
}
```

- [ ] **Step 5: Add the season-scoped groups route**

Modify `apps/backend/src/routes/seasons.ts`. Add the import:

```ts
import { listGroupsForSeason } from "../lib/queries/groups";
```

and append this handler — port of `jpc-space/src/app/api/v1/seasons/[id]/groups/route.ts`.

**Mount it after `GET /:id`.** Express matches in registration order and `/:id` will not match `/:id/groups`, so ordering is not load-bearing here — but keep the file grouped by resource for readability.

```ts
seasonsRouter.get("/:id/groups", async (req, res) => {
  const user = requireUser(req);
  const seasonId = parseId(req.params.id);
  if (seasonId === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  if (!(await canAccessSeason(user, seasonId))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const groups = await listGroupsForSeason(seasonId, {
    onlyStudentUserId: user.role === "STUDENT" ? user.userId : undefined,
  });
  return apiOk(res, { groups });
});
```

- [ ] **Step 6: Write the groups router**

Create `apps/backend/src/routes/groups.ts` — port of `jpc-space/src/app/api/v1/groups/[id]/route.ts`:

```ts
import { Router } from "express";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { parseId } from "../lib/parse-id";
import { canAccessGroup } from "../lib/permissions";
import { requireAuth, requireUser } from "../middleware/require-auth";

export const groupsRouter = Router();

groupsRouter.use(requireAuth);

groupsRouter.get("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid group id.", 400);

  if (!(await canAccessGroup(user, id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const group = await db.group.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      seasonId: true,
      season: { select: { code: true, title: true } },
      leaders: {
        select: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { user: { name: "asc" } },
      },
      students: {
        select: { studentUser: { select: { id: true, name: true, email: true } } },
        orderBy: { studentUser: { name: "asc" } },
      },
    },
  });
  if (!group) return apiError(res, "not_found", "Group not found.", 404);

  return apiOk(res, {
    id: group.id,
    name: group.name,
    description: group.description,
    seasonId: group.seasonId,
    seasonCode: group.season.code,
    seasonTitle: group.season.title,
    leaders: group.leaders.map((l) => l.user),
    students: group.students.map((s) => s.studentUser),
  });
});
```

- [ ] **Step 7: Mount the router**

Modify `apps/backend/src/app.ts`:

```ts
import { groupsRouter } from "./routes/groups";
```

```ts
  app.use("/api/v1/groups", groupsRouter);
```

- [ ] **Step 8: Run the test to verify it passes**

```bash
cd apps/backend && pnpm jest --runInBand src/__tests__/integration/groups-routes.test.ts
```

Expected: PASS — 9 tests.

- [ ] **Step 9: Run the whole integration suite, then the checks**

```bash
cd apps/backend && pnpm test:integration
```

```bash
pnpm turbo typecheck lint test:unit --filter=@space/backend --filter=@space/shared
```

Expected: everything green. Running the full integration suite each task catches fixture collisions between suites early.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat(backend): port group listing and group detail endpoints"
```

---

### Task 5: Sessions — `GET /seasons/:id/sessions` and `GET /sessions/:id`

**Files:**
- Create: `packages/shared/src/session.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/backend/src/lib/queries/sessions.ts`
- Create: `apps/backend/src/routes/sessions.ts`
- Modify: `apps/backend/src/routes/seasons.ts`
- Modify: `apps/backend/src/app.ts`
- Test: `apps/backend/src/__tests__/integration/sessions-routes.test.ts`

**Security-critical detail:** `checkInToken` is the *bearer* of a check-in — a student holding it can mark themselves present without attending, or pass it to someone absent. `listSessionsForSeason` therefore takes `includeCheckInToken`, and the route passes `user.role !== "STUDENT"`. `GET /sessions/:id` never selects it at all. Both behaviours are copied from v1; do not "simplify" either away. The test asserts the absence.

**Interfaces:**
- Consumes: `canAccessSeason`, `canMarkAttendance` from `../lib/permissions`; `parseId`; `requireAuth`, `requireUser`.
- Produces, from `lib/queries/sessions.ts`:
  - `interface SessionListRow { id: number; title: string; startsAt: Date; durationMinutes: number; location: string | null; recurrenceGroupId: string | null; attendanceMarked: boolean; seasonId: number; seasonCode: string; seasonTitle: string; checkInToken: string | null; checkInOpenAt: Date | null; checkInClosedAt: Date | null }`
  - `listSessionsForSeason(seasonId: number, opts?: { includeCheckInToken?: boolean }): Promise<SessionListRow[]>`
  - `interface AttendanceRosterEntry { studentUserId: number; name: string | null; email: string; groupName: string | null; status: "PRESENT" | "ABSENT" | "LATE" | null; notes: string | null; lateMinutes: number | null }`
  - `loadAttendanceRoster(sessionId: number, groupIds?: number[]): Promise<AttendanceRosterEntry[] | null>`
- Produces, from `routes/sessions.ts`: `sessionsRouter: Router` — mounted at `/api/v1/sessions`. Tasks 8 and 9 append to this file.

**Divergence from v1:** `loadAttendanceRoster` returns `null` for a missing session instead of calling Next's `notFound()`, which does not exist outside Next. Callers turn `null` into `apiError(res, "not_found", ..., 404)`.

- [ ] **Step 1: Add the shared session contracts**

Create `packages/shared/src/session.ts`:

```ts
import type { AttendanceStatus } from "./enums";

// Wire shapes — see the note in season.ts on why timestamps are strings.

export interface SessionListItem {
  id: number;
  title: string;
  startsAt: string;
  durationMinutes: number;
  location: string | null;
  recurrenceGroupId: string | null;
  attendanceMarked: boolean;
  seasonId: number;
  seasonCode: string;
  seasonTitle: string;
  /**
   * Null for students. Possession of this value authorises a check-in, so the
   * API withholds it from the role that could abuse it.
   */
  checkInToken: string | null;
  checkInOpenAt: string | null;
  checkInClosedAt: string | null;
}

export interface MyAttendance {
  status: AttendanceStatus;
  notes: string | null;
  lateMinutes: number | null;
  checkedInAt: string | null;
}

export interface SessionDetail {
  id: number;
  title: string;
  description: string | null;
  startsAt: string;
  durationMinutes: number;
  location: string | null;
  youtubeUrl: string | null;
  recurrenceGroupId: string | null;
  seasonId: number;
  seasonCode: string;
  seasonTitle: string;
  checkInOpen: boolean;
  /** Present only for students; null for everyone else. */
  myAttendance: MyAttendance | null;
  canMarkAttendance: boolean;
}

export interface AttendanceRosterRow {
  studentUserId: number;
  name: string | null;
  email: string;
  groupName: string | null;
  status: AttendanceStatus | null;
  notes: string | null;
  lateMinutes: number | null;
}
```

Add `export * from "./session";` to `packages/shared/src/index.ts`.

- [ ] **Step 2: Write the failing test**

Create `apps/backend/src/__tests__/integration/sessions-routes.test.ts`:

```ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(30000);

const app = createApp();

let seasonId: number;
let sessionId: number;
let superToken: string;
let adminToken: string;
let studentToken: string;
let outsiderToken: string;
let studentUserId: number;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;

  const superUser = await createTestUser("super", "SUPER");
  const adminUser = await createTestUser("admin", "ADMIN");
  const student = await createTestUser("student", "STUDENT");
  const outsider = await createTestUser("outsider", "STUDENT");
  studentUserId = student.id;

  await db.seasonAdmin.create({ data: { seasonId, userId: adminUser.id } });
  await db.seasonEnrollment.create({
    data: { seasonId, studentUserId: student.id, status: "ACTIVE" },
  });

  const session = await db.session.create({
    data: {
      seasonId,
      title: "Session One",
      description: "A test session",
      startsAt: new Date("2099-03-01T18:00:00.000Z"),
      durationMinutes: 90,
      location: "Hall",
      checkInToken: "test-check-in-token",
    },
    select: { id: true },
  });
  sessionId = session.id;

  superToken = await login(app, superUser.email);
  adminToken = await login(app, adminUser.email);
  studentToken = await login(app, student.email);
  outsiderToken = await login(app, outsider.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/seasons/:id/sessions", () => {
  it("includes the check-in token for a season admin", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/sessions`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.sessions).toHaveLength(1);
    expect(res.body.data.sessions[0]).toMatchObject({
      id: sessionId,
      title: "Session One",
      durationMinutes: 90,
      location: "Hall",
      attendanceMarked: false,
      seasonId,
      checkInToken: "test-check-in-token",
    });
  });

  it("withholds the check-in token from a student", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/sessions`)
      .set("authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.sessions).toHaveLength(1);
    expect(res.body.data.sessions[0].checkInToken).toBeNull();
    // Belt and braces: the value must not appear anywhere in the payload.
    expect(JSON.stringify(res.body)).not.toContain("test-check-in-token");
  });

  it("returns 403 for a user with no access to the season", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/sessions`)
      .set("authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/sessions/:id", () => {
  it("returns detail with canMarkAttendance true for a season admin", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: sessionId,
      title: "Session One",
      description: "A test session",
      durationMinutes: 90,
      location: "Hall",
      seasonId,
      checkInOpen: false,
      myAttendance: null,
      canMarkAttendance: true,
    });
    expect(res.body.data).not.toHaveProperty("checkInToken");
    expect(JSON.stringify(res.body)).not.toContain("test-check-in-token");
  });

  it("returns canMarkAttendance false and myAttendance for a student", async () => {
    await db.attendance.create({
      data: { sessionId, studentUserId, status: "PRESENT", markedById: studentUserId },
    });

    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.canMarkAttendance).toBe(false);
    expect(res.body.data.myAttendance).toMatchObject({
      status: "PRESENT",
      notes: null,
      lateMinutes: null,
    });
  });

  it("returns 403 for a user with no access to the season", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 400 for a non-numeric id and 404 for a missing one", async () => {
    const bad = await request(app)
      .get("/api/v1/sessions/abc")
      .set("authorization", `Bearer ${superToken}`);
    expect(bad.status).toBe(400);

    const missing = await request(app)
      .get("/api/v1/sessions/2147483000")
      .set("authorization", `Bearer ${superToken}`);
    expect(missing.status).toBe(404);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd apps/backend && pnpm jest --runInBand src/__tests__/integration/sessions-routes.test.ts
```

Expected: FAIL — 404 on every request.

- [ ] **Step 4: Port the sessions query**

Create `apps/backend/src/lib/queries/sessions.ts` — port of `listSessionsForSeason` and `loadAttendanceRoster` from `jpc-space/src/lib/sessions-query.ts`. `loadAttendanceRoster` is used by Task 8; it lands here because it belongs to this module.

```ts
import { db } from "../../db/client";

export interface SessionListRow {
  id: number;
  title: string;
  startsAt: Date;
  durationMinutes: number;
  location: string | null;
  recurrenceGroupId: string | null;
  attendanceMarked: boolean;
  seasonId: number;
  seasonCode: string;
  seasonTitle: string;
  checkInToken: string | null;
  checkInOpenAt: Date | null;
  checkInClosedAt: Date | null;
}

/**
 * Possession of `checkInToken` is what authorises a check-in, so it must never
 * reach students — a student holding it could mark themselves present without
 * attending, or pass it to someone who is absent.
 */
export async function listSessionsForSeason(
  seasonId: number,
  { includeCheckInToken = true }: { includeCheckInToken?: boolean } = {},
): Promise<SessionListRow[]> {
  const rows = await db.session.findMany({
    where: { seasonId },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      title: true,
      startsAt: true,
      durationMinutes: true,
      location: true,
      recurrenceGroupId: true,
      checkInToken: includeCheckInToken,
      checkInOpenAt: true,
      checkInClosedAt: true,
      _count: { select: { attendance: true } },
      season: { select: { id: true, code: true, title: true } },
    },
  });
  return rows.map((s) => ({
    id: s.id,
    title: s.title,
    startsAt: s.startsAt,
    durationMinutes: s.durationMinutes,
    location: s.location,
    recurrenceGroupId: s.recurrenceGroupId,
    attendanceMarked: s._count.attendance > 0,
    seasonId: s.season.id,
    seasonCode: s.season.code,
    seasonTitle: s.season.title,
    checkInToken: includeCheckInToken ? (s.checkInToken ?? null) : null,
    checkInOpenAt: s.checkInOpenAt,
    checkInClosedAt: s.checkInClosedAt,
  }));
}

export interface AttendanceRosterEntry {
  studentUserId: number;
  name: string | null;
  email: string;
  groupName: string | null;
  status: "PRESENT" | "ABSENT" | "LATE" | null;
  notes: string | null;
  lateMinutes: number | null;
}

/**
 * Returns null when the session does not exist. v1 called Next's notFound()
 * here; outside Next the caller owns the 404.
 */
export async function loadAttendanceRoster(
  sessionId: number,
  groupIds?: number[],
): Promise<AttendanceRosterEntry[] | null> {
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { seasonId: true },
  });
  if (!session) return null;

  const enrollments = await db.seasonEnrollment.findMany({
    where: {
      seasonId: session.seasonId,
      status: "ACTIVE",
      ...(groupIds ? { groupId: { in: groupIds } } : {}),
    },
    select: {
      studentUserId: true,
      group: { select: { name: true } },
      studentUser: { select: { name: true, email: true } },
    },
    orderBy: [{ group: { name: "asc" } }, { studentUser: { name: "asc" } }],
  });

  const attendance = await db.attendance.findMany({
    where: { sessionId },
    select: { studentUserId: true, status: true, notes: true, lateMinutes: true },
  });
  const byStudent = new Map(attendance.map((a) => [a.studentUserId, a]));

  return enrollments.map((e) => {
    const a = byStudent.get(e.studentUserId);
    return {
      studentUserId: e.studentUserId,
      name: e.studentUser.name,
      email: e.studentUser.email,
      groupName: e.group?.name ?? null,
      status: a?.status ?? null,
      notes: a?.notes ?? null,
      lateMinutes: a?.lateMinutes ?? null,
    };
  });
}
```

- [ ] **Step 5: Add the season-scoped sessions route**

Modify `apps/backend/src/routes/seasons.ts`. Add the import:

```ts
import { listSessionsForSeason } from "../lib/queries/sessions";
```

and append — port of `jpc-space/src/app/api/v1/seasons/[id]/sessions/route.ts`:

```ts
seasonsRouter.get("/:id/sessions", async (req, res) => {
  const user = requireUser(req);
  const seasonId = parseId(req.params.id);
  if (seasonId === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  if (!(await canAccessSeason(user, seasonId))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const sessions = await listSessionsForSeason(seasonId, {
    includeCheckInToken: user.role !== "STUDENT",
  });
  return apiOk(res, { sessions });
});
```

- [ ] **Step 6: Write the sessions router**

Create `apps/backend/src/routes/sessions.ts` — port of `jpc-space/src/app/api/v1/sessions/[id]/route.ts`:

```ts
import { Router } from "express";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { parseId } from "../lib/parse-id";
import { canAccessSeason, canMarkAttendance } from "../lib/permissions";
import { requireAuth, requireUser } from "../middleware/require-auth";

export const sessionsRouter = Router();

sessionsRouter.use(requireAuth);

sessionsRouter.get("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  // checkInToken is deliberately absent from this select — see
  // lib/queries/sessions.ts. Detail is readable by every season member, so
  // including it here would hand it to students.
  const session = await db.session.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      startsAt: true,
      durationMinutes: true,
      location: true,
      youtubeUrl: true,
      recurrenceGroupId: true,
      seasonId: true,
      season: { select: { code: true, title: true } },
      checkInOpenAt: true,
      checkInClosedAt: true,
    },
  });
  if (!session) return apiError(res, "not_found", "Session not found.", 404);

  if (!(await canAccessSeason(user, session.seasonId))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const myAttendance =
    user.role === "STUDENT"
      ? await db.attendance.findUnique({
          where: { sessionId_studentUserId: { sessionId: id, studentUserId: user.userId } },
          select: { status: true, notes: true, lateMinutes: true, checkedInAt: true },
        })
      : null;

  return apiOk(res, {
    id: session.id,
    title: session.title,
    description: session.description,
    startsAt: session.startsAt,
    durationMinutes: session.durationMinutes,
    location: session.location,
    youtubeUrl: session.youtubeUrl,
    recurrenceGroupId: session.recurrenceGroupId,
    seasonId: session.seasonId,
    seasonCode: session.season.code,
    seasonTitle: session.season.title,
    checkInOpen: Boolean(session.checkInOpenAt) && !session.checkInClosedAt,
    myAttendance,
    canMarkAttendance: await canMarkAttendance(user, id),
  });
});
```

Note this route reads the session **before** the access check, the reverse of `/seasons/:id`. That is what v1 does, and it is necessary: the session's `seasonId` is the input to `canAccessSeason`. Keep the order.

- [ ] **Step 7: Mount the router**

Modify `apps/backend/src/app.ts`:

```ts
import { sessionsRouter } from "./routes/sessions";
```

```ts
  app.use("/api/v1/sessions", sessionsRouter);
```

- [ ] **Step 8: Run the test to verify it passes**

```bash
cd apps/backend && pnpm jest --runInBand src/__tests__/integration/sessions-routes.test.ts
```

Expected: PASS — 7 tests.

- [ ] **Step 9: Run the whole suite and the checks**

```bash
cd apps/backend && pnpm test:integration
```

```bash
pnpm turbo typecheck lint test:unit --filter=@space/backend --filter=@space/shared
```

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat(backend): port season sessions listing and session detail"
```

---

### Task 6: Assignments — `GET /seasons/:id/assignments` and `GET /assignments/:id`

**Files:**
- Create: `packages/shared/src/assignment.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/backend/src/lib/queries/assignments.ts`
- Create: `apps/backend/src/routes/assignments.ts`
- Modify: `apps/backend/src/routes/seasons.ts`
- Modify: `apps/backend/src/app.ts`
- Test: `apps/backend/src/__tests__/integration/assignments-routes.test.ts`

**Interfaces:**
- Consumes: `canAccessSeason`; `parseId`; `requireAuth`, `requireUser`.
- Produces, from `lib/queries/assignments.ts`:
  - `interface AssignmentListRow { id: number; title: string; dueAt: Date | null; isAllGroups: boolean; submissionCount: number; expectedCount: number; seasonCode: string }`
  - `listAssignmentsForSeason(seasonId: number): Promise<AssignmentListRow[]>`
  - `interface StudentAssignmentRow { id: number; title: string; dueAt: Date | null; status: SubmissionStatus | "PENDING"; reviewedAt: Date | null }`
  - `listAssignmentsForStudent(studentUserId: number, seasonId: number | null): Promise<StudentAssignmentRow[]>`
  - `interface AssignmentDetailData` — the 15 fields listed in the code below
  - `loadAssignmentById(id: number): Promise<AssignmentDetailData | null>`
- Produces, from `routes/assignments.ts`: `assignmentsRouter: Router` — mounted at `/api/v1/assignments`.

**Divergence from v1:** `loadAssignmentById` returns `null` instead of calling Next's `notFound()`.

**Note on the two list shapes:** `/seasons/:id/assignments` returns a *different object shape* depending on the caller's role — `AssignmentListRow` for staff, `StudentAssignmentRow` for students. That is v1's behaviour and the mobile client already has to branch on role, so keep it. The shared contract models it as a union.

- [ ] **Step 1: Add the shared assignment contracts**

Create `packages/shared/src/assignment.ts`:

```ts
import type { AssignmentType, SubmissionStatus } from "./enums";

// Wire shapes — see the note in season.ts on why timestamps are strings.

/** What GET /seasons/:id/assignments returns to staff (SUPER/ADMIN/LEADER/MENTOR). */
export interface StaffAssignmentListItem {
  id: number;
  title: string;
  dueAt: string | null;
  isAllGroups: boolean;
  submissionCount: number;
  expectedCount: number;
  seasonCode: string;
}

/** What the same endpoint returns to a STUDENT. */
export interface StudentAssignmentListItem {
  id: number;
  title: string;
  dueAt: string | null;
  status: SubmissionStatus | "PENDING";
  reviewedAt: string | null;
}

export type AssignmentListItem = StaffAssignmentListItem | StudentAssignmentListItem;

export interface MySubmissionSummary {
  publicId: string;
  status: SubmissionStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  feedback: string | null;
}

export interface AssignmentDetail {
  id: number;
  seasonId: number;
  seasonCode: string;
  seasonTitle: string;
  sessionId: number | null;
  sessionTitle: string | null;
  title: string;
  description: string | null;
  dueAt: string | null;
  isAllGroups: boolean;
  type: AssignmentType;
  forumMinWords: number | null;
  forumAllowComments: boolean;
  maxFileSizeMb: number | null;
  allowedMimeCategories: string[];
  groupIds: number[];
  /** Present only for students; null for everyone else. */
  mySubmission: MySubmissionSummary | null;
}
```

Add `export * from "./assignment";` to `packages/shared/src/index.ts`.

- [ ] **Step 2: Write the failing test**

Create `apps/backend/src/__tests__/integration/assignments-routes.test.ts`:

```ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(30000);

const app = createApp();

let seasonId: number;
let groupAId: number;
let groupBId: number;
let allGroupsAssignmentId: number;
let targetedAssignmentId: number;
let superToken: string;
let studentToken: string;
let otherStudentToken: string;
let outsiderToken: string;
let studentUserId: number;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;

  const superUser = await createTestUser("super", "SUPER");
  const student = await createTestUser("student", "STUDENT");
  const otherStudent = await createTestUser("other", "STUDENT");
  const outsider = await createTestUser("outsider", "STUDENT");
  studentUserId = student.id;

  const groupA = await db.group.create({
    data: { seasonId, name: "Group A", students: { create: { studentUserId: student.id } } },
    select: { id: true },
  });
  groupAId = groupA.id;
  const groupB = await db.group.create({
    data: { seasonId, name: "Group B", students: { create: { studentUserId: otherStudent.id } } },
    select: { id: true },
  });
  groupBId = groupB.id;

  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: student.id, groupId: groupAId, status: "ACTIVE" },
      { seasonId, studentUserId: otherStudent.id, groupId: groupBId, status: "ACTIVE" },
    ],
  });

  const openToAll = await db.assignment.create({
    data: {
      seasonId,
      title: "Open To All",
      description: "Everyone does this one",
      isAllGroups: true,
      dueAt: new Date("2099-04-01T00:00:00.000Z"),
    },
    select: { id: true },
  });
  allGroupsAssignmentId = openToAll.id;

  const targeted = await db.assignment.create({
    data: {
      seasonId,
      title: "Group B Only",
      isAllGroups: false,
      targets: { create: { groupId: groupBId } },
    },
    select: { id: true },
  });
  targetedAssignmentId = targeted.id;

  superToken = await login(app, superUser.email);
  studentToken = await login(app, student.email);
  otherStudentToken = await login(app, otherStudent.email);
  outsiderToken = await login(app, outsider.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/seasons/:id/assignments", () => {
  it("returns the staff shape with submission and expected counts", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/assignments`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.assignments).toHaveLength(2);
    const all = res.body.data.assignments.find(
      (a: { id: number }) => a.id === allGroupsAssignmentId,
    );
    expect(all).toEqual({
      id: allGroupsAssignmentId,
      title: "Open To All",
      dueAt: expect.any(String),
      isAllGroups: true,
      submissionCount: 0,
      // Both enrolled students.
      expectedCount: 2,
      seasonCode: expect.any(String),
    });

    const targeted = res.body.data.assignments.find(
      (a: { id: number }) => a.id === targetedAssignmentId,
    );
    // Only Group B's single member.
    expect(targeted.expectedCount).toBe(1);
  });

  it("returns the student shape, filtered to assignments that apply to them", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/assignments`)
      .set("authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    // The Group-B-only assignment must not appear for a Group A student.
    expect(res.body.data.assignments).toEqual([
      {
        id: allGroupsAssignmentId,
        title: "Open To All",
        dueAt: expect.any(String),
        status: "PENDING",
        reviewedAt: null,
      },
    ]);
  });

  it("includes the targeted assignment for the student it targets", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/assignments`)
      .set("authorization", `Bearer ${otherStudentToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.assignments.map((a: { id: number }) => a.id);
    expect(ids).toEqual(expect.arrayContaining([allGroupsAssignmentId, targetedAssignmentId]));
  });

  it("returns 403 for a user with no access to the season", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/assignments`)
      .set("authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/assignments/:id", () => {
  it("returns detail for a SUPER with mySubmission null", async () => {
    const res = await request(app)
      .get(`/api/v1/assignments/${allGroupsAssignmentId}`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: allGroupsAssignmentId,
      seasonId,
      title: "Open To All",
      description: "Everyone does this one",
      isAllGroups: true,
      type: "STANDARD",
      groupIds: [],
      mySubmission: null,
    });
  });

  it("returns a student's own submission summary", async () => {
    const submission = await db.submission.create({
      data: {
        assignmentId: allGroupsAssignmentId,
        studentUserId,
        publicId: `space-v2-test-sub-${allGroupsAssignmentId}`,
        status: "DRAFT",
      },
      select: { publicId: true },
    });

    const res = await request(app)
      .get(`/api/v1/assignments/${allGroupsAssignmentId}`)
      .set("authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.mySubmission).toMatchObject({
      publicId: submission.publicId,
      status: "DRAFT",
      submittedAt: null,
      reviewedAt: null,
    });
  });

  it("refuses a student an assignment targeted at another group", async () => {
    const res = await request(app)
      .get(`/api/v1/assignments/${targetedAssignmentId}`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
    expect(groupAId).toEqual(expect.any(Number));
  });

  it("allows the targeted group's student through", async () => {
    const res = await request(app)
      .get(`/api/v1/assignments/${targetedAssignmentId}`)
      .set("authorization", `Bearer ${otherStudentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.groupIds).toEqual([groupBId]);
  });

  it("returns 400 for a non-numeric id and 404 for a missing one", async () => {
    const bad = await request(app)
      .get("/api/v1/assignments/abc")
      .set("authorization", `Bearer ${superToken}`);
    expect(bad.status).toBe(400);

    const missing = await request(app)
      .get("/api/v1/assignments/2147483000")
      .set("authorization", `Bearer ${superToken}`);
    expect(missing.status).toBe(404);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd apps/backend && pnpm jest --runInBand src/__tests__/integration/assignments-routes.test.ts
```

Expected: FAIL — 404 on every request.

- [ ] **Step 4: Port the assignments query**

Create `apps/backend/src/lib/queries/assignments.ts` — port of `listAssignmentsForSeason`, `loadAssignmentById`, and `listAssignmentsForStudent` from `jpc-space/src/lib/assignments-query.ts`. `loadSubmissionTracker` is out of scope.

```ts
import { db } from "../../db/client";
import type { SubmissionStatus } from "../../generated/prisma/enums";

export interface AssignmentListRow {
  id: number;
  title: string;
  dueAt: Date | null;
  isAllGroups: boolean;
  submissionCount: number;
  expectedCount: number;
  seasonCode: string;
}

export async function listAssignmentsForSeason(seasonId: number): Promise<AssignmentListRow[]> {
  const rows = await db.assignment.findMany({
    where: { seasonId, deletedAt: null },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      dueAt: true,
      isAllGroups: true,
      _count: { select: { submissions: { where: { status: { not: "DRAFT" } } } } },
      targets: { select: { groupId: true } },
      season: { select: { code: true, id: true } },
    },
  });

  // Expected count: students in targeted groups (or all season-enrolled if isAllGroups).
  return Promise.all(
    rows.map(async (a) => {
      const expected = a.isAllGroups
        ? await db.seasonEnrollment.count({
            where: { seasonId: a.season.id, status: "ACTIVE" },
          })
        : await db.groupStudent.count({
            where: { groupId: { in: a.targets.map((t) => t.groupId) } },
          });
      return {
        id: a.id,
        title: a.title,
        dueAt: a.dueAt,
        isAllGroups: a.isAllGroups,
        submissionCount: a._count.submissions,
        expectedCount: expected,
        seasonCode: a.season.code,
      };
    }),
  );
}

export interface AssignmentDetailData {
  id: number;
  seasonId: number;
  seasonCode: string;
  seasonTitle: string;
  sessionId: number | null;
  sessionTitle: string | null;
  title: string;
  description: string | null;
  dueAt: Date | null;
  isAllGroups: boolean;
  type: "STANDARD" | "FORUM";
  forumMinWords: number | null;
  forumAllowComments: boolean;
  maxFileSizeMb: number | null;
  allowedMimeCategories: string[];
  groupIds: number[];
}

/** Returns null when the assignment does not exist or is soft-deleted. */
export async function loadAssignmentById(id: number): Promise<AssignmentDetailData | null> {
  const a = await db.assignment.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      seasonId: true,
      season: { select: { code: true, title: true } },
      sessionId: true,
      session: { select: { title: true } },
      title: true,
      description: true,
      dueAt: true,
      isAllGroups: true,
      type: true,
      forumMinWords: true,
      forumAllowComments: true,
      maxFileSizeMb: true,
      allowedMimeCategories: true,
      targets: { select: { groupId: true } },
    },
  });
  if (!a) return null;
  return {
    id: a.id,
    seasonId: a.seasonId,
    seasonCode: a.season.code,
    seasonTitle: a.season.title,
    sessionId: a.sessionId,
    sessionTitle: a.session?.title ?? null,
    title: a.title,
    description: a.description,
    dueAt: a.dueAt,
    isAllGroups: a.isAllGroups,
    type: a.type,
    forumMinWords: a.forumMinWords,
    forumAllowComments: a.forumAllowComments,
    maxFileSizeMb: a.maxFileSizeMb,
    allowedMimeCategories: a.allowedMimeCategories,
    groupIds: a.targets.map((t) => t.groupId),
  };
}

export interface StudentAssignmentRow {
  id: number;
  title: string;
  dueAt: Date | null;
  status: SubmissionStatus | "PENDING";
  reviewedAt: Date | null;
}

export async function listAssignmentsForStudent(
  studentUserId: number,
  seasonId: number | null,
): Promise<StudentAssignmentRow[]> {
  if (!seasonId) return [];

  const groupMembership = await db.groupStudent.findUnique({
    where: { studentUserId },
    select: { groupId: true },
  });

  const assignments = await db.assignment.findMany({
    where: {
      seasonId,
      deletedAt: null,
      OR: [
        { isAllGroups: true },
        ...(groupMembership ? [{ targets: { some: { groupId: groupMembership.groupId } } }] : []),
      ],
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      dueAt: true,
      submissions: {
        where: { studentUserId },
        select: { status: true, reviewedAt: true },
      },
    },
  });

  return assignments.map((a) => {
    const sub = a.submissions[0];
    return {
      id: a.id,
      title: a.title,
      dueAt: a.dueAt,
      status: sub?.status ?? "PENDING",
      reviewedAt: sub?.reviewedAt ?? null,
    };
  });
}
```

- [ ] **Step 5: Add the season-scoped assignments route**

Modify `apps/backend/src/routes/seasons.ts`. Add the import:

```ts
import {
  listAssignmentsForSeason,
  listAssignmentsForStudent,
} from "../lib/queries/assignments";
```

and append — port of `jpc-space/src/app/api/v1/seasons/[id]/assignments/route.ts`:

```ts
seasonsRouter.get("/:id/assignments", async (req, res) => {
  const user = requireUser(req);
  const seasonId = parseId(req.params.id);
  if (seasonId === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  if (!(await canAccessSeason(user, seasonId))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  // Students get a different row shape — their own status per assignment,
  // rather than the season-wide submission/expected counts staff see.
  const assignments =
    user.role === "STUDENT"
      ? await listAssignmentsForStudent(user.userId, seasonId)
      : await listAssignmentsForSeason(seasonId);

  return apiOk(res, { assignments });
});
```

- [ ] **Step 6: Write the assignments router**

Create `apps/backend/src/routes/assignments.ts` — port of `jpc-space/src/app/api/v1/assignments/[id]/route.ts`:

```ts
import { Router } from "express";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { parseId } from "../lib/parse-id";
import { canAccessSeason } from "../lib/permissions";
import { loadAssignmentById } from "../lib/queries/assignments";
import { requireAuth, requireUser } from "../middleware/require-auth";

export const assignmentsRouter = Router();

assignmentsRouter.use(requireAuth);

assignmentsRouter.get("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid assignment id.", 400);

  const assignment = await db.assignment.findFirst({
    where: { id, deletedAt: null },
    select: { seasonId: true },
  });
  if (!assignment) return apiError(res, "not_found", "Assignment not found.", 404);

  if (!(await canAccessSeason(user, assignment.seasonId))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const detail = await loadAssignmentById(id);
  // Unreachable in practice — the existence check above already passed — but
  // loadAssignmentById is nullable, so narrow it rather than asserting.
  if (!detail) return apiError(res, "not_found", "Assignment not found.", 404);

  // Season access is not enough for a targeted assignment: a student must also
  // be in one of the groups it targets.
  if (user.role === "STUDENT" && !detail.isAllGroups) {
    const membership = await db.groupStudent.findUnique({
      where: { studentUserId: user.userId },
      select: { groupId: true },
    });
    if (!membership || !detail.groupIds.includes(membership.groupId)) {
      return apiError(res, "forbidden", "You don't have access to this.", 403);
    }
  }

  let mySubmission = null;
  if (user.role === "STUDENT") {
    mySubmission = await db.submission.findUnique({
      where: { assignmentId_studentUserId: { assignmentId: id, studentUserId: user.userId } },
      select: {
        publicId: true,
        status: true,
        submittedAt: true,
        reviewedAt: true,
        feedback: true,
      },
    });
  }

  return apiOk(res, { ...detail, mySubmission });
});
```

- [ ] **Step 7: Mount the router**

Modify `apps/backend/src/app.ts`:

```ts
import { assignmentsRouter } from "./routes/assignments";
```

```ts
  app.use("/api/v1/assignments", assignmentsRouter);
```

- [ ] **Step 8: Run the test to verify it passes**

```bash
cd apps/backend && pnpm jest --runInBand src/__tests__/integration/assignments-routes.test.ts
```

Expected: PASS — 9 tests.

- [ ] **Step 9: Run the whole suite and the checks**

```bash
cd apps/backend && pnpm test:integration
```

```bash
pnpm turbo typecheck lint test:unit --filter=@space/backend --filter=@space/shared
```

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat(backend): port assignment listing and assignment detail"
```

---

### Task 7: Notifications and email

`POST /sessions/:id/attendance` (Task 8) calls `flagLowAttendance`, which raises an in-app notification and an email to a student's leaders and season admins after two consecutive absences. That chain — `attendance-notifications` → `notifications` → `email` — is this task. No endpoint changes here; the deliverable is a tested library.

**Files:**
- Modify: `apps/backend/src/lib/config.ts`
- Modify: `apps/backend/.env.example`
- Modify: `apps/backend/package.json`
- Create: `apps/backend/src/lib/email.ts`
- Create: `apps/backend/src/lib/notifications.ts`
- Create: `apps/backend/src/lib/attendance-notifications.ts`
- Test: `apps/backend/src/__tests__/email.test.ts`
- Test: `apps/backend/src/__tests__/integration/notifications.test.ts`

**Interfaces:**
- Produces, from `lib/email.ts`: `sendNotificationEmail(email: string, title: string, body: string | null, link: string | null): Promise<void>`
- Produces, from `lib/notifications.ts`:
  - `interface CreateNotificationInput { userId: number; type: NotificationType; title: string; body?: string; link?: string }`
  - `createNotificationsBulk(userIds: number[], payload: Omit<CreateNotificationInput, "userId">): Promise<void>`
- Produces, from `lib/attendance-notifications.ts`: `flagLowAttendance(sessionId: number, entries: { studentUserId: number; status: AttendanceStatus }[]): Promise<void>`

**Divergence from v1 (deliberate):** v1's `getTransporter()` **throws** when `GMAIL_USER`/`GMAIL_APP_PASSWORD` are unset. Every caller wraps the send in `.catch(() => undefined)` or `Promise.allSettled`, so the throw is swallowed — an unconfigured environment silently drops mail while constructing and discarding one Error per recipient. v2 checks configuration up front and returns early with a single warning. Same observable behaviour, no wasted work, and the operator gets told once. **The notification row is still written either way** — email is best-effort, the in-app notification is not.

**Constraint reminder:** `CLAUDE.md` forbids `process.env` outside `src/lib/config.ts`. `email.ts` reads its settings from `config`, not from `process.env`.

- [ ] **Step 1: Add the dependency**

```bash
pnpm --filter @space/backend add nodemailer && pnpm --filter @space/backend add -D @types/nodemailer
```

- [ ] **Step 2: Extend the config schema**

Modify `apps/backend/src/lib/config.ts`. Add to `envSchema`:

```ts
  // Email is optional. When GMAIL_USER/GMAIL_APP_PASSWORD are unset,
  // sendNotificationEmail becomes a no-op and in-app notifications still land.
  GMAIL_USER: z.string().optional(),
  GMAIL_APP_PASSWORD: z.string().optional(),
  // Base URL used to turn a notification's relative link into one a recipient
  // can click in an email. Unset means the email omits the button.
  AUTH_URL: z.string().optional(),
```

and to the exported `config` object:

```ts
  gmailUser: parsed.data.GMAIL_USER,
  gmailAppPassword: parsed.data.GMAIL_APP_PASSWORD,
  authUrl: parsed.data.AUTH_URL,
```

Add the three keys to `apps/backend/.env.example` with placeholder values and a comment saying all three are optional. **Do not put a real value in `.env.example`.**

- [ ] **Step 3: Write the failing email test**

Create `apps/backend/src/__tests__/email.test.ts`. `nodemailer` is mocked, so this is a unit test — no network, no credentials.

```ts
const sendMail = jest.fn().mockResolvedValue({ messageId: "test" });

jest.mock("nodemailer", () => ({
  __esModule: true,
  default: { createTransport: jest.fn(() => ({ sendMail })) },
  createTransport: jest.fn(() => ({ sendMail })),
}));

// config is read at module load, so each test re-imports both modules under a
// fresh module registry with the env it wants.
function loadEmail(env: Record<string, string | undefined>) {
  jest.resetModules();
  const saved = { ...process.env };
  Object.assign(process.env, env);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("../lib/email") as typeof import("../lib/email");
  process.env = saved;
  return mod;
}

beforeEach(() => {
  sendMail.mockClear();
});

describe("sendNotificationEmail", () => {
  it("sends when credentials are configured", async () => {
    const { sendNotificationEmail } = loadEmail({
      GMAIL_USER: "sender@example.test",
      GMAIL_APP_PASSWORD: "app-password",
      AUTH_URL: "https://space.example.test",
    });

    await sendNotificationEmail("student@example.test", "Two absences", "Reach out.", "/admin/students/5");

    expect(sendMail).toHaveBeenCalledTimes(1);
    const call = sendMail.mock.calls[0][0];
    expect(call.to).toBe("student@example.test");
    expect(call.subject).toBe("JPC Space — Two absences");
    expect(call.html).toContain("Reach out.");
    expect(call.html).toContain("https://space.example.test/admin/students/5");
  });

  it("omits the link button when AUTH_URL is unset", async () => {
    const { sendNotificationEmail } = loadEmail({
      GMAIL_USER: "sender@example.test",
      GMAIL_APP_PASSWORD: "app-password",
      AUTH_URL: undefined,
    });

    await sendNotificationEmail("student@example.test", "Title", null, "/somewhere");

    const call = sendMail.mock.calls[0][0];
    expect(call.html).not.toContain("/somewhere");
  });

  it("is a no-op when credentials are absent", async () => {
    const { sendNotificationEmail } = loadEmail({
      GMAIL_USER: undefined,
      GMAIL_APP_PASSWORD: undefined,
    });

    await expect(
      sendNotificationEmail("student@example.test", "Title", null, null),
    ).resolves.toBeUndefined();
    expect(sendMail).not.toHaveBeenCalled();
  });
});
```

Note: `jest.setup.ts` fills placeholders for `DATABASE_URL`/`AUTH_SECRET`, so `config` loads without a real `.env` — but if a real `.env` is present it wins and may already define `GMAIL_USER`. Set every key this test cares about explicitly (including to `undefined`) so the result does not depend on the developer's `.env`.

- [ ] **Step 4: Run it to verify it fails**

```bash
cd apps/backend && pnpm jest src/__tests__/email.test.ts
```

Expected: FAIL — "Cannot find module '../lib/email'".

- [ ] **Step 5: Write the email module**

Create `apps/backend/src/lib/email.ts` — trimmed port of `jpc-space/src/lib/email.ts`, keeping only `sendNotificationEmail` and the shell it renders into. Copy the colour constants and `renderShell`/`buttonHtml` markup from v1 so the mail looks identical; read `jpc-space/src/lib/email.ts` for the exact HTML.

```ts
import nodemailer, { type Transporter } from "nodemailer";

import { config } from "./config";

const NAVY = "#1F3260";
const TEAL_LIGHT = "#7DCED1";
const BG = "#f5f5f5";
const CARD = "#ffffff";
const TEXT = "#333333";
const BORDER = "#e0e0e0";

let cachedTransporter: Transporter | null = null;
let warnedUnconfigured = false;

function isConfigured(): boolean {
  return Boolean(config.gmailUser && config.gmailAppPassword);
}

function getTransporter(): Transporter {
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: config.gmailUser, pass: config.gmailAppPassword },
    });
  }
  return cachedTransporter;
}

function fromAddress(): string {
  return `JPC Space <${config.gmailUser}>`;
}

// renderShell and buttonHtml are copied from jpc-space/src/lib/email.ts so the
// mail is visually identical across the two backends during the transition.
function renderShell(title: string, subtitle: string, bodyHtml: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: ${BG}; font-family: Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: ${CARD}; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden;">
      <div style="background-color: ${NAVY}; padding: 30px; text-align: center;">
        <h1 style="color: #ffffff; font-size: 24px; margin: 0 0 5px 0;">${title}</h1>
        <p style="color: ${TEAL_LIGHT}; font-size: 14px; margin: 0;">${subtitle}</p>
      </div>
      <div style="padding: 40px 30px;">
        ${bodyHtml}
      </div>
      <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid ${BORDER};">
        <p style="font-size: 12px; color: #999999; margin: 0;">
          &copy; ${new Date().getFullYear()} Jesus Project Community &mdash; JPC Space
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function buttonHtml(href: string, label: string): string {
  return `<p style="margin: 0;"><a href="${href}" style="display: inline-block; background-color: ${NAVY}; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 15px;">${label}</a></p>`;
}

/**
 * Best-effort notification email.
 *
 * Divergence from v1: v1 threw when the transport was unconfigured and every
 * caller swallowed it. Returning early instead keeps the observable behaviour
 * (no mail, no crash) without minting an Error per recipient, and warns once so
 * a misconfigured deploy is visible in the log.
 */
export async function sendNotificationEmail(
  email: string,
  title: string,
  body: string | null,
  link: string | null,
): Promise<void> {
  if (!isConfigured()) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn(
        "[email] GMAIL_USER/GMAIL_APP_PASSWORD are unset — notification emails are disabled. In-app notifications are unaffected.",
      );
    }
    return;
  }

  const appUrl = (config.authUrl ?? "").replace(/\/$/, "");
  const viewLink = appUrl ? `${appUrl}${link ?? ""}` : null;

  const bodyHtml = `
    <p style="font-size: 16px; color: ${TEXT}; line-height: 1.6; margin: 0 0 24px 0;">
      ${body ?? "You have a new notification in JPC Space."}
    </p>
    ${viewLink ? buttonHtml(viewLink, "View in JPC Space") : ""}
  `;

  await getTransporter().sendMail({
    from: fromAddress(),
    to: email,
    subject: `JPC Space — ${title}`,
    html: renderShell(title, "Jesus Project Community", bodyHtml),
  });
}
```

- [ ] **Step 6: Run the email test to verify it passes**

```bash
cd apps/backend && pnpm jest src/__tests__/email.test.ts
```

Expected: PASS — 3 tests.

- [ ] **Step 7: Write the notifications module**

Create `apps/backend/src/lib/notifications.ts` — trimmed port of `jpc-space/src/lib/notifications.ts`, keeping only `createNotificationsBulk`.

```ts
import { db } from "../db/client";
import type { NotificationType } from "../generated/prisma/enums";

import { sendNotificationEmail } from "./email";

export interface CreateNotificationInput {
  userId: number;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}

/**
 * NotificationType → the matching Boolean column on NotificationPreference.
 * Typed as a full Record so adding a NotificationType without a preference
 * column is a compile error rather than a silent opt-out failure.
 */
const PREF_FIELD = {
  ASSIGNMENT_CREATED: "assignmentCreated",
  SUBMISSION_REVIEWED: "submissionReviewed",
  SESSION_RESCHEDULED: "sessionRescheduled",
  LOW_ATTENDANCE_FLAG: "lowAttendanceFlag",
  MENTOR_FOLLOWUP: "mentorFollowup",
  QUIZ_GRADED: "quizGraded",
} as const satisfies Record<NotificationType, string>;

export async function createNotificationsBulk(
  userIds: number[],
  payload: Omit<CreateNotificationInput, "userId">,
): Promise<void> {
  if (userIds.length === 0) return;

  const prefs = await db.notificationPreference.findMany({
    where: { userId: { in: userIds } },
  });
  const prefField = PREF_FIELD[payload.type];
  // A user with no preference row has not opted out — defaults are all true.
  const optedOut = new Set(prefs.filter((p) => p[prefField] === false).map((p) => p.userId));
  const targets = userIds.filter((id) => !optedOut.has(id));
  if (targets.length === 0) return;

  await db.notification.createMany({
    data: targets.map((userId) => ({
      userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      link: payload.link,
    })),
  });

  const users = await db.user.findMany({
    where: { id: { in: targets } },
    select: { email: true },
  });
  // Fire-and-forget: mail must never delay or fail the request that triggered
  // it. allSettled so one bad address cannot reject the batch.
  void Promise.allSettled(
    users.map((u) =>
      sendNotificationEmail(u.email, payload.title, payload.body ?? null, payload.link ?? null),
    ),
  );
}
```

- [ ] **Step 8: Write the attendance-notification module**

Create `apps/backend/src/lib/attendance-notifications.ts` — verbatim port of `jpc-space/src/lib/attendance-notifications.ts` with v2 import paths. Read that file and copy the body exactly; the only changes are `import { db } from "../db/client"`, `import { AttendanceStatus } from "../generated/prisma/enums"`, and `import { createNotificationsBulk } from "./notifications"`.

The logic to preserve exactly:
- Only students marked `ABSENT` in this batch are considered.
- For each, read the 2 most recent attendance rows in that season at or before this session's `startsAt`, ordered by session start descending. Fewer than 2 rows, or any of them not `ABSENT` → skip.
- Resolve the student's group; no group → skip.
- Recipients are the group's leaders plus the season's admins, with leaders who are *also* admins removed from the leader list so nobody is notified twice.
- Admins get `link: /admin/students/<id>`, leaders get `/leader/students/<id>` — each recipient gets a link their role can actually open.

- [ ] **Step 9: Write the integration test**

Create `apps/backend/src/__tests__/integration/notifications.test.ts`. This drives `flagLowAttendance` directly, against real rows — the endpoint that calls it lands in Task 8.

```ts
import { db } from "../../db/client";
import { flagLowAttendance } from "../../lib/attendance-notifications";
import { cleanupTestData, createTestSeason, createTestUser } from "./fixtures";

jest.setTimeout(30000);

let seasonId: number;
let groupId: number;
let studentId: number;
let leaderId: number;
let adminId: number;
let firstSessionId: number;
let secondSessionId: number;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;

  const student = await createTestUser("student", "STUDENT");
  const leader = await createTestUser("leader", "LEADER");
  const admin = await createTestUser("admin", "ADMIN");
  studentId = student.id;
  leaderId = leader.id;
  adminId = admin.id;

  const group = await db.group.create({
    data: {
      seasonId,
      name: "Group A",
      leaders: { create: { userId: leader.id } },
      students: { create: { studentUserId: student.id } },
    },
    select: { id: true },
  });
  groupId = group.id;

  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.seasonEnrollment.create({
    data: { seasonId, studentUserId: student.id, groupId, status: "ACTIVE" },
  });

  const first = await db.session.create({
    data: {
      seasonId,
      title: "First",
      startsAt: new Date("2099-03-01T18:00:00.000Z"),
      durationMinutes: 60,
    },
    select: { id: true },
  });
  firstSessionId = first.id;

  const second = await db.session.create({
    data: {
      seasonId,
      title: "Second",
      startsAt: new Date("2099-03-08T18:00:00.000Z"),
      durationMinutes: 60,
    },
    select: { id: true },
  });
  secondSessionId = second.id;
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

it("does not flag after a single absence", async () => {
  await db.attendance.create({
    data: { sessionId: firstSessionId, studentUserId: studentId, status: "ABSENT" },
  });

  await flagLowAttendance(firstSessionId, [{ studentUserId: studentId, status: "ABSENT" }]);

  const count = await db.notification.count({
    where: { userId: { in: [leaderId, adminId] }, type: "LOW_ATTENDANCE_FLAG" },
  });
  expect(count).toBe(0);
});

it("notifies the group leader and season admin after two consecutive absences", async () => {
  await db.attendance.create({
    data: { sessionId: secondSessionId, studentUserId: studentId, status: "ABSENT" },
  });

  await flagLowAttendance(secondSessionId, [{ studentUserId: studentId, status: "ABSENT" }]);

  const notifications = await db.notification.findMany({
    where: { userId: { in: [leaderId, adminId] }, type: "LOW_ATTENDANCE_FLAG" },
    select: { userId: true, link: true, title: true },
  });

  expect(notifications).toHaveLength(2);

  const forAdmin = notifications.find((n) => n.userId === adminId);
  const forLeader = notifications.find((n) => n.userId === leaderId);
  // Each recipient gets a link their own role can open.
  expect(forAdmin?.link).toBe(`/admin/students/${studentId}`);
  expect(forLeader?.link).toBe(`/leader/students/${studentId}`);
  expect(forAdmin?.title).toContain("2 consecutive absences");
});

it("respects an opt-out on NotificationPreference", async () => {
  await db.notification.deleteMany({ where: { userId: { in: [leaderId, adminId] } } });
  await db.notificationPreference.create({
    data: { userId: leaderId, lowAttendanceFlag: false },
  });

  await flagLowAttendance(secondSessionId, [{ studentUserId: studentId, status: "ABSENT" }]);

  const recipients = await db.notification.findMany({
    where: { userId: { in: [leaderId, adminId] }, type: "LOW_ATTENDANCE_FLAG" },
    select: { userId: true },
  });
  expect(recipients.map((r) => r.userId)).toEqual([adminId]);
});
```

`Notification` and `NotificationPreference` both cascade from `User`, so `cleanupTestData` already removes them when it deletes the test users — no fixture change needed.

- [ ] **Step 10: Run the integration test**

```bash
cd apps/backend && pnpm jest --runInBand src/__tests__/integration/notifications.test.ts
```

Expected: PASS — 3 tests, and the run logs the `[email] ... disabled` warning once if no Gmail credentials are set locally. That warning is the expected no-op path, not a failure.

- [ ] **Step 11: Run the checks**

```bash
pnpm turbo typecheck lint test:unit --filter=@space/backend
```

- [ ] **Step 12: Commit**

```bash
git add -A && git commit -m "feat(backend): port notification and email delivery for attendance flags"
```

---

### Task 8: Attendance — `GET` and `POST /sessions/:id/attendance`

**Files:**
- Create: `packages/shared/src/attendance.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/backend/src/routes/sessions.ts`
- Test: `apps/backend/src/__tests__/integration/attendance-routes.test.ts`

**Interfaces:**
- Consumes: `canMarkAttendance` from `../lib/permissions`; `loadAttendanceRoster` from `../lib/queries/sessions`; `flagLowAttendance` from `../lib/attendance-notifications`; `AttendanceStatus` from `../generated/prisma/enums`.
- Produces, from `packages/shared/src/attendance.ts`:
  - `attendanceEntrySchema` — `{ studentUserId: number; status: AttendanceStatus; notes?: string | null; lateMinutes?: number | null }`
  - `saveAttendanceRequestSchema` — `{ entries: AttendanceEntry[] }`
  - Types `AttendanceEntry`, `SaveAttendanceRequest`

**Two behaviours to preserve exactly:**
1. `lateMinutes` is written **only** when `status === "LATE"`; any other status nulls it. A row that says PRESENT must never carry a stale lateness.
2. Both verbs are gated by `canMarkAttendance`, not `canAccessSeason`. Reading a roster exposes every enrolled student's name and email, so it is staff-only — a student who can read the session cannot read its roster.

- [ ] **Step 1: Add the shared attendance contract**

Create `packages/shared/src/attendance.ts`:

```ts
import { z } from "zod";

import { attendanceStatusSchema } from "./enums";

export const attendanceEntrySchema = z.object({
  studentUserId: z.number().int(),
  status: attendanceStatusSchema,
  notes: z.string().max(500).optional().nullable(),
  // Upper bound of 600 (ten hours) is v1's — a larger value is a client bug,
  // not a real lateness.
  lateMinutes: z.number().int().min(0).max(600).optional().nullable(),
});
export type AttendanceEntry = z.infer<typeof attendanceEntrySchema>;

export const saveAttendanceRequestSchema = z.object({
  entries: z.array(attendanceEntrySchema),
});
export type SaveAttendanceRequest = z.infer<typeof saveAttendanceRequestSchema>;
```

Add `export * from "./attendance";` to `packages/shared/src/index.ts`.

- [ ] **Step 2: Write the failing test**

Create `apps/backend/src/__tests__/integration/attendance-routes.test.ts`:

```ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(30000);

const app = createApp();

let seasonId: number;
let sessionId: number;
let studentUserId: number;
let adminUserId: number;
let adminToken: string;
let leaderToken: string;
let studentToken: string;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;

  const admin = await createTestUser("admin", "ADMIN");
  const leader = await createTestUser("leader", "LEADER");
  const student = await createTestUser("student", "STUDENT");
  adminUserId = admin.id;
  studentUserId = student.id;

  const group = await db.group.create({
    data: {
      seasonId,
      name: "Group A",
      leaders: { create: { userId: leader.id } },
      students: { create: { studentUserId: student.id } },
    },
    select: { id: true },
  });

  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.seasonEnrollment.create({
    data: { seasonId, studentUserId: student.id, groupId: group.id, status: "ACTIVE" },
  });

  const session = await db.session.create({
    data: {
      seasonId,
      title: "Session One",
      startsAt: new Date("2099-03-01T18:00:00.000Z"),
      durationMinutes: 90,
    },
    select: { id: true },
  });
  sessionId = session.id;

  adminToken = await login(app, admin.email);
  leaderToken = await login(app, leader.email);
  studentToken = await login(app, student.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/sessions/:id/attendance", () => {
  it("returns the enrolled roster for a season admin", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/attendance`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.roster).toEqual([
      {
        studentUserId,
        name: "Test student",
        email: expect.any(String),
        groupName: "Group A",
        status: null,
        notes: null,
        lateMinutes: null,
      },
    ]);
  });

  it("allows a leader in the season", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/attendance`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(200);
  });

  it("refuses a student — the roster exposes every peer's contact details", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/attendance`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("returns 400 for a non-numeric session id", async () => {
    const res = await request(app)
      .get("/api/v1/sessions/abc/attendance")
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/sessions/:id/attendance", () => {
  it("upserts entries and records who marked them", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/attendance`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ entries: [{ studentUserId, status: "LATE", notes: "Bus", lateMinutes: 12 }] });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ saved: 1 });

    const row = await db.attendance.findUnique({
      where: { sessionId_studentUserId: { sessionId, studentUserId } },
      select: { status: true, notes: true, lateMinutes: true, markedById: true },
    });
    expect(row).toEqual({
      status: "LATE",
      notes: "Bus",
      lateMinutes: 12,
      markedById: adminUserId,
    });
  });

  it("clears lateMinutes when the status is not LATE", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/attendance`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ entries: [{ studentUserId, status: "PRESENT", lateMinutes: 30 }] });

    expect(res.status).toBe(200);
    const row = await db.attendance.findUnique({
      where: { sessionId_studentUserId: { sessionId, studentUserId } },
      select: { status: true, lateMinutes: true, notes: true },
    });
    // lateMinutes was supplied but must not survive a non-LATE status, and the
    // omitted notes field must be cleared rather than left stale.
    expect(row).toEqual({ status: "PRESENT", lateMinutes: null, notes: null });
  });

  it("refuses a student", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/attendance`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ entries: [{ studentUserId, status: "PRESENT" }] });
    expect(res.status).toBe(403);
  });

  it("returns 400 for an invalid status", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/attendance`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ entries: [{ studentUserId, status: "MAYBE" }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("returns 400 for a missing entries array", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/attendance`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("accepts an empty entries array as a no-op", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/attendance`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ entries: [] });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ saved: 0 });
    expect(seasonId).toEqual(expect.any(Number));
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd apps/backend && pnpm jest --runInBand src/__tests__/integration/attendance-routes.test.ts
```

Expected: FAIL — 404 on the attendance paths.

- [ ] **Step 4: Add the two handlers**

Modify `apps/backend/src/routes/sessions.ts` — port of `jpc-space/src/app/api/v1/sessions/[id]/attendance/route.ts`. Add the imports:

```ts
import { AttendanceStatus } from "../generated/prisma/enums";
import { flagLowAttendance } from "../lib/attendance-notifications";
import { loadAttendanceRoster } from "../lib/queries/sessions";
import { saveAttendanceRequestSchema } from "../../../../packages/shared/src/index";
```

The shared import is **relative on purpose** — `saveAttendanceRequestSchema` is a value, and a bare `@space/shared` specifier survives into `dist/` and crashes the built server. See the top of `routes/auth.ts`.

Append both handlers:

```ts
sessionsRouter.get("/:id/attendance", async (req, res) => {
  const user = requireUser(req);
  const sessionId = parseId(req.params.id);
  if (sessionId === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  // canMarkAttendance, not canAccessSeason: the roster carries every enrolled
  // student's name and email, so reading it is staff-only.
  if (!(await canMarkAttendance(user, sessionId))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const roster = await loadAttendanceRoster(sessionId);
  if (roster === null) return apiError(res, "not_found", "Session not found.", 404);

  return apiOk(res, { roster });
});

sessionsRouter.post("/:id/attendance", async (req, res) => {
  const user = requireUser(req);
  const sessionId = parseId(req.params.id);
  if (sessionId === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  if (!(await canMarkAttendance(user, sessionId))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const parsed = saveAttendanceRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid attendance entries.", 400);

  // One transaction so a partially-saved roster is impossible: either every
  // student in this batch is marked, or none is.
  await db.$transaction(
    parsed.data.entries.map((e) =>
      db.attendance.upsert({
        where: { sessionId_studentUserId: { sessionId, studentUserId: e.studentUserId } },
        update: {
          status: e.status,
          notes: e.notes ?? null,
          // Lateness is meaningless unless the status is LATE, and leaving a
          // stale value behind would corrupt attendance reporting.
          lateMinutes: e.status === AttendanceStatus.LATE ? (e.lateMinutes ?? null) : null,
          markedById: user.userId,
          markedAt: new Date(),
        },
        create: {
          sessionId,
          studentUserId: e.studentUserId,
          status: e.status,
          notes: e.notes ?? null,
          lateMinutes: e.status === AttendanceStatus.LATE ? (e.lateMinutes ?? null) : null,
          markedById: user.userId,
        },
      }),
    ),
  );

  await flagLowAttendance(sessionId, parsed.data.entries);

  return apiOk(res, { saved: parsed.data.entries.length });
});
```

**Route-ordering note:** `/:id/attendance` is registered after `/:id`. Express matches on the full path, and `/:id` cannot match a two-segment path, so order is not load-bearing — but Task 9 adds `POST /check-in`, which *can* collide. See that task.

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd apps/backend && pnpm jest --runInBand src/__tests__/integration/attendance-routes.test.ts
```

Expected: PASS — 10 tests.

- [ ] **Step 6: Run the whole suite and the checks**

```bash
cd apps/backend && pnpm test:integration
```

```bash
pnpm turbo typecheck lint test:unit --filter=@space/backend --filter=@space/shared
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(backend): port attendance roster and marking endpoints"
```

---

### Task 9: Check-in — open, close, and student self check-in

**Files:**
- Create: `apps/backend/src/lib/public-id.ts`
- Create: `apps/backend/src/__tests__/public-id.test.ts`
- Modify: `packages/shared/src/session.ts`
- Modify: `apps/backend/src/routes/sessions.ts`
- Test: `apps/backend/src/__tests__/integration/check-in-routes.test.ts`

**Interfaces:**
- Consumes: `isAdminOfSeason` from `../lib/rbac`.
- Produces: `newPublicId(): string` — 10 characters from `[0-9A-Za-z]`.
- Produces, from `packages/shared/src/session.ts`: `checkInRequestSchema` — `{ token: string }`, type `CheckInRequest`.

**Divergence from v1 — `newPublicId` does not use `nanoid`.** v1 imports `customAlphabet` from `nanoid` v5, which is ESM-only. This backend compiles to CommonJS (`packages/config/tsconfig/node.json`), so `require("nanoid")` throws `ERR_REQUIRE_ESM` at runtime — it would pass typecheck and fail on the first check-in. The replacement uses `node:crypto` with the same 62-character alphabet and the same length, so the ids are indistinguishable in format. Rejection sampling avoids the modulo bias a naive `% 62` would introduce.

**Route ordering is load-bearing in this task.** `POST /check-in` and `POST /:id/check-in-open` both live on `sessionsRouter`. A single-segment literal path can be shadowed by a single-segment parameter path, so register `POST /check-in` **before** any other POST on this router. There is no `POST /:id` today, but adding one later would silently swallow `/check-in` — the test below pins the behaviour.

- [ ] **Step 1: Write the failing public-id unit test**

Create `apps/backend/src/__tests__/public-id.test.ts`:

```ts
import { newPublicId } from "../lib/public-id";

describe("newPublicId", () => {
  it("returns 10 characters from the URL-safe alphabet", () => {
    for (let i = 0; i < 200; i++) {
      expect(newPublicId()).toMatch(/^[0-9A-Za-z]{10}$/);
    }
  });

  it("does not repeat across many draws", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(newPublicId());
    expect(seen.size).toBe(5000);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd apps/backend && pnpm jest src/__tests__/public-id.test.ts
```

Expected: FAIL — "Cannot find module '../lib/public-id'".

- [ ] **Step 3: Write `newPublicId`**

Create `apps/backend/src/lib/public-id.ts`:

```ts
import { randomBytes } from "node:crypto";

// URL-safe alphabet: digits + ASCII letters. 62^10 ≈ 8.4 × 10^17 — collision-safe
// for this scale. Same alphabet and length as v1's nanoid-based generator, so
// ids from the two backends are indistinguishable.
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const LENGTH = 10;

// v1 uses nanoid v5, which is ESM-only. This backend compiles to CommonJS, so
// requiring it would throw ERR_REQUIRE_ESM at runtime — it typechecks and then
// fails on the first check-in. node:crypto has no such problem.
//
// 256 is not a multiple of 62, so bytes at or above the largest multiple (248)
// are discarded rather than folded with %, which would bias the first four
// letters of every id.
const MAX_ACCEPTABLE = Math.floor(256 / ALPHABET.length) * ALPHABET.length;

export function newPublicId(): string {
  let out = "";
  while (out.length < LENGTH) {
    for (const byte of randomBytes(LENGTH)) {
      if (byte >= MAX_ACCEPTABLE) continue;
      out += ALPHABET[byte % ALPHABET.length];
      if (out.length === LENGTH) break;
    }
  }
  return out;
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
cd apps/backend && pnpm jest src/__tests__/public-id.test.ts
```

Expected: PASS — 2 tests.

- [ ] **Step 5: Add the check-in request schema**

Append to `packages/shared/src/session.ts`:

```ts
import { z } from "zod";

export const checkInRequestSchema = z.object({ token: z.string().min(1) });
export type CheckInRequest = z.infer<typeof checkInRequestSchema>;
```

(Move the `import { z } from "zod";` to the top of the file alongside the existing type import.)

- [ ] **Step 6: Write the failing integration test**

Create `apps/backend/src/__tests__/integration/check-in-routes.test.ts`:

```ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(30000);

const app = createApp();

let seasonId: number;
let sessionId: number;
let studentUserId: number;
let adminToken: string;
let studentToken: string;
let outsiderToken: string;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;

  const admin = await createTestUser("admin", "ADMIN");
  const student = await createTestUser("student", "STUDENT");
  const outsider = await createTestUser("outsider", "STUDENT");
  studentUserId = student.id;

  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.seasonEnrollment.create({
    data: { seasonId, studentUserId: student.id, status: "ACTIVE" },
  });

  const session = await db.session.create({
    data: {
      seasonId,
      title: "Session One",
      startsAt: new Date("2099-03-01T18:00:00.000Z"),
      durationMinutes: 90,
    },
    select: { id: true },
  });
  sessionId = session.id;

  adminToken = await login(app, admin.email);
  studentToken = await login(app, student.email);
  outsiderToken = await login(app, outsider.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

async function openCheckIn(): Promise<string> {
  const res = await request(app)
    .post(`/api/v1/sessions/${sessionId}/check-in-open`)
    .set("authorization", `Bearer ${adminToken}`);
  return res.body.data.checkInToken;
}

describe("POST /api/v1/sessions/:id/check-in-open", () => {
  it("mints a token and marks the session open", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/check-in-open`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.checkInToken).toMatch(/^[0-9A-Za-z]{10}$/);

    const row = await db.session.findUnique({
      where: { id: sessionId },
      select: { checkInOpenAt: true, checkInClosedAt: true },
    });
    expect(row?.checkInOpenAt).toBeTruthy();
    expect(row?.checkInClosedAt).toBeNull();
  });

  it("reuses the existing token when reopened", async () => {
    const first = await openCheckIn();
    const second = await openCheckIn();
    // Reopening must not invalidate a code already displayed to a room.
    expect(second).toBe(first);
  });

  it("refuses a student", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/check-in-open`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 404 for a session that does not exist", async () => {
    const res = await request(app)
      .post("/api/v1/sessions/2147483000/check-in-open")
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/sessions/check-in", () => {
  beforeEach(async () => {
    await db.attendance.deleteMany({ where: { sessionId } });
  });

  it("marks an enrolled student present", async () => {
    const token = await openCheckIn();

    const res = await request(app)
      .post("/api/v1/sessions/check-in")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ token });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("PRESENT");
    expect(res.body.data.minutesLate).toBe(0);

    const row = await db.attendance.findUnique({
      where: { sessionId_studentUserId: { sessionId, studentUserId } },
      select: { status: true, checkedInAt: true },
    });
    expect(row?.status).toBe("PRESENT");
    expect(row?.checkedInAt).toBeTruthy();
  });

  it("rejects a second check-in", async () => {
    const token = await openCheckIn();
    await request(app)
      .post("/api/v1/sessions/check-in")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ token });

    const again = await request(app)
      .post("/api/v1/sessions/check-in")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ token });

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("already_checked_in");
  });

  it("rejects a student who is not enrolled in the season", async () => {
    const token = await openCheckIn();

    const res = await request(app)
      .post("/api/v1/sessions/check-in")
      .set("authorization", `Bearer ${outsiderToken}`)
      .send({ token });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("not_enrolled");
  });

  it("rejects an unknown token with 404 invalid_token", async () => {
    const res = await request(app)
      .post("/api/v1/sessions/check-in")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ token: "nosuchtoken" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("invalid_token");
  });

  it("returns 400 when the token is missing", async () => {
    const res = await request(app)
      .post("/api/v1/sessions/check-in")
      .set("authorization", `Bearer ${studentToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("requires authentication", async () => {
    const res = await request(app).post("/api/v1/sessions/check-in").send({ token: "x" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/sessions/:id/check-in-close", () => {
  it("closes check-in and blocks further check-ins", async () => {
    const token = await openCheckIn();
    await db.attendance.deleteMany({ where: { sessionId } });

    const close = await request(app)
      .post(`/api/v1/sessions/${sessionId}/check-in-close`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(close.status).toBe(200);
    expect(close.body.data).toEqual({ closed: true });

    const attempt = await request(app)
      .post("/api/v1/sessions/check-in")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ token });
    expect(attempt.status).toBe(409);
    expect(attempt.body.error.code).toBe("closed");
  });

  it("refuses a student", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/check-in-close`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
    expect(seasonId).toEqual(expect.any(Number));
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

```bash
cd apps/backend && pnpm jest --runInBand src/__tests__/integration/check-in-routes.test.ts
```

Expected: FAIL — 404 on all three paths.

- [ ] **Step 8: Add the three handlers**

Modify `apps/backend/src/routes/sessions.ts`. Add the imports:

```ts
import { isAdminOfSeason } from "../lib/rbac";
import { newPublicId } from "../lib/public-id";
```

and extend the existing relative shared import to include `checkInRequestSchema`.

**Register `POST /check-in` immediately after `sessionsRouter.use(requireAuth)`, before every other handler on this router.** Port of `jpc-space/src/app/api/v1/sessions/check-in/route.ts`:

```ts
// Registered first: "/check-in" is a single-segment literal and would be
// shadowed by any single-segment parameter route (a future POST "/:id") that
// was registered ahead of it. Keep it at the top.
sessionsRouter.post("/check-in", async (req, res) => {
  const user = requireUser(req);

  const parsed = checkInRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Missing check-in token.", 400);

  const session = await db.session.findUnique({
    where: { checkInToken: parsed.data.token },
    select: { id: true, seasonId: true, checkInOpenAt: true, checkInClosedAt: true },
  });
  if (!session) return apiError(res, "invalid_token", "Check-in token is invalid.", 404);
  if (!session.checkInOpenAt) return apiError(res, "not_open", "Check-in is not open yet.", 409);
  if (session.checkInClosedAt) return apiError(res, "closed", "Check-in has closed.", 409);

  const now = new Date();
  // Hard stop three hours after opening, so an admin who forgets to close a
  // session cannot leave a working code live indefinitely.
  if (now.getTime() - session.checkInOpenAt.getTime() > 3 * 60 * 60 * 1000) {
    return apiError(res, "closed", "Check-in has closed.", 409);
  }

  const enrollment = await db.seasonEnrollment.findUnique({
    where: { studentUserId_seasonId: { studentUserId: user.userId, seasonId: session.seasonId } },
    select: { status: true },
  });
  if (!enrollment || enrollment.status !== "ACTIVE") {
    return apiError(res, "not_enrolled", "You're not enrolled in this season.", 403);
  }

  const existing = await db.attendance.findUnique({
    where: { sessionId_studentUserId: { sessionId: session.id, studentUserId: user.userId } },
    select: { checkedInAt: true, status: true },
  });
  if (existing?.checkedInAt) {
    return apiError(res, "already_checked_in", "Already checked in.", 409);
  }

  const minutesLate = Math.max(
    0,
    Math.floor((now.getTime() - session.checkInOpenAt.getTime()) / 60_000),
  );
  const status: "PRESENT" | "LATE" = minutesLate > 0 ? "LATE" : "PRESENT";

  await db.attendance.upsert({
    where: { sessionId_studentUserId: { sessionId: session.id, studentUserId: user.userId } },
    create: {
      sessionId: session.id,
      studentUserId: user.userId,
      status,
      checkedInAt: now,
      lateMinutes: status === "LATE" ? minutesLate : null,
      markedById: user.userId,
      markedAt: now,
    },
    update: {
      status,
      checkedInAt: now,
      lateMinutes: status === "LATE" ? minutesLate : null,
    },
  });

  return apiOk(res, { status, minutesLate });
});
```

Then append the two admin handlers — ports of `check-in-open/route.ts` and `check-in-close/route.ts`:

```ts
sessionsRouter.post("/:id/check-in-open", async (req, res) => {
  const user = requireUser(req);
  const sessionId = parseId(req.params.id);
  if (sessionId === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { seasonId: true, checkInToken: true },
  });
  if (!session) return apiError(res, "not_found", "Session not found.", 404);
  // Season admins only — not group leaders. Opening check-in is what makes
  // self-marking possible for a whole season's roster.
  if (!isAdminOfSeason(user, session.seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  // Reuse an existing token so reopening does not invalidate a code already
  // displayed to a room.
  const checkInToken = session.checkInToken ?? newPublicId();
  await db.session.update({
    where: { id: sessionId },
    data: { checkInToken, checkInOpenAt: new Date(), checkInClosedAt: null },
  });

  return apiOk(res, { checkInToken });
});

sessionsRouter.post("/:id/check-in-close", async (req, res) => {
  const user = requireUser(req);
  const sessionId = parseId(req.params.id);
  if (sessionId === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { seasonId: true },
  });
  if (!session) return apiError(res, "not_found", "Session not found.", 404);
  if (!isAdminOfSeason(user, session.seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  await db.session.update({
    where: { id: sessionId },
    data: { checkInClosedAt: new Date() },
  });

  return apiOk(res, { closed: true });
});
```

- [ ] **Step 9: Run the test to verify it passes**

```bash
cd apps/backend && pnpm jest --runInBand src/__tests__/integration/check-in-routes.test.ts
```

Expected: PASS — 12 tests.

- [ ] **Step 10: Run the whole suite and the checks**

```bash
cd apps/backend && pnpm test:integration
```

```bash
pnpm turbo typecheck lint test:unit --filter=@space/backend --filter=@space/shared
```

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -m "feat(backend): port session check-in open, close, and student check-in"
```

---

### Task 10: Submissions — `GET` and `PATCH /submissions/:publicId`

**Files:**
- Create: `packages/shared/src/submission.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/backend/src/routes/submissions.ts`
- Modify: `apps/backend/src/app.ts`
- Test: `apps/backend/src/__tests__/integration/submissions-routes.test.ts`

**Interfaces:**
- Consumes: `canViewSubmission` from `../lib/permissions`; `ForbiddenError` from `../lib/auth/errors`.
- Produces, from `routes/submissions.ts`: `submissionsRouter: Router` — mounted at `/api/v1/submissions`. Task 11 appends to this file.
- Produces, from `packages/shared/src/submission.ts`: `updateSubmissionRequestSchema` (`{ text: string; submit?: boolean }`), types `UpdateSubmissionRequest`, `SubmissionFileSummary`, `SubmissionDetail`.

**Note — `:publicId` is not numeric.** Unlike every other route in this port, the path param is an opaque 10-character string. Do **not** run it through `parseId`. An unknown value simply misses the unique index and 404s.

**Two behaviours to preserve exactly:**
1. `PATCH` throws `ForbiddenError` for a non-owner rather than returning `apiError` directly. That path now runs through the error handler added in Task 1, and the test asserts it produces `403 forbidden` — this is the first route that exercises thrown-error mapping end to end.
2. `PATCH` with `submit: true` sets `status: SUBMITTED` **and** stamps `submittedAt`; without it, the row goes back to `DRAFT`. Saving a draft after submitting therefore un-submits it, which is v1's behaviour.

**Faithful-port note:** v1's `PATCH` selects `assignment.dueAt` and never reads it — there is no late-submission gate. Port it as-is; do not add one. Adding a deadline check here would reject submissions v1 accepts, and the two backends are live against one database.

- [ ] **Step 1: Add the shared submission contract**

Create `packages/shared/src/submission.ts`:

```ts
import { z } from "zod";

import type { SubmissionStatus } from "./enums";

export const updateSubmissionRequestSchema = z.object({
  text: z.string(),
  /** Omitted or false saves a draft; true submits and stamps submittedAt. */
  submit: z.boolean().optional(),
});
export type UpdateSubmissionRequest = z.infer<typeof updateSubmissionRequestSchema>;

// Wire shapes — see the note in season.ts on why timestamps are strings.

export interface SubmissionFileSummary {
  id: number;
  originalName: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
}

export interface SubmissionDetail {
  id: number;
  publicId: string;
  status: SubmissionStatus;
  text: string | null;
  feedback: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  assignmentId: number;
  assignmentTitle: string;
  assignmentDueAt: string | null;
  assignmentDescription: string | null;
  seasonCode: string;
  studentUserId: number;
  studentName: string | null;
  studentEmail: string;
  files: SubmissionFileSummary[];
}
```

Add `export * from "./submission";` to `packages/shared/src/index.ts`.

- [ ] **Step 2: Write the failing test**

Create `apps/backend/src/__tests__/integration/submissions-routes.test.ts`:

```ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(30000);

const app = createApp();

let seasonId: number;
let assignmentId: number;
let publicId: string;
let studentUserId: number;
let ownerToken: string;
let peerToken: string;
let leaderToken: string;
let adminToken: string;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;

  const owner = await createTestUser("owner", "STUDENT");
  const peer = await createTestUser("peer", "STUDENT");
  const leader = await createTestUser("leader", "LEADER");
  const admin = await createTestUser("admin", "ADMIN");
  studentUserId = owner.id;

  await db.group.create({
    data: {
      seasonId,
      name: "Group A",
      leaders: { create: { userId: leader.id } },
      students: { create: { studentUserId: owner.id } },
    },
  });
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: owner.id, status: "ACTIVE" },
      { seasonId, studentUserId: peer.id, status: "ACTIVE" },
    ],
  });

  const assignment = await db.assignment.create({
    data: {
      seasonId,
      title: "Essay",
      description: "Write it",
      isAllGroups: true,
      dueAt: new Date("2099-04-01T00:00:00.000Z"),
    },
    select: { id: true },
  });
  assignmentId = assignment.id;

  publicId = `spacev2te${Math.floor(Math.random() * 9) + 1}`;
  await db.submission.create({
    data: { assignmentId, studentUserId: owner.id, publicId, status: "DRAFT", text: "first draft" },
  });

  ownerToken = await login(app, owner.email);
  peerToken = await login(app, peer.email);
  leaderToken = await login(app, leader.email);
  adminToken = await login(app, admin.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/submissions/:publicId", () => {
  it("returns the flattened detail to its owner", async () => {
    const res = await request(app)
      .get(`/api/v1/submissions/${publicId}`)
      .set("authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      publicId,
      status: "DRAFT",
      text: "first draft",
      assignmentId,
      assignmentTitle: "Essay",
      assignmentDescription: "Write it",
      studentUserId,
      studentName: "Test owner",
      files: [],
    });
    expect(res.body.data.seasonCode).toEqual(expect.any(String));
  });

  it("allows the student's group leader and the season admin", async () => {
    const asLeader = await request(app)
      .get(`/api/v1/submissions/${publicId}`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(asLeader.status).toBe(200);

    const asAdmin = await request(app)
      .get(`/api/v1/submissions/${publicId}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(asAdmin.status).toBe(200);
  });

  it("refuses a peer student in the same season", async () => {
    const res = await request(app)
      .get(`/api/v1/submissions/${publicId}`)
      .set("authorization", `Bearer ${peerToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("returns 404 for an unknown publicId", async () => {
    const res = await request(app)
      .get("/api/v1/submissions/doesnotexi")
      .set("authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("requires authentication", async () => {
    const res = await request(app).get(`/api/v1/submissions/${publicId}`);
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/v1/submissions/:publicId", () => {
  it("saves a draft without stamping submittedAt", async () => {
    const res = await request(app)
      .patch(`/api/v1/submissions/${publicId}`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ text: "second draft" });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ saved: true, submitted: false });

    const row = await db.submission.findUnique({
      where: { publicId },
      select: { text: true, status: true, submittedAt: true },
    });
    expect(row).toEqual({ text: "second draft", status: "DRAFT", submittedAt: null });
  });

  it("submits and stamps submittedAt", async () => {
    const res = await request(app)
      .patch(`/api/v1/submissions/${publicId}`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ text: "final", submit: true });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ saved: true, submitted: true });

    const row = await db.submission.findUnique({
      where: { publicId },
      select: { text: true, status: true, submittedAt: true },
    });
    expect(row?.status).toBe("SUBMITTED");
    expect(row?.submittedAt).toBeTruthy();
    expect(row?.text).toBe("final");
  });

  it("refuses a non-owner with 403 — including the season admin", async () => {
    // Reading a submission and editing one are different rights: an admin may
    // review but must never rewrite a student's words.
    const res = await request(app)
      .patch(`/api/v1/submissions/${publicId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ text: "tampered" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");

    const row = await db.submission.findUnique({ where: { publicId }, select: { text: true } });
    expect(row?.text).toBe("final");
  });

  it("returns 400 when text is missing", async () => {
    const res = await request(app)
      .patch(`/api/v1/submissions/${publicId}`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ submit: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("returns 404 for an unknown publicId", async () => {
    const res = await request(app)
      .patch("/api/v1/submissions/doesnotexi")
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ text: "x" });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd apps/backend && pnpm jest --runInBand src/__tests__/integration/submissions-routes.test.ts
```

Expected: FAIL — 404 on every request.

- [ ] **Step 4: Write the submissions router**

Create `apps/backend/src/routes/submissions.ts` — port of `jpc-space/src/app/api/v1/submissions/[publicId]/route.ts`:

```ts
import { Router } from "express";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { ForbiddenError } from "../lib/auth/errors";
import { canViewSubmission } from "../lib/permissions";
import { requireAuth, requireUser } from "../middleware/require-auth";
import { updateSubmissionRequestSchema } from "../../../../packages/shared/src/index";

export const submissionsRouter = Router();

submissionsRouter.use(requireAuth);

async function loadSubmissionForApi(publicId: string) {
  return db.submission.findUnique({
    where: { publicId },
    select: {
      id: true,
      publicId: true,
      status: true,
      text: true,
      feedback: true,
      submittedAt: true,
      reviewedAt: true,
      assignmentId: true,
      studentUserId: true,
      assignment: {
        select: {
          title: true,
          dueAt: true,
          description: true,
          seasonId: true,
          season: { select: { code: true } },
        },
      },
      studentUser: { select: { name: true, email: true } },
      files: {
        select: { id: true, originalName: true, storagePath: true, mimeType: true, sizeBytes: true },
        orderBy: { uploadedAt: "asc" },
      },
    },
  });
}

submissionsRouter.get("/:publicId", async (req, res) => {
  const user = requireUser(req);
  // publicId is an opaque 10-character string, not an integer — no parseId here.
  const { publicId } = req.params;

  const sub = await loadSubmissionForApi(publicId ?? "");
  if (!sub) return apiError(res, "not_found", "Submission not found.", 404);

  if (!(await canViewSubmission(user, sub.id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  return apiOk(res, {
    id: sub.id,
    publicId: sub.publicId,
    status: sub.status,
    text: sub.text,
    feedback: sub.feedback,
    submittedAt: sub.submittedAt,
    reviewedAt: sub.reviewedAt,
    assignmentId: sub.assignmentId,
    assignmentTitle: sub.assignment.title,
    assignmentDueAt: sub.assignment.dueAt,
    assignmentDescription: sub.assignment.description,
    seasonCode: sub.assignment.season.code,
    studentUserId: sub.studentUserId,
    studentName: sub.studentUser.name,
    studentEmail: sub.studentUser.email,
    files: sub.files,
  });
});

submissionsRouter.patch("/:publicId", async (req, res) => {
  const user = requireUser(req);
  const { publicId } = req.params;

  const sub = await db.submission.findUnique({
    where: { publicId: publicId ?? "" },
    select: { id: true, studentUserId: true, assignment: { select: { dueAt: true } } },
  });
  if (!sub) return apiError(res, "not_found", "Submission not found.", 404);
  // Only the author may edit. Season admins and leaders can read a submission
  // (canViewSubmission) but must never rewrite a student's words.
  if (sub.studentUserId !== user.userId) throw new ForbiddenError();

  const parsed = updateSubmissionRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid submission body.", 400);

  if (parsed.data.submit) {
    const now = new Date();
    await db.submission.update({
      where: { id: sub.id },
      data: { text: parsed.data.text, status: "SUBMITTED", submittedAt: now },
    });
  } else {
    await db.submission.update({
      where: { id: sub.id },
      data: { text: parsed.data.text, status: "DRAFT" },
    });
  }

  return apiOk(res, { saved: true, submitted: Boolean(parsed.data.submit) });
});
```

- [ ] **Step 5: Mount the router**

Modify `apps/backend/src/app.ts`:

```ts
import { submissionsRouter } from "./routes/submissions";
```

```ts
  app.use("/api/v1/submissions", submissionsRouter);
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd apps/backend && pnpm jest --runInBand src/__tests__/integration/submissions-routes.test.ts
```

Expected: PASS — 11 tests. The "refuses a non-owner" case proves the thrown-`ForbiddenError` path reaches the error handler as `403 forbidden`.

- [ ] **Step 7: Run the whole suite and the checks**

```bash
cd apps/backend && pnpm test:integration
```

```bash
pnpm turbo typecheck lint test:unit --filter=@space/backend --filter=@space/shared
```

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(backend): port submission detail and draft/submit endpoints"
```

---

### Task 11: Storage and submission file upload/delete

The last two endpoints, and the only ones that move bytes. `POST /submissions/:publicId/files` accepts a multipart upload, enforces the assignment's own size and MIME rules, writes through a storage driver, and records a `SubmissionFile` row. `DELETE` removes both.

**Files:**
- Modify: `apps/backend/src/lib/config.ts`
- Modify: `apps/backend/.env.example`
- Modify: `apps/backend/package.json`
- Create: `apps/backend/src/lib/storage/index.ts`
- Create: `apps/backend/src/lib/storage/local.ts`
- Create: `apps/backend/src/lib/storage/s3.ts`
- Create: `apps/backend/src/__tests__/storage.test.ts`
- Modify: `apps/backend/src/middleware/error-handler.ts`
- Modify: `apps/backend/src/routes/submissions.ts`
- Modify: `.gitignore`
- Test: `apps/backend/src/__tests__/integration/submission-files-routes.test.ts`

**Interfaces:**
- Produces, from `lib/storage/index.ts`:
  - `interface PutMeta { mime: string }`
  - `interface PutResult { path: string }`
  - `interface Storage { put(key: string, data: Buffer, meta: PutMeta): Promise<PutResult>; delete(path: string): Promise<void> }`
  - `getStorage(): Storage`
  - `buildStorageKey(parts: { bucket: string; publicId: string; originalName: string; date?: Date }): string`
- Produces, from `routes/submissions.ts`: two more handlers on the existing `submissionsRouter`.

**Scope trim from v1:** v1's `Storage` interface also declares `get()` and `url()`. Neither is reachable from the 16 endpoints — they serve `/api/uploads/[...path]`, which this port explicitly excludes. Leave them out; they land with the download route.

**Divergence from v1 — multipart parsing.** Next.js gives route handlers `request.formData()` natively. Express has no body parser for `multipart/form-data`, so this task adds `multer` with `memoryStorage()`. The consequence to understand: the whole file is buffered in memory before the handler sees it, so a hard ceiling is required or a single large upload can exhaust the process. `MAX_UPLOAD_BYTES` (default 25 MB) is that ceiling. It is a *backstop*, not the real limit — the per-assignment `maxFileSizeMb` check still runs afterwards, exactly as in v1, because that value is only knowable after the database lookup.

- [ ] **Step 1: Add the dependencies**

```bash
pnpm --filter @space/backend add multer && pnpm --filter @space/backend add -D @types/multer
```

- [ ] **Step 2: Extend the config schema**

Modify `apps/backend/src/lib/config.ts`. Add to `envSchema`:

```ts
  // "local" writes to LOCAL_UPLOADS_DIR; "s3" is stubbed and throws on use.
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  LOCAL_UPLOADS_DIR: z.string().default("./uploads"),
  // Hard ceiling on a single upload. multer buffers the whole file in memory
  // before the per-assignment maxFileSizeMb check can run, so this bounds what
  // one request can allocate. 25 MB.
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(25 * 1024 * 1024),
```

and to the exported `config` object:

```ts
  storageDriver: parsed.data.STORAGE_DRIVER,
  localUploadsDir: parsed.data.LOCAL_UPLOADS_DIR,
  maxUploadBytes: parsed.data.MAX_UPLOAD_BYTES,
```

Add all three keys to `apps/backend/.env.example` with their defaults and a one-line comment each.

- [ ] **Step 3: Ignore the uploads directory**

Add to `.gitignore`:

```
uploads/
```

The local driver writes real files under `apps/backend/uploads/` during the integration test. They must never be committed.

- [ ] **Step 4: Write the failing storage unit test**

Create `apps/backend/src/__tests__/storage.test.ts`:

```ts
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { buildStorageKey, getStorage } from "../lib/storage";
import { config } from "../lib/config";

const root = config.localUploadsDir;

afterAll(async () => {
  await rm(join(root, "test-bucket"), { recursive: true, force: true });
});

describe("buildStorageKey", () => {
  it("partitions by bucket, year and month and prefixes the public id", () => {
    const key = buildStorageKey({
      bucket: "submissions",
      publicId: "abc1234567",
      originalName: "essay.pdf",
      date: new Date("2026-03-09T00:00:00.000Z"),
    });
    expect(key).toBe("submissions/2026/03/abc1234567-essay.pdf");
  });

  it("sanitises the original name and caps its length", () => {
    const key = buildStorageKey({
      bucket: "submissions",
      publicId: "abc1234567",
      originalName: "../../etc/pa ss wd?.txt",
      date: new Date("2026-03-09T00:00:00.000Z"),
    });
    // Path separators and spaces collapse to underscores, so a crafted filename
    // cannot escape the bucket prefix.
    expect(key).toBe("submissions/2026/03/abc1234567-.._.._etc_pa_ss_wd_.txt");
    expect(key).not.toContain("/etc/");
  });
});

describe("LocalFsStorage", () => {
  it("round-trips a put and a delete", async () => {
    const storage = getStorage();
    const key = "test-bucket/2026/03/roundtrip.txt";

    const put = await storage.put(key, Buffer.from("hello"), { mime: "text/plain" });
    expect(put.path).toBe(key);
    await expect(readFile(join(root, key), "utf8")).resolves.toBe("hello");

    await storage.delete(key);
    await expect(readFile(join(root, key), "utf8")).rejects.toThrow();
  });

  it("treats deleting a missing file as a no-op", async () => {
    await expect(getStorage().delete("test-bucket/nope.txt")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

```bash
cd apps/backend && pnpm jest src/__tests__/storage.test.ts
```

Expected: FAIL — "Cannot find module '../lib/storage'".

- [ ] **Step 6: Write the storage modules**

Create `apps/backend/src/lib/storage/index.ts` — port of `jpc-space/src/lib/storage/index.ts`, trimmed to `put`/`delete` and reading `config` rather than `process.env`:

```ts
import { config } from "../config";

import { LocalFsStorage } from "./local";
import { S3Storage } from "./s3";

export interface PutMeta {
  mime: string;
}

export interface PutResult {
  path: string;
}

/**
 * Trimmed from v1's interface: get() and url() are omitted because nothing in
 * the /api/v1 surface reads a file back — that is /api/uploads/[...path], which
 * this port does not cover. They land with the download route.
 */
export interface Storage {
  put(key: string, data: Buffer, meta: PutMeta): Promise<PutResult>;
  delete(path: string): Promise<void>;
}

let cached: Storage | undefined;

export function getStorage(): Storage {
  if (cached) return cached;
  cached = config.storageDriver === "s3" ? new S3Storage() : new LocalFsStorage();
  return cached;
}

export function buildStorageKey(parts: {
  bucket: string;
  publicId: string;
  originalName: string;
  date?: Date;
}): string {
  const d = parts.date ?? new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  // Anything outside [A-Za-z0-9._-] collapses to "_", so a filename carrying
  // path separators cannot escape the bucket/date prefix.
  const safeName = parts.originalName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  return `${parts.bucket}/${yyyy}/${mm}/${parts.publicId}-${safeName}`;
}
```

Create `apps/backend/src/lib/storage/local.ts` — port of v1's, with `config` instead of `process.env` and without the unused methods:

```ts
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { config } from "../config";

import type { PutMeta, PutResult, Storage } from "./index";

export class LocalFsStorage implements Storage {
  private readonly root: string;

  constructor(root?: string) {
    this.root = path.resolve(root ?? config.localUploadsDir);
  }

  async put(key: string, data: Buffer, _meta: PutMeta): Promise<PutResult> {
    const fullPath = path.join(this.root, key);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data);
    return { path: key };
  }

  async delete(storagePath: string): Promise<void> {
    await unlink(path.join(this.root, storagePath)).catch((err: NodeJS.ErrnoException) => {
      // Deleting an already-absent file is the desired end state, not an error.
      if (err.code !== "ENOENT") throw err;
    });
  }
}
```

Create `apps/backend/src/lib/storage/s3.ts` — the same stub v1 ships, so switching drivers later is a one-file change:

```ts
import type { PutMeta, PutResult, Storage } from "./index";

// Stubbed S3 driver — wire up @aws-sdk/client-s3 when production storage is
// needed. Reads S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY,
// S3_ENDPOINT from the environment (add them to config.ts at that point).
export class S3Storage implements Storage {
  async put(_key: string, _data: Buffer, _meta: PutMeta): Promise<PutResult> {
    throw new Error("S3Storage.put not implemented — wire up @aws-sdk/client-s3 before enabling.");
  }

  async delete(_path: string): Promise<void> {
    throw new Error("S3Storage.delete not implemented.");
  }
}
```

- [ ] **Step 7: Run the storage test to verify it passes**

```bash
cd apps/backend && pnpm jest src/__tests__/storage.test.ts
```

Expected: PASS — 4 tests.

- [ ] **Step 8: Map multer's errors into the envelope**

Modify `apps/backend/src/middleware/error-handler.ts`. Add the import:

```ts
import { MulterError } from "multer";
```

and insert this branch alongside the other typed branches, before `console.error(err)`:

```ts
  // multer rejects an oversized or malformed upload before the route runs.
  // Without this it would fall through to a generic 500 and the client could
  // not tell a too-large file from a server fault.
  if (err instanceof MulterError) {
    const code = err.code === "LIMIT_FILE_SIZE" ? "file_too_large" : "bad_request";
    const message =
      err.code === "LIMIT_FILE_SIZE" ? "File exceeds the upload limit." : "Invalid upload.";
    apiError(res, code, message, 400);
    return;
  }
```

- [ ] **Step 9: Write the failing integration test**

Create `apps/backend/src/__tests__/integration/submission-files-routes.test.ts`:

```ts
import { rm } from "node:fs/promises";
import { resolve } from "node:path";

import request from "supertest";

import { createApp } from "../../app";
import { config } from "../../lib/config";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(30000);

const app = createApp();

let publicId: string;
let ownerToken: string;
let peerToken: string;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  const owner = await createTestUser("owner", "STUDENT");
  const peer = await createTestUser("peer", "STUDENT");

  await db.seasonEnrollment.createMany({
    data: [
      { seasonId: season.id, studentUserId: owner.id, status: "ACTIVE" },
      { seasonId: season.id, studentUserId: peer.id, status: "ACTIVE" },
    ],
  });

  const assignment = await db.assignment.create({
    data: {
      seasonId: season.id,
      title: "Upload one file",
      isAllGroups: true,
      maxFileSizeMb: 1,
      allowedMimeCategories: ["text", "image"],
    },
    select: { id: true },
  });

  publicId = `spacev2fi${Math.floor(Math.random() * 9) + 1}`;
  await db.submission.create({
    data: { assignmentId: assignment.id, studentUserId: owner.id, publicId, status: "DRAFT" },
  });

  ownerToken = await login(app, owner.email);
  peerToken = await login(app, peer.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
  // Remove whatever the local driver actually wrote during this run.
  await rm(resolve(config.localUploadsDir, "submissions"), { recursive: true, force: true });
});

describe("POST /api/v1/submissions/:publicId/files", () => {
  it("stores an allowed file and returns 201 with the row", async () => {
    const res = await request(app)
      .post(`/api/v1/submissions/${publicId}/files`)
      .set("authorization", `Bearer ${ownerToken}`)
      .attach("file", Buffer.from("hello world"), {
        filename: "notes.txt",
        contentType: "text/plain",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.file).toEqual({
      id: expect.any(Number),
      originalName: "notes.txt",
      mimeType: "text/plain",
      sizeBytes: 11,
    });

    const stored = await db.submissionFile.findFirst({
      where: { submission: { publicId } },
      select: { storagePath: true },
    });
    expect(stored?.storagePath).toMatch(/^submissions\/\d{4}\/\d{2}\/.+-notes\.txt$/);
  });

  it("rejects a MIME type the assignment does not allow", async () => {
    const res = await request(app)
      .post(`/api/v1/submissions/${publicId}/files`)
      .set("authorization", `Bearer ${ownerToken}`)
      .attach("file", Buffer.from("%PDF-1.4"), {
        filename: "paper.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("mime_not_allowed");
  });

  it("rejects a file over the assignment's size limit", async () => {
    // maxFileSizeMb is 1; send 2 MB. Under MAX_UPLOAD_BYTES, so this exercises
    // the per-assignment check rather than multer's backstop.
    const res = await request(app)
      .post(`/api/v1/submissions/${publicId}/files`)
      .set("authorization", `Bearer ${ownerToken}`)
      .attach("file", Buffer.alloc(2 * 1024 * 1024, 0x61), {
        filename: "big.txt",
        contentType: "text/plain",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("file_too_large");
  });

  it("returns 400 when no file part is present", async () => {
    const res = await request(app)
      .post(`/api/v1/submissions/${publicId}/files`)
      .set("authorization", `Bearer ${ownerToken}`)
      .field("notafile", "x");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("refuses a student who does not own the submission", async () => {
    const res = await request(app)
      .post(`/api/v1/submissions/${publicId}/files`)
      .set("authorization", `Bearer ${peerToken}`)
      .attach("file", Buffer.from("x"), { filename: "a.txt", contentType: "text/plain" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("returns 404 for an unknown submission", async () => {
    const res = await request(app)
      .post("/api/v1/submissions/doesnotexi/files")
      .set("authorization", `Bearer ${ownerToken}`)
      .attach("file", Buffer.from("x"), { filename: "a.txt", contentType: "text/plain" });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/v1/submissions/:publicId/files", () => {
  it("deletes the owner's file", async () => {
    const file = await db.submissionFile.findFirstOrThrow({
      where: { submission: { publicId } },
      select: { id: true },
    });

    const res = await request(app)
      .delete(`/api/v1/submissions/${publicId}/files?fileId=${file.id}`)
      .set("authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deleted: true });
    expect(await db.submissionFile.count({ where: { id: file.id } })).toBe(0);
  });

  it("returns 400 for a missing or non-numeric fileId", async () => {
    const res = await request(app)
      .delete(`/api/v1/submissions/${publicId}/files`)
      .set("authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("returns 404 for a fileId that does not exist", async () => {
    const res = await request(app)
      .delete(`/api/v1/submissions/${publicId}/files?fileId=2147483000`)
      .set("authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 10: Run it to verify it fails**

```bash
cd apps/backend && pnpm jest --runInBand src/__tests__/integration/submission-files-routes.test.ts
```

Expected: FAIL — 404 on the `/files` paths.

- [ ] **Step 11: Add the two handlers**

Modify `apps/backend/src/routes/submissions.ts` — port of `jpc-space/src/app/api/v1/submissions/[publicId]/files/route.ts`. Add the imports:

```ts
import multer from "multer";

import { config } from "../lib/config";
import { newPublicId } from "../lib/public-id";
import { buildStorageKey, getStorage } from "../lib/storage";
```

and append:

```ts
// memoryStorage: the per-assignment size and MIME rules live in the database,
// so the file has to be in hand before they can be applied. limits.fileSize is
// the process-level backstop that keeps one request from exhausting memory
// before that check can run.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
});

const MIME_CATEGORY_MAP: Record<string, RegExp> = {
  image: /^image\//,
  pdf: /^application\/pdf$/,
  doc: /^(application\/msword|application\/vnd\.openxmlformats-officedocument\..*|application\/vnd\.oasis\.opendocument\..*)$/,
  audio: /^audio\//,
  video: /^video\//,
  text: /^text\//,
};

function mimeAllowed(mime: string, categories: string[]): boolean {
  // An assignment with no declared categories accepts anything.
  if (categories.length === 0) return true;
  return categories.some((c) => MIME_CATEGORY_MAP[c]?.test(mime) ?? false);
}

submissionsRouter.post("/:publicId/files", upload.single("file"), async (req, res) => {
  const user = requireUser(req);
  const { publicId } = req.params;

  const sub = await db.submission.findUnique({
    where: { publicId: publicId ?? "" },
    select: {
      id: true,
      studentUserId: true,
      assignment: { select: { maxFileSizeMb: true, allowedMimeCategories: true } },
    },
  });
  if (!sub) return apiError(res, "not_found", "Submission not found.", 404);
  if (sub.studentUserId !== user.userId) throw new ForbiddenError();

  const file = req.file;
  if (!file) return apiError(res, "bad_request", "No file provided.", 400);

  const maxMb = sub.assignment.maxFileSizeMb;
  if (maxMb && file.size > maxMb * 1024 * 1024) {
    return apiError(res, "file_too_large", `File exceeds ${maxMb} MB.`, 400);
  }
  if (!mimeAllowed(file.mimetype, sub.assignment.allowedMimeCategories)) {
    return apiError(res, "mime_not_allowed", `File type ${file.mimetype} not allowed.`, 400);
  }

  const key = buildStorageKey({
    bucket: "submissions",
    publicId: newPublicId(),
    originalName: file.originalname,
  });
  const put = await getStorage().put(key, file.buffer, { mime: file.mimetype });

  const created = await db.submissionFile.create({
    data: {
      submissionId: sub.id,
      originalName: file.originalname,
      storagePath: put.path,
      mimeType: file.mimetype || "application/octet-stream",
      sizeBytes: file.size,
    },
    select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
  });

  return apiOk(res, { file: created }, 201);
});

submissionsRouter.delete("/:publicId/files", async (req, res) => {
  const user = requireUser(req);
  const { publicId } = req.params;

  const fileId = parseId(typeof req.query.fileId === "string" ? req.query.fileId : undefined);
  if (fileId === null) return apiError(res, "bad_request", "Invalid fileId.", 400);

  const file = await db.submissionFile.findUnique({
    where: { id: fileId },
    select: { storagePath: true, submission: { select: { publicId: true, studentUserId: true } } },
  });
  // The publicId in the path must match the file's own submission, or a
  // fileId alone would let a caller probe files across submissions.
  if (!file || file.submission.publicId !== publicId) {
    return apiError(res, "not_found", "File not found.", 404);
  }
  if (file.submission.studentUserId !== user.userId) throw new ForbiddenError();

  // Storage first, then the row. A failed unlink must not leave a database row
  // pointing at a file the user believes is gone, so the delete is swallowed —
  // an orphaned blob is recoverable, an orphaned row is not.
  await getStorage()
    .delete(file.storagePath)
    .catch(() => undefined);
  await db.submissionFile.delete({ where: { id: fileId } });

  return apiOk(res, { deleted: true });
});
```

Add `parseId` to the imports at the top of the file:

```ts
import { parseId } from "../lib/parse-id";
```

**Note on v1 parity:** v1 reads `fileId` from `new URL(request.url).searchParams`. Express exposes the same value as `req.query.fileId`, typed as `string | string[] | ParsedQs`. The `typeof === "string"` narrowing is what stops a repeated `?fileId=1&fileId=2` (which arrives as an array) from reaching `Number()`.

- [ ] **Step 12: Run the test to verify it passes**

```bash
cd apps/backend && pnpm jest --runInBand src/__tests__/integration/submission-files-routes.test.ts
```

Expected: PASS — 9 tests.

- [ ] **Step 13: Confirm no upload artefacts are staged**

```bash
git status --short
```

Expected: no `uploads/` entries. If any appear, Step 3's `.gitignore` change did not take — fix it before committing.

- [ ] **Step 14: Run the whole suite and the checks**

```bash
cd apps/backend && pnpm test:integration
```

```bash
pnpm turbo typecheck lint test:unit --filter=@space/backend --filter=@space/shared
```

- [ ] **Step 15: Commit**

```bash
git add -A && git commit -m "feat(backend): port submission file upload and delete"
```

---

### Task 12: Whole-surface verification and documentation

Every endpoint now exists. This task proves the assembled service actually runs — the compiled one, not just the test harness — and brings the docs in line.

**Files:**
- Modify: `CLAUDE.md`
- Modify: `apps/backend/README.md` (create it if absent)
- Modify: `docs/superpowers/specs/2026-08-20-space-v2-monorepo-design.md`

- [ ] **Step 1: Run everything from the repo root**

```bash
pnpm turbo build lint typecheck test:unit test:integration
```

Expected: every task succeeds. Paste the real captured summary.

- [ ] **Step 2: Boot the compiled server**

The single failure this port is most exposed to is a bare `@space/shared` specifier surviving into `dist/`, which typechecks and passes tests and then crashes at boot. Test output cannot catch it. Run the build output:

```bash
node apps/backend/dist/apps/backend/src/server.js
```

Expected: the listening line, no `ERR_MODULE_NOT_FOUND`. Leave it running for Step 3.

- [ ] **Step 3: Curl every endpoint against the running server**

With the server from Step 2 still up, log in as a real staging account and walk the surface. Write the script to `apps/backend/scripts/smoke.sh` so it is repeatable, and have it read credentials from the environment rather than embedding them:

```bash
#!/usr/bin/env bash
# Smoke-test every /api/v1 endpoint against a running server.
# Usage: SMOKE_EMAIL=... SMOKE_PASSWORD=... ./scripts/smoke.sh
set -euo pipefail
BASE="${BASE:-http://localhost:4000}"

TOKENS=$(curl -sS -X POST "$BASE/api/v1/auth/login" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$SMOKE_EMAIL\",\"password\":\"$SMOKE_PASSWORD\"}")
ACCESS=$(node -e "process.stdout.write(JSON.parse(process.argv[1]).data.accessToken)" "$TOKENS")
REFRESH=$(node -e "process.stdout.write(JSON.parse(process.argv[1]).data.refreshToken)" "$TOKENS")

hit() { # method path
  printf '%-6s %-48s -> ' "$1" "$2"
  curl -sS -o /dev/null -w '%{http_code}\n' -X "$1" "$BASE$2" -H "authorization: Bearer $ACCESS"
}

hit GET /health
hit GET /api/v1/me
hit GET /api/v1/seasons
SEASON=$(curl -sS "$BASE/api/v1/seasons" -H "authorization: Bearer $ACCESS" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>process.stdout.write(String(JSON.parse(d).data.seasons[0]?.id ?? '')))")
if [ -n "$SEASON" ]; then
  hit GET "/api/v1/seasons/$SEASON"
  hit GET "/api/v1/seasons/$SEASON/groups"
  hit GET "/api/v1/seasons/$SEASON/sessions"
  hit GET "/api/v1/seasons/$SEASON/assignments"
else
  echo "no seasons visible to this account — season-scoped paths not exercised"
fi

# Negative checks: the envelope must hold on the error paths too.
printf '%-6s %-48s -> ' GET '/api/v1/seasons/abc (expect 400)'
curl -sS -o /dev/null -w '%{http_code}\n' "$BASE/api/v1/seasons/abc" -H "authorization: Bearer $ACCESS"
printf '%-6s %-48s -> ' GET '/api/v1/me (no token, expect 401)'
curl -sS -o /dev/null -w '%{http_code}\n' "$BASE/api/v1/me"
printf '%-6s %-48s -> ' GET '/api/v1/nope (expect 404)'
curl -sS -o /dev/null -w '%{http_code}\n' "$BASE/api/v1/nope" -H "authorization: Bearer $ACCESS"

curl -sS -o /dev/null -X POST "$BASE/api/v1/auth/logout" \
  -H 'content-type: application/json' -d "{\"refreshToken\":\"$REFRESH\"}"
echo "logged out"
```

Run it and paste the real output. Expected: `200` for `/health`, `/me`, `/seasons`, and each season-scoped path the account can see; `400`, `401`, `404` for the three negative checks. **Never paste the token values or the credentials** — the script prints status codes only, keep it that way.

If any season-scoped path is skipped because the account sees no seasons, say so explicitly in the report rather than presenting the run as full coverage.

- [ ] **Step 4: Stop the server and confirm the database is clean**

Ctrl-C the server, then:

```bash
cd apps/backend && node -e "require('ts-node').register({transpileOnly:true});const {db}=require('./src/db/client');(async()=>{for (const m of ['season','user']) console.log(m, await db[m].count({where:m==='season'?{code:{startsWith:'space-v2-test-'}}:{email:{startsWith:'space-v2-test-'}}}));await db.\$disconnect();})()"
```

Expected: `season 0` and `user 0`.

- [ ] **Step 5: Write the backend README**

Create or update `apps/backend/README.md` with:
- The full endpoint table from this plan's Scope section, as the API reference.
- The environment table: `DATABASE_URL`, `AUTH_SECRET`, `PORT`, `NODE_ENV`, `TRUST_PROXY`, `MOBILE_APP_ORIGIN`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `AUTH_URL`, `STORAGE_DRIVER`, `LOCAL_UPLOADS_DIR`, `MAX_UPLOAD_BYTES` — which are required, which have defaults, and what happens when the optional ones are unset.
- A "Running the tests" section noting `test:integration` hits the shared staging database and that fixtures are prefix-scoped to `space-v2-test-`.
- The known gap: submission files can be uploaded and deleted but not **downloaded** — `/api/uploads/[...path]` is still v1-only.

- [ ] **Step 6: Update `CLAUDE.md`**

Add to the Docs section:

```
- API port plan: `docs/superpowers/plans/2026-08-20-space-v2-api-port.md`
```

Add a short "API surface" section stating that `apps/backend` now serves all of v1's `/api/v1`, that `src/routes/` mirrors v1's route tree, and that authorization goes through `lib/rbac.ts` (pure predicates) and `lib/permissions.ts` (database gates). Note the `newPublicId` divergence — no `nanoid`, because this backend is CommonJS — so nobody "restores" it later.

- [ ] **Step 7: Update the design spec**

In `docs/superpowers/specs/2026-08-20-space-v2-monorepo-design.md`, the Scope section says the first pass covers "one vertical slice — login". Add a dated note recording that the remaining `/api/v1` endpoints landed in this second pass, and that what is still outstanding is the mobile screens and the file-download route. Do not rewrite the original scope statement — it was accurate for the pass it described.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "docs: record the completed /api/v1 port and its environment surface"
```

- [ ] **Step 9: Report**

Summarise for the user: the endpoints now live in v2, the test counts, the smoke-test result, and the two things still outstanding — the mobile screens, and the file-download route that submissions still depend on v1 for.

---

## Self-Review

Checked against `docs/superpowers/specs/2026-08-20-space-v2-monorepo-design.md`:

- **"Authorization middleware resolves the global `UserRole` and the scoped `SeasonAdmin`/`GroupLeader` join rows, mirroring v1's `lib/rbac.ts`"** — Task 1 (`requireAuth`) and Task 2 (`rbac.ts` + `permissions.ts`).
- **"Response envelope ported from v1's `lib/api/response.ts`"** — already in place; Task 1 extends it to `forbidden`/`unauthorized`, Task 11 to multer failures.
- **"`services/` appears when the non-auth endpoints land"** — **deliberate deviation.** The spec anticipated a `services/` layer. The ported handlers are thin: parse, gate, query, shape. Interposing a service layer would mean rewriting rather than porting, and rewriting is what loses behaviour. Query logic that is genuinely shared lives in `lib/queries/`. Revisit when an endpoint gains logic v1 did not have.
- **"Ported near-verbatim from v1"** — every task names its v1 source file and requires reading it first; divergences are enumerated per task and commented in code.
- **Endpoint coverage** — all 16 route files across Tasks 1, 3, 4, 5, 6, 8, 9, 10, 11. Cross-checked against the Scope table.

Type consistency spot-checks:
- `SessionUser` is declared once, in `lib/auth/tokens.ts`; `rbac.ts` and `permissions.ts` import it (Task 2).
- `loadAttendanceRoster` returns `AttendanceRosterEntry[] | null` in Task 5 and is null-checked in Task 8.
- `loadAssignmentById` returns `AssignmentDetailData | null` in Task 6 and is null-checked in the same task.
- `Storage` is declared with `put`/`delete` only (Task 11) and both drivers implement exactly that pair.
- `parseId` accepts `string | undefined` (Task 2), matching `req.params.x` under `noUncheckedIndexedAccess` and the narrowed `req.query.fileId` in Task 11.

Known gaps recorded rather than silently dropped:
- No download route for submission files. Uploading works; reading a file back still requires v1.
- The S3 driver is a throwing stub, as in v1.
- Notification email is best-effort and disabled without Gmail credentials; in-app notifications are unconditional.
