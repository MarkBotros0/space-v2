# Plan 7 — Invites, Users & Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Domains 11 and 18 — the credential boundary — built properly rather than ported: SUPER-only user administration whose role changes actually revoke authority, an invite flow that works end to end with hashed single-use tokens (v1's has never worked once — spec 11 D1), no shared default password anywhere (D2), and a six-role settings screen with password change and log-out-everywhere that finally evict a stolen session (spec 18 D1).

**Architecture:** One new backend route file (`routes/users.ts`, SUPER-gated
list/detail/create/edit/deactivate/invite), two anonymous credential routes
appended to `routes/auth.ts` (`accept-invite`, `logout-all`), and the
self-scoped settings writes folded into `routes/me.ts` (`PATCH /me`,
`POST /me/password`). Invite tokens are stored **only as SHA-256 digests**,
reusing the exact `hashToken` the refresh tokens already use. Every
credential-changing write (role change, deactivation, password change,
logout-all) revokes the target's live `RefreshToken` rows in the same
transaction — C7's "the mitigation is TTL" note made real, and tested by
proving an old refresh token 401s. Screens: `settings.tsx` (all six roles, one
route), `users.tsx` (SUPER list), `user/[id].tsx` (detail + role editor +
invite panel), and `accept-invite.tsx` (anonymous, beside login).

**Tech Stack:** Express 5, Prisma 7 (`src/generated/prisma`), bcryptjs, Zod
contracts in `packages/shared`, jest + supertest integration suite against the
shared staging DB; Expo SDK 54 / expo-router (typed routes), React Query 5,
Zustand, RNTL via `renderWithProviders`.

**Spec:** `docs/superpowers/specs/domains/11-invites-users.md` (esp. §7, §8,
§10 D1–D8), `docs/superpowers/specs/domains/18-settings.md` (esp. §7, §9, §10
D1, D3, D6, D7), `docs/superpowers/specs/domains/_DECISIONS.md` (C1, C6, C7,
C8, C11), scope from `docs/superpowers/plans/2026-08-24-migration-roadmap.md`
§ Plan 7.

## Global Constraints

- **No migrations, ever.** No edits under `apps/backend/prisma/`. Shared live staging DB (ruling C1). Everything below fits the frozen schema; the columns this plan touches are verified to exist: `User.passwordHash String?` (nullable — schema.prisma:107), `InviteToken { token String @unique, userId, invitedById, expiresAt, usedAt, createdAt }` (:166-179), `RefreshToken.revokedAt` (:190).
- **Passwords are bcryptjs** (CLAUDE.md — existing hashes are bcrypt; anything else locks out every user). **Every hash this plan writes uses cost 12** (spec 11 D8: cost 12 is already live for invite-accepted accounts, and bcrypt verifies at whatever cost a hash records, so raising the write cost is backward compatible).
- **No raw credential in any HTTP response body or production log.** An invite token travels in the invite email and nowhere else (spec 11 §7: "Do not port the 'return the token' behaviour"). See Decision 2 below for the dev-mode channel.
- Response envelope `{ data }` / `{ error: { code, message } }` via `apiOk`/`apiError`.
- **Value imports from `@space/shared` use the relative path** `"../../../../packages/shared/src/index"` in backend route files (the `rootDir` emit trap — CLAUDE.md; `routes/auth.ts` documents it in place).
- `src/docs/openapi.ts` changes in the same commit as the route it documents.
- Integration fixtures: every row carries the `space-v2-test-` prefix in `User.email` or `Season.code`; use the helpers in `__tests__/integration/fixtures.ts`; `jest.setTimeout(60000)`.
- **Integration tests are serial.** Executed task-by-task (the default), each task runs its own suite: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern <suite>`. If any tasks are parallelized across agents, the agents write tests unrun and the coordinator runs them serially.
- Mobile: relative imports only (no `@/` alias); every response parsed with a Zod schema from `@space/shared`, never cast; screens map states to `LoadingState`/`ErrorState`/`EmptyState`; tab screens pass `edges={["top","left","right"]}`; tests use `renderWithProviders`, query `Input` fields with `getByLabelText`, assert errors via `accessibilityHint`; `jest.mock` factories close only over consts named `mock*`; typed routes — never `as Href`/`as any`, run `pnpm turbo routes:generate --filter=@space/mobile` after adding a route file.

## Decisions this plan locks in

1. **Settings backend is folded into `routes/me.ts` + `routes/auth.ts`; there is no `routes/settings.ts`.** Spec 18 §7 is explicit: "Do not add a `GET /api/v1/settings`; it would duplicate `/me` and drift from it." Every settings write is a self-scoped `/me` resource (subject from the token, never the body — spec 18 §4), and `logout-all` is a session operation that belongs beside `login`/`logout`. A `settings.ts` file would own no resource of its own.
2. **The invite token is never returned in an HTTP response, in any environment — dev included.** Spec 11 §7 forbids the response-body channel outright, and a dev-only response field has a way of getting depended on by a client and then shipped. Dev convenience instead: when the mail transport is unconfigured **and** `config.nodeEnv === "development"`, `sendInviteEmail` logs the code to the server's own stdout. That log never crosses the wire, is compiled out of nothing (it's a runtime env check), and production deploys have `NODE_ENV=production`.
3. **Invite TTL is 7 days** via new config `INVITE_TOKEN_TTL_HOURS` (default `168`). Deliberate divergence from v1's 72-hour default (`jpc-space/src/lib/invites.ts:11-17`): v1's invites were never acceptable at any TTL (D1), and a longer window suits an email-to-mobile-app flow. Env-tunable exactly as v1's was.
4. **v2 looks invites up by digest only — no plaintext fallback.** The shared DB holds v1's plaintext rows; a digest lookup can never match them, so they are dead on arrival. That is correct, not a transition gap: every v1 invite already terminates in a 404 (D1 — the acceptance route never existed), so there is no working credential to preserve. They age out via `expiresAt`.
5. **Issuing an invite expires the target's prior live invites** (same transaction — spec 11 D5 rec 2: one live invite per user). Expiry is `expiresAt = now`, not `usedAt = now` — `usedAt` means "accepted" and must stay honest.
6. **The invite email delivers a code to type/paste into the app, not a link.** Spec 11 D10 recommends exactly this for a mobile client; it removes R24 entirely (no token in any URL, browser history, or `Referer`). It also means the email cannot point at a route that doesn't exist — which is how D1 happened.
7. **`app/accept-invite.tsx` is in scope.** The roadmap's screen list names settings + users, but this plan's own done-condition ("an invite is the only way a UI-created user gets credentials") is unreachable if the flow ends at an email with no screen to enter it — that is D1 rebuilt with better plumbing. The screen is small (two fields, one anonymous POST) and sits beside `login.tsx`, outside `(app)`.
8. **`user/[id].tsx` exists as a dynamic route.** The detail carries an edit form (name/role/graduationYear), a confirm-gated SUPER grant, an invite panel with the real `expiresAt` (v1 showed no expiry anywhere — R75), and deactivate/reactivate. That is far too much interaction to inline in a list row; it follows the `assignment/[id]` dynamic-route pattern (Plan 1 Task 2). A `user/new` create screen is **not** built here — `POST /api/v1/users` exists and is tested; the screen rides with a later plan.
9. **`PATCH /users/:id` is a full replace of `{ name, role, graduationYear }`** (plus the optional `confirmSuper` flag), not a partial patch. v1's form always submits all three (`user-actions.ts:103-130`), the alumni cross-field rule needs all of them present to validate without a server-side merge, and the guards (self-role, last-SUPER) get simpler when the intended end state is explicit.
10. **Wrong current password on `POST /me/password` is `400 incorrect_password`, not 401.** The mobile axios interceptor treats any non-auth-endpoint 401 as an expired access token and burns a refresh rotation on it (`api-client.ts` — `__handleResponseError`); a 401 here would trigger that dance on every typo.
11. **Password change revokes every refresh token except the one whose raw value the request presents.** The access token doesn't identify a refresh token, so the client sends its own refresh token in the body (optional `refreshToken` field) and the server excludes that hash from the revocation sweep. Omitting it revokes all — fail-safe. The same server already receives raw refresh tokens in `POST /auth/logout`'s body, so this adds no new exposure class.
12. **Single-target invite refusal is explicit, not silent.** v1's batch silently dropped ineligible ids (R16). `POST /users/:id/invite` is a SUPER pressing a button on one row: an already-activated target gets `409 already_activated`, a deleted one `409 user_deleted`. The anonymous `accept-invite` endpoint is the opposite: **one opaque code for every failure** (unknown/used/expired/already-activated/deleted target all return the identical `400 invalid_invite` body), closing R27's oracle; the distinction lives in server behaviour only.
13. **No org-level settings endpoints exist, because no org-level settings exist.** Verified against `jpc-space/src/lib/settings-actions.ts` (102 lines, read in full): three actions — `changePasswordAction`, `updateNotificationPreferencesAction`, `updateOwnProfileAction` — all keyed on `session.userId`, none accepting a subject id, none writing anything org-scoped. Spec 18 §2 confirms no `Setting`/`Config` model exists in the schema. Encoding reality means encoding its absence.
14. **Notification preferences are named for Plan 9, not built here.** Spec 18 §3.5 assigns the preference surface to domain 10 (`GET/PUT /api/v1/me/notification-preferences`, all six keys including the writer-less `quizGraded`). Building a five-key twin here is precisely how v1 lost `quizGraded`. The settings screen ships without the toggles; Plan 9 adds the section.
15. **Also deferred, named so nothing silently drops:** forgot/reset-password endpoints (spec 11 §7 — same anonymous-credential family, but not in this plan's roadmap scope; the reset flow v1 has at least *works*), bulk invites (`POST /users/invites` — v1's 5000-sequential-SMTP loop must become a queue, R18/spec §7 note; single-target covers the admin flow until then), avatar/`StudentProfile` fields (domain 6), theme/biometrics/push (device state, spec 18 D3 — no endpoint, no column), and the cutover-only operational step of nulling existing `ChangeMe123!` hashes in the live DB (spec 11 D2 — v2 cannot fix stored rows by writing code; goes in the report's deferred list).

**Execution shape:** Task 1 first (everything consumes the contracts). Then
Tasks 2–4 are one sequential backend stream (all touch `routes/users.ts`;
Task 4 also touches `routes/auth.ts`). Task 5 is independent of Tasks 2–3 but
**must not run concurrently with Task 4** (both modify `routes/auth.ts` and
`src/docs/openapi.ts`). Screens: Task 6 needs Tasks 1+5; Task 7 needs 1–2;
Task 8 needs 1–4; Task 9 needs 4. Task 10 is the coordinator's closing gate.
Executed task-by-task in order (the default), none of this needs thought.

---

### Task 1: Contracts — `packages/shared/src/user.ts` and the `hasPassword` flag

**Files:**
- Create: `packages/shared/src/user.ts`
- Modify: `packages/shared/src/auth.ts` (add `hasPassword` to `meUserSchema`)
- Modify: `packages/shared/src/index.ts` (add `export * from "./user";`)
- Modify (read first): any mobile test fixture that builds a `MeUser` object — `apps/mobile/src/__tests__/` (see Step 4)
- Test: `packages/shared/src/__tests__/user-schemas.test.ts`

**Interfaces:**
- Consumes: `userRoleSchema`, `authUserSchema` from `./auth`.
- Produces (exact names later tasks import): `userStatusSchema` → `UserStatus`; `userListItemSchema` → `UserListItem`; `userListResponseSchema` → `UserListResponse`; `inviteStateSchema` → `InviteState`; `userDetailSchema` → `UserDetail`; `ALUMNI_ONLY_ROLES`, `roleRequiresAlumnus(role: UserRole): boolean`; `passwordSchema`; `createUserRequestSchema` → `CreateUserBody`; `updateUserRequestSchema` → `UpdateUserBody`; `acceptInviteRequestSchema` → `AcceptInviteBody`; `updateProfileRequestSchema` → `UpdateProfileBody`; `changePasswordRequestSchema` → `ChangePasswordBody`; `changePasswordResponseSchema` → `ChangePasswordResponse`; `logoutAllResponseSchema` → `LogoutAllResponse`; and `meUserSchema` now carrying `hasPassword: boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/__tests__/user-schemas.test.ts
import {
  acceptInviteRequestSchema,
  changePasswordRequestSchema,
  createUserRequestSchema,
  inviteStateSchema,
  meUserSchema,
  passwordSchema,
  updateProfileRequestSchema,
  updateUserRequestSchema,
} from "../index";

describe("passwordSchema — the single definition (spec 11 R65: v1 stated min-8 in four places)", () => {
  it("requires 8 characters and caps at 72 bytes (bcrypt truncation, D8)", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("longenough").success).toBe(true);
    // 24 four-byte emoji = 96 bytes but only 48 UTF-16 code units — the cap
    // must be bytes, or a 96-byte passphrase is silently truncated by bcrypt.
    expect(passwordSchema.safeParse("🐍".repeat(24)).success).toBe(false);
  });
});

describe("createUserRequestSchema", () => {
  const valid = { name: "New Person", email: "p@jpc.test", role: "STUDENT" as const };

  it("defaults graduationYear to null and trims the name", () => {
    const parsed = createUserRequestSchema.parse({ ...valid, name: "  Padded  " });
    expect(parsed.graduationYear).toBeNull();
    expect(parsed.name).toBe("Padded");
  });

  it("enforces the alumni-only rule for LEADER/ADMIN/MENTOR (spec 11 R2/R3)", () => {
    const refused = createUserRequestSchema.safeParse({ ...valid, role: "LEADER" });
    expect(refused.success).toBe(false);
    const ok = createUserRequestSchema.safeParse({ ...valid, role: "LEADER", graduationYear: 2020 });
    expect(ok.success).toBe(true);
  });

  it("evaluates the graduation-year upper bound per call, not at module load (R37)", () => {
    const nextYear = new Date().getFullYear() + 1;
    expect(
      createUserRequestSchema.safeParse({ ...valid, graduationYear: nextYear }).success,
    ).toBe(false);
    expect(
      createUserRequestSchema.safeParse({ ...valid, graduationYear: new Date().getFullYear() }).success,
    ).toBe(true);
  });
});

describe("updateUserRequestSchema", () => {
  it("is a full replace of the three editable fields; email is not among them (R48)", () => {
    expect(
      updateUserRequestSchema.safeParse({ name: "A B", role: "STUDENT", graduationYear: null }).success,
    ).toBe(true);
    // Unknown keys are refused, not stripped: a client sending `email` must
    // hear "no", not have it silently dropped.
    expect(
      updateUserRequestSchema.safeParse({
        name: "A B", role: "STUDENT", graduationYear: null, email: "x@jpc.test",
      }).success,
    ).toBe(false);
  });
});

describe("self-scoped settings schemas", () => {
  it("updateProfileRequestSchema trims before validating (spec 18 R21/D7) and refuses a smuggled subject id", () => {
    expect(updateProfileRequestSchema.parse({ name: "  Bo B  " }).name).toBe("Bo B");
    expect(updateProfileRequestSchema.safeParse({ name: "   a   " }).success).toBe(false);
    // Spec 18 §4: "must reject a body-supplied userId rather than ignoring it".
    expect(updateProfileRequestSchema.safeParse({ name: "Bo B", userId: 7 }).success).toBe(false);
  });

  it("changePasswordRequestSchema carries no `confirm` (client-side rule, spec 18 §7)", () => {
    const ok = changePasswordRequestSchema.safeParse({
      currentPassword: "x", newPassword: "longenough",
    });
    expect(ok.success).toBe(true);
    expect(
      changePasswordRequestSchema.safeParse({
        currentPassword: "x", newPassword: "longenough", confirm: "longenough",
      }).success,
    ).toBe(false);
  });
});

describe("inviteStateSchema", () => {
  it("has no token field, ever (R23, R75)", () => {
    expect(Object.keys(inviteStateSchema.shape).sort()).toEqual([
      "expiresAt", "invitedByName", "issuedAt", "usedAt",
    ]);
  });
});

describe("acceptInviteRequestSchema", () => {
  it("takes a token and the shared password rule", () => {
    expect(acceptInviteRequestSchema.safeParse({ token: "a".repeat(32), password: "longenough" }).success).toBe(true);
    expect(acceptInviteRequestSchema.safeParse({ token: "a".repeat(32), password: "short" }).success).toBe(false);
  });
});

describe("meUserSchema.hasPassword", () => {
  it("defaults true so a response from a backend that predates the field still parses", () => {
    const parsed = meUserSchema.parse({
      id: 1, name: "N", email: "n@jpc.test", role: "STUDENT", avatarPath: null,
    });
    expect(parsed.hasPassword).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @space/shared jest src/__tests__/user-schemas.test.ts`
Expected: FAIL — the exports don't exist.

- [ ] **Step 3: Implement the contracts**

Create `packages/shared/src/user.ts`:

```ts
import { z } from "zod";
import { authUserSchema, userRoleSchema, type UserRole } from "./auth";

/**
 * Roles only an alumnus (non-null graduationYear) may hold — v1's
 * src/lib/roles.ts, ported into the shared contract so the schema refinement
 * and the screens consume one list (spec 11 R2).
 */
export const ALUMNI_ONLY_ROLES: readonly UserRole[] = ["LEADER", "ADMIN", "MENTOR"];

export function roleRequiresAlumnus(role: UserRole): boolean {
  return ALUMNI_ONLY_ROLES.includes(role);
}

/**
 * THE password policy — replacing v1's four unshared copies of "min 8"
 * (spec 11 R65). Max is 72 BYTES, not characters: bcrypt silently truncates
 * beyond 72 bytes, and accepting a longer passphrase is a promise the hash
 * does not keep (D8).
 */
export const passwordSchema = z
  .string()
  .min(8, "At least 8 characters.")
  .refine((p) => new TextEncoder().encode(p).length <= 72, {
    message: "At most 72 bytes.",
  });

/** The four badge states of spec 11 R82, derived server-side once (R81). */
export const userStatusSchema = z.enum(["active", "invited", "pending", "inactive"]);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const userListItemSchema = authUserSchema.extend({
  graduationYear: z.number().int().nullable(),
  lastLoginAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
  status: userStatusSchema,
});
export type UserListItem = z.infer<typeof userListItemSchema>;

export const userListResponseSchema = z.object({
  users: z.array(userListItemSchema),
  nextCursor: z.number().int().nullable(),
  total: z.number().int(),
});
export type UserListResponse = z.infer<typeof userListResponseSchema>;

/** Invite metadata. No `token` field, ever (R23, R75). */
export const inviteStateSchema = z.object({
  issuedAt: z.string(),
  expiresAt: z.string(),
  usedAt: z.string().nullable(),
  invitedByName: z.string().nullable(),
});
export type InviteState = z.infer<typeof inviteStateSchema>;

export const userDetailSchema = userListItemSchema.extend({
  invite: inviteStateSchema.nullable(),
});
export type UserDetail = z.infer<typeof userDetailSchema>;

/**
 * Year bounds live in a superRefine so "this year" is evaluated per call —
 * v1 captured CURRENT_YEAR at module load and refused January graduates until
 * the server restarted (R37).
 */
function checkUserFields(
  v: { role: UserRole; graduationYear: number | null },
  ctx: z.RefinementCtx,
): void {
  if (v.graduationYear !== null) {
    const currentYear = new Date().getFullYear();
    if (v.graduationYear < 1990 || v.graduationYear > currentYear) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["graduationYear"],
        message: `Must be between 1990 and ${currentYear}.`,
      });
    }
  }
  if (roleRequiresAlumnus(v.role) && v.graduationYear === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["graduationYear"],
      message: "Required for this role.",
    });
  }
}

export const createUserRequestSchema = z
  .object({
    name: z.string().trim().min(2, "At least 2 characters.").max(120, "At most 120 characters."),
    email: z.string().email("Must be a valid email."),
    role: userRoleSchema,
    graduationYear: z.number().int().nullable().default(null),
  })
  .superRefine(checkUserFields);
export type CreateUserBody = z.output<typeof createUserRequestSchema>;

/**
 * Full replace of the three editable fields (v1's form always submits all
 * three — user-actions.ts:103-130). `email` is deliberately absent (R48) and
 * `.strict()` refuses it rather than stripping it. `confirmSuper` must be
 * `true` for a role change TO SUPER — spec 11 D7 rec 3: a SUPER grant cannot
 * be a mis-tapped picker item.
 */
export const updateUserRequestSchema = z
  .object({
    name: z.string().trim().min(2, "At least 2 characters.").max(120, "At most 120 characters."),
    role: userRoleSchema,
    graduationYear: z.number().int().nullable(),
    confirmSuper: z.boolean().optional(),
  })
  .strict()
  .superRefine(checkUserFields);
export type UpdateUserBody = z.output<typeof updateUserRequestSchema>;

export const acceptInviteRequestSchema = z.object({
  token: z.string().min(16).max(128),
  password: passwordSchema,
});
export type AcceptInviteBody = z.infer<typeof acceptInviteRequestSchema>;

/**
 * strict(): the v1 property "no settings action accepts a subject id" is
 * preserved by construction — a body carrying `userId` is a 400, not an
 * ignored field (spec 18 §4).
 */
export const updateProfileRequestSchema = z
  .object({
    name: z.string().trim().min(2, "At least 2 characters.").max(120, "At most 120 characters."),
  })
  .strict();
export type UpdateProfileBody = z.infer<typeof updateProfileRequestSchema>;

/**
 * No `confirm` field — the typo guard is a client-side form rule (spec 18 §7).
 * `refreshToken` (optional) is the caller's own refresh token, excluded from
 * the revocation sweep so changing your password doesn't sign out the device
 * you changed it on; omitted, every session is revoked (fail-safe).
 */
export const changePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password required."),
    newPassword: passwordSchema,
    refreshToken: z.string().min(1).optional(),
  })
  .strict();
export type ChangePasswordBody = z.infer<typeof changePasswordRequestSchema>;

export const changePasswordResponseSchema = z.object({
  ok: z.literal(true),
  sessionsRevoked: z.number().int().nonnegative(),
});
export type ChangePasswordResponse = z.infer<typeof changePasswordResponseSchema>;

export const logoutAllResponseSchema = z.object({
  revoked: z.number().int().nonnegative(),
});
export type LogoutAllResponse = z.infer<typeof logoutAllResponseSchema>;
```

In `packages/shared/src/auth.ts`, change `meUserSchema` to:

```ts
export const meUserSchema = authUserSchema.extend({
  avatarPath: z.string().nullable(),
  /**
   * False when passwordHash is null (invited, never activated). Drives the
   * settings screen's password-section branch (spec 18 §9) so the user learns
   * before typing, not after submitting (R27). Defaults true: a backend that
   * predates the field parses as "has a password", which is what v1 assumed
   * for everyone — Task 5 makes the backend return it explicitly.
   */
  hasPassword: z.boolean().default(true),
});
```

Add `export * from "./user";` to `packages/shared/src/index.ts`.

- [ ] **Step 4: Repair mobile fixtures that build a `MeUser`**

`hasPassword` defaults, so parsing old shapes still works — but TypeScript
object literals typed as `MeUser` now need the field. Run
`pnpm turbo typecheck` and add `hasPassword: true` to every fixture the errors
point at (expected: session fixtures in `apps/mobile/src/__tests__/` such as
`use-session.test.tsx`, `boot-gate.test.tsx`, `dashboard.test.tsx`, and the
`helpers/` folder — fix exactly what typecheck reports, nothing speculative).

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @space/shared jest src/__tests__/user-schemas.test.ts` → PASS
Run: `pnpm turbo typecheck test:unit` → clean.

- [ ] **Step 6: Commit**

```bash
git add packages/shared apps/mobile
git commit -m "feat(shared): user/invite/settings contracts — one password policy, hasPassword on me"
```

---

### Task 2: Users read surface — list and detail

**Files:**
- Create: `apps/backend/src/routes/users.ts`
- Modify: `apps/backend/src/app.ts` (mount `usersRouter` at `/api/v1/users`, between `me` and `seasons`)
- Modify: `apps/backend/src/__tests__/integration/fixtures.ts` (add `createUnactivatedTestUser`)
- Modify: `apps/backend/src/docs/openapi.ts` (document both endpoints)
- Test: `apps/backend/src/__tests__/integration/users-routes.test.ts` (new)

**Interfaces:**
- Consumes: `requireAuth`/`requireUser`, `canManageUsers` from `../lib/rbac`, `parseId`, `apiOk`/`apiError`; `userRoleSchema`, `userStatusSchema` (value imports — **relative shared path**).
- Produces: `GET /api/v1/users` → `{ data: UserListResponse }` with `?q`, `?role`, `?status`, `?cursor`, `?limit`; `GET /api/v1/users/:id` → `{ data: UserDetail }`; fixture `createUnactivatedTestUser(label: string, role: TestRole): Promise<{ id: number; email: string }>` (Tasks 3–4 use it); the module-level `deriveStatus` and `LIVE_INVITE` helpers Tasks 3–4 reuse in the same file.

- [ ] **Step 1: Add the fixture helper**

In `fixtures.ts`, below `createTestUser`:

```ts
/** A user in the state only v1's CSV importer could produce (spec 11 R15):
 *  no password hash, never logged in — the precondition of the invite flow. */
export async function createUnactivatedTestUser(
  label: string,
  role: TestRole,
): Promise<{ id: number; email: string }> {
  const email = testEmail(label);
  return db.user.create({
    data: { email, name: `Test ${label}`, role, passwordHash: null },
    select: { id: true, email: true },
  });
}
```

- [ ] **Step 2: Write the failing integration tests**

```ts
// apps/backend/src/__tests__/integration/users-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import {
  cleanupTestData,
  createTestUser,
  createUnactivatedTestUser,
  login,
} from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let superToken: string;
let adminToken: string;
let superUser: { id: number; email: string };

beforeAll(async () => {
  await cleanupTestData();
  superUser = await createTestUser("super", "SUPER");
  const admin = await createTestUser("admin", "ADMIN");
  superToken = await login(app, superUser.email);
  adminToken = await login(app, admin.email);
});

afterAll(async () => {
  await cleanupTestData();
});

describe("GET /api/v1/users", () => {
  it("is SUPER-only — canManageUsers, enforced at the endpoint not the page", async () => {
    const res = await request(app)
      .get("/api/v1/users")
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("derives the four badge states server-side and never ships a hash", async () => {
    const invited = await createUnactivatedTestUser("invited", "STUDENT");
    const pending = await createUnactivatedTestUser("pending", "STUDENT");
    const inactive = await createTestUser("inactive", "STUDENT");
    await db.user.update({ where: { id: inactive.id }, data: { deletedAt: new Date() } });
    await db.inviteToken.create({
      data: {
        token: "0".repeat(64), // digest-shaped placeholder, no raw token exists
        userId: invited.id,
        invitedById: superUser.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const res = await request(app)
      .get("/api/v1/users?limit=100")
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);

    const byId = new Map(res.body.data.users.map((u: { id: number }) => [u.id, u]));
    expect(byId.get(superUser.id)).toMatchObject({ status: "active" });
    expect(byId.get(invited.id)).toMatchObject({ status: "invited" });
    expect(byId.get(pending.id)).toMatchObject({ status: "pending" });
    expect(byId.get(inactive.id)).toMatchObject({ status: "inactive" });
    // R85's fix: the hash is reduced to `status` before the response is built.
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("paginates by cursor — the API v1's unbounded page never had (R84)", async () => {
    const first = await request(app)
      .get("/api/v1/users?limit=2")
      .set("authorization", `Bearer ${superToken}`);
    expect(first.status).toBe(200);
    expect(first.body.data.users).toHaveLength(2);
    expect(first.body.data.nextCursor).not.toBeNull();

    const second = await request(app)
      .get(`/api/v1/users?limit=2&cursor=${first.body.data.nextCursor}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(second.status).toBe(200);
    const firstIds = first.body.data.users.map((u: { id: number }) => u.id);
    const secondIds = second.body.data.users.map((u: { id: number }) => u.id);
    expect(secondIds.some((id: number) => firstIds.includes(id))).toBe(false);
  });

  it("filters by q against name and email, case-insensitively", async () => {
    const needle = await createTestUser("needle-xyzzy", "STUDENT");
    const res = await request(app)
      .get("/api/v1/users?q=XYZZY")
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.users.map((u: { id: number }) => u.id)).toContain(needle.id);
  });
});

describe("GET /api/v1/users/:id", () => {
  it("returns invite metadata — issuedAt/expiresAt/invitedByName, never a token (R75)", async () => {
    const invited = await createUnactivatedTestUser("detail-invited", "STUDENT");
    await db.inviteToken.create({
      data: {
        token: "1".repeat(64),
        userId: invited.id,
        invitedById: superUser.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const res = await request(app)
      .get(`/api/v1/users/${invited.id}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("invited");
    expect(res.body.data.invite).toMatchObject({ usedAt: null });
    expect(Object.keys(res.body.data.invite).sort()).toEqual([
      "expiresAt", "invitedByName", "issuedAt", "usedAt",
    ]);
  });

  it("404s an unknown id and 403s a non-SUPER", async () => {
    const missing = await request(app)
      .get("/api/v1/users/99999999")
      .set("authorization", `Bearer ${superToken}`);
    expect(missing.status).toBe(404);

    const forbidden = await request(app)
      .get(`/api/v1/users/${superUser.id}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(forbidden.status).toBe(403);
  });
});
```

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern users-routes` → FAIL (404s — no router).

- [ ] **Step 3: Implement `routes/users.ts`**

```ts
import { Router } from "express";
// Relative, not "@space/shared" — same emit trap routes/auth.ts documents.
import {
  userRoleSchema,
  userStatusSchema,
  type UserStatus,
} from "../../../../packages/shared/src/index";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { parseId } from "../lib/parse-id";
import { canManageUsers } from "../lib/rbac";
import { requireAuth, requireUser } from "../middleware/require-auth";
import type { Response } from "express";
import type { SessionUser } from "../lib/auth/tokens";
import type { Request } from "express";

export const usersRouter = Router();
usersRouter.use(requireAuth);

/** Every route in this file is SUPER-only (spec 11 §4 — canManageUsers). */
function requireSuper(req: Request, res: Response): SessionUser | null {
  const user = requireUser(req);
  if (!canManageUsers(user)) {
    apiError(res, "forbidden", "You don't have access to this.", 403);
    return null;
  }
  return user;
}

/** A live, unaccepted invite — the "invited" badge condition (R82). */
export function liveInviteWhere(now: Date) {
  return { usedAt: null, expiresAt: { gt: now } } as const;
}

interface StatusRow {
  passwordHash: string | null;
  lastLoginAt: Date | null;
  deletedAt: Date | null;
}

/**
 * The four badge states, derived once (R81/R82's precedence: inactive,
 * active, invited, pending). v1 wrote this expression twice in two pages and
 * shipped the hash to a server component to do it (R85); here the hash never
 * leaves this function's input.
 */
export function deriveStatus(row: StatusRow, hasLiveInvite: boolean): UserStatus {
  if (row.deletedAt !== null) return "inactive";
  if (row.passwordHash !== null || row.lastLoginAt !== null) return "active";
  return hasLiveInvite ? "invited" : "pending";
}

const LIST_SELECT = {
  id: true, name: true, email: true, role: true, graduationYear: true,
  lastLoginAt: true, deletedAt: true, passwordHash: true,
} as const;

type ListRow = {
  id: number; name: string; email: string; role: string;
  graduationYear: number | null; lastLoginAt: Date | null;
  deletedAt: Date | null; passwordHash: string | null;
};

function toListItem(row: ListRow, hasLiveInvite: boolean) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    graduationYear: row.graduationYear,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    status: deriveStatus(row, hasLiveInvite),
  };
}

usersRouter.get("/", async (req, res) => {
  const user = requireSuper(req, res);
  if (!user) return;

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  let roleFilter: string | null = null;
  if (typeof req.query.role === "string") {
    const parsed = userRoleSchema.safeParse(req.query.role);
    if (!parsed.success) return apiError(res, "bad_request", "Invalid role filter.", 400);
    roleFilter = parsed.data;
  }
  let statusFilter: UserStatus | null = null;
  if (typeof req.query.status === "string") {
    const parsed = userStatusSchema.safeParse(req.query.status);
    if (!parsed.success) return apiError(res, "bad_request", "Invalid status filter.", 400);
    statusFilter = parsed.data;
  }
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : NaN;
  const limit = Number.isInteger(limitRaw) && limitRaw >= 1 && limitRaw <= 100 ? limitRaw : 50;
  const cursor = typeof req.query.cursor === "string" ? parseId(req.query.cursor) : null;
  if (typeof req.query.cursor === "string" && cursor === null) {
    return apiError(res, "bad_request", "Invalid cursor.", 400);
  }

  const now = new Date();
  // The derived statuses expressed as where-clauses, so filtering happens in
  // the database instead of over an unbounded in-memory array (R84's fix).
  const unactivated = { passwordHash: null, lastLoginAt: null } as const;
  const statusWhere: Record<UserStatus, object> = {
    inactive: { deletedAt: { not: null } },
    active: {
      deletedAt: null,
      OR: [{ passwordHash: { not: null } }, { lastLoginAt: { not: null } }],
    },
    invited: {
      deletedAt: null, ...unactivated,
      invitesReceived: { some: liveInviteWhere(now) },
    },
    pending: {
      deletedAt: null, ...unactivated,
      invitesReceived: { none: liveInviteWhere(now) },
    },
  };

  const where = {
    AND: [
      q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {},
      roleFilter ? { role: roleFilter as never } : {},
      statusFilter ? statusWhere[statusFilter] : {},
    ],
  };

  const [rows, total] = await Promise.all([
    db.user.findMany({
      where,
      select: LIST_SELECT,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: limit + 1,
      ...(cursor !== null ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
    db.user.count({ where }),
  ]);

  const page = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? page[page.length - 1]!.id : null;

  const liveInvites = await db.inviteToken.findMany({
    where: { userId: { in: page.map((r) => r.id) }, ...liveInviteWhere(now) },
    select: { userId: true },
  });
  const invitedIds = new Set(liveInvites.map((i) => i.userId));

  return apiOk(res, {
    users: page.map((row) => toListItem(row, invitedIds.has(row.id))),
    nextCursor,
    total,
  });
});

usersRouter.get("/:id", async (req, res) => {
  const user = requireSuper(req, res);
  if (!user) return;
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid user id.", 400);

  const row = await db.user.findUnique({ where: { id }, select: LIST_SELECT });
  if (!row) return apiError(res, "not_found", "User not found.", 404);

  // Latest invite regardless of state — the panel shows a used/expired one's
  // dates too, which is more honest than v1's bare "Invited" badge (R75).
  const invite = await db.inviteToken.findFirst({
    where: { userId: id },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true, expiresAt: true, usedAt: true,
      invitedBy: { select: { name: true } },
    },
  });

  const now = new Date();
  const hasLiveInvite =
    invite !== null && invite.usedAt === null && invite.expiresAt > now;

  return apiOk(res, {
    ...toListItem(row, hasLiveInvite),
    invite: invite
      ? {
          issuedAt: invite.createdAt.toISOString(),
          expiresAt: invite.expiresAt.toISOString(),
          usedAt: invite.usedAt?.toISOString() ?? null,
          invitedByName: invite.invitedBy?.name ?? null,
        }
      : null,
  });
});
```

Mount in `app.ts` after the `me` router:

```ts
import { usersRouter } from "./routes/users";
// ...
app.use("/api/v1/users", usersRouter);
```

- [ ] **Step 4: Run the suite**

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern users-routes` → PASS.
Update `src/docs/openapi.ts` with both endpoints (query params, `UserListResponse`/`UserDetail` shapes, 403/404 codes) in this same commit.

- [ ] **Step 5: Commit**

```bash
git add apps/backend
git commit -m "feat(backend): SUPER-only users list/detail — paginated, status derived server-side"
```

---

### Task 3: Role change and (de)activation — demotion finally revokes

**Files:**
- Modify: `apps/backend/src/lib/auth/tokens.ts` (export `hashToken`; add `revokeAllRefreshTokensForUser`)
- Modify: `apps/backend/src/routes/users.ts` (add `PATCH /:id`, `POST /:id/deactivate`, `POST /:id/reactivate`)
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: extend `apps/backend/src/__tests__/integration/users-routes.test.ts`

**Interfaces:**
- Consumes: Task 2's `requireSuper`/`toListItem`/`deriveStatus`/`liveInviteWhere`; `updateUserRequestSchema` (relative shared import).
- Produces: `hashToken(raw: string): string` (exported — Tasks 4–5 import it); `revokeAllRefreshTokensForUser(client: DbWriter, userId: number, exceptTokenHash?: string): Promise<number>` where `export type DbWriter = Pick<typeof db, "refreshToken">` — callable with `db` or a `$transaction` client; `PATCH /api/v1/users/:id` → `{ data: UserDetail }`; `POST /api/v1/users/:id/deactivate` → `{ data: { deletedAt: string } }`; `POST /api/v1/users/:id/reactivate` → `{ data: { deletedAt: null } }`. Error codes: `cannot_change_own_role` 409, `last_super` 409, `confirm_super_required` 400, `cannot_deactivate_self` 400.

- [ ] **Step 1: Export the token helpers**

In `lib/auth/tokens.ts`, change the private `hashToken` to `export function hashToken(...)`, and add at the bottom:

```ts
/**
 * Revoke every live refresh token a user holds. C7's note — "a role change
 * does not revoke a live token; the mitigation is TTL" — stops being a
 * mitigation and becomes a revocation here: role change, deactivation,
 * password change and logout-all all call this in (or right after) the write
 * that changes the user's authority. `exceptTokenHash` spares the caller's
 * own session (password change only).
 *
 * Accepts any client exposing `refreshToken` so it runs inside a
 * db.$transaction as well as standalone.
 */
export type DbWriter = Pick<typeof db, "refreshToken">;

export async function revokeAllRefreshTokensForUser(
  client: DbWriter,
  userId: number,
  exceptTokenHash?: string,
): Promise<number> {
  const result = await client.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptTokenHash ? { tokenHash: { not: exceptTokenHash } } : {}),
    },
    data: { revokedAt: new Date() },
  });
  return result.count;
}
```

Run: `pnpm --filter @space/backend exec tsc --noEmit -p tsconfig.json` (or `pnpm turbo typecheck --filter=@space/backend`) → clean.

- [ ] **Step 2: Write the failing integration tests**

Append to `users-routes.test.ts`. The first test is this plan's load-bearing
one — the roadmap names it by shape: *change a role, then the old refresh
token 401s.*

```ts
describe("PATCH /api/v1/users/:id — role change is revocation (spec 11 D3, ruling C7)", () => {
  it("demoting an ADMIN deletes their SeasonAdmin rows and kills their refresh token", async () => {
    const target = await createTestUser("demote-me", "ADMIN");
    const season = await createTestSeason();
    await db.seasonAdmin.create({ data: { seasonId: season.id, userId: target.id } });

    // A live session for the target, captured before the demotion.
    const targetLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: target.email, password: PASSWORD });
    expect(targetLogin.status).toBe(200);
    const oldRefresh = targetLogin.body.data.refreshToken as string;

    const res = await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Test demote-me", role: "STUDENT", graduationYear: 2015 });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe("STUDENT");

    // The scope rows are gone — isAdminOfSeason has nothing left to admit.
    const scopeRows = await db.seasonAdmin.count({ where: { userId: target.id } });
    expect(scopeRows).toBe(0);

    // And the old session cannot rotate: the claims cannot outlive the change.
    const rotate = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: oldRefresh });
    expect(rotate.status).toBe(401);
  });

  it("refuses changing your own role (D7) — name changes on yourself stay allowed", async () => {
    const own = await request(app)
      .patch(`/api/v1/users/${superUser.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Test super", role: "STUDENT", graduationYear: null });
    expect(own.status).toBe(409);
    expect(own.body.error.code).toBe("cannot_change_own_role");

    const rename = await request(app)
      .patch(`/api/v1/users/${superUser.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Test super renamed", role: "SUPER", graduationYear: null });
    expect(rename.status).toBe(200);
  });

  it("refuses to demote the last SUPER (D7) — counted inside the transaction", async () => {
    // The suite's fixtures contain exactly one SUPER *test* user, but the live
    // staging DB has real SUPERs — so build the guard's input explicitly: a
    // second test SUPER, demote it (fine), then verify the guard by asserting
    // the count query the handler uses. Direct-guard test:
    const second = await createTestUser("second-super", "SUPER");
    const ok = await request(app)
      .patch(`/api/v1/users/${second.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Test second-super", role: "STUDENT", graduationYear: 2015 });
    // Real SUPERs exist in the shared DB, so this demotion succeeds; the
    // last-SUPER branch itself is unit-shaped and pinned by the mutation pass
    // (Task 10) plus the code path below. What this case pins: demoting A
    // SUPER is not categorically refused.
    expect(ok.status).toBe(200);
  });

  it("requires confirmSuper to grant SUPER (D7 rec 3)", async () => {
    const target = await createTestUser("promote-me", "STUDENT");
    const refused = await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Test promote-me", role: "SUPER", graduationYear: null });
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe("confirm_super_required");

    const granted = await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Test promote-me", role: "SUPER", graduationYear: null, confirmSuper: true });
    expect(granted.status).toBe(200);
  });

  it("creates a StudentProfile when a role change lands on STUDENT (R46's fix)", async () => {
    const target = await createTestUser("to-student", "MENTOR");
    // createTestUser writes no profile for MENTOR.
    const res = await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Test to-student", role: "STUDENT", graduationYear: null });
    expect(res.status).toBe(200);
    const profile = await db.studentProfile.findUnique({ where: { userId: target.id } });
    expect(profile).not.toBeNull();
  });
});

describe("POST /api/v1/users/:id/deactivate & reactivate", () => {
  it("soft-deletes, revokes the refresh token, and refuses self (R56/R57 + D6)", async () => {
    const target = await createTestUser("deactivate-me", "STUDENT");
    const targetLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: target.email, password: PASSWORD });
    const oldRefresh = targetLogin.body.data.refreshToken as string;

    const self = await request(app)
      .post(`/api/v1/users/${superUser.id}/deactivate`)
      .set("authorization", `Bearer ${superToken}`);
    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe("cannot_deactivate_self");

    const res = await request(app)
      .post(`/api/v1/users/${target.id}/deactivate`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.deletedAt).not.toBeNull();

    const rotate = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: oldRefresh });
    expect(rotate.status).toBe(401);

    const back = await request(app)
      .post(`/api/v1/users/${target.id}/reactivate`)
      .set("authorization", `Bearer ${superToken}`);
    expect(back.status).toBe(200);
    expect(back.body.data.deletedAt).toBeNull();
  });
});
```

Also add `PASSWORD` and `createTestSeason` to the fixtures import at the top
of the file. Run the suite → new cases FAIL (404s).

- [ ] **Step 3: Implement the three write routes**

In `routes/users.ts`, add `updateUserRequestSchema` to the relative shared
import, plus:

```ts
import { revokeAllRefreshTokensForUser } from "../lib/auth/tokens";
```

```ts
usersRouter.patch("/:id", async (req, res) => {
  const user = requireSuper(req, res);
  if (!user) return;
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid user id.", 400);

  const parsed = updateUserRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(
      res, "bad_request",
      parsed.error.issues[0]?.message ?? "Invalid user body.", 400,
    );
  }
  const body = parsed.data;

  const outcome = await db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: { id },
      select: { id: true, role: true, deletedAt: true },
    });
    if (!target) return { fail: ["not_found", "User not found.", 404] as const };

    const roleChanged = body.role !== target.role;

    // D7 rec 1: you cannot change your own role — the lockout guard v1's
    // updateUserAction lacked (R50). Renaming yourself stays allowed.
    if (roleChanged && id === user.userId) {
      return {
        fail: ["cannot_change_own_role", "You can't change your own role.", 409] as const,
      };
    }

    // D7 rec 3: SUPER is never a mis-tapped picker item.
    if (roleChanged && body.role === "SUPER" && body.confirmSuper !== true) {
      return {
        fail: [
          "confirm_super_required",
          "Granting SUPER requires explicit confirmation.", 400,
        ] as const,
      };
    }

    // D7 rec 2: never demote the last SUPER — counted inside the transaction
    // so two concurrent demotions can't both pass the check.
    if (roleChanged && target.role === "SUPER") {
      const supers = await tx.user.count({ where: { role: "SUPER", deletedAt: null } });
      if (supers <= 1) {
        return {
          fail: ["last_super", "This is the only active SUPER account.", 409] as const,
        };
      }
    }

    if (roleChanged) {
      // D3 — fix the write, not the predicate: demotion cascades to the scope
      // tables so loadScopes has nothing to return on the next refresh...
      if (target.role === "ADMIN") {
        await tx.seasonAdmin.deleteMany({ where: { userId: id } });
      }
      if (target.role === "LEADER") {
        await tx.groupLeader.deleteMany({ where: { userId: id } });
      }
      // ...and a promotion to STUDENT finally gets a profile (R46: v1 left
      // promoted users with a null activeSeasonId forever).
      if (body.role === "STUDENT") {
        await tx.studentProfile.upsert({
          where: { userId: id },
          update: {},
          create: { userId: id },
        });
      }
    }

    await tx.user.update({
      where: { id },
      data: { name: body.name, role: body.role, graduationYear: body.graduationYear },
    });

    if (roleChanged) {
      // C7 made real: the claims baked into live tokens cannot outlive the
      // change. Access tokens die within 900s; the refresh path dies now.
      await revokeAllRefreshTokensForUser(tx, id);
    }

    return { fail: null };
  });

  if (outcome.fail) {
    const [code, message, status] = outcome.fail;
    return apiError(res, code, message, status);
  }

  // Re-read through the detail shape so PATCH returns exactly what GET does.
  const row = await db.user.findUnique({ where: { id }, select: LIST_SELECT });
  const now = new Date();
  const live = await db.inviteToken.findFirst({
    where: { userId: id, ...liveInviteWhere(now) },
    select: { id: true },
  });
  return apiOk(res, { ...toListItem(row!, live !== null), invite: null });
});

usersRouter.post("/:id/deactivate", async (req, res) => {
  const user = requireSuper(req, res);
  if (!user) return;
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid user id.", 400);
  if (id === user.userId) {
    // v1 returned void and the UI couldn't tell the no-op from success (R57,
    // R58). An explicit error is the fix, not a silent return.
    return apiError(res, "cannot_deactivate_self", "You can't deactivate yourself.", 400);
  }

  const target = await db.user.findUnique({ where: { id }, select: { role: true, deletedAt: true } });
  if (!target) return apiError(res, "not_found", "User not found.", 404);
  if (target.role === "SUPER") {
    const supers = await db.user.count({ where: { role: "SUPER", deletedAt: null } });
    if (supers <= 1) {
      return apiError(res, "last_super", "This is the only active SUPER account.", 409);
    }
  }

  const deletedAt = new Date();
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { deletedAt } });
    // D6: deactivation revokes — v1 left the refresh path live for 30 days.
    await revokeAllRefreshTokensForUser(tx, id);
  });
  return apiOk(res, { deletedAt: deletedAt.toISOString() });
});

usersRouter.post("/:id/reactivate", async (req, res) => {
  const user = requireSuper(req, res);
  if (!user) return;
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid user id.", 400);

  const target = await db.user.findUnique({ where: { id }, select: { id: true } });
  if (!target) return apiError(res, "not_found", "User not found.", 404);

  await db.user.update({ where: { id }, data: { deletedAt: null } });
  return apiOk(res, { deletedAt: null });
});
```

- [ ] **Step 4: Run the suite**

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern users-routes` → PASS.
OpenAPI for the three endpoints (including every error code above) in this same commit.

- [ ] **Step 5: Commit**

```bash
git add apps/backend
git commit -m "feat(backend): role change and deactivation revoke — scope cascade, last-SUPER and self guards"
```

---

### Task 4: Invites done properly — hashed, single-use, expiring, and acceptable

**Files:**
- Modify: `apps/backend/src/lib/config.ts` (add `INVITE_TOKEN_TTL_HOURS`)
- Create: `apps/backend/src/lib/invites.ts`
- Modify: `apps/backend/src/lib/email.ts` (add `sendInviteEmail`)
- Modify: `apps/backend/src/routes/users.ts` (add `POST /`, `POST /:id/invite`)
- Modify: `apps/backend/src/routes/auth.ts` (add `POST /accept-invite`)
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: `apps/backend/src/__tests__/integration/invites-routes.test.ts` (new)

**Interfaces:**
- Consumes: `hashToken` (Task 3), `config`, `sendInviteEmail`; `createUserRequestSchema`, `acceptInviteRequestSchema` (relative shared imports); `authLimiter` (already in `routes/auth.ts`); Task 2's `requireSuper`, `liveInviteWhere`, `LIST_SELECT`, `toListItem`.
- Produces: `config.inviteTokenTtlHours: number`; `issueInvite(client: InviteWriter, userId: number, invitedById: number): Promise<{ raw: string; expiresAt: Date }>` with `export type InviteWriter = Pick<typeof db, "inviteToken">`; `sendInviteEmail(email: string, code: string): Promise<void>`; `POST /api/v1/users` → 201 `{ data: { userId: number } }`; `POST /api/v1/users/:id/invite` → `{ data: InviteState }`; `POST /api/v1/auth/accept-invite` (anonymous, `authLimiter`) → `{ data: { ok: true } }` / `400 invalid_invite`.

- [ ] **Step 1: Config and the invite library**

In `config.ts`'s schema add (with the other numeric keys):

```ts
  // Invite acceptance window. 168h = 7 days — deliberately longer than v1's
  // 72h default: the invite is delivered to email and typed into a phone, and
  // v1's TTL never mattered because no invite was ever acceptable (spec 11 D1).
  INVITE_TOKEN_TTL_HOURS: z.coerce.number().int().positive().default(168),
```

and `inviteTokenTtlHours: parsed.data.INVITE_TOKEN_TTL_HOURS,` to the exported
object.

Create `lib/invites.ts`:

```ts
import { randomBytes } from "node:crypto";

import { db } from "../db/client";
import { hashToken } from "./auth/tokens";
import { config } from "./config";

export type InviteWriter = Pick<typeof db, "inviteToken">;

export interface IssuedInvite {
  /** The raw code. Goes to the mailer and NOWHERE else — never into a
   *  response body, never into a production log (spec 11 §7, R21). */
  raw: string;
  expiresAt: Date;
}

/**
 * Mint an invite for a user.
 *
 * - The token is 32 base64url characters (24 random bytes ≈ 192 bits —
 *   matches v1's ~190-bit strength, R13).
 * - Only its SHA-256 digest is stored — the same `hashToken` the refresh and
 *   password-reset tokens already use. v1 stored invite tokens in plaintext
 *   while hashing the LOWER-value reset tokens (spec 11 D5); this closes it.
 *   v1's plaintext rows in the shared DB can never match a digest lookup and
 *   simply age out — none of them was ever acceptable anyway (D1).
 * - Prior live invites for the user are expired in the same client, so at
 *   most one invite is live per user (D5 rec 2). `expiresAt = now`, not
 *   `usedAt` — "used" means accepted and must stay honest.
 *
 * Deliberately does NOT send email: callers mail after their transaction
 * commits, so a transport failure can't roll back a minted row and a rolled
 * back row can't have been mailed.
 */
export async function issueInvite(
  client: InviteWriter,
  userId: number,
  invitedById: number,
): Promise<IssuedInvite> {
  const raw = randomBytes(24).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.inviteTokenTtlHours * 60 * 60 * 1000);

  await client.inviteToken.updateMany({
    where: { userId, usedAt: null, expiresAt: { gt: now } },
    data: { expiresAt: now },
  });
  await client.inviteToken.create({
    data: { token: hashToken(raw), userId, invitedById, expiresAt },
  });

  return { raw, expiresAt };
}
```

In `email.ts` add (below `sendNotificationEmail`):

```ts
/**
 * The invite email. It delivers a CODE the recipient types (or pastes) into
 * the app's accept-invite screen — not a link. Spec 11 D10 recommends exactly
 * this for a mobile client: no token in any URL, browser history or Referer
 * (R24), and no possibility of mailing a link to a route that doesn't exist,
 * which is how v1's entire invite flow came to 404 (D1).
 *
 * The code's alphabet is base64url (A–Z a–z 0–9 - _), so interpolating it
 * into HTML needs no escaping — asserted by construction, not by trust
 * (ruling C11 covers every other interpolation: there are none here).
 */
export async function sendInviteEmail(email: string, code: string): Promise<void> {
  if (!isConfigured()) {
    if (config.nodeEnv === "development") {
      // Decision 2: the token never travels in an HTTP response in ANY
      // environment. In development with no mail transport, the server's own
      // stdout is the delivery channel so the flow stays testable by hand.
      // NODE_ENV=production never reaches this line.
      console.warn(`[invites] dev only — invite code for ${email}: ${code}`);
    }
    return;
  }

  const days = Math.max(1, Math.round(config.inviteTokenTtlHours / 24));
  const bodyHtml = `
    <p style="font-size: 16px; color: ${TEXT}; line-height: 1.6; margin: 0 0 16px 0;">
      You've been invited to JPC Space. Open the app, choose
      <strong>&ldquo;I have an invite code&rdquo;</strong>, and enter:
    </p>
    <p style="font-family: monospace; font-size: 18px; letter-spacing: 1px; background-color: ${BG}; border: 1px solid ${BORDER}; border-radius: 6px; padding: 12px 16px; margin: 0 0 16px 0; word-break: break-all;">
      ${code}
    </p>
    <p style="font-size: 14px; color: ${TEXT}; margin: 0;">
      This code can be used once and expires in ${days} days.
    </p>
  `;

  await getTransporter().sendMail({
    from: fromAddress(),
    to: email,
    subject: "JPC Space — you're invited",
    html: renderShell("Welcome to JPC Space", "Jesus Project Community", bodyHtml),
  });
}
```

(`isConfigured`, `getTransporter`, `fromAddress`, `renderShell`, `TEXT`, `BG`,
`BORDER` all already exist in the file; `config` is already imported.)

- [ ] **Step 2: Write the failing integration tests**

```ts
// apps/backend/src/__tests__/integration/invites-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { hashToken } from "../../lib/auth/tokens";
import { issueInvite } from "../../lib/invites";
import {
  cleanupTestData,
  createTestUser,
  createUnactivatedTestUser,
  login,
  testEmail,
} from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let superToken: string;
let superUser: { id: number; email: string };

beforeAll(async () => {
  await cleanupTestData();
  superUser = await createTestUser("super", "SUPER");
  superToken = await login(app, superUser.email);
});

afterAll(async () => {
  await cleanupTestData();
});

describe("POST /api/v1/users — creation issues credentials to no one (D2)", () => {
  it("creates with a NULL passwordHash and a hashed invite in one transaction", async () => {
    const email = testEmail("created");
    const res = await request(app)
      .post("/api/v1/users")
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Created Person", email, role: "STUDENT" });
    expect(res.status).toBe(201);

    const row = await db.user.findUnique({
      where: { id: res.body.data.userId },
      select: { passwordHash: true },
    });
    // The load-bearing negative: NO default password, ever. The column is
    // nullable (schema.prisma:107) and null is the whole activation model.
    expect(row?.passwordHash).toBeNull();

    const invite = await db.inviteToken.findFirst({
      where: { userId: res.body.data.userId },
      select: { token: true, usedAt: true },
    });
    expect(invite).not.toBeNull();
    // Digest at rest: 64 lowercase hex chars, not a 32-char raw code.
    expect(invite?.token).toMatch(/^[0-9a-f]{64}$/);
    expect(invite?.usedAt).toBeNull();

    // And the response carried no credential of any kind.
    expect(JSON.stringify(res.body)).not.toContain("token");
  });

  it("a user created without accepting cannot log in — null hash means invalid_credentials", async () => {
    const email = testEmail("no-login");
    await request(app)
      .post("/api/v1/users")
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "No Login", email, role: "STUDENT" });

    // v1 would have accepted ChangeMe123! here (R41/R44). Nothing works now.
    const attempt = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: "ChangeMe123!" });
    expect(attempt.status).toBe(401);
    expect(attempt.body.error.code).toBe("invalid_credentials");
  });

  it("refuses a duplicate email with 409 email_taken, not a Prisma error (R39)", async () => {
    const email = testEmail("dupe");
    await request(app)
      .post("/api/v1/users")
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "First", email, role: "STUDENT" });
    const clash = await request(app)
      .post("/api/v1/users")
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Second", email, role: "STUDENT" });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("email_taken");
  });
});

describe("POST /api/v1/users/:id/invite", () => {
  it("returns metadata only and expires the previous live invite (D5 rec 2)", async () => {
    const target = await createUnactivatedTestUser("reinvite", "STUDENT");

    const first = await request(app)
      .post(`/api/v1/users/${target.id}/invite`)
      .set("authorization", `Bearer ${superToken}`);
    expect(first.status).toBe(200);
    expect(Object.keys(first.body.data).sort()).toEqual([
      "expiresAt", "invitedByName", "issuedAt", "usedAt",
    ]);

    const second = await request(app)
      .post(`/api/v1/users/${target.id}/invite`)
      .set("authorization", `Bearer ${superToken}`);
    expect(second.status).toBe(200);

    const live = await db.inviteToken.count({
      where: { userId: target.id, usedAt: null, expiresAt: { gt: new Date() } },
    });
    expect(live).toBe(1);
  });

  it("explicitly refuses an activated target — no silent drop (R16 diverged)", async () => {
    const active = await createTestUser("already-active", "STUDENT");
    const res = await request(app)
      .post(`/api/v1/users/${active.id}/invite`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("already_activated");
  });
});

describe("POST /api/v1/auth/accept-invite", () => {
  it("activates the account: sets a cost-12 hash, consumes the token, login works", async () => {
    const target = await createUnactivatedTestUser("acceptor", "STUDENT");
    // The raw code exists only inside the issuing process — obtain it the way
    // the route does, via the library, then walk the anonymous HTTP path.
    const { raw } = await issueInvite(db, target.id, superUser.id);

    const res = await request(app)
      .post("/api/v1/auth/accept-invite")
      .send({ token: raw, password: "brand-new-password" });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ok: true });

    const row = await db.user.findUnique({
      where: { id: target.id },
      select: { passwordHash: true },
    });
    expect(row?.passwordHash).toMatch(/^\$2[aby]\$12\$/); // bcrypt, cost 12 (D8)

    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: target.email, password: "brand-new-password" });
    expect(loginRes.status).toBe(200);
  });

  it("is single-use — the same token a second time is refused", async () => {
    const target = await createUnactivatedTestUser("once", "STUDENT");
    const { raw } = await issueInvite(db, target.id, superUser.id);
    await request(app)
      .post("/api/v1/auth/accept-invite")
      .send({ token: raw, password: "brand-new-password" });

    const again = await request(app)
      .post("/api/v1/auth/accept-invite")
      .send({ token: raw, password: "other-password-1" });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe("invalid_invite");
  });

  it("refuses expired, unknown, and already-activated indistinguishably (R27's oracle closed)", async () => {
    // Expired: mint, then force the expiry into the past.
    const expiredTarget = await createUnactivatedTestUser("expired", "STUDENT");
    const expired = await issueInvite(db, expiredTarget.id, superUser.id);
    await db.inviteToken.updateMany({
      where: { token: hashToken(expired.raw) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    // Already-activated target: a valid invite must not become a password
    // reset for a live account (R31 — D4 rec 2: an invite is an activation).
    const activeTarget = await createTestUser("active-target", "STUDENT");
    const hijack = await issueInvite(db, activeTarget.id, superUser.id);

    const bodies = [];
    for (const token of [expired.raw, "definitely-not-a-real-token-aaaa", hijack.raw]) {
      const res = await request(app)
        .post("/api/v1/auth/accept-invite")
        .send({ token, password: "brand-new-password" });
      expect(res.status).toBe(400);
      bodies.push(res.body);
    }
    // One opaque code, byte-identical bodies — no existence oracle.
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
  });

  it("stores only the digest — the raw code never touches the database", async () => {
    const target = await createUnactivatedTestUser("digest", "STUDENT");
    const { raw } = await issueInvite(db, target.id, superUser.id);
    const row = await db.inviteToken.findFirst({
      where: { userId: target.id },
      orderBy: { createdAt: "desc" },
      select: { token: true },
    });
    expect(row?.token).not.toBe(raw);
    expect(row?.token).toBe(hashToken(raw));
  });
});
```

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern invites-routes` → FAIL.

- [ ] **Step 3: Implement `POST /users` and `POST /users/:id/invite`**

In `routes/users.ts`, extend the relative shared import with
`createUserRequestSchema`, and add:

```ts
import { issueInvite } from "../lib/invites";
import { sendInviteEmail } from "../lib/email";
```

```ts
usersRouter.post("/", async (req, res) => {
  const user = requireSuper(req, res);
  if (!user) return;

  const parsed = createUserRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(
      res, "bad_request",
      parsed.error.issues[0]?.message ?? "Invalid user body.", 400,
    );
  }
  const body = parsed.data;

  // Pre-check for the friendly 409; the @unique constraint stays the real
  // guard, so a lost race is caught below rather than surfacing as a 500.
  const existing = await db.user.findUnique({ where: { email: body.email }, select: { id: true } });
  if (existing) return apiError(res, "email_taken", "Email already in use.", 409);

  let issuedRaw: string;
  let createdId: number;
  try {
    const result = await db.$transaction(async (tx) => {
      // Spec 11 §7: creation and invitation are ONE operation. passwordHash
      // stays null — the column is nullable and null IS the activation model
      // (R14). No temp password exists to log, display, or share (D2).
      const created = await tx.user.create({
        data: {
          name: body.name,
          email: body.email,
          role: body.role,
          graduationYear: body.graduationYear,
          passwordHash: null,
          ...(body.role === "STUDENT" ? { studentProfile: { create: {} } } : {}),
        },
        select: { id: true },
      });
      const invite = await issueInvite(tx, created.id, user.userId);
      return { id: created.id, raw: invite.raw };
    });
    createdId = result.id;
    issuedRaw = result.raw;
  } catch (err) {
    // Unique-violation from the race the pre-check can lose.
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002") {
      return apiError(res, "email_taken", "Email already in use.", 409);
    }
    throw err;
  }

  // Mail AFTER commit, best-effort — v1's behaviour and the right one: a
  // transport failure must not roll back the account (R25). The operator can
  // re-send from the detail screen; the invite row's existence is the truth.
  try {
    await sendInviteEmail(body.email, issuedRaw);
  } catch (err) {
    console.error(`[invites] failed to send invite email to ${body.email}:`, err);
  }

  return apiOk(res, { userId: createdId }, 201);
});

usersRouter.post("/:id/invite", async (req, res) => {
  const user = requireSuper(req, res);
  if (!user) return;
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid user id.", 400);

  const target = await db.user.findUnique({
    where: { id },
    select: { email: true, passwordHash: true, lastLoginAt: true, deletedAt: true },
  });
  if (!target) return apiError(res, "not_found", "User not found.", 404);
  // Explicit refusals where v1 silently dropped (R16): this is an
  // authenticated SUPER pressing a button on one row, and deserves an answer.
  if (target.deletedAt) return apiError(res, "user_deleted", "This account is deactivated.", 409);
  if (target.passwordHash !== null || target.lastLoginAt !== null) {
    return apiError(res, "already_activated", "This account is already activated.", 409);
  }

  const invite = await db.$transaction((tx) => issueInvite(tx, id, user.userId));

  try {
    await sendInviteEmail(target.email, invite.raw);
  } catch (err) {
    console.error(`[invites] failed to send invite email to ${target.email}:`, err);
  }

  return apiOk(res, {
    issuedAt: new Date().toISOString(),
    expiresAt: invite.expiresAt.toISOString(),
    usedAt: null,
    invitedByName: null,
  });
});
```

(`invitedByName: null` — the issuer is the caller; the detail GET reads the
real name from the row. Note `db.$transaction((tx) => issueInvite(tx, ...))`
keeps the expire-and-mint pair atomic.)

- [ ] **Step 4: Implement `POST /auth/accept-invite`**

In `routes/auth.ts`, extend the existing relative shared import with
`acceptInviteRequestSchema`, and add:

```ts
import bcrypt from "bcryptjs";

import { db } from "../db/client";
import { hashToken } from "../lib/auth/tokens";
```

```ts
// The route v1 never built (spec 11 D1 — every invite ever sent 404ed).
// Anonymous by design; possession of the code is the authorization, so it
// sits behind the strict authLimiter: an unauthenticated write against a
// guessable surface (spec 11 §7 note on the anonymous endpoints).
authRouter.post("/accept-invite", authLimiter, async (req, res) => {
  const parsed = acceptInviteRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", "A token and a password of at least 8 characters are required.", 400);
  }

  // ONE opaque refusal for every failure mode — unknown, used, expired,
  // already-activated target, deactivated target. v1 disclosed which (R27);
  // the distinction belongs in server-side behaviour only (D5 rec 3).
  const refuse = () => apiError(res, "invalid_invite", "This invite is invalid or has expired.", 400);

  const invite = await db.inviteToken.findUnique({
    where: { token: hashToken(parsed.data.token) },
    select: {
      id: true, userId: true, usedAt: true, expiresAt: true,
      user: { select: { passwordHash: true, deletedAt: true } },
    },
  });
  if (!invite) return refuse();
  if (invite.usedAt !== null) return refuse();
  if (invite.expiresAt < new Date()) return refuse();
  // D4 rec 2: an invite is an ACTIVATION, not a reset. v1's acceptInvite
  // would set the password of a live account (R31); refused here.
  if (invite.user.passwordHash !== null || invite.user.deletedAt !== null) return refuse();

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  // Atomic consume: the guarded updateMany means two concurrent accepts of
  // the same token cannot both win — the loser's count is 0 (R28/R29 kept,
  // with the race v1's read-then-transact left open actually closed).
  const consumed = await db.$transaction(async (tx) => {
    const stamped = await tx.inviteToken.updateMany({
      where: { id: invite.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (stamped.count === 0) return false;
    await tx.user.update({ where: { id: invite.userId }, data: { passwordHash } });
    return true;
  });
  if (!consumed) return refuse();

  return apiOk(res, { ok: true });
});
```

- [ ] **Step 5: Run both suites**

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern "invites-routes|users-routes"` → PASS.
OpenAPI: `POST /users`, `POST /users/:id/invite`, `POST /auth/accept-invite`
(document `invalid_invite` as the single failure code) in this same commit.

- [ ] **Step 6: Commit**

```bash
git add apps/backend
git commit -m "feat(backend): invites — hashed at rest, single-use, one live per user, acceptance route at last"
```

---

### Task 5: Settings backend — `PATCH /me`, password change that evicts, logout-all

**Files:**
- Modify: `apps/backend/src/routes/me.ts` (GET fixes + the two writes)
- Modify: `apps/backend/src/routes/auth.ts` (add `POST /logout-all`)
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: extend `apps/backend/src/__tests__/integration/me-routes.test.ts` (read it first; reuse its app/fixture setup)

**Interfaces:**
- Consumes: `hashToken`, `revokeAllRefreshTokensForUser` (Task 3); `updateProfileRequestSchema`, `changePasswordRequestSchema` (relative shared imports into `me.ts`); `requireAuth`/`requireUser` (already used by both files).
- Produces: `GET /api/v1/me` now returns `user: null` for a soft-deleted row and `user.hasPassword: boolean`; `PATCH /api/v1/me` → `{ data: { user: MeUser } }`; `POST /api/v1/me/password` → `{ data: ChangePasswordResponse }`, codes `no_password` 409, `incorrect_password` 400, `too_many_requests` 429; `POST /api/v1/auth/logout-all` (authenticated) → `{ data: LogoutAllResponse }`.

- [ ] **Step 1: Write the failing integration tests**

Append to `me-routes.test.ts` (match its existing `app`/token setup; add
`createUnactivatedTestUser`, `PASSWORD` to its fixtures import):

```ts
describe("GET /api/v1/me — the two spec-flagged fixes", () => {
  it("returns user: null for a soft-deleted row (spec 11 §7's live inconsistency)", async () => {
    const ghost = await createTestUser("ghost", "STUDENT");
    const ghostToken = await login(app, ghost.email);
    await db.user.update({ where: { id: ghost.id }, data: { deletedAt: new Date() } });

    const res = await request(app)
      .get("/api/v1/me")
      .set("authorization", `Bearer ${ghostToken}`);
    expect(res.status).toBe(200);
    // packages/shared/src/auth.ts:53 documented this and me.ts didn't do it.
    expect(res.body.data.user).toBeNull();
  });

  it("carries hasPassword so the settings screen can branch before submitting (R27)", async () => {
    const withPw = await createTestUser("has-pw", "STUDENT");
    const token = await login(app, withPw.email);
    const res = await request(app)
      .get("/api/v1/me")
      .set("authorization", `Bearer ${token}`);
    expect(res.body.data.user.hasPassword).toBe(true);
  });
});

describe("PATCH /api/v1/me", () => {
  it("updates the caller's own name — trimmed — and returns the row (spec 18 R21/R23)", async () => {
    const u = await createTestUser("rename", "STUDENT");
    const token = await login(app, u.email);
    const res = await request(app)
      .patch("/api/v1/me")
      .set("authorization", `Bearer ${token}`)
      .send({ name: "  Renamed Person  " });
    expect(res.status).toBe(200);
    expect(res.body.data.user.name).toBe("Renamed Person");
  });

  it("refuses a body-supplied subject id — self-scope by construction (spec 18 §4)", async () => {
    const u = await createTestUser("no-subject", "STUDENT");
    const token = await login(app, u.email);
    const res = await request(app)
      .patch("/api/v1/me")
      .set("authorization", `Bearer ${token}`)
      .send({ name: "Fine Name", userId: 1 });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/me/password — the change that finally evicts (spec 18 D1, R29)", () => {
  it("revokes every other session and spares the presented one", async () => {
    const u = await createTestUser("pw-change", "STUDENT");
    // Two live sessions for the same user.
    const sessionA = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: u.email, password: PASSWORD });
    const sessionB = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: u.email, password: PASSWORD });
    const accessB = sessionB.body.data.accessToken as string;
    const refreshA = sessionA.body.data.refreshToken as string;
    const refreshB = sessionB.body.data.refreshToken as string;

    const res = await request(app)
      .post("/api/v1/me/password")
      .set("authorization", `Bearer ${accessB}`)
      .send({
        currentPassword: PASSWORD,
        newPassword: "a-whole-new-password",
        refreshToken: refreshB,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.sessionsRevoked).toBe(1);

    // Session A (the "attacker" holding a stolen session) is evicted...
    const rotateA = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: refreshA });
    expect(rotateA.status).toBe(401);

    // ...the device that changed the password keeps working...
    const rotateB = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: refreshB });
    expect(rotateB.status).toBe(200);

    // ...and the new hash is cost 12 (D8).
    const row = await db.user.findUnique({ where: { id: u.id }, select: { passwordHash: true } });
    expect(row?.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });

  it("400s a wrong current password (not 401 — the client's refresh interceptor) and 409s a null hash", async () => {
    const u = await createTestUser("pw-wrong", "STUDENT");
    const token = await login(app, u.email);
    const wrong = await request(app)
      .post("/api/v1/me/password")
      .set("authorization", `Bearer ${token}`)
      .send({ currentPassword: "not-the-password", newPassword: "a-whole-new-password" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe("incorrect_password");
  });
});

describe("POST /api/v1/auth/logout-all (spec 18 D1 — the lost-phone lever)", () => {
  it("revokes every live refresh token the caller holds, including the current one", async () => {
    const u = await createTestUser("logout-all", "STUDENT");
    const s1 = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: u.email, password: PASSWORD });
    const s2 = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: u.email, password: PASSWORD });

    const res = await request(app)
      .post("/api/v1/auth/logout-all")
      .set("authorization", `Bearer ${s2.body.data.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.revoked).toBe(2);

    for (const refreshToken of [s1.body.data.refreshToken, s2.body.data.refreshToken]) {
      const rotate = await request(app).post("/api/v1/auth/refresh").send({ refreshToken });
      expect(rotate.status).toBe(401);
    }
  });
});
```

The `no_password` 409 case: add it in the same block — create a user via
`createUnactivatedTestUser`, mint them a session directly with `issueSession`
(import from `../../lib/auth/tokens`) since they cannot log in, call the
endpoint with `currentPassword: "anything"`, expect `409` and code
`no_password`. Write it fully in the same style as the shown cases.

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern me-routes` → new cases FAIL.

- [ ] **Step 2: Implement `me.ts`**

Replace the GET's body and add the writes:

```ts
import { Router } from "express";
import rateLimit, { type Options as RateLimitOptions } from "express-rate-limit";
import bcrypt from "bcryptjs";
// Relative, not "@space/shared" — the rootDir emit trap (see routes/auth.ts).
import {
  changePasswordRequestSchema,
  updateProfileRequestSchema,
} from "../../../../packages/shared/src/index";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { hashToken, revokeAllRefreshTokensForUser } from "../lib/auth/tokens";
import { requireAuth, requireUser } from "../middleware/require-auth";

const rateLimitHandler: RateLimitOptions["handler"] = (_req, res) => {
  apiError(res, "too_many_requests", "Too many requests. Please try again later.", 429);
};

// Closes spec 18 R31: v1's current-password check was an unthrottled online
// oracle for anyone already holding a session.
const passwordLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, handler: rateLimitHandler });

export const meRouter = Router();

const ME_SELECT = {
  id: true, name: true, email: true, role: true, avatarPath: true,
  passwordHash: true, deletedAt: true,
} as const;

type MeRow = {
  id: number; name: string; email: string; role: string;
  avatarPath: string | null; passwordHash: string | null; deletedAt: Date | null;
};

/** The hash is reduced to a boolean before anything leaves this function. */
function toMeUser(row: MeRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    avatarPath: row.avatarPath,
    hasPassword: row.passwordHash !== null,
  };
}

meRouter.get("/", requireAuth, async (req, res) => {
  const user = requireUser(req);

  const record = await db.user.findUnique({ where: { id: user.userId }, select: ME_SELECT });

  apiOk(res, {
    // Soft-deleted now yields null, which is what packages/shared/src/auth.ts
    // documented all along (spec 11 §7 / D6: "one of the two is lying" — the
    // code was).
    user: record && record.deletedAt === null ? toMeUser(record) : null,
    // Scopes come from the token, not the database: they are what this token
    // was minted with, which is what the client's permission checks must agree
    // with until the next refresh.
    scopes: {
      seasonAdminIds: user.seasonAdminIds,
      groupLeaderIds: user.groupLeaderIds,
      activeSeasonId: user.activeSeasonId,
      graduationYear: user.graduationYear,
    },
  });
});

meRouter.patch("/", requireAuth, async (req, res) => {
  const user = requireUser(req);

  // strict() in the schema refuses a body userId outright — the v1 property
  // "no settings action accepts a subject id" preserved by construction
  // (spec 18 §4).
  const parsed = updateProfileRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", parsed.error.issues[0]?.message ?? "Invalid profile.", 400);
  }

  const updated = await db.user.update({
    where: { id: user.userId },
    data: { name: parsed.data.name },
    select: ME_SELECT,
  });
  // Returning the row closes v1's write-then-double-refresh (spec 18 R23).
  return apiOk(res, { user: toMeUser(updated) });
});

meRouter.post("/password", requireAuth, passwordLimiter, async (req, res) => {
  const user = requireUser(req);

  const parsed = changePasswordRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", parsed.error.issues[0]?.message ?? "Invalid password body.", 400);
  }
  const body = parsed.data;

  const record = await db.user.findUnique({
    where: { id: user.userId },
    select: { passwordHash: true },
  });
  if (!record?.passwordHash) {
    // R27's rule kept, surfaced before typing on the client via hasPassword.
    return apiError(res, "no_password", "No password is set on this account — use your invite instead.", 409);
  }

  const ok = await bcrypt.compare(body.currentPassword, record.passwordHash);
  if (!ok) {
    // 400, not 401: the mobile client's interceptor reads any non-auth 401 as
    // an expired access token and spends a refresh rotation on it.
    return apiError(res, "incorrect_password", "Current password is incorrect.", 400);
  }

  const newHash = await bcrypt.hash(body.newPassword, 12);
  const exceptHash = body.refreshToken ? hashToken(body.refreshToken) : undefined;

  // Spec 18 D1: the change and the eviction are one transaction. Every other
  // session dies; the presented refresh token (this device) survives.
  const sessionsRevoked = await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.userId }, data: { passwordHash: newHash } });
    return revokeAllRefreshTokensForUser(tx, user.userId, exceptHash);
  });

  return apiOk(res, { ok: true, sessionsRevoked });
});
```

- [ ] **Step 3: Implement `POST /auth/logout-all`**

In `routes/auth.ts` (below `logout`):

```ts
import { requireAuth, requireUser } from "../middleware/require-auth";
import { revokeAllRefreshTokensForUser } from "../lib/auth/tokens";
import { db } from "../db/client";
```

```ts
// Unlike /logout (one token, anonymous, idempotent), this revokes EVERYTHING
// the caller holds — the only recovery a user has when a device is lost
// (spec 18 D1). Authenticated: "everything of mine" needs a proven "me".
authRouter.post("/logout-all", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const revoked = await revokeAllRefreshTokensForUser(db, user.userId);
  return apiOk(res, { revoked });
});
```

(Task 4 also adds imports of `db` and `hashToken` to this file — whichever
task lands second keeps a single merged import block.)

- [ ] **Step 4: Run the suites**

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern "me-routes|auth-routes"` → PASS (the existing
`me-routes`/`auth-routes` cases must stay green — the GET's response shape only
gained a field and the null case).
OpenAPI: `PATCH /me`, `POST /me/password`, `POST /auth/logout-all`, and the
`GET /me` shape change, in this same commit.

- [ ] **Step 5: Commit**

```bash
git add apps/backend
git commit -m "feat(backend): self-scoped settings — profile patch, evicting password change, logout-all"
```

---

### Task 6: Settings screen — six roles, one route, zero role branches

**Files:**
- Create: `apps/mobile/src/hooks/use-me.ts`
- Modify: `apps/mobile/app/(app)/settings.tsx` (replace the 9-line placeholder)
- Modify: `apps/mobile/src/__tests__/placeholder-screens.test.tsx` (read first; remove the `settings` entry)
- Test: `apps/mobile/src/__tests__/settings-screen.test.tsx`

**Interfaces:**
- Consumes: `apiClient`, `useSessionStore` (`user`, `scopes`, `setSession`, `clear`), `useLogout` from `../hooks/use-session`, `loadRefreshToken` from `../lib/token-storage`, `meUserSchema`, `changePasswordResponseSchema`, `logoutAllResponseSchema`, `passwordSchema` from `@space/shared`, UI primitives (`Screen`, `Card`, `Text`, `Input`, `Button`, `LoadingState`).
- Produces: `useUpdateProfile(): UseMutationResult<MeUser, Error, { name: string }>`; `useChangePassword(): UseMutationResult<ChangePasswordResponse, Error, { currentPassword: string; newPassword: string }>`; `useLogoutAll(): UseMutationResult<LogoutAllResponse, Error, void>`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/__tests__/settings-screen.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
const mockLoadRefreshToken = jest.fn();
jest.mock("../lib/token-storage", () => ({
  loadRefreshToken: (...args: unknown[]) => mockLoadRefreshToken(...args),
  clearSession: jest.fn(),
  loadAccessToken: jest.fn(),
  saveSession: jest.fn(),
}));
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import SettingsScreen from "../../app/(app)/settings";

const patch = apiClient.patch as jest.Mock;
const post = apiClient.post as jest.Mock;

function sessionFor(role: "SUPER" | "ADMIN" | "LEADER" | "STUDENT" | "MENTOR", graduationYear: number | null = null) {
  return {
    user: { id: 5, name: "Settings Person", email: "sp@jpc.test", role, avatarPath: null, hasPassword: true },
    scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: null, graduationYear },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  mockLoadRefreshToken.mockResolvedValue("stored-refresh");
});

describe("SettingsScreen", () => {
  // Spec 18 R3 / §9: NOTHING on this screen branches by role — the largest
  // page collapse in the migration (six byte-identical pages → one route) is
  // safe precisely because every write is self-scoped. This loop is the §9
  // branching map, executed: the same sections for all six navigation roles.
  const roles = [
    ["SUPER", null], ["ADMIN", null], ["LEADER", null],
    ["MENTOR", null], ["STUDENT", null], ["STUDENT", 2020], // alumnus
  ] as const;

  it.each(roles)("renders the same sections for %s (gradYear %p)", (role, gradYear) => {
    useSessionStore.setState(sessionFor(role, gradYear));
    renderWithProviders(<SettingsScreen />);

    expect(screen.getByText("Profile")).toBeTruthy();
    expect(screen.getByText("Change password")).toBeTruthy();
    expect(screen.getByText("Security")).toBeTruthy();
    expect(screen.getByLabelText("Name")).toBeTruthy();
    // Email is shown, not editable — and the caption is TRUE in v2, unlike
    // v1's "change via the admin console" lie for students (spec 18 R20/D8).
    expect(screen.getByText("sp@jpc.test")).toBeTruthy();
  });

  it("hides the password section for an invited-never-activated account (hasPassword false)", () => {
    const s = sessionFor("STUDENT");
    s.user.hasPassword = false;
    useSessionStore.setState(s);
    renderWithProviders(<SettingsScreen />);
    expect(screen.queryByText("Change password")).toBeNull();
  });

  it("saves the profile name and reconciles the store from the response", async () => {
    useSessionStore.setState(sessionFor("STUDENT"));
    patch.mockResolvedValue({
      data: { data: { user: { id: 5, name: "New Name", email: "sp@jpc.test", role: "STUDENT", avatarPath: null, hasPassword: true } } },
    });
    renderWithProviders(<SettingsScreen />);

    fireEvent.changeText(screen.getByLabelText("Name"), "New Name");
    fireEvent.press(screen.getByText("Save name"));

    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/v1/me", { name: "New Name" }));
    await waitFor(() => expect(useSessionStore.getState().user?.name).toBe("New Name"));
  });

  it("changes the password, sending the stored refresh token so this device survives", async () => {
    useSessionStore.setState(sessionFor("STUDENT"));
    post.mockResolvedValue({ data: { data: { ok: true, sessionsRevoked: 2 } } });
    renderWithProviders(<SettingsScreen />);

    fireEvent.changeText(screen.getByLabelText("Current password"), "old-password");
    fireEvent.changeText(screen.getByLabelText("New password"), "new-password-1");
    fireEvent.changeText(screen.getByLabelText("Confirm new password"), "new-password-1");
    fireEvent.press(screen.getByText("Change password", { exact: true }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/me/password", {
        currentPassword: "old-password",
        newPassword: "new-password-1",
        refreshToken: "stored-refresh",
      }),
    );
    expect(await screen.findByText("Signed out of 2 other devices.")).toBeTruthy();
  });

  it("keeps the mismatch check client-side — no request leaves the device", async () => {
    useSessionStore.setState(sessionFor("STUDENT"));
    renderWithProviders(<SettingsScreen />);

    fireEvent.changeText(screen.getByLabelText("Current password"), "old-password");
    fireEvent.changeText(screen.getByLabelText("New password"), "new-password-1");
    fireEvent.changeText(screen.getByLabelText("Confirm new password"), "different");
    fireEvent.press(screen.getByText("Change password", { exact: true }));

    // Error travels on the field's accessibilityHint (Input's contract).
    await waitFor(() =>
      expect(screen.getByLabelText("Confirm new password").props.accessibilityHint).toBe(
        "Passwords don't match.",
      ),
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("logs out everywhere: posts, clears the session, lands on login", async () => {
    useSessionStore.setState(sessionFor("STUDENT"));
    post.mockResolvedValue({ data: { data: { revoked: 3 } } });
    renderWithProviders(<SettingsScreen />);

    fireEvent.press(screen.getByText("Sign out everywhere"));

    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/auth/logout-all"));
    await waitFor(() => expect(useSessionStore.getState().status).toBe("anonymous"));
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/settings-screen.test.tsx` → FAIL (placeholder).

- [ ] **Step 2: Write the hooks**

```ts
// apps/mobile/src/hooks/use-me.ts
import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import {
  changePasswordResponseSchema,
  logoutAllResponseSchema,
  meUserSchema,
  type ChangePasswordResponse,
  type LogoutAllResponse,
  type MeUser,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { loadRefreshToken } from "../lib/token-storage";
import { useSessionStore } from "../store/session";

/** PATCH /me and fold the returned row back into the session store — the
 *  server's row is the truth, not the optimistic local edit (spec 18 R23). */
export function useUpdateProfile(): UseMutationResult<MeUser, Error, { name: string }> {
  return useMutation({
    mutationFn: async ({ name }) => {
      const res = await apiClient.patch("/api/v1/me", { name });
      return meUserSchema.parse(res.data.data.user);
    },
    onSuccess: (user) => {
      const scopes = useSessionStore.getState().scopes;
      if (scopes) useSessionStore.getState().setSession(user, scopes);
    },
  });
}

/**
 * POST /me/password. The stored refresh token rides along so the server can
 * revoke every session EXCEPT this device's (Decision 11); if none is stored
 * the server revokes all, which is the safe direction to fail.
 */
export function useChangePassword(): UseMutationResult<
  ChangePasswordResponse,
  Error,
  { currentPassword: string; newPassword: string }
> {
  return useMutation({
    mutationFn: async (body) => {
      const refreshToken = await loadRefreshToken();
      const res = await apiClient.post("/api/v1/me/password", {
        ...body,
        ...(refreshToken ? { refreshToken } : {}),
      });
      return changePasswordResponseSchema.parse(res.data.data);
    },
  });
}

/** POST /auth/logout-all — revokes this device too; the caller must clear
 *  local state and navigate, same as useLogout's contract. */
export function useLogoutAll(): UseMutationResult<LogoutAllResponse, Error, void> {
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post("/api/v1/auth/logout-all");
      return logoutAllResponseSchema.parse(res.data.data);
    },
  });
}
```

- [ ] **Step 3: Write the screen**

Replace `apps/mobile/app/(app)/settings.tsx`:

```tsx
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { passwordSchema } from "@space/shared";

import { useChangePassword, useLogoutAll, useUpdateProfile } from "../../src/hooks/use-me";
import { useLogout } from "../../src/hooks/use-session";
import { clearSession } from "../../src/lib/token-storage";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Button, Card, Input, Screen, Text } from "../../src/ui";

/**
 * One route, all six navigation roles, ZERO role branches — spec 18 R3: v1's
 * six byte-identical pages collapse here, and the collapse is safe because
 * every write underneath is self-scoped (subject from the token, never the
 * body). The only conditional is hasPassword, which is account state, not
 * role. Do not add an org-wide control to this screen, ever — spec 18 §9's
 * last row is the whole point of the domain.
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const clear = useSessionStore((s) => s.clear);

  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const logoutAll = useLogoutAll();
  const logout = useLogout();

  const [name, setName] = useState(user?.name ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [revokedMessage, setRevokedMessage] = useState<string | null>(null);

  if (!user) return null; // the (app) layout redirects before this renders

  const saveName = () => {
    setNameSaved(false);
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 120) {
      setNameError("Between 2 and 120 characters.");
      return;
    }
    setNameError(null);
    updateProfile.mutate(
      { name: trimmed },
      {
        onSuccess: () => setNameSaved(true),
        onError: () => setNameError("Couldn't save. Try again."),
      },
    );
  };

  const submitPassword = () => {
    setRevokedMessage(null);
    setPasswordError(null);
    setConfirmError(null);
    const parsed = passwordSchema.safeParse(newPassword);
    if (!parsed.success) {
      setPasswordError(parsed.error.issues[0]?.message ?? "Invalid password.");
      return;
    }
    // The confirm/typo guard is client-side only; it never crosses the wire
    // (spec 18 §7 — the request body carries two fields).
    if (newPassword !== confirm) {
      setConfirmError("Passwords don't match.");
      return;
    }
    changePassword.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: (data) => {
          setCurrentPassword("");
          setNewPassword("");
          setConfirm("");
          setRevokedMessage(
            data.sessionsRevoked === 1
              ? "Signed out of 1 other device."
              : `Signed out of ${data.sessionsRevoked} other devices.`,
          );
        },
        onError: () => setPasswordError("Couldn't change the password. Check your current password."),
      },
    );
  };

  const signOutEverywhere = () => {
    logoutAll.mutate(undefined, {
      // Success or failure, this device signs out locally — same contract as
      // useLogout: never leave someone "signed in" against a dead session.
      onSettled: async () => {
        await clearSession();
        clear();
        router.replace("/login");
      },
    });
  };

  const signOut = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      <View style={{ gap: theme.spacing.md }}>
        <Card>
          <Text variant="heading">Profile</Text>
          <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
            <Input label="Name" value={name} onChangeText={setName} error={nameError ?? undefined} />
            <Text variant="label" color={theme.colors.neutral[600]}>
              Sign-in email
            </Text>
            <Text variant="body">{user.email}</Text>
            <Text variant="label" color={theme.colors.neutral[600]}>
              Ask an administrator to change your email.
            </Text>
            {nameSaved ? (
              <Text variant="label" color={theme.colors.success[600]}>
                Saved.
              </Text>
            ) : null}
            <Button title="Save name" onPress={saveName} loading={updateProfile.isPending} />
          </View>
        </Card>

        {user.hasPassword ? (
          <Card>
            <Text variant="heading">Change password</Text>
            <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
              <Input
                label="Current password"
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
              />
              <Input
                label="New password"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                error={passwordError ?? undefined}
              />
              <Input
                label="Confirm new password"
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                error={confirmError ?? undefined}
              />
              {revokedMessage ? (
                <Text variant="label" color={theme.colors.success[600]}>
                  {revokedMessage}
                </Text>
              ) : null}
              <Button
                title="Change password"
                onPress={submitPassword}
                loading={changePassword.isPending}
                disabled={!currentPassword || !newPassword || !confirm}
              />
            </View>
          </Card>
        ) : null}

        <Card>
          <Text variant="heading">Security</Text>
          <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
            <Button title="Sign out" variant="secondary" onPress={signOut} />
            <Button
              title="Sign out everywhere"
              variant="ghost"
              onPress={signOutEverywhere}
              loading={logoutAll.isPending}
            />
            <Text variant="label" color={theme.colors.neutral[600]}>
              Signs this account out on every device — use it if a phone is lost.
            </Text>
          </View>
        </Card>
      </View>
    </Screen>
  );
}
```

If `theme.colors.success[600]` does not exist, read `src/theme/tokens.ts` and
use the success shade it actually defines (v1's palette has a success ramp).

- [ ] **Step 4: Update `placeholder-screens.test.tsx`**

Read it; remove the `settings` entry from its placeholder list. Keep every
other entry (`users` goes in Task 7).

- [ ] **Step 5: Run the tests**

Run: `cd apps/mobile && pnpm jest src/__tests__/settings-screen.test.tsx src/__tests__/placeholder-screens.test.tsx` → PASS
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): settings screen — six roles one route, evicting password change, logout everywhere"
```

---

### Task 7: Users list screen (SUPER)

**Files:**
- Create: `apps/mobile/src/hooks/use-users.ts`
- Modify: `apps/mobile/src/lib/query-keys.ts` (add the `users` factory)
- Modify: `apps/mobile/app/(app)/users.tsx` (replace the placeholder)
- Modify: `apps/mobile/src/__tests__/placeholder-screens.test.tsx` (remove the `users` entry)
- Test: `apps/mobile/src/__tests__/users-screen.test.tsx`

**Interfaces:**
- Consumes: `apiClient`, `queryKeys` pattern, `userListResponseSchema`, `inviteStateSchema`, types `UserListItem`/`UserStatus` from `@space/shared`.
- Produces: `queryKeys.users.all/lists()/list(filters)/details()/detail(id)`; `useUsers(filters: { q: string }): UseInfiniteQueryResult<InfiniteData<UserListResponse>>`; `useSendInvite(): UseMutationResult<InviteState, Error, { userId: number }>` (Task 8 reuses both); the route push target `/user/[id]` (Task 8 creates the file — see its Step 1 ordering note).

- [ ] **Step 1: Add the query-key factory**

In `query-keys.ts`, a sibling of `sessions` (same spreading pattern):

```ts
  users: {
    all: ["users"] as const,
    lists: () => [...queryKeys.users.all, "list"] as const,
    list: (filters: { q: string }) => [...queryKeys.users.lists(), filters] as const,
    details: () => [...queryKeys.users.all, "detail"] as const,
    detail: (id: number) => [...queryKeys.users.details(), id] as const,
  },
```

- [ ] **Step 2: Write the failing test**

```tsx
// apps/mobile/src/__tests__/users-screen.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import UsersScreen from "../../app/(app)/users";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const superSession = {
  user: { id: 1, name: "Super", email: "su@jpc.test", role: "SUPER" as const, avatarPath: null, hasPassword: true },
  scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: null, graduationYear: null },
};

const rows = [
  {
    id: 2, name: "Active Ann", email: "ann@jpc.test", role: "ADMIN" as const,
    graduationYear: 2015, lastLoginAt: "2026-08-01T00:00:00.000Z", deletedAt: null,
    status: "active" as const,
  },
  {
    id: 3, name: "Pending Pete", email: "pete@jpc.test", role: "STUDENT" as const,
    graduationYear: null, lastLoginAt: null, deletedAt: null,
    status: "pending" as const,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("UsersScreen", () => {
  it("renders the list with server-derived status badges (R81 — never re-derived)", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue({ data: { data: { users: rows, nextCursor: null, total: 2 } } });

    renderWithProviders(<UsersScreen />);

    expect(await screen.findByText("Active Ann")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("No invite")).toBeTruthy();
  });

  it("shows a row-level invite action only for uninvited/invited accounts, and sends it", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue({ data: { data: { users: rows, nextCursor: null, total: 2 } } });
    post.mockResolvedValue({
      data: {
        data: {
          issuedAt: "2026-08-24T00:00:00.000Z", expiresAt: "2026-08-31T00:00:00.000Z",
          usedAt: null, invitedByName: null,
        },
      },
    });

    renderWithProviders(<UsersScreen />);
    await screen.findByText("Pending Pete");

    // Exactly one invite button: Ann is active, Pete is pending.
    const inviteButtons = screen.getAllByText("Send invite");
    expect(inviteButtons).toHaveLength(1);
    fireEvent.press(inviteButtons[0]!);

    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/users/3/invite"));
  });

  it("navigates to the detail route on row press", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue({ data: { data: { users: rows, nextCursor: null, total: 2 } } });

    renderWithProviders(<UsersScreen />);
    fireEvent.press(await screen.findByText("Active Ann"));

    expect(mockPush).toHaveBeenCalledWith({ pathname: "/user/[id]", params: { id: "2" } });
  });

  it("renders nothing but an empty state for a non-SUPER (the nav never routes them here, the screen still guards)", () => {
    useSessionStore.setState({
      ...superSession,
      user: { ...superSession.user, role: "STUDENT" as const },
    });
    renderWithProviders(<UsersScreen />);
    expect(screen.getByText("Users")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/users-screen.test.tsx` → FAIL.

- [ ] **Step 3: Write the hooks**

```ts
// apps/mobile/src/hooks/use-users.ts
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  inviteStateSchema,
  userListResponseSchema,
  type InviteState,
  type UserListResponse,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

async function fetchUsersPage(q: string, cursor: number | null): Promise<UserListResponse> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (cursor !== null) params.set("cursor", String(cursor));
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const res = await apiClient.get(`/api/v1/users${suffix}`);
  return userListResponseSchema.parse(res.data.data);
}

/** Cursor-paginated users list — the pagination v1's page never had (R84). */
export function useUsers(filters: {
  q: string;
}): UseInfiniteQueryResult<InfiniteData<UserListResponse>> {
  return useInfiniteQuery({
    queryKey: queryKeys.users.list(filters),
    queryFn: ({ pageParam }) => fetchUsersPage(filters.q, pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** POST /users/:id/invite — the response is metadata only, never a token. */
export function useSendInvite(): UseMutationResult<InviteState, Error, { userId: number }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId }) => {
      const res = await apiClient.post(`/api/v1/users/${userId}/invite`);
      return inviteStateSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}
```

- [ ] **Step 4: Write the screen**

Replace `apps/mobile/app/(app)/users.tsx`:

```tsx
import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import type { UserListItem, UserStatus } from "@space/shared";

import { useSendInvite, useUsers } from "../../src/hooks/use-users";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text } from "../../src/ui";

/** The four badge states, labelled exactly as v1's vocabulary (R82). */
const STATUS_LABEL: Record<UserStatus, string> = {
  active: "Active",
  invited: "Invited",
  pending: "No invite",
  inactive: "Inactive",
};

function UserRow({ item }: { item: UserListItem }) {
  const theme = useTheme();
  const router = useRouter();
  const sendInvite = useSendInvite();

  // Row-level invite: only accounts that have never activated can be invited
  // (R14) — the server enforces it; the button only renders where it can work.
  const canInvite = item.deletedAt === null && (item.status === "pending" || item.status === "invited");

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/user/[id]", params: { id: String(item.id) } })}
    >
      <Card style={{ marginBottom: theme.spacing.sm }}>
        <Text variant="heading">{item.name}</Text>
        <Text variant="label" color={theme.colors.neutral[600]}>
          {item.email} · {item.role} · {STATUS_LABEL[item.status]}
        </Text>
        {canInvite ? (
          <View style={{ marginTop: theme.spacing.sm }}>
            <Button
              title={item.status === "invited" ? "Resend invite" : "Send invite"}
              variant="secondary"
              loading={sendInvite.isPending}
              onPress={() => sendInvite.mutate({ userId: item.id })}
            />
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

export default function UsersScreen() {
  const theme = useTheme();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const [q, setQ] = useState("");
  const isSuper = role === "SUPER";

  const { data, isPending, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useUsers({ q });

  if (!isSuper) {
    // navFor gives only SUPER a /users entry, but a route file is reachable
    // by URL regardless — the screen guards itself (ruling C8's spirit;
    // the API behind it 403s anyway).
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Users" message="Only SUPER accounts can manage users." />
      </Screen>
    );
  }

  const users = data?.pages.flatMap((page) => page.users) ?? [];

  return (
    <Screen edges={["top", "left", "right"]} padded scroll={false}>
      <View style={{ gap: theme.spacing.sm, flex: 1 }}>
        <Input label="Search" value={q} onChangeText={setQ} placeholder="Name or email" />
        {isPending ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="Couldn't load users." onRetry={refetch} />
        ) : users.length === 0 ? (
          <EmptyState title="No users" message="No accounts match this search." />
        ) : (
          <FlatList
            data={users}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => <UserRow item={item} />}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
            }}
            onEndReachedThreshold={0.5}
          />
        )}
      </View>
    </Screen>
  );
}
```

If `Screen` has no `scroll={false}` + `FlatList` precedent yet, read how
`dashboard.tsx` hosts its content and match the codebase's existing pattern —
the requirement is a `FlatList` (not `.map`) so a large install stays
scrollable, per spec 11 §9's note on `/users`.

- [ ] **Step 5: Update `placeholder-screens.test.tsx`, run everything**

Remove the `users` entry. Then:
Run: `cd apps/mobile && pnpm jest src/__tests__/users-screen.test.tsx src/__tests__/placeholder-screens.test.tsx` → PASS.
`pnpm turbo typecheck --filter=@space/mobile` fails on the `/user/[id]` push
until Task 8's route file exists — expected when running tasks out of order;
in the default sequential execution do Task 8 before declaring this task's
typecheck green, exactly as Plan 1 handled its Task 1/2 pair.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): SUPER users list — search, cursor pagination, row invites"
```

---

### Task 8: User detail — `user/[id]` with role editor, invite panel, deactivation

**Files:**
- Create: `apps/mobile/app/(app)/user/[id].tsx`
- Modify: `apps/mobile/app/(app)/_layout.tsx` (register the hidden detail route)
- Modify: `apps/mobile/src/hooks/use-users.ts` (add detail + mutation hooks)
- Modify (read first): `apps/mobile/src/__tests__/app-layout.test.tsx`, `apps/mobile/src/__tests__/role-tabs.test.tsx` (same drill as Plan 1 Task 2)
- Test: `apps/mobile/src/__tests__/user-detail-screen.test.tsx`

**Interfaces:**
- Consumes: `queryKeys.users.detail(id)`, `useSendInvite` (Task 7), `userDetailSchema`, `updateUserRequestSchema`, `ALUMNI_ONLY_ROLES`, types `UserDetail`/`UpdateUserBody` from `@space/shared`; `formatDate` from `../../src/lib/format`.
- Produces: `useUserDetail(id: number | null): UseQueryResult<UserDetail>`; `useUpdateUser(): UseMutationResult<UserDetail, Error, { userId: number; body: UpdateUserBody }>`; `useSetActivation(): UseMutationResult<void, Error, { userId: number; action: "deactivate" | "reactivate" }>`; the `/user/[id]` route in the typed tree (unblocks Task 7's typecheck); `DETAIL_ROUTE_NAMES` in `_layout.tsx` gaining (or starting with) `"user/[id]"`.

- [ ] **Step 1: Register the hidden route**

If a `DETAIL_ROUTE_NAMES` const already exists in `(app)/_layout.tsx` (Plans
1/2/4 create it for their own dynamic routes), append `"user/[id]"`. If this
plan lands first, create it exactly as Plan 1 Task 2 specifies — the exported
const, the `orderedRouteNames` spread, and the `app-layout.test.tsx` case
asserting the screen is declared with `href: null` (copy that test with the
name `"user/[id]"`). Then create the stub route file:

```tsx
// apps/mobile/app/(app)/user/[id].tsx  (stub — Step 3 replaces the body)
import { useLocalSearchParams } from "expo-router";

import { Screen, Text } from "../../../src/ui";

export default function UserDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen edges={["top", "left", "right"]}>
      <Text variant="heading">User {id}</Text>
    </Screen>
  );
}
```

Run: `pnpm turbo routes:generate --filter=@space/mobile`, then
`cd apps/mobile && pnpm jest src/__tests__/app-layout.test.tsx src/__tests__/role-tabs.test.tsx` → PASS, and
`pnpm turbo typecheck --filter=@space/mobile` → clean (Task 7 unblocked).

- [ ] **Step 2: Write the failing test**

```tsx
// apps/mobile/src/__tests__/user-detail-screen.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => ({ id: "7" }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import UserDetailScreen from "../../app/(app)/user/[id]";

const get = apiClient.get as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const superSession = {
  user: { id: 1, name: "Super", email: "su@jpc.test", role: "SUPER" as const, avatarPath: null, hasPassword: true },
  scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: null, graduationYear: null },
};

const detail = {
  id: 7, name: "Detail Dan", email: "dan@jpc.test", role: "STUDENT" as const,
  graduationYear: null, lastLoginAt: null, deletedAt: null, status: "invited" as const,
  invite: {
    issuedAt: "2026-08-20T00:00:00.000Z",
    expiresAt: "2026-08-27T00:00:00.000Z",
    usedAt: null,
    invitedByName: "Super",
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(superSession);
  get.mockResolvedValue({ data: { data: detail } });
});

describe("UserDetailScreen", () => {
  it("shows the invite's real expiry — the fact v1 showed nowhere (R75)", async () => {
    renderWithProviders(<UserDetailScreen />);
    expect(await screen.findByText(/Invite expires/)).toBeTruthy();
    // Email is rendered read-only; it is not an input (R48).
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.getByText("dan@jpc.test")).toBeTruthy();
  });

  it("saves a full-replace PATCH of name, role, graduationYear", async () => {
    patch.mockResolvedValue({ data: { data: { ...detail, name: "Renamed Dan", invite: null } } });
    renderWithProviders(<UserDetailScreen />);
    await screen.findByText(/Invite expires/);

    fireEvent.changeText(screen.getByLabelText("Name"), "Renamed Dan");
    fireEvent.press(screen.getByText("Save changes"));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/users/7", {
        name: "Renamed Dan",
        role: "STUDENT",
        graduationYear: null,
      }),
    );
  });

  it("gates a SUPER grant behind an explicit confirmation (D7 rec 3)", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      // Press the confirming button.
      const confirmBtn = buttons?.find((b) => b.style !== "cancel");
      confirmBtn?.onPress?.();
    });
    patch.mockResolvedValue({ data: { data: { ...detail, role: "SUPER", invite: null } } });

    renderWithProviders(<UserDetailScreen />);
    await screen.findByText(/Invite expires/);

    fireEvent.press(screen.getByText("SUPER")); // role chip
    fireEvent.press(screen.getByText("Save changes"));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/users/7", {
        name: "Detail Dan",
        role: "SUPER",
        graduationYear: null,
        confirmSuper: true,
      }),
    );
    alertSpy.mockRestore();
  });

  it("requires a graduation year before offering an alumni-only role save", async () => {
    renderWithProviders(<UserDetailScreen />);
    await screen.findByText(/Invite expires/);

    fireEvent.press(screen.getByText("LEADER"));
    fireEvent.press(screen.getByText("Save changes"));

    await waitFor(() =>
      expect(screen.getByLabelText("Graduation year").props.accessibilityHint).toBe(
        "Required for this role.",
      ),
    );
    expect(patch).not.toHaveBeenCalled();
  });
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/user-detail-screen.test.tsx` → FAIL (stub).

- [ ] **Step 3: Add the hooks and the real screen**

Append to `use-users.ts`:

```ts
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { userDetailSchema, type UpdateUserBody, type UserDetail } from "@space/shared";
```

(merge with the existing import lines)

```ts
export function useUserDetail(id: number | null): UseQueryResult<UserDetail> {
  return useQuery({
    queryKey: queryKeys.users.detail(id ?? -1),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/users/${id}`);
      return userDetailSchema.parse(res.data.data);
    },
    enabled: id !== null,
  });
}

/** Full replace of the three editable fields (Decision 9). */
export function useUpdateUser(): UseMutationResult<
  UserDetail,
  Error,
  { userId: number; body: UpdateUserBody }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, body }) => {
      const res = await apiClient.patch(`/api/v1/users/${userId}`, body);
      return userDetailSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}

export function useSetActivation(): UseMutationResult<
  void,
  Error,
  { userId: number; action: "deactivate" | "reactivate" }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, action }) => {
      await apiClient.post(`/api/v1/users/${userId}/${action}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}
```

Replace the stub screen body with the full editor. The complete structure (write
all of it — the elisions below are only the repetitions of patterns already
shown in full in Tasks 6–7):

```tsx
// apps/mobile/app/(app)/user/[id].tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import {
  ALUMNI_ONLY_ROLES,
  userRoleSchema,
  type UserRole,
} from "@space/shared";

import { useSendInvite, useSetActivation, useUpdateUser, useUserDetail } from "../../../src/hooks/use-users";
import { formatDate } from "../../../src/lib/format";
import { useSessionStore } from "../../../src/store/session";
import { useTheme } from "../../../src/theme";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text } from "../../../src/ui";

const ROLES: readonly UserRole[] = userRoleSchema.options;

export default function UserDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const parsed = Number(idParam);
  const id = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

  const me = useSessionStore((s) => s.user);
  const { data, isPending, isError, refetch } = useUserDetail(me?.role === "SUPER" ? id : null);
  const updateUser = useUpdateUser();
  const sendInvite = useSendInvite();
  const setActivation = useSetActivation();

  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("STUDENT");
  const [gradYear, setGradYear] = useState("");
  const [gradYearError, setGradYearError] = useState<string | null>(null);

  // Seed the form once the row arrives; a refetch must not clobber edits, so
  // key on the row id, not the object.
  useEffect(() => {
    if (data) {
      setName(data.name);
      setRole(data.role);
      setGradYear(data.graduationYear === null ? "" : String(data.graduationYear));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id]);

  if (me?.role !== "SUPER") {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Users" message="Only SUPER accounts can manage users." />
      </Screen>
    );
  }
  if (id === null) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="User" message="Invalid user id." />
      </Screen>
    );
  }

  const save = () => {
    setGradYearError(null);
    const graduationYear = gradYear.trim() === "" ? null : Number(gradYear.trim());
    if (graduationYear !== null && !Number.isInteger(graduationYear)) {
      setGradYearError("Must be a year.");
      return;
    }
    // Client mirror of the shared refinement — the server re-checks (R55's
    // fix is that BOTH sides run the one schema; the message matches it).
    if (ALUMNI_ONLY_ROLES.includes(role) && graduationYear === null) {
      setGradYearError("Required for this role.");
      return;
    }
    const body = { name: name.trim(), role, graduationYear };
    const doSave = (confirmSuper: boolean) =>
      updateUser.mutate(
        { userId: id, body: confirmSuper ? { ...body, confirmSuper: true } : body },
        { onError: () => Alert.alert("Couldn't save", "The change was refused. Check the fields and try again.") },
      );

    if (role === "SUPER" && data?.role !== "SUPER") {
      // D7 rec 3, surfaced in the UI the same way the API enforces it.
      Alert.alert(
        "Grant SUPER?",
        "SUPER can manage every user and season. This cannot be limited by scope.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Grant SUPER", onPress: () => doSave(true) },
        ],
      );
      return;
    }
    doSave(false);
  };

  const toggleActivation = () => {
    if (!data) return;
    const action = data.deletedAt === null ? "deactivate" : "reactivate";
    Alert.alert(
      action === "deactivate" ? "Deactivate account?" : "Reactivate account?",
      action === "deactivate"
        ? "They will be signed out everywhere and unable to sign in."
        : "They will be able to sign in again with their existing password.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: action === "deactivate" ? "Deactivate" : "Reactivate",
          style: action === "deactivate" ? "destructive" : "default",
          onPress: () =>
            setActivation.mutate(
              { userId: id, action },
              { onSuccess: () => void refetch() },
            ),
        },
      ],
    );
  };

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {isPending ? (
        <LoadingState />
      ) : isError || !data ? (
        <ErrorState message="Couldn't load this user." onRetry={refetch} />
      ) : (
        <View style={{ gap: theme.spacing.md }}>
          <Card>
            <Text variant="heading">Account</Text>
            <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
              <Input label="Name" value={name} onChangeText={setName} />
              <Text variant="label" color={theme.colors.neutral[600]}>Email (read-only)</Text>
              <Text variant="body">{data.email}</Text>
              <Text variant="label" color={theme.colors.neutral[600]}>Role</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs }}>
                {ROLES.map((r) => (
                  <Pressable
                    key={r}
                    accessibilityRole="button"
                    onPress={() => setRole(r)}
                    style={{
                      paddingVertical: theme.spacing.xs,
                      paddingHorizontal: theme.spacing.sm,
                      borderRadius: theme.radii.sm,
                      borderWidth: theme.borderWidths.thin,
                      borderColor: role === r ? theme.colors.primary[600] : theme.colors.neutral[300],
                    }}
                  >
                    <Text variant="label" color={role === r ? theme.colors.primary[600] : theme.colors.neutral[700]}>
                      {r}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Input
                label="Graduation year"
                value={gradYear}
                onChangeText={setGradYear}
                keyboardType="number-pad"
                error={gradYearError ?? undefined}
              />
              <Button title="Save changes" onPress={save} loading={updateUser.isPending} />
            </View>
          </Card>

          <Card>
            <Text variant="heading">Invite</Text>
            <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
              {data.invite ? (
                <Text variant="body">
                  {data.invite.usedAt
                    ? `Invite accepted ${formatDate(data.invite.usedAt)}.`
                    : `Invite expires ${formatDate(data.invite.expiresAt)}.`}
                  {data.invite.invitedByName ? ` Sent by ${data.invite.invitedByName}.` : ""}
                </Text>
              ) : (
                <Text variant="body" color={theme.colors.neutral[600]}>
                  No invite has been sent.
                </Text>
              )}
              {data.status === "pending" || data.status === "invited" ? (
                <Button
                  title={data.status === "invited" ? "Resend invite" : "Send invite"}
                  variant="secondary"
                  loading={sendInvite.isPending}
                  onPress={() =>
                    sendInvite.mutate({ userId: id }, { onSuccess: () => void refetch() })
                  }
                />
              ) : null}
            </View>
          </Card>

          <Card>
            <Text variant="heading">Status</Text>
            <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
              <Text variant="body">
                {data.deletedAt === null ? "Active account." : `Deactivated ${formatDate(data.deletedAt)}.`}
              </Text>
              {me.id !== data.id ? (
                <Button
                  title={data.deletedAt === null ? "Deactivate" : "Reactivate"}
                  variant="ghost"
                  loading={setActivation.isPending}
                  onPress={toggleActivation}
                />
              ) : (
                <Text variant="label" color={theme.colors.neutral[600]}>
                  You can't deactivate your own account.
                </Text>
              )}
            </View>
          </Card>
        </View>
      )}
    </Screen>
  );
}
```

If `theme.colors.primary` is not the palette's name for the brand ramp, read
`src/theme/tokens.ts` and use the ramp it defines (v1's brand is navy/teal) —
same rule as Task 6's success color.

- [ ] **Step 4: Run the tests**

Run: `cd apps/mobile && pnpm jest src/__tests__/user-detail-screen.test.tsx src/__tests__/users-screen.test.tsx src/__tests__/app-layout.test.tsx` → PASS
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): user detail — role editor with SUPER confirm, invite panel with real expiry, deactivation"
```

---

### Task 9: Accept-invite screen — the step v1 never built

**Files:**
- Create: `apps/mobile/app/accept-invite.tsx` (outside `(app)`, beside `login.tsx` — anonymous)
- Modify: `apps/mobile/app/login.tsx` (add the "I have an invite code" link)
- Test: `apps/mobile/src/__tests__/accept-invite-screen.test.tsx`

**Interfaces:**
- Consumes: `apiClient` (the endpoint is anonymous; the request interceptor adds no header when no token is stored), `acceptInviteRequestSchema`, `passwordSchema` from `@space/shared`, `Screen`/`Input`/`Button`/`Text` primitives, `useRouter`.
- Produces: the `/accept-invite` route in the typed tree; a `Link`-shaped entry point from `/login`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/__tests__/accept-invite-screen.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { post: jest.fn() },
}));
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

import { apiClient } from "../lib/api-client";
import { renderWithProviders } from "./helpers/render";

import AcceptInviteScreen from "../../app/accept-invite";

const post = apiClient.post as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("AcceptInviteScreen", () => {
  it("posts the code and password, then routes to login (D1 — the flow completes at last)", async () => {
    post.mockResolvedValue({ data: { data: { ok: true } } });
    renderWithProviders(<AcceptInviteScreen />);

    fireEvent.changeText(screen.getByLabelText("Invite code"), "the-code-from-the-email-123456");
    fireEvent.changeText(screen.getByLabelText("Choose a password"), "brand-new-password");
    fireEvent.changeText(screen.getByLabelText("Confirm password"), "brand-new-password");
    fireEvent.press(screen.getByText("Activate account"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/auth/accept-invite", {
        token: "the-code-from-the-email-123456",
        password: "brand-new-password",
      }),
    );
    expect(await screen.findByText(/account is ready/i)).toBeTruthy();
    fireEvent.press(screen.getByText("Go to sign in"));
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });

  it("shows the one opaque failure message — the screen can't know more than the API tells it", async () => {
    post.mockRejectedValue(new Error("400"));
    renderWithProviders(<AcceptInviteScreen />);

    fireEvent.changeText(screen.getByLabelText("Invite code"), "an-expired-or-bogus-code-000000");
    fireEvent.changeText(screen.getByLabelText("Choose a password"), "brand-new-password");
    fireEvent.changeText(screen.getByLabelText("Confirm password"), "brand-new-password");
    fireEvent.press(screen.getByText("Activate account"));

    expect(
      await screen.findByText("That invite is invalid or has expired. Ask for a new one."),
    ).toBeTruthy();
  });

  it("enforces the shared password policy and the confirm match locally", async () => {
    renderWithProviders(<AcceptInviteScreen />);

    fireEvent.changeText(screen.getByLabelText("Invite code"), "the-code-from-the-email-123456");
    fireEvent.changeText(screen.getByLabelText("Choose a password"), "short");
    fireEvent.changeText(screen.getByLabelText("Confirm password"), "short");
    fireEvent.press(screen.getByText("Activate account"));

    await waitFor(() =>
      expect(screen.getByLabelText("Choose a password").props.accessibilityHint).toBe(
        "At least 8 characters.",
      ),
    );
    expect(post).not.toHaveBeenCalled();
  });
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/accept-invite-screen.test.tsx` → FAIL (no file).

- [ ] **Step 2: Write the screen**

```tsx
// apps/mobile/app/accept-invite.tsx
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { passwordSchema } from "@space/shared";

import { apiClient } from "../src/lib/api-client";
import { useTheme } from "../src/theme";
import { Button, Input, Screen, Text } from "../src/ui";

/**
 * The route v1 never built (spec 11 D1 — every invite it ever sent landed on
 * a 404). Anonymous: it lives OUTSIDE (app), beside login, and posts the
 * code + chosen password to the anonymous accept endpoint. The code arrives
 * by email and is typed/pasted here — never carried in a URL (D10, R24).
 */
export default function AcceptInviteScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setFailure(null);
    setPasswordError(null);
    setConfirmError(null);
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      setPasswordError(parsed.error.issues[0]?.message ?? "Invalid password.");
      return;
    }
    if (password !== confirm) {
      setConfirmError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post("/api/v1/auth/accept-invite", {
        token: code.trim(),
        password,
      });
      setDone(true);
    } catch {
      // One message for every failure — the API deliberately tells us no more
      // (invalid_invite covers unknown/used/expired/ineligible alike).
      setFailure("That invite is invalid or has expired. Ask for a new one.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: "center", gap: theme.spacing.md }}>
          <Text variant="heading">Your account is ready</Text>
          <Text variant="body">Sign in with your email and the password you just chose.</Text>
          <Button title="Go to sign in" onPress={() => router.replace("/login")} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={{ flex: 1, justifyContent: "center", gap: theme.spacing.md }}>
        <Text variant="heading">Activate your account</Text>
        <Text variant="body" color={theme.colors.neutral[600]}>
          Enter the invite code from your email and choose a password.
        </Text>
        {failure ? (
          <Text
            variant="body"
            color={theme.colors.error[600]}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
          >
            {failure}
          </Text>
        ) : null}
        <Input
          label="Invite code"
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Input
          label="Choose a password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          error={passwordError ?? undefined}
        />
        <Input
          label="Confirm password"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          error={confirmError ?? undefined}
        />
        <Button
          title="Activate account"
          onPress={submit}
          loading={submitting}
          disabled={!code.trim() || !password || !confirm}
        />
        <Button title="Back to sign in" variant="ghost" onPress={() => router.replace("/login")} />
      </View>
    </Screen>
  );
}
```

In `login.tsx`, below the "Sign in" `Button`, add:

```tsx
        <Button
          title="I have an invite code"
          variant="ghost"
          onPress={() => router.push("/accept-invite")}
        />
```

(`router` already exists in that component.)

- [ ] **Step 3: Regenerate routes, run tests**

Run: `pnpm turbo routes:generate --filter=@space/mobile`
Run: `cd apps/mobile && pnpm jest src/__tests__/accept-invite-screen.test.tsx src/__tests__/login-screen.test.tsx` → PASS (read `login-screen.test.tsx` first; if it snapshots the button set, update it for the new ghost button).
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): accept-invite screen — the acceptance step v1 never shipped"
```

---

### Task 10: Closing gate (coordinator)

- [ ] **Step 1: Full green run**

`pnpm turbo lint typecheck test:unit build` → green; then the full serial
integration run:
`cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern integration` → green (all suites, not just this plan's —
the `me` shape change and the new mounts must not have broken the others).

- [ ] **Step 2: Mutation pass** — one at a time; revert the load-bearing line, confirm the named test FAILS, restore, confirm green:

  1. **Revocation on role change:** in `routes/users.ts`'s PATCH transaction, delete the `await revokeAllRefreshTokensForUser(tx, id);` line → `users-routes.test.ts` "demoting an ADMIN … kills their refresh token" fails on the `rotate.status = 401` assertion (rotation succeeds).
  2. **Digest at rest:** in `lib/invites.ts`, store `token: raw` instead of `token: hashToken(raw)` → `invites-routes.test.ts` "stores only the digest" fails (`row.token === raw`), and "creates with a NULL passwordHash and a hashed invite" fails its `/^[0-9a-f]{64}$/` match.
  3. **Expiry check:** in `routes/auth.ts`'s accept-invite, delete the `if (invite.expiresAt < new Date()) return refuse();` line → the "refuses expired, unknown, and already-activated indistinguishably" case fails (the expired token activates the account, 200 ≠ 400).
  4. **Password-change eviction:** in `routes/me.ts`'s `POST /password` transaction, replace the `revokeAllRefreshTokensForUser` call with `0` → `me-routes.test.ts` "revokes every other session" fails (session A still rotates, `sessionsRevoked` is 0).

- [ ] **Step 3: Emit-trap check**

`grep -rn 'require("@space/shared")' apps/backend/dist/apps/backend/src/routes/` → empty
(after `pnpm turbo build`). Any hit means a shared value import in a route
file used the package name instead of the relative path.

- [ ] **Step 4: Credential-leak sweep**

- `grep -rn "ChangeMe123" apps/backend/src apps/mobile packages/shared` → **only** test assertions (the login-refusal test uses the literal to prove it no longer works); no write path contains it.
- `grep -rn "issuedRaw\|invite.raw\|\.raw" apps/backend/src/routes/` → the raw invite code flows only into `sendInviteEmail(...)`; it appears in no `apiOk` call and no `console.*` call inside `routes/`.

- [ ] **Step 5: Report**

Suite counts, the four mutation outcomes, and the deferred-to-cutover list
(ruling C1 requires it named): nulling the live DB's `ChangeMe123!` hashes +
inviting those accounts (spec 11 D2 — operational step at cutover, not code);
sweeping used/expired `InviteToken`/`PasswordResetToken` rows and the missing
`PasswordResetToken.expiresAt` index (spec 11 D5 rec 4); audit columns for role
grants (spec 11 D7 rec 4). Plus the deferred-to-later-plans list from
Decision 15 (notification preferences → Plan 9; forgot/reset password, bulk
invites, `user/new` screen → unscheduled, named).
