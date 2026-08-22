# Domain 13 — Video quizzes

> Status: draft · Phase: 4 · v1 API status: **none** — no `/api/v1` route in v1
> touches any of this domain's three tables, and `apps/backend/src/routes/`
> has no counterpart. Everything in §7 is new.

An interactive video quiz is a set of timed multiple-choice questions pinned to
second-offsets on a `Session`'s YouTube recording. A student watches the video
inside a custom player; when playback reaches a question's timestamp the video
pauses, a modal asks the question, and the student cannot advance past that
point until they answer. One answer per question, no retries, auto-graded.

**Boundary with domain 12 (Quizzes).** These are two unrelated features that
share only the English word "quiz". Domain 12 owns `Quiz`, `QuizQuestion`,
`QuizAttempt`, `QuizAnswer` and `QuizGrade`; this domain owns
`SessionVideoQuestion`, `SessionVideoQuestionResponse` and
`SessionVideoProgress`. There is no shared table, no shared column, no shared
library function and no shared permission gate. See §2 for the evidence and the
consequences. **Nothing in domain 12's spec is restated here and nothing here
depends on it.**

**Boundary with domain 3 (Sessions).** `Session.youtubeUrl` is domain 3's field
— it is written by `src/lib/session-actions.ts:132, 147` and read by five other
pages. This domain only *reads* it, parses it, and depends on it being a
YouTube URL. Two of its behaviours (R36, R16) are domain 3 defects that break
this domain; they are flagged in §10 D7 and D12, not specced here.

## 1. v1 source

| File | Holds |
|---|---|
| `src/lib/video-quiz-actions.ts:1-228` | All five writes: create/update/delete a question, submit an answer, save progress. The authoring Zod schema and the progress Zod schema. |
| `src/lib/video-quiz-query.ts:1-112` | The two reads: `listVideoQuestions` (admin, with the answer key) and `loadStudentVideoQuiz` (student, without it). The two view shapes and the score computation. |
| `src/lib/video-time.ts:1-31` | `formatTimestamp` and `parseTimestamp`. 31 lines; four distinct defects (R20, R23, R24, R27). |
| `src/lib/youtube.ts:1-15` | `parseYouTubeId` — four unanchored regexes over the URL string. 15 lines. |
| `src/lib/auth/permissions.ts:120-131` | `canManageSessionVideo` — the authoring gate (SUPER, or season ADMIN). |
| `src/lib/auth/permissions.ts:45-70` | `canAccessSeason` — the answering/progress gate. Its STUDENT branch (`:61-68`) is why R51 exists. |
| `src/components/sessions/interactive-video-player.tsx:1-410` | The student surface. Holds the **entire** playback gate (R39–R46), the YouTube IFrame bootstrap, the 250 ms poll, the question modal, and a client-side duplicate of the score computation. |
| `src/components/sessions/video-questions-editor.tsx:1-329` | The admin surface. Timestamp text field, 2–6 option rows, correct-answer radio, delete confirm. Swallows `fieldErrors` (R28). |
| `src/app/student/sessions/[id]/page.tsx:22-90` | The only page that renders the player. Enrollment check (`:29-33`), URL parse (`:47`), quiz load (`:48`), and the "no questions → plain link" fallback (`:49, 76-90`). |
| `src/app/admin/season/[code]/sessions/[id]/page.tsx:37-63, 200-214` | The only page that renders the editor. Role gate (`:39`), season gate (`:42`), question load (`:63`), `youtubeUrl`-truthiness render condition (`:206`). |
| `src/lib/session-actions.ts:20-27, 125-151` | `youtubeUrl` validation (`:25`) and the recurrence fan-out that copies it to siblings (`:138-151`). Domain 3's file; cited because R15/R16 depend on it. |
| `prisma/schema.prisma:392-438` | `SessionVideoQuestion`, `SessionVideoQuestionResponse`, `SessionVideoProgress`, and the header comment that states the intended design. |
| `prisma/schema.prisma:158-160, 385-386` | The `User` and `Session` back-relations. |
| `prisma/migrations/20260701151102_add_video_quizzes/migration.sql` | The only migration for this domain. |

**There is nothing else.** A grep for `sessionVideoQuestion`,
`sessionVideoQuestionResponse` and `sessionVideoProgress` across `src/` and
`prisma/seed.ts` returns matches **only** inside `video-quiz-actions.ts` and
`video-quiz-query.ts` — no dashboard, no export, no engagement metric, no seed
data, no API route. See R76/R77 and §10 D10. v1 has no test files anywhere.

## 2. Data model

### Verdict: video quizzes are a **separate model**, not a variant of domain 12's

Spec them fully; there is no delta to write. The evidence:

| | Domain 12 (text quizzes) | Domain 13 (this) |
|---|---|---|
| Container | `Quiz` (`schema.prisma:644-667`), owned by a `Season`, optionally linked to a `Session` (`sessionId Int?`, `SetNull`) | none — questions hang directly off `Session` (`schema.prisma:396-397`, `Cascade`) |
| Question | `QuizQuestion` (`:689-705`) — has `order`, `type` (`QuizQuestionType`), nullable `correctIndex` | `SessionVideoQuestion` (`:394-411`) — has `atSeconds`, no type, non-null `correctIndex` |
| Attempt wrapper | `QuizAttempt` (`:709-732`) with `attemptNumber`, `QuizAttemptStatus`, `autoScore`/`manualScore`/`totalScore` | **none** — answers are stored flat, one row per (question, student) |
| Answer | `QuizAnswer` (`:734-749`), keyed `(attemptId, questionId)`, carries `text` for essays and `pointsAwarded` | `SessionVideoQuestionResponse` (`:413-425`), keyed `(questionId, studentUserId)`, MCQ only, no points column |
| Stored score | `QuizGrade` (`:669-685`) and `QuizAttempt.totalScore` | **nothing is stored** — points are recomputed on every read (R71) |
| Retakes | explicit, via `attemptNumber` (`:715, 729`) | impossible by construction (R54) |
| Publish/draft | `Quiz.publishedAt` (`:655`) | none — a question is live the instant it is created (R18) |
| Authoring gate | `canManageQuiz` (`permissions.ts:135-145`) | `canManageSessionVideo` (`permissions.ts:120-131`) |
| Code | `quiz-actions.ts`, `quiz-query.ts` | `video-quiz-actions.ts`, `video-quiz-query.ts` — zero imports between the pairs |

The two features were built at different times against different tables and
share no runtime code. Consequences a v2 implementer must act on:

- **Do not unify the contracts.** `packages/shared/src/quiz.ts` (domain 12) and
  `packages/shared/src/video-quiz.ts` (§8) are separate files. A student's video
  answer is not a `QuizAnswer` and cannot be stored as one.
- **Do not unify the endpoints.** The parent resource differs: domain 12's is a
  `Quiz` id, this domain's is a `Session` id.
- **A student's video-quiz points do not appear in any gradebook**, because
  there is no `QuizGrade` row and no column to put one in (R72). If the product
  wants them counted, that is a schema change, which is blocked while the
  database is shared with v1 (`CLAUDE.md`, "Shared staging database"). §10 D10.

### `SessionVideoQuestion` (`prisma/schema.prisma:394-411`)

| Field | Meaning |
|---|---|
| `sessionId` → `Session` | `onDelete: Cascade` (`:397`). Sessions are **hard**-deleted in v1 (no `deletedAt` on `Session`, `:363-390`), so this cascade is live: deleting a session destroys its questions and, through `:416`, every recorded answer. |
| `atSeconds` `Int` | Offset from the start of the video, in whole seconds. The **only** binding between a question and a point in the video — there is no percentage, no range, no end time, and no video-id column (R14, R15). |
| `prompt` `String` | Plain text, rendered as the modal title (`interactive-video-player.tsx:356`). Not rich text — unlike `Submission.text` in domain 8. |
| `options` `String[]` | Postgres text array. Order is the answer order; index is the identity. |
| `correctIndex` `Int` | Non-null. Index into `options`. Withheld from the student read (R69). |
| `points` `Int @default(1)` | Per-question weight. Only ever summed at read time (R71). |
| `createdById` `Int?` → `User?` | `SetNull` (`:404`). **Written on create and never on update** (R5) and **read by nothing** — no query in v1 selects it. |
| `updatedAt` | Auto. Read by nothing. |
| `@@index([sessionId, atSeconds])` (`:410`) | An index, **not** a unique constraint — two questions may share a timestamp (R13). |

### `SessionVideoQuestionResponse` (`prisma/schema.prisma:413-425`)

| Field | Meaning |
|---|---|
| `questionId` → `SessionVideoQuestion` | `onDelete: Cascade` (`:416`). Deleting a question deletes every student's answer to it (R10). |
| `studentUserId` → `User` | `onDelete: Restrict` (`:418`) — a student with video answers cannot be hard-deleted. |
| `selectedIndex` `Int` | The chosen option index, as at answer time. **Not revalidated if `options` later shrinks** (R9). |
| `isCorrect` `Boolean` | **Computed once, at answer time** (`video-quiz-actions.ts:147`) and frozen. Never recomputed, so an edited answer key does not re-grade history (R8). |
| `answeredAt` | Auto `now()`. Read by nothing. |
| `@@unique([questionId, studentUserId])` (`:423`) | The whole "one answer, no retries" rule (R54). Load-bearing. |

There is no `pointsAwarded` column: a response records *whether* it was right,
never *what it was worth*. Changing `points` on the question therefore rewrites
history for every student who already answered (R8).

### `SessionVideoProgress` (`prisma/schema.prisma:427-438`)

| Field | Meaning |
|---|---|
| `sessionId` → `Session` | `Cascade` (`:430`). |
| `studentUserId` → `User` | `Restrict` (`:432`). |
| `furthestSeconds` `Int @default(0)` | How far the student has watched. Written by two paths with **contradictory semantics** — monotone from `saveVideoProgressAction` (R62), absolute `set` from `submitVideoAnswerAction` (R57). |
| `completedAt` `DateTime?` | Write-once (R63). The only durable record that a student finished a video quiz — and it is client-asserted (R65). |
| `updatedAt` | Auto. Read by nothing. |
| `@@unique([sessionId, studentUserId])` (`:437`) | Keys both upserts. |

**Nullable in the schema, treated as required in code:** none in this domain.
**Written but never read:** `SessionVideoQuestion.createdById`,
`SessionVideoQuestion.updatedAt`, `SessionVideoQuestionResponse.answeredAt`,
`SessionVideoProgress.updatedAt`.
**Absent but implied by the feature:** a video-duration column (R14, §10 D2), a
video-id column (R15), a `pointsAwarded` snapshot on the response, and any
`gatedAt`/`unlockedThrough` server-side watch marker (§10 D1).

### Enums and relations traversed but owned elsewhere

`Session.youtubeUrl`, `Session.seasonId`, `Session.title`, `Season.code`,
`SeasonEnrollment.status` (via `canAccessSeason`), `UserRole`. No enum in this
domain — there is no status field anywhere in its three tables.

## 3. Business rules

### Authoring — create, update, delete

- **R1.** All three authoring writes are gated on `canManageSessionVideo`, which
  returns true for SUPER unconditionally and otherwise requires the caller to be
  an ADMIN of the session's season; LEADER and MENTOR always fail —
  `src/lib/auth/permissions.ts:120-131`, called at
  `src/lib/video-quiz-actions.ts:41, 72, 101`.
- **R2.** The gate runs **before** input validation on create, so an
  unauthorized caller gets `ForbiddenError` rather than a validation message —
  `src/lib/video-quiz-actions.ts:41-44`.
- **R3.** A question validates as: `atSeconds` an integer in `[0, 86400]`;
  `prompt` trimmed, 2–500 characters; `options` an array of 2–6 trimmed strings
  each 1–200 characters; `correctIndex` a non-negative integer; `points` an
  integer in `[1, 100]` defaulting to 1 — `src/lib/video-quiz-actions.ts:15-22`.
- **R4.** `correctIndex` must be less than `options.length`, enforced by a
  `refine` that reports on the `correctIndex` path —
  `src/lib/video-quiz-actions.ts:23-26`.
- **R5.** `createdById` is stamped on create only; `updateVideoQuestionAction`
  writes the same five fields and never touches it, so the column means "who
  first authored this", not "who last changed it" —
  `src/lib/video-quiz-actions.ts:54` vs `:79-85`. No query in v1 reads it.
- **R6.** Update and delete resolve the question's `sessionId` with a
  `findUnique` first and gate on *that* session, so the caller never supplies
  the session — `src/lib/video-quiz-actions.ts:67-72, 96-101`.
- **R7.** Update rewrites all five authored fields every time; there is no
  partial update and no field-level diffing —
  `src/lib/video-quiz-actions.ts:79-85`.
- **R8.** **An update may change `correctIndex`, `options` or `points` after
  students have answered, and no existing `SessionVideoQuestionResponse` is
  re-graded** — `isCorrect` is frozen at answer time
  (`src/lib/video-quiz-actions.ts:147, 151`) and the update touches only the
  question row (`:77-86`). A corrected answer key leaves every prior grade
  wrong. *(implicit — nothing consults `responseCount`; the editor merely
  displays it, `src/components/sessions/video-questions-editor.tsx:75`)*
- **R9.** Shrinking `options` can strand an existing response whose
  `selectedIndex` is now out of range; nothing validates responses against the
  new array — `src/lib/video-quiz-actions.ts:77-86`. *(implicit)*
- **R10.** Deleting a question is a hard delete with no soft-delete column, and
  every `SessionVideoQuestionResponse` for it is removed by the database cascade
  — `src/lib/video-quiz-actions.ts:103`, `prisma/schema.prisma:416`. The confirm
  dialog is the only warning —
  `src/components/sessions/video-questions-editor.tsx:136-138`.
- **R11.** Deleting a question does not adjust any `SessionVideoProgress` row,
  so `furthestSeconds` can point past every remaining question and
  `completedAt` survives the deletion of the work that earned it —
  `src/lib/video-quiz-actions.ts:92-107`.
- **R12.** All three authoring writes revalidate **only**
  `/student/sessions/{sessionId}` and never the admin page they were invoked
  from — `src/lib/video-quiz-actions.ts:58, 88, 105`. The editor compensates
  with a client `router.refresh()` —
  `src/components/sessions/video-questions-editor.tsx:38, 59, 117`.
- **R13.** Nothing prevents two questions on the same session sharing an
  `atSeconds`; `@@index([sessionId, atSeconds])` is an index, not a unique
  constraint — `prisma/schema.prisma:410`. Both fire, sequentially (R80).
- **R14.** **`atSeconds` is never validated against the video's length.** v1
  never stores a duration and never fetches one — the only `getDuration()` call
  is client-side and its value is never sent to the server
  (`src/components/sessions/interactive-video-player.tsx:142`). The sole bound
  is the 24-hour `max(86_400)` in the schema
  (`src/lib/video-quiz-actions.ts:17`). Consequence: R78.
- **R15.** **A question is bound to a `sessionId`, not to a video.** There is no
  video-id column (`prisma/schema.prisma:394-411`), so editing
  `Session.youtubeUrl` (`src/lib/session-actions.ts:132`) silently re-points
  every existing question and every recorded answer at a different video, at the
  same timestamps.
- **R16.** Editing a session that belongs to a recurrence group writes the same
  `youtubeUrl` to **every** sibling session, while video questions remain
  per-session — `src/lib/session-actions.ts:138-151`. Domain 3's rule; recorded
  here because it is the fastest way to reach R15 by accident (§10 D12).
- **R17.** The admin editor renders whenever `session.youtubeUrl` is merely
  truthy; `parseYouTubeId` is never called on the admin side —
  `src/app/admin/season/[code]/sessions/[id]/page.tsx:206`. An admin can
  therefore author a full quiz against a URL the student player can never load
  (R37).
- **R18.** No server-side write checks that the session has a `youtubeUrl` at
  all — `createVideoQuestionAction` takes a bare `sessionId`
  (`src/lib/video-quiz-actions.ts:36-60`). The `youtubeUrl` condition exists
  only as the admin page's render branch. *(implicit)*

### Timestamps — `video-time.ts`

- **R19.** `formatTimestamp` floors to whole seconds and clamps negatives to
  zero, then emits `h:mm:ss` when the value is an hour or more and `m:ss`
  otherwise, zero-padding only the trailing components —
  `src/lib/video-time.ts:2-10`.
- **R20.** `formatTimestamp(NaN)` returns the string `"NaN:NaN"`:
  `Math.floor(NaN)` is `NaN` and `Math.max(0, NaN)` is `NaN`, and there is no
  finiteness guard — `src/lib/video-time.ts:3-9`. Reachable if the player's
  `getDuration()`/`getCurrentTime()` ever return a non-number, which is the
  displayed clock at `src/components/sessions/interactive-video-player.tsx:290`.
- **R21.** `parseTimestamp` trims the whole input, returns null for the empty
  string, and returns null for more than three colon-separated parts —
  `src/lib/video-time.ts:15-19`.
- **R22.** Every part is converted with `Number()` and rejected unless it is a
  non-negative integer — `src/lib/video-time.ts:21-22`. This rejects fractions
  (`"1.5"`), `Infinity`, and any non-numeric text.
- **R23.** **`Number("")` is `0`, so empty components parse as zero rather than
  failing.** `":"` → 0 s, `"1:"` → 60 s, `":30"` → 30 s, `"::"` → 0 s, `"1::"` →
  3600 s — `src/lib/video-time.ts:21-30`. A typo becomes a silently valid
  timestamp.
- **R24.** Non-decimal numeric literals are accepted because `Number()` accepts
  them: `"0x10"` parses to 16 seconds and `"1e3"` to 1000 seconds —
  `src/lib/video-time.ts:21-22`.
- **R25.** For a two-part input the seconds component must be under 60; for a
  three-part input both the minutes and the seconds components must be. The
  **leading** component is unbounded in both cases —
  `src/lib/video-time.ts:25-30`.
- **R26.** A single-part input is read as plain seconds with no `< 60`
  constraint, so `"90"` is 90 seconds — `src/lib/video-time.ts:24`.
- **R27.** `parseTimestamp` applies **no upper bound**. `"9999:59"` returns
  599,999, which then fails the action's `max(86_400)`
  (`src/lib/video-quiz-actions.ts:17`) — the rejection happens a network
  round-trip later, in a different vocabulary. *(implicit — the bound exists,
  just not where the input is parsed)*
- **R28.** When the action rejects, the editor renders only `result.error` —
  the constant `"Please fix the highlighted fields."`
  (`src/lib/video-quiz-actions.ts:227`) — and **never reads `fieldErrors`**
  (`src/components/sessions/video-questions-editor.tsx:212-215`). The admin is
  told to fix highlighted fields, and nothing is highlighted. *(implicit)*
- **R29.** Every value `formatTimestamp` emits round-trips exactly through
  `parseTimestamp`; the reverse does not hold, because R26 means `"90"` is
  accepted and redisplayed as `"1:30"` on the next edit —
  `src/components/sessions/video-questions-editor.tsx:156, 184`.

### YouTube URL parsing — `youtube.ts`

- **R30.** `parseYouTubeId` tries four **unanchored** regexes in order and
  returns the first capture, each requiring exactly 11 characters from
  `[A-Za-z0-9_-]` — `src/lib/youtube.ts:4-13`. Returns null when none match
  (`:14`).
- **R31.** **Accepted forms** (any host, any scheme, any surrounding text):
  anything containing `?v=` or `&v=` followed by 11 id characters — so
  `youtube.com/watch?v=ID`, `m.youtube.com/watch?v=ID`, `…?v=ID&t=42`,
  `…&list=X&v=ID`; anything containing `youtu.be/` + 11 chars — so
  `youtu.be/ID` and `youtu.be/ID?t=42`; anything containing `/embed/` + 11
  chars; anything containing `/shorts/` + 11 chars — `src/lib/youtube.ts:5-8`.
- **R32.** **Silently rejected forms** — each returns null, and the student page
  then degrades to a plain external link with no message (R37):
  `youtube.com/live/ID` (live streams and premieres), the legacy
  `youtube.com/v/ID` embed, a bare 11-character id pasted with no surrounding
  URL, a playlist URL with no `v=`, a percent-encoded `attribution_link`
  (`%3Fv%3D` does not match the literal `?v=` the regex needs), and any id
  shorter than 11 characters — `src/lib/youtube.ts:4-14`.
- **R33.** **There is no host check.** `https://example.com/embed/AAAAAAAAAAA`
  parses successfully and its "id" is handed to the YouTube IFrame player —
  `src/lib/youtube.ts:6-8`, `src/app/student/sessions/[id]/page.tsx:47, 77`.
  The result is a wrong video, not an injection: the id is only ever used as a
  YouTube `videoId`. *(implicit — the "is this YouTube" rule exists nowhere)*
- **R34.** **There is no trailing boundary.** A token longer than 11 characters
  after `v=` yields its first 11 characters as the id — so a 12-character value
  silently produces a valid-looking but wrong id rather than failing —
  `src/lib/youtube.ts:5`.
- **R35.** Start-offset parameters (`?t=`, `&t=`, `&start=`) match nothing and
  are discarded; a URL that points at 2:30 of a video always opens the quiz
  player at 0 (or at the resume point, R44) — `src/lib/youtube.ts:4-13`.
- **R36.** The only validation applied when the URL is *saved* is
  `z.string().url()` — no YouTube check, no `parseYouTubeId` call —
  `src/lib/session-actions.ts:25`. Domain 3's rule; the failure it permits
  surfaces here, silently, at student render time (§10 D7).
- **R37.** When `parseYouTubeId` returns null the student page renders a plain
  "Watch recording" anchor to the raw URL and **the entire quiz becomes
  unreachable with no message to anyone** —
  `src/app/student/sessions/[id]/page.tsx:47, 76-90`. The admin editor keeps
  working and keeps accepting new questions (R17).
- **R38.** The interactive player renders only when the parse succeeded **and**
  at least one question exists; a video with zero questions falls back to the
  same plain link — `src/app/student/sessions/[id]/page.tsx:49, 76-90`.
  *(implicit — `hasInteractiveVideo` is a page-local derivation)*

### Playback gating — the barrier

- **R39.** The **barrier** is the smallest `atSeconds` among questions the
  student has not answered, or `+Infinity` when all are answered —
  `src/components/sessions/interactive-video-player.tsx:108-113`.
- **R40.** `allowedMax` is the barrier, or the full duration once the barrier is
  `Infinity` — `src/components/sessions/interactive-video-player.tsx:123`.
- **R41.** The custom seek bar clamps any forward seek to `allowedMax`; seeking
  **backwards is unrestricted** —
  `src/components/sessions/interactive-video-player.tsx:227-235`.
- **R42.** A 250 ms interval reads `getCurrentTime()`, and when it is within
  0.1 s of the barrier it pauses the video, seeks exactly back to the barrier,
  and opens the question modal —
  `src/components/sessions/interactive-video-player.tsx:171-189`. The poll
  short-circuits while a question is already open (`:173`), so it cannot stack
  modals. Because the pause/snap is keyed on `t >= gate - 0.1` rather than on
  how the student got there, a jump *past* the barrier is also caught — within
  one poll tick.
- **R43.** Native YouTube controls are suppressed via
  `playerVars: { controls: 0, fs: 0, rel: 0, modestbranding: 1, playsinline: 1 }`,
  which is why the custom bar is described in the source as "the only way to
  scrub, so gating holds" —
  `src/components/sessions/interactive-video-player.tsx:139, 252`. **`disablekb`
  is not among those vars**, so the IFrame player's own keyboard seeking is left
  enabled; R42's snap-back is the only thing that recovers from it.
- **R44.** On player ready the student is resumed to
  `min(furthestSeconds, barrier)`, and only when that value is greater than zero
  — `src/components/sessions/interactive-video-player.tsx:143-144`.
- **R45.** The question modal **cannot be dismissed**: `onOpenChange` is a no-op
  and there is no close control —
  `src/components/sessions/interactive-video-player.tsx:353`. The only exits are
  answering (R46) or leaving the page.
- **R46.** After answering, "Continue" closes the modal and resumes playback —
  `src/components/sessions/interactive-video-player.tsx:221-225`. The answer
  buttons disable themselves once feedback has arrived (`:367`).
- **R47.** **The gate is enforced nowhere but this component.**
  `submitVideoAnswerAction` never reads `SessionVideoProgress`, never compares
  `atSeconds` to anything, and never checks whether earlier questions were
  answered — `src/lib/video-quiz-actions.ts:115-170`. Any caller that can reach
  the action can answer every question on a session, in any order, having played
  no video at all. *(implicit — and it evaporates the moment an API exists;
  §10 D1)*
- **R48.** `saveVideoProgressAction` accepts whatever `furthestSeconds` and
  `completed` the client asserts, subject only to range validation —
  `src/lib/video-quiz-actions.ts:179-217`. A single call with
  `(sessionId, 0, true)` marks a student complete. *(implicit)*
- **R49.** Progress is persisted on three client events: the player entering the
  `PAUSED` state, the document becoming hidden, and component unmount —
  `src/components/sessions/interactive-video-player.tsx:154, 198, 163`. Nothing
  saves on a fixed timer, so a student who closes the tab mid-play loses
  everything since the last pause. All three send
  `Math.floor(furthestRef.current)` (`:127`).

### Answering

- **R50.** Answering requires the caller's role to be exactly `STUDENT` and
  `canAccessSeason` to pass for the question's season —
  `src/lib/video-quiz-actions.ts:132-133`.
- **R51.** **`canAccessSeason`'s student branch accepts any `SeasonEnrollment`
  row for the pair, with no status filter** —
  `src/lib/auth/permissions.ts:63-67` — whereas the page that renders the player
  requires an enrollment with `status: "ACTIVE"`
  (`src/app/student/sessions/[id]/page.tsx:29-33`). A dropped or completed
  student therefore fails the page and passes the action. *(implicit — the
  stricter rule lives only in the page's `where` clause)*
- **R52.** The question lookup runs **before** the role check, so any
  authenticated user can distinguish an existing question id (throws
  `ForbiddenError`) from a non-existent one (returns "Question not found.") —
  `src/lib/video-quiz-actions.ts:121-133`. *(implicit)*
- **R53.** `selectedIndex` must be within `[0, options.length)`; the options are
  loaded from the row rather than trusted from the client —
  `src/lib/video-quiz-actions.ts:135-137`.
- **R54.** **One answer per question, forever.** If a response already exists
  the action returns the recorded `isCorrect` plus `correctIndex` without
  writing anything — `src/lib/video-quiz-actions.ts:139-145` — and the database
  would refuse a second row anyway (`prisma/schema.prisma:423`). There is no
  retake, no reset, and no admin path to clear a response short of deleting the
  question (R10).
- **R55.** Correctness is `selectedIndex === correctIndex`, evaluated once and
  stored — `src/lib/video-quiz-actions.ts:147, 151`.
- **R56.** The response insert and the progress upsert run inside a single
  `db.$transaction` — `src/lib/video-quiz-actions.ts:149-167`. One of the few
  transactional write paths in v1.
- **R57.** **That progress write uses `{ set: question.atSeconds }`, not a
  maximum** — `src/lib/video-quiz-actions.ts:165`. Answering an earlier question
  after a later one moves `furthestSeconds` **backwards**, directly
  contradicting the comment two functions below it ("furthestSeconds only ever
  moves forward", `:178`) and the `Math.max` that enforces it there (`:201`).
  Unreachable through the client, because the barrier forces ascending order
  (R39); trivially reachable through an API.
- **R58.** Answering never sets `completedAt`, even when it is the last
  unanswered question — `src/lib/video-quiz-actions.ts:149-167`. Completion has
  exactly one writer (R65).
- **R59.** Two concurrent submissions for the same question hit the unique
  constraint and the action does not catch it, so the raw Prisma error escapes;
  the only protection is the component's `submitting` flag —
  `src/lib/video-quiz-actions.ts:150-152`,
  `src/components/sessions/interactive-video-player.tsx:205`. *(implicit)*
- **R60.** `correctIndex` is returned on every successful submit, including the
  replay of an already-recorded answer — `src/lib/video-quiz-actions.ts:144,
  169`. This is deliberate feedback and is safe only because R54 makes the first
  answer final.

### Progress and completion

- **R61.** Progress validates as `furthestSeconds` an integer in `[0, 86400]`
  and `completed` a boolean defaulting to false —
  `src/lib/video-quiz-actions.ts:172-175`. A failure returns the flat string
  `"Invalid progress."` with no field detail (`:195`).
- **R62.** `furthestSeconds` is written as
  `Math.max(existing ?? 0, submitted)`, so through this path it only ever
  advances — `src/lib/video-quiz-actions.ts:201`.
- **R63.** `completedAt` is write-once: an existing value always wins, and a
  `completed: false` call never clears one —
  `src/lib/video-quiz-actions.ts:202-203, 213`. There is no un-complete
  operation anywhere in v1.
- **R64.** The action reads the current row and then upserts, outside a
  transaction, so two concurrent saves can lose the higher value —
  `src/lib/video-quiz-actions.ts:197-214`.
- **R65.** Completion is asserted by the client when the player reports `ENDED`
  **and** the barrier is `Infinity`, i.e. every question is answered —
  `src/components/sessions/interactive-video-player.tsx:147-152`. If the student
  answers the last question near the end and leaves before the video runs out,
  the quiz is never marked complete; there is no server-side derivation to fall
  back on. *(implicit)*
- **R66.** `saveVideoProgressAction` checks the role and the season but never
  checks that the session has a video or any questions, so progress rows can
  exist for sessions with no quiz —
  `src/lib/video-quiz-actions.ts:184-192`. *(implicit)*
- **R67.** Both student writes reject any non-`STUDENT` role outright
  (`src/lib/video-quiz-actions.ts:132, 185`), so no progress or response row can
  exist for an admin, leader or mentor. An admin cannot preview the quiz as a
  student would experience it.

### Reads, ordering, and the answer key

- **R68.** `listVideoQuestions` returns every question for a session ordered by
  `atSeconds` ascending, **including `correctIndex`**, plus a `_count` of
  responses — `src/lib/video-quiz-query.ts:40-61`.
- **R69.** **`loadStudentVideoQuiz` withholds the answer key.** Its select is
  `id, atSeconds, prompt, options, points` — `correctIndex` is absent —
  `src/lib/video-quiz-query.ts:71-73`. The student payload contains the answer
  key for **no** question, answered or not; correctness reaches the client only
  as the boolean `isCorrect` (R70) and as the `correctIndex` returned by the
  submit action for the question just answered (R60). This is the one place
  where v1 gets the exposure question right by construction, and it is the
  behaviour v2 must preserve.
- **R70.** The student read joins the student's own responses (filtered by
  `studentUserId` and `question: { sessionId }`) and returns per question
  `answered`, `selectedIndex` and `isCorrect`, all null when unanswered —
  `src/lib/video-quiz-query.ts:74-77, 96-101`.
- **R71.** `earnedPoints`, `totalPoints` and `answeredCount` are computed in the
  read and **stored nowhere** — `src/lib/video-quiz-query.ts:86-110`.
  `answeredCount` is `responses.length`, i.e. answers to *this session's*
  questions only (`:74-77, 110`).
- **R72.** **No grade row is ever written for a video quiz.** There is no
  `QuizGrade`, no `QuizAttempt`, and no score column on any of the three tables
  (`prisma/schema.prisma:394-438`). A video-quiz score exists only for as long
  as `loadStudentVideoQuiz` runs.
- **R73.** Neither query performs any authorization; both take a `sessionId`
  (and, for the student read, a `studentUserId`) on trust and rely entirely on
  the calling page's checks — `src/lib/video-quiz-query.ts:37-39, 64-67`.
  *(implicit)*
- **R74.** **No admin surface shows any student's video-quiz result.** The only
  aggregate rendered anywhere is `responseCount` per question —
  `src/components/sessions/video-questions-editor.tsx:75` — which counts
  answers, not correct answers, and is not broken down by student. A season
  admin cannot see who answered, what they chose, or what they scored.
  *(implicit — the capability is missing, not gated)*
- **R75.** Neither query is paginated or bounded —
  `src/lib/video-quiz-query.ts:40-52, 69-82`. In practice a session has a
  handful of questions, so this is a shape note rather than a live problem.
  *(implicit)*
- **R76.** **No other code in v1 reads any of these three tables.** A grep for
  the three model accessors across `src/` and `prisma/seed.ts` matches only
  `video-quiz-actions.ts` and `video-quiz-query.ts`. Video-quiz results appear
  in no dashboard, no engagement metric (`src/lib/engagement.ts`), no season
  export (`src/lib/season-export.ts`), and no report. *(implicit — the feature's
  output is invisible to the program by omission)*
- **R77.** `prisma/seed.ts` creates no video questions, responses or progress
  rows, so every environment starts this feature empty.

### Edge cases the design admits

- **R78.** **A question whose `atSeconds` exceeds the video's duration is
  unreachable and freezes the quiz permanently.** The barrier equals that
  timestamp (R39), so the poll's `t >= gate - 0.1` never fires (playback caps at
  the duration), the modal never opens, the student can never answer, and
  because the barrier is not `Infinity` the `ENDED` handler skips both
  `setCompleted(true)` and the completion save —
  `src/components/sessions/interactive-video-player.tsx:147-152, 181-187`.
  Nothing on the authoring side can prevent it (R14).
- **R79.** In exactly that case the UI **hides the evidence**: `lockedFraction`
  falls back to 1 when `allowedMax >= duration`, so no locked region is drawn,
  and the "Answer to unlock" badge is suppressed by the same condition —
  `src/components/sessions/interactive-video-player.tsx:244, 292`. The student
  sees an ordinary player that simply never completes. *(implicit)*
- **R80.** Two questions sharing an `atSeconds` (R13) both fire: the poll
  selects the first *unanswered* question at that exact timestamp
  (`src/components/sessions/interactive-video-player.tsx:182`), and after
  "Continue" resumes playback the barrier is unchanged, so the next tick opens
  the second one. Correct by accident, not by design.
- **R81.** The player registers only `onReady` and `onStateChange` — **there is
  no `onError` handler** —
  `src/components/sessions/interactive-video-player.tsx:140-157`, and
  `loadYouTubeApi` returns a promise that never rejects and never times out
  (`:50-68`). A deleted, private, region-blocked or embed-disabled video, or a
  blocked `youtube.com/iframe_api` script, leaves a permanently black box with
  no message, no retry and no fallback link.
- **R82.** A question at `atSeconds: 0` is legal (R3) and pauses the video
  before the first frame plays: `resumeTo` is 0 so no seek happens
  (`src/components/sessions/interactive-video-player.tsx:143-144`) and the first
  poll tick satisfies `0 >= -0.1` (`:181`).
- **R83.** There is no timezone logic anywhere in this domain. The only
  timestamps are `answeredAt`, `completedAt` and `updatedAt`, all server
  `now()`, and none is ever formatted for a user
  (`prisma/schema.prisma:421, 434-435`). `atSeconds` is a duration, not a clock
  time. This domain is the one place the project-wide timezone problem does not
  apply.

## 4. Authorization

Role gates are pure claims checks (`src/lib/rbac.ts`, `requireRole` at
`src/lib/auth/permissions.ts:25-35`). Row-scoped gates hit the database.

| Operation | Roles | Row-scoped condition | v1 citation |
|---|---|---|---|
| Create question | SUPER, ADMIN | `isAdminOfSeason(user, session.seasonId)`; SUPER short-circuits | `src/lib/video-quiz-actions.ts:41`; `src/lib/auth/permissions.ts:120-131` |
| Update question | SUPER, ADMIN | same, resolved via the question's `sessionId` | `src/lib/video-quiz-actions.ts:67-72` |
| Delete question | SUPER, ADMIN | same | `src/lib/video-quiz-actions.ts:96-101` |
| Open the authoring editor | ADMIN, SUPER | `canEditSeason` on the season in the URL, and the session must belong to it | `src/app/admin/season/[code]/sessions/[id]/page.tsx:39, 42, 45` |
| Read questions **with** the answer key | **none — the query checks nothing** | none | `src/lib/video-quiz-query.ts:37-39` *(implicit: the admin page is the only gate)* |
| Read the student quiz view | **none — the query checks nothing** | none | `src/lib/video-quiz-query.ts:64-67` *(implicit: the student page is the only gate)* |
| Open the student player page | STUDENT only | an enrollment in the session's season with `status: "ACTIVE"` | `src/app/student/sessions/[id]/page.tsx:24, 29-33` |
| Submit an answer | STUDENT only | `canAccessSeason` — **any** enrollment row, any status | `src/lib/video-quiz-actions.ts:132-133`; `src/lib/auth/permissions.ts:61-68` |
| Save progress | STUDENT only | `canAccessSeason`, same looseness | `src/lib/video-quiz-actions.ts:185, 192` |
| View any student's results | **nobody — the capability does not exist** | — | R74 |

Things a v2 implementer must not reproduce or must add:

- **LEADER and MENTOR have no access to this domain at all.** They cannot
  author (R1) and they cannot see results, because no result surface exists
  (R74). That is an omission rather than a decision — §10 D10.
- **Both queries are unauthorized functions.** In v1 that is survivable because
  a server component is the only caller. Behind an HTTP endpoint each needs its
  own gate, and `listVideoQuestions` in particular **must not** be reachable by
  a student: it carries `correctIndex` for every question (R68).
- **The answer gate is looser than the page gate** (R51). v2 should gate on the
  same ACTIVE-enrollment condition the page uses, or explicitly decide that a
  dropped student may keep answering — §10 D9.
- **The playback gate is not an authorization rule in v1 at all** (R47). If v2
  wants it to be one, it has to be built — §10 D1.

## 5. Read surface

**`listVideoQuestions(sessionId)`** — `src/lib/video-quiz-query.ts:37-62`.
One query. Returns an array of `VideoQuestionAdmin`: `id`, `atSeconds`,
`prompt`, `options`, `correctIndex`, `points`, `responseCount`. Ordered
`atSeconds` ascending (`:42`). `responseCount` comes from a Prisma `_count`
(`:50`), so there is no N+1. **Carries the answer key** — this shape must never
reach a student (R68). Called from exactly one place, unconditionally, even when
the session has no video: `src/app/admin/season/[code]/sessions/[id]/page.tsx:63`.

**`loadStudentVideoQuiz(sessionId, studentUserId)`** —
`src/lib/video-quiz-query.ts:64-112`. Three queries in one `Promise.all`
(`:68-82`): the questions, the student's own responses, and the progress row.
Joined in memory through a `Map` keyed on `questionId` (`:84`). Returns
`StudentVideoQuiz`: the question array (each with `id`, `atSeconds`, `prompt`,
`options`, `points`, `answered`, `selectedIndex`, `isCorrect`), plus
`furthestSeconds` (0 when there is no progress row), `completedAt`,
`earnedPoints`, `totalPoints` and `answeredCount`. No role branching exists
because only one role can ever call it (R67). **Returns nothing the page does
not render** — the page passes the whole object into the player
(`src/app/student/sessions/[id]/page.tsx:77`), which uses every field.

**No other read exists.** There is no per-student results read, no per-session
roll-up, no cross-session history, and no leader- or admin-facing view of
anything a student answered (R74, R76). Any such screen in v2 is a new
capability, not a port.

**Over-fetch note:** the student page calls `loadStudentVideoQuiz` whenever a
video id parsed, then discards the result if there are no questions
(`src/app/student/sessions/[id]/page.tsx:48-49`) — three queries for a session
with no quiz. The admin page calls `listVideoQuestions` even when the session
has no `youtubeUrl` and the editor will not render (`:63` vs `:206`).

## 6. Write surface

| Action | Inputs | Validation | Writes | Cascades / side effects | Returns |
|---|---|---|---|---|---|
| `createVideoQuestionAction` `video-quiz-actions.ts:36-60` | `sessionId`, `VideoQuestionInput` | `canManageSessionVideo` first (R2), then `questionSchema` (R3, R4). **No check that the session exists, has a video, or that `atSeconds` fits it** (R14, R18) | one `SessionVideoQuestion` row, `createdById` = caller | revalidates `/student/sessions/{sessionId}` only (R12) | `{ ok: true }` or `{ ok: false, error, fieldErrors }` |
| `updateVideoQuestionAction` `:62-90` | `questionId`, `VideoQuestionInput` | question exists; `canManageSessionVideo` on its session; `questionSchema` | all five authored fields | **existing responses are not re-graded** (R8, R9); revalidates the student path | same |
| `deleteVideoQuestionAction` `:92-107` | `questionId` | question exists; `canManageSessionVideo` | deletes the question row | database cascade removes every `SessionVideoQuestionResponse` (R10); `SessionVideoProgress` left stale (R11) | `{ ok: true }` |
| `submitVideoAnswerAction` `:115-170` | `questionId`, `selectedIndex` | question exists; role STUDENT; `canAccessSeason`; index in range (R53). **No progress, ordering or barrier check** (R47) | `SessionVideoQuestionResponse` **and** `SessionVideoProgress.furthestSeconds` | both inside one `$transaction` (R56); progress uses `set`, not max (R57); duplicate submit throws uncaught (R59) | `{ ok: true, isCorrect, correctIndex }` |
| `saveVideoProgressAction` `:179-217` | `sessionId`, `furthestSeconds`, `completed` | session exists; role STUDENT; `canAccessSeason`; `progressSchema` (R61). **Values are taken on trust** (R48) | upserts `SessionVideoProgress` | none; no revalidation at all | `{ ok: true }` |

**Non-atomic sequences to fix in v2:**

1. `saveVideoProgressAction` reads the current row and then upserts, without a
   transaction — `video-quiz-actions.ts:197-214`. Two concurrent saves (easy:
   `visibilitychange` and unmount fire together) can persist the lower value.
   A conditional update or a database-side `GREATEST` removes the race.
2. `updateVideoQuestionAction` changes the answer key without touching the
   responses it invalidates (R8). Whatever §10 D5 decides, the re-grade and the
   question update must be one transaction.
3. `deleteVideoQuestionAction` relies on the database cascade for the responses
   but leaves `SessionVideoProgress` describing a quiz that no longer exists
   (R11).

**Errors are strings, not codes.** Every failure is
`{ ok: false, error: "<English sentence>" }` (`video-quiz-actions.ts:11-13`),
except authorization, which throws `ForbiddenError`. The one structured error
path — `fieldErrors` from `zodErrors` (`:219-228`) — is produced by the actions
and then discarded by the only consumer (R28). v2's API replaces all of this
with codes (§7).

## 7. Proposed API

Base `/api/v1`. Envelope `{ data }` / `{ error: { code, message } }` per
`CLAUDE.md`. **Every endpoint below is new** — `apps/backend/src/routes/` has no
video-quiz route file, and `sessions.ts` exposes only `GET /:id`,
`GET|POST /:id/attendance`, `POST /check-in`, `POST /:id/check-in-open` and
`POST /:id/check-in-close` (`apps/backend/src/routes/sessions.ts:25, 89, 146,
163, 207, 234`). The migration design's "none" (`2026-08-21-full-migration-design.md:126`)
is accurate.

| Method | Path | Status | Auth | Request | Response |
|---|---|---|---|---|---|
| GET | `/sessions/:id/video-quiz` | **new** | bearer; STUDENT with an ACTIVE enrollment in the session's season | — | `StudentVideoQuiz` (§8) — **never `correctIndex`** (R69) |
| POST | `/sessions/:id/video-quiz/answers` | **new** | bearer; same gate as above | `{ questionId, selectedIndex }` | `{ isCorrect, correctIndex, furthestSeconds }` |
| PUT | `/sessions/:id/video-quiz/progress` | **new** | bearer; same gate | `{ furthestSeconds, completed? }` | `{ furthestSeconds, completedAt }` |
| GET | `/sessions/:id/video-questions` | **new** | bearer; `canManageSessionVideo` | — | `VideoQuestionAdmin[]` — carries the answer key |
| POST | `/sessions/:id/video-questions` | **new** | bearer; `canManageSessionVideo` | `VideoQuestionInput` | created `VideoQuestionAdmin` 201 |
| PATCH | `/video-questions/:questionId` | **new** | bearer; `canManageSessionVideo` on the question's session | `VideoQuestionInput` | updated `VideoQuestionAdmin` |
| DELETE | `/video-questions/:questionId` | **new** | bearer; same | — | `{ deleted: true, responsesRemoved: n }` |
| GET | `/sessions/:id/video-quiz/results` | **new capability** (v1 has none — R74) | bearer; `canManageSessionVideo`, or LEADER for their own group members | query `groupId?` | per-student rows: answered count, earned/total points, completion |

Design points that must be settled before these are written, rather than
discovered afterwards:

- **The two GETs are the same resource with different sensitivity.** Keep them
  as two paths with two gates rather than one endpoint that role-branches its
  fields. A single endpoint that conditionally includes `correctIndex` is one
  refactor away from leaking the answer key; two paths cannot.
- **The answer endpoint is nested under the session, not addressed by
  `questionId` alone**, so the season gate has a parent to resolve without an
  extra lookup, and so a mismatched `(sessionId, questionId)` pair is a 404
  rather than a silent success. v1 addresses questions by bare id
  (`video-quiz-actions.ts:115`), which is what makes R52's probe possible.
- **The answer endpoint must decide the gating question (§10 D1) before it is
  written.** If server-side gating is adopted, this endpoint rejects an answer
  whose `atSeconds` is beyond the student's recorded `furthestSeconds` plus a
  tolerance, and the progress endpoint becomes the sole writer of that value.
  If it is not adopted, that must be written down as a deliberate decision, not
  left as an accident of the port.
- **The progress endpoint should not accept `completed` as a client claim**
  (R48, R65). Derive it: the server knows the question set and the responses.
  See §10 D3.
- **`PUT`, not `PATCH`, for progress**, because the write is idempotent and
  monotone — a repeated call with the same value must be a no-op, which is the
  behaviour R62 already has and R57 breaks.
- **`responsesRemoved` on the delete response** exists so the client can warn
  before and confirm after; v1 destroys answers with only a static confirm
  string (R10).
- **No endpoint parses YouTube URLs.** Video-id extraction belongs to domain 3's
  session contract, and it should be resolved **once, server-side**, and
  returned as a field (§10 D7) rather than re-implemented in the mobile client.

## 8. Proposed shared contracts

New file `packages/shared/src/video-quiz.ts`. Nothing in `packages/shared`
covers this domain today (`assignment.ts`, `attendance.ts`, `auth.ts`,
`enums.ts`, `group.ts`, `navigation.ts`, `season.ts`, `session.ts`,
`submission.ts`). Per `CLAUDE.md`, contracts are Zod with `z.infer` types, not
bare interfaces — both of v1's shapes (`VideoQuestionAdmin`,
`StudentVideoQuestion`/`StudentVideoQuiz`, `video-quiz-query.ts:5-35`) are
interfaces and must land as schemas.

| Contract | Kind | Fields |
|---|---|---|
| `videoQuestionInputSchema` | new | `atSeconds` int 0–86400; `prompt` trimmed 2–500; `options` array of trimmed 1–200 strings, length 2–6; `correctIndex` non-negative int; `points` int 1–100 default 1; plus the cross-field refinement `correctIndex < options.length`. Mirrors `video-quiz-actions.ts:15-26` exactly — see §10 D2 for the extra `atSeconds` bound. |
| `videoQuestionAdminSchema` | **convert** from `VideoQuestionAdmin` (`video-quiz-query.ts:5-13`) | `id`, `atSeconds`, `prompt`, `options`, `correctIndex`, `points`, `responseCount`. Admin-only; must never be the parse target of a student-facing hook. |
| `studentVideoQuestionSchema` | **convert** from `StudentVideoQuestion` (`:17-26`) | `id`, `atSeconds`, `prompt`, `options`, `points`, `answered`, `selectedIndex` nullable, `isCorrect` nullable. **No `correctIndex` field may exist on this schema** — its absence is the enforcement of R69 at the client boundary. |
| `studentVideoQuizSchema` | **convert** from `StudentVideoQuiz` (`:28-35`) | `questions`, `furthestSeconds`, `completedAt` (ISO string, per the note in `season.ts`), `earnedPoints`, `totalPoints`, `answeredCount`. Add `videoId` and `durationSeconds` if §10 D2/D7 are adopted. |
| `submitVideoAnswerRequestSchema` | new | `questionId` positive int; `selectedIndex` non-negative int. Upper bound is row-dependent, so it stays a server check (R53). |
| `submitVideoAnswerResponseSchema` | new | `isCorrect`, `correctIndex`, `furthestSeconds`. |
| `videoProgressRequestSchema` | new | `furthestSeconds` int 0–86400; `completed` optional boolean — drop the field entirely if §10 D3 makes completion server-derived. |
| `videoProgressResponseSchema` | new | `furthestSeconds`, `completedAt` nullable ISO string. |
| `videoQuizResultRowSchema` | new (no v1 counterpart) | `studentUserId`, `studentName`, `answeredCount`, `questionCount`, `earnedPoints`, `totalPoints`, `completedAt`. Backs the new results endpoint. |

**Reuse, do not redefine:** `Session` identity and `youtubeUrl` come from
`packages/shared/src/session.ts` — `SessionDetail` already carries
`youtubeUrl: string | null` (`session.ts:42`) and is itself a bare interface
awaiting conversion under domain 3. This domain must **not** add a second
session shape; if §10 D7 is adopted, the resolved `videoId` is a new field on
domain 3's session contract, added by domain 3.

**Timestamp helpers are shared UI logic, not contracts.** `formatTimestamp` and
`parseTimestamp` (`src/lib/video-time.ts`) are needed by both the mobile
authoring screen and the player. They belong in `packages/shared` as plain
functions **with unit tests** — this is the one file in the domain where the
defects (R20, R23, R24, R27) are cheap to fix and expensive to leave (§10 D8).

## 9. Screens

The v2 tree is flat (`apps/mobile/app/(app)/`: `assignments`, `calendar`,
`dashboard`, `events`, `groups`, `history`, `more`, `notes`, `profile`,
`quizzes`, `reports`, `season`, `seasons`, `settings`, `students/`,
`submissions`, `users`). **There are no dynamic segments anywhere in it**, so
every route below is new. Note `quizzes.tsx` exists — that is domain 12's
route; this domain does **not** live under it (§2).

| v1 page(s) | v2 route | Exists? | Roles | Notes |
|---|---|---|---|---|
| `/student/sessions/[id]` video half (`src/app/student/sessions/[id]/page.tsx:76-90`) | `/sessions/[id]` | **no — must be created** (domain 3 owns the route; this domain owns the video section inside it) | STUDENT | The player, the barrier, the question modal, the score card. The single largest piece of work in this domain — see §10 D11 for the platform constraint. |
| `/admin/season/[code]/sessions/[id]` video-questions card (`src/app/admin/season/[code]/sessions/[id]/page.tsx:200-214`) | `/sessions/[id]` | **no — must be created** (same route, admin branch) | ADMIN, SUPER | Question list, timestamp field, 2–6 option rows, correct-answer picker, delete confirm. Flat-and-role-driven means the admin editor and the student player are two branches of one route. |
| — (v1 has no such page, R74) | `/sessions/[id]` results branch, or a section of the admin branch | **no** | ADMIN, SUPER, and LEADER for their own group members | New capability. Without it a video quiz produces no visible output for anyone but the student who took it (§10 D10). |

Screen-level constraints that follow from §3:

- **The seek bar must be re-implemented, not ported.** v1's is a `div` with an
  `onClick` that converts an x-offset to a time
  (`interactive-video-player.tsx:227-235`). On a touch device that needs a real
  gesture handler with a drag affordance and a 44 px touch target
  (`jpc-space/CLAUDE.md`, "Touch targets minimum 44×44px").
- **The question modal is non-dismissible (R45).** On mobile that must survive
  the Android hardware back button and the iOS swipe-back gesture, or the gate
  is one gesture wide. It also needs an explicit abandon path — v1's only exit
  is leaving the page (§10 D15).
- **Backgrounding is not `visibilitychange`.** v1 saves progress on
  `document.visibilitychange` (`:198`); React Native's equivalent is
  `AppState`, and on iOS an audio-less webview may be suspended before a
  handler runs. Save on a timer as well as on transitions (R49).
- **`formatTimestamp` output is the only clock the student sees** (`:290`), so
  R20's `"NaN:NaN"` is user-visible whenever the player fails to report a
  duration (R81).

## 10. Open questions and divergences

**D1 — playback gating is client-side only, and this is the domain's headline
finding.** The barrier that stops a student skipping ahead lives entirely in
`interactive-video-player.tsx` (R39–R43); `submitVideoAnswerAction` never reads
`SessionVideoProgress`, never compares `atSeconds` against anything, and never
checks question order (`video-quiz-actions.ts:115-170`, R47). In v1 this is
*almost* defensible: the actions are server actions reachable only from a signed
session, the native player controls are suppressed (R43), and the custom seek
bar clamps (R41). It stops being defensible the moment §7's endpoints exist,
because then answering every question on a session without playing a frame is
one scripted loop. The schema comment itself claims the feature is "graded,
gated, no retries" (`prisma/schema.prisma:393`) — two of those three are real
(R54, R55); "gated" is not.

*Is it enforceable server-side?* Partially, and the honest answer matters:

- **Enforceable:** rejecting an answer whose `atSeconds` is beyond the
  student's recorded `furthestSeconds` (plus a small tolerance), and rejecting
  answers to questions later than the earliest unanswered one. Together these
  reproduce the barrier's *ordering* guarantee exactly, using data the server
  already stores. Cheap, and it closes the scripted-loop hole.
- **Not enforceable:** that the student actually *watched*. `furthestSeconds`
  is client-reported (R48) and always will be — no server can observe a YouTube
  iframe's playhead. Rate-limiting progress advancement to roughly wall-clock
  time makes cheating tedious rather than impossible; it also breaks legitimate
  playback-speed changes.

*Recommendation:* enforce the ordering rule server-side (it is nearly free and
makes the feature's promise true), make the progress endpoint the sole writer of
`furthestSeconds` (which also fixes D4), and **write down explicitly that watch
time is advisory**. Do not let the mobile client be the only thing standing
between a student and a completed quiz. Whatever is chosen, decide it before
the answer endpoint is written — retrofitting a gate after screens assume its
absence is much more expensive.

**D2 — a question past the end of the video deadlocks the quiz, permanently and
invisibly.** R78 and R79: nothing validates `atSeconds` against the video's
length because v1 never learns the length (R14), the barrier then sits at an
unreachable timestamp, the modal never opens, completion never fires, and the
lock indicator hides itself. A single typo in the timestamp field — and R23
makes typos *parse* rather than fail — bricks a session's quiz for every student
with no error anywhere.
*Recommendation:* fetch the video's duration once when the session's
`youtubeUrl` is saved (YouTube's oEmbed endpoint does not return duration; the
Data API `videos.list` `contentDetails.duration` does) and store it. Storing it
is a schema change and therefore **blocked while the database is shared with
v1** (`CLAUDE.md`) — so the near-term fix is to have the *client* report the
duration on player-ready and have the authoring screen refuse a timestamp beyond
it, plus a server-side guard that a barrier question older than N days with zero
responses does not block completion. Decide which; do not ship the feature with
the deadlock intact.

**D3 — completion is a client-asserted boolean.** R48 and R65: any caller can
`saveVideoProgress(sessionId, 0, true)` and be marked complete, and `completedAt`
is write-once with no un-complete path (R63). Conversely a student who answers
the final question and closes the app before the video ends is never marked
complete at all, because `ENDED` is the only trigger.
*Recommendation:* derive completion on the server — all questions answered, and
optionally `furthestSeconds` within a tolerance of the duration — and drop
`completed` from the request contract (§8). This fixes both the false positive
and the false negative in one change. If the product wants "watched to the end"
as distinct from "answered everything", they are two fields, not one boolean.

**D4 — `furthestSeconds` regresses.** R57: `submitVideoAnswerAction` writes
`{ set: question.atSeconds }` (`video-quiz-actions.ts:165`) while
`saveVideoProgressAction` twenty lines below applies `Math.max` under a comment
promising the value "only ever moves forward" (`:178, 201`). Unreachable through
v1's UI because the barrier forces ascending order; reachable on day one of an
API.
*Recommendation:* do not port the write at all. Let the progress endpoint be the
only writer of `furthestSeconds` (which D1 also wants), or, if the answer
endpoint keeps writing it, use a maximum. This is a two-character fix in v1 and
a design decision in v2 — take the design decision.

**D5 — editing a question silently invalidates every answer already given.**
R8/R9: `isCorrect` is frozen at answer time and never recomputed, so fixing a
wrong answer key leaves every prior grade wrong, and removing an option can
strand a `selectedIndex` out of range. The editor shows `responseCount` (R74) so
the admin can see that answers exist, but nothing warns and nothing blocks.
*Recommendation:* on any change to `correctIndex` or `options`, re-grade every
existing response in the same transaction and return how many changed; on a
change to `points`, nothing needs re-grading because points are not stored
(R71) — but say so in the response so the admin knows scores moved. If
re-grading is not wanted, block the edit once `responseCount > 0` and require
delete-and-recreate. Silently doing neither is the one option to rule out.

**D6 — deleting a question destroys student work.** R10/R11: the cascade removes
every response, `SessionVideoProgress` is left describing a quiz that no longer
exists, and earned points silently drop for everyone. v1's only guard is a
confirm dialog whose text does say so
(`video-questions-editor.tsx:136-138`).
*Recommendation:* keep the behaviour (there is no soft-delete column and adding
one is a blocked schema change), but return the response count from the endpoint
(§7) so the confirm can say "this deletes 23 recorded answers", and recompute
any derived completion afterwards.

**D7 — a URL v1 accepts on save can be one the player cannot use, and nobody is
told.** R36 lets `z.string().url()` through; R32 lists the YouTube forms that
then parse to null — most importantly **`youtube.com/live/ID`**, which is what a
premiere or a streamed session produces, and the legacy `/v/` embed. R37 means
the student silently gets a plain link instead of the quiz, and R17 means the
admin keeps authoring questions into a void. Separately, R33 (no host check) and
R34 (no trailing boundary) mean a non-YouTube URL or an over-long id can produce
a *wrong* video id rather than a null.
*Recommendation:* three changes, all cheap. (a) Add `/live/` and `/v/` to the
pattern list and anchor the id with a trailing boundary so a 12-character token
fails instead of truncating. (b) Restrict the host to `youtube.com`,
`www.youtube.com`, `m.youtube.com`, `youtube-nocookie.com` and `youtu.be` by
parsing the URL rather than regex-scanning the raw string. (c) **Validate at
save time, in domain 3** — reject a session `youtubeUrl` that does not yield an
id, and return the resolved `videoId` on the session contract so the mobile
client never re-parses. Also accept a bare 11-character id, since that is what
an admin copying from the YouTube UI often has. Note that (c) is a behaviour
change to domain 3's session write: **flagged there, not specced here.**

**D8 — `parseTimestamp` accepts inputs it should reject.** R23 (`":"` → 0,
`"1:"` → 60, `":30"` → 30, because `Number("")` is 0), R24 (`"0x10"` → 16,
`"1e3"` → 1000), R27 (no upper bound, so the failure surfaces as the action's
generic message), and R28 (the editor discards `fieldErrors`, so the admin is
told to fix highlighted fields and nothing is highlighted). R20 additionally
lets `formatTimestamp` render `"NaN:NaN"` to the student.
*Recommendation:* when this moves into `packages/shared` (§8), rewrite it
against an explicit pattern — every component non-empty and digits only, two-
and three-part forms bounded at 59, an overall maximum passed in by the caller
(the video duration if D2 lands, otherwise 86,400) — and guard `formatTimestamp`
with a finiteness check. Unit-test the table in R23/R24/R26 directly; these are
exactly the cases a port reproduces by accident. Keep R26's "plain seconds"
behaviour, and keep the `m:ss`/`h:mm:ss` output format, since existing admin
muscle memory depends on both.

**D9 — the answer action is more permissive than the page that fronts it.**
R51: `canAccessSeason` accepts any `SeasonEnrollment` row regardless of status
(`permissions.ts:63-67`), while the student session page requires
`status: "ACTIVE"` (`student/sessions/[id]/page.tsx:29-33`). A dropped student
cannot open the page and can still answer.
*Recommendation:* gate the v2 endpoints on the ACTIVE-enrollment condition, so
the API matches what v1 actually intended. If alumni are meant to keep access to
past-season material, make that an explicit rule with its own name rather than
a side effect of `canAccessSeason`'s permissiveness. This is the same shape of
defect as the leader-attendance finding from the first batch: a query's
`where` clause carrying a rule the action never checks.

**D10 — the feature produces output that nobody can see.** R72, R74 and R76
together: no grade row is written, no admin surface shows any student's score or
answers, and no dashboard, engagement metric or export reads any of the three
tables. An admin authors a quiz, students take it, and the only person who ever
learns the result is the student — and only while their page is open, because
the score is recomputed on every read (R71) and stored nowhere.
*Recommendation:* build the results endpoint and screen (§7, §9). It is the
cheapest high-value addition in this domain — the data is already there, one
grouped query away. Whether video-quiz points should also flow into engagement
(`src/lib/engagement.ts`) or the season export (`src/lib/season-export.ts`) is a
product question; both would need a persisted score, which is a schema change
and therefore blocked until v1 is retired. Raise it now so the answer is known
before that window opens.

**D11 — mobile playback is a real constraint and needs a decision before any
screen work.** v1's player is a YouTube IFrame embed driven from the same
JavaScript context: `getCurrentTime()` is a synchronous call polled every 250 ms,
and `pauseVideo()`/`seekTo()` are synchronous too
(`interactive-video-player.tsx:20-27, 171-189`). None of that holds in React
Native.

Options, in order of preference:

1. **`react-native-youtube-iframe` over `react-native-webview`.** It wraps the
   same IFrame API inside a webview and exposes `getCurrentTime`/`seekTo`/play/
   pause across the bridge. Closest to v1 semantics, and the barrier logic ports
   structurally. Costs: `getCurrentTime` becomes a **promise**, so the 250 ms
   poll becomes 250 ms of round trips across the bridge with real jitter — the
   0.1 s tolerance in R42 is too tight and must widen; the snap-back after an
   over-shoot becomes visible to the student; and a webview needs a dev client
   build rather than Expo Go. **Recommended.**
2. **A hand-written HTML page in a `react-native-webview`** that runs the whole
   barrier loop *inside* the webview and posts only events (`question-reached`,
   `answered`, `progress`) to React Native. Keeps the tight loop on the same
   side of the bridge as the player, which is a genuine correctness advantage
   over option 1, at the cost of maintaining a second UI in a second language.
   Worth choosing if option 1's jitter proves unacceptable in practice.
3. **A native YouTube SDK.** There is no supported official option — Android's
   player API is long deprecated and there is no first-party iOS SDK. Rejected.
4. **`Linking.openURL` into the YouTube app.** Trivial, and it deletes the
   feature: nothing is gated, nothing is timed, no question ever fires. Only
   acceptable as the fallback for R37/R81 (unparseable URL, unplayable video),
   which v1 already does (`student/sessions/[id]/page.tsx:79-89`).

Two constraints apply to every option. **The gate weakens on mobile regardless**
— an embedded player still surfaces a route into the YouTube app, and once the
student is there nothing is gated — which is the second argument for D1's
server-side ordering rule. And **v1's error handling does not survive the port**:
R81's missing `onError` and never-rejecting loader produce a black box on the
web; on a phone, with intermittent connectivity, that becomes the common case.
An `onError` handler, a load timeout, and a "watch on YouTube" fallback are
required work, not polish.

**D12 — editing a recurring session copies the video URL to every sibling but
not the questions.** R16: `session-actions.ts:138-151` writes the same
`youtubeUrl` across the recurrence group, while `SessionVideoQuestion` rows stay
attached to their own `sessionId` (R15). Setting a URL on one week's session
therefore points all twelve weeks at the same video, and any questions authored
on the others are now pinned to timestamps in a video that is not theirs.
*Recommendation:* **domain 3's decision, flagged not specced.** Either exclude
`youtubeUrl` from the recurrence fan-out (it is the one field in that update
that is genuinely per-occurrence) or warn when a sibling already has video
questions. This domain should assume nothing about it.

**D13 — `createdById` is stamped once and read never.** R5, plus the same
audit-column claim in the schema header that domain 8 found untrue for
`Submission`. `SessionVideoQuestion` has `createdById` and no `updatedById`
(`prisma/schema.prisma:403-404`), so "who last edited this question" is
unrecoverable — which matters precisely because edits silently invalidate grades
(D5).
*Recommendation:* start reading `createdById` in v2 (show "added by <name>" in
the editor) and record the editor's identity in whatever audit trail v2 adopts.
No migration is possible while the database is shared, so `updatedById` cannot
be added; a change log is the alternative if D5's re-grading makes attribution
important.

**D14 — a duplicate submit surfaces a raw database error.** R59: the unique
constraint on `(questionId, studentUserId)` is the correctness guarantee, and
the action does not catch its violation
(`video-quiz-actions.ts:150-152`) — unlike domain 8's `ensureDraftSubmission`,
which catches and re-reads (`08-submissions.md` R3). The only thing preventing
it today is a client `submitting` flag.
*Recommendation:* catch the constraint violation and return the recorded
response, which is exactly what the `existing` branch already does
(`:143-145`). A double-tap on a phone is far more likely than a double-click on
a mouse.

**D15 — there is no way out of a question.** R45: the modal cannot be dismissed
and the only exit is navigating away from the page, which under R49 also fires a
progress save. A student who does not know an answer must guess, and R54 makes
that guess permanent.
*Recommendation:* a product question, not a defect — but it must be answered
before the mobile screen is built, because Android's back button and iOS's
swipe-back will dismiss the modal by default and quietly delete the gate. Either
make the modal genuinely modal (intercept both gestures) or add an explicit
"leave the quiz" action that exits the player without answering. Do not let the
platform decide it.

**D16 — v1 production issues recorded here, not touched.** Per the read-only
constraint, these are live in v1 today and are the owner's to decide on
separately: the R78/R79 deadlock (a mistyped timestamp bricks a session's quiz
silently), R23's timestamp parsing (a typo becomes a valid timestamp rather than
an error), R37 (an unparseable URL silently discards an authored quiz), R51 (a
dropped student can still answer), and R81 (an unplayable video renders as a
permanently black box with no message).

---

**Rule count:** 83 numbered rules (R1–R83), of which **19 are marked
`(implicit)`**: R8, R9, R18, R27, R28, R33, R38, R47, R48, R51, R52, R59, R65,
R66, R73, R74, R75, R76, R79. The three that will silently vanish in a port are
R47 (the entire playback gate is a client component), R73 (both query functions
authorize nothing and rely on which page calls them — and one of them carries
the answer key) and R51 (the answer action's season gate is looser than the
page's enrollment check).
