# Quiz types / timing / integrity — build handoff (2026-11-11)

Branch `feat/quiz-types-timing-integrity`, started from `main` a5c9cdca. Plans, run strictly in order:
1. `docs/superpowers/plans/2026-11-10-quiz-question-types.md` (16 tasks) — **Tasks 1–7 done and reviewed; Task 8 partial (WIP commit, unreviewed); Tasks 9–16 not started.**
2. `docs/superpowers/plans/2026-11-10-quiz-timing.md` (4 tasks) — not started.
3. `docs/superpowers/plans/2026-11-10-quiz-integrity.md` (7 tasks) — not started.
Spec: `docs/superpowers/specs/2026-11-10-quiz-question-types-and-integrity-design.md`.

## Done (plan 1)

| Task | Commit | Notes |
|---|---|---|
| 1 Schema + 4 migrations + check script | 9b67efb3 | migrations **never applied anywhere**; schema snapshot **not regenerated** |
| 2 Shared contracts | f63b94bc | |
| 3 Score helpers + seeded shuffle | 2faf333e | |
| 4 Pure marking | 595f8c36 | |
| 5 Authoring per type | 9bb5d5b4 | publish tests moved to `quizzes-publish-routes.test.ts`; legacy `options` always `[]` |
| 6 Student read, stages, no leaks | 02fc36c9 | keyless selects before release; leak test covers all pre-release stages |
| 7 Save / submit / right-wrong marking | 1e6a4223 | new ApiErrorCodes too_many_choices, mark_out_of_range, marks_incomplete |
| 8 Best attempt, release = answers | WIP commit after 1e6a4223 | **partial, unreviewed** — see below |

Unit tests were run TDD (RED → GREEN) for every task. **No integration test has been run** for Tasks 5–8 (written and type-clean only), because the build machine had no database.

## Task 8 state (WIP)
Uncommitted work was saved as a WIP commit. It contains `lib/quizzes/best-attempt.ts` + `quiz-best-attempt.test.ts` and edits to list.ts, season-record.ts, quiz-scope.ts, season-workbook load/build, release.ts, paper-grades.ts, notify.ts, grading.ts, student-detail.ts, two OpenAPI files and some integration tests. Unknown whether it is complete or its tests pass. Next agent: diff it against the Task 8 brief, finish, run the unit tests, then review. Also assigned to Task 8 (orphaned tests on the old save body): `season-lock-students.test.ts:~354`, `alumni-studying.test.ts:~150`, `season-finished-reads.test.ts:~206` (`awards`), `quizzes-attempts-routes.test.ts:~110,120` (staff `correctIndex`); replace the private `bestGradedOf` in `student-detail.ts` with `bestGraded`; add a two-attempt answers-stage integration case.

## Must do on the machine with the database (local `space_test`, container `space-v2-sweepdb`)
1. `pnpm --filter @space/backend check:quiz-types` (read-only check) first.
2. Cycle the four migrations `20261112010000…040000`: apply → rollbacks in reverse → apply (`pnpm --filter @space/backend db:migrate:local`). Never `prisma migrate dev`/`reset`/`db push`.
3. Regenerate the schema snapshot (`jest --config jest.integration.config.js schema-snapshot -u`) and commit it.
4. Run the whole backend integration suite; fix failures (expect some: none of Tasks 5–8's integration tests have ever run).
5. Plan 1 Task 16 sweep, plan 3 Task 7 (real iPhone + Android).

## Rulings made (cost if wrong in brackets)
- E1–E4: no DB on the build machine, so migrations/check/snapshot/integration/sweep runs were deferred to the DB machine (owner instruction) [failures found later].
- Tasks 3+4 were batched into one implementer [one bigger review].
- Orphaned old-shape integration tests assigned to Task 8 [none].
- Commits authored `jesusprojectcommunity` via repo-local git config (owner); remote `jpc` added.

## Deferred review findings (triage in the final whole-branch review)
- **Must fix before merge:** `lib/quizzes/questions.ts:5` and `:82` contain U+FFFD where em dashes were.
- **Must triage (leak rule):** `packages/shared` `quiz-schemas.test.ts` leak test checks only top-level keys — add nested assertions (studentOptionSchema keys exactly id,label; blank/matching items reject expected/isCorrect).
- **Carry into plan 2 (timing):** a leader can mark an empty blank right (points count, `listAttempts` shows `correct: null`) — reachable once time-outs submit incomplete attempts.
- **Task 9 must fix:** `check:docs` fails on `docs/rules/quiz-results.md` naming deleted `lib/quiz-results.ts`; root `CLAUDE.md` row mentions `studentAttemptStatus`; OpenAPI still describes `awards`/`selectedIndex`.
- check:dead fails on a few exports until consumers land (question-rows OptionRow/BlankRow, quizQuestionTypeSchema, studentOptionSchema, StudentOption, MarkAttemptInput).
- Minor: backfill seed can be 0 (1 in 2^31); CRLF checkout of `schema.prisma` makes schema unit tests find 0 models on Windows (`.gitattributes eol=lf`); FILL_BLANK answer blankIds not unique-refined in shared (server refuses); shuffleQuestions guard not atomic; publish re-validation tested for one bad case only; marking.ts unanswered branch readability; no tests for foreign option ids in marking; concurrent first grades can notify twice; QuizStage not exported; `loadStudentQuizDetail` 54 lines.
- `hasEssays` in the grading contract now means "has FILL_BLANK or ESSAY questions" (name unchanged).

## Not in the plans yet: plan 4 (owner, 2026-11-10)
After plan 3: staff can record that a student took an ONLINE quiz and enter a score by hand. Owner rulings: online quizzes only; only the season admin (and super) enter and edit it; leaders keep right/wrong marking; the admin's score ALWAYS counts for that student, overriding any in-app attempt even when lower; the admin sees the student is already graded (and their app score) when entering. Write a short spec + plan and get the owner's OK before building.
