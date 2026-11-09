# space-v2 — Claude Context

Mobile-first rebuild of JPC Space (`D:\Projects\JPC\jpc-space` is v1 and still runs).

## Layout

- `apps/mobile` — Expo + expo-router, React Query, Zustand, tokens in expo-secure-store
- `apps/backend` — Express 5, Prisma 7, ports v1's `/api/v1`
- `packages/shared` — Zod contracts. **No build step**; `main` is `src/index.ts`
- `packages/config` — eslint, tsconfig, prettier

## Hard constraints

- **`D:\Projects\JPC\jpc-space` is READ-ONLY.** It is the reference
  implementation and the source of truth for behaviour — read it constantly,
  never write to it. No edits, no refactors, no "small fixes", no new files,
  no `git` operations in that repo. If something there looks wrong, report it;
  do not touch it.
- **The whole product is being migrated into this monorepo** — `apps/mobile`
  and `apps/backend` together replace jpc-space entirely, including the admin
  and super surfaces. jpc-space is retired once that is done, not before.
- **Everything goes in the mobile app.** All 104 of v1's pages, admin and
  super included, become React Native screens. There is no `apps/admin`.
- **The database serves v2 only (owner ruling 2026-11-04).** The schema
  freeze that kept the database shareable with v1 (`_DECISIONS.md` C1) is
  lifted: v2 owns the schema and may add migrations. v1 must no longer write
  to this database. `prisma/migrations/` starts with v1's history; add new
  migrations after it (`pnpm --filter @space/backend db:migrate:deploy`
  applies them through `prisma.config.ts`). Keep migrations additive unless a
  destructive change is explicitly planned, and say in the commit which
  environments they were applied to.
  Each migration ships a `rollback.sql` beside it; a CHECK or partial index
  that Prisma can't declare is noted on its model as
  `// SQL-only <kind> <name>: <definition>` (the schema snapshot test fails
  otherwise), and `pnpm --filter @space/backend db:erd` regenerates
  `docs/database/erd.md` (a unit test fails while it is stale). Never run
  `prisma migrate dev` against a migrated database: it drops SQL-only objects.
- **Passwords are bcryptjs.** Existing hashes are bcrypt; any other algorithm
  locks out every user.
- **Tokens must stay v1-compatible:** `jose` HS256, secret `AUTH_SECRET`
  (same value as v1), audience `jpc-mobile`, 900s TTL, subject `String(userId)`.
- **Prisma 7 generates to `src/generated/prisma`.** Never import `@prisma/client`.
- **No `process.env` outside `src/lib/config.ts`.**
- `.npmrc` sets `shamefully-hoist=true` — Metro cannot resolve pnpm's nested symlinks.
- **No `@/` path alias in either app.** The backend can't use one because `tsc`
  won't rewrite path aliases with `rootDir: "../.."` (needed so it can also
  compile `packages/shared`). The mobile app never had one: an alias that
  Jest resolves but Metro doesn't would pass tests while breaking the running
  app. Both apps use relative imports — keep it that way.
- **Commits are authored as `jesusprojectcommunity`, and pushes go to both
  remotes.** See "Git" below — a commit by any other author never deploys.
- **`apps/backend/src/routes/auth.ts` imports `@space/shared` by relative
  path, not the package name.** Because of the same `rootDir: "../.."` setup,
  `tsc` emits this file to `dist/apps/backend/src/routes/auth.js` without
  rewriting bare specifiers — a `require("@space/shared")` at runtime would
  resolve via `node_modules/@space/shared` back to the *TypeScript source*
  instead of the compiled sibling output in `dist/packages/shared/src/`, and
  the built server crashes with `ERR_MODULE_NOT_FOUND`. `credentials.ts` and
  `tokens.ts` use `import type { UserRole } from "@space/shared"`, which is
  erased at emit, so they're unaffected — `auth.ts` is the only value import
  and the only one that needs to stay relative
  (`../../../../packages/shared/src/index`). Do not "tidy" it back to the
  package name.

## Response envelope

Success `{ "data": ... }`, failure `{ "error": { "code", "message" } }`. This
is enforced for every path, not just the happy ones: `apps/backend/src/middleware/`
holds a terminal error handler (malformed JSON body → `bad_request` 400,
anything thrown → `internal_error` 500 with no stack ever in the body,
regardless of `NODE_ENV`) and a catch-all `not_found` 404, both mounted last
in `app.ts`. The login and refresh rate limiters return `too_many_requests`
429 in the same shape instead of express-rate-limit's default plain-text body.

Login-path codes: `bad_request` 400, `invalid_credentials` 401, `invalid_token` 401.

On the mobile side, `apps/mobile/src/lib/api-client.ts` parses responses
against the shared Zod schemas (`loginResponseSchema`, `sessionSchema`)
instead of casting, so a future backend drift fails loudly at the client
boundary rather than handing a malformed object to callers.

## Commands

```
pnpm dev / build / lint / typecheck / test / test:unit
pnpm --filter @space/backend db:generate
```

**Formatting is Prettier, enforced.** `pnpm lint` runs `pnpm format:check` (ts, tsx, js, mjs,
cjs, json) before ESLint, so unformatted code fails lint and CI. Run `pnpm format` before
committing. The one config is `packages/config/prettier` (printWidth 120), loaded by the root
`prettier.config.js`; `.prettierignore` skips generated output and Markdown. The repo-wide
format commit is in `.git-blame-ignore-revs`.

`test` runs the Turbo tasks `test:unit` then `test:integration` (there is no
`test` Turbo task itself — it's a root `package.json` script). `test:integration`
is uncached (`cache: false` in `turbo.json`) and hits the database `.env` names
(locally the Postgres `space_test`, see below), so it always actually executes. The backend's `start` script is
`node dist/apps/backend/src/server.js` — the emit path nests under
`dist/apps/backend/src/` because of the backend's `rootDir: "../.."`. The
backend build uses `tsconfig.build.json` (extends `tsconfig.json`, excludes
both `__tests__` trees) so test files never ship into `dist`; `typecheck`
still uses the base `tsconfig.json` and covers tests.

`apps/backend/src/__tests__/tokens.test.ts` and other unit tests import
`../lib/config`, which throws if `DATABASE_URL`/`AUTH_SECRET` are missing.
`apps/backend/jest.setup.ts` (wired via `setupFiles`) loads `.env` if present
and otherwise fills placeholder values for just those two keys, so
`pnpm test:unit` genuinely needs no database or real `.env` — a real `.env`,
when present, always wins.

## Backend environment (`apps/backend/.env`)

`DATABASE_URL`, `AUTH_SECRET` — see `.env.example`, both required, no defaults.
`PORT` — default `4000`. `NODE_ENV` — default `development`.
`TRUST_PROXY` — number of proxy hops in front of the app, passed to Express's
`trust proxy`; default `0` (fails closed — an unconfigured deploy trusts
nothing, rather than trusting a spoofable `X-Forwarded-For`). Set it to the
real hop count behind a load balancer, or the auth rate limiters bucket every
client together under the proxy's IP. `MOBILE_APP_ORIGIN` — CORS origin
allowed to call the API; default `"*"` (matches the app this backend was
ported from).

`DEV_USER_SWITCHER` — `"1"` turns on `/api/v1/dev/users` and `/dev/switch`,
v1's passwordless sign-in as any active user, and the header switcher on Home
(it only renders when the probe succeeds). Every `/dev` route is a 404
otherwise. A testing aid: unset by default.

**Sentry is opt-in on both sides.** It stays off until `SENTRY_DSN` (backend)
or `EXPO_PUBLIC_SENTRY_DSN` (mobile, read only in `src/lib/app-config.ts`) is
set. Report through `reportError` in each app's `lib/sentry.ts`, never
`Sentry.*` directly, so the off state stays a no-op. `src/instrument.ts` must
stay the first import of both backend entrypoints. Never put an email or a
name into an event. Setup steps are in `apps/backend/README.md` under
"Turning on Sentry".

## API surface

`apps/backend` now serves all of v1's `/api/v1` — every route file v1 had
under that prefix has a ported counterpart here. `src/routes/` has one module
per v1 domain: small domains are a single file (`auth.ts`, `me.ts`,
`groups.ts`, `assignments.ts`, `health.ts`, ...); big ones are a folder
(`quizzes/`, `sessions/`, `submissions/`, `seasons/`, `students/`, `users/`,
`video-quiz/`) whose `index.ts` is the route table — paths and middleware in
registration order — and whose sibling files hold the handlers. Register new
paths in the `index.ts`, keeping order (`/:id/foo` before `/:id`). A value
import of `packages/shared` from inside a route folder needs one more `../`
than from `routes/auth.ts` (see the hard constraint above). The 403 envelope
is `forbidden(res)` from `lib/api-response.ts`; a refusal thrown below a route is an `ApiError` (`lib/api-error.ts`).
Authorization runs through two layers: `lib/rbac.ts` holds pure predicates
over a decoded token's claims (role, `seasonAdminIds`, `groupLeaderIds`), and
`lib/permissions/` (one file per domain, re-exported from its `index.ts`)
holds the database-backed gates that check a specific row's ownership/scope
before a handler proceeds.

**File size.** Keep every source and test file at or under 400 lines. Split by
responsibility, turning `foo.ts` into `foo/index.ts` plus parts so importers
keep the same path. In the mobile app, never put non-route files under `app/`
(expo-router makes every file a route): screen sections go in
`src/screens/<screen>/`. `lib/public-id.ts`
deliberately does **not** use `nanoid` — v1's generator is nanoid v5, which is
ESM-only, and this backend compiles to CommonJS, so requiring it would throw
`ERR_REQUIRE_ESM` at runtime. `newPublicId()` reimplements the same alphabet
and length using `node:crypto` instead; ids from the two backends are
indistinguishable. Do not "restore" `nanoid` here.

Two endpoints here are **not** ports and deliberately diverge from v1:

- `GET /api/v1/submissions/:publicId/files/:fileId` streams an attached file.
  v1's equivalent (`/api/uploads/[...path]`) takes an arbitrary storage path
  and gates it on nothing but "is logged in", so any authenticated user who
  guesses a path can read any student's private submission. This one addresses
  the file by id scoped to its submission and gates on `canViewSubmission`.
  It lives outside `/api/v1` in v1, so no client contract required parity.
- The upload handler re-decodes `file.originalname` from latin1 to UTF-8.
  `multer`/`busboy` decode multipart filenames as latin1; v1 used the web
  `formData()` API, which decodes UTF-8. Without this, a non-ASCII filename is
  stored mojibake'd. Do not "simplify" it back to `file.originalname`.

**Uploads are switched off.** `ENABLE_UPLOADS` defaults to `false`, so
`POST /api/v1/submissions/:publicId/files` returns `503 uploads_disabled`
while file/image handling moves to a CMS. The guard is mounted **in front of**
`upload.single("file")` on purpose: multer buffers the whole body to make the
per-assignment size check possible, so a guard behind it would still pay the
full `MAX_UPLOAD_BYTES` memory cost for a request it was always going to
refuse. Do not reorder it. Only uploading is gated — reading and deleting
recorded files still work. A CMS becomes a second `Storage` driver beside
`LocalFsStorage` (a new `STORAGE_DRIVER` value); no route changes.

Swagger UI is at `/api/docs`, the raw OpenAPI 3.1 document at `/api/docs.json`
(`ENABLE_API_DOCS=false` withholds both). It is hand-authored in
`src/docs/openapi.ts` — responses are TS interfaces rather than Zod, so there
is nothing to generate from. Change it in the same commit as the route.

Still outstanding: the mobile screens for the newly-ported endpoints. See
`apps/backend/README.md` for the full endpoint and environment reference.

## Mobile conventions (Phase 0 established these — follow them)

**Screens are flat and role-driven.** One route per *destination*
(`/calendar`, `/students`), not per role. `(app)/_layout.tsx` is a native `Stack`
(anonymous redirect, alumni guard, `UNSTABLE_router={singularTabsRouter}`, anchor
`(tabs)`); `(app)/(tabs)/_layout.tsx` holds the `Tabs` (`backBehavior` "history" +
`historyThenHomeTabsRouter`, anchor `dashboard` — its dev warning is expected, do not
"fix" it). The pill renders `navFor(user).tabs` from `packages/shared/src/navigation.ts`:
Home (`/dashboard`) first, at most 5 per role; only the selected tab shows its name, under its icon (never beside it), and every tab takes an equal share of the pill
(the rest are icons, named for screen readers; owner 2026-11-07). A href that is a tab for some role is in `ALL_TAB_HREFS`
and its file lives in `(tabs)/`; a nav destination that is a tab for no role is a pushed
route outside `(tabs)/` (`PUSHED_NAV_ROUTE_NAMES`), and every detail route is listed in
`DETAIL_ROUTE_NAMES` — both pushed on the stack so Back returns to the screen you came
from. Never put `href: null` or `hidden` on a `Tabs` screen (expo-router 58 redirects a
focused hidden tab to the first tab, breaking deep links); the pill rendering `items` is
what keeps screens out of the bar. Never re-derive hrefs from `navByRole`: `ALUMNI` is
only reachable via `navFor`.

**Navigation actions we support** (pinned by the `deep-links`, `more-back` and
`stack-actions` tests; extend them when you dispatch anything new):

| Action | In this shell | Use it for |
|---|---|---|
| `push(href)` | a detail/pushed route stacks above; a tab route pops back to the one `(tabs)` and switches tab (`singularTabsRouter`) | opening anything |
| `navigate(href)` | same as `push` for a tab route | rarely needed |
| `replace(href)` | swaps the top screen; a tab route pops to the one `(tabs)` instead of stacking a second | create → show the new record (`seasons/new` → `/seasons/[code]`) |
| `back()` | pops one screen; on a tab, tab history then Today (`historyThenHomeTabsRouter`) | cancel; save → show the record below |
| `dismissTo(href)` | pops to the nearest matching route below (taking the href's params), or swaps the top screen for it | deleted → the list (`/groups`, `/students`); save under a new URL (a season's new code) |
| `dismissAll()` then `push(href)` | pops to `(tabs)`, then opens `href` | deleted, and the target may not be on the stack (session → its season) |

Never `replace` to a list after a delete: the deleted record's detail stays under Back.
A cold deep link always has `(tabs)` under it, so a `canGoBack()` fallback is dead code.

**Typed routes are on.** Every `href` is compile-checked against the real route
tree. The types are generated, not written — `turbo.json`'s `routes:generate`
task runs `expo customize tsconfig.json` and `typecheck` depends on it, so a
clean checkout gets correct types. Without them the `Href` type silently
degrades to `string` and checks nothing. Never silence a route error with
`as Href`/`as any`.

**Data fetching follows `app/(app)/(tabs)/dashboard.tsx`** — the worked example. Query
keys are hierarchical factories in `src/lib/query-keys.ts`; hooks live in
`src/hooks/` and **parse responses with a Zod schema from `packages/shared`**
rather than casting, so a backend drift fails at the boundary. A hook calls `apiGet(url, schema)` / `apiSend(method, url, body, schema)`
(`src/lib/api-request.ts`); an error is read with `apiErrorStatus` / `apiErrorCode` (`src/lib/api-error.ts`), and
only the API plumbing (`api-client`, `api-error`, `auth-error`) imports axios. Queries
depending on `scopes.activeSeasonId` (or any nullable id) must pass `enabled`
— and guard manual `refetch()` too, since `enabled` only gates the automatic
run. Map states to the primitives: `RouteSkeleton`, `RouteError` with `onRetry`
wired to `refetch` (`InlineError` for one card's query), `EmptyState`.
`queryStateView(q)` / `<QueryGate query={q}>` (`design/layout/route-states.tsx`) give the first two. A
`/seasons/[code]/…` route reads its season with `useSeasonRoute()` (`src/hooks/use-season-route.ts`) and shows
`SeasonLinkNotFound` for a bad code; a list's next page is a `LoadMoreButton` with the screen's own label.

**Domain contracts are Zod, not bare interfaces.** `session.ts`'s
`sessionListItemSchema` is the source of truth and its type is `z.infer` of it.
Every wire contract in `packages/shared` follows this; the only interfaces left
are navigation config (`NavItem`, `RoleNav`, `NavAudience`), which never cross
the wire.

**The redesign spec is the UI reference** (owner lifted "match v1" on 2026-11-04;
`docs/superpowers/specs/2026-11-04-mobile-redesign-design.md`). jpc-space stays the source
of truth for behaviour and copy, not look; the v1 side-by-side is no longer the acceptance
check, the UI sweep is. Styling is NativeWind over `src/design/theme/tokens.json`, the
owned token source (`pnpm --filter @space/mobile design:tokens` regenerates `global.css`
and `tailwind-theme.js`): semantic tokens, status tones, `pill*`, `surface-raised`,
`control-border` and `ring` (both >=3:1). Raw colours for charts/SVG come from
`design/theme/palette.ts` or `useThemeColors()`, never hex literals.

- **Frame.** Every screen renders `Screen` (`design/layout/screen.tsx`): large collapsing
  title, `back`, `home` (bell + avatar, Home only), the offline banner, and the top
  inset, which only it owns. `ShellFrame` is the transitional wrapper over it. A screen
  on the stack gets the pinned back bar by default; `back={null}` opts out, and an
  in-content back link is a duplicate. Bottom padding comes from `useShellBottomPadding()`,
  driven by the tab-bar presence context (tab bar vs none). A long form's pinned Save goes in
  `Screen`'s `footer` (`footer={<SaveBar … />}`): outside the scroll view, above the pill or
  the inset, riding the keyboard, with the content padded by its measured height. Never put a
  `SaveBar` among a `Screen`'s children.
- **Components** (`src/design/ui/*`): Button (primary | secondary | destructive | plain),
  StatusChip / `statusChip` / `dueChip`, GroupedList / ListRow, HeroCard, StatTile,
  SegmentedControl, SearchField, EmptyState (`tone`), Sheet / SheetSaveBar, Toast
  (`toaster.tsx`); `src/design/layout/*`: Screen, LargeTitle, PillTabBar, SaveBar,
  `tab-bar-scroll`. The pill is one solid `bg-pill` on iOS and Android (R38; owner 2026-11-08 tried a
  frosted iOS pill and kept the solid one). Pressing the open
  tab scrolls its screen to the top, or reloads it when already there (`emitTabReselect`).
  Swiping left or right on a tab opens the next or previous tab in the pill (`swipeTabs`, a Pan in
  `(tabs)/_layout.tsx`; instant, never from the outer 24pt). Test roots need a `GestureHandlerRootView`. Render text with `ui/text.tsx` and its `variant` scale (largeTitle,
  title, headline, body, subhead, caption); it carries the body defaults because React
  Native text inherits nothing. Button, Badge and the pills carry no self-alignment:
  where one sits in a block, add `self-start`.
- **Shapes and the consistency guard.** Radii are named tokens: `rounded-group` (16: cards,
  groups, popovers), `rounded-control` (14: buttons, fields, option rows, callouts),
  `rounded-full` (chips, discs), `rounded-t-sheet` (24, kit only). `src/__tests__/design-consistency.test.ts`
  fails on hex / `rgb()` literals and `shadow-` classes anywhere in `app/` and `src/`; outside
  `src/design/` it allows only `rounded-group|control|full|none` (and side variants), no raw
  font size (`fontSize:`, `text-[10px]`, `leading-[…]`: use a Text variant, never under
  caption) and no elevation (`shadowStyle`, `elevation:`, `boxShadow:`; only the design
  catalogue's sections in `src/screens/design-catalogue/` may demo it). The legacy kit (Card, Badge, Modal, Tabs,
  StatCard, SectionCard, PageTitle, ...) already draws on the new tokens and cards are flat;
  plans 02–05 keep the guard green and delete each legacy component when its last user migrates.
- **Catalogue.** The hidden design catalogue (`spacev2://design-catalogue`, in dev or with
  `EXPO_PUBLIC_SWEEP_BUILD=1`) is the one catalogue: it shows every component; sweep flow
  `s90` shoots it. Add a component's states there when you add the component.
- **Motion** (`src/design/motion/`): durations `fast` 150 / `base` 220 / `slow` 320 ms, one
  easing `EASE_OUT` (no springs exist); press feedback is a dim via `usePressDim`; haptics via
  `haptic()`. Every animated component reads `useReducedMotion` (movement becomes a short
  crossfade). Exits are faster than entrances, a new tap cancels motion in flight, and no state
  depends on an animation finishing. `calm-motion.test.ts` guards the rules below.

The legacy kit (`src/ui/`, `src/theme/`) is gone. `tools/ui-reference/` is the sweep rig.

**Testing.** Anything rendering the shell (`ShellFrame`, the bars) must use `renderWithProviders`
(`src/__tests__/helpers/render.tsx`) — it supplies `SafeAreaProvider` with
explicit `initialMetrics` and a `QueryClientProvider`. A *bare*
`SafeAreaProvider` renders no children at all while `render()` still returns a
truthy tree, so assertions pass against nothing. `Input` hides its visual label
and error caption from the accessibility tree, so query fields with
`getByLabelText` and assert errors via `accessibilityHint` — `getByText` finds
neither. `jest.mock` factories may only close over out-of-scope consts named
`mock*`.

**UI sweep.** One 375dp phone doesn't show a 360dp phone at font 1.3, the Android nav
bar under the floating tab bar, the keyboard over a form, or dark mode on first launch. After building
or changing a screen, run the `ui-sweep` skill (`.claude/skills/ui-sweep/`,
`tools/ui-reference/ui-sweep.mjs`, flows in `apps/mobile/.maestro/sweep/`) and look at the shots
before calling it done. Sweep flows never save anything. Maestro on Android often misses
sonner-native toasts, so flows shoot toasts best-effort.

### Settings and account (owner, 2026-11-06)

- **One Profile page** (owner, 2026-11-07): `/profile` is read-only (name, email, phone, date
  of birth, address; a student's or alumnus's university, faculty, graduation year and
  "School of N"), with no role badge and no season figures. Its Edit opens `/edit-profile`, one
  form with one Save: the `User` columns (PATCH /me, every role) and, for a student or a
  studying alumnus, the academic record (PATCH /me/profile); an alumnus's academic record is
  read-only. Profile is in no sidebar: More's name row and Home's avatar open it (a tab for
  alumni only). Notification settings open from the gear on Notifications.
- Home's bell opens `/notifications` and the avatar opens Profile: plain
  buttons, never dropdowns (owner, 2026-11-07). The theme lives on More, for every role.
- Notification settings show only the kinds a person can be sent: a student's six, a group
  leader's Submissions received and Low-attendance flags, a season admin's Low-attendance
  flags, a mentor's Follow-up reminders; every role also gets New announcements, so Super has a switch too. A note's
  follow-up flag notifies nobody (owner, 2026-11-07); the mentor's own follow-ups (see "The
  mentor") send the only `MENTOR_FOLLOWUP`.
- A student's page (staff view): the This season card shows Attendance, Assignments and
  Quizzes (`quizzesGiven/Taken/quizPct` on the staff engagement arm), never the composite
  score; its tabs run Submissions, Attendance, Notes, Seasons, the first open.
- No password form in the app: "Forgot password?" on sign-in is the only way
  to set one. No "Sign out everywhere".
- Sign out and Delete account (DELETE /me, a soft delete) live on More, for every role
  (the mentor has a More tab too).
- A student's graduation year is the university's (`StudentProfile.universityGraduationYear`,
  may be in the future — not `User.graduationYear`, which marks a JPCS alumnus).

### Announcements (owner, 2026-11-07; renamed from News 2026-11-08)

Spec: `docs/superpowers/specs/2026-11-07-news-announcements-design.md` (it still says News).
- **Who posts:** a Super to the community or to any ACTIVE season; an admin to their own ACTIVE season. A draft refuses (`season_draft`), a finished season refuses (`season_finished`). Leaders and mentors never post.
- **Who reads:** the community post, everyone; a season post, its `seasonParticipant` students, its live admins and leaders, and Supers. Mentors read community posts only. One gate: `announcementVisibilityFilter` (`lib/queries/announcements.ts`).
- **Edit and delete:** the author while still admin of that season, or a Super. Nobody edits a finished season's post; a Super may still delete one. Audience and season never change after posting; delete is permanent.
- **Unread:** posts addressed to you, newer than your account, from the last 30 days, never your own. A Super's unread counts community posts only. `announcementUnreadFilter` feeds `/unread`, More's count, Home's card and each item's `isRead`.
- **Notifications:** `ANNOUNCEMENT`, link `/announcements/<id>`. A community post goes to every active account but the author; a season post to its live students, admins and leaders (not Supers). The "New announcements" switch (every role) turns off push only. An edit sends nothing; notifications never email.
- **Routes:** `/api/v1/announcements` (`GET /`, `/unread`, `/targets`, `/:id`; `POST /`, `/:id/read`; `PATCH` and `DELETE /:id`). Mobile: `/announcements` (pushed), `/announcements/[id]`, `/announcements/new`, `/announcements/[id]/edit` (detail routes), screens in `src/screens/announcements/`.
- **Where it shows:** a row on More for every role (unread count in words and in its screen-reader label, nothing on the tab) and `AnnouncementsHomeCard` on Home: one compact row ("New announcement" / "N new announcements", the latest post's first line, opens that post; owner 2026-11-08), nothing while loading, on error or with nothing unread.
- **Text:** no title (owner, 2026-11-08): a post is its message, 1 to 5000, plain text; its push is titled "New announcement". Links in a post open only if they are http(s); the rest stay text. No body in a log or Sentry event.
- **Polls** (owner, 2026-11-09; spec `docs/superpowers/specs/2026-11-09-announcement-polls-design.md`): a post may carry one poll under its message, pick one or pick any, open until a manager closes it by hand (closing and reopening notify nobody and never set "Edited"). 2 to 10 options, 1 to 150 characters, unique ignoring case. No option text or name in a log or Sentry event.
  - **Routes:** `PUT /:id/poll/vote` (`{ version, optionIds }`; replaces the whole vote, no withdrawing), `POST /:id/poll/close`, `POST /:id/poll/reopen`, `GET /:id/poll/voters` (managers, and a Super on a finished season; 404 for anyone else); `poll` on `POST /` and `PATCH /:id`, and `confirmVoteLoss` on `PATCH`. Any option edit bumps `version`; a stale one is `409 poll_changed`.
  - **Who votes:** anyone who may read the post, except a Super on a season post. Only while the poll is open and, on a season post, the season is ACTIVE: `409 poll_closed` / `409 season_finished` (a finished season's poll reads Closed). Votes count as the rows are: someone who lost access keeps their vote, a deleted account reads "Former member".
  - **Who sees what:** a reader sees counts only once their vote is on the poll (or it is closed); managers always, with who picked what. Managers are exactly who may edit the post, so an author who stops being admin loses names and counts; on a finished season Supers still see names. The poll carries `canSeeNames` (gates See who voted and its sheet) apart from `canManage` (Close / Reopen), and, for managers only, `multiPickVoters` (people, the warning's words) and `multiPickVotes` (their vote rows, matched against the 409's count).
  - **Concurrency:** an edit locks the Announcement row `FOR UPDATE`, then the poll row (`poll-write.ts`); a vote, close and reopen lock the poll row (`lockPoll`, `lib/announcement-poll-lock.ts`). So a vote can't land on an option an edit is removing, and the vote-loss count is the true one.
  - **Editing** (`poll` on PATCH): absent leaves the poll and its votes alone; `null` removes it with every vote; an object is the whole new poll: an option sent with its `id` keeps its votes under the new wording, an existing option omitted is removed with its votes, one without an `id` is new, and a post with no poll can gain one. Several to one clears only the votes of people who picked more than one. Anything that deletes votes needs `confirmVoteLoss: true`, else `409 poll_votes_lost` with `{ votes }`. The app sends `poll` only when it differs from the poll as opened, so a message-only save never undoes another manager's poll edit.
  - **Files:** backend `routes/announcements/poll-vote.ts`, `poll-write.ts`, `poll-manage.ts`, `poll-edit-plan.ts`, `poll-serialize.ts`; `lib/permissions/announcement-poll.ts`; `lib/announcement-poll-lock.ts`; shared `packages/shared/src/announcement-poll.ts`; migration `20261109090000_announcement_polls`. Mobile `screens/announcements/poll/` (`PollCard`, `PollEditor`, edit warnings) and the "Poll" / "Poll · Closed" chip on `PostCard`; list items carry `hasPoll` and `pollClosed`.
- **Sweep:** `seed-sweep/announcements.ts` seeds one community post and two season posts, one a poll ("[Sweep] Which evening suits the retreat?", three options, votes from other seeded people; bodies start "[Sweep]"); flows `super-scenarios/s56` and `student-scenarios/s57` (the flows never vote or save), catalogue section `announcements` (s90) with the poll in every state.

### Graduating seasons (owner, 2026-11-07)

Students graduate by passing a season a super marked **Graduating season**
(`Season.graduatesOnPass`; super-only, changeable until the season has finished).
End graduates everyone who passed in its own transaction, whoever ends it; the
class is the season's own `Season.year`, whenever it ends (a 2027 season ending in 2026
gives 2027), shown as "School of {year}" (never "Class of"). End's body carries `reviewed`, what the staff member was shown; a different flag
or roster is refused, since everyone not named as not passed passes. Correcting a result to Passed on such a season graduates then; Did not pass
never removes alumni status. `POST /students/:id/graduate` is the exception: without
a pass it answers `not_qualified`, and `override: true` needs an `overrideReason` (trimmed,
10 to 1000 characters; else 400) and, in the app, a tick. Who, when and the reason are stored
on the user (`graduationOverrideAt/ById/Reason`) in the same transaction and shown to SUPER
only (`graduatedByException` on the student detail); the audit line says `override` and never
carries the reason, and no Sentry event may. `PATCH /users` accepts any class year from 1990
to 2100, so a graduate of a future-year season can still save. Backfills and old
results never graduate anyone. The app's second confirmation is the same sheet changing
its words: never close one modal and open another, iOS can drop the second.

### Quiz results are held until released (owner, 2026-11-07)

Students may take a quiz at different times, so nobody sees the marking until the season's admin
or a super releases it (`POST /quizzes/:id/release`, one way; `Quiz.resultsReleasedAt/ById`).
Grading still happens (an MCQ-only attempt is GRADED on submit), but every student read goes
through `studentAttemptStatus` (`lib/quiz-results.ts`): a graded attempt reads SUBMITTED and score,
`gradedAt`, `isCorrect` and `pointsAwarded` are null; a paper grade isn't listed. That covers the
quiz list, the quiz detail, the submit response and a past season's record; a new student read of
quiz results must use it too. Grade notifications stay silent while held; the release sends one
"Results are out" to everyone graded by then. Staff see `resultsReleasedAt` and
`canReleaseResults`; the Results card (`screens/quiz-grade/release-results.tsx`) sits on the
grading screen and the quiz page. Quizzes graded before this existed were backfilled as released.

### Student work: one My work tab (owner, 2026-11-07)

A student's bar is Home · Calendar · My work (`/work`) · More (owner merged To do and
Submitted on 2026-11-07; `/submitted` is gone). My work puts what still needs doing on
top, grouped as Overdue, Returned — needs changes, Due this week, Later, Quizzes to take
(or one "all caught up" row), then the history: Assignments handed in and Quizzes taken,
newest first, Waiting for review / Reviewed said in words, never colour alone, no figure
tiles. The season page (`/season`) shows the next session only, the group as one card
(name, leaders and members as pills, never list rows) and Your submissions: the last
assignment handed in and the last quiz taken, with See all to My work. Student Home leads
with the season card, then the next session, then To do; while check-in is open and they
haven't checked in, the session leads. There is no attendance streak anywhere.

### A season's overview (owner, 2026-11-07)

`/seasons/[code]` is one page: the summary and figures, the next step, then one **People** card
(`design/seasons/people-card.tsx`): Admins (Super only), then each group with its leaders and up to
six of its students as pills, then "Not in a group". New group, Move students (the roster) and Manage
admins (`/seasons/[code]/admins`) live inside it; there is no separate Groups or Admins section. The
Manage tiles name what they open, never "Manage ...": Sessions (`/seasons/[code]/sessions`),
Assignments and Quizzes (the staff lists with `?seasonId`), End season, Results. Edit
and Duplicate are icon buttons beside the name. **A finished season is read-only**: people, groups
and sessions are read, nothing is added, moved or marked; a note offers "Duplicate as a draft".
Finished seasons still never reopen.

**Putting people into a season** (owner, 2026-11-07; spec
`docs/superpowers/specs/2026-11-07-season-people-entry-design.md`). There is no Add people tile: the
People card's Students level has the two ways in, **Community** (owner 2026-11-08; the button and links say
Community, the picker screen is titled Select from community; `/seasons/[code]/people`, people with an account) and **Invite new** (`/seasons/[code]/invite`); each
screen links to the other with `replace`. The picker's **Add the people who passed** chooser ticks a
finished season's passers (`people-candidates` `season.sources`, per person `places`); the season this
one normally follows (`suggestedSourceId`: the last finished season of `requiredProgram`, else of its
own `program`) is preselected on an empty draft, from `?from=`, and suggested on a draft's People card.
Someone who didn't pass or dropped out of the chosen season is ticked only after "Add anyway" ("Added
by choice"). A season's admin or a Super may override a required-program block. The group form's
Members pick only from the season's roster (`screens/group-form/`), each row saying where the person is
now; an empty roster points back to the season page.

### People lists, sign-in and emails (owner, 2026-11-07)

- **Super's Community tab** (`/community`, replacing the Students tab and the Users page) lists
  every account (owner 2026-11-08: a row's Invite / Resend is a pill beside it, the status chip under its
  meta line). Search and a filter icon (`FilterButton`) share one row; the sheet narrows by role
  and by account status. Its header button is **New member** (`/users/new`). "Add students in bulk"
  opens the importer, which takes plain `name, email` lines with no header row.
- **Students list.** Filter is the icon in the search row, never a chip under it. A Super filters
  by season first, then that season's groups. Alumni and Dropped are a Show choice in the sheet
  (`/students?show=alumni`), not pages. Every row names the active season, else "Last season: …"
  (`lastSeasonTitle`).
- **A student's page (staff):** Edit is a pencil beside the name; sections switch on a segmented
  control; an empty Details card is left out.
- **Sign-in:** no boxed card; Forgot password under its field; "or", then Continue with Google
  (not wired yet: it says so); the invite code is a full-width row of its own.
- **Inviting and re-inviting** (owner, 2026-11-07). A season's admin may add someone with no account
  into that season (`POST /students` with their `seasonId`, a draft or running one; the season's Add
  people screen has Invite new, `/seasons/[code]/invite`); only a Super creates someone with no season.
  A Super, or an admin of a season the student is live in, resends a stuck invite from the student's
  page (`POST /students/:id/invite`, sharing `answerResend` with `POST /users/:id/invite`); the staff
  detail carries `invite` (null once the account is set up).
- **Finished seasons stay finished** (owner, 2026-11-07): never reopened, and they take no late
  submissions.
- **Emails** (`src/lib/email-templates.ts`) are drawn dark with the app's tokens, the logo and the
  stores' official badges as inline cid images (`email-assets.ts`; Gmail shows no SVG or data
  URLs). The store row shows only once `APP_STORE_URL` / `PLAY_STORE_URL` are set. An email can't
  copy to the clipboard: a code selects in one tap instead.

### Motion: calm and quick (owner, 2026-11-06 and 2026-11-07)

It is an educational app: motion is for orientation, never decoration or play. The owner
found the tab bar, the sheets and the segmented control bouncy and "like a cartoon".
- No springs, overshoot or bounce anywhere: `withTiming` + `EASE_OUT`, stopping dead.
  Sheets rise in 260 ms; the pill highlight and the segmented thumb slide in `DURATION.fast`.
- Tabs switch instantly. Lists, rows, chips and numbers appear at once: no entrance
  animations, no stagger, no count-ups, no pulses, no scale on press (press dims instead).
- Light actions beside content (See all, Clear due date) are a `PillButton`; nothing is
  underlined (owner, 2026-11-07).
- Kept: the native stack push, sheet/modal fades, the skeleton shimmer, the check drawing
  itself on check-in, and the launch logo writing itself once per cold start.
- One motion per interaction. Don't add new animations unless the owner asks; always
  honour reduced motion.

### Home, check-in and offline (owner, 2026-11-08)

- **Home order, every role with a season:** the season ring (`SeasonPulse`) first, always; then
  `AnnouncementsHomeCard` (one compact row); then the session (live or next), callouts, work, people,
  events. Roles without a ring (mentor, alumni, between seasons) lead with the announcements row.
  Super is the exception: its Community tiles come first, then the overdue End prompt, then one
  Seasons list (a row per running season with a small ring, owner 2026-11-09), then announcements.
  The admin's overdue End prompt sits right under the ring (2026-11-09).
  Student Home has no late-submissions note.
- **Home tiles and rows** (owner, 2026-11-09): `CountGrid` shows only counts above zero, and all
  zero is one "All caught up" row; tones are `info` for ordinary work waiting, `warn` for late or
  due, `bad` for people at risk. Where the students at risk are named in a list, they get no tile
  (`NeedsActionList atRiskTile={false}` on Home). The ring card says what is left ("3 to go", "5 of 8
  sessions held"), and a student's figure is "Absences left" (full absences the budget still
  allows, rounded down). Upcoming events are grouped rows with a chevron. The leader's ring is the
  season's (the header names the group); the alumni Home never lists the "Your last season"
  season again under Your history; a mentor's note rows name the author only when it is someone else.
- **One session card on every Home** (owner, 2026-11-09): `SessionHomeCard` (`design/home/session-card.tsx`)
  for the student, leader and admin. The eyebrow carries the day cue, the title opens the session (no
  "Open session" button), and buttons show only for what can be done now (check in, Mark attendance,
  Join stream). It is the brand hero only while the session runs or carries an action; otherwise a
  plain card, so it never outweighs the season ring. The light `hero` token is a soft navy tint.
- **Check-in for students opens an hour before the session** (`isCheckInOpenForStudent`,
  `lib/check-in.ts`). An admin may open it earlier; until the hour, a student reads `checkInOpen`
  false and a scan answers 409 `not_open`. Staff see the real state.
- **Offline:** `OfflineScreen` (`design/layout/offline-screen.tsx`, mounted in `app/_layout.tsx`) covers
  the app after 1.5 s without a connection and leaves by itself on reconnect.
- **Assignments always go to the whole season:** the form has no "Assign to" (the API still accepts
  `groupIds`; saving an older group-targeted assignment widens it to the season).
- **Pull to refresh:** `design/lib/pull-refresh.ts` drops a pull on blur and remounts the
  RefreshControl on focus, because iOS leaves the spinner hanging if `refreshing` turns false while the
  screen is off the window. No input auto-focuses on open.

### Rules from the UI sweep

One line per class of bug the sweep has found, so the next screen doesn't repeat it.

- **Every input stays usable with the keyboard open, on Android too.** The focused field and its
  submit button must be scrollable above the keyboard. A `KeyboardAvoidingView` with
  `behavior={undefined}` on Android does nothing here (found on every signed-out form, Oct 2026).
  The app is edge-to-edge, so Android never resizes the window for the keyboard: put a form in
  `ShellFrame` or `AuthCard`, which pad their scroll content by the keyboard
  height and scroll the focused field above it (`design/lib/keyboard-inset.ts`). A bare `ScrollView` or
  `View` form hides its lower fields.
- **The focused field lands below the header, not just above the keyboard.** Scrolling a field into view
  must allow for the pinned/collapsed header, a `SaveBar` footer and a sheet's title: the Nov 2026 sweep found search
  fields behind the collapsed title (Students, Community), a textarea's caret line under the header (roster import),
  a SaveBar form's field scrolled off screen at 1.3, and a sheet's choice cut under its title while typing.
  A multi-line field scrolls to its caret line, not its bottom edge.
- **Error text uses a token that reaches 4.5:1.** `destructive` was #EF4444, 3.76:1 on white (Nov 2026 sweep);
  it is now the `bad` tone (#B42318 light, #F7A097 dark), and `design-tokens-contrast.test.ts` holds it at
  4.5:1 on every surface a form sits on. Never hand-pick a brighter red for caption text.
- **Last content clears the floating tab bar by the inset, not a flat 96px.** The bar sits at
  `max(16, bottom inset)`, so bottom padding in the shell comes from `useShellBottomPadding()`
  (`design/layout/shell-context.ts`). A hard-coded `pb-24` ends under the bar on a 3-button phone.
- **Text is 4.5:1, icons and control borders 3:1, in both themes.** A muted label at an alpha
  (`text-muted-foreground/70`) fails on white; use the full token. Measure, don't eyeball (ui-sweep skill).
- **Cap font scaling where a fixed-size container holds the text.** The tab bar labels stop at 1.15x
  (`maxFontSizeMultiplier`); a stat label gets two lines and shrinks. Never let a word break mid-word.
- **No fixed heights on text.** An `Input` is `min-h-*` with `py-0`, not `h-*`: a fixed height clipped the
  digits in number fields at font 1.3 (Minutes late, Score, Points). Title text beside a badge takes
  `min-w-0 flex-1` and the badge `shrink-0`; rows of buttons use `flex-wrap`, since two buttons overflow
  a 360dp phone at 1.3.
- **Never put `className` on a Reanimated `Animated.*` component.** css-interop merges it with
  the animated style and Reanimated's PropsFilter drops it in builds; put classes on a plain
  `View` inside. `no-classname-on-animated.test.ts` guards it.
- **Offsets above the keyboard come from `keyboardBottomOffset`** (`design/lib/keyboard-offset.ts`).
  Android reports the keyboard height without the nav bar, and an edge-to-edge `Modal` window
  is never resized.

## The mentor (owner, 2026-11-07)

Spec: `docs/superpowers/specs/2026-11-07-mentor-redesign-design.md`. A mentor walks alongside
students across seasons, so **the mentor sees nothing season-shaped**: no This season card, no
at-risk, no seasons, no groups, no Reports (`/reports` refuses them in the app; it is a pushed
route now, a tab for no role).
- **Nav:** Home · Community (`/students`; their people are **members**, students and alumni alike, never "students" in the copy) · Notes · Follow-ups · More (their profile is More's name row).
- **Home** (`MentorDashboard`): up to four numbers from `GET /me/mentor-summary`, each the total of
  the list it opens: Follow-ups due (`/follow-ups`) and Absent lately (`/students?absent=1`), shown
  only above zero (both zero is one "All caught up" row), Notes this week (`/notes?range=week`),
  Members. Then recent notes and events.
- **Follow-ups** (`MentorFollowUp`): flagged from the student's page ("Remind me to follow up",
  optional reason), due 7 days later, one open per mentor and student (409
  `already_following_up`). The daily Vercel Cron (`vercel.json`) calls
  `GET /internal/follow-ups/remind` with `CRON_SECRET`; unset, it is a 404 and nothing is sent.
  Each due follow-up is claimed by stamping `remindedAt`, then one `MENTOR_FOLLOWUP` goes to that
  mentor alone. It stays open until Mark done.
- **Absent lately:** the last two marked sessions that have started, any season, both ABSENT
  (LATE breaks it; fewer than two marks never counts): `GET /students?absentLately=1`, MENTOR only.
- **A student's page** (`MentorStudentPage`): no group under the name; Follow up; details; Notes
  (first) and Attendance grouped by season name. No figures, Submissions or Seasons.
- **Students** rows show university and faculty, never a season or group; the filter offers Who
  (Everyone / Absent lately) and sorts by name or university. **Notes** lists every note they may
  read (`/me/visible-notes`, `withinDays=7` for This week), with the author instead of a season.

## Roles (Build 2, owner rulings 2026-11-07)

- **The role claim is derived.** `loadScopes` (`lib/auth/scopes.ts`) computes `role` on every token
  from live season rows: a SeasonAdmin row means ADMIN, a GroupLeader row means LEADER, in a DRAFT
  or ACTIVE, non-deleted season (someone serving or enrolled in an ACTIVE season gets nothing from
  a DRAFT one until it starts). Stored `User.role` means **SUPER, MENTOR or STUDENT only**; SUPER
  and MENTOR are permanent and ignore season rows. Never gate on the stored role for staff.
- **`lib/roles` guards every seat write**: `activeRolesFor` reads a person's one active role,
  `lockPeople` / `lockSeason` take the row locks, and the refusal helpers (`seatRefusal`,
  `seatStudents`, `newPersonRefusal`, ...) answer 409 with the reason in words. Lock order is **Season, then
  People, then rows**, always; a new seat-writing path takes them in that order inside its
  transaction. That covers every enrolment-status write: a drop refuses a finished season
  (`season_finished`) and a draft (`season_draft`; Remove is the way off a draft), and updates only
  `where status ACTIVE`. End locks People before it writes a row and graduates only those whose row
  it completed. `deleteSeason` checks and deletes under the Season lock, and marks its staff stale.
  Staff must be alumni (`graduationYear` set), with no override; a student in a regular season must
  not be.
- **Your own record is the private view.** `GET /students/<own id>` answers private for everyone but
  SUPER, a serving alumnus included, so the staff note and drop reasons stay out; `useStudentDetail`
  parses it with the private schema.
- **Season role changes sign nobody out.** Assigning or removing a season role calls
  `markSessionsStale`, so the new claim arrives on the next silent refresh;
  `revokeAllRefreshTokensForUser` is not used on these paths. Changing a stored role
  (SUPER/MENTOR/STUDENT) or deactivating an account still signs them out.
- **`pnpm roles:convert`** (`scripts/convert-stored-roles.ts`) moves stored ADMIN/LEADER accounts
  to STUDENT. Read-only by default; `--apply` refuses while a live account lacks a `graduationYear`
  (a deactivated one is left alone and printed apart), else converts in one transaction. It is a script, not a migration, because no migration may change
  `User.role` values. Run it on a database the owner names, after `preflight:community`.
- **Graduation.** Super marks a season Graduating (`Season.graduatesOnPass`). Passing it graduates
  the student automatically at End (see "Graduating seasons" above), in the class of the season's
  own `year` whenever it ends; the app shows it as "School of {year}", and graduating someone who
  passed by hand with any other year is refused (`wrong_class`). Super may graduate an
  exception without a pass via `POST /students/:id/graduate` with `override: true`, which needs
  a reason and a tick (stored on the user, shown to SUPER only); it is audited without the reason. `PATCH /users` can't set or clear a stored STUDENT's year (409
  `use_graduate`); changing one year to another corrects a typo, audited and marked stale. Graduating deletes a place on a draft's roster, under Remove's rule
  (with work recorded on it, the row completes instead), and completes the rest of their regular-season places. **A community-wide season is never touched** (owner 2026-11-07): the graduate stays in it, draft or live, as an alumnus, keeps their group and gets a result at End.

## Community-wide seasons (Build 3, owner rulings 2026-11-07)

- **The flag.** `Season.isCommunityWide`: set on create, then changed only by Super and only while the
  season is a DRAFT (`season_started` after). It is refused together with `graduatesOnPass` or a
  `requiredProgram` (409 `community_wide_rules`): such a season graduates nobody, requires no program and
  keeps pass results. The season form hides both options once it is on.
- **It runs alone.** Start refuses (`start_blocked`) a community-wide draft while any other season is
  ACTIVE, and a regular draft while a community-wide one is. `GET /seasons/:id/start-check` lists them as
  `seasonsInTheWay` (id, code, title, message) and `ready` is false while any stands. `startSeason` takes
  `lockSeasonStart` (an advisory transaction lock on one fixed key) before anything else, so every start is
  serialised; lock order is global start lock (Start only), Season, People, rows. One person both serving
  and a student in one draft is a single `already_in_role` item in the student seat.
- **The picker.** `GET /seasons/:id/people-candidates` rows carry a `pool` (`student` | `alumni`); a
  community-wide season lists alumni, never Super or Mentor, and a regular one lists none. The mobile
  picker shows a Students and an Alumni tab, and **Select all available ticks both tabs** at once and
  shows the count (`Select all available (186)`); unticking is by hand. With no required program nobody
  is blocked, so an alumnus who did not pass an earlier community-wide season is simply `available`.
- **`isStudyingAlumnus` against `isAlumnus`** (`packages/shared/src/navigation.ts`, mirrored over a token in
  `lib/rbac.ts`). `isAlumnus` (role STUDENT and `graduationYear` set) is the permanent fact: the Alumni
  list, alumni-only events, the class "School of N" and the 403s on student pages. `isStudyingAlumnus`
  (an alumnus whose token has `activeSeasonId`, i.e. an ACTIVE enrolment in an ACTIVE season, only a
  community-wide one can seat them) decides the **experience**: `navFor`, Today's branch, the student
  dashboard, quizzes, submissions, check-in and profile edits behave as a student's. Gates read
  `isAlumnus(u) && !isStudyingAlumnus(u)` to refuse.
- **Where a studying alumnus is listed.** They stay under the Alumni list (`status=alumni`) and off the
  global active Students list, which filters on `graduationYear: null`. A list of one season's people
  (`seasonId`, a `groupId` of it, or a staff member's own roster) also holds them when that season is
  community-wide, via `graduationFilter` in `lib/queries/students/list.ts`; so do the season roster,
  attendance, trackers, reports and End's review. A regular season's graduates never appear. A dropped alumnus stays on their season's own list, as any
  dropped student does (`seasonId` matches any status).
- **Ending.** End-check students carry `graduationYear` (the review shows "School of N"), the confirm says
  how many people it ends the season for, and End graduates nobody and keeps every class. Alumni return to
  the alumni portal on their next refresh (`activeSeasonId` null), and their old attempts are refused.
- **Preflight.** `pnpm preflight:community` reports `communityWideNotAlone` (one row per ACTIVE
  community-wide season with another ACTIVE season alongside, `otherActiveSeasons`): a violation that blocks
  `--apply`, and "unknown" on a database without the `isCommunityWide` column. Alumni in a community-wide
  season are not listed as a review item; listed alumni are labelled as seeing the student app.

## Community model, Build 1 (owner rulings, 2026-11-06)

Design: `docs/superpowers/specs/2026-11-06-community-model-design.md`. Three TestFlight builds; Build 1
and Build 2 (see "Roles") and Build 3 (see "Community-wide seasons") are written.

- **One active role.** Every user has zero or one active role: a student in one ACTIVE season, or
  serving (admin and/or leader of one group) in one ACTIVE season; Super and Mentor are permanent
  roles and hold no season role. A DRAFT season's roles don't count until it starts. Build 1 only
  *checked* it; Build 2 enforces it on every seat write (see "Roles"). The check lives in
  `pnpm preflight:community` (read-only by default; prints the host and every violation: a leader
  with two groups or in two seasons, an admin of two ACTIVE seasons, admin in one season and leader
  in another (the same season is allowed), a student in two ACTIVE seasons, a Super or Mentor with
  season rows, staff who also hold an ACTIVE enrolment; `--apply` refuses while any exist, or once
  any enrolment has a `result` so it can't run twice, else backfills results in one transaction; on
  a database not migrated yet it prints the violations and says what is unknown).
  Build 2 added review lists (information only, never blocking `--apply`): stored ADMIN/LEADER
  without a `graduationYear`; live seat holders who aren't alumni; seat rows in DRAFT seasons
  (reported apart, not violations); stored STUDENTs holding live seats, split by `graduationYear`;
  alumni holding an ACTIVE enrolment in an ACTIVE regular season (a community-wide season's alumni are
  not listed).
  Run it against any database a release will reach before it; the backfill is not part of a
  migration because the old Neon database is kept and v1 writes it.
- **Season lifecycle.** DRAFT -> ACTIVE -> COMPLETED (-> ARCHIVED). **End season** (`POST
  /seasons/:id/end`; that season's admin, or Super) is refused with `season_unfinished` while any
  blocker stands: a SUBMITTED submission or quiz attempt not graded, a finished session with an
  ACTIVE student unmarked (only students enrolled by the time it started). `GET /seasons/:id/end-check` lists them with the students; the app shows
  blockers, else the review list where everyone **passes unless marked** (the POST carries only
  `notPassed`, with an optional staff-only reason). One transaction completes every ACTIVE
  enrolment with its `result`, WITHDRAWN ones are untouched, and the season's people's sessions go
  stale. Only Super reads and corrects results (`/seasons/:id/results`). `GET /seasons/overdue`
  feeds the Today callout for ACTIVE seasons past their end date. **Finished seasons are locked and
  never reopen**; their students still read their own work, read-only (responses carry `readOnly`).
  A status change on an existing season is only DRAFT -> ACTIVE or COMPLETED <-> ARCHIVED; nothing
  enrols into a finished season (`season_finished`). A draft's roster is not live: `readOnly`, no
  submitting and no notifications until it starts, and being taken off one isn't History. Former staff
  aren't listed the season (a leader's `GET /seasons`) or notified about its students.
- **Who a roster lists.** After End every enrolment is COMPLETED, so a staff roster, count, report or
  export filtering on `status: "ACTIVE"` blanks out every finished season. Use `seasonParticipant`
  (`lib/queries/season-participants.ts`): ACTIVE in a live season, ACTIVE and COMPLETED in a finished
  one, never WITHDRAWN. "Is this student live?" (`hasActiveEnrollment`, the token, check-in), who to
  notify and who holds End open stay on ACTIVE in an ACTIVE season, and must not match COMPLETED.
  What the group form and roster grid list, and all they may write, is `seasonRosterMember` (those
  participants who are live STUDENT users): a former student who now serves or a deleted account
  keeps their group. On `PATCH /groups/:id` an absent `leaderIds` or `studentIds` leaves it alone.
- **A rate limit never signs anyone out.** Only 400, 401 or 403 from refresh ends a session. When
  `/me` answers 429, or 401 with a refresh that couldn't answer, boot keeps the tokens and shows
  `BootRetry` (status `retry`) instead of sign-in, with Try again and a Sign out that works with no
  network (it clears the tokens on the phone; the refresh token isn't revoked server-side). Other indeterminate failures (offline, 5xx) still
  land on sign-in with the tokens kept.
- **`activeSeasonId` is a derived claim.** `lib/auth/scopes.ts` computes it on every token from the
  newest ACTIVE enrolment in an ACTIVE, non-deleted season; `seasonAdminIds` / `groupLeaderIds`
  likewise cover DRAFT or ACTIVE seasons only. The claim keeps its name, so the mobile app and
  tests are unchanged. **`StudentProfile.activeSeasonId` stays as an unused column** (migrations
  stay additive): nothing reads or writes it. Ending a season marks its people's sessions stale
  (`sessionsValidFrom`), so the change lands on their next refresh, not at the next login.
- **Former staff are cut off.** Once a season ends, its admins and leaders lose it with their
  scopes: no access to it and no History entry; only Super (and Mentors) read finished seasons.
  Their role is derived from season rows (Build 2), so it ends with the season.
  One exception (owner, 2026-11-07): Reports' History. An ADMIN's report scope
  (`reportScopeFor`) is every season they hold or held a SeasonAdmin row in, so a serving admin
  can read the engagement report of a season they ran before; its at-risk rows don't open
  student pages they can no longer read. Reports open on the current season, else the last one
  (`defaultReportSeason`).
- **Students between seasons** (no `activeSeasonId`) get Today, Calendar, History and More, with
  Today telling finished, dropped and first-time apart; the finished season has a read-only page
  with its assignments, quizzes and attendance. Alumni keep their own nav.

## Git

Since 2026-11-06 the project lives on the **`jesusprojectcommunity`** account.

- **Remotes.** `jpc` = `jesusprojectcommunity/space-v2` — Vercel deploys the
  backend from its `main`. `origin` = `MarkBotros0/space-v2`, the old home and
  PR history, kept as a mirror. Push every `main` change to **both**.
- **Commit author.** Commits are authored as `jesusprojectcommunity
  <353095907+jesusprojectcommunity@users.noreply.github.com>`, set in this
  repo's local git config (every worktree shares it). Don't override it:
  Vercel's Hobby plan **blocks any deployment whose commit author isn't the
  account owner** ("the commit author doesn't have permission to create
  deployments for this project"), and commits by `MarkBotros0` were blocked.
- **Pushing.** `gh` holds several accounts and the active one drifts; a wrong
  one fails with a misleading `Repository not found`. Pass the token for the
  one command rather than switching globally, then mirror as `MarkBotros0`:
  ```
  GH_TOKEN=$(gh auth token --hostname github.com --user jesusprojectcommunity) git push jpc HEAD:main
  gh auth switch --hostname github.com --user MarkBotros0 && git push origin HEAD:main
  ```

## Deployment (backend on Vercel)

- Vercel project `jesusprojectcommunity/jpc-space-be` (Hobby), production URL
  **https://jpc-space-be.vercel.app**, root directory `apps/backend` (its
  `vercel.json` builds from the repo root with pnpm + turbo). A push to `main`
  on `jpc` deploys production.
- The old project (`markbotros0`'s Vercel, `https://space-v2-be.vercel.app`)
  is superseded. The mobile app's `apps/mobile/app.json` → `extra.apiBaseUrl`
  points at `https://jpc-space-be.vercel.app` (overridable with
  `EXPO_PUBLIC_API_BASE_URL`, e.g. in EAS env vars). Builds made before this
  change still call the old URL until they're replaced.
- **Database:** Prisma Postgres `prisma-postgres-claret-school` (Postgres 17),
  copied on 2026-11-06 from the shared Neon database (`ep-cold-mode-…`, the
  one v1 `jpc-space` ran on) with `pg_dump`/`pg_restore` of `public`; all 34
  tables' row counts, 63 FKs, 100 indexes, 13 enums and 24 migrations matched.
  Owner ruling: this is a test database too ("There's no live, it's a test
  db"), so there is no final copy at cut-over. Nothing depends on Neon any
  more; it stays alive and undeleted, but no `.env` points at it. The local
  `.env` points at a local Postgres `space_test` (docker container
  `space-v2-sweepdb`, 127.0.0.1:55440), where the integration tests run. Check
  the host before running anything that writes elsewhere; never print
  `DATABASE_URL`.
- **`DATABASE_URL` on Vercel is the pooled URL** (`@pooled.db.prisma.io`), set
  by hand. The direct database allows ~50 connections and each serverless
  instance opens its own pool, so a direct URL runs out under load. The
  integration's own variables were removed so nothing shadows it.
- Other vars: `AUTH_SECRET` (new random value, Sensitive), `NODE_ENV=production`,
  `TRUST_PROXY=1`, `ENABLE_UPLOADS=false`, `MOBILE_APP_SCHEME=spacev2`.
  `GMAIL_USER`/`GMAIL_APP_PASSWORD` are not set yet, so invite and reset emails
  don't send.
- Never `vercel deploy` from a working tree: it uploads untracked files such as
  `.env`. For a manual deploy, deploy a clean `git archive` export.

## Docs

- Community model: `docs/superpowers/specs/2026-11-06-community-model-design.md`
- Design: `docs/superpowers/specs/2026-08-20-space-v2-monorepo-design.md`
- Plan: `docs/superpowers/plans/2026-08-20-space-v2-scaffold.md`
- API port plan: `docs/superpowers/plans/2026-08-20-space-v2-api-port.md`
- Migration roadmap (18 plans, execution order, cross-plan rulings X1–X17):
  `docs/superpowers/plans/2026-08-24-migration-roadmap.md`. Plan files are
  `docs/superpowers/plans/2026-10-05-plan-NN-*.md`; plan number = execution
  order, run 1 → 18.
