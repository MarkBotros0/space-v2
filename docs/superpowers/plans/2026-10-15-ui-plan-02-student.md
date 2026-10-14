# UI Plan 02 — Batch 2: Student screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the 18 screens a student reaches (plus the signed-out auth screens and the check-in link) so each matches v1 at 375px in light and dark, keeping every v2 hook, query key, permission and navigation.

**Architecture:** Each screen's rendering is rewritten with the Plan 01 components (`src/design/ui`, `src/design/layout`) and v1's class strings; data hooks stay untouched. A few v1 page-level pieces that several screens share (StatCard, the page title/eyebrow idiom, the auth card, the v1 route skeleton/error) are ported first into `src/design/`. Every screen ends with a Maestro capture on the `jpc-ui` emulator compared side by side against v1's screenshot.

**Tech Stack:** Expo SDK 54, React Native 0.81, expo-router 6, NativeWind 4.2.7, lucide-react-native, expo-linear-gradient, date-fns, Jest (jest-expo) + @testing-library/react-native, Maestro.

**Spec:** `docs/superpowers/specs/2026-10-14-mobile-ui-v1-match-design.md` (§2, §6, §7, §8)

**Prerequisites:** Plans 00 and 01 merged (main `c66fd9c`). v1 copy on `http://127.0.0.1:3100` (tmux `jpc-space-v1-ref`), screenshots under `~/projects/JPC/.v1-reference/shots/`, emulator `emulator-5558`, Metro 8095 (tmux `jpc-space-metro`), v2 backend `:4100` (tmux `jpc-space-backend-ref`).

**Element-level spec (binding):** `docs/superpowers/ui-rebuild/batch-2/inventory-{A,B,C,D}.md`. They list, per screen, every v1 element with its exact class string, copy, icon and conditional branch (section a), the v2 hooks to keep (b), the data mapping with GAP / V2-ONLY flags (c), components (d) and test impact (e). A task below says *which* inventory section is the markup spec; the inventory is the code-level reference the task's implementation transcribes, and the **Rulings** section below settles every conflict the inventories flag. Where an inventory says "decide" or "owner call", the ruling here is the decision.

## Global Constraints

- `~/projects/JPC/jpc-space` is READ-ONLY. Read v1 source from `~/projects/JPC/.v1-reference/app/src/`.
- Match v1 exactly at 375px: same class strings, variants, sizes, icons, copy. Deviations only per the Rulings below or where React Native cannot do it; every deviation goes in `docs/superpowers/ui-rebuild/gaps-batch-2.md`.
- Phone width only: drop `md:`/`lg:`/`sm:` classes; keep the base classes (`flex-col-reverse` button rows stay column-reverse).
- Hooks, query keys, Zod parsing, `navFor(user)`, route files and permissions are unchanged (spec §2). No backend or `packages/shared` change in this batch.
- Text renders through `src/design/ui/text.tsx`; Button/Badge placed as v1 blocks get `self-start`.
- Relative imports only (no `@/`); no `as Href`/`as any`.
- New shared pieces go in `src/design/` under v1-like names; screens import from `src/design/ui` (index) and `src/design/layout/*`.
- Inputs keep an explicit `accessibilityLabel` equal to their visible label (behaviour tests query by label; the ported `Input` takes no `label`).
- Org-day rule X13: dates come from server `dayKey`/`dueOrgDay`/`time` strings when the payload has them; where it only has an instant (`startsAt`, `dueAt`, `gradedAt`, `sessionDate`), format it on the device exactly as v2 does today and list it in the gap note.
- Never touch emulators 5554/5556 or Metro 8081/8090. Long processes in tmux, logs `~/logs/jpc-space-<task>.log`.
- Screenshots (real data) stay under `~/projects/JPC/.v1-reference/` and `~/projects/JPC/.v2-captures/batch-2/`. Never commit, never publish; the comparison page goes to the owner with SendUserFile only.
- Ask the owner before any push; push with `gh auth switch --hostname github.com --user MarkBotros0 && git push …`.
- Each batch ends with `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` green (spec §8).

## Rulings (settle every inventory flag)

Rule of precedence (spec §2 row 3): a numbered v2 decision from the domain specs (`docs/superpowers/specs/domains/*.md` D-/R-/C-/X- items, kept by the owner in PR #21) wins over v1 copy **for behaviour and for copy that encodes that behaviour**; it is then presented in v1's layout. Copy that differs only by wording for identical behaviour takes v1's words.

| # | Screen | Inventory flag | Ruling |
|---|---|---|---|
| B2-1 | Login | auth error copy | v1: "Invalid email or password." Per-field zod errors stay (v2 form, a11y) instead of v1's single "Please enter a valid email and password.". |
| B2-2 | Login | "I have an invite code" (v2-only) | Kept as a second muted text link under "Forgot password?", same classes. |
| B2-3 | Forgot/Reset | "reset link" vs "reset code" | v2 flow (pasted code, Plan 10) and its copy stay. v1 card/header layout. Forgot description: "We'll email you a reset code." (v1's server-console sentence is dev-only). Success uses v1's green box above the form, with v2's sentence. Reset keeps code + confirm fields and the done state, drawn as the same card ("Password updated"). "I have a reset code", "Request a new code", "Back to sign in" are muted text links like "Forgot password?". |
| B2-4 | Check-in | confirm step, copy, status | Confirm-before-write kept (spec 04 D3/C6), drawn as v1's centred layout: teal-tinted icon circle (`QrCode`), h1 "Check in to this session?", muted prompt, `Button size="lg"` "Check in". Result screens are v1's (icon circle, h1, message, teal "Go to dashboard" link). `checkInCopy` text unchanged (in-app scans share it); already-checked-in stays generic (no `currentStatus` in v2 — gap). Malformed token renders v1's error layout. |
| B2-5 | More | Attendance/Notifications rows | Kept — they come from shared `navFor` (spec §2: nav unchanged). Use the ported `MoreMenu`. |
| B2-6 | Settings | labels, low-attendance count, extras | v1 labels and descriptions for the five v1 rows ("New assignments", "Submission reviewed", "Session rescheduled", "Low-attendance flags", "Mentor follow-ups"), except low-attendance description "When a student you lead/admin misses two in a row." (spec 18 D12 — two). Sixth row "Quiz graded" / "When a quiz you took has been graded." placed after "Session rescheduled". Section description "Changes save automatically."; v2's inbox explainer dropped. Push block = a 4th `Section` (icon `Smartphone`, "Push notifications"). Security = a 5th `Section` (icon `ShieldCheck`, "Security", description "Signs this account out on every device — use it if a phone is lost.") with outline "Sign out" and "Sign out everywhere" buttons. Profile/password success and server errors become toasts ("Profile saved.", "Password updated." + " Signed out of N other device(s)." when `sessionsRevoked > 0`); field errors stay inline. Email is a disabled Input with description "Change via the admin console.". Save-disabled rule stays v2's (changed AND valid). Password section still hidden when `!user.hasPassword`. |
| B2-7 | Notifications | total count | Header description "{unread} unread" (no total in the API — gap). "Mark all read" = PageHeader action `Button variant="outline" size="sm"`. Empty copy v1. Timestamp "MMM d, yyyy · h:mm a · {N} ago" with a real "·". Infinite scroll, pull-to-refresh, tap-to-mark-read kept. |
| B2-8 | Dashboard | Week vs Session, Join stream, events | Spec 19 D12 → "Session N of M" / "K sessions to go"; D13 → the teal full-width link button reads "Join stream" and shows only while `isInProgress`, eyebrow "Happening now" then; D14 → "Absence budget left" label on the budget StatCard; D19/R10 → events card keeps its empty state. Greeting subtitle v2 wording with v1 punctuation: "You're all caught up." / "N assignment(s) need(s) your attention.". Everything else v1: "Hi, {first} 👋", single 3-column StatCard row ("Absence budget left"/"this season", "Streak" (+Flame), "Assignments"/"pending" teal when >0), warning late box, next-session card, events card **before** Due soon, Due soon badges "Due {MMM d}" (overdue, from `dueOrgDay`) / "Due in {distance}". Not-enrolled: v1 EmptyState copy + teal "While you wait" box (link to `/profile`); events card follows it. StaggerReveal motion dropped (gap); v1's extra 12px slot gaps reproduced only where v1 renders an empty slot (greeting→hero; next-session→due-soon when no events). |
| B2-9 | Shared dashboard pieces | StatTile / UpcomingEventsCard used by other roles | Student dashboard switches to the new `StatCard`; `StatTile` stays for Super/SeasonStaff until their batches. `UpcomingEventsCard` is restyled to v1 for every role (one component), keeping `query` prop, empty state, url→openURL, non-url→`/event/[id]`; date label becomes v1's `MMM d · h:mm a` via a new `formatEventWhenShort` (old `formatEventWhen` untouched). |
| B2-10 | Season / Attendance / Quizzes / Session | "Week" copy, session time | Season progress "Session N of M" (D12). Times with no org wall time (`upcoming[].startsAt`, attendance rows, quiz dates) stay device-zone as today — gap note. |
| B2-11 | History | "1 sessions" | v1 exactly: "Curriculum ({n} sessions)" always plural; attendance + Participated as two badges. Disclosure arrow = lucide `ChevronRight` rotating 90° (`<details>` marker). |
| B2-12 | Attendance | streak line, back link | Streak line dropped (v1 shows streak on the dashboard only). "← Dashboard" link → `router.push("/dashboard")`. |
| B2-13 | Calendar | v2-only legend/badges/day list, no-season, events | Student path is v1's `SeasonCalendar`: segmented Upcoming/Week/Month, agenda with time rail, Week/Month as v1's 7-column chip grid. Legend, status badges, stacked week rows, dot month and tap-a-day list are removed. Student with no season → v1 EmptyState "No active season" (no events). Alumni (graduated students, `graduationYear !== null`) keep today's events view until batch 6. Event rows keep v2 navigation to `/event/[id]` (the route exists; v1 has no event page). SUPER/LEADER/ADMIN paths keep their current rendering until batches 3–5. |
| B2-14 | Session detail | v2-only extras | v1 layout. Kept and styled as v1 Details rows: "Your attendance" row (icon `CheckCheck`). Description kept as an "About" card (eyebrow) after Details. Check-in: v1 `Button size="lg"` "Check In" (disabled when closed, hint "Check-in hasn't opened yet") opens a `Modal` "Scan check-in code" hosting `QrScanner`; typed code entry kept inside that modal as a muted "Enter code instead" link; result shown in the modal with the v1 check-in result layout. "You checked in at {time}." kept as the hint line under the button. Video player: v1 frame, seek bar with markers / locked region / "Answer to unlock", summary card, v1 question modal copy ("Correct!", "Not quite — the correct answer is highlighted."). Play/Pause and "Leave the quiz" kept as ghost buttons under the seek bar; Android back = leave (D15). Fallback "Watch recording" link button (v1 copy) replaces "Watch on YouTube". |
| B2-15 | Quizzes | no-season, hero, PAPER rows | Hero always renders (v1); no season → hero "—" + EmptyState "No quizzes yet" (no fetch, as now). PAPER rows not pressable (v1). Runner gets v1's ConfirmDialog "Submit quiz?" and the full Result view for SUBMITTED. Debounced save + "Saving…/Saved/Not saved" + "Retry save" kept as `text-xs text-muted-foreground` under the questions. |
| B2-16 | Assignments | RETURNED, rich text, editing, draft | RETURNED: dot `bg-warning-500`, `Badge variant="warning"` "Returned" (v2 status, v1 has none). Submission and forum compose stay plain `Textarea` inside v1's card (the API stores/returns plain text — `RichTextEditor` would lose formatting; gap). Read-only text/feedback/posts render through `RichTextView` with `plainTextToHtml` where text is plain. "Start working" kept (C6) as v1 `Button` in the "Your submission" card. Editable statuses stay v2's (DRAFT/RETURNED). "Submitted late" kept as an extra `Badge variant="warning"` "Late". Remove-file control omitted (no hook, uploads off). Forum keeps D10 due badge in the hero, leader feedback block (as a "Leader feedback" Card), paging, comments paging; comment delete goes through `ConfirmDialog` "Delete comment?". Counter copy v1 "{n} word(s) · minimum {min}". "Group discussion · {loaded count}" (no total — gap). |
| B2-17 | Profile | stats, name/email, avatar | StatCards: "Absence budget left" (D14) / "Assignments" `{completed}/{expected}` via a new `useMyEngagement()` hook on `GET /api/v1/students/{me}/engagement` parsed with `studentSelfEngagementSchema` / "Streak" (+Flame); shown when `activeSeasonId !== null`, "—" for missing values. Avatar: initials only, no "Add photo" button (uploads off — gap). Form: v1 fieldset sections; "Full name" Input saved through the existing `useUpdateProfile` (PATCH `/me`) when changed; "Email" disabled Input (not editable in v2 — gap). DatePicker for date of birth (local `yyyy-MM-dd`, no TZ shift). Buttons v1: "Save changes" above outline "Cancel" (→ `router.back()`); success toast "Profile saved." (v2 feedback, v1 refreshes silently). "Name and email" card removed. |
| B2-18 | All | loading / error | Loading = v1 student route skeleton (`RouteSkeleton`). Errors = v1 route error (`RouteError`: AlertTriangle, "Something went wrong", "We couldn't load this page. Please try again — if it keeps happening, let your leader know.", Button "Try again" → refetch). Card-level failures that v2 isolates (dashboard attendance/events) keep their own small error. |

## Review Focus

- **A student with no active season opening every tab** → each screen shows its v1 empty branch and fires no season-scoped request; pinned in Tasks 6, 7, 8, 10, 11 tests ("no request when no active season").
- **Long user text** (Arabic names, long season/assignment/session titles) → truncates on one line where v1 has `truncate` (titles in lists, hero season title, calendar chips), wraps where v1 wraps; pinned in Task 2's StatCard test and Task 8's chip test (`numberOfLines={1}`).
- **Dark mode** → every rebuilt screen uses semantic/`dark:` classes, no hard-coded light colours; pinned per screen by the dark capture in each task and by `RouteSkeleton`/`StatCard` tests rendering under `dark`.
- **A session in progress at the org's day boundary (23:30 Cairo)** → agenda day heading and grid cell come from `dayKey`, not the device clock; pinned in Task 8 (existing "late-night session under the 2nd" test kept).
- **Pull-to-refresh on screens moved off legacy `Screen`** → still refetches; pinned in Task 2 (`ShellFrame` RefreshControl test) and Task 6 (dashboard refresh test kept).

---

## File Structure

```
apps/mobile/
  src/lib/format.ts                          # + formatShortDay, formatLongDay, formatLongDayYear,
                                             #   formatWeekdayDayYear, splitWallTime, addMinutesToWallTime,
                                             #   formatDistanceOnly, formatEventWhenShort, formatStampAgo
  src/design/layout/shell-frame.tsx          # + refreshing/onRefresh (RefreshControl)
  src/design/layout/page-title.tsx           # NEW v1 hand-rolled h1 idiom: PageTitle, Eyebrow, BackLink
  src/design/layout/route-states.tsx         # NEW v1 app/student/loading.tsx + error.tsx: RouteSkeleton, RouteError
  src/design/layout/auth-card.tsx            # NEW v1 login/forgot/reset card + header + muted link
  src/design/students/stat-card.tsx          # NEW port of v1 components/students/stat-card.tsx
  src/design/students/season-history.tsx     # NEW port of v1 components/students/season-history.tsx
  src/design/settings/section.tsx            # NEW v1 settings-form.tsx Section helper
  src/design/sessions/season-calendar.tsx    # NEW port of v1 components/sessions/season-calendar.tsx (agenda + grid)
  src/design/forms/fieldset.tsx              # NEW v1 student-form fieldset/legend look
  src/hooks/use-engagement.ts                # + useMyEngagement()
  app/login.tsx, forgot-password.tsx, reset-password.tsx, checkin/[token].tsx
  app/(app)/{more,settings,notifications,dashboard,season,history,attendance,calendar,
             quizzes,assignments,profile}.tsx
  app/(app)/{assignment/[id]/index,quiz/[id]/index,session/[id]/index}.tsx   # student branches
  src/components/{check-in/*,dashboard/StudentDashboard,dashboard/UpcomingEventsCard,
                  season/StudentSeason,NotificationPreferences,ForumThread,VideoQuizPlayer}.tsx
  .maestro/capture-screen.yaml               # NEW generic: openLink + N scrolled screenshots
tools/ui-reference/capture-v2.sh             # NEW: role/theme/route → ~/projects/JPC/.v2-captures/batch-2/
tools/ui-reference/batch-2-pairs.sh          # NEW: builds compare-batch-2.html from v1 shots + v2 captures
docs/superpowers/ui-rebuild/gaps-batch-2.md  # NEW gap note
```

## The per-screen loop (every screen task follows it)

1. Read the inventory section named in the task, v1's source files it lists, and v1's light + dark screenshots.
2. **RED:** edit the screen's test file to the new copy/markup per the task's "Test changes" list (behaviour assertions untouched); run it and watch the changed assertions fail.
3. **GREEN:** rewrite the screen's rendering per the inventory's section (a) with the Rulings applied; hooks from section (b) stay as they are. Run the test file until green, then `pnpm --filter @space/mobile test:unit` for regressions.
4. **Capture:** `tools/ui-reference/capture-v2.sh student light <route> <name> <shots>` and `… dark …` (Task 1). Open v1's PNG and the v2 PNGs side by side (Read tool). Fix every visible difference that is not a platform detail; write the rest in `gaps-batch-2.md` under the screen's heading.
5. **Commit** with the task's message.

Commands used throughout:
- Single test file: `cd apps/mobile && npx jest src/__tests__/<file> 2>&1 | tail -30`
- Mobile suite: `pnpm --filter @space/mobile test:unit > /tmp/claude-1000/-home-mark-projects-JPC/96fbacd3-5aa3-4f64-805c-12a9321915db/scratchpad/unit.log 2>&1; tail -15 …/unit.log`
- Types/lint: `pnpm typecheck && pnpm lint`

---

### Task 1: Capture rig for batch 2

**Files:**
- Create: `apps/mobile/.maestro/capture-screen.yaml`, `tools/ui-reference/capture-v2.sh`, `tools/ui-reference/batch-2-pairs.sh`
- Modify: `tools/ui-reference/README.md` (v2 capture section)

**Interfaces:**
- Produces: `capture-v2.sh <role> <light|dark> <route> <name> [shots=4]` → PNGs `~/projects/JPC/.v2-captures/batch-2/<role>/<theme>/<name>-<n>.png`; `batch-2-pairs.sh` → `~/projects/JPC/.v2-captures/batch-2/compare-batch-2.html`.

- [ ] **Step 1: Write the generic Maestro flow**

```yaml
# Opens one route (already signed in) and takes SHOTS viewport screenshots top to bottom.
# maestro --device emulator-5558 test --test-output-dir <dir> -e ROUTE=dashboard -e NAME=x -e SHOTS=4 .maestro/capture-screen.yaml
appId: com.jpc.space
---
- openLink: spacev2://${ROUTE}
- waitForAnimationToEnd:
    timeout: 8000
- evalScript: ${output.n = 0}
- repeat:
    times: ${SHOTS}
    commands:
      - evalScript: ${output.n = output.n + 1}
      - takeScreenshot: ${NAME}-${output.n}
      - scroll
```

- [ ] **Step 2: Write `capture-v2.sh`**

```bash
#!/usr/bin/env bash
# capture-v2.sh <role> <light|dark> <route> <name> [shots]
# Signs in as the reference user for <role> (password from ~/.secrets, never printed),
# sets the emulator's night mode, opens <route> and saves numbered screenshots.
set -euo pipefail
role=$1 theme=$2 route=$3 name=$4 shots=${5:-4}
here=$(cd "$(dirname "$0")" && pwd)
mobile="$here/../../apps/mobile"
adb=~/Android/Sdk/platform-tools/adb
maestro=~/.maestro/bin/maestro
out=~/projects/JPC/.v2-captures/batch-2/$role/$theme
mkdir -p "$out"
email=$(node -e "console.log(require(process.env.HOME+'/projects/JPC/.v1-reference/users.json')['$role'].email)")
password=$(cat ~/.secrets/jpc-v1-reference-password)
if [ "$theme" = dark ]; then night=yes; else night=no; fi
$adb -s emulator-5558 shell cmd uimode night "$night" >/dev/null
stamp=$HOME/projects/JPC/.v2-captures/batch-2/.signed-in
if [ "$(cat "$stamp" 2>/dev/null)" != "$role" ]; then
  $maestro --device emulator-5558 test -e EMAIL="$email" -e PASSWORD="$password" "$mobile/.maestro/login-as.yaml" >/dev/null
  echo "$role" > "$stamp"
fi
tmp=$(mktemp -d)
$maestro --device emulator-5558 test --test-output-dir "$tmp" -e ROUTE="$route" -e NAME="$name" -e SHOTS="$shots" "$mobile/.maestro/capture-screen.yaml" >/dev/null
find "$tmp" -name "$name-*.png" -exec cp {} "$out/" \;
rm -rf "$tmp"
ls "$out" | grep "^$name-"
```

- [ ] **Step 3: Write `batch-2-pairs.sh`**

```bash
#!/usr/bin/env bash
# Builds the batch-2 comparison page from v1 shots and v2 captures (real data: devbox only).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
v1=~/projects/JPC/.v1-reference/shots
v2=~/projects/JPC/.v2-captures/batch-2
args=()
pair() { # label role v1file v2name
  for t in light dark; do
    local shots; shots=$(ls "$v2/$2/$t/$4"-*.png 2>/dev/null | sort -V | paste -sd, -)
    [ -n "$shots" ] && [ -f "$v1/$2/$t/$3" ] && args+=(--pair "$1 ($t)" "$v1/$2/$t/$3" "$shots")
  done
  return 0
}
pair "Login" public login.png login
pair "Forgot password" public forgot-password.png forgot-password
pair "Reset password" public reset-password.png reset-password
pair "Check-in link (invalid)" student checkin__not-a-real-token.png checkin-invalid
pair "Dashboard" student student__dashboard.png dashboard
pair "Season" student student__season.png season
pair "Calendar" student student__calendar.png calendar
pair "Assignments" student student__assignments.png assignments
pair "Assignment detail" student student__assignments__id.png assignment-detail
pair "Quizzes" student student__quizzes.png quizzes
pair "Quiz" student student__quizzes__id.png quiz-detail
pair "History" student student__history.png history
pair "Attendance" student student__attendance.png attendance
pair "Profile" student student__profile.png profile
pair "Settings" student student__settings.png settings
pair "More" student student__more.png more
pair "Notifications" student student__notifications.png notifications
pair "Session detail" student student__sessions__id.png session-detail
node "$here/compare.mjs" --out "$v2/compare-batch-2.html" "${args[@]}"
echo "$v2/compare-batch-2.html"
```

- [ ] **Step 4: Smoke-test the rig on the current (pre-rebuild) dashboard**

Run: `chmod +x tools/ui-reference/capture-v2.sh tools/ui-reference/batch-2-pairs.sh && node tools/ui-reference/set-reference-passwords.mjs && tools/ui-reference/capture-v2.sh student light dashboard dashboard 2`
Expected: prints `dashboard-1.png dashboard-2.png`; the PNG (Read tool) shows the signed-in student dashboard. Signed-out screens are captured by first running `adb -s emulator-5558 shell pm clear com.jpc.space` and removing the `.signed-in` stamp, then `capture-screen.yaml` with `ROUTE=login`.

- [ ] **Step 5: Document and commit**

Add to `tools/ui-reference/README.md` under "v2 capture rig":

```
./capture-v2.sh <role> <light|dark> <route> <name> [shots]   # -> ~/projects/JPC/.v2-captures/batch-2/<role>/<theme>/
./batch-2-pairs.sh                                            # -> compare-batch-2.html (send privately, never publish)
```

```bash
git add apps/mobile/.maestro/capture-screen.yaml tools/ui-reference/capture-v2.sh tools/ui-reference/batch-2-pairs.sh tools/ui-reference/README.md
git commit -m "chore(ui-reference): batch-2 capture and comparison scripts"
```

---

### Task 2: Shared batch-2 pieces — formatters, ShellFrame refresh, PageTitle, route states, StatCard

**Files:**
- Modify: `apps/mobile/src/lib/format.ts`, `apps/mobile/src/design/layout/shell-frame.tsx`
- Create: `apps/mobile/src/design/layout/page-title.tsx`, `apps/mobile/src/design/layout/route-states.tsx`, `apps/mobile/src/design/students/stat-card.tsx`
- Test: `apps/mobile/src/__tests__/format.test.ts` (extend), `apps/mobile/src/__tests__/batch2-shared.test.tsx` (new)

**Interfaces:**
- Produces (format.ts, all return `"—"` for null/invalid like the existing helpers):
  - `formatShortDay(dayKey: string | null): string` → `"Mar 13"`
  - `formatLongDay(dayKey: string | null): string` → `"Sunday, March 8"`
  - `formatLongDayYear(dayKey: string | null): string` → `"Sunday, March 8, 2026"`
  - `formatWeekdayDayYear(dayKey: string | null): string` → `"Sun, Mar 8, 2026"`
  - `splitWallTime(time: string | null): { clock: string; meridiem: string }` → `{ clock: "8:00", meridiem: "PM" }` (`{clock:"—",meridiem:""}` on bad input)
  - `addMinutesToWallTime(time: string | null, minutes: number): string | null` → `"21:30"` (wraps past midnight)
  - `formatDistanceOnly(iso: string | null): string` → `"3 days"` (no suffix)
  - `formatEventWhenShort(e: { dayKey: string; endDayKey: string | null; time: string | null }): string` → `"Mar 5 · 6:30 PM"` / `"Mar 5 – Mar 7"` (v1 upcoming-events-card `whenLabel`; the end side carries no time because v2 events have one `time`)
  - `formatStampAgo(iso: string | null): string` → `"Jul 8, 2026 · 1:57 PM · 3 months ago"`
- Produces (components):
  - `ShellFrame({ children, scroll?, refreshing?, onRefresh? })` — RefreshControl when `onRefresh` given.
  - `PageTitle({ title, subtitle?, size?: "page" | "detail", className? })` — h1 `text-2xl font-black text-brand-navy-900 dark:text-foreground` (`text-xl` for detail) + optional `mt-1 text-sm text-muted-foreground` subtitle; `accessibilityRole="header"`.
  - `Eyebrow({ children, tone?: "muted" | "teal", className? })` — `text-[10px] font-bold uppercase tracking-widest` + muted `text-muted-foreground/70` / teal `text-brand-teal-700 dark:text-brand-teal-300`.
  - `BackLink({ label, onPress })` — `text-xs font-semibold text-brand-teal-700 dark:text-brand-teal-300`, renders `← {label}`, `accessibilityRole="link"`.
  - `RouteSkeleton()` — v1 `app/student/loading.tsx`; `accessibilityLabel="Loading"`.
  - `RouteError({ onRetry })` — v1 `app/student/error.tsx`.
  - `StatCard({ label, value, sublabel?, onPress?, variant?: "white" | "navy" | "teal", icon?: "flame" })` — accessibilityLabel `"{label}: {value}"`.

- [ ] **Step 1: Write the failing formatter tests** (append to `format.test.ts`)

```ts
import {
  addMinutesToWallTime, formatDistanceOnly, formatEventWhenShort, formatLongDay, formatLongDayYear,
  formatShortDay, formatStampAgo, formatWeekdayDayYear, splitWallTime,
} from "../lib/format";

describe("batch-2 formatters", () => {
  it("formats org day keys without touching the device zone", () => {
    expect(formatShortDay("2026-03-13")).toBe("Mar 13");
    expect(formatLongDay("2026-03-08")).toBe("Sunday, March 8");
    expect(formatLongDayYear("2026-03-08")).toBe("Sunday, March 8, 2026");
    expect(formatWeekdayDayYear("2026-03-08")).toBe("Sun, Mar 8, 2026");
    expect(formatShortDay(null)).toBe("—");
    expect(formatLongDay("nope")).toBe("—");
  });

  it("splits and adds to wall-clock times as text", () => {
    expect(splitWallTime("20:00")).toEqual({ clock: "8:00", meridiem: "PM" });
    expect(splitWallTime("00:05")).toEqual({ clock: "12:05", meridiem: "AM" });
    expect(splitWallTime(null)).toEqual({ clock: "—", meridiem: "" });
    expect(addMinutesToWallTime("20:00", 90)).toBe("21:30");
    expect(addMinutesToWallTime("23:30", 45)).toBe("00:15");
    expect(addMinutesToWallTime(null, 30)).toBeNull();
  });

  it("formats v1's short event label", () => {
    expect(formatEventWhenShort({ dayKey: "2099-03-05", endDayKey: null, time: "18:30" })).toBe("Mar 5 · 6:30 PM");
    expect(formatEventWhenShort({ dayKey: "2099-03-05", endDayKey: "2099-03-07", time: null })).toBe("Mar 5 – Mar 7");
    expect(formatEventWhenShort({ dayKey: "2099-03-05", endDayKey: "2099-03-05", time: null })).toBe("Mar 5");
  });

  it("formats distances and stamps", () => {
    const inThreeDays = new Date(Date.now() + 3 * 86_400_000 + 60_000).toISOString();
    expect(formatDistanceOnly(inThreeDays)).toBe("3 days");
    expect(formatDistanceOnly(null)).toBe("—");
    expect(formatStampAgo(new Date(Date.now() - 2 * 3_600_000).toISOString())).toMatch(/^\w{3} \d{1,2}, \d{4} · \d{1,2}:\d{2} (AM|PM) · 2 hours ago$/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/mobile && npx jest src/__tests__/format.test.ts 2>&1 | tail -20`
Expected: FAIL — `formatShortDay is not a function` (imports undefined).

- [ ] **Step 3: Implement the formatters** (append to `src/lib/format.ts`)

```ts
function formatDayKeyAs(dayKey: string | null, pattern: string): string {
  if (dayKey == null) return PLACEHOLDER;
  const date = parse(dayKey, "yyyy-MM-dd", new Date());
  if (!isValid(date)) return PLACEHOLDER;
  return format(date, pattern);
}

/** e.g. "Mar 13" — v1's short due badge; org day key, no zone (X13). */
export function formatShortDay(dayKey: string | null): string {
  return formatDayKeyAs(dayKey, "MMM d");
}

/** e.g. "Sunday, March 8" — v1 agenda day heading. */
export function formatLongDay(dayKey: string | null): string {
  return formatDayKeyAs(dayKey, "EEEE, MMMM d");
}

/** e.g. "Sunday, March 8, 2026" — v1 session hero date. */
export function formatLongDayYear(dayKey: string | null): string {
  return formatDayKeyAs(dayKey, "EEEE, MMMM d, yyyy");
}

/** e.g. "Sun, Mar 8, 2026" — v1 attendance row date. */
export function formatWeekdayDayYear(dayKey: string | null): string {
  return formatDayKeyAs(dayKey, "EEE, MMM d, yyyy");
}

/** "20:00" → { clock: "8:00", meridiem: "PM" } — v1's agenda time rail, as text (X13). */
export function splitWallTime(time: string | null): { clock: string; meridiem: string } {
  const whole = formatWallTime(time);
  if (whole === PLACEHOLDER) return { clock: PLACEHOLDER, meridiem: "" };
  const [clock = PLACEHOLDER, meridiem = ""] = whole.split(" ");
  return { clock, meridiem };
}

/** "20:00" + 90 → "21:30"; wraps past midnight. Text arithmetic on the org clock. */
export function addMinutesToWallTime(time: string | null, minutes: number): string | null {
  if (time == null) return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!m) return null;
  const total = (((Number(m[1]) * 60 + Number(m[2]) + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** "3 days" — v1's `formatDistanceToNowStrict` without a suffix ("Due in 3 days"). */
export function formatDistanceOnly(iso: string | null): string {
  if (iso == null) return PLACEHOLDER;
  const date = parseISO(iso);
  if (!isValid(date)) return PLACEHOLDER;
  return formatDistanceToNowStrict(date);
}

/** v1 upcoming-events-card whenLabel: "Mar 5 · 6:30 PM", "Mar 5 – Mar 7" (no year). */
export function formatEventWhenShort(event: { dayKey: string; endDayKey: string | null; time: string | null }): string {
  const start = event.time !== null ? `${formatShortDay(event.dayKey)} · ${formatWallTime(event.time)}` : formatShortDay(event.dayKey);
  if (event.endDayKey && event.endDayKey !== event.dayKey) return `${start} – ${formatShortDay(event.endDayKey)}`;
  return start;
}

/** v1 notifications stamp: "Jul 8, 2026 · 1:57 PM · 3 months ago". */
export function formatStampAgo(iso: string | null): string {
  if (iso == null) return PLACEHOLDER;
  const date = parseISO(iso);
  if (!isValid(date)) return PLACEHOLDER;
  return `${format(date, "MMM d, yyyy · h:mm a")} · ${formatDistanceToNowStrict(date, { addSuffix: true })}`;
}
```

Run the test again. Expected: PASS.

- [ ] **Step 4: Write the failing component tests** (`src/__tests__/batch2-shared.test.tsx`)

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { RefreshControl, ScrollView, Text as RNText } from "react-native";

import { ShellFrame } from "../design/layout/shell-frame";
import { BackLink, Eyebrow, PageTitle } from "../design/layout/page-title";
import { RouteError, RouteSkeleton } from "../design/layout/route-states";
import { StatCard } from "../design/students/stat-card";

describe("ShellFrame", () => {
  it("adds a RefreshControl wired to onRefresh", () => {
    const onRefresh = jest.fn();
    render(<ShellFrame refreshing={false} onRefresh={onRefresh}><RNText>body</RNText></ShellFrame>);
    const control = screen.UNSAFE_getByType(ScrollView).props.refreshControl;
    expect(control.type).toBe(RefreshControl);
    control.props.onRefresh();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("has no RefreshControl without onRefresh", () => {
    render(<ShellFrame><RNText>body</RNText></ShellFrame>);
    expect(screen.UNSAFE_getByType(ScrollView).props.refreshControl).toBeUndefined();
  });
});

describe("page title idiom", () => {
  it("renders v1's h1 + subtitle, eyebrow and back link", () => {
    const onBack = jest.fn();
    render(
      <>
        <BackLink label="Dashboard" onPress={onBack} />
        <PageTitle title="Attendance" subtitle="Your current season" />
        <Eyebrow tone="teal">Current season</Eyebrow>
      </>,
    );
    expect(screen.getByRole("header", { name: "Attendance" })).toBeTruthy();
    expect(screen.getByText("Your current season")).toBeTruthy();
    expect(screen.getByText("Current season")).toBeTruthy();
    fireEvent.press(screen.getByText("← Dashboard"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("route states", () => {
  it("skeleton is labelled Loading; error retries", () => {
    const onRetry = jest.fn();
    render(<><RouteSkeleton /><RouteError onRetry={onRetry} /></>);
    expect(screen.getByLabelText("Loading")).toBeTruthy();
    expect(screen.getByText("Something went wrong")).toBeTruthy();
    fireEvent.press(screen.getByText("Try again"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("StatCard", () => {
  it("labels itself label: value, presses when given onPress, truncates nothing it shouldn't", () => {
    const onPress = jest.fn();
    render(<StatCard label="Absence budget left" value="42%" sublabel="this season" onPress={onPress} />);
    fireEvent.press(screen.getByLabelText("Absence budget left: 42%"));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByText("this season")).toBeTruthy();
  });

  it("shows the flame icon variant for a positive streak", () => {
    render(<StatCard label="Streak" value="3" icon="flame" />);
    expect(screen.getByLabelText("Streak: 3")).toBeTruthy();
    expect(screen.getByTestId("stat-card-flame")).toBeTruthy();
  });
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `cd apps/mobile && npx jest src/__tests__/batch2-shared.test.tsx 2>&1 | tail -20`
Expected: FAIL — `Cannot find module '../design/layout/page-title'`.

- [ ] **Step 6: Implement**

`src/design/layout/shell-frame.tsx`:

```tsx
import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";

/**
 * v1 shell-frame.tsx `<main className="mx-auto w-full max-w-7xl flex-1 px-4
 * pb-24 pt-4">`. `pb-24` keeps the last row clear of the floating tab bar.
 * The top bar (rendered above this) owns the top safe-area inset.
 * `onRefresh` adds pull-to-refresh (v2-only; v1 pages are server-rendered).
 */
export function ShellFrame({
  children,
  scroll = true,
  refreshing = false,
  onRefresh,
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  if (!scroll) {
    return <View className="flex-1 bg-background px-4 pb-24 pt-4">{children}</View>;
  }
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="px-4 pb-24 pt-4"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}
```

`src/design/layout/page-title.tsx`:

```tsx
/**
 * v1 student pages hand-roll their header instead of using PageHeader:
 * h1 `text-2xl font-black text-brand-navy-900 dark:text-foreground` (detail
 * pages `text-xl`), subtitle `mt-1 text-sm text-muted-foreground`, eyebrows
 * `text-[10px] font-bold uppercase tracking-widest …`, back links
 * `text-xs font-semibold text-brand-teal-700 … ← Label`.
 */
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { cn } from "../lib/cn";
import { Text } from "../ui/text";

export function PageTitle({
  title, subtitle, size = "page", className,
}: { title: string; subtitle?: string; size?: "page" | "detail"; className?: string }) {
  return (
    <View className={className}>
      <Text
        accessibilityRole="header"
        className={cn(size === "page" ? "text-2xl" : "text-xl", "font-black text-brand-navy-900 dark:text-foreground")}
      >
        {title}
      </Text>
      {subtitle ? <Text className="mt-1 text-sm text-muted-foreground">{subtitle}</Text> : null}
    </View>
  );
}

export function Eyebrow({
  children, tone = "muted", className,
}: { children: ReactNode; tone?: "muted" | "teal"; className?: string }) {
  return (
    <Text
      className={cn(
        "text-[10px] font-bold uppercase tracking-widest",
        tone === "muted" ? "text-muted-foreground/70" : "text-brand-teal-700 dark:text-brand-teal-300",
        className,
      )}
    >
      {children}
    </Text>
  );
}

export function BackLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} className="self-start">
      <Text className="text-xs font-semibold text-brand-teal-700 dark:text-brand-teal-300">← {label}</Text>
    </Pressable>
  );
}
```

`src/design/layout/route-states.tsx`:

```tsx
/**
 * v1 app/student/loading.tsx and app/student/error.tsx — the same two
 * states for every student route.
 */
import { AlertTriangle } from "lucide-react-native";
import { View } from "react-native";

import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { Skeleton, SkeletonCard } from "../ui/skeleton";

export function RouteSkeleton() {
  return (
    <View accessibilityLabel="Loading" accessible className="flex-col gap-3">
      <Skeleton className="h-32 rounded-2xl" />
      <View className="flex-row gap-3">
        <Skeleton className="h-24 flex-1 rounded-2xl" />
        <Skeleton className="h-24 flex-1 rounded-2xl" />
        <Skeleton className="h-24 flex-1 rounded-2xl" />
      </View>
      <SkeletonCard />
      <SkeletonCard />
    </View>
  );
}

export function RouteError({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title="Something went wrong"
      description="We couldn't load this page. Please try again — if it keeps happening, let your leader know."
      action={<Button onPress={onRetry}>Try again</Button>}
    />
  );
}
```

(If `EmptyState`'s action prop is named differently in `src/design/ui/empty-state.tsx`, use its name — read the file first.)

`src/design/students/stat-card.tsx` — port of v1 `components/students/stat-card.tsx` (classes in inventory B §1 "StatCard"). Navy uses `expo-linear-gradient` with resolved colours exactly as `src/design/ui/empty-state.tsx` does (light `brand-navy-900 → brand-navy-700`, dark `brand-navy-800 → brand-navy-600`, diagonal `start {x:0,y:0} end {x:1,y:1}`):

```tsx
/**
 * Port of v1 src/components/students/stat-card.tsx.
 * Native differences: Link → Pressable (active:opacity-80 for hover:opacity-80);
 * navy's bg-gradient-to-br is an expo-linear-gradient layer; the value's
 * <Flame> child is the `icon="flame"` prop.
 */
import { LinearGradient } from "expo-linear-gradient";
import { Flame } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, View } from "react-native";

import { iconWithClassName } from "../lib/icon";
import { cn } from "../lib/cn";
import { shadowStyle } from "../lib/shadow";
import { colors } from "../theme/tailwind-theme";
import { Text } from "../ui/text";

iconWithClassName(Flame);

type Variant = "white" | "navy" | "teal";

const BOX: Record<Variant, string> = {
  white: "border border-border bg-card",
  navy: "overflow-hidden dark:border dark:border-white/10",
  teal: "border border-brand-teal-200 bg-brand-teal-100 dark:border-brand-teal-900 dark:bg-brand-teal-950",
};
const VALUE: Record<Variant, string> = {
  white: "text-brand-navy-900 dark:text-foreground",
  navy: "text-white",
  teal: "text-brand-teal-900 dark:text-brand-teal-100",
};
const LABEL: Record<Variant, string> = {
  white: "text-muted-foreground/70",
  navy: "text-brand-teal-300",
  teal: "text-brand-teal-700 dark:text-brand-teal-300",
};
const SUB: Record<Variant, string> = {
  white: "text-muted-foreground/70",
  navy: "text-white/40",
  teal: "text-brand-teal-600 dark:text-brand-teal-400",
};

export function StatCard({
  label, value, sublabel, onPress, variant = "white", icon,
}: {
  label: string;
  value: string;
  sublabel?: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: "flame";
}) {
  const { colorScheme } = useColorScheme();
  const stops: [string, string] =
    colorScheme === "dark"
      ? [colors["brand-navy"]["800"]!, colors["brand-navy"]["600"]!]
      : [colors["brand-navy"]["900"]!, colors["brand-navy"]["700"]!];
  const body = (
    <>
      {variant === "navy" ? (
        <LinearGradient colors={stops} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: "absolute", inset: 0 }} />
      ) : null}
      <View className="flex-row items-center justify-center gap-1">
        {icon === "flame" ? <Flame testID="stat-card-flame" size={24} className="text-warning-500" /> : null}
        <Text className={cn("text-3xl font-black leading-none", VALUE[variant])}>{value}</Text>
      </View>
      <Text className={cn("text-center text-[10px] font-bold uppercase tracking-widest", LABEL[variant])}>{label}</Text>
      {sublabel ? <Text className={cn("text-[10px]", SUB[variant])}>{sublabel}</Text> : null}
    </>
  );
  const className = cn("h-full flex-1 flex-col items-center justify-center gap-1 rounded-2xl p-4", BOX[variant]);
  const style = variant === "white" ? shadowStyle("soft") : variant === "navy" ? shadowStyle("navy-glow") : undefined;
  const a11y = `${label}: ${value}`;
  if (onPress) {
    return (
      <Pressable accessibilityRole="link" accessibilityLabel={a11y} onPress={onPress} className={cn(className, "active:opacity-80")} style={style}>
        {body}
      </Pressable>
    );
  }
  return (
    <View accessible accessibilityLabel={a11y} className={className} style={style}>
      {body}
    </View>
  );
}
```

Before writing: check `src/design/lib/shadow.ts` for the shadow names it exports and the theme's `colors` export path (`src/design/theme/tailwind-theme.js`) as `empty-state.tsx` imports it; if there is no `navy-glow` shadow, add `0 4px 20px rgba(31,50,96,0.25)` to `SHADOWS` in `shadow.ts` under that name. The teal variant's `ring-1` becomes `border` (Card's porting rule).

Run: `cd apps/mobile && npx jest src/__tests__/batch2-shared.test.tsx src/__tests__/format.test.ts 2>&1 | tail -20`
Expected: PASS.

- [ ] **Step 7: Suite, types, commit**

Run: `pnpm --filter @space/mobile test:unit` (log to scratchpad, tail) and `pnpm typecheck && pnpm lint`
Expected: all green.

```bash
git add apps/mobile/src/lib/format.ts apps/mobile/src/design apps/mobile/src/__tests__/format.test.ts apps/mobile/src/__tests__/batch2-shared.test.tsx
git commit -m "feat(mobile): batch-2 shared pieces — formatters, refreshable ShellFrame, page title, route states, StatCard"
```

---

### Task 3: Login, forgot password, reset password

**Files:**
- Create: `apps/mobile/src/design/layout/auth-card.tsx`
- Modify: `apps/mobile/app/login.tsx`, `apps/mobile/app/forgot-password.tsx`, `apps/mobile/app/reset-password.tsx`
- Test: `apps/mobile/src/__tests__/login-screen.test.tsx`, `apps/mobile/src/__tests__/password-reset-screens.test.tsx`

**Markup spec:** inventory-A §1, §2, §3 (a). Rulings B2-1, B2-2, B2-3, B2-18 (not used — no queries).

**Interfaces:**
- Produces: `AuthCard({ title, description, children })` — v1 `main` (`flex-1 items-center justify-center px-4 py-12 bg-background`, wrapped in a keyboard-avoiding ScrollView) > card `w-full max-w-sm rounded-2xl border border-border/60 bg-card/90 p-6` + `shadowStyle("pop")` > header `mb-6 flex-col items-center gap-3` (`Logo size="lg"`, title `text-center text-2xl font-semibold tracking-tight text-foreground` role header, description `text-center text-sm text-muted-foreground`) > children. `AuthLink({ label, onPress })` — `text-center text-sm text-muted-foreground` Pressable, role link. `AuthNotice({ tone: "error" | "success", children })` — v1's bordered boxes (`rounded-lg border px-3 py-2 text-sm` + error `border-error-200 bg-error-50 text-error-700 dark:border-error-900 dark:bg-error-950 dark:text-error-200` / success `border-success-200 bg-success-50 text-success-700 dark:border-success-900 dark:bg-success-950 dark:text-success-200`), `accessibilityRole="alert"`.
- Consumes: `Input`, `PasswordInput`, `Button`, `Logo`, `Label` from `src/design/ui`; `shadowStyle` from `src/design/lib/shadow`.

- [ ] **Step 1: Test changes (RED)**
  - `login-screen.test.tsx`: error copy `"Incorrect email or password."` → `"Invalid email or password."`; add `expect(screen.getByText("Welcome back")).toBeTruthy(); expect(screen.getByText("Sign in to JPC Space to continue.")).toBeTruthy();` to the success test; inputs still found with `getByLabelText("Email")` / `getByLabelText("Password")`.
  - `password-reset-screens.test.tsx`: ForgotPassword — add `expect(screen.getByText("We'll email you a reset code.")).toBeTruthy()`; keep "Send reset code", "I have a reset code", confirmation sentence, hint assertions. ResetPassword — add `expect(screen.getByText("Choose a new password — at least 8 characters.")).toBeTruthy()`; keep labels "Reset code", "New password", "Confirm password".
  - Run both files. Expected: FAIL on the new copy assertions.

- [ ] **Step 2: Implement (GREEN)**
  - Write `auth-card.tsx` per the Interfaces block.
  - `login.tsx`: `AuthCard title="Welcome back" description="Sign in to JPC Space to continue."`; form `flex-col gap-4`: two `label` blocks (`flex-col gap-1.5` > `Text className="text-sm font-medium text-foreground"` + `Input size="lg" accessibilityLabel="Email" autoComplete="email" keyboardType="email-address" autoCapitalize="none"` / `PasswordInput size="lg" accessibilityLabel="Password"`), field errors via the ported `FormField`'s hint mechanism (or `accessibilityHint` on the input + a `text-xs text-error-600` line), `AuthNotice tone="error"` with "Invalid email or password." (keep `accessibilityLiveRegion="assertive"` and the announce call), `Button size="lg" className="w-full"` "Sign in"/"Signing in…", `AuthLink` "Forgot password?" → push `/forgot-password`, `AuthLink` "I have an invite code" → push `/accept-invite`. Keep every hook/redirect line from the current file.
  - `forgot-password.tsx`: `AuthCard title="Forgot password" description="We'll email you a reset code."`; when sent, `AuthNotice tone="success"` with the v2 sentence above the form (form stays visible, v1); failure `AuthNotice tone="error"`; Email label + `Input size="lg" accessibilityLabel="Email"`; `Button size="lg" className="w-full"` "Send reset code"; `AuthLink` "I have a reset code", `AuthLink` "Back to sign in".
  - `reset-password.tsx`: `AuthCard title="Reset password" description="Choose a new password — at least 8 characters."`; failure `AuthNotice tone="error"` + `AuthLink` "Request a new code"; fields "Reset code" (`Input size="lg"`), "New password", "Confirm password" (`PasswordInput size="lg"`), `Button size="lg" className="w-full"` "Set new password", `AuthLink` "Back to sign in". Done state: `AuthCard title="Password updated" description="Sign in with your new password. Every other device signed in to this account has been signed out."` + `Button size="lg" className="w-full"` "Go to sign in".
  - Delete these files' imports of `src/ui` and `src/theme`.
  - Run both test files. Expected: PASS.

- [ ] **Step 3: Capture and compare**
  Signed out: `adb -s emulator-5558 shell pm clear com.jpc.space`, `rm -f ~/projects/JPC/.v2-captures/batch-2/.signed-in`, then for each theme run Maestro `capture-screen.yaml` with `ROUTE=login`, `forgot-password`, `reset-password` (2 shots each, output copied to `~/projects/JPC/.v2-captures/batch-2/public/<theme>/`). Compare with `shots/public/<theme>/{login,forgot-password,reset-password}.png`. Known/allowed: no backdrop blur (bg-card/90 kept), v2-only links and copy per B2-2/B2-3.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/design/layout/auth-card.tsx apps/mobile/app/login.tsx apps/mobile/app/forgot-password.tsx apps/mobile/app/reset-password.tsx apps/mobile/src/__tests__/login-screen.test.tsx apps/mobile/src/__tests__/password-reset-screens.test.tsx docs/superpowers/ui-rebuild/gaps-batch-2.md
git commit -m "feat(mobile): v1 login, forgot and reset password screens"
```

---

### Task 4: Check-in link screen

**Files:**
- Modify: `apps/mobile/app/checkin/[token].tsx`, `apps/mobile/src/components/check-in/CheckInResult.tsx`
- Test: `apps/mobile/src/__tests__/checkin-link-screen.test.tsx`, `apps/mobile/src/__tests__/check-in-result.test.ts` (unchanged)

**Markup spec:** inventory-A §4 (a). Ruling B2-4.

**Interfaces:**
- Produces: `CheckInResult({ outcome, onDone })` rewritten as v1's centred block — `StatusCircle` (`size-16 rounded-full items-center justify-center` + success `bg-success-100 dark:bg-success-900` icon `text-success-700 dark:text-success-200`; error `bg-error-100 dark:bg-error-900` icon `text-error-700 dark:text-error-200`; neutral (confirm) `bg-brand-teal-100 dark:bg-brand-teal-950` icon `text-brand-teal-700 dark:text-brand-teal-300`), h1 `text-center text-2xl font-semibold text-foreground`, message `text-center text-muted-foreground`, link `mt-2 text-sm text-brand-teal-600 dark:text-brand-teal-400` "Go to dashboard". Icons: `CheckCircle` (success), `Clock` (refused `already_checked_in`), `XCircle` (other refusals), `QrCode` (confirm), size 32. `CheckInResult` is also used by `StudentCheckInCard` (Task 10) — keep its props.
- Consumes: `checkInCopy(outcome)` (unchanged), `useCheckIn`, `parseCheckInCode`.

- [ ] **Step 1: Test changes (RED)**
  - Add to the "press → POST once" test: before pressing, `expect(screen.getByText("Check in to this session?")).toBeTruthy()`.
  - Add to the malformed test: `expect(screen.getByText("Can't check in")).toBeTruthy()`.
  - Run. Expected: FAIL on both new assertions.

- [ ] **Step 2: Implement (GREEN)** — screen is a full-screen `View className="flex-1 items-center justify-center gap-4 bg-background px-4"` (no shell, v1 standalone). States: malformed → error layout "Can't check in" / "This check-in link is not valid."; pre-press → confirm layout + `Button size="lg"` "Check in" (loading while pending); after → `CheckInResult`. "Go to dashboard" link → `router.replace("/dashboard")`. Keep the anonymous `<Redirect>` and every hook line. Run the tests. Expected: PASS (including `check-in-result.test.ts`).

- [ ] **Step 3: Capture and compare** — `capture-v2.sh student light checkin/not-a-real-token checkin-invalid 1` (and dark); compare with `shots/student/<theme>/checkin__not-a-real-token.png`.

- [ ] **Step 4: Commit** — `git commit -m "feat(mobile): v1 check-in link screen"` (screen, component, test, gap note).

---

### Task 5: More, Settings, Notifications

**Files:**
- Create: `apps/mobile/src/design/settings/section.tsx`
- Modify: `apps/mobile/app/(app)/more.tsx`, `apps/mobile/app/(app)/settings.tsx`, `apps/mobile/src/components/NotificationPreferences.tsx`, `apps/mobile/app/(app)/notifications.tsx`
- Test: `more-screen.test.tsx`, `settings-screen.test.tsx`, `notification-preferences.test.tsx`, `notifications-screen.test.tsx`

**Markup spec:** inventory-A §5, §6, §7 (a). Rulings B2-5, B2-6, B2-7, B2-18.

**Interfaces:**
- Produces: `Section({ icon: LucideIcon, title, description, children })` — v1 `settings-form.tsx` Section: `Card` `p-4` > header `mb-4 flex-row items-start gap-3` (icon box `size-9 shrink-0 items-center justify-center rounded-lg bg-brand-teal-100 dark:bg-brand-teal-950`, icon size 16 `text-brand-teal-700 dark:text-brand-teal-300`; `min-w-0 flex-1`: title `text-base font-semibold text-foreground` role header, description `text-xs text-muted-foreground`) > children.
- Consumes: `MoreMenu` (`src/design/layout/more-menu.tsx`), `PageHeader`, `ShellFrame`, `FormField`, `Input`, `PasswordInput`, `Switch`, `toast`, `Card`/`CardContent`, `Badge`, `EmptyState`, `formatStampAgo`.

- [ ] **Step 1: Test changes (RED)**
  - `more-screen.test.tsx`: unchanged except add `expect(screen.getByText("Account, settings, and more places to go.")).toBeTruthy()` and `expect(screen.getByText("Appearance")).toBeTruthy()`.
  - `settings-screen.test.tsx`: "Save name" → "Save profile" (text and role queries); `getByText("sp@jpc.test")` → `getByDisplayValue("sp@jpc.test")`; revoked assertion → toast: mock `../design/ui/toaster` (`jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }))`) and expect `toast.success` called with `"Password updated. Signed out of 2 other devices."`; profile save expects `toast.success("Profile saved.")`. Keep hasPassword, mismatch hint (label "Confirm new password"), logout-everywhere.
  - `notification-preferences.test.tsx`: switch interaction → `fireEvent.press(screen.getByLabelText(label))`; state → `getByLabelText(label).props.accessibilityState.checked`; labels → `"New assignments"`, `"Submission reviewed"`, `"Session rescheduled"`, `"Quiz graded"`, `"Low-attendance flags"`, `"Mentor follow-ups"`; drop `/still appear in your inbox/i`; keep `/two in a row/i` (replaces `/two consecutive/i`); add `expect(screen.getByText("Changes save automatically.")).toBeTruthy()`.
  - `notifications-screen.test.tsx`: add `expect(await screen.findByText("1 unread")).toBeTruthy()` where the fixture's first page has `unreadCount: 1` (adjust to the fixture's value); add `expect(screen.getByText("QUIZ GRADED")).toBeTruthy()` for a QUIZ_GRADED fixture row and `getAllByText("New")` for unread rows; empty test adds `"Activity that involves you will appear here."`.
  - Run all four. Expected: FAIL on the changed assertions.

- [ ] **Step 2: Implement (GREEN)**
  - `more.tsx`: `ShellFrame` > `MoreMenu role={user.role} userName={user.name} nav={nav} onNavigate={(h) => { const t = navHref(h); if (t) router.push(t); }} onSignOut={() => void logout()}` (keep the same guards as today).
  - `section.tsx` per Interfaces.
  - `settings.tsx`: `ShellFrame` > `PageHeader title="Settings" description="Profile, password, and notification preferences."` > `View className="flex-col gap-4"`: Section `UserRound` "Profile" (FormField "Name" required > Input `accessibilityLabel="Name"`; FormField "Email" description "Change via the admin console." > Input `editable={false}` disabled; `View className="flex-row justify-end"` > Button "Save profile"/"Saving…"), Section `Lock` "Change password" "Use at least 8 characters." (three PasswordInputs with labels "Current password", "New password", "Confirm new password"; Button "Update password"/"Updating…"; hidden when `!user.hasPassword`), `<NotificationPreferences />`, Section `ShieldCheck` "Security" (description per B2-6; `View className="flex-row justify-end gap-2"` > Button outline "Sign out", Button outline `textClassName="text-error-700 dark:text-error-200"` "Sign out everywhere"). Success/error → `toast`.
  - `NotificationPreferences.tsx`: Section `Bell` "Notifications" "Changes save automatically." > rows (`flex-row items-center justify-between gap-4 py-3`, `border-t border-border` from the 2nd row, first `pt-0`, last `pb-0`; label `text-sm font-medium text-foreground`, description `text-xs text-muted-foreground`; `Switch accessibilityLabel={label} checked onCheckedChange className={pending ? "opacity-70" : undefined}`) in the B2-6 order; loading `Skeleton` rows, error = small `text-sm text-error-600` + Retry `Button variant="outline" size="sm"`. Then Section `Smartphone` "Push notifications" with v2's `PUSH_COPY` text (`text-sm text-muted-foreground`) and its Button. Keep both hooks and `enablePush`.
  - `notifications.tsx`: `FlatList` with `contentContainerClassName="px-4 pb-24 pt-4 gap-2"` and `ListHeaderComponent` = `PageHeader title="Notifications" description={`${unread} unread`} actions={<Button variant="outline" size="sm" onPress={markAll}>Mark all read</Button>}`; rows `Pressable` > `Card` > `CardContent className={cn("flex-row items-start gap-3 pt-4", unread && "border-l-4 border-info-500")}` (Bell size 16 `mt-0.5 text-muted-foreground`; title `text-sm font-medium`; `Badge variant="outline" textClassName="text-[10px]"` type; unread `Badge variant="info" textClassName="text-[10px]"` "New"; body `text-sm text-muted-foreground`; `formatStampAgo(createdAt)` `text-xs text-muted-foreground`). Empty: `EmptyState icon={BellOff} title="No notifications" description="Activity that involves you will appear here."`. Loading `RouteSkeleton`, error `RouteError`. Keep paging, refresh, mark-read and routing.
  - Run all four files. Expected: PASS.

- [ ] **Step 3: Capture and compare** — `capture-v2.sh student <theme> more more 2`, `… settings settings 4`, `… notifications notifications 3`; compare with `student__more.png`, `student__settings.png`, `student__notifications.png`.

- [ ] **Step 4: Commit** — `git commit -m "feat(mobile): v1 More, Settings and Notifications screens"`.

---

### Task 6: Student dashboard (+ UpcomingEventsCard for all roles)

**Files:**
- Modify: `apps/mobile/src/components/dashboard/StudentDashboard.tsx`, `apps/mobile/src/components/dashboard/UpcomingEventsCard.tsx`
- Test: `apps/mobile/src/__tests__/dashboard.test.tsx` (STUDENT block + shared `Open day` assertions), `apps/mobile/src/__tests__/upcoming-events-card.test.tsx`

**Markup spec:** inventory-B §1 (a). Rulings B2-8, B2-9, B2-18.

**Interfaces:**
- Consumes: `StatCard`, `Eyebrow`, `PageTitle` (greeting uses the same h1 classes: `Text accessibilityRole="header" className="text-2xl font-black text-brand-navy-900 dark:text-foreground"`), `ShellFrame` (with `refreshing`/`onRefresh` — StudentDashboard stops using `DashboardFrame`), `ProgressRing`, `Badge`, `EmptyState`, `formatWeekdayDay`, `formatWallTime`, `formatShortDay`, `formatDistanceOnly`, `formatEventWhenShort`.
- `UpcomingEventsCard({ query })` keeps its prop and behaviour; markup v1 (`Card p-4` > `Eyebrow` "Upcoming events" > `mt-2 flex-col gap-2.5` rows: `CalendarDays` 16 `mt-0.5 text-brand-teal-500`, title `text-sm font-bold text-brand-navy-900 dark:text-foreground` `numberOfLines={1}`, when `text-xs text-muted-foreground`); empty state inside the card: `text-sm italic text-muted-foreground` "Nothing is scheduled from today onwards." under the eyebrow, title kept "No upcoming events" as the eyebrow's accessibility hint is not needed — the test asserts the text "No upcoming events": render `Text className="mt-2 text-sm font-semibold text-foreground"` "No upcoming events" + the italic line.

- [ ] **Step 1: Test changes (RED)** in `dashboard.test.tsx` STUDENT block and `upcoming-events-card.test.tsx`:
  - `"Welcome back, Sara"` → `"Hi, Sara 👋"`; `"2 assignments need your attention"` → `"2 assignments need your attention."`.
  - `"Session 3 of 4 · 1 session to go"` stays (D12).
  - a11y labels: `"Absence budget left: 42%"` stays; `"Streak: 2"` stays; `"To do: 2"` → `"Assignments: 2"`.
  - `"You submitted 1 assignment late this season."` → `"1 assignment submitted late this season"`.
  - `"Mar 1, 2099 · 6:00 PM · Hall"` → `"Sun, Mar 1 · 6:00 PM · 90 min · Hall"` (use the fixture's duration).
  - `"Overdue · was due Jan 5, 2020"` → `"Due Jan 5"`; `"Due Jun 1, 2099"` → `/^Due in /`; row a11y label `"New essay, Due Jun 1, 2099"` → press the title text `"New essay"` instead.
  - events card: `"Mar 5, 2099 · 6:30 PM"` → `"Mar 5 · 6:30 PM"`; a11y `"Open day, Mar 5, 2099 · 6:30 PM"` → `"Open day, Mar 5 · 6:30 PM"`.
  - Keep: endpoint set, refresh test (`UNSAFE_getByType(ScrollView).props.refreshControl`), budget press → `/attendance`, due row press → `/assignment/[id]`, D13 no stream, independent failures, not-enrolled → no `/me/attendance`, "Complete your profile" → `/profile` (now the teal box link text `"Complete your profile →"` — update the press target), no own bell.
  - Run both files. Expected: FAIL on the changed copy.

- [ ] **Step 2: Implement (GREEN)** — transcribe inventory-B §1 (a) top to bottom inside `ShellFrame refreshing onRefresh` > `View className="flex-col gap-3"`, with B2-8's copy. Hero: `Card className="p-5"` > `flex-row items-center gap-5` > `ProgressRing value={pct ?? 0} label={`Season ${pct ?? 0}% complete`}` (children: `{pct}%` `text-2xl font-black …`, "done" eyebrow-muted) + `min-w-0 flex-1` (Eyebrow teal "Current season", title `mt-1 text-lg font-black … numberOfLines={1}`, `text-xs text-muted-foreground` "Session N of M · K sessions to go" / "· complete"; `pct === null` keeps v2's "No sessions scheduled yet"). Stat row: `View className="flex-row gap-3"` with three `StatCard`s (budget `onPress → /attendance`, Streak `icon={streak > 0 ? "flame" : undefined}`, Assignments `variant={pending > 0 ? "teal" : "white"}` `onPress → /assignments`). Attendance failure keeps its own small error line in the stat row's place. Next session card, events card (before Due soon), Due soon card — per inventory. Loading → `RouteSkeleton`; dashboard error → `RouteError onRetry={refetch}`. Remove `src/ui`/`src/theme` imports from both files. Run. Expected: PASS, and every other role's dashboard test still passes (`Open day` row text).

- [ ] **Step 3: Capture and compare** — `capture-v2.sh student <theme> dashboard dashboard 3`; compare with `student__dashboard.png`.

- [ ] **Step 4: Commit** — `git commit -m "feat(mobile): v1 student dashboard and upcoming-events card"`.

---

### Task 7: Season, History, Attendance

**Files:**
- Create: `apps/mobile/src/design/students/season-history.tsx`
- Modify: `apps/mobile/src/components/season/StudentSeason.tsx`, `apps/mobile/app/(app)/history.tsx`, `apps/mobile/app/(app)/attendance.tsx`
- Test: `student-season.test.tsx`, `history-screen.test.tsx`, `my-attendance-screen.test.tsx`

**Markup spec:** inventory-B §2, §3, §4 (a). Rulings B2-10, B2-11, B2-12, B2-18.

**Interfaces:**
- Produces: `SeasonHistory({ rows: SeasonHistoryRow[], emptyDescription: string })` — port of v1 `season-history.tsx` (EmptyState Sparkles "No past seasons"; `flex-col gap-3` of `Card p-4`: title `text-base font-bold text-brand-navy-900 dark:text-foreground`, dates line `text-xs text-muted-foreground` `{formatDate(start)} – {formatDate(end)}` + ` · {groupName}`, badges `Badge variant="teal"` "{pct}% attended" + `Badge variant="success"` "Participated" in `flex-row flex-wrap gap-1.5 mt-2`; disclosure `Pressable accessibilityRole="button" accessibilityState={{expanded}}` with `ChevronRight` 14 rotated 90° when open + `font-semibold text-brand-navy-700 dark:text-brand-navy-200 text-sm` "Curriculum ({n} sessions)"; open list `mt-2 flex-col gap-1` rows `flex-row justify-between gap-3 border-t border-border pt-1` (first row no border/pt) title `text-sm text-muted-foreground flex-1` + `formatDayKey(dayKey)` `shrink-0 text-xs text-muted-foreground`).
- Consumes: `PageTitle`, `Eyebrow`, `BackLink`, `Card`, `Badge`, `Progress`, `ProgressRing`, `Button`, `EmptyState`, `formatShortDay`/`formatWeekdayDayYear`, `formatSessionTime`, `initialsOf`.

- [ ] **Step 1: Test changes (RED)**
  - `student-season.test.tsx`: `getByText("Group B1")` → `getAllByText("Group B1").length).toBeGreaterThan(0)`; `"Members (2)"` → `getByText(/Members/)` and `getByText("(2)")`; `"Session 3 of 7"` stays; add `expect(screen.getByText("COMPLETED"))` or the fixture's status string as a badge; press "See calendar" stays.
  - `history-screen.test.tsx`: `"50% attended · Participated"` → `getByText("50% attended")` + `getByText("Participated")`; `"Curriculum (1 session)"` → `"Curriculum (1 sessions)"`; `"Seasons you've participated in"` subtitle added.
  - `my-attendance-screen.test.tsx`: `"58% used"` → `getByLabelText("Absence budget 58% used")` + `getByText("58%")` + `getByText("used")`; remove `"Streak: 1 session"`; add `getByText("← Dashboard")`.
  - Run all three. Expected: FAIL on changed assertions.

- [ ] **Step 2: Implement (GREEN)** — transcribe each inventory §(a) inside `ShellFrame refreshing onRefresh` > `View className="flex-col gap-3"`; leader/member initials circles and the date tile are inline Views per the inventory classes; mailto via `Linking.openURL("mailto:" + email)` on the email text; "See calendar" `Button variant="ghost" size="sm" textClassName="text-xs text-brand-teal-700 dark:text-brand-teal-300"`. Attendance ring `indicatorClassName` `stroke-error-500` (≥100) / `stroke-warning-500` (≥70). Rows' date: `formatWeekdayDayYear(dayKey)` + ` · ` + `formatSessionTime(startsAt)`. Status badges per inventory; `−` is U+2212. Non-student branches (history staff explanation, attendance "Not available") restyled with `EmptyState` + `PageTitle`. Loading/error per B2-18. Run. Expected: PASS.

- [ ] **Step 3: Capture and compare** — `season` (3 shots), `history` (2), `attendance` (3), both themes; compare with `student__season.png`, `student__history.png`, `student__attendance.png`.

- [ ] **Step 4: Commit** — `git commit -m "feat(mobile): v1 season, history and attendance screens"`.

---

### Task 8: Calendar (student path)

**Files:**
- Create: `apps/mobile/src/design/sessions/season-calendar.tsx`
- Modify: `apps/mobile/app/(app)/calendar.tsx` (`PinnedSeasonCalendar` and the student no-season branch only)
- Test: `apps/mobile/src/__tests__/calendar-screen.test.tsx` (student tests), `calendar-grid.test.ts` (unchanged)

**Markup spec:** inventory-C §1 (a). Rulings B2-13, B2-18.

**Interfaces:**
- Produces: `SeasonCalendar({ sessions: SessionListItem[], events: JpcEventListItem[], today: string, onOpenSession: (id: number) => void, onOpenEvent: (e: JpcEventListItem) => void })` with internal `view` state ("upcoming" default) and `anchor` (`initialAnchor()` from `src/lib/calendar-grid.ts`). Sub-parts in the same file: `ViewSwitch` (segmented: `flex-row self-start rounded-xl border border-border bg-muted/40 p-0.5`; tab `rounded-lg px-3 py-1.5`, selected `bg-card` + `shadowStyle("soft")`, label `text-sm font-medium` selected `text-foreground` else `text-muted-foreground`; `accessibilityRole="tab"`, `accessibilityState.selected`, container `accessibilityRole="tablist" accessibilityLabel="Calendar view"`), `Stepper` (ghost icon Buttons `accessibilityLabel` "Previous week|month"/"Next week|month", label `min-w-32 text-center text-sm font-semibold text-foreground` from `rangeLabel()`), `AgendaView` (day groups from `groupCalendarByDay`; heading `Eyebrow` muted `formatLongDay(dayKey)` + cue `text-[10px] font-medium text-brand-teal-700 dark:text-brand-teal-300` from `dayCue`; session row Pressable `flex-row items-center gap-3 rounded-xl border border-border bg-card p-3` + soft shadow: time rail `w-12 items-center` (`splitWallTime(startTime)` clock `text-sm font-bold leading-none text-foreground`, meridiem `mt-0.5 text-[10px] uppercase text-muted-foreground`), divider `h-10 w-px bg-border`, body (title `text-sm font-semibold … numberOfLines={1}`, meta `text-xs text-muted-foreground` "{n} min" + MapPin 12 + location), ChevronRight 16 muted; event row same card: Calendar 16 muted in the rail, title (+Lock 12 for ALUMNI_ONLY), "JPC event", ExternalLink 16 when url), `CalendarGrid` (Mon-first 7 columns built from `src/lib/calendar-grid.ts`; outer `overflow-hidden rounded-xl border border-border bg-border` with 1px gaps (`gap-px` → cells with `margin: 0.5`… use a flex-wrap of 7 `w-[14.2857%]` cells separated by `border-r border-b border-border` and `bg-card`); header "Mon".."Sun" `py-2 text-center text-xs font-medium text-muted-foreground`; cell `min-h-32` (week) / `min-h-[72px]` (month), `p-1 gap-0.5`, out-of-month `opacity-40`; day number `size-6 items-center justify-center rounded-full` today `bg-brand-teal-500` (text `text-brand-navy-950`) else text `text-foreground`, `text-xs font-medium`; session chip Pressable `rounded px-1 py-0.5` tone today `bg-success-100 dark:bg-success-950` text `text-success-800 dark:text-success-200` / past `bg-muted` text `text-muted-foreground` / upcoming `bg-brand-teal-100 dark:bg-brand-teal-950` text `text-brand-teal-800 dark:text-brand-teal-200`, title `text-xs font-medium leading-tight numberOfLines={1}`; event chip `bg-brand-navy-100 dark:bg-brand-navy-900` text `text-brand-navy-800 dark:text-brand-navy-100` (alumni-only warning tones)).
- Consumes: `useCurrentSeasonId`, `useSeasonSessions`, `useEvents` (unchanged), `sessionTone`, `dayCue`, `groupCalendarByDay`, `rangeLabel`, `initialAnchor` (existing libs — reuse, don't re-derive).

- [ ] **Step 1: Test changes (RED)** — student tests in `calendar-screen.test.tsx`:
  - day heading `"Mar 1, 2099"` → `"Sunday, March 1"` (uppercase is a style, the text stays mixed case).
  - student no season: `"No season to show"` → `"No active season"` + `"An admin will enroll you in a season when you're ready."`, and assert no request at all (`expect(get).not.toHaveBeenCalled()`), replacing the "fetches only /api/v1/events" expectation for the plain student (keep it for the alumnus test, B2-13).
  - Remove student assertions on the legend (`getByLabelText("Calendar legend")`), the "Upcoming" status badge, the month tap-a-day list and the stacked week rows (`"Sun, Mar 1"`, seven `"Nothing scheduled"`); replace with: Month view shows the session chip title `"Week two"` without tapping; Week view shows `"Feb 23 – Mar 1"` and after "Next week" `"Mar 2 – 8"` (kept); a session chip press pushes `/session/[id]`.
  - Both empty: `"Nothing scheduled yet"` + `"Sessions and events will appear here once they're added."`.
  - Keep: endpoint, dayKey grouping, press session, event interleave, events failure isolation, month anchor + "Next month" → "April 2099", a11y labels "Month"/"Week"/"Next month"/"Next week", all non-student tests untouched.
  - Run. Expected: FAIL on changed student assertions; staff tests still pass.

- [ ] **Step 2: Implement (GREEN)** — write `season-calendar.tsx`; in `calendar.tsx` the student path renders `ShellFrame refreshing onRefresh` > `View className="flex-col gap-3"` > `PageTitle title="Calendar"` > (no season & not alumnus → `EmptyState icon={Calendar} title="No active season" description="An admin will enroll you in a season when you're ready."`; both lists empty → `EmptyState icon={Calendar} title="Nothing scheduled yet" description="Sessions and events will appear here once they're added."`; else `SeasonCalendar`), agenda empty → `EmptyState icon={Calendar} title="Nothing coming up" description="You're all caught up. Switch to Month to review past sessions."`. Alumnus and staff paths unchanged. Run. Expected: PASS.

- [ ] **Step 3: Capture and compare** — `calendar` Upcoming (2 shots) both themes vs `student__calendar.png`; additionally capture Week and Month by adding `- tapOn: "Month"` variants (save as `calendar-month`) and compare against v1 live: open `http://127.0.0.1:3100` as the student with Playwright MCP at 375px, click Month, screenshot to `~/projects/JPC/.v1-reference/shots/student/<theme>/student__calendar__month.png` (devbox only).

- [ ] **Step 4: Commit** — `git commit -m "feat(mobile): v1 season calendar for students"`.

---

### Task 9: Quizzes list and quiz runner (student)

**Files:**
- Modify: `apps/mobile/app/(app)/quizzes.tsx` (`StudentQuizzes`), `apps/mobile/app/(app)/quiz/[id]/index.tsx` (`StudentRunner`, `AttemptForm`, `ResultView`)
- Test: `quizzes-screen.test.tsx` (student describe), `quiz-runner.test.tsx` (student tests)

**Markup spec:** inventory-C §3, §4 (a). Rulings B2-15, B2-10, B2-18.

**Interfaces:**
- Consumes: `ProgressRing`, `Badge`, `EmptyState` (PenLine), `Button`, `Textarea`, `ConfirmDialog`, `Eyebrow`, `BackLink`, `PageTitle size="detail"`, `formatDate`.

- [ ] **Step 1: Test changes (RED)**
  - `quizzes-screen.test.tsx` student: `"63% average"` → `getByText("63%")` + `getByText("Average score")`; `"Week 1 · 15 / 20"` → `getByText("15")` + `getByText("/20")` + `getByText("75%")`; `"Week 1 · Not started"` → `getByText("Take quiz")`; `"Week 1 · Waiting to be marked"` → `getByText("Awaiting grading")`; no season: `"No active season"` → `"No quizzes yet"` (still no API call); add a PAPER row and assert pressing its title does not push.
  - `quiz-runner.test.tsx` student: press `"Submit"` → press `"Submit quiz"` then the dialog's `"Submit"`; `"5 / 7"` → `"5"` + `"/7"` + `"Score"`; `/waiting to be marked/i` → `"Submitted"` + `"Awaiting grading for the written answers."` and the SUBMITTED view lists `"Q1"`; `"Question 1"` → `"Q1"`; keep labels `"Answer 1 option 2: Paris"` and `"Answer 2"` as accessibilityLabels on the option Pressable / Textarea.
  - Run both. Expected: FAIL on changed assertions.

- [ ] **Step 2: Implement (GREEN)** — transcribe inventory-C §3 (a) for the list (hero always; rows per kind; PAPER plain View) and §4 (a) for the runner: page header `BackLink`-like `ArrowLeft` 12 + "Quizzes" (`inline-flex` row, same teal link classes) → `router.back()`, `PageTitle size="detail"`, session subtitle; NotStarted card; InProgress question cards with v1 option buttons (radio circle + Check 12 when selected) and `Textarea placeholder="Write your answer…"`; save status line under the list (`text-xs text-muted-foreground`, "Retry save" `Button variant="outline" size="sm"`); `Button className="self-start"` "Submit quiz" disabled until all answered + hint "Answer every question to submit."; `ConfirmDialog title="Submit quiz?" description="You can't change your answers after submitting." confirmLabel="Submit"` → flush + submit; Result view for SUBMITTED and GRADED. Keep every hook, debounce and flush. Run. Expected: PASS.

- [ ] **Step 3: Capture and compare** — `quizzes` (2), `quiz/<id>` (3) using the quiz id from v1's capture manifest (`grep quizzes ~/projects/JPC/.v1-reference/manifest.json`), both themes, vs `student__quizzes.png`, `student__quizzes__id.png`.

- [ ] **Step 4: Commit** — `git commit -m "feat(mobile): v1 student quizzes list and quiz runner"`.

---

### Task 10: Session detail (student branch), check-in modal, video quiz player

**Files:**
- Modify: `apps/mobile/app/(app)/session/[id]/index.tsx` (student branch), `apps/mobile/src/components/check-in/StudentCheckInCard.tsx`, `apps/mobile/src/components/check-in/QrScanner.tsx` (frame classes only), `apps/mobile/src/components/VideoQuizPlayer.tsx`
- Test: `session-detail.test.tsx` (student), `student-check-in.test.tsx`, `video-quiz-screen.test.tsx` (student), `video-resume.test.tsx` (unchanged)

**Markup spec:** inventory-C §2 (a). Rulings B2-14, B2-4, B2-18.

**Interfaces:**
- Consumes: `CheckInResult` (Task 4), `Modal`/`ModalHeader`/`ModalTitle`/`ModalDescription`, `Badge`, `Button`, `Eyebrow`, `BackLink`, `PageTitle size="detail"`, `formatLongDayYear`, `formatWallTime`, `addMinutesToWallTime`.
- `StudentCheckInCard` props unchanged; renders `View className="flex-col items-start gap-1.5"` > `Button size="lg" className="w-full min-h-[44px]"` (QrCode icon) "Check In" disabled when `!checkInOpen` > hint `text-sm text-neutral-500` ("Check-in hasn't opened yet" / "You checked in at {time}.") > `Modal` "Scan check-in code" / "Point your camera at the QR code displayed by your leader." hosting `QrScanner` (frame `overflow-hidden rounded-xl bg-black`), scan error `text-sm text-error-600 dark:text-error-400` "That doesn't look like a check-in code", muted link "Enter code instead" → Input `accessibilityLabel="Check-in code"` + Button "Check in"; outcome → `CheckInResult` inside the modal.

- [ ] **Step 1: Test changes (RED)**
  - `session-detail.test.tsx` student: `"Mar 15, 2099 · 8:00 PM · 90 min"` → `getByText("Sunday, March 15, 2099")` + `getByText("8:00 PM – 9:30 PM · 90 min")`; `"Your attendance: Late (10 min)"` stays (B2-14); add `getByText("← Calendar")` and `getByText("Online")`/`"In-person"` per fixture.
  - `student-check-in.test.tsx`: `"Check-in isn't open right now."` → `"Check-in hasn't opened yet"`; `"Scan QR code"` → press `"Check In"` then expect `"Scan check-in code"`; `"Enter code"` → `"Enter code instead"`; `"That doesn't look like a check-in code."` → without period; `"Your check-in"` removed. Keep POST bodies, posts-once, refusal and result copy, permission flow, refetch, staff-hidden.
  - `video-quiz-screen.test.tsx` student: `"0 / 2 points"` → `getByText("0")` + `getByText("/2")` + `getByText("Points")`; `"Correct"` → `"Correct!"`; `"Watch on YouTube"` → `"Watch recording"`; `"Quiz complete"` stays; add `getByText("Answer to unlock")` when a barrier exists.
  - Run. Expected: FAIL on changed assertions.

- [ ] **Step 2: Implement (GREEN)** — student branch per inventory-C §2 (a) inside `ShellFrame refreshing onRefresh` > `View className="flex-col gap-3"`: `BackLink "Calendar"` → `router.back()`; hero `Card className="mt-2 p-5"` (Badge Online/In-person, `PageTitle size="detail"`, long date); player or "Watch recording" link button (`rounded-lg bg-brand-teal-600 px-4 py-3` Pressable, Video 16 + `text-sm font-bold text-white`, `Linking.openURL`); Details card (Clock row "{start} – {end} · {n} min" from `formatWallTime(startTime)`/`formatWallTime(addMinutesToWallTime(startTime, durationMinutes))`, MapPin row, CheckCheck "Your attendance" row); About card (description); `StudentCheckInCard`. `VideoQuizPlayer`: keep all logic; replace markup with v1's frame, custom seek bar (track, locked region from barrier, played fill, markers coloured by `answered`, `m:ss / m:ss` mono caption, Lock + "Answer to unlock"), ghost Play/Pause and "Leave the quiz" buttons, summary card, question `Modal` (non-dismissable; Android back → `handleLeave`) with v1 option buttons and feedback. Staff branches untouched. Run. Expected: PASS (all four files incl. `video-resume.test.tsx`).

- [ ] **Step 3: Capture and compare** — `session/<id>` (3 shots) with the id from v1's manifest (`grep sessions ~/projects/JPC/.v1-reference/manifest.json`), both themes, vs `student__sessions__id.png`.

- [ ] **Step 4: Commit** — `git commit -m "feat(mobile): v1 student session detail, check-in modal and video quiz player"`.

---

### Task 11: Assignments list and assignment detail (+ forum)

**Files:**
- Modify: `apps/mobile/app/(app)/assignments.tsx` (`StudentAssignments`), `apps/mobile/app/(app)/assignment/[id]/index.tsx` (student branch: `SubmissionSection`, `SubmissionEditor`), `apps/mobile/src/components/ForumThread.tsx`
- Test: `assignments-screen.test.tsx`, `assignment-detail.test.tsx`, `submission-editor.test.tsx`, `forum-screen.test.tsx`

**Markup spec:** inventory-D §1, §2 (a). Rulings B2-16, B2-18.

**Interfaces:**
- Consumes: `StatCard`, `PageTitle`, `BackLink`, `Eyebrow`, `Card`/`CardHeader`/`CardTitle`/`CardContent`, `Badge`, `Button`, `Textarea`, `RichTextView`, `Avatar`, `EmptyState`, `ConfirmDialog`, `formatDueDate`, `formatShortDay`, `formatDayKey`, `formatDistanceOnly`, `formatTimeAgo`, `plainTextToHtml` (from `@space/shared` if exported there, else the backend-free helper already used by the mobile app — grep first; if neither exists, render plain text with `Text` preserving newlines instead).

- [ ] **Step 1: Test changes (RED)**
  - `assignments-screen.test.tsx`: `findByText(/Overdue/)` → `findByText("Due Apr 1")` (fixture's due day; still driven by `isOverdue`); add header `"Assignments"` + `"Your current season"` and stat labels `getByLabelText("Submitted: N")`, `"Pending: N"`, `"Reviewed: N"` per fixture; empty copy `"No assignments yet"` / `"Check back when your leader posts one."`.
  - `assignment-detail.test.tsx`: add `getByText("← Assignments")`, `getByText("Brief")`; "Solid work." stays (now in "Leader feedback"); "Submitted late" → `getByText("Late")`.
  - `submission-editor.test.tsx`: keep "Start working", PUT/PATCH bodies, submit-disabled rules, attachments notice, malformed-save error; input label `"Your answer"` → `"Your response"` (Textarea `accessibilityLabel`, placeholder "Write your response…"); add success `getByText("Draft saved.")` after Save draft and `"Submitted!"` after Submit.
  - `forum-screen.test.tsx`: `"0 / 5 words"` → `"0 words · minimum 5"`, `"3 / 5 words"` → `"3 words · minimum 5"`; `findByLabelText("Add a comment")` → `findByLabelText("Write a comment…")`; `getByText("Comment")` → `getByLabelText("Post comment")`; locked description → `"Share your own response first to see what your group-mates wrote."`; comment delete: press `"Delete comment"` then the ConfirmDialog's `"Delete"`; empty → `"No responses yet"`; keep "Due Apr 1, 2099" (D10, now the hero badge text `"Due Apr 1, 2099"` — keep `formatDayKey` in the forum hero), leader feedback, paging, C6 no-PUT-on-open, word-count gate, posts/comments endpoints.
  - Run all four. Expected: FAIL on changed assertions.

- [ ] **Step 2: Implement (GREEN)** — list per inventory-D §1 (a) in `ShellFrame refreshing onRefresh` (stats from `data`, rows in a `Card` with `border-t` dividers, dot + title Pressable + due line `Due {formatDueDate(dueAt)}` + ` · in {formatDistanceOnly(dueAt)}` when not overdue + status badge, RETURNED per B2-16). Detail per §2 (a): back link, hero (STANDARD: due badge — overdue `Due {formatDayKey(dueOrgDay)}` error / future `Due in {formatDistanceOnly(dueAt)}` warning / "No due date" outline; FORUM: "Forum" teal badge + D10 due badge), Brief/Question card with `RichTextView html={description}`, due banner, "Your submission" card (status badges incl. "Late"; editor = `Textarea` `accessibilityLabel="Your response"` placeholder "Write your response…" when editable, `RichTextView` of the plain text otherwise; files list read-only; attachments notice; error/info boxes `rounded-md px-3 py-2 text-sm` error `bg-error-50 text-error-800` / success `bg-success-50 text-success-800`; buttons column-reverse: Submit above outline Save draft), "Leader feedback" card. ForumThread per §2 FORUM (compose card with Textarea `accessibilityLabel="Your response"` placeholder "Share your thoughts…", counter, info/error boxes, Post/Update button; locked/empty EmptyStates; "Group discussion · {n}" eyebrow; post Cards with `Avatar className="size-9"` initials, name, "{x} ago", body, comments block with muted bubbles, trash icon `Button variant="ghost" size="icon-xs" accessibilityLabel="Delete comment"` → ConfirmDialog, composer `Textarea accessibilityLabel="Write a comment…" placeholder="Write a comment…"` + `Button size="icon" accessibilityLabel="Post comment"` Send; v2 paging buttons as `Button variant="outline" size="sm"`; leader feedback Card). Run all four. Expected: PASS.

- [ ] **Step 3: Capture and compare** — `assignments` (2), `assignment/<id>` (4) with the id from v1's manifest, plus a FORUM assignment if the student has one, both themes, vs `student__assignments.png`, `student__assignments__id.png`.

- [ ] **Step 4: Commit** — `git commit -m "feat(mobile): v1 student assignments, submission and forum"`.

---

### Task 12: Profile (student)

**Files:**
- Create: `apps/mobile/src/design/forms/fieldset.tsx`
- Modify: `apps/mobile/app/(app)/profile.tsx` (`StudentProfile`, `IdentityCard` student look), `apps/mobile/src/hooks/use-engagement.ts`
- Test: `profile-screen.test.tsx` (STUDENT block), `account-hooks.test.tsx` or a new `my-engagement.test.tsx`

**Markup spec:** inventory-D §3 (a). Rulings B2-17, B2-18.

**Interfaces:**
- Produces: `useMyEngagement(userId: number | null, enabled: boolean)` → `useQuery` keyed `queryKeys.students.engagement(userId)` (reuse the existing key factory the staff hook uses; add a `"self"` suffix element so the two parses never share a cache entry), GET `/api/v1/students/${userId}/engagement`, parsed with `studentSelfEngagementSchema` from `@space/shared`, `enabled: enabled && userId !== null`. `Fieldset({ legend, children })` — `rounded-lg border border-border bg-card p-4 pt-5` with the legend as an absolutely positioned `Text className="absolute -top-2.5 left-3 bg-card px-1 text-sm font-semibold text-foreground"`, children in `mt-2 flex-col gap-4`.
- Consumes: `useMyProfile`, `useMyAttendance`, `useUpdateStudentProfile`, `useUpdateProfile` (name), `StatCard`, `Avatar`, `Badge`, `FormField`, `Input`, `Textarea`, `DatePicker`, `Button`, `toast`, `initialsOf`.

- [ ] **Step 1: Hook test (RED)** — new `src/__tests__/my-engagement.test.tsx`:

```tsx
import { renderHook, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
import { apiClient } from "../lib/api-client";
import { useMyEngagement } from "../hooks/use-engagement";
import { createWrapper } from "./helpers/render";

const get = apiClient.get as jest.Mock;

it("reads the student's own engagement with the self schema", async () => {
  get.mockResolvedValue({ data: { data: { submissionsCompleted: 1, submissionsExpected: 4 } } });
  const { result } = renderHook(() => useMyEngagement(9, true), { wrapper: createWrapper() });
  await waitFor(() => expect(result.current.data).toEqual(expect.objectContaining({ submissionsCompleted: 1, submissionsExpected: 4 })));
  expect(get).toHaveBeenCalledWith("/api/v1/students/9/engagement");
});

it("does not fetch without a user id", () => {
  renderHook(() => useMyEngagement(null, true), { wrapper: createWrapper() });
  expect(get).not.toHaveBeenCalled();
});
```

  Before writing it, read `studentSelfEngagementSchema` in `packages/shared/src/note.ts` and shape the fixture to satisfy it exactly; read `src/__tests__/helpers/render.tsx` for the wrapper's real export name. Run. Expected: FAIL — `useMyEngagement is not a function`.

- [ ] **Step 2: Implement the hook** in `use-engagement.ts` following the existing staff hook's structure (same file). Run. Expected: PASS.

- [ ] **Step 3: Screen test changes (RED)** — `profile-screen.test.tsx` STUDENT: "Absence budget left" stays (D14); add `getByLabelText("Assignments: 1/4")` with an engagement GET mock; "Save profile" → "Save changes"; labels "Year" → "Year / faculty", "Gifts" → "Gifts / interests", "Spiritual background" → "Notes"; replace the impossible-date test (picker cannot produce one) with: saving sends `dateOfBirth` as `"yyyy-MM-dd"` from the picker's value; `queryByLabelText("Name")`/`("Email")` null-assertions → `getByLabelText("Full name")` and `getByDisplayValue(email)` disabled; changing Full name and saving calls PATCH `/api/v1/me` with `{ name }` as well as PATCH `/api/v1/me/profile` with the six fields only; "Open settings" assertion removed; `"Profile saved."` via mocked `toast.success`. ALUMNI/MENTOR blocks untouched. Run. Expected: FAIL.

- [ ] **Step 4: Implement (GREEN)** — per inventory-D §3 (a) inside `ShellFrame refreshing onRefresh` > `View className="flex-col gap-3"`: identity hero `Card p-5` (`Avatar size="xl"` initials, name `text-xl font-black … numberOfLines={1}`, email `text-xs text-muted-foreground`, `Badge variant="teal"` "Student" `self-start` in `mt-2 flex-row flex-wrap gap-1.5`); stat row when `activeSeasonId !== null`; "Your details" `Card p-4` (`Eyebrow className="mb-4"`) > form `flex-col gap-6` of `Fieldset`s Personal/Contact/Academic/Spiritual background/Community with the v1 fields; error box; buttons column-reverse "Save changes" / outline "Cancel". Loading/error per B2-18. Run. Expected: PASS (ALUMNI/MENTOR blocks too).

- [ ] **Step 5: Capture and compare** — `profile` (4 shots) both themes vs `student__profile.png`.

- [ ] **Step 6: Commit** — `git commit -m "feat(mobile): v1 student profile with self engagement stats"`.

---

### Task 13: Gap note, legacy cleanup, comparison page, verification

**Files:**
- Create/finish: `docs/superpowers/ui-rebuild/gaps-batch-2.md`
- Delete: any `src/ui/*`, `src/theme/*`, `src/components/*` file no longer imported by any screen (only if `grep -rn` shows zero importers outside tests that are themselves deleted)
- Modify: `CLAUDE.md` Mobile conventions (one line: batch-2 shared pieces live in `src/design/layout/page-title.tsx`, `route-states.tsx`, `src/design/students/`)

- [ ] **Step 1: Find freed legacy files**

Run: `cd apps/mobile && for f in src/ui/*.tsx src/components/*.tsx src/components/*/*.tsx; do n=$(grep -rln "$(basename "${f%.tsx}")" app src --include=*.tsx --include=*.ts | grep -v "^$f$" | grep -v __tests__ | wc -l); [ "$n" = 0 ] && echo "unused: $f"; done`
Expected: a list (possibly empty). Delete each listed file and any test that only tests it; run the suite.

- [ ] **Step 2: Gap note** — `gaps-batch-2.md` with one heading per screen listing every remaining difference with its reason (platform / ruling id / data gap), plus a "Data gaps (backend)" section: notifications total, session/attendance/season org wall times, quiz `sessionDate`/`gradedAt` day keys, check-in `currentStatus`, forum post total, avatar URL/upload, email editing, submission/forum rich text round trip, remove-file hook.

- [ ] **Step 3: Full verification**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit > …/unit.log 2>&1; tail -20 …/unit.log`
Expected: all green; record the counts.

- [ ] **Step 4: Comparison page** — `tools/ui-reference/batch-2-pairs.sh`; open the HTML's images for a final pass; send `compare-batch-2.html` to the owner with SendUserFile (private). Then `node tools/ui-reference/restore-reference-passwords.mjs`.

- [ ] **Step 5: Commit**

```bash
git add -A docs/superpowers/ui-rebuild/gaps-batch-2.md CLAUDE.md apps/mobile
git commit -m "docs(mobile): batch-2 gap note; remove legacy UI freed by the student screens"
```

- [ ] **Step 6: Delivery (owner gates)** — whole-branch review per the executing skill; merge into `main` locally after the review fixes; ask the owner before pushing; after the push (or from the local tree if the owner prefers), the TestFlight build in tmux:
  `tmux new -d -s jpc-space-ios-build "cd /home/mark/projects/JPC/space-v2/apps/mobile && EXPO_TOKEN=\"\$(cat ~/.secrets/expo-token-space-v2)\" npx eas-cli build --profile production --platform ios --auto-submit --non-interactive 2>&1 | tee ~/logs/jpc-space-ios-build.log"`
