# Multi-part assignments — design

Status: draft for owner approval (2026-11-10). Brainstormed with the owner in chat; mockups were shown
in the brainstorming companion (student layout A "checklist page", admin layout B "Details / Parts
tabs"). Decisions marked **(owner)** are the owner's words; **(builder's call)** are choices made while
writing this up that the owner can overturn.

## Why

A real assignment in JPC is several things at once: watch a talk, then write about it, then share a
takeaway with the group. Today an assignment is exactly one thing — a private written response
(STANDARD) or a group forum post (FORUM) — so the admin either splits one piece of work into several
assignments or puts "watch this first" in the description and hopes. Nobody can tell whether the
video was watched. Students forget the work until the session.

Success looks like:
- a student opens one assignment and sees, without reading anything, that it has *N things to do*
  and which are done;
- an admin can put all the material for one piece of work — videos, questions, the forum prompt — in
  one form, and sees the actual video in the form;
- a student who skipped the video is told so before they hand in, and the leader can see it;
- students who haven't finished are reminded before the session, and only they are.

## Goals

1. **An assignment is made of parts (owner).** Part kinds: **Video**, **Essay question**, **Forum
   post**. Any mix: video + essay, video + forum, essay + forum, all three, several videos, several
   essays. **At most one forum part per assignment (owner agreed).**
2. **Video part (owner):** a YouTube link played inside the app. Watching is tracked. Each video part
   has an admin switch **"Don't let students skip ahead"** (owner: "make it configuration to block or
   not block"). A video part may carry **timed multiple-choice questions** that pause the video, as
   session videos already do (owner: yes). No leader review (owner).
3. **Essay part (owner):** a question with a **minimum and maximum word count**; the student sees a
   live count. Optional file uploads, as STANDARD submissions have today. **Each essay is reviewed on
   its own by the leader, who can return just that one essay (owner).**
4. **Forum part:** what FORUM assignments do today — minimum words, "post before reading others",
   allow comments — with its own prompt. No leader review (owner).
5. **Reminder is a configuration (owner):** On/Off; **[N] days before [the next session | the due
   date] at [time]**; sent only to students who have not finished every part (owner: "the student
   should not get a reminder if [they] already finished"). Default: on, 2 days before the next
   session (the owner's original ask).
6. **Leaders see progress per part** (owner: "the leader can see progress of the assignments
   finished").
7. **Student UI: checklist page (owner picked A).** **Admin form: Details / Parts tabs (owner picked
   B).**

## Non-goals

- **No linked session (owner).** "Remove linked session from the app": the form field goes, and so
  does every place that shows an assignment under a session. The column is dropped.
- **No group targeting (owner):** an assignment is always for the whole season. (The form already has
  no "Assign to" since 2026-11-07, `docs/rules/home-checkin-offline.md`; this removes what the API
  still accepts.)
- **No migration of existing assignments (owner):** "Don't bother about the existing assignments. We
  didn't publish the app yet." Existing rows may be dropped or reset by the migration.
- No review, score or feedback on video or forum parts.
- No change to quizzes, or to session videos and their questions (they stay on sessions as today).
- No video hosts other than YouTube.

## Anti-goals (this would be a failure even if it works)

- A student can't tell at a glance that there is more than one thing to do, or which is left.
- "Watched" can be earned by dragging the bar to the end (when skipping is blocked) or by leaving the
  app on the video screen without the video playing.
- A student who finished everything gets a reminder.
- The admin has to leave the form (open YouTube, another screen) to check the video they linked.
- Returning one essay wipes or reopens the student's other, finished parts.

## The student's side (layout A, owner)

**Assignment page** (`/assignment/[id]`): title, due date, instructions (the Details text), then a
progress line ("1 of 3 done", a bar, and "2 left before Thursday") and **one row per part, in the
admin's order**, each with an icon for its kind, its title, and its own status in words:

| Part | Statuses |
|---|---|
| Video | Not started · Watched 6 of 18 min · Watched (· 2 of 3 questions answered while not all are) |
| Essay | Not started · Draft, 120 words · Handed in · Reviewed (+ feedback) · Returned — needs changes |
| Forum | Not posted · Posted |

Tapping a row opens that part on its own screen (pushed route). **Submit** sits at the foot of the page
and is enabled once every part is done; below it, "Finish all 3 parts to submit" while it is not.
Status is never colour alone (`docs/rules/student-work.md`).

**Video screen:** the in-app YouTube player (`react-native-youtube-iframe`, already used for session
videos), the progress track, and the timed questions as the session video quiz shows them. With
"don't skip ahead" on, seeking past the furthest point reached snaps back to it; rewinding is always
allowed.

**Essay screen:** the question, the text box with a live word count against the range ("142 words ·
150–300"), files if allowed, Save draft. A returned essay shows the leader's note above the box.

**Forum screen:** today's forum screen for that part.

**Every video must be watched before Submit unlocks (owner, 2026-11-10).** There is no "submit
anyway". The warning is how the student learns *why* Submit is locked and what is left:
- the video's row says "Watched 6 of 18 min — finish it to submit";
- under the disabled Submit, the caption names what is left ("Finish *Luke 15 talk* (12 min left) and
  the forum post to submit");
- leaving the video screen before it counts as watched shows a short notice — "Not finished yet: 6 of
  18 min watched. You can't submit until you've watched it." — with **Keep watching** (primary) and
  **Leave**. If the student skipped ahead (skipping allowed), the notice says the skipped parts don't
  count.

**My work and Home** (`docs/rules/student-work.md`): an assignment row there shows its parts count
("2 of 3 done") instead of a single status. "Returned — needs changes" groups an assignment with any
returned essay.

## The admin's side (layout B, owner)

**Details tab:** Title (required), Instructions (optional), Due date + time (optional, organisation
clock as today), **Reminder** (switch; "[2] days before [the next session ▾ | the due date ▾] at
[9:00 AM]"), with a line that says when it will go out for this assignment ("Tue 11 Nov, around 9:00 AM —
students who haven't finished"). "The due date" is disabled while no due date is set. No session, no
groups, no Standard/Forum type.

**Parts tab** (badge with the count): parts as numbered cards, in order, each with Edit, reorder and
remove; **+ Video**, **+ Essay question**, **+ Forum (1 max)** at the foot (Forum disabled once one
exists). A video card shows the **player itself** once the link parses, with the title and length
YouTube reports. An assignment needs at least one part to save.

| Part editor | Fields |
|---|---|
| Video | YouTube link (validated, preview player), title (defaults to YouTube's), "Don't let students skip ahead" switch, timed questions (time, prompt, options, correct answer, points — the session video question editor) |
| Essay | Question (required), min words, max words (min ≤ max, both optional), allow file uploads (+ size and types, today's fields) |
| Forum | Prompt, min words, post before reading others, allow comments (today's FORUM fields) |

**Editing after students started (builder's call):** wording, dates and the reminder change freely.
Removing a part, changing a video's link, or changing an essay's word range once any student has work
on it asks for confirmation that says how many students it touches. Removing a part removes the
students' work on it.

## The leader's side

**Progress (per assignment):** one row per student in the leader's group(s) (staff with the whole
season see everyone), a mark per part: video ✓ / partial (6 of 18) / –, essay ✓ / waiting review /
returned / –, forum ✓ / –. Not-finished students first; how far each is into a video is said in words.
*Builder's call:* this replaces the staff submission list for the assignment.

**Review:** each essay part is reviewed on its own (owner): **Mark reviewed** (optional feedback) or
**Return** (note required). Returning one essay reopens only that essay; the rest stay done. The
existing review queue (`(tabs)/submissions.tsx`, `staff-queue/`) lists **essays** waiting review, one
item per student per essay, labelled with the assignment and the essay's question.

## Completion rules

- Video done: watched (below) **and** every timed question on it answered.
- Essay done: handed in with a word count inside the range (server-checked); counts as done while
  waiting review and once reviewed; **not done when returned** until handed in again.
- Forum done: posted, meeting the minimum words (today's rule).
- **Assignment submitted:** the student tapped Submit, which the server allows only when every part
  is done, videos included (owner). **Assignment complete:** submitted and every essay reviewed. An assignment with no
  essay is complete when submitted.

**"Watched" (builder's call, owner agreed the idea):** the server keeps, per student and video part,
the *watched seconds* — time that actually played, merged as intervals so re-watching a stretch counts
once — and the furthest point reached. Watched = watched seconds ≥ 90% of the video's length. The
client reports progress every ~10 s while playing and on pause/leave (as `SessionVideoProgress` does);
the server ignores a report that claims more new watched time than wall-clock time since the last one.
With skip blocking off, a student who jumps to the end reaches the end but not 90% watched — they see
"Watched 6 of 18 min" and Submit stays locked.

## Reminders

- Sent to students in the season (`seasonParticipant`, `docs/rules/community-model.md`) whose
  assignment is not **submitted** — a returned essay makes it not submitted again. Students who
  submitted get nothing.
- "The next session": the first session of the season starting after the assignment is published.
  If there is none, no reminder is sent and the Details line says so ("No upcoming session yet —
  no reminder").
- Push notification plus an in-app notification (existing notification system and settings; a new
  kind under the assignments setting), linking to the assignment. One reminder per assignment per
  student.
- **The schedule lives in the backend, driven by requests (owner, 2026-11-10: "I want the schedule
  to be inside the backend", "I don't want to use the Vercel scheduler", picked option 1).** The
  backend is serverless, so nothing runs between requests and an in-process timer would never fire.
  Instead each reminder is a row with its send time (`remindAt`); on any API request, about once a
  minute per server instance, one sweep at a time, the backend takes a database lease (one row, `UPDATE … WHERE lockedUntil < now()`,
  so concurrent requests don't both sweep) and, after the response has been sent (Vercel's
  `waitUntil`), sends every reminder that is due and marks it sent. No Vercel Cron, no Vercel
  Schedules, no outside pinger.
- **Accepted trade-off:** a reminder goes out at the first request after its time. With a season of
  students using the app that is minutes; if nobody opens the app, it waits until someone does. The
  Details line says "around 9:00 AM", not an exact minute.
- **No crons on Vercel at all (owner, 2026-11-10: "remove any crons from vercel").** The sweep is one
  small module (`lib/scheduler/`) with a list of due-work handlers: assignment reminders, and the
  existing **mentor follow-up reminder**, which moves onto it. This work deletes the `crons` block
  from `apps/backend/vercel.json`, the `GET /internal/follow-ups/remind` route and its OpenAPI entry,
  `isCronAuthorized`, and `CRON_SECRET` from `lib/config.ts` (and from the Vercel project's variables
  once deployed). `sendDueFollowUpReminders()` keeps its claim-by-`remindedAt` logic and becomes a
  handler. `docs/rules/mentor.md` is reworded: follow-ups are reminded by the backend's own schedule
  "around 9:00 AM Cairo on the due day" (*builder's call:* today's 06:00 UTC run is 08:00/09:00 Cairo),
  at the first request after it.
- Sending is idempotent: a reminder row is claimed (`sentAt` set in the same statement that selects
  it) before the push goes out, so a sweep that dies halfway never double-sends.

## Data (sketch — the builder owns the schema)

- `Assignment`: drop `sessionId`, `type`, `forumMinWords`, `forumAllowComments`, `forumPostToRead`,
  `maxFileSizeMb`, `allowedMimeCategories`, `isAllGroups`, and the `AssignmentTarget` table. Add
  reminder settings (on, days, anchor `NEXT_SESSION | DUE_DATE`, time of day), `remindAt` resolved on
  save (and re-resolved when a session in the season moves), `remindedAt`.
- `AssignmentPart`: assignment, position, kind (`VIDEO | ESSAY | FORUM`), title, per-kind config (video
  URL, YouTube id, duration, `blockSkipping`; essay prompt, min/max words, file limits; forum prompt,
  min words, post-to-read, comments).
- Video questions: generalise `SessionVideoQuestion` / responses to hang off either a session or a
  video part, or add part-level twins — builder's choice.
- Per student: a submission per assignment (submitted at), and per part: video progress (watched
  intervals, furthest second, done at), essay answer (text, files, status DRAFT / SUBMITTED /
  REVIEWED / RETURNED, feedback, reviewer), forum post (today's forum response, now keyed by part).
- Repo standards apply: one concern per migration, rollback.sql, indexes per `CLAUDE.md` "Query
  indexes" (e.g. the reminder sweep's `remindAt` partial index), `schema-conformance`, ERD.

## Where this touches the app

Backend: assignments routes and `lib/assignment-writes.ts`, `lib/queries/assignments/*`, forum
queries, submissions/review routes, notifications (`ASSIGNMENT_CREATED`, the new reminder),
`vercel.json` crons, OpenAPI docs, season-end blockers (`season-end/blockers-list.tsx` counts
unreviewed work), dashboards and reports that count submissions (`lib/dashboard-figures.ts`,
`queries/me/season-record.ts`). Mobile: `assignment-form/`, `assignment-detail/`, `submission-review/`,
`staff-queue/`, `staff-work/`, `work/` (`work-model.ts`), `leader-submissions/`, `forum/`, the season
overview's assignment list, student detail's grouped tabs, past-season record lists, the video
player (`video-quiz/`). Shared: `packages/shared` assignment and submission contracts. Rules:
`docs/rules/student-work.md` and `docs/rules/home-checkin-offline.md` get the new wording.

## UI and code standards (owner: "make sure UI match code standards and UX of the app")

Every new or changed screen is built from the existing kit and held to `apps/mobile/CLAUDE.md`
("Conventions", "Building a screen that passes the sweep", "Rules from the UI sweep"), the root
`CLAUDE.md` "Code & Data Standards" and `docs/rules/motion.md`. The mockups were sketches; where they
differ from this section, this section wins.

**Screens and the kit**

| Screen | Built from |
|---|---|
| Student assignment page | `Screen` (large title, back bar). Progress: `Progress` bar plus the count in words ("1 of 3 done"), never the bar alone. Parts: one `GroupedList` of `ListRow`s — leading lucide icon per kind (`PlayCircle` video, `PenLine` essay, `MessagesSquare` forum; one stroke style, icons decorative beside the text), title, status as the subtitle in words, chevron. Submit: `Screen`'s `footer={<SaveBar …/>}` (above the pill and the inset, never in the scroll). Disabled Submit uses the real disabled prop and the reason as caption text under it. |
| Video part | `Screen` + the player from `src/screens/video-quiz/` (generalised, not copied); "Watched 6 of 18 min" as `Text` `subhead`; the timed question in the existing `VideoQuestionModal`. Click-to-play, never autoplay; the player pauses when the app goes to the background (it does today). |
| Essay part | `Screen`/`ShellFrame` form so the keyboard rule holds; `Textarea` with a visible label (the question); live count as caption text "142 words · 150–300", turning to the `bad` tone with words ("8 over the limit"), never colour alone; Save draft / Hand in in the `SaveBar` footer. Leader's return note above the field as a callout. |
| Forum part | today's forum screen (`src/screens/forum/`) scoped to the part. |
| Unwatched-video notice | `ConfirmDialog` on leaving the video screen early: title "Not finished yet", body "6 of 18 min watched. You can't submit until you've watched it.", primary **Keep watching**, secondary **Leave**. The locked Submit's reason is caption text under the `SaveBar` button, read by screen readers with it. |
| Admin form | `Screen` with `SegmentedControl` (Details · Parts N) under the title; tabs switch instantly. Details: `FormField`s, `DatePicker`/`TimePicker`, `Switch` for the reminder, the "when it goes out" line as `subhead` text. Parts: one card per part (`rounded-group`), header row with kind icon and number, **Edit** as a `PillButton`, reorder with Move up / Move down buttons (no drag: the stack already has a swipe gesture), remove through `ConfirmDialog`. Add buttons as `PillButton`s; "+ Forum" uses the disabled prop with "One forum per assignment" beside it. One `SaveBar` footer for the whole form, saving both tabs. |
| Part editors | a `Sheet` with `SheetSaveBar` per part (video, essay, forum), inputs labelled, `keyboardBottomOffset` for the sheet's keyboard. The video sheet shows the player once the link parses, and an inline error under the field when it doesn't. |
| Leader progress | `Screen` + `GroupedList`, one `ListRow` per student; per-part marks as `StatusChip`s with words ("Video 6/18 min", "Essay: waiting review", "Forum ✓ posted"), `flex-wrap` so they wrap at 1.3. |
| Essay review | the existing `submission-review/` screen per essay: Mark reviewed / Return (note required) as `Button`s in a wrapping row. |

**Rules that bite here**

- Words for every state: loading (`RouteSkeleton`), error with retry (`RouteError` / `InlineError`),
  empty ("No parts yet — add a video, an essay question or a forum post"), finished season (read-only,
  no Submit). "Not started", "Not posted", never "—".
- No " · " joined lines that can wrap apart at 1.3; a word range ("150–300") and a duration
  ("6 of 18 min") each stay one unbreakable run. Counts through `plural()` ("1 part left", "2 parts
  left").
- No fixed heights on text; title beside a chip takes `min-w-0 flex-1`, the chip `shrink-0`; button
  rows wrap.
- Contrast 4.5:1 text, 3:1 icons and control borders, both themes, from tokens only (no hex,
  no alpha on muted text). Status colour always paired with words.
- Touch targets ≥ 44pt/48dp, including Move up/down, Edit and the player controls.
- Motion: none new. The progress bar and the part rows appear at once (no fill animation, no
  stagger); press dims; the sheet and dialog use the existing fades. Reduced motion honoured.
- Every control has an accessible name; part rows read "Essay: Who are you in the story?, not
  started"; the progress line is read as text.
- Layers: screens never import axios or `api-client`; data through `src/hooks/use-assignments*`
  with `apiGet` / `apiSend` and Zod contracts in `packages/shared`; screen models (part status,
  completion, the "when it goes out" line, the word count) are pure functions tested on their own
  like `work-model.ts`. Files kebab-case in their feature folders; 400 lines per file; backend
  transactions in `lib/assignments/`, refusals as `ApiError`.
- Design catalogue: new pieces (part row, part card, word-count caption) get their states in the
  catalogue (`s90`); a read-only sweep flow per new screen, then the `ui-sweep` skill at
  360dp/1.3/3-button light and the dark reference phone first, then all 16 cells.

## Settled while writing up (builder's calls, owner may overturn)

- **When an essay is handed in:** with the assignment's **Submit** the first time — essays are drafts
  until then and reach the leader's queue on Submit (one notification to the leader, as today). A
  **returned** essay is handed in again from its own screen (**Hand in again**), which puts only that
  essay back in the queue and makes the assignment submitted again; no second Submit.
- **Admin changes after students started:** "submitted" is stored. Adding a part reopens the
  assignment for students who had submitted (it goes back to their To do and the reminder applies);
  the confirmation says how many. Changing a video's link resets watch progress and answers on that
  part. Changing an essay's word range never reopens essays already handed in.
- **Video question scores:** answering every question is what counts for "done"; the student sees
  right/wrong as each is answered (today's session video behaviour; these are not quizzes, so
  `quiz-results.md`'s hold does not apply); the leader's progress view shows the score per video
  ("3/4 correct"). Points stay in the editor.

## Left to the builder

The schema shape above, route names, how the per-part screens are routed, how reminders are swept,
the exact progress-report cadence, empty and error states (house rules: words, not dashes), and the
UI sweep flows for the new screens (`ui-sweep` skill; flows never save).

## Open questions (owner's)

1. ~~How reminders at a chosen time are triggered~~ — answered: inside the backend, request-driven
   (see Reminders).
2. ~~Can a student submit past an unwatched video~~ — answered: no, every video must be watched
   before Submit unlocks.

None left open.
