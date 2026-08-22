# Domain 11 — Invites & users

> Status: draft · Phase: 4 · v1 API status: **none** — and the word is exact.
> v1 has no `/api/v1` route for users, invites, or passwords (`find src/app/api`
> returns `auth/login`, `auth/refresh`, `auth/logout` and nothing else in this
> domain). Every operation here is a Next.js Server Action reached from a page
> under `/super/users`. v2's `apps/backend/src/routes/auth.ts` ports the *login*
> half of the credential lifecycle and nothing else — see §7 for exactly where
> the line falls.

This domain owns the `User` row's identity fields (`email`, `name`, `role`,
`graduationYear`, `passwordHash`, `deletedAt`), the `InviteToken` and
`PasswordResetToken` credentials, and the derivation of the `seasonAdminIds` /
`groupLeaderIds` claims that every `rbac.ts` predicate in v2 consumes.

It is the highest-privilege domain in the system: the only place a `SUPER` role
can be minted, and the only place a password can be set without knowing the old
one.

**Boundary with domain 16 (Imports).** `/super/users/import` and
`src/lib/student-import.ts` are domain 16's. They are named here only because
`student-import.ts:260` is the **sole** place in v1 that creates a `User` with
`passwordHash: null`, and that is the exact precondition the invite flow
requires (R14). The invite domain is therefore functionally a dependency of the
import domain — see §10 D2. Do not spec the import screen here.

**Boundary with domain 12 (Settings/profile).** `changePasswordAction`
(`src/lib/settings-actions.ts:25-55`) is the authenticated
change-your-own-password path and belongs to settings. It is cited here because
it is the third of three bcrypt cost factors in the codebase (R66) and because
it shares the "does not invalidate anything" defect (R79). `updateAvatarAction`
(`src/lib/user-actions.ts:168-194`) lives in this *file* but is a profile
operation — domain 12's.

**Boundary with domain 6 (Students).** `createStudentAction`
(`src/lib/student-actions.ts:50-101`) is a second user-creation path with the
same hard-coded temp password (R41). It is domain 6's screen, but it produces
`User` rows this domain governs, and the D1 decision must cover it.

**Boundary with domains 2/5 (Seasons, Groups).** `SeasonAdmin` and `GroupLeader`
rows are written there. This domain owns only how those rows become token
claims (R7–R12) and what happens to them when a user's role changes or the user
is deactivated (R53, R60) — which is where the load-bearing defect lives.

---

## 1. v1 source

| File | Holds |
|---|---|
| `src/lib/invites.ts` | The whole invite credential. `"use server"` at `:1`. Token generator and alphabet (`:8-9`), TTL (`:11-17`), `createInvite` (`:19-42`), `acceptInvite` (`:48-70`). **Both exports are unguarded server actions — see R21 and §10 D4.** |
| `src/lib/invite-actions.ts` | The two guarded entry points. `issueInvites` eligibility filter (`:21-24`), per-user loop with swallowed errors (`:27-35`), `sendInvitesAction` (`:41-51`), `sendAllPendingInvitesAction` (`:53-75`) |
| `src/lib/user-actions.ts` | `userSchema` (`:22-33`), `checkAlumnusEligibility` (`:39-51`), `createUserAction` (`:60-101`), `updateUserAction` (`:103-130`), `deactivateUserAction` (`:132-143`), `reactivateUserAction` (`:145-154`), `zodErrors` (`:156-163`). `updateAvatarAction` (`:168-194`) is domain 12's |
| `src/lib/roles.ts` | The entire role model beyond the enum: `ALUMNI_ONLY_ROLES` (`:4`) and `roleRequiresAlumnus` (`:7-9`). Nine lines |
| `src/lib/rbac.ts` | `SessionUser` (`:3-10`) — the claim shape. `isSuper` (`:12-14`), `isAlumnus` (`:20-22`), `isAdminOfSeason` (`:28-30`), `isLeaderOfGroup` (`:32-34`), `canReadAllStudents` (`:53-55`), `canManageUsers` (`:57-59`) |
| `src/lib/auth/scopes.ts` | `loadScopes` (`:10-26`) — the single derivation of `seasonAdminIds`, `groupLeaderIds`, `activeSeasonId`, `graduationYear` |
| `src/lib/auth/credentials.ts` | `verifyCredentials` (`:18-36`) — the only read of `passwordHash`; the `deletedAt` and null-hash refusals (`:24-25`) |
| `src/lib/auth/password-reset.ts` | `TOKEN_TTL_MS` (`:6`), `hashToken` (`:8-10`), `requestPasswordReset` (`:12-41`), `resetPassword` (`:43-70`) |
| `src/lib/auth/permissions.ts` | `requireRole` (`:25-35`) — the page-level gate every `/super/users` page uses |
| `src/lib/auth/session.ts` | `getCurrentUserOrRedirect` (`:18-22`) — rebuilds `SessionUser` from the Auth.js session |
| `src/lib/auth/tokens.ts` | `signAccessToken` (`:19-36`), `verifyAccessToken` (`:38-54`), `issueSession` (`:79-101`) with its `deletedAt` check (`:87`), `rotateRefreshToken` (`:104-120`), `revokeRefreshToken` (`:122-127`) |
| `src/lib/auth.ts` | The Auth.js JWT callback (`:71-84`) — **when scopes are re-derived** (`:76`) |
| `src/lib/auth/post-login.ts` | `dashboardPathForRole`, `rolePrefixAllowed` — role → route-prefix mapping |
| `src/lib/email.ts` | `sendInviteEmail` (`:107-133`), `sendPasswordResetEmail`; nodemailer/Gmail transport (`:16-30`) |
| `src/app/super/users/page.tsx` | User list. `requireRole(["SUPER"])` (`:14`), the full-table read incl. `passwordHash` (`:16-27`), pending-invite set (`:29-33`), `activated` derivation (`:42`), `needsInviteCount` (`:46-48`) |
| `src/app/super/users/[id]/edit/page.tsx` | Edit. Gate (`:18`), target read (`:20-32`), `activated`/`invitePending`/`canInvite` (`:35-44`), conditional invite button (`:53-55`) |
| `src/app/super/users/new/page.tsx` | Create. Gate (`:10`), renders `UserForm mode="create"` (`:19`) |
| `src/components/users/user-form.tsx` | Client validation (`:30-58`), role options incl. SUPER (`:62-68`), submit (`:100-120`), deactivate/reactivate (`:122-133`), email disabled on edit (`:144`), the temp-password notice (`:183-188`) |
| `src/components/users/invite-buttons.tsx` | `SendInviteButton` (`:10-38`), `SendPendingInvitesButton` (`:40-65`) |
| `src/components/users/users-list.tsx` | Status badge vocabulary (`:72-84`), role badge colours (`:22-28`) |
| `src/app/forgot-password/page.tsx` | Inline `"use server"` action (`:10-15`), the constant-response copy (`:38-42`) |
| `src/app/reset-password/page.tsx` | Inline `"use server"` action (`:10-23`), token in a hidden field from the query string (`:51`), error re-round-tripped through the URL (`:18-20`) |
| `prisma/schema.prisma` | `UserRole` (`:23-29`), `User` (`:103-164`), `InviteToken` (`:166-179`), `RefreshToken` (`:184-196`), `PasswordResetToken` (`:198-208`), `SeasonAdmin` (`:280-291`), `GroupLeader` (`:314-323`) |

**Named but not specced here:** `src/app/super/users/import/page.tsx` and
`src/lib/student-import.ts` (domain 16), `src/lib/settings-actions.ts`
(domain 12), `src/lib/student-actions.ts` (domain 6).

v1 has **zero test files**. The source above is the only statement of intent.
`user-form.tsx:186` and `student-actions.ts:59` both point at a `TODO.md` that
is not in the repository.

---

## 2. Data model

### `User` — `prisma/schema.prisma:103-164`

| Field | Meaning |
|---|---|
| `email` | `@unique` (`:105`). The login identifier. **Immutable through the UI** — the edit form disables the input (`user-form.tsx:144`) and `updateUserAction` does not accept it (R48). |
| `name` | Non-nullable in the schema (`:106`) but **treated as nullable throughout the UI**: `users-list.tsx:16` types it `string \| null`, `:56` falls back to the email, and the edit page uses `target.name ?? target.email` (`:50`). See §10 D9. |
| `passwordHash` | `String?` (`:107`). Null means "invited but never activated". It is the *only* activation marker the system has, and its meaning is doubled up with `lastLoginAt` in the `activated` derivation (R81). |
| `role` | `UserRole`, non-nullable (`:108`). Carries no scope of its own — see R9. |
| `graduationYear` | `Int?` (`:111`). Doubles as the alumnus marker (`rbac.ts:20-22`) **and** as the eligibility gate for `LEADER`/`ADMIN`/`MENTOR` (`roles.ts:4`). One column, two unrelated jobs — §10 D8. |
| `lastLoginAt` | `DateTime?` (`:113`). Written by `verifyCredentials` (`credentials.ts:30-33`) and by the dev switcher (`auth.ts:53-56`). Read here as an activation signal (R81) and an invite-eligibility filter (R14). |
| `deletedAt` | `DateTime?` (`:114`). The soft-delete marker; the *only* thing deactivation writes (R56). Indexed (`:163`). |

`avatarPath` and `updatedAt` exist; nothing in this domain reads them.

### `InviteToken` — `prisma/schema.prisma:166-179`

| Field | Meaning |
|---|---|
| `token` | `String @unique` (`:168`). **Stored in plaintext.** Contrast `PasswordResetToken.token`, which stores a SHA-256 digest (`password-reset.ts:20`). Same table family, opposite policy — R23, §10 D5. |
| `userId` | `onDelete: Cascade` (`:170`). Hard-deleting a user takes their invites with them; nothing hard-deletes users. |
| `invitedById` | `onDelete: Restrict` (`:172`). **A user who has ever issued an invite can never be hard-deleted.** |
| `expiresAt` | Absolute instant, computed as `now + ttlHours` (`invites.ts:21`). Indexed (`:178`). |
| `usedAt` | `DateTime?`. Set by `acceptInvite` (`invites.ts:65`); the single-use marker (R28). |

There is **no unique constraint on `(userId, usedAt)`** and no partial index —
a user may hold unlimited concurrent live invites (R19).

### `PasswordResetToken` — `prisma/schema.prisma:198-208`

`token` is `@unique` and holds a SHA-256 hex digest, never the raw value
(`password-reset.ts:19-20`). `userId` cascades. `expiresAt`, `usedAt` mirror
`InviteToken`. **No index on `expiresAt`** — the one place a sweep would need it.

### `RefreshToken` — `prisma/schema.prisma:184-196`

Not this domain's to write, but this domain's to *revoke*, and it never does
(R79). `tokenHash` is SHA-256 (`tokens.ts:56-58`), `revokedAt` is the only
revocation lever, `userId` cascades.

### `SeasonAdmin` — `:280-291` and `GroupLeader` — `:314-323`

The two rows `loadScopes` reads. Both are composite-PK join tables. Note the
asymmetry: `SeasonAdmin.user` is `onDelete: Cascade` (`:284`) while
`GroupLeader.user` is `onDelete: Restrict` (`:318`). Neither carries a
`deletedAt`, and neither is touched by any action in this domain (R53, R60).

### Enum — `prisma/schema.prisma:23-29`

`UserRole` = `SUPER | ADMIN | LEADER | STUDENT | MENTOR`. There is no `ALUMNI`
member: an alumnus is `STUDENT` + non-null `graduationYear` (`rbac.ts:20-22`).
`packages/shared/src/auth.ts:3` already mirrors these five exactly.

---

## 3. Business rules

### The role model and the token claims

- **R1.** There are exactly five roles and a user holds exactly one — `prisma/schema.prisma:23-29` with `:108`.
- **R2.** `LEADER`, `ADMIN` and `MENTOR` may only be held by an alumnus, i.e. a user with a non-null `graduationYear` — `src/lib/roles.ts:4`, `:7-9`.
- **R3.** That rule is enforced on both create and update by `checkAlumnusEligibility`, which returns a field-scoped error rather than throwing — `src/lib/user-actions.ts:39-51`, called at `:67` and `:117`.
- **R4.** *(implicit)* The rule is enforced only in the "role requires a year" direction. Nothing clears `graduationYear` when a user is demoted out of an alumni-only role, and nothing prevents setting a `graduationYear` on a `SUPER` or an active `STUDENT` — `src/lib/user-actions.ts:39-51` (no inverse branch).
- **R5.** *(implicit)* Setting a `graduationYear` on a `STUDENT` silently converts them to an alumnus, which changes their landing page and revokes every `/student/*` route — `src/lib/rbac.ts:20-22` with `src/lib/auth/post-login.ts:31-41`. The user form presents the field as "Optional — set if this person has graduated" (`src/components/users/user-form.tsx:170`) and never says so.
- **R6.** An alumnus is not a role: they carry `role: "STUDENT"`, so every role-string comparison in the system treats them as a student — `src/lib/rbac.ts:20-22`.
- **R7.** `seasonAdminIds` is every `SeasonAdmin.seasonId` for the user, with **no filter on the season's `deletedAt` or status** — `src/lib/auth/scopes.ts:12`, `:21`.
- **R8.** `groupLeaderIds` is every `GroupLeader.groupId` for the user, with **no filter on the group's season** — `src/lib/auth/scopes.ts:13`, `:22`. Season scoping is re-derived per call site (`src/lib/rbac.ts:36-51`).
- **R9.** **`isAdminOfSeason` and `isLeaderOfGroup` never check `role`.** They test `SUPER` or bare membership of the claim array — `src/lib/rbac.ts:28-30`, `:32-34`. Role and scope are therefore independent authorities, and the scope one wins. This is the single most load-bearing fact in the domain; see R53 and §10 D3.
- **R10.** `activeSeasonId` is read from `StudentProfile`, so a non-student always has null — `src/lib/auth/scopes.ts:14-17`, `:23`.
- **R11.** On the web, scopes are re-derived **only** on sign-in, on an explicit `update` trigger, or when the JWT lacks a `seasonAdminIds` key entirely — `src/lib/auth.ts:76`. A role or scope change therefore does not reach an already-signed-in browser until it signs out and back in.
- **R12.** On the mobile/API surface, claims are baked into a 15-minute HS256 access token (`src/lib/auth/tokens.ts:22-35`) and re-derived from the database on every refresh rotation (`:89-90` via `:118`) — so the mobile propagation delay is bounded at 15 minutes and the web's is unbounded.

### Invite issuance

- **R13.** The invite token is 32 characters over the 62-character alphanumeric alphabet, from `nanoid`'s `customAlphabet` — `src/lib/invites.ts:8-9`. That is ~190 bits; entropy is not a weakness here.
- **R14.** Only users that are simultaneously not soft-deleted, have a **null** `passwordHash`, **and** have a null `lastLoginAt` are invitable — `src/lib/invite-actions.ts:22`.
- **R15.** *(implicit)* Because `createUserAction` always writes a `passwordHash` (R41), **no user created through `/super/users/new` is ever invitable** — the exclusion is a consequence of the `where` clause, and nothing reports it. The only v1 path that produces an invitable user is the CSV importer (`src/lib/student-import.ts:260`) — see §10 D2.
- **R16.** *(implicit)* Ids that do not match the filter are silently dropped, not reported: `issueInvites` re-queries and iterates only the survivors, so a request for 10 ids may legitimately return `sent: 0` — `src/lib/invite-actions.ts:21-36`.
- **R17.** The batch accepts 1–5000 integer ids; a malformed array returns `"No valid recipients."` and writes nothing — `src/lib/invite-actions.ts:39`, `:45-46`.
- **R18.** Invites are issued in a **sequential loop with no transaction**, and a per-user failure is caught, logged and counted rather than aborting — so a partial issuance is the designed outcome — `src/lib/invite-actions.ts:27-35`.
- **R19.** `createInvite` always inserts a new row; it never revokes or reuses the user's existing live invites, so every "Resend invite" click leaves the previous token **valid** — `src/lib/invites.ts:22-24` (a `create`, not an upsert, and no preceding `updateMany`).
- **R20.** *(implicit)* The bulk path selects only users with **no** live unused invite, so it does not re-send to someone already invited; the single-user button applies no such filter and always issues — `src/lib/invite-actions.ts:63` versus `:22`.
- **R21.** **`createInvite` performs no authentication and no authorization of any kind.** It takes `invitedById` as a parameter and trusts it, and it returns the raw token to its caller — `src/lib/invites.ts:19-42`. The only thing standing between a caller and a live credential is that its two callers happen to be `isSuper`-gated (`src/lib/invite-actions.ts:43`, `:55`). Because `src/lib/invites.ts:1` is `"use server"`, `createInvite` is itself a callable Server Action endpoint. **This is the domain's primary finding — §10 D4.**
- **R22.** The invite TTL is read from `INVITE_TOKEN_TTL_HOURS` and defaults to 72 hours; a non-numeric or non-positive value silently falls back to the default rather than failing — `src/lib/invites.ts:11-17`.
- **R23.** The token is stored in plaintext, so anyone who can read the `InviteToken` table — a backup, a query log, a read replica, a `db:studio` session — holds live account-takeover credentials for every pending invite — `prisma/schema.prisma:168` with `src/lib/invites.ts:23`.
- **R24.** The token is delivered as a URL query parameter, `${AUTH_URL}/accept-invite?token=…` — so it lands in browser history, `Referer` headers on any outbound link from that page, and any proxy or CDN access log — `src/lib/invites.ts:32-33`.
- **R25.** The email send is wrapped in its own try/catch: a transport failure is logged and swallowed, and `createInvite` still returns success with the row already committed — so a "sent" count means "token minted", not "email delivered" — `src/lib/invites.ts:34-38` with `src/lib/invite-actions.ts:29-30`.

### Invite acceptance

- **R26.** `acceptInvite` requires a password of at least 8 characters and checks it **before** looking the token up, so a short password produces `weak_password` even for an invalid token — `src/lib/invites.ts:49`.
- **R27.** Failure precedence after that is: unknown token → `invalid`; `usedAt` set → `used`; expired → `expired` — `src/lib/invites.ts:51-54`. The three codes are an existence oracle in the same shape as domain 4's check-in codes.
- **R28.** Acceptance is single-use: the same transaction that writes the password stamps `usedAt` — `src/lib/invites.ts:58-67`.
- **R29.** The password write and the `usedAt` stamp are in one `$transaction`, so a partial acceptance is impossible — `src/lib/invites.ts:58-67`.
- **R30.** `acceptInvite` hashes with **bcrypt cost 12** — `src/lib/invites.ts:56`. Every other password write in v1 uses cost 10 (R66).
- **R31.** **`acceptInvite` never checks that the target account is unactivated.** It sets `passwordHash` for `invite.userId` unconditionally, so a valid invite for an *active* account is a password reset that requires no knowledge of the old password — `src/lib/invites.ts:59-62`.
- **R32.** **`acceptInvite` never checks the caller's identity.** There is no session read; possession of the token is the entire authorization — `src/lib/invites.ts:48-70`. Combined with R21 and R31 this is the escalation chain in §10 D4.
- **R33.** Acceptance revokes nothing: no other outstanding `InviteToken`, no `PasswordResetToken`, no `RefreshToken`, no web session — `src/lib/invites.ts:58-67` (a two-statement transaction).
- **R34.** **`acceptInvite` has no caller anywhere in v1, and `/accept-invite` is not a route.** A repository-wide grep finds the string only in `invites.ts:33` (the link it builds) and in the function's own definition; `find src/app` returns no `accept-invite` directory. **The entire invite flow terminates in a 404 for the invitee.** See §10 D1.

### User creation

- **R35.** `createUserAction` is gated on `isSuper` and throws `ForbiddenError` — an explicit check in the action, not a page-level one — `src/lib/user-actions.ts:62`.
- **R36.** `name` is 2–120 characters, `email` must parse as an email, `role` must be one of the five, `graduationYear` is a nullable integer in `[1990, currentYear]` — `src/lib/user-actions.ts:22-33`.
- **R37.** `CURRENT_YEAR` is captured **at module load**, not per call — `src/lib/user-actions.ts:20`. A long-lived server process rejects the new year's graduates until it restarts.
- **R38.** `graduationYear` is coerced from `undefined` to `null` before validation, so omitting it is legal — `src/lib/user-actions.ts:64`.
- **R39.** Email uniqueness is checked with a read-then-write and no transaction, so two concurrent creates race onto the database's `@unique` and the loser surfaces a raw Prisma error rather than the friendly field error — `src/lib/user-actions.ts:70-77` with `prisma/schema.prisma:105`.
- **R40.** *(implicit)* The duplicate-email check ignores `deletedAt`, so a soft-deleted user's address is permanently unusable and the operator's only recovery is reactivation — `src/lib/user-actions.ts:70`.
- **R41.** **Every user created through this action is given the literal password `ChangeMe123!`, hashed at bcrypt cost 10** — `src/lib/user-actions.ts:79-80`. The same literal is used by `createStudentAction` (`src/lib/student-actions.ts:59-60`). It is a shared, static, guessable credential across the whole install.
- **R42.** That password is written to the server log in plaintext alongside the account's email and role — `src/lib/user-actions.ts:95-97`, `src/lib/student-actions.ts:95-97`.
- **R43.** *(implicit)* The create form tells the operator the temp password in the UI, so it is also in every browser that renders `/super/users/new` — `src/components/users/user-form.tsx:183-188`.
- **R44.** *(implicit)* Because `passwordHash` is set, the new account is immediately loginable via `verifyCredentials` (which only refuses a **null** hash) and is simultaneously ineligible for an invite (R14) — `src/lib/auth/credentials.ts:25` with `src/lib/invite-actions.ts:22`.
- **R45.** A `STUDENT` create also creates an empty `StudentProfile`; no other role does — `src/lib/user-actions.ts:88-90`.
- **R46.** *(implicit)* A user later promoted from another role to `STUDENT` never gets a `StudentProfile`, so `loadScopes` returns a null `activeSeasonId` for them forever — `src/lib/user-actions.ts:120-127` (the update writes no profile) with `src/lib/auth/scopes.ts:14-17`.

### Role assignment and user update

- **R47.** `updateUserAction` is gated on `isSuper` and throws `ForbiddenError` — an **explicit** check in the action itself, not merely a page gate — `src/lib/user-actions.ts:110`.
- **R48.** The update accepts `name`, `role` and `graduationYear` only; `email` cannot be changed — `src/lib/user-actions.ts:112-114`.
- **R49.** **`SUPER` is a freely assignable value on both create and update.** It is in `userSchema`'s enum (`src/lib/user-actions.ts:26`) and in the form's visible option list (`src/components/users/user-form.tsx:63`), and `checkAlumnusEligibility` does not constrain it (`roles.ts:4` omits `SUPER`), so a `SUPER` may promote anyone to `SUPER` with no graduation year and no second approval — `src/lib/user-actions.ts:60-101`, `:103-130`.
- **R50.** *(implicit)* **There is no self-demotion guard.** `deactivateUserAction` refuses to act on the caller (`src/lib/user-actions.ts:135`) but `updateUserAction` has no equivalent check, so the only `SUPER` in the install can set their own role to `STUDENT` and permanently lock the organisation out of every user-management operation — `src/lib/user-actions.ts:103-130`.
- **R51.** There is no "last SUPER" guard either: nothing counts remaining `SUPER` users before a demotion or a deactivation — `src/lib/user-actions.ts:103-143`.
- **R52.** The update does not verify the target exists or is not soft-deleted; a missing id surfaces as an unhandled Prisma error rather than a field error — `src/lib/user-actions.ts:120-127`.
- **R53.** **A role change does not touch `SeasonAdmin` or `GroupLeader` rows.** The update writes exactly `name`, `role`, `graduationYear` — `src/lib/user-actions.ts:120-127`. Combined with R9, demoting an `ADMIN` to `STUDENT` leaves their `SeasonAdmin` rows intact, `loadScopes` keeps returning the season ids (`src/lib/auth/scopes.ts:12`), and `isAdminOfSeason` keeps returning **true** (`src/lib/rbac.ts:29`). Demotion does not revoke season or group authority. See §10 D3.
- **R54.** *(implicit)* Nor does a role change reach a live session: R11 means the web JWT keeps the **old** `role` string as well until re-login, so for an already-signed-in user a demotion has no effect at all until they sign out — `src/lib/auth.ts:71-84`.
- **R55.** *(implicit)* The client form re-implements the validation independently — `name` min 2 with no max, `graduationYear` as a 4-digit string regex, and the alumni refinement — so the two schemas can drift; the server's 120-character name bound exists only server-side — `src/components/users/user-form.tsx:30-58` versus `src/lib/user-actions.ts:22-33`.

### Deactivation and reactivation

- **R56.** Deactivation is a soft delete: it writes `deletedAt = now` and nothing else — no anonymisation, no scope removal, no credential revocation — `src/lib/user-actions.ts:137-140`.
- **R57.** A user cannot deactivate themselves; the action returns silently, with no error and no feedback to the UI — `src/lib/user-actions.ts:135`.
- **R58.** `deactivateUserAction` returns `void` and ends in a `redirect`, so the client's `startTransition` has no result to inspect and the self-deactivation no-op is indistinguishable from success — `src/lib/user-actions.ts:132-143` with `src/components/users/user-form.tsx:122-126`.
- **R59.** Reactivation clears `deletedAt` and restores everything at once — the same `passwordHash`, the same `SeasonAdmin`/`GroupLeader` rows, the same role — `src/lib/user-actions.ts:148-151`.
- **R60.** *(implicit)* Because deactivation leaves `SeasonAdmin` and `GroupLeader` rows in place, a deactivated season admin or group leader still appears in every query that reads those tables without a `deletedAt` join — including the low-attendance notification recipient lookup (`src/lib/attendance-notifications.ts:41-52`) and the note-mention lookup (`src/lib/note-actions.ts:69`), neither of which filters the joined user. Cross-domain; flagged, not specced.
- **R61.** *(implicit)* Deactivation revokes no credential. `verifyCredentials` refuses a new login (`src/lib/auth/credentials.ts:24`) and `issueSession` refuses a refresh rotation (`src/lib/auth/tokens.ts:87`), but the user's current 15-minute access token stays valid and their **Auth.js web session stays valid indefinitely** — nothing re-checks `deletedAt` on a cookie-session request (`src/lib/auth.ts:85-93` reads only the JWT).
- **R62.** No user row is ever hard-deleted anywhere in v1 — `deleteMany` on `User` appears only in `prisma/seed.ts`. Rows authored by a user therefore always survive; the `onDelete` clauses are dormant.
- **R63.** Had a hard delete existed, the clauses disagree: `Attendance.markedById` and `Submission.reviewedById` are `SetNull` (`prisma/schema.prisma:449`, `:527`), `EngagementNote.authorUserId` and `GroupLeader.userId` are `Restrict` (`:577`, `:318`), and `InviteToken.invitedById` is `Restrict` (`:172`) — so any user who has ever authored a note, led a group, or issued an invite is undeletable by construction.

### Passwords and the reset flow

- **R64.** The **only** password rule in v1 is a minimum length of 8 characters. There is no maximum, no complexity requirement, no breach check, and no reuse check — `src/lib/invites.ts:49`, `src/lib/auth/password-reset.ts:47`, `src/lib/settings-actions.ts:17`.
- **R65.** The minimum is stated independently in four places (the two library functions above, the settings schema, and `minLength={8}` on the reset form at `src/app/reset-password/page.tsx:57`) with no shared constant.
- **R66.** **Three different bcrypt cost factors are in use:** 12 in `acceptInvite` (`src/lib/invites.ts:56`), 10 in `resetPassword` (`src/lib/auth/password-reset.ts:58`), 10 in `createUserAction` (`src/lib/user-actions.ts:80`), `createStudentAction` (`src/lib/student-actions.ts:60`) and `changePasswordAction` (`src/lib/settings-actions.ts:50`). A user's hash cost therefore records which path last set their password.
- **R67.** `requestPasswordReset` returns `void` on every path and the page always redirects to `?sent=1`, so an unknown email, a soft-deleted user and a successful send are indistinguishable — `src/lib/auth/password-reset.ts:12-17` with `src/app/forgot-password/page.tsx:13-14`.
- **R68.** The constant-response property is preserved through transport failure: a `sendMail` throw is caught and logged rather than propagated, with the intent stated in a comment — `src/lib/auth/password-reset.ts:34-40`.
- **R69.** *(implicit)* The property is nonetheless observable by timing: the unknown-email path returns after one indexed `findUnique`, while the known-email path performs a token insert **and awaits an SMTP round trip** before returning — `src/lib/auth/password-reset.ts:13-16` versus `:19-35`.
- **R70.** A soft-deleted user is refused a reset, so deactivation does block the reset channel even though it blocks nothing else — `src/lib/auth/password-reset.ts:14`.
- **R71.** The reset token is 32 cryptographic random bytes rendered as 64 hex characters — 256 bits — `src/lib/auth/password-reset.ts:19`.
- **R72.** It is stored as a SHA-256 digest and looked up by digest, so the database never holds a usable reset credential — `src/lib/auth/password-reset.ts:8-10`, `:20`, `:50-52`. This is the correct policy and it is the one the invite token does not follow (R23).
- **R73.** The reset TTL is a hard-coded 1 hour with no environment override — `src/lib/auth/password-reset.ts:6`.
- **R74.** Both TTLs are computed as `Date.now() + ms` and compared against `new Date()`, i.e. pure UTC instant arithmetic. **This domain is the one place in v1 where time is handled correctly** — there is no calendar arithmetic and therefore no timezone bug — `src/lib/invites.ts:21` with `:54`, `src/lib/auth/password-reset.ts:21` with `:56`.
- **R75.** Nothing anywhere displays either expiry to anyone. The invite email says only that it "will expire soon" (`src/lib/email.ts:120`); the users list shows a bare "Invited" badge (`src/components/users/users-list.tsx:79-80`); the reset email and page say nothing.
- **R76.** `requestPasswordReset` does not invalidate the user's existing unused reset tokens, so every request adds another live credential and all of them remain usable until they expire — `src/lib/auth/password-reset.ts:23-29` (a bare `create`).
- **R77.** `resetPassword` refuses in a fixed order — missing token or password under 8 → one combined error; unknown digest; already used; expired — and signals each by **throwing an `Error` whose message is the user-facing string** — `src/lib/auth/password-reset.ts:47-56`.
- **R78.** Those messages are round-tripped back to the browser through the query string, so the distinction between "invalid", "already used" and "expired" is rendered to whoever holds the token — `src/app/reset-password/page.tsx:16-20`, `:45-49`.
- **R79.** **Resetting a password revokes nothing.** The transaction writes the new hash and stamps `usedAt`; it does not revoke `RefreshToken` rows, does not invalidate the Auth.js web session, and does not consume the user's other outstanding reset or invite tokens — `src/lib/auth/password-reset.ts:60-69`. `changePasswordAction` is identical in this respect (`src/lib/settings-actions.ts:50-54`). The standard remediation for a compromised account therefore does not evict the attacker.
- **R80.** *(implicit)* On the error path the page redirects to `/reset-password?token=<raw>&error=…`, re-emitting the still-valid raw token into a second history entry and a second set of access logs — `src/app/reset-password/page.tsx:18-20`.

### Read surface rules

- **R81.** "Activated" is derived, not stored: `passwordHash !== null || lastLoginAt !== null` — `src/app/super/users/page.tsx:42`, `src/app/super/users/[id]/edit/page.tsx:35`. The same expression is written twice.
- **R82.** The status badge has four states in precedence order — Inactive (`deletedAt`), Active (`activated`), Invited (live unused invite), No invite — `src/components/users/users-list.tsx:74-83`.
- **R83.** *(implicit)* Because R41 makes every UI-created user "activated", the "No invite" and "Invited" states are unreachable for them, and the invite button is hidden on their edit page (`canInvite = !activated && !deletedAt`) — `src/app/super/users/[id]/edit/page.tsx:44`, `:53-55`.
- **R84.** The list loads **every** user with no pagination and no `deletedAt` filter, ordered `deletedAt` ascending then `name` ascending — `src/app/super/users/page.tsx:16-17`. Postgres sorts NULLs last on an ascending sort, so active users (null `deletedAt`) sort **after** deactivated ones.
- **R85.** The list query selects `passwordHash` for every user in the system purely to compute a boolean — `src/app/super/users/page.tsx:25` with `:42`. The hash is reduced to `activated` before reaching the client component (`:35-44`), so nothing leaks to the browser, but the whole hash column is read into process memory on every page view. The edit page does the same for one user (`:29`).
- **R86.** The pending-invite set is a second unfiltered query over all live unused invites, joined in memory — two round-trips, no N+1 — `src/app/super/users/page.tsx:29-33`.
- **R87.** *(implicit)* The "Send N invites" button renders only when at least one user is not deleted, not activated and not already invited; at zero it returns null rather than rendering disabled — `src/app/super/users/page.tsx:46-48` with `src/components/users/invite-buttons.tsx:44`.
- **R88.** *(implicit)* The counts in the page header (`N active · N total`) are computed client-side from the full unpaginated array, so they are correct only because the query is unbounded — `src/app/super/users/page.tsx:55`.

### Email

- **R89.** Both emails go through a single nodemailer Gmail transport that throws if `GMAIL_USER`/`GMAIL_APP_PASSWORD` are unset — `src/lib/email.ts:16-30`.
- **R90.** *(implicit)* The inviter's `name` is interpolated into the invite email's HTML without escaping, so a user whose display name contains markup injects it into the message body — `src/lib/email.ts:112` with `:117`.
- **R91.** The invite email's call to action is a single link containing the token; there is no code-entry alternative — `src/lib/email.ts:117` with `src/lib/invites.ts:33`.

**Total: 91 rules, 20 of them marked `(implicit)`.**

---

## 4. Authorization

| Operation | Roles | Row-scoped condition | v1 citation |
|---|---|---|---|
| List all users | SUPER | none | `src/app/super/users/page.tsx:14` (`requireRole`) |
| Read one user for edit | SUPER | none | `src/app/super/users/[id]/edit/page.tsx:18` |
| Create a user (any role, incl. SUPER) | SUPER | none | `src/lib/user-actions.ts:62` (explicit `isSuper`) |
| Update a user's name / role / graduation year | SUPER | none — **not even "not yourself"** (R50) | `src/lib/user-actions.ts:110` |
| Deactivate a user | SUPER | target ≠ caller (R57) | `src/lib/user-actions.ts:134-135` |
| Reactivate a user | SUPER | none | `src/lib/user-actions.ts:147` |
| Send invites to selected users | SUPER | target unactivated and not deleted (R14) | `src/lib/invite-actions.ts:43`, `:22` |
| Send invites to all pending | SUPER | as above, plus no live invite (R20) | `src/lib/invite-actions.ts:55`, `:63` |
| **Mint an invite token for an arbitrary user** | **none — unauthenticated** | none | `src/lib/invites.ts:19-42` |
| **Set any user's password from a token** | **none — unauthenticated** | possession of the token only (R31, R32) | `src/lib/invites.ts:48-70` |
| Request a password reset | anonymous — by design | target exists and is not soft-deleted (R70), not disclosed (R67) | `src/app/forgot-password/page.tsx:10-15` |
| Complete a password reset | anonymous — by design | possession of an unused, unexpired token | `src/lib/auth/password-reset.ts:43-70` |

### Where v1 enforces nothing and relies on the UI

Ranked by consequence. In this domain these are privilege escalation, not
disclosure.

1. **`createInvite` and `acceptInvite` are unguarded exported Server Actions
   (R21, R32).** `src/lib/invites.ts:1` is `"use server"`, so both exports are
   registered as callable action endpoints, and **neither reads a session**.
   `createInvite(userId, invitedById)` accepts the issuer id as a parameter,
   never validates the target's state, and **returns the raw token to its
   caller** (`:41`). `acceptInvite(token, password)` then sets `passwordHash`
   for that user regardless of role or activation state (R31). Chained, the two
   are an unauthenticated takeover of any account in the system, `SUPER`
   included, with no password knowledge and no email access.

   **Honest statement of exploitability today:** invoking a Server Action
   requires its action id, a build-time hash that Next.js does not emit to the
   client unless a client component imports the function. `invites.ts` is
   imported only by `invite-actions.ts` (server-side), so no id is currently
   published. The gate is therefore the secrecy of a hash, not a check — and it
   evaporates the instant anyone imports `createInvite` into a client component
   or, far more likely, the instant this domain is given the HTTP API v2 needs.
   **This is the shape the Seasons author found, at maximum stakes.** §10 D4.

2. **The role/scope split means demotion is not revocation (R9, R53).**
   `isAdminOfSeason` and `isLeaderOfGroup` never look at `role`. Nothing in
   this domain deletes `SeasonAdmin` or `GroupLeader` rows. So changing a user's
   role from `ADMIN` to `STUDENT` — the obvious operator action for "remove this
   person's admin rights" — leaves every season-scoped capability intact. The
   UI offers no other lever: `/super/users/[id]/edit` shows role and graduation
   year only. In v2 the role change must either cascade to the join tables or
   the predicates must require the matching role. §10 D3.

3. **`SUPER` is assignable with no additional control (R49, R50, R51).** The
   `isSuper` gate on `createUserAction`/`updateUserAction` is explicit and real
   — this is *not* a page-only gate, and it should be recorded as the domain's
   one properly-enforced write rule. What is missing is everything above it: no
   self-demotion guard, no last-SUPER guard, no second-approval, no audit row.
   A single compromised or mistaken `SUPER` session can mint a permanent second
   `SUPER`, or delete the role from the install entirely.

4. **Deactivation does not evict a live session (R61).** `deletedAt` is checked
   at login and at refresh rotation, never on a cookie-session request. A
   deactivated user's browser keeps working until the Auth.js JWT expires.

5. **A password reset does not evict a live session (R79).** Neither reset nor
   change revokes `RefreshToken` rows or the web session, so the remediation
   for a compromise leaves the compromise in place for up to 30 days of refresh
   rotation.

---

## 5. Read surface

### User list — `src/app/super/users/page.tsx:16-48`

Two unbounded queries joined in memory (R86). The first returns
`{ id, name, email, role, lastLoginAt, deletedAt, passwordHash }` for **every**
user, ordered `deletedAt` asc then `name` asc (R84) — deactivated users sort
first. The second returns `userId` for every live unused `InviteToken`.

The server component reduces `passwordHash` to the boolean `activated` (R81,
R85) and ships `{ id, name, email, role, lastLoginAt, deletedAt, activated,
invitePending }` to the client (`users-list.tsx:11-20`). The shape does not vary
by role because only `SUPER` can reach the page.

No pagination, no search, no filter — the header counts are derived from the
full array (R88). At current data volumes this is fine; as an API it is not.

### User detail — `src/app/super/users/[id]/edit/page.tsx:20-44`

Returns `{ id, name, email, role, graduationYear, deletedAt, passwordHash,
lastLoginAt }`, then a **conditional** second query for a live invite, executed
only when the target is unactivated and not deleted (`:37-43`). `notFound()` on
a missing id (`:33`).

Selects `passwordHash` and `lastLoginAt` purely to compute `activated`; `email`
is rendered but not editable (R48).

### Pending-invite state

There is no query function for either read — both pages query Prisma inline.
There is no way to read an invite's `expiresAt`, its `createdAt`, or who issued
it from any screen (R75). v2 needs a real query layer for both; §7.

### Credential reads

`verifyCredentials` (`src/lib/auth/credentials.ts:22`) is the only read of
`passwordHash` for comparison, and it selects the whole `User` row to do it.
`loadScopes` (`src/lib/auth/scopes.ts:11-19`) is four parallel queries per
sign-in and per token refresh.

---

## 6. Write surface

### `sendInvitesAction(userIds[])` — `src/lib/invite-actions.ts:41-51`

- **In:** array of user ids.
- **Gate:** `isSuper`, throws `ForbiddenError` (`:43`).
- **Validates:** 1–5000 positive integers (R17); invalid → `"No valid recipients."`.
- **Writes:** re-queries for eligibility (R14), then one `InviteToken` per survivor (R16, R18).
- **Notifies:** one invite email per token, failures swallowed (R25).
- **Returns:** `{ ok: true, sent, failed }`. A caller cannot tell "ineligible" from "not attempted" — both are absent from both counters.
- **Non-atomic:** no transaction, sequential loop, per-user try/catch (R18). A 5000-id batch is 5000 inserts and 5000 awaited SMTP round trips inside one request.

### `sendAllPendingInvitesAction()` — `src/lib/invite-actions.ts:53-75`

Same gate and same issuer. Selects its own recipient set — unactivated, not
deleted, no live unused invite (R20) — and short-circuits at zero (`:67`).
Unbounded: the recipient set is the whole table.

### `createInvite(userId, invitedById)` — `src/lib/invites.ts:19-42`

- **In:** a target user id and an issuer id, both trusted (R21).
- **Gate:** **none.**
- **Writes:** one `InviteToken` with a plaintext 32-char token and a 72h expiry (R13, R22, R23). Never revokes prior invites (R19). Never checks the target's state.
- **Notifies:** one email, failure swallowed (R25).
- **Returns:** **`{ token, expiresAt }` — the raw credential.**

### `acceptInvite(token, password)` — `src/lib/invites.ts:48-70`

- **In:** a token and a new password.
- **Gate:** **none** (R32); possession is the authorization.
- **Validates:** password ≥ 8 (R26); token unknown/used/expired (R27).
- **Writes:** `User.passwordHash` at cost 12 and `InviteToken.usedAt`, in one transaction (R29, R30). Does **not** check activation state (R31). Revokes nothing (R33).
- **Returns:** `{ ok: true, userId }` or `{ ok: false, reason }`.
- **Unreachable in v1:** no caller, no route (R34).

### `createUserAction(input)` — `src/lib/user-actions.ts:60-101`

- **In:** `{ name, email, role, graduationYear? }`.
- **Gate:** `isSuper`, explicit (R35).
- **Validates:** R36–R38, plus the alumni rule (R3).
- **Writes:** one `User` with the shared temp password hashed at cost 10 (R41), plus a `StudentProfile` for students only (R45).
- **Logs:** the plaintext temp password with the email and role (R42).
- **Returns:** `{ ok: true, userId }` or a field-error object.
- **Non-atomic:** read-then-write on email uniqueness with no transaction (R39).

### `updateUserAction(userId, name, role, graduationYear)` — `src/lib/user-actions.ts:103-130`

- **Gate:** `isSuper`, explicit (R47).
- **Writes:** exactly three columns (R53). No existence check (R52), no self-guard (R50), no last-SUPER guard (R51), no scope cascade (R53), no session invalidation (R54).
- **Returns:** `{ ok: true }`.

### `deactivateUserAction(userId)` / `reactivateUserAction(userId)` — `src/lib/user-actions.ts:132-154`

- **Gate:** `isSuper` on both.
- **Writes:** `deletedAt` set / cleared, nothing else (R56, R59).
- **Returns:** `void` + `redirect` / `{ ok: true }` — the asymmetry that hides the self-deactivation no-op (R58).

### `requestPasswordReset(email)` — `src/lib/auth/password-reset.ts:12-41`

- **Gate:** none, by design.
- **Writes:** one `PasswordResetToken` holding a SHA-256 digest, 1h TTL (R71–R73). Never invalidates prior tokens (R76).
- **Notifies:** one email; failure swallowed to preserve the constant response (R68).
- **Returns:** `void` on every path (R67).

### `resetPassword(rawToken, newPassword)` — `src/lib/auth/password-reset.ts:43-70`

- **Gate:** possession of an unused, unexpired token.
- **Validates:** password ≥ 8; ordered failures signalled by thrown `Error` messages (R64, R77).
- **Writes:** new hash at cost 10 plus `usedAt`, in one transaction. **Revokes nothing else** (R79).
- **Returns:** `void`; the page maps a throw to a query-string redirect that re-emits the raw token (R78, R80).

---

## 7. Proposed API

The migration design records this domain's API status as **none**
(`docs/superpowers/specs/2026-08-21-full-migration-design.md:124`), and that is
accurate for user and invite management. It is worth being precise about what
Phase 0 *did* ship, because the boundary is not where the file names suggest.

**Shipped in v2 and correct:**

- `POST /api/v1/auth/login` — `apps/backend/src/routes/auth.ts:25-49`. Ports `verifyCredentials` unchanged (bcrypt compare, `deletedAt` refusal, null-hash refusal) and adds a 20-per-15-minute rate limiter v1 lacks (`:19`).
- `POST /api/v1/auth/refresh` — `auth.ts:52-65`. Rotation re-derives scopes from the database via `issueSession` (R12), so mobile scope propagation is already bounded at 15 minutes.
- `POST /api/v1/auth/logout` — `auth.ts:75-86`. Revokes one refresh token; deliberately rate-limited beyond v1.
- `GET /api/v1/me` — `apps/backend/src/routes/me.ts:9-31`. Returns the user row plus the **token's** scopes, with a comment stating that is intentional.

**The boundary:** v2 has ported *authentication* — proving who you are with a
password you already have. It has ported **none** of *credential lifecycle*
(issuing an invite, accepting one, requesting or completing a reset) and **none**
of *user administration* (list, create, update role, deactivate). Every rule in
§3 outside R12 and R64–R66's login half is unported.

One live inconsistency in the shipped code: `apps/backend/src/routes/me.ts:12-15`
does not filter `deletedAt`, while `packages/shared/src/auth.ts:53` documents
`user` as "Null when the row was deleted inside the access token's 15-minute
window". A **soft**-deleted user still gets a full record from `/me`; only a
hard delete (which never happens, R62) would produce the documented null. Either
filter `deletedAt` in the query or fix the comment — see §10 D6.

| Method | Path | Status | Auth | Request | Response |
|---|---|---|---|---|---|
| GET | `/api/v1/users` | **new** | SUPER | `?q`, `?role`, `?status`, `?cursor`, `?limit` | `{ data: { users: [...], nextCursor } }` — paginated, unlike R84 |
| GET | `/api/v1/users/:id` | **new** | SUPER | — | `{ data: UserDetail }` incl. `activated`, `invite` state |
| POST | `/api/v1/users` | **new** | SUPER | `{ name, email, role, graduationYear? }` | `{ data: { userId } }`. **Must not set a password** — §10 D1 |
| PATCH | `/api/v1/users/:id` | **new** | SUPER | `{ name?, role?, graduationYear? }` | `{ data: UserDetail }`. Must reject self-role-change and last-SUPER demotion — §10 D7 |
| POST | `/api/v1/users/:id/deactivate` | **new** | SUPER, target ≠ caller | — | `{ data: { deletedAt } }`. Must revoke refresh tokens — §10 D6 |
| POST | `/api/v1/users/:id/reactivate` | **new** | SUPER | — | `{ data: { deletedAt: null } }` |
| POST | `/api/v1/users/invites` | **new** | SUPER | `{ userIds: number[] }` or `{ all: true }` | `{ data: { sent, skipped, failed } }` — three counters, not two (R16) |
| GET | `/api/v1/users/:id/invite` | **new** | SUPER | — | `{ data: { issuedAt, expiresAt, usedAt, invitedByName } \| null }` — **never the token** (R75) |
| POST | `/api/v1/invites/accept` | **new** | **anonymous** | `{ token, password }` | `{ data: { ok: true } }`; one opaque error code — §10 D5 |
| POST | `/api/v1/auth/forgot-password` | **new** | **anonymous** | `{ email }` | `{ data: { ok: true } }` always (R67) |
| POST | `/api/v1/auth/reset-password` | **new** | **anonymous** | `{ token, password }` | `{ data: { ok: true } }`; one opaque error code — §10 D5 |
| POST | `/api/v1/auth/login` | **exists** — `apps/backend/src/routes/auth.ts:25-49` | anonymous | `{ email, password }` | `{ data: LoginResponse }` |
| POST | `/api/v1/auth/refresh` | **exists** — `auth.ts:52-65` | anonymous + refresh token | `{ refreshToken }` | `{ data: Session }` |
| POST | `/api/v1/auth/logout` | **exists** — `auth.ts:75-86` | anonymous + refresh token | `{ refreshToken }` | `{ data: { ok: true } }` |
| GET | `/api/v1/me` | **partial** — `me.ts:9-31` | any authenticated | — | soft-delete not reflected; §10 D6 |

### Notes on the proposed endpoints

- **The three anonymous endpoints must sit behind the existing rate limiter.**
  `apps/backend/src/routes/auth.ts:19-20` already defines `authLimiter` and
  `refreshLimiter` with the correct `{ error: { code, message } }` shape. Invite
  acceptance, forgot-password and reset-password are all unauthenticated writes
  against a guessable-by-enumeration surface and belong on `authLimiter`. v1
  rate-limits none of them.

- **Do not port the "return the token" behaviour.** `createInvite` returns
  `{ token, expiresAt }` (R21). No v2 endpoint may return an invite token in a
  response body — email is the only delivery channel, and `GET /users/:id/invite`
  deliberately returns metadata only.

- **`POST /users` and the invite flow must become one operation, not two.**
  v1's split — create with a temp password, then separately fail to invite
  (R15) — is the root of D1 and D2. Creating a user should mint an invite in the
  same transaction and leave `passwordHash` null.

- **Bulk invite must not be a synchronous loop.** R18's 5000-id ceiling times
  5000 awaited SMTP round trips is not survivable inside an HTTP request.
  Accept the batch, return the counts, queue the sends.

- **`PATCH /users/:id` is the escalation surface.** Every guard in D3 and D7 is
  enforced here or nowhere: role-change cascade to `SeasonAdmin`/`GroupLeader`,
  refusal to change one's own role, refusal to demote the last SUPER, and
  refresh-token revocation on any role change.

---

## 8. Proposed shared contracts

New file `packages/shared/src/user.ts`. `packages/shared/src/auth.ts` already
exists and is well-formed; this domain **extends** it and must not redefine it.

### Reuse, do not redefine

- `userRoleSchema` — `packages/shared/src/auth.ts:3`. Already the five enum members exactly (R1). Every new schema here composes it.
- `authUserSchema` — `auth.ts:18-23`. The minimal identity shape; `userListItemSchema` extends it rather than restating `id`/`name`/`email`/`role`.
- `meScopesSchema` — `auth.ts:37-44`. The claim shape this domain *derives* (R7–R10). It is the contract R53 breaks; do not change its fields, change what populates them.
- `loginRequestSchema`, `refreshRequestSchema`, `sessionSchema`, `loginResponseSchema`, `meResponseSchema` — shipped and in use by `apps/backend/src/routes/auth.ts` and `apps/mobile/src/lib/api-client.ts`. Untouched by this domain.

### Bare interfaces this domain must convert to Zod

Per the `CLAUDE.md` convention, `packages/shared` has no user-management
interfaces yet, so there is nothing to convert. What must **not** happen is v1's
pattern of a client-side schema (`user-form.tsx:30-58`) drifting from a
server-side one (`user-actions.ts:22-33`) — R55. One schema, both sides.

### New schemas

| Name | Fields |
|---|---|
| `userStatusSchema` | enum `active \| invited \| pending \| inactive` — the four badge states of R82, named so the client stops re-deriving them from `passwordHash` (R81, R83) |
| `userListItemSchema` | extends `authUserSchema` with `lastLoginAt` (nullable ISO), `deletedAt` (nullable ISO), `status` (`userStatusSchema`), `graduationYear` (nullable int) |
| `userListResponseSchema` | `users` (array), `nextCursor` (nullable string), `total` (int) — pagination R84 lacks |
| `userDetailSchema` | `userListItemSchema` plus `invite` (`inviteStateSchema`, nullable) |
| `createUserRequestSchema` | `name` (2–120), `email` (email), `role` (`userRoleSchema`), `graduationYear` (nullable int 1990–current). Must carry the alumni-only cross-field refinement of R2/R3, and the year bound must be evaluated per-call, not at module load (R37) |
| `updateUserRequestSchema` | `createUserRequestSchema` minus `email` (R48), all fields optional, same refinement |
| `inviteStateSchema` | `issuedAt` (ISO), `expiresAt` (ISO), `usedAt` (nullable ISO), `invitedByName` (nullable). **No `token` field, ever** (R23, R75) |
| `sendInvitesRequestSchema` | `userIds` (1–5000 positive ints) **or** `all: true` — one discriminated shape replacing v1's two actions |
| `sendInvitesResponseSchema` | `sent`, `skipped`, `failed` (ints) — R16's missing third counter |
| `acceptInviteRequestSchema` | `token` (string), `password` (`passwordSchema`) |
| `forgotPasswordRequestSchema` | `email` (email) |
| `resetPasswordRequestSchema` | `token` (string), `password` (`passwordSchema`) |
| `passwordSchema` | **The single definition of the password policy**, replacing R65's four copies. Minimum length is a D8 decision; it must also cap length at 72 bytes, because bcrypt silently truncates beyond that and a longer maximum is a false promise |

`packages/shared/src/navigation.ts:56` already routes `/users` for `SUPER` and
for no other role, which matches R35/R47 exactly. No navigation change needed.

Timestamps are strings on the wire, matching the convention noted in
`season.ts`.

---

## 9. Screens

| v1 page(s) | v2 route | Exists? | Roles | Notes |
|---|---|---|---|---|
| `/super/users` | `/users` | **placeholder** — `apps/mobile/app/(app)/users.tsx` renders an `EmptyState` | SUPER | Already in `navFor(SUPER).sidebar` (`navigation.ts:56`). Needs search and pagination that v1 does not have (R84) — a full-table render is not viable in a `FlatList` at scale. Four-state status badge (R82). |
| `/super/users/new` | `/users/new` | **no** | SUPER | Role picker includes SUPER (R49) — should carry a confirmation step, §10 D7. The temp-password notice (R43) must not port. |
| `/super/users/[id]/edit` | `/users/[id]` | **no** | SUPER | One detail route with the edit form, the invite panel and deactivate/reactivate. `email` read-only (R48). Must surface invite `expiresAt` (R75). |
| — (v1 has no such page) | `/accept-invite` | **no** | anonymous | **The route v1 never built** (R34). Must be outside `(app)`, alongside login. Deep link `jpcspace://accept-invite?token=…` plus an HTTPS universal link for email clients; §10 D1. |
| `/forgot-password` | `/forgot-password` | **no** | anonymous | Outside `(app)`. Constant response copy (R67). |
| `/reset-password` | `/reset-password` | **no** | anonymous | Outside `(app)`. Token arrives by deep link, held in component state — **never** re-emitted into a URL (R80). |
| `/super/users/import` | `/users/import` | **no** | SUPER | **Domain 16.** Listed only because it is the entry point users reach from `/users` (`src/app/super/users/page.tsx:59`). |

Every route in this table except `/users` is absent from
`apps/mobile/app/(app)/` today, and the three anonymous ones need a location
outside the authenticated group entirely — a structure the app does not have
yet beyond `login`.

---

## 10. Open questions and divergences

### D1 — the invite flow has no acceptance route, and has never worked

R34. `createInvite` builds a link to `${AUTH_URL}/accept-invite?token=…`
(`src/lib/invites.ts:33`), the email renders it as the primary call to action
(`src/lib/email.ts:117`), and `src/app/accept-invite` **does not exist**. A
repository-wide grep for `acceptInvite` finds the definition
(`src/lib/invites.ts:48`) and no caller. Every invite this system has ever sent
has landed on a 404.

This reframes the whole domain. `sendInvitesAction`, the two invite buttons, the
"Invited" badge, the pending-invite queries, and the 72-hour TTL are all
plumbing for a flow whose last step was never built — which is presumably why
`createUserAction` assigns a temp password instead (R41), and why the form
apologises for it in the UI (`user-form.tsx:186`).

**Recommendation:** build acceptance first, then delete the temp password.
`acceptInvite`'s logic is sound apart from R31 and R32 — the transaction, the
single-use stamp, the failure ordering and the cost-12 hash are all correct. The
missing pieces are the route, a caller that binds it to a request, and the two
guards. **Do not port `ChangeMe123!` into v2 under any circumstance** (D2).

### D2 — every user created in the UI shares one password, and it is in the logs

R41, R42, R43. `createUserAction:79` and `createStudentAction:59` both hash the
literal `ChangeMe123!` at cost 10 and print it to stdout with the account's email
and role. `verifyCredentials` accepts it (R44). So the credential for every
UI-created account in the install is a single constant that appears in the
server logs, in the browser of anyone who opened `/super/users/new` (R43), and
in this file's git history.

It also breaks the invite flow structurally: because the hash is non-null, the
account fails the `passwordHash: null` filter (R14) and can never be invited
(R15). The two features are mutually exclusive, and only the importer
(`student-import.ts:260`) produces an invitable user.

**Recommendation, and it must be decided before any code:** v2's
`POST /api/v1/users` creates the row with `passwordHash: null` and mints an
invite in the same transaction. There is no temp-password path and no
plaintext-credential logging. **Because the database is shared with running v1,
also decide what happens to existing rows whose hash is the shared literal** —
they remain loginable by anyone who knows it, and v2 cannot fix that by writing
code. The realistic answer is a one-off operational step at cutover (null the
hash and invite), not a migration.

### D3 — a role change is not a revocation (the load-bearing finding)

R9, R53, R54. `isAdminOfSeason` (`src/lib/rbac.ts:28-30`) and `isLeaderOfGroup`
(`:32-34`) test the claim arrays and **never test `role`**. `loadScopes`
(`src/lib/auth/scopes.ts:12-13`) populates those arrays from `SeasonAdmin` and
`GroupLeader` with no role filter. `updateUserAction` writes three columns and
touches neither table (`src/lib/user-actions.ts:120-127`).

Therefore: demote a season `ADMIN` to `STUDENT`, and on their next sign-in
`loadScopes` still returns their `seasonAdminIds`, `isAdminOfSeason` still
returns true, and every season-scoped write in the system — including domain 4's
open/close check-in and domain 2's restatus and soft-delete — still admits them.
Their `role` string is now `STUDENT`, so `requireRole(["ADMIN"])` page gates
refuse them, which means **in v1 the demotion appears to work** — the pages stop
rendering. It works for exactly the reason the Seasons author identified: the
control is on a page they can no longer load. An API removes that accident.

`v2` has already ported the predicates verbatim (`apps/backend/src/lib/rbac.ts:19-25`),
so the defect is present in merged v2 code today; it is currently unreachable
only because no endpoint changes a role.

**Recommendation — fix it in the write, not in the predicate:** on any role
change away from `ADMIN`, delete that user's `SeasonAdmin` rows; away from
`LEADER`, delete their `GroupLeader` rows; do it in the same transaction as the
`User` update, and revoke their `RefreshToken` rows so the claims cannot outlive
the change (R12 bounds it at 15 minutes otherwise; R11 makes the web unbounded).

Adding a role check inside `isAdminOfSeason` is the tempting one-line fix and it
is worse: it would silently strip authority from anyone whose scope rows and
role have already diverged in the live database, with no record of who was
affected. Fix the write path, then audit the existing rows separately.

**Decide before code:** whether removing the last `SeasonAdmin` from a season is
permitted at all, since nothing else grants season authority.

### D4 — `createInvite` and `acceptInvite` are unauthenticated Server Actions

R21, R31, R32. `src/lib/invites.ts:1` is `"use server"`. Both exports are
therefore action endpoints, and neither reads a session:

- `createInvite(userId, invitedById)` trusts the issuer id it is handed, never validates the target, and **returns the raw token** (`:41`).
- `acceptInvite(token, password)` sets `passwordHash` for `invite.userId` with no check that the account is unactivated (R31) and no check on the caller (R32).

Composed: mint a token for user 1, read it from the return value, set their
password. No authentication, no email access, no password knowledge. If user 1
is `SUPER`, that is the whole system.

**On exploitability, precisely:** Next.js requires the action's id — a
build-time hash it does not publish to the client unless a client component
imports the function. `invites.ts` is imported only by the server-side
`invite-actions.ts`, so no id is currently emitted. The protection is the
secrecy of a hash, not a check. It ends the moment someone imports
`createInvite` into a `"use client"` file, or — the case that matters — the
moment v2 gives this domain an HTTP surface. **Record it as a finding against v1
per the read-only rule; do not touch `jpc-space`.**

**Recommendation for v2:**
1. `createInvite` becomes internal and takes the issuer from the authenticated request, never from a parameter. It never returns the token to a caller; the token goes to the mailer and nowhere else.
2. `acceptInvite` gains an explicit precondition: refuse when the target's `passwordHash` is non-null or `deletedAt` is set. An invite is an activation, not a reset — a reset has its own flow with its own shorter TTL.
3. Both live behind rate-limited routes (§7), not behind an export boundary.
4. Add an integration test that asserts an invite for an already-activated account is refused. That test is the durable statement of the rule.

### D5 — invite tokens are stored in plaintext; reset tokens are not

R23 versus R72. Two credential tables in the same schema, written 90 lines
apart, with opposite storage policies: `PasswordResetToken.token` holds a
SHA-256 digest (`src/lib/auth/password-reset.ts:20`),
`InviteToken.token` holds the raw value (`src/lib/invites.ts:23`,
`prisma/schema.prisma:168`). The invite is the *higher*-value credential — 72
hours instead of 1 (R22, R73), and it can activate an account that has never
been used.

Compounding it: invites are never revoked on reissue (R19), resets are never
revoked on reissue (R76), neither table is ever swept (only `prisma/seed.ts`
deletes them), and `PasswordResetToken` has no index on `expiresAt` for a sweep
to use.

The error codes are a matching pair of oracles: `invalid`/`used`/`expired` for
invites (R27), and three distinct thrown messages rendered into the page for
resets (R77, R78).

**Recommendation:**
1. Hash invite tokens at rest, exactly as reset tokens already are. Lookup by digest. This is a v2-side change only — the shared database still holds v1's plaintext rows, so v2 must tolerate both during the transition, or the transition must begin by expiring all outstanding invites.
2. Reissuing a credential invalidates the holder's prior unused ones of the same kind. One live invite and one live reset per user.
3. Collapse all three failure modes into one client-facing code per flow, keeping the distinction in server logs — the same call domain 4 makes for the check-in codes.
4. Sweep used and expired rows on a schedule, and add the missing `expiresAt` index. Both are shared-database changes; treat the index as a cutover item.

### D6 — deactivation and password reset revoke nothing

R61 and R79. Deactivating a user writes `deletedAt` and stops. Resetting or
changing a password writes a hash and stops. In both cases the user's
`RefreshToken` rows stay valid for up to 30 days and their Auth.js web session
stays valid until the JWT expires — `src/lib/auth.ts:85-93` reads the token
only and never re-checks the database.

The partial mitigations that exist are accidental: `issueSession` refuses a
rotation for a soft-deleted user (`src/lib/auth/tokens.ts:87`), which caps the
mobile exposure at one access-token lifetime; nothing caps the web.

There is a matching inconsistency already in v2: `apps/backend/src/routes/me.ts:12-15`
does not filter `deletedAt`, while `packages/shared/src/auth.ts:53` says the
`user` field is null for a deleted row.

**Recommendation:** every credential-changing operation — deactivate, role
change (D3), password reset, password change, invite acceptance — revokes the
user's `RefreshToken` rows in the same transaction. `revokeRefreshToken`
(`apps/backend/src/lib/auth/tokens.ts`) already exists and takes a raw token; a
`revokeAllForUser(userId)` sibling is the missing piece. Separately, either
filter `deletedAt` in `me.ts` or correct the shared schema's comment — right now
one of the two is lying.

### D7 — `SUPER` is self-service, and the last one can lock everyone out

R49, R50, R51. The `isSuper` gate on user writes is explicit and correct — it is
the one properly-enforced authorization in this domain and should be preserved
verbatim. What is missing sits above it. A `SUPER` may:

- promote anyone, including a brand-new account, to `SUPER`, with no graduation year, no second approval, and no audit row;
- **change their own role**, because only `deactivateUserAction` has a self-guard (`:135`) and `updateUserAction` has none;
- demote or deactivate the last remaining `SUPER`, after which no one can create another, because user management is `SUPER`-only (`canManageUsers`, `src/lib/rbac.ts:57-59`) and there is no recovery path in the product.

The `User` table has no `createdById`/`updatedById` columns (`prisma/schema.prisma:103-164`),
so there is no record of who granted a role.

**Recommendation:**
1. `PATCH /users/:id` refuses when `id === caller.userId` and the request changes `role`. Name changes on yourself stay allowed.
2. Refuse a demotion or deactivation that would leave zero non-deleted `SUPER` users. Count inside the transaction.
3. Require an explicit confirmation flag in the request body to grant `SUPER`, so it cannot be a mis-tapped picker item.
4. Log every role change to the notification or audit surface. The `User` table cannot carry audit columns without a migration, so this needs a decision on where it lands — flagging it as the one item here that may have to wait for cutover.

### D8 — the password policy is eight characters, stated four times, at three costs

R64, R65, R66. The entire policy is `length >= 8`, restated at
`src/lib/invites.ts:49`, `src/lib/auth/password-reset.ts:47`,
`src/lib/settings-actions.ts:17` and `src/app/reset-password/page.tsx:57`, with
no shared constant. Hashes are written at cost 12 on invite acceptance and cost
10 everywhere else, so a user's cost factor records which path last set their
password.

`CLAUDE.md` fixes the algorithm — bcryptjs, non-negotiable, because existing
hashes are bcrypt — but not the cost.

**Recommendation:**
- **Cost 12 everywhere.** It is already in production for any account that accepted an invite, bcrypt verifies a hash at whatever cost the hash records, so raising the write cost is backward-compatible with every existing row and needs no migration. Opportunistically re-hash at cost 12 on successful login when the stored hash records a lower one.
- **One `passwordSchema` in `packages/shared`** (§8), consumed by both the API and the screens, replacing the four copies.
- **Cap length at 72 bytes.** bcrypt silently truncates beyond that; accepting a 200-character passphrase and honouring the first 72 is a promise the system does not keep.
- The minimum itself is a product decision. Eight with no complexity rule is defensible against a rate limiter and indefensible without one — so if the minimum stays at eight, the rate limiting in D5 is not optional.

### D9 — `User.name` is non-nullable in the schema and nullable in every consumer

`prisma/schema.prisma:106` declares `name String`. `users-list.tsx:16` types it
`string | null`, `:56` renders `row.name ?? row.email`, `:33` guards
`name?.trim()`, and the edit page uses `target.name ?? target.email` (`:50`).
The v2 contract already commits to non-null (`packages/shared/src/auth.ts:20`).

Either the column is genuinely non-null and the fallbacks are dead code, or a
historical import wrote empty strings and the fallbacks are load-bearing for
rows the type system claims cannot exist.

**Recommendation:** check the live data before writing the v2 read schema. If
empty-string names exist, `userListItemSchema` needs a display-name derivation
server-side rather than nullable-name handling on every screen. This is a
five-minute question with a large blast radius across every list in the product.

### D10 — the invite email leaks structure and injects HTML

R90, R91. `src/lib/email.ts:112` interpolates the inviter's `name` straight into
the message HTML, so a display name containing markup renders as markup in the
recipient's mail client. Separately, the email offers only a link (R91) and
never states the actual expiry (R75), showing "will expire soon" instead
(`:120`).

**Recommendation:** escape every interpolated value in the mail templates; state
the real `expiresAt`; and since v2's client is a mobile app, prefer a short
numeric code the user types over a deep link they tap — a code cannot be
forwarded out of an inbox as silently as a URL, and it removes R24's exposure of
the credential in browser history and `Referer` headers. If the link stays, it
must be a universal link with the token in the fragment, not the query string.
