# What students see of a quiz (owner, 2026-11-10)

> Owner ruling, replacing the 2026-11-07 "results held until released" rule. Spec:
> `docs/superpowers/specs/2026-11-10-quiz-question-types-and-integrity-design.md`. Backend paths are under
> `apps/backend/src/`, mobile paths under `apps/mobile/src/`, unless written in full.

Students may take a quiz at different times, so the score and the answers are released separately.
A student's online quiz is in one of these stages. `lib/quizzes/student-stage.ts` decides the
stage for the quiz detail read (`routes/quizzes/student-detail.ts`, which also serves the start and
submit responses). The results list (`routes/quizzes/list.ts`) and the season record
(`lib/queries/me/season-record.ts`) show no questions at all, only the attempt status and the
counting score (below), which they take from `countingScore` in `lib/quizzes/best-attempt.ts`
directly:

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
   Release answers sits on the quiz page and on grading, not on Edit quiz (owner, 2026-11-13).

An admin score (see "Manual score (admin)" below) reads as **Graded**, with no attempt or only a
SUBMITTED one behind it. It never reaches **Answers released** by itself: that still needs the
release and a GRADED attempt to review.

**The counting score.** Wherever a student's quiz score is used (their own score, the season
record, exports and the workbook, dashboards, grading lists) it is the admin's score if one exists
(see "Manual score (admin)" below), else the highest score among their GRADED attempts (`bestGraded`
in `lib/quizzes/best-attempt.ts`; `countingScore` picks between the two). An attempt still waiting
for marking does not count until graded. While a retake is open the student keeps seeing their best
graded score; with no graded attempt and no admin score the quiz reads as awaiting marking. The staff
grading list (`GET /quizzes/:id/attempts`) lists each student's latest attempt, the one marked or
reopened, and shows `bestScore` (`lib/queries/quiz-best-scores.ts`) as the score, which is the
counting score.

**A paper grade** shows to the student as soon as it is entered; it has no answers to hold.

**Notifications.** "Your score is in" when an online attempt is graded, and when a paper grade is
entered or changed. "Answers are out" when the answers are released, sent once to the online
students who have a graded attempt. Paper quizzes send nothing on release. A re-save that changes
nothing stays silent.

A new student read that shows questions must take its stage from `lib/quizzes/student-stage.ts`;
one that shows only a score takes it from `countingScore` (or `bestScoreByStudent` with the admin
scores, for many students), never from `bestGraded` alone, which ignores the admin's score. Staff see
`answersReleasedAt` and `canReleaseResults`; the release card
(`screens/quiz-grade/release-results.tsx`) sits on the grading screen and the quiz page. Quizzes
graded before this existed were backfilled as released.

## Manual score (admin)

> Plan 4. Spec: `docs/superpowers/specs/2026-11-12-quiz-manual-score-design.md`. Owner rulings are
> marked as such; the rest records what the code does.

The season's admin (or a super) can type one student's total on an ONLINE quiz: the `adminScore`
(`QuizGrade` with a score; `lib/quizzes/admin-score.ts` is the one definition of "has an admin score").
Leaders cannot; they only mark. Same gate as releasing answers (`canAdministerQuiz`). A paper quiz
keeps its grade grid. Routes: `PUT` and `DELETE /quizzes/:id/manual-scores/:studentUserId`
(`routes/quizzes/manual-score.ts`, `lib/quizzes/manual-score.ts`). The attempt's own `manualScore`
number (a leader's essay marks) is a different thing and is unchanged.

- **It always counts** (owner), even below the student's app score. It replaces the best attempt, it
  is not compared with it. Staff still see the app score (`appScore`) in the sheet, "Graded in the
  app: x / y", so they know what they are overriding (owner).
- **Decimals.** From 0 to the quiz's maximum, at most two decimals; a comma is read as the point.
  Above the maximum is `score_exceeds_max`. Scores show up to two decimals everywhere (`formatScore`
  trims zeros), so 7.55 never reads 7.6.
- **Blocked start (owner).** Once an admin score exists the student cannot start the quiz, nor start
  a reopened attempt: 409 `manual_score_entered`, "Your admin has entered your score for this quiz."
  Staff cannot reopen their attempt either: 409 `manual_score_entered`, "The admin has entered this
  student's score. Clear it to allow a retake." A retake would never count, so staff clear the score
  first. Start, reopen and save take the same locks (`lib/quizzes/student-lock.ts`), so they cannot race.
- **An open attempt refuses the save.** 409 `attempt_open`, "End their attempt first."; the sheet links
  to the live screen. A SUBMITTED attempt does not block it.
- **Unpublished quiz.** `PUT` is refused, 409 `quiz_not_published`, as releasing is: students cannot
  see a draft. `DELETE` is allowed, so an admin who unpublished after entering can still clear.
  Unpublishing is refused while any admin score exists, 409 `quiz_has_graded_attempts`: the score
  shows to the student at once, the same harm as hiding graded attempts. Both are read under the
  Quiz lock (`lib/quizzes/unpublish.ts` takes it FOR UPDATE, the save FOR SHARE), so a save and an
  unpublish cannot both go through.
- **Finished season.** Finished seasons never reopen, so their scores never change: `PUT` and `DELETE`
  are refused, 409 `season_finished`, "This season has ended; its scores can't change." Both lock the
  Season FOR SHARE first (then the Quiz and the student, as above), so neither can land while End
  runs, which takes the Season FOR NO KEY UPDATE.
- **The student sees it at once, with the note.** "Score entered by your admin", the score and the
  note the admin typed (the sheet says so under the Note field). No release is needed for the score,
  and there are no answers to wait for when no graded attempt is behind it. The past-season record
  carries it too (`adminScore` on the record rows).
- **Notifications.** "Your score is in" on a new or changed score, as for a paper grade. A notes-only
  edit or a re-save of the same score and note is silent, and so is a leader marking an attempt of a
  student who has an admin score: the admin's score still counts, so theirs didn't change. Clearing is silent and sends the student back
  to their best graded attempt; nothing is reopened.
- **Questions are frozen** once any admin score exists (`quiz_has_attempts`, "A score has been entered
  for this quiz, so its questions can no longer change."), so the maximum cannot drop under a score.
- **Season End.** A SUBMITTED attempt does not block End when its student has an admin score: marking
  it could not change any counted score (`lib/queries/season-end.ts`).
- **Counts.** A student with an admin score counts as graded: `gradedCount` on the quiz list and the
  participation figures use the counting score, not only graded attempts.
- **Mobile.** `screens/quiz-grade/manual-score-sheet.tsx` (Enter or Edit score, Clear score asks
  first, the confirm sits inside the sheet) and `manual-score-model.ts` (what the app has for the
  student, the typed score). Reached from the attempt sheet and the waiting list for admins only.
  Attempt rows and the attempt sheet read "Score entered by admin: x/y"; a waiting row reads "Score
  entered by admin" with "x / y" under it.
