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
  ignores a report that claims more new watched time than twice the wall-clock time since the last
  one: watching at 2x, YouTube's top speed, counts in full (owner, 2026-11-13).
  **The player is the app's own (owner, 2026-11-15, replacing 2026-11-13's YouTube-only controls):**
  YouTube's controls are off and the app's are the only ones: play and pause (a tap on a playing
  picture pauses; a stopped picture shows YouTube's own play button, which a phone always obeys), back 10 seconds, a seek bar, the time, speed (1, 1.25, 1.5, 2, 0.5, 0.75x) and full screen
  (landscape; a timed question closes it and shows as usual). No quality setting: YouTube no longer
  lets an app choose one. The seek bar goes back freely; forward it stops at the next unanswered
  question and, with skipping blocked, at the furthest point watched. Each unanswered question is a
  dot on the bar. The bar shows what the player reports, and a Play the player doesn't take up within
  3 s is undone with "Tap the video to start it." Play, pause and speed are injected commands (the
  library's own messages are dropped by its hosted page; patched, owner 2026-11-15). YouTube's logo stays visible (YouTube's terms); tapping it, or any YouTube link in
  the frame, first asks "Open YouTube?" and says watching there doesn't count. The live
  count is to the second ("2 min 5 sec of 58 min"). Leave on "Not finished yet" leaves. A
  video is done when it is watched **and** every timed question on it is answered.
- **Track watching (owner, 2026-11-15):** each video part has an admin switch **"Track watching"**,
  on by default (every video made before it stays tracked). Off: opening the video counts as done
  (the screen's first report makes the student's work on it), its timed questions still pause the
  video and score but are optional, skipping is free (the skip switch hides and saves off), and
  leaving asks nothing. Switching it on or off resets nothing but settles the submitted students
  again, as adding a question does: one who only opened a video that is now tracked is reopened.
- **Essay (owner):** a question with a **minimum and maximum word count**; the student sees a live
  count. Optional file uploads, as before. **Each essay is reviewed on its own by the leader, who can
  return just that one essay (owner).** An essay needs typed words to be done; files are extras
  (builder's call).
- **Forum:** what FORUM assignments did before: minimum words, "post before reading others", allow
  comments, with its own prompt. **No leader review (owner).** A new forum starts with "post before
  reading others" off (owner, 2026-11-13).

## Submitting

- **Every video must be watched before Submit unlocks (owner, 2026-11-10).** There is no "submit
  anyway". Submit is accepted only when every part is done, videos included. The disabled Submit says
  what is left; leaving a video early says it doesn't count yet.
- **When an essay is handed in (builder's call):** with the assignment's Submit the first time;
  essays are drafts until then. A **returned** essay is handed in again from its own screen ("Hand
  in again"), which puts only that essay back in the queue and makes the assignment submitted again;
  no second Submit.
- **Marked submitted by staff (owner 2026-11-12):** the season's admin, a super or the student's leader
  can mark an assignment submitted for work done outside the app (`docs/rules/season-passing.md`). It
  counts as submitted everywhere, adds nothing to the review queue, sends no reminder and is hidden
  with the assignment if it is deleted. Returning an essay removes the mark.
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
- **The essay lives inside its assignment (owner 2026-11-14):** a leader's tab bar has **Work**
  (Assignments | Quizzes, as the admin's, without New buttons) in place of Submissions; an
  assignment with essays waiting says "N to review" (their own groups' students) and comes first,
  and the essay opens from its student on the assignment's page. A student's page has a **Work**
  section in place of Submissions: each assignment and quiz with what the student did, opening a
  pop-up with the parts (the handed-in essay opens to review) or the score.
- **The staff page (owner, 2026-11-13: "messy"):** one overview card (due date, reminder, Edit and
  Delete); parts named by their own words, right to left when Arabic, with "Part N · kind" under
  them; progress as "N of M students finished" with a bar, then Not finished and Finished as two tabs.
  A student who hasn't started any part shows "N parts left · not started" and no chips; chips appear
  once one part has moved. Reminder lines carry no dash: "No reminder: the next session was too close",
  "Tue 11 Nov, around 9:00 AM, to students who haven't finished".
- **Arabic in instructions:** the editor and the shown instructions set each paragraph's direction
  from its first letter, and the editor's toolbar is one row that scrolls sideways when narrow.

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
  the Details line says "No reminder: no session after it was published". When the reminder's time
  before that session had already passed at save time, none is sent either, even once a later session
  exists: "No reminder: the next session was too close".
- **The schedule runs inside the backend, request-driven (owner, 2026-11-10: "I want the schedule to
  be inside the backend", "I don't want to use the Vercel scheduler").** On any API request, about
  once a minute per server instance, one sweep at a time, the backend takes a database lease and, after
  the response, sends what is due
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
