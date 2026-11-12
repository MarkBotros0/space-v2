# Season passing by weighted score (owner, 2026-11-12)

> Owner rulings are quoted or marked **(owner)**; anything marked *(builder's call)* is the builder's
> choice and can be changed. Design: `docs/superpowers/specs/2026-11-12-season-passing-design.md`.
> Backend paths are under `apps/backend/src/`, mobile paths under `apps/mobile/src/`, unless written
> in full. Where the spec and the code differ, the code is what this file describes.

## The score is a helper (owner)

"The new scoring criteria is only a helper for the admin or the super to bulk select students that
will pass, and to also notice which students that need enhancing their assignments or enhancing their
quizzes to take it as a reattempt in order to enhance their own score to pass the season." The score
never decides on its own. **An admin should not be able to just change the score (owner):** wrong
inputs are fixed where they come from (re-save attendance, the admin's quiz score, paper grades, mark
an assignment submitted). **Everything can be overridden by an admin or a super (owner)**, at End and
after it.

## The three numbers

One loader, `lib/passing/numbers.ts`, gives them to the progress card, the outlook and End.

- **Attendance** *(builder's call)*: present or late, over the sessions that have started, counted
  from the student's own enrolment (the student page's formula).
- **Assignments**: submitted over the season's live assignments (all are for the whole season).
  Submitted means handed in in the app **or** marked by staff (`lib/assignments/submitted.ts`, the one
  definition). A deleted assignment drops out of the total, and its staff marks with it.
- **Quizzes (owner)**: "the total score that the user got against the whole total quizzes grades". The
  student's counting score on every published online quiz and every paper quiz, over their max
  scores. A quiz not taken or not graded counts 0 of its max. The counting score is the admin's score
  if there is one, else the best graded attempt; a paper quiz uses its grade.
- A number with nothing to count shows "None this season" and carries no weight.

## The score and rounding *(builder's call)*

Σ weight × percentage ÷ Σ weight, over the weighted numbers the student has. A weighted number the
student has nothing for (enrolled after the last session, say) is left out and the rest re-scaled; the
row says "Scored without ...". No weighted number left: no score. The score is rounded to one decimal
and the rounded score is compared with the pass mark, so what the admin sees is what decides (59.96
shows 60.0 and passes a mark of 60).

## Criteria

- **Three weights adding up to exactly 100 and a pass mark of 0 to 100 (owner).** Set by the season's
  admin or a super, **while the season is ACTIVE**, from the Passing screen (`PUT
  /seasons/:id/pass-criteria`); End takes the final ones. Defaults: the last criteria saved on any
  season, else 40 / 30 / 30 and 60, shown as "Suggested criteria". Leaders and mentors do not set them.
- A weight on a number the season has nothing for is refused (`weight_on_empty`, 400), and an
  inherited default that has one counts that number as 0. A season with nothing at all to count has no
  scores and no criteria to change.
- No record of who saved criteria mid-season *(builder's call)*; End stores who ended with which.

## Outlook (during the season)

`/seasons/[code]/passing` (the Passing tile): "N on track, N below the mark", then every student with
their score, those below the mark first, each with how far short and the weakest number. From a row:
missing assignments and lowest quizzes, with **Mark as submitted**, **Reopen retake** (only on a taken
online quiz; else "Open grading") and **Send a reminder** (a new announcement; admin and super only,
leaders do not post). Admin and super see the whole season; a leader sees their own groups' students,
read-only on the criteria. **A mentor sees none of it (mentor.md "sees nothing season-shaped"):** the
students list carries `progress: null` and `GET /students/:id/progress` answers 403.

## Staff mark an assignment submitted (owner)

- **Who (owner):** the season's admin, a super and the student's own leader, on an ACTIVE season, for
  an ACTIVE student in it. Any of them may undo, including a mark another made. `PUT` / `DELETE
  /assignments/:id/submitted-marks/:studentUserId`.
- **What it means:** the assignment counts as submitted everywhere (progress, End, My work, reminders,
  reports). It writes no essay answers, reaches no review queue and notifies nobody. After a mark the
  student sees Done with no Submit and no Overdue *(builder's call)*.
- **Shown** to staff as "Marked submitted by {name}", to the student as "Marked submitted by your
  leader". Undo is "Undo, not submitted"; it also removes the Submission when the mark was all it held.
- **If the student also submits in the app,** their own submission stands, the mark is kept, and
  there is no Undo beside it (it has no effect there).
- **Returning an essay removes the mark** *(builder's call)*: staff asked for rework, so it counts as
  not submitted until handed back.
- **Deleting an assignment hides its marks** (soft delete, `liveAssignment`).
- Locks: a mark or undo takes the Season FOR SHARE, then the student's User row FOR SHARE, then the
  Assignment (`docs/rules/roles.md`).

## Season progress on the student's page

Staff see a "Season progress" card (attendance, assignments, quizzes, each a labelled bar with the
exact figure) in place of the old engagement "THIS SEASON" card. It shows **no composite score**
(owner 2026-11-07, "no composite score"): the score appears only in the outlook and at End. Tapping a
number opens its list. The students list carries the three percentages per row.

## End and the stored snapshot

The review step has the criteria first (a card, changeable for this End), then every student with
their score, **pre-selected Passed when the score reaches the mark** (owner: the admin decides). Bulk
**Select all on track** and **Clear**; a per-row Passed / Did not pass. A result against the score is
labelled "Passed below the mark" / "Did not pass above the mark", with an optional note. Confirm names
the counts (and who graduates). Rules:

- The request carries `weights`, `passMark`, `notPassed`, `passedNotes` and `reviewed` (flag, roster
  and the score shown to each). The server recomputes the scores in the End transaction and refuses
  with `season_unfinished` if any differs from what was shown. A season with nothing at all to count
  skips the weight check and everyone starts Passed with "No score".
- Stored on the season: the weights and pass mark; on each enrolment: the score, the three numbers,
  the result, whether it went against the score, who and when. A season ended before this has none
  of it and reads "Ended before weighted passing".
- A staff write that changes a score (a mark, the admin's quiz score, a paper grade, an attendance
  save) takes the Season FOR SHARE first and End holds it FOR NO KEY UPDATE, so each lands wholly
  before End's recompute or waits and finds the season finished (a super may still write a finished
  season, as before).

## Results after End

`GET /seasons/:id/results` and `PATCH /seasons/:id/results/:studentUserId`. **Open to a super or
anyone with a SeasonAdmin row for the season, current or former** (owner: "everything can be
overridden by an admin or a super", outranking the older "former staff are cut off" for this one
screen); `canCorrectSeasonResults`. **A current mentor is refused** even with an old row. The stored
score is unchanged by a correction; whether the result goes against it is worked out again. Passed on a
graduating season graduates them then; Did not pass never removes alumni status
(`docs/rules/graduating-seasons.md`). A former admin reaches Results from the Reports header link; the
season page tile is for current admins and supers.

## Where it lives

Backend: `lib/passing/` (`numbers.ts`, `criteria.ts`, `outlook.ts`, `student-progress.ts`),
`lib/assignments/staff-mark.ts`, `lib/assignments/submitted.ts`, `lib/seasons/end-scores.ts`,
`lib/seasons/staff-write-lock.ts`, `routes/seasons/passing.ts`. Contracts:
`packages/shared/src/season-passing.ts`. Mobile: `src/screens/season-passing/`,
`src/screens/season-end/`, `src/screens/student-detail/season-progress-card.tsx`, the sheets in
`src/screens/assignment-detail/`; hook `src/hooks/use-season-passing.ts`.
