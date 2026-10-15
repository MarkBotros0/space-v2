# Inventory C — leader role (quizzes list, quiz grading, student profile)

v1 root = `/home/mark/projects/JPC/.v1-reference/app/src` · v2 root = `/home/mark/projects/JPC/space-v2/apps/mobile` · shared = `/home/mark/projects/JPC/space-v2/packages/shared/src` · shots = `/home/mark/projects/JPC/.v1-reference/shots/leader/{light,dark}/`

Common to all three (v1):
- Leader frame: `app/leader/layout.tsx` (13 l) wraps every page in `div.-mx-4 -mt-4 -mb-24 bg-brand-navy-50 px-4 dark:bg-transparent pt-4 pb-24` (md: variants dropped). The navy-50 tint stops 96px below the content (in all three shots the lower page is plain background). → `ShellFrame` (`src/design/layout/shell-frame.tsx`) already reproduces this; pull-to-refresh is V2-ONLY (keep).
- Route loading (`app/leader/loading.tsx`, 16 l): the same skeleton as the student route (`Skeleton.h-32 rounded-2xl` · 3× `Skeleton.h-24` · `SkeletonCard` ×2, `md:gap-4` dropped) → `RouteSkeleton` (`src/design/layout/route-states.tsx`) ✓ unchanged.
- Route error (`app/leader/error.tsx`, 23 l): `EmptyState icon=AlertTriangle title="Something went wrong" description="We couldn't load this page. Please try again — if it keeps happening, let an admin know." action=<Button>Try again</Button>`. **GAP (small):** `RouteError` hard-codes the student copy (`…let your leader know.`). It needs a copy/role prop (leader/mentor/admin pages say `let an admin know.`).
- `app/leader/template.tsx` (5 l) → `RouteTransition` (motion only, dropped as in batch 2).
- Header dialogs: every `*__dialog-0/1/2.png` for these three routes is a shell popover (`Switch user (dev)`, `Notifications`, `User menu`). None is specific to these screens, and the shell is already done. **No screen-level dialog was captured.**
- H1 idiom `text-2xl font-black text-brand-navy-900 dark:text-foreground` + subtitle `mt-1 text-sm text-muted-foreground` → `PageTitle` (`src/design/layout/page-title.tsx`) ✓.
- Page stack is `div.flex flex-col gap-4` on all three (not the student `gap-3`).

---

## 1. /leader/quizzes → `(app)/quizzes` (LEADER path)

### a) v1
Files: `app/leader/quizzes/page.tsx` (101 l). ui: `Badge` (47 l), `EmptyState` (54 l). Icon: `PenLine`. No client component.
Shots: `leader/light/leader__quizzes.png`, `leader/dark/leader__quizzes.png` (+ shell `__dialog-0..2`). The capture shows 2 rows, both `0/8 graded` + `Pending`. The first has an Arabic title that truncates with `…` and a subtitle that wraps to 3 lines; the second's subtitle wraps to 2 lines.

Data (server): the season is `groups[0].seasonId` (the leader's first group). `studentIds` = every `GroupStudent` of the leader's groups. Quizzes come from `where seasonId`, `orderBy [session.startsAt desc, createdAt desc]`, **all kinds, drafts included**. `gradedCount` = `QuizGrade` rows with a non-null score among `studentIds`, so for an ONLINE quiz it is effectively always 0.

Render tree:
- `div.flex flex-col gap-4`
  - `div` > `h1` (H1 idiom) `Quizzes` · `p.mt-1 text-sm text-muted-foreground` `Grade paper quizzes for your group`
  - **empty** (`quizzes.length===0`, which also covers no groups/no season): `EmptyState icon=PenLine title="No quizzes yet" description="Quizzes created by your admin will appear here."`
  - else `div.flex flex-col gap-3` > per quiz `Link`:
    - href = sessionId ? `/leader/sessions/{sessionId}/quiz/{id}` : `"#"` (an orphaned quiz is a dead link, spec 12 D12)
    - `Link.flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-4 shadow-[var(--shadow-soft)] transition-shadow hover:shadow-[var(--shadow-pop)]` (hover dropped)
      - `div.min-w-0`
        - `p.truncate text-sm font-bold text-brand-navy-900 dark:text-foreground` → title (1 line, ellipsis)
        - `p.mt-0.5 text-xs text-muted-foreground` → session ? `{session.title} · {format(startsAt,"MMM d, yyyy")}` : `No session`, then ` · Max {maxScore} pts` (e.g. `Week 9 · Jun 20, 2026 · Max 10 pts`). Wraps freely.
      - `div.flex shrink-0 items-center gap-2`
        - `span.text-xs text-muted-foreground` → `{gradedCount}/{totalStudents} graded`
        - `fullyGraded` (graded ≥ total && total > 0) → `Badge variant="success"` `Done`; graded > 0 → `Badge variant="warning"` `Partial`; else `Badge variant="outline"` `Pending`.
- No loading or error branch in the page itself (route-level only).
- md:/lg: none on this page.

### b) v2 current
- `app/(app)/quizzes.tsx` (249 l). The role dispatcher (l.233-249) sends LEADER/ADMIN/SUPER → `StaffQuizzes` (l.166-231), which is **shared with ADMIN/SUPER**. The admin v1 page differs: subtitle `All quizzes for {season.title}`, a teal `Go to sessions` link button, empty copy `Open a session from the calendar, then use the Quizzes card to add one.`, and v2's `New quiz` button. The rebuild must branch leader vs admin inside StaffQuizzes, or leave the admin markup to batch 4.
- Hooks (keep):
  - `useCurrentSeasonId()` (`src/hooks/use-seasons.ts`) → `queryKeys.seasons.list()`, GET `/api/v1/seasons`, `pickCurrentSeasonId`. Ruling X8: never `scopes.activeSeasonId` for staff.
  - `useQuizList(seasonId)` (`src/hooks/use-quizzes.ts:30`) → key `[...queryKeys.quizzes.bySeason(seasonId), "staff"]`, GET `/api/v1/quizzes?seasonId=…`, parse `quizListPageSchema`, `enabled: seasonId !== null`.
  - refresh: refetch quizzes when there is a season, else `current.refetch()`.
- Navigation (keep): leader → `router.push({ pathname: "/quiz/[id]/grade", params: { id } })` always (canAuthor is false for LEADER).
- Renders today (legacy): `Screen`; states seasons-pending `LoadingState` / seasons-error `ErrorState "Couldn't load your seasons."` / no season `EmptyState "No season" "You aren't attached to a season yet."` / quizzes pending / error `Couldn't load quizzes.` / empty `"No quizzes" "This season doesn't have any quizzes yet."`. Each row is a legacy `Card`: title (heading), `staffStatus` (`Paper · 3/8 graded` / `Online · Draft · 4 questions` / `Online · g/s graded · n questions`), and a caption with the date or `No session`.
- Legacy imports: `../../src/theme` (`useTheme`), `../../src/ui` (`Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text`). After the rebuild these are used only by the MENTOR fallback (l.245-247) and the admin branch.

### c) Data mapping
| v1 element | v2 source (`QuizSummary`, shared `quiz.ts:33`) |
|---|---|
| title | `title` ✓ |
| session title | `sessionTitle` ✓ (nullable → `No session`) |
| session date `MMM d, yyyy` | `sessionDate` (ISO instant) → `formatDate` ✓, device zone (the same data gap as batch 2 quizzes: no org day key) |
| `Max {n} pts` | `maxScore` ✓ |
| `{graded}/{total} graded` | `gradedCount` / `studentCount` ✓ (server, C4). **Definition differs on purpose:** v1 counts `QuizGrade` among all leader `GroupStudent`s; v2 counts PAPER grades or GRADED ONLINE attempts over ACTIVE enrollments in scope (spec 12 D10/C4). ONLINE rows will no longer read permanently `Pending`. |
| Done / Partial / Pending | derived from `gradedCount`/`studentCount` with v1's rule (presentation over server numbers; keep the `total>0` guard) ✓ |
| row link | `id` → `/quiz/[id]/grade` ✓ (D12: the flat route fixes v1's `#` for session-less quizzes, so the row is always pressable) |
| empty state | `data.items.length===0` **and** `seasonId===null` → the same v1 EmptyState ✓ |
| order | **GAP:** backend `GET /quizzes` orders `id desc` (`apps/backend/src/routes/quizzes.ts:281`); v1 orders by `session.startsAt desc, createdAt desc`. Needs a backend orderBy change, or accept the difference. |
| season | v1 = the leader's first group's season; v2 = `pickCurrentSeasonId(/seasons)` (X8; spec R108/R109). The same season in the single-group case. |

- V2-ONLY: seasons-loading/-error states, `Couldn't load quizzes.` error (→ use `RouteSkeleton`/`RouteError`), pull-to-refresh, `kind` / `questionCount` / `publishedAt` on the row (not shown by v1; drop from the leader row).
- V2-ONLY: an admin's draft ONLINE row opens `/quiz/[id]/edit`. Not reachable by a leader.

### d) Components
- Ported: `Badge` (success/warning/outline; needs no self-alignment, since it sits in a row), `EmptyState` (`PenLine`), `Text`, `PageTitle`, `ShellFrame`, `RouteSkeleton`, `RouteError` (needs the copy prop), `shadowStyle("soft")`, `cn`. Truncation: `numberOfLines={1}` on the title; the left column needs `min-w-0 flex-1` (the student row in the same file already does this, l.55).
- No non-ui v1 component to port (all inline). The row Pressable mirrors the existing `StudentQuizRow` pattern (`accessibilityRole="link"`).

### e) Tests — `src/__tests__/quizzes-screen.test.tsx` (225 l)
- Behaviour (keep): staff GETs `/api/v1/seasons` then `/api/v1/quizzes?seasonId=7` (l.150-166, 182-191); press a row → push `/quiz/[id]/grade` id "41" (l.161-165); leader has no `New quiz` (l.218-224); admin `New quiz` → `/quiz/new` (l.199-205) and admin draft → `/quiz/[id]/edit` (l.207-216), both batch 4 / V2-ONLY but they live in the same component.
- Markup/copy (will change): `Paper · 3/8 graded` (l.159) → `3/8 graded` + `Partial` badge, subtitle `Week 1 · Mar 1, 2099 · Max 20 pts`; `Online · Draft · 4 questions` (l.179), which has no v1 equivalent (→ `0/8 graded` + `Pending`); `No quizzes` (l.222) → `No quizzes yet`.
- Student block (l.67-147) is already rebuilt; it must stay green.

---

## 2. /leader/sessions/[id]/quiz/[quizId] → `(app)/quiz/[id]/grade`

### a) v1
Files: `app/leader/sessions/[id]/quiz/[quizId]/page.tsx` (77 l), `components/quizzes/quiz-grade-form.tsx` (116 l, PAPER), `components/quizzes/quiz-essay-grader.tsx` (180 l, ONLINE). ui: `Button` (64), `Input` (41), `Badge`, `EmptyState`. Icons: `ArrowLeft`, `Check`, `X`, `RotateCcw`.
Shots: `leader/light/leader__sessions__id__quiz__id.png`, `leader/dark/…` (+ shell dialogs). **The captured quiz is ONLINE** (one GRADED attempt with one MCQ, wrong answer, no essays, so no buttons). **No PAPER grade-form capture exists for any role**; the admin capture `admin/light/admin__season__code__quizzes__id__grade.png` is also ONLINE and shows the `Reopen retake` button.

Server: 404 unless the quiz exists, `quiz.sessionId === URL id` and `isLeaderInSeason`. `studentIds` = `GroupStudent` in the leader's groups for that season. ONLINE → `loadQuizForGrading` (attempts SUBMITTED|GRADED only, latest per student, ordered by studentUserId). PAPER → `loadQuizWithGrades` (one row per student ordered by name; `studentName = name ?? ""`).

Header (both kinds): `div`
- `Link href=/leader/sessions/{sessionId} .mb-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-teal-700 hover:underline` > `ArrowLeft.size-3` + `Back to session`. **The leader version has no `dark:text-brand-teal-300`** (the admin page has it); the dark shot shows the same teal-700.
- `h1` (H1 idiom) → quiz title (wraps; RTL titles right-aligned in the shot)

**ONLINE** — `div.flex flex-col gap-4` > header + `QuizEssayGrader canReopen={false}`:
- 0 attempts: `EmptyState` (no icon) `title="No submissions yet" description="Student attempts will appear here once they submit this quiz."`
- else `div.flex flex-col gap-3` > per attempt card `div.rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]`
  - `div.flex items-start justify-between gap-3`
    - `div` > `p.text-sm font-bold text-brand-navy-900 dark:text-foreground` studentName · `p.text-xs text-muted-foreground` → `Attempt {n} · ` + (GRADED ? `Graded · {totalScore}/{maxScore}` : `Awaiting grading`)
    - `Badge variant=` GRADED `success` `Graded` / else `warning` `Submitted`
  - `div.mt-3 flex flex-col gap-3` > per answer `div.border-t border-border pt-3 first:border-t-0 first:pt-0`
    - `p.text-sm font-semibold text-brand-navy-900 dark:text-foreground` prompt
    - MCQ: `div.mt-1 flex items-center gap-2 text-sm text-muted-foreground` > `Check.size-4 text-success-600` | `X.size-4 text-error-600` · `span` → selected option text or `—`, + (correctIndex!==null && !isCorrect) `span.text-success-700 dark:text-success-300` ` (correct: {option})` · `span.ml-auto text-xs` `{pointsAwarded ?? 0}/{points}`
    - ESSAY: `div.mt-1 flex flex-col gap-2` > `p.whitespace-pre-line rounded-lg bg-muted/40 px-3 py-2 text-sm text-foreground` text or `—` · `div.flex items-center gap-2` > `label.text-xs font-semibold text-muted-foreground` `Points` + `Input type=number size=sm min=0 max={points} className="w-20"` + `span.text-xs text-muted-foreground` `/ {points}`
  - error: `p.mt-2 text-xs text-error-600` → client `Enter 0–{points} points for each written answer.` or the server error
  - `div.mt-3 flex flex-wrap gap-2`
    - `hasEssays` (quiz-level): `Button size="sm"` → pending `Saving…` / GRADED `Update grade` / else `Save grade`
    - `canReopen && GRADED`: `Button size="sm" variant="outline"` > `RotateCcw.size-4` + `Reopen retake` (**the leader passes `canReopen={false}`, so a leader never sees it**; admin does)
  - Note: the button row div renders even when empty, which leaves an `mt-3` gap at the card bottom (visible in the shot: about 28px of space under the MCQ row).
- On save/reopen: `router.refresh()`.

**PAPER** — `div.flex flex-col gap-4` > header + `p.-mt-2 text-sm text-muted-foreground` → `{sessionTitle} · ` (if any) + `Max score: {maxScore}` + `QuizGradeForm`:
- `div.flex flex-col gap-4`
  - `div.overflow-x-auto rounded-xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05),0_4px_12px_rgba(0,0,0,0.04)] ring-1 ring-neutral-200/60` (**no dark variants anywhere in this form**, so it stays a white table in dark mode)
    - `table.w-full text-sm` > thead `tr.border-b border-neutral-100` > `th.px-4 py-3 text-left font-semibold text-brand-navy-900` `Student` · `th.w-32 …` `Score ` + `span.font-normal text-neutral-400` `/ {maxScore}` · `th …` `Notes`
    - `tbody.divide-y divide-neutral-100` > per student `tr` > `td.px-4 py-3 font-medium text-brand-navy-900` name · `td.px-4 py-3` > `Input type=number size=sm min=0 max placeholder="-" className="w-24"` · `td.px-4 py-3` > `Input type=text size=sm placeholder="Optional note..." className="max-w-xs"`
    - At 375px: three columns (name, 128px score, up to 320px notes) exceed 343px, so the table scrolls horizontally inside the card (inferred, not captured).
  - `div.flex items-center gap-3` > `Button` (default size) `Save grades` / `Saving...` · `span.text-sm text-neutral-500` `{graded} / {rows} graded` (live count from local state) · saved → `span.text-sm font-semibold text-success-700` `Saved` · error → `span.text-sm text-error-600` {error}
  - Behaviour: input clamps to `[0,maxScore]` with parseInt, empty → null, and every row is sent on save.
- md:/lg: none in these three files.

### b) v2 current
- `app/(app)/quiz/[id]/grade.tsx` (350 l), shared by LEADER/ADMIN/SUPER (v1 had two pages, spec 12 §9). Admin is the same screen in batch 4; differences are only the back target and `canReopen`.
- Hooks (keep, `src/hooks/use-quizzes.ts`):
  - `useQuizAuthoringDetail(id, isStaff)` → `[...queryKeys.quizzes.detail(id), "staff"]`, GET `/api/v1/quizzes/{id}`, `quizAuthoringDetailSchema` (branches on `kind`; carries `sessionId`, `sessionTitle`, `maxScore`, `canManage`).
  - PAPER: `useQuizGradeSheet(id, true)` → `queryKeys.quizzes.grades(id)`, GET `/api/v1/quizzes/{id}/grades`, `quizGradeSheetSchema`. `useSaveQuizGrades(id)` → POST `/api/v1/quizzes/{id}/grades` `{ entries }`, sets the grades cache, invalidates `quizzes.lists()`.
  - ONLINE: `useQuizAttempts(id, true)` → `queryKeys.quizzes.attempts(id)`, GET `/api/v1/quizzes/{id}/attempts`, `quizGradingPageSchema`. `useGradeEssays(id)` → POST `/api/v1/quizzes/{id}/attempts/{attemptId}/grade` `{ awards }`. `useReopenAttempt(id)` → POST `/api/v1/quizzes/{id}/attempts/reopen` `{ studentUserId }`. Both invalidate attempts + lists.
- Behaviours to keep: only touched rows are sent (l.33-36, 67-87); emptied field = explicit clear (D7); no client clamp, the server's `score_exceeds_max` message is shown (D7); whole-number validation `Score for {name} must be a whole number.`; essays send every award (server refuses partial, `awards_incomplete`); `apiErrorMessage` fallbacks.
- Renders today (legacy): role gate (`Quizzes / This screen isn't available for your role.`); bad id (`Not found / That quiz doesn't exist.`); detail Loading/Error `Couldn't load this quiz.`.
  - PAPER: header Card (title, `{graded}/{studentCount} graded`, `Out of {max}`), then one Card per student (name, `Input label="Score for {name}"`, `Input label="Notes for {name}"`, `Graded by {name}`), error text, `Save grades`.
  - ONLINE: header Card (`{items}/{studentCount} submitted`), `AttemptCard`s (name, `Attempt n · {STATUS}`, `Auto x · Total y`, `Graded by`, nested Cards per answer with `Their answer:` / `Correct answer:` / `Correct|Incorrect`, essay `Input label="Marks for {prompt}"` + `out of N`, `Save marks`, `Reopen for a retake` whenever status ≠ IN_PROGRESS), then a `Waiting` heading + `WaitingRow`s (`Not started` / `In progress since {date}` + reopen).
- No back link today (the stack header back only).
- Legacy imports: `../../../../src/theme` (`useTheme`), `../../../../src/ui` (`Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text`).
- Related V2-ONLY route: `app/(app)/quiz/[id]/index.tsx` `StaffPreview` (l.387-449) gives LEADER/ADMIN/SUPER a quiz preview (`Grade this quiz`, `Edit quiz`, question list with key). **v1 leaders have no such page**, and it is not in screen-map's v2-only list. Nothing in the leader flow routes to it (the list goes straight to `/grade`), so only deep links/notifications reach it. Flag for a ruling (drop for LEADER or keep as v2-only).

### c) Data mapping
| v1 element | v2 source |
|---|---|
| back link target `/leader/sessions/{id}` | `detail.sessionId` → `router.push({pathname:"/session/[id]"})` (or `router.back()`); **sessionId nullable** (v1 always had one from the URL) → hide the link when null |
| h1 title | `detail.title` ✓ |
| PAPER subtitle `{sessionTitle} · Max score: {max}` | `sheet.sessionTitle` / `sheet.maxScore` ✓ (also on `detail`) |
| PAPER rows name/score/notes | `sheet.rows[].studentName` (nullable → v1 `""`; v2 uses `"Student"`) / `score` / `notes` ✓, server order (backend orders by name, l.1454 ✓ same as v1) |
| `Score / {max}` header | `sheet.maxScore` ✓ |
| `{graded} / {total} graded` (live) | local count over edits + `sheet.rows`; v1 total = row count, which equals `sheet.rows.length` (v2's header uses `studentCount`; use rows for v1 parity) |
| `Saved` flash | **GAP (UI-only):** v2 has no saved indicator. Add local state on `save.onSuccess` |
| ONLINE card name / attemptNumber / status / totalScore | `items[].studentName` / `attemptNumber` / `status` / `totalScore` ✓; `maxScore` from `page.maxScore` ✓ |
| MCQ selected / correct / isCorrect / pointsAwarded / points | `answers[].options[selectedIndex]`, `correctIndex`, `isCorrect`, `pointsAwarded`, `points` ✓ (grader shape carries the key, R103) |
| ESSAY text / pointsAwarded / points | `answers[].text` / `pointsAwarded` / `points` ✓ |
| `hasEssays` | `page.hasEssays` ✓ (v2 uses per-attempt essay count; same effect) |
| empty `No submissions yet` | `page.items.length===0` ✓, but see Waiting below |
| `canReopen` | v1 leader `false`. v2 server lets a leader reopen (`canGradeQuiz`, spec 12 D5) — **CONFLICT** below |

GAP / deviations / V2-ONLY:
- **CONFLICT (spec 12 D5 vs v1):** v2 shows `Reopen for a retake` to leaders, and for SUBMITTED attempts too; v1 leader never had it and admin only on GRADED. D5 recommends leaders may reopen, and it is tested (`quiz-grading.test.tsx` l.180-207). Ruling needed: keep (render v1's outline `RotateCcw` `Reopen retake` for the leader too) or hide for LEADER. Also decide whether SUBMITTED attempts get it (v1: GRADED only).
- **V2-ONLY (spec 12 D5/R102):** `Waiting` section (not-started and IN_PROGRESS students, with reopen), tested l.172-178. v1 has no counterpart; with zero attempts v1 shows only the EmptyState. Keep and draw it with v1 idioms (no v1 markup exists, so it needs a design).
- **V2-ONLY (D13):** `Graded by {name}` on PAPER rows and attempts; `Auto x · Total y` line; header Cards `{n}/{m} graded`, `Out of N`, `{n}/{m} submitted`. Recommend dropping the header cards (v1 has the subtitle instead) and keeping `Graded by` only if ruled.
- **Copy CONFLICT (D7/D8):** v1 clamps the PAPER score client-side and validates essays `0–{points}`; v2 deliberately does not clamp and surfaces `score_exceeds_max` (tested l.118-136). The essay error copy differs: v1 `Enter 0–{points} points for each written answer.` vs v2 `Enter a whole-number mark for every essay question.` The v1 copy can be adopted while keeping the server as the bound.
- Copy: v1 MCQ shows `(correct: X)` **only when wrong**; v2 always `Correct answer: X`. Buttons: v1 `Save grade`/`Update grade`/`Saving…` vs v2 `Save marks`; v1 `Reopen retake` vs v2 `Reopen for a retake`; v1 `Saving...` (PAPER, three dots) vs `Saving…` (essay, ellipsis).
- PAPER table at 375px: v1 is a horizontally scrolling `<table>` (overflow-x-auto). **Ruling needed:** reproduce it (horizontal `ScrollView` + fixed column widths) or use rows. No capture exists to verify, and `src/design/ui/data-table.tsx` is the phone-list variant, not this raw table. Recommend a horizontal ScrollView with three fixed columns.
- Dark mode: v1's PAPER form is hard-coded light (`bg-white`, `text-brand-navy-900`, `ring-neutral-200/60`, `text-neutral-400/500`, no `dark:`). The owner rule says match exactly, so a white table in dark mode. Flag it, since it looks like a v1 bug.
- Back link: v1 `ArrowLeft` icon + `Back to session`, leader without the dark colour. `BackLink` in page-title.tsx renders `← label` with `dark:text-brand-teal-300` and doesn't fit; it needs an icon variant (admin also uses the ArrowLeft form).

### d) Components
- Ported: `Badge` (success/warning), `Button` (default; `size="sm"`; `variant="outline"`), `Input` (`size="sm"`, `keyboardType="number-pad"`, keep `accessibilityLabel` `Score for {name}` / `Notes for {name}` / `Marks for {prompt}` for tests), `EmptyState`, `Text`, `ShellFrame`, `PageTitle` (title only; the header needs the back link above it), `RouteSkeleton`/`RouteError`. Icons: `ArrowLeft`, `Check`, `X`, `RotateCcw` (lucide-react-native).
- Needs port:
  - `components/quizzes/quiz-essay-grader.tsx` (180 l) → e.g. `src/design/quizzes/quiz-essay-grader.tsx` (`StudentGradeCard`), keeping v2 hooks and mutations wired in from the screen. Shared with admin grade (batch 4).
  - `components/quizzes/quiz-grade-form.tsx` (116 l) → `src/design/quizzes/quiz-grade-form.tsx` (table + save row), keeping v2's touched-rows / no-clamp / clear semantics.
  - Back-link-with-icon variant (extend `BackLink` or a local header).

### e) Tests — `src/__tests__/quiz-grading.test.tsx` (208 l)
- Behaviour (keep): PAPER saves only edited rows, payload `{entries:[{studentUserId:9,score:15,notes:null}]}` (l.81-101); emptied field sends `score:null` (l.103-116); server over-max message shown verbatim (l.118-136); ONLINE essay award POST `/attempts/900/grade` `{awards:[{questionId:101,points:4}]}` (l.151-170); waiting students listed (l.172-178, V2-ONLY); leader reopen POST `/attempts/reopen` `{studentUserId:9}` (l.180-207, subject to the D5 ruling).
- Markup/copy (will change): `1/2 graded` (l.88) → `1 / 2 graded` (v1 spaced form, by the button); `Save grades` (l.91, same in v1); `Correct answer: Paris` (l.160): v1 shows nothing for a correct MCQ (Check icon + `Paris` + `2/2`), so the assertion must change to the option text or icon label; `Save marks` (l.163) → `Save grade`; `Waiting` / `Not started` (l.175-177, V2-ONLY copy); `Reopen for a retake` (l.201) → `Reopen retake`.
- Query-by-label assertions (`Score for Test student`, `Score for Second student`, `Marks for Discuss.`) stay valid if the new Inputs keep those `accessibilityLabel`s.
- `quiz-authoring.test.tsx` (278 l): l.108-120 expects `/quiz/new` (PAPER) → `router.replace /quiz/[id]/grade`. That is behaviour, unaffected by the markup.

---

## 3. /leader/students/[id] → `(app)/student/[id]/index`

### a) v1
Files: `app/leader/students/[id]/page.tsx` (44 l), `components/students/student-detail.tsx` (398 l), `components/students/note-form.tsx` (112 l). ui: `Card`/`CardHeader`/`CardTitle`/`CardContent` (80 l), `Avatar`/`AvatarFallback` (95), `Badge`, `Button`, `Progress` (51), `Tabs` (66), `AttendancePill` (51), `SubmissionStatusBadge` (55), `EmptyState`, `FormField` (40), `RichTextEditor` (213), `Select` (86). Icons: `Calendar`, `Mail`, `MapPin`, `Phone`, `Flag`. Not used by a leader: `drop-enrollment-button.tsx` (89), `graduate-student-button.tsx` (92).
Shots: `leader/light/leader__students__id.png`, `leader/dark/…` (+ shell dialogs). The capture is **928×1922 px = 464 CSS px wide**: the tab row (5 tabs) overflows 375px and makes the whole page scroll horizontally. Only the Profile tab content was captured. Personal data is visible in the shot (name, email, university, phone, background); not reproduced here.

Server: `canViewStudent` else redirect `/leader/groups`; `loadStudentDetail` (full object, spec 06 §4.2: leader receives phone, DOB, spiritual background, internal notes, all seasons, attendance, submissions, notes, documents); `engagement` = `computeEngagementForStudent(id, profile.activeSeasonId)` **only if activeSeasonId**; `visibleNotes = filterVisibleNotes(notes, user)` (equality on role vs visibility); `canWriteNote(user, id)`. Props: `canEdit={false}`, `showDocumentsTab={false}`, defaults `showNotesTab`/`showSubmissionsTab` true, `canGraduate` false, `reviewBasePath="/leader/submissions"`.

Render tree:
- `div.flex flex-col gap-4`
  - `div` > `h1` (H1 idiom) `{name ?? email}` · `p.mt-1 text-sm text-muted-foreground` `` `${email} · leader view` ``
  - `StudentDetail` → `div.flex flex-col gap-4 md:gap-6` (md dropped)
    - **Hero** `Card` (`rounded-2xl bg-card shadow-[var(--shadow-soft)] ring-1 ring-border`) > `CardContent.flex flex-col gap-4 pt-6` (+ base `p-4 pt-0` → p-4 / pt-6; `md:flex-row md:items-center md:justify-between`, `md:p-6` dropped)
      - `div.flex items-center gap-3`
        - `Avatar.size-14` (base `rounded-full bg-brand-teal-100 font-semibold text-brand-navy-900`, md size → `text-sm`) > `AvatarFallback` initials (first letters of the first two name words, upper; else email[0]; else `?`)
        - `div` > `p.text-lg font-semibold` name ?? email · `p.text-sm text-muted-foreground` email · `div.mt-1 flex flex-wrap gap-2 text-xs` > graduationYear != null → `Badge variant="success"` `Alumnus · {year}`; activeSeasonTitle → `Badge variant="outline"` title; currentGroup → `Badge variant="secondary"` group name
      - `div.flex flex-wrap gap-2` > `Button variant="outline"` (mailto) `Mail` + `Email` · phone → `Button variant="outline"` (tel:) `Phone` + `Call` · (canGraduate → GraduateStudentButton; canEdit && editHref → `Button` `Edit profile`, neither for a leader)
    - **Engagement** (only when `engagement` non-null) `Card` > `CardHeader` (`flex flex-col gap-1.5 p-4`) > `CardTitle.text-base` (base `font-semibold leading-tight tracking-tight`, `md:text-lg` dropped) `Engagement (current season)` · `CardContent.flex flex-col gap-3` (p-4 pt-0)
      - `div.flex items-center gap-3` > `Progress value={score} className="flex-1"` + `span.text-sm font-semibold tabular-nums` `{score}%`
      - `div.grid grid-cols-2 gap-3 text-xs text-muted-foreground` > `span` `Attendance: {present}/{total} ({attendancePct}%)` · `span` `Submissions: {completed}/{expected} ({submissionPct}%)` (two equal columns)
    - **Tabs** `defaultValue="profile"` (`flex flex-col gap-5`) > `TabsList` (`relative inline-flex items-center gap-1 border-b border-border`) > `TabsTrigger` (`relative inline-flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground`; the selected style never applies, v1 bug, already reproduced by the ported Tabs): `Profile` · `Seasons` · `Attendance` · `Submissions` · `Notes` (no `Documents` for a leader)
      - **profile**: `Card` > `CardContent.grid grid-cols-1 gap-3 pt-6` (p-4 pt-6; `md:grid-cols-2`, `md:col-span-2` dropped) > `Field`s in order: `University` · `Year / faculty` · `Date of birth` (`MMM d, yyyy`) · `Phone` · `Spiritual background` · `Gifts / interests` · (profile.notes != null) `Internal notes`
        - Field: `div` > `p.text-xs font-medium uppercase tracking-wide text-muted-foreground` label; value → `p.mt-1 whitespace-pre-line text-sm text-foreground` / null → `p.mt-1 text-sm italic text-muted-foreground` `—`
      - **seasons**: empty → `EmptyState icon=Calendar title="No seasons" description="This student isn't enrolled in any season yet."`; else `ul.flex flex-col gap-3` > `li` > `Card` > `CardContent.flex flex-col gap-2 pt-4` (p-4 pt-4; md:flex-row dropped)
        - `div` > `p.font-medium` title · `p.text-xs text-muted-foreground` `{MMM d, yyyy} – {MMM d, yyyy}` + (groupName ? ` · {groupName}`)
        - `div.flex flex-wrap items-center gap-2 text-xs` > `Badge variant="outline"` raw `{season.status}` · `Badge variant=` ACTIVE ? `info` : `secondary` raw `{enrollmentStatus}` (`ACTIVE`/`COMPLETED`/`WITHDRAWN`) · `Badge variant="success"` `{attendancePct}% attendance` · (canEdit && ACTIVE → DropEnrollmentButton; not for a leader)
      - **attendance**: empty → `EmptyState icon=MapPin title="No attendance yet" description="Attendance records will appear here as sessions are marked."`; else `Card` > `CardContent.p-0` > `ul.divide-y divide-border` > `li.flex items-center justify-between gap-3 px-4 py-3` > `div.min-w-0` (`p.truncate text-sm font-medium` sessionTitle · `p.text-xs text-muted-foreground` `{EEE, MMM d, yyyy · h:mm a} · {seasonTitle}`) + `AttendancePill status`
      - **submissions**: empty → `EmptyState icon=Calendar title="No submissions" description="Submissions visible to you will appear here."`; else `Card` > `CardContent.p-0` > `ul.divide-y divide-border` > `li.flex items-center justify-between gap-3 px-4 py-3` > `div.min-w-0` (`Link href=/leader/submissions/{publicId} .truncate text-sm font-medium hover:underline` assignmentTitle · `p.text-xs text-muted-foreground` `{seasonTitle}` + (submittedAt ? ` · submitted {MMM d, yyyy}`)) + `SubmissionStatusBadge status`
      - **notes**: `div.flex flex-col gap-4`
        - canWriteNote → `Card` > `CardHeader` > `CardTitle.text-base` `Add a note` · `CardContent` > `NoteForm studentUserId` (defaultVisibility LEADERS, allowFollowUpFlag true):
          - `form.flex flex-col gap-3`
          - `FormField label="Note"` > `RichTextEditor placeholder="Reflections, prayer requests, follow-up items…"`
          - `div.flex flex-col gap-3` (md:flex-row… dropped) > `FormField label="Visible to" description="Who can read this note (in addition to you and admins)."` > `Select` items `Leaders` / `Mentors` / `Admins only` · `label.inline-flex items-center gap-2 text-sm` > checkbox `size-4` + `Flag.size-4 text-warning-600` + `Flag for admin follow-up`
          - error → `p.rounded-md bg-error-50 px-3 py-2 text-sm text-error-800` (`Note can't be empty.` client, or server error)
          - `div.flex justify-end` > `Button type=submit` `Add note` / `Saving…`
        - no visible notes → `EmptyState icon=Flag title="No notes yet" description="Notes you can see will appear here."`
        - else `ul.flex flex-col gap-3` > `li` > `Card` > `CardContent.flex flex-col gap-2 pt-4`
          - `div.flex flex-wrap items-center gap-2 text-xs text-muted-foreground` > `span.font-medium text-foreground` `{authorName ?? "Unknown author"}` · `Badge variant="outline" className="text-[10px]"` raw authorRole · `Badge outline text-[10px]` raw visibility (`LEADERS`…) · followUpFlagged → `Badge variant="warning" text-[10px]` `Follow up` · `span` `·` · `span` `MMM d, yyyy` · seasonTitle → `span` `·` + `span` seasonTitle
          - `div.prose prose-sm max-w-none text-sm` dangerouslySetInnerHTML body
- md:/lg: dropped: `md:gap-6`, `md:flex-row md:items-center md:justify-between` (hero, seasons rows, note form row), `md:p-6`/`md:pt-0` (Card parts), `md:text-lg` (CardTitle), `md:grid-cols-2` / `md:col-span-2` (profile grid).

### b) v2 current
- `app/(app)/student/[id]/index.tsx` (514 l). **One route for SUPER, ADMIN, MENTOR, LEADER** (and technically the student self view via the private arm; v1 has no such page). screen-map: `/leader`, `/admin`, `/mentor`, `/super/students/[id]` all map here. Admin/super/mentor differences are batch 4, but they live in the same file:
  - v1 header subtitle: leader `{email} · leader view`, mentor `{email} · mentor view` (h1 without the dark variant, subtitle `text-neutral-500`), admin/super `{email}` only.
  - v1 props: admin `canEdit` + `Edit profile` + Documents tab + Drop buttons; super also Graduate; mentor and leader neither, no Documents.
  - Sub-routes: `student/[id]/edit.tsx` (107 l, SUPER/ADMIN edit form, batch 4); no leader sub-route. Sheets `src/components/GraduateStudentSheet`, `DropEnrollmentSheet` (admin/super).
- Hooks (keep):
  - `useStudentDetail(id, role)` (`src/hooks/use-students.ts`) → `queryKeys.students.detail(id)`, GET `/api/v1/students/{id}`, parse by role: SUPER/ADMIN `studentDetailInternalSchema`, STUDENT `studentDetailPrivateSchema`, **LEADER/MENTOR `studentDetailPublicSchema` (`.strict()`, a leak detector)**.
  - `useStudentEngagement(id, enabled)` (`use-engagement.ts:37`) → `queryKeys.engagement.student(id)`, GET `/api/v1/students/{id}/engagement`, `studentEngagementSchema`; `isNoSeasonError` (404 `no_season`).
  - `useStudentAttendanceHistory(id, enabled)` → `queryKeys.students.attendance(id)`, GET `/api/v1/students/{id}/attendance`, `studentAttendanceHistorySchema`.
  - `useStudentSubmissions(id, enabled)` → `queryKeys.students.submissions(id)`, GET `/api/v1/students/{id}/submissions`, `studentSubmissionsSchema`.
  - `useStudentNotes(id, enabled)` (infinite) → `queryKeys.notes.byStudent(id)`, GET `/api/v1/students/{id}/notes[?cursor]`, `noteListResponseSchema`; `useCreateNote(id)` → POST `/api/v1/students/{id}/notes` `{ body, visibility, followUpFlagged }`, invalidates byStudent + authored.
  - `useDeleteStudent`, `studentActionsFor(user, scopes, data)` (`src/lib/student-actions.ts`): Edit/Graduate/Delete/Drop for SUPER/ADMIN only, so **a leader gets none**.
  - `enabled = role !== null && role !== "STUDENT"` for engagement/attendance/submissions/notes. Today all four fire **eagerly on mount**.
- What a LEADER sees today (legacy `Screen`, stacked, no tabs): title name, email, `Alumnus — Class of {year}`, `Current group: {name}`; `ProfileCard` (public arm → only University/Year/Gifts rows, null rows hidden, heading `Profile`); Seasons Card (`{seasonTitle}`, `{Active|Completed|Dropped} · {group}`, `{pct}% attendance`, dropReason null for the leader); Engagement Card (`{score}`, `Attendance x%`, `Submissions y%`, `a/b sessions · c/d assignments`, `At risk`, or `No season to score yet`); Attendance history Card (`{title} · {Present}`, `formatDateTime · season`); Submissions Card (`{title} · {Status}[ · Late]`, pressable → `/submission/[publicId]`); `Write a note` composer (v2 visibility copy, `Input label="New note"`, three chip Buttons `Group leaders`/`Mentors`/`Season admins`, `Save note`, no follow-up flag); Notes Card (body, `{author} · {date}`, `Visible to group leaders only`, `Follow-up flagged`, `Edited`, `Load more`).
  - ADMIN/SUPER additionally: action buttons, `Internal notes` card (`Staff only — the student never receives this field.`), phone/DOB/background rows, Drop per row, sheets.
- Legacy imports: `../../../../src/theme` (`useTheme`), `../../../../src/ui` (`Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text`). `formatDate`/`formatDateTime`/`formatDayKey` (src/lib/format) stay.
- Entry points in v2: `SeasonStaffDashboard` (l.106), reports, notes, StudentList, MentorDashboard. **The v1 leader reaches it from `/leader/groups` (l.78) and the leader dashboard (l.271).** The v2 `group/[id]` screen has no student link today (check with the groups inventory).

### c) Data mapping
| v1 element | v2 source |
|---|---|
| h1 `name ?? email` | `data.name` (non-null, spec 06 D9) ✓ |
| subtitle `{email} · leader view` | `data.email` + role suffix (copy) ✓ |
| Avatar initials | `initialsOf(data.name, …)` (`src/lib/initials.ts`), the same two-word rule ✓; `avatarPath` exists but there is no read path (initials only, as batch 2 profile) |
| `Alumnus · {year}` | `data.graduationYear` ✓ |
| active season badge | `data.profile.activeSeasonTitle` ✓ (public arm) |
| group badge | `data.currentGroup.name` ✓ |
| Email button | `Linking.openURL("mailto:"+email)` ✓ |
| **Call button / Phone field** | **GAP (deliberate):** the public arm has no `phone`. A leader's payload omits it (spec 06 D3, C8); the `.strict()` parse would fail if the server sent it |
| **Date of birth / Spiritual background fields** | **GAP (deliberate):** same, not in the public arm |
| **Internal notes field** | **GAP (deliberate):** internal arm (ADMIN/SUPER) only; v1 showed it to leaders when non-null |
| University / Year / Gifts | `profile.university/year/gifts` ✓ |
| Engagement score / pcts / counts | `engagement.score`, `attendancePct`, `submissionPct`, `attendancePresent/Total`, `submissionsCompleted/Expected` ✓ (server, C4) |
| engagement shown only with activeSeasonId | v2 asks always; 404 `no_season` = v1's "no card". **V2-ONLY copy** `No season to score yet`; v1 renders nothing |
| Seasons rows title / dates / group | `enrollments[].seasonTitle`, `startDate`/`endDate` (ISO → `formatDate`), `groupName` ✓ |
| season status badge (raw) | `enrollments[].seasonStatus` ✓ |
| enrollment status badge (raw `ACTIVE`/`COMPLETED`/`WITHDRAWN`, info vs secondary) | `enrollments[].status` ✓ (same enum). v2 currently maps to `Active/Completed/Dropped`; v1 prints the raw enum |
| `{pct}% attendance` | `enrollments[].attendancePct` ✓ **nullable** (null outside the caller's scope) → hide the badge |
| seasons list scope | **Behaviour diff:** v1 lists every season; v2 gives a LEADER only rows whose group is theirs (spec 06 §7, C8) |
| Attendance rows title / season / status | `history[].sessionTitle/seasonTitle/status` ✓ (status PRESENT/ABSENT/LATE = AttendancePill) |
| Attendance date `EEE, MMM d, yyyy · h:mm a` | `history[].startsAt` → `formatDateTime` ✓, device zone (no org wall time/dayKey on this row; the same data gap as batch 2) |
| Submissions title / season / submittedAt / status | `submissions[].assignmentTitle/seasonTitle/submittedAt/status` ✓; link → `/submission/[publicId]` ✓ |
| SubmissionStatusBadge statuses incl. DRAFT | v2 never returns DRAFT (server); `isLate` is V2-ONLY (`· Late`) |
| canWriteNote (composer visibility) | **GAP:** no `canWrite` flag on any contract; v2 shows the composer to every non-student role. For a leader it is equivalent (canViewStudent ⇒ canWriteNote for group leaders), so low risk. MENTOR/ADMIN may differ (batch 4) |
| Note body (TipTap HTML via prose) | `note.body` **plain text** (C11, spec 09 D1) → render as Text; RichTextEditor unusable (the same as batch 2 submissions) |
| Note author / role / visibility / follow-up / date / season | `authorName` (non-null, so `Unknown author` is moot), `authorRole`, `visibility`, `followUpFlagged`, `createdAt` → `formatDate`, `seasonTitle` ✓ |
| Composer visibility Select `Leaders/Mentors/Admins only` | `noteVisibilitySchema` LEADERS/MENTORS/ADMINS ✓ |
| `Flag for admin follow-up` checkbox | `createNoteRequestSchema.followUpFlagged` ✓ exists; **GAP (UI-only):** v2 hard-codes `false` |
| `Note can't be empty.` | v2 silently ignores < 2 chars (`NOTE_BODY_MIN=2`); adopt v1 copy plus the min |
| Documents tab | hidden for a leader in v1 ✓; **GAP for batch 4 (admin/super):** no documents endpoint/hook in v2 |

V2-ONLY on this screen (decide keep/drop):
- `At risk` label on engagement (spec 06/09 C4 single definition), tested.
- Notes `Edited`, `Load more` pagination (R41), `Visible to group leaders only` caption (D3 copy), tested.
- Separate per-section loading and error states (`Couldn't load engagement.`, `…attendance.`, `…submissions.`, `…notes.`), since each sub-resource fails independently. Tested for engagement.
- Whole-screen `Couldn't load this student.` on a strict-parse failure (leak detector), tested. Map it to `RouteError` (keep the behaviour, not necessarily the copy).
- `Not found / That student link isn't valid.` for a bad id.

Conflicts with domain decisions (need rulings):
- **Spec 06 D3 + ruling C8 vs v1 leader view:** v1 shows a leader Phone (and a `Call` button), Date of birth, Spiritual background and Internal notes. v2's leader payload withholds all four by design. Options: (a) hide those Fields and the Call button for a leader (recommended; the data does not exist client-side), or (b) render the Field labels with `—`, which reads as "unknown" and misleads. Note that the D3 table says v1 *delivered* these to the leader.
- **Spec 09 D3 vs v1 composer copy:** v1 `Who can read this note (in addition to you and admins).` is wrong per D3 (equality, not a ladder). v2 replaced it with `Only the group you choose can read this note, plus you and SUPER users. Season admins do not automatically see leader or mentor notes.` (tested). D3: "Do not port the misleading copy." Ruling: keep the v2 sentence as the FormField description.
- **Spec 09 D1 / C11 vs v1 RichTextEditor + prose render:** the note body is plain text on the wire → plain `Textarea` (ported `src/design/ui/textarea.tsx`) and Text rendering, the same as batch 2's submissions ruling.
- **Spec 06 §9 ("Tabs become lazily-fetched sub-queries") vs v2's eager fetch:** adopting v1 Tabs means attendance/submissions/notes should fetch only when their tab opens. Engagement stays on mount (the card sits above the tabs). Tests that assert eager GETs must then press the tab first.
- Copy of visibility chips: v1 Select items `Leaders` / `Mentors` / `Admins only` vs v2 chips `Group leaders` / `Mentors` / `Season admins` (tested l.198). The v1 Select with v1 labels can be adopted; behaviour is unchanged.

Layout ruling needed:
- **Tab row overflow:** five triggers ≈ 440px at 375px; v1 lets the page scroll sideways (capture is 464px wide). RN cannot page-scroll horizontally inside ShellFrame. Recommend wrapping `TabsList` in a horizontal `ScrollView` (`showsHorizontalScrollIndicator={false}`), keeping the border-b under the full width. Admin/super add a 6th `Documents` tab (batch 4).

### d) Components
- Ported (src/design/ui): `Card` + `CardHeader`/`CardTitle`/`CardContent` (check that CardContent keeps v1 `p-4 pt-0` and that `pt-6`/`pt-4`/`p-0` overrides apply), `Avatar`/`AvatarFallback` (`className="size-14"`), `Badge` (success/outline/secondary/info/warning, `text-[10px]` via textClassName), `Button` (outline + icon `Mail`/`Phone`), `Progress` (`className="flex-1"`, no label), `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` (reproduces v1's never-selected style), `AttendancePill`, `SubmissionStatusBadge`, `EmptyState` (Calendar, MapPin, Flag), `FormField`, `Select`/`SelectItem`, `Textarea` (in place of RichTextEditor), `Text`, `PageTitle`, `ShellFrame`, `RouteSkeleton`/`RouteError`.
- Checkbox: no ported checkbox in `src/design/ui/index.ts` (there is `Switch`). **Needs port** of a small checkbox for `Flag for admin follow-up` (v1 native `input type=checkbox size-4`).
- Needs port (non-ui v1):
  - `components/students/student-detail.tsx` (398 l) → `src/design/students/student-detail.tsx` with props `canEdit`, `canWriteNote`, `canGraduate`, `showNotesTab`, `showSubmissionsTab`, `showDocumentsTab`, `onEdit`, and v2 queries injected per tab. Shared by leader (batch 3) and admin/super/mentor (batch 4), so build the props now.
  - `components/students/note-form.tsx` (112 l) → `src/design/students/note-form.tsx` (keep `useCreateNote`, v2 copy per 09 D3, plain-text body).
  - `Field` (local to student-detail).
  - batch 4 only: `drop-enrollment-button.tsx` (89 l), `graduate-student-button.tsx` (92 l), whose v2 equivalents are the existing sheets; restyle with `ConfirmDialog`/`Modal`.

### e) Tests
- `src/__tests__/student-detail.test.tsx` (192 l):
  - Behaviour (keep): GET `/api/v1/students/21` (l.93); MENTOR public arm shows no phone/notes (l.107-125); strict-parse leak → error state (l.127-137); staff GET `/attendance` + `/submissions` and press submission → `/submission/[publicId]` `abc123defg` (l.165-175, must press the `Submissions` tab first if lazy); student self never requests staff history (l.177-191).
  - Markup/copy (will change): `/Dropped/` (l.103) → raw `WITHDRAWN` badge; `Moved away` drop reason (l.104), which v1 never renders (dropReason is V2-ONLY, admin/super arm); `83% attendance` (l.169) same in v1 but inside the Seasons tab (press the tab); `Week 4 · Late` (l.170) → title and `Late` pill separate; `Essay one · Submitted · Late` (l.171/173) → title + `Submitted` badge (`· Late` V2-ONLY); `/\+20 100 000 0000/` (l.91) only in the Profile tab for SUPER (default tab ✓); `Watch attendance` (l.92) moves into the Profile tab as an `Internal notes` Field; `Couldn't load this student.` (l.136), V2-ONLY copy.
- `src/__tests__/student-engagement-notes.test.tsx` (220 l, SUPER session):
  - Behaviour (keep): GET `/engagement` (l.119); at-risk from contract (l.122-131); `no_season` handled distinctly (l.133-149); other failures retryable (l.151-167); notes from `/notes` endpoint (l.171-178, press `Notes` tab if lazy); POST note payload `{body, visibility:"ADMINS", followUpFlagged:false}` (l.190-208); the D3 warning copy present (l.210-219).
  - Markup/copy (will change): `75` (l.115) → `75%` beside the Progress; `Engagement` (l.116) → `Engagement (current season)`; `Attendance 50%` / `Submissions 100%` (l.117-118) → `Attendance: 2/4 (50%)` / `Submissions: 2/2 (100%)`; `At risk` (V2-ONLY); `No season to score yet` (V2-ONLY copy; v1 hides the card); `Visible to group leaders only` (l.187) → v1 outline badge `LEADERS` (D3 caption is V2-ONLY); `New note` label (l.196), `Season admins` chip (l.198) → Select item `Admins only`; `Save note` (l.199) → `Add note`.
- `src/__tests__/student-detail-actions.test.tsx` (179 l): SUPER/ADMIN/MENTOR lifecycle (l.75-177). Batch 4, but the file renders this route. Copy: `Edit` (l.80, 92, 111) → v1 `Edit profile`; `Graduate` / `Graduate Sara Student?` / `Graduate student` (l.81, 121-124) → v1 GraduateStudentButton copy; `Delete student` (l.82, 174) is V2-ONLY (SUPER delete); `Drop from Spring 2099?` / `Drop student` (l.154-156); DOB `/Mar 9, 2004/` (l.84) stays valid (`MMM d, yyyy`). Behaviour (keep): push `/student/[id]/edit`, POST `/graduate`, PATCH `/enrollments/7`, DELETE + replace `/students`.
- No test covers the LEADER role on this screen today. Add one: leader payload parses the public arm, there is no Call button, and the header reads `· leader view`.
