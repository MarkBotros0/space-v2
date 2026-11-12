# Admin's manual score for online quizzes (plan 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The season's admin (or a super) can enter, edit and clear a score for one student on an ONLINE quiz, and that score always counts for that student.

**Architecture:** On an ONLINE quiz a `QuizGrade` row is the manual score (paper quizzes already use the table). One backend helper, `countingScore`, decides the score that counts (manual row first, else `bestGraded`), and every reader that uses `bestGraded` today goes through it. A new admin-only route writes the row; the student detail, list, season record and workbook read it.

**Tech Stack:** Express 5 + Prisma 7 (Postgres), Zod (`packages/shared`), Expo / React Query (`apps/mobile`).

**Spec:** `docs/superpowers/specs/2026-11-12-quiz-manual-score-design.md` (owner answers 2026-11-12). Rules: `docs/rules/quiz-results.md`.

## Global Constraints

- Online quizzes only; a PAPER quiz answers 409 `quiz_not_online` on the new route.
- Only the season's admin or a super: gate with `canReleaseQuizResults(user, seasonId)` (`routes/quizzes/release.ts`; move it to `lib/permissions/quiz.ts` so both routes import it). Leaders get 403 and see no control.
- The manual score always counts, even when lower than an in-app attempt.
- Score `0..maxScore`, at most two decimals. `QuizGrade.score` becomes `Decimal(8,2)`; read it with `toScore`.
- Refusals: an IN_PROGRESS attempt → 409 `attempt_open` "End their attempt first."; starting after a manual score → 409 `manual_score_entered` "Your admin has entered your score for this quiz.".
- The student sees the manual score and its note at once (no release), labelled "Score entered by your admin". "Your score is in" on enter or change; silent on a no-op re-save; nothing on clear.
- The leak rule holds: a manual score never moves a student to the `answers` stage; no question text, key or per-item correctness in any new response (raw-JSON tests).
- Migrations: one concern, `BEGIN; … COMMIT;`, a `rollback.sql`, cycled on the local throwaway DB only.
- No em dashes in UI copy. Relative imports; runtime `@space/shared` imports in the backend by relative path.

## Review Focus

1. A student with a manual score *and* a higher graded attempt: every reader (detail, list, season record, workbook, staff grading list) shows the manual score. Pinned in Task 2 (`every reader agrees on the manual score`).
2. Clearing the manual score returns the student to their best graded attempt, or to "not started" / "awaiting marking" if none. Pinned in Task 2 (`clearing returns to the best attempt`).
3. A manual score on a student with no attempt, then the answers released: the student still sees no questions. Pinned in Task 2 (`manual score alone never reaches the answers stage`).
4. Score `7.555` or `maxScore + 0.5` or negative is refused with 400; `7.5` is stored and shown as 7.5. Pinned in Task 1 (`score bounds and two decimals`).
5. A leader calling the route directly gets 403; an admin of another season gets 403. Pinned in Task 1 (`only the season admin or a super`).

---

### Task 1: Schema, contract and the admin route

**Files:**
- Create: `apps/backend/prisma/migrations/20261115010000_quiz_grade_decimal/{migration.sql,rollback.sql}` (`ALTER TABLE "QuizGrade" ALTER COLUMN "score" TYPE DECIMAL(8,2)`; rollback rounds back to integer)
- Modify: `apps/backend/prisma/schema.prisma` (`QuizGrade.score Decimal? @db.Decimal(8,2)`), the schema snapshot test fixture, `docs/database/erd.md`
- Modify: `packages/shared/src/quiz/writes.ts:83` (paper score accepts two decimals), add `manualScoreWriteSchema = { score: number 0..∞ with ≤2 decimals, notes: string | null } with the same notes limit as the paper grade schema`
- Create: `apps/backend/src/routes/quizzes/manual-score.ts` (`PUT` and `DELETE /quizzes/:id/manual-scores/:studentUserId`), service `apps/backend/src/lib/quizzes/manual-score.ts`
- Modify: `apps/backend/src/lib/quizzes/paper-grades.ts` and paper readers to read the Decimal with `toScore`; OpenAPI (`docs/paths/quizzes-authoring.ts`)
- Test: `apps/backend/src/__tests__/integration/quizzes-manual-score.test.ts`

**Interfaces — Produces:**
- `saveManualScore(quizId: number, studentUserId: number, input: { score: number; notes: string | null }, byId: number): Promise<{ changed: boolean }>` and `clearManualScore(quizId, studentUserId): Promise<void>` in `lib/quizzes/manual-score.ts`; throws `ApiError` 409 `attempt_open` when the student has an IN_PROGRESS attempt (checked in the same transaction, locking the student's attempts).
- Route responses: `PUT` → `{ score: number; notes: string | null; gradedAt: string; gradedBy: { id; name } }`; `DELETE` → 204.
- `canReleaseQuizResults` moved to `lib/permissions/quiz.ts`, renamed `canAdministerQuiz(user, seasonId)`.

- [ ] **Step 1: Failing tests:** `only the season admin or a super` (leader 403, other season's admin 403, super 200); `refused on a paper quiz` (409 `quiz_not_online`); `refused while an attempt is open` (409 `attempt_open`); `score bounds and two decimals` (7.5 ok and read back 7.5; 7.555, -1, maxScore+0.5 → 400); `student outside the quiz's scope → 404`; `re-save with the same score and notes notifies nothing; a change notifies "Your score is in" once`; `clear deletes the row and notifies nothing`; `raw JSON has no question text or answers`.
- [ ] **Step 2: Run** → FAIL. **Step 3:** migration (cycle apply → rollback → apply on `quiz_test`), schema, contract, service, route, notification via the existing paper-grade notify path. **Step 4: Run** → PASS; paper-grade suites still pass.
- [ ] **Step 5: Commit** — `feat(backend): the admin's manual score on online quizzes`.

### Task 2: The score that counts, everywhere

**Files:**
- Modify: `apps/backend/src/lib/quizzes/best-attempt.ts` (add `countingScore`), readers: `routes/quizzes/student-detail.ts`, `routes/quizzes/list.ts`, `lib/queries/me/season-record.ts`, `lib/queries/quiz-best-scores.ts`, `routes/quizzes/grading.ts`, `lib/exports/season-workbook/build.ts`, `lib/quizzes/start-attempt.ts`
- Modify: shared student detail / list / grading responses: add `manualScore: { score: number; notes: string | null } | null` (student) and `manualScore: { score; notes; gradedAt; gradedByName } | null` (staff grading row)
- Test: `apps/backend/src/__tests__/integration/quizzes-manual-score-readers.test.ts`, unit `best-attempt.test.ts`

**Interfaces — Produces:**
- `countingScore(manual: { score: Prisma.Decimal | number | null } | null, attempts: A[]): { score: number; source: "manual" | "attempt" } | null`: manual row wins whenever it exists; otherwise `bestGraded`.
- Student stage: a manual score with no graded attempt reads as stage `graded` (score shown); `answers` still needs `answersReleased` **and** a graded attempt. `studentQuizStage` gains a `manual: boolean` argument.
- Start: `startAttempt` refuses with 409 `manual_score_entered` when a manual row exists.

- [ ] **Step 1: Failing tests:** `every reader agrees on the manual score` (manual 4/10 with a graded attempt of 9/10: detail, list, season record, workbook row, staff grading `bestScore` all 4); `clearing returns to the best attempt` (→ 9; with no attempts → not_started; with only a SUBMITTED one → awaiting marking); `manual score alone never reaches the answers stage` (release answers; detail has no questions; raw-JSON check); `start is refused once a manual score exists`; `the student sees the admin's note`; unit tests for `countingScore`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; the whole integration suite in tmux (`space-v2-quiz-p4-int`, `~/logs/space-v2-quiz-p4-int.log`) green.
- [ ] **Step 5: Commit** — `feat(backend): the manual score counts wherever a quiz score is used`.

### Task 3: Mobile — enter, edit, clear; the student's view

**Files:**
- Create: `apps/mobile/src/screens/quiz-grade/manual-score-sheet.tsx`, pure `manual-score-model.ts`
- Modify: `apps/mobile/src/screens/quiz-grade/{online-grading.tsx, attempt-sheet.tsx}` (an "Enter score" / "Edit score" action for admin and super only; a "Score entered by admin" label on the row), `screens/quiz-detail/quiz-result-view.tsx` and the work/record list rows (manual score, "Score entered by your admin", the note), `quiz-detail/student-quiz-runner.tsx` (no Start when a manual score exists)
- Hooks: `useSaveManualScore(quizId)`, `useClearManualScore(quizId)` in `apps/mobile/src/hooks/use-quizzes/staff.ts` (invalidate attempts, live, lists, detail)
- Test: `apps/mobile/src/__tests__/quiz-manual-score.test.tsx`, `quiz-manual-score-model.test.ts`

**Interfaces — Consumes:** Task 1 route and errors, Task 2 response fields.
**Produces:** `manualScoreAppStatus(row): string` → "Graded in the app: 7 / 10", "Waiting for marking", "In progress", "Didn't take it"; `parseManualScore(text, maxScore): { ok: true; score: number } | { ok: false; error: string }` (accepts "7.5" and "7,5"; errors "Enter a score from 0 to {max}." / "Use at most two decimals.").

- [ ] **Step 1: Failing tests:** `the sheet shows the app status above the score field and says the score replaces the app's` (copy: "This score replaces the app's score for this student."); `leaders see no Enter score`; `saving posts and closes`; `attempt_open shows "End their attempt first." with a link to the live screen`; `clear asks to confirm, then deletes`; `the student sees the score, "Score entered by your admin" and the note, and no Start`; model tests for both functions.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `pnpm check` green.
- [ ] **Step 5: Commit** — `feat(mobile): the admin's manual score`.

### Task 4: Rules, seed and flows

**Files:**
- Modify: `docs/rules/quiz-results.md` ("Manual score" section: who, always counts, decimals, blocked start, open attempt refused, note shown, clear), `apps/mobile/CLAUDE.md` feature map, `apps/backend/scripts/seed-sweep/activity.ts` (one manual score lower than the student's app score, with a note), `apps/mobile/.maestro/sweep/leader-scenarios/s16-quizzes.yaml` (the sheet; admin sign-in) and the student flow (the label)
- [ ] **Step 1:** Docs; `pnpm check:docs`. **Step 2:** Seed typechecks, flows parse; the sweep runs when the owner says go. **Step 3: Commit** — `docs(quizzes): the manual score rules; seed and flows`.
