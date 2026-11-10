# Assignments: one assignment, several parts (owner, 2026-11-10)

> Owner rulings from the multi-part assignments spec
> (`docs/superpowers/specs/2026-11-10-multi-part-assignments-design.md`), quoted as the spec records
> them. **(owner)** marks the owner's own call; **(builder's call)** marks a choice made while
> building that the owner can overturn. Backend paths are under `apps/backend/src/`, mobile paths
> under `apps/mobile/src/`, unless written in full.

## What an assignment is

- **An assignment is made of parts (owner).** Part kinds: **Video**, **Essay question**, **Forum
  post**. Any mix: video + essay, video + forum, essay + forum, all three, several videos, several
  essays. **At most one forum part per assignment (owner agreed).** An assignment needs at least one
  part to save.
- **No linked session (owner).** "Remove linked session from the app": the form field goes, and so
  does every place that shows an assignment under a session. The column is dropped.
- **No group targeting (owner):** an assignment is always for the whole season
  (`seasonParticipant`, `docs/rules/community-model.md`). The forum stays scoped to the student's
  group.
- **No migration of existing assignments (owner):** "Don't bother about the existing assignments. We
  didn't publish the app yet." The migrations dropped the old single-type assignment data.

## The parts

- **Video (owner):** a YouTube link played inside the app. Watching is tracked. Each video part has an
  admin switch **"Don't let students skip ahead"** (owner: "make it configuration to block or not
  block"). With it on, seeking past the furthest point reached snaps back to it; rewinding is always
  allowed. A video part may carry **timed multiple-choice questions** that pause the video, as session
  videos already do (owner: yes). No leader review (owner).
- **Watched (builder's call, owner agreed the idea):** the server keeps, per student and video part,
  the seconds that actually played, merged as intervals so re-watching a stretch counts once, and the
  furthest point reached. **Watched = watched seconds ≥ 90% of the video's length.** The server
  ignores a report that claims more new watched time than wall-clock time since the last one. A
  video is done when it is watched **and** every timed question on it is answered.
- **Essay (owner):** a question with a **minimum and maximum word count**; the student sees a live
  count. Optional file uploads, as before. **Each essay is reviewed on its own by the leader, who can
  return just that one essay (owner).** An essay needs typed words to be done; files are extras
  (builder's call).
- **Forum:** what FORUM assignments did before: minimum words, "post before reading others", allow
  comments, with its own prompt. **No leader review (owner).**

## Submitting

- **Every video must be watched before Submit unlocks (owner, 2026-11-10).** There is no "submit
  anyway". Submit is accepted only when every part is done, videos included. The disabled Submit says
  what is left; leaving a video early says it doesn't count yet.
- **When an essay is handed in (builder's call):** with the assignment's Submit the first time;
  essays are drafts until then. A **returned** essay is handed in again from its own screen ("Hand
  in again"), which puts only that essay back in the queue and makes the assignment submitted again;
  no second Submit.
- **Assignment complete:** submitted and every essay reviewed. An assignment with no essay is complete
  when submitted.
- **Owner, 2026-11-10: a returned essay handed in again after the due date counts as late.**

## Review and progress

- **Forum and video parts need no review (owner).** Only essays reach the review queue, one item per
  student per essay.
- **A leader can send back just one essay (owner):** **Mark reviewed** (feedback optional) or
  **Return** (a note is required). Returning one essay reopens only that essay; the student's other,
  finished parts stay done.
- **Leaders see progress per part** (owner: "the leader can see progress of the assignments
  finished"): one row per student, a mark per part, not-finished students first. Video question
  scores show there ("3 of 4 correct"); they are not a quiz, so `docs/rules/quiz-results.md`'s hold
  does not apply (builder's call).

## Editing after students started (builder's call)

Wording, dates and the reminder change freely. Removing a part, changing a video's link, or changing
an essay's word range once any student has work on it asks for confirmation that says how many
students it touches. Removing a part removes the students' work on it. Adding a part reopens the
assignment for students who had submitted. Changing a video's link resets watch progress and answers
on that part. Changing an essay's word range never reopens essays already handed in.
Adding or deleting a video's timed question asks nothing (the question editor says
"Students who already finished this video will need to answer new questions."), but it settles
every student under the assignment's lock: a submitted student it leaves short of the video is
reopened, and one it finishes (every part done, every essay reviewed) is complete
(`lib/assignments/part-questions.ts`, ruling I1).

## Reminders

- **The reminder is a configuration (owner):** On/Off; **[N] days before [the next session | the due
  date] at [time]**. Default: on, 2 days before the next session, at 9:00 AM (the owner's original
  ask). "The due date" needs a due date.
- **Only students who haven't finished (owner: "the student should not get a reminder if [they]
  already finished").** It goes to season participants whose assignment is not submitted; a returned
  essay makes it not submitted again. One reminder per assignment per student, as a push and an
  in-app notification (`ASSIGNMENT_REMINDER`, under the student's New assignments switch,
  `docs/rules/settings-account.md`), opening the assignment.
- **"The next session"** is the first session of the season starting after the assignment is
  published (`createdAt`), never the first after now (ruling I3). With none, no reminder is sent and
  the Details line says "No session after it was published — no reminder". When the reminder's time
  before that session had already passed at save time, none is sent either, even once a later session
  exists: "The next session was too close — no reminder".
- **The schedule runs inside the backend, request-driven (owner, 2026-11-10: "I want the schedule to
  be inside the backend", "I don't want to use the Vercel scheduler").** On any API request, at most
  once every ~5 minutes, the backend takes a database lease and, after the response, sends what is due
  (`lib/scheduler/`, `SCHEDULER_TICK`). **No crons on Vercel at all (owner, 2026-11-10: "remove any
  crons from vercel").** The mentor follow-up reminder runs on the same schedule.
- **Accepted trade-off:** a reminder goes out at the first request after its time, so the form says
  "around 9:00 AM", never an exact minute.

## Where it lives

Backend: `lib/assignments/` (writes, submit, essays, review, forum, reminder, standing),
`lib/queries/assignments/`, `lib/scheduler/`; contracts in `packages/shared/src/assignment.ts`,
`packages/shared/src/assignment-parts.ts` and `packages/shared/src/assignment-progress.ts`. Mobile:
`src/screens/assignment-detail/` (the student's checklist, the part screens, the leader's progress),
`src/screens/assignment-form/` (Details and Parts tabs), `src/screens/submission-review/` (one essay).
