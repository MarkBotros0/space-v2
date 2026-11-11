# What students see of a quiz (owner, 2026-11-10)

> Owner ruling, replacing the 2026-11-07 "results held until released" rule. Spec:
> `docs/superpowers/specs/2026-11-10-quiz-question-types-and-integrity-design.md`. Backend paths are under
> `apps/backend/src/`, mobile paths under `apps/mobile/src/`, unless written in full.

Students may take a quiz at different times, so the score and the answers are released separately.
A student's online quiz is in one of these stages (`lib/quizzes/student-stage.ts`, the one place
that decides; every student read goes through it):

1. **Submitted, until marked.** The student sees "Submitted" and nothing else: no question text, no
   options, none of their own answers. The result screen never lists the questions, so a student
   who finishes early cannot photograph them for someone still taking it.
2. **Graded.** The moment the attempt is graded (on submit when nothing needs a leader; otherwise when
   the leader or admin finishes marking) the student sees **their score only**. No release is needed
   for the score. Still no questions and no answers.
3. **Answers released.** When the season's admin or a super releases the answers
   (`POST /quizzes/:id/release`, one way, per quiz; `Quiz.resultsReleasedAt/ById`) the student can
   review every question with their answers marked right or wrong per item (each option, tick,
   pair and blank) and the correct answer shown. **Leaders cannot release answers.**

**The best attempt counts.** Wherever a student's quiz score is used (their own score, the season
record, exports and the workbook, dashboards, grading lists) it is the highest score among their
GRADED attempts. An attempt still waiting for marking does not count until graded. While a retake
is open the student keeps seeing their best graded score; with no graded attempt the quiz reads as
awaiting marking.

**A paper grade** shows to the student as soon as it is entered; it has no answers to hold.

**Notifications.** "Your score is in" when an online attempt is graded, and when a paper grade is
entered or changed. "Answers are out" when the answers are released, sent once to the online
students who have a graded attempt. Paper quizzes send nothing on release. A re-save that changes
nothing stays silent.

A new student read of quiz results must go through `lib/quizzes/student-stage.ts`. Staff see
`resultsReleasedAt` and `canReleaseResults`; the release card
(`screens/quiz-grade/release-results.tsx`) sits on the grading screen and the quiz page. Quizzes
graded before this existed were backfilled as released.
