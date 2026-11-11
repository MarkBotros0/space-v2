# Quiz question types, marking and shuffling (owner, 2026-11-10)

> Owner ruling. Spec: `docs/superpowers/specs/2026-11-10-quiz-question-types-and-integrity-design.md`.
> What students see and when is in `docs/rules/quiz-results.md`. Backend paths are under
> `apps/backend/src/`, mobile paths under `apps/mobile/src/`, unless written in full.

## Question types

An online quiz question is one of six types. The admin who builds the quiz sets each question's
points as a whole number from 1 to 100; leaders never type points.

| Type | Student does | Marked by | Points |
|---|---|---|---|
| Single choice | picks one option | server | all or nothing |
| Multiple choice ("Choose N") | ticks up to N options; N is the number of correct options; the app shows "Choose N" and allows no more | server | each correct tick earns 1/N of the points; a wrong tick earns nothing and nothing is taken off |
| True / false | picks True or False | server | all or nothing |
| Matching | pairs every left item with one right item (2 to 6 pairs) | server | each correct pair earns 1/pairs of the points |
| Fill in the blank | types a word or phrase into each gap of a sentence (one or more gaps) | leader, right or wrong per blank | each right blank earns 1/blanks of the points |
| Essay | free text | leader, right or wrong | all or nothing |

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

## Marking

- **Anything a leader can do, the season's admin (and a super) can do too**: marking, the live
  screen, reopening, the exit log. `canGradeQuiz` is the one gate for all of them; "leader" below
  means any of them.
- The grading screen shows each blank as the student's answer next to the expected answer, with
  right or wrong per blank; essays show the text with right or wrong. A leader marks right or
  wrong, never points.
- Once every leader-marked item is marked the attempt is GRADED. Marking can be changed afterwards.
- The server refuses an incomplete set of marks (`marks_incomplete`) and a mark for something that
  is not a blank or essay of the quiz (`mark_out_of_range`).

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
  not. It is marked like a submit with `endReason` ENDED_BY_STAFF.
- **An expired attempt is closed by the scheduler** (`quiz-deadlines`) **or by the next read**,
  whichever comes first, so a dead phone never leaves it open.

## Exits and integrity

Added by the integrity plan: what the phone blocks during an attempt, what counts as leaving the
quiz, the three-exit limit, the relaunch lock, the screen before starting and the staff live screen.
