# apps/mobile — Claude Context

Expo + expo-router, React Query (server data), Zustand (`src/store/session.ts`: session and push
token; `src/design/layout/tab-bar-scroll.ts`), tokens in expo-secure-store. Loaded when you work under
`apps/mobile/`; the root `CLAUDE.md` (hard constraints, standards, Git) still applies. Product rules
live in `docs/rules/`; read the one for the feature you touch.

## Code map

Paths are under `apps/mobile/` unless written in full. A screen is four layers; open them in order.

| Layer | Where | Holds |
|---|---|---|
| Route | `app/` (`(app)/(tabs)/` for tabs, `(app)/<name>/` for pushed and detail routes) | thin: params, queries, `QueryGate`, then the screen |
| Screen | `src/screens/<feature>/` | the UI and its pure model or state hook; parts shared by several screens live in the owning feature's folder |
| Data | `src/hooks/use-<domain>.ts` or `src/hooks/use-<domain>/` | React Query hooks over `apiGet` / `apiSend`; keys in `src/lib/query-keys.ts` |
| Contract | `packages/shared/src/<domain>.ts` | the Zod schema every response is parsed with |

| Feature | Route(s) under `app/(app)/` | Screen | Hook |
|---|---|---|---|
| Home (every role) | `(tabs)/dashboard.tsx` | `src/screens/home/` (shared Home parts), `today/`, `staff-today/`, `leader-today/`, `mentor/`, `alumni/` | `use-dashboard.ts`, `use-staff-today.ts` |
| Seasons | `(tabs)/seasons/`, `seasons/[code]/`, `seasons/new.tsx` | `src/screens/season/`, `season-people/`, `season-roster/`, `season-start/`, `season-end/`, `season-form/`, `season-admins/` | `use-seasons.ts`, `use-season-writes.ts`, `use-season-route.ts`, `use-season-start.ts`, `use-season-end.ts`, `use-season-people.ts` |
| Student's season | `season.tsx`, `past-season/` | `src/screens/season/`, `past-season/` | `use-seasons.ts` |
| Sessions, attendance, check-in | `session/`, `attendance.tsx`, `app/checkin/[token].tsx` | `src/screens/session-detail/`, `session-form/`, `check-in/` | `use-sessions.ts`, `use-session-detail.ts`, `use-session-writes.ts`, `use-attendance.ts`, `use-check-in.ts` |
| Calendar | `(tabs)/calendar.tsx` | `src/screens/calendar/`, the season calendar widget `src/design/calendar/` | `use-sessions.ts`, `use-events.ts` |
| Groups | `(tabs)/groups.tsx`, `group/` | `src/screens/groups-admin/`, `leader-groups/`, `group-form/`, `group-import/` | `use-groups.ts`, `use-group-admin.ts`, `use-import.ts` |
| Students and community | `(tabs)/students/`, `(tabs)/community.tsx`, `student/`, `students/new.tsx` | `src/screens/students-list/`, `student-detail/` (shared by staff and mentor pages), `student-admin/`, `community/` | `use-students/`, `use-users.ts` |
| Users and import | `user/`, `users/` | `src/screens/user-import/`, `user-form/` | `use-users.ts`, `use-import.ts` |
| Assignments and submissions | `assignment/`, `assignments.tsx`, `submission/`, `(tabs)/submissions.tsx`, `(tabs)/work.tsx` | `src/screens/assignment-form/`, `assignment-detail/`, `submission-review/`, `staff-queue/`, `staff-work/`, `work/`, `leader-submissions/` | `use-assignments.ts`, `use-assignment-writes.ts`, `use-submission.ts`, `use-submission-queue.ts` |
| Quizzes | `quiz/`, `quizzes.tsx` | `src/screens/quiz-detail/`, `quiz-edit/`, `quiz-grade/` | `use-quizzes/`, `use-quiz-authoring.ts`, `use-session-quizzes.ts` |
| Video questions | `session/` | `src/screens/video-quiz/`, `src/lib/video-question-form.ts` | `use-video-quiz.ts` |
| Announcements and polls | `announcements/` | `src/screens/announcements/` (poll in `src/screens/announcements/poll/`) | `use-announcements.ts` |
| Forum | `session/` | `src/screens/forum/` | `use-forum.ts` |
| Notes and follow-ups | `(tabs)/notes.tsx`, `(tabs)/follow-ups.tsx` | `src/screens/staff-notes/`, `mentor/` | `use-notes.ts`, `use-follow-ups.ts` |
| Reports and exports | `reports.tsx`, `attention/` | `src/screens/reports/`, `attention/`, charts in `src/design/charts/` | `use-reports.ts`, `use-engagement.ts`, `use-report-export.ts` |
| Events | `events.tsx`, `event/` | `src/screens/events/` | `use-events.ts` |
| Profile, account, settings | `(tabs)/profile.tsx`, `edit-profile.tsx`, `(tabs)/more.tsx`, `settings/`, `notifications.tsx` | `src/screens/profile/`, `settings/` | `use-me.ts`, `use-account.ts`, `use-notifications.ts` |
| Alumni | `(tabs)/history.tsx` | `src/screens/alumni/` | `use-me.ts` |
| Signed out | `app/login.tsx`, `forgot-password.tsx`, `reset-password.tsx`, `accept-invite.tsx` | `src/design/layout/auth-card.tsx` | `use-password-reset.ts`, `use-accept-invite.ts` |
| Design catalogue | `design-catalogue.tsx` | `src/screens/design-catalogue/` | — |

**Where a new file goes.** A route file in `app/` stays thin. Anything about one feature, data-bound
or not, goes in `src/screens/<feature>/`, kebab-case; `src/screens/shell/` holds the app-wide pieces
(push bridge, boot retry). `src/design/` is only the domain-free kit: `ui/` (components), `layout/`
(Screen, tab bar, route states, SaveBar), `calendar/`, `charts/`, `forms/`, `theme/` (tokens),
`motion/`, `lib/`, `icons/`, `brand/`. Lint stops `src/design/` importing hooks, the store or a
screen; the shell pieces in `src/design/layout/` (`home-actions`, `more-menu`, `dev-user-switcher`,
`route-states`) are the named exceptions. Navigation config is
`packages/shared/src/navigation.ts`; route-name lists are in `src/lib/route-names.ts`. Tests live in
`src/__tests__/` (helpers in `src/__tests__/helpers/`).

## Conventions (Phase 0 established these — follow them)

**Files.** Never put non-route files under `app/` (expo-router makes every file a route): screen
sections go in `src/screens/<screen>/`.

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

## Building a screen that passes the sweep

Design for the hardest cell first: a 360dp Android phone at font scale 1.3 with a 3-button nav bar, in
light and dark. `src/__tests__/sweep-rules.test.ts` holds the rules a file can show: no fixed height on
text, no large hard-coded bottom padding, no `autoFocus`, no faded text token (strict), and no new
hand-built " · " line, "—" empty value or inline "pts" (a ratchet over today's offenders: fix one and
lower its count, never add one). The rest needs your eyes. Before calling a screen done:

1. **Kit only.** The root is `Screen`; a form's Save is its `footer={<SaveBar … />}`; states come from
   `QueryGate` / `queryStateView`; text is a `ui/text.tsx` variant; colours, radii and elevation are
   tokens. These carry the keyboard, inset, tab-bar and contrast rules below for free.
2. **Every state has words:** loading, error with retry, empty, read-only (finished season), not open yet.
   An empty value says so in words, never "—" or a blank.
3. **It fits at 1.3 on 360dp:** no fixed height on text, `min-w-0 flex-1` beside a badge, `flex-wrap` on
   button rows, no word broken mid-word, the last row clear of the tab bar.
4. **The keyboard leaves every field usable:** each input and its submit reachable, the focused field
   below the header and above the SaveBar.
5. **Catalogue and flow:** add the new component's states to the design catalogue (`s90`) and a
   read-only Maestro flow under `apps/mobile/.maestro/sweep/` that scrolls to the end and opens the
   keyboard on each field; then run the `ui-sweep` skill and look at the 360dp/1.3 light shot and the
   dark shot first.

## Rules from the UI sweep

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
- **No line built from parts joined by " · ".** At 1.3 the parts wrap apart and leave a dangling dot or
  split a date across lines (Nov 2026 sweep). Put each fact on its own line, or keep a date or time in
  one unbreakable run.
- **Counts go through `plural()` / `people()` (`src/lib/plural.ts`).** The Nov 2026 sweep found "1 pts".
- **An empty value is a word.** "Not answered", "No phone number", never "—" or nothing (the sweep found
  a quiz answer shown as "—").
- **Offsets above the keyboard come from `keyboardBottomOffset`** (`design/lib/keyboard-offset.ts`).
  Android reports the keyboard height without the nav bar, and an edge-to-edge `Modal` window
  is never resized.
