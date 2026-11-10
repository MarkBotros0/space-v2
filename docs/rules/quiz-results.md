# Quiz results are held until released (owner, 2026-11-07)

> Owner ruling, moved verbatim from the root `CLAUDE.md` (2026-11-10). Backend paths are under
> `apps/backend/src/`, mobile paths under `apps/mobile/src/`, unless written in full.

Students may take a quiz at different times, so nobody sees the marking until the season's admin
or a super releases it (`POST /quizzes/:id/release`, one way; `Quiz.resultsReleasedAt/ById`).
Grading still happens (an MCQ-only attempt is GRADED on submit), but every student read goes
through `studentAttemptStatus` (`lib/quiz-results.ts`): a graded attempt reads SUBMITTED and score,
`gradedAt`, `isCorrect` and `pointsAwarded` are null; a paper grade isn't listed. That covers the
quiz list, the quiz detail, the submit response and a past season's record; a new student read of
quiz results must use it too. Grade notifications stay silent while held; the release sends one
"Results are out" to everyone graded by then. Staff see `resultsReleasedAt` and
`canReleaseResults`; the Results card (`screens/quiz-grade/release-results.tsx`) sits on the
grading screen and the quiz page. Quizzes graded before this existed were backfilled as released.
