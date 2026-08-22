# Domain 12 — Quizzes

> Status: draft · Phase: 4 (Engagement) · v1 API status: **none** — no `/api/v1/quizzes*` route exists in v1 (`src/app/api/v1/` holds only `auth`, `me`, `seasons`, `groups`, `sessions`, `assignments`, `submissions`), and no counterpart exists in `apps/backend/src/routes/`.

A quiz belongs to a season and (in practice always) to a session. It comes in
two kinds that share one `Quiz` row and almost nothing else:

- **`PAPER`** — no questions in the system at all. A leader or admin types a
  score and a note per student into a grid; the result is a `QuizGrade` row.
  `maxScore` is set by the author at creation.
- **`ONLINE`** — the author builds `QuizQuestion` rows (MCQ or ESSAY),
  publishes, and students run an attempt (`QuizAttempt` + `QuizAnswer`). MCQ is
  auto-scored on submit; ESSAY is marked by hand afterwards. `maxScore` is
  derived as the sum of question points and is **not** author-settable.

`QuizGrade` and `QuizAttempt` are parallel, non-interacting scoring systems
hanging off the same parent. Nothing reconciles them (R86, R104, R105).

**Boundary with domain 13 (Video quizzes) — decided here.** Video quizzes are
a **completely separate model tree**, not a variant of this one. They use
`SessionVideoQuestion` / `SessionVideoQuestionResponse` / `SessionVideoProgress`
(`prisma/schema.prisma:392-420`), hang off `Session` rather than `Quiz`, have
their own `correctIndex`/`points`/`atSeconds` fields, and are served by
`src/lib/video-quiz-actions.ts` / `video-quiz-query.ts` / `video-time.ts`. There
is **no shared model, no shared enum, no shared helper and no shared page**
between the two domains — the only overlap is the English word "quiz" and the
shape of the idea (prompt + options + correctIndex + points). Consequences:

- Domain 13 can reuse **none** of this domain's Prisma work and **none** of its
  endpoints. It should reuse the *contract shape* of `quizQuestionAuthoringSchema`
  vs `quizQuestionStudentSchema` (§8) — the two-schema split that keeps the
  answer key off the student payload is the one design decision worth copying
  verbatim, and video quizzes have the same exposure with a stricter constraint
  (their `correctIndex` is `Int`, non-nullable — `schema.prisma:399`).
- `QUIZ_GRADED` (`NotificationType`) is *this* domain's notification and is not
  used by video quizzes; the `NotificationPreference.quizGraded` flag
  (`schema.prisma:619`) gates it.
- The two do collide in one place only: `src/app/admin/season/[code]/sessions/[id]/page.tsx`
  renders a "Quizzes" card (this domain, `:62`, `:140-197`) and a "Video
  questions" card (domain 13, `:63`, `:200-213`) on the same page. §9 splits them.

Boundary with **domain 3 (Sessions)**: `Quiz.sessionId` is this domain's field
but session lifecycle is domain 3's. Deleting a session nulls it (R9, R102).
Boundary with **domain 17 (Reports)**: the season export's Grades tab reads
`QuizGrade` directly (R105); flagged here, specced there.

## 1. v1 source

| File | Holds |
|---|---|
| `src/lib/quiz-actions.ts:1-590` | All twelve writes, three Zod schemas, and two private helpers (`recomputeQuizMaxScore:74-83`, `assertStudentCanAccessQuiz:320-327`). |
| `src/lib/quiz-query.ts:1-559` | Seven reads and ten exported interfaces. Contains the answer-key split (`:373-374` comment, `:389-399` vs `:474-485`). |
| `src/lib/auth/permissions.ts:135-146` | `canManageQuiz` — SUPER or season admin of the quiz's season. The authoring gate. |
| `src/lib/auth/permissions.ts:150-160` | `canGradeQuiz` — delegates entirely to `isLeaderInSeason`. The grading gate. |
| `src/lib/auth/permissions.ts:41-43` | `canEditSeason` = `isAdminOfSeason`. The quiz-creation gate. |
| `src/lib/auth/permissions.ts:45-71` | `canAccessSeason` — the student's read gate (enrollment or active season). |
| `src/lib/rbac.ts:36-51` | `isLeaderInSeason` — SUPER, **or `seasonAdminIds` contains the season**, or a led group is in the season. |
| `src/lib/rbac.ts:28-30` | `isAdminOfSeason` — SUPER short-circuits. |
| `src/lib/notifications.ts:23, 35-53` | `QUIZ_GRADED` → `quizGraded` preference; row insert plus best-effort email. |
| `prisma/schema.prisma:83-97` | `QuizKind`, `QuizQuestionType`, `QuizAttemptStatus`. |
| `prisma/schema.prisma:644-667` | `Quiz`. |
| `prisma/schema.prisma:669-685` | `QuizGrade`. |
| `prisma/schema.prisma:689-705` | `QuizQuestion`. |
| `prisma/schema.prisma:709-732` | `QuizAttempt`. |
| `prisma/schema.prisma:734-749` | `QuizAnswer`. |
| `src/components/quizzes/create-quiz-form.tsx:1-150` | The only caller of `createQuizAction`. Holds the PAPER/ONLINE toggle and the post-create redirect. |
| `src/components/quizzes/quiz-builder.tsx:1-369` | Question authoring + publish toggle. Renders the correct answer to the author (`:120-124`). |
| `src/components/quizzes/quiz-runner.tsx:1-266` | The student surface: three states (`:25-27`) — NotStarted / InProgress / Result. Holds the fire-and-forget autosave (`:79`, `:86-91`). |
| `src/components/quizzes/quiz-grade-form.tsx:1-116` | PAPER grade grid. Holds the **only** score-vs-`maxScore` clamp (`:28`). |
| `src/components/quizzes/quiz-essay-grader.tsx:1-180` | ONLINE grading surface. Shows the correct option to the grader (`:128-133`) and the reopen control (`:171-176`). |
| `src/app/student/quizzes/page.tsx:1-156` | Student results list + average-score hero. |
| `src/app/student/quizzes/[quizId]/page.tsx:1-45` | Student take/review route. |
| `src/app/leader/quizzes/page.tsx:1-101` | Leader quiz list. Season derived from `groups[0]` (R99). |
| `src/app/leader/sessions/[id]/quiz/[quizId]/page.tsx:1-77` | Leader grading route; branches PAPER vs ONLINE (`:54-66`). |
| `src/app/leader/sessions/[id]/page.tsx:61, 77-105` | Session detail quiz card (leader). |
| `src/app/admin/quizzes/page.tsx:1-116` | Admin quiz list. Season auto-selected (R100). |
| `src/app/admin/season/[code]/quizzes/[quizId]/edit/page.tsx:1-54` | Question builder route. ONLINE only (`:30-32`). |
| `src/app/admin/season/[code]/quizzes/[quizId]/grade/page.tsx:1-83` | Admin grading route; same PAPER/ONLINE branch (`:60-72`). |
| `src/app/admin/season/[code]/sessions/[id]/page.tsx:62, 140-197` | Session detail quiz card (admin) — the only place a quiz can be created. |
| `src/app/admin/dashboard/page.tsx:66-69, 111-115, 326-352` | Quiz "pending" roll-up (cross-domain consumer). |
| `src/app/leader/dashboard/page.tsx:77-86, 126-130, 336-360` | Same, group-scoped. |
| `src/lib/season-export.ts:79-88, 130-148` | Grades worksheet (domain 17 consumer). |
| `src/lib/navigation.ts:66, 85, 103, 112` | `/admin/quizzes`, `/leader/quizzes`, `/student/quizzes` nav entries. |

v1 has **no test files anywhere**; the source above is the only statement of
intent. There is no `prisma/seed.ts` coverage for any quiz model either
(`grep -n -i quiz prisma/seed.ts` returns nothing), so every quiz row in the
shared staging database was created through the UI.

## 2. Data model

### `Quiz` (`prisma/schema.prisma:644-667`)

| Field | Meaning |
|---|---|
| `seasonId` → `Season` | Required. `onDelete: Cascade` (`:647`). Seasons are soft-deleted (`deletedAt`), so the cascade effectively never fires. |
| `sessionId` `Int?` → `Session?` | `onDelete: SetNull` (`:649`). **Nullable in the schema, required in code**: `createQuizSchema` demands a positive int (`quiz-actions.ts:21`), so a quiz is only ever created attached. It becomes null later, when its session is deleted — and that orphans it from the leader UI (R102). |
| `title` | 1–200 chars (`quiz-actions.ts:23`). No uniqueness of any kind. |
| `kind` `QuizKind @default(PAPER)` | Set at creation and **never changed** — no action writes `kind` after `create` (`quiz-actions.ts:51-61` is the only writer). |
| `maxScore` `Int @default(100)` | Two entirely different meanings by kind. PAPER: author-set, 1–1000, immutable thereafter (nothing updates it). ONLINE: forced to `0` at creation (`:57`) and recomputed as `SUM(question.points)` on every question write (`:74-83`). |
| `publishedAt` `DateTime?` | ONLINE availability flag. `null` = draft. Stored as a timestamp; **read only as a boolean** everywhere (`quiz-query.ts:279, 402`; `quiz-builder.tsx:35`). Re-publishing overwrites it (R31). Meaningless for PAPER — never set, never read for PAPER. |
| `createdById` `Int?` → `User?` | `onDelete: SetNull` (`:657`). **Written but never read.** Only writer is `quiz-actions.ts:58`; no query in v1 selects it. |
| `@@index([seasonId])`, `@@index([sessionId])` | Support the list reads. |

No `updatedById`, no `deletedAt` — **quizzes are hard-deleted** (R10), unlike
`Season`/`Assignment`/`Submission`. This contradicts the repo's own soft-delete
convention (`CLAUDE.md`, "Soft delete applies to User, Season, StudentProfile,
Assignment") only in the sense that `Quiz` is not on that list; there is no
defect, but it means a delete is unrecoverable and takes every grade and
attempt with it (R10).

### `QuizGrade` (`prisma/schema.prisma:669-685`) — the PAPER track

| Field | Meaning |
|---|---|
| `quizId` → `Quiz` | `onDelete: Cascade` (`:672`). |
| `studentUserId` → `User` | `onDelete: Restrict` (`:674`) — a student with a quiz grade cannot be hard-deleted. |
| `score` `Int?` | Nullable in the schema; **never written as null** — the action `continue`s past null entries (`quiz-actions.ts:135`), so a row exists only once a real score has been entered. Every read still handles null (`quiz-query.ts:249`, `season-export.ts:143`). |
| `notes` `String?` | ≤1000 chars (`quiz-actions.ts:101`). Plain text — rendered as text, not HTML (`student/quizzes/page.tsx:119-123`). Unlike `Submission.feedback`, no rich text is involved anywhere in this domain. |
| `gradedById` `Int?` → `User?` | `onDelete: SetNull` (`:678`). **Written but never read** — only writer is `quiz-actions.ts:146, 152`. |
| `gradedAt` `DateTime?` | Written on every grade write (`:147, 153`) and read as the "was already graded" flag that suppresses a duplicate notification (`:137`). |
| `@@unique([quizId, studentUserId])` (`:683`) | One grade per student per quiz. Load-bearing for the upsert (R82). |

There is **no `QuizGrade.kind` guard**: nothing stops a `QuizGrade` being
written against an `ONLINE` quiz (R86).

### `QuizQuestion` (`prisma/schema.prisma:689-705`) — ONLINE authoring

| Field | Meaning |
|---|---|
| `quizId` → `Quiz` | `onDelete: Cascade` (`:692`). |
| `order` `Int` | Assigned as the current question count at insert (`quiz-actions.ts:228-230`). Never rewritten — **there is no reorder action in v1** (R20) and delete leaves gaps (R21). |
| `type` `QuizQuestionType` | `MCQ` or `ESSAY` (`:88-91`). No other type exists — no true/false, no short-answer, no multi-select, no numeric. |
| `prompt` `String` | Trimmed, 2–2000 chars (`quiz-actions.ts:191`). Plain text. |
| `points` `Int @default(1)` | 1–100 (`:192`). Feeds `maxScore` (R11). |
| `options` `String[]` | Postgres text array. 0–6 entries, each trimmed 1–500 chars (`:193`). Forced to `[]` for ESSAY (`:213`). |
| `correctIndex` `Int?` | **A positional index into `options`, not a reference to an option.** Nullable in the schema; guaranteed non-null and in-range for MCQ by the Zod refine (`:200-205`) and forced null for ESSAY (`:214`). Editing the options array silently re-points it (R24). |
| `@@index([quizId, order])` (`:704`) | Supports the three `orderBy: { order: "asc" }` reads. |

### `QuizAttempt` (`prisma/schema.prisma:709-732`) — ONLINE runs

| Field | Meaning |
|---|---|
| `quizId` / `studentUserId` | Cascade / Restrict respectively (`:712, :714`). |
| `attemptNumber` `Int @default(1)` | 1 for a first attempt (`quiz-actions.ts:356`); `latest + 1` for a reopen (`:583`). The only ordering key for "which attempt is current" (`:347, :406, :288, :495`). |
| `status` `QuizAttemptStatus @default(IN_PROGRESS)` | `IN_PROGRESS` → `SUBMITTED` → `GRADED`, or `IN_PROGRESS` → `GRADED` directly. See the transition table in §3. |
| `autoScore` `Int?` | MCQ total, written once at submit (`:465, :469`). Never recomputed. |
| `manualScore` `Int?` | ESSAY total. `0` on the no-essay path (`:470`); recomputed from scratch on every manual grade (`:522, :540`). |
| `totalScore` `Int?` | `autoScore + manualScore` (`:471, :541`). The only score the student is ever shown (`quiz-query.ts:317`; `quiz-runner.tsx:219`). |
| `submittedAt` `DateTime?` | Set at submit (`:465, :468`). Never cleared. |
| `gradedById` `Int?` → `User?` | `onDelete: SetNull` (`:722`). Written **only** on the manual path (`:543`) — an auto-graded attempt has `gradedAt` set but `gradedById` null (R61). Never read by any query. |
| `gradedAt` `DateTime?` | Set on both grading paths (`:472, :544`). Read by the student list (`quiz-query.ts:319`). |
| `@@unique([quizId, studentUserId, attemptNumber])` (`:729`) | The retake key. **Note what it does not enforce:** nothing at the database level prevents two `IN_PROGRESS` attempts for the same student — only the application's `latest.status` check does (R43, R44, and R119 for the race). |
| `@@index([quizId, status])` (`:731`) | Supports the grading read. |

### `QuizAnswer` (`prisma/schema.prisma:734-749`)

| Field | Meaning |
|---|---|
| `attemptId` / `questionId` | Both `onDelete: Cascade` (`:737, :739`). **The question cascade is the dangerous one** — deleting a question erases the answer rows of already-graded attempts without touching their scores (R23). |
| `selectedIndex` `Int?` | The student's MCQ choice. Null for ESSAY. |
| `text` `String?` | The student's ESSAY answer, ≤20,000 chars (`quiz-actions.ts:364`). Plain text, rendered `whitespace-pre-line` (`quiz-runner.tsx:258`; `quiz-essay-grader.tsx:139`). |
| `isCorrect` `Boolean?` | Written only for MCQ, only at submit (`:453, :458`). Stays null for ESSAY forever. |
| `pointsAwarded` `Int?` | MCQ: full points or 0 at submit (`:454`). ESSAY: null until a manual grade (`:533`). |
| `@@unique([attemptId, questionId])` (`:747`) | One answer per question per attempt. Load-bearing for the upsert (R51) and for the `update` in both grading transactions (`:457, :531`). |

### Enums

`QuizKind` = `PAPER`, `ONLINE` (`:83-86`). `QuizQuestionType` = `MCQ`, `ESSAY`
(`:88-91`). `QuizAttemptStatus` = `IN_PROGRESS`, `SUBMITTED`, `GRADED`
(`:93-97`) — declaration order is also Postgres's sort order, though no query
sorts by it. **There is no `ABANDONED`, `EXPIRED` or `VOID` status** (R46).

### Relations traversed but owned elsewhere

`Season.code` / `Season.status` / `Season.startDate`, `Session.title` /
`Session.startsAt`, `GroupStudent.studentUserId` / `Group.seasonId`,
`SeasonEnrollment.status`, `StudentProfile.activeSeasonId`, `User.name` /
`User.deletedAt`, `NotificationType.QUIZ_GRADED`,
`NotificationPreference.quizGraded`.

### Fields written but never read

`Quiz.createdById`, `QuizGrade.gradedById`, `QuizAttempt.gradedById`. All three
are audit trails the UI could surface and does not. `QuizAttempt.manualScore`
and `autoScore` are read only by the grader surface, never by the student.

## 3. Business rules

Statuses and citations below are file-relative: `quiz-actions.ts` and
`quiz-query.ts` are both under `src/lib/`.

### Quiz creation, identity and lifetime

- **R1.** Creating a quiz requires role `ADMIN` or `SUPER` **and**
  `canEditSeason(seasonId)` (= `isAdminOfSeason`, which SUPER short-circuits) —
  `src/lib/quiz-actions.ts:37-38`, `src/lib/rbac.ts:28-30`.
- **R2.** `createQuizSchema` validates: `sessionId` positive int, `seasonId`
  positive int, `title` 1–200 chars, `kind` ∈ {`PAPER`,`ONLINE`}, `maxScore`
  optional int 1–1000 — `src/lib/quiz-actions.ts:20-27`.
- **R3.** A `PAPER` quiz must carry a `maxScore`; the check runs *after* Zod
  because the field is optional in the schema —
  `src/lib/quiz-actions.ts:42-44`.
- **R4.** An `ONLINE` quiz is created with `maxScore: 0` regardless of what the
  caller sent; the value is thereafter derived (R11) —
  `src/lib/quiz-actions.ts:57`.
- **R5.** `createdById` is stamped with the caller —
  `src/lib/quiz-actions.ts:58`. Nothing ever reads it (§2).
- **R6.** `sessionId` is **required by the action** even though
  `Quiz.sessionId` is nullable — `src/lib/quiz-actions.ts:21` vs
  `prisma/schema.prisma:648`. A season-level quiz with no session cannot be
  created through v1; one can only *become* session-less later (R9).
- **R7.** **Nothing verifies that `sessionId` belongs to `seasonId`.** The
  create takes both ids from the caller and writes them side by side —
  `src/lib/quiz-actions.ts:51-61`. In v1 the only caller passes both from the
  same page (`create-quiz-form.tsx:46-52`, fed by
  `admin/season/[code]/sessions/[id]/page.tsx:144-148`), so the pair is always
  consistent. *(implicit — the consistency lives in one component's props)*
- **R8.** The season lookup that drives revalidation is best-effort: a missing
  season skips two `revalidatePath` calls but the quiz is still created —
  `src/lib/quiz-actions.ts:46-66`.
- **R9.** **A quiz has no open window, no close window, no time limit and no
  attempt deadline.** `Quiz` carries only `publishedAt`
  (`prisma/schema.prisma:644-667`); no field in any of the five models stores a
  duration, a start time or an expiry. Nothing in this domain is
  timezone-sensitive — the only timestamps are event stamps
  (`submittedAt`, `gradedAt`, `publishedAt`) that are only ever formatted for
  display, never compared against a wall-clock boundary.
- **R10.** `deleteQuizAction` **hard-deletes** the quiz, cascading to every
  `QuizGrade`, `QuizQuestion`, `QuizAttempt` and (transitively) `QuizAnswer` —
  `src/lib/quiz-actions.ts:93`, `prisma/schema.prisma:672, 692, 712, 737`. It
  is gated on `ADMIN|SUPER` + `canEditSeason` (`:87, :91`) and **has no caller
  anywhere in v1** (`grep -rn deleteQuizAction src/` matches only its own
  definition) — no UI renders a delete control. *(implicit — the safety is that
  the button does not exist)*

### `maxScore` derivation (ONLINE)

- **R11.** `recomputeQuizMaxScore` sets `maxScore` to the sum of the quiz's
  question `points`, or `0` when there are none —
  `src/lib/quiz-actions.ts:74-83`.
- **R12.** It runs after every add, update and delete of a question —
  `src/lib/quiz-actions.ts:232, 257, 275`. Nothing else calls it; publish does
  not, and a PAPER quiz's `maxScore` is never recomputed.
- **R13.** The recompute is **unconditional on quiz state**: it fires on a
  published quiz with graded attempts, retroactively changing the denominator
  of every past `totalScore` without recomputing any of them —
  `src/lib/quiz-actions.ts:79-82`. The student's own results page then renders
  a percentage against the new denominator (`student/quizzes/page.tsx:17`).
  *(implicit — nothing forbids it; the only guard is that admins rarely edit a
  live quiz)*
- **R14.** The recompute is a separate `update` outside any transaction with the
  question write that triggered it — `src/lib/quiz-actions.ts:229-232, 253-257,
  274-275`. A failure between the two leaves `maxScore` stale.

### Question authoring (ONLINE)

- **R15.** All three question writes are gated on `canManageQuiz` — SUPER, or
  an admin of the quiz's season — and **throw `ForbiddenError`** rather than
  returning an error string — `src/lib/quiz-actions.ts:223, 248, 272`,
  `src/lib/auth/permissions.ts:135-146`. A LEADER can never author.
- **R16.** `questionSchema` validates: `type` ∈ {`MCQ`,`ESSAY`}, `prompt`
  trimmed 2–2000 chars, `points` int 1–100, `options` an array of ≤6 trimmed
  strings each 1–500 chars, `correctIndex` a non-negative int or null —
  `src/lib/quiz-actions.ts:188-195`.
- **R17.** An MCQ must have **at least 2 options** — refine at
  `src/lib/quiz-actions.ts:196-199`. The 6-option ceiling comes from the array
  `.max(6)` (`:193`) and is mirrored in the client (`quiz-builder.tsx:210, 342`)
  and in the answer schema's `.max(5)` index bound (`:363`).
- **R18.** An MCQ must have a non-null `correctIndex` strictly less than
  `options.length` — refine at `src/lib/quiz-actions.ts:200-205`.
- **R19.** An ESSAY question is normalised to `options: []` and
  `correctIndex: null` regardless of what was sent —
  `src/lib/quiz-actions.ts:207-216`.
- **R20.** `order` is set to the current question count at insert time and is
  **never rewritten**. There is no reorder action, no drag handle, and no
  `order` field on the update path — `src/lib/quiz-actions.ts:228-231` (insert)
  vs `:253-256` (update writes only `normalizeQuestion`'s five fields).
- **R21.** Deleting a question does not renumber the survivors, so `order`
  becomes sparse (0, 1, 3, …) — `src/lib/quiz-actions.ts:274`. Harmless for
  display (every read sorts, never indexes) but it means `order` is not a
  position and cannot be used as one. *(implicit)*
- **R22.** **Questions may be added, edited and deleted on a published quiz,
  and while attempts are in progress or already graded.** No question write
  checks `publishedAt` or looks at `QuizAttempt` at all —
  `src/lib/quiz-actions.ts:218-279`. *(implicit — the builder page is only
  reachable for ONLINE quizzes (`edit/page.tsx:30-32`) but imposes no state
  condition)*
- **R23.** Deleting a question cascade-deletes every `QuizAnswer` that
  references it (`prisma/schema.prisma:739`) across every attempt, including
  `GRADED` ones, **without recomputing `autoScore`, `manualScore` or
  `totalScore`** — `src/lib/quiz-actions.ts:274-275` recomputes only the quiz's
  `maxScore`. The stored score then includes points for a question that no
  longer exists. *(implicit — the destruction is the database's, not the
  code's)*
- **R24.** The correct answer is stored positionally: `correctIndex` is an index
  into `options`, not an identifier — `src/lib/quiz-actions.ts:213-214`,
  `prisma/schema.prisma:697-698`. Reordering or deleting an option in the
  builder silently re-points the answer key; the client compensates only for
  removals it performs itself (`quiz-builder.tsx:216`). Existing `QuizAnswer`
  rows store `selectedIndex` positionally too, so an edit retroactively changes
  what a past student "chose".
- **R25.** Nothing scopes question writes to `ONLINE` quizzes —
  `addQuizQuestionAction` never reads `quiz.kind`
  (`src/lib/quiz-actions.ts:218-236`). Questions can be attached to a PAPER
  quiz through the action; they would be invisible everywhere except
  `listQuizzesForSession`'s `questionCount`. *(implicit — the builder route
  redirects away for PAPER, `edit/page.tsx:30-32`)*
- **R26.** The builder client blocks an empty option and points < 1 before
  calling, with its own messages — `quiz-builder.tsx:222-234`. Both are also
  enforced server-side (R16), so this is genuine defence in depth, not an
  implicit rule.

### Publishing

- **R27.** `publishQuizAction` is gated on `canManageQuiz` and throws
  `ForbiddenError` — `src/lib/quiz-actions.ts:286`.
- **R28.** Publishing requires at least one question —
  `src/lib/quiz-actions.ts:293-295`.
- **R29.** Publishing requires every MCQ to have a non-null `correctIndex`
  within range — `src/lib/quiz-actions.ts:296-303`. This re-checks R18 because
  R18's guarantee can be broken later by an option edit (R24).
- **R30.** **Unpublishing runs no validation and ignores existing attempts.**
  `publish: false` writes `publishedAt: null` unconditionally, whatever state
  students' attempts are in — `src/lib/quiz-actions.ts:288, 306-309`.
- **R31.** `publishedAt` is written as `new Date()` each time and read as a
  boolean everywhere; re-publishing an already-published quiz silently moves
  the timestamp — `src/lib/quiz-actions.ts:308` vs `quiz-query.ts:279, 402`,
  `quiz-builder.tsx:35`.

### Student visibility — the answer key

- **R32.** `loadQuizForStudent` returns `null` unless the quiz is `ONLINE`
  **and** `publishedAt` is non-null — `src/lib/quiz-query.ts:402`. The student
  detail page turns that into a 404 (`student/quizzes/[quizId]/page.tsx:23`).
- **R33.** **The correct answer never reaches the student.**
  `loadQuizForStudent` selects only `id`, `order`, `type`, `prompt`, `points`
  and `options` from `QuizQuestion` — `correctIndex` is deliberately absent
  from the `select` — `src/lib/quiz-query.ts:389-399`, with the intent stated
  in the comment at `:373-374` ("Never selects correctIndex — grading happens
  server-side"). The grader read selects it (`:483`) and the builder read
  selects it (`:354`); both are separate functions behind separate gates. This
  is the one place in the domain where v1 got the API-shaped thing right, and
  it is right **by explicit intent, not by accident of rendering** — but it is
  still enforced by a `select` list, so it survives a port only if the port
  keeps the three reads separate. *(implicit — the protection is a `select`
  clause; see §10 D2)*
- **R34.** The student *does* receive their own graded outcome per question:
  `isCorrect` and `pointsAwarded` — `src/lib/quiz-query.ts:451-454`. Both are
  null until submit (R52), so nothing leaks mid-attempt. After an auto-graded
  submit the student learns exactly which MCQs were wrong (`quiz-runner.tsx:236-250`)
  without learning what was right.
- **R35.** The student detail route requires role `STUDENT`, then 404s if the
  quiz read returned null, then 404s unless `canAccessSeason(quiz.seasonId)` —
  `src/app/student/quizzes/[quizId]/page.tsx:19-24`. Note the ordering: the
  quiz is loaded before the season check, so an unauthorized student and a
  nonexistent quiz are indistinguishable from the response. *(implicit — the
  indistinguishability is accidental but correct)*
- **R36.** In the student results list, a `PAPER` quiz appears **only if a
  `QuizGrade` row exists for that student**: the read starts from `QuizGrade`,
  filtered to `quiz.kind === "PAPER"` — `src/lib/quiz-query.ts:261-277`.
  Combined with R81 (null scores never create a row), a PAPER quiz is invisible
  to a student until it is graded, and the list's "Pending" badge for PAPER
  (`student/quizzes/page.tsx:33`) is unreachable. *(implicit)*
- **R37.** An `ONLINE` quiz appears in the student list as soon as it is
  published, attempted or not — the read starts from `Quiz` with
  `kind: "ONLINE", publishedAt: { not: null }` and left-joins the student's
  latest attempt — `src/lib/quiz-query.ts:278-293`. `score` is surfaced only
  when that attempt's status is `GRADED` (`:317`).
- **R38.** The two lists are concatenated and sorted by `sessionDate`
  descending, with a null session date treated as epoch 0 and therefore sunk to
  the bottom — `src/lib/quiz-query.ts:326-328`.
- **R39.** The student list's season comes from a fresh
  `StudentProfile.activeSeasonId` read, **not** from the token's
  `activeSeasonId` — `src/app/student/quizzes/page.tsx:40-44`. A student with
  no active season sees an empty list rather than an error (`:46-48`).
- **R40.** **Unpublishing hides already-submitted results from the student
  entirely.** R32 makes the detail route 404 and R37's `publishedAt` filter
  removes the row from the list, so a graded attempt becomes unreachable with
  no trace. *(implicit — the consequence of two independent `where` clauses)*

### Attempt lifecycle

Statuses: `IN_PROGRESS`, `SUBMITTED`, `GRADED` (`prisma/schema.prisma:93-97`).

| From ⟍ To | (new row) | IN_PROGRESS | SUBMITTED | GRADED |
|---|---|---|---|---|
| *(no attempt)* | student, `startQuizAttemptAction` → attemptNumber 1 (R45) | — | — | — |
| **IN_PROGRESS** | blocked — start returns the existing attempt (R43) | student, save answers (R48); no timeout, no expiry (R46) | student, submit, when the quiz has ≥1 ESSAY (R60) | student, submit, when the quiz is all-MCQ (R61) |
| **SUBMITTED** | admin, `reopenQuizAttemptAction` → attemptNumber+1 (R71) — **allowed by the action, hidden by the UI** (R73) | no code path | no code path | grader, `gradeEssayAnswersAction` (R67, R72) |
| **GRADED** | admin, `reopenQuizAttemptAction` → attemptNumber+1 (R71) | no code path | no code path | grader, re-grade (R67); re-notifies (R74) |

No transition ever moves an attempt backwards, and no code path deletes an
attempt (`grep db.quizAttempt.delete src/` returns nothing).

- **R41.** Starting an attempt requires role `STUDENT` —
  `src/lib/quiz-actions.ts:333`.
- **R42.** The quiz must exist, be `ONLINE`, and be published —
  `src/lib/quiz-actions.ts:335-342`.
- **R43.** `assertStudentCanAccessQuiz` re-fetches the session user, asserts
  role `STUDENT`, and requires `canAccessSeason(quiz.seasonId)` —
  `src/lib/quiz-actions.ts:320-327, 343`. Its `user.userId !== userId`
  comparison is **vacuous**: the only caller passes `user.userId` back in
  (`:343`), so the identity half of the check can never fail.
- **R44.** If the student's latest attempt is `IN_PROGRESS`, start returns that
  attempt's id — attempts are **resumable**, and starting again is idempotent —
  `src/lib/quiz-actions.ts:345-350`.
- **R45.** If a latest attempt exists in any other status, start fails with
  "You've already submitted this quiz. Ask an admin to reopen it." —
  `src/lib/quiz-actions.ts:351-353`. **One attempt per student per quiz unless
  an admin intervenes.**
- **R46.** A first attempt is always `attemptNumber: 1`, with `status` taking
  the schema default `IN_PROGRESS` — `src/lib/quiz-actions.ts:355-358`,
  `prisma/schema.prisma:716`.
- **R47.** **There is no abandonment handling.** No timeout, no expiry, no
  sweeper, and no status to represent it (`prisma/schema.prisma:93-97`). An
  `IN_PROGRESS` attempt persists indefinitely and permanently blocks that
  student from ever starting again (R45) and from appearing in the grading list
  (R93). The only exit is submitting it.
- **R48.** The attempt row is created by an explicit button press, never during
  a page render — `quiz-runner.tsx:35-45` calls the action from
  `startTransition` inside an `onClick`. **Contrast domain 8's
  `ensureDraftSubmission`, which writes during a GET.** This domain has no
  read-time write anywhere: every one of the twelve actions is invoked from a
  client event handler, and no page component calls an action. Verified by
  reading all seven quiz pages in §1 — none imports `quiz-actions`. This is a
  property to *preserve*, and it means the React Query refetch hazard that
  §10 D15 of `08-submissions.md` describes does not apply here.
- **R49.** Saving an answer requires the attempt to exist, to be owned by the
  caller (`ForbiddenError` otherwise), and to be `IN_PROGRESS` —
  `src/lib/quiz-actions.ts:374-380`. There is **no role check**: identity, not
  role, is the gate.
- **R50.** The question must belong to the same quiz as the attempt —
  `src/lib/quiz-actions.ts:382-388`. This is the only cross-entity consistency
  check in the whole file.
- **R51.** `answerValueSchema` allows `selectedIndex` as an int 0–5 or null and
  `text` as a string ≤20,000 chars or null —
  `src/lib/quiz-actions.ts:362-365`. The `0–5` bound mirrors the 6-option cap
  but is **not checked against the question's actual option count**, so an
  out-of-range index is storable; it simply scores 0 at submit (R58) and
  renders as `undefined` in the review (`quiz-runner.tsx:255`). *(implicit)*
- **R52.** Nothing validates `selectedIndex` against `type`: an ESSAY question
  accepts a `selectedIndex` and an MCQ accepts free `text` —
  `src/lib/quiz-actions.ts:390-405`. The client always sends the right shape
  (`quiz-runner.tsx:79, 87-90`). *(implicit)*
- **R53.** The answer is an upsert keyed on `(attemptId, questionId)`, so
  saving is idempotent and there is exactly one answer row per question per
  attempt — `src/lib/quiz-actions.ts:393-405`,
  `prisma/schema.prisma:747`.
- **R54.** Saving never grades: `isCorrect` and `pointsAwarded` are untouched by
  the upsert and stay null until submit — `src/lib/quiz-actions.ts:393-405`.
- **R55.** **Answer saves are fire-and-forget on the client.** An MCQ selection
  calls the action with `void` and ignores the result
  (`quiz-runner.tsx:79`); an essay saves on blur, also with `void`
  (`quiz-runner.tsx:86-91`). A failed save is silent and the student sees their
  answer in local state as though it persisted. *(implicit — the resilience is
  R56, not error handling)*
- **R56.** Submit re-saves every answer from client state before calling submit,
  which papers over R55's lost writes for a student who completes in one
  sitting — `quiz-runner.tsx:102-110`. A student who closes the tab keeps only
  what actually persisted.
- **R57.** Question order is `order` ascending in every read
  (`src/lib/quiz-query.ts:346, 390, 475`) and therefore **stable across a
  resumed attempt** — it is a stored column, not a shuffle. **There is no
  randomisation of questions or of options anywhere in v1**; `grep -n
  "shuffle\|random\|sort(() =>" src/lib/quiz-*.ts src/components/quizzes/`
  returns nothing.

### Submission and auto-scoring

- **R58.** Submitting requires the attempt to exist, to be owned by the caller
  (`ForbiddenError` otherwise), and to be `IN_PROGRESS` —
  `src/lib/quiz-actions.ts:414-426`.
- **R59.** **Every question must be answered**: an MCQ needs a non-null
  `selectedIndex`, an ESSAY needs non-blank trimmed text. One unanswered
  question rejects the whole submit —
  `src/lib/quiz-actions.ts:436-444`. The client mirrors this by disabling the
  button (`quiz-runner.tsx:93-96, 178`).
- **R60.** MCQ auto-scoring awards **full points or nothing**: `pointsAwarded =
  selectedIndex === correctIndex ? points : 0`. No partial credit, no negative
  marking, no per-option weighting — `src/lib/quiz-actions.ts:451-455`.
- **R61.** `isCorrect` and `pointsAwarded` are written back onto every MCQ
  answer row inside the transaction — `src/lib/quiz-actions.ts:456-459`.
- **R62.** ESSAY answers get nothing at submit — the loop `continue`s past
  them, leaving `isCorrect` and `pointsAwarded` null —
  `src/lib/quiz-actions.ts:451`.
- **R63.** If the quiz has **any** ESSAY question the attempt becomes
  `SUBMITTED` with `submittedAt` and `autoScore` set and
  `manualScore`/`totalScore` left null — `src/lib/quiz-actions.ts:447, 464-465`.
- **R64.** If the quiz has **no** ESSAY question the attempt goes straight to
  `GRADED` with `manualScore: 0`, `totalScore: autoScore` and `gradedAt: now`,
  but **`gradedById` is left null** — `src/lib/quiz-actions.ts:466-473`.
- **R65.** The auto-graded path notifies the student `QUIZ_GRADED` immediately;
  the essay path notifies nobody — `src/lib/quiz-actions.ts:477-485`. **No
  notification of any kind tells a grader that an attempt is waiting.**
- **R66.** The answer updates and the attempt update share one
  `db.$transaction`; the notification and both `revalidatePath` calls sit
  outside it — `src/lib/quiz-actions.ts:449-489`.

### Manual grading — ONLINE essays

- **R67.** `gradeEssayAnswersAction` is gated on `canGradeQuiz`, which is
  exactly `isLeaderInSeason(quiz.seasonId)` — SUPER, **any** admin whose
  `seasonAdminIds` contains that season, or **any** leader with a group in that
  season — `src/lib/quiz-actions.ts:513`,
  `src/lib/auth/permissions.ts:150-160`, `src/lib/rbac.ts:36-51`.
- **R68.** **The gate is season-wide: nothing checks that the attempt's student
  is in the grader's group.** The action loads the attempt, checks the quiz's
  season, and proceeds — `src/lib/quiz-actions.ts:502-514`. A leader may grade
  any student's attempt in the season, including students in another leader's
  group. *(implicit — the group scope exists only as the `studentUserIds` array
  the page computes for the **read**, `leader/sessions/[id]/quiz/[quizId]/page.tsx:34-39`;
  the write re-derives nothing)*
- **R69.** The attempt must not be `IN_PROGRESS`; a `GRADED` attempt may be
  re-graded — `src/lib/quiz-actions.ts:514`.
- **R70.** Each award is clamped to `[0, question.points]` and rounded —
  `src/lib/quiz-actions.ts:527`. An out-of-range value is silently corrected,
  not rejected.
- **R71.** Awards naming a question that is not an ESSAY question of this quiz
  are silently skipped — `src/lib/quiz-actions.ts:525-526`.
- **R72.** **`manualScore` is recomputed from only the awards present in this
  call.** An essay omitted from the payload contributes 0, so a partial payload
  silently lowers the total — `src/lib/quiz-actions.ts:522, 535, 540`. The
  client always sends every essay question (`quiz-essay-grader.tsx:71-80`).
  *(implicit)*
- **R73.** `totalScore = (autoScore ?? 0) + manualScore` —
  `src/lib/quiz-actions.ts:541`. `autoScore` is trusted as-is and never
  recomputed, so R23's deleted questions and R13's rebased `maxScore` are both
  baked in permanently.
- **R74.** The grade write sets `status: "GRADED"`, `gradedById` and `gradedAt`
  in the same transaction as the answer updates —
  `src/lib/quiz-actions.ts:537-546`.
- **R75.** **Every** successful grade notifies the student `QUIZ_GRADED`,
  including a re-grade of an already-graded attempt —
  `src/lib/quiz-actions.ts:549-555`. Contrast R84, where PAPER re-grades are
  deliberately silent. The two paths disagree.
- **R76.** The notification is outside the transaction —
  `src/lib/quiz-actions.ts:523-555`. A failure after commit leaves the student
  silently un-notified; the action still returns success.
- **R77.** The client requires a numeric value in `[0, points]` for **every**
  essay before calling, refusing the whole card otherwise —
  `quiz-essay-grader.tsx:73-79`. The server clamps rather than rejects (R70),
  so the strictness is client-only. *(implicit)*
- **R78.** The "Save grade" control only renders when the quiz has essays —
  `quiz-essay-grader.tsx:166`. **An all-MCQ ONLINE quiz has no grading control
  at all**, which is consistent with R64 auto-grading it, but it also means
  there is no way to override an auto-score. *(implicit)*

### Retakes

- **R79.** `reopenQuizAttemptAction` is gated on `canManageQuiz` — **admin
  only**, not `canGradeQuiz`. A leader cannot reopen —
  `src/lib/quiz-actions.ts:569`, `src/lib/auth/permissions.ts:135-146`.
- **R80.** It requires an existing attempt and refuses if the latest is
  `IN_PROGRESS` — `src/lib/quiz-actions.ts:571-577`.
- **R81.** It creates a **new** attempt at `attemptNumber + 1` with the default
  `IN_PROGRESS`; the previous attempt and its answers are left intact —
  `src/lib/quiz-actions.ts:579-585`. History is preserved but nothing surfaces
  it: every read takes the latest attempt only
  (`src/lib/quiz-query.ts:288, 406, 495`).
- **R82.** **The action permits reopening a `SUBMITTED` (ungraded) attempt**;
  only the UI restricts it to `GRADED` — `src/lib/quiz-actions.ts:577` (the
  only status check is `!== IN_PROGRESS`) vs `quiz-essay-grader.tsx:171`
  (`canReopen && attempt.status === "GRADED"`). *(implicit)*
- **R83.** Reopen is offered on the admin grading page and withheld on the
  leader one, by a prop — `admin/season/[code]/quizzes/[quizId]/grade/page.tsx:66`
  (`canReopen`) vs `leader/sessions/[id]/quiz/[quizId]/page.tsx:60`
  (`canReopen={false}`). The action's own gate (R79) makes this correct, but
  the prop is what a reader sees. *(implicit)*
- **R84.** Reopen checks neither `quiz.kind` nor `publishedAt` —
  `src/lib/quiz-actions.ts:564-585`. A retake can be opened on an unpublished
  quiz, which the student then cannot see (R32).

### Manual grading — PAPER

- **R85.** `saveQuizGradesAction` role-gates on `LEADER|ADMIN|SUPER` —
  `src/lib/quiz-actions.ts:109`.
- **R86.** **The season scope check applies only to `LEADER`.** The condition is
  `user.role === "LEADER" && !(await isLeaderInSeason(...))`, so an `ADMIN`
  passes with **no scope check whatsoever**, including for a season they do not
  administer — `src/lib/quiz-actions.ts:117-119`. Every other write in this
  domain routes through `canManageQuiz`/`canGradeQuiz`, both of which check the
  season; this one does not. See §10 D1.
- **R87.** `gradeEntrySchema` validates: `studentUserId` positive int, `score`
  int ≥ 0 **or null**, `notes` string ≤1000 chars, optional and nullable —
  `src/lib/quiz-actions.ts:98-102`.
- **R88.** **`score` has no upper bound on the server.** The only clamp against
  `maxScore` lives in the form — `src/lib/quiz-actions.ts:100` vs
  `quiz-grade-form.tsx:28` (`Math.min(maxScore, Math.max(0, …))`). A score
  above `maxScore` is storable and renders as a >100% average
  (`student/quizzes/page.tsx:17`, `season-export.ts:143-147`). *(implicit)*
- **R89.** Entries with `score: null` are skipped entirely — no row is created
  and **an existing row is never cleared** —
  `src/lib/quiz-actions.ts:135`. There is no way to un-grade a student.
- **R90.** The write is an upsert on `(quizId, studentUserId)` —
  `src/lib/quiz-actions.ts:139-155`, `prisma/schema.prisma:683`. One grade per
  student per quiz.
- **R91.** `gradedById` and `gradedAt` are stamped on both branches, using a
  single `now` captured before the loop so a whole batch shares one timestamp —
  `src/lib/quiz-actions.ts:124, 146-147, 152-153`.
- **R92.** `QUIZ_GRADED` is sent **only to students whose pre-existing row had
  no `gradedAt`** — a re-grade is silent. The check reads the batch-fetched map
  before the upsert — `src/lib/quiz-actions.ts:128-137, 157, 161-169`. Contrast
  R75.
- **R93.** **The action never checks that the target students are in the
  caller's groups, or in the quiz's season, or enrolled at all.** It iterates
  the caller-supplied `grades` array and upserts each `studentUserId` verbatim
  — `src/lib/quiz-actions.ts:134-158`. The only scoping in the system is the
  `studentUserIds` array the *page* passes to `loadQuizWithGrades` for the
  **read** (`leader/sessions/[id]/quiz/[quizId]/page.tsx:34-39`). *(implicit —
  and this is the exact shape of the confirmed attendance defect: a
  group-scoped read feeding an unscoped write)*
- **R94.** The action never checks `quiz.kind` —
  `src/lib/quiz-actions.ts:111-115`. A `QuizGrade` can be written against an
  `ONLINE` quiz. Such a row is invisible to the student (R36 filters on
  `kind: "PAPER"`) but counts in every leader/admin "graded" counter
  (`leader/quizzes/page.tsx:66`, `admin/quizzes/page.tsx:79`) and in the season
  export (R105). *(implicit)*
- **R95.** The upserts and the notifications run in **two sequential loops with
  no transaction** — `src/lib/quiz-actions.ts:134-169`. A failure part-way
  leaves some students graded and some not, some notified and some not, and the
  action returns an error as though nothing happened.
- **R96.** The existing-grade lookup is batched to avoid an N+1
  (`src/lib/quiz-actions.ts:128-132`) but the upserts themselves are one query
  per student in a loop, and each notification is three more queries
  (`notifications.ts:27, 37, 46`). A 30-student class is ~30 + up to 90 round
  trips.

### Reads, scope and ordering

- **R97.** `listQuizzesForSession` returns every quiz on a session, `createdAt`
  ascending, with no kind filter, no publish filter and **no authorization of
  its own** — `src/lib/quiz-query.ts:141-171`. Both callers gate before calling
  (`admin/season/[code]/sessions/[id]/page.tsx`,
  `leader/sessions/[id]/page.tsx`). *(implicit)*
- **R98.** Its `gradedCount` is `grades.length` — the count of `QuizGrade`
  **rows**, for **every** student, regardless of score —
  `src/lib/quiz-query.ts:154, 169`. The leader and admin list pages ignore it
  and recount client-side with a `score !== null` filter over their own scoped
  grade set (`leader/quizzes/page.tsx:66`, `admin/quizzes/page.tsx:79`), so
  three different "graded" numbers exist in the codebase.
- **R99.** `listQuizzesForSeason` is `listQuizzesForSession` with a season
  filter and a different sort (`session.startsAt` desc, then `createdAt` desc)
  and **has no caller anywhere in v1** — `src/lib/quiz-query.ts:173-203`;
  `grep -rn listQuizzesForSeason src/` matches only its definition. Both list
  pages inline an equivalent query instead (`leader/quizzes/page.tsx:32-47`,
  `admin/quizzes/page.tsx:35-48`).
- **R100.** `loadQuizWithGrades(quizId, studentUserIds)` returns one row per
  **requested** student — users filtered to `deletedAt: null`, ordered by
  `name` ascending — left-joined to their grade; a student with no grade gets
  nulls — `src/lib/quiz-query.ts:205-254`.
- **R101.** `loadQuizForGrading(quizId, studentUserIds)` returns the **latest
  `SUBMITTED` or `GRADED` attempt per student**, via `orderBy [studentUserId
  asc, attemptNumber desc]` + `distinct: ["studentUserId"]` —
  `src/lib/quiz-query.ts:489-496`.
- **R102.** Because `IN_PROGRESS` is excluded from that filter, **a student
  whose latest attempt is in progress vanishes from the grading list entirely**
  — including a student an admin just reopened a retake for (R81), whose
  earlier graded attempt is then hidden behind the new in-progress one —
  `src/lib/quiz-query.ts:493-496`. *(implicit — the disappearance is a
  by-product of `distinct` plus the status filter)*
- **R103.** `loadQuizForGrading` returns `correctIndex` for every question
  (`src/lib/quiz-query.ts:483, 549`) and the essay grader renders it when the
  student was wrong (`quiz-essay-grader.tsx:128-133`). Correct for the
  audience — but it lives in the same file as the student read, so the split is
  one careless `select` edit away from becoming a leak (R33).
- **R104.** Grading answers are projected over the quiz's **current** question
  list, not the attempt's answers, so a question added after an attempt was
  submitted appears with every answer field null —
  `src/lib/quiz-query.ts:541-554`.
- **R105.** **Both grading reads take `studentUserIds` as a parameter and do no
  scoping of their own** — `src/lib/quiz-query.ts:205-208, 461-464`. The scope
  is entirely whatever the calling page computed. *(implicit)*
- **R106.** Leader scope is `GroupStudent` rows whose group is in the quiz's
  season **and** in `groupLeaderIds` —
  `leader/sessions/[id]/quiz/[quizId]/page.tsx:34-39`. Admin scope is every
  `ACTIVE` `SeasonEnrollment` in the season —
  `admin/season/[code]/quizzes/[quizId]/grade/page.tsx:36-41`. So an admin
  grades students who are in no group; a leader grades only their own.
- **R107.** The leader grading route additionally requires
  `quiz.sessionId === the session id in the URL`, 404ing otherwise —
  `leader/sessions/[id]/quiz/[quizId]/page.tsx:31`. The admin route requires
  `quiz.seasonId === season.id` instead
  (`admin/…/grade/page.tsx:34`; `edit/page.tsx:29`).
- **R108.** The leader list page derives its season from `groups[0].seasonId`
  **only**, while `studentIds` flattens members of **every** group the leader
  leads across **every** season — `leader/quizzes/page.tsx:28-29`. A leader
  with groups in two seasons sees one season's quizzes measured against both
  seasons' students.
- **R109.** The admin list page auto-selects the most recent `ACTIVE`
  non-deleted season by `startDate` desc, falling back to the most recent
  non-deleted season of any status; there is **no season picker** —
  `admin/quizzes/page.tsx:18-28`.
- **R110.** The admin list's denominator is every `StudentProfile` with
  `activeSeasonId = season.id` and `deletedAt: null`
  (`admin/quizzes/page.tsx:30-32`); the leader list's is the flattened group
  membership (R108). Neither matches the `SeasonEnrollment` set the admin
  *grading* page uses (R106). Three different definitions of "the students in
  this season" coexist.
- **R111.** The leader list links to `/leader/sessions/{sessionId}/quiz/{id}`
  and renders `href="#"` when `sessionId` is null —
  `leader/quizzes/page.tsx:72`. A quiz orphaned by session deletion
  (`prisma/schema.prisma:649`) is therefore **unreachable for leaders**, while
  admins reach it fine via the season-scoped route (R107). *(implicit)*
- **R112.** **No quiz read anywhere in v1 is paginated or bounded.** Not the
  lists, not the grade sheet, not the grading view — which loads every
  attempt's every answer, including full essay text, for every student in
  scope, in one payload (`src/lib/quiz-query.ts:489-517`). *(implicit)*
- **R113.** `loadQuizBuilder` is the only read that returns `correctIndex`
  together with authoring metadata (`publishedAt`, `seasonCode`) —
  `src/lib/quiz-query.ts:331-371`. Its one caller gates on `canManageQuiz`
  *before* calling (`edit/page.tsx:26`).

### Cross-domain consumers (read-only; owned elsewhere)

- **R114.** Both dashboards count a quiz as "pending" when the number of grade
  rows with a non-null score is **less than the number of students in scope**;
  `QuizAttempt` is never consulted, so **every `ONLINE` quiz is permanently
  "pending"** on both dashboards — `admin/dashboard/page.tsx:66-69, 111-115`;
  `leader/dashboard/page.tsx:77-86, 126-130`.
- **R115.** The season export's Grades worksheet lists every quiz in the season
  by `createdAt` ascending, PAPER and ONLINE alike, and reads only `QuizGrade`
  — so an ONLINE quiz always exports as an empty column with a
  `Title (/0)` header — `src/lib/season-export.ts:79-88, 130-137` (domain 17).
- **R116.** The export's per-student average skips any quiz with `maxScore <= 0`
  — `src/lib/season-export.ts:141-148` — which is exactly an ONLINE quiz with
  no questions (R11), so the divide-by-zero is avoided by accident rather than
  by a kind filter.
- **R117.** `QUIZ_GRADED` honours `NotificationPreference.quizGraded`
  (defaulting to allowed when no preference row exists) and additionally fires
  a best-effort email whose failure is swallowed — `src/lib/notifications.ts:23,
  27-32, 35-53`, `prisma/schema.prisma:619` (domain 10).
- **R118.** **Every** `QUIZ_GRADED` notification links to `/student/quizzes`,
  never to the specific quiz — `src/lib/quiz-actions.ts:167, 484, 554`. The
  three call sites also use three different body strings for the same event.

### Concurrency

- **R119.** The single-attempt rule is enforced by a read-then-create with no
  transaction and no unique constraint that covers it: two concurrent
  `startQuizAttemptAction` calls both see no attempt and both create
  `attemptNumber: 1` — the `@@unique([quizId, studentUserId, attemptNumber])`
  (`prisma/schema.prisma:729`) makes the second one fail, but the failure is
  **unhandled** and propagates as a raw Prisma error rather than the friendly
  message — `src/lib/quiz-actions.ts:345-359`. Contrast domain 8's
  `ensureDraftSubmission`, which catches and re-reads. *(implicit)*
- **R120.** `submitQuizAttemptAction` reads the answers, validates
  completeness, and *then* opens the transaction that scores them —
  `src/lib/quiz-actions.ts:414-475`. An answer saved between the read and the
  transaction is scored from the stale in-memory copy, not the row. Narrow, but
  reachable through R55's concurrent fire-and-forget saves. *(implicit)*

## 4. Authorization

Role gates are pure claims checks (`requireRole`,
`src/lib/auth/permissions.ts:25-35`; `isAdminOfSeason`, `src/lib/rbac.ts:28-30`).
Row-scoped gates hit the database (`canManageQuiz`, `canGradeQuiz`,
`canAccessSeason`, `isLeaderInSeason`).

| Operation | Roles | Row-scoped condition | v1 citation |
|---|---|---|---|
| Create quiz | ADMIN, SUPER | `isAdminOfSeason(seasonId)` (SUPER short-circuits) | `src/lib/quiz-actions.ts:37-38` |
| Delete quiz | ADMIN, SUPER | `isAdminOfSeason(quiz.seasonId)` | `src/lib/quiz-actions.ts:87, 91` — **no caller** (R10) |
| Add / update / delete question | any authenticated | `canManageQuiz` = SUPER or `isAdminOfSeason(quiz.seasonId)` | `src/lib/quiz-actions.ts:223, 248, 272`; `permissions.ts:135-146` |
| Publish / unpublish | any authenticated | `canManageQuiz` | `src/lib/quiz-actions.ts:286` |
| Start attempt | STUDENT | quiz is ONLINE + published, **and** `canAccessSeason(quiz.seasonId)` | `src/lib/quiz-actions.ts:333, 340-343` |
| Save answer | **none** | `attempt.studentUserId === caller` **and** `status === IN_PROGRESS` | `src/lib/quiz-actions.ts:374-380` |
| Submit attempt | **none** | `attempt.studentUserId === caller` **and** `status === IN_PROGRESS` | `src/lib/quiz-actions.ts:414-426` |
| Grade essay answers | any authenticated | `canGradeQuiz` = `isLeaderInSeason(quiz.seasonId)` — SUPER, season admin, **or any leader with a group in the season**. **No group-level check on the student.** | `src/lib/quiz-actions.ts:513`; `permissions.ts:150-160`; `rbac.ts:36-51` |
| Reopen attempt (retake) | any authenticated | `canManageQuiz` — **admin only, leaders cannot** | `src/lib/quiz-actions.ts:569` |
| Save PAPER grades | LEADER, ADMIN, SUPER | **LEADER only:** `isLeaderInSeason(quiz.seasonId)`. **ADMIN and SUPER: nothing.** No check on the target students at all. | `src/lib/quiz-actions.ts:109, 117-119` |
| Open student quiz list | STUDENT | own `StudentProfile.activeSeasonId` | `student/quizzes/page.tsx:38-44` |
| Open student quiz detail | STUDENT | quiz is ONLINE + published, **and** `canAccessSeason` | `student/quizzes/[quizId]/page.tsx:19-24` |
| Open builder page | ADMIN, SUPER | `canManageQuiz`, then `quiz.seasonId === season.id`, then `kind === ONLINE` | `edit/page.tsx:20, 26, 29-32` |
| Open admin grading page | ADMIN, SUPER | `canGradeQuiz`, then `quiz.seasonId === season.id` | `grade/page.tsx:22, 28, 34` |
| Open leader grading page | **LEADER only** | `isLeaderInSeason(quiz.seasonId)`, then `quiz.sessionId === url session` | `leader/sessions/[id]/quiz/[quizId]/page.tsx:21, 31-32` |
| Open leader quiz list | **LEADER only** | rows from `groups[0].seasonId` | `leader/quizzes/page.tsx:15, 28` |
| Open admin quiz list | ADMIN, SUPER | season auto-selected from `seasonAdminIds` | `admin/quizzes/page.tsx:15-28` |

Things a v2 implementer must not reproduce, and must write down rather than
inherit:

- **`saveQuizGradesAction` is the domain's authorization hole, twice over**
  (R86, R93). An `ADMIN` of season A can grade a quiz in season B, and *any*
  permitted caller can write a grade row for *any* `studentUserId` — a student
  in another leader's group, in another season, or not enrolled anywhere. This
  is the same shape as the confirmed attendance defect (a group-scoped read
  feeding an unscoped write) and it is the single most important thing this
  spec exists to stop. See §10 D1.
- **`canGradeQuiz` is season-wide, not group-wide** (R67, R68). For ONLINE
  grading that is at least internally consistent — a leader who can open the
  season's grading page can grade anyone in it. It is still a widening the
  moment an endpoint exists, because today the *page* only ever hands the
  reader their own students (R106).
- **`ADMIN` and `SUPER` share `canGradeQuiz` and `canManageQuiz` but not the
  page gates.** The leader grading page is `requireRole(["LEADER"])` only
  (`leader/…/page.tsx:21`), so an admin cannot open it even though the actions
  behind it would accept them. Flat v2 routes remove this asymmetry (§9).
- **The student write gates carry no role check at all** — `saveQuizAnswerAction`
  and `submitQuizAttemptAction` compare user ids and nothing else
  (`:379, :425`). That is correct and should be kept, but it must be *stated*,
  not left to "only students see the runner".
- **`loadQuizForGrading` and `loadQuizWithGrades` enforce nothing** (R105). In
  v2 the endpoint, not the caller, must derive the student set from the
  caller's role — `getVisibleStudents`-style
  (`src/lib/auth/permissions.ts:198-248`) — and must never accept a
  `studentUserIds` list from the client.
- **MENTOR has no access to quizzes at all.** No quiz page admits MENTOR, and
  `canGradeQuiz`/`canManageQuiz` both return false for them
  (`rbac.ts:36-51`, `permissions.ts:135-146`). `canAccessSeason` returns true
  for mentors (`permissions.ts:49`) but nothing in this domain calls it on a
  mentor's behalf. This is a deliberate-looking gap worth confirming (§10 D11).

## 5. Read surface

**`listQuizzesForSession(sessionId)`** — `src/lib/quiz-query.ts:141-171`. One
query with three nested selects. Returns `QuizSummary[]`: `id`, `title`,
`kind`, `publishedAt`, `questionCount` (from `_count`), `maxScore`,
`sessionId`, `sessionTitle`, `sessionDate`, `seasonId`, `gradedCount`. Ordered
`createdAt` asc. **Over-fetches**: it selects the whole `grades` relation
(`{ id: true }` for every row) purely to take `.length` (R98) — on a large
season that is every grade row for the quiz, discarded. No authorization (R97).

**`listQuizzesForSeason(seasonId)`** — `src/lib/quiz-query.ts:173-203`.
Identical shape, season filter, ordered `session.startsAt` desc then
`createdAt` desc. **Dead code** (R99).

**`loadQuizWithGrades(quizId, studentUserIds)`** — `src/lib/quiz-query.ts:205-254`.
Three queries: the quiz, then `users` and `quizGrade` in parallel, then an
in-memory join. Returns quiz scalars plus one `grades[]` row per requested
student (`studentUserId`, `studentName`, `score`, `notes`, `gradedAt`).
The PAPER grade sheet. Scope is the caller's parameter (R105).

**`listQuizResultsForStudent(studentUserId, seasonId)`** —
`src/lib/quiz-query.ts:256-329`. Two parallel queries — PAPER via `QuizGrade`
(R36), ONLINE via `Quiz` + latest attempt (R37) — mapped to a common
`StudentQuizResult` shape and merged by `sessionDate` desc (R38). **This is the
only read whose shape differs by kind**: PAPER rows carry `notes` and never
`attemptStatus`; ONLINE rows carry `attemptStatus` and never `notes`. Both
carry `score`, which for ONLINE is `totalScore` and only when `GRADED`.

**`loadQuizBuilder(quizId)`** — `src/lib/quiz-query.ts:331-371`. One query.
Quiz scalars plus `seasonCode` plus every question **including
`correctIndex`**, `order` asc. Authoring only (R113).

**`loadQuizForStudent(quizId, studentUserId)`** —
`src/lib/quiz-query.ts:375-458`. Two queries: the quiz with its questions
(**no `correctIndex`** — R33), then the student's latest attempt with its
answers, joined in memory. Returns `StudentQuizData`: quiz scalars, attempt
scalars (`attemptId`, `attemptNumber`, `status`, `autoScore`, `manualScore`,
`totalScore`) and per-question `{id, order, type, prompt, points, options,
selectedIndex, text, isCorrect, pointsAwarded}`. Returns `null` for non-ONLINE
or unpublished (R32). **Note `autoScore` and `manualScore` are returned to the
student and rendered by nothing** — `quiz-runner.tsx` shows only `totalScore`
(`:219`); harmless, but they should not be in the v2 contract.

**`loadQuizForGrading(quizId, studentUserIds)`** —
`src/lib/quiz-query.ts:461-559`. Two queries: the quiz with questions
(**including `correctIndex`**), then the latest `SUBMITTED|GRADED` attempt per
requested student with every answer, joined in memory and projected over the
current question list (R104). The heaviest read in the domain and the most
sensitive: it carries the full answer key, every student's name, and every
student's full essay text in one unpaginated payload (R112).

**N+1s and over-fetch to fix rather than port:**

1. `listQuizzesForSession` / `listQuizzesForSeason` pull whole `grades`
   relations for a count (R98) — use `_count` as they already do for questions.
2. Every consumer of these lists re-counts "graded" its own way (R98, R110) —
   three answers to one question. Compute it once, server-side, against a
   single defined student set.
3. The two dashboards each run their own `db.quiz.findMany` with a nested
   `grades` select purely to derive a pending count (R114) and get the wrong
   answer for ONLINE quizzes. One endpoint should serve that number.
4. `loadQuizForGrading` returns everything for everyone; on mobile it must be
   paged per student.

## 6. Write surface

All twelve exported functions of `src/lib/quiz-actions.ts`, in file order.
Every one returns `{ error?: string }` (plus `quizId` / `attemptId` on two);
authorization failures on `canManageQuiz`/`canGradeQuiz` **throw
`ForbiddenError`** instead, so the failure channel is inconsistent within the
same file.

| # | Action | Inputs | Validation | Writes | Cascades / side effects | Returns |
|---|---|---|---|---|---|---|
| 1 | `createQuizAction` `:29-71` | `{sessionId, seasonId, title, kind, maxScore?}` | role ADMIN\|SUPER + `canEditSeason` (R1); `createQuizSchema` (R2); PAPER needs `maxScore` (R3). **Session/season consistency unchecked (R7)** | one `Quiz`; `maxScore` 0 for ONLINE (R4); `createdById` (R5) | 5 `revalidatePath`s, two of them conditional on a season lookup (R8) | `{ quizId }` |
| 2 | `deleteQuizAction` `:85-96` | `quizId` | role ADMIN\|SUPER + `canEditSeason` (R10) | **hard-deletes the `Quiz`** | DB cascade to all `QuizGrade`, `QuizQuestion`, `QuizAttempt`, `QuizAnswer` (R10). No storage, no notification | `{}` |
| 3 | `saveQuizGradesAction` `:104-174` | `quizId`, `grades[]` of `{studentUserId, score, notes}` | role LEADER\|ADMIN\|SUPER (R85); season check **for LEADER only** (R86); `gradeEntrySchema` (R87). **No `maxScore` cap (R88), no student scoping (R93), no `kind` check (R94)** | upsert one `QuizGrade` per non-null score (R89, R90); `gradedById`, `gradedAt` (R91) | `QUIZ_GRADED` + email per **newly** graded student (R92); 2 `revalidatePath`s. **No transaction (R95)** | `{}` |
| 4 | `addQuizQuestionAction` `:218-236` | `quizId`, `QuizQuestionInput` | `canManageQuiz` → throws (R15); `questionSchema` (R16–R18). No `kind` check (R25), no publish/attempt check (R22) | one `QuizQuestion` with `order = count` (R20) | `recomputeQuizMaxScore` (R11), **outside a transaction** (R14); 1 `revalidatePath` | `{}` |
| 5 | `updateQuizQuestionAction` `:238-261` | `questionId`, `QuizQuestionInput` | question exists; `canManageQuiz(question.quizId)` → throws; `questionSchema` | the question's five normalised fields; **`order` is not writable** (R20) | `recomputeQuizMaxScore`; 1 `revalidatePath`. Re-points `correctIndex` positionally (R24) | `{}` |
| 6 | `deleteQuizQuestionAction` `:263-279` | `questionId` | question exists; `canManageQuiz` → throws. **No attempt-state check (R22)** | deletes the `QuizQuestion` | DB cascade deletes every `QuizAnswer` for it, including on `GRADED` attempts, **without rescoring** (R23); `recomputeQuizMaxScore`; leaves `order` sparse (R21) | `{}` |
| 7 | `publishQuizAction` `:281-314` | `quizId`, `publish: boolean` | `canManageQuiz` → throws (R27). **On publish only:** ≥1 question (R28), every MCQ answerable (R29). **On unpublish: nothing** (R30) | `publishedAt = now \| null` (R31) | 2 `revalidatePath`s. Unpublishing silently hides graded results from students (R40) | `{}` |
| 8 | `startQuizAttemptAction` `:329-360` | `quizId` | role STUDENT (R41); quiz ONLINE + published (R42); `canAccessSeason` (R43); latest attempt not terminal (R45) | one `QuizAttempt` at `attemptNumber 1` (R46) — **or none, returning the existing in-progress one** (R44) | none — no revalidate, no notification. **Read-then-create race is unhandled** (R119) | `{ attemptId }` |
| 9 | `saveQuizAnswerAction` `:367-407` | `attemptId`, `questionId`, `{selectedIndex, text}` | attempt exists, owned (throws), `IN_PROGRESS` (R49); question belongs to the attempt's quiz (R50); `answerValueSchema` (R51). **No index-vs-options check (R51), no type-vs-value check (R52)** | upsert one `QuizAnswer` (R53) | none — no revalidate. Called fire-and-forget by the client (R55) | `{}` |
| 10 | `submitQuizAttemptAction` `:409-490` | `attemptId` | attempt exists, owned (throws), `IN_PROGRESS` (R58); **every question answered** (R59) | in one transaction: `isCorrect`+`pointsAwarded` on each MCQ answer (R61), then the attempt → `SUBMITTED`+`autoScore` (R63) **or** `GRADED`+`manualScore 0`+`totalScore`+`gradedAt`, `gradedById` left null (R64) | `QUIZ_GRADED` + email **only on the all-MCQ path** (R65), outside the transaction (R66); 2 `revalidatePath`s. **Nothing notifies a grader** (R65) | `{}` |
| 11 | `gradeEssayAnswersAction` `:496-561` | `attemptId`, `awards[]` of `{questionId, points}` | `canGradeQuiz` → throws (R67); attempt not `IN_PROGRESS` (R69). **No group check on the student (R68)** | in one transaction: `pointsAwarded` per essay answer, clamped (R70); attempt `manualScore`/`totalScore`/`status=GRADED`/`gradedById`/`gradedAt` (R73, R74) | `QUIZ_GRADED` + email **every time, including re-grades** (R75), outside the transaction (R76); 3 `revalidatePath`s | `{}` |
| 12 | `reopenQuizAttemptAction` `:564-590` | `quizId`, `studentUserId` | `canManageQuiz` → throws — **admin only** (R79); an attempt must exist and not be `IN_PROGRESS` (R80). **No `kind`/publish check (R84); `SUBMITTED` is reopenable (R82)** | one new `QuizAttempt` at `attemptNumber + 1`, `IN_PROGRESS` (R81) | 2 `revalidatePath`s. **No notification** — the student is never told they have a retake. Hides the prior graded attempt from the grading list (R102) | `{}` |

**Non-atomic sequences to fix in v2:**

1. **`saveQuizGradesAction` (R95) is the worst.** A per-student upsert loop and
   a per-student notification loop, neither transactional, in an action whose
   whole purpose is a batch save. A failure at student 15 of 30 returns an
   error to a UI that shows "Saved" or an error string with no indication of
   which half landed.
2. `recomputeQuizMaxScore` runs as a separate update after every question write
   (R14) — a stale `maxScore` is the failure mode.
3. Both grading paths create their notification after the transaction commits
   (R66, R76). A notification failure leaves the student silently un-notified
   while the action reports success.
4. `startQuizAttemptAction`'s read-then-create has no catch and no upsert
   (R119) — the database constraint turns a concurrency race into a raw Prisma
   error surfaced to the student.
5. `deleteQuizQuestionAction` relies on a database cascade to mutate scored
   attempts (R23) with no compensating rescore, in no transaction.

**Missing writes — operations v1 has no action for at all**, verified by
enumerating the twelve exports: **editing a quiz's `title`, `kind` or PAPER
`maxScore` after creation; reordering questions (R20); clearing a PAPER grade
(R89); overriding an auto-score on an all-MCQ ONLINE quiz (R78); voiding or
expiring an attempt (R47); deleting a quiz from any UI (R10).** Each is a
product decision for v2, not an omission to port faithfully — see §10.

## 7. Proposed API

Base `/api/v1`. Envelope `{ data }` / `{ error: { code, message } }` per
`CLAUDE.md`. **Everything here is `new`** — there is no quiz route in v1's
`/api/v1` tree and none in `apps/backend/src/routes/`, so the migration
design's "none" (`2026-08-21-full-migration-design.md:125`) is accurate. That
is unusual good news: no ported endpoint has already inherited a defect, and
every gate below can be written correctly the first time.

The governing design decision is **three separate question projections behind
three separate gates**, mirroring R33/R103/R113 rather than one polymorphic
quiz endpoint:

| Method | Path | Status | Auth | Request | Response |
|---|---|---|---|---|---|
| GET | `/quizzes?seasonId=&sessionId=&cursor=&limit=` | **new** | bearer; ADMIN/SUPER/LEADER | — | `quizSummary[]` + cursor. Season defaults to the caller's scope; **leaders get every season they lead in**, fixing R108 |
| GET | `/quizzes/:id` | **new** | bearer + `canManageQuiz` | — | `quizAuthoringDetail` — questions **with** `correctIndex` (R113) |
| PATCH | `/quizzes/:id` | **new** (no v1 counterpart) | bearer + `canManageQuiz` | `{ title?, maxScore? }` | `quizAuthoringDetail`. `maxScore` accepted only for PAPER (R4/R11) |
| DELETE | `/quizzes/:id` | **new** | bearer + `canManageQuiz` | — | `{ deleted: true }`. **Gate on "no attempts and no grades" — see §10 D9** |
| POST | `/seasons/:seasonId/quizzes` | **new** | bearer + `canEditSeason` | `{ sessionId, title, kind, maxScore? }` | `quizAuthoringDetail`. **Must validate the session is in the season** (R7) |
| POST | `/quizzes/:id/questions` | **new** | bearer + `canManageQuiz` | `quizQuestionRequest` | `quizAuthoringQuestion` |
| PATCH | `/quizzes/:id/questions/:questionId` | **new** | bearer + `canManageQuiz` | `quizQuestionRequest` | `quizAuthoringQuestion` |
| DELETE | `/quizzes/:id/questions/:questionId` | **new** | bearer + `canManageQuiz` | — | `{ deleted: true }` |
| PUT | `/quizzes/:id/questions/order` | **new** (no v1 counterpart, R20) | bearer + `canManageQuiz` | `{ questionIds: number[] }` | `quizAuthoringQuestion[]` |
| POST | `/quizzes/:id/publish` | **new** | bearer + `canManageQuiz` | `{ publish: boolean }` | `{ publishedAt }` |
| GET | `/me/quizzes?seasonId=` | **new** | bearer; STUDENT | — | `studentQuizResult[]` (R36–R39) |
| GET | `/quizzes/:id/attempt` | **new** | bearer; STUDENT + `canAccessSeason` | — | `studentQuizDetail` — questions **without** `correctIndex` (R33) |
| POST | `/quizzes/:id/attempt` | **new** | bearer; STUDENT + `canAccessSeason` | — | `studentQuizDetail`. Idempotent: returns the in-progress attempt when one exists (R44) |
| PUT | `/quizzes/:id/attempt/answers/:questionId` | **new** | bearer; attempt owner + `IN_PROGRESS` | `{ selectedIndex?, text? }` | `{ saved: true }` |
| POST | `/quizzes/:id/attempt/submit` | **new** | bearer; attempt owner + `IN_PROGRESS` | — | `studentQuizDetail` with the post-submit status and scores |
| GET | `/quizzes/:id/grades` | **new** | bearer + `canGradeQuiz` | — | `quizGradeSheet` (PAPER). **Student set derived server-side from the caller's role** (R105) |
| PUT | `/quizzes/:id/grades` | **new** | bearer + `canGradeQuiz` | `{ entries: [{studentUserId, score, notes}] }` | `quizGradeSheet`. **Every `studentUserId` validated against the caller's visible set** (R93) |
| GET | `/quizzes/:id/attempts?cursor=&limit=` | **new** | bearer + `canGradeQuiz` | — | `quizGradingAttempt[]` (ONLINE). Paginated (R112), student set derived server-side |
| POST | `/quizzes/:id/attempts/:attemptId/grade` | **new** | bearer + `canGradeQuiz` + student in the caller's visible set | `{ awards: [{questionId, points}] }` | `quizGradingAttempt` |
| POST | `/quizzes/:id/attempts/reopen` | **new** | bearer + `canManageQuiz` (R79) | `{ studentUserId }` | `quizGradingAttempt` for the new attempt |

Shape notes that are decisions, not restatements:

- **Address the attempt by quiz, not by attempt id.** v1's client carries
  `attemptId` from `startQuizAttemptAction` into every subsequent call
  (`quiz-runner.tsx:63, 79, 110`). Since there is at most one live attempt per
  (quiz, student) (R45) and the server can always find it, taking it from the
  path removes a whole class of client bug and removes the need for the
  ownership check to be the *only* gate (R49). Keep an explicit
  `409 attempt_closed` when the resolved attempt is not `IN_PROGRESS`.
- **`GET /quizzes/:id` and `GET /quizzes/:id/attempt` must be different
  handlers, not one handler with a role branch.** R33's protection is a
  `select` list; a single handler makes it one `if` away from leaking. Two
  handlers, two Prisma selects, two response schemas (§8), and the authoring
  select is unreachable from a student token by construction.
- **The two grading reads must never accept a student list from the client**
  (R105). Derive it: leaders → `GroupStudent` in led groups within the quiz's
  season (R106); admins/super → `ACTIVE` `SeasonEnrollment` in the season
  (R106). Return the derived set's size alongside the rows so the "x/y graded"
  counters stop being computed three different ways (R98, R110).
- **`PUT /quizzes/:id/grades` is a batch and must be transactional** (R95), and
  must reject — not clamp, and not skip — a `score` above the quiz's
  `maxScore` (R88) and a `studentUserId` outside the caller's visible set
  (R93). A partial batch should fail whole, with the offending entries named.
- **No endpoint accepts `kind` after creation** — the field is written once at
  create and by nothing else (`quiz-actions.ts:51-61`, §2) — and
  `POST /seasons/:id/quizzes` must reject `maxScore` for `ONLINE`
  rather than silently zeroing it (R4).
- **Error codes** replace v1's English strings: `quiz_not_found`,
  `quiz_not_published`, `attempt_exists`, `attempt_closed`,
  `attempt_incomplete` (R59), `question_not_in_quiz` (R50),
  `score_exceeds_max` (R88), `student_not_in_scope` (R93),
  `quiz_has_attempts` (§10 D3). `ForbiddenError` becomes `forbidden` 403
  uniformly, ending the split failure channel described in §6.

## 8. Proposed shared contracts

New file `packages/shared/src/quiz.ts`. Nothing quiz-related exists in
`packages/shared` today (`ls packages/shared/src/` → `assignment`,
`attendance`, `auth`, `enums`, `group`, `navigation`, `season`, `session`,
`submission`). Per `CLAUDE.md` these are **Zod schemas with `z.infer` types,
not bare interfaces** — v1's ten exported interfaces in `quiz-query.ts` are the
starting point, not the contract.

**The two-schema split is this domain's central contract decision.** There must
be no schema that has `correctIndex` as an optional field. The presence of the
answer key must be a *different type*, so that a handler cannot accidentally
widen a student response into an authoring one and pass typecheck.

| Contract | Kind | Fields |
|---|---|---|
| `quizKindSchema` | new enum | `PAPER`, `ONLINE` (`prisma/schema.prisma:83-86`). Add to `packages/shared/src/enums.ts` beside the existing role/status enums; do not redeclare locally. |
| `quizQuestionTypeSchema` | new enum | `MCQ`, `ESSAY` (`:88-91`). Same placement. |
| `quizAttemptStatusSchema` | new enum | `IN_PROGRESS`, `SUBMITTED`, `GRADED` (`:93-97`). Same placement. |
| `quizSummarySchema` | new, from `QuizSummary` (`quiz-query.ts:8-20`) | `id`, `title`, `kind`, `publishedAt`, `questionCount`, `maxScore`, `sessionId` (nullable), `sessionTitle`, `sessionDate`, `seasonId`, plus **`gradedCount` and `studentCount` computed against one defined student set** (replacing R98/R110's three answers). |
| `quizQuestionAuthoringSchema` | new, from `QuizBuilderQuestion` (`:52-60`) | `id`, `order`, `type`, `prompt`, `points`, `options`, **`correctIndex`** (nullable). Used **only** by `GET /quizzes/:id` and the question write responses. |
| `quizQuestionStudentSchema` | new, from `StudentQuizQuestion` (`:74-86`) | `id`, `order`, `type`, `prompt`, `points`, `options`, `selectedIndex`, `text`, `isCorrect`, `pointsAwarded`. **`correctIndex` must not exist on this type** (R33). |
| `quizAuthoringDetailSchema` | new, from `QuizBuilderData` (`:62-72`) | Quiz scalars + `seasonCode` + `quizQuestionAuthoringSchema[]`. |
| `studentQuizDetailSchema` | new, from `StudentQuizData` (`:88-102`) | Quiz scalars, `sessionTitle`, `attemptId`, `attemptNumber`, `status` (nullable), `totalScore`, `quizQuestionStudentSchema[]`. **Drop `autoScore`/`manualScore`** — returned by v1 and rendered by nothing (§5). |
| `studentQuizResultSchema` | new, from `StudentQuizResult` (`:38-50`) | `quizId`, `title`, `kind`, `maxScore`, `score`, `notes`, `gradedAt`, `sessionTitle`, `sessionDate`, `attemptStatus`. Consider splitting into a discriminated union on `kind` — half the fields are null-by-construction for each (R36, R37). |
| `quizGradeSheetSchema` | new, from `QuizWithGrades` (`:22-36`) | Quiz scalars + `studentCount` + rows of `{studentUserId, studentName, score, notes, gradedAt}`. |
| `quizGradingAnswerSchema` | new, from `GradingAnswer` (`:104-115`) | `questionId`, `type`, `prompt`, `points`, `options`, **`correctIndex`**, `selectedIndex`, `isCorrect`, `text`, `pointsAwarded`. Grader-only. |
| `quizGradingAttemptSchema` | new, from `GradingAttempt` (`:117-128`) | `attemptId`, `studentUserId`, `studentName`, `attemptNumber`, `status`, `autoScore`, `manualScore`, `totalScore`, `submittedAt`, `quizGradingAnswerSchema[]`. |
| `createQuizRequestSchema` | new, from `createQuizSchema` (`quiz-actions.ts:20-27`) | `sessionId`, `title` (1–200), `kind`, `maxScore` (1–1000, **required for PAPER, forbidden for ONLINE** — a refine, replacing R3+R4's split enforcement). `seasonId` moves to the path. |
| `quizQuestionRequestSchema` | new, from `questionSchema` (`:188-205`) | `type`, `prompt` (trimmed 2–2000), `points` (1–100), `options` (≤6, each trimmed 1–500), `correctIndex`. Keep both refines verbatim (R17, R18) and keep the ESSAY normalisation (R19) — but do it in the schema's `transform`, not in a separate `normalizeQuestion`. |
| `publishQuizRequestSchema` | new | `{ publish: boolean }`. |
| `saveQuizAnswerRequestSchema` | new, from `answerValueSchema` (`:362-365`) | `selectedIndex` (nullable int) and `text` (nullable, ≤20,000). **Replace the hard-coded `.max(5)` with a server-side check against the question's `options.length`** (R51). |
| `saveQuizGradesRequestSchema` | new, from `gradeEntrySchema` (`:98-102`) | `entries: [{studentUserId, score (int, nullable), notes (≤1000, nullable)}]`. **`score` gains a max bound checked against the quiz's `maxScore` server-side** (R88). |
| `gradeEssayAnswersRequestSchema` | new | `awards: [{questionId, points: int ≥ 0}]`. Per-award max checked against the question (R70) — decide reject-vs-clamp (§10 D8). |
| `reopenAttemptRequestSchema` | new | `{ studentUserId }`. |
| `reorderQuestionsRequestSchema` | new (no v1 counterpart) | `{ questionIds: number[] }` — must be a permutation of the quiz's current question ids. |

**Reuse, do not redefine:** `UserRole` and the season/session display fields
from `packages/shared/src/season.ts` and `session.ts` — this domain flattens
`sessionTitle`/`sessionDate` the way v1 does and must not restate domain 3's
session contract. Timestamps stay ISO strings, per the note in `season.ts`.

**Do not share with domain 13.** Video-quiz questions look similar but have a
non-nullable `correctIndex`, an `atSeconds` field and no `points` ceiling
(`prisma/schema.prisma:392-410`). A shared "question" schema would force one of
the two to carry optional fields it never uses and would reintroduce exactly
the optionality this section exists to avoid. Copy the *pattern*, not the type.

## 9. Screens

The v2 tree is flat and has **no dynamic segments at all**
(`apps/mobile/app/(app)/` — every file is a static route; only `students/` is a
subdirectory). `quizzes.tsx` exists as a placeholder rendering
`EmptyState "This screen isn't built yet."`, and `/quizzes` is already in the
tab/menu config for four roles (`packages/shared/src/navigation.ts:77, 96, 114,
123`). **Every detail route below is new.**

| v1 page(s) | v2 route | Exists? | Roles | Notes |
|---|---|---|---|---|
| `/student/quizzes`, `/leader/quizzes`, `/admin/quizzes` | `/quizzes` | placeholder — `apps/mobile/app/(app)/quizzes.tsx` | STUDENT, LEADER, ADMIN, SUPER | **Three v1 pages collapse into one.** Student branch = `GET /me/quizzes` + the average-score hero (`student/quizzes/page.tsx:50-88`); leader/admin branch = `GET /quizzes`. Fixes R108 (multi-season leaders) and R109 (no season picker) by taking `seasonId` from the shared season selector. |
| `/student/quizzes/[quizId]` (`student/quizzes/[quizId]/page.tsx`) | `/quizzes/[quizId]` | **no — must be created** | STUDENT | The quiz runner: three states (R44/R63/R64 → not-started, in-progress, result). The highest-value missing route in this domain and the only one a student ever needs. |
| `/admin/season/[code]/quizzes/[quizId]/edit` (`edit/page.tsx`) | `/quizzes/[quizId]/edit` | **no — must be created** | ADMIN, SUPER | The question builder + publish bar. ONLINE only — v1 redirects away for PAPER (`edit/page.tsx:30-32`); in v2 render a "paper quiz — nothing to author" state instead of a redirect. |
| `/admin/season/[code]/quizzes/[quizId]/grade` **and** `/leader/sessions/[id]/quiz/[quizId]` | `/quizzes/[quizId]/grade` | **no — must be created** | LEADER, ADMIN, SUPER | **Two v1 pages collapse into one**, ending the asymmetry where the leader route is `requireRole(["LEADER"])` (`leader/sessions/[id]/quiz/[quizId]/page.tsx:21`) and the admin route is `["ADMIN","SUPER"]` (`grade/page.tsx:22`), so neither role can open the other's page. Branches PAPER (grade grid) vs ONLINE (essay grader) on `kind`, as both v1 pages already do. `canReopen` comes from `canManageQuiz`, not from a prop (R83). |
| Session detail quiz card — admin (`admin/season/[code]/sessions/[id]/page.tsx:140-197`) and leader (`leader/sessions/[id]/page.tsx:77-105`) | section inside `/calendar` → session detail (domain 3 owns the route) | **no** | LEADER, ADMIN, SUPER | This domain owns the card and the "+ Add quiz" affordance (the **only** creation entry point in v1). Domain 13's "Video questions" card sits beside it — different data, different endpoints, same screen. |
| Dashboard quiz tiles (`admin/dashboard/page.tsx:174-179, 326-352`; `leader/dashboard/page.tsx:187-192, 336-360`) | tiles on `/dashboard` | dashboard exists | LEADER, ADMIN, SUPER | Domain 1 owns the screen; this domain owns the number. **Fix R114 while porting** — today every ONLINE quiz is permanently "pending". |

Two Phase-4 notes the screen work depends on:

- **The runner is the domain's real UI risk on mobile, and R55 is why.** v1
  saves each answer fire-and-forget and relies on a full re-save at submit
  (R56) to cover losses within one sitting. On a phone that assumption breaks:
  the app is backgrounded, the network drops mid-quiz, and the "one sitting"
  never happens. The mobile runner needs an explicit local draft plus a
  visible save state, not v1's silence. There is no time limit (R9) so nothing
  forces a deadline — but there is also no expiry (R47), so an attempt
  abandoned by a dropped connection blocks the student forever (R45) until an
  admin reopens it (R79). Decide §10 D5 before this screen is built.
- **No rich text anywhere.** Unlike domain 8, every text field here — `prompt`,
  `options`, `notes`, essay `text` — is plain and rendered as plain
  (`quiz-runner.tsx:258`, `quiz-essay-grader.tsx:139`,
  `student/quizzes/page.tsx:119-123`). No renderer, no editor, no sanitiser.
  This domain does not inherit domain 8's rich-text blocker.

## 10. Open questions and divergences

**D1 — `saveQuizGradesAction` is unscoped in two independent ways. Decide
before writing `PUT /quizzes/:id/grades`; this is the domain's headline
finding.** R86: the season check is written
`user.role === "LEADER" && !(await isLeaderInSeason(...))`
(`quiz-actions.ts:117`), so an `ADMIN` of **any** season passes it with no
check at all — a season-scoped role behaving globally. R93: the action then
iterates the caller-supplied `grades` array and upserts each `studentUserId`
verbatim (`:134-158`) with **no check that the student is in the caller's
groups, in the quiz's season, or enrolled anywhere**. The only scoping in the
system is the `studentUserIds` list the *page* passes to the **read**
(`leader/sessions/[id]/quiz/[quizId]/page.tsx:34-39`). This is precisely the
shape of the confirmed attendance defect — a group-scoped read feeding an
unscoped write — and today it is invisible because the only client is a form
rendered from that read.
*Recommendation:* in v2, (a) route the write through `canGradeQuiz` like every
other grading path, with no role-conditional branch; (b) derive the caller's
visible student set server-side and reject any `studentUserId` outside it with
`student_not_in_scope`; (c) reject the whole batch rather than skipping
offenders, so a client bug is loud. Also record R86 as a live v1 production
issue for the owner — an admin of a finished season can rewrite grades in a
current one today.

**D2 — the answer key does *not* leak in v1, and the v2 contract must make
that structural rather than incidental.** R33: `loadQuizForStudent` omits
`correctIndex` from its `select` deliberately, with a comment saying so
(`quiz-query.ts:373-374, 389-399`), while `loadQuizForGrading` (`:483`) and
`loadQuizBuilder` (`:354`) include it. This is the rare case where v1's
server-rendered shape already matches what an API needs — but the protection is
**one `select` list in a 559-line file that also contains the two reads that do
return the key**. A single "let's reuse this query" refactor loses it, and a
mobile client makes the payload trivially readable.
*Recommendation:* encode it in the type system (§8) — `quizQuestionStudentSchema`
must not have a `correctIndex` field at all, and the student and authoring
detail endpoints must be separate handlers with separate Prisma selects (§7).
Add an integration test asserting the student response has no `correctIndex`
key; it is the cheapest possible regression guard for the one thing v1 got
right. Secondary: R60's all-or-nothing MCQ scoring plus R34's immediate
per-question `isCorrect` feedback plus R81's retakes mean a student who is
granted a retake on a ≤6-option quiz knows exactly which questions were wrong.
That is a design consequence, not a leak, but confirm it is intended.

**D3 — a live quiz is fully mutable, and the mutations silently corrupt past
scores.** Three rules compound: R22 (questions can be added, edited and deleted
on a published quiz with graded attempts — nothing checks `publishedAt` or
`QuizAttempt`), R13 (`recomputeQuizMaxScore` rebases `maxScore` retroactively,
changing the denominator of every past percentage without recomputing any
`totalScore`), and R23 (deleting a question cascade-deletes its `QuizAnswer`
rows across graded attempts, `schema.prisma:739`, while the scores keep the
points it awarded). R24 adds that `correctIndex` is positional, so an option
edit re-points the key and retroactively changes what past students "chose".
There is no version, no snapshot and no audit — nothing records what the quiz
looked like when it was taken.
*Recommendation:* gate authoring writes on attempt state. Proposed:
`publishedAt === null` → freely editable; published with **no** attempts →
editable, republish revalidates; published **with** attempts → reject with
`quiz_has_attempts` and require unpublish-and-clear or a new quiz. If mid-flight
edits are genuinely wanted, they need answer snapshots on `QuizAnswer` (option
text and points as taken), which is a schema change and therefore blocked until
v1 is retired. Decide the cheap version now.

**D4 — unpublishing hides students' own graded results with no trace.** R30 +
R40: `publish: false` runs no validation and ignores attempts
(`quiz-actions.ts:288, 306-309`), and both student reads filter on
`publishedAt` (`quiz-query.ts:279, 402`), so a student who submitted and was
graded loses the quiz from their list and gets a 404 on the detail route. The
notification they received (R65/R75) links to `/student/quizzes` (R118), where
the quiz is no longer listed.
*Recommendation:* keep unpublish as "no new attempts" rather than "invisible" —
filter `publishedAt` on the *start* path only, and keep already-attempted
quizzes visible to their own student. Alternatively refuse to unpublish a quiz
that has attempts, consistent with D3. Either is a divergence from v1 and needs
a product answer.

**D5 — the attempt model needs a product decision before the runner is built.**
Four rules that were tolerable in a browser are not on a phone: R45 (one
attempt, ever, unless an admin intervenes), R47 (no expiry, no timeout, no
`ABANDONED` status — an `IN_PROGRESS` attempt blocks the student permanently and
hides them from the grading list, R102), R55 (fire-and-forget saves with silent
failure), R79 (only an admin can reopen — a leader looking at the grading screen
cannot). A student whose connection drops mid-quiz is stuck until an admin they
may not know how to reach reopens it, and R81's reopen sends **no
notification**, so they are not told when it happens.
*Recommendation:* decide three things together — (1) whether leaders may reopen
(recommend yes: `canGradeQuiz`, matching who already sees the attempt);
(2) whether a reopen notifies the student (recommend yes — a new
`NotificationType` is a schema change, so reuse `QUIZ_GRADED` with different
copy or accept the gap); (3) whether an `IN_PROGRESS` attempt older than some
threshold may be auto-submitted or discarded. Option (3) needs a status or a
convention, not necessarily a schema change: auto-submitting on the existing
completeness rule (R59) is impossible for a partly-answered attempt, so the
honest choice is a grader-visible "in progress since X" row plus a reopen
button, which is a UI fix rather than a model change. **Recommend that.**

**D6 — no time limits and no open/close windows exist anywhere (R9), and that
is a feature request, not a gap to fill silently.** `Quiz` carries only
`publishedAt`; no model in the domain has a duration, a start time or an
expiry, so nothing in this domain is timezone-sensitive — which is worth
stating because timezones are unhandled throughout v1 and are a live hazard in
neighbouring domains.
*Recommendation:* do not invent one. If a timed quiz is wanted later it is a
schema change (blocked until v1 retires) and it interacts with D5 — record it
as a known future requirement so the attempt endpoints are not shaped in a way
that makes it hard to add.

**D7 — PAPER grades are unbounded above and cannot be cleared.** R88: `score` is
`z.number().int().min(0)` with no maximum (`quiz-actions.ts:100`); the only
clamp against `maxScore` is `Math.min(maxScore, …)` in the form
(`quiz-grade-form.tsx:28`). A score above `maxScore` renders as a >100%
percentage in the student's average (`student/quizzes/page.tsx:17`) and in the
export (`season-export.ts:143-147`). R89: a null score is skipped entirely, so
an existing grade can never be cleared — a typo'd score is correctable but a
grade entered against the wrong student is not removable.
*Recommendation:* enforce `0 ≤ score ≤ quiz.maxScore` server-side and reject
(`score_exceeds_max`) rather than clamp, so a miskeyed entry is visible. Add an
explicit delete for a grade row — `DELETE /quizzes/:id/grades/:studentUserId` —
rather than overloading null.

**D8 — the two grading paths disagree about notifications, and neither is
obviously right.** R92: PAPER notifies only students who had no `gradedAt`
before, so re-grades are silent. R75: ONLINE notifies on **every** call,
including a re-grade of an already-graded attempt. Same event type, same
student, opposite behaviour. R118 adds that all three notification sites link
to `/student/quizzes` rather than the quiz, with three different body strings.
*Recommendation:* pick one — recommend notifying on first grade and on any
score *change*, silent on a no-op re-save — and link to the specific quiz now
that a detail route will exist. Also decide reject-vs-clamp for essay awards
(R70 clamps silently, R77 the client rejects); recommend reject, matching D7.

**D9 — deleting a quiz is a hard delete with no caller, and the v2 endpoint
would be the first way to reach it.** R10: `deleteQuizAction` hard-deletes and
cascades to every grade, question, attempt and answer
(`schema.prisma:672, 692, 712, 737`), unlike `Season`/`Assignment`/`Submission`
which soft-delete. No UI in v1 renders a delete control, so the path has almost
certainly never run in production.
*Recommendation:* either omit `DELETE /quizzes/:id` from v2 entirely, or gate
it on "no attempts and no grades" and return `quiz_has_attempts` otherwise. Do
not expose an unguarded hard delete on a mobile screen where it is one
mis-tap away. `Quiz` has no `deletedAt` column and adding one is a schema
change, so a soft delete is not available before v1 retires.

**D10 — `QuizGrade` rows can be written against `ONLINE` quizzes, and three
different "graded" counts already disagree.** R94: `saveQuizGradesAction` never
checks `kind`. Such a row is invisible to the student (R36 filters
`kind: "PAPER"`) but counts toward "graded" on both list pages
(`leader/quizzes/page.tsx:66`, `admin/quizzes/page.tsx:79`) and occupies a
column in the export (R115). Separately, R98/R110 give three definitions of
"graded" and three of "the students in this season" (`GroupStudent` flattened
across seasons, `StudentProfile.activeSeasonId`, `ACTIVE SeasonEnrollment`).
R114 compounds it: both dashboards ignore `QuizAttempt` entirely, so every
ONLINE quiz is permanently "pending".
*Recommendation:* reject a PAPER-grade write against an ONLINE quiz
(`wrong_quiz_kind`); compute progress once, server-side, per kind — PAPER from
`QuizGrade` with a non-null score, ONLINE from `QuizAttempt` with status
`GRADED` — over one canonical student set (recommend `ACTIVE SeasonEnrollment`,
which is what the admin grading page already uses, R106); return it in
`quizSummarySchema` (§8) so every consumer including the dashboards reads the
same number.

**D11 — MENTOR sees no quizzes at all.** No quiz page admits MENTOR and neither
`canManageQuiz` nor `canGradeQuiz` returns true for them (§4). Everywhere else
in v1 a mentor has read-all visibility (`canReadAllStudents`, `rbac.ts:53-55`;
`canAccessSeason` returns true for mentors, `permissions.ts:49`), and
`/quizzes` is not in the mentor's v2 navigation
(`packages/shared/src/navigation.ts`).
*Recommendation:* confirm this is deliberate. If mentors should see quiz
outcomes as part of student oversight, the natural shape is read-only access to
`GET /quizzes` and `GET /quizzes/:id/grades` — and **not** to
`GET /quizzes/:id/attempts`, which carries the answer key (R103). Cheap to add
now, awkward to retrofit once mentor screens assume the current gap.

**D12 — a quiz orphaned by session deletion becomes unreachable for leaders.**
`Quiz.sessionId` is `onDelete: SetNull` (`schema.prisma:649`), the leader list
renders `href="#"` when it is null (`leader/quizzes/page.tsx:72`), and the
leader grading route requires the URL session to match
(`leader/…/page.tsx:31`) — so there is no leader path to the quiz at all. R7
compounds it: nothing validates the session belongs to the season in the first
place.
*Recommendation:* v2's flat `/quizzes/[quizId]/grade` route removes the cause —
the quiz is addressed by its own id, never through a session. Validate the
session/season pair at creation (R7). Then decide whether a session-less quiz
should be creatable deliberately (v1 forbids it, R6) — recommend allowing it,
since the model already permits it and the orphan case proves it must be
handled anyway.

**D13 — dead code to drop rather than port.** `deleteQuizAction`
(`quiz-actions.ts:85-96`) has no caller (R10) and `listQuizzesForSeason`
(`quiz-query.ts:173-203`) has no caller (R99) — both list pages inline an
equivalent query instead. `Quiz.createdById`, `QuizGrade.gradedById` and
`QuizAttempt.gradedById` are written and never read (§2).
*Recommendation:* do not port `listQuizzesForSeason` — `GET /quizzes` replaces
it properly. Do port the three `*ById` columns' *writes* (they are the only
audit trail this domain has) and start **reading** them: "graded by <name>" on
the grading screen is information no v1 user can see today and it costs one
join.

**D14 — nobody is told an ONLINE attempt is waiting to be graded.** R65: the
essay path sets `SUBMITTED` and notifies nobody; a grader learns about it only
by opening the grading screen. The student-facing half is well covered (R65,
R75, R92) and the grader-facing half does not exist. Same shape as domain 8's
missing submit→leader notification.
*Recommendation:* out of scope for parity, but the obvious first candidate for
push notifications once they exist. A new `NotificationType` value is a schema
change and therefore blocked until v1 is retired — flag it, do not build it.

**D15 — the `startQuizAttemptAction` race is unhandled.** R119: a read-then-
create with no transaction (`quiz-actions.ts:345-359`); the
`@@unique([quizId, studentUserId, attemptNumber])` constraint
(`schema.prisma:729`) catches the duplicate but nothing catches the constraint
violation, so the student sees a raw Prisma error instead of the friendly
message. Domain 8's `ensureDraftSubmission` handles the equivalent case by
catching and re-reading (`assignment-actions.ts:203-212`).
*Recommendation:* make `POST /quizzes/:id/attempt` a real upsert on the unique
triple, or wrap the read-and-create in a transaction with `SERIALIZABLE`
semantics. Keep the idempotent-return behaviour (R44) — it is what makes the
endpoint safe to call from a screen that may mount twice.

---

**Rule count:** 120 numbered rules (R1–R120), of which **30 are marked
`(implicit)`** — enforced by a `where`/`select` clause, by which page renders a
control, or by a check that simply is not written: R7, R10, R13, R21, R22, R23,
R25, R33, R35, R36, R40, R51, R52, R55, R68, R72, R77, R78, R82, R83, R88, R93,
R94, R97, R102, R105, R111, R112, R119, R120 — plus R84's and R89's absence of
a check, called out in place.

**Verdict on the answer key:** it does **not** leak to students in v1
(R33) — the student read deliberately omits `correctIndex` and says so in a
comment. That protection is a `select` list in the same file as two reads that
do return the key, so §8's two-schema split exists to make it structural rather
than incidental.

**Verdict on video quizzes:** a **separate model tree**
(`SessionVideoQuestion` / `SessionVideoQuestionResponse` / `SessionVideoProgress`,
`prisma/schema.prisma:392-420`), not a variant of `Quiz`. Domain 13 shares no
model, enum, helper, endpoint or screen with this domain and can reuse only the
contract *pattern* described in §8.
