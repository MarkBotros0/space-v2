# Student work: one My work tab (owner, 2026-11-07)

> Owner ruling, moved verbatim from the root `CLAUDE.md` (2026-11-10). Backend paths are under
> `apps/backend/src/`, mobile paths under `apps/mobile/src/`, unless written in full.

A student's bar is Home · Calendar · My work (`/work`) · More (owner merged To do and
Submitted on 2026-11-07; `/submitted` is gone). My work puts what still needs doing on
top, grouped as Overdue, Returned — needs changes, Due this week, Later, Quizzes to take
(or one "all caught up" row), then the history: Assignments handed in and Quizzes taken,
newest first, Waiting for review / Reviewed said in words, never colour alone, no figure
tiles. The season page (`/season`) shows the next session only, the group as one card
(name, leaders and members as pills, never list rows) and Your submissions: the last
assignment handed in and the last quiz taken, with See all to My work. Student Home leads
with the season card, then the next session, then To do; while check-in is open and they
haven't checked in, the session leads. There is no attendance streak anywhere.

**Home's To do (owner, 2026-11-13):** every open assignment (not submitted, or returned), whatever
its due date or none, and every open quiz, in one list, newest created first. An overdue or returned
row still says so on its chip. My work keeps its groups.

An assignment staff marked submitted (owner 2026-11-12, `docs/rules/season-passing.md`) reads Done in My
work with the line "Marked submitted by your leader"; it has no Submit and is never Overdue.

**Multi-part assignments (spec 2026-11-10, `docs/rules/assignments.md`).** On My work and Home an
assignment row "shows its parts count ("2 of 3 done") instead of a single status", and "Returned —
needs changes" groups an assignment with any returned essay. Builder's wording, for the owner to
check: "3 parts" before any part is done, "Ready to submit" once only Submit is
left; handed in, an assignment with an essay reads Waiting for review or Reviewed, and one with no
essay (videos and forum posts are never reviewed) reads Done.
