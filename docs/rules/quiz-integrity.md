# Quiz question types, marking and shuffling (owner, 2026-11-10)

> Owner ruling. Spec: `docs/superpowers/specs/2026-11-10-quiz-question-types-and-integrity-design.md`.
> What students see and when is in `docs/rules/quiz-results.md`. Backend paths are under
> `apps/backend/src/`, mobile paths under `apps/mobile/src/`, unless written in full.

## Question types

An online quiz question is one of six types. A new question starts at 1 point; the admin who builds the quiz sets each question's
points as a whole number from 1 to 100; leaders never type points.

| Type | Student does | Marked by | Points |
|---|---|---|---|
| Single choice | picks one option | server | all or nothing |
| Multiple choice ("Choose N") | ticks up to N options; N is the number of correct options; the app shows "Choose N" and allows no more | server | each correct tick earns 1/N of the points; a wrong tick earns nothing and nothing is taken off |
| True / false | picks True or False | server | all or nothing |
| Matching | pairs every left item with one right item (2 to 6 pairs) | server | each correct pair earns 1/pairs of the points |
| Fill in the blank | types a word or phrase into each gap of a sentence (one or more gaps) | leader, right or wrong per blank | each right blank earns 1/blanks of the points |
| Essay | free text | leader, points from 0 to the question's points (owner, 2026-11-13) | the points the leader gives |

- A fill-in-the-blank author writes the sentence, marks the gaps and gives the expected answer for
  each. The expected answer is shown to the leader while marking, never to the student before the
  answers are released.
- A matching author enters pairs; the two columns are shuffled separately for each student.
- Submitting is refused until every question is answered. Answered means: a pick; at least one tick
  on multiple choice; every left item paired on matching; every blank non-empty; an essay that is not blank.
- A quiz with attempts is structurally frozen: no question can be added, edited, deleted or reordered.

## Scores

Points per question are whole numbers; **awarded points and attempt totals are decimals kept to two
places and shown to one** (7.5 / 10). Everything that reads a quiz score, including the season
record, exports, dashboards, graduation checks and the grading screens, uses the decimal value.

## Shuffling

- Options are always shuffled for each attempt: single choice, multiple choice and both matching
  columns. True/false is never shuffled.
- Question order is shuffled for each attempt when the quiz's "Shuffle questions" switch is on
  (on by default; off for quizzes whose questions build on each other).
- The order is fixed for the life of an attempt: leaving and coming back shows the same order. A
  retake gets a new shuffle.
- Answers are stored by the identity of the option, item or blank, never by its position.
- Staff screens (preview, grading) show the author's order.
- The builder offers Move up / Move down only when "Shuffle questions" is off (owner, 2026-11-13): a
  shuffled quiz has no order for students to see.

## Marking

- **Anything a leader can do, the season's admin (and a super) can do too**: marking, the live
  screen, reopening, the exit log. `canGradeQuiz` is the one gate for all of them; "leader" below
  means any of them.
- The grading screen shows each blank as the student's answer next to the expected answer, with
  right or wrong per blank. Essays show the text with the points to give (owner, 2026-11-13: "I can
  give 1 mark from a total of 2"): whole points from 0 to the question's points, one button per
  score up to 5 points and a field with one point less / more above that. Leaders, the season's
  admin and a super all give essay points. A blank is right or wrong, never points.
- An essay given all its points is right, none is wrong, anything between reads "Partly right" to
  the student, with the points in the question's header.
- Once every leader-marked item is marked the attempt is GRADED. Marking can be changed afterwards.
- The server refuses an incomplete set of marks (`marks_incomplete`), and a mark for something that
  is not a blank or essay of the quiz, points on a blank, or more points than the essay is worth
  (`mark_out_of_range`).

## Honest accidents

A call, crash or dead battery can end an attempt. The fix is the existing reopen: a leader reopens
it as a retake, a fresh attempt with a new shuffle; answers from the first try do not carry over.
The ended attempt stays for staff to see. **The best attempt counts** (see `quiz-results.md`).

## Timing

- **The start window is optional and limits starting only.** A student who has begun is never cut
  off by it, and its end is inclusive (a start at exactly the closing time still works).
- **The time limit is per student**, counted from their own start (the first time they open the
  attempt), not from the window. It is read on the server's clock, never the phone's.
- **A 10 second grace** lets a save or submit that was already in flight at the deadline land.
- **Time out submits what is saved.** Unanswered counts 0. An empty blank or essay is wrong
  automatically and is not left for a leader to mark.
- **A reopen gets a fresh limit** and is not blocked by the window. A reopened timed attempt must be
  started again; its clock begins then.
- **The window can be edited any time. The limit is frozen once attempts exist.**
- **Staff (leader, admin, super) can End an open attempt** for a student in their set, timed or
  not. It is marked like a submit with `endReason` ENDED_BY_STAFF. One already past its deadline
  closes as TIMED_OUT instead, and End still succeeds.
- **The countdown stays in view** (owner, 2026-11-11): pinned in the quiz screen's top bar while the
  questions scroll, `m:ss`, red under a minute with the time still written. No five- or one-minute
  warnings and nothing beside Submit. At zero the app sends what is still unsaved, re-reads the quiz
  (the read closes the attempt) and says "Time's up. Your answers were submitted."
- **Zero is never a dead end.** If the re-read shows the attempt still open with time left on the
  server's clock (the phone's clock jumped forward), the form unlocks and the countdown re-arms from
  that read. If it can't confirm the close (offline, failed reads, or still open past the deadline),
  the form stays locked with "Check again" and re-reads by itself when the phone is back online or in
  the foreground.
- **An attempt ended elsewhere moves the screen on.** When a save or submit is refused because the
  attempt closed (staff End, or the server's clock ran out first) or a reopened attempt isn't started,
  the app stops saving and re-reads the quiz: the result, or the start card. A close says "This
  attempt has ended."
- **An expired attempt is closed by the scheduler** (`quiz-deadlines`) **or by the next read**,
  whichever comes first, so a dead phone never leaves it open.

## Integrity

Added by the integrity plan (spec: "Integrity", "Live screen"). What the phone blocks during an online
attempt, what counts as leaving the quiz, the three-exit limit, the relaunch lock, the screen before
starting and the staff live screen. Exits are counted on the server, never on the phone.

- **Blocked while an attempt is open:** screenshots and screen recording (the OS blanks them), copying
  question text, pasting into answer boxes, autocorrect and suggestions in answer boxes, the screen
  locking by itself, and the app's own banners and sounds (shown after the attempt ends).
- **A screenshot is logged, not counted.** It never warns the student and never ends the attempt.
- **An exit is the app going to the background:** the home screen, another app, the power button, a
  call that takes over the screen. Coming back shows the warning.
- **Not an exit:** the app only going `inactive` (Control Center, the notification shade, a Face ID or
  dictation prompt, the start of the app-switcher gesture); losing the internet; a keyboard.
- **Android split screen counts.** The window shrinking under 85% of the screen's height for more than
  one second is an exit; a drag shorter than that is not. Returning to full size is the return.
- **Closing the app counts once.** A kill, a crash or a dead battery is recognised on the next start
  of that attempt and stored as one `RELAUNCH`. A leave the phone never came back from is that same
  one exit, not two.
- **The limit is three.** The first and second exit show the warning. The third ends the attempt
  `ENDED_BY_EXITS`: it is marked like a submit, with what is saved. The third exit ends it; later ones
  in the same (offline) batch are logged. The warning never says how many
  exits are left: "You left the quiz. Leaving the quiz isn't allowed and has been recorded. Leaving
  again may end your attempt."
- **The warning shows within 2.5 seconds of the return, offline too.** If the server's answer comes
  in time and says the attempt ended, the app moves on to the result instead and no warning shows. A
  later "ended" still moves the screen on. An open "Submit quiz?" dialog is closed on the leave, so
  the warning is what the student sees on return.
- **Reports survive.** Each exit is queued on the phone with its own id and sent at once when online;
  what is still queued goes again on reconnect, on each return to the foreground and after each
  answer save. A kill does not lose the queue. A retry or a replay is counted once. Times are sent on
  the server's clock.
- **A reopened timed attempt not yet started has no exits.** It shows no questions, so leaving it
  counts for nothing (the server ignores the report).
- **A report after the attempt closed is ignored**, with no error.
- **Time up stops the count.** Once the countdown reaches zero the app no longer watches for leaving,
  and an exit that left at or after the deadline (in the seconds before the server closes the attempt)
  is logged, not counted: it can't end the attempt `ENDED_BY_EXITS`.

### Before you start

- **It replaces the start card for every online attempt**, a reopened timed attempt awaiting its start
  included. The student sees how many questions and points the quiz has, that there is one attempt,
  that every question must be answered, and then the time limit: "No time limit." or "You have N
  minutes from when you start. When time runs out, your saved answers are submitted."
- **Three points, verbatim:** "Turn on Do Not Disturb or Focus." / "Leaving the quiz is recorded.
  Leaving more than twice ends your attempt." / "Screenshots are blocked." The app cannot check Do
  Not Disturb.
- **"I'm ready" is the one thing that starts the attempt** and, on a timed quiz, its clock. The start
  window limits only a first start (see Timing), so "Opens at ..." or "Starting closed at ..." shows
  in its place; a reopened attempt is never blocked by it.
- **A reopened attempt awaiting its start has no way back**: no back link, no swipe, Android back does
  nothing. The student is already held on it.

### Relaunch and the route lock

- **Students only, timed and untimed.** While a student has an online attempt open (a reopened timed
  one awaiting its start too), the app shows that quiz and nothing else. Staff are never held.
- **Any other route goes back to the quiz:** a tab, a deep link, a notification tap, a check-in link.
  The held quiz has no back link, no swipe back, and Android back is ignored.
- **The lock is kept on the phone** and read again from the server (`/me/open-quiz-attempt`), so an
  online launch opens into the quiz before the server answers. An offline cold start goes to sign-in
  (Known limits).
- **It lifts on:** submit; time up (the close); staff End; `ENDED_BY_EXITS`; sign-out, forced or not;
  a quiz or season that is gone or closed to the student (404 or 403 on the quiz's own read, or a
  save, submit or exit report refused that way, which re-reads it). The quiz then shows "This quiz is
  no longer available." with the normal back. A transient error (offline, a failed read) keeps it. A
  student who is no longer a student (role change) is not held: the lock is for the `STUDENT` role
  only.
- **An open attempt in a finished season holds nothing**: the quiz shows "You didn't finish this
  quiz."

### Live screen

- **Who sees it:** a leader, the season's admin, a super (`canGradeQuiz`), from the quiz's preview
  (the "Live" pill).
- **What it shows:** In progress, Not started and Finished counts; "N people left the quiz at least
  once" when any did; each student as a row. Rows read: open attempts with exits first, then the
  other open ones, then not started, then finished; each by name. A row says the state, then the time
  left ("Time up, closing" when past it, "Retake not started" for a reopened timed attempt, "No time
  limit" when untimed) and the exits so far.
- **It reads every 4 seconds only while the screen is in front and the app is open**, and on pull to
  refresh. It never carries an answer.
- **It is for published online quizzes.** A deep link to a paper or draft quiz's live screen says
  "Live view is for published online quizzes." and reads no further.
- **A row opens a sheet.** **End attempt** (open attempts, after a confirm: "Their saved answers are
  submitted.") ends it `ENDED_BY_STAFF` with the staff member's name. **Reopen retake** (finished
  attempts) makes a fresh attempt, as in Honest accidents. A student who has not started has no sheet.

### Exit log

- **The attempt sheet in grading shows it**, staff only: how the attempt ended ("Submitted", "Timed
  out", "Ended, left the quiz", "Ended by {name}"), then one line per event, oldest first: "Left 6:02
  PM, away 0:42", "Closed the app 6:10 PM", "Took a screenshot 6:15 PM". An exit never reported back
  says "didn't come back"; the exit that ended the attempt (the third counted, oldest first) says
  "ended the attempt". Times are the phone's, moved onto the server's clock. With no events: "Never
  left the quiz".

### Known limits

- **Offline cold start goes to sign-in** and clears the stored lock. It is not an escape: the next
  sign-in reads the open attempt and holds the student again.
- **The first launch after an update may show Home briefly** until the open-attempt read answers.
- **The open-attempt read runs at mount and on reconnect only.** A lift in between (staff End, the
  scheduler) reaches a held student through the quiz's own reads.
- **Android counts a peek at Recents as an exit; iOS's app-switcher peek does not.** The app cannot
  tell the two apart on iOS (`inactive` alone is never an exit).
- **An Android floating window** (picture-in-picture or a bubble) that does not resize ours is not
  counted: it cannot be told apart from the notification shade, which must not count.
- **The third exit ends the attempt; later ones in the same batch are logged**, and a screenshot is
  logged but never counted. The live screen's count is every exit stored.
- **The exit report doesn't check that the quiz is published or online**, like the save and submit
  routes (`loadTakeableQuiz`): an unpublished quiz's attempt can still be ended by exits.
- **The stored lock isn't kept per user.** Sign-out clears it; a wrong id lets go on its first read
  (404, or not in progress).
