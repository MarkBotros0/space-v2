# Admin's manual score for online quizzes (plan 4) — design

Status: owner answered the open questions 2026-11-12; plan next, build after the owner OKs the plan.
Source: owner rulings 2026-11-10, recorded in `docs/superpowers/plans/2026-11-10-quiz-handoff.md`
("Not in the plans yet: plan 4"). Builds on plans 1–3 (question types, timing, integrity).

## Why

A student sometimes takes an online quiz outside the app: on paper because their phone died, or
in person after an honest accident. Or the in-app score is wrong for a reason the marking can't
fix. The season's admin needs to record a score for that student, and that score must be the
one that counts.

## Owner rulings (verbatim intent)

1. Online quizzes only. Paper quizzes keep their existing grade grid.
2. Only the season's admin and a super enter and edit it. Leaders keep their right/wrong marking
   and cannot see an edit control.
3. The admin's score **always** counts for that student. It overrides any in-app attempt, even
   when it is lower.
4. When entering it, the admin sees that the student is already graded in the app, and their
   app score.

## What gets built

- **Storage.** Reuse `QuizGrade` (one row per quiz and student, `score`, `notes`, `gradedById`,
  `gradedAt`), which paper quizzes already use. On an ONLINE quiz a `QuizGrade` row *is* the
  manual score. No new table.
- **The score that counts** (`lib/quizzes/best-attempt.ts` and every reader the rules list:
  the student's score, season record, list, workbook and exports, dashboards, grading lists):
  manual score if a row exists, otherwise the best GRADED attempt. One helper decides it, so no
  reader can disagree.
- **Endpoint.** `PUT /quizzes/:id/manual-scores/:studentUserId` `{ score, notes }` and
  `DELETE` to clear it. Gate: season admin or super (not `canGradeQuiz`, which admits leaders).
  Score 0..`maxScore`. Refused on a PAPER quiz and for a student not in the quiz's scope.
- **Staff UI.** In the grading list and the attempt sheet (admin and super only): "Enter score"
  / "Edit score". The sheet shows the student's app status ("Graded in the app: 7 / 10", "Waiting
  for marking", "In progress", "Didn't take it") above the score field, and a note that this score
  replaces the app's. Rows with a manual score carry a "Score entered by admin" label, and the
  grading list's score column shows the manual score.
- **Student.** Their quiz shows the manual score as their score, labelled "Score entered by your
  admin". Notification "Your score is in" on enter or change, silent on a no-op re-save (as paper).
- **Leak rule holds.** A manual score never moves a student to the `answers` stage by itself;
  questions and answers still need the release *and* an in-app graded attempt to review.
- Rules doc `docs/rules/quiz-results.md` gets a "Manual score" section; OpenAPI; raw-JSON leak
  test on the new responses.

## Owner answers (2026-11-12)

1. **Decimals: allowed.** `QuizGrade.score` widens from a whole number to `Decimal(8,2)` in one
   additive-safe migration (`ALTER COLUMN ... TYPE DECIMAL(8,2)`, every existing value fits), with a
   `rollback.sql` that rounds back. Paper grades then accept decimals too; the paper grid's input
   allows them.
2. **Taking it after a manual score: blocked.** Starting is refused (`manual_score_entered`) once a
   manual score exists; the student's quiz shows the score instead of Start.
3. **An attempt still open: refused.** Entering a score while the student has an IN_PROGRESS
   attempt answers 409 `attempt_open`; the sheet says "End their attempt first" and links to the
   live screen.
4. **Notes: shown to the student**, the same as paper.
5. **Clearing** (*my call*): the admin can clear the manual score, with a confirm; the student goes
   back to their best app attempt. Clearing does not reopen anything.

## Non-goals

- No change to marking, release, timing or integrity.
- No bulk entry grid for online quizzes (one student at a time).
- Leaders get no new powers.

## Left to the builder

Exact copy beyond the strings above, the sheet layout within the kit, test names.
