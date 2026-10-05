# Plan 10 — Students & Accounts Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four gaps Plans 7 and 9 named and handed here (coverage audit G13–G16, ruling X15). First, the student lifecycle: create, edit, graduate, drop and soft-delete, each on a mobile screen or bottom sheet, with credentials coming only from Plan 9's invite path. Second, forgot/reset password, which v1 users rely on and which must exist before cutover. Third, the `/users/new` screen. Fourth, a bulk "send all pending invites" action that a single HTTP request can survive.

**Architecture:** No new route files. All backend changes extend existing modules:
- `routes/students.ts` (Plan 7) gains `POST /:id/graduate` and `DELETE /:id`. Its `POST /` now mints an invite in the transaction that creates the student.
- `routes/users.ts` (Plan 9) gains `GET`/`POST /invites/pending`. Its `POST /` now requires `confirmSuper` before granting SUPER, and its reactivate also clears the student-profile stamp.
- `routes/auth.ts` gains two anonymous routes, `forgot-password` and `reset-password`.
- Three new library modules hold the logic: `lib/auth/password-reset.ts`, `lib/audit.ts` and `lib/concurrency.ts`. `lib/invites.ts` (Plan 9) gains the bounded batch sender.

Reset tokens use v1's exact format and v1's existing `PasswordResetToken` table, hashed with the same SHA-256 `hashToken` that refresh and invite tokens use. No schema is touched.

On mobile:
- Plan 7's `student/[id].tsx` moves to the directory form (`student/[id]/index.tsx`, ruling X7) so that `student/[id]/edit.tsx` can sit beside it.
- `students/new.tsx` joins the existing `students/` directory.
- `users.tsx` becomes `users/index.tsx` so that `users/new.tsx` can sit beside it. This adds `"users"` to the `DIRECTORY_ROUTE_HREFS` set Plan 6 introduced (the mechanism Plan 17 Step 0 describes), so Plan 17 finds the work done.
- Two anonymous screens, `forgot-password.tsx` and `reset-password.tsx`, sit beside `login.tsx`.
- A new `Sheet` primitive carries the graduate and drop bottom sheets.

**Tech Stack:** Express 5, Prisma 7 (`src/generated/prisma`), bcryptjs, express-rate-limit, nodemailer, Zod contracts in `packages/shared`, jest + supertest integration suite against the shared staging DB; Expo SDK 54 / expo-router 6 (typed routes), React Query 5, Zustand 5, RNTL 13 via `renderWithProviders`.

**Spec:**
- `docs/superpowers/specs/domains/06-students.md`, especially:
  - §3 R48, R55–R63, R64–R68 and R85–R88
  - §6 and §7 (the `DELETE /students/:id` and `POST /students/:id/graduate` rows)
  - §9 rows 5–7
  - §10 D7, D10, D13 and D15
- `docs/superpowers/specs/domains/11-invites-users.md`, especially:
  - §3 R14–R20, R41–R43 and R64–R80
  - §6 `requestPasswordReset` / `resetPassword`
  - §7: the `forgot-password` and `reset-password` rows, and the "Bulk invite must not be a synchronous loop" note
  - §9 rows 2, 5 and 6
  - §10 D5, D6, D7 and D8
- `docs/superpowers/specs/domains/18-settings.md` R29
- `docs/superpowers/specs/domains/_DECISIONS.md` C1, C7, C8 and C11
- Coverage audit G13–G16

**Depends on (all earlier in the execution order 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → **10** → 11 → …):**
- **Plan 1:** `DETAIL_ROUTE_NAMES` and the derived layout tests (X9), the `makeSession`/`makeUser`/`makeScopes` test helpers, and `ambiguousRouteSiblings`.
- **Plan 3:** `formatInOrgTime` in `lib/org-time.ts`.
- **Plan 4:**
  - `useSeasons(enabled)` in `src/hooks/use-seasons.ts`
  - `apiErrorMessage` in `src/lib/api-error.ts`
  - `formatDayKey` in `src/lib/format.ts`
- **Plan 5:** `isoDaySchema` in `packages/shared/src/org-time.ts`, which `isDateOnly` delegates to. Plan 5's `wallTimeSchema` and `orgWallClockToInstant` are not needed, because nothing here has a wall clock.
- **Plan 6:** the `DIRECTORY_ROUTE_HREFS` set in `app/(app)/_layout.tsx` (`["students", "seasons"]`), which Task 9 extends with `"users"`. Nothing here creates or reads sessions, so Plan 6's `startDay`/`startTime` session wire format does not touch this plan.
- **Plan 7:**
  - `routes/students.ts` with `POST /`, `PATCH /:id`, `POST /:id/enrollments` and `PATCH /:id/enrollments/:seasonId`
  - `canEditStudent`
  - the `student.ts` contracts
  - `use-students.ts` (`useStudentList`, `useStudentDetail`, `StudentDetail`)
  - `queryKeys.students`
  - `StudentList`
  - `student/[id].tsx`
  - `students-routes.test.ts` and its fixture block
- **Plan 9:**
  - the endpoints `POST /api/v1/users` and `POST /api/v1/users/:id/invite`
  - from `lib/invites.ts`: `issueInvite`, `IssuedInvite`, `InviteWriter`
  - from `lib/email.ts`: `sendInviteEmail`, plus its private `isConfigured`/`getTransporter`/`renderShell`/`fromAddress`
  - from `lib/auth/tokens.ts`: `hashToken`, `revokeAllRefreshTokensForUser`
  - from `lib/rate-limit.ts`: `rateLimitHandler`
  - from `routes/users.ts`: `requireSuper`, `liveInviteWhere`
  - the shared contracts `passwordSchema`, `createUserRequestSchema` and `ALUMNI_ONLY_ROLES`
  - the fixture `createUnactivatedTestUser`
  - the mobile hooks `useUsers` and `useSendInvite`, and `queryKeys.users`
  - the screens `users.tsx`, `user/[id].tsx`, `accept-invite.tsx`, and the "I have an invite code" link on `login.tsx`

## Global Constraints

- **No migrations, no schema edits (rulings C1, X14).** Nothing under `apps/backend/prisma/` changes. Every column this plan touches exists and was verified against `apps/backend/prisma/schema.prisma`:
  - `User`: `deletedAt`, `graduationYear`, `passwordHash String?`, and the relations `invitesReceived` and `passwordResetTokens` (lines 103–164)
  - `StudentProfile`: `deletedAt` and `activeSeasonId` (lines 214–236)
  - `SeasonEnrollment`: `status`, `completedAt`, `droppedAt` and `dropReason`
  - `InviteToken` (lines 166–179)
  - `PasswordResetToken { token String @unique, userId, expiresAt, usedAt, createdAt }` (lines 198–208)
  - `RefreshToken.revokedAt`
- **Passwords are bcryptjs at cost 12** (CLAUDE.md; spec 11 D8; Plan 9's rule). Any other algorithm locks out every user.
- **No raw credential in any HTTP response body or any log, in any environment.** This covers invite codes and reset tokens. A reset token reaches exactly one place: `sendPasswordResetEmail`. An invite code reaches exactly one place: `sendInviteEmail` (Plan 9 Decision 2).
- No `process.env` outside `lib/config.ts`. No `@/` alias. No `@prisma/client` import. Prisma comes from `../generated/prisma/client` (X14).
- **Shared value imports in every backend `src` file use the relative path (ruling X12).** From `src/routes/` and `src/lib/` it is `"../../../../packages/shared/src/index"`. Add one more `../` from `src/lib/auth/`. `import type` may use `"@space/shared"`.
- **One 429 handler (X4).** Every new limiter passes `handler: rateLimitHandler` imported from `lib/rate-limit.ts`. Nothing defines another handler.
- **X5.** `studentsRouter` and `usersRouter` own their prefixes outright, so their existing router-level `use(requireAuth)` stays (Plans 7 and 9). Every new route in `authRouter` is anonymous by design and attaches nothing.
- **X10.** Every mobile mutation and query parses its response with a shared Zod schema. There is no `as T` on any API response.
- **X13.** Any wall-clock value shown in an email goes through `formatInOrgTime`. A date of birth is a calendar date with no wall clock; Decision 8 says how it moves without the device timezone.
- **X1.** None of this plan's writes produces a notification. v1's graduate, drop and soft-delete notify nobody (spec 06 §6 "No write in this domain sends a notification"), and neither does v2's. No link format is written, so Plan 13's `NOTIFICATION_LINK_PATTERNS` and Plan 18's M4 backfill are unaffected.
- Response envelope is `{ data }` / `{ error: { code, message } }` via `apiOk`/`apiError`. `src/docs/openapi.ts` changes in the same commit as the route it documents.
- **Integration fixtures.** Every row carries the `space-v2-test-` prefix in `User.email` or `Season.code`. Use `__tests__/integration/fixtures.ts` and set `jest.setTimeout(60000)`. **The staging DB holds real never-activated users** (spec 11 R15: v1's CSV import produces exactly that state). No test may run an unscoped bulk invite. Task 4's suite forces the fixture scope through a `jest.mock` wrapper and says so in a comment.
- **Integration tests run serially and are run by the coordinator.** The command is `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern <suite>`. When tasks run one at a time (the default), each task runs its own suite. If backend tasks are ever split across agents, the agents write their tests without running them and the coordinator runs every suite serially.
- **Mobile conventions:**
  - relative imports only
  - map states to `LoadingState`, `ErrorState` (with `onRetry`) and `EmptyState`
  - tab-group screens pass `edges={["top","left","right"]}`
  - tests use `renderWithProviders`, query `Input` fields with `getByLabelText` and assert errors via `accessibilityHint`
  - `jest.mock` factories close only over consts named `mock*`
  - typed routes are on: never use `as Href` or `as any`, and run `pnpm turbo routes:generate --filter=@space/mobile` after any route file moves or appears
- **X9.** A new hidden route means appending to `DETAIL_ROUTE_NAMES`, and a moved one means editing its entry. Nobody edits a count.

## Decisions this plan locks in

1. **Student creation goes through Plan 9's invite path, in the creating transaction (spec 06 D7, spec 11 §7 "creation and invitation are ONE operation").** Plan 7's `POST /students` already writes `passwordHash: null`. This plan adds `issueInvite(tx, student.id, caller)` inside the same `$transaction` and `sendInviteEmail` after commit, best-effort. That is exactly the shape of Plan 9's `POST /users`.
   - **No shared default password exists anywhere.** v1's `ChangeMe123!` (R41/R42/R43) is not ported, and neither is its log line or its on-screen notice.
   - The `issueInvite` call sits **after** the rows are written and **outside** the user/profile/enrollment block. Plan 17 extracts that block into `createStudentRows`, so the call stays in the route handler. Plan 17's importer therefore still sends nothing (its R55).
2. **Graduation completes every `ACTIVE` enrollment, not only the one the profile points at.** This deliberately diverges from v1's R48/R60, which the spec flags as a defect: "a student enrolled in three seasons graduates with two of them left `ACTIVE`". Leftover `ACTIVE` rows keep an alumnus on rosters and in at-risk counts, and through R53 they keep season access.
   - In one transaction it sets `graduationYear`, completes every `ACTIVE` enrollment with `completedAt`, and clears `activeSeasonId` (R56).
   - Enrollments that are already `WITHDRAWN` or `COMPLETED` are untouched.
   - Only SUPER may graduate (R55).
   - The year is bounded per request (R58 fixed).
   - A second graduation is `409 already_graduated`, because graduation is irreversible (R61) and must not be silently overwritten.
   - `role` stays `STUDENT` (R57).
   - The `GroupStudent` row is untouched (C9: it is advisory).
   - No refresh tokens are revoked. The alumnus nav reaches the device on the next rotation, at most 900 s later (spec 11 R12). Graduation removes no authority that needs evicting.
3. **Soft delete is one transaction that also signs the student out.** `DELETE /students/:id` (SUPER only) does three things inside one `$transaction`: it stamps `User.deletedAt`, stamps `StudentProfile.deletedAt`, and revokes every refresh token. This fixes R86, where v1 ran two separate statements, and applies spec 11 D6's "deactivation revokes".
   - **Nothing cascades (R87 kept).** Enrollments, attendance, submissions and notes are history and survive.
   - A non-student, an unknown id and an already-deleted id all get `404 not_found`.
   - v1 has no un-delete (R88), but v2 does: Plan 9's `POST /users/:id/reactivate`. This plan amends it to clear the profile stamp too. Without that, a reactivated student stays "deleted" to v1's readers (`jpc-space/src/app/admin/quizzes/page.tsx:31` counts profiles with `deletedAt: null`).
4. **The audit trail is log lines, because the schema can't hold one yet (spec 06 D15).** `lib/audit.ts` `auditLog(op, actorId, subjectId)` writes `[audit] <op> actor=<id> subject=<id>` for `student.graduate`, `student.delete`, `enrollment.drop` and `enrollment.complete`. The last two are added to Plan 7's transition handler. The line never carries a field value: no year, no reason, no name. Audit columns are a post-cutover migration (spec 06 D15) and are recorded in the report.
5. **Route names follow the existing tree, with one directory conversion.**
   - `/students/new` goes in the existing `students/` directory (spec 06 §9).
   - The edit route is `/student/[id]/edit`. It is singular because Plan 7's detail lives at `student/[id]`, and it is not the spec's `/students/[id]/edit` because a `students/[id]` would shadow `students/alumni` and `students/dropped`. Under X7 it forces `student/[id].tsx` to become `student/[id]/index.tsx`.
   - `/users/new` follows spec 11 §9 and needs `users.tsx` to become `users/index.tsx`. Plan 1's `ambiguousRouteSiblings` test forbids `users.tsx` beside a `users/` directory. The conversion adds `"users"` to Plan 6's `DIRECTORY_ROUTE_HREFS` set (Plan 17 Step 0's mechanism, keeping Plan 6's `"seasons"`), so Plan 17's "check first, never twice" finds it done.
6. **Mobile action visibility mirrors the server gates exactly, with role and claim together (C7).**

   | Action | Shown when | Mirrors |
   |---|---|---|
   | Graduate | SUPER, and the student has no graduation year yet | R55, R63 |
   | Delete | SUPER | — |
   | Edit | SUPER, or ADMIN with an ACTIVE enrollment in one of their seasons | Plan 7's enrollment-based `canEditStudent` |
   | Drop, per enrollment row | the row is ACTIVE and the viewer is SUPER, or is ADMIN with that row's season in `seasonAdminIds` | R64, fixing R68's buttons that 403 |

   Only a SUPER edit form shows the active-season picker. Its options are the student's ACTIVE enrollments only, and `activeSeasonId` is sent only when it changed. Re-sending a legacy pointer that has no ACTIVE enrollment would 409 `not_enrolled` (Plan 7 S16).
7. **Bottom sheets are a new `Sheet` primitive** (`src/ui/Sheet.tsx`, built on an RN `Modal` with `animationType="slide"`, transparent, anchored to the bottom and padded for the bottom inset). Graduate and drop use it. Delete is a destructive `Alert` confirm, the same pattern as Plan 9's deactivate. The new-user SUPER confirmation also mirrors Plan 9's PATCH confirm.
8. **Date of birth is a calendar date and moves without the device timezone (X13).** The form takes `YYYY-MM-DD`. The client writes `YYYY-MM-DDT00:00:00.000Z` (`isoFromDateOnly`). Reads go through `dateOnlyFromIso`, which adds 12 hours and truncates to the UTC day. That maps any local-midnight instant from a zone between UTC−11 and UTC+12 to its own calendar day. That covers v1's rows, which v1's web date picker stored as browser-local midnight (Cairo: `…T22:00:00Z` the previous day), as well as v2's UTC-midnight rows. The detail screen renders the result with Plan 4's `formatDayKey`, which never converts zones. Both helpers live in `packages/shared/src/student.ts` and have unit tests.
9. **Forgot/reset keeps v1's token format and storage byte for byte, so the two backends interoperate.** v1's format is 32 random bytes as 64 hex characters (R71), stored as its SHA-256 hex digest in `PasswordResetToken.token` (R72), with a 1-hour TTL (R73). v2's `hashToken` is the same SHA-256 hex, so a token v1 minted works at v2's endpoint and vice versa, and no schema change is needed. On top of that format, v2 adds:
   - **One live reset token per user.** Issuing a new one expires the old ones (spec 11 D5 rec 2, fixing R76).
   - **A 60 s per-account cooldown.** A request inside it mints nothing, which stops mail-bombing a victim from many IPs.
   - **A constant response, with the work done after it is sent** (`void requestPasswordReset(...)`). This closes R69's timing oracle: v1 awaited SMTP only on the known-email path.
   - **One opaque failure code**, `400 invalid_reset_token`, for unknown, used and expired tokens and for a deleted target (spec 11 D5 rec 3, closing R77/R78). It is 400 and not 401 because the mobile interceptor spends a refresh rotation on any non-auth 401 (Plan 9 Decision 10).
   - **A cost-12 hash.**
   - **Completion revokes:** it consumes the token atomically with a guarded `updateMany`, expires the user's other live reset tokens and live invites, and revokes every refresh token, all in one transaction. This fixes R79 and implements spec 11 D6.
   - **A deleted account is refused at completion as well as at request.** v1 checked only at request (R70).
   - **An unactivated account may reset, as in v1** (R70 refuses only deleted accounts). This activates the account. Proving possession of the mailbox is exactly what an invite proves.
   - **With no mail transport, `requestPasswordReset` mints nothing.** A token nobody can receive is a liability, not a service.
10. **The reset email carries a deep link and the code. v1's web reset URL is deliberately not kept alive after cutover.**
    - The email offers `spacev2://reset-password?token=<code>`. The scheme comes from the new `MOBILE_APP_SCHEME` config, default `spacev2`, which matches `app.json`. The code is printed beneath it for mail clients that don't linkify custom schemes.
    - This diverges from Plan 9 Decision 6 (code only) on purpose. A custom-scheme link is never fetched over HTTP, so R24's exposures don't arise: proxy and CDN logs, `Referer` headers and browser history. The credential also lives 1 hour, not 7 days.
    - The screen copies the token into component state and immediately calls `router.setParams({ token: undefined })` (R80: never re-emit it into a URL).
    - **v1 compatibility:** a v1 email links to `${AUTH_URL}/reset-password?token=…` on v1's web host. During coexistence that link opens v1's still-running page, which writes the same table. After cutover the link is dead. That is acceptable because every such link expires 1 hour after v1 last sent one, so Plan 18 need not host a web `/reset-password` page or universal links.
    - The mobile screen also accepts a **pasted** v1 link, through `extractResetToken`, because the token formats are identical.
11. **Rate limits use their own buckets** (the precedent is Plan 9's `acceptInviteLimiter`):
    - `forgotPasswordLimiter`: 10 per 15 min per IP
    - `resetPasswordLimiter`: 20 per 15 min
    - `bulkInviteLimiter`: 30 per hour
12. **Bulk invites run as bounded synchronous batches, not through a queue.** Spec 11 §7 says "accept the batch, return the counts, queue the sends". v2 has no queue or worker, and a durable job table is a migration (C1), so this plan builds the safe synchronous version:
    - **`POST /api/v1/users/invites/pending`** processes at most `BULK_INVITE_BATCH_SIZE = 20` pending users per request, oldest id first.
    - **Each user gets one short transaction.** It row-locks the user (`SELECT … FOR UPDATE`), re-checks eligibility, then calls `issueInvite`. A double-tap or two SUPERs racing therefore skip rather than re-mint.
    - **Mail goes out after the commits**, with concurrency `BULK_INVITE_MAIL_CONCURRENCY = 5`. At about 1–2 s per Gmail SMTP send, one request does at most 4 rounds and fits under the client's raised 60 s timeout.
    - **A mail failure expires the invite just minted**, so that person stays pending and the next tap retries them. v1 left them silently "invited" with a code nobody received (R25).
    - **The response is `{ sent, skipped, failed, remaining }`** (spec R16's missing counter, plus `remaining`). The screen says "tap again for the rest".
    - **With no mail transport the route refuses with `503 email_not_configured`.** Otherwise it would mint invites nobody receives and drain the pending pool.
    - **"Pending" means:** not deleted, `passwordHash` null, `lastLoginAt` null, and no live **v2** invite. A live v1 plaintext invite counts as pending, because Plan 9 Decision 4 makes those dead on arrival.
    - **Throughput is capped** by the batch ceiling plus the 30-per-hour limiter at 600 per hour. That stays under Gmail's 2,000 per day Workspace cap unless driven continuously, and the report names the cap.
    - **`GET /api/v1/users/invites/pending` → `{ pending }`** feeds the button's count. R87: the button is hidden at zero.
    - **This diverges from the spec's shape** (`POST /users/invites` with `{ userIds } | { all: true }`). The `userIds` arm has no remaining caller: v1's single-row button is Plan 9's `POST /users/:id/invite`, and v1's post-import send is dropped by Plan 17 (R55). A body whose only legal value is `{ all: true }` is ceremony.
13. **`POST /users` requires `confirmSuper: true` to create a SUPER.** This is spec 11 D7 rec 3. Plan 9 enforced it only on PATCH, which left creation as the mis-tap path. The error code is the same as Plan 9's: `400 confirm_super_required`. The `/users/new` screen asks through an `Alert` before sending the flag.
14. **A password change also expires outstanding reset tokens.** This is spec 18 R29 and spec 11 D6. It adds one line inside Plan 9's `POST /me/password` transaction, which already revokes the other sessions.
15. **Not in this plan. Each item has a named owner so nothing drops silently:**
    - **Deferred with uploads** (CLAUDE.md "Uploads are switched off"): student photo and documents, G22. Plan 18 records them in its register.
    - **Plan 11:** `GET/PATCH /me/profile` and `/profile`.
    - **Plan 18's register:**
      - a per-season bulk close-out of enrollments (spec 06 D10 — a product decision with no owner yet)
      - audit columns (spec 06 D15)
      - a durable job queue for invites (spec 11 §7)
      - the `PasswordResetToken.expiresAt` index and the token sweep (spec 11 D5 rec 4)
    - **Dropped by ruling:**
      - un-graduate (R61: v1 never had one)
      - spec 11's `{ userIds }` bulk arm (Decision 12)
      - the student self-edit branch of v1's `StudentForm`, which belongs to Plan 11

**Execution shape:** Task 1 runs first, because everything consumes the contracts. After that there are two streams.

- **Backend, Tasks 2 → 3 → 4 → 5, strictly sequential.** Tasks 2 and 3 share `routes/students.ts` and one suite. Tasks 4 and 5 both touch `lib/email.ts` and `src/docs/openapi.ts`. Task 3 also edits Task 4's file, `routes/users.ts`, but only its reactivate handler.
- **Mobile, Tasks 6 → 7 → 8 → 9 → 10, strictly sequential.** They share `_layout.tsx`, `use-students.ts` and `use-users.ts`.

The two streams may run in parallel, because the screens mock `apiClient`. Task 11 is the coordinator's closing gate. When tasks run one at a time in order (the default), none of this needs thought.

---

### Task 1: Contracts — lifecycle, bulk-invite and password-reset schemas

**Files:**
- Modify: `packages/shared/src/student.ts` (Plan 7's — append the lifecycle schemas and the date-only helpers)
- Modify: `packages/shared/src/user.ts` (Plan 9's — `confirmSuper` on create; response schemas; batch constant)
- Create: `packages/shared/src/password-reset.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from "./password-reset";`)
- Test: `packages/shared/src/__tests__/student-lifecycle-schemas.test.ts` (new), `packages/shared/src/__tests__/password-reset-schemas.test.ts` (new), extend `packages/shared/src/__tests__/user-schemas.test.ts` (Plan 9's)

**Interfaces:**
- Consumes: `enrollmentStatusSchema` (already imported by `student.ts`), Plan 5's `isoDaySchema` (`packages/shared/src/org-time.ts`), Plan 9's `passwordSchema`, `createUserRequestSchema`.
- Produces (exact names later tasks import):
  - `graduateStudentRequestSchema` → `GraduateStudentBody`
  - `graduateStudentResponseSchema` → `GraduateStudentResponse`
  - `studentDeletedResponseSchema` → `StudentDeletedResponse`
  - `createStudentResponseSchema` → `CreateStudentResponse`
  - `updateStudentResponseSchema` → `UpdateStudentResponse`
  - `enrollmentTransitionResponseSchema` → `EnrollmentTransitionResponse`
  - `isDateOnly(value: string): boolean`, `isoFromDateOnly(day: string): string`, `dateOnlyFromIso(iso: string | null): string | null`
  - `createUserRequestSchema` gaining `confirmSuper?: boolean`
  - `createUserResponseSchema` → `CreateUserResponse`
  - `pendingInvitesResponseSchema` → `PendingInvitesResponse`
  - `bulkInviteResponseSchema` → `BulkInviteResponse`
  - `BULK_INVITE_BATCH_SIZE` (20)
  - `forgotPasswordRequestSchema` → `ForgotPasswordBody`
  - `resetPasswordRequestSchema` → `ResetPasswordBody`
  - `passwordResetAckSchema` → `PasswordResetAck`
  - `PASSWORD_RESET_TTL_MINUTES` (60)
  - `extractResetToken(input: string): string`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/shared/src/__tests__/student-lifecycle-schemas.test.ts
import {
  createStudentResponseSchema,
  dateOnlyFromIso,
  enrollmentTransitionResponseSchema,
  graduateStudentRequestSchema,
  graduateStudentResponseSchema,
  isDateOnly,
  isoFromDateOnly,
  studentDeletedResponseSchema,
  updateStudentResponseSchema,
} from "../index";

describe("graduateStudentRequestSchema", () => {
  const thisYear = new Date().getFullYear();

  it("accepts 1990 through the current year, evaluated per call (R58 — v1 captured the year at module load)", () => {
    expect(graduateStudentRequestSchema.safeParse({ graduationYear: 1990 }).success).toBe(true);
    expect(graduateStudentRequestSchema.safeParse({ graduationYear: thisYear }).success).toBe(true);
    expect(graduateStudentRequestSchema.safeParse({ graduationYear: thisYear + 1 }).success).toBe(false);
    expect(graduateStudentRequestSchema.safeParse({ graduationYear: 1989 }).success).toBe(false);
  });

  it("speaks the bound in its message, so the sheet can show it verbatim", () => {
    const res = graduateStudentRequestSchema.safeParse({ graduationYear: 1989 });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toBe(`Enter a year between 1990 and ${thisYear}.`);
    }
  });

  it("refuses a fractional year and an unknown key", () => {
    expect(graduateStudentRequestSchema.safeParse({ graduationYear: 2020.5 }).success).toBe(false);
    expect(
      graduateStudentRequestSchema.safeParse({ graduationYear: 2020, role: "LEADER" }).success,
    ).toBe(false);
  });
});

describe("lifecycle response schemas (ruling X10 — the client parses, never casts)", () => {
  it("parse the shapes the routes return", () => {
    expect(
      graduateStudentResponseSchema.safeParse({ id: 1, graduationYear: 2020, enrollmentsCompleted: 2 }).success,
    ).toBe(true);
    expect(
      studentDeletedResponseSchema.safeParse({ id: 1, deletedAt: "2099-01-01T00:00:00.000Z" }).success,
    ).toBe(true);
    expect(createStudentResponseSchema.safeParse({ id: 1, email: "a@jpc.test" }).success).toBe(true);
    expect(updateStudentResponseSchema.safeParse({ id: 1 }).success).toBe(true);
    expect(enrollmentTransitionResponseSchema.safeParse({ id: 9, status: "WITHDRAWN" }).success).toBe(true);
    expect(enrollmentTransitionResponseSchema.safeParse({ id: 9, status: "DROPPED" }).success).toBe(false);
  });
});

describe("date-only helpers (Decision 8 — a birthday has no wall clock)", () => {
  it("isDateOnly accepts real YYYY-MM-DD days only", () => {
    expect(isDateOnly("2004-02-29")).toBe(true);
    expect(isDateOnly("2003-02-29")).toBe(false);
    expect(isDateOnly("2004-2-3")).toBe(false);
    expect(isDateOnly("not a date")).toBe(false);
  });

  it("isoFromDateOnly writes UTC midnight", () => {
    expect(isoFromDateOnly("2004-03-09")).toBe("2004-03-09T00:00:00.000Z");
  });

  it("dateOnlyFromIso reads v2's UTC midnight back to the same day", () => {
    expect(dateOnlyFromIso("2004-03-09T00:00:00.000Z")).toBe("2004-03-09");
  });

  it("dateOnlyFromIso recovers v1's browser-local midnights (Cairo winter, Cairo summer, US east)", () => {
    expect(dateOnlyFromIso("2004-03-08T22:00:00.000Z")).toBe("2004-03-09");
    expect(dateOnlyFromIso("2004-07-08T21:00:00.000Z")).toBe("2004-07-09");
    expect(dateOnlyFromIso("2004-03-09T05:00:00.000Z")).toBe("2004-03-09");
  });

  it("dateOnlyFromIso passes null through and refuses garbage", () => {
    expect(dateOnlyFromIso(null)).toBeNull();
    expect(dateOnlyFromIso("nope")).toBeNull();
  });
});
```

```ts
// packages/shared/src/__tests__/password-reset-schemas.test.ts
import {
  PASSWORD_RESET_TTL_MINUTES,
  extractResetToken,
  forgotPasswordRequestSchema,
  passwordResetAckSchema,
  resetPasswordRequestSchema,
} from "../index";

const TOKEN = "ab".repeat(32); // v1's format: 32 random bytes as 64 hex chars (R71)

describe("forgotPasswordRequestSchema", () => {
  it("trims, requires an email, and refuses anything else in the body", () => {
    expect(forgotPasswordRequestSchema.parse({ email: "  a@jpc.test " }).email).toBe("a@jpc.test");
    expect(forgotPasswordRequestSchema.safeParse({ email: "nope" }).success).toBe(false);
    expect(forgotPasswordRequestSchema.safeParse({ email: "a@jpc.test", userId: 1 }).success).toBe(false);
  });
});

describe("resetPasswordRequestSchema", () => {
  it("takes a token and the ONE shared password policy (spec 11 R65)", () => {
    expect(resetPasswordRequestSchema.safeParse({ token: TOKEN, password: "longenough" }).success).toBe(true);
    expect(resetPasswordRequestSchema.safeParse({ token: TOKEN, password: "short" }).success).toBe(false);
    expect(resetPasswordRequestSchema.safeParse({ token: "tiny", password: "longenough" }).success).toBe(false);
  });
});

describe("extractResetToken", () => {
  it("returns a bare code unchanged, trimmed", () => {
    expect(extractResetToken(`  ${TOKEN}\n`)).toBe(TOKEN);
  });

  it("pulls the token out of a pasted v1 web link (Decision 10 — v1 emails stay usable by paste)", () => {
    expect(extractResetToken(`https://space.example.org/reset-password?token=${TOKEN}`)).toBe(TOKEN);
  });

  it("pulls it out of v2's app link and decodes percent-encoding", () => {
    expect(extractResetToken(`spacev2://reset-password?token=${TOKEN}&x=1`)).toBe(TOKEN);
    expect(extractResetToken("spacev2://reset-password?token=a%2Bb")).toBe("a+b");
  });
});

describe("passwordResetAckSchema / TTL", () => {
  it("is the constant acknowledgement both endpoints return", () => {
    expect(passwordResetAckSchema.safeParse({ ok: true }).success).toBe(true);
    expect(passwordResetAckSchema.safeParse({ ok: false }).success).toBe(false);
  });

  it("states v1's 1-hour TTL (R73) in one place the screens can quote", () => {
    expect(PASSWORD_RESET_TTL_MINUTES).toBe(60);
  });
});
```

Append to Plan 9's `packages/shared/src/__tests__/user-schemas.test.ts` (add the
new names to its `../index` import):

```ts
describe("createUserRequestSchema.confirmSuper (Plan 10 Decision 13)", () => {
  const base = { name: "New Person", email: "p@jpc.test", role: "SUPER" as const };

  it("is an optional boolean — the route, not the schema, decides when it is required", () => {
    expect(createUserRequestSchema.safeParse(base).success).toBe(true);
    expect(createUserRequestSchema.parse({ ...base, confirmSuper: true }).confirmSuper).toBe(true);
    expect(createUserRequestSchema.safeParse({ ...base, confirmSuper: "yes" }).success).toBe(false);
  });
});

describe("bulk invite contracts (Plan 10 Decision 12)", () => {
  it("carries four counters, all non-negative", () => {
    expect(
      bulkInviteResponseSchema.safeParse({ sent: 3, skipped: 1, failed: 0, remaining: 12 }).success,
    ).toBe(true);
    expect(
      bulkInviteResponseSchema.safeParse({ sent: -1, skipped: 0, failed: 0, remaining: 0 }).success,
    ).toBe(false);
  });

  it("states the per-request ceiling once, for the API and the confirm dialog alike", () => {
    expect(BULK_INVITE_BATCH_SIZE).toBe(20);
    expect(pendingInvitesResponseSchema.safeParse({ pending: 0 }).success).toBe(true);
    expect(createUserResponseSchema.safeParse({ userId: 5 }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @space/shared jest src/__tests__/student-lifecycle-schemas.test.ts src/__tests__/password-reset-schemas.test.ts src/__tests__/user-schemas.test.ts`
Expected: FAIL — none of the new exports exist.

- [ ] **Step 3: Implement**

Add `import { isoDaySchema } from "./org-time";` (Plan 5's module) to the top
of `packages/shared/src/student.ts`, then append:

```ts
// ---------------------------------------------------------------------------
// Lifecycle (Plan 10) — graduate, delete, and the response shapes every
// student write answers with (ruling X10: the client parses, never casts).
// ---------------------------------------------------------------------------

/**
 * Graduation is SUPER-only (R55) and irreversible (R61). The upper bound is
 * evaluated per call — v1 captured CURRENT_YEAR at module load and refused
 * January graduates until the process restarted (R58).
 */
export const graduateStudentRequestSchema = z
  .object({ graduationYear: z.number().int("Enter a whole year.") })
  .strict()
  .superRefine((v, ctx) => {
    const currentYear = new Date().getFullYear();
    if (v.graduationYear < 1990 || v.graduationYear > currentYear) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["graduationYear"],
        message: `Enter a year between 1990 and ${currentYear}.`,
      });
    }
  });
export type GraduateStudentBody = z.infer<typeof graduateStudentRequestSchema>;

export const graduateStudentResponseSchema = z.object({
  id: z.number().int(),
  graduationYear: z.number().int(),
  /** Every ACTIVE enrollment is completed, not only the pointed-at one (Plan 10 Decision 2). */
  enrollmentsCompleted: z.number().int().nonnegative(),
});
export type GraduateStudentResponse = z.infer<typeof graduateStudentResponseSchema>;

export const studentDeletedResponseSchema = z.object({
  id: z.number().int(),
  deletedAt: z.string(),
});
export type StudentDeletedResponse = z.infer<typeof studentDeletedResponseSchema>;

/** POST /students — Plan 7's response, given a schema so the create screen parses it. */
export const createStudentResponseSchema = z.object({
  id: z.number().int(),
  email: z.string(),
});
export type CreateStudentResponse = z.infer<typeof createStudentResponseSchema>;

/** PATCH /students/:id — Plan 7's response. */
export const updateStudentResponseSchema = z.object({ id: z.number().int() });
export type UpdateStudentResponse = z.infer<typeof updateStudentResponseSchema>;

/** PATCH /students/:id/enrollments/:seasonId — Plan 7's response. */
export const enrollmentTransitionResponseSchema = z.object({
  id: z.number().int(),
  status: enrollmentStatusSchema,
});
export type EnrollmentTransitionResponse = z.infer<typeof enrollmentTransitionResponseSchema>;

// ---------------------------------------------------------------------------
// Date-only values (Plan 10 Decision 8). A date of birth is a calendar day,
// not an instant: it has no wall clock for the org timezone to apply to, and
// the device timezone must never decide it either (ruling X13).
// ---------------------------------------------------------------------------

/**
 * True for a real calendar day written as YYYY-MM-DD ("2003-02-29" is not).
 * Delegates to Plan 5's isoDaySchema (packages/shared/src/org-time.ts) — one
 * definition of "a day on the wire", not a second regex.
 */
export function isDateOnly(value: string): boolean {
  return isoDaySchema.safeParse(value).success;
}

/** The instant v2 stores for a calendar day: that day's UTC midnight. */
export function isoFromDateOnly(day: string): string {
  return `${day}T00:00:00.000Z`;
}

/**
 * The calendar day a stored date-of-birth instant names, read without any
 * timezone: shift +12h and take the UTC day. A local midnight from any zone
 * in UTC−11…UTC+12 lands inside its own day — so v1's rows (its web date
 * picker stored browser-local midnight, e.g. Cairo's `…T22:00Z` on the
 * previous UTC day) and v2's UTC-midnight rows both read back correctly.
 */
export function dateOnlyFromIso(iso: string | null): string | null {
  if (iso == null) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms + 12 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
```

In `packages/shared/src/user.ts`, add one key to `createUserRequestSchema`'s
object (between `graduationYear` and the closing brace):

```ts
    /**
     * Must be `true` when `role` is SUPER (Plan 10 Decision 13 — spec 11 D7
     * rec 3 applied to creation as Plan 9 applied it to PATCH). The route
     * enforces it; the schema only types it.
     */
    confirmSuper: z.boolean().optional(),
```

and append to the end of the file:

```ts
/** POST /users — Plan 9's response, given a schema so `/users/new` parses it. */
export const createUserResponseSchema = z.object({ userId: z.number().int() });
export type CreateUserResponse = z.infer<typeof createUserResponseSchema>;

/**
 * Bulk "send all pending invites" (Plan 10 Decision 12): at most this many
 * users per request. Exported so the confirm dialog quotes the same number
 * the server enforces.
 */
export const BULK_INVITE_BATCH_SIZE = 20;

/** GET /users/invites/pending — how many accounts the bulk button would reach. */
export const pendingInvitesResponseSchema = z.object({
  pending: z.number().int().nonnegative(),
});
export type PendingInvitesResponse = z.infer<typeof pendingInvitesResponseSchema>;

/**
 * POST /users/invites/pending. `skipped` is spec 11 R16's missing third
 * counter (a user who stopped being eligible between listing and locking);
 * `remaining` is what is still pending after this batch.
 */
export const bulkInviteResponseSchema = z.object({
  sent: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
});
export type BulkInviteResponse = z.infer<typeof bulkInviteResponseSchema>;
```

Create `packages/shared/src/password-reset.ts`:

```ts
import { z } from "zod";

import { passwordSchema } from "./user";

/** v1's hard-coded TTL (spec 11 R73), stated once for the API and the copy. */
export const PASSWORD_RESET_TTL_MINUTES = 60;

/**
 * strict(): the anonymous endpoints take exactly what they need. The email is
 * trimmed but NOT lower-cased — login matches the stored address exactly
 * (lib/auth/credentials.ts), and a reset must find the same row login would.
 */
export const forgotPasswordRequestSchema = z
  .object({ email: z.string().trim().email("Must be a valid email.") })
  .strict();
export type ForgotPasswordBody = z.infer<typeof forgotPasswordRequestSchema>;

export const resetPasswordRequestSchema = z
  .object({
    token: z.string().trim().min(16, "Paste the code from your email.").max(256),
    password: passwordSchema,
  })
  .strict();
export type ResetPasswordBody = z.infer<typeof resetPasswordRequestSchema>;

/** Both endpoints answer `{ ok: true }` — forgot-password on every path (R67). */
export const passwordResetAckSchema = z.object({ ok: z.literal(true) });
export type PasswordResetAck = z.infer<typeof passwordResetAckSchema>;

/**
 * Accepts what a person actually pastes: the bare code, v2's
 * `spacev2://reset-password?token=…` link, or a v1 web link
 * `https://…/reset-password?token=…` (same token format — Plan 10 Decision 10).
 */
export function extractResetToken(input: string): string {
  const trimmed = input.trim();
  const match = /[?&#]token=([^&#\s]+)/.exec(trimmed);
  if (!match?.[1]) return trimmed;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}
```

Add `export * from "./password-reset";` to `packages/shared/src/index.ts`
(after `export * from "./user";`).

- [ ] **Step 4: Run the tests and the workspace checks**

Run: `pnpm --filter @space/shared jest src/__tests__/student-lifecycle-schemas.test.ts src/__tests__/password-reset-schemas.test.ts src/__tests__/user-schemas.test.ts` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/shared` → clean.

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): student lifecycle, bulk-invite and password-reset contracts"
```

---

### Task 2: Student creation goes through the invite path; the audit helper

**Files:**
- Create: `apps/backend/src/lib/audit.ts`
- Modify: `apps/backend/src/routes/students.ts` (Plan 7's `POST /` mints an invite; Plan 7's enrollment transition writes an audit line)
- Modify: `apps/backend/src/__tests__/integration/students-routes.test.ts` (Plan 7's — mailer mock at the top; new describe)
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: `apps/backend/src/__tests__/audit.test.ts` (new, unit)

**Interfaces:**
- Consumes: Plan 9's `issueInvite`, `type IssuedInvite` (`lib/invites.ts`), `sendInviteEmail` (`lib/email.ts`), `hashToken` (`lib/auth/tokens.ts`, in the test).
- Produces: `auditLog(operation: AuditOperation, actorId: number, subjectId: number): void` and `formatAuditLine(...)`: `string` and `type AuditOperation = "student.graduate" | "student.delete" | "enrollment.drop" | "enrollment.complete"` in `lib/audit.ts` (Task 3 consumes); `POST /api/v1/students` now also mints one hashed invite (response shape unchanged: `{ data: { id, email } }` 201).

- [ ] **Step 1: The audit helper — failing unit test first**

```ts
// apps/backend/src/__tests__/audit.test.ts
import { auditLog, formatAuditLine } from "../lib/audit";

describe("audit lines (spec 06 D15 — who did what to whom, never a field value)", () => {
  it("formats operation, actor and subject and nothing else", () => {
    expect(formatAuditLine("student.graduate", 3, 41)).toBe("[audit] student.graduate actor=3 subject=41");
  });

  it("writes exactly one info line", () => {
    const info = jest.spyOn(console, "info").mockImplementation(() => undefined);
    auditLog("student.delete", 1, 2);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith("[audit] student.delete actor=1 subject=2");
    info.mockRestore();
  });
});
```

Run: `cd apps/backend && npx jest src/__tests__/audit.test.ts` → FAIL (module missing).

```ts
// apps/backend/src/lib/audit.ts

/**
 * Spec 06 D15: User, StudentProfile and SeasonEnrollment carry no
 * createdById/updatedById, so there is no record of who graduated, dropped or
 * deleted a student — and adding the columns is a migration (ruling C1;
 * recorded for cutover). Until then every state-changing student write leaves
 * one server-log line naming WHO did WHAT to WHOM.
 *
 * Never a field value: a graduation year, a drop reason or a name is personal
 * data and stays out of logs (the spec's "without logging any field value").
 * The signature makes that structural — it accepts ids only.
 */
export type AuditOperation =
  | "student.graduate"
  | "student.delete"
  | "enrollment.drop"
  | "enrollment.complete";

export function formatAuditLine(operation: AuditOperation, actorId: number, subjectId: number): string {
  return `[audit] ${operation} actor=${actorId} subject=${subjectId}`;
}

export function auditLog(operation: AuditOperation, actorId: number, subjectId: number): void {
  console.info(formatAuditLine(operation, actorId, subjectId));
}
```

Run: `cd apps/backend && npx jest src/__tests__/audit.test.ts` → PASS.

- [ ] **Step 2: Stub the mailer in Plan 7's suite, then write the failing tests**

Insert at the very top of `students-routes.test.ts`, **above** its
`import request from "supertest";` line (jest hoists `jest.mock` above imports
anyway; placing it first makes the order obvious to a reader):

```ts
// Plan 10: POST /students now mails an invite. Stubbed for the same two
// reasons Plan 9's invites suite gives — a staging .env with GMAIL_* set would
// otherwise send real SMTP to @jpc.test addresses on every run, and the stub
// is how this suite proves the raw code reaches the mailer and nothing else.
// Lazy wrapper: jest.mock is hoisted above this const.
const mockSendInviteEmail = jest.fn().mockResolvedValue(undefined);
jest.mock("../../lib/email", () => ({
  ...jest.requireActual("../../lib/email"),
  sendInviteEmail: (...args: unknown[]) => mockSendInviteEmail(...args),
}));
```

Add `import { hashToken } from "../../lib/auth/tokens";` beside the suite's
other imports. Then append:

```ts
describe("POST /api/v1/students — credentials only via Plan 9's invite (Plan 10 Decision 1)", () => {
  it("mints one hashed invite in the creating transaction and mails the raw code — nowhere else", async () => {
    mockSendInviteEmail.mockClear();
    const email = testEmail("invited-student");
    const res = await request(app)
      .post("/api/v1/students")
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Invited Student", email });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ id: res.body.data.id, email });

    const row = await db.user.findUnique({
      where: { id: res.body.data.id },
      select: { passwordHash: true, invitesReceived: { select: { token: true, usedAt: true } } },
    });
    // D7: still no password — the invite is the ONLY credential path.
    expect(row?.passwordHash).toBeNull();
    expect(row?.invitesReceived).toHaveLength(1);
    expect(row?.invitesReceived[0]?.token).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.invitesReceived[0]?.usedAt).toBeNull();

    const calls = mockSendInviteEmail.mock.calls as [string, string, Date][];
    const call = calls[calls.length - 1]!;
    expect(call[0]).toBe(email);
    expect(hashToken(call[1])).toBe(row?.invitesReceived[0]?.token);
    // The raw code is in no response body.
    expect(JSON.stringify(res.body)).not.toContain(call[1]);
  });

  it("still creates the student when the mailer throws — the invite row is the truth (R25)", async () => {
    mockSendInviteEmail.mockRejectedValueOnce(new Error("smtp down"));
    const res = await request(app)
      .post("/api/v1/students")
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Mail Failure Student", email: testEmail("mail-fail") });

    expect(res.status).toBe(201);
    const invites = await db.inviteToken.count({ where: { userId: res.body.data.id } });
    expect(invites).toBe(1);
  });
});

describe("enrollment transitions leave an audit line (spec 06 D15, Plan 10 Decision 4)", () => {
  it("logs actor and subject for a drop — and never the reason", async () => {
    const s = await createTestUser("audited-drop", "STUDENT");
    await db.studentProfile.create({ data: { userId: s.id } });
    await db.seasonEnrollment.create({
      data: { studentUserId: s.id, seasonId: seasonAId, status: "ACTIVE" },
    });
    const info = jest.spyOn(console, "info").mockImplementation(() => undefined);

    const res = await request(app)
      .patch(`/api/v1/students/${s.id}/enrollments/${seasonAId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ status: "WITHDRAWN", dropReason: "Private family matter" });

    expect(res.status).toBe(200);
    const lines = info.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => new RegExp(`^\\[audit\\] enrollment\\.drop actor=\\d+ subject=${s.id}$`).test(l))).toBe(true);
    expect(lines.join("\n")).not.toContain("Private family matter");
    info.mockRestore();
  });
});
```

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern students-routes`
Expected: the three new tests FAIL — no invite row (count 0), and no audit line.

- [ ] **Step 3: Mint the invite in `POST /students`**

In `routes/students.ts` add:

```ts
import { auditLog } from "../lib/audit";
import { sendInviteEmail } from "../lib/email";
import { issueInvite, type IssuedInvite } from "../lib/invites";
```

Replace Plan 7's `try { const created = await db.$transaction(…); return apiOk(res, created, 201); } catch (err) { … }`
block at the end of `studentsRouter.post("/", …)` with:

```ts
  let created: { id: number; email: string };
  let invite: IssuedInvite;
  try {
    const result = await db.$transaction(async (tx) => {
      const student = await tx.user.create({
        data: {
          email: body.email,
          name: body.name,
          role: "STUDENT", // forced, never an input (R14)
          // D7: no password. v1's hard-coded ChangeMe123! and its plaintext
          // log line (R16/R17) are deliberately not ported.
          passwordHash: null,
          studentProfile: {
            create: {
              // D1: pointer and enrollment agree by construction.
              activeSeasonId: body.seasonId ?? null,
              university: body.university ?? null,
              year: body.year ?? null,
              phone: body.phone ?? null,
              dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
              spiritualBackground: body.spiritualBackground ?? null,
              gifts: body.gifts ?? null,
              notes: body.notes ?? null,
            },
          },
        },
        select: { id: true, email: true },
      });
      if (body.seasonId != null) {
        // The enrollment v1's form never created (R15).
        await tx.seasonEnrollment.create({
          data: { studentUserId: student.id, seasonId: body.seasonId, status: "ACTIVE" },
        });
      }
      // Plan 10 Decision 1 — spec 06 D7 / spec 11 §7: creation and
      // invitation are ONE operation, exactly as POST /users does it. The
      // invite is minted in this transaction (a rolled-back student can't
      // have an invite) and mailed after commit (a mail failure can't roll
      // back the student). This line stays in the ROUTE, after the row
      // writes: Plan 17 extracts the block above into createStudentRows, and
      // its importer must keep sending nothing (its R55).
      const issued = await issueInvite(tx, student.id, user.userId);
      return { student, issued };
    });
    created = result.student;
    invite = result.issued;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return apiError(res, "email_taken", "A user with that email already exists.", 409);
    }
    throw err;
  }

  // Best-effort, after commit (R25). The log names the user id and the error
  // — never the address or the code (Plan 9 Decision 2).
  try {
    await sendInviteEmail(created.email, invite.raw, invite.expiresAt);
  } catch (err) {
    console.error(
      `[invites] failed to send invite email for user ${created.id}:`,
      err instanceof Error ? err.message : err,
    );
  }

  return apiOk(res, created, 201);
```

(Everything above the `try` in Plan 7's handler — the SUPER gate, the body
parse, the season check and the friendly `email_taken` pre-check — is
unchanged.)

- [ ] **Step 4: Audit the enrollment transitions**

In Plan 7's `studentsRouter.patch("/:id/enrollments/:seasonId", …)`, between
`const updated = await db.seasonEnrollment.update({ … });` and
`return apiOk(res, updated);`, insert:

```ts
  auditLog(
    parsed.data.status === "WITHDRAWN" ? "enrollment.drop" : "enrollment.complete",
    user.userId,
    id,
  );
```

- [ ] **Step 5: Run the suites**

Run: `cd apps/backend && npx jest src/__tests__/audit.test.ts` → PASS.
Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern students-routes` → PASS (Plan 7's describes included — its "creates user + profile + ACTIVE enrollment … NO password" test still holds).
Run: `pnpm turbo lint typecheck --filter=@space/backend` → clean.

- [ ] **Step 6: OpenAPI** — on `POST /api/v1/students`, replace Plan 7's "no
login path until Plan 9" sentence with: the account is created with no
password and an invite is minted in the same transaction and emailed after
commit (best-effort; the code never appears in any response). On
`PATCH /api/v1/students/{id}/enrollments/{seasonId}` add: "writes a
server-side audit line (actor and subject ids only)".

- [ ] **Step 7: Commit**

```bash
git add apps/backend
git commit -m "feat(backend): student creation mints an invite in-transaction; audit lines for enrollment transitions"
```

---

### Task 3: Graduate and soft-delete

**Files:**
- Modify: `apps/backend/src/routes/students.ts` (add `POST /:id/graduate`, `DELETE /:id`)
- Modify: `apps/backend/src/routes/users.ts` (Plan 9's reactivate also clears the profile stamp)
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: extend `apps/backend/src/__tests__/integration/students-routes.test.ts`

**Interfaces:**
- Consumes: `graduateStudentRequestSchema` (Task 1, relative shared import), `auditLog` (Task 2), Plan 9's `revokeAllRefreshTokensForUser`, Plan 7's `isSuper`/`parseId`/`requireUser`.
- Produces: `POST /api/v1/students/:id/graduate` → `{ data: GraduateStudentResponse }` (errors `bad_request` 400, `forbidden` 403, `not_found` 404, `already_graduated` 409); `DELETE /api/v1/students/:id` → `{ data: StudentDeletedResponse }` (errors `bad_request` 400, `forbidden` 403, `not_found` 404); reactivate clearing `StudentProfile.deletedAt`.

- [ ] **Step 1: Append the failing tests**

```ts
async function makeGraduand(
  label: string,
  enrollments: { seasonId: number; status: "ACTIVE" | "WITHDRAWN" | "COMPLETED"; dropReason?: string }[],
  activeSeasonId: number | null,
): Promise<number> {
  const s = await createTestUser(label, "STUDENT");
  await db.studentProfile.create({ data: { userId: s.id, activeSeasonId } });
  for (const e of enrollments) {
    await db.seasonEnrollment.create({
      data: {
        studentUserId: s.id,
        seasonId: e.seasonId,
        status: e.status,
        ...(e.status === "WITHDRAWN" ? { droppedAt: new Date(), dropReason: e.dropReason ?? null } : {}),
        ...(e.status === "COMPLETED" ? { completedAt: new Date() } : {}),
      },
    });
  }
  return s.id;
}

describe("POST /api/v1/students/:id/graduate (Plan 10 Decision 2)", () => {
  it("records the year, completes EVERY active enrollment, clears the pointer — one transaction", async () => {
    const sid = await makeGraduand(
      "graduand",
      [
        { seasonId: seasonAId, status: "ACTIVE" },
        { seasonId: seasonBId, status: "ACTIVE" },
      ],
      seasonAId,
    );

    const res = await request(app)
      .post(`/api/v1/students/${sid}/graduate`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ graduationYear: 2020 });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: sid, graduationYear: 2020, enrollmentsCompleted: 2 });

    const row = await db.user.findUnique({
      where: { id: sid },
      select: {
        role: true,
        graduationYear: true,
        studentProfile: { select: { activeSeasonId: true } },
        seasonEnrollments: { select: { status: true, completedAt: true }, orderBy: { seasonId: "asc" } },
      },
    });
    expect(row?.role).toBe("STUDENT"); // R57: the year is the whole marker
    expect(row?.graduationYear).toBe(2020);
    expect(row?.studentProfile?.activeSeasonId).toBeNull();
    // v1 completed only the pointed-at season (R48/R60); B would have stayed ACTIVE.
    expect(row?.seasonEnrollments.map((e) => e.status)).toEqual(["COMPLETED", "COMPLETED"]);
    expect(row?.seasonEnrollments.every((e) => e.completedAt !== null)).toBe(true);
  });

  it("leaves terminal enrollments exactly as they were", async () => {
    const sid = await makeGraduand(
      "graduand-terminal",
      [
        { seasonId: seasonAId, status: "WITHDRAWN", dropReason: "Kept reason" },
        { seasonId: seasonBId, status: "ACTIVE" },
      ],
      seasonBId,
    );

    const res = await request(app)
      .post(`/api/v1/students/${sid}/graduate`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ graduationYear: 2021 });

    expect(res.body.data.enrollmentsCompleted).toBe(1);
    const dropped = await db.seasonEnrollment.findFirst({
      where: { studentUserId: sid, seasonId: seasonAId },
      select: { status: true, dropReason: true, completedAt: true },
    });
    expect(dropped).toEqual({ status: "WITHDRAWN", dropReason: "Kept reason", completedAt: null });
  });

  it("is SUPER-only (R55) — a season admin of the student's season is refused", async () => {
    const sid = await makeGraduand("graduand-admin", [{ seasonId: seasonAId, status: "ACTIVE" }], seasonAId);
    const res = await request(app)
      .post(`/api/v1/students/${sid}/graduate`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ graduationYear: 2020 });
    expect(res.status).toBe(403);
    const row = await db.user.findUnique({ where: { id: sid }, select: { graduationYear: true } });
    expect(row?.graduationYear).toBeNull();
  });

  it("bounds the year per request (R58)", async () => {
    const sid = await makeGraduand("graduand-year", [], null);
    for (const graduationYear of [new Date().getFullYear() + 1, 1989]) {
      const res = await request(app)
        .post(`/api/v1/students/${sid}/graduate`)
        .set("authorization", `Bearer ${superToken}`)
        .send({ graduationYear });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("bad_request");
    }
  });

  it("refuses a second graduation instead of overwriting the year (R61)", async () => {
    const sid = await makeGraduand("graduand-twice", [], null);
    await request(app)
      .post(`/api/v1/students/${sid}/graduate`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ graduationYear: 2019 });
    const again = await request(app)
      .post(`/api/v1/students/${sid}/graduate`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ graduationYear: 2020 });

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("already_graduated");
    const row = await db.user.findUnique({ where: { id: sid }, select: { graduationYear: true } });
    expect(row?.graduationYear).toBe(2019);
  });

  it("answers 404 for a non-student id", async () => {
    const leader = await createTestUser("not-a-student", "LEADER");
    const res = await request(app)
      .post(`/api/v1/students/${leader.id}/graduate`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ graduationYear: 2020 });
    expect(res.status).toBe(404);
  });

  it("writes an audit line with ids only — never the year (spec 06 D15)", async () => {
    const sid = await makeGraduand("graduand-audit", [], null);
    const info = jest.spyOn(console, "info").mockImplementation(() => undefined);
    await request(app)
      .post(`/api/v1/students/${sid}/graduate`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ graduationYear: 2018 });
    const lines = info.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => new RegExp(`^\\[audit\\] student\\.graduate actor=\\d+ subject=${sid}$`).test(l))).toBe(true);
    expect(lines.join("\n")).not.toContain("2018");
    info.mockRestore();
  });
});

describe("DELETE /api/v1/students/:id (Plan 10 Decision 3)", () => {
  it("stamps User and StudentProfile together, revokes every session, keeps the history", async () => {
    const s = await createTestUser("to-delete", "STUDENT");
    await db.studentProfile.create({ data: { userId: s.id } });
    await db.seasonEnrollment.create({
      data: { studentUserId: s.id, seasonId: seasonAId, status: "ACTIVE" },
    });
    await login(app, s.email); // creates a live RefreshToken row

    const res = await request(app)
      .delete(`/api/v1/students/${s.id}`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(s.id);
    expect(typeof res.body.data.deletedAt).toBe("string");

    const row = await db.user.findUnique({
      where: { id: s.id },
      select: {
        deletedAt: true,
        studentProfile: { select: { deletedAt: true } },
        seasonEnrollments: { select: { status: true } },
        refreshTokens: { select: { revokedAt: true } },
      },
    });
    expect(row?.deletedAt).not.toBeNull();
    // R86 fixed: v1 wrote these two in separate statements.
    expect(row?.studentProfile?.deletedAt).not.toBeNull();
    // R87 kept: soft delete cascades to nothing.
    expect(row?.seasonEnrollments).toEqual([{ status: "ACTIVE" }]);
    // Spec 11 D6: deactivation revokes. (A refresh would 401 anyway via
    // issueSession's deletedAt check — this asserts the revocation itself.)
    expect(row?.refreshTokens.length).toBeGreaterThan(0);
    expect(row?.refreshTokens.every((t) => t.revokedAt !== null)).toBe(true);

    const detail = await request(app)
      .get(`/api/v1/students/${s.id}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(detail.status).toBe(404);
  });

  it("is SUPER-only", async () => {
    const s = await createTestUser("delete-admin", "STUDENT");
    await db.studentProfile.create({ data: { userId: s.id } });
    await db.seasonEnrollment.create({
      data: { studentUserId: s.id, seasonId: seasonAId, status: "ACTIVE" },
    });
    const res = await request(app)
      .delete(`/api/v1/students/${s.id}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
    const row = await db.user.findUnique({ where: { id: s.id }, select: { deletedAt: true } });
    expect(row?.deletedAt).toBeNull();
  });

  it("answers 404 for a non-student and for an already-deleted student", async () => {
    const leader = await createTestUser("delete-leader", "LEADER");
    const notStudent = await request(app)
      .delete(`/api/v1/students/${leader.id}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(notStudent.status).toBe(404);

    const again = await request(app)
      .delete(`/api/v1/students/${deletedDroppedId}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(again.status).toBe(404);
  });

  it("a SUPER reactivation through /users clears BOTH stamps (Plan 9's reactivate, amended)", async () => {
    const s = await createTestUser("delete-reactivate", "STUDENT");
    await db.studentProfile.create({ data: { userId: s.id } });
    await request(app).delete(`/api/v1/students/${s.id}`).set("authorization", `Bearer ${superToken}`);

    const res = await request(app)
      .post(`/api/v1/users/${s.id}/reactivate`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);

    const row = await db.user.findUnique({
      where: { id: s.id },
      select: { deletedAt: true, studentProfile: { select: { deletedAt: true } } },
    });
    expect(row).toEqual({ deletedAt: null, studentProfile: { deletedAt: null } });
  });

  it("writes an audit line", async () => {
    const s = await createTestUser("delete-audit", "STUDENT");
    await db.studentProfile.create({ data: { userId: s.id } });
    const info = jest.spyOn(console, "info").mockImplementation(() => undefined);
    await request(app).delete(`/api/v1/students/${s.id}`).set("authorization", `Bearer ${superToken}`);
    expect(info.mock.calls.map((c) => String(c[0]))).toEqual(
      expect.arrayContaining([expect.stringMatching(new RegExp(`^\\[audit\\] student\\.delete actor=\\d+ subject=${s.id}$`))]),
    );
    info.mockRestore();
  });
});
```

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern students-routes`
Expected: the two new describes FAIL — both routes 404 (`not_found` from the catch-all), and the reactivate case leaves `studentProfile.deletedAt` set.

- [ ] **Step 2: Implement both routes**

In `routes/students.ts`, add `graduateStudentRequestSchema` to the relative
shared import, and
`import { revokeAllRefreshTokensForUser } from "../lib/auth/tokens";`. Append:

```ts
/**
 * Graduation (Plan 10 Decision 2). SUPER-only — the one action in this domain
 * gated on isSuper alone (R55). One transaction:
 *   - set graduationYear (the alumnus marker; role stays STUDENT, R57),
 *   - complete EVERY ACTIVE enrollment — v1 completed only the one matching
 *     activeSeasonId and left the rest ACTIVE forever (R48/R60), keeping an
 *     alumnus on rosters, in at-risk counts and (R53) in season access,
 *   - clear activeSeasonId (R56).
 * Terminal enrollments are history and are not touched. Irreversible (R61):
 * a second graduation is refused rather than silently overwriting the year.
 */
studentsRouter.post("/:id/graduate", async (req, res) => {
  const user = requireUser(req);
  if (!isSuper(user)) {
    return apiError(res, "forbidden", "Only a super user can graduate students.", 403);
  }
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid student id.", 400);

  const parsed = graduateStudentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", parsed.error.issues[0]?.message ?? "Invalid graduation year.", 400);
  }
  const { graduationYear } = parsed.data;

  const outcome = await db.$transaction(async (tx) => {
    const student = await tx.user.findFirst({
      where: { id, role: "STUDENT", deletedAt: null },
      select: { graduationYear: true },
    });
    if (!student) return "not_found" as const;
    // Guarded write: of two concurrent graduations exactly one matches
    // `graduationYear: null`; the other sees count 0 and is refused.
    const marked = await tx.user.updateMany({
      where: { id, graduationYear: null },
      data: { graduationYear },
    });
    if (marked.count === 0) return "already_graduated" as const;
    const completed = await tx.seasonEnrollment.updateMany({
      where: { studentUserId: id, status: "ACTIVE" },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    // updateMany, not update: a STUDENT without a profile row (spec 06 §2's
    // hazard) must not turn a graduation into a 500.
    await tx.studentProfile.updateMany({ where: { userId: id }, data: { activeSeasonId: null } });
    return { enrollmentsCompleted: completed.count };
  });

  if (outcome === "not_found") return apiError(res, "not_found", "Student not found.", 404);
  if (outcome === "already_graduated") {
    return apiError(res, "already_graduated", "This student has already graduated.", 409);
  }

  auditLog("student.graduate", user.userId, id);
  return apiOk(res, { id, graduationYear, enrollmentsCompleted: outcome.enrollmentsCompleted });
});

/**
 * Soft delete (Plan 10 Decision 3; spec 06 D13 "keep soft delete as
 * DELETE /students/:id"). SUPER-only. One transaction — v1 stamped User and
 * StudentProfile in two separate statements (R86) — that also revokes every
 * refresh token (spec 11 D6: deactivation revokes). Nothing cascades (R87):
 * enrollments, attendance, submissions and notes are history. A SUPER undoes
 * this through POST /users/:id/reactivate, which clears both stamps.
 */
studentsRouter.delete("/:id", async (req, res) => {
  const user = requireUser(req);
  if (!isSuper(user)) {
    return apiError(res, "forbidden", "Only a super user can delete students.", 403);
  }
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid student id.", 400);

  const deletedAt = new Date();
  const deleted = await db.$transaction(async (tx) => {
    const marked = await tx.user.updateMany({
      where: { id, role: "STUDENT", deletedAt: null },
      data: { deletedAt },
    });
    if (marked.count === 0) return false;
    await tx.studentProfile.updateMany({ where: { userId: id }, data: { deletedAt } });
    await revokeAllRefreshTokensForUser(tx, id);
    return true;
  });
  if (!deleted) return apiError(res, "not_found", "Student not found.", 404);

  auditLog("student.delete", user.userId, id);
  return apiOk(res, { id, deletedAt: deletedAt.toISOString() });
});
```

Route-order note: `DELETE /:id` is the only DELETE in the router;
`POST /:id/graduate` (two segments) cannot collide with `POST /` or
`POST /:id/enrollments` (different literal).

- [ ] **Step 3: Amend Plan 9's reactivate**

In `routes/users.ts`, replace the single
`await db.user.update({ where: { id }, data: { deletedAt: null } });` line in
`usersRouter.post("/:id/reactivate", …)` with:

```ts
  await db.$transaction([
    db.user.update({ where: { id }, data: { deletedAt: null } }),
    // A student deleted through DELETE /students/:id also carries a profile
    // stamp (v1 parity, R86). Clearing only the user would leave the profile
    // "deleted" to v1's readers — jpc-space/src/app/admin/quizzes/page.tsx:31
    // counts profiles with deletedAt: null. updateMany: non-students have no
    // profile row, and that is fine.
    db.studentProfile.updateMany({ where: { userId: id }, data: { deletedAt: null } }),
  ]);
```

- [ ] **Step 4: Run the suites**

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern "students-routes|users-routes"` → PASS (`users-routes` proves Plan 9's reactivate cases still hold).
Run: `pnpm turbo lint typecheck --filter=@space/backend` → clean.

- [ ] **Step 5: OpenAPI** — add both paths in this commit. Graduate: SUPER-only; body `{ graduationYear }` (1990…current year, evaluated per request); completes every ACTIVE enrollment and clears the active-season pointer; irreversible; codes `already_graduated` 409, `not_found` 404, `forbidden` 403. Delete: SUPER-only soft delete; revokes all sessions; history kept; reversible only via `POST /users/{id}/reactivate`; `not_found` covers non-students and already-deleted students. On `POST /users/{id}/reactivate` add: "also clears a student profile's deletion stamp".

- [ ] **Step 6: Commit**

```bash
git add apps/backend
git commit -m "feat(backend): graduate completes every active enrollment; soft delete is one transaction that signs out"
```

---

### Task 4: `POST /users` SUPER confirmation; bulk "send all pending invites"

**Files:**
- Create: `apps/backend/src/lib/concurrency.ts`
- Modify: `apps/backend/src/lib/invites.ts` (Plan 9's — gains `liveInviteWhere` (moved), `isV2InviteDigest`, `listPendingInviteUserIds`, `inviteIfStillPending`, `sendPendingInviteBatch`)
- Modify: `apps/backend/src/lib/email.ts` (export `isEmailConfigured`)
- Modify: `apps/backend/src/routes/users.ts` (Plan 9's — import `liveInviteWhere` instead of defining it; `confirmSuper` on `POST /`; `GET`/`POST /invites/pending`)
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: `apps/backend/src/__tests__/concurrency.test.ts` (new, unit), `apps/backend/src/__tests__/integration/bulk-invites-routes.test.ts` (new)

**Interfaces:**
- Consumes: Plan 9's `issueInvite`, `IssuedInvite`, `sendInviteEmail`, `hashToken`, `requireSuper`, `rateLimitHandler`, `createUnactivatedTestUser`; Task 1's `BULK_INVITE_BATCH_SIZE` (value — relative shared import) and `type BulkInviteResponse`.
- Produces:
  - `mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]>` in `lib/concurrency.ts`
  - In `lib/invites.ts`:
    - `liveInviteWhere(now: Date)` (moved here from `routes/users.ts`, same signature)
    - `isV2InviteDigest(token: string): boolean`
    - `listPendingInviteUserIds(scope?: Prisma.UserWhereInput): Promise<number[]>`
    - `inviteIfStillPending(userId: number, invitedById: number): Promise<MintedInvite | null>`
    - `sendPendingInviteBatch(invitedById: number, options?: { scope?: Prisma.UserWhereInput; batchSize?: number }): Promise<BulkInviteResponse>`
    - `BULK_INVITE_MAIL_CONCURRENCY` (5)
  - `isEmailConfigured(): boolean` in `lib/email.ts`
  - Endpoints:
    - `GET /api/v1/users/invites/pending` → `{ data: PendingInvitesResponse }`
    - `POST /api/v1/users/invites/pending` → `{ data: BulkInviteResponse }`, with errors `email_not_configured` 503 and `forbidden` 403
  - `POST /api/v1/users` now refusing `role: "SUPER"` without `confirmSuper: true` → `400 confirm_super_required`

- [ ] **Step 1: The concurrency helper — failing unit test first**

```ts
// apps/backend/src/__tests__/concurrency.test.ts
import { mapWithConcurrency } from "../lib/concurrency";

describe("mapWithConcurrency", () => {
  it("returns results in input order regardless of completion order", async () => {
    const delays = [30, 5, 20, 1];
    const out = await mapWithConcurrency(delays, 2, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms));
      return i;
    });
    expect(out).toEqual([0, 1, 2, 3]);
  });

  it("never has more than `limit` calls in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 3, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight -= 1;
    });
    expect(peak).toBe(3);
  });

  it("handles an empty list and refuses a non-positive limit", async () => {
    await expect(mapWithConcurrency([], 5, async () => 1)).resolves.toEqual([]);
    await expect(mapWithConcurrency([1], 0, async () => 1)).rejects.toThrow(RangeError);
  });
});
```

Run: `cd apps/backend && npx jest src/__tests__/concurrency.test.ts` → FAIL (module missing).

```ts
// apps/backend/src/lib/concurrency.ts

/**
 * Run `fn` over `items` with at most `limit` calls in flight, returning
 * results in input order. Exists for the bulk invite sender (Plan 10
 * Decision 12): N SMTP round trips one after another is what made v1's bulk
 * action unsurvivable inside a request (spec 11 R18); all at once would trip
 * Gmail's connection limits. A small pool is the middle.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError("mapWithConcurrency: limit must be a positive integer");
  }
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index] as T, index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
```

Run: `cd apps/backend && npx jest src/__tests__/concurrency.test.ts` → PASS.

- [ ] **Step 2: Write the failing integration suite**

```ts
// apps/backend/src/__tests__/integration/bulk-invites-routes.test.ts
import { randomBytes } from "node:crypto";

import request from "supertest";

const mockSendInviteEmail = jest.fn().mockResolvedValue(undefined);
const mockIsEmailConfigured = jest.fn(() => true);
jest.mock("../../lib/email", () => ({
  ...jest.requireActual("../../lib/email"),
  sendInviteEmail: (...args: unknown[]) => mockSendInviteEmail(...args),
  isEmailConfigured: () => mockIsEmailConfigured(),
}));

// SAFETY — read before editing. The shared staging DB holds REAL
// never-activated users (spec 11 R15: v1's CSV import produces exactly that
// state). An unscoped bulk send from a test would mint invites for real
// people. So every route call in this file runs the REAL library, confined to
// fixture rows: the mock forwards to the actual functions with the fixture
// scope forced on. Never remove this block, and never call the actual
// sendPendingInviteBatch/listPendingInviteUserIds without a scope.
jest.mock("../../lib/invites", () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- inline import() type needed inside a hoisted jest.mock factory
  const actual = jest.requireActual<typeof import("../../lib/invites")>("../../lib/invites");
  const fixtureScope = { email: { startsWith: "space-v2-test-", endsWith: "@jpc.test" } };
  return {
    ...actual,
    listPendingInviteUserIds: () => actual.listPendingInviteUserIds(fixtureScope),
    sendPendingInviteBatch: (invitedById: number, options: { batchSize?: number } = {}) =>
      actual.sendPendingInviteBatch(invitedById, { ...options, scope: fixtureScope }),
  };
});

import { createApp } from "../../app";
import { db } from "../../db/client";
import { hashToken } from "../../lib/auth/tokens";
import {
  inviteIfStillPending,
  isV2InviteDigest,
  issueInvite,
  sendPendingInviteBatch,
} from "../../lib/invites";
import {
  cleanupTestData,
  createTestUser,
  createUnactivatedTestUser,
  login,
  testEmail,
} from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let superUser: { id: number; email: string };
let superToken: string;

beforeEach(async () => {
  await cleanupTestData();
  mockSendInviteEmail.mockReset().mockResolvedValue(undefined);
  mockIsEmailConfigured.mockReset().mockReturnValue(true);
  superUser = await createTestUser("bulk-super", "SUPER");
  superToken = await login(app, superUser.email);
});

afterAll(async () => {
  await cleanupTestData();
});

/**
 * Four pending accounts — one of them holding only a live v1-style PLAINTEXT
 * invite, which v2 can never accept (Plan 9 Decision 4) — plus three that are
 * not pending: one with a live v2 invite, one activated, one deleted.
 */
async function seedPool() {
  const plain = [
    await createUnactivatedTestUser("pending-a", "STUDENT"),
    await createUnactivatedTestUser("pending-b", "STUDENT"),
    await createUnactivatedTestUser("pending-c", "STUDENT"),
  ];
  const v1Holder = await createUnactivatedTestUser("pending-v1", "STUDENT");
  // v1's shape: a 32-char raw code stored as-is (spec 11 R13/R23).
  await db.inviteToken.create({
    data: {
      token: randomBytes(16).toString("hex"),
      userId: v1Holder.id,
      invitedById: superUser.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  const invited = await createUnactivatedTestUser("already-invited", "STUDENT");
  await issueInvite(db, invited.id, superUser.id);
  const active = await createTestUser("active-one", "STUDENT");
  const deleted = await createUnactivatedTestUser("deleted-one", "STUDENT");
  await db.user.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });

  const pending = [...plain, v1Holder].sort((a, b) => a.id - b.id);
  return { pending, invited, active, deleted };
}

describe("GET /api/v1/users/invites/pending", () => {
  it("counts never-activated, undeleted accounts without a live v2 invite — a v1 plaintext invite does not count", async () => {
    await seedPool();
    const res = await request(app)
      .get("/api/v1/users/invites/pending")
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ pending: 4 });
  });

  it("is SUPER-only", async () => {
    const admin = await createTestUser("bulk-admin", "ADMIN");
    const res = await request(app)
      .get("/api/v1/users/invites/pending")
      .set("authorization", `Bearer ${await login(app, admin.email)}`);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/v1/users/invites/pending (Plan 10 Decision 12)", () => {
  it("invites every pending account once, mails each its own code, and reports four counters", async () => {
    const { pending, invited } = await seedPool();
    const before = await db.inviteToken.findFirst({
      where: { userId: invited.id },
      select: { token: true },
    });

    const res = await request(app)
      .post("/api/v1/users/invites/pending")
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ sent: 4, skipped: 0, failed: 0, remaining: 0 });

    const calls = mockSendInviteEmail.mock.calls as [string, string, Date][];
    expect(calls).toHaveLength(4);
    for (const user of pending) {
      const live = await db.inviteToken.findMany({
        where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
        select: { token: true },
      });
      expect(live).toHaveLength(1);
      expect(isV2InviteDigest(live[0]!.token)).toBe(true);
      const call = calls.find((c) => c[0] === user.email);
      expect(call && hashToken(call[1])).toBe(live[0]!.token);
    }
    // The already-invited account was not re-minted.
    const after = await db.inviteToken.findMany({ where: { userId: invited.id }, select: { token: true } });
    expect(after).toEqual([before]);
    // No raw code in the response.
    for (const c of calls) expect(JSON.stringify(res.body)).not.toContain(c[1]);
  });

  it("refuses with 503 and mints nothing when no mail transport is configured", async () => {
    const { pending } = await seedPool();
    mockIsEmailConfigured.mockReturnValue(false);

    const res = await request(app)
      .post("/api/v1/users/invites/pending")
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("email_not_configured");
    const digests = await db.inviteToken.findMany({
      where: { userId: { in: pending.map((p) => p.id) } },
      select: { token: true },
    });
    expect(digests.filter((d) => isV2InviteDigest(d.token))).toEqual([]);
  });

  it("is SUPER-only", async () => {
    const admin = await createTestUser("bulk-admin-post", "ADMIN");
    const res = await request(app)
      .post("/api/v1/users/invites/pending")
      .set("authorization", `Bearer ${await login(app, admin.email)}`);
    expect(res.status).toBe(403);
  });
});

describe("sendPendingInviteBatch — the bounds (fixture-scoped by the mock above)", () => {
  it("processes at most batchSize per call, oldest id first, and reports what remains", async () => {
    const { pending } = await seedPool();

    const first = await sendPendingInviteBatch(superUser.id, { batchSize: 2 });
    expect(first).toEqual({ sent: 2, skipped: 0, failed: 0, remaining: 2 });
    const firstEmails = (mockSendInviteEmail.mock.calls as [string][]).map((c) => c[0]);
    expect(firstEmails.sort()).toEqual([pending[0]!.email, pending[1]!.email].sort());

    const second = await sendPendingInviteBatch(superUser.id, { batchSize: 2 });
    expect(second).toEqual({ sent: 2, skipped: 0, failed: 0, remaining: 0 });
  });

  it("a mail failure expires the invite just minted, so that person stays pending for the next tap", async () => {
    const { pending } = await seedPool();
    const unlucky = pending[0]!;
    mockSendInviteEmail.mockImplementation(async (email: string) => {
      if (email === unlucky.email) throw new Error("smtp down");
    });

    const result = await sendPendingInviteBatch(superUser.id);
    expect(result).toEqual({ sent: 3, skipped: 0, failed: 1, remaining: 1 });

    const live = await db.inviteToken.count({
      where: { userId: unlucky.id, usedAt: null, expiresAt: { gt: new Date() } },
    });
    expect(live).toBe(0);
  });
});

describe("inviteIfStillPending — the per-user lock and re-check", () => {
  it("mints for a pending account, then refuses the same account on a second call (double-tap safe)", async () => {
    const target = await createUnactivatedTestUser("once-only", "STUDENT");
    const minted = await inviteIfStillPending(target.id, superUser.id);
    expect(minted?.userId).toBe(target.id);
    expect(minted?.email).toBe(target.email);
    expect(await inviteIfStillPending(target.id, superUser.id)).toBeNull();
  });

  it("refuses an activated account and a deleted one", async () => {
    const active = await createTestUser("lock-active", "STUDENT");
    const deleted = await createUnactivatedTestUser("lock-deleted", "STUDENT");
    await db.user.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });
    expect(await inviteIfStillPending(active.id, superUser.id)).toBeNull();
    expect(await inviteIfStillPending(deleted.id, superUser.id)).toBeNull();
  });
});

describe("POST /api/v1/users — creating a SUPER needs confirmSuper (Plan 10 Decision 13)", () => {
  it("refuses role SUPER without the flag and creates nothing", async () => {
    const email = testEmail("new-super-refused");
    const res = await request(app)
      .post("/api/v1/users")
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "New Super", email, role: "SUPER" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("confirm_super_required");
    expect(await db.user.count({ where: { email } })).toBe(0);
  });

  it("creates the SUPER — with no password, invite-first — when the flag is true", async () => {
    const email = testEmail("new-super-confirmed");
    const res = await request(app)
      .post("/api/v1/users")
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "New Super", email, role: "SUPER", confirmSuper: true });
    expect(res.status).toBe(201);
    const row = await db.user.findUnique({ where: { email }, select: { role: true, passwordHash: true } });
    expect(row).toEqual({ role: "SUPER", passwordHash: null });
  });

  it("needs no flag for any other role", async () => {
    const res = await request(app)
      .post("/api/v1/users")
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Plain Student", email: testEmail("plain-student"), role: "STUDENT" });
    expect(res.status).toBe(201);
  });
});
```

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern bulk-invites-routes`
Expected: FAIL. The suite does not compile, because `inviteIfStillPending`, `isV2InviteDigest`, `sendPendingInviteBatch` and `isEmailConfigured` do not exist yet.

- [ ] **Step 3: Export the mail-transport check**

In `lib/email.ts`, below `isConfigured`:

```ts
/**
 * Public form of isConfigured, for callers that must refuse rather than mint
 * a credential nobody can receive — the bulk invite sender (Plan 10 Decision
 * 12) and the password-reset request (Decision 9).
 */
export function isEmailConfigured(): boolean {
  return isConfigured();
}
```

- [ ] **Step 4: The batch library**

In `lib/invites.ts` add the imports:

```ts
import type { BulkInviteResponse } from "@space/shared";
// Relative, not "@space/shared": a VALUE import (ruling X12 — the rootDir emit trap).
import { BULK_INVITE_BATCH_SIZE } from "../../../../packages/shared/src/index";

import type { Prisma } from "../generated/prisma/client";
import { mapWithConcurrency } from "./concurrency";
import { sendInviteEmail } from "./email";
```

and append:

```ts
/** A live, unaccepted invite — moved here from routes/users.ts (Plan 9) so
 *  the library and the route share one definition. */
export function liveInviteWhere(now: Date) {
  return { usedAt: null, expiresAt: { gt: now } } as const;
}

/**
 * v2 stores a 64-hex SHA-256 digest; v1 stored its 32-char raw code (spec 11
 * R23). A digest lookup can never match a v1 row (Plan 9 Decision 4), so for
 * "does this person hold an invite that can work?" only digests count.
 */
export function isV2InviteDigest(token: string): boolean {
  return /^[0-9a-f]{64}$/.test(token);
}

/** v1's invitability filter (spec 11 R14), unchanged. */
const INVITABLE_USER_WHERE = { deletedAt: null, passwordHash: null, lastLoginAt: null } as const;

/**
 * Ids of every account the bulk button would reach, oldest first: invitable
 * (R14) and holding no live v2 invite (R20, with v1's dead plaintext invites
 * not counted). `scope` narrows further — production passes none; the
 * integration suite forces the fixture prefix so it can never touch a real
 * user in the shared staging DB.
 */
export async function listPendingInviteUserIds(scope: Prisma.UserWhereInput = {}): Promise<number[]> {
  const now = new Date();
  const rows = await db.user.findMany({
    where: { AND: [scope, INVITABLE_USER_WHERE] },
    select: { id: true, invitesReceived: { where: liveInviteWhere(now), select: { token: true } } },
    orderBy: { id: "asc" },
  });
  return rows
    .filter((row) => !row.invitesReceived.some((invite) => isV2InviteDigest(invite.token)))
    .map((row) => row.id);
}

export interface MintedInvite extends IssuedInvite {
  userId: number;
  email: string;
}

/**
 * Mint an invite for one user IF they are still pending — decided under a row
 * lock, so a double-tap or two SUPERs pressing the button at once re-check
 * against the committed state and skip instead of minting twice (which would
 * mail two codes and silently kill the first). Returns null when skipped.
 */
export async function inviteIfStillPending(userId: number, invitedById: number): Promise<MintedInvite | null> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const row = await tx.user.findFirst({
      where: { id: userId, ...INVITABLE_USER_WHERE },
      select: { email: true, invitesReceived: { where: liveInviteWhere(new Date()), select: { token: true } } },
    });
    if (!row || row.invitesReceived.some((invite) => isV2InviteDigest(invite.token))) return null;
    const issued = await issueInvite(tx, userId, invitedById);
    return { userId, email: row.email, ...issued };
  });
}

/** Parallel SMTP sends per batch (Plan 10 Decision 12). */
export const BULK_INVITE_MAIL_CONCURRENCY = 5;

/**
 * One bounded batch of "send all pending invites" (Plan 10 Decision 12).
 *
 * Spec 11 §7 asks for a queue; v2 has none and a job table is a migration
 * (C1). So: at most `batchSize` users per call, one short locked transaction
 * each, mail AFTER the commits with a small pool, and the counts back — the
 * screen says "tap again for the rest". A mail failure expires the invite it
 * just minted, so that person stays pending and the next tap retries them;
 * v1 left them "invited" with a code nobody received (R25).
 *
 * Logs carry user ids and error messages only — never an address or a code
 * (Plan 9 Decision 2).
 */
export async function sendPendingInviteBatch(
  invitedById: number,
  options: { scope?: Prisma.UserWhereInput; batchSize?: number } = {},
): Promise<BulkInviteResponse> {
  const batchSize = options.batchSize ?? BULK_INVITE_BATCH_SIZE;
  const batch = (await listPendingInviteUserIds(options.scope)).slice(0, batchSize);

  let skipped = 0;
  let failed = 0;
  const minted: MintedInvite[] = [];
  for (const userId of batch) {
    try {
      const outcome = await inviteIfStillPending(userId, invitedById);
      if (outcome === null) skipped += 1;
      else minted.push(outcome);
    } catch (err) {
      failed += 1;
      console.error(
        `[invites] bulk: failed to issue an invite for user ${userId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const delivered = await mapWithConcurrency(minted, BULK_INVITE_MAIL_CONCURRENCY, async (invite) => {
    try {
      await sendInviteEmail(invite.email, invite.raw, invite.expiresAt);
      return true;
    } catch (err) {
      console.error(
        `[invites] bulk: failed to send the invite email for user ${invite.userId}:`,
        err instanceof Error ? err.message : err,
      );
      // Back into the pending pool: an invite nobody received is not an invite.
      await db.inviteToken.updateMany({
        where: { token: hashToken(invite.raw), usedAt: null },
        data: { expiresAt: new Date() },
      });
      return false;
    }
  });

  const sent = delivered.filter(Boolean).length;
  failed += delivered.length - sent;
  const remaining = (await listPendingInviteUserIds(options.scope)).length;
  return { sent, skipped, failed, remaining };
}
```

(`db`, `hashToken`, `issueInvite` and `IssuedInvite` are already in scope in
this file from Plan 9.)

- [ ] **Step 5: The routes, and `confirmSuper` on create**

In `routes/users.ts`:

1. Delete the local `export function liveInviteWhere(now: Date) { … }` and
   import it instead. Run `grep -rn "liveInviteWhere" apps/backend/src` first.
   Every hit must be inside `routes/users.ts` or `lib/invites.ts`. If any other
   file imports it from `routes/users`, repoint that import to `lib/invites` too.
2. Add the imports:

```ts
import rateLimit from "express-rate-limit";

import { isEmailConfigured } from "../lib/email";
import { liveInviteWhere, listPendingInviteUserIds, sendPendingInviteBatch } from "../lib/invites";
import { rateLimitHandler } from "../lib/rate-limit";
```

   (Merge with Plan 9's existing `../lib/invites` and `../lib/email` import lines.)

3. In `usersRouter.post("/", …)`, directly after `const body = parsed.data;`:

```ts
  // Plan 10 Decision 13 — spec 11 D7 rec 3 on CREATE as Plan 9 has it on
  // PATCH: a SUPER grant can never be a mis-tapped picker item.
  if (body.role === "SUPER" && body.confirmSuper !== true) {
    return apiError(res, "confirm_super_required", "Granting SUPER requires explicit confirmation.", 400);
  }
```

4. Above `usersRouter.get("/:id", …)` (`/:id` is one segment, so the two-segment
   path cannot collide with it; registering first just spares the reader the
   reasoning), add:

```ts
// Own bucket (Plan 10 Decision 11). With the 20-user batch ceiling this caps
// bulk sending at 600 invites an hour.
const bulkInviteLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, handler: rateLimitHandler });

/** How many accounts the bulk button would reach (R87: hidden at zero). */
usersRouter.get("/invites/pending", async (req, res) => {
  const user = requireSuper(req, res);
  if (!user) return;
  const ids = await listPendingInviteUserIds();
  return apiOk(res, { pending: ids.length });
});

/**
 * "Send all pending invites" (v1 sendAllPendingInvitesAction,
 * invite-actions.ts:53-75) as ONE bounded batch per request — Plan 10
 * Decision 12. Refuses outright with no mail transport: minting codes nobody
 * receives would also empty the pending pool, hiding the very accounts that
 * still need an invite.
 */
usersRouter.post("/invites/pending", bulkInviteLimiter, async (req, res) => {
  const user = requireSuper(req, res);
  if (!user) return;
  if (!isEmailConfigured()) {
    return apiError(
      res,
      "email_not_configured",
      "Email isn't configured on this server, so invites can't be delivered.",
      503,
    );
  }
  const result = await sendPendingInviteBatch(user.userId);
  return apiOk(res, result);
});
```

- [ ] **Step 6: Run the suites**

Run: `cd apps/backend && npx jest src/__tests__/concurrency.test.ts` → PASS.
Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern "bulk-invites-routes|invites-routes|users-routes"` → PASS (Plan 9's suites prove the `liveInviteWhere` move and the `confirmSuper` check broke nothing).
Run: `pnpm turbo lint typecheck --filter=@space/backend` → clean.

- [ ] **Step 7: OpenAPI** — in this commit:
  - Document both `/users/invites/pending` operations, covering:
    - the definition of pending
    - the 20-user ceiling per request and the `remaining` counter
    - `email_not_configured` 503
    - that a mail failure leaves the person pending
    - that no response ever carries a code
  - On `POST /users`, add the `confirmSuper` field and the `confirm_super_required` 400.

- [ ] **Step 8: Commit**

```bash
git add apps/backend
git commit -m "feat(backend): bounded bulk invites for pending accounts; SUPER creation needs confirmSuper"
```

---

### Task 5: Forgot / reset password — v1-compatible tokens, constant responses, eviction on reset

**Files:**
- Modify: `apps/backend/src/lib/config.ts` (add `MOBILE_APP_SCHEME`)
- Modify: `apps/backend/.env.example`, `turbo.json` (`build.env` gains `MOBILE_APP_SCHEME` — that list's comment requires every runtime key)
- Modify: `apps/backend/src/lib/email.ts` (add `sendPasswordResetEmail`)
- Create: `apps/backend/src/lib/auth/password-reset.ts`
- Modify: `apps/backend/src/routes/auth.ts` (two limiters, two anonymous routes)
- Modify: `apps/backend/src/routes/me.ts` (Plan 9's `POST /password` also expires live reset tokens — Decision 14)
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: extend `apps/backend/src/__tests__/email.test.ts`; create `apps/backend/src/__tests__/integration/password-reset-routes.test.ts`

**Interfaces:**
- Consumes: `forgotPasswordRequestSchema`, `resetPasswordRequestSchema` (Task 1 — relative shared import in `routes/auth.ts`); `PASSWORD_RESET_TTL_MINUTES` (Task 1 — relative shared import in `lib/auth/password-reset.ts`, one more `../`); `hashToken`, `revokeAllRefreshTokensForUser` (Plan 9); `isEmailConfigured` (Task 4); `formatInOrgTime` (Plan 3); `rateLimitHandler` (Plan 9).
- Produces:
  - `config.mobileAppScheme: string`
  - `sendPasswordResetEmail(email: string, code: string, expiresAt: Date): Promise<void>`
  - In `lib/auth/password-reset.ts`:
    - `PASSWORD_RESET_TTL_MS`, `RESET_REQUEST_COOLDOWN_MS`
    - `type ResetWriter = Pick<typeof db, "passwordResetToken">`
    - `expireLiveResetTokens(client: ResetWriter, userId: number, now?: Date): Promise<number>`
    - `issuePasswordReset(client: ResetWriter, userId: number): Promise<{ raw: string; expiresAt: Date }>`
    - `requestPasswordReset(email: string): Promise<void>`
    - `completePasswordReset(rawToken: string, password: string): Promise<"ok" | "invalid">`
  - `POST /api/v1/auth/forgot-password` (anonymous) → `{ data: { ok: true } }` on every path except `400 bad_request` (malformed body) and `429`
  - `POST /api/v1/auth/reset-password` (anonymous) → `{ data: { ok: true } }` or `400 invalid_reset_token`, plus `400 bad_request` and `429`

- [ ] **Step 1: Config and the email — failing unit tests first**

Append to `apps/backend/src/__tests__/email.test.ts` (it already has
`loadEmail(env)` and the `sendMail` mock):

```ts
describe("sendPasswordResetEmail (Plan 10 Decisions 9–10)", () => {
  const CODE = "ab".repeat(32);
  const configured = { GMAIL_USER: "sender@example.test", GMAIL_APP_PASSWORD: "app-password" };

  it("mails the app deep link and the code, and states the expiry", async () => {
    const { sendPasswordResetEmail } = loadEmail({ ...configured, MOBILE_APP_SCHEME: undefined });
    await sendPasswordResetEmail("student@example.test", CODE, new Date("2099-01-01T10:00:00.000Z"));

    expect(sendMail).toHaveBeenCalledTimes(1);
    const call = sendMail.mock.calls[0][0];
    expect(call.to).toBe("student@example.test");
    expect(call.subject).toBe("JPC Space — Password Reset");
    expect(call.html).toContain(`spacev2://reset-password?token=${CODE}`);
    expect(call.html).toContain("expires in 60 minutes");
  });

  it("uses MOBILE_APP_SCHEME when set", async () => {
    const { sendPasswordResetEmail } = loadEmail({ ...configured, MOBILE_APP_SCHEME: "jpcspace" });
    await sendPasswordResetEmail("student@example.test", CODE, new Date("2099-01-01T10:00:00.000Z"));
    expect(sendMail.mock.calls[0][0].html).toContain(`jpcspace://reset-password?token=${CODE}`);
  });

  it("is a silent no-op without a transport — and never logs the code or the address", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const { sendPasswordResetEmail } = loadEmail({ GMAIL_USER: undefined, GMAIL_APP_PASSWORD: undefined });
    await sendPasswordResetEmail("student@example.test", CODE, new Date());
    expect(sendMail).not.toHaveBeenCalled();
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).not.toContain(CODE);
    expect(logged).not.toContain("student@example.test");
    warn.mockRestore();
  });
});

describe("isEmailConfigured", () => {
  it("reflects whether both Gmail credentials are present", () => {
    expect(loadEmail({ GMAIL_USER: "a@example.test", GMAIL_APP_PASSWORD: "p" }).isEmailConfigured()).toBe(true);
    expect(loadEmail({ GMAIL_USER: undefined, GMAIL_APP_PASSWORD: "p" }).isEmailConfigured()).toBe(false);
  });
});
```

Run: `cd apps/backend && npx jest src/__tests__/email.test.ts` → FAIL (`sendPasswordResetEmail` missing).

In `config.ts`'s env schema add:

```ts
  // URL scheme the mobile app registers (apps/mobile/app.json "scheme").
  // Password-reset emails link to <scheme>://reset-password?token=… (Plan 10
  // Decision 10). A custom-scheme link is never fetched over HTTP, so the
  // token never reaches a proxy log, a CDN log or a Referer header.
  MOBILE_APP_SCHEME: z
    .string()
    .regex(/^[a-z][a-z0-9+.-]*$/, "must be a bare URL scheme, e.g. spacev2")
    .default("spacev2"),
```

and `mobileAppScheme: parsed.data.MOBILE_APP_SCHEME,` to the exported
`config`. In `.env.example` append:

```
# URL scheme of the mobile app (apps/mobile/app.json "scheme"). Password-reset
# emails link to <scheme>://reset-password?token=… . Defaults to spacev2.
MOBILE_APP_SCHEME=spacev2
```

and in `turbo.json` add `"MOBILE_APP_SCHEME"` to `build.env` after
`"ENABLE_API_DOCS"` (and after any keys Plans 3 and 9 appended there).

In `email.ts`, add `import { PASSWORD_RESET_TTL_MINUTES } from "../../../../packages/shared/src/index";`
(value import — relative, X12), `let warnedResetUnconfigured = false;` beside
the other `warned…` flags, and below `sendInviteEmail`:

```ts
/**
 * The password-reset email (Plan 10 Decisions 9–10). It offers the app deep
 * link AND prints the code, because many mail clients don't linkify custom
 * schemes; the reset screen accepts either (and a pasted v1 web link).
 *
 * Interpolations: the code (hex — no markup possible), the scheme (validated
 * by config to [a-z0-9+.-]), the TTL constant, and formatInOrgTime's output.
 * None is user-controlled, so nothing needs escaping by construction (ruling
 * C11) — and no name is put in this mail.
 */
export async function sendPasswordResetEmail(email: string, code: string, expiresAt: Date): Promise<void> {
  if (!isConfigured()) {
    // Never the code, never the address (Plan 9 Decision 2's rule).
    if (!warnedResetUnconfigured) {
      warnedResetUnconfigured = true;
      console.warn("[email] GMAIL_USER/GMAIL_APP_PASSWORD are unset — password-reset emails are disabled.");
    }
    return;
  }

  const link = `${config.mobileAppScheme}://reset-password?token=${code}`;
  const bodyHtml = `
    <p style="font-size: 16px; color: ${TEXT}; line-height: 1.6; margin: 0 0 16px 0;">
      We received a request to reset the password for your JPC Space account.
      On your phone, tap the button to choose a new password in the app.
    </p>
    ${buttonHtml(link, "Reset password in the app")}
    <p style="font-size: 14px; color: ${TEXT}; margin: 16px 0 8px 0;">
      Or open the app, choose <strong>&ldquo;Forgot password?&rdquo;</strong> then
      <strong>&ldquo;I have a reset code&rdquo;</strong>, and paste:
    </p>
    <p style="font-family: monospace; font-size: 15px; background-color: ${BG}; border: 1px solid ${BORDER}; border-radius: 6px; padding: 12px 16px; margin: 0 0 16px 0; word-break: break-all;">
      ${code}
    </p>
    <p style="font-size: 14px; color: ${TEXT}; margin: 0 0 8px 0;">
      This code works once and expires in ${PASSWORD_RESET_TTL_MINUTES} minutes (at ${formatInOrgTime(expiresAt)}).
    </p>
    <p style="font-size: 14px; color: ${TEXT}; margin: 0;">
      If you didn't ask for this, you can ignore this email — your password stays the same.
    </p>
  `;

  await getTransporter().sendMail({
    from: fromAddress(),
    to: email,
    subject: "JPC Space — Password Reset",
    html: renderShell("Password Reset Request", "Jesus Project Community", bodyHtml),
  });
}
```

Run: `cd apps/backend && npx jest src/__tests__/email.test.ts` → PASS.

- [ ] **Step 2: Write the failing integration suite**

```ts
// apps/backend/src/__tests__/integration/password-reset-routes.test.ts
import { createHash, randomBytes } from "node:crypto";

import request from "supertest";

const mockSendPasswordResetEmail = jest.fn().mockResolvedValue(undefined);
const mockIsEmailConfigured = jest.fn(() => true);
jest.mock("../../lib/email", () => ({
  ...jest.requireActual("../../lib/email"),
  sendPasswordResetEmail: (...args: unknown[]) => mockSendPasswordResetEmail(...args),
  isEmailConfigured: () => mockIsEmailConfigured(),
}));

import { createApp } from "../../app";
import { db } from "../../db/client";
import { hashToken } from "../../lib/auth/tokens";
import { issuePasswordReset, requestPasswordReset } from "../../lib/auth/password-reset";
import { issueInvite } from "../../lib/invites";
import {
  PASSWORD,
  cleanupTestData,
  createTestUser,
  createUnactivatedTestUser,
  login,
  testEmail,
} from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let superUser: { id: number; email: string };

beforeAll(async () => {
  await cleanupTestData();
  superUser = await createTestUser("reset-super", "SUPER");
});

afterAll(async () => {
  await cleanupTestData();
});

beforeEach(() => {
  mockSendPasswordResetEmail.mockReset().mockResolvedValue(undefined);
  mockIsEmailConfigured.mockReset().mockReturnValue(true);
});

/** The request route answers BEFORE it mints (Decision 9), so poll for the row. */
async function waitForResetRows(userId: number, count: number) {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const rows = await db.passwordResetToken.findMany({
      where: { userId },
      orderBy: { id: "asc" },
      select: { token: true, expiresAt: true, usedAt: true, createdAt: true },
    });
    if (rows.length >= count) return rows;
    if (Date.now() > deadline) throw new Error(`expected ${count} reset rows for user ${userId}, saw ${rows.length}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function mintReset(userId: number): Promise<string> {
  const { raw } = await db.$transaction((tx) => issuePasswordReset(tx, userId));
  return raw;
}

describe("POST /api/v1/auth/forgot-password", () => {
  it("answers identically for a known and an unknown email, and mints only for the known one (R67)", async () => {
    const known = await createTestUser("forgot-known", "STUDENT");

    const a = await request(app).post("/api/v1/auth/forgot-password").send({ email: known.email });
    const b = await request(app).post("/api/v1/auth/forgot-password").send({ email: testEmail("nobody") });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body).toEqual({ data: { ok: true } });
    expect(b.body).toEqual(a.body);

    const rows = await waitForResetRows(known.id, 1);
    // v1's format exactly (R71/R72): stored as a 64-hex SHA-256 digest.
    expect(rows[0]!.token).toMatch(/^[0-9a-f]{64}$/);
    const ttl = rows[0]!.expiresAt.getTime() - rows[0]!.createdAt.getTime();
    expect(Math.abs(ttl - 60 * 60 * 1000)).toBeLessThan(5_000);

    const call = mockSendPasswordResetEmail.mock.calls[0] as [string, string, Date];
    expect(call[0]).toBe(known.email);
    expect(call[1]).toMatch(/^[0-9a-f]{64}$/); // raw: 32 random bytes as hex
    expect(hashToken(call[1])).toBe(rows[0]!.token);
  });

  it("does not wait for the mailer — the response can't time a known address (R69)", async () => {
    const slow = await createTestUser("forgot-slow-smtp", "STUDENT");
    mockSendPasswordResetEmail.mockImplementation(() => new Promise<void>(() => undefined));

    const res = await request(app).post("/api/v1/auth/forgot-password").send({ email: slow.email });
    expect(res.status).toBe(200);
  }, 10_000);

  it("rejects a malformed body with 400 (before any lookup)", async () => {
    const res = await request(app).post("/api/v1/auth/forgot-password").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });
});

describe("requestPasswordReset — the policy behind the constant response", () => {
  it("mints nothing for a deleted account (R70)", async () => {
    const gone = await createTestUser("forgot-deleted", "STUDENT");
    await db.user.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });
    await requestPasswordReset(gone.email);
    expect(await db.passwordResetToken.count({ where: { userId: gone.id } })).toBe(0);
  });

  it("mints nothing when no mail transport is configured — a code nobody receives is a liability", async () => {
    const u = await createTestUser("forgot-no-smtp", "STUDENT");
    mockIsEmailConfigured.mockReturnValue(false);
    await requestPasswordReset(u.email);
    expect(await db.passwordResetToken.count({ where: { userId: u.id } })).toBe(0);
  });

  it("ignores a second request inside the 60 s cooldown (no mail-bombing a victim)", async () => {
    const u = await createTestUser("forgot-cooldown", "STUDENT");
    await requestPasswordReset(u.email);
    await requestPasswordReset(u.email);
    expect(await db.passwordResetToken.count({ where: { userId: u.id } })).toBe(1);
    expect(mockSendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });

  it("after the cooldown, a new request expires the previous token — one live reset per user (R76 fixed)", async () => {
    const u = await createTestUser("forgot-reissue", "STUDENT");
    await requestPasswordReset(u.email);
    // Age the first row past the cooldown.
    await db.passwordResetToken.updateMany({
      where: { userId: u.id },
      data: { createdAt: new Date(Date.now() - 2 * 60 * 1000) },
    });
    await requestPasswordReset(u.email);

    const rows = await db.passwordResetToken.findMany({
      where: { userId: u.id },
      orderBy: { id: "asc" },
      select: { expiresAt: true },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(rows[1]!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("POST /api/v1/auth/reset-password", () => {
  it("sets a cost-12 hash, consumes the token, and evicts every session, other reset and live invite (R79 fixed)", async () => {
    const u = await createTestUser("reset-ok", "STUDENT");
    const signIn = await request(app).post("/api/v1/auth/login").send({ email: u.email, password: PASSWORD });
    const oldRefresh = signIn.body.data.refreshToken as string;
    await issueInvite(db, u.id, superUser.id); // a live invite that must not survive
    const raw = await mintReset(u.id);
    // A second live reset token, written directly (issuePasswordReset would
    // have expired the first): the reset must consume it too.
    const other = await db.passwordResetToken.create({
      data: {
        token: hashToken(randomBytes(32).toString("hex")),
        userId: u.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
      select: { id: true },
    });

    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: raw, password: "brand-new-password" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { ok: true } });

    const row = await db.user.findUnique({ where: { id: u.id }, select: { passwordHash: true } });
    expect(row?.passwordHash).toMatch(/^\$2[aby]\$12\$/); // bcrypt, cost 12 (spec 11 D8)

    const used = await db.passwordResetToken.findUnique({ where: { token: hashToken(raw) }, select: { usedAt: true } });
    expect(used?.usedAt).not.toBeNull();
    const otherRow = await db.passwordResetToken.findUnique({ where: { id: other.id }, select: { expiresAt: true } });
    expect(otherRow!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(
      await db.inviteToken.count({ where: { userId: u.id, usedAt: null, expiresAt: { gt: new Date() } } }),
    ).toBe(0);

    // The old session is dead: rotation of the pre-reset refresh token 401s.
    const rotate = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: oldRefresh });
    expect(rotate.status).toBe(401);

    // New password in, old password out.
    expect(
      (await request(app).post("/api/v1/auth/login").send({ email: u.email, password: "brand-new-password" })).status,
    ).toBe(200);
    expect((await request(app).post("/api/v1/auth/login").send({ email: u.email, password: PASSWORD })).status).toBe(401);
  });

  it("is single-use", async () => {
    const u = await createTestUser("reset-once", "STUDENT");
    const raw = await mintReset(u.id);
    await request(app).post("/api/v1/auth/reset-password").send({ token: raw, password: "brand-new-password" });
    const again = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: raw, password: "another-password-1" });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe("invalid_reset_token");
  });

  it("refuses expired, unknown and deleted-account tokens with one byte-identical body (R77/R78 closed)", async () => {
    const expiredUser = await createTestUser("reset-expired", "STUDENT");
    const expired = await mintReset(expiredUser.id);
    await db.passwordResetToken.updateMany({
      where: { token: hashToken(expired) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const goneUser = await createTestUser("reset-gone", "STUDENT");
    const gone = await mintReset(goneUser.id);
    await db.user.update({ where: { id: goneUser.id }, data: { deletedAt: new Date() } });

    const bodies = [];
    for (const token of [expired, randomBytes(32).toString("hex"), gone]) {
      const res = await request(app).post("/api/v1/auth/reset-password").send({ token, password: "brand-new-password" });
      expect(res.status).toBe(400);
      bodies.push(res.body);
    }
    expect(bodies[0].error.code).toBe("invalid_reset_token");
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
  });

  it("accepts a token minted the way v1 mints them — the two backends interoperate (Decision 9)", async () => {
    const u = await createTestUser("reset-v1-format", "STUDENT");
    // Exactly jpc-space/src/lib/auth/password-reset.ts:19-29.
    const v1Raw = randomBytes(32).toString("hex");
    await db.passwordResetToken.create({
      data: {
        token: createHash("sha256").update(v1Raw).digest("hex"),
        userId: u.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: v1Raw, password: "brand-new-password" });
    expect(res.status).toBe(200);
  });

  it("activates a never-activated account (v1 parity, R70) and retires its live invite", async () => {
    const fresh = await createUnactivatedTestUser("reset-unactivated", "STUDENT");
    await issueInvite(db, fresh.id, superUser.id);
    const raw = await mintReset(fresh.id);

    const res = await request(app).post("/api/v1/auth/reset-password").send({ token: raw, password: "brand-new-password" });
    expect(res.status).toBe(200);
    expect(
      (await request(app).post("/api/v1/auth/login").send({ email: fresh.email, password: "brand-new-password" })).status,
    ).toBe(200);
    expect(
      await db.inviteToken.count({ where: { userId: fresh.id, usedAt: null, expiresAt: { gt: new Date() } } }),
    ).toBe(0);
  });

  it("validates the password before touching the token — a weak password consumes nothing", async () => {
    const u = await createTestUser("reset-weak", "STUDENT");
    const raw = await mintReset(u.id);
    const res = await request(app).post("/api/v1/auth/reset-password").send({ token: raw, password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
    const row = await db.passwordResetToken.findUnique({ where: { token: hashToken(raw) }, select: { usedAt: true } });
    expect(row?.usedAt).toBeNull();
  });
});

describe("POST /api/v1/me/password consumes outstanding reset tokens (spec 18 R29, Decision 14)", () => {
  it("a token minted before a password change no longer works after it", async () => {
    const u = await createTestUser("change-then-reset", "STUDENT");
    const raw = await mintReset(u.id);
    const change = await request(app)
      .post("/api/v1/me/password")
      .set("authorization", `Bearer ${await login(app, u.email)}`)
      .send({ currentPassword: PASSWORD, newPassword: "changed-password-1" });
    expect(change.status).toBe(200);

    const res = await request(app).post("/api/v1/auth/reset-password").send({ token: raw, password: "brand-new-password" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_reset_token");
  });
});
```

Request budget against the in-memory limiters: this file makes 4
`forgot-password` calls (limit 10) and 10 `reset-password` calls (limit 20).
Jest gives each test file its own module registry, so these buckets are not
shared with other suites. Keep the counts under the limits when adding cases.

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern password-reset-routes`
Expected: FAIL — `lib/auth/password-reset` does not exist.

- [ ] **Step 3: The reset library**

```ts
// apps/backend/src/lib/auth/password-reset.ts
import { randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";
// Relative, not "@space/shared" — a VALUE import from src/lib/auth/ (ruling X12).
import { PASSWORD_RESET_TTL_MINUTES } from "../../../../../packages/shared/src/index";

import { db } from "../../db/client";
import { isEmailConfigured, sendPasswordResetEmail } from "../email";
import { hashToken, revokeAllRefreshTokensForUser } from "./tokens";

/** v1's TTL, unchanged (spec 11 R73). */
export const PASSWORD_RESET_TTL_MS = PASSWORD_RESET_TTL_MINUTES * 60 * 1000;
/** One request per account per minute — stops mail-bombing a victim from many IPs. */
export const RESET_REQUEST_COOLDOWN_MS = 60 * 1000;

export type ResetWriter = Pick<typeof db, "passwordResetToken">;

/** Expire every live, unused reset token a user holds. Returns how many. */
export async function expireLiveResetTokens(
  client: ResetWriter,
  userId: number,
  now: Date = new Date(),
): Promise<number> {
  const result = await client.passwordResetToken.updateMany({
    where: { userId, usedAt: null, expiresAt: { gt: now } },
    data: { expiresAt: now },
  });
  return result.count;
}

/**
 * Mint a reset token in v1's exact format — 32 random bytes as 64 hex chars
 * (R71), stored only as its SHA-256 hex digest (R72) via the same hashToken
 * refresh and invite tokens use. Identical format is what lets a token minted
 * by either backend complete at either backend (Plan 10 Decision 9).
 * Prior live tokens are expired first: one live reset per user (spec 11 D5
 * rec 2 — v1 let every request add another live credential, R76).
 * Deliberately sends no email: callers mail after their transaction commits.
 */
export async function issuePasswordReset(
  client: ResetWriter,
  userId: number,
): Promise<{ raw: string; expiresAt: Date }> {
  const raw = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS);
  await expireLiveResetTokens(client, userId, now);
  await client.passwordResetToken.create({ data: { token: hashToken(raw), userId, expiresAt } });
  return { raw, expiresAt };
}

/**
 * Everything forgot-password does, run AFTER the route has already answered
 * (Plan 10 Decision 9) — so neither the lookup nor the SMTP round trip can be
 * timed (v1 awaited SMTP only for real accounts, R69). Returns void on every
 * path; the caller learns nothing (R67).
 */
export async function requestPasswordReset(email: string): Promise<void> {
  // No transport → mint nothing: a code nobody can receive is a liability.
  if (!isEmailConfigured()) return;

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true, deletedAt: true },
  });
  if (!user || user.deletedAt) return; // R70

  const recent = await db.passwordResetToken.findFirst({
    where: { userId: user.id, createdAt: { gt: new Date(Date.now() - RESET_REQUEST_COOLDOWN_MS) } },
    select: { id: true },
  });
  if (recent) return;

  const { raw, expiresAt } = await db.$transaction((tx) => issuePasswordReset(tx, user.id));
  try {
    await sendPasswordResetEmail(user.email, raw, expiresAt);
  } catch (err) {
    // R68 kept: a transport failure is logged, never surfaced. User id and
    // message only — not the address, not the code.
    console.error(
      `[password-reset] failed to send the reset email for user ${user.id}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Complete a reset. "invalid" covers unknown, used, expired, and a target
 * deleted since the request — one outcome, so the route can answer with one
 * opaque code (spec 11 D5 rec 3; v1 rendered three different messages, R78).
 *
 * The consume is a guarded updateMany inside the transaction, so two
 * concurrent submissions of one token cannot both win. In the same
 * transaction: the cost-12 hash (D8), every other live reset token and live
 * invite expired, and every refresh token revoked — the "I think I'm
 * compromised" remedy finally evicts the attacker (R79, spec 11 D6).
 */
export async function completePasswordReset(rawToken: string, password: string): Promise<"ok" | "invalid"> {
  const record = await db.passwordResetToken.findUnique({
    where: { token: hashToken(rawToken) },
    select: { id: true, userId: true, usedAt: true, expiresAt: true, user: { select: { deletedAt: true } } },
  });
  if (!record) return "invalid";
  if (record.usedAt !== null) return "invalid";
  if (record.expiresAt <= new Date()) return "invalid";
  if (record.user.deletedAt !== null) return "invalid";

  const passwordHash = await bcrypt.hash(password, 12);

  const consumed = await db.$transaction(async (tx) => {
    const now = new Date();
    const stamped = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (stamped.count === 0) return false;
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    await expireLiveResetTokens(tx, record.userId, now);
    await tx.inviteToken.updateMany({
      where: { userId: record.userId, usedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });
    await revokeAllRefreshTokensForUser(tx, record.userId);
    return true;
  });
  return consumed ? "ok" : "invalid";
}
```

- [ ] **Step 4: The routes**

In `routes/auth.ts`, extend the existing relative shared import with
`forgotPasswordRequestSchema, resetPasswordRequestSchema`, and add:

```ts
import { completePasswordReset, requestPasswordReset } from "../lib/auth/password-reset";
```

Below Plan 9's `accept-invite` route:

```ts
// Own buckets (Plan 10 Decision 11), like acceptInviteLimiter: sharing the
// login limiter would let failed sign-ins lock a person out of recovering.
const forgotPasswordLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, handler: rateLimitHandler });
const resetPasswordLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, handler: rateLimitHandler });

/**
 * Anonymous by design (spec 11 §4). The SAME body on every path (R67), and
 * the work runs after the response is sent, so the response time can't
 * reveal whether the address exists either (R69). v1 had no limiter here.
 */
authRouter.post("/forgot-password", forgotPasswordLimiter, (req, res) => {
  const parsed = forgotPasswordRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", "A valid email is required.", 400);
  }
  void requestPasswordReset(parsed.data.email).catch((err: unknown) => {
    console.error("[password-reset] request failed:", err instanceof Error ? err.message : err);
  });
  return apiOk(res, { ok: true });
});

/**
 * Possession of the token is the authorization. One opaque failure,
 * invalid_reset_token, as 400 — not 401, which the mobile interceptor would
 * spend a refresh rotation on (Plan 9 Decision 10). The password is validated
 * by the schema before the token is looked at (R77's order kept), so a weak
 * password never consumes a token.
 */
authRouter.post("/reset-password", resetPasswordLimiter, async (req, res) => {
  const parsed = resetPasswordRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(
      res,
      "bad_request",
      parsed.error.issues[0]?.message ?? "A reset code and a valid password are required.",
      400,
    );
  }
  const outcome = await completePasswordReset(parsed.data.token, parsed.data.password);
  if (outcome === "invalid") {
    return apiError(res, "invalid_reset_token", "This reset code is invalid or has expired. Request a new one.", 400);
  }
  return apiOk(res, { ok: true });
});
```

- [ ] **Step 5: A password change consumes reset tokens (Decision 14)**

In `routes/me.ts`, add `import { expireLiveResetTokens } from "../lib/auth/password-reset";`
and change Plan 9's `POST /password` transaction body to:

```ts
  const sessionsRevoked = await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.userId }, data: { passwordHash: newHash } });
    // Spec 18 R29 / spec 11 D6: an outstanding reset link must not outlive
    // the password it was meant to replace.
    await expireLiveResetTokens(tx, user.userId);
    return revokeAllRefreshTokensForUser(tx, user.userId, exceptHash);
  });
```

- [ ] **Step 6: Run the suites**

Run: `cd apps/backend && npx jest src/__tests__/email.test.ts src/__tests__/config.test.ts` → PASS.
Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern "password-reset-routes|auth-routes|me-settings-routes"` → PASS.
Run: `pnpm turbo lint typecheck --filter=@space/backend` → clean.

- [ ] **Step 7: OpenAPI** — in this commit, add both anonymous paths:
  - **forgot-password:** always `{ ok: true }`; asynchronous; per-account cooldown; 429.
  - **reset-password:** the single `invalid_reset_token` 400; revokes all sessions and outstanding reset/invite codes; v1-minted tokens accepted.

  Also mention on `POST /me/password` that it now expires outstanding reset codes.

- [ ] **Step 8: Commit**

```bash
git add apps/backend turbo.json
git commit -m "feat(backend): forgot/reset password — v1-compatible tokens, constant responses, full eviction on reset"
```

---

### Task 6: Mobile foundations — `Sheet`, `ChoiceChips`, action gates, form helpers, hooks

**Files:**
- Create: `apps/mobile/src/ui/Sheet.tsx`; Modify: `apps/mobile/src/ui/index.ts` (export it)
- Create: `apps/mobile/src/components/ChoiceChips.tsx`
- Create: `apps/mobile/src/lib/student-actions.ts`
- Create: `apps/mobile/src/lib/student-form.ts`
- Modify: `apps/mobile/src/hooks/use-students.ts` (Plan 7's — five mutations)
- Modify: `apps/mobile/src/hooks/use-users.ts` (Plan 9's — create, pending count, bulk send)
- Modify: `apps/mobile/src/lib/query-keys.ts` (`users.pendingInvites()`)
- Create: `apps/mobile/src/hooks/use-password-reset.ts`
- Test: `apps/mobile/src/__tests__/sheet.test.tsx`, `student-actions.test.ts`, `student-form.test.ts`, `student-lifecycle-hooks.test.tsx`, `account-hooks.test.tsx` (all new)

**Interfaces:**
- Consumes: Task 1's schemas and helpers; Plan 7's student contracts and `queryKeys.students`; Plan 9's `createUserRequestSchema`, `queryKeys.users`; `apiClient`.
- Produces:
  - `<Sheet visible title onClose>{children}</Sheet>` from `src/ui`
  - `<ChoiceChips label options value onChange error? />` with `type ChoiceOption<T>`
  - In `src/lib/student-actions.ts`:
    - `isAdminOfSeasonForUi(user, scopes, seasonId): boolean`
    - `studentActionsFor(user, scopes, student): StudentActions`, where `StudentActions = { canEdit, canEditSeasonPointer, canGraduate, canDelete, canDrop(e) }`
  - In `src/lib/student-form.ts`:
    - `StudentFormValues`, `StudentFormErrors`
    - `emptyStudentForm()`, `studentFormFromDetail(detail)`, `validateStudentForm(values)`
    - `toCreateStudentBody(values)`, `toUpdateStudentBody(values, initial, { includeSeasonPointer })`
  - In `use-students.ts`: `useCreateStudent()`, `useUpdateStudent()`, `useGraduateStudent()`, `useDeleteStudent()`, `useDropEnrollment()`
  - In `use-users.ts`: `useCreateUser()`, `usePendingInviteCount(enabled)`, `useSendPendingInvites()`
  - `queryKeys.users.pendingInvites()`
  - In `use-password-reset.ts`: `useForgotPassword()`, `useResetPassword()`

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/mobile/src/__tests__/sheet.test.tsx
import { fireEvent, screen } from "@testing-library/react-native";

import { ChoiceChips } from "../components/ChoiceChips";
import { Sheet, Text } from "../ui";
import { renderWithProviders } from "./helpers/render";

describe("Sheet", () => {
  it("renders its title and content only while visible", () => {
    const { rerender } = renderWithProviders(
      <Sheet visible={false} title="Graduate Sara?" onClose={() => undefined}>
        <Text>Body</Text>
      </Sheet>,
    );
    expect(screen.queryByText("Graduate Sara?")).toBeNull();

    rerender(
      <Sheet visible title="Graduate Sara?" onClose={() => undefined}>
        <Text>Body</Text>
      </Sheet>,
    );
    expect(screen.getByText("Graduate Sara?")).toBeTruthy();
    expect(screen.getByText("Body")).toBeTruthy();
  });

  it("closes from the backdrop", () => {
    const onClose = jest.fn();
    renderWithProviders(
      <Sheet visible title="T" onClose={onClose}>
        <Text>Body</Text>
      </Sheet>,
    );
    fireEvent.press(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("ChoiceChips", () => {
  it("reports the pressed option's value and marks the current one selected", () => {
    const onChange = jest.fn();
    renderWithProviders(
      <ChoiceChips
        label="Season"
        options={[
          { value: null, label: "None" },
          { value: 7, label: "Spring 2099" },
        ]}
        value={null}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("radio", { name: "None" }).props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(screen.getByText("Spring 2099"));
    expect(onChange).toHaveBeenCalledWith(7);
  });
});
```

```ts
// apps/mobile/src/__tests__/student-actions.test.ts
import type { EnrollmentHistoryItem } from "@space/shared";

import { studentActionsFor } from "../lib/student-actions";
import { makeScopes, makeUser } from "./helpers/session";

const row = (seasonId: number, status: EnrollmentHistoryItem["status"]): EnrollmentHistoryItem => ({
  enrollmentId: 500 + seasonId,
  seasonId,
  seasonCode: `S${seasonId}`,
  seasonTitle: `Season ${seasonId}`,
  seasonStatus: "ACTIVE",
  startDate: "2099-01-01T00:00:00.000Z",
  endDate: "2099-12-31T00:00:00.000Z",
  groupName: null,
  status,
  enrolledAt: "2099-01-01T00:00:00.000Z",
  completedAt: null,
  droppedAt: null,
  dropReason: null,
});

const student = { graduationYear: null, enrollments: [row(7, "ACTIVE"), row(8, "ACTIVE"), row(9, "WITHDRAWN")] };

describe("studentActionsFor (Plan 10 Decision 6 — mirrors the server gates)", () => {
  it("gives SUPER everything, and Drop on every ACTIVE row only", () => {
    const a = studentActionsFor(makeUser("SUPER"), makeScopes(), student);
    expect(a).toMatchObject({ canEdit: true, canEditSeasonPointer: true, canGraduate: true, canDelete: true });
    expect(student.enrollments.map(a.canDrop)).toEqual([true, true, false]);
  });

  it("gives an ADMIN Edit and Drop for their own season only — never Graduate or Delete (R55, R64/R68)", () => {
    const a = studentActionsFor(makeUser("ADMIN"), makeScopes({ seasonAdminIds: [7] }), student);
    expect(a).toMatchObject({ canEdit: true, canEditSeasonPointer: false, canGraduate: false, canDelete: false });
    expect(student.enrollments.map(a.canDrop)).toEqual([true, false, false]);
  });

  it("refuses ADMIN Edit when their season's enrollment is no longer ACTIVE (Plan 7's canEditStudent)", () => {
    const a = studentActionsFor(makeUser("ADMIN"), makeScopes({ seasonAdminIds: [9] }), student);
    expect(a.canEdit).toBe(false);
  });

  it("ignores a stray season-admin claim on a non-ADMIN role (ruling C7)", () => {
    const a = studentActionsFor(makeUser("STUDENT"), makeScopes({ seasonAdminIds: [7] }), student);
    expect(a.canEdit).toBe(false);
    expect(student.enrollments.map(a.canDrop)).toEqual([false, false, false]);
  });

  it("hides Graduate once graduated (R63) and grants nothing without a session", () => {
    expect(studentActionsFor(makeUser("SUPER"), makeScopes(), { ...student, graduationYear: 2020 }).canGraduate).toBe(false);
    const none = studentActionsFor(null, null, student);
    expect(none).toMatchObject({ canEdit: false, canGraduate: false, canDelete: false });
  });
});
```

```ts
// apps/mobile/src/__tests__/student-form.test.ts
import {
  emptyStudentForm,
  studentFormFromDetail,
  toCreateStudentBody,
  toUpdateStudentBody,
  validateStudentForm,
} from "../lib/student-form";

const filled = {
  ...emptyStudentForm(),
  name: "  Sara Student ",
  email: " sara@jpc.test ",
  university: "",
  dateOfBirth: "2004-03-09",
  notes: "Watch attendance",
  seasonId: 7,
};

describe("validateStudentForm", () => {
  it("passes a filled form", () => {
    expect(validateStudentForm(filled)).toEqual({});
  });

  it("names each bad field with a message the screen shows verbatim", () => {
    const errors = validateStudentForm({
      ...filled,
      name: "S",
      email: "nope",
      dateOfBirth: "09/03/2004",
      university: "x".repeat(161),
    });
    expect(errors).toEqual({
      name: "At least 2 characters.",
      email: "Must be a valid email.",
      dateOfBirth: "Use YYYY-MM-DD.",
    });
    expect(validateStudentForm({ ...filled, university: "x".repeat(161) })).toEqual({ university: "Too long." });
  });
});

describe("request bodies", () => {
  it("toCreateStudentBody trims, sends blanks as null, and writes the birthday as UTC midnight (Decision 8)", () => {
    const body = toCreateStudentBody(filled);
    expect(body).toMatchObject({
      name: "Sara Student",
      email: "sara@jpc.test",
      university: null,
      dateOfBirth: "2004-03-09T00:00:00.000Z",
      notes: "Watch attendance",
      seasonId: 7,
    });
    expect(body).not.toHaveProperty("password");
  });

  it("toUpdateStudentBody sends activeSeasonId only when permitted AND changed", () => {
    const initial = { ...filled, seasonId: 7 };
    expect(toUpdateStudentBody(initial, initial, { includeSeasonPointer: true })).not.toHaveProperty("activeSeasonId");
    expect(toUpdateStudentBody({ ...initial, seasonId: 8 }, initial, { includeSeasonPointer: false })).not.toHaveProperty(
      "activeSeasonId",
    );
    expect(toUpdateStudentBody({ ...initial, seasonId: null }, initial, { includeSeasonPointer: true }).activeSeasonId).toBeNull();
  });
});

describe("studentFormFromDetail", () => {
  it("reads v1's browser-local-midnight birthday back as the right day, and keeps internal notes", () => {
    const values = studentFormFromDetail({
      id: 21,
      name: "Sara Student",
      email: "sara@jpc.test",
      avatarPath: null,
      graduationYear: null,
      currentGroup: null,
      enrollments: [],
      profile: {
        university: null, year: null, gifts: null,
        activeSeasonId: 7, activeSeasonTitle: "Spring 2099", activeSeasonCode: "S7",
        phone: "+20 100", dateOfBirth: "2004-03-08T22:00:00.000Z", spiritualBackground: null,
        notes: "Watch attendance",
      },
    });
    expect(values).toMatchObject({ dateOfBirth: "2004-03-09", phone: "+20 100", notes: "Watch attendance", seasonId: 7 });
  });
});
```

```tsx
// apps/mobile/src/__tests__/student-lifecycle-hooks.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

jest.mock("../lib/api-client", () => ({
  apiClient: { post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

import { apiClient } from "../lib/api-client";
import {
  useCreateStudent,
  useDeleteStudent,
  useDropEnrollment,
  useGraduateStudent,
  useUpdateStudent,
} from "../hooks/use-students";

const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const del = apiClient.delete as jest.Mock;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => jest.clearAllMocks());

describe("student lifecycle mutations (ruling X10 — parsed, never cast)", () => {
  it("useGraduateStudent posts the year and parses the response", async () => {
    post.mockResolvedValue({ data: { data: { id: 21, graduationYear: 2020, enrollmentsCompleted: 2 } } });
    const { result } = renderHook(() => useGraduateStudent(), { wrapper });
    await act(() => result.current.mutateAsync({ id: 21, graduationYear: 2020 }));
    expect(post).toHaveBeenCalledWith("/api/v1/students/21/graduate", { graduationYear: 2020 });
    expect(result.current.data?.enrollmentsCompleted).toBe(2);
  });

  it("useGraduateStudent fails loudly on a drifted response", async () => {
    post.mockResolvedValue({ data: { data: { id: 21 } } });
    const { result } = renderHook(() => useGraduateStudent(), { wrapper });
    act(() => result.current.mutate({ id: 21, graduationYear: 2020 }));
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("useDeleteStudent, useDropEnrollment, useCreateStudent and useUpdateStudent hit Plan 7/17's routes", async () => {
    del.mockResolvedValue({ data: { data: { id: 21, deletedAt: "2099-01-01T00:00:00.000Z" } } });
    patch.mockResolvedValueOnce({ data: { data: { id: 507, status: "WITHDRAWN" } } });
    patch.mockResolvedValueOnce({ data: { data: { id: 21 } } });
    post.mockResolvedValue({ data: { data: { id: 22, email: "n@jpc.test" } } });

    const remove = renderHook(() => useDeleteStudent(), { wrapper }).result;
    await act(() => remove.current.mutateAsync({ id: 21 }));
    expect(del).toHaveBeenCalledWith("/api/v1/students/21");

    const drop = renderHook(() => useDropEnrollment(), { wrapper }).result;
    await act(() => drop.current.mutateAsync({ studentId: 21, seasonId: 7, dropReason: "Moved away" }));
    expect(patch).toHaveBeenCalledWith("/api/v1/students/21/enrollments/7", {
      status: "WITHDRAWN",
      dropReason: "Moved away",
    });

    const update = renderHook(() => useUpdateStudent(), { wrapper }).result;
    await act(() => update.current.mutateAsync({ id: 21, body: { phone: null } }));
    expect(patch).toHaveBeenLastCalledWith("/api/v1/students/21", { phone: null });

    const create = renderHook(() => useCreateStudent(), { wrapper }).result;
    await act(() => create.current.mutateAsync({ name: "New Student", email: "n@jpc.test" }));
    expect(post).toHaveBeenCalledWith("/api/v1/students", { name: "New Student", email: "n@jpc.test" });
  });
});
```

```tsx
// apps/mobile/src/__tests__/account-hooks.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));

import { apiClient } from "../lib/api-client";
import { useForgotPassword, useResetPassword } from "../hooks/use-password-reset";
import { useCreateUser, usePendingInviteCount, useSendPendingInvites } from "../hooks/use-users";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => jest.clearAllMocks());

describe("account hooks", () => {
  it("usePendingInviteCount reads the count, and fires nothing when disabled", async () => {
    get.mockResolvedValue({ data: { data: { pending: 3 } } });
    const off = renderHook(() => usePendingInviteCount(false), { wrapper });
    expect(off.result.current.fetchStatus).toBe("idle");
    expect(get).not.toHaveBeenCalled();

    const on = renderHook(() => usePendingInviteCount(true), { wrapper });
    await waitFor(() => expect(on.result.current.data).toBe(3));
    expect(get).toHaveBeenCalledWith("/api/v1/users/invites/pending");
  });

  it("useSendPendingInvites posts with a raised timeout and parses four counters", async () => {
    post.mockResolvedValue({ data: { data: { sent: 2, skipped: 0, failed: 1, remaining: 5 } } });
    const { result } = renderHook(() => useSendPendingInvites(), { wrapper });
    await act(() => result.current.mutateAsync());
    expect(post).toHaveBeenCalledWith("/api/v1/users/invites/pending", undefined, { timeout: 60_000 });
    expect(result.current.data).toEqual({ sent: 2, skipped: 0, failed: 1, remaining: 5 });
  });

  it("useCreateUser posts the body and parses { userId }", async () => {
    post.mockResolvedValue({ data: { data: { userId: 40 } } });
    const { result } = renderHook(() => useCreateUser(), { wrapper });
    await act(() =>
      result.current.mutateAsync({ name: "New Person", email: "p@jpc.test", role: "STUDENT", graduationYear: null }),
    );
    expect(result.current.data).toEqual({ userId: 40 });
  });

  it("the reset hooks hit the anonymous endpoints and parse the ack", async () => {
    post.mockResolvedValue({ data: { data: { ok: true } } });
    const forgot = renderHook(() => useForgotPassword(), { wrapper }).result;
    await act(() => forgot.current.mutateAsync({ email: "a@jpc.test" }));
    expect(post).toHaveBeenCalledWith("/api/v1/auth/forgot-password", { email: "a@jpc.test" });

    const reset = renderHook(() => useResetPassword(), { wrapper }).result;
    await act(() => reset.current.mutateAsync({ token: "ab".repeat(32), password: "longenough" }));
    expect(post).toHaveBeenLastCalledWith("/api/v1/auth/reset-password", {
      token: "ab".repeat(32),
      password: "longenough",
    });
  });
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/sheet.test.tsx src/__tests__/student-actions.test.ts src/__tests__/student-form.test.ts src/__tests__/student-lifecycle-hooks.test.tsx src/__tests__/account-hooks.test.tsx`
Expected: FAIL. None of the modules or exports exist yet.

- [ ] **Step 2: `Sheet` and `ChoiceChips`**

```tsx
// apps/mobile/src/ui/Sheet.tsx
import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../theme";
import { Text } from "./Text";

export interface SheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Bottom sheet (Plan 10 Decision 7) — v1's modals become sheets per the
 * mobile conventions (spec 06 §9). An RN Modal sliding up, a tappable
 * backdrop, and the bottom inset added to the sheet's own bottom padding
 * (per-edge only — never a `padding` shorthand plus overrides; Yoga resolves
 * the specific edge first, see Screen).
 */
export function Sheet({ visible, title, onClose, children }: SheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.black, opacity: 0.4 }]}
        />
        <View
          accessibilityViewIsModal
          style={{
            backgroundColor: theme.colors.white,
            borderTopLeftRadius: theme.radii.lg,
            borderTopRightRadius: theme.radii.lg,
            paddingTop: theme.spacing.lg,
            paddingLeft: theme.spacing.md,
            paddingRight: theme.spacing.md,
            paddingBottom: insets.bottom + theme.spacing.lg,
            gap: theme.spacing.md,
          }}
        >
          <Text variant="heading" accessibilityRole="header">
            {title}
          </Text>
          {children}
        </View>
      </View>
    </Modal>
  );
}
```

Append to `src/ui/index.ts`:

```ts
export { Sheet } from "./Sheet";
export type { SheetProps } from "./Sheet";
```

```tsx
// apps/mobile/src/components/ChoiceChips.tsx
import { Pressable, View } from "react-native";

import { useTheme } from "../theme";
import { Text } from "../ui";

export interface ChoiceOption<T> {
  value: T;
  label: string;
}

export interface ChoiceChipsProps<T> {
  label: string;
  options: readonly ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  error?: string;
}

/**
 * A single-choice row of chips — the season picker on the student forms and
 * the role picker on /users/new. Each chip is a radio with its selected state
 * in accessibilityState, so a screen reader hears the choice and tests can
 * query it by role.
 */
export function ChoiceChips<T extends string | number | null>({
  label,
  options,
  value,
  onChange,
  error,
}: ChoiceChipsProps<T>) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.xs }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text variant="label" color={theme.colors.neutral[700]}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs }}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={String(option.value)}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={{
                paddingVertical: theme.spacing.xs,
                paddingHorizontal: theme.spacing.sm,
                borderRadius: theme.radii.sm,
                borderWidth: theme.borderWidths.thin,
                borderColor: selected ? theme.colors.brand.navy[900] : theme.colors.neutral[300],
              }}
            >
              <Text variant="label" color={selected ? theme.colors.brand.navy[900] : theme.colors.neutral[700]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text variant="caption" color={theme.colors.error[600]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 3: The action gates and form helpers**

```ts
// apps/mobile/src/lib/student-actions.ts
import type { EnrollmentHistoryItem, MeScopes, MeUser } from "@space/shared";

/**
 * Ruling C7 on the client, mirroring apps/backend/src/lib/rbac.ts
 * isAdminOfSeason: SUPER passes; otherwise the ADMIN role AND the claim for
 * that season. A stray SeasonAdmin row on a STUDENT grants nothing here
 * either.
 */
export function isAdminOfSeasonForUi(
  user: Pick<MeUser, "role"> | null,
  scopes: MeScopes | null,
  seasonId: number,
): boolean {
  if (!user || !scopes) return false;
  if (user.role === "SUPER") return true;
  return user.role === "ADMIN" && scopes.seasonAdminIds.includes(seasonId);
}

export interface StudentActions {
  /** Plan 7's canEditStudent: SUPER, or an ADMIN with an ACTIVE enrollment in one of their seasons. */
  canEdit: boolean;
  /** Only SUPER may move activeSeasonId (Plan 7's ADMIN_EDITABLE excludes it). */
  canEditSeasonPointer: boolean;
  /** R55 + R63: SUPER, and only while not yet graduated. */
  canGraduate: boolean;
  canDelete: boolean;
  /** R64 per row — fixes R68's Drop buttons for seasons the viewer doesn't run. */
  canDrop: (enrollment: EnrollmentHistoryItem) => boolean;
}

/**
 * Which lifecycle controls the student detail renders (Plan 10 Decision 6).
 * Every rule mirrors a server gate, so no rendered button can 403; the server
 * still enforces each one regardless.
 */
export function studentActionsFor(
  user: Pick<MeUser, "role"> | null,
  scopes: MeScopes | null,
  student: { graduationYear: number | null; enrollments: readonly EnrollmentHistoryItem[] },
): StudentActions {
  const isSuper = user?.role === "SUPER";
  const isAdminWithActiveRow =
    user?.role === "ADMIN" &&
    student.enrollments.some((e) => e.status === "ACTIVE" && isAdminOfSeasonForUi(user, scopes, e.seasonId));

  return {
    canEdit: isSuper || isAdminWithActiveRow,
    canEditSeasonPointer: isSuper,
    canGraduate: isSuper && student.graduationYear === null,
    canDelete: isSuper,
    canDrop: (e) => e.status === "ACTIVE" && isAdminOfSeasonForUi(user, scopes, e.seasonId),
  };
}
```

```ts
// apps/mobile/src/lib/student-form.ts
import {
  createStudentRequestSchema,
  dateOnlyFromIso,
  isDateOnly,
  isoFromDateOnly,
  updateStudentRequestSchema,
  type CreateStudentBody,
  type StudentDetailInternal,
  type StudentDetailPrivate,
  type StudentDetailPublic,
  type UpdateStudentBody,
} from "@space/shared";

/** What the StudentForm edits — strings as typed, plus the season choice. */
export interface StudentFormValues {
  name: string;
  email: string;
  university: string;
  year: string;
  phone: string;
  /** YYYY-MM-DD or "" (Plan 10 Decision 8). */
  dateOfBirth: string;
  spiritualBackground: string;
  gifts: string;
  notes: string;
  /** Create: the season to enroll in. Edit: the active-season pointer. */
  seasonId: number | null;
}

export type StudentFormErrors = Partial<Record<keyof StudentFormValues, string>>;

const FORM_KEYS: readonly (keyof StudentFormValues)[] = [
  "name", "email", "university", "year", "phone", "dateOfBirth", "spiritualBackground", "gifts", "notes", "seasonId",
];

function isFormKey(key: unknown): key is keyof StudentFormValues {
  return typeof key === "string" && (FORM_KEYS as readonly string[]).includes(key);
}

export function emptyStudentForm(): StudentFormValues {
  return {
    name: "", email: "", university: "", year: "", phone: "", dateOfBirth: "",
    spiritualBackground: "", gifts: "", notes: "", seasonId: null,
  };
}

/** Seeds the edit form. Fields the caller's arm doesn't carry come back blank. */
export function studentFormFromDetail(
  detail: StudentDetailPublic | StudentDetailPrivate | StudentDetailInternal,
): StudentFormValues {
  const p = detail.profile;
  return {
    name: detail.name,
    email: detail.email,
    university: p.university ?? "",
    year: p.year ?? "",
    gifts: p.gifts ?? "",
    phone: "phone" in p ? (p.phone ?? "") : "",
    dateOfBirth: "dateOfBirth" in p ? (dateOnlyFromIso(p.dateOfBirth) ?? "") : "",
    spiritualBackground: "spiritualBackground" in p ? (p.spiritualBackground ?? "") : "",
    notes: "notes" in p ? (p.notes ?? "") : "",
    seasonId: p.activeSeasonId,
  };
}

const blankToNull = (s: string): string | null => (s.trim() === "" ? null : s.trim());

/** The profile fields as the API takes them: "" → null (Plan 7's R26), birthday → UTC midnight. */
function profileFields(v: StudentFormValues) {
  const dob = v.dateOfBirth.trim();
  return {
    university: blankToNull(v.university),
    year: blankToNull(v.year),
    phone: blankToNull(v.phone),
    dateOfBirth: dob === "" ? null : isoFromDateOnly(dob),
    spiritualBackground: blankToNull(v.spiritualBackground),
    gifts: blankToNull(v.gifts),
    notes: blankToNull(v.notes),
  };
}

/**
 * Client-side check against the SAME shared schemas the server runs — no
 * second hand-written copy to drift (v1's R21/R55 defect). Friendly messages
 * for the three fields people get wrong; the length limits come straight
 * from the schema.
 */
export function validateStudentForm(v: StudentFormValues): StudentFormErrors {
  const errors: StudentFormErrors = {};
  const name = v.name.trim();
  if (name.length < 2) errors.name = "At least 2 characters.";
  else if (name.length > 120) errors.name = "At most 120 characters.";
  if (!createStudentRequestSchema.shape.email.safeParse(v.email.trim()).success) {
    errors.email = "Must be a valid email.";
  }
  const dob = v.dateOfBirth.trim();
  if (dob !== "" && !isDateOnly(dob)) {
    errors.dateOfBirth = "Use YYYY-MM-DD.";
    return errors;
  }
  const lengths = updateStudentRequestSchema.safeParse(profileFields(v));
  if (!lengths.success) {
    for (const issue of lengths.error.issues) {
      const key = issue.path[0];
      if (isFormKey(key) && errors[key] === undefined) errors[key] = "Too long.";
    }
  }
  return errors;
}

/** POST /students. No password field exists to send (Plan 7 D7). */
export function toCreateStudentBody(v: StudentFormValues): CreateStudentBody {
  return {
    name: v.name.trim(),
    email: v.email.trim(),
    ...profileFields(v),
    seasonId: v.seasonId,
  };
}

/**
 * PATCH /students/:id. `activeSeasonId` travels only when the caller may move
 * it (SUPER) AND it changed — re-sending a legacy pointer with no ACTIVE
 * enrollment behind it would 409 not_enrolled (Plan 10 Decision 6).
 */
export function toUpdateStudentBody(
  v: StudentFormValues,
  initial: StudentFormValues,
  opts: { includeSeasonPointer: boolean },
): UpdateStudentBody {
  return {
    name: v.name.trim(),
    email: v.email.trim(),
    ...profileFields(v),
    ...(opts.includeSeasonPointer && v.seasonId !== initial.seasonId ? { activeSeasonId: v.seasonId } : {}),
  };
}
```

- [ ] **Step 4: The hooks**

In `src/lib/query-keys.ts`, inside Plan 9's `users` factory, add:

```ts
    /** GET /users/invites/pending — under `users.all`, so every users mutation refreshes it. */
    pendingInvites: () => [...queryKeys.users.all, "pending-invites"] as const,
```

Append to `src/hooks/use-students.ts`. Merge the imports into the file's
existing statements: add `useMutation`, `useQueryClient` and
`type UseMutationResult` to the react-query import, and add the schemas below
to the single `@space/shared` statement.

```ts
import {
  createStudentResponseSchema,
  enrollmentTransitionResponseSchema,
  graduateStudentResponseSchema,
  studentDeletedResponseSchema,
  updateStudentResponseSchema,
  type CreateStudentBody,
  type CreateStudentResponse,
  type EnrollmentTransitionResponse,
  type GraduateStudentResponse,
  type StudentDeletedResponse,
  type UpdateStudentBody,
  type UpdateStudentResponse,
} from "@space/shared";

/** POST /students — the server mints and mails the invite (Plan 10 Decision 1). */
export function useCreateStudent(): UseMutationResult<CreateStudentResponse, Error, CreateStudentBody> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const res = await apiClient.post("/api/v1/students", body);
      return createStudentResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}

export function useUpdateStudent(): UseMutationResult<
  UpdateStudentResponse,
  Error,
  { id: number; body: UpdateStudentBody }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }) => {
      const res = await apiClient.patch(`/api/v1/students/${id}`, body);
      return updateStudentResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
    },
  });
}

export function useGraduateStudent(): UseMutationResult<
  GraduateStudentResponse,
  Error,
  { id: number; graduationYear: number }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, graduationYear }) => {
      const res = await apiClient.post(`/api/v1/students/${id}/graduate`, { graduationYear });
      return graduateStudentResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      // Graduation moves the student from the active list to alumni (R62).
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
    },
  });
}

export function useDeleteStudent(): UseMutationResult<StudentDeletedResponse, Error, { id: number }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }) => {
      const res = await apiClient.delete(`/api/v1/students/${id}`);
      return studentDeletedResponseSchema.parse(res.data.data);
    },
    onSuccess: (_data, { id }) => {
      // The detail now 404s — drop it rather than refetch it.
      queryClient.removeQueries({ queryKey: queryKeys.students.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.lists() });
    },
  });
}

/** PATCH /students/:id/enrollments/:seasonId → WITHDRAWN (Plan 7's endpoint). */
export function useDropEnrollment(): UseMutationResult<
  EnrollmentTransitionResponse,
  Error,
  { studentId: number; seasonId: number; dropReason: string | null }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ studentId, seasonId, dropReason }) => {
      const res = await apiClient.patch(`/api/v1/students/${studentId}/enrollments/${seasonId}`, {
        status: "WITHDRAWN",
        dropReason,
      });
      return enrollmentTransitionResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
    },
  });
}
```

Append to `src/hooks/use-users.ts`. Merge `useQuery` and
`type UseQueryResult` into its react-query import, and these names into its
`@space/shared` import.

```ts
import {
  bulkInviteResponseSchema,
  createUserResponseSchema,
  pendingInvitesResponseSchema,
  type BulkInviteResponse,
  type CreateUserBody,
  type CreateUserResponse,
} from "@space/shared";

/** POST /users — invite-first; the response carries no credential (Plan 9). */
export function useCreateUser(): UseMutationResult<CreateUserResponse, Error, CreateUserBody> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const res = await apiClient.post("/api/v1/users", body);
      return createUserResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}

/** How many accounts "Send pending invites" would reach (R87: hidden at zero). */
export function usePendingInviteCount(enabled: boolean): UseQueryResult<number> {
  return useQuery({
    queryKey: queryKeys.users.pendingInvites(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/users/invites/pending");
      return pendingInvitesResponseSchema.parse(res.data.data).pending;
    },
    enabled,
  });
}

/**
 * One bounded batch (Plan 10 Decision 12). The timeout is raised from the
 * client's 15 s default: a batch is up to 20 SMTP sends, 5 at a time.
 */
export function useSendPendingInvites(): UseMutationResult<BulkInviteResponse, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post("/api/v1/users/invites/pending", undefined, { timeout: 60_000 });
      return bulkInviteResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}
```

```ts
// apps/mobile/src/hooks/use-password-reset.ts
import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import {
  passwordResetAckSchema,
  type ForgotPasswordBody,
  type PasswordResetAck,
  type ResetPasswordBody,
} from "@space/shared";

import { apiClient } from "../lib/api-client";

/** Anonymous. The ack is constant whether or not the address exists (R67). */
export function useForgotPassword(): UseMutationResult<PasswordResetAck, Error, ForgotPasswordBody> {
  return useMutation({
    mutationFn: async (body) => {
      const res = await apiClient.post("/api/v1/auth/forgot-password", body);
      return passwordResetAckSchema.parse(res.data.data);
    },
  });
}

/** Anonymous. One opaque failure (invalid_reset_token) for every bad token. */
export function useResetPassword(): UseMutationResult<PasswordResetAck, Error, ResetPasswordBody> {
  return useMutation({
    mutationFn: async (body) => {
      const res = await apiClient.post("/api/v1/auth/reset-password", body);
      return passwordResetAckSchema.parse(res.data.data);
    },
  });
}
```

- [ ] **Step 5: Run the tests and checks**

Run: `cd apps/mobile && pnpm jest src/__tests__/sheet.test.tsx src/__tests__/student-actions.test.ts src/__tests__/student-form.test.ts src/__tests__/student-lifecycle-hooks.test.tsx src/__tests__/account-hooks.test.tsx` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): Sheet and ChoiceChips primitives, student action gates, form helpers, lifecycle and account hooks"
```

---

### Task 7: Student detail — directory form, graduate and drop sheets, delete

**Files:**
- Move: `apps/mobile/app/(app)/student/[id].tsx` → `apps/mobile/app/(app)/student/[id]/index.tsx` (ruling X7; the file is rewritten below)
- Modify: `apps/mobile/app/(app)/_layout.tsx` (`DETAIL_ROUTE_NAMES`: the `"student/[id]"` entry becomes `"student/[id]/index"`)
- Modify: `apps/mobile/src/__tests__/app-layout.test.tsx` (Plan 7's "declares student/[id] hidden" case → the new name)
- Modify: `apps/mobile/src/__tests__/student-detail.test.tsx` (Plan 7's — import path only)
- Create: `apps/mobile/src/components/GraduateStudentSheet.tsx`, `apps/mobile/src/components/DropEnrollmentSheet.tsx`
- Test: `apps/mobile/src/__tests__/student-detail-actions.test.tsx` (new)

**Interfaces:**
- Consumes: Task 6's `Sheet`, `studentActionsFor`, `useGraduateStudent`, `useDropEnrollment` and `useDeleteStudent`; Task 1's `graduateStudentRequestSchema` and `dateOnlyFromIso`; Plan 7's `useStudentDetail` and `type StudentDetail`; Plan 4's `apiErrorMessage` and `formatDayKey`; Plan 1's `DETAIL_ROUTE_NAMES`.
- Produces:
  - the route `/student/[id]`, now served by `student/[id]/index.tsx`, which Task 8's `edit` sits beside
  - `<GraduateStudentSheet visible studentId studentName onClose />`
  - `<DropEnrollmentSheet studentId enrollment onClose />`, where `enrollment: EnrollmentHistoryItem | null` and null means hidden

- [ ] **Step 1: Move the route and fix the two tests that name it**

```bash
mkdir -p "apps/mobile/app/(app)/student/[id]"
git mv "apps/mobile/app/(app)/student/[id].tsx" "apps/mobile/app/(app)/student/[id]/index.tsx"
```

The file is one directory deeper, so every `"../../../src/…"` import in it becomes `"../../../../src/…"`. Step 4 rewrites the whole file anyway.

In `_layout.tsx`, change the `"student/[id]"` entry of `DETAIL_ROUTE_NAMES` to `"student/[id]/index"`. Leave every other entry as it is.

In `app-layout.test.tsx`, Plan 7's case becomes:

```tsx
it("declares student/[id]/index hidden from the tab bar (directory form, ruling X7)", () => {
  useSessionStore.getState().setSession(makeUser("ADMIN"), scopes);
  render(<AppLayout />);
  const detail = mockScreens.find((s) => s.name === "student/[id]/index");
  expect(detail).toBeDefined();
  expect(detail?.href).toBeNull();
});
```

(`makeUser` and `scopes = makeScopes()` are the file's fixtures since Plan 1 Task 0; Plan 7's case uses the same.)

In `student-detail.test.tsx`, change `import StudentDetailScreen from "../../app/(app)/student/[id]";` to `"../../app/(app)/student/[id]/index"`.

Run: `pnpm turbo routes:generate --filter=@space/mobile`
Run: `cd apps/mobile && pnpm jest src/__tests__/app-layout.test.tsx src/__tests__/role-tabs.test.tsx src/__tests__/student-detail.test.tsx` → PASS. `ambiguousRouteSiblings()` stays `[]`: there is no `student/[id].tsx` left beside the directory. The typed href `/student/[id]` still resolves, because a directory index serves its parent path, so Plan 7's `router.push({ pathname: "/student/[id]", … })` in `StudentList` is unchanged.

- [ ] **Step 2: Write the failing screen test**

```tsx
// apps/mobile/src/__tests__/student-detail-actions.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "21" }),
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import StudentDetailScreen from "../../app/(app)/student/[id]/index";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const del = apiClient.delete as jest.Mock;

const enrollment = (seasonId: number, title: string, status: "ACTIVE" | "WITHDRAWN" = "ACTIVE") => ({
  enrollmentId: 500 + seasonId,
  seasonId,
  seasonCode: `S${seasonId}`,
  seasonTitle: title,
  seasonStatus: "ACTIVE" as const,
  startDate: "2099-01-01T00:00:00.000Z",
  endDate: "2099-12-31T00:00:00.000Z",
  groupName: null,
  status,
  enrolledAt: "2099-01-01T00:00:00.000Z",
  completedAt: null,
  droppedAt: null,
  dropReason: null,
});

const base = {
  id: 21,
  name: "Sara Student",
  email: "sara@jpc.test",
  avatarPath: null,
  graduationYear: null,
  currentGroup: null,
  enrollments: [enrollment(7, "Spring 2099"), enrollment(8, "Autumn 2099")],
};
const publicProfile = {
  university: null, year: null, gifts: null,
  activeSeasonId: 7, activeSeasonTitle: "Spring 2099", activeSeasonCode: "S7",
};
const internalDetail = {
  ...base,
  profile: {
    ...publicProfile,
    phone: null,
    // v1's browser-local midnight for 9 March (Cairo, UTC+2) — Decision 8.
    dateOfBirth: "2004-03-08T22:00:00.000Z",
    spiritualBackground: null,
    notes: null,
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  get.mockResolvedValue({ data: { data: internalDetail } });
});

describe("StudentDetailScreen — lifecycle actions (Plan 10)", () => {
  it("gives SUPER Edit, Graduate, Delete and a Drop per ACTIVE row; the birthday lands on its own day", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<StudentDetailScreen />);

    expect(await screen.findByText("Sara Student")).toBeTruthy();
    expect(screen.getByText("Edit")).toBeTruthy();
    expect(screen.getByText("Graduate")).toBeTruthy();
    expect(screen.getByText("Delete student")).toBeTruthy();
    expect(screen.getAllByText("Drop")).toHaveLength(2);
    expect(screen.getByText(/Mar 9, 2004/)).toBeTruthy();
  });

  it("gives an ADMIN of season 7 Edit and ONE Drop — no Graduate, no Delete", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    renderWithProviders(<StudentDetailScreen />);

    await screen.findByText("Sara Student");
    expect(screen.getByText("Edit")).toBeTruthy();
    expect(screen.queryByText("Graduate")).toBeNull();
    expect(screen.queryByText("Delete student")).toBeNull();
    expect(screen.getAllByText("Drop")).toHaveLength(1);
  });

  it("gives a MENTOR no actions at all", async () => {
    useSessionStore.setState(makeSession("MENTOR"));
    get.mockResolvedValue({ data: { data: { ...base, profile: publicProfile } } });
    renderWithProviders(<StudentDetailScreen />);

    await screen.findByText("Sara Student");
    expect(screen.queryByText("Edit")).toBeNull();
    expect(screen.queryByText("Drop")).toBeNull();
  });

  it("Edit goes to the edit route", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<StudentDetailScreen />);
    fireEvent.press(await screen.findByText("Edit"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/student/[id]/edit", params: { id: "21" } });
  });

  it("graduates through the sheet with the current year as the default (R59)", async () => {
    const year = new Date().getFullYear();
    useSessionStore.setState(makeSession("SUPER"));
    post.mockResolvedValue({ data: { data: { id: 21, graduationYear: year, enrollmentsCompleted: 2 } } });
    renderWithProviders(<StudentDetailScreen />);

    fireEvent.press(await screen.findByText("Graduate"));
    expect(screen.getByText("Graduate Sara Student?")).toBeTruthy();
    expect(screen.getByLabelText("JPCS graduation year").props.value).toBe(String(year));
    fireEvent.press(screen.getByText("Graduate student"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/students/21/graduate", { graduationYear: year }),
    );
    await waitFor(() => expect(screen.queryByText("Graduate Sara Student?")).toBeNull());
  });

  it("refuses an out-of-range year in the sheet without calling the API (R58's bound, one schema)", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<StudentDetailScreen />);

    fireEvent.press(await screen.findByText("Graduate"));
    fireEvent.changeText(screen.getByLabelText("JPCS graduation year"), "1989");
    fireEvent.press(screen.getByText("Graduate student"));

    await waitFor(() =>
      expect(screen.getByLabelText("JPCS graduation year").props.accessibilityHint).toBe(
        `Enter a year between 1990 and ${new Date().getFullYear()}.`,
      ),
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("drops one season's enrollment with a reason through the sheet", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    patch.mockResolvedValue({ data: { data: { id: 507, status: "WITHDRAWN" } } });
    renderWithProviders(<StudentDetailScreen />);

    fireEvent.press((await screen.findAllByText("Drop"))[0]!);
    expect(screen.getByText("Drop from Spring 2099?")).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Reason (optional)"), "Moved away");
    fireEvent.press(screen.getByText("Drop student"));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/students/21/enrollments/7", {
        status: "WITHDRAWN",
        dropReason: "Moved away",
      }),
    );
  });

  it("deletes after a destructive confirm and leaves for the list", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    del.mockResolvedValue({ data: { data: { id: 21, deletedAt: "2099-01-01T00:00:00.000Z" } } });
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
      buttons?.find((b) => b.style === "destructive")?.onPress?.();
    });
    renderWithProviders(<StudentDetailScreen />);

    fireEvent.press(await screen.findByText("Delete student"));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/students/21"));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/students"));
    alert.mockRestore();
  });
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/student-detail-actions.test.tsx` → FAIL (no actions render; the sheets don't exist).

- [ ] **Step 3: The two sheets**

```tsx
// apps/mobile/src/components/GraduateStudentSheet.tsx
import { useState } from "react";
import { graduateStudentRequestSchema } from "@space/shared";

import { useGraduateStudent } from "../hooks/use-students";
import { apiErrorMessage } from "../lib/api-error";
import { Button, Input, Sheet, Text } from "../ui";

export interface GraduateStudentSheetProps {
  visible: boolean;
  studentId: number;
  studentName: string;
  onClose: () => void;
}

/**
 * v1's graduate-student-button.tsx modal as a sheet (spec 06 §9). The year
 * defaults to the current one (R59) and is checked with the SAME shared
 * schema the server runs — v1 hand-wrote a second copy of the bound.
 */
export function GraduateStudentSheet({ visible, studentId, studentName, onClose }: GraduateStudentSheetProps) {
  const graduate = useGraduateStudent();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    const trimmed = year.trim();
    if (!/^\d{4}$/.test(trimmed)) {
      setError("Enter a four-digit year.");
      return;
    }
    const parsed = graduateStudentRequestSchema.safeParse({ graduationYear: Number(trimmed) });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid year.");
      return;
    }
    graduate.mutate(
      { id: studentId, graduationYear: parsed.data.graduationYear },
      {
        onSuccess: () => onClose(),
        onError: (err) => setError(apiErrorMessage(err, "Couldn't graduate this student.")),
      },
    );
  };

  return (
    <Sheet visible={visible} title={`Graduate ${studentName}?`} onClose={onClose}>
      <Text variant="body">
        {`Marks ${studentName} as a JPCS alumnus, completes every active season enrollment, and removes them from the active roster. They become eligible for leader, admin or mentor roles. This can't be undone.`}
      </Text>
      <Input
        label="JPCS graduation year"
        value={year}
        onChangeText={setYear}
        keyboardType="number-pad"
        error={error ?? undefined}
      />
      <Button title="Graduate student" onPress={submit} loading={graduate.isPending} />
      <Button title="Cancel" variant="ghost" onPress={onClose} />
    </Sheet>
  );
}
```

```tsx
// apps/mobile/src/components/DropEnrollmentSheet.tsx
import { useState } from "react";
import type { EnrollmentHistoryItem } from "@space/shared";

import { useDropEnrollment } from "../hooks/use-students";
import { apiErrorMessage } from "../lib/api-error";
import { Button, Input, Sheet, Text } from "../ui";

export interface DropEnrollmentSheetProps {
  studentId: number;
  /** The row being dropped; null hides the sheet. */
  enrollment: EnrollmentHistoryItem | null;
  onClose: () => void;
}

/** v1's drop-enrollment-button.tsx modal as a sheet. Reason optional, ≤500, "" stored null (R66). */
export function DropEnrollmentSheet({ studentId, enrollment, onClose }: DropEnrollmentSheetProps) {
  const drop = useDropEnrollment();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setReason("");
    setError(null);
    onClose();
  };

  const submit = () => {
    if (!enrollment) return;
    setError(null);
    const trimmed = reason.trim();
    if (trimmed.length > 500) {
      setError("At most 500 characters.");
      return;
    }
    drop.mutate(
      { studentId, seasonId: enrollment.seasonId, dropReason: trimmed === "" ? null : trimmed },
      {
        onSuccess: close,
        onError: (err) => setError(apiErrorMessage(err, "Couldn't drop this enrollment.")),
      },
    );
  };

  return (
    <Sheet
      visible={enrollment !== null}
      title={`Drop from ${enrollment?.seasonTitle ?? "this season"}?`}
      onClose={close}
    >
      <Text variant="body">
        The student leaves this season without graduating and appears on the dropped list. The record is kept.
      </Text>
      <Input
        label="Reason (optional)"
        value={reason}
        onChangeText={setReason}
        multiline
        placeholder="e.g. Moved cities, stopped attending"
        error={error ?? undefined}
      />
      <Button title="Drop student" onPress={submit} loading={drop.isPending} />
      <Button title="Cancel" variant="ghost" onPress={close} />
    </Sheet>
  );
}
```

- [ ] **Step 4: Rewrite the detail screen**

Replace `apps/mobile/app/(app)/student/[id]/index.tsx` in full. Plan 7's
content is kept and gains the action bar, the per-row Drop and the date-only
birthday.

```tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";
import { dateOnlyFromIso, type EnrollmentHistoryItem } from "@space/shared";

import { DropEnrollmentSheet } from "../../../../src/components/DropEnrollmentSheet";
import { GraduateStudentSheet } from "../../../../src/components/GraduateStudentSheet";
import { useDeleteStudent, useStudentDetail, type StudentDetail } from "../../../../src/hooks/use-students";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import { formatDayKey } from "../../../../src/lib/format";
import { studentActionsFor } from "../../../../src/lib/student-actions";
import { useSessionStore } from "../../../../src/store/session";
import { useTheme } from "../../../../src/theme";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../../../src/ui";

function enrollmentStatusLabel(status: EnrollmentHistoryItem["status"]): string {
  if (status === "COMPLETED") return "Completed";
  if (status === "WITHDRAWN") return "Dropped";
  return "Active";
}

function ProfileCard({ detail }: { detail: StudentDetail }) {
  const theme = useTheme();
  const p = detail.profile;
  const rows: [string, string][] = [];
  if (p.university) rows.push(["University", p.university]);
  if (p.year) rows.push(["Year", p.year]);
  if (p.gifts) rows.push(["Gifts", p.gifts]);
  // Present only on the private/internal arms — the server narrows by role
  // (spec 06 §4.2); the client renders what its arm carries.
  if ("phone" in p && p.phone) rows.push(["Phone", p.phone]);
  if ("dateOfBirth" in p && p.dateOfBirth) {
    // A calendar day, read without any timezone (Plan 10 Decision 8).
    rows.push(["Date of birth", formatDayKey(dateOnlyFromIso(p.dateOfBirth))]);
  }
  if ("spiritualBackground" in p && p.spiritualBackground) {
    rows.push(["Spiritual background", p.spiritualBackground]);
  }
  if (rows.length === 0) return null;

  return (
    <Card style={{ marginTop: theme.spacing.md }}>
      <Text variant="heading">Profile</Text>
      {rows.map(([label, value]) => (
        <Text key={label} variant="body">
          <Text variant="label" color={theme.colors.neutral[600]}>{`${label}: `}</Text>
          {value}
        </Text>
      ))}
    </Card>
  );
}

function EnrollmentRow({ item, onDrop }: { item: EnrollmentHistoryItem; onDrop: (() => void) | null }) {
  const theme = useTheme();
  return (
    <Card style={{ marginTop: theme.spacing.sm }}>
      <Text variant="body">{item.seasonTitle}</Text>
      <Text variant="label" color={theme.colors.neutral[600]}>
        {[enrollmentStatusLabel(item.status), item.groupName].filter(Boolean).join(" · ")}
      </Text>
      {item.dropReason ? (
        <Text variant="caption" color={theme.colors.neutral[600]}>
          {item.dropReason}
        </Text>
      ) : null}
      {onDrop ? <Button title="Drop" variant="ghost" onPress={onDrop} /> : null}
    </Card>
  );
}

export default function StudentDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const scopes = useSessionStore((s) => s.scopes);
  const role = user?.role ?? null;
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const parsed = Number(rawId);
  const id = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

  const { data, isPending, isError, refetch } = useStudentDetail(id, role);
  const deleteStudent = useDeleteStudent();
  const [graduateOpen, setGraduateOpen] = useState(false);
  const [dropTarget, setDropTarget] = useState<EnrollmentHistoryItem | null>(null);

  const confirmDelete = (studentId: number, name: string) => {
    Alert.alert(
      `Delete ${name}?`,
      "They'll disappear from every list and be signed out everywhere. Their enrollment history, attendance and submissions are kept, and a SUPER can reactivate the account from Users.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            deleteStudent.mutate(
              { id: studentId },
              {
                onSuccess: () => router.replace("/students"),
                onError: (err) => Alert.alert("Couldn't delete", apiErrorMessage(err, "Try again.")),
              },
            ),
        },
      ],
    );
  };

  if (id === null) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Not found" message="That student link isn't valid." />
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load this student." onRetry={() => void refetch()} />
      ) : (
        (() => {
          const actions = studentActionsFor(user, scopes, data);
          return (
            <>
              <Text variant="title">{data.name}</Text>
              <Text variant="label" color={theme.colors.neutral[600]}>
                {data.email}
              </Text>
              {data.graduationYear !== null ? (
                <Text variant="label" color={theme.colors.neutral[600]}>
                  {`Alumnus — Class of ${data.graduationYear}`}
                </Text>
              ) : null}
              {data.currentGroup ? (
                <Text variant="label" color={theme.colors.neutral[600]}>
                  {`Current group: ${data.currentGroup.name}`}
                </Text>
              ) : null}

              {actions.canEdit || actions.canGraduate || actions.canDelete ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
                  {actions.canEdit ? (
                    <Button
                      title="Edit"
                      variant="secondary"
                      onPress={() =>
                        router.push({ pathname: "/student/[id]/edit", params: { id: String(data.id) } })
                      }
                    />
                  ) : null}
                  {actions.canGraduate ? (
                    <Button title="Graduate" variant="secondary" onPress={() => setGraduateOpen(true)} />
                  ) : null}
                  {actions.canDelete ? (
                    <Button
                      title="Delete student"
                      variant="ghost"
                      loading={deleteStudent.isPending}
                      onPress={() => confirmDelete(data.id, data.name)}
                    />
                  ) : null}
                </View>
              ) : null}

              <ProfileCard detail={data} />
              {"notes" in data.profile && data.profile.notes ? (
                <Card style={{ marginTop: theme.spacing.md }}>
                  <Text variant="heading">Internal notes</Text>
                  <Text variant="caption" color={theme.colors.neutral[600]}>
                    Staff only — the student never receives this field.
                  </Text>
                  <Text variant="body">{data.profile.notes}</Text>
                </Card>
              ) : null}
              <Card style={{ marginTop: theme.spacing.md }}>
                <Text variant="heading">Seasons</Text>
                {data.enrollments.length === 0 ? (
                  <Text variant="body" color={theme.colors.neutral[600]}>
                    No enrollments yet.
                  </Text>
                ) : (
                  data.enrollments.map((e) => (
                    <EnrollmentRow
                      key={e.enrollmentId}
                      item={e}
                      onDrop={actions.canDrop(e) ? () => setDropTarget(e) : null}
                    />
                  ))
                )}
              </Card>

              {actions.canGraduate ? (
                <GraduateStudentSheet
                  visible={graduateOpen}
                  studentId={data.id}
                  studentName={data.name}
                  onClose={() => setGraduateOpen(false)}
                />
              ) : null}
              <DropEnrollmentSheet studentId={data.id} enrollment={dropTarget} onClose={() => setDropTarget(null)} />
            </>
          );
        })()
      )}
    </Screen>
  );
}
```

The success handlers need no manual refetch. Each mutation invalidates `queryKeys.students.all`, and React Query refetches the mounted detail.

- [ ] **Step 5: Run everything**

Run: `pnpm turbo routes:generate --filter=@space/mobile`
Run: `cd apps/mobile && pnpm jest src/__tests__/student-detail-actions.test.tsx src/__tests__/student-detail.test.tsx src/__tests__/app-layout.test.tsx src/__tests__/role-tabs.test.tsx` → PASS. Plan 7's detail cases still hold. In particular, its `/Dropped/` query still matches exactly one node, because the new button reads "Drop", not "Dropped".
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean. Expect one exception: the typed href `/student/[id]/edit` does not exist until Task 8 creates the file. When executing in order, do Task 8 before declaring this task's typecheck green, exactly as Plan 9 did with its Tasks 7 and 8.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): student detail in directory form with graduate and drop sheets and delete"
```

---

### Task 8: `/students/new` and `/student/[id]/edit`

**Files:**
- Create: `apps/mobile/src/components/StudentForm.tsx`
- Create: `apps/mobile/app/(app)/students/new.tsx`
- Create: `apps/mobile/app/(app)/student/[id]/edit.tsx`
- Modify: `apps/mobile/app/(app)/_layout.tsx` (`DETAIL_ROUTE_NAMES` gains `"students/new"` and `"student/[id]/edit"`)
- Modify: `apps/mobile/src/components/StudentList.tsx` (Plan 7's — optional `headerAction`)
- Modify: `apps/mobile/app/(app)/students/index.tsx` (SUPER gets "New student")
- Test: `apps/mobile/src/__tests__/student-form-screens.test.tsx` (new); extend `apps/mobile/src/__tests__/app-layout.test.tsx` and `students-list.test.tsx`

**Interfaces:**
- Consumes: Task 6's `StudentForm` helpers, `ChoiceChips`, `useCreateStudent`, `useUpdateStudent` and `studentActionsFor`; Plan 4's `useSeasons(enabled)` and `apiErrorMessage`; Plan 7's `useStudentDetail`.
- Produces:
  - `<StudentForm initial seasonOptions seasonLabel showSeason showNotes submitTitle submitting serverError onSubmit />`
  - the routes `/students/new` and `/student/[id]/edit`
  - `StudentListProps.headerAction?: ReactNode`

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/mobile/src/__tests__/student-form-screens.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "21" }),
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: mockBack }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import NewStudentScreen from "../../app/(app)/students/new";
import EditStudentScreen from "../../app/(app)/student/[id]/edit";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const season = (id: number, title: string, status: "ACTIVE" | "DRAFT" | "ARCHIVED") => ({
  id, code: `s${id}`, title, program: "TEST", year: 2099, status,
  startDate: "2099-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z",
});

const enrollment = (seasonId: number, title: string) => ({
  enrollmentId: 500 + seasonId, seasonId, seasonCode: `S${seasonId}`, seasonTitle: title,
  seasonStatus: "ACTIVE" as const, startDate: "2099-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z",
  groupName: null, status: "ACTIVE" as const, enrolledAt: "2099-01-01T00:00:00.000Z",
  completedAt: null, droppedAt: null, dropReason: null,
});

const detail = {
  id: 21, name: "Sara Student", email: "sara@jpc.test", avatarPath: null, graduationYear: null,
  currentGroup: null, enrollments: [enrollment(7, "Spring 2099"), enrollment(8, "Autumn 2099")],
  profile: {
    university: "Cairo University", year: null, gifts: null,
    activeSeasonId: 7, activeSeasonTitle: "Spring 2099", activeSeasonCode: "S7",
    phone: null, dateOfBirth: null, spiritualBackground: null, notes: "Watch attendance",
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("/students/new", () => {
  beforeEach(() => {
    get.mockResolvedValue({
      data: { data: { seasons: [season(7, "Spring 2099", "ACTIVE"), season(9, "Old 2001", "ARCHIVED")] } },
    });
  });

  it("creates with an optional enrollment and no password anywhere — then opens the new student (D1, D7)", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    post.mockResolvedValue({ data: { data: { id: 77, email: "new@jpc.test" } } });
    renderWithProviders(<NewStudentScreen />);

    fireEvent.changeText(screen.getByLabelText("Full name"), "New Student");
    fireEvent.changeText(screen.getByLabelText("Email"), "new@jpc.test");
    fireEvent.changeText(screen.getByLabelText("Date of birth (YYYY-MM-DD)"), "2004-03-09");
    fireEvent.press(await screen.findByText("Spring 2099"));
    // Archived seasons are not offered for a new enrollment.
    expect(screen.queryByText("Old 2001")).toBeNull();
    fireEvent.press(screen.getByText("Create and send invite"));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [url, body] = post.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe("/api/v1/students");
    expect(body).toMatchObject({
      name: "New Student",
      email: "new@jpc.test",
      dateOfBirth: "2004-03-09T00:00:00.000Z",
      seasonId: 7,
    });
    expect(body).not.toHaveProperty("password");
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({ pathname: "/student/[id]", params: { id: "77" } }),
    );
  });

  it("validates locally before posting", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<NewStudentScreen />);

    fireEvent.changeText(screen.getByLabelText("Full name"), "N");
    fireEvent.changeText(screen.getByLabelText("Email"), "nope");
    fireEvent.press(screen.getByText("Create and send invite"));

    await waitFor(() =>
      expect(screen.getByLabelText("Full name").props.accessibilityHint).toBe("At least 2 characters."),
    );
    expect(screen.getByLabelText("Email").props.accessibilityHint).toBe("Must be a valid email.");
    expect(post).not.toHaveBeenCalled();
  });

  it("is SUPER-only, like the endpoint (Plan 7) — an ADMIN fires no request", () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    renderWithProviders(<NewStudentScreen />);
    expect(screen.getByText(/Only SUPER accounts can create students/)).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("/student/[id]/edit", () => {
  beforeEach(() => {
    get.mockResolvedValue({ data: { data: detail } });
    patch.mockResolvedValue({ data: { data: { id: 21 } } });
  });

  it("SUPER edits fields and moves the pointer among ACTIVE enrollments only", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<EditStudentScreen />);

    const university = await screen.findByLabelText("University");
    expect(university.props.value).toBe("Cairo University");
    fireEvent.changeText(screen.getByLabelText("Phone"), "+20 111");
    fireEvent.press(screen.getByText("Autumn 2099"));
    fireEvent.press(screen.getByText("Save changes"));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    const [url, body] = patch.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe("/api/v1/students/21");
    expect(body).toMatchObject({ phone: "+20 111", notes: "Watch attendance", activeSeasonId: 8 });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it("ADMIN edits notes but never sends activeSeasonId (Plan 7's ADMIN allowlist)", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    renderWithProviders(<EditStudentScreen />);

    await screen.findByLabelText("University");
    expect(screen.queryByText("Active season")).toBeNull();
    fireEvent.changeText(screen.getByLabelText("Internal notes"), "Updated by admin");
    fireEvent.press(screen.getByText("Save changes"));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    const body = patch.mock.calls[0]![1] as Record<string, unknown>;
    expect(body.notes).toBe("Updated by admin");
    expect(body).not.toHaveProperty("activeSeasonId");
  });

  it("an ADMIN without an ACTIVE enrollment in their seasons gets an explanation, not a form", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [99] }));
    renderWithProviders(<EditStudentScreen />);
    expect(await screen.findByText(/active enrollment in a season you run/)).toBeTruthy();
  });
});
```

Append to `app-layout.test.tsx` (in its existing style):

```tsx
it("declares students/new and student/[id]/edit hidden from the tab bar", () => {
  expect(DETAIL_ROUTE_NAMES).toEqual(expect.arrayContaining(["students/new", "student/[id]/edit"]));
});
```

Append to Plan 7's `students-list.test.tsx`. It already mocks `useRouter` with `mockPush`; use its fixtures and its session constant if they differ from these names.

```tsx
it("offers SUPER — and only SUPER — a way to create a student", async () => {
  get.mockResolvedValue(page([activeRow]));
  useSessionStore.setState(superSession);
  const { unmount } = renderWithProviders(<StudentsScreen />);
  fireEvent.press(await screen.findByText("New student"));
  expect(mockPush).toHaveBeenCalledWith("/students/new");
  unmount();

  useSessionStore.setState(mentorSession);
  renderWithProviders(<StudentsScreen />);
  await screen.findByText("Sara Student");
  expect(screen.queryByText("New student")).toBeNull();
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/student-form-screens.test.tsx src/__tests__/app-layout.test.tsx src/__tests__/students-list.test.tsx` → FAIL.

- [ ] **Step 2: `StudentForm`**

```tsx
// apps/mobile/src/components/StudentForm.tsx
import { useState } from "react";
import { View } from "react-native";

import {
  validateStudentForm,
  type StudentFormErrors,
  type StudentFormValues,
} from "../lib/student-form";
import { useTheme } from "../theme";
import { Button, Input, Text } from "../ui";
import { ChoiceChips } from "./ChoiceChips";

export interface StudentFormProps {
  initial: StudentFormValues;
  seasonOptions: readonly { id: number; title: string }[];
  seasonLabel: string;
  showSeason: boolean;
  showNotes: boolean;
  submitTitle: string;
  submitting: boolean;
  serverError: string | null;
  onSubmit: (values: StudentFormValues) => void;
}

/**
 * One form for create and edit (v1's student-form.tsx), validated with the
 * shared schemas through validateStudentForm — no second hand-written copy.
 * Seeded once from `initial`; callers pass a `key` to reseed.
 */
export function StudentForm({
  initial,
  seasonOptions,
  seasonLabel,
  showSeason,
  showNotes,
  submitTitle,
  submitting,
  serverError,
  onSubmit,
}: StudentFormProps) {
  const theme = useTheme();
  const [values, setValues] = useState<StudentFormValues>(initial);
  const [errors, setErrors] = useState<StudentFormErrors>({});

  function setField<K extends keyof StudentFormValues>(key: K, value: StudentFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  const submit = () => {
    const found = validateStudentForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    onSubmit(values);
  };

  return (
    <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.md }}>
      {serverError ? (
        <Text
          variant="body"
          color={theme.colors.error[600]}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          {serverError}
        </Text>
      ) : null}
      <Input label="Full name" value={values.name} onChangeText={(v) => setField("name", v)} error={errors.name} />
      <Input
        label="Email"
        value={values.email}
        onChangeText={(v) => setField("email", v)}
        autoCapitalize="none"
        keyboardType="email-address"
        error={errors.email}
      />
      <Input label="Phone" value={values.phone} onChangeText={(v) => setField("phone", v)} keyboardType="phone-pad" error={errors.phone} />
      <Input label="University" value={values.university} onChangeText={(v) => setField("university", v)} error={errors.university} />
      <Input
        label="Year / faculty"
        value={values.year}
        onChangeText={(v) => setField("year", v)}
        placeholder="e.g. 3rd · Engineering"
        error={errors.year}
      />
      <Input
        label="Date of birth (YYYY-MM-DD)"
        value={values.dateOfBirth}
        onChangeText={(v) => setField("dateOfBirth", v)}
        placeholder="2004-03-09"
        autoCapitalize="none"
        error={errors.dateOfBirth}
      />
      <Input
        label="Spiritual background"
        value={values.spiritualBackground}
        onChangeText={(v) => setField("spiritualBackground", v)}
        multiline
        placeholder="Church affiliation, baptism status, faith journey…"
        error={errors.spiritualBackground}
      />
      <Input
        label="Gifts / interests"
        value={values.gifts}
        onChangeText={(v) => setField("gifts", v)}
        multiline
        placeholder="e.g. worship, hospitality, mentoring younger students"
        error={errors.gifts}
      />
      {showSeason ? (
        <ChoiceChips
          label={seasonLabel}
          options={[
            { value: null, label: "None" },
            ...seasonOptions.map((s) => ({ value: s.id, label: s.title })),
          ]}
          value={values.seasonId}
          onChange={(seasonId) => setField("seasonId", seasonId)}
        />
      ) : null}
      {showNotes ? (
        <>
          <Input
            label="Internal notes"
            value={values.notes}
            onChangeText={(v) => setField("notes", v)}
            multiline
            error={errors.notes}
          />
          <Text variant="caption" color={theme.colors.neutral[600]}>
            Staff only — never shown to the student.
          </Text>
        </>
      ) : null}
      <Button title={submitTitle} onPress={submit} loading={submitting} />
    </View>
  );
}
```

- [ ] **Step 3: The two screens**

```tsx
// apps/mobile/app/(app)/students/new.tsx
import { useRouter } from "expo-router";
import { useState } from "react";

import { StudentForm } from "../../../src/components/StudentForm";
import { useSeasons } from "../../../src/hooks/use-seasons";
import { useCreateStudent } from "../../../src/hooks/use-students";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { emptyStudentForm, toCreateStudentBody } from "../../../src/lib/student-form";
import { useSessionStore } from "../../../src/store/session";
import { useTheme } from "../../../src/theme";
import { EmptyState, ErrorState, Screen, Text } from "../../../src/ui";

/**
 * /students/new (spec 06 §9). SUPER-only, like POST /students (Plan 7). The
 * account is created with no password and the server mails an invite in the
 * same operation (Plan 10 Decision 1) — v1's "temp password is ChangeMe123!"
 * notice (spec 11 R43) has nothing to say here and is not ported.
 */
export default function NewStudentScreen() {
  const theme = useTheme();
  const router = useRouter();
  const isSuper = useSessionStore((s) => s.user?.role === "SUPER");
  const seasons = useSeasons(isSuper);
  const createStudent = useCreateStudent();
  const [serverError, setServerError] = useState<string | null>(null);

  if (!isSuper) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="New student" message="Only SUPER accounts can create students." />
      </Screen>
    );
  }

  // Enrollment targets: seasons that are running or about to (a new
  // enrollment in a finished season would be history written backwards).
  const seasonOptions = (seasons.data ?? [])
    .filter((s) => s.status === "ACTIVE" || s.status === "DRAFT")
    .map((s) => ({ id: s.id, title: s.title }));

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      <Text variant="title">New student</Text>
      <Text variant="body" color={theme.colors.neutral[600]}>
        They'll get an email invite to choose their own password. No temporary password is created.
      </Text>
      {seasons.isError ? (
        <ErrorState message="Couldn't load seasons." onRetry={() => void seasons.refetch()} />
      ) : null}
      <StudentForm
        initial={emptyStudentForm()}
        seasonOptions={seasonOptions}
        seasonLabel="Enroll in season (optional)"
        showSeason
        showNotes
        submitTitle="Create and send invite"
        submitting={createStudent.isPending}
        serverError={serverError}
        onSubmit={(values) => {
          setServerError(null);
          createStudent.mutate(toCreateStudentBody(values), {
            onSuccess: (created) =>
              router.replace({ pathname: "/student/[id]", params: { id: String(created.id) } }),
            onError: (err) => setServerError(apiErrorMessage(err, "Couldn't create the student.")),
          });
        }}
      />
    </Screen>
  );
}
```

```tsx
// apps/mobile/app/(app)/student/[id]/edit.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";

import { StudentForm } from "../../../../src/components/StudentForm";
import { useStudentDetail, useUpdateStudent } from "../../../../src/hooks/use-students";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import { studentActionsFor } from "../../../../src/lib/student-actions";
import { studentFormFromDetail, toUpdateStudentBody } from "../../../../src/lib/student-form";
import { useSessionStore } from "../../../../src/store/session";
import { EmptyState, ErrorState, LoadingState, Screen, Text } from "../../../../src/ui";

/**
 * /student/[id]/edit — spec 06 §9's edit page, for SUPER and for an ADMIN
 * whose season the student is ACTIVE in (Plan 7's canEditStudent). Fixes v1's
 * dead ADMIN Edit link (§4.3). The student's own edit is Plan 11's /profile.
 */
export default function EditStudentScreen() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const scopes = useSessionStore((s) => s.scopes);
  const role = user?.role ?? null;
  const staff = role === "SUPER" || role === "ADMIN";
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const parsed = Number(rawId);
  const id = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

  const { data, isPending, isError, refetch } = useStudentDetail(staff ? id : null, role);
  const update = useUpdateStudent();
  const [serverError, setServerError] = useState<string | null>(null);

  if (!staff) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Edit student" message="Only SUPER and ADMIN accounts can edit students." />
      </Screen>
    );
  }
  if (id === null) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Not found" message="That student link isn't valid." />
      </Screen>
    );
  }
  if (isPending) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <LoadingState />
      </Screen>
    );
  }
  if (isError) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <ErrorState message="Couldn't load this student." onRetry={() => void refetch()} />
      </Screen>
    );
  }

  const actions = studentActionsFor(user, scopes, data);
  if (!actions.canEdit) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState
          title="Edit student"
          message="You can edit a student only while they have an active enrollment in a season you run."
        />
      </Screen>
    );
  }

  const initial = studentFormFromDetail(data);
  // The pointer may only name a season the student is ACTIVE in (Plan 7 S16).
  const seasonOptions = data.enrollments
    .filter((e) => e.status === "ACTIVE")
    .map((e) => ({ id: e.seasonId, title: e.seasonTitle }));

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      <Text variant="title">{`Edit ${data.name}`}</Text>
      <StudentForm
        key={data.id}
        initial={initial}
        seasonOptions={seasonOptions}
        seasonLabel="Active season"
        showSeason={actions.canEditSeasonPointer}
        showNotes
        submitTitle="Save changes"
        submitting={update.isPending}
        serverError={serverError}
        onSubmit={(values) => {
          setServerError(null);
          update.mutate(
            {
              id: data.id,
              body: toUpdateStudentBody(values, initial, { includeSeasonPointer: actions.canEditSeasonPointer }),
            },
            {
              onSuccess: () => router.back(),
              onError: (err) => setServerError(apiErrorMessage(err, "Couldn't save changes.")),
            },
          );
        }}
      />
    </Screen>
  );
}
```

- [ ] **Step 4: Register the routes, add the list entry point**

In `_layout.tsx`, append `"students/new"` and `"student/[id]/edit"` to `DETAIL_ROUTE_NAMES`. Without these entries, `Tabs` auto-registers both files as visible tabs for every role.

In `StudentList.tsx`:
- Add `import type { ReactNode } from "react";`.
- Add to `StudentListProps`:

```ts
  /** Rendered above the search field, inside the allowed branch — e.g. "New student" for SUPER. */
  headerAction?: ReactNode;
```

- Destructure `headerAction` in the component signature.
- Render `{headerAction ?? null}` as the first child of the allowed branch's `<Screen …>`, directly above the search `Input`.

Replace `apps/mobile/app/(app)/students/index.tsx` with:

```tsx
import { useRouter } from "expo-router";

import { StudentList } from "../../../src/components/StudentList";
import { useSessionStore } from "../../../src/store/session";
import { Button } from "../../../src/ui";

export default function StudentsScreen() {
  const router = useRouter();
  const isSuper = useSessionStore((s) => s.user?.role === "SUPER");
  // LEADER is included: their nav has no /students tab, but the endpoint
  // narrows them to their groups' members, and the route stays reachable by
  // navigation (spec 06 §9's leader-roster decision, answered "yes, scoped").
  return (
    <StudentList
      status="active"
      allowedRoles={["SUPER", "ADMIN", "MENTOR", "LEADER"]}
      title="Students"
      // Creation is SUPER-only (Plan 7's POST /students).
      headerAction={
        isSuper ? <Button title="New student" onPress={() => router.push("/students/new")} /> : null
      }
    />
  );
}
```

- [ ] **Step 5: Run everything**

Run: `pnpm turbo routes:generate --filter=@space/mobile`
Run: `cd apps/mobile && pnpm jest src/__tests__/student-form-screens.test.tsx src/__tests__/student-detail-actions.test.tsx src/__tests__/students-list.test.tsx src/__tests__/app-layout.test.tsx src/__tests__/role-tabs.test.tsx` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean. Task 7's `/student/[id]/edit` href now resolves.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): /students/new (invite-first) and /student/[id]/edit with role-shaped fields"
```

---

### Task 9: `users/` directory, `/users/new`, and the bulk invite card

**Files:**
- Move: `apps/mobile/app/(app)/users.tsx` → `apps/mobile/app/(app)/users/index.tsx`
- Modify: `apps/mobile/app/(app)/_layout.tsx` (Plan 6's `DIRECTORY_ROUTE_HREFS` gains `"users"`; `DETAIL_ROUTE_NAMES` gains `"users/new"`)
- Create: `apps/mobile/app/(app)/users/new.tsx`
- Modify: `apps/mobile/src/__tests__/users-screen.test.tsx` (Plan 9's — import path; two new cases)
- Modify: `apps/mobile/src/__tests__/app-layout.test.tsx`
- Test: `apps/mobile/src/__tests__/user-new-screen.test.tsx` (new)

**Interfaces:**
- Consumes: Task 6's `useCreateUser`, `usePendingInviteCount`, `useSendPendingInvites` and `ChoiceChips`; Task 1's `BULK_INVITE_BATCH_SIZE` and `confirmSuper`; Plan 9's `createUserRequestSchema` and `userRoleSchema`; Plan 4's `apiErrorMessage`.
- Produces:
  - the routes `/users` (now served by `users/index.tsx`) and `/users/new`
  - `"users"` in `DIRECTORY_ROUTE_HREFS` in `_layout.tsx` (Plan 6's set, which Plan 17 Step 0 checks for), so Plan 17 skips its own conversion
  - `PendingInvitesCard`, local to `users/index.tsx`

- [ ] **Step 1: The directory conversion — Plan 17 Step 0's mechanism, on Plan 6's set**

```bash
mkdir -p "apps/mobile/app/(app)/users"
git mv "apps/mobile/app/(app)/users.tsx" "apps/mobile/app/(app)/users/index.tsx"
```

Every relative import in the moved file gains one `../`. `"../../src/…"` becomes `"../../../src/…"` for hooks, store, theme and ui. In `users-screen.test.tsx`, change `import UsersScreen from "../../app/(app)/users";` to `"../../app/(app)/users/index"`.

In `_layout.tsx`, Plan 6 Task 5 already turned `routeNameForHref`'s
hard-coded `students` branch into the `DIRECTORY_ROUTE_HREFS` set
(`["students", "seasons"]`). Add `"users"` to it — **keep `"seasons"`**, or the
SUPER Seasons tab silently disappears:

```ts
/**
 * Hrefs whose route is a directory (`x/index.tsx`) because the destination
 * has child routes (ruling X7): `students` (alumni, dropped), `seasons`
 * (Plan 6's `seasons/[code]/…`) and `users` (`users/new`, Plan 17's
 * `users/import`).
 */
const DIRECTORY_ROUTE_HREFS = new Set(["students", "seasons", "users"]);

export function routeNameForHref(href: string): string {
  const path = href.slice(1);
  return DIRECTORY_ROUTE_HREFS.has(path) ? `${path}/index` : path;
}
```

(Plan 17 Task 6 Step 0 checks that `/users` maps through this set and does
not repeat the move.) Append `"users/new"` to `DETAIL_ROUTE_NAMES`, and to
`app-layout.test.tsx`:

```tsx
it("maps /users to its directory index and hides users/new (Plan 10)", () => {
  expect(routeNameForHref("/users")).toBe("users/index");
  expect(routeNameForHref("/students")).toBe("students/index");
  expect(routeNameForHref("/seasons")).toBe("seasons/index"); // Plan 6's entry survives
  expect(DETAIL_ROUTE_NAMES).toContain("users/new");
});
```

(Add `routeNameForHref` to the file's `_layout` import if it isn't there.)

Run: `pnpm turbo routes:generate --filter=@space/mobile`
Run: `cd apps/mobile && pnpm jest src/__tests__/app-layout.test.tsx src/__tests__/role-tabs.test.tsx src/__tests__/users-screen.test.tsx` → `users-screen` PASSES unchanged at its new path. `app-layout` FAILS only because the `users/new` file does not exist yet: the derived route-file set no longer matches. Step 3 creates it.

- [ ] **Step 2: Write the failing tests**

```tsx
// apps/mobile/src/__tests__/user-new-screen.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { post: jest.fn() } }));
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import NewUserScreen from "../../app/(app)/users/new";

const post = apiClient.post as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("/users/new (spec 11 §9)", () => {
  it("creates invite-first and opens the new account — no temp-password notice (R43 not ported)", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    post.mockResolvedValue({ data: { data: { userId: 40 } } });
    renderWithProviders(<NewUserScreen />);

    expect(screen.queryByText(/ChangeMe/)).toBeNull();
    fireEvent.changeText(screen.getByLabelText("Name"), "New Person");
    fireEvent.changeText(screen.getByLabelText("Email"), "p@jpc.test");
    fireEvent.press(screen.getByText("Create and send invite"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/users", {
        name: "New Person",
        email: "p@jpc.test",
        role: "STUDENT",
        graduationYear: null,
      }),
    );
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({ pathname: "/user/[id]", params: { id: "40" } }),
    );
  });

  it("requires a graduation year for alumni-only roles, using the shared schema's message (R2/R3)", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<NewUserScreen />);

    fireEvent.changeText(screen.getByLabelText("Name"), "Leader Person");
    fireEvent.changeText(screen.getByLabelText("Email"), "l@jpc.test");
    fireEvent.press(screen.getByText("LEADER"));
    fireEvent.press(screen.getByText("Create and send invite"));

    await waitFor(() =>
      expect(screen.getByLabelText("Graduation year").props.accessibilityHint).toBe("Required for this role."),
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("asks before creating a SUPER and sends confirmSuper only after the confirm (Decision 13)", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    post.mockResolvedValue({ data: { data: { userId: 41 } } });
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === "Create SUPER")?.onPress?.();
    });
    renderWithProviders(<NewUserScreen />);

    fireEvent.changeText(screen.getByLabelText("Name"), "Second Super");
    fireEvent.changeText(screen.getByLabelText("Email"), "s@jpc.test");
    fireEvent.press(screen.getByText("SUPER"));
    fireEvent.press(screen.getByText("Create and send invite"));

    expect(alert).toHaveBeenCalledWith("Create a SUPER account?", expect.any(String), expect.any(Array));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/users", expect.objectContaining({ role: "SUPER", confirmSuper: true })),
    );
    alert.mockRestore();
  });

  it("guards itself for a non-SUPER", () => {
    useSessionStore.setState(makeSession("ADMIN"));
    renderWithProviders(<NewUserScreen />);
    expect(screen.getByText("Only SUPER accounts can create users.")).toBeTruthy();
  });
});
```

Append to Plan 9's `users-screen.test.tsx`. Add `Alert` from `react-native`
to its imports. Its `superSession`, `rows`, `get`, `post` and `mockPush`
already exist.

```tsx
describe("UsersScreen — Plan 10 entry points", () => {
  const routeGets = (pending: number) =>
    get.mockImplementation((url: string) =>
      url === "/api/v1/users/invites/pending"
        ? Promise.resolve({ data: { data: { pending } } })
        : Promise.resolve({ data: { data: { users: rows, nextCursor: null, total: 2 } } }),
    );

  it("offers New user", async () => {
    useSessionStore.setState(superSession);
    routeGets(0);
    renderWithProviders(<UsersScreen />);
    fireEvent.press(await screen.findByText("New user"));
    expect(mockPush).toHaveBeenCalledWith("/users/new");
  });

  it("hides the bulk card at zero pending (R87)", async () => {
    useSessionStore.setState(superSession);
    routeGets(0);
    renderWithProviders(<UsersScreen />);
    await screen.findByText("Active Ann");
    expect(screen.queryByText("Send pending invites")).toBeNull();
  });

  it("sends one batch after a confirm and reports the four counters", async () => {
    useSessionStore.setState(superSession);
    routeGets(3);
    post.mockResolvedValue({ data: { data: { sent: 2, skipped: 0, failed: 1, remaining: 1 } } });
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === "Send")?.onPress?.();
    });
    renderWithProviders(<UsersScreen />);

    expect(await screen.findByText("3 accounts have no invite yet.")).toBeTruthy();
    fireEvent.press(screen.getByText("Send pending invites"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/users/invites/pending", undefined, { timeout: 60_000 }),
    );
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith("Invites sent", "Sent 2 · failed 1 · skipped 0 · 1 still pending."),
    );
    alert.mockRestore();
  });
});
```

Plan 9's earlier cases still use `get.mockResolvedValue(list)` for every GET.
The pending-count query then fails its parse, so the card stays hidden and
none of their assertions change.

Run: `cd apps/mobile && pnpm jest src/__tests__/user-new-screen.test.tsx src/__tests__/users-screen.test.tsx` → FAIL.

- [ ] **Step 3: `/users/new`**

```tsx
// apps/mobile/app/(app)/users/new.tsx
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";
import { createUserRequestSchema, userRoleSchema, type CreateUserBody, type UserRole } from "@space/shared";

import { ChoiceChips } from "../../../src/components/ChoiceChips";
import { useCreateUser } from "../../../src/hooks/use-users";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { useSessionStore } from "../../../src/store/session";
import { useTheme } from "../../../src/theme";
import { Button, EmptyState, Input, Screen, Text } from "../../../src/ui";

type FieldErrors = Partial<Record<"name" | "email" | "graduationYear", string>>;

const ROLE_OPTIONS = userRoleSchema.options.map((role) => ({ value: role, label: role }));

/**
 * /users/new (spec 11 §9; v1 super/users/new + user-form.tsx). Over Plan 9's
 * invite-first POST /users: no password is set and the server mails the
 * invite — so v1's on-screen "temp password is ChangeMe123!" notice (R43) has
 * no counterpart here. Validation runs the ONE shared schema (R55: v1's form
 * re-implemented it and drifted). A SUPER grant asks first and only then sends
 * confirmSuper (Plan 10 Decision 13).
 */
export default function NewUserScreen() {
  const theme = useTheme();
  const router = useRouter();
  const isSuper = useSessionStore((s) => s.user?.role === "SUPER");
  const createUser = useCreateUser();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("STUDENT");
  const [gradYear, setGradYear] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  if (!isSuper) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="New user" message="Only SUPER accounts can create users." />
      </Screen>
    );
  }

  const create = (body: CreateUserBody) =>
    createUser.mutate(body, {
      onSuccess: (created) =>
        router.replace({ pathname: "/user/[id]", params: { id: String(created.userId) } }),
      onError: (err) => setServerError(apiErrorMessage(err, "Couldn't create the user.")),
    });

  const submit = () => {
    setServerError(null);
    const trimmedYear = gradYear.trim();
    if (trimmedYear !== "" && !/^\d{4}$/.test(trimmedYear)) {
      setErrors({ graduationYear: "Must be a year." });
      return;
    }
    const parsed = createUserRequestSchema.safeParse({
      name,
      email: email.trim(),
      role,
      graduationYear: trimmedYear === "" ? null : Number(trimmedYear),
    });
    if (!parsed.success) {
      const found: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if ((key === "name" || key === "email" || key === "graduationYear") && found[key] === undefined) {
          found[key] = issue.message;
        }
      }
      setErrors(found);
      return;
    }
    setErrors({});
    if (parsed.data.role === "SUPER") {
      Alert.alert(
        "Create a SUPER account?",
        "SUPER can manage every user and season, and can't be limited by scope.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Create SUPER", onPress: () => create({ ...parsed.data, confirmSuper: true }) },
        ],
      );
      return;
    }
    create(parsed.data);
  };

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      <View style={{ gap: theme.spacing.md }}>
        <Text variant="title">New user</Text>
        <Text variant="body" color={theme.colors.neutral[600]}>
          They'll get an email invite to choose their own password. No temporary password is created.
        </Text>
        {serverError ? (
          <Text variant="body" color={theme.colors.error[600]} accessibilityRole="alert">
            {serverError}
          </Text>
        ) : null}
        <Input label="Name" value={name} onChangeText={setName} error={errors.name} />
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          error={errors.email}
        />
        <ChoiceChips label="Role" options={ROLE_OPTIONS} value={role} onChange={setRole} />
        <Input
          label="Graduation year"
          value={gradYear}
          onChangeText={setGradYear}
          keyboardType="number-pad"
          placeholder="Required for LEADER, ADMIN and MENTOR"
          error={errors.graduationYear}
        />
        <Button title="Create and send invite" onPress={submit} loading={createUser.isPending} />
      </View>
    </Screen>
  );
}
```

`createUserRequestSchema` is a `superRefine` effect, and its parse returns `CreateUserBody`, which is the output type `useCreateUser` takes. `parsed.data.name` is already trimmed by the schema.

- [ ] **Step 4: The users list gains its two entry points**

In `users/index.tsx`, add these imports (merged with the file's existing ones):

```tsx
import { Alert } from "react-native";
import { BULK_INVITE_BATCH_SIZE, type BulkInviteResponse } from "@space/shared";

import { usePendingInviteCount, useSendPendingInvites } from "../../../src/hooks/use-users";
import { apiErrorMessage } from "../../../src/lib/api-error";
```

Add, above `export default function UsersScreen()`:

```tsx
function bulkSummary(r: BulkInviteResponse): string {
  return `Sent ${r.sent} · failed ${r.failed} · skipped ${r.skipped} · ${r.remaining} still pending.`;
}

/**
 * v1's SendPendingInvitesButton (invite-buttons.tsx:40-65) — now one bounded
 * batch per tap (Plan 10 Decision 12). Mounted only inside the SUPER branch,
 * so its count query never fires for anyone else. Hidden at zero (R87), and
 * also hidden while the count is unknown: a button whose reach we can't state
 * shouldn't offer to mail anyone.
 */
function PendingInvitesCard() {
  const theme = useTheme();
  const pending = usePendingInviteCount(true);
  const sendPending = useSendPendingInvites();

  if (!pending.data) return null;
  const count = pending.data;

  const run = () =>
    Alert.alert(
      `Send invites to ${count} ${count === 1 ? "person" : "people"}?`,
      `Up to ${BULK_INVITE_BATCH_SIZE} are sent per tap — tap again for the rest.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          onPress: () =>
            sendPending.mutate(undefined, {
              onSuccess: (result) => Alert.alert("Invites sent", bulkSummary(result)),
              onError: (err) => Alert.alert("Couldn't send invites", apiErrorMessage(err, "Try again later.")),
            }),
        },
      ],
    );

  return (
    <Card>
      <Text variant="body">{`${count} ${count === 1 ? "account has" : "accounts have"} no invite yet.`}</Text>
      <View style={{ marginTop: theme.spacing.sm }}>
        <Button
          title="Send pending invites"
          variant="secondary"
          loading={sendPending.isPending}
          onPress={run}
        />
      </View>
    </Card>
  );
}
```

In `UsersScreen`, add `const router = useRouter();` near the top, then inside
the SUPER branch, directly above the search `Input`:

```tsx
        <Button title="New user" onPress={() => router.push("/users/new")} />
        <PendingInvitesCard />
```

(Plan 17 later adds its "Import students" button at the same spot. Both can
coexist.)

- [ ] **Step 5: Run everything**

Run: `pnpm turbo routes:generate --filter=@space/mobile`
Run: `cd apps/mobile && pnpm jest src/__tests__/user-new-screen.test.tsx src/__tests__/users-screen.test.tsx src/__tests__/user-detail-screen.test.tsx src/__tests__/app-layout.test.tsx src/__tests__/role-tabs.test.tsx` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): /users/new with SUPER confirm, bulk pending-invite card, users directory route"
```

---

### Task 10: Forgot-password and reset-password screens

**Files:**
- Create: `apps/mobile/app/forgot-password.tsx`, `apps/mobile/app/reset-password.tsx` (outside `(app)`, beside `login.tsx` and Plan 9's `accept-invite.tsx`)
- Modify: `apps/mobile/app/login.tsx` (a "Forgot password?" link)
- Test: `apps/mobile/src/__tests__/password-reset-screens.test.tsx` (new); run `login-screen.test.tsx`

**Interfaces:**
- Consumes: Task 6's `useForgotPassword` and `useResetPassword`; Task 1's `forgotPasswordRequestSchema`, `extractResetToken` and `PASSWORD_RESET_TTL_MINUTES`; Plan 9's `passwordSchema`; Plan 4's `apiErrorMessage`.
- Produces: the anonymous routes `/forgot-password` and `/reset-password`. The second opens from `spacev2://reset-password?token=…`, because expo-router maps the scheme path to the file.

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/mobile/src/__tests__/password-reset-screens.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { post: jest.fn() } }));
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockSetParams = jest.fn();
let mockParams: { token?: string } = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush, setParams: mockSetParams }),
  useLocalSearchParams: () => mockParams,
}));

import { apiClient } from "../lib/api-client";
import { renderWithProviders } from "./helpers/render";

import ForgotPasswordScreen from "../../app/forgot-password";
import ResetPasswordScreen from "../../app/reset-password";

const post = apiClient.post as jest.Mock;
const TOKEN = "ab".repeat(32);

/** An axios-shaped error, as apiErrorMessage reads it. */
function apiFailure(status: number, code: string, message: string) {
  return Object.assign(new Error(String(status)), {
    isAxiosError: true,
    response: { status, data: { error: { code, message } } },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
});

describe("ForgotPasswordScreen", () => {
  it("shows the same confirmation whatever the server knows (R67)", async () => {
    post.mockResolvedValue({ data: { data: { ok: true } } });
    renderWithProviders(<ForgotPasswordScreen />);

    fireEvent.changeText(screen.getByLabelText("Email"), " someone@jpc.test ");
    fireEvent.press(screen.getByText("Send reset code"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/auth/forgot-password", { email: "someone@jpc.test" }),
    );
    expect(
      await screen.findByText(
        "If an account exists for that email, we've sent a reset code. It expires in 60 minutes.",
      ),
    ).toBeTruthy();
    fireEvent.press(screen.getByText("I have a reset code"));
    expect(mockPush).toHaveBeenCalledWith("/reset-password");
  });

  it("validates the address locally", async () => {
    renderWithProviders(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByLabelText("Email"), "nope");
    fireEvent.press(screen.getByText("Send reset code"));
    await waitFor(() =>
      expect(screen.getByLabelText("Email").props.accessibilityHint).toBe("Must be a valid email."),
    );
    expect(post).not.toHaveBeenCalled();
  });
});

describe("ResetPasswordScreen", () => {
  it("takes the token from the deep link, then removes it from the route params (R80)", async () => {
    mockParams = { token: TOKEN };
    renderWithProviders(<ResetPasswordScreen />);

    await waitFor(() => expect(screen.getByLabelText("Reset code").props.value).toBe(TOKEN));
    expect(mockSetParams).toHaveBeenCalledTimes(1);
    expect(mockSetParams).toHaveBeenCalledWith({ token: undefined });
  });

  it("accepts a pasted v1 web link and resets (Decision 10)", async () => {
    post.mockResolvedValue({ data: { data: { ok: true } } });
    renderWithProviders(<ResetPasswordScreen />);

    fireEvent.changeText(
      screen.getByLabelText("Reset code"),
      `https://space.example.org/reset-password?token=${TOKEN}`,
    );
    fireEvent.changeText(screen.getByLabelText("New password"), "brand-new-password");
    fireEvent.changeText(screen.getByLabelText("Confirm password"), "brand-new-password");
    fireEvent.press(screen.getByText("Set new password"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/auth/reset-password", {
        token: TOKEN,
        password: "brand-new-password",
      }),
    );
    fireEvent.press(await screen.findByText("Go to sign in"));
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });

  it("enforces the shared password policy and the confirm match before posting", async () => {
    renderWithProviders(<ResetPasswordScreen />);
    fireEvent.changeText(screen.getByLabelText("Reset code"), TOKEN);
    fireEvent.changeText(screen.getByLabelText("New password"), "short");
    fireEvent.changeText(screen.getByLabelText("Confirm password"), "short");
    fireEvent.press(screen.getByText("Set new password"));

    await waitFor(() =>
      expect(screen.getByLabelText("New password").props.accessibilityHint).toBe("At least 8 characters."),
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("shows the server's one opaque refusal and offers a fresh request", async () => {
    post.mockRejectedValue(
      apiFailure(400, "invalid_reset_token", "This reset code is invalid or has expired. Request a new one."),
    );
    renderWithProviders(<ResetPasswordScreen />);
    fireEvent.changeText(screen.getByLabelText("Reset code"), TOKEN);
    fireEvent.changeText(screen.getByLabelText("New password"), "brand-new-password");
    fireEvent.changeText(screen.getByLabelText("Confirm password"), "brand-new-password");
    fireEvent.press(screen.getByText("Set new password"));

    expect(
      await screen.findByText("This reset code is invalid or has expired. Request a new one."),
    ).toBeTruthy();
    fireEvent.press(screen.getByText("Request a new code"));
    expect(mockReplace).toHaveBeenCalledWith("/forgot-password");
  });
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/password-reset-screens.test.tsx` → FAIL (no route files).

- [ ] **Step 2: The screens**

```tsx
// apps/mobile/app/forgot-password.tsx
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { PASSWORD_RESET_TTL_MINUTES, forgotPasswordRequestSchema } from "@space/shared";

import { useForgotPassword } from "../src/hooks/use-password-reset";
import { apiErrorMessage } from "../src/lib/api-error";
import { useTheme } from "../src/theme";
import { Button, Input, Screen, Text } from "../src/ui";

/**
 * v1's /forgot-password (app/forgot-password/page.tsx), anonymous, outside
 * (app). The confirmation is the same whether or not the address exists
 * (R67) — the API answers before it even looks (Plan 10 Decision 9).
 */
export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const forgot = useForgotPassword();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = () => {
    setEmailError(null);
    setFailure(null);
    const parsed = forgotPasswordRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message ?? "Must be a valid email.");
      return;
    }
    forgot.mutate(parsed.data, {
      onSuccess: () => setSent(true),
      // Only transport trouble or the rate limiter can land here.
      onError: (err) =>
        setFailure(apiErrorMessage(err, "Couldn't send the request. Check your connection and try again.")),
    });
  };

  return (
    <Screen scroll>
      <View style={{ flex: 1, justifyContent: "center", gap: theme.spacing.md }}>
        <Text variant="heading">Forgot password</Text>
        {sent ? (
          <Text variant="body">
            {`If an account exists for that email, we've sent a reset code. It expires in ${PASSWORD_RESET_TTL_MINUTES} minutes.`}
          </Text>
        ) : (
          <>
            <Text variant="body" color={theme.colors.neutral[600]}>
              Enter your account's email and we'll send you a reset code.
            </Text>
            {failure ? (
              <Text variant="body" color={theme.colors.error[600]} accessibilityRole="alert">
                {failure}
              </Text>
            ) : null}
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              error={emailError ?? undefined}
            />
            <Button title="Send reset code" onPress={submit} loading={forgot.isPending} disabled={!email.trim()} />
          </>
        )}
        <Button title="I have a reset code" variant="secondary" onPress={() => router.push("/reset-password")} />
        <Button title="Back to sign in" variant="ghost" onPress={() => router.replace("/login")} />
      </View>
    </Screen>
  );
}
```

```tsx
// apps/mobile/app/reset-password.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { extractResetToken, passwordSchema } from "@space/shared";

import { useResetPassword } from "../src/hooks/use-password-reset";
import { apiErrorMessage } from "../src/lib/api-error";
import { useTheme } from "../src/theme";
import { Button, Input, Screen, Text } from "../src/ui";

/**
 * v1's /reset-password, anonymous, outside (app). The code arrives three
 * ways: the email's spacev2:// deep link (route param), pasted from the
 * email, or as a pasted v1 web link (same token format — Plan 10 Decision
 * 10). A deep-linked token is copied into state and immediately removed from
 * the route params, and nothing here ever puts it back into a URL — v1
 * re-emitted it into a second history entry on every error (R80).
 */
export default function ResetPasswordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const consumedParam = useRef(false);

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const resetPassword = useResetPassword();

  useEffect(() => {
    if (consumedParam.current) return;
    if (typeof params.token === "string" && params.token !== "") {
      consumedParam.current = true;
      setCode(extractResetToken(params.token));
      router.setParams({ token: undefined });
    }
  }, [params.token, router]);

  const submit = () => {
    setCodeError(null);
    setPasswordError(null);
    setConfirmError(null);
    setFailure(null);
    const token = extractResetToken(code);
    if (token.length < 16) {
      setCodeError("Paste the code from your email.");
      return;
    }
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      setPasswordError(parsed.error.issues[0]?.message ?? "Invalid password.");
      return;
    }
    if (password !== confirm) {
      setConfirmError("Passwords don't match.");
      return;
    }
    resetPassword.mutate(
      { token, password },
      {
        onSuccess: () => setDone(true),
        // The API has one refusal for every bad code; show its words.
        onError: (err) =>
          setFailure(apiErrorMessage(err, "Couldn't reset your password. Check your connection and try again.")),
      },
    );
  };

  if (done) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: "center", gap: theme.spacing.md }}>
          <Text variant="heading">Password updated</Text>
          <Text variant="body">
            Sign in with your new password. Every other device signed in to this account has been signed out.
          </Text>
          <Button title="Go to sign in" onPress={() => router.replace("/login")} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={{ flex: 1, justifyContent: "center", gap: theme.spacing.md }}>
        <Text variant="heading">Reset password</Text>
        {failure ? (
          <>
            <Text
              variant="body"
              color={theme.colors.error[600]}
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
            >
              {failure}
            </Text>
            <Button title="Request a new code" variant="secondary" onPress={() => router.replace("/forgot-password")} />
          </>
        ) : null}
        <Input
          label="Reset code"
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
          autoCorrect={false}
          error={codeError ?? undefined}
        />
        <Input
          label="New password"
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
          title="Set new password"
          onPress={submit}
          loading={resetPassword.isPending}
          disabled={!code.trim() || !password || !confirm}
        />
        <Button title="Back to sign in" variant="ghost" onPress={() => router.replace("/login")} />
      </View>
    </Screen>
  );
}
```

In `login.tsx`, below Plan 9's "I have an invite code" button:

```tsx
        <Button
          title="Forgot password?"
          variant="ghost"
          onPress={() => router.push("/forgot-password")}
        />
```

- [ ] **Step 3: Run everything**

Run: `pnpm turbo routes:generate --filter=@space/mobile`
Run: `cd apps/mobile && pnpm jest src/__tests__/password-reset-screens.test.tsx src/__tests__/login-screen.test.tsx src/__tests__/accept-invite-screen.test.tsx` → PASS. Read `login-screen.test.tsx` first. If it pins the button set, add the new ghost button to it.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean. If typed routes reject `router.setParams({ token: undefined })`, change the call to `router.setParams<"/reset-password">({ token: undefined })`. Never use `as`.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): forgot/reset password screens with deep-link token capture and pasted-link support"
```

---

### Task 11: Closing gate (coordinator)

**Files:** none created — verification only.

- [ ] **Step 1: Full green run**

`pnpm turbo lint typecheck test:unit build` → green. Then run every integration suite serially:
`cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern integration` → green. Run all suites, not only this plan's. The `liveInviteWhere` move, the reactivate amendment and the `me.ts` change touch Plan 9's suites, and Plan 7's suite now carries a mailer mock.

- [ ] **Step 2: Mutation pass** — one at a time. Revert the load-bearing line, confirm the named test FAILS, restore, and confirm green:

  1. **Graduation completes all.** In `routes/students.ts` graduate, add `seasonId: <the pointer>` back into the enrollment `updateMany` (v1's R48 behaviour). Simplest: change its `where` to `{ studentUserId: id, status: "ACTIVE", seasonId: -1 }`. Expected failure: "completes EVERY active enrollment" (`enrollmentsCompleted` 0 ≠ 2).
  2. **Graduation gate.** Delete the `if (!isSuper(user))` block in graduate. Expected failure: "is SUPER-only (R55)" (200 ≠ 403).
  3. **Not overwritable.** Change the guarded `updateMany`'s `where` to `{ id }`. Expected failure: "refuses a second graduation" (200 ≠ 409, year overwritten).
  4. **Delete revokes.** Remove `await revokeAllRefreshTokensForUser(tx, id);` from `DELETE /:id`. Expected failure: "stamps User and StudentProfile together, revokes every session" on the `revokedAt` assertion.
  5. **Delete is atomic over both rows.** Remove the `studentProfile.updateMany` from `DELETE /:id`. Expected failure: the same test, on `studentProfile.deletedAt`.
  6. **Creation is invite-first.** Remove the `issueInvite(tx, …)` line from `POST /students`. Expected failure: "mints one hashed invite in the creating transaction" (0 rows).
  7. **v1 plaintext invites don't count.** In `listPendingInviteUserIds`, replace the `isV2InviteDigest` filter with `rows.filter((row) => row.invitesReceived.length === 0)`. Expected failure: the GET count test (`pending: 3` ≠ 4).
  8. **Mail failure keeps the person pending.** Delete the `db.inviteToken.updateMany(… expiresAt: new Date() …)` in `sendPendingInviteBatch`'s catch. Expected failure: "a mail failure expires the invite just minted" (`remaining` 0 ≠ 1, live count 1 ≠ 0).
  9. **No mint without a transport.** Delete the `isEmailConfigured()` guard in `POST /users/invites/pending`. Expected failure: the 503 test.
  10. **Per-user re-check.** In `inviteIfStillPending`, delete the `if (!row || …) return null;` line. Expected failure: "mints for a pending account, then refuses the same account on a second call".
  11. **SUPER confirmation on create.** Delete the `confirm_super_required` block in `POST /users`. Expected failure: "refuses role SUPER without the flag".
  12. **Reset evicts.** Remove `await revokeAllRefreshTokensForUser(tx, record.userId);` from `completePasswordReset`. Expected failure: "sets a cost-12 hash, consumes the token, and evicts…" on the rotation assertion (200 ≠ 401).
  13. **Reset expiry.** Delete `if (record.expiresAt <= new Date()) return "invalid";`, and remove `expiresAt: { gt: now }` from the consuming `updateMany`'s `where`. Expected failure: "refuses expired, unknown and deleted-account tokens" (the expired token resets, 200 ≠ 400). Removing only one of the two leaves the other guard holding. Record that both are load-bearing as a pair.
  14. **Digest at rest.** In `issuePasswordReset`, store `token: raw`. Expected failure: the forgot-password test's `hashToken(call[1]) === rows[0].token` assertion.
  15. **Constant-time response.** In `routes/auth.ts`, make the route `async` and `await requestPasswordReset(...)` before answering. Expected failure: "does not wait for the mailer" (the never-resolving mailer holds the request past the 10 s test timeout).
  16. **Cooldown.** Delete the `recent` check in `requestPasswordReset`. Expected failure: "ignores a second request inside the 60 s cooldown" (2 rows ≠ 1).
  17. **Password change consumes resets.** Delete the `expireLiveResetTokens` line in `me.ts`. Expected failure: "a token minted before a password change no longer works after it" (200 ≠ 400).
  18. **Client gates mirror C7.** In `isAdminOfSeasonForUi`, drop `user.role === "ADMIN" &&`. Expected failure: `student-actions.test.ts` "ignores a stray season-admin claim on a non-ADMIN role".
  19. **R80.** In `reset-password.tsx`, delete the `router.setParams({ token: undefined });` line. Expected failure: "takes the token from the deep link, then removes it from the route params".
  20. **Audit lines carry no values.** In `lib/audit.ts`, have `formatAuditLine` append ` year=…` (or any extra field). Expected failure: `audit.test.ts`'s exact-string case.

- [ ] **Step 3: Emit trap (ruling X12 — all of `dist/`)**

`grep -rn 'require("@space/shared")' apps/backend/dist/` → empty, after `pnpm turbo build`. This plan adds shared value imports in three backend files: `lib/invites.ts`, `lib/email.ts` and `lib/auth/password-reset.ts`, the last one level deeper.

- [ ] **Step 4: Credential-leak sweep**

- `grep -rn "ChangeMe123" apps/backend/src apps/mobile packages/shared` → test assertions only. No write path, no screen copy.
- `grep -rn "\.raw\b\|rawToken\|issued\.raw\|invite\.raw" apps/backend/src/routes apps/backend/src/lib` → the raw invite code flows only into `sendInviteEmail(...)` and `hashToken(...)`. The raw reset token flows only into `sendPasswordResetEmail(...)` and `hashToken(...)`. Neither appears in any `apiOk(...)` or `console.*` call.
- `grep -rn "console\." apps/backend/src/lib/auth/password-reset.ts apps/backend/src/lib/invites.ts apps/backend/src/lib/email.ts apps/backend/src/lib/audit.ts` → read every hit. None may interpolate a code, a token, an email address, a name, a year or a reason.
- `grep -rn "rateLimitHandler" apps/backend/src/` → exactly one definition, in `lib/rate-limit.ts`. Every other hit is an import (X4).
- `grep -rn "process.env" apps/backend/src --include=*.ts | grep -v "lib/config.ts\|__tests__"` → empty (X14).

- [ ] **Step 5: Device checklist (manual, on Expo Go or a dev build, against staging)**

Point the backend at a test inbox with `GMAIL_*` set.

1. As SUPER, on Students, tap New student. Create one with a season. The invite email arrives with a code. Accept it through Plan 9's screen and sign in as the student.
2. As SUPER, on that student, graduate them through the sheet. The Alumni list shows them, and their Seasons all read Completed.
3. As a season ADMIN, open a student enrolled in two seasons. Drop appears only on the admin's own season. Drop with a reason, and the Dropped list shows it.
4. As SUPER, delete a test student. They leave the lists. Reactivate them from Users and they return.
5. On Login, tap Forgot password and request a code. Tap the email's "Reset password in the app" on the phone, and the reset screen opens prefilled. Set a password. The old session on a second device is signed out at its next refresh.
6. Paste a v1-format reset link into the reset screen. It is accepted.
7. As SUPER, on Users, the "N accounts have no invite yet" card appears. Send one batch and read the summary. Use test accounts only. Staging holds real pending users, so stop if the count is not what your fixtures explain.

- [ ] **Step 6: Report**

The report covers:
- suite counts, the 20 mutation outcomes (state that mutation 13 needs both guards removed), and the device results
- **deferred to Plan 18's register:**
  - audit columns for student writes (spec 06 D15)
  - a durable job queue to replace bounded bulk batches (spec 11 §7)
  - the `PasswordResetToken.expiresAt` index and the used/expired token sweep (spec 11 D5 rec 4)
  - a per-season enrollment close-out (spec 06 D10 — product decision)
  - student photos and documents, which stay with uploads
  - no web `/reset-password` page or universal links are needed at cutover (Decision 10)
- **operational:** Gmail's daily sending cap against bulk invites (Decision 12)
- any divergence from this plan found while implementing

## Revision 2026-10-05

Cross-plan consistency pass (execution order 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → …):
- `Depends on` reordered to the execution order (Plan 4 before 15) and now names Plan 6 (`DIRECTORY_ROUTE_HREFS`; no session reads/writes here, so Plan 6's `startDay`/`startTime` format is irrelevant).
- Task 9 no longer replaces `routeNameForHref` with a `["students", "users"]` set — that would have dropped Plan 6's `"seasons"` and hidden the SUPER Seasons tab. It adds `"users"` to Plan 6's set and the test asserts `/seasons` still maps to `seasons/index`.
- Task 7's layout case uses `makeUser("ADMIN")` / `makeScopes()` (Plan 1 Task 0's fixtures) instead of a hedged `user()`.
