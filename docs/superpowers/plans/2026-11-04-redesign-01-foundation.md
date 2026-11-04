# Redesign 01: Foundation (tokens, motion, components, shell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build step 1 of the mobile redesign: the new token set, motion foundation, the ~15
shared components, the frosted pill with sliding highlight, large-title screens, native stack
navigation for detail screens, and the new per-role tab sets, so the role batches (plans 02–05)
only compose screens.

**Architecture:** Tokens stay generated into `global.css` + `tailwind-theme.js`, but from a new
owned source (`src/design/theme/tokens.json`) instead of v1's export; the existing semantic class
names keep their names so untouched screens compile and pick up the new palette. New components
live in `src/design/` beside the old ones; old ones are deleted by the role batches as their last
user goes. The `(app)` group becomes a Stack whose first screen is a `(tabs)` group, so detail
routes push with native transitions and swipe-back instead of being hidden tabs.

**Tech Stack:** Expo SDK 58, expo-router 58, NativeWind 4, react-native-reanimated 4.7,
react-native-gesture-handler 3.3, expo-blur, expo-haptics (new), Jest + @testing-library/react-native.

**Spec:** `docs/superpowers/specs/2026-11-04-mobile-redesign-design.md`

**Later plans (written when this one is done):** 02 student (+ signed-out, settings), 03 leader,
04 admin + super, 05 mentor + alumni (each: Today endpoint if needed, screens, sweep flows), 06
iPhone pass and conventions update. Each is its own plan because each ships and is swept alone.

## Global Constraints

- Every source and test file ≤ 400 lines; relative imports only; no `@/` alias; no non-route files under `app/`.
- No `process.env` outside `src/lib/app-config.ts` (mobile) / `src/lib/config.ts` (backend).
- Brand stays: navy and teal ramps, JPC mark, Geist (`src/design/theme/fonts.ts`).
- Contrast: text 4.5:1, icons and control borders 3:1, in light and dark.
- Tap targets ≥ 44pt; works at font scale 1.3 on a 360dp phone; no fixed heights on text.
- Motion durations: `fast` 150ms, `base` 220ms, `slow` 320ms; springs `snappy` and `gentle`; exits faster than entrances; everything interruptible; reduce-motion swaps movement for crossfades and turns off count-ups, staggers and shared-element transitions.
- Last scroll item clears the pill by `useShellBottomPadding()`; the pill sits at `max(16, bottom inset)`.
- No backend changes in this plan.
- One commit per task, message ending with the session's Co-Authored-By / Claude-Session lines; push to main after the task's checks pass.
- No test or store build is cut during the redesign (owner): `main` may mix old and new screens until plan 05 lands.

## Review Focus

1. **Font scale 1.3 on a 360dp phone in chips, list rows and the pill labels:** labels wrap or shrink, never clip mid-word (tests in Tasks 5, 6, 11).
2. **Reduce motion on:** every animated component renders its final state with no movement (Task 3 test for the gate; each motion task asserts the reduced path).
3. **A second tab tap while the highlight is still sliding:** lands on the second tab, highlight ends under it (Task 11).
4. **Android pill without blur:** labels and icons still 3:1 over white and over navy content behind the pill (Task 1 contrast test includes the pill's translucent fill composited on both).
5. **Keyboard open in a sheet:** the save bar stays visible above the keyboard (Task 8).

---

### Task 1: Owned token source and new semantic tokens

**Files:**
- Create: `apps/mobile/src/design/theme/tokens.json`
- Modify: `apps/mobile/scripts/generate-design-tokens.mjs` (read `src/design/theme/tokens.json`, not `docs/superpowers/ui-rebuild/v1-tokens.json`; header comment)
- Regenerate: `apps/mobile/global.css`, `apps/mobile/src/design/theme/tailwind-theme.js`
- Test: `apps/mobile/src/__tests__/design-tokens-contrast.test.ts`

**Interfaces:**
- Produces: classes `bg-surface`, `border-separator`, `bg-ok-soft text-ok`, `bg-warn-soft text-warn`, `bg-bad-soft text-bad`, `bg-info-soft text-info`, `bg-neutral-soft text-neutral-strong`, `bg-pill` (translucent navy), `text-pill-foreground`, `text-pill-active`; all existing semantic names kept. `useThemeColors()` returns the new keys too.

- [ ] **Step 1: Write the failing test** `design-tokens-contrast.test.ts`: load `tokens.json`; for each theme assert `contrast(foreground, background) >= 4.5`, `contrast(muted-foreground, surface) >= 4.5`, `contrast(muted-foreground, background) >= 4.5`, each status `contrast(<tone>, <tone>-soft) >= 4.5`, `contrast(primary-foreground, primary) >= 4.5`; pill: composite `pill` over `#FFFFFF` and over `brand-navy.950`, then `contrast(pill-foreground, composite) >= 4.5` and `contrast(pill-active, composite) >= 3`. `contrast()` is WCAG `(L1+0.05)/(L2+0.05)` on sRGB-linearised luminance, written in the test file.
- [ ] **Step 2: Run** `pnpm --filter @space/mobile exec jest design-tokens-contrast` → FAIL (file missing).
- [ ] **Step 3: Write `tokens.json`** with the shape v1-tokens.json has (`light`, `dark`, ramps, radius, shadow, fonts) plus the new keys. Values: start from the mockup's tokens (light `background #F4F6FB`, `surface #FFFFFF`, `foreground #142048`, `muted-foreground #4B5878`, `separator #DCE2EF`, `ok #1F6B45/#E3F5EC`, `warn #9A5B00/#FFF3DC`, `bad #B42318/#FDECEA`, `info #2E7679/#E2F4F5`; dark `background #0B1230`, `surface #16204A`, `foreground #ECEFF7`, `muted-foreground #ABB7D4`, `separator #2A3A63`, `ok #7FD8A8/#0E3322`, `warn #F5C46B/#3A2A08`, `bad #F7A097/#3D1210`, `info #7DCED1/#103436`; `primary` light `#142048` on `#FFFFFF`, dark `#7DCED1` on `#103436`; `pill` `rgba(20, 32, 72, 0.62)` light, `rgba(36, 52, 110, 0.70)` dark; `pill-foreground #D4DAEA`, `pill-active #ABDFE2`); ramps copied from v1-tokens.json unchanged. Adjust any value the test rejects.
- [ ] **Step 4: Point the generator at it**, run `pnpm --filter @space/mobile design:tokens`, then the test → PASS.
- [ ] **Step 5: Run** `pnpm --filter @space/mobile typecheck && pnpm --filter @space/mobile test:unit` → all pass (snapshot-free suites; class names unchanged).
- [ ] **Step 6: Commit** `feat(mobile): owned design tokens with surface, separator, status tones and pill`.

### Task 2: Type scale and spacing

**Files:**
- Modify: `apps/mobile/src/design/theme/tokens.json` (add `fontSize`), generator (emit `fontSize`), `apps/mobile/tailwind.config.js` (`theme.extend.fontSize = theme.fontSize`)
- Modify: `apps/mobile/src/design/ui/text.tsx` (add `variant` prop)
- Test: `apps/mobile/src/__tests__/text-variants.test.tsx`

**Interfaces:**
- Produces: classes `text-large-title` (30/34, weight 800), `text-title` (22/28, 600), `text-headline` (17/22, 600), `text-body` (16/24), `text-subhead` (14/20), `text-caption` (12/16); `<Text variant="largeTitle" | "title" | "headline" | "body" | "subhead" | "caption">` (default `body`), `tabular` boolean prop → `fontVariant: ["tabular-nums"]`.

- [ ] **Step 1: Failing test** renders each variant and asserts the flattened style's `fontSize`/`lineHeight` (30/34, 22/28, 17/22, 16/24, 14/20, 12/16) and that `tabular` sets `fontVariant` `["tabular-nums"]`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the token entries and the `variant`/`tabular` props.
- [ ] **Step 4: Run** test → PASS; full mobile unit suite → PASS.
- [ ] **Step 5: Commit** `feat(mobile): type scale and Text variants`.

### Task 3: Motion foundation and haptics

**Files:**
- Create: `apps/mobile/src/design/motion/tokens.ts`, `use-reduced-motion.ts`, `use-press-scale.ts`, `entering.ts`, `haptics.ts`, `index.ts`
- Modify: `apps/mobile/package.json` (`npx expo install expo-haptics`)
- Test: `apps/mobile/src/__tests__/motion.test.tsx`

**Interfaces:**
- Produces:
  - `DURATION: { fast: 150; base: 220; slow: 320 }`; `SPRING: { snappy: WithSpringConfig; gentle: WithSpringConfig }` (snappy ≈ damping 18, stiffness 260; gentle ≈ damping 22, stiffness 160);
  - `useReducedMotion(): boolean` (Reanimated's `useReducedMotion`, overridable in tests via `setReducedMotionForTests(v: boolean | null)`);
  - `usePressScale(scale = 0.97): { animatedStyle; onPressIn(): void; onPressOut(): void }`;
  - `listItemEntering(index: number, reduced: boolean)` → Reanimated entering animation: `FadeInDown.duration(DURATION.base).delay(min(index, 7) * 35)` translating 6px; `FadeIn.duration(DURATION.fast)` when reduced; `undefined` for index ≥ 8;
  - `haptic(kind: "success" | "light" | "selection"): void` (expo-haptics; swallows errors).

- [ ] **Step 1: Failing tests:** `usePressScale` starts at scale 1, `onPressIn` targets 0.97, `onPressOut` targets 1 (Reanimated jest mock + `jest.useFakeTimers`); `listItemEntering(0,false)` has delay 0, `(3,false)` delay 105, `(9,false)` is `undefined`, `(2,true)` has no delay; `haptic("success")` calls `Haptics.notificationAsync(Success)` and a rejected promise does not throw; `useReducedMotion` returns the test override.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the six files; install expo-haptics.
- [ ] **Step 4: Run** → PASS; typecheck.
- [ ] **Step 5: Commit** `feat(mobile): motion tokens, press scale, list entering and haptics`.

### Task 4: Button and pressables

**Files:**
- Modify: `apps/mobile/src/design/ui/button.tsx`
- Test: `apps/mobile/src/__tests__/button.test.tsx` (extend if it exists)

**Interfaces:**
- Consumes: `usePressScale`, `haptic` (Task 3); `Text` variants (Task 2).
- Produces: `Button` variants `primary | secondary | destructive | plain` (existing variant names kept as aliases mapping onto these); `size` `md` (min-height 46) | `sm` (min-height 44); `loading` shows a spinner and blocks presses; radius 14.

- [ ] **Step 1: Failing tests:** each variant renders with its tokens' classes; `minHeight` ≥ 44 for `sm`; `loading` disables `onPress`; existing alias variants still render (no call sites break).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** with `Animated.View` + `usePressScale`. **Step 4: Run** full unit suite → PASS.
- [ ] **Step 5: Commit** `feat(mobile): Button variants with press scale`.

### Task 5: StatusChip

**Files:**
- Create: `apps/mobile/src/design/ui/status-chip.tsx`
- Test: `apps/mobile/src/__tests__/status-chip.test.tsx`

**Interfaces:**
- Produces: `type ChipTone = "ok" | "warn" | "bad" | "info" | "neutral"`; `<StatusChip tone label />`; `statusChip(kind, value): { tone: ChipTone; label: string }` for `kind` ∈ `season` (DRAFT neutral "Draft", ACTIVE ok "Active", COMPLETED info "Completed", ARCHIVED neutral "Archived"), `enrollment` (ACTIVE ok, COMPLETED info, WITHDRAWN bad "Dropped"), `attendance` (PRESENT ok, LATE warn, ABSENT bad), `submission` (DRAFT neutral, SUBMITTED info, REVIEWED ok, RETURNED warn), `quizAttempt` (IN_PROGRESS warn "In progress", SUBMITTED info, GRADED ok), `user` (active ok, invited info, pending warn, inactive neutral), plus `due` helpers `dueChip(dueAt: Date, now: Date)` → overdue bad "Overdue", ≤2 days warn "Due in N days"/"Due today", else neutral "Due <weekday>".
- Chip: crossfades (`DURATION.fast`) when label changes; `maxFontSizeMultiplier` 1.3; `shrink-0`; never wraps mid-word.

- [ ] **Step 1: Failing tests:** every enum value of each schema from `@space/shared` maps to a tone and non-empty label (iterate `schema.options`); `dueChip` boundaries (−1 min → Overdue, today, 2 days, 3 days); chip has `accessibilityLabel` equal to its label.
- [ ] **Step 2–4:** run FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(mobile): StatusChip and the status vocabulary`.

### Task 6: Lists, cards and figures

**Files:**
- Create: `apps/mobile/src/design/ui/grouped-list.tsx` (`GroupedList`, `ListRow`, `ListSectionHeader`), `hero-card.tsx`, `stat-tile.tsx`, `segmented-control.tsx`, `search-field.tsx`
- Test: `apps/mobile/src/__tests__/grouped-list.test.tsx`, `figures.test.tsx`, `segmented-control.test.tsx`

**Interfaces:**
- Consumes: Tasks 2, 3, 5.
- Produces:
  - `<GroupedList>{rows}</GroupedList>` (surface, radius 16, hairline `separator` between children, optional `header` string);
  - `<ListRow title subtitle? trailing?: ReactNode chevron? onPress? index? />` (min-height 52; title one line with ellipsis; subtitle `caption`; `index` drives `listItemEntering`; press scale when `onPress`);
  - `<HeroCard eyebrow title meta action? />`;
  - `<StatTile value: number | string suffix? label />` (numbers count up over `DURATION.slow` unless reduced; `tabular`);
  - `<SegmentedControl options: {value,label}[] value onChange />` (thumb slides with `SPRING.snappy`);
  - `<SearchField value onChangeText placeholder />`.

- [ ] **Step 1: Failing tests:** ListRow renders title/subtitle/chevron, `onPress` fires, row without `onPress` is not a button; StatTile shows the final value immediately when reduced motion is on; SegmentedControl `onChange` fires with the tapped value and the selected option has `accessibilityState.selected`; ListRow title at font scale 1.3 keeps `numberOfLines={1}`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(mobile): grouped lists, hero card, stat tile, segmented control, search`.

### Task 7: States: empty, error, skeleton, toast

**Files:**
- Modify: `apps/mobile/src/design/ui/empty-state.tsx`, `apps/mobile/src/design/layout/route-states.tsx`, `apps/mobile/src/design/ui/toaster.tsx`
- Create: `apps/mobile/src/design/ui/skeleton.tsx`
- Test: `apps/mobile/src/__tests__/states.test.tsx`

**Interfaces:**
- Produces: `EmptyState({ title, description?, action?: { label, onPress } })`; `RouteError({ onRetry })` and `InlineError` keep their props; `Skeleton({ width?, height, radius? })` shimmer (off when reduced); `RouteSkeleton` rebuilt from `Skeleton` rows; toasts restyled to tokens.

- [ ] **Step 1: Failing tests:** EmptyState action button calls `onPress`; RouteError retry calls `onRetry`; Skeleton under reduced motion has no running animation (static opacity).
- [ ] **Step 2–4:** FAIL → implement → PASS; full unit suite PASS (existing screen tests use these).
- [ ] **Step 5: Commit** `feat(mobile): restyled empty, error, skeleton and toast states`.

### Task 8: Sheet and save bars

**Files:**
- Create: `apps/mobile/src/design/ui/sheet.tsx` (`Sheet`, `SheetSaveBar`), `apps/mobile/src/design/layout/save-bar.tsx`
- Test: `apps/mobile/src/__tests__/sheet.test.tsx`

**Interfaces:**
- Consumes: Tasks 3, 4; `useKeyboardInset` (`src/design/lib/keyboard-inset.ts`).
- Produces: `<Sheet open onClose title? children footer?: ReactNode />` built on RN `Modal` (transparent) + Reanimated (`SPRING.gentle` in, `DURATION.base` out, backdrop fade) + gesture-handler pan to dismiss (dismiss past 30% height or velocity > 800); `SheetSaveBar({ label, onPress, loading?, hint? })` pinned to the sheet bottom and lifted by the keyboard inset; `SaveBar` the same for full screens, above `useShellBottomPadding`. No new dependency (decision: avoids sheet-library compatibility risk with Reanimated 4.7).

- [ ] **Step 1: Failing tests:** `open=false` renders nothing; backdrop press calls `onClose`; hardware back (`onRequestClose`) calls `onClose`; `SheetSaveBar` bottom offset equals the mocked keyboard inset (Review Focus 5); reduced motion opens without spring (final position immediately).
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(mobile): Sheet with drag-to-dismiss and keyboard-aware save bars`.

### Task 9: Stack navigation for detail routes

**Files:**
- Move: tab route files into `apps/mobile/app/(app)/(tabs)/` (every route in `ALL_ROUTE_NAMES`); detail routes (`DETAIL_ROUTE_NAMES`) stay in `app/(app)/`
- Create: `apps/mobile/app/(app)/(tabs)/_layout.tsx` (the Tabs navigator and pill, moved from `(app)/_layout.tsx`)
- Modify: `apps/mobile/app/(app)/_layout.tsx` (becomes a `Stack`: `(tabs)` first, detail routes with `animation: "slide_from_right"`, `gestureEnabled: true`, `fullScreenGestureEnabled: true`, `headerShown: false`); `src/lib/route-names.ts` if paths change; alumni guard and auth redirect keep working
- Test: `apps/mobile/src/__tests__/app-layout.test.tsx`, `role-tabs.test.tsx`, `nav-routes.test.ts` (update), new `deep-links.test.tsx`

**Interfaces:**
- Produces: URLs unchanged (`/settings`, `/student/12`, …: groups add no path segment); detail screens push over the tabs with native transitions and swipe-back; `DETAIL_ROUTE_NAMES` keeps being the single list of detail routes.
- Builds on the deep-link fix `c7a9beb` (non-tab screens must never be `href: null` under expo-router 58; keep its test). This task also fixes Back from a detail screen going to the first tab (`backBehavior: "firstRoute"`): the stack returns to the screen you came from.

- [ ] **Step 1: Failing tests:** `deep-links.test.tsx` uses expo-router's `renderRouter` with a signed-in store: `/settings`, `/season`, `/student/1`, `/calendar` each render their own screen (assert a screen-specific text), and `/student/1` renders with the tab group underneath (back returns to the tab); app-layout tests updated to read the new folders.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Move the files and split the layouts.**
- [ ] **Step 4: Run** the four suites, then the full unit suite and typecheck (typed routes regenerate) → PASS.
- [ ] **Step 5: Verify on the emulator** with the local sweep rig (scratchpad `build-sweep-apk.sh`, `local-sweep.sh` against the fake-user DB): `adb -s emulator-5558 shell am start -a android.intent.action.VIEW -d spacev2://settings com.jpc.space` lands on Settings; a student detail pushes and swipes back.
- [ ] **Step 6: Commit** `feat(mobile): detail screens push on a native stack with swipe-back`.

### Task 10: Screen frame with collapsing large title

**Files:**
- Create: `apps/mobile/src/design/layout/screen.tsx` (`Screen`), `large-title.tsx` (`LargeTitle`, `CompactHeader`)
- Modify: `apps/mobile/src/design/layout/shell-frame.tsx` (delegates to `Screen` so untouched screens keep working; to be deleted in plan 05)
- Test: `apps/mobile/src/__tests__/screen.test.tsx`

**Interfaces:**
- Consumes: Tasks 2, 3; `useShellBottomPadding`, `useKeyboardInset`; Task 11's `useTabBarScroll`.
- Produces: `<Screen title subtitle? back?: { label; href? } trailing?: ReactNode home?: boolean refreshing? onRefresh? scroll? >`: large title in content that collapses into a `CompactHeader` (title fades in, hairline appears) once scrolled past it, using `useAnimatedScrollHandler`; `home` shows the notification bell and avatar (existing `NotificationBell`, `UserMenu`) in the title row; top safe-area inset owned here (no `AppTopBar`); bottom padding as `ShellFrame` today; reports scroll direction to `useTabBarScroll`.

- [ ] **Step 1: Failing tests:** renders title and back link; back link press calls `router.back()` (or pushes `href`); `home` renders the bell and user menu, non-home does not; content bottom padding equals `useShellBottomPadding()`; under reduced motion the compact header switches without animation.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Remove `AppTopBar` from the tabs layout header** (`header: () => null`), keep `OfflineBanner`; full unit suite → PASS (screens using `ShellFrame` now get `Screen` without a title; their `PageTitle` still renders in content until their batch).
- [ ] **Step 6: Commit** `feat(mobile): Screen frame with collapsing large title; drop the web top bar`.

### Task 11: Frosted pill with sliding highlight and hide-on-scroll

**Files:**
- Modify: `apps/mobile/src/design/layout/floating-tab-bar.tsx` (rename export `PillTabBar`, keep `FloatingTabBar` alias until the layout switches), `nav-link.tsx`
- Create: `apps/mobile/src/design/layout/tab-bar-scroll.ts` (`useTabBarScroll`)
- Test: `apps/mobile/src/__tests__/floating-tab-bar.test.tsx` (extend)

**Interfaces:**
- Consumes: Tasks 1, 3.
- Produces: pill fill `bg-pill` (+ `BlurView` intensity 40 on iOS only; Android uses the fill alone); active highlight is one absolutely positioned view whose `translateX`/`width` animate with `SPRING.snappy` to the active tab's measured layout; active icon scales 1.08; tab press → `haptic("selection")`; `useTabBarScroll(): { onScrollDirection(dir: "up" | "down", atEnd: boolean): void }` hides the pill (translateY to off-screen over `DURATION.base`) on sustained downward scroll > 24px and shows it on upward scroll or at the end of content; reduced motion: highlight jumps, pill fades instead of sliding; labels `maxFontSizeMultiplier` 1.15 (existing rule).
- Tab content crossfade: tabs layout sets `animation: "fade"` with `DURATION.base` (expo-router Tabs option); no drift under reduced motion.

- [ ] **Step 1: Failing tests:** highlight target x equals the pressed tab's layout x (mock `onLayout`); pressing tab B then tab C before the spring settles ends with highlight target at C and `navigateToTab` called for C last (Review Focus 3); scroll down 40px hides, scroll up shows, `atEnd` shows; Android render has no `BlurView`; reduced motion sets the highlight without spring.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(mobile): frosted pill with sliding highlight and hide on scroll`.

### Task 12: Per-role tab sets

**Files:**
- Modify: `packages/shared/src/navigation.ts` (each role's `tabs`), its tests in `packages/shared/src/__tests__/`
- Modify: `apps/mobile/src/__tests__/role-tabs.test.tsx`

**Interfaces:**
- Produces (Today first, ≤5 tabs, nothing removed: anything leaving the tabs stays in `sidebar` and so in More):
  - STUDENT: Today `/dashboard`, Calendar `/calendar`, Assignments `/assignments`, Quizzes `/quizzes`, More `/more` (plan 02 decides the Work merge);
  - LEADER: Today `/dashboard`, My Group `/groups`, Calendar `/calendar`, Submissions `/submissions`, More `/more`;
  - ADMIN: Today `/dashboard`, Calendar `/calendar`, Groups `/groups`, Students `/students`, More `/more`;
  - SUPER: Today `/dashboard`, Seasons `/seasons`, Calendar `/calendar`, Students `/students`, More `/more`;
  - MENTOR: Today `/dashboard`, Students `/students`, Reports `/reports`, Notes `/notes`, Profile `/profile` (Settings and Notifications reachable from Profile, as today);
  - ALUMNI: Today `/dashboard`, Events `/calendar`, History `/history`, Profile `/profile`, More `/more`.
  - The `home` icon keeps the "featured" treatment only where Today is a tab (all roles).

- [ ] **Step 1: Failing tests:** for every role `tabs[0]` is `/dashboard` labelled "Today", `tabs.length <= 5`, and the union of `tabs` and `sidebar` hrefs equals the pre-change union (nothing removed); mobile role-tabs test renders the pill in the new order.
- [ ] **Step 2–4:** FAIL → implement → PASS (shared and mobile suites).
- [ ] **Step 5: Commit** `feat(shared): Today-first tab sets per role`.

### Task 13: Component catalogue and its sweep flow

**Files:**
- Create: `apps/mobile/app/(app)/design-catalogue.tsx` (dev-only: renders `EmptyState` "Not available" unless `__DEV__` or `isSweepBuild` from `src/lib/app-config.ts`), `apps/mobile/src/screens/design-catalogue/*.tsx` (sections, each ≤ 400 lines)
- Modify: `apps/mobile/src/lib/app-config.ts` (`isSweepBuild` from `EXPO_PUBLIC_SWEEP_BUILD === "1"`), `app/(app)/_layout.tsx` detail routes list
- Create: `apps/mobile/.maestro/sweep/s90-design-catalogue.yaml`
- Modify: scratchpad-free rig: `tools/ui-reference/README.md` (how to build with `EXPO_PUBLIC_SWEEP_BUILD=1`), `.github/workflows/ui-sweep.yml` env (`EXPO_PUBLIC_SWEEP_BUILD: "1"`)

**Interfaces:**
- Produces: one screen showing every component from Tasks 2–8 and 10–11 in each state (chips for every status, rows with long titles, stat tiles, segmented control, buttons incl. loading, empty/error/skeleton, a sheet opened with an input focused).

- [ ] **Step 1: Write the flow** (sign in as student, `openLink: spacev2://design-catalogue`, screenshot each section scrolled, open the sheet, focus its input, screenshot `-kbd`); `maestro check-syntax` passes.
- [ ] **Step 2: Build the screen**; unit test renders it under `isSweepBuild=true` and the "Not available" state when false.
- [ ] **Step 3: Run the sweep** for `s90` across all 16 cells with the local rig; review every shot against the Review Focus list and the spec's anti-goals; fix and re-run until clean.
- [ ] **Step 4: Commit** `feat(mobile): design catalogue screen and its sweep flow`; push.

### Task 14: Conventions for the new system

**Files:**
- Modify: `CLAUDE.md` ("Mobile conventions": replace "UI matches v1 exactly" with the redesign spec as the reference; component homes; motion rules; keep "Rules from the UI sweep")
- Modify: `docs/superpowers/specs/2026-11-04-mobile-redesign-design.md` (status: step 1 done)

- [ ] **Step 1: Edit both**; **Step 2: Commit** `docs: mobile conventions follow the redesign spec`; push.

### Task 15: Consistency across the whole app (owner, 2026-11-04: "Make sure all the app is consistent")

**Files:**
- Modify: the legacy shared components still used by un-migrated screens: `apps/mobile/src/design/ui/badge.tsx`, `card.tsx`, `input.tsx`, `select.tsx`, `tabs.tsx`, `modal.tsx`, `confirm-dialog.tsx`, `src/design/layout/page-title.tsx`, `page-header.tsx`, `src/design/dashboard/section-card.tsx`, `src/design/students/stat-card.tsx`
- Create: `apps/mobile/src/__tests__/design-consistency.test.ts`

**Interfaces:**
- Consumes: Tasks 1–8, 10.
- Produces: every legacy component renders with the new tokens, radii (cards and groups 16, buttons 14, chips full), type scale and press feedback, so screens the role batches have not reached yet already look like the new system: `Badge` renders through `StatusChip` tones, `Card` becomes a `surface` group without shadow, `PageTitle` renders the `title`/`largeTitle` variants, inputs use `surface` + `separator`.

- [ ] **Step 1: Failing guard test** `design-consistency.test.ts`: scans `apps/mobile/app/**` and `apps/mobile/src/**` (excluding `__tests__`, `design/theme/`) and fails on any hex colour literal, `rgb(`/`rgba(` literal, `shadow-` class, `rounded-(sm|md|lg|xl)` class outside `src/design/`, or a raw `fontSize:` number outside `src/design/`; prints file:line for each.
- [ ] **Step 2: Run** → FAIL with the current offenders listed.
- [ ] **Step 3: Restyle the legacy components** above onto the new tokens and fix every offender the test lists (replace literals with tokens / `useThemeColors()` / `palette`).
- [ ] **Step 4: Run** the guard and the full unit suite → PASS.
- [ ] **Step 5: Sweep** one flow per role (s03, s1x leader dashboard, s2x admin, s3x super, s4x mentor, s5x alumni) on the two corner cells and confirm no screen still shows the old look; fix and re-run.
- [ ] **Step 6: Commit** `feat(mobile): legacy components follow the new design system everywhere`.

Plans 02–05 keep `design-consistency.test.ts` green and delete each legacy component when its last user is migrated.
