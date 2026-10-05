# Plan 7 — Invites, Users & Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Domains 11 and 18 — the credential boundary — built properly rather than ported: SUPER-only user administration whose role changes actually revoke authority, an invite flow that works end to end with hashed single-use tokens (v1's has never worked once — spec 11 D1), no shared default password anywhere (D2), and a six-role settings screen with password change and log-out-everywhere that finally evict a stolen session (spec 18 D1).

**Architecture:** One new backend route file (`routes/users.ts`, SUPER-gated
list/detail/create/edit/deactivate/invite), two credential routes appended to
`routes/auth.ts` (`accept-invite`, anonymous; `logout-all`, authenticated), and
the self-scoped settings writes folded into `routes/me.ts` (`PATCH /me`,
`POST /me/password`). The 429 envelope handler is extracted once into
`lib/rate-limit.ts` (ruling X4) and every limiter imports it. Invite tokens are stored **only as SHA-256 digests**,
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

**Depends on** (execution order 1 → 2 → 3 → 4 → 15 → 16 → 5 → 6 → **7** → 17 → 14 → 8 → …):
- **Plan 1:** `DETAIL_ROUTE_NAMES` exported from `app/(app)/_layout.tsx` and Task 0's derived route-count tests (X9); `PLACEHOLDER_SCREENS`; the `makeSession`/`makeUser`/`makeScopes` fixtures (X11); `/more`.
- **Plan 3:** `formatInOrgTime` in `lib/org-time.ts` (invite expiry in the email, Decision 6).
- **Plan 16:** `GET /api/v1/groups/leader-options` and `useLeaderOptions` stay as Plan 16 built them — see Decision 17. Nothing else from Plan 16 is consumed.
- Plans 2, 4, 15, 5 and 6 also run before this one; nothing here consumes them beyond the `DETAIL_ROUTE_NAMES` entries they appended. Plan 17 (users `/new`, bulk invites, forgot/reset, `confirmSuper` on create) and Plan 14 (`/me/profile`) run **after** this plan and consume it.

## Global Constraints

- **No migrations, ever.** No edits under `apps/backend/prisma/`. Shared live staging DB (ruling C1). Everything below fits the frozen schema; the columns this plan touches are verified to exist: `User.passwordHash String?` (nullable — schema.prisma:107), `InviteToken { token String @unique, userId, invitedById, expiresAt, usedAt, createdAt }` (:166-179), `RefreshToken.revokedAt` (:190).
- **Passwords are bcryptjs** (CLAUDE.md — existing hashes are bcrypt; anything else locks out every user). **Every hash this plan writes uses cost 12** (spec 11 D8: cost 12 is already live for invite-accepted accounts, and bcrypt verifies at whatever cost a hash records, so raising the write cost is backward compatible).
- **No raw credential in any HTTP response body or any log, in any environment.** An invite token travels in the invite email and nowhere else (spec 11 §7: "Do not port the 'return the token' behaviour"). There is no dev-mode channel — see Decision 2.
- Response envelope `{ data }` / `{ error: { code, message } }` via `apiOk`/`apiError`.
- **Value imports from `@space/shared` use the relative path** in **every** backend `src` file, not only routes (ruling X12): `"../../../../packages/shared/src/index"` from `src/routes/` and `src/lib/`, one more `../` from `src/lib/queries/` or `src/lib/auth/` (the `rootDir` emit trap — CLAUDE.md; `routes/auth.ts` documents it in place). `import type` may use the package name.
- **One 429 handler** (ruling X4): this plan creates `apps/backend/src/lib/rate-limit.ts` exporting `rateLimitHandler` (Task 4 Step 0) and deletes `routes/auth.ts`'s private copy. No other file defines one.
- `requireAuth` is attached per route, or a router is mounted on a prefix it owns exclusively (ruling X5). `usersRouter` owns `/api/v1/users` outright, so its router-level `use(requireAuth)` is allowed; `meRouter` and `authRouter` attach it per route.
- `src/docs/openapi.ts` changes in the same commit as the route it documents.
- Integration fixtures: every row carries the `space-v2-test-` prefix in `User.email` or `Season.code`; use the helpers in `__tests__/integration/fixtures.ts`; `jest.setTimeout(60000)`.
- **Integration tests are serial.** Executed task-by-task (the default), each task runs its own suite: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern <suite>`. If any tasks are parallelized across agents, the agents write tests unrun and the coordinator runs them serially.
- Mobile: relative imports only (no `@/` alias); every response parsed with a Zod schema from `@space/shared`, never cast; screens map states to `LoadingState`/`ErrorState`/`EmptyState`; tab screens pass `edges={["top","left","right"]}`; tests use `renderWithProviders`, query `Input` fields with `getByLabelText`, assert errors via `accessibilityHint`; `jest.mock` factories close only over consts named `mock*`; typed routes — never `as Href`/`as any`, run `pnpm turbo routes:generate --filter=@space/mobile` after adding a route file.

## Decisions this plan locks in

1. **Settings backend is folded into `routes/me.ts` + `routes/auth.ts`; there is no `routes/settings.ts`.** Spec 18 §7 is explicit: "Do not add a `GET /api/v1/settings`; it would duplicate `/me` and drift from it." Every settings write is a self-scoped `/me` resource (subject from the token, never the body — spec 18 §4), and `logout-all` is a session operation that belongs beside `login`/`logout`. A `settings.ts` file would own no resource of its own.
2. **The invite token is never returned in an HTTP response and never logged, in any environment — dev included.** Spec 11 §7 forbids the response-body channel outright, and a dev-only response field has a way of getting depended on by a client and then shipped. An earlier draft logged the code to stdout when `config.nodeEnv === "development"`; that was withdrawn, because `NODE_ENV` **defaults to `"development"`** in `config.ts`, so a production deploy that forgot to set it would have written live credentials into its logs. With no mail transport, `sendInviteEmail` warns once that invite mail is disabled (no address, no code) and returns. Exercising the flow by hand needs `GMAIL_USER`/`GMAIL_APP_PASSWORD` pointed at a test inbox; the integration suite proves acceptance without mail by calling `issueInvite` directly.
3. **Invite TTL is 7 days** via new config `INVITE_TOKEN_TTL_HOURS` (default `168`). Deliberate divergence from v1's 72-hour default (`jpc-space/src/lib/invites.ts:11-17`): v1's invites were never acceptable at any TTL (D1), and a longer window suits an email-to-mobile-app flow. Env-tunable exactly as v1's was.
4. **v2 looks invites up by digest only — no plaintext fallback.** The shared DB holds v1's plaintext rows; a digest lookup can never match them, so they are dead on arrival. That is correct, not a transition gap: every v1 invite already terminates in a 404 (D1 — the acceptance route never existed), so there is no working credential to preserve. They age out via `expiresAt`.
5. **Issuing an invite expires the target's prior live invites** (same transaction — spec 11 D5 rec 2: one live invite per user). Expiry is `expiresAt = now`, not `usedAt = now` — `usedAt` means "accepted" and must stay honest.
6. **The invite email delivers a code to type/paste into the app, not a link — but a long code, not the short numeric one spec 11 D10 suggests.** D10 recommends "a short numeric code the user types" plus the real `expiresAt`. This plan adopts the code-not-link half (it removes R24 entirely — no token in any URL, browser history, or `Referer` — and the email cannot point at a route that doesn't exist, which is how D1 happened) and the real-expiry half (the email states `expiresAt` formatted with Plan 3's `formatInOrgTime`, and the detail screen shows it). It **deliberately diverges** on length: a 6–8 digit code is 20–27 bits, safe only behind a per-invite attempt counter, and `InviteToken` has no column to hold one (C1 — no migrations). Without that counter the only brake is the per-IP `acceptInviteLimiter`, which a distributed guesser walks around. So the code stays 32 base64url characters (~192 bits); it is pasted from the email, not memorised. Revisit at cutover if an attempts column is added.
7. **`app/accept-invite.tsx` is in scope.** The roadmap's screen list names settings + users, but this plan's own done-condition ("an invite is the only way a UI-created user gets credentials") is unreachable if the flow ends at an email with no screen to enter it — that is D1 rebuilt with better plumbing. The screen is small (two fields, one anonymous POST) and sits beside `login.tsx`, outside `(app)`.
8. **`user/[id].tsx` exists as a dynamic route.** The detail carries an edit form (name/role/graduationYear), a confirm-gated SUPER grant, an invite panel with the real `expiresAt` (v1 showed no expiry anywhere — R75), and deactivate/reactivate. That is far too much interaction to inline in a list row; it follows the `assignment/[id]` dynamic-route pattern (Plan 1 Task 2). A `user/new` create screen is **not** built here — `POST /api/v1/users` exists and is tested; the `/users/new` screen belongs to **Plan 17** (students & accounts follow-up, ruling X15).
9. **`PATCH /users/:id` is a full replace of `{ name, role, graduationYear }`** (plus the optional `confirmSuper` flag), not a partial patch. v1's form always submits all three (`user-actions.ts:103-130`), the alumni cross-field rule needs all of them present to validate without a server-side merge, and the guards (self-role, last-SUPER) get simpler when the intended end state is explicit.
10. **Wrong current password on `POST /me/password` is `400 incorrect_password`, not 401.** The mobile axios interceptor treats any non-auth-endpoint 401 as an expired access token and burns a refresh rotation on it (`api-client.ts` — `__handleResponseError`); a 401 here would trigger that dance on every typo.
11. **Password change revokes every refresh token except the one whose raw value the request presents.** The access token doesn't identify a refresh token, so the client sends its own refresh token in the body (optional `refreshToken` field) and the server excludes that hash from the revocation sweep. Omitting it revokes all — fail-safe. The same server already receives raw refresh tokens in `POST /auth/logout`'s body, so this adds no new exposure class.
12. **Single-target invite refusal is explicit, not silent.** v1's batch silently dropped ineligible ids (R16). `POST /users/:id/invite` is a SUPER pressing a button on one row: an already-activated target gets `409 already_activated`, a deleted one `409 user_deleted`. The anonymous `accept-invite` endpoint is the opposite: **one opaque code for every failure** (unknown/used/expired/already-activated/deleted target all return the identical `400 invalid_invite` body), closing R27's oracle; the distinction lives in server behaviour only.
13. **No org-level settings endpoints exist, because no org-level settings exist.** Verified against `jpc-space/src/lib/settings-actions.ts` (102 lines, read in full): three actions — `changePasswordAction`, `updateNotificationPreferencesAction`, `updateOwnProfileAction` — all keyed on `session.userId`, none accepting a subject id, none writing anything org-scoped. Spec 18 §2 confirms no `Setting`/`Config` model exists in the schema. Encoding reality means encoding its absence.
14. **Notification preferences are named for Plan 9, not built here.** Spec 18 §3.5 assigns the preference surface to domain 10 (`GET/PUT /api/v1/me/notification-preferences`, all six keys including the writer-less `quizGraded`). Building a five-key twin here is precisely how v1 lost `quizGraded`. The settings screen ships without the toggles; Plan 9 adds the section.
15. **Also deferred, each with a named owner so nothing silently drops (ruling X15):**
    - **Plan 17** (students & accounts follow-up): forgot/reset-password endpoints and their two anonymous screens (spec 11 §7, R65–R80 — the same anonymous-credential family; v1's reset flow at least *works*, so it must exist before cutover); the `/users/new` create screen over this plan's `POST /api/v1/users`; bulk "send all pending invites" (`sendAllPendingInvitesAction` — v1's 5000-sequential-SMTP loop must become a queue, R18/spec §7 note; single-target `POST /users/:id/invite` covers the admin flow until then).
    - **Plan 14** (student self-service): the student's own profile — `GET/PATCH /me/profile` and the `/profile` screen (STUDENT editable, ALUMNI read-only). Plan 5 and an earlier draft of this plan each deferred it to the other; it belongs to neither. This plan's `PATCH /me` stays **name-only** and does not grow `StudentProfile` fields.
    - **Deferred with uploads** (CLAUDE.md "Uploads are switched off"; ruling X15): avatar changes (`updateAvatarAction`).
    - **No owner needed:** theme/biometrics/push are device state (spec 18 D3 — no endpoint, no column; push registration is Plan 9).
    - **Plan 13 (cutover):** the operational step of nulling existing `ChangeMe123!` hashes in the live DB (spec 11 D2 — v2 cannot fix stored rows by writing code).

    **Ordering note (resolved).** `/users/new` and bulk resend consume this plan's `POST /api/v1/users`, `POST /api/v1/users/:id/invite` and `issueInvite`, and forgot/reset consume this plan's `passwordSchema`, exported `hashToken` and `lib/rate-limit.ts`. The revised execution order runs Plan 17 **after** this plan (… 6 → 7 → 17 → 14 …), so these exist when Plan 17 starts.
16. **The last-SUPER guard is serialised, not merely counted.** "Count SUPERs inside the transaction" does not stop two concurrent demotions under Postgres's default READ COMMITTED: each transaction counts two, each proceeds, and none remain. Both the PATCH and the deactivate path therefore take row locks on every active SUPER (`SELECT … FOR UPDATE`) inside their transaction before deciding (Task 3's `lockActiveSuperIds`). The second transaction blocks on the first's locks, re-evaluates its `WHERE` against the committed row (Postgres re-checks the predicate for `FOR UPDATE`), no longer sees the demoted SUPER, and refuses. The decision itself is a pure function (`isLastActiveSuper`) with a unit test, because the shared staging DB always contains real SUPERs and an integration test can never reach the "last one" branch.

17. **Plan 16's leader picker is kept, not replaced.** Plan 16 (which runs before this plan) shipped `GET /api/v1/groups/leader-options` + `useLeaderOptions` as an interim read of live LEADER users, anticipating that this plan's `GET /users?role=` might replace it (Plan 16 D-16.14). It does not: `usersRouter` is SUPER-only (spec 11 — user administration), while group management is open to every season admin (`isAdminOfAnySeason`). Repointing the picker at `GET /users?role=LEADER` would either 403 every ADMIN or force this router to widen its gate for one read, leaking emails/roles of every account to admins. So `GET /groups/leader-options` stays the leader picker's source, `useLeaderOptions` is untouched, and this plan adds no `role`-filtered read for non-SUPER callers.
18. **Forward note — `confirmSuper` on create is Plan 17's.** This plan enforces `confirmSuper: true` only on `PATCH /users/:id` (Task 3). `POST /users` accepts `role: "SUPER"` without it here; Plan 17 Decision 13 later adds `confirmSuper?: boolean` to `createUserRequestSchema` and makes `POST /users` refuse a SUPER grant without it (`400 confirm_super_required`, the same code). No behaviour change in this plan — do not add it early, or Plan 17's failing-test-first step has nothing to fail.

**Execution shape:** Task 1 first (everything consumes the contracts). Then
Tasks 2–4 are one sequential backend stream (all touch `routes/users.ts`;
Task 4 also touches `routes/auth.ts` and creates `lib/rate-limit.ts`). Task 5
runs **after Task 4**: it imports Task 4's `lib/rate-limit.ts`, and both modify
`routes/auth.ts` and `src/docs/openapi.ts`. Screens: Task 6 needs Tasks 1+5; Task 7 needs 1–2;
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
- Produces (exact names later tasks import): `userStatusSchema` → `UserStatus`; `userListItemSchema` → `UserListItem`; `userListResponseSchema` → `UserListResponse`; `inviteStateSchema` → `InviteState`; `userDetailSchema` → `UserDetail`; `ALUMNI_ONLY_ROLES`, `roleRequiresAlumnus(role: UserRole): boolean`; `passwordSchema`; `createUserRequestSchema` → `CreateUserBody`; `updateUserRequestSchema` → `UpdateUserBody`; `acceptInviteRequestSchema` → `AcceptInviteBody`; `acceptInviteResponseSchema` → `AcceptInviteResponse`; `activationResponseSchema` → `ActivationResponse`; `updateProfileRequestSchema` → `UpdateProfileBody`; `changePasswordRequestSchema` → `ChangePasswordBody`; `changePasswordResponseSchema` → `ChangePasswordResponse`; `logoutAllResponseSchema` → `LogoutAllResponse`; and `meUserSchema` now carrying `hasPassword: boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/__tests__/user-schemas.test.ts
import {
  acceptInviteRequestSchema,
  acceptInviteResponseSchema,
  activationResponseSchema,
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

  it("has a response schema the client parses instead of casting (ruling X10)", () => {
    expect(acceptInviteResponseSchema.safeParse({ ok: true }).success).toBe(true);
    expect(acceptInviteResponseSchema.safeParse({ ok: false }).success).toBe(false);
  });
});

describe("activationResponseSchema", () => {
  it("is the deactivate/reactivate response — deletedAt is a timestamp or null", () => {
    expect(activationResponseSchema.safeParse({ deletedAt: "2026-08-24T00:00:00.000Z" }).success).toBe(true);
    expect(activationResponseSchema.safeParse({ deletedAt: null }).success).toBe(true);
    expect(activationResponseSchema.safeParse({}).success).toBe(false);
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

export const acceptInviteResponseSchema = z.object({ ok: z.literal(true) });
export type AcceptInviteResponse = z.infer<typeof acceptInviteResponseSchema>;

/** POST /users/:id/deactivate and /reactivate both answer with this. */
export const activationResponseSchema = z.object({ deletedAt: z.string().nullable() });
export type ActivationResponse = z.infer<typeof activationResponseSchema>;

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
- Produces: `GET /api/v1/users` → `{ data: UserListResponse }` with `?q`, `?role`, `?status`, `?cursor`, `?limit`; `GET /api/v1/users/:id` → `{ data: UserDetail }`; fixture `createUnactivatedTestUser(label: string, role: TestRole): Promise<{ id: number; email: string }>` (Tasks 3–4 use it); the module-level `deriveStatus`, `liveInviteWhere`, `LIST_SELECT`, `toListItem` and `loadUserDetail(id: number): Promise<UserDetail | null>` helpers Tasks 3–4 reuse in the same file (GET `/:id` and PATCH `/:id` both answer through `loadUserDetail`, so they cannot drift).

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

    // Scoped to this suite's fixtures: the live staging DB holds real users
    // that sort ahead of "Test …" by name, so an unfiltered page of 100 need
    // not contain any of ours. cleanupTestData ran in beforeAll and suites run
    // serially, so every "space-v2-test-" row here is this suite's.
    const res = await request(app)
      .get("/api/v1/users?q=space-v2-test-&limit=100")
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
    // Fixture-scoped: three users whose names share a label nothing else in
    // the database carries, so the expected pages are exactly computable.
    const probes = [];
    for (const n of [1, 2, 3]) probes.push(await createTestUser(`page-probe-${n}`, "STUDENT"));
    const probeIds = probes.map((p) => p.id);

    const first = await request(app)
      .get("/api/v1/users?q=page-probe&limit=2")
      .set("authorization", `Bearer ${superToken}`);
    expect(first.status).toBe(200);
    expect(first.body.data.total).toBe(3);
    expect(first.body.data.users).toHaveLength(2);
    expect(first.body.data.nextCursor).not.toBeNull();

    const second = await request(app)
      .get(`/api/v1/users?q=page-probe&limit=2&cursor=${first.body.data.nextCursor}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(second.status).toBe(200);
    expect(second.body.data.users).toHaveLength(1);
    expect(second.body.data.nextCursor).toBeNull();

    const firstIds: number[] = first.body.data.users.map((u: { id: number }) => u.id);
    const secondIds: number[] = second.body.data.users.map((u: { id: number }) => u.id);
    // Disjoint, and together exactly the three probes.
    expect(secondIds.some((id) => firstIds.includes(id))).toBe(false);
    expect([...firstIds, ...secondIds].sort()).toEqual([...probeIds].sort());
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
import type { Request, Response } from "express";
import {
  userRoleSchema,
  userStatusSchema,
  type UserDetail,
  type UserRole,
  type UserStatus,
} from "../../../../packages/shared/src/index";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import type { SessionUser } from "../lib/auth/tokens";
import { parseId } from "../lib/parse-id";
import { canManageUsers } from "../lib/rbac";
import { requireAuth, requireUser } from "../middleware/require-auth";

export const usersRouter = Router();
// Allowed by ruling X5: this router is mounted on /api/v1/users, a prefix it
// owns outright, so no other router's unknown paths can be turned into 401s.
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
  id: number; name: string; email: string; role: UserRole;
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
  // The shared UserRole is the same literal union as Prisma's generated enum
  // type, so this needs no cast where it reaches the where-clause.
  let roleFilter: UserRole | null = null;
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
      roleFilter ? { role: roleFilter } : {},
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

/**
 * The detail shape, built in ONE place. GET /:id and PATCH /:id (Task 3) both
 * answer through this, so a PATCH response is byte-for-byte what a following
 * GET returns — an earlier draft had PATCH hand-build `invite: null` while
 * claiming parity.
 */
export async function loadUserDetail(id: number): Promise<UserDetail | null> {
  const row = await db.user.findUnique({ where: { id }, select: LIST_SELECT });
  if (!row) return null;

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

  return {
    ...toListItem(row, hasLiveInvite),
    invite: invite
      ? {
          issuedAt: invite.createdAt.toISOString(),
          expiresAt: invite.expiresAt.toISOString(),
          usedAt: invite.usedAt?.toISOString() ?? null,
          invitedByName: invite.invitedBy?.name ?? null,
        }
      : null,
  };
}

usersRouter.get("/:id", async (req, res) => {
  const user = requireSuper(req, res);
  if (!user) return;
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid user id.", 400);

  const detail = await loadUserDetail(id);
  if (!detail) return apiError(res, "not_found", "User not found.", 404);
  return apiOk(res, detail);
});
```

(`ListRow.role` is typed `UserRole`, not `string`, so `toListItem`'s result is
assignable to `UserListItem` — and therefore `loadUserDetail` to `UserDetail` —
without a cast.)

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
- Create: `apps/backend/src/lib/super-guard.ts` (`isLastActiveSuper`, `lockActiveSuperIds`)
- Modify: `apps/backend/src/routes/users.ts` (add `PATCH /:id`, `POST /:id/deactivate`, `POST /:id/reactivate`)
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: `apps/backend/src/__tests__/super-guard.test.ts` (new, unit); extend `apps/backend/src/__tests__/integration/users-routes.test.ts`

**Interfaces:**
- Consumes: Task 2's `requireSuper`/`loadUserDetail`/`liveInviteWhere`; `updateUserRequestSchema` (relative shared import).
- Produces: `hashToken(raw: string): string` (exported — Tasks 4–5 import it); `revokeAllRefreshTokensForUser(client: DbWriter, userId: number, exceptTokenHash?: string): Promise<number>` where `export type DbWriter = Pick<typeof db, "refreshToken">` — callable with `db` or a `$transaction` client; `isLastActiveSuper(activeSuperIds: readonly number[], targetId: number): boolean`; `lockActiveSuperIds(tx: Prisma.TransactionClient): Promise<number[]>`; `PATCH /api/v1/users/:id` → `{ data: UserDetail }`; `POST /api/v1/users/:id/deactivate` → `{ data: ActivationResponse }` (`deletedAt: string`); `POST /api/v1/users/:id/reactivate` → `{ data: ActivationResponse }` (`deletedAt: null`). Error codes: `cannot_change_own_role` 409, `last_super` 409, `confirm_super_required` 400, `cannot_deactivate_self` 400.

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

Run: `pnpm turbo typecheck --filter=@space/backend` → clean.

- [ ] **Step 2: The last-SUPER guard — failing unit test, then the module (Decision 16)**

```ts
// apps/backend/src/__tests__/super-guard.test.ts
import { isLastActiveSuper } from "../lib/super-guard";

describe("isLastActiveSuper", () => {
  it("is true only when the target is the sole active SUPER", () => {
    expect(isLastActiveSuper([7], 7)).toBe(true);
  });

  it("is false when another active SUPER remains", () => {
    expect(isLastActiveSuper([7, 9], 7)).toBe(false);
  });

  it("is false when the target is not an active SUPER at all", () => {
    // Demoting a non-SUPER (or one already deactivated) can never remove the
    // last SUPER, whatever the count.
    expect(isLastActiveSuper([9], 7)).toBe(false);
  });

  it("treats an empty set as nothing to protect", () => {
    expect(isLastActiveSuper([], 7)).toBe(false);
  });
});
```

Run: `cd apps/backend && npx jest src/__tests__/super-guard.test.ts` → FAIL (module missing).

```ts
// apps/backend/src/lib/super-guard.ts
import type { Prisma } from "../generated/prisma/client";

/**
 * Would removing `targetId` from the active SUPERs leave none? Pure, so the
 * branch the shared staging DB can never reach in an integration test (it
 * always holds real SUPERs) is still pinned by a test.
 */
export function isLastActiveSuper(activeSuperIds: readonly number[], targetId: number): boolean {
  return activeSuperIds.includes(targetId) && activeSuperIds.length <= 1;
}

/**
 * Lock every active SUPER row for the rest of the transaction and return the
 * ids (Decision 16).
 *
 * A bare count is not enough under READ COMMITTED: two concurrent demotions
 * each count two SUPERs and both proceed. FOR UPDATE makes the second
 * transaction wait for the first; when it resumes, Postgres re-checks the
 * WHERE against the committed row, so the SUPER the first transaction demoted
 * or deactivated is no longer returned and the guard refuses. Ordered by id so
 * every caller takes the locks in the same order (no lock-order deadlock).
 *
 * Must be called with a $transaction client — the lock is released at commit.
 */
export async function lockActiveSuperIds(tx: Prisma.TransactionClient): Promise<number[]> {
  const rows = await tx.$queryRaw<{ id: number }[]>`
    SELECT "id" FROM "User"
    WHERE "role" = 'SUPER' AND "deletedAt" IS NULL
    ORDER BY "id"
    FOR UPDATE`;
  return rows.map((r) => r.id);
}
```

Run: `cd apps/backend && npx jest src/__tests__/super-guard.test.ts` → PASS.

- [ ] **Step 3: Write the failing integration tests**

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

  it("demotes a SUPER while others remain — the guard is not a blanket refusal", async () => {
    // The "last SUPER" branch is unreachable here: the shared staging DB always
    // holds real SUPERs. That branch is pinned by super-guard.test.ts (the pure
    // decision) and by Task 10's mutation pass; this case pins that the PATCH
    // path runs the locking guard and still lets a legitimate demotion through.
    const second = await createTestUser("second-super", "SUPER");
    const ok = await request(app)
      .patch(`/api/v1/users/${second.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Test second-super", role: "STUDENT", graduationYear: 2015 });
    expect(ok.status).toBe(200);
    expect(ok.body.data.role).toBe("STUDENT");
  });

  it("serialises two concurrent SUPER demotions — both run, and the DB is never left SUPER-less", async () => {
    // Two fixture SUPERs demoted at once. With real SUPERs present both must
    // succeed; what this pins is that the FOR UPDATE locks do not deadlock or
    // error when two transactions contend for the same rows.
    const a = await createTestUser("race-super-a", "SUPER");
    const b = await createTestUser("race-super-b", "SUPER");
    const [ra, rb] = await Promise.all(
      [a, b].map((t) =>
        request(app)
          .patch(`/api/v1/users/${t.id}`)
          .set("authorization", `Bearer ${superToken}`)
          .send({ name: "Test racer", role: "STUDENT", graduationYear: 2015 }),
      ),
    );
    expect([ra!.status, rb!.status]).toEqual([200, 200]);
    expect(await db.user.count({ where: { role: "SUPER", deletedAt: null } })).toBeGreaterThan(0);
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

describe("PATCH /api/v1/users/:id — response parity with GET", () => {
  it("returns exactly what a following GET returns, invite panel included", async () => {
    const target = await createUnactivatedTestUser("parity", "STUDENT");
    await db.inviteToken.create({
      data: {
        token: "2".repeat(64),
        userId: target.id,
        invitedById: superUser.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const patched = await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Test parity renamed", role: "STUDENT", graduationYear: null });
    const fetched = await request(app)
      .get(`/api/v1/users/${target.id}`)
      .set("authorization", `Bearer ${superToken}`);

    expect(patched.status).toBe(200);
    expect(patched.body.data.invite).not.toBeNull();
    expect(patched.body.data).toEqual(fetched.body.data);
  });
});
```

Also add `PASSWORD` and `createTestSeason` to the fixtures import at the top
of the file (`fixtures.ts` exports both). Run the suite → new cases FAIL (404s).

- [ ] **Step 4: Implement the three write routes**

In `routes/users.ts`, add `updateUserRequestSchema` to the relative shared
import, plus:

```ts
import { revokeAllRefreshTokensForUser } from "../lib/auth/tokens";
import { isLastActiveSuper, lockActiveSuperIds } from "../lib/super-guard";
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

    // D7 rec 2: never demote the last SUPER. The active SUPER rows are LOCKED
    // (Decision 16), not merely counted — a count alone lets two concurrent
    // demotions both pass under READ COMMITTED.
    if (roleChanged && target.role === "SUPER") {
      const activeSuperIds = await lockActiveSuperIds(tx);
      if (isLastActiveSuper(activeSuperIds, id)) {
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

  // Through the same builder GET /:id uses, so PATCH returns exactly what GET
  // does — invite panel included.
  const detail = await loadUserDetail(id);
  if (!detail) return apiError(res, "not_found", "User not found.", 404);
  return apiOk(res, detail);
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

  const deletedAt = new Date();
  // The existence check, the last-SUPER guard and the write share one
  // transaction, and the guard locks the SUPER rows (Decision 16) — an earlier
  // draft counted outside any transaction, so a concurrent demotion could
  // slip between the count and the write.
  const outcome = await db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id }, select: { role: true } });
    if (!target) return "not_found" as const;
    if (target.role === "SUPER") {
      const activeSuperIds = await lockActiveSuperIds(tx);
      if (isLastActiveSuper(activeSuperIds, id)) return "last_super" as const;
    }
    await tx.user.update({ where: { id }, data: { deletedAt } });
    // D6: deactivation revokes — v1 left the refresh path live for 30 days.
    await revokeAllRefreshTokensForUser(tx, id);
    return "ok" as const;
  });

  if (outcome === "not_found") return apiError(res, "not_found", "User not found.", 404);
  if (outcome === "last_super") {
    return apiError(res, "last_super", "This is the only active SUPER account.", 409);
  }
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

- [ ] **Step 5: Run the suites**

Run: `cd apps/backend && npx jest src/__tests__/super-guard.test.ts` → PASS.
Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern users-routes` → PASS.
OpenAPI for the three endpoints (including every error code above) in this same commit.

- [ ] **Step 6: Commit**

```bash
git add apps/backend
git commit -m "feat(backend): role change and deactivation revoke — scope cascade, locked last-SUPER guard, self guards"
```

---

### Task 4: Invites done properly — hashed, single-use, expiring, and acceptable

**Files:**
- Create: `apps/backend/src/lib/rate-limit.ts` (ruling X4 — the one 429 handler)
- Modify: `apps/backend/src/lib/config.ts` (add `INVITE_TOKEN_TTL_HOURS`)
- Create: `apps/backend/src/lib/invites.ts`
- Modify: `apps/backend/src/lib/email.ts` (add `sendInviteEmail`)
- Modify: `apps/backend/src/routes/users.ts` (add `POST /`, `POST /:id/invite`)
- Modify: `apps/backend/src/routes/auth.ts` (import the shared handler and delete its copy; add `acceptInviteLimiter` and `POST /accept-invite`)
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: `apps/backend/src/__tests__/rate-limit.test.ts` (new, unit), `apps/backend/src/__tests__/integration/invites-routes.test.ts` (new)

**Interfaces:**
- Consumes: `hashToken` (Task 3), `config`, `formatInOrgTime` from `lib/org-time.ts` (Plan 3), `sendInviteEmail`; `createUserRequestSchema`, `acceptInviteRequestSchema` (relative shared imports); Task 2's `requireSuper`, `loadUserDetail`.
- Produces: `rateLimitHandler: RateLimitOptions["handler"]` from `apps/backend/src/lib/rate-limit.ts` (Task 5 and Plans 8, 11, 12 import it; nobody else defines one); `config.inviteTokenTtlHours: number`; `issueInvite(client: InviteWriter, userId: number, invitedById: number): Promise<{ raw: string; expiresAt: Date }>` with `export type InviteWriter = Pick<typeof db, "inviteToken">`; `sendInviteEmail(email: string, code: string, expiresAt: Date): Promise<void>`; `POST /api/v1/users` → 201 `{ data: { userId: number } }`; `POST /api/v1/users/:id/invite` → `{ data: InviteState }`; `POST /api/v1/auth/accept-invite` (anonymous, its own `acceptInviteLimiter`) → `{ data: AcceptInviteResponse }` / `400 invalid_invite`.

- [ ] **Step 0: Extract the rate-limit handler (ruling X4)**

Failing test first:

```ts
// apps/backend/src/__tests__/rate-limit.test.ts
import express from "express";
import rateLimit from "express-rate-limit";
import request from "supertest";

import { rateLimitHandler } from "../lib/rate-limit";

describe("rateLimitHandler", () => {
  it("answers 429 inside the { error: { code, message } } envelope, not express-rate-limit's plain text", async () => {
    const app = express();
    app.get("/probe", rateLimit({ windowMs: 60_000, limit: 1, handler: rateLimitHandler }), (_req, res) => {
      res.json({ data: { ok: true } });
    });

    expect((await request(app).get("/probe")).status).toBe(200);
    const limited = await request(app).get("/probe");
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      error: { code: "too_many_requests", message: "Too many requests. Please try again later." },
    });
  });
});
```

Run: `cd apps/backend && npx jest src/__tests__/rate-limit.test.ts` → FAIL (module missing).

```ts
// apps/backend/src/lib/rate-limit.ts
import type { Options as RateLimitOptions } from "express-rate-limit";

import { apiError } from "./api-response";

/**
 * express-rate-limit's default 429 body is plain text, which would be the one
 * response in the API outside the { error: { code, message } } envelope
 * (CLAUDE.md "Response envelope"). Extracted from routes/auth.ts so every
 * limiter in the backend — auth, password change, note reads, exports,
 * imports — shares this one handler instead of growing copies that drift
 * (ruling X4).
 */
export const rateLimitHandler: RateLimitOptions["handler"] = (_req, res) => {
  apiError(res, "too_many_requests", "Too many requests. Please try again later.", 429);
};
```

In `apps/backend/src/routes/auth.ts`: delete the local `const rateLimitHandler … };`
block, change the import line to `import rateLimit from "express-rate-limit";`
(the `type Options` import was only used by that block), and add
`import { rateLimitHandler } from "../lib/rate-limit";`. `authLimiter` and
`refreshLimiter` keep their windows and limits.

Run: `cd apps/backend && npx jest src/__tests__/rate-limit.test.ts` → PASS.
Run: `pnpm turbo typecheck --filter=@space/backend` → clean.

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
 * Two interpolations, neither user-controlled: the code (base64url alphabet,
 * A–Z a–z 0–9 - _) and the expiry as formatted by formatInOrgTime (digits,
 * letters, spaces, punctuation from Intl). Neither can carry markup, so no
 * escaping is needed by construction (ruling C11). v1 interpolated the
 * inviter's display name here (spec 11 D10, R90); v2 does not put any name in
 * this mail. If one is ever added, it goes through Plan 8's escapeHtml.
 *
 * The real expiry is stated (spec 11 D10, R75) — v1 said "will expire soon".
 */
export async function sendInviteEmail(email: string, code: string, expiresAt: Date): Promise<void> {
  if (!isConfigured()) {
    // Decision 2: the code is NEVER logged, in any environment — NODE_ENV
    // defaults to "development", so a dev-only log line would leak live
    // credentials from any deploy that forgot to set it. Warn once, without
    // the code and without the address.
    if (!warnedInviteUnconfigured) {
      warnedInviteUnconfigured = true;
      console.warn(
        "[email] GMAIL_USER/GMAIL_APP_PASSWORD are unset — invite emails are disabled. Invites are still issued and recorded.",
      );
    }
    return;
  }

  const bodyHtml = `
    <p style="font-size: 16px; color: ${TEXT}; line-height: 1.6; margin: 0 0 16px 0;">
      You've been invited to JPC Space. Open the app, choose
      <strong>&ldquo;I have an invite code&rdquo;</strong>, and enter:
    </p>
    <p style="font-family: monospace; font-size: 18px; letter-spacing: 1px; background-color: ${BG}; border: 1px solid ${BORDER}; border-radius: 6px; padding: 12px 16px; margin: 0 0 16px 0; word-break: break-all;">
      ${code}
    </p>
    <p style="font-size: 14px; color: ${TEXT}; margin: 0;">
      This code can be used once and expires on ${formatInOrgTime(expiresAt)}.
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

Beside the file's existing `let warnedUnconfigured = false;`, add
`let warnedInviteUnconfigured = false;`, and add
`import { formatInOrgTime } from "./org-time";` (Plan 3 created it).
(`isConfigured`, `getTransporter`, `fromAddress`, `renderShell`, `TEXT`, `BG`,
`BORDER` all already exist in the file.)

- [ ] **Step 2: Write the failing integration tests**

```ts
// apps/backend/src/__tests__/integration/invites-routes.test.ts
import request from "supertest";

// The mailer is stubbed for two reasons: a staging .env with GMAIL_* set would
// otherwise send real SMTP to @jpc.test addresses on every run, and the stub
// is how this suite proves the raw code reaches the mailer and nothing else.
// Lazy wrapper: jest.mock is hoisted above this const, so the factory must not
// read mockSendInviteEmail until the function is actually called.
const mockSendInviteEmail = jest.fn().mockResolvedValue(undefined);
jest.mock("../../lib/email", () => ({
  ...jest.requireActual("../../lib/email"),
  sendInviteEmail: (...args: unknown[]) => mockSendInviteEmail(...args),
}));

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

    // The raw code went to the mailer — and is the code whose digest is stored.
    const calls = mockSendInviteEmail.mock.calls as [string, string, Date][];
    const call = calls[calls.length - 1]!;
    expect(call[0]).toBe(email);
    expect(hashToken(call[1])).toBe(invite?.token);
    expect(JSON.stringify(res.body)).not.toContain(call[1]);
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

(`POST /users` takes no `confirmSuper` here; Plan 17 adds it — Decision 18.)

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
  let issuedExpiresAt: Date;
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
      return { id: created.id, raw: invite.raw, expiresAt: invite.expiresAt };
    });
    createdId = result.id;
    issuedRaw = result.raw;
    issuedExpiresAt = result.expiresAt;
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
  // The log names the user id and the error — never the code (Decision 2).
  try {
    await sendInviteEmail(body.email, issuedRaw, issuedExpiresAt);
  } catch (err) {
    console.error(
      `[invites] failed to send invite email for user ${createdId}:`,
      err instanceof Error ? err.message : err,
    );
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
    await sendInviteEmail(target.email, invite.raw, invite.expiresAt);
  } catch (err) {
    // User id and error only — never the code (Decision 2).
    console.error(
      `[invites] failed to send invite email for user ${id}:`,
      err instanceof Error ? err.message : err,
    );
  }

  // The panel the detail screen renders, read back from the row just written
  // (loadUserDetail returns the latest invite, which is this one).
  const detail = await loadUserDetail(id);
  return apiOk(res, detail!.invite);
});
```

(`db.$transaction((tx) => issueInvite(tx, ...))` keeps the expire-and-mint
pair atomic. The response is read through `loadUserDetail`, so it carries the
real `invitedByName` rather than a hand-built `null`.)

- [ ] **Step 4: Implement `POST /auth/accept-invite`**

In `routes/auth.ts`, extend the existing relative shared import with
`acceptInviteRequestSchema`, and add:

```ts
import bcrypt from "bcryptjs";

import { db } from "../db/client";
import { hashToken } from "../lib/auth/tokens";
```

```ts
// Same window and ceiling as authLimiter, but its OWN bucket: sharing the
// login limiter would let a few failed sign-ins lock a person out of
// activating, and vice versa.
const acceptInviteLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, handler: rateLimitHandler });

// The route v1 never built (spec 11 D1 — every invite ever sent 404ed).
// Anonymous by design; possession of the code is the authorization, so it
// sits behind a strict limiter: an unauthenticated write against a
// guessable surface (spec 11 §7 note on the anonymous endpoints).
authRouter.post("/accept-invite", acceptInviteLimiter, async (req, res) => {
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

Run: `cd apps/backend && npx jest src/__tests__/rate-limit.test.ts` → PASS.
Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern "invites-routes|users-routes|auth-routes"` → PASS (`auth-routes` proves the handler extraction left login/refresh/logout intact).
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
- Modify: `apps/backend/src/__tests__/integration/me-routes.test.ts` (one line: its exact `toEqual` on `GET /me`'s user gains `hasPassword: true`)
- Test: `apps/backend/src/__tests__/integration/me-settings-routes.test.ts` (new)

**Why a new test file.** `me-routes.test.ts` does not use `fixtures.ts`: it
declares its own `const PASSWORD`, builds its user with `db.user.create`, and
asserts `GET /me`'s user with an exact `toEqual`. Appending fixture-based cases
there would redeclare `PASSWORD` (a compile error) and mix two cleanup
disciplines in one file. The new suite uses the fixtures throughout; the old
file changes by exactly the one assertion the response shape forces.

**Interfaces:**
- Consumes: `hashToken`, `revokeAllRefreshTokensForUser`, `issueSession` (Task 3 / existing `lib/auth/tokens.ts`); `rateLimitHandler` (Task 4, `lib/rate-limit.ts`); `updateProfileRequestSchema`, `changePasswordRequestSchema` (relative shared imports into `me.ts`); `requireAuth`/`requireUser` (already used by both files).
- Produces: `GET /api/v1/me` now returns `user: null` for a soft-deleted row and `user.hasPassword: boolean`; `PATCH /api/v1/me` → `{ data: { user: MeUser } }`; `POST /api/v1/me/password` → `{ data: ChangePasswordResponse }`, codes `no_password` 409, `incorrect_password` 400, `too_many_requests` 429; `POST /api/v1/auth/logout-all` (authenticated) → `{ data: LogoutAllResponse }`.

- [ ] **Step 1: Write the failing integration tests**

In `me-routes.test.ts`, the `"returns the user record and scopes for a valid token"`
case's expected user becomes:

```ts
    expect(res.body.data.user).toEqual({
      id: userId,
      name: "Me Route Test User",
      email: EMAIL,
      role: "STUDENT",
      avatarPath: null,
      hasPassword: true,
    });
```

Nothing else in that file changes. Then create the new suite:

```ts
// apps/backend/src/__tests__/integration/me-settings-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { issueSession } from "../../lib/auth/tokens";
import {
  PASSWORD,
  cleanupTestData,
  createTestUser,
  createUnactivatedTestUser,
  login,
} from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

beforeAll(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

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

  it("409s no_password for an invited account that has never set one", async () => {
    // Such a user cannot log in (null hash), so mint their session directly —
    // the same function the login route calls after verifying credentials.
    const invited = await createUnactivatedTestUser("pw-none", "STUDENT");
    const issued = await issueSession(invited.id);
    expect(issued).not.toBeNull();

    const res = await request(app)
      .post("/api/v1/me/password")
      .set("authorization", `Bearer ${issued!.session.accessToken}`)
      .send({ currentPassword: "anything", newPassword: "a-whole-new-password" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("no_password");

    // And nothing was written.
    const row = await db.user.findUnique({ where: { id: invited.id }, select: { passwordHash: true } });
    expect(row?.passwordHash).toBeNull();
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

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern "me-routes|me-settings-routes"` → `me-routes`' updated assertion and every `me-settings-routes` case FAIL.

- [ ] **Step 2: Implement `me.ts`**

Replace the GET's body and add the writes:

```ts
import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
// Relative, not "@space/shared" — the rootDir emit trap (see routes/auth.ts).
import {
  changePasswordRequestSchema,
  updateProfileRequestSchema,
} from "../../../../packages/shared/src/index";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { hashToken, revokeAllRefreshTokensForUser } from "../lib/auth/tokens";
// The one 429 handler (ruling X4) — never a local copy.
import { rateLimitHandler } from "../lib/rate-limit";
import { requireAuth, requireUser } from "../middleware/require-auth";

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

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern "me-routes|me-settings-routes|auth-routes"` → PASS (the existing
`me-routes`/`auth-routes` cases stay green — the GET's response shape only
gained `hasPassword`, which Step 1 added to the one exact assertion, and the
soft-deleted null case).
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
    // The section heading. The submit button is titled "Update password" so
    // this exact-text query has exactly one match.
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
    fireEvent.press(screen.getByText("Update password"));

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
    fireEvent.press(screen.getByText("Update password"));

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
                title="Update password"
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

(`theme.colors.success[600]` exists in `src/theme/tokens.ts` — v1's semantic
ramp; `Screen` takes `edges`/`scroll`; `Button` variants are
`primary | secondary | ghost`. All verified against the tree.)

- [ ] **Step 4: Update `placeholder-screens.test.tsx`**

Read it; remove the `SettingsScreen` import and the `settings` row from its
placeholder list. Keep every other entry (`users` goes in Task 7). There is no
length assertion to adjust: Plan 1 Task 0 replaced the hardcoded count with
per-entry assertions (ruling X9), so removing a row is the whole change.

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
- Produces: `queryKeys.users.all/lists()/list(filters)/details()/detail(id: number | null)`; `useUsers(filters: { q: string }, options: { enabled: boolean }): UseInfiniteQueryResult<InfiniteData<UserListResponse>>`; `useSendInvite(): UseMutationResult<InviteState, Error, { userId: number }>` (Task 8 reuses both); the route push target `/user/[id]` (Task 8 creates the file — see its Step 1 ordering note).

- [ ] **Step 1: Add the query-key factory**

In `query-keys.ts`, a sibling of `sessions` (same spreading pattern):

```ts
  users: {
    all: ["users"] as const,
    lists: () => [...queryKeys.users.all, "list"] as const,
    list: (filters: { q: string }) => [...queryKeys.users.lists(), filters] as const,
    details: () => [...queryKeys.users.all, "detail"] as const,
    // Nullable, per this file's header convention (a null key never collides
    // with a real id) — not a -1 sentinel.
    detail: (id: number | null) => [...queryKeys.users.details(), { id }] as const,
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

/**
 * Cursor-paginated users list — the pagination v1's page never had (R84).
 *
 * `enabled` is required, not defaulted: the screen calls this hook before its
 * SUPER guard (hooks cannot sit behind an early return), and a non-SUPER must
 * not fire a request the API will 403 (CLAUDE.md "Data fetching" — queries
 * that depend on something nullable pass `enabled`).
 */
export function useUsers(
  filters: { q: string },
  options: { enabled: boolean },
): UseInfiniteQueryResult<InfiniteData<UserListResponse>> {
  return useInfiniteQuery({
    queryKey: queryKeys.users.list(filters),
    queryFn: ({ pageParam }) => fetchUsersPage(filters.q, pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: options.enabled,
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
          {`${item.email} · ${item.role}`}
        </Text>
        {/* The badge is its own Text node, so it is findable (and readable by
            a screen reader) as the status word alone. */}
        <Text variant="label" color={theme.colors.neutral[700]}>
          {STATUS_LABEL[item.status]}
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
  // `draft` is what the field shows; `q` is what was last submitted. Searching
  // on submit rather than per keystroke keeps a typed name from issuing one
  // request per character.
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const isSuper = role === "SUPER";

  const { data, isPending, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useUsers({ q }, { enabled: isSuper });

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
        <Input
          label="Search"
          value={draft}
          onChangeText={setDraft}
          placeholder="Name or email"
          returnKeyType="search"
          autoCapitalize="none"
          onSubmitEditing={() => setQ(draft.trim())}
        />
        {isPending ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="Couldn't load users." onRetry={() => void refetch()} />
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

`Screen` without `scroll` renders a plain `View` (its `scroll` prop defaults
off), which is what a `FlatList` needs — a `FlatList` inside a `ScrollView`
loses virtualisation. The requirement is a `FlatList` (not `.map`) so a large
install stays scrollable, per spec 11 §9's note on `/users`. Drop the explicit
`scroll={false}` if lint flags it as redundant.

- [ ] **Step 5: Update `placeholder-screens.test.tsx`, run everything**

Remove the `UsersScreen` import and the `users` row (no count to adjust —
ruling X9). Then:
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
- Run (no edits expected): `apps/mobile/src/__tests__/app-layout.test.tsx`, `apps/mobile/src/__tests__/role-tabs.test.tsx` — both derive from `DETAIL_ROUTE_NAMES` (ruling X9)
- Test: `apps/mobile/src/__tests__/user-detail-screen.test.tsx`

**Interfaces:**
- Consumes: `queryKeys.users.detail(id)`, `useSendInvite` (Task 7), `userDetailSchema`, `updateUserRequestSchema`, `ALUMNI_ONLY_ROLES`, types `UserDetail`/`UpdateUserBody` from `@space/shared`; `formatDate` from `../../src/lib/format`.
- Produces: `useUserDetail(id: number | null): UseQueryResult<UserDetail>`; `useUpdateUser(): UseMutationResult<UserDetail, Error, { userId: number; body: UpdateUserBody }>`; `useSetActivation(): UseMutationResult<ActivationResponse, Error, { userId: number; action: "deactivate" | "reactivate" }>`; the `/user/[id]` route in the typed tree (unblocks Task 7's typecheck); `DETAIL_ROUTE_NAMES` in `_layout.tsx` gaining `"user/[id]"`.

- [ ] **Step 1: Register the hidden route**

Append `"user/[id]"` to the exported `DETAIL_ROUTE_NAMES` const in
`(app)/_layout.tsx` (Plan 1 Task 2 created it; Plans 2, 4, 15, 16, 5 and 6 have
appended or renamed their own dynamic routes). That is the whole layout change: `app-layout.test.tsx`
derives its expectations — including `href: null` for every detail route —
from that exported constant (ruling X9, Plan 1 Task 0), so no test edits and
no counts. Then create the stub route file:

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
import {
  activationResponseSchema,
  userDetailSchema,
  type ActivationResponse,
  type UpdateUserBody,
  type UserDetail,
} from "@space/shared";
```

(merge with the existing import lines)

```ts
export function useUserDetail(id: number | null): UseQueryResult<UserDetail> {
  return useQuery({
    queryKey: queryKeys.users.detail(id),
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
  ActivationResponse,
  Error,
  { userId: number; action: "deactivate" | "reactivate" }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, action }) => {
      const res = await apiClient.post(`/api/v1/users/${userId}/${action}`);
      // Parsed, not discarded or cast (ruling X10).
      return activationResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}
```

Replace the stub screen with the full editor:

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
  // A null id disables the query (useUserDetail passes enabled: id !== null),
  // so a non-SUPER or a malformed param fires nothing.
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
                      borderColor: role === r ? theme.colors.brand.navy[900] : theme.colors.neutral[300],
                    }}
                  >
                    <Text variant="label" color={role === r ? theme.colors.brand.navy[900] : theme.colors.neutral[700]}>
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

(There is no `theme.colors.primary`; the brand ramp is
`theme.colors.brand.navy` — verified in `src/theme/tokens.ts`, and the same
navy `Button`'s primary variant uses.)

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
- Create: `apps/mobile/src/hooks/use-accept-invite.ts`
- Create: `apps/mobile/app/accept-invite.tsx` (outside `(app)`, beside `login.tsx` — anonymous)
- Modify: `apps/mobile/app/login.tsx` (add the "I have an invite code" link)
- Test: `apps/mobile/src/__tests__/accept-invite-screen.test.tsx`

**Interfaces:**
- Consumes: `apiClient` (the endpoint is anonymous; the request interceptor adds no header when no token is stored), `acceptInviteResponseSchema`, `passwordSchema`, `type AcceptInviteBody`, `type AcceptInviteResponse` from `@space/shared`, `Screen`/`Input`/`Button`/`Text` primitives, `useRouter`.
- Produces: `useAcceptInvite(): UseMutationResult<AcceptInviteResponse, Error, AcceptInviteBody>`; the `/accept-invite` route in the typed tree; a `Link`-shaped entry point from `/login`.

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

- [ ] **Step 2: Write the hook and the screen**

```ts
// apps/mobile/src/hooks/use-accept-invite.ts
import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import {
  acceptInviteResponseSchema,
  type AcceptInviteBody,
  type AcceptInviteResponse,
} from "@space/shared";

import { apiClient } from "../lib/api-client";

/**
 * POST /auth/accept-invite. Lives in src/hooks/ and parses the response with
 * the shared schema like every other call (CLAUDE.md "Data fetching"; ruling
 * X10) — an earlier draft posted inline from the screen and ignored the body.
 */
export function useAcceptInvite(): UseMutationResult<AcceptInviteResponse, Error, AcceptInviteBody> {
  return useMutation({
    mutationFn: async (body) => {
      const res = await apiClient.post("/api/v1/auth/accept-invite", body);
      return acceptInviteResponseSchema.parse(res.data.data);
    },
  });
}
```

```tsx
// apps/mobile/app/accept-invite.tsx
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { passwordSchema } from "@space/shared";

import { useAcceptInvite } from "../src/hooks/use-accept-invite";
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
  const [done, setDone] = useState(false);
  const acceptInvite = useAcceptInvite();

  const submit = () => {
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
    acceptInvite.mutate(
      { token: code.trim(), password },
      {
        onSuccess: () => setDone(true),
        // One message for every failure — the API deliberately tells us no
        // more (invalid_invite covers unknown/used/expired/ineligible alike).
        onError: () => setFailure("That invite is invalid or has expired. Ask for a new one."),
      },
    );
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
          loading={acceptInvite.isPending}
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
  4. **Password-change eviction:** in `routes/me.ts`'s `POST /password` transaction, replace the `revokeAllRefreshTokensForUser` call with `0` → `me-settings-routes.test.ts` "revokes every other session" fails (session A still rotates, `sessionsRevoked` is 0).
  5. **Last-SUPER guard:** in `lib/super-guard.ts`, make `isLastActiveSuper` return `false` unconditionally → `super-guard.test.ts` "is true only when the target is the sole active SUPER" fails. Then, separately, replace `lockActiveSuperIds(tx)` in `routes/users.ts`'s PATCH with a plain `tx.user.findMany({ where: { role: "SUPER", deletedAt: null }, select: { id: true } })` mapped to ids → no automated test can fail (the race needs two transactions interleaved on a DB with exactly two SUPERs, which shared staging never is); record in the report that this half is guarded by Decision 16's review argument, not a test.
  6. **429 envelope:** in `lib/rate-limit.ts`, replace the handler body with `res.status(429).send("Too many requests")` → `rate-limit.test.ts` fails on the body assertion.

- [ ] **Step 3: Emit-trap check (ruling X12 — all of `dist/`, not just routes)**

`grep -rn 'require("@space/shared")' apps/backend/dist/` → empty
(after `pnpm turbo build`). Any hit means a shared value import somewhere in
the backend — route, lib or query module — used the package name instead of
the relative path.

- [ ] **Step 4: Credential-leak sweep**

- `grep -rn "ChangeMe123" apps/backend/src apps/mobile packages/shared` → **only** test assertions (the login-refusal test uses the literal to prove it no longer works); no write path contains it.
- `grep -rn "issuedRaw\|invite.raw\|\.raw\b" apps/backend/src/routes/ apps/backend/src/lib/` → the raw invite code flows only into `sendInviteEmail(...)`; it appears in no `apiOk` call and in no `console.*` call anywhere in `routes/` **or `lib/`** (`lib/email.ts`'s `sendInviteEmail` must log neither `code` nor `email` — Decision 2).
- `grep -rn "console\." apps/backend/src/lib/email.ts apps/backend/src/lib/invites.ts` → read every hit; none interpolates `code`, `raw` or a token.
- `grep -rn "rateLimitHandler" apps/backend/src/` → exactly one definition (`lib/rate-limit.ts`); every other hit is an import (ruling X4).

- [ ] **Step 5: Report**

Suite counts, the four mutation outcomes, and the deferred-to-cutover list
(ruling C1 requires it named): nulling the live DB's `ChangeMe123!` hashes +
inviting those accounts (spec 11 D2 — operational step at cutover, not code);
sweeping used/expired `InviteToken`/`PasswordResetToken` rows and the missing
`PasswordResetToken.expiresAt` index (spec 11 D5 rec 4); audit columns for role
grants (spec 11 D7 rec 4); a per-invite attempts column that would allow the
short numeric code of spec 11 D10 (Decision 6). Plus the deferred-to-later-plans
list from Decision 15: notification preferences → Plan 9; student profile
self-edit (`/me/profile`, `/profile`) → Plan 14; forgot/reset password,
`/users/new` screen, bulk resend invites → Plan 17; avatar → deferred with
uploads. (Decision 15's ordering note is resolved: Plan 17 runs after this
plan.)

---

## Revision 2026-10-05

Applied from the plan review (`review-plans-07-13.md`) and the coordinator's cross-plan rulings. Every finding was checked against the current tree before it was applied.

- **B1** `useUsers` now takes `{ enabled }`; the users screen passes `enabled: isSuper`, so a non-SUPER fires no request (Task 7).
- **B2** The settings screen's submit button is "Update password". The heading "Change password" is now the only match for its exact-text query (Task 6).
- **B3** The users-list status badge is its own `Text` node, so `getByText("Active")` finds it (Task 7).
- **B4** The settings integration cases moved to a new fixture-based `me-settings-routes.test.ts`. That avoids redeclaring `me-routes.test.ts`'s local `PASSWORD`. The old file's exact `toEqual` gains `hasPassword: true`. The `no_password` case, which was prose, is now written out (Task 5).
- **B5** The list tests are fixture-scoped. The status test uses `q=space-v2-test-`. The paging test uses three `page-probe-*` users and asserts exact pages (Task 2).
- **S1** Raw invite codes are never logged, in any environment (Decision 2 rewritten). `NODE_ENV` defaults to `development`, so the old dev-only log would have leaked live codes from production. Send-failure logs carry the user id, not the address or the code. The leak sweep now greps `lib/` as well as `routes/`, and the integration suite stubs the mailer.
- **S2** The last-SUPER guard is concurrency-safe. New `lib/super-guard.ts` provides `lockActiveSuperIds`, which runs `SELECT … FOR UPDATE`, and a pure `isLastActiveSuper`. PATCH and deactivate both use it inside one transaction. Deactivate had been counting outside any transaction. The guard has a unit test and a mutation entry (Decision 16, Task 3).
- **S3** The code is kept long and recorded as a deliberate divergence from spec 11 D10. The schema has no attempts column, so a short code cannot be protected. The email now states the real expiry via Plan 3's `formatInOrgTime` (Decision 6).
- **S4 / X15** Student profile self-edit now belongs to **Plan 14**, ending the Plan 5 ↔ Plan 7 ping-pong. Forgot/reset password, `/users/new` and bulk resend belong to **Plan 17**. Avatar is deferred with uploads (Decision 15).
- **S5** PATCH `/users/:id` and `POST /users/:id/invite` now answer through the same `loadUserDetail` builder that GET uses, with a parity test.
- **S6** Accept-invite goes through a `useAcceptInvite` hook that parses `acceptInviteResponseSchema`. `useSetActivation` parses `activationResponseSchema` (ruling X10).
- **S7 / X9** Placeholder steps only remove rows, because Plan 1 removed the hardcoded count.
- **X4** This plan extracts `lib/rate-limit.ts` (`rateLimitHandler`, unit-tested) and deletes `routes/auth.ts`'s copy (Task 4 Step 0). `me.ts` imports it. As a result, Task 5 now runs after Task 4.
- **X5** `usersRouter` keeps router-level `requireAuth` because it owns `/api/v1/users` exclusively. Every other route attaches it per route.
- **X12** The relative-import rule covers every backend file, and the emit check greps all of `dist/`.
- **Nits fixed:**
  - `logout-all` is no longer called anonymous.
  - `LIVE_INVITE` is renamed `liveInviteWhere`.
  - `theme.colors.primary` (which does not exist) is replaced with `brand.navy[900]`.
  - Accept-invite has its own limiter.
  - Search runs on submit.
  - The `roleFilter as never` cast is removed.
  - `-1` query-key sentinel is replaced with `null`.
- **Not done here (rulings):** `/more` is built by Plan 1 (X15), not this plan.
- **Open for the coordinator:** the rulings place Plan 17 before Plan 7, but Plan 17 consumes this plan's `POST /users`, `POST /users/:id/invite`, `issueInvite`, `passwordSchema`, `hashToken` and `lib/rate-limit.ts` (Decision 15).

Cross-plan consistency pass (execution order 1 → 2 → 3 → 4 → 15 → 16 → 5 → 6 → 7 → 17 → 14 → 8 → …):
- Added a `Depends on` header (Plans 1, 3, 16; 17 and 14 run after and consume this plan).
- Decision 15's ordering note and the closing-gate repeat marked resolved (Plan 17 runs after Plan 7); the "Open for the coordinator" item above is closed by the same order.
- New Decision 17: Plan 16's `GET /groups/leader-options` / `useLeaderOptions` are kept, not repointed at the SUPER-only `GET /users?role=`.
- New Decision 18 + a note at Task 4 Step 3: `confirmSuper` on `POST /users` is added later by Plan 17 (no behaviour change here).
- Task 8 wording: `DETAIL_ROUTE_NAMES` always exists (Plan 1); entries from Plans 2/4/15/16/5/6 precede this one.
