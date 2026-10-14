# Rulings and deferred minors — UI rebuild plans 00 and 01

Decisions taken during execution (branch `claude/ui-v1-match-spec`), each with what it costs if wrong, copied verbatim from the execution ledgers in the order they were made. Spec: `docs/superpowers/specs/2026-10-14-mobile-ui-v1-match-design.md`.

## Plan 00 — reference capture

- Setup: Ruling: work on existing branch claude/ui-v1-match-spec instead of a new worktree — branch is not main, holds only the spec/plans, no parallel work — cost if wrong: none (can branch later)
- Task 1: Ruling: test script 'node --test test/' fails on Node 24 (directory arg unsupported) — use glob "test/*.test.mjs" — cost if wrong: none
- Task 1: Ruling: owner says the shared Neon DB in v1/v2 .env is a TEST database and explicitly instructed "run local and use env" — setup-v1.sh copies jpc-space/.env DATABASE_URL into the copy's .env.local; branch-vs-prod guard removed (its premise no longer applies); BRANCH_URL_FILE dropped; scripts that need the DB read it from jpc-space/.env — cost if wrong: v1 dev-switcher writes lastLoginAt on the shared DB (owner accepted)
- Task 2: Ruling: Submission/Attendance column is studentUserId (plan said studentId; plan step anticipated a fix) — cost if wrong: none
- Task 4: Ruling: run the v1 copy as a production build (next build + next start) instead of next dev — dev mode draws the Next.js dev indicator/overlay into screenshots and compiles each page on first hit — cost if wrong: longer startup
- Task 4: Ruling: bind the v1 copy to 127.0.0.1 — next start listened on the public IP with DEV_USER_SWITCHER on (anyone could sign in as any user) — cost if wrong: none
- Task 4: Ruling: crawler reloads the page before collecting links — dialog triggers may navigate away — cost if wrong: one extra page load per page
- Task 4: Ruling: all navigations go through visit() (domcontentloaded + settle, 60s, errors recorded per page) — one slow reports page crashed the run — cost if wrong: none
- Task 5: Ruling: read tokens from signed-out /login (domcontentloaded) instead of signed-in / — tokens are global CSS and / timed out under capture load — cost if wrong: none
- Task 5: Ruling: colours resolved via 1x1 canvas pixel (Chromium serialises oklch as lab()); radii derived from --radius × globals.css factors (@theme inline emits no --radius-* vars) — cost if wrong: none
- Task 6: Ruling: added season/[code] → seasons/[code] mapping + test — capture shows v1 uses singular /admin/season/[code] — cost if wrong: none
- Task 4: Ruling: capture hung 14 min on a no-timeout browser call; added timeouts on every browser call, per-role manifest parts (--role), parallel role processes, merge-manifest.mjs — cost if wrong: none
- Task 4: Ruling: mentor /mentor/reports takes >60s to render — goto limit raised to 150s, per-page watchdog 7 min, queued links skipped once their pattern is seen — cost if wrong: slower failure on a truly dead page
- Task 3: Ruling: route patterns fixed after capture (digit-free mixed-case publicIds; seasons/new|year|program static) with tests; merge-manifest re-derives patterns from exampleUrl and dedupes instead of recapturing — cost if wrong: duplicate shot files left unreferenced on disk
- Task 4: Ruling: top-bar dev-switch icon (DEV_USER_SWITCHER) and its menu (usually dialog-0) appear in v1 shots — not v1 production UI; documented in README, ignore when comparing — cost if wrong: none
- Task 6: Ruling: 19 v1 pages unreachable by links (notifications, signed-out, JS-linked details) captured via capture.mjs --extra with ids read read-only from the test DB; signed-out pages as role "public"; checkin/[token] captured as student with a bogus token (error state) — cost if wrong: none
- Task 6: Ruling: hand-review encoded in screen-map.mjs (EXPLICIT, SECTION_OF, NOTES) instead of editing the generated .md, so regeneration keeps it; season/[code]/<x> and list/new rules added with tests — cost if wrong: none
- Task 6: Ruling: v1 pages left v1-only for owner: /forbidden, /super/seasons/year/[year], /super/seasons/program/[program]; v1 redirect-only pages (/admin/{assignments,calendar,groups,reports}) not listed (they redirect into season pages that are captured) — cost if wrong: their "no season" empty state is uncaptured

## Plan 01 — foundations

- Ruling: Task 1 starts while Plan 00 Task 4 capture still runs — T1 needs only users.json, which exists — cost if wrong: none
- Task 1: Ruling: emulator reports 1126px (even rounding); emulator.sh forces 'wm size 1125x2436' = 375dp — cost if wrong: none
- Task 1: Ruling: emulator reports 1126px (even rounding); emulator.sh forces 'wm size 1125x2436' = 375dp — cost if wrong: none
- Task 1: Ruling: Metro on 8095, not 8090 — nanny-app's Metro already listens on 8090 (pid 1792196, left untouched) — cost if wrong: none
- Task 1: Ruling: expo run:android ignores ANDROID_SERIAL and installed on nanny's emulator-5554 — uninstalled it there; install on 5558 with 'adb -s emulator-5558 install' + 'adb reverse tcp:8095' instead — cost if wrong: none
- Task 1: Ruling: Maestro flow targets the inputs by accessibility label (Email/Password) and buttons by text — no testIDs added to login.tsx (it is rebuilt in batch 2); Maestro run uses --device emulator-5558 — cost if wrong: none
- Task 2: Ruling: build APK with RCT_METRO_PORT=8095 — emulator debug builds load JS from 10.0.2.2:8081, which is egx's Metro (pid 2530798, untouched) and caused 'MessageQueue doesn't exist' — cost if wrong: none
- Task 2: Ruling: Tailwind 3 generates opacity steps of 5 only; bg-primary/92 rendered nothing — config defines opacity 0..100 (carry into Task 3's generated config) — cost if wrong: none
- Task 2: Ruling: jest moduleNameMapper maps .css to __mocks__/style-mock.js — boot-gate imports app/_layout which imports global.css — cost if wrong: none
- Task 2: Ruling: emulator loads JS via adb run-as pref debug_http_host=10.0.2.2:8095 (RCT_METRO_PORT build var did not take) — cost if wrong: re-set after app data clear (Maestro clearState wipes it!)
- Plan01 Task 1: Ruling: debug APK built with -PreactNativeDevServerPort=8095 so it loads JS from JPC Metro, not egx's 8081 — verified after pm clear (no debug_http_host pref) — cost if wrong: none
- Task 3: Ruling: translucent tokens emitted as colour functions (calc(var(--x-alpha) * opacity)) — v1 uses border-border/60 ×12, ring-ring/40 ×16, bg-input/30 etc.; css-interop compiles the calc without warnings; runtime rendering verified in Task 10 showcase (must check a border-border/60 swatch in dark) — cost if wrong: modifier on translucent tokens renders wrong colour
- Task 3: Ruling: opacity scale 0..100 kept in tailwind.config extend (carried from Task 2) with a test — cost if wrong: none
- Task 4: Ruling: boot-gate assertions made async (findBy*) — fonts/theme step renders one tick after mount; mutation check (gate removed) still fails 2/4 — cost if wrong: none
- Task 4: Ruling: theme-mode test resets mockSystem in beforeEach; removed unused eslint-disable lines from Task 3 files (lint warnings) — cost if wrong: none
- Task 5: Ruling: top-bar, user-menu, more-menu, notification-bell deferred to a step right after Task 8 — they need Button/Badge/Avatar/Logo (Task 6) and Modal (Task 8); building them now means throwaway copies — cost if wrong: none (Task 10/11 consume them later)
- Task 5: Ruling: routeNameForHref + DIRECTORY_ROUTE_HREFS moved to src/lib/route-names.ts now (re-exported from the layout) — Task 11 makes the layout import the bar — cost if wrong: none
- Task 5: Ruling: jest maps lucide-react-native to its CJS build (react-native export condition is untransformed .mjs); BlurView sized with StyleSheet.absoluteFill (third-party, no className); nav highlight is a static View (v1's motion slide skipped) — cost if wrong: highlight does not slide between tabs
- Task 5: Ruling: RTL asyncUtilTimeout 5s in jest.setup.ts — student-engagement-notes findByText flaked 2 of 3 full runs at the 1s default (passes 4/4 alone); 3 consecutive full runs green after — cost if wrong: a genuinely missing element fails after 5s instead of 1s
- Task 6: Ruling: added design/ui/text.tsx (base "font-normal text-foreground" + fontVariant stylistic-one/three = v1 body ss01/ss03) — RN text inherits nothing, so without it every unclassed Text is system font and black in dark mode; all ported components use it — cost if wrong: none
- Task 6: Ruling: test adjusted to v1 APIs — AttendancePill takes status (PRESENT/ABSENT/LATE), every SubmissionStatus label checked, ProgressRing clamp/label, Avatar fallback, Logo wordmark — cost if wrong: none
- Task 6: Ruling: Badge/pills split v1's class string into box classes (View) and text classes (Text); ProgressRing callers port stroke-[var(--color-X)] → stroke-X via an interop'd StrokeCircle; EmptyState gradient via expo-linear-gradient (native dep added → APK rebuild), blur glow approximated; Skeleton shimmer → 1.6s opacity pulse (RN Animated, no reanimated in jest) — cost if wrong: visual differences, checked in Task 10
- Task 7: Ruling: v1 modal (Task 8 item) ported here first so pickers/sheets use it, not an RN-Modal stand-in — cost if wrong: none
- Task 7: Ruling: Select/Combobox/MultiSelect/DatePicker open an AnchoredPopover (6px below trigger, trigger width, flips above) instead of the plan's bottom sheet — v1 renders anchored Base UI popovers at phone width, so a sheet would not match — cost if wrong: popover positioning bugs on device (check in Task 10)
- Task 7: Ruling: test follows v1 APIs — Select compound API with items map, Combobox/MultiSelect onChange (not onValueChange), DatePicker "PPP" (October 14th, 2026); aria-invalid asserted as destructive border (RN AccessibilityState has no invalid) — cost if wrong: none
- Task 7: Ruling: generator also exports `semantic` light/dark values + useThemeColors() for colour props (placeholderTextColor) — cost if wrong: none
- Task 7: Ruling: focus-visible: on inputs → focus: (NativeWind supports it on TextInput); 3px rings dropped, border colour carries focus/invalid; FileUpload is visual-only with onPress (uploads off) — cost if wrong: focus less prominent than v1
- Task 8: Ruling: sonner-native pinned to 0.24.0 — 0.25+ peers react-native-worklets ^0.6.1, Expo SDK 54 pins 0.5.1 — cost if wrong: older toast API
- Task 8: Ruling: toaster position top-center (v1 top-right spans full width at phone size in sonner); Toaster reads the scheme from nativewind (not useThemeMode, which pulls AsyncStorage into every design/ui import) — cost if wrong: none
- Task 5 (deferred part): top-bar, notification-bell, user-menu done after Task 8 (commit c94e9da); presentational with props, connected wrapper in Task 11 — Ruling — cost if wrong: none; more-menu deferred to after Task 9 (needs ThemeToggle); v1 more-menu maps history→FileText (differs from nav-link's History) — kept per file
- Task 9: Ruling: own HTML renderer (htmlparser2 + nested Text) instead of react-native-render-html — render-html relies on function-component defaultProps, which React 19 ignores; applies v1's sanitize-html allow-list (unwrap others, drop script/style/textarea/option/noscript, a[href] http/https/mailto only) — cost if wrong: an HTML construct renders differently (checked in Task 10)
- Task 9: Ruling: v1 has no @tailwindcss/typography, so `prose prose-sm` is inert — rich text reproduces Tailwind's reset (no margins, no list markers, headings at body size, links in text colour) — cost if wrong: none (matches v1 as shipped)
- Task 9: Ruling: tests follow v1 APIs — DataTable(columns with cell(), rowKey, emptyState) phone-list branch only; ThemeToggle is one button ("Switch to dark/light mode"), not three options — cost if wrong: none
- Task 9: Ruling: charts use v1's lib/chart-colors.ts hexes (differ from tokens) and Recharts defaults (margins, 60px Y axis, nice ticks, monotone curve, 10% band gap, pie label offset 20); tooltips dropped — cost if wrong: small geometry differences (Task 10 compare)
- Task 9: Ruling: editor link prompt (v1 window.prompt) → Modal sheet "URL" with Cancel/OK; editor CSS loads Geist from Google Fonts inside the WebView (needs network) — cost if wrong: editor falls back to sans-serif offline
- Task 9: Ruling: jest.setup gains global stubs for react-native-webview, @10play/tentap-editor and the AsyncStorage library mock — every design/ui import pulls them in — cost if wrong: none
- Task 9: Ruling: base Text drops font-normal when font-mono is requested (both set fontFamily; the plugin utility would win) — test added — cost if wrong: none
- Plan00 Task 5 (fixed during Plan01 Task 10): Ruling: v1 @theme inline emits no vars — ramp/role tokens had resolved to the body colour #111827; exporter now injects parsed --color-* declarations, guard rejects ramps with repeated steps; semantic tokens unchanged — cost if wrong: none
- Task 10: Ruling: showcase renders outside the shell (v1's /dev/design-system has no shell) — cost if wrong: none
- Task 10: Ruling: v1 Tabs selected styling never applies (data-[selected] vs Base UI data-active) — reproduced (exact-match rule) and flagged to owner in gaps-foundations.md — cost if wrong: one class change to show selection
- Task 10: Ruling: base Text defaults to text-base (v1 unclassed text is 16/24); font-mono applied as explicit style (class face does not reach native Text at runtime) — cost if wrong: none
- Task 10: Ruling: Button/Badge/pills carry no self-alignment; v1 block contexts / w-fit add self-start at the call site (porting rule) — cost if wrong: a ported screen stretches a button until the rule is applied
- Task 10: Ruling: expo-blur experimentalBlurMethod="dimezisBlurView" on Android for modal backdrop, tab bar and top bar (otherwise only a translucent fill) — cost if wrong: blur cost on low-end Android
- Task 10: Ruling: AnchoredPopover adds StatusBar.currentHeight on Android (measureInWindow excludes it; edge-to-edge modal draws from screen top) — verified on device — cost if wrong: iOS unaffected (Platform check)
- Task 10: Ruling: compare.mjs takes a comma list for v2 (stacked viewport shots) and embeds images; Maestro flow uses --test-output-dir (Maestro refuses absolute screenshot paths) and stopApp between passes — cost if wrong: none
- Task 11: Ruling: top bar wired too (plan Step 2 only swapped the tab bar; spec §5 shell includes the top bar and Step 5 compares it) as the Tabs header via a connected AppTopBar — cost if wrong: none
- Task 11: Ruling: ShellContext makes legacy Screen drop its top inset and pad 96px (v1 pb-24) inside the shell, so not-yet-rebuilt screens sit between the bars — cost if wrong: a legacy screen with custom bottom spacing gets 96px instead
- Task 11: Ruling: tab bar = BlurView + bg-background/85 underlay + bg-sidebar/75 (Android blur darkens: #364771 vs v1 #536187; now #516084); top bar = card/78 over bg-background, no blur (header, nothing scrolls beneath; dark #051a2e = v1) — cost if wrong: none
- Task 11: Ruling: tab label truncation — v1's label spills into px-1; NavLink drops px-1/max-w-full so "Assignments" shows in full like v1 — cost if wrong: a longer label could overflow its tab
- Task 11: Ruling: src/components/NavIcon.tsx kept — still imported by the legacy More screen (rebuilt in batch 2) — cost if wrong: none
- Final: Ruling: promoted Minor "bell lists 20, v1 10" to fix (visible fidelity) — app-layout "lists v1's 10 most recent" RED→GREEN
- Final: Ruling: promoted Minor "font load error leaves app blank forever" to fix (dead-end for a user) — boot-gate "still boots when the fonts fail" RED→GREEN
- Final: Ruling (declined to judge): shared Neon DB non-production — owner ruling stands; iOS blur/shadow/fonts — TestFlight review; Android keyboard with sheets — no sheet form yet; chart geometry/tentap WebView — device check in batches; light legacy bodies under dark shell — accepted mixed rollout
- Final: Ruling: fixed pre-existing stretched SeasonSwitcher chips found during device check (flexGrow 0) — season-switcher.test RED→GREEN — cost if wrong: none

## Final review fixes

- Final: fixed font-bold Roboto fallback on Android — design-tokens "font weights map to Geist faces" RED→GREEN, suite 780/780
- Final: fixed tab highlight lost on detail routes — floating-tab-bar "active tab on detail screens" (3 tests) RED→GREEN, suite 780/780
- Final: fixed duplicate bell on dashboards — dashboard "renders no notification bell of its own" RED→GREEN (request-set expectations updated: unread-count now requested by the shell), suite 780/780
- Final: fixed split text runs in Button/Badge — design-display "text runs" (2 tests) RED→GREEN, suite 780/780
- Final: fixed password backup could miss users after users.json changes — password-backup.test.mjs mergeBackup RED→GREEN, tools 27/27; restore keeps unrestored hashes

## Deferred minors

- Final: minor (deferred): AnchoredPopover first-frame flash at top-left before measure; flip-above and Select-inside-sheet offsets unverified on device
- Final: minor (deferred): RichTextView — <li><p> / multi-<p> blockquote runs together, nested lists merge, relative hrefs dropped (v1 keeps them)
- Final: minor (deferred): toasts render under open RN Modal sheets/popovers
- Final: minor (deferred): no SplashScreen.preventAutoHideAsync → brief blank frame on cold start
- Final: minor (deferred): spec §4 still describes Neon branch + guard (superseded by owner ruling); backend.sh binds :4100 on all interfaces (needs a backend HOST option — backend unchanged by spec)
- Final: minor (deferred): modal has no slide-down on close; button.tsx comment says icon-sm 14 (code 16, correct); more-menu duplicates lib/initials.ts
