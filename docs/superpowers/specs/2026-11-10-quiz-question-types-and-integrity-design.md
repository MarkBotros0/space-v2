# Online quizzes: question types, shuffling, timing and integrity — design

Date: 2026-11-10 · Status: draft for owner review

## Intent

Online quizzes today have two question types (single-answer MCQ, essay), a fixed order, no
timing, and nothing that notices a student leaving the app. The app is new and unpublished
(TestFlight only), so this is the moment to redesign the quiz foundation — how a question is
stored, how an answer is stored and marked, how an attempt is timed and watched — rather than
bolt types on.

The quizzes are mostly taken **in a session room, with a leader watching, at the same time**.
The leader can see the room; they can't see phones. So the integrity measures target what a
watched room can't catch: looking things up in another app, screenshotting questions for a
student who takes it later, and taking the quiz outside the session.

Most quiz **content is Arabic**; the app's own interface stays English.

## Goals

1. Six question types: single choice, multiple choice ("choose N"), true/false, fill in the
   blank, matching, essay.
2. Arabic (RTL) question, option and answer text that reads correctly, mixed with English.
3. Per-student shuffling of options and (optionally) question order, fixed within an attempt.
4. A start window and a time limit, enforced by the server.
5. Integrity: screenshots, screen recording, copy and paste blocked; leaving the quiz warned,
   counted and, at the third exit, ending the attempt; the quiz reopens itself on relaunch.
6. Leaders mark typed answers right/wrong only; the admin sets every question's points.
7. A live screen for staff showing each student's state during the quiz.
8. The **same experience on iPhone and Android.**

## Non-goals

- **Apple's exam mode (Automatic Assessment Configuration)** and **Android screen pinning**.
  Owner: exam mode needs an Apple entitlement and complicates App Store publishing; pinning
  would make Android differ from iPhone. Neither is used.
- Blocking other apps' notifications or toggling Do Not Disturb (impossible on iPhone; needs a
  hand-granted permission on Android, which breaks parity).
- Put-in-order and short-answer types; images on questions. (Design leaves room for images
  later — see "Builder's calls".)
- Auto-marking typed text (fill in the blank). Arabic spelling variation (hamza forms, ة/ه,
  ى/ي, tashkeel) makes it unreliable; leaders mark it.
- Translating the app's UI into Arabic / full RTL layout of the app.
- Video quizzes (`video-quiz`): a separate system, untouched. Paper quizzes: untouched.

## Anti-goals (a failure even if it works)

- An honest student who loses their attempt to a phone call, crash or dead battery with no way
  back. (Reopen covers this — see Integrity.)
- iPhone and Android students getting different rules or different warnings.
- A correct answer, a question's text, or per-item correctness reaching a student's phone
  after they submit and before the admin releases the answers (see "What students see").

## What exists today (to build on)

Schema `apps/backend/prisma/schema.prisma`: `Quiz` (kind PAPER/ONLINE, `publishedAt`,
`resultsReleasedAt`), `QuizQuestion` (`type` MCQ/ESSAY, `options String[]`, `correctIndex`,
`points Int`, `order`), `QuizAttempt` (status IN_PROGRESS/SUBMITTED/GRADED, `autoScore`,
`manualScore`, `totalScore` Int, one IN_PROGRESS per student via a partial unique index,
`attemptNumber` for retakes), `QuizAnswer` (`selectedIndex`, `text`, `isCorrect`,
`pointsAwarded`). Backend: `routes/quizzes/*`, `lib/quizzes/{attempts,grading,questions}.ts`,
`lib/quiz-results.ts` (`studentAttemptStatus`), `lib/permissions/quiz.ts` (`canManageQuiz` =
SUPER or season admin; `canGradeQuiz` = any staff scope in the season). Shared contracts:
`packages/shared/src/quiz/`. Mobile: `screens/quiz-edit`, `screens/quiz-detail`
(`student-quiz-runner.tsx`, `use-quiz-answers.ts` with autosave on AppState),
`screens/quiz-grade`.

Behaviours that stay: `correctIndex`-style answer keys never
selected into a student read; one live attempt per student; staff reopen creates a new attempt
(`attemptNumber + 1`), the old one kept; a quiz with attempts is structurally frozen; answers
autosave; attempts with nothing to hand-mark are GRADED on submit, others wait SUBMITTED.

## Question types

| Type | Student does | Marked by | Points |
|---|---|---|---|
| **Single choice** | picks one option | server | all or nothing |
| **Multiple choice — "Choose N"** | ticks exactly up to N options; the app shows "Choose N" and won't allow more than N ticks (N = the number of correct options) | server | each correct tick = 1/N of the points; a wrong tick earns nothing (no subtraction) |
| **True / false** | picks True or False | server | all or nothing |
| **Matching** | pairs every left item with one right item (4–5 per side, equal counts) | server | each correct pair = 1/pairs of the points |
| **Fill in the blank** | types a word/phrase into each gap in a sentence; one or more gaps | leader, right/wrong **per blank** | each right blank = 1/blanks of the points |
| **Essay** | free text | leader, right/wrong | all or nothing (my call — see below) |

- The **admin sets each question's points** when building the quiz (authoring stays with
  `canManageQuiz`). Leaders never type points.
- **Fill in the blank authoring**: the author writes the sentence and marks gaps in it, giving
  the expected answer for each gap. The expected answer is shown to the leader while marking,
  never to the student.
- **Matching authoring**: the author enters pairs (left ↔ right). The two columns are shuffled
  separately for each student.
- **True/false** is its own type (faster to author), not shuffled.
- The existing rule stands: **submit is refused until every question is answered** — except
  when the attempt ends by time-out or by the third exit (see below), where unanswered
  questions score zero. For "Choose N", answered means at least one tick (my call); for
  matching, every left item paired; for blanks, every blank non-empty.

### Scores

Partial marks mean fractions. Points per question stay whole numbers set by the admin; awarded
points and attempt totals become **decimals stored to two places, displayed to one** (e.g.
7.5 / 10). Everything that reads quiz scores (season record, exports/workbook, dashboards,
graduation checks, grading screens) moves to the decimal value. *My call.*

## Arabic text

- UI chrome stays English. Question prompts, options, matching items, blank sentences and
  student answers may be Arabic, English or mixed.
- Each text block's direction is **detected from its content** (first strong character), not
  chosen by the author; it renders right-to-left with right alignment when Arabic. Mixed
  Arabic/English and numbers must read correctly. *My call: auto-detect.*
- Answer inputs take the direction of the question text.
- Fill in the blank: the gap sits inline at its position in the RTL sentence.
- Matching: column sides follow the text direction (the "left" column sits on the right in an
  Arabic question).
- Arabic fonts/shaping must render correctly with the app's font stack (Geist has no Arabic;
  a fallback that renders Arabic well is needed).

## Shuffling

- **Options are always shuffled per attempt** for single choice, Choose N, and both matching
  columns. True/false is never shuffled.
- **Question order is shuffled per attempt** when the quiz's **"Shuffle questions"** switch is
  on (on by default; off for quizzes whose questions build on each other). *My call: the
  switch.*
- The order is **fixed for the life of an attempt**: leaving and coming back shows the same
  order. A reopened (retake) attempt gets a new shuffle.
- Answers are stored **by option/item identity, not by position** — every option, matching
  item and blank gets its own id. This is the main reason the storage changes.
- Staff screens (preview, grading) show the author's order.

## Timing

Both settings are optional per quiz, set by the admin:

- **Start window**: a "can start from" and "can start until" time (e.g. 6:00–6:30 pm). Before
  it, the quiz is visible but locked; after it, nobody new can start. There is **no close
  time** for the quiz as a whole.
- **Time limit**: minutes, counted from each student's own start (someone starting at 6:25
  with 20 minutes finishes by 6:45).
- No window = startable whenever published. No limit = untimed.
- The **server clock** decides; the phone shows a countdown but changing the phone's clock
  changes nothing. The deadline is fixed at start; leaving the app does not pause it.
- When time runs out the attempt **submits itself** with what's saved; unanswered = zero.
  The server must close an expired attempt even if the phone never comes back (e.g. on the
  next read or by a sweep) — how is the builder's call, but a dead phone must not leave an
  attempt open forever.
- A reopened attempt gets a fresh time limit; the start window does not block a staff reopen.
  *My call.*

## Integrity

### Blocked on both phones while an attempt is open

- **Screenshots and screen recording** (`expo-screen-capture`, which blocks both on Android and,
  on iOS 13+, blanks screenshots and recordings). Screenshot attempts that the OS reports are
  logged.
- **Copy**: question text and options can't be selected or copied.
- **Paste** into answer boxes. *My call.*
- **Autocorrect, spell check and keyboard suggestions** in answer boxes. *My call.*
- **Screen auto-lock**: the screen stays awake during the quiz so an idle phone isn't an exit.
  *My call.*
- **The app's own notifications** (announcements, grades…) are held back and shown after the
  attempt ends. *My call.*

### Leaving the quiz

**Counts as an exit** (warning + logged): going to the home screen or another app for any
length of time; tapping another app's notification; split screen or a floating window over the
quiz (Android); locking the screen with the power button; a phone call taking over the screen;
closing the app, a crash or the phone dying — coming back counts as one exit.

**Not an exit** (logged only, or not at all): pulling down notifications / Control Center for a
peek (neither OS reports it reliably — counting it would treat the platforms differently; *my
call*); losing internet (answers keep on the phone and sync; the timer is server-side); a
blocked screenshot attempt (logged only).

**Limit — same for every quiz:** the first and second exits show a warning; **the third exit
ends the attempt** and submits it with what's answered. The warning **does not show a count**:
"Leaving the quiz isn't allowed and has been recorded. Leaving again may end your attempt."

Exits must be counted by the **server**, not trusted to the phone alone, so a student can't
reset the count by reinstalling or clearing data. A crash or kill that the phone couldn't
report is recognised on return (the attempt was open and the app wasn't in the foreground).

Every exit is stored with its time and how long the student was away.

### Relaunch

If the student has an open attempt, **the app opens straight into that quiz** on every launch;
nothing else is reachable until it's submitted, timed out or ended.

### Before you start

A screen before starting asks the student to turn on Do Not Disturb / Focus, explains that
leaving the quiz is recorded and ends the attempt on repeat, and shows the time limit; an
"I'm ready" button starts it. The app can't check Do Not Disturb. *My call.*

### Honest accidents

A call, crash or dead battery can end an attempt. The fix is the existing **reopen**: a leader
reopens it as a retake — a fresh attempt with a new shuffle and a new timer; answers from the
first try don't carry over (*my call*). The ended attempt and its exit log stay for staff to see.

**Owner: the best attempt counts.** Wherever a student's quiz score is used (their score
display, season record, workbook/exports, dashboards, grading lists), it is the highest
`totalScore` among their GRADED attempts. An attempt still waiting for marking doesn't count
until graded. *(My call: if no attempt is graded yet, the quiz shows as awaiting marking.)*

## Marking (leaders)

- **Owner: anything a leader can do, the season's admin (and a super) can do too** — marking,
  the live screen, reopen, the exit log. `canGradeQuiz` already admits SUPER, the season's admin
  and leaders; keep it as the one gate for all of these. "Leader" below means any of them.
- For each submitted attempt with leader-marked questions, the
  grading screen shows **each blank as the student's answer next to the expected answer**,
  with right/wrong per blank; essays show the text with right/wrong.
- Once every leader-marked item is marked, the attempt is GRADED.
- The grading screen shows the attempt's **exit log** (time, duration, and whether the third
  exit ended it), and how it ended: submitted, timed out, or ended by exits.

## What students see (owner, replaces `docs/rules/quiz-results.md`)

Two stages, not one release:

1. **After submitting, until marked:** "Submitted", nothing else. **No question text, no
   options, no own answers** — the result screen no longer lists the questions (closes the
   "finish at 6:10, photograph for 6:25" leak).
2. **Once the attempt is GRADED** (on submit for an all-auto quiz; when a leader/admin finishes
   marking otherwise): the student sees **their score only**. No release is needed for the
   score. Still no questions or answers.
3. **When the admin releases the answers** (season admin or super, one way, per quiz — today's
   `POST /quizzes/:id/release` and `resultsReleasedAt/ById`, repurposed as "answers released"):
   the student can review every question with their answers marked **right or wrong per item**
   (each option, tick, pair, blank), **and the correct answer shown** *(my reading of "see what
   was correct and what was wrong" — owner to check)*. Leaders can't release answers.

This changes today's rule, where the score is also held until release: `lib/quiz-results.ts`
(`studentAttemptStatus`) and every student read it covers (quiz list, detail, submit response,
past-season record) move to these stages; `docs/rules/quiz-results.md` is rewritten to match.
Grade notifications: "Your score is in" when an attempt is graded; "Answers are out" to
everyone graded when answers are released. *(My call.)* A paper grade shows to the student once
entered (it has no answers to hold).

## Live screen (staff)

While a quiz is running, staff with `canGradeQuiz` can open a live view listing every student
in scope with: not started / in progress (time left, number of exits) / submitted / timed out /
ended by exits, with exits appearing as they happen. Reopen is available from it. Refresh by
polling is fine (every few seconds while the screen is open). *My call: polling.* It lists the
students the viewer may grade (`visibleStudentIdsForQuiz`).

**End attempt** (*my call*): staff can end a student's open attempt from the live screen; it
submits with what's saved and records "ended by staff". Without it, a student who starts an
untimed quiz by mistake is locked in the app (relaunch opens the quiz, submit needs every
question answered, and reopen refuses an open attempt) with no way out. The relaunch lock
applies to timed and untimed quizzes alike.

## Editing timing after attempts exist (*my call*)

The start window may be changed at any time (e.g. extended for latecomers). The time limit
freezes once any attempt exists, like the questions. Paper quiz scores (`QuizGrade.score`) stay
whole numbers.

## UI: the existing design system, nothing new (owner)

Every new screen and control matches the current kit; no new visual language, palette or
fonts beyond an Arabic-capable fallback.

- Build from `apps/mobile/src/design/` (Screen, route states, SaveBar, form parts, SectionCard /
  cards, pills, PageTitle) and NativeWind over `src/design/theme/tokens.json`: semantic tokens,
  status tones (`bad` for errors and the exit warning), named radii (`rounded-group` etc.),
  flat cards. No raw hex, no new tokens unless added to `tokens.json` and regenerated.
- Motion follows `docs/rules/motion.md` and `src/design/motion/` (fast/base/slow durations, no
  springs, `useReducedMotion`, exits faster than entrances, `haptic()` for selection feedback).
  The countdown ticks without animation.
- Layout rules from `apps/mobile/CLAUDE.md` apply (keyboard insets, tab-bar, 4.5:1 contrast,
  font scale 1.3, 360dp phones). The quiz runner hides the tab bar while an attempt is open.
- **Matching is tap-to-pair, not drag**: tap a left item, then a right one; paired items show a
  shared marker and can be tapped to unpair. Dragging may be added but never as the only way
  (accessibility: single-pointer alternative to drag, WCAG 2.2).
- "Choose N": checkboxes with a visible "Choose N · k selected" line; extra ticks are disabled,
  not rejected after the fact.
- Fill in the blank: the sentence wraps with inline input boxes at the gaps, direction from the
  text; on small phones a gap may fall back to a field under the sentence labelled "Blank 1".
- Touch targets ≥ 44pt on every option, pair and blank.
- Every new screen gets the `ui-sweep` skill before it's called done (360×640 and 375dp, font
  1.0/1.3, light/dark, 3-button and gesture nav), including Arabic-content states.

## Existing data

The app is unpublished; existing quizzes are test data but must not break. Existing MCQ
questions become single choice (options become option rows, `correctIndex` the correct one);
essays stay essays, their existing points-based marks kept as they are. Existing integer
scores convert to decimals. A read-only check script ships first per the migration standards
(`apps/backend/scripts/refactor-checks/`). Migrations follow the root `CLAUDE.md` rules
(additive first, contract migration after the code stops using old columns).

## Rules file

On approval this becomes an owner ruling, `docs/rules/quiz-integrity.md` (types, marking,
shuffling, timing, exits), added to the rule table in the root `CLAUDE.md`. `docs/rules/quiz-results.md` is rewritten
for the two stages above.

## Builder's calls (left to the plan)

- The storage shape (tables for options / matching pairs / blanks vs JSON), as long as every
  option, item and blank has a stable id and answer keys never reach a student read.
- How the shuffle is stored (a seed or an explicit order per attempt).
- How expired attempts get closed server-side.
- How the phone reports exits and how the server dedupes them.
- How room is left for images on questions later.
- The authoring UI for each type, within the design kit and `docs/rules/motion.md`.
- API shape, split into the existing `routes/quizzes/*` and `lib/quizzes/*` layers.
