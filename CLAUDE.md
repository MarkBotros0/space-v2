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

`test` runs the Turbo tasks `test:unit` then `test:integration` (there is no
`test` Turbo task itself — it's a root `package.json` script). `test:integration`
is uncached (`cache: false` in `turbo.json`) and hits the live staging database,
so it always actually executes. The backend's `start` script is
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
is `forbidden(res)` from `routes/respond.ts`.
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
recorded files still work. A CMS becomes a third `Storage` driver beside
`LocalFsStorage` and `S3Storage`; no route changes.

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
Today first, at most 5 per role. A href that is a tab for some role is in `ALL_TAB_HREFS`
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
rather than casting, so a backend drift fails at the boundary. Queries
depending on `scopes.activeSeasonId` (or any nullable id) must pass `enabled`
— and guard manual `refetch()` too, since `enabled` only gates the automatic
run. Map states to the primitives: `RouteSkeleton`, `RouteError` with `onRetry`
wired to `refetch` (`InlineError` for one card's query), `EmptyState`.

**Domain contracts are Zod, not bare interfaces.** `session.ts`'s
`sessionListItemSchema` is the source of truth and its type is `z.infer` of it.
The remaining interfaces in `packages/shared` predate this and should convert
as each domain lands.

**The redesign spec is the UI reference** (owner lifted "match v1" on 2026-11-04;
`docs/superpowers/specs/2026-11-04-mobile-redesign-design.md`). jpc-space stays the source
of truth for behaviour and copy, not look; the v1 side-by-side is no longer the acceptance
check, the UI sweep is. Styling is NativeWind over `src/design/theme/tokens.json`, the
owned token source (`pnpm --filter @space/mobile design:tokens` regenerates `global.css`
and `tailwind-theme.js`): semantic tokens, status tones, `pill*`, `surface-raised`,
`control-border` and `ring` (both >=3:1). Raw colours for charts/SVG come from
`design/theme/palette.ts` or `useThemeColors()`, never hex literals.

- **Frame.** Every screen renders `Screen` (`design/layout/screen.tsx`): large collapsing
  title, `back`, `home` (bell + user menu, Today only), the offline banner, and the top
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
  `tab-bar-scroll`. The pill is solid on iOS and Android (owner 2026-11-05, R38): one
  opaque `bg-pill`, no blur, no per-platform fill. Render text with `ui/text.tsx` and its `variant` scale (largeTitle,
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
- **Motion** (`src/design/motion/`): durations `fast` 150 / `base` 220 / `slow` 320 ms and
  springs `snappy` / `gentle`; press scale via `usePressScale`; haptics via `haptic()`.
  Every animated component reads `useReducedMotion` (movement becomes a short crossfade;
  stagger and count-ups off; press scale stays). Exits are faster than entrances, a new tap
  cancels motion in flight, and no state depends on an animation finishing.

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

- `/settings` is a hub with two pages: `settings/profile` (name, phone, date
  of birth, address — `User` columns, PATCH /me, every role) and
  `settings/notifications` (push first; the per-kind switches show only once
  push is on for the phone).
- No password form in the app: "Forgot password?" on sign-in is the only way
  to set one. No "Sign out everywhere".
- Sign out and Delete account (DELETE /me, a soft delete) live on More; on
  Profile for MENTOR, who has no More tab.
- The student Profile tab edits only university, faculty and university
  graduation year (`StudentProfile.universityGraduationYear`, may be in the
  future — not `User.graduationYear`, which marks a JPCS alumnus).

### Graduating seasons (owner, 2026-11-07)

Students graduate by passing a season a super marked **Graduating season**
(`Season.graduatesOnPass`; super-only, changeable until the season has finished).
End graduates everyone who passed in its own transaction, whoever ends it; the
year is `graduationYearFor` (the smaller of the end year and the current year, org
time). Correcting a result to Passed on such a season graduates then; Did not pass
never removes alumni status. `POST /students/:id/graduate` is the exception: without
a pass it answers `not_qualified`, and `override: true` is audited. Backfills and old
results never graduate anyone. The app's second confirmation is the same sheet changing
its words: never close one modal and open another, iOS can drop the second.

### Student work: two tabs (owner, 2026-11-06)

A student's bar is Today · Calendar · To do (`/work`) · Submitted
(`/submitted`) · More. To do groups open work as Overdue, Returned — needs
changes, Due this week, Later, Quizzes to take. Submitted lists handed-in
assignments (Waiting for review / Reviewed, said in words, never colour
alone) and taken quizzes (score, or Not graded yet). Keep it that clear.

### Motion: keep it restrained (owner, 2026-11-06)

The owner found the tab bar over-animated (springing highlight + bouncing icon).
Motion is for orientation, not decoration:
- No springs or overshoot on navigation chrome; a short ease-out
  (`DURATION.fast`, 150ms) at most. No scale/bounce on icons or tabs.
- One motion per interaction — don't stack a slide, a scale and a fade on the
  same tap. No looping or attention-seeking animation.
- Don't add new animations unless the owner asks; always honour reduced motion.

### Rules from the UI sweep

One line per class of bug the sweep has found, so the next screen doesn't repeat it.

- **Every input stays usable with the keyboard open, on Android too.** The focused field and its
  submit button must be scrollable above the keyboard. A `KeyboardAvoidingView` with
  `behavior={undefined}` on Android does nothing here (found on every signed-out form, Oct 2026).
  The app is edge-to-edge, so Android never resizes the window for the keyboard: put a form in
  `ShellFrame` or `AuthCard`, which pad their scroll content by the keyboard
  height and scroll the focused field above it (`design/lib/keyboard-inset.ts`). A bare `ScrollView` or
  `View` form hides its lower fields.
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

## Community model, Build 1 (owner rulings, 2026-11-06)

Design: `docs/superpowers/specs/2026-11-06-community-model-design.md`. Three TestFlight builds; only
Build 1 exists.

- **One active role.** Every user has zero or one active role: a student in one ACTIVE season, or
  serving (admin and/or leader of one group) in one ACTIVE season; Super and Mentor are permanent
  roles and hold no season role. A DRAFT season's roles don't count until it starts. **Build 1 does
  not enforce this on writes** and still gates staff on the global `role`; it only *checks* it, in
  `pnpm preflight:community` (read-only by default; prints the host and every violation: a leader
  with two groups or in two seasons, an admin of two ACTIVE seasons, admin in one season and leader
  in another (the same season is allowed), a student in two ACTIVE seasons, a Super or Mentor with
  season rows, staff who also hold an ACTIVE enrolment; `--apply` refuses while any exist, or once
  any enrolment has a `result` so it can't run twice, else backfills results in one transaction; on
  a database not migrated yet it prints the violations and says what is unknown).
  Run it against the real
  database before anything depends on the rule; the backfill is not part of a migration because
  `migrate deploy` also reaches Neon, which v1 writes. Enforcement, roles from season rows and the
  pickers are Build 2.
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
  They keep their global role and tabs until Build 2, so their season lists can look empty for one
  TestFlight cycle.
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
  v1 is to be retired (it still writes to Neon until it's stopped, so do a
  final copy at cut-over). The local `.env` still points at Neon —
  check the host before running anything that writes.
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
