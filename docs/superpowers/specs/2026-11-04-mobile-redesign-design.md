# Mobile redesign: JPC Space as a phone app

Date: 2026-11-04. Status: step 1 (design system, shell, tabs, motion foundation) done on branch `redesign/foundation` (2026-11-05); steps 2+ pending. Owner answers folded in.
Visual reference: https://claude.ai/artifact/XziHryJWkx2gEz7XQtcVa3 (private; mockups use fake people).

Changed during step 1: swipe-back is native on iOS and Android gesture-nav only, 3-button Android
uses the back bar and system Back (R24); no featured disc on the Today tab (R22); `control-border`
and `ring` tokens measured to 3:1 (R25, R26); active pill label token `pill-active-label` (R18).

## Intent

v2's mobile app copies v1's web pages screen for screen (owner ruling 2026-10-14, spec
`2026-10-14-mobile-ui-v1-match-design.md`). On 2026-11-04 the owner lifted that ruling and asked
for a full UI/UX redesign. The app has not shipped to a store, so there are no existing users of
the v2 look to migrate.

The redesign keeps what people recognise (JPC navy and teal, the JPC mark, the Geist typeface)
and changes how the app behaves, so that it reads and works as a phone app rather than a web
page on a phone.

## Goals

1. **Each role opens on "Today".** Home answers "what do I do now" for that role:
   - student: the next session with a Check in action, then work due this week;
   - leader: the session to run, who is missing, submissions to review;
   - admin / super: the season's live session and anything needing action;
   - mentor: students flagged at risk and recent notes;
   - alumni: upcoming events.
   The current dashboards' figures stay, below the action, not as the opener.
2. **The floating pill tab bar stays (owner, 2026-11-04), solid (owner 2026-11-05)**: one opaque
   navy fill (`bg-pill`) on iOS and Android, no blur, so nothing scrolled beneath it shows through
   its labels. It keeps its floating shape, shadow, sliding highlight and hide-on-scroll motion.
   (The first draft made it frosted and semi-transparent; the owner replaced that.) The existing rule
   still holds: the last item of every scroll view clears the pill by the bottom inset
   (`useShellBottomPadding`), and the pill sits above the system bar on 3-button phones.
3. **Large screen titles instead of the web top bar.** The logo + bell + avatar header goes. The
   bell and avatar appear on Home only; every other screen gets a large title (and a back link on
   detail screens). Roughly 60px more content per screen.
4. **Grouped lists instead of a card around everything.** Lists become grouped rows (iOS Settings
   style): one surface, hairline separators, a chevron where the row opens something. A card is
   kept only for the single most important object on a screen (the next session on Today).
5. **Act in place with bottom sheets.** Quick actions (mark attendance for one student, grade,
   write a note, drop/graduate, filters) open as bottom sheets with a fixed save bar that stays
   above the keyboard and the system bar. Long forms (new season, new assignment, imports) stay
   full screens, also with a fixed save bar.
6. **One status vocabulary.** A single chip component with fixed tones for every status in the
   app (due, overdue, submitted, returned, reviewed, present, late, absent, draft, active,
   completed, withdrawn). Each chip carries a word, never colour alone. 4.5:1 text contrast in
   both themes.

7. **Motion throughout, strongest in navigation (owner, 2026-11-04).** Movement tells the user
   where they are and where they went; it is part of every screen, not decoration added at the
   end.
   - **Tab switches:** the pill's active highlight slides to the tapped tab on a spring (it moves,
     it does not jump), the icon scales up slightly, and the incoming tab's content crossfades
     with a short upward drift (~8px).
   - **Push and back:** detail screens slide in from the right with the previous screen easing
     back and dimming (native stack transitions); interactive swipe-back from the edge on both
     platforms. A list row that opens a detail screen carries its title into the detail's large
     title (shared-element style) where the row and title match.
   - **Large titles:** collapse into a compact header as the page scrolls, and the pill eases
     slightly more opaque once content is under it.
   - **Pill on scroll:** hides with a short slide down while scrolling down a long list and
     returns on scroll up or at the end, so the last rows are never trapped under it.
   - **Sheets:** spring up with the backdrop fading in; drag to dismiss with velocity; the save
     bar rides on top of the keyboard.
   - **Lists and content:** first load staggers rows in (opacity + 6px rise, 30–40ms apart, first
     ~8 rows only); skeletons shimmer; pull-to-refresh uses the JPC mark; inserted and removed
     rows animate their layout instead of jumping.
   - **Feedback:** every pressable scales to ~0.97 with a soft spring on press; toggles and
     segmented controls slide their thumb; status chips crossfade when a status changes; numbers
     on Today and stat tiles count up to their value.
   - **Moments:** check-in success draws a check and pulses the attendance ring, with a success
     haptic; saving attendance or a grade gives a light haptic and a brief confirmation.

   Motion rules:
   - Built on `react-native-reanimated` 4 (already installed, runs on the UI thread) and
     `react-native-gesture-handler`; haptics via `expo-haptics` (to add). No Lottie or other
     animation runtime unless a specific moment needs it.
   - Timings from one token set: `fast` 150ms (press, chip), `base` 220ms (crossfade, list item),
     `slow` 320ms (sheet, screen), plus two springs (`snappy` for the pill and toggles, `gentle`
     for sheets). Exits faster than entrances.
   - Interruptible: a new tap cancels the motion in flight and lands on the right final state;
     no state ever depends on an animation finishing.
   - Reduce motion (OS setting) swaps movement for short crossfades, keeps haptics optional and
     turns off count-ups, staggers and shared-element transitions.
   - 60fps on a mid-range Android phone is the bar; anything that drops frames in the sweep's
     emulator or on a device is cut back, not shipped.

## Non-goals

- No changes to backend rules, permissions or writes. Small **read-only** endpoints (or read-only
  fields on existing responses) are allowed where a role's Today needs data no endpoint returns
  (owner, 2026-11-04), each with tests and its OpenAPI entry in the same commit.
- No new features. Screens may merge or move (e.g. student Assignments + Quizzes into one "Work"
  list is a candidate, see "Left to the builder"), but nothing a role can do today disappears.
- No new brand: colours, logo and typeface stay.
- No web or tablet layout work.

## Anti-goals (a failure even if it works)

- Text hidden under the pill, the system bar or the keyboard on any phone, at font scale 1.3.
- Dark mode that is an inversion of light (it is designed: navy-950 surfaces, teal accents).
- A generic template look (purple gradients, emoji icons, cards with shadows everywhere).
- A build in anyone's hands that mixes the old and new designs. The rule covers installed builds,
  not `main`: no TestFlight, store or test build is cut until every role is done (owner,
  2026-11-04), so the work rebuilds screens in place with no runtime switch.

## Constraints

- Stack stays: Expo SDK 58, expo-router, NativeWind, React Query, `src/design/` component home.
- Every source and test file at or under 400 lines; no `@/` alias; relative imports (CLAUDE.md).
- Accessibility: tap targets 44pt minimum; text 4.5:1, icons and control borders 3:1, in light
  and dark; works at font scale 1.3 on a 360dp phone; Dynamic Type / font scale never truncates
  a time, date, count or name mid-word.
- OS reduce-motion respected (goal 7's rules); motion never blocks input or hides state.
- The UI sweep (`.claude/skills/ui-sweep/`) is the acceptance check for every batch; its flows
  are rewritten to the new screens as each batch lands.

## Decided

| Decision | By |
|---|---|
| Lift the v1-match ruling; full redesign | Owner, 2026-11-04 |
| Keep navy, teal, JPC mark, Geist | Owner (approved proposal) |
| Keep the floating pill tab bar; solid on iOS and Android (no blur) | Owner, 2026-11-04; solid 2026-11-05 |
| Today-first Home per role; large titles; grouped lists; bottom sheets; one chip set | Owner (approved proposal) |
| Build order: design system → student → leader → admin/super/mentor/alumni → iPhone pass | Owner (approved proposal) |
| Motion throughout the app, especially navigation | Owner, 2026-11-04 |
| One build at the end; rebuild in place on main, no old/new switch | Owner, 2026-11-04 |
| Small read-only backend additions allowed for Today | Owner, 2026-11-04 |
| Tab sets per role may change (count, order, labels; at most 5; nothing removed) | Owner, 2026-11-04 |
| iOS is checked only in the final iPhone pass | Owner, 2026-11-04 |

## The design system (step 1)

Tokens (replacing `pnpm design:tokens`' v1-derived output as the source of truth):
- **Colour:** navy ramp and teal ramp as today; semantic tokens `background`, `surface`,
  `foreground`, `muted-foreground`, `separator`, `primary`, `on-primary`, `accent`, and status
  tones (`ok`, `warn`, `bad`, `info`, `neutral`) each with a soft background and a text colour,
  defined for light and dark and measured to the contrast rules above.
- **Type scale (Geist):** large title 30/34 bold, title 22/28 semibold, headline 17/22 semibold,
  body 16/24, subhead 14/20, caption 12/16; tabular numerals for times, scores and counts.
- **Spacing:** 4-point grid (4, 8, 12, 16, 20, 24, 32); screen gutter 16; grouped-list radius 16;
  button radius 14; chip fully rounded.

Motion tokens and helpers (`src/design/motion/`): durations, the two springs, a `usePressScale`
hook, a staggered-entry helper, and a `useReducedMotion` gate every animated component reads.

Components (about 15, in `src/design/`): solid `PillTabBar` (sliding highlight, hide on scroll), `LargeTitle` (with optional back
link and trailing actions), `GroupedList` / `ListRow` (title, subtitle, trailing value, chip or
chevron), `StatusChip`, `HeroCard`, `StatTile`, `Sheet` (with `SheetSaveBar`), `SaveBar` for full
screens, `Button` (primary, secondary, destructive, plain), `SegmentedControl`, `SearchField`,
`EmptyState`, `ErrorState`, `Skeleton`, `Toast` (restyled).

## Today, per role (builder's calls, marked)

The content of each Today, settled by the builder so the plan can size the backend work; the owner
may change any of it on review.
- **Student** (my call): next session card with Check in; then all open work, overdue first and
  due-this-week after, with "See all" to the Work list. Not filtered client-side from the capped
  `dueSoon` list; if the cap hides items, the read endpoint returns the full open list.
- **Leader** (my call): the next session of their group with present / not checked in counts and
  the names of students not yet checked in; submissions waiting for review; one read endpoint
  returns this so Today is one request.
- **Admin / super** (my call): "needs action" means submissions waiting for review, sessions in
  the past with no attendance marked, students flagged at risk, and pending invites (super only);
  each a count that opens the filtered list.
- **Mentor** (my call): students flagged at risk (engagement), then the newest notes visible to
  mentors across students. A read endpoint lists those notes if none does today.
- **Alumni** (my call): upcoming events, then their history.

Statuses missing from goal 6's list (archived, graded, dropped and any others the schemas carry)
get chip tones in step 1 (my call). The tab sets per role are designed in step 1 with the shell
(my call within the owner's rule above); Settings and Notifications stay reachable for every role,
including mentors, who have no More tab today.

## Rollout

1. Design system in code, with unit tests and a hidden catalogue screen for the sweep.
2. Student screens (plus signed-out and settings), then sweep.
3. Leader screens, then sweep.
4. Admin, super, mentor, alumni screens, then sweep per role.
5. iPhone pass on a real device (notch, home indicator, iOS sheets and keyboard, the solid pill
   over content). This is the first iOS check (owner, 2026-11-04): the
   sweep is Android-only, so iOS-only problems surface here and may need rework. To limit that,
   the pill and sheets stay on platform-standard pieces (a plain view, native stack, a
   well-supported sheet) rather than custom native code.
6. Update CLAUDE.md "Mobile conventions" (drop "UI matches v1 exactly") and retire the v1
   capture tooling's role as the acceptance check.

Each step is its own set of commits on main, one fix or component per commit, verified by
typecheck, lint, unit tests and the sweep before the next starts.

## Left to the builder

- Exact screen-by-screen layouts within the rules above, starting from the mockups.
- Whether student Assignments and Quizzes merge into one "Work" tab.
- Which actions are sheets versus full screens, by the rule in goal 5.
- Icon set (keep the current one unless it fails the 3:1 rule in the pill).
- Copy: keep v1's wording where it is clear; plainer wording where it is not.
