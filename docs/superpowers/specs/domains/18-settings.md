# Domain 18 — Settings

> Status: draft · Phase: 5 · v1 API status: none

This is the smallest domain in the migration and the one with the highest
structural leverage. `/settings` is one of only two destinations reachable by
**all six** navigation roles (`packages/shared/src/navigation.ts:58,79,97,117,133,151`),
so whatever pattern the settings screen establishes for role branching is the
pattern every other screen will be read against.

**The headline finding is a negative one, and it is good news.** The brief asked
whether one shared settings action can write an organisation-wide value when
called by a student. It cannot, for two independent reasons:

1. **There are no organisation-wide settings in v1.** There is no `Setting`,
   `AppSetting`, or `Config` model anywhere in `prisma/schema.prisma`
   (`:23-93` enums, `:103-770` models — the complete list is in section 2).
   Every tunable is either a per-user row, a per-season column, or a
   `process.env` read with no UI at all.
2. **All three settings actions derive their target from the session and never
   accept a subject id** (`settings-actions.ts:30`, `:69`, `:84`). There is no
   parameter a caller could tamper with. The six role pages share one component
   and three actions, none of the actions checks a role, and none of them needs
   to.

So the classic implicit-gate failure — six role-specific pages calling one
unchecked action — is present in *form* here (R1–R3) and harmless in *effect*
(R18, R25, R33). That is worth recording precisely, because a reviewer
skimming for the pattern will find it and must not "fix" it into something
that takes a `userId`.

**What this domain does *not* own.** The five notification toggles rendered on
this page are fully specified by `10-notifications.md` R54–R61 and are
cross-referenced, not restated (section 3.5). Password policy, bcrypt cost, and
refresh-token revocation are `11-invites-users.md` R64–R66 and R79 — this
domain owns the *authenticated change-your-own-password* path and defers the
policy. Student profile fields (`StudentProfile`, avatar) are domain 6; the
season absence tunables are `02-seasons.md`. Section 3.6 enumerates every
setting in the product regardless of which domain owns it, because that table
is an input to other domains' behaviour.

---

## 1. v1 source

All paths relative to `D:\Projects\JPC\jpc-space`.

| File | Holds |
|---|---|
| `src/lib/settings-actions.ts` | The entire write surface. 102 lines: two Zod schemas, three server actions, one `zodErrors` helper. |
| `src/app/(settings)/settings-page.tsx` | The only read. 46 lines: `SettingsPageBody`, one `findUnique`, and the `DEFAULT_PREFS` literal. |
| `src/components/settings/settings-form.tsx` | The whole UI. Three `<Section>` cards — Profile, Change password, Notifications — and the optimistic toggle. |
| `src/app/admin/settings/page.tsx` | 6-line re-export of `SettingsPageBody`. |
| `src/app/alumni/settings/page.tsx` | Byte-identical to the above (R1). |
| `src/app/leader/settings/page.tsx` | Byte-identical. |
| `src/app/mentor/settings/page.tsx` | Byte-identical. |
| `src/app/student/settings/page.tsx` | Byte-identical. |
| `src/app/super/settings/page.tsx` | Byte-identical. |

Files that decide **who can reach the page** — none of which is in this domain's
lib, and all of which are the real authorization (section 4):

| File | Holds |
|---|---|
| `src/components/layout/role-layout.tsx:17-33` | The only gate on any `/settings` URL: `allowedRoles` on the route prefix, plus the alumnus redirect at `:27-29`. |
| `src/app/{super,admin,leader,mentor,student,alumni}/layout.tsx:7` | The six `allowedRoles` arrays. |
| `src/lib/navigation.ts:47,68,86,106,122,140` | The six `Settings` sidebar entries — one per role nav. `:129` is the mentor `Profile` tab (R11). `:159-162` is `navFor`. |
| `src/components/layout/shell-frame.tsx:44,69-77` | Sidebar, `hidden … md:flex` — desktop only. `:109-118` is the mobile tab bar, `md:hidden`, `slice(0, 5)`. |
| `src/components/layout/more-menu.tsx:68-72` | `extraItemsFor` — sidebar minus tabs. The mobile route to Settings for four of six roles. `:130-136` is the theme control (section 3.6, item 10). |
| `src/components/layout/user-menu.tsx:23-30,83-88` | `PROFILE_HREF` — the avatar menu's "Profile settings" link, which points a STUDENT somewhere else (R10). |
| `src/components/layout/top-bar.tsx:93-99` | Renders `UserMenu` unconditionally, at every width. |

Settings-adjacent surfaces cited but owned elsewhere:

| File | Holds | Owner |
|---|---|---|
| `src/lib/notifications.ts:17-24,26-33` | `PREF_FIELD`, `userAllowsType` — the consumers of the preference row | domain 10 |
| `src/lib/student-actions.ts:23-33,103-145` | The **second** writer of `User.name`, and the only writer of `User.email` (R20, R38). `canEditStudent` at `:108`, the `User` write at `:117-120`, the self-edit carve-out at `:114,130-135` | domain 6 |
| `src/lib/season-actions.ts:35-36,85-98,149-150` | The season-scoped tunables and the create/update asymmetry (R36) | domain 2 |
| `src/components/providers/theme-provider.tsx:16,22-26,33-37` | The one appearance setting in v1, device-local | this domain, section 10 |

---

## 2. Data model

This domain touches exactly two models and writes three columns.

### `User` — `prisma/schema.prisma:103-115`

| Field | Type | This domain |
|---|---|---|
| `name` | `String` (non-null) | **Written** by `updateOwnProfileAction` (`settings-actions.ts:87-90`). Also written by domain 6 (`student-actions.ts:117-120`) — two writers, two validators (R38). |
| `email` | `String @unique` | **Read only** here; rendered in a disabled input (`settings-form.tsx:142-144`). Writable from `/student/profile` (R20). |
| `passwordHash` | `String?` | **Read and written** by `changePasswordAction` (`settings-actions.ts:37`, `:53`). Nullable in schema, and the null case is handled (R24) — one of the few places in v1 where it is. |
| `avatarPath` | `String?` | Not touched by settings at all. Domain 6 owns it. Settings has no avatar control. |
| `role`, `graduationYear` | — | Never read by this domain. Not even to branch the UI (R3). |

### `NotificationPreference` — `prisma/schema.prisma:609-623`

One row per user, `userId @unique`, `onDelete: Cascade`. Six boolean columns,
all `@default(true)`: `assignmentCreated`, `submissionReviewed`,
`sessionRescheduled`, `lowAttendanceFlag`, `mentorFollowup`, `quizGraded`.

Fully described in `10-notifications.md` section 2 and R54–R61. The one fact
this domain must carry forward: **`quizGraded` is the seventh setting in the
product and there is no surface anywhere in v1 that can change it** — the form
renders five toggles (`settings-form.tsx:27-53`), the action's input interface
declares five fields (`settings-actions.ts:58-64`), and the spread at `:72-73`
therefore never names the column. It is read by `userAllowsType`
(`notifications.ts:23,31-32`), so it is live configuration with no writer.

### Models this domain does **not** touch, and the absence that matters

There is **no global settings model.** `prisma/schema.prisma` declares 33
models (`:103` `User` through `:755` `JpcEvent`); none of them is a key/value
store, a singleton config row, or an organisation record. The nearest thing to
organisation-level configuration is `Season.absenceBudgetMinutes` /
`absenceWeightMinutes` (`:254-255`), which are per-season columns edited from
the season form, not from settings.

`RefreshToken` (`:184-196`) is named here only because section 10 proposes
log-out-everywhere against it; v1's settings code never reads or writes it,
which is exactly the defect (R29).

---

## 3. Business rules

### 3.1 Reachability and role branching

- **R1.** v1 has **six** settings page files, one per role area, and after
  CRLF/LF normalisation all six are byte-identical 6-line files — `src/app/admin/settings/page.tsx:1-6`, `alumni:1-6`, `leader:1-6`, `mentor:1-6`, `student:1-6`, `super:1-6`. (`admin` and `super` are stored LF, the other four CRLF; that is the *only* difference.)
- **R2.** Each is `export default async function Page() { return <SettingsPageBody />; }` — no props, no role argument, no gate — `src/app/student/settings/page.tsx:4-6`.
- **R3.** `SettingsPageBody` takes no parameters and never reads `user.role` or `user.graduationYear`; it reads only `user.userId` — `src/app/(settings)/settings-page.tsx:15-24`. **Nothing on the settings screen branches by role in v1.** This is the complete answer to section 9's branching map.
- **R4.** *(implicit)* The only authorization on any `/settings` URL is the parent layout's `allowedRoles`, applied to the whole route prefix — `src/components/layout/role-layout.tsx:30-32`, invoked from `src/app/{role}/layout.tsx:7`. The page itself calls no `requireRole`, unlike its sibling `/{role}/more` pages which do (`src/app/student/more/page.tsx:9`).
- **R5.** *(implicit)* Because `allowedRoles` is a superset per area, **SUPER can load four of the six settings URLs** — `/super`, `/admin` (`["SUPER","ADMIN"]`), `/leader` (`["SUPER","ADMIN","LEADER"]`), `/mentor` (`["SUPER","MENTOR"]`) — and an ADMIN can load two (`/admin`, `/leader`). All render the same component against their own row, so nothing leaks; the effect is duplicate URLs, not a privilege boundary.
- **R6.** *(implicit)* An alumnus (role `STUDENT` with `graduationYear != null`) is redirected out of the whole `/student` area before the page renders, so `/student/settings` is unreachable for them and `/alumni/settings` is their only one — `role-layout.tsx:27-29`, `src/lib/rbac.ts:20` (`isAlumnus`).
- **R7.** *(implicit)* Settings appears in every role's `sidebar` array and in **no** role's `tabs` array — `navigation.ts:47,68,86,106,122,140`. The sidebar is `hidden … md:flex` (`shell-frame.tsx:44`), so on a phone the sidebar entry does not exist.
- **R8.** On mobile, four of the six roles reach Settings through `/{role}/more`, whose menu is `sidebar` minus `tabs` — `more-menu.tsx:68-72`, `:106-128`.
- **R9.** *(implicit)* **MENTOR has no `/mentor/more` page and no `more` tab** — `src/app/mentor/` contains `dashboard, notes, notifications, reports, settings, students` only, and `navigation.ts:125-130` gives mentors tabs `students, reports, dashboard, notes, profile`. A mentor's only phone-width route to Settings is the avatar menu in the top bar.
- **R10.** The avatar menu's "Profile settings" item is keyed by role and sends **STUDENT to `/student/profile`, not `/student/settings`** — `user-menu.tsx:23-30,83-88`. Every other role goes to their settings page. `UserMenu` renders at every width (`top-bar.tsx:93-99`), so this is the mobile entry point for MENTOR (R9) and the reason a student's password-change screen has no top-bar route at all.
- **R11.** `navigation.ts:129` gives mentors a `/mentor/profile` tab, and **`src/app/mentor/profile/` does not exist**. The fifth mentor tab is a 404. Cross-domain — flagged in section 10, item 8.

### 3.2 Read

- **R12.** The page issues exactly one query: `db.user.findUnique({ where: { id: user.userId } })` selecting `name`, `email`, and the whole `notificationPreference` relation — `settings-page.tsx:17-24`.
- **R13.** `name` and `email` are non-null in the schema but the page coerces both with `?? ""` because `findUnique` may return null — `settings-page.tsx:40-41`. The null-user case renders an empty form rather than redirecting.
- **R14.** When no `NotificationPreference` row exists the page substitutes an all-true five-field literal — `settings-page.tsx:7-13,26-34`. See `10-notifications.md` R58; the value agrees with the schema defaults, the *field set* does not (R15).
- **R15.** The all-true default for this setting is stated in **three** places with **two different field sets**: `prisma/schema.prisma:614-619` (six columns), `settings-page.tsx:7-13` (five keys), and `notifications.ts:30` (`if (!prefs) return true`, type-agnostic, effectively six). No shared constant.
- **R16.** The read is gated by `getCurrentUserOrRedirect` and nothing else — `settings-page.tsx:16`, `src/lib/auth/session.ts:18-22`. Every authenticated role sees the identical query for their own row.
- **R17.** **No write is performed during the GET.** `SettingsPageBody` contains one `findUnique` and no mutation — `settings-page.tsx:15-46`. (Checked explicitly: this domain is clean of the read-time-write pattern found elsewhere in the migration.)

### 3.3 Profile — `User.name`

- **R18.** `updateOwnProfileAction` writes `User.name` for `user.userId`, taken from the session; the function's only parameter is the name string — `settings-actions.ts:83-90`.
- **R19.** Validation is `z.string().min(2).max(120)` — `settings-actions.ts:79-81`. Messages are the Zod defaults; unlike the password schema no custom messages are supplied, so the user sees "String must contain at least 2 character(s)".
- **R20.** The email field is rendered `disabled` with the caption "Change via the admin console." — `settings-form.tsx:142-144`. **This caption is false for students**: `updateStudentProfileAction` writes `User.email` from `/student/profile`, and a student passes `canEditStudent` for their own row — `student-actions.ts:108,117-120`. Cross-domain; section 10, D8.
- **R21.** The name is **not trimmed before writing** — `settings-actions.ts:88` writes `parsed.data.name` verbatim, so `"  Bo  "` is stored with its whitespace and passes `min(2)` on the padding alone. The client's dirty-check *does* trim (`settings-form.tsx:148`), so a whitespace-only edit disables the button but a padded real edit persists the padding.
- **R22.** *(implicit)* The save button is disabled when `name.trim() === initialName.trim()` — `settings-form.tsx:148`. This is the only "no-op guard" and it is client-side; the action re-writes the same value happily when called directly.
- **R23.** Success revalidates the entire layout — `settings-actions.ts:91` (`revalidatePath("/", "layout")`) — plus a client `router.refresh()` (`settings-form.tsx:101`). Two refreshes for one write.
- **R24.** *(implicit)* The rename does not touch the Auth.js token. `token.name` is set once at `authorize` (`src/lib/auth.ts:32`) and the `jwt` callback never re-reads it (`:71-84`). Nothing breaks only because every display of the name re-reads the database — `more-menu.tsx:80-84`, `top-bar` via `app-shell`. A v2 client that trusts a name claim in the JWT would show a stale name until the next login.

### 3.4 Password

- **R25.** `changePasswordAction(currentPassword, newPassword, confirm)` operates on `user.userId` from the session; there is no target parameter — `settings-actions.ts:25-30`.
- **R26.** Validation: current password non-empty, new password `min(8)`, confirm non-empty, and a `.refine` that new and confirm match with the error attached to `confirm` — `settings-actions.ts:14-23`. **8 characters is the entire policy** — see `11-invites-users.md` R64, which finds the same minimum restated in four unshared places.
- **R27.** An account with `passwordHash == null` is refused with "No password set on this account." rather than allowed to set one — `settings-actions.ts:39-41`. There is no other path in v1 for such a user to acquire a password from inside the app.
- **R28.** The current password is verified with `bcrypt.compare` and the new one hashed with **`bcrypt.hash(newPassword, 10)`** — `settings-actions.ts:42`, `:50`. This is the third of the three cost factors `11-invites-users.md` R66 catalogues (12 in `invites.ts:56`, 10 here and in `password-reset.ts:58`).
- **R29.** **Changing your password revokes nothing.** The action performs one `user.update` and returns — `settings-actions.ts:51-55`. No `RefreshToken` row is revoked, the Auth.js session cookie stays valid, and outstanding `PasswordResetToken` rows are not consumed. Identical to `11-invites-users.md` R79 for the reset path. Both halves of the standard "I think I'm compromised" remedy are therefore no-ops against an attacker who already holds a session.
- **R30.** Unlike the other two actions, the password action does **not** call `revalidatePath` — `settings-actions.ts:55`. Correct, since nothing rendered changes.
- **R31.** **There is no rate limit on the password action, or on any server action in v1** — no rate-limiting dependency, no `src/middleware.ts`. The current-password check at `settings-actions.ts:42` is an unthrottled online oracle for any attacker who already has a session cookie.
- **R32.** *(implicit)* On success the three fields are cleared client-side and a toast is shown; on failure `fieldErrors` are mapped onto the three inputs — `settings-form.tsx:111-120`. The submit button is disabled unless all three are non-empty (`:180`), which is the only client mirror of R26.

### 3.5 Notification preferences

Owned by `10-notifications.md` R54–R61. The three facts this domain depends on:

- **R33.** `updateNotificationPreferencesAction` upserts `NotificationPreference` for the session user and takes no target id — `settings-actions.ts:66-74`. Same shape as R18 and R25; same reason it is safe.
- **R34.** **It is the only action in this domain with no validation at all.** There is no `safeParse`; the argument is spread directly into both `update` and `create` — `settings-actions.ts:70-74`. Contrast `settings-actions.ts:32` and `:85`. A server action's arguments are client-supplied, so the Prisma call is the only thing rejecting a malformed value, and it rejects it as an unhandled 500 rather than a field error.
- **R35.** *(implicit)* The toggle is optimistic: local state flips first, the action runs in a transition, and the previous object is restored on failure — `settings-form.tsx:123-133`. The revert closes over the pre-update `prefs`, so two rapid toggles that both fail restore the wrong intermediate state.

### 3.6 The complete settings enumeration

Every configurable value in the product, in every scope, with where it is
**read**. "Reachable from" is the surface that can change it, which is not
always settings and is sometimes nowhere.

| # | Setting | Scope | Type / default | Validation | Who may change | Reachable from | Read at |
|---|---|---|---|---|---|---|---|
| 1 | `User.name` | user | `String`, no default (required at creation) | min 2, max 120; **not trimmed** (R19, R21) | self, any role | `/{role}/settings` **and** `/student/profile` (R38) | `more-menu.tsx:80-84`, every student/leader list, notification bodies |
| 2 | `User.email` | user | `String @unique`, no default | `z.string().email()` (`student-actions.ts:25`) | self **if STUDENT** (R20); SUPER/ADMIN for others | `/student/profile`, admin console — **not** settings | login (`auth.ts:26`), every notification email (`notifications.ts:47`) |
| 3 | `User.passwordHash` | user | `String?`, null for invited-but-not-accepted | min 8, confirm match (R26) | self only | `/{role}/settings`, `/reset-password` | `verifyCredentials` |
| 4 | `assignmentCreated` | user | `Boolean`, `true` | none (R34) | self, any role | `/{role}/settings` toggle | `notifications.ts:31-32`, `:72` |
| 5 | `submissionReviewed` | user | `Boolean`, `true` | none | self, any role | same | same |
| 6 | `sessionRescheduled` | user | `Boolean`, `true` | none | self, any role | same | same |
| 7 | `lowAttendanceFlag` | user | `Boolean`, `true` | none | self, any role | same — **help text is wrong**, says 3 consecutive absences, the rule is 2 (`10-notifications.md` R60) | same |
| 8 | `mentorFollowup` | user | `Boolean`, `true` | none | self, any role | same | same |
| 9 | `quizGraded` | user | `Boolean`, `true` | — | **nobody** | **nothing** (R-note in section 2) | `notifications.ts:23,31-32` — **live config with no writer** |
| 10 | Theme (light/dark/system) | **device** | `"system"` | union of three literals | self, any role | `/{role}/more` "Appearance" (`more-menu.tsx:130-136`) and the avatar menu (`user-menu.tsx:89-101`) — **not** the settings page | `theme-provider.tsx:22-37`, `localStorage["theme"]` |
| 11 | Sidebar collapsed | **device** | boolean | — | self | the sidebar chevron (`shell-frame.tsx:83-98`) | `sidebar-context.tsx` |
| 12 | `Season.absenceBudgetMinutes` | **season** | `Int`, `180` | `int().min(1)` | SUPER (season create/edit) | `/super/seasons/[code]/edit` | `engagement.ts:146,152,229,234-235`; `student/attendance/page.tsx:76` |
| 13 | `Season.absenceWeightMinutes` | **season** | `Int`, `90` | `int().min(1)` | SUPER | same | `engagement.ts:143,228`; `student/attendance/page.tsx:118,148` |
| — | *(global tier)* | — | — | — | — | **no UI exists** | `process.env` only: `STORAGE_DRIVER` (`storage/index.ts:24`), `INVITE_TOKEN_TTL_HOURS` (`invites.ts:14`), `MOBILE_APP_ORIGIN` (`api/response.ts:8`), `AUTH_URL` (`invites.ts:32`, `email.ts:142`), SMTP credentials (`email.ts:17-18` — credential fields, values never read here) |

Rules arising from the table:

- **R36.** `absenceBudgetMinutes` and `absenceWeightMinutes` are **written by `updateSeasonAction` (`season-actions.ts:149-150`) and silently discarded by `createSeasonAction`** (`:85-98` — the `data` object omits both) even though the shared schema defaults them (`:35-36`). A season therefore always starts at the Prisma defaults regardless of what the create form sent. Confirmed independently here; see `02-seasons.md`.
- **R37.** The value `180` is written down three times with no shared constant — `prisma/schema.prisma:254`, `season-form.tsx:90`, and `student/attendance/page.tsx:76` (`?? 180`). `90` is written twice — `schema.prisma:255`, `season-form.tsx:91`. The values currently agree; nothing enforces that they continue to.
- **R38.** `User.name` has **two writers with two different validators**: `settings-actions.ts:79-81` (min 2, max 120) and `student-actions.ts:24` (min 2, max 120, inside a ten-field schema that also writes `email`). The bounds happen to match today. The client form for the second one validates `min(2)` with no max (`student-form.tsx:22`).
- **R39.** No setting in v1 has an audit trail. `NotificationPreference` has `updatedAt` (`schema.prisma:622`) and `User` has `updatedAt` (`:114`); neither records *who* changed what, and `User` has no `updatedById` (the audit-column convention in v1's `CLAUDE.md` covers `Season`, `Assignment`, `Submission` only).

### 3.7 Zero-caller check

Checked explicitly, since sibling authors have repeatedly found dead actions:

- **R40.** All three exported actions have exactly one caller — `settings-form.tsx:97` (`updateOwnProfileAction`), `:110` (`changePasswordAction`), `:127` (`updateNotificationPreferencesAction`). `grep -rn "settings-actions" src/` returns two files: that one and a `type`-only import in `settings-page.tsx:5`.
- **R41.** `SettingsForm` has exactly one caller (`settings-page.tsx:39`), and `SettingsPageBody` has exactly six (the six pages). **Nothing in this domain is dead.** The dead thing is a *column*, not an action — `quizGraded` (section 2).

---

## 4. Authorization

| Operation | Roles | Row-scoped condition | v1 citation |
|---|---|---|---|
| Load `/{role}/settings` | whichever `allowedRoles` the route prefix declares — SUPER reaches four URLs, ADMIN two (R5) | none; the page ignores role entirely (R3) | `role-layout.tsx:30-32`; `src/app/{role}/layout.tsx:7` |
| Read own profile + preferences | any authenticated | `where: { id: session.userId }` — the id is never an input **(implicit)** | `settings-page.tsx:16-19` |
| Update own name | any authenticated | `where: { id: session.userId }` — never an input **(implicit)** | `settings-actions.ts:84,88-89` |
| Change own password | any authenticated **with a non-null `passwordHash`** (R27) | `where: { id: session.userId }` + `bcrypt.compare` against the stored hash | `settings-actions.ts:30,35-49,51-52` |
| Update own notification preferences | any authenticated | `where: { userId: session.userId }` — never an input **(implicit)** | `settings-actions.ts:69-71` |
| Change any *other* user's name, email, or password | — | **not reachable from this domain at all** | — |
| Change any organisation-wide value | — | **no such value exists** (section 2) | — |
| Change a season tunable | SUPER | `canCreateSeason` / season row | `season-actions.ts:63` — domain 2 |

**Where v1 enforces nothing and relies on the UI.** Three places, and only one
of them is a real gap:

1. **Route prefix vs. page (R4).** The settings page has no `requireRole`. This
   is harmless in v1 because the page is role-blind, and it disappears entirely
   in v2 where there is one route.
2. **The dirty-check (R22)** and the **submit-disabled rules** (`settings-form.tsx:148,180`)
   are client-only. Calling the action directly bypasses them. Consequence:
   redundant writes, not privilege escalation.
3. **The disabled email input (R20)** is the only genuinely misleading one: it
   presents `User.email` as unchangeable by the user while another page in the
   same app lets a student change it. That is a UI-enforced rule with no server
   counterpart — the exact pattern this migration exists to catch — but the
   control that *should* exist lives in domain 6, not here.

**In v2 these become real gates.** Every endpoint in section 7 must derive the
subject from the access token and must reject a body-supplied `userId` rather
than ignoring it, so that the v1 property (no target parameter exists) is
preserved by construction rather than by omission.

---

## 5. Read surface

### `SettingsPageBody` — `src/app/(settings)/settings-page.tsx:15-46`

One `findUnique` on `User` by session id (`:17-24`), selecting three things:

| Field | Shape | Notes |
|---|---|---|
| `name` | `string` | coerced `?? ""` at `:40` (R13) |
| `email` | `string` | coerced `?? ""` at `:41`; rendered disabled (R20) |
| `notificationPreference` | the whole relation row | selected as `true`, so **all six columns plus `id`, `userId`, `createdAt`, `updatedAt` are fetched**, and the mapping at `:26-34` then discards five of them — including `quizGraded`, which is read out of the database and thrown away one line later |

No ordering. No N+1 — it is a single query with one included relation.
**The shape does not differ by role in any way** (R3); this is the only page in
the migration where that is true.

The query over-fetches by one relation row's metadata and under-uses it by one
meaningful column. Both are trivial in isolation and both are worth fixing in
v2's shape, because the discarded column is the one nobody can set (section 2).

---

## 6. Write surface

Three actions, all in `src/lib/settings-actions.ts`, all `"use server"`, all
returning the same `ActionResult` union (`:10-12`).

### `updateOwnProfileAction(name)` — `:83-93`

- **Inputs:** one string. No target id.
- **Validation:** `profileSchema` — `name` min 2, max 120 (`:79-81`). Failure returns `zodErrors` field errors keyed by path (`:95-102`).
- **Writes:** one `user.update` setting `name` (`:87-90`). Not trimmed (R21).
- **Cascades:** none. **Notifies:** nothing.
- **Returns:** `{ ok: true }`. The updated row is **not** returned, so the client cannot reconcile — it calls `router.refresh()` instead (`settings-form.tsx:101`).
- **Atomicity:** single statement.

### `changePasswordAction(currentPassword, newPassword, confirm)` — `:25-56`

- **Inputs:** three strings, positional. No target id.
- **Validation:** `passwordSchema` (`:14-23`) — see R26.
- **Reads then writes:** `findUnique` for `passwordHash` (`:35-38`), null check (`:39-41`), `bcrypt.compare` (`:42`), `bcrypt.hash(_, 10)` (`:50`), `user.update` (`:51-54`).
- **Non-atomic by construction:** the read-verify-write is not in a transaction. Two concurrent changes both verify against the old hash and the last write wins. Low severity (both writers are the same person) but it is the pattern.
- **Cascades:** **none, and that is the defect** — R29. No refresh-token revocation, no session invalidation, no consumption of outstanding reset tokens.
- **Notifies:** **nothing.** No "your password was changed" email, in-app notification, or `lastLoginAt`-style stamp. A silent takeover leaves no trace on the account.
- **Returns:** `{ ok: true }`, or `{ ok: false, error, fieldErrors: { currentPassword: "Incorrect." } }` on a bad current password (`:44-48`).

### `updateNotificationPreferencesAction(prefs)` — `:66-77`

- **Inputs:** one five-field object. No target id.
- **Validation:** **none** (R34).
- **Writes:** one `upsert` on `NotificationPreference`, spreading the same five keys into `update` and `create` (`:70-74`). `quizGraded` is never named, so it stays at its schema default forever (`10-notifications.md` R57).
- **Cascades / notifies:** none. `revalidatePath("/", "layout")` at `:75`.
- **Returns:** `{ ok: true }` — never the written row, so the optimistic client state at `settings-form.tsx:123-133` is never reconciled against the server.

**Common to all three:** the target is `session.userId`, the return is a
boolean-ish union rather than the written entity, and nothing is audited (R39).

---

## 7. Proposed API

Envelope per `CLAUDE.md`: `{ "data": ... }` / `{ "error": { "code", "message" } }`.

**What exists in v2 today:** `GET /api/v1/me` (`apps/backend/src/routes/me.ts:9-32`)
and `POST /api/v1/auth/logout` (`apps/backend/src/routes/auth.ts:73`). Nothing
else in this domain. `apps/mobile/app/(app)/settings.tsx:1-9` is a nine-line
`EmptyState` placeholder.

| Method | Path | Status | Auth | Request | Response |
|---|---|---|---|---|---|
| GET | `/api/v1/me` | **exists** — `apps/backend/src/routes/me.ts:9-32` | any authenticated | — | `{ data: { user: { id, name, email, role, avatarPath }, scopes } }` — **already the right shape for the settings screen's read**; see the note below |
| PATCH | `/api/v1/me` | **new** | any authenticated; subject from the token, never the body | `{ name }` | `{ data: { user } }` — returns the row, closing R23's double-refresh |
| POST | `/api/v1/me/password` | **new** | any authenticated **with a non-null hash** (R27) | `{ currentPassword, newPassword }` | `{ data: { ok: true, sessionsRevoked: number } }` |
| POST | `/api/v1/auth/logout-all` | **new** | any authenticated | — | `{ data: { revoked: number } }` — revokes every non-revoked, unexpired `RefreshToken` for the caller |
| GET | `/api/v1/me/notification-preferences` | **new — owned by domain 10** | any authenticated | — | all six keys — `10-notifications.md` section 7 |
| PUT | `/api/v1/me/notification-preferences` | **new — owned by domain 10** | any authenticated | full six-key object | as above |
| POST · DELETE | `/api/v1/me/devices[/:token]` | **new — owned by domain 10** (push, its D5) | any authenticated | `{ token, platform }` | as above |

### Notes on shape

- **`confirm` does not cross the wire.** v1's schema validates it server-side
  (`settings-actions.ts:18,20-23`) even though it is purely a typo guard on a
  value the client already holds. In v2 it is a client-side form rule; the
  request body carries two fields.
- **`POST /api/v1/me/password` must revoke.** R29 and `11-invites-users.md` R79
  together mean v1 has *no* path that evicts a stolen session. The password
  endpoint should revoke every refresh token for the user except the one the
  caller is currently holding, and return the count so the UI can say "signed
  out of 3 other devices". This is a deliberate divergence, not a port —
  section 10, D1.
- **Rate-limit the password endpoint.** `apps/backend` already has
  `authLimiter`/`refreshLimiter` (`routes/auth.ts:24,51,73`) returning
  `too_many_requests` 429 in the envelope. `POST /api/v1/me/password` must sit
  behind an equivalent, closing R31.
- **`GET /api/v1/me` needs no new endpoint for this screen.** It already returns
  `name`, `email`, `role`, `avatarPath`. The settings screen fetches it plus
  domain 10's preferences endpoint — two requests, both cacheable under
  hierarchical query keys, rather than one bespoke `/settings` aggregate. Do not
  add a `GET /api/v1/settings`; it would duplicate `/me` and drift from it.
- **No endpoint for theme, biometrics, or push permission.** Those are device
  state, not account state — section 10, D3.

---

## 8. Proposed shared contracts

New file `packages/shared/src/settings.ts`.

| Schema | Fields | Notes |
|---|---|---|
| `updateProfileRequestSchema` | `name` — string, **trimmed before validation**, min 2, max 120 | Closes R21. The trim must be in the schema, not the handler, so both apps get it. |
| `changePasswordRequestSchema` | `currentPassword` — non-empty string; `newPassword` — the shared password rule | **Must reuse `11-invites-users.md`'s `passwordSchema`, not restate the minimum.** R26 plus that domain's R65 make this the fifth copy of "min 8" in the product if it is redefined here. That schema also caps at 72 bytes for bcrypt truncation. |
| `changePasswordResponseSchema` | `ok` — literal true; `sessionsRevoked` — non-negative int | Drives the "signed out of N other devices" copy. |
| `logoutAllResponseSchema` | `revoked` — non-negative int | |
| `settingsSectionSchema` (optional) | discriminated union of the section keys the screen renders | Only worth adding if section 9's role branching grows past the two branches below; a hard-coded list in the screen is fine at two. |

**Reuse, do not redefine:**

- `packages/shared/src/navigation.ts` — the `/settings` href already exists for all six roles (`:58,79,97,117,133,151`). Nothing to add.
- The `me` response shape used by `apps/mobile/src/hooks/` against `routes/me.ts`. `PATCH /api/v1/me` must return **the same** user schema the GET returns, so one Zod schema parses both and a rename cannot drift the two shapes apart.
- `notificationPreferencesSchema` — **domain 10 defines it** (`10-notifications.md` section 8, all six keys). This domain imports it for the settings screen; it must not declare a five-key twin, which is precisely how `quizGraded` got lost in v1.
- `packages/shared/src/enums.ts` `userRoleSchema` for the role branch in section 9.

**Interfaces to convert.** `NotificationPrefsInput` (`settings-actions.ts:58-64`)
is a bare v1 interface; it is domain 10's to convert, and the conversion must
add the sixth key. This domain introduces no bare interfaces.

---

## 9. Screens

| v1 page(s) | v2 route | Exists? | Roles | Notes |
|---|---|---|---|---|
| `src/app/{admin,alumni,leader,mentor,student,super}/settings/page.tsx` — six files, byte-identical (R1) | `/settings` | **placeholder** — `apps/mobile/app/(app)/settings.tsx:1-9`, a nine-line `EmptyState` | **all six** | Six-to-one is the largest collapse ratio in the migration and the cleanest, because the six pages differ in nothing (R2, R3). |
| The "Appearance" row on `/{role}/more` (`more-menu.tsx:130-136`) and the theme item in the avatar menu (`user-menu.tsx:89-101`) | `/settings` | placeholder | all six | **Moves into settings in v2.** v1 splits it across two menus and puts it on neither settings page; a phone app's theme control belongs in settings. Section 10, D3. |
| The "Sign out" button on `/{role}/more` (`more-menu.tsx:138-146`) | `/settings` | placeholder | all six | v2's `/more` is also a placeholder. Sign-out belongs in settings alongside log-out-everywhere (D1); whether `/more` survives at all is a navigation decision, not this domain's. |
| `/{role}/profile` (student, alumni) — `StudentProfile` fields, avatar | `/profile` | **does not exist** | STUDENT, alumni | Domain 6. Flagged here only because R20 and R38 straddle the boundary: the *same* `User.name` column is editable from both screens. Section 10, D2 decides which one keeps it. |
| `/mentor/profile` — a tab pointing at no page (R11) | — | — | MENTOR | A live 404 in v1. Section 10, item 8. |

### The role-branching map for `/settings`

This is the section the brief asked to be complete. **In v1: nothing branches.**
Every one of the six pages renders the identical three cards for the identical
three columns (R2, R3). In v2 the screen should branch in exactly two places,
both derived from the token and neither from the route:

| Section of `/settings` | Renders for | Branch source | Why |
|---|---|---|---|
| Profile — name, email (read-only), avatar | all six | none | R3. Identical in v1, keep it identical. |
| Change password | all six **except** a user whose `passwordHash` is null | server 409 / a `hasPassword` flag on `GET /api/v1/me` | R27. v1 discovers this only after the user types their current password and submits. |
| Notification preferences | all six, **but the set of relevant types differs** | `user.role` from the token | `lowAttendanceFlag` and `mentorFollowup` fire only for staff (`10-notifications.md` R5, and the toggle copy at `settings-form.tsx:46,51` says so out loud — "a student you lead/admin", "a mentor flags a note"). v1 shows a student two toggles that can never fire for them. Show all six to staff; show the four a student can actually receive. **This is a divergence — D4.** |
| Appearance (theme) | all six | none | D3, new. |
| Security — biometric unlock, log out everywhere | all six | none | D1, D3, new. |
| Push notifications — permission + per-type | all six | reuses the notification branch above | D3, and domain 10's D5. |
| Organisation configuration | **nobody** | — | **There is none.** If a v2 implementer adds one, it does not belong on this screen: an org-wide default is a different resource with a different endpoint and a SUPER-only gate, and putting it behind a role branch on a screen every role can load is how the implicit-gate bug gets reintroduced. |

The last row is the point of this document. `/settings` in v2 must remain a
**purely self-scoped** screen. The moment a control on it writes something that
is not keyed by the caller's own id, the six-roles-one-route property stops
being safe by construction and starts depending on a branch being correct.

---

## 10. Open questions and divergences

### D1. Password change must revoke sessions — and log-out-everywhere must exist

**v1:** R29 — changing a password revokes no refresh token, invalidates no
session, and consumes no outstanding reset token. `11-invites-users.md` R79
finds the same for password *reset*, and its D6 finds the same for account
*deactivation*. Three separate remediation paths, none of which evicts anybody.

v2 already stores `RefreshToken` rows with `revokedAt` (`prisma/schema.prisma:184-196`)
and already has `POST /api/v1/auth/logout` (`apps/backend/src/routes/auth.ts:73`),
which revokes exactly one. Everything needed is present; nothing uses it.

**Recommendation:** `POST /api/v1/me/password` revokes every refresh token for
the user except the caller's current one, and returns the count.
`POST /api/v1/auth/logout-all` revokes all of them including the caller's. Both
are cheap `updateMany` calls. **This is the strongest argument for a mobile
"Security" section**: on a phone, "log out everywhere" is the only recovery a
user has when a device is lost, and v1 offers no equivalent.

### D2. `User.name` has two editors — pick one

**v1:** R38. `/settings` writes it with one validator; `/student/profile` writes
it *and the email* with another, inside a ten-field transaction
(`student-actions.ts:116-137`). A student who edits their name in settings and
then saves their profile form writes it twice.

**Recommendation:** `PATCH /api/v1/me` owns `name` for every role. Domain 6's
student-profile endpoint should own `StudentProfile` columns and **not** `User.name`
or `User.email` — the profile screen can still show a name field, pointed at
`PATCH /api/v1/me`. Needs agreeing with domain 6 before either is coded, since
whichever lands first will define the column's owner by default.

### D3. Mobile-native settings with no v1 equivalent — all **new**, none ported

v1 is a browser app; four things a phone app needs have no counterpart in it.
All four are proposals, and none should be presented as a port.

| Proposal | State in v2 today | Notes |
|---|---|---|
| **Push-notification permission** | none | Expo permission prompt plus a device-token registration. Domain 10 already proposes `POST/DELETE /api/v1/me/devices` (its D5); the *toggle* belongs on this screen. Must show OS-level denial distinctly from an app-level opt-out — a user who denied at the OS level cannot be fixed by a switch in our UI, only by a deep link to system settings. |
| **Biometric unlock** | none | `expo-local-authentication` gating access to the refresh token in `expo-secure-store`. Purely client-side: no endpoint, no column. **Do not** add a `biometricEnabled` column — it is per-device state and syncing it across devices is wrong. |
| **Theme (light / dark / system)** | `apps/mobile/src/theme/index.tsx:68-76` — `ThemeProvider` supplies one fixed `theme` object with no setter | The type work is **already done for a second palette**: `:13-22` explains that `ThemeColors` widens every hex literal to `string` specifically so a dark palette can be assigned to the same type, and `:47-58` keeps `Theme` a shape rather than the one concrete palette. Adding dark is a `tokens.ts` palette plus a setter here, not a rewrite. v1's equivalent is device-local in `localStorage["theme"]` with a `"system"` default (`theme-provider.tsx:16,22-26`); the mobile version should be device-local in `expo-secure-store`/`AsyncStorage` with the same three-way default. **No endpoint, no column.** |
| **Log out everywhere** | `POST /api/v1/auth/logout` revokes one token | See D1. This one *does* need an endpoint. |

**Where they live on the screen.** Personal-preference sections (Appearance,
Biometrics, Push) sit above account sections (Profile, Password, Security). None
of them branches by role.

### D4. Show a student only the notification types they can receive

**v1:** all five toggles render for everyone, and two of them —
`lowAttendanceFlag`, `mentorFollowup` — describe events that only fire for
staff, in copy that says so (`settings-form.tsx:46,51`). A student can toggle
two switches that will never do anything.

**Recommendation:** derive the visible set from the role. Keep all six columns
on the server so the shape never varies, and filter only what is rendered. This
is a **UI** branch, not an authorization branch — a student PUT-ing all six keys
must still succeed, because the columns are theirs.

Requires agreement with domain 10, which owns the toggle set. Flagged, not
specced.

### D5. The seventh setting nobody can change

`quizGraded` is read by `userAllowsType` (`notifications.ts:23,31-32`) and
written by nothing (section 2, `10-notifications.md` R56–R57). v2's
`apps/backend/src/lib/notifications.ts:19-26` already fixes the *type* half with
`satisfies Record<NotificationType, string>`. The *product* half — rendering a
sixth toggle — is domain 10's D-item; this domain must make sure the settings
screen renders whatever that schema contains rather than a hard-coded list, so
the next enum member cannot repeat the mistake.

**Recommendation:** the settings screen maps over the keys of
`notificationPreferencesSchema`, with labels in a lookup keyed by the same enum.
A missing label then fails at compile time.

### D6. Validate the preferences write

R34 — `updateNotificationPreferencesAction` spreads unvalidated client input
into Prisma. v2's PUT must parse against `notificationPreferencesSchema` and
return `bad_request` 400 in the envelope, not let Prisma throw into the
`internal_error` handler. Trivial, but it is the only unvalidated write in this
domain and it would be easy to port faithfully by accident.

### D7. Trim the name, and decide what the message says

R19 and R21. Two small fixes, one decision: v1's `min(2)/max(120)` emits raw Zod
default messages, which read badly ("String must contain at least 2 character(s)").
The shared schema should carry custom messages the way `passwordSchema` does
(`settings-actions.ts:16-18`). Trim before validating so whitespace cannot
satisfy the minimum.

### D8. The email field's caption is a lie for students

R20. Settings says "Change via the admin console." and disables the input, while
`/student/profile` lets a student change their own login email
(`student-actions.ts:116-119`). Two options, and this domain has no standing to
pick:

- **Students may change their own email.** Then settings should offer it, with
  a verification step — changing the login identifier with no confirmation to
  the old address is an account-takeover primitive.
- **Students may not.** Then domain 6's endpoint must stop writing `User.email`
  when the caller is the subject, the same way it already refuses `notes` and
  `activeSeasonId` for self-edits (`student-actions.ts:114,130-135` — the
  mechanism already exists, `email` simply is not in it).

**Recommendation:** the second, plus a SUPER-only email-change path in domain
11. It is one line inside an existing conditional. Flag to domain 6.

### D9. Navigation defects found while tracing reachability

Cross-domain; recorded here because they were confirmed while establishing how
each role reaches `/settings`, and all three vanish in v2's flat tree.

1. **`/mentor/profile` is a tab pointing at a page that does not exist** (R11) —
   `navigation.ts:129` versus the contents of `src/app/mentor/`. The fifth
   mentor tab 404s in production today. v2's typed routes make this class of
   error a compile failure (`CLAUDE.md`, "Typed routes are on"), which is why it
   needs no fix here — but v1 is live and someone should be told.
2. **A mentor has no `/mentor/more`** (R9), so on a phone the avatar menu is
   their only route to settings.
3. **A student's avatar menu points at `/student/profile`, not their settings
   page** (R10), so on a phone a student reaches password-change only through
   `/student/more`.

### D10. A numbering inconsistency in a sibling spec

`11-invites-users.md:27` refers to "domain 12 (Settings/profile)". Settings is
domain 18 (`2026-08-21-full-migration-design.md:131`); domain 12 is quizzes.
The cross-reference itself is correct — `changePasswordAction` does belong to
settings — only the number is wrong. Worth a one-word fix so the two documents
resolve against each other.

---

## Summary for the implementer

- **41 rules.** **11 marked `(implicit)`** — R4, R5, R6, R7, R9, R22, R24, R32, R35, plus the two row-scope conditions in section 4 that no code states (`updateOwnProfileAction`, `updateNotificationPreferencesAction`).
- **One shared component and three shared actions serve all six roles' settings
  pages, and none of them checks a role.** That is safe here, and only here,
  because no action accepts a subject id. Preserve the property by construction
  in v2: derive the subject from the token, reject a body `userId`.
- **Nothing on the v1 settings screen branches by role.** Section 9 proposes
  exactly two branches for v2 (password availability, notification-type set),
  both cosmetic, neither an authorization boundary.
- **There is no organisation-wide configuration anywhere in the product.** If
  one is added, it is a different resource with a different endpoint.
- **Blocking decisions before code:** D1 (revocation — also unblocks
  `11-invites-users.md` D6), D2 (who owns `User.name` — needs domain 6), D8
  (student email — needs domain 6), D4 and D5 (toggle set — needs domain 10).
  D3, D6, D7 are this domain's alone.
