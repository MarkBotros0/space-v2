# Season passing by weighted score — design

Status: draft for the owner's OK (2026-11-12); builder check done. Owner words are quoted or marked **(owner)**;
everything marked *(my call)* is the builder's choice and can be changed.

## Why

Staff judge whether a student passed a season on three things: attendance, assignments and
quizzes. Today they see attendance and assignments, quiz results are scattered, and at End
someone ticks the students who didn't pass by hand. The owner wants one clear progress picture
per student, a score that helps staff select who passes and spot who needs to improve, and the
final say left with the admin or super.

## Goals

1. **Progress is clear to staff (owner).** Admins, leaders and supers see, for each student in a
   season, three numbers: attendance %, assignments submitted / total, and quiz %.
2. **Quiz % (owner):** "the total score that the user got against the whole total quizzes grades".
3. **A weighted score (owner).** A weight for each of the three numbers (percentages adding up
   to 100) and a pass mark; each student's one score is the weighted sum.
4. **The score is never edited (owner):** "an admin should not be able to just change the score".
   Wrong inputs are fixed at the source: attendance (staff re-save a session), quiz scores (the
   admin's manual score, paper grades), assignments (new: mark as submitted, below).
4b. **The admin decides; the score helps (owner).** See "The score is a helper".
5. **Staff mark an assignment as submitted (owner):** the season's admin, a super **and the
   student's leader** can mark an assignment as submitted for a student who did it outside the app.
6. **Super user friendly** for admin and super (owner), in the app's own design kit.

## Non-goals

- No change to how attendance is taken, how quizzes are marked or how essays are reviewed.
- The super-only "graduate by exception" stays as it is.
- The existing engagement score (50/50 attendance and submissions, reports and dashboards) is
  not replaced *(my call: it is a different, older number used on reports; keep it)*.

## The three numbers (one definition, used by the progress view and by End)

- **Attendance %**: the existing `attendancePct` (present and late count; the denominator
  starts at the student's own enrolment), as season End and the student page show today.
- **Assignments**: submitted ÷ the season's assignments (every assignment is for the whole
  season). "Submitted" = the student submitted it in the app, **or** staff marked it submitted.
  Shown as "7 / 9" with the percentage.
- **Quiz %**: Σ the student's counting score on every quiz ÷ Σ the max score of those quizzes.
  - Which quizzes: every published ONLINE quiz and every PAPER quiz of the season *(my call)*.
  - A quiz the student didn't take, or has no grade for, counts as 0 of its max *(owner: "against
    the whole total")*.
  - Counting score = the admin's score if there is one, else the best graded attempt (plan 4);
    a paper quiz uses its grade. An attempt still waiting for marking counts 0 until marked
    *(my call; End already refuses while attempts wait for marking)*.
- **A number with nothing to count** (a season with no sessions, assignments or quizzes) shows
  "None this season" and can't carry weight at End *(my call)*.

One backend function computes all three for a set of students in a season; every screen reads it.

## Staff mark an assignment as submitted

- Who: the season's admin, a super, and a leader for the students in their own groups **(owner)**.
- Where: the assignment's staff page (per-student progress row) and the student's page. Action
  "Mark as submitted", with a confirm; undo "Undo, not submitted" *(my call)*.
- What it means: the assignment counts as submitted for that student in every count (progress,
  End, the student's My work). It does not create essay answers; nothing enters the review queue;
  it doesn't notify anyone *(my call)*.
- Recorded: who and when; shown to staff as "Marked submitted by {name}" and to the student as
  "Marked submitted by your leader" *(my call)*.
- Not on a finished season (finished seasons never reopen).
- If the student later submits in the app, their own submission stands and the mark is kept for
  the record *(my call)*.

## Progress for staff

- **Student page** (staff): a "Season progress" card with the three numbers, each as a labelled
  bar with the exact figure ("Attendance 85% · 17 of 20 sessions", "Assignments 7 / 9",
  "Quizzes 72% · 36 of 50 marks"). Tapping a number opens its detail (sessions, assignments,
  quizzes list) *(my call)*.
- **Students list** (staff): each row shows the three percentages compactly
  *(my call, so a leader scans a group without opening every student)*.
- Leaders see their own groups' students; admins and supers see the season.

## The score is a helper (owner, 2026-11-12)

"The new scoring criteria is only a helper for the admin or the super to bulk select students that
will pass, and to also notice which students that need enhancing their assignments or enhancing
their quizzes to take it as a reattempt in order to enhance their own score to pass the season."

So the score never decides on its own. It does two jobs: it pre-selects who passes at End, and it
shows, during the season, who is below the mark and which number is pulling them down.

### Pass criteria on the season

- The season's admin or a super sets three weights (whole percentages, a live "Total 100%" that must
  read exactly 100) and a pass mark (0-100), **at any time while the season is ACTIVE**, from the
  season page *(my call: set early so the outlook works all season)*. Editable until End.
  Defaults: the last values used in any season, else 40 / 30 / 30 and 60.

### Passing outlook (during the season)

- A screen from the season page: "14 on track · 6 below the mark", then every student with their
  score, those below the mark first. Each student below the mark shows how far they are ("8 points
  short") and their weakest number ("Quizzes 45%").
- From a student's row: their missing assignments, and their quizzes with the lowest scores, with
  the actions that already exist: staff **Reopen retake** on a quiz, **Mark as submitted** on an
  assignment, and sending the student a reminder through existing announcements *(my call: no new
  messaging)*.
- Admin and super see the whole season; leaders see their own groups' students, read-only on the
  criteria *(my call: leaders are the ones who push students to improve)*.

### Ending the season

The End flow keeps its blockers step. The review step:

1. The criteria (pre-filled from the season, adjustable here).
2. Every student with their score and three numbers, **pre-selected Passed when their score reaches
   the pass mark**, with "Select all on track" / "Clear" bulk actions and a per-row Passed / Did not
   pass toggle. The admin decides; the score only pre-selects. A row chosen against its score is
   labelled "Passed below the mark" / "Did not pass above the mark" *(my call: no reason required,
   an optional note)*.
3. Confirm sheet: "End {season}? 18 students pass, 4 don't." On a graduating season: "18
   students graduate as JPCS-YY."

- Who: the season's admin or a super (as End today).
- Saved: the weights and pass mark, each enrolment's score and three numbers at End, its result
  and whether it was chosen against the score, with who and when.
- The server recomputes the scores on End and refuses if they changed since the preview (the
  existing `reviewed` check, extended).

### After End

The season's admin or a super can change a student's result afterwards **(owner: "Everything can be
overridden by an admin or a super user")**; today only a super can. Passed on a graduating season
graduates them; Did not pass never removes alumni status (as today). The stored score is unchanged.

## Constraints

- Existing End rules hold: blockers, one transaction, WITHDRAWN untouched, graduating seasons
  graduate the passers, finished seasons are locked.
- Lock order for seat writes (Season, then People, then rows) and the quiz locks from plan 4.
- New columns via additive migrations; mobile follows `apps/mobile/CLAUDE.md` (design kit,
  layers, calm motion, no em dashes, 44 pt targets, labels on every control, status never by
  colour alone, works at 360×640 and font 1.3, light and dark).

## Calls settled after the builder check *(my calls unless marked)*

- **A number with nothing to count.** For the season as a whole (no sessions, no assignments or no
  quizzes) its weight field is off and fixed at 0; the other two must total 100. For one student
  whose own denominator is empty (enrolled after the last session), their score is re-scaled over
  the numbers they do have, and the preview says so on their row.
- **Rounding.** The score is rounded to one decimal and the rounded score is compared with the pass
  mark, so what the admin sees is what decides (59.96 shows 60.0 and passes a mark of 60).
- **Quiz % scope.** Every published ONLINE quiz and every PAPER quiz of the season counts, whatever
  the student's enrolment date (assignments are whole-season too). A quiz with a retake open counts
  the best graded score so far.
- **Attendance %** is exactly the existing `attendancePct`; the code's definition wins over any
  wording here.
- **A staff mark** is its own record (who, when) next to the submission. "Submitted" everywhere
  (progress, End, My work, reminders, reports) reads "submitted in the app **or** marked by staff",
  through one shared definition. A marked assignment also counts as complete; it puts nothing in the
  review queue, and reminders skip it. Leaders mark for students in their groups while the season
  is ACTIVE; any staff member who may mark may undo, including a mark another made.
- **End request.** Keeps `notPassed` (the admin's final selection) and adds `{ weights, passMark }`;
  the `reviewed` check now also covers the criteria and the computed scores. The app is TestFlight-only, so no older
  client needs the old shape.
- **Seasons ended before this.** No weights or stored scores: their results show as they are, with
  "Ended before weighted passing".
- **Students list** loads the three numbers per page with the list, not per row.

## Left to the builder

Exact layout within the kit, field components, copy beyond the strings above, test names.
