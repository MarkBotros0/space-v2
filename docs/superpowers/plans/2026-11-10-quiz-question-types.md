# Quiz question types, shuffling, marking and results stages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Online quizzes get six question types (single choice, choose-N, true/false, matching, fill in the blank, essay) stored by option/blank id, per-attempt shuffling, partial marks with decimal scores, right/wrong leader marking, best-attempt counting, two-stage student visibility, and Arabic (RTL) content — end to end in backend and mobile.

**Architecture:** Options, matching items and blanks become rows (`QuizOption`, `QuizBlank`); answers become rows keyed by those ids (`QuizAnswerSelection`, `QuizAnswerBlank`). Each attempt stores a `shuffleSeed`; the student read derives question and option order from it with a seeded PRNG, so order is stable within an attempt and new on a retake. Marking is one pure module (`lib/quizzes/marking.ts`) shared by submit and leader marking. Student visibility is one pure function (`studentQuizStage`) replacing `studentAttemptStatus`. Plan 2 (timing) and Plan 3 (integrity, live screen) build on this; this plan ships alone and leaves the app working.

**Tech Stack:** Express 5, Prisma 7 (Postgres), Zod 4 (`@space/shared`), Expo 58 / expo-router / React Query / NativeWind, Jest (+ supertest, jest-expo).

**Spec:** `docs/superpowers/specs/2026-11-10-quiz-question-types-and-integrity-design.md` (sections Question types, Scores, Arabic text, Shuffling, Marking, What students see, UI, Existing data, Rules file).

## Global Constraints

- Relative imports only (no `@/`); 400 lines per file (`check:size`, ESLint); nesting depth 3; Prettier (`pnpm format`).
- No `$transaction` under `src/routes/`; refusals below a route are thrown `ApiError` (`lib/api-error.ts`); use `idParam`, `notFound`, `parseOr400`.
- Answer keys (`isCorrect` on options, `matchId`, `QuizBlank.expected`) are never selected into a student read before the answers are released. Keep a raw-JSON leak test (as in `quizzes-attempts-routes.test.ts:50-61`).
- Migrations: one concern each, `BEGIN; … COMMIT;` (except `ALTER TYPE … ADD VALUE`, alone in its own file without BEGIN), a `rollback.sql` beside each, cycled apply → rollback → apply on the local `space_test` DB (`pnpm --filter @space/backend db:migrate:local`). Never `prisma migrate dev`/`reset`/`db push`. Folder names `YYYYMMDDHHMMSS_snake_name`, after `20261111070000`.
- Every new model: `createdAt`/`updatedAt` (or listed in `APPEND_ONLY` with a reason), an index leading with every FK, link tables keyed by their pair (`schema-conformance.test.ts`). Regenerate `docs/database/erd.md` (`pnpm --filter @space/backend db:erd`; add new models to the Quizzes domain in `apps/backend/scripts/erd/render.ts:37`) and the schema snapshot (`jest --config jest.integration.config.js schema-snapshot -u`).
- Points per question stay whole numbers 1–100 set by the admin. Awarded points and attempt totals are `Decimal(8,2)`; every response converts with `toScore()` (Task 2) to a JS number — Prisma `Decimal` serialises as a string and would fail `z.number()`.
- Scores display to one decimal (`7.5 / 10`); whole numbers display without `.0`.
- Mobile: screens/`app/`/`src/design` never import axios or `lib/api-client`; data via `src/hooks/` `apiGet`/`apiSend`. Pure models live beside the screen and are tested apart. Kit only (`src/design/ui` barrel, `Screen`, `SaveBar`, `Checkbox`, `ChoiceChip`, `StatusChip`, `StatTile`, `Card`, `ConfirmDialog`, `Sheet`), tokens from `src/design/theme/tokens.json`, `bad` tone for errors, motion per `docs/rules/motion.md` (no springs, `useReducedMotion`, `haptic("selection")` on picks).
- Touch targets ≥ 44pt on every option, pair item and blank.
- App UI copy stays English; only quiz content may be Arabic.
- `pnpm check` green before each commit that touches code; commits authored by the repo-local `jesusprojectcommunity` config, ending with the session attribution lines. Push nothing without asking. Backend + mobile changes ship together (one push) — the contract changes break older app builds' quiz screens.

## Review Focus

1. **A student reads the quiz after submitting, before answers are released** — the response contains no question text, options, own answers or correctness; only status and (once graded) score. Pinned in Task 7 (`submitted-unreleased read carries no questions`) and the raw-JSON test.
2. **Resume after leaving** — the same student re-reading an open attempt gets the identical question and option order; a reopened retake gets a different seed. Pinned in Task 6 (`order is stable across reads`, `retake reshuffles`).
3. **Choose-N with more ticks than N, or ticks on another question's options** — refused 400, nothing written. Pinned in Task 5 (`answerRefusal` cases).
4. **Mixed Arabic/English and digits** (`آية ٣ John 3:16`) — direction from the first strong character; an empty or digits-only string is LTR. Pinned in Task 10 (`textDirection` cases).
5. **Partial marks that don't divide evenly** (1/3 of 1 point) — stored as 0.33, totals summed from stored values so `totalScore = autoScore + manualScore` holds exactly (the SQL CHECK). Pinned in Task 4 (`thirds round to 2dp`) and Task 7 (`total equals sum of awarded`).

---

### Task 1: Schema — question types, option/blank/answer rows, shuffle, decimals

**Files:**
- Create: `apps/backend/prisma/migrations/20261112010000_quiz_question_type_values/{migration.sql,rollback.sql}`
- Create: `apps/backend/prisma/migrations/20261112020000_quiz_option_blank_rows/{migration.sql,rollback.sql}`
- Create: `apps/backend/prisma/migrations/20261112030000_quiz_scores_decimal/{migration.sql,rollback.sql}`
- Create: `apps/backend/prisma/migrations/20261112040000_quiz_backfill_options/{migration.sql,rollback.sql}`
- Create: `apps/backend/scripts/refactor-checks/quiz-types.ts` (+ `check:quiz-types` script in `apps/backend/package.json`)
- Modify: `apps/backend/prisma/schema.prisma` (enums at l.113-127, models l.740-858)
- Modify: `apps/backend/src/__tests__/schema-conformance.test.ts` (lists only if a new model needs an exception)
- Modify: `apps/backend/scripts/erd/render.ts:37`, `docs/database/erd.md`, schema snapshot
- Modify: `apps/backend/src/__tests__/integration/fixtures.ts:125` (`cleanupTestData` deletes the new rows before `quizAnswer`)

**Interfaces — Produces (Prisma):**
- `enum QuizQuestionType { MCQ ESSAY SINGLE_CHOICE MULTI_CHOICE TRUE_FALSE MATCHING FILL_BLANK }` — `MCQ` stays in the enum (Postgres can't drop a value cheaply) but no row uses it after the backfill; comment it `// legacy, no rows after 20261112040000`.
- `enum QuizOptionSide { LEFT RIGHT }`
- `model QuizOption { id, questionId → QuizQuestion (Cascade), position Int, label String, isCorrect Boolean @default(false), side QuizOptionSide?, matchId Int? (self-relation "QuizOptionMatch", SetNull; set on a LEFT row to its correct RIGHT row), createdAt, updatedAt; @@index([questionId, position]); @@index([matchId]) }`
- `model QuizBlank { id, questionId → QuizQuestion (Cascade), position Int, expected String, createdAt, updatedAt; @@unique([questionId, position]) }`
- `model QuizAnswerSelection { answerId → QuizAnswer (Cascade), optionId → QuizOption (Cascade), matchedOptionId Int? → QuizOption (relation "QuizAnswerMatched", Cascade), createdAt, updatedAt; @@id([answerId, optionId]); @@index([optionId]); @@index([matchedOptionId]) }`
- `model QuizAnswerBlank { answerId → QuizAnswer (Cascade), blankId → QuizBlank (Cascade), text String, isCorrect Boolean?, createdAt, updatedAt; @@id([answerId, blankId]); @@index([blankId]) }`
- `Quiz.shuffleQuestions Boolean @default(true)`
- `QuizAttempt.shuffleSeed Int @default(0)` (the start/reopen code sets a random 31-bit value; 0 only on rows that predate it).
- `QuizAttempt.autoScore/manualScore/totalScore`, `QuizAnswer.pointsAwarded` → `Decimal? @db.Decimal(8,2)`. `QuizQuestion.points`, `Quiz.maxScore`, `QuizGrade.score` stay `Int`.
- `QuizQuestion.options`, `QuizQuestion.correctIndex`, `QuizAnswer.selectedIndex` stay for now, comment `// legacy: read by nothing after the quiz-types plan; dropped by a later contract migration`.

- [ ] **Step 1: Write the read-only check** `scripts/refactor-checks/quiz-types.ts`, same shape as `wave-3.ts` (`CHECKS: Check[]`): (a) MCQ questions with `correctIndex` null or ≥ `array_length(options)`; (b) answers with `selectedIndex` ≥ the question's option count; (c) MCQ questions with fewer than 2 options. Each prints the count and up to 10 ids.
- [ ] **Step 2: Run it against the local DB** — `pnpm --filter @space/backend check:quiz-types`. Expected: three counts printed, no writes.
- [ ] **Step 3: Write the four migrations.** `…010000`: `ALTER TYPE "QuizQuestionType" ADD VALUE` ×5 (no BEGIN; rollback.sql explains enum values can't be dropped and is a no-op comment). `…020000`: the enum `QuizOptionSide`, the four tables with FKs, indexes and `@@id`s, `Quiz.shuffleQuestions`, `QuizAttempt.shuffleSeed`. `…030000`: `ALTER COLUMN … TYPE numeric(8,2)` for the four score columns (the `QuizAttempt_totalScore_check` CHECK keeps working on numeric); rollback casts back with `round()`. `…040000`: for each `MCQ` question insert one `QuizOption` per `options[i]` (position i, `isCorrect = (i = correctIndex)`), set `type = 'SINGLE_CHOICE'`; for each answer with `selectedIndex` insert a `QuizAnswerSelection` for the option at that position; set `shuffleSeed = floor(random()*2147483647)` where 0. Rollback: delete the inserted selection and option rows of former-MCQ questions and set their type back to `MCQ` (questions that are `SINGLE_CHOICE` and have non-empty `options[]`).
- [ ] **Step 4: Update `schema.prisma`** to match, with `// SQL-only` notes for nothing new (no new CHECKs). Run `pnpm --filter @space/backend db:generate`.
- [ ] **Step 5: Cycle the migrations** on the local DB: apply all → apply the four rollbacks in reverse → apply again. Expected: no errors; `\d "QuizOption"` shows the indexes.
- [ ] **Step 6: Run the schema tests** — `pnpm --filter @space/backend test:unit -- schema-conformance erd` then regenerate erd + snapshot and run `pnpm --filter @space/backend test:integration -- schema-snapshot`. Expected: PASS.
- [ ] **Step 7: Commit** — `feat(backend): quiz option, blank and answer rows; decimal scores` (body lists the four migrations and "applied to: local space_test only").

### Task 2: Shared contracts — authoring, student read, answers, marking, grading

**Files:**
- Modify: `packages/shared/src/enums.ts:37-38` (`quizQuestionTypeSchema` = the six new values; MCQ removed from the contract)
- Create: `packages/shared/src/quiz/questions.ts` (authoring request + authoring read per type)
- Create: `packages/shared/src/quiz/student.ts` (student question union, answer input union, review)
- Modify: `packages/shared/src/quiz/read.ts` (drop the MCQ-shaped question schemas; `studentQuizDetailSchema` uses `student.ts`; `resultsReleased` → `answersReleased`, `resultsReleasedAt` → `answersReleasedAt` in every schema; add `shuffleQuestions` to authoring detail; score fields `z.number()` unchanged in name)
- Modify: `packages/shared/src/quiz/writes.ts` (replace `quizQuestionRequestSchema`, `saveQuizAnswersRequestSchema`, `gradeEssayAnswersRequestSchema`; `updateQuizRequestSchema` gains `shuffleQuestions?`)
- Modify: `packages/shared/src/quiz/grading.ts` (`quizGradingAnswerSchema` per type), `responses.ts` (`releaseQuizResultsResponseSchema` field rename)
- Modify: `packages/shared/src/quiz/index.ts` (export the two new files)
- Test: `packages/shared/src/__tests__/quiz-questions.test.ts`, `packages/shared/src/__tests__/quiz-answers.test.ts`

**Interfaces — Produces:**
- `BLANK_TOKEN = "{{blank}}"`; `countBlanks(prompt: string): number`.
- `quizQuestionRequestSchema` — `z.discriminatedUnion("type", [...])`, each with `prompt` (2–2000, trimmed), `points` int 1–100:
  - `SINGLE_CHOICE`: `options: {label 1–300, isCorrect: boolean}[]` 2–6, exactly one correct.
  - `MULTI_CHOICE`: `options` 3–8, correct count ≥ 2 and < options length.
  - `TRUE_FALSE`: `correct: boolean`.
  - `MATCHING`: `pairs: {left 1–200, right 1–200}[]` 2–6, no duplicate left or right labels (trimmed, case-sensitive).
  - `FILL_BLANK`: `answers: string[]` (each 1–200), `answers.length === countBlanks(prompt)`, 1–10 blanks.
  - `ESSAY`: nothing more.
  - `QuizQuestionInput = z.input<typeof quizQuestionRequestSchema>`.
- `quizQuestionAuthoringSchema` — same union plus `id`, `order`; options carry `id`; matching `pairs: {leftId, left, rightId, right}[]`; fill blank `blanks: {id, position, expected}[]`.
- `studentOptionSchema = {id: number, label: string}`.
- `quizQuestionStudentSchema` — discriminated union on `type`, base `{id, order, type, prompt, points, pointsAwarded: number|null, review: … | null}`:
  - `SINGLE_CHOICE` / `TRUE_FALSE`: `options: StudentOption[]`, `answer: {optionId: number|null}`, `review: {correctOptionIds: number[]} | null`.
  - `MULTI_CHOICE`: `options`, `choose: number`, `answer: {optionIds: number[]}`, `review: {correctOptionIds: number[]} | null`.
  - `MATCHING`: `left: StudentOption[]`, `right: StudentOption[]`, `answer: {pairs: {leftId, rightId}[]}`, `review: {pairs: {leftId, rightId, correct: boolean}[], correctPairs: {leftId, rightId}[]} | null`.
  - `FILL_BLANK`: `blanks: {id, position}[]`, `answer: {blanks: {blankId, text}[]}`, `review: {blanks: {blankId, correct: boolean|null, expected: string}[]} | null`.
  - `ESSAY`: `answer: {text: string}`, `review: {correct: boolean|null} | null`.
  - True/false options are labelled `"True"` / `"False"` in that order.
- `quizAnswerInputSchema` — discriminated union on `type`, `questionId` int: `SINGLE_CHOICE|TRUE_FALSE {optionId: number|null}`, `MULTI_CHOICE {optionIds: number[] (≤ 8, unique)}`, `MATCHING {pairs: {leftId, rightId}[] (≤ 6, unique leftId, unique rightId)}`, `FILL_BLANK {blanks: {blankId, text ≤ 500}[] (≤ 10)}`, `ESSAY {text ≤ 20000}`. `saveQuizAnswersRequestSchema = {answers: QuizAnswerInput[] 1..100}`. `QuizAnswerInput = z.output<…>`.
- `markAttemptRequestSchema = {marks: {questionId: int, blankId: int|null, correct: boolean}[] 1..200}`; `MarkAttemptInput`. Replaces `gradeEssayAnswersRequestSchema` (delete it).
- `studentQuizDetailSchema` fields: `id, title, kind, seasonId, maxScore, sessionTitle, attemptId, attemptNumber, status, stage: "not_started"|"in_progress"|"submitted"|"graded"|"answers", totalScore: number|null (best graded), submittedAt, gradedAt, questions: QuizQuestionStudent[], readOnly, answersReleased`.

- [ ] **Step 1: Write failing tests.** `quiz-questions.test.ts`: `accepts each type's minimal valid body` (one per type); `SINGLE_CHOICE with two correct is refused`; `MULTI_CHOICE with one correct is refused`; `MULTI_CHOICE with all correct is refused`; `FILL_BLANK with answers.length !== countBlanks(prompt) is refused`; `MATCHING with duplicate left label is refused`; `countBlanks("a {{blank}} b {{blank}}") === 2`. `quiz-answers.test.ts`: `MULTI_CHOICE duplicate optionIds refused`; `MATCHING duplicate rightId refused`; `answer union rejects a field from another type` (e.g. `{type:"ESSAY", optionId:1}` strips or fails — assert `.strict()` fails); `markAttemptRequestSchema empty marks refused`.
- [ ] **Step 2: Run** — `pnpm --filter @space/shared test:unit -- quiz-` → FAIL (missing exports).
- [ ] **Step 3: Implement** the schemas above (all objects `.strict()`, as the folder does).
- [ ] **Step 4: Run** — same command → PASS. Then `pnpm typecheck` — expected failures only in backend/mobile files later tasks change; note them, don't fix here.
- [ ] **Step 5: Commit** — `feat(shared): quiz contracts for six question types and right/wrong marking`.

> Typecheck stays red across the workspace from Task 2 until Task 9 (backend) and Task 15 (mobile). Each task runs its own package's tests; `pnpm check` must be green from Task 15 on. If executing natively, keep the tasks on one branch and don't push in between.

### Task 3: Score helpers and shuffle

**Files:**
- Create: `apps/backend/src/lib/quizzes/score.ts`
- Create: `apps/backend/src/lib/quizzes/shuffle.ts`
- Test: `apps/backend/src/__tests__/quiz-score.test.ts`, `apps/backend/src/__tests__/quiz-shuffle.test.ts`

**Interfaces — Produces:**
- `toScore(d: Prisma.Decimal | number | null): number | null` (`Number(d.toFixed(2))`).
- `round2(n: number): number` — half-up to 2 decimals (`Math.round((n + Number.EPSILON) * 100) / 100`).
- `sumScores(values: (number | null)[]): number` — sums with `round2` at the end.
- `newShuffleSeed(): number` — random int in [1, 2^31 − 1] (`crypto.randomInt`).
- `seededOrder<T extends { id: number }>(items: T[], seed: number, salt: number): T[]` — sorts `items` by `id` first (stable input), then Fisher–Yates with mulberry32 seeded by `(seed ^ Math.imul(salt, 0x9e3779b1)) >>> 0`. Never mutates the input.

- [ ] **Step 1: Failing tests.** `round2(1/3) === 0.33`, `round2(2/3) === 0.67`, `round2(0.125) === 0.13`; `sumScores([0.33,0.33,0.33]) === 0.99`; `toScore(null) === null`; `toScore(new Prisma.Decimal("7.50")) === 7.5`. Shuffle: `same seed and salt give the same order`; `input order doesn't matter` (shuffled copy in → same out); `different salt gives a different order for 6 items` (assert for a fixed seed); `does not mutate`; `seed 0 still returns a permutation`.
- [ ] **Step 2: Run** — `pnpm --filter @space/backend test:unit -- quiz-score quiz-shuffle` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(backend): quiz score rounding and seeded shuffle`.

### Task 4: Marking — one pure module

**Files:**
- Create: `apps/backend/src/lib/quizzes/marking.ts`
- Test: `apps/backend/src/__tests__/quiz-marking.test.ts`

**Interfaces:**
- Consumes: `round2` (Task 3).
- Produces:
  - `type MarkableQuestion = { id: number; type: QuizQuestionType; points: number; options: { id: number; isCorrect: boolean; side: "LEFT"|"RIGHT"|null; matchId: number|null }[]; blanks: { id: number }[] }`
  - `type StoredAnswer = { selections: { optionId: number; matchedOptionId: number|null }[]; blanks: { blankId: number; text: string; isCorrect: boolean|null }[]; text: string|null; isCorrect: boolean|null }`
  - `isAnswered(q: MarkableQuestion, a: StoredAnswer | undefined): boolean` — single/TF: one selection; multi: ≥ 1; matching: every LEFT option has a selection with a `matchedOptionId`; blanks: every blank has non-blank trimmed text; essay: non-blank text.
  - `isLeaderMarked(type): boolean` — `FILL_BLANK` and `ESSAY`.
  - `autoMark(q, a): { pointsAwarded: number; isCorrect: boolean }` — only for auto types; throws on a leader type. Formulas (spec): single/TF all-or-nothing; MULTI `round2(correctTicked / correctCount * points)` (wrong ticks earn nothing), `isCorrect` = all correct ticked and none wrong; MATCHING `round2(correctPairs / leftCount * points)`, `isCorrect` = all pairs right. Unanswered → 0, false.
  - `leaderMark(q, marks: { blankId: number|null; correct: boolean }[]): number` — FILL_BLANK `round2(right / blanks * points)`; ESSAY `correct ? points : 0`.

- [ ] **Step 1: Failing tests** (table-driven, `describe.each`): single right → points / wrong → 0; TF; MULTI 3-point, 3 correct of 5: all 3 → 3, 2 → 2, 1 → 1, none → 0, `thirds round to 2dp` (1 point, 3 correct, tick 1 → 0.33); MATCHING 5 pairs, 3 right, 5 points → 3; MATCHING 3 pairs, 1 right, 1 point → 0.33; `isAnswered` false for matching with one left unpaired, blanks with one whitespace-only; `leaderMark` FILL_BLANK 3 blanks, 2 right, 3 points → 2; ESSAY wrong → 0; `autoMark throws for ESSAY`.
- [ ] **Step 2: Run** — `pnpm --filter @space/backend test:unit -- quiz-marking` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(backend): pure marking for every quiz question type`.

### Task 5: Authoring — questions write and read per type

**Files:**
- Modify: `apps/backend/src/lib/quizzes/questions.ts` (`addQuizQuestion`, `updateQuizQuestion` write options/blanks rows; `AUTHORING_QUESTION_SELECT` includes `quizOptions` and `quizBlanks` ordered by position; `recomputeMaxScore` unchanged)
- Create: `apps/backend/src/lib/quizzes/question-rows.ts` (input → rows; rows → authoring shape)
- Modify: `apps/backend/src/routes/quizzes/questions.ts` (validation via new schema; `publishQuiz` l.169 re-validates by type instead of `correctIndex`)
- Modify: `apps/backend/src/routes/quizzes/detail.ts` (authoring detail maps with `toAuthoringQuestion`, adds `shuffleQuestions`)
- Modify: `apps/backend/src/routes/quizzes/authoring.ts` (`updateQuiz` accepts `shuffleQuestions`; refused with `quiz_has_attempts` once attempts exist)
- Test: `apps/backend/src/__tests__/quiz-question-rows.test.ts`; modify `src/__tests__/integration/quizzes-authoring-routes.test.ts`

**Interfaces — Produces:**
- `questionRowsFor(input: QuizQuestionRequest): { options: { position, label, isCorrect, side, matchKey?: number }[]; blanks: { position, expected }[] }` — TRUE_FALSE → two options `"True"`, `"False"`; MATCHING → LEFT rows at positions 0..n-1 and RIGHT rows at n..2n-1, `matchKey` linking them (the writer sets `matchId` after insert, in the same transaction).
- `toAuthoringQuestion(row: AuthoringQuestionRow): QuizQuestionAuthoring`.
- `addQuizQuestion(quizId, input)` / `updateQuizQuestion(quizId, questionId, input)` — in one transaction: write the question, delete its old option/blank rows (update only), insert new ones, set `matchId`s, recompute max score. (Safe because questions are frozen once attempts exist.)

- [ ] **Step 1: Failing unit tests** for `questionRowsFor`: TF yields `True` correct when `correct: true`; MATCHING 3 pairs yields 3 LEFT + 3 RIGHT with matching keys; FILL_BLANK yields blanks in order; round-trip `toAuthoringQuestion(rowsOf(input))` equals the input for each type.
- [ ] **Step 2: Failing integration tests** in `quizzes-authoring-routes.test.ts`: `adds each of the six types and reads them back` (POST then GET `/quizzes/:id`, assert authoring shape); `editing a MATCHING question replaces its pairs`; `publish refuses a FILL_BLANK whose blanks no longer match` is impossible by schema, so instead `publish refuses a quiz with no questions` stays; `shuffleQuestions can be turned off before attempts and is refused after`.
- [ ] **Step 3: Run** — `pnpm --filter @space/backend test:unit -- quiz-question-rows` and `test:integration -- quizzes-authoring` → FAIL.
- [ ] **Step 4: Implement.** Update `buildPublishedQuizIn` in `integration/quizzes-setup.ts` to create questions through `addQuizQuestion` with an options `{withEssay, withTypes?: QuizQuestionType[], released?}` signature so later tests can build mixed quizzes.
- [ ] **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** — `feat(backend): author the six quiz question types`.

### Task 6: Student read — shuffled, two-stage, no leaks

**Files:**
- Create: `apps/backend/src/lib/quizzes/student-stage.ts` (replaces `lib/quiz-results.ts`; delete that file)
- Create: `apps/backend/src/lib/quizzes/student-question.ts` (row → `QuizQuestionStudent`, with/without review)
- Modify: `apps/backend/src/routes/quizzes/student-detail.ts` (`loadStudentQuizDetail`)
- Modify: `apps/backend/src/routes/quizzes/attempts.ts` (`startAttempt` sets `shuffleSeed: newShuffleSeed()` on create)
- Modify: `apps/backend/src/routes/quizzes/grading.ts` (`reopenAttempt` sets a new seed)
- Test: `apps/backend/src/__tests__/quiz-student-stage.test.ts`; modify `integration/quizzes-attempts-routes.test.ts`

**Interfaces:**
- Consumes: `seededOrder` (Task 3), `toScore`.
- Produces:
  - `type QuizStage = "not_started"|"in_progress"|"submitted"|"graded"|"answers"`
  - `studentQuizStage(latest: { status } | null, bestGraded: boolean, answersReleased: boolean): QuizStage` — no attempt → not_started; latest IN_PROGRESS → in_progress; released and any graded attempt → answers; any graded → graded; else submitted.
  - `toStudentQuestion(row, answer, opts: { seed: number; withReview: boolean }): QuizQuestionStudent` — options of SINGLE/MULTI ordered by `seededOrder(options, seed, questionId)`; MATCHING LEFT by salt `questionId`, RIGHT by salt `questionId + 1_000_003`; TRUE_FALSE in position order; blanks in position order. `choose` = count of correct options (computed server-side, the count is not secret per spec). `review` only when `withReview`.
  - `loadStudentQuizDetail(quizId, studentUserId, readOnly)` — questions: `in_progress` → all questions with own answers, ordered by `seededOrder(questions, seed, 0)` when `shuffleQuestions` else by `order`; `submitted`/`graded` → `[]`; `answers` → questions of the **best graded** attempt with that attempt's answers and review; `not_started` → `[]`. `totalScore` = best graded attempt's total (null if none).

- [ ] **Step 1: Failing unit tests** for `studentQuizStage` (each row of the rule above, including `latest IN_PROGRESS while an earlier attempt is graded → in_progress`).
- [ ] **Step 2: Failing integration tests:** `order is stable across reads` (start, GET twice, same question ids and option ids order); `retake reshuffles` (submit, reopen, start: seed differs — assert `shuffleSeed` rows differ); `shuffleQuestions off keeps author order`; `submitted-unreleased read carries no questions` (`questions: []`, `stage: "submitted"`, `totalScore: null` for a quiz with an essay); `graded-unreleased shows score only` (MCQ-only quiz: `stage: "graded"`, `totalScore` set, `questions: []`); `released shows review with correct answers`; raw JSON of every pre-release read contains none of `isCorrect`, `matchId`, `expected`, `correctOptionIds` (extend the existing l.50-61 guard).
- [ ] **Step 3: Run** — `test:unit -- quiz-student-stage`, `test:integration -- quizzes-attempts` → FAIL.
- [ ] **Step 4: Implement**; update every import of `studentAttemptStatus` (list.ts, season-record.ts) to use `studentQuizStage` (Task 8 finishes those readers).
- [ ] **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** — `feat(backend): shuffled student quiz read with score and answers stages`.

### Task 7: Saving, submitting and leader marking

**Files:**
- Modify: `apps/backend/src/lib/quizzes/attempts.ts` (`answerRefusal`, `saveAnswers`, `submitAnswers`)
- Modify: `apps/backend/src/lib/quizzes/grading.ts` (`recordEssayGrades` → `recordLeaderMarks`)
- Modify: `apps/backend/src/routes/quizzes/attempts.ts` (`saveAttemptAnswers` loads options/blanks for validation; submit notifies "score is in" when GRADED, regardless of release)
- Modify: `apps/backend/src/routes/quizzes/grading.ts` (`gradeAttempt` takes `markAttemptRequestSchema`; `listAttempts` projects answers per type with the answer key, in author order). If this pushes the file past 400 lines, move `listAttempts`'s projection into `lib/quizzes/grading-view.ts`.
- Test: modify `integration/quizzes-attempt-submit-routes.test.ts`, `integration/quizzes-online-grading-routes.test.ts`; unit `src/__tests__/quiz-answer-refusal.test.ts`

**Interfaces:**
- Consumes: `isAnswered`, `autoMark`, `leaderMark`, `isLeaderMarked` (Task 4); `sumScores`, `toScore` (Task 3).
- Produces:
  - `answerRefusal(byId: Map<number, MarkableQuestion>, answers: QuizAnswerInput[]): { code: ApiErrorCode; message: string } | null` — codes: `question_not_in_quiz`; `wrong_answer_type` (input `type` ≠ question type); `answer_out_of_range` (an option/blank id not on this question, a LEFT id used as right or vice versa); `too_many_choices` (MULTI more than `choose`; add to `ApiErrorCode` in shared). Message for `too_many_choices`: "Choose at most N."
  - `saveAnswers(attemptId, answers)` — under the existing row lock: upsert the `QuizAnswer` row, replace its selections/blanks; ESSAY writes `text`.
  - `submitAnswers(quizId, attemptId): Promise<{ graded: boolean }>` — refuses `attempt_incomplete` unless every `isAnswered`; auto-marks auto types (`pointsAwarded`, `isCorrect` on the answer row); `autoScore = sumScores(auto)`; no leader-marked questions → GRADED with `manualScore 0`, `totalScore = autoScore`; else SUBMITTED.
  - `recordLeaderMarks(attemptId, perQuestion: { questionId; pointsAwarded; isCorrect: boolean|null; blankMarks: { blankId; correct }[] }[], scores: { manualScore; totalScore }, gradedById, gradedAt)` — in one transaction.
  - `gradeAttempt` refusals: `marks_incomplete` (409) unless every leader-marked question has a mark (every blank of a FILL_BLANK, one null-blank mark for an ESSAY); `mark_out_of_range` (400) for a blank or question not in the attempt. `manualScore = sumScores(leader)`, `totalScore = round2(autoScore + manualScore)`.
  - Legacy essays already marked with numeric points keep their `pointsAwarded`; `listAttempts` shows them as marked.

- [ ] **Step 1: Failing unit tests** for `answerRefusal`: MULTI with `choose` 2 and 3 ids → `too_many_choices`; option id from another question → `answer_out_of_range`; MATCHING using a RIGHT id as `leftId` → `answer_out_of_range`; `{type:"ESSAY"}` for a SINGLE question → `wrong_answer_type`.
- [ ] **Step 2: Failing integration tests:** `mixed auto quiz grades on submit with partial marks` (MULTI 2/3 + MATCHING 3/5 → expected decimal total); `total equals sum of awarded` (DB: `totalScore = autoScore + manualScore`, and = sum of `pointsAwarded`); `incomplete matching refuses submit`; `fill blank waits SUBMITTED, leader marks 2 of 3 blanks right → GRADED with 2/3 of points`; `essay marked wrong → 0`; `marks_incomplete when a blank is missing`; `leader, admin and super can each mark` (owner: anything a leader can do the admin can); `student is notified "score is in" on grading before answers are released` (use `quizGradedCountFor`).
- [ ] **Step 3: Run** — `test:unit -- quiz-answer-refusal`, `test:integration -- quizzes-attempt-submit quizzes-online-grading` → FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** — `feat(backend): save, submit and right/wrong marking for every quiz type`.

### Task 8: Best attempt, release = answers, notifications, readers

**Files:**
- Create: `apps/backend/src/lib/quizzes/best-attempt.ts`
- Modify: `apps/backend/src/routes/quizzes/list.ts` (student arm: best graded score, visible once graded; PAPER score visible once entered — no release gate)
- Modify: `apps/backend/src/lib/queries/me/season-record.ts:42-108`
- Modify: `apps/backend/src/lib/quiz-scope.ts` (`countGradedByQuiz` counts distinct students with any graded attempt)
- Modify: `apps/backend/src/lib/exports/season-workbook/load.ts`, `build.ts:95-111` (ONLINE quiz columns from best graded `totalScore`)
- Modify: `apps/backend/src/routes/quizzes/release.ts` (copy: "Answers released"; response `answersReleasedAt`), `apps/backend/src/routes/quizzes/paper-grades.ts` (notify on change regardless of release)
- Modify: `apps/backend/src/lib/quizzes/notify.ts` (`notifyQuizGraded` copy "Your score is in"; `notifyQuizResultsReleased` → `notifyQuizAnswersReleased`, "Answers are out", ONLINE students with any graded attempt; PAPER no longer notified on release)
- Test: `apps/backend/src/__tests__/quiz-best-attempt.test.ts`; modify `integration/quizzes-release-routes.test.ts`, `quizzes-crud-routes.test.ts` (list), and the season-record / workbook / dashboard tests that assert quiz scores (find with `grep -rln "totalScore\|resultsReleased" apps/backend/src/__tests__`)

**Interfaces — Produces:**
- `bestGraded<A extends { status: string; totalScore: Prisma.Decimal | number | null; attemptNumber: number }>(attempts: A[]): A | null` — highest `totalScore` among GRADED; ties → the later `attemptNumber`.
- `bestScoresFor(quizIds: number[], studentIds: number[] | null): Promise<Map<string /* `${quizId}:${studentId}` */, number>>` — one query over GRADED attempts (`groupBy` quizId, studentUserId, `_max: totalScore`).

- [ ] **Step 1: Failing unit tests** for `bestGraded`: picks the higher of two graded; ignores SUBMITTED/IN_PROGRESS; null when none graded; tie → later attempt.
- [ ] **Step 2: Failing integration tests:** `retake with a lower score keeps the best in the student list`; `retake with a higher score replaces it`; `student sees score once graded without release`; `release sends "Answers are out" once and is one-way`; `a retaken student counts once in gradedCount`; `workbook ONLINE column shows best score`; `paper grade visible to the student once entered`.
- [ ] **Step 3: Run** → FAIL.
- [ ] **Step 4: Implement.** Grep `resultsReleased` across backend `src` and `docs/` paths; rename user-facing fields to `answersReleased*` per Task 2; the DB column keeps its name (comment on the model: `// "answers released" since the quiz-types plan`).
- [ ] **Step 5: Run** — the touched unit + integration suites → PASS.
- [ ] **Step 6: Commit** — `feat(backend): best attempt counts; release now releases answers`.

### Task 9: Backend docs, rules and green check

**Files:**
- Modify: `apps/backend/src/docs/components/quizzes.ts` (split into `quizzes.ts` + `quiz-questions.ts` to stay < 400 lines), `docs/paths/quizzes-authoring.ts`, `docs/paths/quizzes-attempts.ts`
- Modify: `docs/rules/quiz-results.md` (rewrite: three student stages, best attempt, admin/super release answers, leaders can't; notifications)
- Create: `docs/rules/quiz-integrity.md` (types, points and marking formulas, shuffling, "admin = leader +" rule; timing and exits sections say "added by the timing / integrity plans")
- Modify: root `CLAUDE.md` rule table (add `quiz-integrity.md`; reword the `quiz-results.md` row to "score once graded, answers held until released"), `apps/backend/CLAUDE.md` API surface lines for quizzes if they name the old fields
- Modify: `scripts/check-dead.allow` only if a kept export has no other user

- [ ] **Step 1:** Update the OpenAPI components/paths for the new request/response shapes.
- [ ] **Step 2:** Write the two rule files and the table rows.
- [ ] **Step 3: Run** — `pnpm --filter @space/backend typecheck && pnpm --filter @space/backend test:unit && pnpm check:docs && pnpm check:dead && pnpm check:size`. Expected: all PASS (mobile typecheck still red until Task 15).
- [ ] **Step 4: Run** the whole backend integration suite in tmux: `tmux new -d -s space-v2-quiz-int "pnpm --filter @space/backend test:integration 2>&1 | tee ~/logs/space-v2-quiz-int.log"`. Expected: PASS.
- [ ] **Step 5: Commit** — `docs(quizzes): rules and API docs for question types and answer release`.

### Task 10: Mobile — Arabic content text

**Files:**
- Create: `apps/mobile/src/design/lib/text-direction.ts`
- Create: `apps/mobile/src/design/ui/content-text.tsx` (export from the `ui` barrel)
- Modify: `apps/mobile/src/design/ui/input.tsx`, `apps/mobile/src/design/ui/textarea.tsx` (optional `direction?: "rtl"|"ltr"` → `writingDirection` + `textAlign`)
- Modify: `apps/mobile/src/design/theme/fonts.ts` (add `IBMPlexSansArabic_400Regular`, `_600SemiBold` from `@expo-google-fonts/ibm-plex-sans-arabic`; add the dep to `apps/mobile/package.json`)
- Test: `apps/mobile/src/__tests__/text-direction.test.ts`, `apps/mobile/src/__tests__/content-text.test.tsx`

**Interfaces — Produces:**
- `textDirection(s: string): "rtl" | "ltr"` — first strong character: Arabic/Hebrew ranges (`֐-ࣿ`, `יִ-﷿`, `ﹰ-﻿`) → rtl; Latin letter → ltr; skip digits (Western and Arabic-Indic `٠-٩`), punctuation, spaces; none → ltr.
- `ContentText` — props of `Text` (variant etc.) plus `children: string`; sets `writingDirection`, `textAlign` (`right` for rtl), and the Arabic font family for rtl (weight 600 when the variant is bold). `selectable={false}` always.

- [ ] **Step 1: Failing tests:** `"اختر الإجابة" → rtl`; `"John 3:16" → ltr`; `"آية ٣ John" → rtl`; `"3:16 يوحنا" → rtl` (digits skipped); `"" → ltr`; `"١٢٣" → ltr`. Render test: `ContentText` with Arabic has `style` containing `writingDirection: "rtl"`, `textAlign: "right"` and the Arabic font family.
- [ ] **Step 2: Run** — `pnpm --filter @space/mobile test:unit -- text-direction content-text` → FAIL.
- [ ] **Step 3: Implement**; `pnpm install`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(mobile): direction-aware content text with an Arabic font`.

### Task 11: Mobile — hooks and answer model for the new contracts

**Files:**
- Modify: `apps/mobile/src/hooks/use-quizzes/student.ts` (`mergeSavedAnswers` per type), `grading.ts` (`useGradeEssays` → `useMarkAttempt` POSTing `MarkAttemptInput`), `apps/mobile/src/hooks/use-quiz-authoring.ts` (types follow), `use-quizzes/index.ts`
- Create: `apps/mobile/src/screens/quiz-detail/answer-model.ts`
- Modify: `apps/mobile/src/screens/quiz-detail/use-quiz-answers.ts` (uses `answer-model.ts`; `Answer` becomes the `answer` field of `QuizQuestionStudent`)
- Test: `apps/mobile/src/__tests__/quiz-answer-model.test.ts`; modify `quiz-runner-saves.test.tsx`, `quiz-runner-save-failures.test.tsx`

**Interfaces — Produces (`answer-model.ts`, pure):**
- `type DraftAnswer = QuizQuestionStudent["answer"]`
- `isAnswered(q: QuizQuestionStudent, a: DraftAnswer): boolean` (same rules as backend Task 4).
- `toAnswerInput(q: QuizQuestionStudent, a: DraftAnswer): QuizAnswerInput`
- `toggleChoice(a: {optionIds: number[]}, optionId: number, choose: number): {optionIds: number[]}` — untick if present; tick only while `length < choose`.
- `pairUp(a: {pairs}, leftId: number, rightId: number): {pairs}` — replaces any pair using that left or that right.
- `unpair(a: {pairs}, leftId: number): {pairs}`

- [ ] **Step 1: Failing tests:** `toggleChoice` won't exceed `choose`; untick frees a slot; `pairUp` moving a right item to a new left removes the old pair; `isAnswered` matching needs every left; `toAnswerInput` for each type matches `quizAnswerInputSchema.parse`.
- [ ] **Step 2: Run** — `pnpm --filter @space/mobile test:unit -- quiz-answer-model` → FAIL.
- [ ] **Step 3: Implement**; update the saves tests' fixtures to the new detail shape.
- [ ] **Step 4: Run** — `test:unit -- quiz-answer-model quiz-runner-save` → PASS.
- [ ] **Step 5: Commit** — `feat(mobile): quiz answer model and hooks for six question types`.

### Task 12: Mobile — the student runner per type

**Files:**
- Create: `apps/mobile/src/screens/quiz-detail/questions/{single-choice.tsx,multi-choice.tsx,true-false.tsx,matching.tsx,fill-blank.tsx,essay.tsx,index.tsx}`
- Create: `apps/mobile/src/screens/quiz-detail/blank-segments.ts` (pure)
- Modify: `apps/mobile/src/screens/quiz-detail/quiz-attempt-form.tsx` (private `AttemptQuestion` l.23 → `QuestionInput` from `questions/index.tsx`)
- Test: `apps/mobile/src/__tests__/quiz-blank-segments.test.ts`; modify `quiz-runner.test.tsx` (one case per type)

**Interfaces:**
- Consumes: `ContentText`, `Input`/`Textarea` `direction` (Task 10); `toggleChoice`, `pairUp`, `unpair` (Task 11).
- Produces:
  - `QuestionInput({ question, answer, onChange, disabled })` — switch on `question.type`.
  - `splitBlanks(prompt: string): ({ kind: "text"; text: string } | { kind: "blank"; index: number })[]` — splits on `{{blank}}`.
- UI per spec "UI": single/TF radios (`accessibilityRole="radio"`, kit `ChoiceChip`-style rows ≥ 44pt); MULTI `Checkbox` rows with a caption line `Choose N · k selected`, extra rows `disabled` once k = N; MATCHING tap-to-pair: two columns (sides follow `textDirection(question.prompt)`), tap a left item (highlighted) then a right item; paired items show the same small number badge (`Badge`), tap a paired left item to unpair; screen-reader label "Match {left} with …"; FILL_BLANK: sentence as wrapped `ContentText` runs with inline `Input` boxes (min width 88, `direction` of the prompt); below 360dp width or font scale > 1.15, blanks render as labelled fields under the sentence ("Blank 1", …). Answer inputs: `autoCorrect={false}`, `spellCheck={false}`.

- [ ] **Step 1: Failing tests:** `splitBlanks("a {{blank}} b {{blank}}")` yields text/blank/text/blank; `splitBlanks("{{blank}}")` yields one blank. Runner render tests: `choose-N disables a fourth tick when N is 3`; `matching: tap left then right pairs them and saves pairs`; `fill blank typing saves blanks`; `true/false shows True then False`; `Arabic prompt renders right-aligned`.
- [ ] **Step 2: Run** — `pnpm --filter @space/mobile test:unit -- quiz-blank-segments quiz-runner.test` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(mobile): take every quiz question type`.

### Task 13: Mobile — student result stages and review

**Files:**
- Modify: `apps/mobile/src/screens/quiz-detail/quiz-result-view.tsx` (stages), `student-quiz-runner.tsx` (switch on `detail.stage`)
- Create: `apps/mobile/src/screens/quiz-detail/review/{question-review.tsx,review-model.ts}`
- Modify: `apps/mobile/src/screens/work/work-model.ts`, `apps/mobile/src/screens/past-season/record-lists.tsx` (field rename `answersReleased`; score shown once graded)
- Test: `apps/mobile/src/__tests__/quiz-review-model.test.ts`; modify `quiz-runner-read-only.test.tsx`, `work-model.test.ts`

**Interfaces — Produces:**
- `reviewRows(q: QuizQuestionStudent): { label: string; mine: boolean; correct: boolean; isAnswerKey: boolean }[]` for choice types; matching → `{left, mine, correctRight, correct}`; blanks → `{index, text, expected, correct}`.
- Stages: `submitted` → status chip "Submitted" and "Your score appears once it's marked."; `graded` → `StatTile` score `x / max` + "Answers appear when your admin releases them."; `answers` → score + `QuestionReview` for each question (own answers marked right/wrong with `good`/`bad` tones and icons, never colour alone; the correct answer shown for wrong items).

- [ ] **Step 1: Failing tests:** `reviewRows` marks a wrong tick and shows the key; matching row shows the correct right label when wrong; runner shows no question text in `submitted` and `graded` stages; `answers` stage shows review.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(mobile): quiz score and answer-review stages`.

### Task 14: Mobile — authoring per type and the shuffle switch

**Files:**
- Modify: `apps/mobile/src/screens/quiz-edit/question-editor.tsx` (type picker `SegmentedControl`/sheet of six; per-type body)
- Create: `apps/mobile/src/screens/quiz-edit/editors/{choice-options.tsx,matching-pairs.tsx,fill-blank-editor.tsx,true-false-editor.tsx,editor-model.ts}`
- Modify: `apps/mobile/src/screens/quiz-edit/question-row.tsx` (summary line per type: "Single choice · 4 options", "Matching · 5 pairs", "Fill in the blank · 2 blanks"), `quiz-details-sheet.tsx` (+ "Shuffle questions" toggle, locked once attempts exist)
- Test: `apps/mobile/src/__tests__/quiz-editor-model.test.ts`; modify `quiz-authoring.test.tsx`

**Interfaces — Produces (`editor-model.ts`, pure):**
- `emptyDraft(type): QuizQuestionInput`
- `switchType(draft, type): QuizQuestionInput` — keeps prompt and points; carries option labels between SINGLE and MULTI.
- `insertBlank(prompt: string, cursor: number): { prompt: string; cursor: number }` — inserts `{{blank}}` at the cursor.
- `syncBlankAnswers(prompt: string, answers: string[]): string[]` — length follows `countBlanks(prompt)`, keeping existing answers by index.
- Fill-blank editor: prompt `Textarea` with an "Insert blank" `PillButton` at the cursor; one "Answer for blank N" `Input` per blank (shown to leaders while marking). Choice editors mark correct with `Checkbox` (MULTI) or radio (SINGLE). Matching editor: rows of left/right `Input` pairs, add/remove, 2–6. All inputs `direction` from their own text. Validation messages come from `quizQuestionRequestSchema` issues, shown at the field.

- [ ] **Step 1: Failing tests:** `insertBlank` at cursor; `syncBlankAnswers` grows and shrinks; `switchType` SINGLE→MULTI keeps labels; authoring render: `creates a matching question with 4 pairs` posts the right body; `fill blank editor shows one answer field per blank`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(mobile): author the six quiz question types`.

### Task 15: Mobile — right/wrong marking and release answers

**Files:**
- Modify: `apps/mobile/src/screens/quiz-grade/quiz-essay-grader.tsx` → rename `quiz-answer-marker.tsx` (`QuizAttemptAnswers` shows each type with the key; FILL_BLANK rows: student's text beside the expected answer with Right/Wrong `ToggleButtons`; ESSAY text with Right/Wrong; legacy numerically-marked essays read-only "Marked: x pts")
- Create: `apps/mobile/src/screens/quiz-grade/marking-model.ts` (pure: `initialMarks(attempt)`, `marksComplete(attempt, marks)`, `toMarkInput(marks)`)
- Modify: `apps/mobile/src/screens/quiz-grade/attempt-sheet.tsx` (`useMarkAttempt`; SaveBar disabled until `marksComplete`, hint "N of M marked"), `release-results.tsx` (copy: card "Answers", button "Release answers", confirm "Students will see every question with the right answers. This can't be undone.")
- Test: `apps/mobile/src/__tests__/quiz-marking-model.test.ts`; modify `quiz-grading-online.test.tsx`

- [ ] **Step 1: Failing tests:** `marksComplete` false with one blank unmarked; `toMarkInput` yields one mark per blank and `blankId: null` for an essay; grading render: `marking two of three blanks right posts three marks`; `release card says Release answers`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Run the whole check** — `pnpm check`. Expected: green across the workspace.
- [ ] **Step 6: Commit** — `feat(mobile): right/wrong marking and release answers`.

### Task 16: UI sweep and seed

**Files:**
- Modify: `apps/backend/scripts/seed-sweep/activity.ts` (a published quiz with all six types, Arabic prompts and options, one student with an IN_PROGRESS attempt, one graded, one with answers released)
- Modify: `apps/mobile/.maestro/sweep/student-scenarios/s06-quizzes.yaml` (shots of the open attempt for each type, the graded stage, the review), `admin-scenarios/s26-quizzes.yaml` (editor per type), `leader-scenarios/s16-quizzes.yaml` (marking)

- [ ] **Step 1:** Seed and flows; `maestro check-syntax` on each touched flow.
- [ ] **Step 2:** Run the `ui-sweep` skill for `s06,s16,s26` (tmux session `space-v2-sweep`, log `~/logs/space-v2-sweep.log`); look at every shot at 360dp/1.3 light and dark: Arabic right-aligned and shaped, inline blanks wrap, matching columns fit, no clipped SaveBar.
- [ ] **Step 3:** Fix what the shots show; re-run the affected flows.
- [ ] **Step 4: Commit** — `test(mobile): sweep the new quiz question types`.
