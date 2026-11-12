# Season passing by weighted score — design

Status: draft for the owner's OK (2026-11-12); builder check done. Owner words are quoted or marked **(owner)**;
everything marked *(my call)* is the builder's choice and can be changed.

## Why

Staff judge whether a student passed a season on three things: attendance, assignments and
quizzes. Today they see attendance and assignments, quiz results are scattered, and at End
someone ticks the students who didn't pass by hand. The owner wants one clear progress picture
per student and a pass decision that comes from the numbers, set per season.

## Goals

1. **Progress is clear to staff (owner).** Admins, leaders and supers see, for each student in a
   season, three numbers: attendance %, assignments submitted / total, and quiz %.
2. **Quiz % (owner):** "the total score that the user got against the whole total quizzes grades".
3. **Passing by weighted score (owner).** When a season ends, the admin picks a weight for each
   of the three numbers (percentages adding up to 100) and a pass mark. Each student's one score
   is the weighted sum; a student at or above the pass mark passes.
4. **The score is never edited (owner):** "an admin should not be able to just change the score".
   Wrong inputs are fixed at the source: attendance (staff re-save a session), quiz scores (the
   admin's manual score, paper grades), assignments (new: mark as submitted, below).
4b. **The result can be overridden (owner, 2026-11-12):** "Everything can be overridden by an admin
   or a super user." The season's admin or a super can set a student's result to Passed or Did not
   pass against their score, in the End preview and after End. *(My calls:)* an override needs a
   short reason (10 to 1000 characters), records who and when, keeps the computed score untouched,
   and shows on the row as "Passed by {name}: {reason}" next to the score. Overriding to Passed on
   a graduating season graduates the student (as today's correction does); overriding to Did not
   pass never removes alumni status (as today). Leaders can't override.
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

## Ending the season with weighted passing

The End flow keeps its blockers step. The review step becomes **Pass criteria**:

1. Three weight fields (Attendance, Assignments, Quizzes) as whole percentages, with a live
   "Total 100%" line that must read exactly 100 before Continue is enabled; and a pass mark
   (0–100). Defaults: the last values used in this season's community, else 40 / 30 / 30 and 60
   *(my call)*.
2. A live preview: "18 pass · 4 don't", then every student with their score and their three
   numbers, those who don't pass first. Each row has "Override result" (reason required); an
   overridden row is labelled, and the counts include it.
3. Confirm sheet: "End {season}? 18 students pass, 4 don't." On a graduating season: "18
   students graduate as JPCS-YY."

- Who: the season's admin or a super (as End today).
- Saved on the season: the three weights and the pass mark, plus each enrolment's score and its
  three numbers at End, so the result can always be explained later *(my call)*.
- The server recomputes everything on End and refuses if anything changed since the preview
  (the existing `reviewed` check, extended to the criteria and the computed results).
- The score: Σ(number × weight) / 100, rounded to one decimal; pass when score ≥ pass mark.

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
- **End request.** `notPassed` is replaced by `{ weights, passMark }` plus the `reviewed` check
  (now over the criteria and the computed results). The app is TestFlight-only, so no older client
  needs the old shape.
- **Seasons ended before this.** No weights or stored scores: their results show as they are, with
  "Ended before weighted passing". Defaults for the next End are the last values used in any
  season, else 40 / 30 / 30 and 60.
- **Students list** loads the three numbers per page with the list, not per row.

## Left to the builder

Exact layout within the kit, field components, copy beyond the strings above, test names.
