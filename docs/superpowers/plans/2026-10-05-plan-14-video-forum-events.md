# Plan 14 — Video Quizzes, Forum & JPC Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The three remaining engagement domains land on device — a student watches a session video and answers timed questions that the *server* keeps in order, posts to a forum thread on an assignment they have never opened, and every role sees JPC events on the calendar they already have.

**Architecture:** Two foundation tasks, then three file-disjoint streams that
can run in parallel, then a closing gate. Every shared file — contracts,
`lib/permissions.ts`, `app.ts`, the integration fixtures, the mobile query-key
factory — is touched **only** in Tasks 1 and 2, so the three streams never edit
the same file as each other. Each stream owns its own backend route file, its
own query module, and its own screen(s).

**Tech Stack:** Express 5, Prisma 7 (`src/generated/prisma`), Zod contracts in
`packages/shared`, jest + supertest against the shared staging DB; Expo SDK 54 /
expo-router 6, React Query 5, RNTL 13, and
`react-native-youtube-iframe` over `react-native-webview` for playback.

**Spec:** `docs/superpowers/specs/domains/13-video-quizzes.md`,
`14-forum.md`, `15-events.md` (all three, including each §10),
`_DECISIONS.md` (C1, C4, C6, C8, C9, C10, C11, C12); roadmap § Plan 14.

**Depends on** (execution order 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 →
11 → 12 → 13 → **14** → 15 → 16 → 17 → 18; this plan uses only plans before it):
Plan 1 (`DETAIL_ROUTE_NAMES`, `useAssignmentDetail`,
`PUT /submissions/by-assignment/:assignmentId`, the hooks/test patterns),
Plan 3 (`lib/org-time.ts` — `orgWallClock`, `config.orgTimezone`, session writes), Plan 4
(`useCurrentSeasonId`, `useSessionDetail`, `sessionDetailSchema.canManageCheckIn`,
`formatDayKey`), Plan 8 (domain 12, text quizzes; has adopted the "answer-key
split" by name — see D-13.3 below for the one place the two plans enforce it
differently on the client), Plan 12 (`packages/shared/src/html-text.ts` —
`htmlToPlainText` / `plainTextToHtml`, ruling X3 — which this plan imports and
never redefines).
**Plan 5** (assignment authoring): creates FORUM assignments; moved the
assignment screen to `app/(app)/assignment/[id]/index.tsx` and role-branched it
(Task 8 here edits that file); created `packages/shared/src/org-time.ts`
(`isoDaySchema`, `wallTimeSchema`) and backend `orgWallTime` /
`orgWallClockToInstant` in `lib/org-time.ts` — all **consumed** here, never
redefined (this plan adds only `isOrgMidnight`); `formatWallTime` /
`formatOrgDue` in mobile `src/lib/format.ts`; detail `dueOrgDay`/`dueOrgTime`.
**Plan 6** (season/session admin screens): the restructured
`app/(app)/calendar.tsx` (`PinnedSeasonCalendar` / `RangeSessions` /
`useSessionRange`) and `groupSessionsByDay` in `src/lib/day-groups.ts`, which
Task 10's events merge targets; its replacement of
`app/(app)/session/[id]/index.tsx` (the directory form, ruling X7), which Task 5
extends; `sessionDetailSchema.dayKey`/`.startTime` and session rows' `startTime`.
**Plan 11** (student self-service): `StudentCheckInCard` on the same session
screen and the `src/__tests__/helpers/expo-camera.tsx` Jest stand-in Task 5's
suite mocks with.
Plan 4 also supplies `orgDayKey(date)` in `lib/org-time.ts`, the sessions'
`dayKey`, and mobile `formatDayKey(dayKey)` — the event payload reuses all
three rather than adding a second day helper.
**Consumed later by:** Plan 16 (role dashboards — `useEvents()` for the
`UpcomingEventsCard`), Plan 18 (cutover register: forum `hiddenAt`, video
duration, forum `NotificationType`).

## Global Constraints

- **No migrations, ever** (ruling C1). No edits under `apps/backend/prisma/`.
  The staging database is shared with running v1.
- **`D:\Projects\JPC\jpc-space` is READ-ONLY.** Read it constantly; never write
  to it, never run `git` in it.
- **Forum posts are written by young people.** No real post or comment text is
  ever copied into this repo, into a test, or into a report. Every fixture
  string is invented and prefixed `space-v2-test-`.
- Response envelope `{ data }` / `{ error: { code, message } }` via
  `apiOk`/`apiError`.
- Value imports from shared use the relative path
  `"../../../../packages/shared/src/index"` (depth adjusted — `lib/queries/*.ts`
  is one level deeper) in **every** backend `src` file, not only routes (ruling
  X12; the `rootDir` emit trap in `CLAUDE.md`). Mobile imports `@space/shared`.
- **`requireAuth` is attached per route** (ruling X5). `forumRouter` and
  `videoQuizRouter` are mounted on the shared `/api/v1` prefix, so a router-wide
  `use(requireAuth)` would turn every unknown `/api/v1/*` path into a 401 and
  run auth twice for every later router. Only `eventsRouter`, which owns
  `/api/v1/events` exclusively, may use router-wide auth.
- **Org time** (ruling X13): every wall-clock day or time an event shows or is
  written with is computed on the server in `config.orgTimezone`. The device
  timezone is never used to bucket a day or compose an instant.
- `src/docs/openapi.ts` changes in the **same commit** as the route it
  documents.
- Integration fixtures: every row carries `space-v2-test-` in `User.email`,
  `Season.code`, or (new in Task 2) `JpcEvent.title`; use
  `createTestSeason`/`createTestUser`/`login`/`cleanupTestData` from
  `__tests__/integration/fixtures.ts`; `jest.setTimeout(60000)`.
- **Integration tests are serial** (`jest.integration.config.js` sets
  `maxWorkers: 1`, and `cleanupTestData` is prefix-global). Each task runs its
  own suite:
  `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern <suite>`.
  If the three streams are parallelized across agents, the agents write the
  integration tests but do **not** run them; the coordinator runs them serially
  in Task 11.
- Mobile conventions from Phase 0 hold: relative imports (no `@/`), Zod-parse
  every response, `enabled` on dependent queries **and** guarded `refetch`,
  `LoadingState`/`ErrorState`/`EmptyState` primitives, `edges={["top","left","right"]}`
  on tab screens, `renderWithProviders`, `mock*` closure rule, typed routes +
  `routes:generate` after any route file is added.
- v1 rules are ported faithfully unless a spec §10 item or `_DECISIONS.md`
  ruling says otherwise. **Every divergence below names its source.**

## Decisions this plan makes (read before Task 1)

Recorded here because a reviewer must be able to reject them without reading
eleven tasks. Each cites the spec item it answers.

**D-13.1 — Video quizzes do NOT share domain 12's model.** Verified against
`apps/backend/prisma/schema.prisma`: domain 12 owns `Quiz` (:640), `QuizGrade`
(:669), `QuizQuestion` (:689), `QuizAttempt` (:709), `QuizAnswer` (:734); this
domain owns `SessionVideoQuestion` (:394), `SessionVideoQuestionResponse`
(:413), `SessionVideoProgress` (:427). No shared table, no shared column, no FK
between the two graphs. `Quiz.sessionId` is a nullable `SetNull` link to
`Session`; `SessionVideoQuestion.sessionId` is a required `Cascade` link — they
touch the same parent and nothing else. Consequences: separate contract files,
separate endpoints, and a student's video answer can never be stored as a
`QuizAnswer` (there is no `attemptId` to hang it on).

**D-13.2 — Playback gating becomes server-checked, as an ordering rule.**
Spec 13 §10 D1's headline finding: the barrier lives entirely in
`interactive-video-player.tsx` (R39–R43) and `submitVideoAnswerAction` checks
nothing (R47), so an API turns "watch the video" into one scripted loop.
`POST /sessions/:id/video-quiz/answers` therefore rejects any answer whose
question is **not the earliest unanswered question** for that student on that
session (ordered `atSeconds` asc, `id` asc as tiebreak — R13 permits duplicate
timestamps). That reproduces the barrier's ordering guarantee exactly, from data
the server already stores.
**What is not enforceable, stated plainly:** that the student actually watched.
`furthestSeconds` is client-reported (R48) and no server can observe a YouTube
iframe's playhead. Watch time is **advisory**; the ordering rule is the gate.
Rate-limiting progress to wall-clock time was considered and rejected — it
breaks legitimate playback-speed changes and only makes cheating tedious.

**D-13.3 — The answer key never travels to a student, enforced by schema
shape.** Two endpoints, two gates, two Zod schemas:
`videoQuestionAdminSchema` **has** `correctIndex`; `studentVideoQuestionSchema`
**has no such field and is `.strict()`**, so an extra key fails the parse at the
mobile boundary rather than rendering. `correctIndex` reaches a student on
exactly one path: the submit response for the question they just answered
(R60), which is safe because R54 makes the first answer final.
**This rule is named the "answer-key split" and is used by that name in both
quiz plans.** Plan 8 (domain 12) has adopted it: `quizQuestionAuthoringSchema`
carries `correctIndex`, `quizQuestionStudentSchema` has no such field, and its
own integration test asserts the raw student response JSON never contains the
string.

The load-bearing enforcement is the same in both plans and lives on the server:
the typed split (a handler serving the authoring shape where the student shape
is declared fails typecheck) plus an integration test asserting
`JSON.stringify(res.body)` does not match `/correctIndex/` — this plan's is in
the video-quiz read task, and both are mutation-tested by adding
`correctIndex: true` to the student select and confirming the test goes red.

The two plans differ in **one** client-side detail, deliberately: this plan's
`studentVideoQuestionSchema` is `.strict()`, so a leaking backend fails the
parse; Plan 8's `quizQuestionStudentSchema` uses Zod's default strip, so a
leaking backend has the field dropped and the screen still renders. Neither is
wrong — `.strict()` trades a working screen for a louder signal. Do not
"harmonise" them by adding `.strict()` to Plan 8 without deciding that trade
again: a regression CI missed would take every student's quiz screen down
rather than silently dropping a field they were never shown.

**D-13.4 — Completion is derived, not asserted** (spec 13 D3). `completed` is
absent from the request contract. The server sets `completedAt` when the last
unanswered question is answered, inside the same transaction. This fixes both
v1 failures at once: the false positive (`saveVideoProgress(id, 0, true)` marks
a student complete, R48) and the false negative (answer the last question, close
the app before the video ends, never complete, R65).

**D-13.5 — `furthestSeconds` only ever moves forward on both writers** (spec 13
D4). v1's answer path writes `{ set: question.atSeconds }` (R57) twenty lines
above a comment promising the opposite. Both v2 writers use
`Math.max(existing, incoming)` inside a transaction.

**D-13.6 — Editing an answer key re-grades in the same transaction** (spec 13
D5). Changing `correctIndex` or `options` re-evaluates every existing
`SessionVideoQuestionResponse` for that question and returns `regradedCount`.
Silently leaving stale grades is the one option ruled out.

**D-13.7 — YouTube parsing is rewritten, not ported, and lives in
`packages/shared`.** v1's four unanchored regexes have no host check (R33) and
no trailing boundary (R34), and reject `/live/` and `/v/` (R32) — which is what
a premiere or streamed session produces. Enumerated in Task 1. **Parsing stays
as permissive as v1's on a YouTube host** (R30, v1 `jpc-space/src/lib/youtube.ts:4-13`):
after the host check, any form v1's four regexes found anywhere in the string
(`?v=`/`&v=`, `youtu.be/`, `/embed/`, `/shorts/`, at any path depth or inside
another query value) still parses, now with a trailing non-id boundary. *(v1 parity 2026-10-09: was "URL()-structured parse; v= top-level, prefix first segment only")* **Domain 3's
save-time validation (spec 13 D7c) is flagged, not done here**: `routes/sessions.ts`
is Plan 3's file, and this plan keeps its streams disjoint. The resolved
`videoId` travels on this domain's own student payload instead.

**D-14.1 — Nothing may assume a submission row exists.**
`PUT /api/v1/assignments/:id/forum/response` **is** the creator: one upsert on
`@@unique([assignmentId, studentUserId])` writing `text`, `status = SUBMITTED`
and `submittedAt` together. Ruling C6 forbids v1's read-time
`ensureDraftSubmission`, and `forumOwnResponseSchema.submissionPublicId` is
therefore **nullable** — the screen renders the compose box, the word counter
and the locked feed with no row in existence.
**And it is the only writer.** The generic submission routes Plan 1 relies on —
`PUT /submissions/by-assignment/:assignmentId` (create-or-fetch) and
`PATCH /submissions/:publicId` (save, or `{ submit: true }`) — would otherwise
accept a FORUM assignment: an empty `SUBMITTED` row unlocks the feed (defeating
D-14.5), `forumMinWords` is never applied, and the text is stored unescaped
(ruling C11). Both refuse a FORUM assignment with
`409 use_forum_endpoint` (Task 6, Step 4b). v1's student page never routed a
FORUM assignment through the generic editor, so no client loses anything.

**D-14.2 — Forum posts are addressed by `Submission.publicId`, never the
integer id.** v1 addresses every forum write by the sequential
`Submission.id` (R5), which is what makes R43's "comment on a guessed draft"
probe possible. This is a deliberate divergence; it also matches how
`routes/submissions.ts` already addresses the same rows.

**D-14.3 — Group visibility resolves through `SeasonEnrollment`, not
`GroupStudent`** (ruling C9). v1's feed reads `GroupStudent` (R20), which is
`@unique` on `studentUserId` alone and therefore holds one row per student for
the whole database — it cannot answer "who is in this student's group *for this
assignment's season*". A verbatim port would give a moved student their new
group's old threads and lose their own. Divergence forced by C9; spec 14 D4 asks
for exactly this to be stated rather than left silent.

**D-14.4 — No moderation, as v1** (spec 14 R57; v1 `jpc-space/src/lib/forum-actions.ts`,
whole file). v1 has no report, no flag, no hide, no lock, no rate limit, no
audit and no staff forum screen, and v2 ports exactly that:
1. **No staff read.** The only forum screen is the student's
   (v1 `src/app/student/assignments/[id]/page.tsx:14,24`, R53): `forumAudienceFor`
   answers for STUDENT only and the staff branch of `assignment/[id]/index.tsx`
   renders no `ForumThread`.
2. **Comment delete is author, SUPER or season ADMIN** (v1 `src/lib/forum-actions.ts:115-118`,
   R50) — no LEADER. **The delete control renders only on the viewer's own
   comments** (v1 `src/components/forum/forum-view.tsx:205`, R52); no
   server-computed `canDelete`.
3. **Commenting is SUPER, season ADMIN or same-group STUDENT** (v1
   `src/lib/auth/permissions.ts:352`, R40) — LEADER and MENTOR cannot comment.
*(v1 parity 2026-10-09: was "staff read, LEADER/staff comment delete in the UI, server-computed canDelete, LEADER comments")*
**Owner backlog only (REG-39), not built:** there is no way to hide a
*post* (R48). The only lever inside the frozen schema is reverting `status` to
`DRAFT`, which overloads `DRAFT` further and collides with domain 8's D3 — not
taken unilaterally. A `hiddenAt` column and a student-facing report/flag row are
**cutover tasks** (C1). Until then a leader's only remedy for a post is to
contact the author. Report this to the product owner; do not let it be
discovered in the field.

**D-14.5 — The only word gate is `forumMinWords`, as v1** (R11; v1
`jpc-space/src/lib/forum-actions.ts:36-39`, `src/components/forum/forum-view.tsx:50-52,102`).
The post is accepted when `countWords(text) >= (forumMinWords ?? 0)`, so with a
null or zero minimum an empty response can be posted and marked `SUBMITTED`,
and the button is enabled. No `min(1)` and no 20,000 cap on the request schema
(v1 had neither); the refusal message is v1's
`"Please write at least N words (you have M)."`.
*(v1 parity 2026-10-09: was "shared schema requires at least one word regardless; Math.max(1, minWords) on client")*

**D-14.6 — No email, and no avatar, in a forum payload.** v1 falls back to the
author's email address as their display name (R30) — these are young people's
addresses, shown to every group-mate whose peer left `name` blank (spec 14 D6).
v2 sends `authorDisplayName` = `name` or the literal `"Group member"`, and no
`email` field exists on the contract. **Avatars are shown, as v1** (R31; v1
`jpc-space/src/lib/forum-query.ts:120-122,130-132`): every post and comment
carries `authorAvatarUrl` (nullable), pointing at a gated, id-addressed avatar
read endpoint — not v1's ungated `/api/uploads/...` path (spec 14 D12) and not
resolved through the S3 driver's `url()` stub — and `ForumThread` renders it
beside the name. Reading existing files is allowed with `ENABLE_UPLOADS=false`.
*(v1 parity 2026-10-09: was "avatars omitted entirely, deferred with the CMS")*

**D-14.7 — Late forum posts stay legal, and it is now a written rule.** v1's
post action selects `assignment.dueAt` and never reads it (R12). Kept — a
discussion that closes at a deadline stops being a discussion — but recorded
here rather than left as an unused select (spec 14 D5).

**D-14.8 — A forum post stays reviewable, and the forum screen shows no
feedback, as v1.** Spec 14 §10 D9: posting sets `SUBMITTED`, so a forum post
enters the leader queue as ordinary work (R55) and `reviewSubmissionAction` has
no type precondition (R56). v1's `loadForumView` never selects `feedback` and
the forum screen never renders it (v1 `jpc-space/src/lib/forum-query.ts:54-57`,
`src/components/forum/forum-view.tsx:24-27`, R34/R56) — ported as is:
`forumOwnResponseSchema` carries no `feedback` / `reviewedAt`, and
`ForumThread` renders no feedback block.
*(v1 parity 2026-10-09: was "forumOwnResponseSchema carries feedback and reviewedAt; screen renders them")* The other half of D9 — showing the reviewer that they are looking
at a discussion post, with its thread — is domain 8's screen and is **out of
scope here**.

**D-15.1 — Events and sessions stay two models. Only the feed is unified —
and not in this plan.** Spec 15 §10 item 1's recommendation, confirmed against
the schema: `Session.seasonId` is required/`Cascade` and carries attendance,
check-in, assignments, quizzes and video questions; `JpcEvent.seasonId` is
nullable/`SetNull`, carries a three-level `visibility` enum, a stored `endDate`,
media and a link, and nothing hangs off it. A union needs ~9 nullable columns and
a discriminator — and is impossible anyway under C1. **Divergence from spec 15
§7:** this plan does **not** build `GET /api/v1/calendar`. Plan 4 already ships
the calendar screen on `GET /seasons/:id/sessions`; a merged endpoint would
re-home that query and re-derive the season scope in a second place. The mobile
calendar issues a second query for events and interleaves them client-side —
exactly as `season-calendar.tsx:237-244` does today. Revisit if the two-request
shape proves bad on device.
**An alumnus gets no calendar** (R73; v1 `jpc-space/src/app/alumni/calendar/page.tsx:11,19`):
v1's alumni Events page renders only the `UpcomingEventsCard` — no sessions, no
session query — so v2's calendar tab, for an alumnus, renders only that card
(the first four events with `(endDate ?? date) >=` today).
*(v1 parity 2026-10-09: was "alumni get the shared pinned-season calendar with sessions plus events")*

**D-15.2 — `ALUMNI_ONLY` becomes visible to alumni.** Spec 15 §10 item 2, the
domain's headline defect: `UpcomingEventsCard` computes eligibility as
`user.role !== "STUDENT"` (R44) and an alumnus **is** role `STUDENT` with a
`graduationYear` (`rbac.ts:isAlumnus`), so in shipped v1 `ALUMNI_ONLY` means
*staff-only* — the inverse of its name, on the only two surfaces alumni have.
v2's single server-side predicate includes the level when
`isAlumnus(user) || user.role !== "STUDENT"`. This stays (REG-41): the v1
parity review classified it KEEP-FIX (19-dashboards R6, a broken flow), and the
coordinator ruled that it wins over the REVERT rows 15 R42/R44/R45 and 03 R92.
**Only the labels revert to v1's**: form option **"Alumni only (leaders, admins)"**,
manager badge **"Alumni only"** (`jpc-space/src/app/super/events/jpc-event-form.tsx:195`,
`jpc-event-manager-client.tsx:114-115`, R46).
*(v1 parity 2026-10-09: was label "Alumni & staff"; visibility unchanged)*

**D-15.3 — The write gate is real, and stays real** (spec 15 R3, ruling C8). v1
already enforces SUPER inside `createJpcEventAction`, not merely by page
placement — one of the few places v1 gets this right. Ported verbatim as
`isSuper(user)` inside each handler, with an integration test per verb proving
an ADMIN is refused.

**D-15.4 — Visibility is derived from the token, never from a parameter**
(spec 15 item 3, ruling C8). One predicate, `eventVisibilityFilter(user)`. v1
has two disagreeing formulas at six call sites. SUPER short-circuits to
unfiltered so the manager list can show orphans; every other role gets the `OR`
with `season: { deletedAt: null }` (item 4 — a soft-deleted season's events are
a bug in any reading), and an `R54` orphan (`visibility = SEASON`,
`seasonId = null`) is hidden outright rather than left in a state only SUPER can
observe.

**D-15.5 — The window filters on `(endDate ?? date)`, and the server owns it**
(items 5 and 10). One window, used by the list and the calendar, so a five-day
retreat does not drop out of one surface while another still shows it. `from`
and `to` are optional; **omitted, every visible event is returned, ordered by
`date` asc — no default window, no limit, as v1** (`jpc-space/src/lib/jpc-events-query.ts:43-69`,
R57; remove the defaults at `apps/backend/src/routes/events.ts:103-108`). The
upcoming card filters `(endDate ?? date) >=` start of today and takes the first
four, as v1; `upcoming` / `limit` may stay only as an exact equivalent of that.
*(v1 parity 2026-10-09: was "omitted, server defaults to [now − 30d, now + 365d]")*

**D-15.6 — `allDay` is derived once, server-side, in the org timezone**
(item 6, ruling C2). No column exists and none can be added (C1), so midnight
stays the encoding — but "midnight" resolves against `config.orgTimezone`, not
against each of three viewers' devices (R19) nor the server's incidental zone
(R15/R20).
**Both directions are server-side** (ruling X13). On write, the client sends
wall-clock fields — `day` (`YYYY-MM-DD`), `time` (`HH:mm` or `null` for
all-day), `endDay` — and the server composes the instant in the org zone
(Plan 5's `orgWallClockToInstant`, consumed). On read, every row carries `dayKey`, `endDayKey` and
`time` computed in the org zone, so the calendar buckets and labels by strings
the server produced and a phone set to another zone shows the same day. This
supersedes the earlier draft's "compose the ISO instant on the client".
**The end has a time, as v1** (R6/R17; v1 `jpc-space/src/lib/jpc-event-actions.ts:17,36-38`,
`src/app/super/events/jpc-event-form.tsx:129-151`): the write carries
`endTime` (`HH:mm`, nullable) beside `endDay`; the server composes the end
instant from `endDay` + `endTime` in the org zone; when `endDay` is null,
`endTime` is ignored. Reads expose `endTime`. **End ≥ start compares the
composed instants** (equal allowed), not days (R11; v1 `jpc-event-actions.ts:23-26`).
*(v1 parity 2026-10-09: was "end is a day only, stored at org midnight; days compared")*

**D-15.7 — Event photo *upload* is not built; existing photos are shown, as v1.**
Uploads are off (`ENABLE_UPLOADS` defaults `false`) and `imagePath` never
crosses the wire — but every event carries `imageUrl` (nullable), as v1
(`jpc-space/src/lib/jpc-events-query.ts:76`, R31), pointing at a new
`GET /api/v1/events/:id/photo` gated on `eventVisibilityFilter` (reading
existing files is allowed with uploads off; not `storage.url()`, KEEP-FIX R60),
and the SUPER manager list shows the thumbnail and the edit form the current
photo (`jpc-event-manager-client.tsx:100-102`, `jpc-event-form.tsx:171-182`).
*(v1 parity 2026-10-09: was "imageUrl absent from the contract; GET photo deferred")*
v1's photo lifecycle is broken in four ways (R27–R30) and its
serving path is ungated (R32) — none of that is worth porting to a disabled
capability. `POST/DELETE /events/:id/photo` are **deferred to the CMS work**;
the GET, built now, is gated on the same visibility predicate as the row,
exactly as `submissions/:publicId/files/:fileId` already is.

## Out of scope, deliberately

- **`GET /api/v1/calendar`** — see D-15.1.
- **Event photo upload/delete endpoints** — see D-15.7. (`GET /events/:id/photo`
  is in scope since the v1 parity revision, R31.)
- **The `UpcomingEventsCard` on all six dashboards** (spec 15 R78). The events
  data and hook (`useEvents()`, `queryKeys.events.list()`) land here;
  `dashboard.tsx` is left alone. The card is **Plan 16's** (role dashboards,
  ruling X15), which runs after this plan and composes `useEvents()` unchanged.
- **Domain 3's save-time `youtubeUrl` validation** (spec 13 D7c) and the
  recurrence fan-out that copies a URL to every sibling (spec 13 D12/R16) —
  both are `routes/sessions.ts`, Plan 3's file.
- **Hiding a forum post, and student reporting** — see D-14.4.

## Contradictions found while reading, recorded here

1. ~~`app.ts` does not allow `PUT` through CORS.~~ **Stale — already fixed on
   main** (`app.ts:35` lists `PUT`, with a comment naming the by-assignment
   route). This plan adds two more PUTs and needs no CORS change; Task 2 no
   longer touches the CORS call.
2. **`cleanupTestData` cannot reach `JpcEvent`.** `JpcEvent.season` is
   `onDelete: SetNull`, so deleting a test season leaves an orphaned event row
   behind **in the shared production-adjacent database**. Fixed in Task 2 with a
   `TEST_PREFIX` on `JpcEvent.title`.
3. **Spec 13 §9 says the student player route is `/sessions/[id]`**; the v2 tree
   Plan 4 builds is `app/(app)/session/[id]/index.tsx` (singular, directory form per ruling X7 because `attendance` is a child route), matching
   `assignment/[id]/index.tsx` (Plan 5's directory form). The plan follows the code, not the spec's prose.
4. **Spec 14 §7 addresses posts by `submissionId`**; this plan uses `publicId`
   (D-14.2). Named so it is not read as a transcription error.

**Execution shape:** Task 1, then Task 2 (both foundation, strictly
sequential — every shared file is edited here and nowhere else). Then three
independent streams: **video** (Tasks 3, 4, 5), **forum** (Tasks 6, 7, 8),
**events** (Tasks 9, 10). Task 11 is the closing gate, coordinator-run.

---

### Task 1: Contracts — three domain modules and the pure helpers

**Files:**
- Create: `packages/shared/src/video-quiz.ts`
- Create: `packages/shared/src/forum.ts`
- Create: `packages/shared/src/event.ts`
- Create: `packages/shared/src/video-time.ts`
- Create: `packages/shared/src/youtube.ts`
- Modify: `packages/shared/src/enums.ts` (add `jpcVisibilitySchema`)
- Modify: `packages/shared/src/index.ts` (export the five new modules)
- Test: `packages/shared/src/__tests__/video-time.test.ts`
- Test: `packages/shared/src/__tests__/youtube.test.ts`
- Test: `packages/shared/src/__tests__/forum-words.test.ts`

**No `forum-text.ts`** (ruling X3). HTML↔plain-text conversion has exactly one
home, `packages/shared/src/html-text.ts`, created by Plan 12 (`htmlToPlainText`,
`plainTextToHtml`). This plan imports it; `countWords` — the one forum-specific
text rule — lives in `forum.ts` beside the forum contracts.
- Test: `packages/shared/src/__tests__/plan10-schemas.test.ts`

**Interfaces:**
- Consumes: `submissionStatusSchema` from `./enums`; `isoDaySchema`, `wallTimeSchema` from `./org-time` (Plan 5 Task 1 — consumed, never redefined); `htmlToPlainText`,
  `plainTextToHtml` from `./html-text` (Plan 12, ruling X3) — re-exported by
  `index.ts` already, so backend and mobile import them from the shared index.
- Produces (exact names every later task imports):
  `jpcVisibilitySchema`/`JpcVisibility`;
  `videoQuestionInputSchema`/`VideoQuestionInput`, `videoQuestionAdminSchema`,
  `studentVideoQuestionSchema`, `studentVideoQuizSchema`/`StudentVideoQuiz`,
  `submitVideoAnswerRequestSchema`, `submitVideoAnswerResponseSchema`,
  `videoProgressRequestSchema`, `videoProgressResponseSchema`,
  ~~`videoQuizResultRowSchema`, `videoQuizResultsSchema`~~ *(v1 parity 2026-10-09: removed, R74)*;
  `forumCommentSchema`, `forumPostSchema`, `forumOwnResponseSchema`,
  `forumViewSchema`/`ForumView`, `submitForumResponseRequestSchema`,
  `addForumCommentRequestSchema`, `forumFeedQuerySchema`, `forumCommentsQuerySchema`,
  `forumCommentsPageSchema`, `addForumCommentResponseSchema`,
  `deleteForumCommentResponseSchema`;
  `createVideoQuestionResponseSchema`, `updateVideoQuestionResponseSchema`,
  `deleteVideoQuestionResponseSchema`, the constant `MAX_VIDEO_SECONDS`;
  `jpcEventListItemSchema`/`JpcEventListItem`, `jpcEventDetailSchema`/`JpcEventDetail`,
  `createJpcEventRequestSchema`/`CreateJpcEventBody`,
  `updateJpcEventRequestSchema`/`UpdateJpcEventBody`, `eventListQuerySchema`,
  `deleteJpcEventResponseSchema`, `jpcEventListResponseSchema`, `mergedEventSchema`, `refineEvent`
  (`isoDaySchema` / `wallTimeSchema` are **consumed** from Plan 5's
  `packages/shared/src/org-time.ts`, already exported by the index — not produced here);
  functions `formatTimestamp(totalSeconds: number): string`,
  `parseTimestamp(input: string): number | null` *(v1 parity 2026-10-09: was "optional maxSeconds parameter")*,
  `parseYouTubeId(raw: string): string | null`,
  `countWords(text: string): number` (in `forum.ts`).
  (Day labels on mobile use Plan 4's `formatDayKey` from `src/lib/format.ts`;
  this plan adds no second day formatter.)
  Every write endpoint in this plan has a response schema here, so no mobile
  hook ever casts a response with `as` (ruling X10).

- [ ] **Step 1: Failing tests for the three pure helpers**

```ts
// packages/shared/src/__tests__/video-time.test.ts
import { formatTimestamp, parseTimestamp } from "../index";

describe("formatTimestamp", () => {
  it("emits m:ss below an hour and h:mm:ss at or above one", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(90)).toBe("1:30");
    expect(formatTimestamp(3600)).toBe("1:00:00");
    expect(formatTimestamp(3661)).toBe("1:01:01");
  });

  it("floors fractions and clamps negatives, as v1 did", () => {
    expect(formatTimestamp(90.9)).toBe("1:30");
    expect(formatTimestamp(-5)).toBe("0:00");
  });

  it("does not render 'NaN:NaN' to a student (v1 R20)", () => {
    // v1: Math.floor(NaN) is NaN, Math.max(0, NaN) is NaN, and there is no
    // finiteness guard — so the player's clock read "NaN:NaN" whenever the
    // YouTube API failed to report a duration.
    expect(formatTimestamp(Number.NaN)).toBe("0:00");
    expect(formatTimestamp(Number.POSITIVE_INFINITY)).toBe("0:00");
  });
});

describe("parseTimestamp", () => {
  it("accepts the three shapes v1 accepted", () => {
    expect(parseTimestamp("90")).toBe(90); // plain seconds, no <60 rule (v1 R26)
    expect(parseTimestamp("1:30")).toBe(90);
    expect(parseTimestamp("1:01:01")).toBe(3661);
    expect(parseTimestamp("  2:00  ")).toBe(120);
  });

  it("reads empty components as zero, as v1 did (v1 R23)", () => {
    // v1 parity 2026-10-09 (jpc-space src/lib/video-time.ts:21-30): Number("")
    // is 0, so ":" is 0s, "1:" is 60s, ":30" is 30s.
    expect(parseTimestamp(":")).toBe(0);
    expect(parseTimestamp("1:")).toBe(60);
    expect(parseTimestamp(":30")).toBe(30);
  });

  it("accepts what Number() accepts as a non-negative integer (v1 R24)", () => {
    // v1 parity 2026-10-09 (jpc-space src/lib/video-time.ts:21-22): "0x10" is
    // 16s and "1e3" is 1000s; fractions, negatives and words are still null.
    expect(parseTimestamp("0x10")).toBe(16);
    expect(parseTimestamp("1e3")).toBe(1000);
    expect(parseTimestamp("1.5")).toBeNull();
    expect(parseTimestamp("-1")).toBeNull();
    expect(parseTimestamp("abc")).toBeNull();
  });

  it("keeps the <60 bounds on trailing components and rejects >3 parts", () => {
    expect(parseTimestamp("1:60")).toBeNull();
    expect(parseTimestamp("1:60:00")).toBeNull();
    expect(parseTimestamp("1:00:60")).toBeNull();
    expect(parseTimestamp("1:1:1:1")).toBeNull();
  });

  it("applies no upper bound at parse time, as v1 (v1 R27)", () => {
    // v1 parity 2026-10-09 (jpc-space src/lib/video-time.ts:15-30): the 86,400
    // ceiling is enforced only by the authoring schema on the server
    // (videoQuestionInputSchema atSeconds max, v1 video-quiz-actions.ts:17).
    expect(parseTimestamp("9999:59")).toBe(599_999);
  });

  it("round-trips everything formatTimestamp emits", () => {
    for (const seconds of [0, 7, 59, 60, 599, 3600, 3661, 86_400]) {
      expect(parseTimestamp(formatTimestamp(seconds))).toBe(seconds);
    }
  });
});
```

```ts
// packages/shared/src/__tests__/youtube.test.ts
import { parseYouTubeId } from "../index";

const ID = "dQw4w9WgXcQ"; // 11 chars, the canonical shape

describe("parseYouTubeId — forms v1 accepted, kept", () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=${ID}&t=42`,
    `https://www.youtube.com/watch?list=PLxyz&v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?t=42`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
  ])("accepts %s", (url) => {
    expect(parseYouTubeId(url)).toBe(ID);
  });
});

describe("parseYouTubeId — forms v1 silently rejected, now accepted (spec 13 D7a)", () => {
  it.each([
    [`https://www.youtube.com/live/${ID}`, "a premiere or streamed session"],
    [`https://www.youtube.com/v/${ID}`, "the legacy embed"],
    [ID, "a bare id pasted from the YouTube UI"],
    [`youtube.com/watch?v=${ID}`, "no scheme"],
  ])("accepts %s (%s)", (url) => {
    expect(parseYouTubeId(url)).toBe(ID);
  });
});

describe("parseYouTubeId — the two holes v1 left open", () => {
  it("refuses a non-YouTube host (v1 R33 had no host check at all)", () => {
    // v1's /embed/ regex scanned the raw string, so this parsed successfully
    // and handed its 'id' to the YouTube player: a wrong video, silently.
    expect(parseYouTubeId(`https://example.com/embed/${ID}`)).toBeNull();
    expect(parseYouTubeId(`https://youtube.com.evil.test/watch?v=${ID}`)).toBeNull();
  });

  it("refuses an over-long id instead of truncating it (v1 R34)", () => {
    // v1 returned the first 11 characters of a 12-character token — a
    // valid-looking, wrong id rather than a failure.
    expect(parseYouTubeId(`https://www.youtube.com/watch?v=${ID}X`)).toBeNull();
    expect(parseYouTubeId(`https://youtu.be/${ID}X`)).toBeNull();
  });

  it("returns null for anything else", () => {
    expect(parseYouTubeId("")).toBeNull();
    expect(parseYouTubeId("   ")).toBeNull();
    expect(parseYouTubeId("https://www.youtube.com/playlist?list=PLxyz")).toBeNull();
    expect(parseYouTubeId("https://vimeo.com/12345678")).toBeNull();
    expect(parseYouTubeId("not a url")).toBeNull();
  });
});
```

```ts
// packages/shared/src/__tests__/forum-words.test.ts
import { countWords, htmlToPlainText, plainTextToHtml } from "../index";

describe("countWords — v1 semantics, carried verbatim", () => {
  it("strips tags and named entities, collapses whitespace", () => {
    expect(countWords("<p>one two</p><p>three</p>")).toBe(3);
    expect(countWords("one&nbsp;two")).toBe(2);
    expect(countWords("   ")).toBe(0);
    expect(countWords("")).toBe(0);
  });

  it("still does not handle numeric entities (v1 R10) — pinned, not fixed", () => {
    // v1's entity rule is /&[a-z]+;/i, which cannot match "&#160;" ('#' is not
    // a letter), so the whole run is one token. The live counter and the
    // server gate must agree; changing this on one side gives a student an
    // enabled button the server refuses.
    expect(countWords("one&#160;two")).toBe(1);
  });

  it("counts the same words before and after the stored-HTML round trip", () => {
    // The server gates on the plain text the client typed; v1 counts the stored
    // HTML. Plan 12's converters (ruling X3) must not change the answer.
    // (No bare "&": the plain text counts it as a word, the stored "&amp;" is
    // stripped as an entity — the server gates on the plain text, so that is
    // the count that matters.)
    const text = "first line here\nsecond line";
    expect(countWords(plainTextToHtml(text))).toBe(countWords(text));
    expect(htmlToPlainText(plainTextToHtml(text))).toBe(text);
  });
});
```

Run: `pnpm --filter @space/shared jest src/__tests__/video-time.test.ts src/__tests__/youtube.test.ts src/__tests__/forum-words.test.ts`
Expected: FAIL — `video-time`, `youtube` and `countWords` do not exist yet
(`html-text` does — Plan 12).

- [ ] **Step 2: Implement the two helper modules** (`countWords` lands with the forum contracts in Step 5)

```ts
// packages/shared/src/video-time.ts

/**
 * Seconds as `m:ss`, or `h:mm:ss` past an hour.
 *
 * The finiteness guard is the fix for v1's R20: `Math.floor(NaN)` is `NaN` and
 * `Math.max(0, NaN)` is `NaN`, so the student-facing clock in
 * `interactive-video-player.tsx:290` rendered the string "NaN:NaN" whenever the
 * player failed to report a duration (v1 R81 — a common case on a phone).
 */
export function formatTimestamp(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds)) return "0:00";
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number): string => String(n).padStart(2, "0");
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}

/** The 24-hour ceiling the authoring schema enforces, kept in one place. */
export const MAX_VIDEO_SECONDS = 86_400;

/**
 * Parse `m:ss`, `h:mm:ss` or plain seconds. Null when the input is not a valid
 * timestamp.
 *
 * Ported verbatim from v1 (`jpc-space/src/lib/video-time.ts:15-30`): each
 * component goes through `Number()` and must be a non-negative integer, so an
 * empty component is 0 (R23) and `0x10` / `1e3` are accepted (R24). No upper
 * bound here (R27) — the 86,400 ceiling is the authoring schema's, on the
 * server. *(v1 parity 2026-10-09: was "digits-only components, empty rejected, maxSeconds bound at parse time")*
 *
 * Kept from v1: a single component is plain seconds with no `< 60` rule
 * ("90" is 90 seconds, R26) and the `m:ss` / `h:mm:ss` output format.
 */
export function parseTimestamp(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;

  const parts = trimmed.split(":");
  if (parts.length > 3) return null;

  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0)) return null;

  if (nums.length === 1) return nums[0] as number;
  if (nums.length === 2) {
    if ((nums[1] as number) >= 60) return null;
    return (nums[0] as number) * 60 + (nums[1] as number);
  }
  if ((nums[1] as number) >= 60 || (nums[2] as number) >= 60) return null;
  return (nums[0] as number) * 3600 + (nums[1] as number) * 60 + (nums[2] as number);
}
```

```ts
// packages/shared/src/youtube.ts

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Hosts whose URLs may name a YouTube video. v1 had no host check at all
 * (R33), so `https://example.com/embed/AAAAAAAAAAA` parsed successfully and its
 * "id" was handed to the YouTube IFrame player.
 */
const HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
  "www.youtu.be",
]);

const PATH_PREFIXES = new Set(["embed", "shorts", "live", "v"]);

/**
 * Extract the 11-character video id, or null.
 *
 * Accepted: `watch?v=ID` on any allowed host (with any other query params, in
 * any order), `youtu.be/ID`, `/embed/ID`, `/shorts/ID`, `/live/ID`, `/v/ID`,
 * a host-relative URL with no scheme, and a bare 11-character id — which is
 * what an admin copying from the YouTube UI often has.
 *
 * `/live/` and `/v/` are additions (spec 13 §10 D7a): `/live/` is what a
 * premiere or a streamed session produces, and v1 returned null for it, which
 * meant the student page silently degraded to a plain link and the whole
 * authored quiz became unreachable with no message to anyone (R32, R37).
 *
 * Parsing the URL rather than regex-scanning the raw string is what closes both
 * of v1's holes at once: the host is checked (R33), and the id must be the
 * *whole* value rather than its first 11 characters, so a 12-character token
 * fails instead of yielding a valid-looking wrong id (R34).
 */
export function parseYouTubeId(raw: string): string | null {
  const input = raw.trim();
  if (input === "") return null;
  if (VIDEO_ID.test(input)) return input;

  let url: URL;
  try {
    url = new URL(input.includes("://") ? input : `https://${input}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (!HOSTS.has(host)) return null;

  const v = url.searchParams.get("v");
  if (v !== null) return VIDEO_ID.test(v) ? v : null;

  const segments = url.pathname.split("/").filter((s) => s !== "");
  if (host === "youtu.be" || host === "www.youtu.be") {
    const [id] = segments;
    return id !== undefined && VIDEO_ID.test(id) ? id : null;
  }

  const [prefix, id] = segments;
  if (prefix === undefined || id === undefined) return null;
  if (!PATH_PREFIXES.has(prefix)) return null;
  return VIDEO_ID.test(id) ? id : null;
}
```

> **v1 parity 2026-10-09:** (R30) when the structured parse above returns null on an allowed host, fall back to v1's regex scan of the whole input — `[?&]v=`, `youtu\.be/`, `/embed/`, `/shorts/` (v1 `jpc-space/src/lib/youtube.ts:4-13`) — each followed by `([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])`, so `/attribution_link?u=/watch?v=ID` and `/x/embed/ID` parse as in v1. Edit `packages/shared/src/youtube.ts:54-66`; add those two forms to the "forms v1 accepted, kept" `it.each`. Host check (R33), boundary (R34) and `/live`, `/v`, bare id (R32) stay.

Run the `video-time` and `youtube` suites → PASS (`forum-words` stays red until Step 5).

- [ ] **Step 3: Failing test for the schemas**

```ts
// packages/shared/src/__tests__/plan10-schemas.test.ts
import {
  addForumCommentRequestSchema,
  createJpcEventRequestSchema,
  studentVideoQuestionSchema,
  submitForumResponseRequestSchema,
  videoProgressRequestSchema,
  videoQuestionInputSchema,
} from "../index";

describe("videoQuestionInputSchema", () => {
  const valid = {
    atSeconds: 30,
    prompt: "Which one?",
    options: ["a", "b"],
    correctIndex: 1,
    points: 2,
  };

  it("mirrors v1's bounds", () => {
    expect(videoQuestionInputSchema.parse(valid).points).toBe(2);
    expect(videoQuestionInputSchema.parse({ ...valid, points: undefined }).points).toBe(1);
    expect(videoQuestionInputSchema.safeParse({ ...valid, atSeconds: 86_401 }).success).toBe(false);
    expect(videoQuestionInputSchema.safeParse({ ...valid, prompt: "x" }).success).toBe(false);
    expect(videoQuestionInputSchema.safeParse({ ...valid, options: ["a"] }).success).toBe(false);
    expect(
      videoQuestionInputSchema.safeParse({ ...valid, options: ["a", "b", "c", "d", "e", "f", "g"] })
        .success,
    ).toBe(false);
  });

  it("refuses a correct index outside the options (v1 R4)", () => {
    const result = videoQuestionInputSchema.safeParse({ ...valid, correctIndex: 2 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["correctIndex"]);
    }
  });
});

describe("studentVideoQuestionSchema — the answer-key split", () => {
  const row = {
    id: 1,
    atSeconds: 30,
    prompt: "Which one?",
    options: ["a", "b"],
    points: 1,
    answered: false,
    selectedIndex: null,
    isCorrect: null,
  };

  it("parses a student row", () => {
    expect(studentVideoQuestionSchema.parse(row).answered).toBe(false);
  });

  it("REFUSES a payload carrying correctIndex", () => {
    // The schema is .strict() precisely so a backend that starts leaking the
    // answer key fails at the client boundary instead of rendering it.
    expect(studentVideoQuestionSchema.safeParse({ ...row, correctIndex: 1 }).success).toBe(false);
  });
});

describe("videoProgressRequestSchema", () => {
  it("has no `completed` field — completion is server-derived (spec 13 D3)", () => {
    const parsed = videoProgressRequestSchema.parse({ furthestSeconds: 10, completed: true });
    expect(parsed).toEqual({ furthestSeconds: 10 });
  });

  it("bounds furthestSeconds", () => {
    expect(videoProgressRequestSchema.safeParse({ furthestSeconds: -1 }).success).toBe(false);
    expect(videoProgressRequestSchema.safeParse({ furthestSeconds: 86_401 }).success).toBe(false);
  });
});

describe("submitForumResponseRequestSchema", () => {
  it("has no length rule of its own — forumMinWords is the only gate, as v1 (R11)", () => {
    // v1 parity 2026-10-09: jpc-space src/lib/forum-actions.ts:36-39.
    expect(submitForumResponseRequestSchema.safeParse({ text: "   " }).success).toBe(true);
    expect(submitForumResponseRequestSchema.safeParse({ text: "" }).success).toBe(true);
    expect(submitForumResponseRequestSchema.safeParse({ text: "one" }).success).toBe(true);
  });

  it("caps the body at 20,000 characters — v1 had no cap at all", () => {
    expect(submitForumResponseRequestSchema.safeParse({ text: "x".repeat(20_001) }).success).toBe(
      false,
    );
  });
});

describe("addForumCommentRequestSchema", () => {
  it("trims to 1..5000, exactly v1's shape", () => {
    expect(addForumCommentRequestSchema.parse({ body: "  hi  " }).body).toBe("hi");
    expect(addForumCommentRequestSchema.safeParse({ body: "   " }).success).toBe(false);
    expect(addForumCommentRequestSchema.safeParse({ body: "x".repeat(5001) }).success).toBe(false);
  });
});

describe("createJpcEventRequestSchema", () => {
  const valid = {
    title: "space-v2-test-retreat",
    day: "2099-06-01",
    time: null,
    endDay: null,
    description: null,
    url: null,
    visibility: "ALL" as const,
    seasonId: null,
  };

  it("refuses an end day before the start day (v1 R11)", () => {
    expect(createJpcEventRequestSchema.safeParse({ ...valid, endDay: "2099-05-01" }).success).toBe(
      false,
    );
    expect(createJpcEventRequestSchema.safeParse({ ...valid, endDay: "2099-06-01" }).success).toBe(
      true,
    );
  });

  it("requires a season for a SEASON event (v1 R12)", () => {
    expect(
      createJpcEventRequestSchema.safeParse({ ...valid, visibility: "SEASON" }).success,
    ).toBe(false);
    expect(
      createJpcEventRequestSchema.safeParse({ ...valid, visibility: "SEASON", seasonId: 3 })
        .success,
    ).toBe(true);
  });

  it("takes org wall-clock fields, never a device-composed instant (ruling X13)", () => {
    // v1 posted naive strings and let the server resolve them in the *host's*
    // zone (R15/R20). v2 keeps the wall-clock shape but names the zone: the
    // server composes the instant in config.orgTimezone. An ISO instant is
    // refused, because accepting one is how a device's zone leaks back in.
    expect(
      createJpcEventRequestSchema.safeParse({ ...valid, day: "2099-06-01T00:00:00.000Z" }).success,
    ).toBe(false);
    expect(createJpcEventRequestSchema.safeParse({ ...valid, time: "18:30" }).success).toBe(true);
    expect(createJpcEventRequestSchema.safeParse({ ...valid, time: "24:00" }).success).toBe(false);
    expect(createJpcEventRequestSchema.safeParse({ ...valid, time: "6pm" }).success).toBe(false);
  });
});
```

Run: `pnpm --filter @space/shared jest src/__tests__/plan10-schemas.test.ts` → FAIL.

- [ ] **Step 4: `enums.ts` and the video-quiz contracts**

Append to `packages/shared/src/enums.ts`:

```ts
export const jpcVisibilitySchema = z.enum(["ALL", "ALUMNI_ONLY", "SEASON"]);
export type JpcVisibility = z.infer<typeof jpcVisibilitySchema>;
```

```ts
// packages/shared/src/video-quiz.ts
import { z } from "zod";

import { MAX_VIDEO_SECONDS } from "./video-time";

// Wire shapes — see the note in season.ts on why timestamps are strings.
//
// Domain 13 is NOT domain 12. `Quiz`/`QuizQuestion`/`QuizAttempt`/`QuizAnswer`
// and `SessionVideoQuestion`/`SessionVideoQuestionResponse`/
// `SessionVideoProgress` share no table, no column and no FK — verified against
// prisma/schema.prisma. Nothing here may be unified with quiz.ts.

/** Authoring input. Mirrors v1's `questionSchema` bounds exactly. */
export const videoQuestionInputSchema = z
  .object({
    atSeconds: z.number().int().min(0).max(MAX_VIDEO_SECONDS),
    prompt: z.string().trim().min(2).max(500),
    options: z.array(z.string().trim().min(1).max(200)).min(2).max(6),
    correctIndex: z.number().int().min(0),
    points: z.number().int().min(1).max(100).default(1),
  })
  .refine((d) => d.correctIndex < d.options.length, {
    message: "Correct answer must be one of the options.",
    path: ["correctIndex"],
  });
export type VideoQuestionInput = z.output<typeof videoQuestionInputSchema>;

/**
 * The admin half of the answer-key split. Carries `correctIndex`; must never be
 * the parse target of a student-facing hook.
 */
export const videoQuestionAdminSchema = z.object({
  id: z.number(),
  atSeconds: z.number(),
  prompt: z.string(),
  options: z.array(z.string()),
  correctIndex: z.number(),
  points: z.number(),
  responseCount: z.number(),
});
export type VideoQuestionAdmin = z.infer<typeof videoQuestionAdminSchema>;

/**
 * The student half of the answer-key split.
 *
 * There is no `correctIndex` field, and `.strict()` means there can never be
 * one: a backend that starts selecting it fails this parse instead of rendering
 * the answer to the question the student is being asked. This absence is the
 * enforcement of v1's R69 — the one place v1 got exposure right by
 * construction, and the behaviour v2 must preserve.
 */
export const studentVideoQuestionSchema = z
  .object({
    id: z.number(),
    atSeconds: z.number(),
    prompt: z.string(),
    options: z.array(z.string()),
    points: z.number(),
    answered: z.boolean(),
    selectedIndex: z.number().nullable(),
    isCorrect: z.boolean().nullable(),
  })
  .strict();
export type StudentVideoQuestion = z.infer<typeof studentVideoQuestionSchema>;

export const studentVideoQuizSchema = z.object({
  /**
   * Resolved server-side from `Session.youtubeUrl` so the client never
   * re-implements the parser (spec 13 §7). Null means the URL is missing or
   * unparseable — the screen falls back to a "watch on YouTube" link, which is
   * the only honest thing it can do.
   */
  videoId: z.string().nullable(),
  youtubeUrl: z.string().nullable(),
  questions: z.array(studentVideoQuestionSchema),
  furthestSeconds: z.number(),
  completedAt: z.string().nullable(),
  earnedPoints: z.number(),
  totalPoints: z.number(),
  answeredCount: z.number(),
  /**
   * The id of the question the server will accept an answer for next, or null
   * when every question is answered. Derived once here (ruling C4) — the client
   * renders the barrier from this rather than recomputing "smallest atSeconds
   * among unanswered", which is exactly the derivation v1 kept only in the
   * player component.
   */
  nextQuestionId: z.number().nullable(),
});
export type StudentVideoQuiz = z.infer<typeof studentVideoQuizSchema>;

export const submitVideoAnswerRequestSchema = z.object({
  questionId: z.number().int().positive(),
  /** Upper bound is row-dependent (it is `options.length`), so it stays a server check. */
  selectedIndex: z.number().int().min(0),
});
export type SubmitVideoAnswerRequest = z.infer<typeof submitVideoAnswerRequestSchema>;

export const submitVideoAnswerResponseSchema = z.object({
  isCorrect: z.boolean(),
  /**
   * Returned for the question just answered, and only then. Safe because one
   * answer per question is final (v1 R54), and it is the feedback the modal
   * exists to show.
   */
  correctIndex: z.number(),
  furthestSeconds: z.number(),
  completedAt: z.string().nullable(),
  nextQuestionId: z.number().nullable(),
});
export type SubmitVideoAnswerResponse = z.infer<typeof submitVideoAnswerResponseSchema>;

/**
 * No `completed` field. v1 accepted it as a client claim, so a single call with
 * `(sessionId, 0, true)` marked a student complete (R48) while a student who
 * answered the last question and closed the app was never marked at all (R65).
 * The server knows the question set and the responses; it derives completion.
 */
export const videoProgressRequestSchema = z.object({
  furthestSeconds: z.number().int().min(0).max(MAX_VIDEO_SECONDS),
});
export type VideoProgressRequest = z.infer<typeof videoProgressRequestSchema>;

export const videoProgressResponseSchema = z.object({
  furthestSeconds: z.number(),
  completedAt: z.string().nullable(),
});

/**
 * v1 parity 2026-10-09 (R74): DELETE this schema and `videoQuizResultsSchema`
 * below. v1 shows no student's video-quiz result to anybody
 * (jpc-space src/components/sessions/video-questions-editor.tsx:75 shows only
 * responseCount per question); the results read is removed.
 */
export const videoQuizResultRowSchema = z.object({
  studentUserId: z.number(),
  studentName: z.string().nullable(),
  groupId: z.number().nullable(),
  groupName: z.string().nullable(),
  answeredCount: z.number(),
  questionCount: z.number(),
  earnedPoints: z.number(),
  totalPoints: z.number(),
  completedAt: z.string().nullable(),
});
export type VideoQuizResultRow = z.infer<typeof videoQuizResultRowSchema>;

export const videoQuizResultsSchema = z.object({
  questionCount: z.number(),
  totalPoints: z.number(),
  rows: z.array(videoQuizResultRowSchema),
});
export type VideoQuizResults = z.infer<typeof videoQuizResultsSchema>;

// Write responses — the mobile hooks parse these rather than casting (X10).

export const createVideoQuestionResponseSchema = z.object({
  question: videoQuestionAdminSchema,
});

export const updateVideoQuestionResponseSchema = z.object({
  question: videoQuestionAdminSchema,
  /** How many recorded answers flipped verdict under the new key (spec 13 D5). */
  regradedCount: z.number().int().min(0),
  pointsChanged: z.boolean(),
});
export type UpdateVideoQuestionResponse = z.infer<typeof updateVideoQuestionResponseSchema>;

export const deleteVideoQuestionResponseSchema = z.object({
  deleted: z.literal(true),
  responsesRemoved: z.number().int().min(0),
});
export type DeleteVideoQuestionResponse = z.infer<typeof deleteVideoQuestionResponseSchema>;
```

- [ ] **Step 5: The forum contracts**

```ts
// packages/shared/src/forum.ts
import { z } from "zod";

import { submissionStatusSchema } from "./enums";

// Wire shapes — see the note in season.ts on why timestamps are strings.
//
// A FORUM assignment is not an entity: the post *is* a Submission row and the
// only table this domain owns is ForumComment. `type`, `forumMinWords` and
// `forumAllowComments` belong to assignment.ts (domain 7) and are flattened
// onto the view below only as the two config values the screen needs.

export const forumCommentSchema = z.object({
  id: z.number(),
  authorUserId: z.number(),
  /**
   * `name`, or the literal "Group member". Never an email address: v1 fell back
   * to `email` (R30), so every student in a group saw the address of any
   * group-mate who had not set a name. These are young people's addresses.
   * There is no `authorEmail` field on this contract and there must not be one.
   */
  authorDisplayName: z.string(),
  /** Plain text. Never HTML — v1's comment box is a textarea (R29). */
  body: z.string(),
  createdAt: z.string(),
  /**
   * v1 parity 2026-10-09 (R52, R31): DELETE `canDelete` — the client renders the
   * delete control only when `authorUserId === currentUserId`, as v1
   * (jpc-space src/components/forum/forum-view.tsx:205). ADD
   * `authorAvatarUrl: z.string().nullable()` (D-14.6).
   */
  canDelete: z.boolean(),
});
export type ForumComment = z.infer<typeof forumCommentSchema>;

export const forumPostSchema = z.object({
  /** Addressed by publicId, never the sequential Submission.id (v1 R5/R43). */
  submissionPublicId: z.string(),
  studentUserId: z.number(),
  authorDisplayName: z.string(),
  /**
   * v1 parity 2026-10-09 (R28): sanitised HTML, not plain text — the stored body
   * passed through v1's allow-list (jpc-space src/components/ui/rich-text-view.tsx:11-31:
   * p br strong em s a ul ol li h2 h3 blockquote code pre; `a` keeps href/target/rel;
   * schemes http/https/mailto only) and rendered as formatted rich text on device.
   * Was "plain text via htmlToPlainText (ruling C11)". ADD `authorAvatarUrl` (R31).
   */
  text: z.string(),
  submittedAt: z.string().nullable(),
  /** v1 parity 2026-10-09 (R26): DELETE — every comment is inlined, as v1. */
  commentCount: z.number(),
  /** Every comment on the post, `createdAt` asc (v1 forum-query.ts:101-110, R26). */
  comments: z.array(forumCommentSchema),
  canComment: z.boolean(),
});
export type ForumPost = z.infer<typeof forumPostSchema>;

export const forumOwnResponseSchema = z.object({
  /**
   * v1 parity 2026-10-09 (R34/R56, D-14.8): DELETE `feedback` and `reviewedAt` —
   * v1's forum screen never shows reviewer feedback (forum-query.ts:54-57).
   *
   * Spec 14 §10 D9: posting sets SUBMITTED, which puts a forum post in the
   * leader review queue as ordinary work, and `reviewSubmissionAction` has no
   * type precondition — so a reviewer can write feedback on a discussion post
   * and v1's forum screen renders none of it, because `loadForumView` never
   * selects the column. Forum posts stay reviewable (that is the cheaper half
   * of the decision and matches what leaders already do); the fix is that the
   * student can now read the verdict.
   */
  feedback: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  /**
   * Nullable, and that is the whole point: nothing creates the row up front any
   * more (ruling C6), so the screen must render the compose box, the counter and
   * the locked feed with no submission in existence.
   */
  submissionPublicId: z.string().nullable(),
  text: z.string(),
  status: submissionStatusSchema,
  wordCount: z.number(),
  posted: z.boolean(),
});
export type ForumOwnResponse = z.infer<typeof forumOwnResponseSchema>;

export const forumViewSchema = z.object({
  assignmentId: z.number(),
  /** Rendered on the forum screen — v1's FORUM branch omitted it (spec 14 D10). */
  dueAt: z.string().nullable(),
  /**
   * Null for staff readers, who have no response of their own. A student always
   * has one, even when its `submissionPublicId` is null.
   */
  own: forumOwnResponseSchema.nullable(),
  /** True until the caller's own response is posted. Staff are never locked. */
  locked: z.boolean(),
  minWords: z.number().nullable(),
  allowComments: z.boolean(),
  /** Which group's thread this is. Null for a staff reader seeing every group. */
  groupId: z.number().nullable(),
  posts: z.array(forumPostSchema),
  /** v1 parity 2026-10-09 (R27): DELETE — every post in one response, as v1. */
  nextCursor: z.string().nullable(),
});
export type ForumView = z.infer<typeof forumViewSchema>;

/**
 * No length rule here, as v1 (R11; jpc-space src/lib/forum-actions.ts:36-39):
 * the only gate is the route's `countWords(text) >= (forumMinWords ?? 0)`, so
 * with a null or zero minimum an empty response posts. v1 had no cap.
 * *(v1 parity 2026-10-09: was "trim().min(1).max(20_000)")*
 */
export const submitForumResponseRequestSchema = z.object({
  text: z.string(),
});
export type SubmitForumResponseRequest = z.infer<typeof submitForumResponseRequestSchema>;

export const addForumCommentRequestSchema = z.object({
  body: z.string().trim().min(1, "Comment cannot be empty.").max(5000),
});
export type AddForumCommentRequest = z.infer<typeof addForumCommentRequestSchema>;

// v1 parity 2026-10-09 (R27, R26): DELETE forumFeedQuerySchema,
// forumCommentsQuerySchema and forumCommentsPageSchema — the feed returns every
// post (submittedAt desc) with every comment inline; there is no paging.
export const forumFeedQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type ForumFeedQuery = z.output<typeof forumFeedQuerySchema>;

export const forumCommentsQuerySchema = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ForumCommentsQuery = z.output<typeof forumCommentsQuerySchema>;

/** `GET .../posts/:publicId/comments` — one page, oldest first. */
export const forumCommentsPageSchema = z.object({
  comments: z.array(forumCommentSchema),
  nextCursor: z.number().nullable(),
});
export type ForumCommentsPage = z.infer<typeof forumCommentsPageSchema>;

export const addForumCommentResponseSchema = z.object({ comment: forumCommentSchema });

export const deleteForumCommentResponseSchema = z.object({ deleted: z.literal(true) });

/**
 * v1's word counter, carried verbatim from `jpc-space/src/lib/forum.ts`.
 *
 * Shared for the reason v1 shared it: the live counter in the compose box and
 * the server's `forumMinWords` gate must agree, or a student gets an enabled
 * button and a refusal. Numeric entities (`&#160;`) are deliberately still
 * unhandled — matching v1 exactly is the point (spec 14 R10).
 *
 * This is the only text helper the forum owns. Converting between stored HTML
 * and plain text is `html-text.ts` (Plan 12, ruling X3) — never a second copy.
 */
export function countWords(text: string): number {
  const stripped = text
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return 0;
  return stripped.split(" ").length;
}
```

- [ ] **Step 6: The event contracts**

```ts
// packages/shared/src/event.ts
import { z } from "zod";

import { jpcVisibilitySchema } from "./enums";
// Plan 5 created `org-time.ts` (shared wall-clock schemas, ruling C2/X13).
// Consumed here, never redefined — a second `isoDaySchema` in `event.ts` would
// collide on `export *` in `index.ts`.
import { isoDaySchema, wallTimeSchema } from "./org-time";

// Wire shapes — see the note in season.ts on why timestamps are strings.

export const jpcEventListItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  /** The stored instant — for ordering only. Never formatted on the device. */
  date: z.string(),
  endDate: z.string().nullable(),
  /** The org-calendar day `date` falls on, computed server-side (ruling X13). */
  dayKey: isoDaySchema,
  endDayKey: isoDaySchema.nullable(),
  /** Org wall-clock start, `HH:mm`; null exactly when `allDay`. */
  time: wallTimeSchema.nullable(),
  /**
   * Derived once, server-side, against the organisation timezone (ruling C2,
   * spec 15 §10 item 6). v1 re-ran `getHours() !== 0 || getMinutes() !== 0` in
   * three separate files, each in the *viewer's* zone, against an instant the
   * *server* had composed — so an event authored as all-day stopped reading as
   * all-day for anyone in a different zone.
   */
  allDay: z.boolean(),
  url: z.string().nullable(),
  visibility: jpcVisibilitySchema,
  seasonId: z.number().nullable(),
  /**
   * Present so a SEASON chip can be badged with its season (spec 15 item 12) —
   * v1 styled SEASON identically to ALL, so nothing on the calendar
   * distinguished an organisation-wide event from a season-scoped one (R68).
   * (v1 parity 2026-10-09: the calendar no longer shows it — R68.)
   */
  seasonCode: z.string().nullable(),
  // v1 parity 2026-10-09 (R58, R31, R6): v1's single row shape for every role
  // (jpc-space src/lib/jpc-events-query.ts:6-18,56-68) — ADD
  //   description: z.string().nullable(), imageUrl: z.string().nullable(),
  //   createdById: z.number().nullable(), seasonTitle: z.string().nullable(),
  //   endTime: wallTimeSchema.nullable()
});
export type JpcEventListItem = z.infer<typeof jpcEventListItemSchema>;

/**
 * v1 parity 2026-10-09 (R58/R70): DELETE this schema — there is no detail
 * screen and no detail read; the list row carries v1's full shape.
 *
 * v1 has no event detail page anywhere (R70), so `description` and the season
 * were write-only data for every non-SUPER user. There is no `imageUrl`:
 * uploads are off and v1's photo path is ungated (spec 15 D7 in this plan).
 * There is no `createdById` either — written by v1, read by nothing, and no
 * reason to ship a user id to every student.
 */
export const jpcEventDetailSchema = jpcEventListItemSchema.extend({
  description: z.string().nullable(),
  seasonTitle: z.string().nullable(),
  /** Whether this caller may edit or delete. Drives the UI, never the gate. */
  canManage: z.boolean(),
});
export type JpcEventDetail = z.infer<typeof jpcEventDetailSchema>;

/**
 * Org wall-clock fields, not an instant (D-15.6, ruling X13). The server
 * composes the instant in `config.orgTimezone`; `time: null` means all-day and
 * is stored as org midnight — no `allDay` column exists or can be added (C1).
 */
const eventWriteBase = z.object({
  title: z.string().trim().min(1).max(200),
  day: isoDaySchema,
  time: wallTimeSchema.nullable().default(null),
  endDay: isoDaySchema.nullable().default(null),
  // v1 parity 2026-10-09 (R6/R17): the end has an optional time, as v1
  // (jpc-space src/lib/jpc-event-actions.ts:17,36-38); ignored when endDay is null.
  endTime: wallTimeSchema.nullable().default(null),
  description: z.string().max(2000).nullable().default(null),
  url: z.string().url().nullable().default(null),
  visibility: jpcVisibilitySchema,
  seasonId: z.number().int().positive().nullable().default(null),
});

/**
 * Exported so the PATCH handler re-runs the same two rules against the merged
 * row. ISO days compare correctly as strings.
 */
export function refineEvent(
  v: { day: string; endDay: string | null; visibility: string; seasonId: number | null },
  ctx: z.RefinementCtx,
): void {
  // v1 parity 2026-10-09 (R11): compare full date-times, end >= start (equal
  // allowed), as v1 (jpc-space src/lib/jpc-event-actions.ts:23-26) — compare
  // `${day}T${time ?? "00:00"}` with `${endDay}T${endTime ?? "00:00"}` (same org
  // zone on both sides, so the strings order like the instants), not days only.
  if (v.endDay !== null && v.endDay < v.day) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDay"],
      message: "End must be on or after the start.",
    });
  }
  if (v.visibility === "SEASON" && v.seasonId == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["seasonId"],
      message: "Choose a season for a season-only event.",
    });
  }
}

export const createJpcEventRequestSchema = eventWriteBase.superRefine(refineEvent);
export type CreateJpcEventBody = z.output<typeof createJpcEventRequestSchema>;

/**
 * A partial, unlike v1 — whose update reused the create schema, so an edit had
 * to resend every field. Both refinements re-apply against the *merged* row in
 * the route (`mergedEventSchema` below), not against the patch, because
 * `{ visibility: "SEASON" }` alone cannot know whether the stored row already
 * has a season. `.partial()` wraps each defaulted field in an optional, so an
 * omitted field parses to `undefined` and does not reset the stored value.
 */
export const updateJpcEventRequestSchema = eventWriteBase.partial();
export type UpdateJpcEventBody = z.output<typeof updateJpcEventRequestSchema>;

/** The PATCH handler parses `{ ...storedAsWallClock, ...patch }` with this. */
export const mergedEventSchema = eventWriteBase.superRefine(refineEvent);

/**
 * The window bounds stored instants and carries no day semantics, so instants
 * are right here. Omitted, there is no bound — every visible event, as v1
 * (D-15.5, R57). *(v1 parity 2026-10-09: was "omitted, the server picks the default")*
 */
export const eventListQuerySchema = z
  .object({
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    /**
     * Spec 19 §7 (dashboards): the lower bound becomes the start of *today in
     * the org zone* on `(endDate ?? date)` — v1's card filter, moved server-side
     * and out of the host's zone (spec 19 R8, ruling C2/X13). Not combinable
     * with `from`, which would make the bound ambiguous.
     */
    upcoming: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => v === "true"),
    /** Cap on `events` (spec 19 §7: 1–20). `total` is counted before it. */
    limit: z.coerce.number().int().min(1).max(20).optional(),
  })
  .refine((q) => !(q.upcoming && q.from !== undefined), {
    message: "Use either upcoming or from, not both.",
    path: ["from"],
  });
export type EventListQuery = z.output<typeof eventListQuerySchema>;

/**
 * `GET /events`. `total` is the number of visible events in the window
 * *before* `limit` — the SUPER dashboard tile reads it from the same response
 * the card renders, so the tile and the card cannot disagree (spec 19 D19/R15).
 */
export const jpcEventListResponseSchema = z.object({
  events: z.array(jpcEventListItemSchema),
  total: z.number().int().min(0),
});
export type JpcEventListResponse = z.infer<typeof jpcEventListResponseSchema>;

export const deleteJpcEventResponseSchema = z.object({ deleted: z.literal(true) });

```

- [ ] **Step 7: Export and verify**

Append to `packages/shared/src/index.ts`, in the file's existing style:

```ts
export * from "./video-quiz";
export * from "./forum";
export * from "./event";
export * from "./video-time";
export * from "./youtube";
```

(`./html-text` is already exported — Plan 12.)

Run: `pnpm --filter @space/shared jest` → the four new suites PASS (and Plan 12's
`html-text` suite still passes — this plan does not touch it).
Run: `pnpm turbo lint typecheck --filter=@space/shared` → clean.

- [ ] **Step 8: Commit**

```bash
git add packages/shared && git commit -m "feat(shared): video-quiz, forum and event contracts plus timestamp and YouTube helpers"
```

---

### Task 2: Shared plumbing — gates, router mounts, fixtures, query keys

Everything three streams would otherwise fight over. After this task, no two
streams touch the same file.

**Files:**
- Modify: `apps/backend/src/lib/permissions.ts` (five new gates)
- Modify: `apps/backend/src/lib/queries/assignments.ts` (export `groupIdInSeason`)
- Create: `apps/backend/src/routes/video-quiz.ts` (empty router)
- Create: `apps/backend/src/routes/forum.ts` (empty router)
- Create: `apps/backend/src/routes/events.ts` (empty router)
- Modify: `apps/backend/src/app.ts` (three mounts; CORS already allows `PUT` — untouched)
- Modify: `apps/backend/src/__tests__/integration/fixtures.ts` (event prefix + cleanup)
- Modify: `apps/mobile/src/lib/query-keys.ts` (three factories)
- Test: `apps/backend/src/__tests__/app.test.ts` (unknown `/api/v1` paths stay `not_found`)
- Test: `apps/backend/src/__tests__/integration/plan10-gates.test.ts` (new suite)

**Interfaces:**
- Consumes: `isSuper`, `isMentor`, `isAdminOfSeason`, `isLeaderOfGroup` from `../lib/rbac`; `staffScopeForSeason` and `studentCanSeeAssignment` (already exported).
- Produces:
  - `canManageSessionVideo(user, sessionId): Promise<boolean>`
  - `hasActiveEnrollment(user, seasonId): Promise<boolean>`
  - `canCommentOnForumSubmission(user, submissionId): Promise<boolean>`
  - `canDeleteForumComment(user, commentId): Promise<boolean>`
  - `forumAudienceFor(user, assignmentId): Promise<ForumAudience | null>` and the exported type `ForumAudience`
  - `groupIdInSeason(studentUserId, seasonId): Promise<number | null>` (now exported from `lib/queries/assignments.ts`)
  - routers `videoQuizRouter`, `forumRouter`, `eventsRouter`, mounted
  - fixtures `testEventTitle(): string`
  - `queryKeys.videoQuiz`, `queryKeys.forum`, `queryKeys.events`

- [ ] **Step 1: A regression test for the X5 rule**

The earlier draft of this step asserted a router count through Express's
private `app._router` (Express 5 has no such property) and a CORS `PUT` that is
already on main — neither could fail. Mounts are proved by the stream tasks'
integration suites, which issue real requests to real routes. What this task
*can* break is the 404 envelope for unknown paths: a router mounted at
`/api/v1` with a router-wide `use(requireAuth)` turns every unknown
`/api/v1/*` path into a 401. Pin that.

Append to `apps/backend/src/__tests__/app.test.ts`:

```ts
describe("routers mounted on the shared /api/v1 prefix (ruling X5)", () => {
  it("leaves an unknown /api/v1 path a not_found 404, not a 401", async () => {
    // forumRouter and videoQuizRouter mount at /api/v1. If either ever gains a
    // router-wide `use(requireAuth)`, this anonymous request is refused with
    // 401 before it can reach the catch-all, and the envelope CLAUDE.md
    // promises for unknown paths is gone.
    const res = await request(createApp()).get("/api/v1/space-v2-no-such-route");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});
```

Run: `cd apps/backend && npx jest src/__tests__/app.test.ts` → PASS today (no
router at `/api/v1` yet). Then, as the red check, temporarily add
`app.use("/api/v1", Router().use(requireAuth))` in `createApp` → FAIL with 401;
remove it. This is a regression guard, recorded as such in Task 11's mutation
pass (item 9).

- [ ] **Step 2: Create the three routers and mount them**

`forumRouter` and `videoQuizRouter` carry **no** router-level middleware; every
route added in Tasks 3, 4, 6 and 7 lists `requireAuth` as its first handler
(`forumRouter.get("/assignments/:id/forum", requireAuth, async (req, res) => …)`).
`eventsRouter` owns `/api/v1/events` exclusively, so router-wide auth is allowed
there by X5 and kept.

```ts
// apps/backend/src/routes/video-quiz.ts
import { Router } from "express";

/**
 * Domain 13. Mounted at /api/v1 rather than under a single prefix because the
 * surface spans two parents: the student and authoring reads hang off a
 * session (`/sessions/:id/video-*`) while update and delete address a question
 * directly (`/video-questions/:questionId`).
 *
 * Because the prefix is shared, `requireAuth` is attached to each route, never
 * with `videoQuizRouter.use(...)` (ruling X5): a router-wide guard here would
 * answer 401 for every unknown /api/v1 path and re-run auth for every router
 * mounted after it.
 *
 * Nothing here belongs to domain 12. Text quizzes own Quiz/QuizQuestion/
 * QuizAttempt/QuizAnswer/QuizGrade; this owns SessionVideoQuestion/
 * SessionVideoQuestionResponse/SessionVideoProgress. They share no table.
 */
export const videoQuizRouter = Router();
```

```ts
// apps/backend/src/routes/forum.ts
import { Router } from "express";

/**
 * Domain 14. Mounted at /api/v1 because the thread hangs off an assignment
 * (`/assignments/:id/forum*`) while a comment is addressed on its own
 * (`/forum/comments/:commentId`). Per-route `requireAuth` only (ruling X5) —
 * see video-quiz.ts for why.
 */
export const forumRouter = Router();
```

```ts
// apps/backend/src/routes/events.ts
import { Router } from "express";

import { requireAuth } from "../middleware/require-auth";

/**
 * Domain 15. Mounted at /api/v1/events, a prefix this router owns exclusively,
 * so router-wide auth is permitted (ruling X5).
 */
export const eventsRouter = Router();
eventsRouter.use(requireAuth);
```

In `app.ts`, add the three imports beside the existing route imports and,
immediately **above** `app.use("/api/v1/seasons", seasonsRouter);`:

```ts
  // forum + video-quiz: mounted at the version root because their paths span
  // two parents each. They carry no router-level middleware (per-route
  // requireAuth, ruling X5), so a request that matches none of their routes
  // falls straight through to the prefixed routers and the catch-all 404.
  app.use("/api/v1", forumRouter);
  app.use("/api/v1", videoQuizRouter);
  app.use("/api/v1/events", eventsRouter);
```

The CORS call is not touched — `PUT` is already in its `methods` list.

Run the app test → PASS.

- [ ] **Step 3: Export `groupIdInSeason`**

In `apps/backend/src/lib/queries/assignments.ts`, change
`async function groupIdInSeason(` to `export async function groupIdInSeason(`
and extend its doc comment with one line:

```ts
 * Exported for the forum gates, which ask the same per-season question about a
 * post's author and its reader (ruling C9).
```

- [ ] **Step 4: Failing integration test for the five gates**

```ts
// apps/backend/src/__tests__/integration/plan10-gates.test.ts
import { createApp } from "../../app";
import { db } from "../../db/client";
import type { SessionUser } from "../../lib/auth/tokens";
import {
  canCommentOnForumSubmission,
  canDeleteForumComment,
  canManageSessionVideo,
  forumAudienceFor,
  hasActiveEnrollment,
} from "../../lib/permissions";
import { newPublicId } from "../../lib/public-id";
import { cleanupTestData, createTestSeason, createTestUser } from "./fixtures";

jest.setTimeout(60000);
createApp(); // config side effects, same as the other suites

let seasonId: number;
let sessionId: number;
let groupAId: number;
let groupBId: number;
let assignmentId: number;
let postSubmissionId: number;
let commentId: number;

let author: SessionUser;
let groupMate: SessionUser;
let outsider: SessionUser;
let dropped: SessionUser;
let leaderA: SessionUser;
let leaderB: SessionUser;
let admin: SessionUser;
let mentor: SessionUser;
let superUser: SessionUser;

function asUser(
  id: number,
  role: SessionUser["role"],
  overrides: Partial<SessionUser> = {},
): SessionUser {
  return {
    userId: id,
    role,
    seasonAdminIds: [],
    groupLeaderIds: [],
    activeSeasonId: null,
    graduationYear: null,
    ...overrides,
  } as SessionUser;
}

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;

  const authorUser = await createTestUser("fauthor", "STUDENT");
  const mateUser = await createTestUser("fmate", "STUDENT");
  const outsiderUser = await createTestUser("foutsider", "STUDENT");
  const droppedUser = await createTestUser("fdropped", "STUDENT");
  const leaderAUser = await createTestUser("fleadera", "LEADER");
  const leaderBUser = await createTestUser("fleaderb", "LEADER");
  const adminUser = await createTestUser("fadmin", "ADMIN");
  const mentorUser = await createTestUser("fmentor", "MENTOR");
  const superRow = await createTestUser("fsuper", "SUPER");

  const groupA = await db.group.create({
    data: { seasonId, name: "Group A", leaders: { create: { userId: leaderAUser.id } } },
    select: { id: true },
  });
  const groupB = await db.group.create({
    data: { seasonId, name: "Group B", leaders: { create: { userId: leaderBUser.id } } },
    select: { id: true },
  });
  groupAId = groupA.id;
  groupBId = groupB.id;

  await db.seasonAdmin.create({ data: { seasonId, userId: adminUser.id } });
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: authorUser.id, groupId: groupA.id, status: "ACTIVE" },
      { seasonId, studentUserId: mateUser.id, groupId: groupA.id, status: "ACTIVE" },
      { seasonId, studentUserId: outsiderUser.id, groupId: groupB.id, status: "ACTIVE" },
      { seasonId, studentUserId: droppedUser.id, groupId: groupA.id, status: "WITHDRAWN" },
    ],
  });

  const session = await db.session.create({
    data: {
      seasonId,
      title: "space-v2-test-video-session",
      startsAt: new Date("2099-03-01T18:00:00.000Z"),
      durationMinutes: 90,
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    },
    select: { id: true },
  });
  sessionId = session.id;

  const assignment = await db.assignment.create({
    data: {
      seasonId,
      title: "space-v2-test-forum-assignment",
      type: "FORUM",
      forumMinWords: 5,
      forumAllowComments: true,
      isAllGroups: true,
    },
    select: { id: true },
  });
  assignmentId = assignment.id;

  const post = await db.submission.create({
    data: {
      assignmentId,
      studentUserId: authorUser.id,
      publicId: newPublicId(),
      status: "SUBMITTED",
      submittedAt: new Date(),
      text: "<p>space-v2-test post body</p>",
    },
    select: { id: true },
  });
  postSubmissionId = post.id;

  const comment = await db.forumComment.create({
    data: { submissionId: post.id, authorUserId: mateUser.id, body: "space-v2-test comment" },
    select: { id: true },
  });
  commentId = comment.id;

  author = asUser(authorUser.id, "STUDENT", { activeSeasonId: seasonId });
  groupMate = asUser(mateUser.id, "STUDENT", { activeSeasonId: seasonId });
  outsider = asUser(outsiderUser.id, "STUDENT", { activeSeasonId: seasonId });
  dropped = asUser(droppedUser.id, "STUDENT", { activeSeasonId: seasonId });
  leaderA = asUser(leaderAUser.id, "LEADER", { groupLeaderIds: [groupA.id] });
  leaderB = asUser(leaderBUser.id, "LEADER", { groupLeaderIds: [groupB.id] });
  admin = asUser(adminUser.id, "ADMIN", { seasonAdminIds: [seasonId] });
  mentor = asUser(mentorUser.id, "MENTOR");
  superUser = asUser(superRow.id, "SUPER");
});

afterAll(async () => {
  await cleanupTestData();
});

describe("canManageSessionVideo", () => {
  it("admits SUPER and the season's ADMIN, and nobody else", async () => {
    expect(await canManageSessionVideo(superUser, sessionId)).toBe(true);
    expect(await canManageSessionVideo(admin, sessionId)).toBe(true);
    // v1's gate is season-scoped ADMIN + SUPER only — a group LEADER who runs
    // the session cannot author its questions, and a MENTOR who reads
    // everything cannot either.
    expect(await canManageSessionVideo(leaderA, sessionId)).toBe(false);
    expect(await canManageSessionVideo(mentor, sessionId)).toBe(false);
    expect(await canManageSessionVideo(author, sessionId)).toBe(false);
  });

  it("is false for a session that does not exist", async () => {
    expect(await canManageSessionVideo(admin, 987_654_321)).toBe(false);
  });
});

describe("hasActiveEnrollment", () => {
  it("requires an ACTIVE enrolment, not merely an enrolment row", async () => {
    // v1 gated answering on canAccessSeason, whose student branch accepts ANY
    // SeasonEnrollment row regardless of status, while the page that rendered
    // the player required status ACTIVE — so a dropped student failed the page
    // and passed the action (spec 13 R51 / D9).
    expect(await hasActiveEnrollment(author, seasonId)).toBe(true);
    expect(await hasActiveEnrollment(dropped, seasonId)).toBe(false);
  });

  it("is false for every non-student role", async () => {
    expect(await hasActiveEnrollment(admin, seasonId)).toBe(false);
    expect(await hasActiveEnrollment(superUser, seasonId)).toBe(false);
  });
});

describe("canCommentOnForumSubmission", () => {
  it("admits a group-mate, SUPER, the season ADMIN and the author's LEADER", async () => {
    expect(await canCommentOnForumSubmission(groupMate, postSubmissionId)).toBe(true);
    expect(await canCommentOnForumSubmission(superUser, postSubmissionId)).toBe(true);
    expect(await canCommentOnForumSubmission(admin, postSubmissionId)).toBe(true);
  });

  it("refuses another group's student, every leader, and a mentor", async () => {
    // v1 parity 2026-10-09 (R40): in v1 LEADER and MENTOR fall through to
    // `return false` (jpc-space src/lib/auth/permissions.ts:352).
    expect(await canCommentOnForumSubmission(leaderA, postSubmissionId)).toBe(false);
    expect(await canCommentOnForumSubmission(outsider, postSubmissionId)).toBe(false);
    expect(await canCommentOnForumSubmission(leaderB, postSubmissionId)).toBe(false);
    // MENTOR stays read-only, consistent with their posture elsewhere.
    expect(await canCommentOnForumSubmission(mentor, postSubmissionId)).toBe(false);
  });

  it("refuses when the target is still a DRAFT (v1 R43)", async () => {
    // v1 read only `assignmentId` from the target, so a student who satisfied
    // the group and post-first rules could comment on a group-mate's unposted
    // draft by naming its sequential id.
    //
    // The draft's author is in groupMate's OWN group (A), so the group check
    // passes and the DRAFT rule is the only thing that can refuse — an
    // outsider's draft would be refused by the group mismatch and mask a
    // removed DRAFT check.
    const draftAuthorRow = await createTestUser("fdraftauthor", "STUDENT");
    await db.seasonEnrollment.create({
      data: { seasonId, studentUserId: draftAuthorRow.id, groupId: groupAId, status: "ACTIVE" },
    });
    const draft = await db.submission.create({
      data: {
        assignmentId,
        studentUserId: draftAuthorRow.id,
        publicId: newPublicId(),
        status: "DRAFT",
      },
      select: { id: true },
    });
    expect(await canCommentOnForumSubmission(groupMate, draft.id)).toBe(false);
    // Control: the same author's post, once SUBMITTED, is commentable — so the
    // refusal above is the DRAFT rule and nothing else.
    await db.submission.update({
      where: { id: draft.id },
      data: { status: "SUBMITTED", submittedAt: new Date(), text: "<p>space-v2-test</p>" },
    });
    expect(await canCommentOnForumSubmission(groupMate, draft.id)).toBe(true);
  });

  it("refuses when comments are switched off on the assignment", async () => {
    const quiet = await db.assignment.create({
      data: {
        seasonId,
        title: "space-v2-test-quiet-forum",
        type: "FORUM",
        forumAllowComments: false,
        isAllGroups: true,
      },
      select: { id: true },
    });
    const post = await db.submission.create({
      data: {
        assignmentId: quiet.id,
        studentUserId: author.userId,
        publicId: newPublicId(),
        status: "SUBMITTED",
        submittedAt: new Date(),
        text: "<p>space-v2-test</p>",
      },
      select: { id: true },
    });
    expect(await canCommentOnForumSubmission(groupMate, post.id)).toBe(false);
    expect(await canCommentOnForumSubmission(superUser, post.id)).toBe(false);
  });
});

describe("canDeleteForumComment", () => {
  it("admits the author, SUPER and the season ADMIN", async () => {
    expect(await canDeleteForumComment(groupMate, commentId)).toBe(true);
    expect(await canDeleteForumComment(superUser, commentId)).toBe(true);
    expect(await canDeleteForumComment(admin, commentId)).toBe(true);
  });

  it("refuses everyone else, including the post's own author and every leader", async () => {
    // v1 parity 2026-10-09 (R50): jpc-space src/lib/forum-actions.ts:115-118.
    expect(await canDeleteForumComment(leaderA, commentId)).toBe(false);
    expect(await canDeleteForumComment(author, commentId)).toBe(false);
    expect(await canDeleteForumComment(outsider, commentId)).toBe(false);
    expect(await canDeleteForumComment(leaderB, commentId)).toBe(false);
    expect(await canDeleteForumComment(mentor, commentId)).toBe(false);
  });
});

describe("forumAudienceFor", () => {
  it("gives a student their own season group", async () => {
    expect(await forumAudienceFor(author, assignmentId)).toEqual({
      kind: "student",
      groupId: groupAId,
    });
  });

  it("refuses a student with no ACTIVE enrolment", async () => {
    expect(await forumAudienceFor(dropped, assignmentId)).toBeNull();
  });

  // v1 parity 2026-10-09 (R53): the two staff cases below become "refuses
  // LEADER, ADMIN, SUPER and MENTOR" → toBeNull() — v1's only forum screen is
  // the student's (jpc-space src/app/student/assignments/[id]/page.tsx:14,24).
  it("gives a leader only the groups they lead in this season", async () => {
    expect(await forumAudienceFor(leaderA, assignmentId)).toEqual({
      kind: "staff",
      groupIds: [groupAId],
    });
    expect(await forumAudienceFor(leaderB, assignmentId)).toEqual({
      kind: "staff",
      groupIds: [groupBId],
    });
  });

  it("gives SUPER, the season ADMIN and a MENTOR every group", async () => {
    for (const staff of [superUser, admin, mentor]) {
      expect(await forumAudienceFor(staff, assignmentId)).toEqual({
        kind: "staff",
        groupIds: null,
      });
    }
  });
});
```

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern plan10-gates` → FAIL (no exports).

- [ ] **Step 5: Implement the gates**

Append to `apps/backend/src/lib/permissions.ts` (it already imports `db`,
`SessionUser`, and the rbac predicates; add `groupIdInSeason` and
`studentCanSeeAssignment` from `./queries/assignments`):

```ts
/**
 * Authoring interactive video questions on a session.
 *
 * Season-scoped ADMIN + SUPER only — not a group LEADER, not a MENTOR. Ported
 * from v1's `canManageSessionVideo`, which is one of the gates v1 got right;
 * what v1 lacked was any gate on the *reads*, one of which carries the answer
 * key for every question (spec 13 R68/R73).
 */
export async function canManageSessionVideo(
  user: SessionUser,
  sessionId: number,
): Promise<boolean> {
  if (isSuper(user)) return true;
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { seasonId: true },
  });
  if (!session) return false;
  return isAdminOfSeason(user, session.seasonId);
}

/**
 * A student with a live place in this season.
 *
 * Deliberately stricter than `canAccessSeason`, whose student branch accepts
 * any `SeasonEnrollment` row whatever its status. v1 gated the video answer and
 * progress actions on that looser predicate while the page that rendered the
 * player required `status: "ACTIVE"` — so a dropped or completed student could
 * not open the page and could still answer (spec 13 R51, §10 D9). This is the
 * rule v1 intended, made real.
 *
 * If alumni are ever meant to keep access to a past season's material, that is
 * a separate named rule, not a side effect of a permissive gate.
 */
export async function hasActiveEnrollment(user: SessionUser, seasonId: number): Promise<boolean> {
  if (user.role !== "STUDENT") return false;
  const enrollment = await db.seasonEnrollment.findUnique({
    where: { studentUserId_seasonId: { studentUserId: user.userId, seasonId } },
    select: { status: true },
  });
  return enrollment?.status === "ACTIVE";
}

/**
 * Who may comment on a forum post.
 *
 * v1's `canCommentOnForumSubmission` is the one gate in domain 14 that would
 * have survived an API — it re-reads the target, re-checks the type and the
 * flag, and compares live group membership. Two changes:
 *
 *  1. Membership resolves through `SeasonEnrollment`, not `GroupStudent`
 *     (ruling C9). `GroupStudent.studentUserId` is `@unique` across the whole
 *     database, so it answers "what group is this student in now" — the wrong
 *     question for an assignment in a season they may since have left.
 *  2. LEADER and MENTOR cannot comment: in v1 both fall through to
 *     `return false` (jpc-space src/lib/auth/permissions.ts:352, R40), ported
 *     as is. *(v1 parity 2026-10-09: was "LEADER admitted for groups they lead")*
 *
 * Also new: a DRAFT target is refused. v1 read only `assignmentId` from the
 * target row, so a group-mate's unposted draft was a valid comment target for
 * anyone who could name its sequential id (spec 14 R43).
 */
export async function canCommentOnForumSubmission(
  user: SessionUser,
  submissionId: number,
): Promise<boolean> {
  const sub = await db.submission.findUnique({
    where: { id: submissionId },
    select: {
      studentUserId: true,
      status: true,
      assignment: { select: { seasonId: true, type: true, forumAllowComments: true } },
    },
  });
  if (!sub) return false;
  if (sub.assignment.type !== "FORUM" || !sub.assignment.forumAllowComments) return false;
  if (sub.status === "DRAFT") return false;

  if (isSuper(user)) return true;
  if (isAdminOfSeason(user, sub.assignment.seasonId)) return true;

  const authorGroupId = await groupIdInSeason(sub.studentUserId, sub.assignment.seasonId);
  if (authorGroupId === null) return false;

  // v1 parity 2026-10-09 (R40): no LEADER branch — LEADER and MENTOR cannot
  // comment (jpc-space src/lib/auth/permissions.ts:352). Edit permissions.ts:559.
  if (user.role === "STUDENT") {
    const mine = await groupIdInSeason(user.userId, sub.assignment.seasonId);
    return mine !== null && mine === authorGroupId;
  }
  return false;
}

/**
 * Who may remove a comment.
 *
 * v1: the author, SUPER, or an ADMIN of the assignment's season — but the
 * delete control renders only for the viewer's own comments and no staff screen
 * shows a thread at all, so the staff half of that rule has never been
 * exercisable (spec 14 R49/R52/R53). No LEADER, as v1 (forum-actions.ts:115-118,
 * R50; *v1 parity 2026-10-09: was "LEADER added"*). The post's own author is NOT admitted for someone else's comment:
 * owning a thread is not moderating it.
 */
export async function canDeleteForumComment(
  user: SessionUser,
  commentId: number,
): Promise<boolean> {
  const comment = await db.forumComment.findUnique({
    where: { id: commentId },
    select: {
      authorUserId: true,
      submission: {
        select: { studentUserId: true, assignment: { select: { seasonId: true } } },
      },
    },
  });
  if (!comment) return false;
  if (comment.authorUserId === user.userId) return true;
  if (isSuper(user)) return true;

  const seasonId = comment.submission.assignment.seasonId;
  // v1 parity 2026-10-09 (R50): no LEADER branch — author, SUPER or season
  // ADMIN only (jpc-space src/lib/forum-actions.ts:115-118). Edit permissions.ts:597-600.
  return isAdminOfSeason(user, seasonId);
}

/**
 * Whose posts this caller may read on a forum assignment.
 *
 * Students only, as v1 — v1 has no staff forum screen (R53). *(v1 parity
 * 2026-10-09: was "staff arm: SUPER/MENTOR/ADMIN all groups, LEADER their groups")*
 */
export type ForumAudience =
  | { kind: "student"; groupId: number | null }
  | { kind: "staff"; groupIds: number[] | null };

export async function forumAudienceFor(
  user: SessionUser,
  assignmentId: number,
): Promise<ForumAudience | null> {
  const assignment = await db.assignment.findFirst({
    where: { id: assignmentId, deletedAt: null, type: "FORUM" },
    select: { seasonId: true, isAllGroups: true, targets: { select: { groupId: true } } },
  });
  if (!assignment) return null;

  // v1 parity 2026-10-09 (R53/R57): no staff arm — v1's only forum screen is
  // the student's (jpc-space src/app/student/assignments/[id]/page.tsx:14,24).
  // Remove permissions.ts:625-635; the `staff` variant of ForumAudience and every
  // `audience.kind === "staff"` branch downstream (Tasks 6–7) go with it.
  if (user.role !== "STUDENT") return null;
  if (!(await hasActiveEnrollment(user, assignment.seasonId))) return null;
  // The targeting rule v1 enforced only by refusing to render the page (R15),
  // from the same helper the assignment reads use.
  const targeted = await studentCanSeeAssignment(
    user.userId,
    assignment.seasonId,
    assignment.isAllGroups,
    assignment.targets.map((t) => t.groupId),
  );
  if (!targeted) return null;
  return { kind: "student", groupId: await groupIdInSeason(user.userId, assignment.seasonId) };
}
```

Run the gates suite → PASS.

- [ ] **Step 6: Fixtures — the leak `cleanupTestData` cannot currently reach**

In `apps/backend/src/__tests__/integration/fixtures.ts`, add beside
`testSeasonCode`:

```ts
/**
 * JpcEvent has no code or email column, so the prefix lives in its title.
 *
 * This matters more than it looks: `JpcEvent.season` is `onDelete: SetNull`, so
 * deleting a test season does not remove its events — it nulls their `seasonId`
 * and leaves the rows behind in a database jpc-space is live against. Every
 * event fixture must go through this helper or `cleanupTestData` cannot find it.
 */
export function testEventTitle(label: string): string {
  return `${TEST_PREFIX}${label}-${randomUUID()}`;
}
```

and, inside `cleanupTestData`'s `if (seasonIds.length > 0)` block, **above** the
existing `db.attendance.deleteMany` line:

```ts
    // Video-quiz and forum rows cascade from Session and Submission, both of
    // which are deleted below — but three of these tables hold onDelete:
    // Restrict relations to User, so a row that survives its parent's delete
    // makes the user delete at the end of this function throw and strands test
    // fixtures in the shared database. Removing them explicitly first means the
    // cleanup never depends on cascade ordering being right.
    await db.sessionVideoQuestionResponse.deleteMany({
      where: { question: { session: inSeasons } },
    });
    await db.sessionVideoProgress.deleteMany({ where: { session: inSeasons } });
    await db.sessionVideoQuestion.deleteMany({ where: { session: inSeasons } });
    await db.forumComment.deleteMany({ where: { submission: { assignment: inSeasons } } });
```

and, at the **top** of the function (before the season lookup, because events
survive their season):

```ts
  await db.jpcEvent.deleteMany({ where: { title: { startsWith: TEST_PREFIX } } });
```

Re-run the gates suite → still PASS (it now also proves the cleanup does not
throw on the new deletes).

- [ ] **Step 7: Mobile query keys**

Append three factories inside `queryKeys` in
`apps/mobile/src/lib/query-keys.ts`, in the file's existing style:

```ts
  videoQuiz: {
    all: ["video-quiz"] as const,
    forSession: (sessionId: number) => [...queryKeys.videoQuiz.all, "student", sessionId] as const,
    questions: (sessionId: number) => [...queryKeys.videoQuiz.all, "admin", sessionId] as const,
    // v1 parity 2026-10-09 (R74): no `results` key — the results read is removed.
  },
  forum: {
    all: ["forum"] as const,
    thread: (assignmentId: number) => [...queryKeys.forum.all, "thread", assignmentId] as const,
    comments: (assignmentId: number, postPublicId: string) =>
      [...queryKeys.forum.all, "comments", assignmentId, postPublicId] as const,
  },
  events: {
    all: ["events"] as const,
    list: () => [...queryKeys.events.all, "list"] as const,
    // Plan 16's UpcomingEventsCard (spec 19 §7). Under `all`, so every event
    // write's prefix invalidation refreshes the dashboards too.
    upcoming: (limit: number) => [...queryKeys.events.all, "upcoming", limit] as const,
    detail: (id: number) => [...queryKeys.events.all, "detail", id] as const,
  },
```

- [ ] **Step 8: Verify and commit**

Run: `pnpm turbo lint typecheck test:unit --filter=@space/backend --filter=@space/mobile` → clean.
Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern plan10-gates` → PASS.

```bash
git add apps/backend apps/mobile && git commit -m "feat(backend): plan-14 permission gates, router mounts, event-safe fixtures"
```

---

## Stream A — Video quizzes (Tasks 3–5)

### Task 3: Video quiz — the student surface, with the gate that v1 never had

**Files:**
- Create: `apps/backend/src/lib/queries/video-quiz.ts`
- Modify: `apps/backend/src/routes/video-quiz.ts`
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: `apps/backend/src/__tests__/integration/video-quiz-routes.test.ts`

**Interfaces:**
- Consumes: `canManageSessionVideo`, `hasActiveEnrollment` (Task 2); `parseYouTubeId`, `studentVideoQuizSchema`'s shape, `submitVideoAnswerRequestSchema`, `videoProgressRequestSchema` (Task 1); `parseId`, `apiOk`/`apiError`.
- Produces:
  - `loadStudentVideoQuiz(sessionId, studentUserId): Promise<StudentVideoQuizData | null>` in `lib/queries/video-quiz.ts`, and the exported interfaces `StudentVideoQuizData`, `VideoQuizQuestionRow`
  - `GET /api/v1/sessions/:id/video-quiz`
  - `POST /api/v1/sessions/:id/video-quiz/answers`
  - `PUT /api/v1/sessions/:id/video-quiz/progress`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/backend/src/__tests__/integration/video-quiz-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let sessionId: number;
let q1: number;
let q2: number;
let q3: number;
let studentId: number;
let studentToken: string;
let droppedToken: string;
let adminToken: string;
let leaderToken: string;

async function resetAnswers(): Promise<void> {
  await db.sessionVideoQuestionResponse.deleteMany({ where: { question: { sessionId } } });
  await db.sessionVideoProgress.deleteMany({ where: { sessionId } });
}

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;

  const student = await createTestUser("vqstudent", "STUDENT");
  const droppedStudent = await createTestUser("vqdropped", "STUDENT");
  const admin = await createTestUser("vqadmin", "ADMIN");
  const leader = await createTestUser("vqleader", "LEADER");
  studentId = student.id;

  const group = await db.group.create({
    data: { seasonId, name: "Group A", leaders: { create: { userId: leader.id } } },
    select: { id: true },
  });
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: student.id, groupId: group.id, status: "ACTIVE" },
      { seasonId, studentUserId: droppedStudent.id, groupId: group.id, status: "WITHDRAWN" },
    ],
  });

  const session = await db.session.create({
    data: {
      seasonId,
      title: "space-v2-test-video-session",
      startsAt: new Date("2099-03-01T18:00:00.000Z"),
      durationMinutes: 90,
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    },
    select: { id: true },
  });
  sessionId = session.id;

  const created = await db.$transaction([
    db.sessionVideoQuestion.create({
      data: {
        sessionId,
        atSeconds: 30,
        prompt: "space-v2-test q1",
        options: ["a", "b"],
        correctIndex: 0,
        points: 2,
      },
      select: { id: true },
    }),
    db.sessionVideoQuestion.create({
      data: {
        sessionId,
        atSeconds: 60,
        prompt: "space-v2-test q2",
        options: ["a", "b", "c"],
        correctIndex: 2,
        points: 3,
      },
      select: { id: true },
    }),
    db.sessionVideoQuestion.create({
      data: {
        sessionId,
        atSeconds: 90,
        prompt: "space-v2-test q3",
        options: ["a", "b"],
        correctIndex: 1,
        points: 1,
      },
      select: { id: true },
    }),
  ]);
  q1 = created[0].id;
  q2 = created[1].id;
  q3 = created[2].id;

  studentToken = await login(app, student.email);
  droppedToken = await login(app, droppedStudent.email);
  adminToken = await login(app, admin.email);
  leaderToken = await login(app, leader.email);
});

beforeEach(resetAnswers);

afterAll(async () => {
  await cleanupTestData();
});

describe("GET /api/v1/sessions/:id/video-quiz", () => {
  it("never sends the answer key to a student", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/video-quiz`)
      .set("authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.questions).toHaveLength(3);
    // The whole point of the split. Assert on the serialised body, not on a
    // property read, so an undefined-but-present key still fails.
    expect(JSON.stringify(res.body)).not.toMatch(/correctIndex/);
    for (const q of res.body.data.questions) {
      expect(Object.keys(q).sort()).toEqual(
        ["answered", "atSeconds", "id", "isCorrect", "options", "points", "prompt", "selectedIndex"],
      );
    }
  });

  it("resolves the video id server-side so the client never parses a URL", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/video-quiz`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.body.data.videoId).toBe("dQw4w9WgXcQ");
  });

  it("names the next answerable question and totals the points", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/video-quiz`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.body.data.nextQuestionId).toBe(q1);
    expect(res.body.data.totalPoints).toBe(6);
    expect(res.body.data.earnedPoints).toBe(0);
    expect(res.body.data.answeredCount).toBe(0);
    expect(res.body.data.furthestSeconds).toBe(0);
    expect(res.body.data.completedAt).toBeNull();
  });

  it("refuses a student whose enrolment is not ACTIVE (spec 13 D9)", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/video-quiz`)
      .set("authorization", `Bearer ${droppedToken}`);
    expect(res.status).toBe(403);
  });

  it("refuses staff — this is the student view, and staff have the other one", async () => {
    for (const token of [adminToken, leaderToken]) {
      const res = await request(app)
        .get(`/api/v1/sessions/${sessionId}/video-quiz`)
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });

  it("404s an unknown session", async () => {
    const res = await request(app)
      .get("/api/v1/sessions/987654321/video-quiz")
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/sessions/:id/video-quiz/answers", () => {
  it("grades the first question and advances the barrier", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/video-quiz/answers`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ questionId: q1, selectedIndex: 0 });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      isCorrect: true,
      correctIndex: 0,
      furthestSeconds: 30,
      nextQuestionId: q2,
      completedAt: null,
    });
  });

  it("REFUSES an answer out of order — the gate v1 has only in the browser", async () => {
    // v1's barrier lives entirely in interactive-video-player.tsx; the action
    // never reads progress, never compares atSeconds and never checks order
    // (spec 13 R47). Behind an API that makes answering every question on a
    // session, having played no video at all, one scripted loop.
    const skip = await request(app)
      .post(`/api/v1/sessions/${sessionId}/video-quiz/answers`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ questionId: q3, selectedIndex: 1 });

    expect(skip.status).toBe(409);
    expect(skip.body.error.code).toBe("out_of_order");
    expect(await db.sessionVideoQuestionResponse.count({ where: { questionId: q3 } })).toBe(0);
  });

  it("replays a recorded answer instead of throwing on the unique constraint", async () => {
    // One answer per question, forever (v1 R54) — but v1 does not catch the
    // constraint violation, so a double tap surfaces a raw Prisma error
    // (spec 13 §10 D14). A double tap on a phone is far more likely than a
    // double click on a mouse.
    await request(app)
      .post(`/api/v1/sessions/${sessionId}/video-quiz/answers`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ questionId: q1, selectedIndex: 0 });

    const again = await request(app)
      .post(`/api/v1/sessions/${sessionId}/video-quiz/answers`)
      .set("authorization", `Bearer ${studentToken}`)
      // A different index: the recorded verdict must win, not this one.
      .send({ questionId: q1, selectedIndex: 1 });

    expect(again.status).toBe(200);
    expect(again.body.data.isCorrect).toBe(true);
    expect(await db.sessionVideoQuestionResponse.count({ where: { questionId: q1 } })).toBe(1);
  });

  it("derives completion when the last question is answered (spec 13 D3)", async () => {
    for (const [questionId, selectedIndex] of [
      [q1, 0],
      [q2, 2],
      [q3, 0],
    ] as const) {
      await request(app)
        .post(`/api/v1/sessions/${sessionId}/video-quiz/answers`)
        .set("authorization", `Bearer ${studentToken}`)
        .send({ questionId, selectedIndex });
    }

    const view = await request(app)
      .get(`/api/v1/sessions/${sessionId}/video-quiz`)
      .set("authorization", `Bearer ${studentToken}`);

    expect(view.body.data.completedAt).not.toBeNull();
    expect(view.body.data.nextQuestionId).toBeNull();
    expect(view.body.data.answeredCount).toBe(3);
    // q3 answered wrongly: 2 + 3 earned out of 6.
    expect(view.body.data.earnedPoints).toBe(5);
  });

  it("refuses an index outside the stored options", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/video-quiz/answers`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ questionId: q1, selectedIndex: 5 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_answer");
  });

  it("404s a question that belongs to another session", async () => {
    // v1 addresses questions by bare id, which is what lets an authenticated
    // caller tell an existing question from a missing one (spec 13 R52).
    const other = await db.session.create({
      data: {
        seasonId,
        title: "space-v2-test-other-session",
        startsAt: new Date("2099-04-01T18:00:00.000Z"),
        durationMinutes: 60,
      },
      select: { id: true },
    });
    const res = await request(app)
      .post(`/api/v1/sessions/${other.id}/video-quiz/answers`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ questionId: q1, selectedIndex: 0 });
    expect(res.status).toBe(404);
  });

  it("refuses a dropped student and any staff role", async () => {
    for (const token of [droppedToken, adminToken, leaderToken]) {
      const res = await request(app)
        .post(`/api/v1/sessions/${sessionId}/video-quiz/answers`)
        .set("authorization", `Bearer ${token}`)
        .send({ questionId: q1, selectedIndex: 0 });
      expect(res.status).toBe(403);
    }
  });
});

describe("PUT /api/v1/sessions/:id/video-quiz/progress", () => {
  it("moves furthestSeconds forward and never backward (spec 13 D4)", async () => {
    const up = await request(app)
      .put(`/api/v1/sessions/${sessionId}/video-quiz/progress`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ furthestSeconds: 45 });
    expect(up.status).toBe(200);
    expect(up.body.data.furthestSeconds).toBe(45);

    const down = await request(app)
      .put(`/api/v1/sessions/${sessionId}/video-quiz/progress`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ furthestSeconds: 10 });
    expect(down.body.data.furthestSeconds).toBe(45);
  });

  it("cannot be used to claim completion (spec 13 D3)", async () => {
    const res = await request(app)
      .put(`/api/v1/sessions/${sessionId}/video-quiz/progress`)
      .set("authorization", `Bearer ${studentToken}`)
      // v1's action took `completed` on trust: one call with (sessionId, 0,
      // true) marked a student complete (R48).
      .send({ furthestSeconds: 0, completed: true });

    expect(res.status).toBe(200);
    expect(res.body.data.completedAt).toBeNull();
    const row = await db.sessionVideoProgress.findUnique({
      where: { sessionId_studentUserId: { sessionId, studentUserId: studentId } },
      select: { completedAt: true },
    });
    expect(row?.completedAt ?? null).toBeNull();
  });

  it("is idempotent — the same value twice changes nothing", async () => {
    const first = await request(app)
      .put(`/api/v1/sessions/${sessionId}/video-quiz/progress`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ furthestSeconds: 20 });
    const second = await request(app)
      .put(`/api/v1/sessions/${sessionId}/video-quiz/progress`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ furthestSeconds: 20 });
    expect(second.body.data).toEqual(first.body.data);
  });
});
```

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern video-quiz-routes` → FAIL (404s).

- [ ] **Step 2: The query module**

```ts
// apps/backend/src/lib/queries/video-quiz.ts
import { parseYouTubeId } from "../../../../../packages/shared/src/index";
import { db } from "../../db/client";

export interface VideoQuizQuestionRow {
  id: number;
  atSeconds: number;
  prompt: string;
  options: string[];
  points: number;
  answered: boolean;
  selectedIndex: number | null;
  isCorrect: boolean | null;
}

export interface StudentVideoQuizData {
  seasonId: number;
  videoId: string | null;
  youtubeUrl: string | null;
  questions: VideoQuizQuestionRow[];
  furthestSeconds: number;
  completedAt: Date | null;
  earnedPoints: number;
  totalPoints: number;
  answeredCount: number;
  nextQuestionId: number | null;
}

/**
 * The student's view of a session's video quiz.
 *
 * The select list is the enforcement of the answer-key split: `correctIndex`
 * is not read here, so it cannot be forwarded by accident. v1's equivalent got
 * this right too (spec 13 R69) — what it lacked was any authorization, because
 * the only caller was a server component whose page had already checked
 * (R73). Behind an endpoint that gate has to exist, and it lives in the route.
 *
 * `nextQuestionId` is the barrier, derived once (ruling C4). v1 recomputed it
 * inside the player component and nowhere else, which is why the gate
 * evaporated the moment an API existed.
 */
export async function loadStudentVideoQuiz(
  sessionId: number,
  studentUserId: number,
): Promise<StudentVideoQuizData | null> {
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { seasonId: true, youtubeUrl: true },
  });
  if (!session) return null;

  const [questions, responses, progress] = await Promise.all([
    db.sessionVideoQuestion.findMany({
      where: { sessionId },
      // atSeconds is indexed but NOT unique — two questions may share a
      // timestamp (spec 13 R13), so id is the tiebreak that makes "the next
      // question" a single deterministic answer on the server and the client.
      orderBy: [{ atSeconds: "asc" }, { id: "asc" }],
      select: { id: true, atSeconds: true, prompt: true, options: true, points: true },
    }),
    db.sessionVideoQuestionResponse.findMany({
      where: { studentUserId, question: { sessionId } },
      select: { questionId: true, selectedIndex: true, isCorrect: true },
    }),
    db.sessionVideoProgress.findUnique({
      where: { sessionId_studentUserId: { sessionId, studentUserId } },
      select: { furthestSeconds: true, completedAt: true },
    }),
  ]);

  const byQuestion = new Map(responses.map((r) => [r.questionId, r]));
  let earnedPoints = 0;
  let totalPoints = 0;
  let nextQuestionId: number | null = null;

  const rows: VideoQuizQuestionRow[] = questions.map((q) => {
    totalPoints += q.points;
    const r = byQuestion.get(q.id);
    if (r?.isCorrect) earnedPoints += q.points;
    if (r === undefined && nextQuestionId === null) nextQuestionId = q.id;
    return {
      id: q.id,
      atSeconds: q.atSeconds,
      prompt: q.prompt,
      options: q.options,
      points: q.points,
      answered: r !== undefined,
      selectedIndex: r?.selectedIndex ?? null,
      isCorrect: r?.isCorrect ?? null,
    };
  });

  return {
    seasonId: session.seasonId,
    // Resolved once, here. v1 parsed the URL in the page and handed the id to
    // the player; a React Native client re-implementing that parser is how the
    // two drift (spec 13 §7).
    videoId: session.youtubeUrl ? parseYouTubeId(session.youtubeUrl) : null,
    youtubeUrl: session.youtubeUrl,
    questions: rows,
    furthestSeconds: progress?.furthestSeconds ?? 0,
    completedAt: progress?.completedAt ?? null,
    earnedPoints,
    totalPoints,
    answeredCount: responses.length,
    nextQuestionId,
  };
}
```

- [ ] **Step 3: The three student routes**

In `apps/backend/src/routes/video-quiz.ts`:

```ts
import type { Request, Response } from "express";

import { db } from "../db/client";
// A VALUE import, not `import type` — the P2002 branch below needs the
// PrismaClientKnownRequestError class at runtime. `routes/submissions.ts`
// imports the same symbol as a type; check how `db/client.ts` re-exports it and
// match the codebase's existing value-import pattern rather than inventing one.
import { Prisma } from "../generated/prisma/client";
import { apiError, apiOk } from "../lib/api-response";
import { parseId } from "../lib/parse-id";
// Task 4 adds canManageSessionVideo and staffScopeForSeason to this import.
import { hasActiveEnrollment } from "../lib/permissions";
import { loadStudentVideoQuiz } from "../lib/queries/video-quiz";
// requireAuth is passed to every route individually — this router shares the
// /api/v1 prefix (ruling X5).
import { requireAuth, requireUser } from "../middleware/require-auth";
import {
  submitVideoAnswerRequestSchema,
  videoProgressRequestSchema,
} from "../../../../packages/shared/src/index";

/**
 * The student gate, in one place: STUDENT role, session exists, ACTIVE
 * enrolment in its season. Returns the session's seasonId, or null after
 * having already answered the request.
 */
async function requireStudentOnSession(
  req: Request,
  res: Response,
  sessionId: number,
): Promise<{ seasonId: number } | null> {
  const user = requireUser(req);
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { seasonId: true },
  });
  if (!session) {
    apiError(res, "not_found", "Session not found.", 404);
    return null;
  }
  // Role first, then enrolment. v1 looked the question up before checking the
  // role, which let any authenticated caller tell an existing question id from
  // a missing one (spec 13 R52).
  if (!(await hasActiveEnrollment(user, session.seasonId))) {
    apiError(res, "forbidden", "You don't have access to this.", 403);
    return null;
  }
  return session;
}

videoQuizRouter.get("/sessions/:id/video-quiz", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const sessionId = parseId(req.params.id);
  if (sessionId === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  const gate = await requireStudentOnSession(req, res, sessionId);
  if (gate === null) return undefined;

  const data = await loadStudentVideoQuiz(sessionId, user.userId);
  if (data === null) return apiError(res, "not_found", "Session not found.", 404);

  return apiOk(res, {
    videoId: data.videoId,
    youtubeUrl: data.youtubeUrl,
    questions: data.questions,
    furthestSeconds: data.furthestSeconds,
    completedAt: data.completedAt,
    earnedPoints: data.earnedPoints,
    totalPoints: data.totalPoints,
    answeredCount: data.answeredCount,
    nextQuestionId: data.nextQuestionId,
  });
});
```

`POST /sessions/:id/video-quiz/answers` — registered as
`videoQuizRouter.post("/sessions/:id/video-quiz/answers", requireAuth, async (req, res) => { … })`
(per-route auth, ruling X5). The order of the checks *is* the behaviour, so
implement them in exactly this sequence:

1. `parseId`, then `requireStudentOnSession`.
2. Parse the body with `submitVideoAnswerRequestSchema`; 400 `bad_request`.
3. Load the question with
   `db.sessionVideoQuestion.findFirst({ where: { id: body.questionId, sessionId }, select: { id: true, atSeconds: true, options: true, correctIndex: true } })`.
   Missing → 404 `not_found`. **Scoping the lookup by `sessionId` is what makes
   a mismatched pair a 404 rather than a silent success** (spec 13 §7).
4. Range-check `selectedIndex` against `question.options.length` — from the row,
   never from the client (v1 R53). Out of range → 400 `invalid_answer`.
5. **Replay before ordering.** Look up the existing response; if present, return
   `{ isCorrect: existing.isCorrect, correctIndex: question.correctIndex, ... }`
   with the current progress. This must precede the ordering gate, or
   re-answering an earlier question would 409 instead of replaying.
6. **The ordering gate (D-13.2).** Load `loadStudentVideoQuiz(sessionId, userId)`
   and compare `data.nextQuestionId !== question.id` → 409 `out_of_order`,
   message `"Answer the earlier questions first."`.
7. Write, in one interactive transaction:

```ts
  const isCorrect = body.selectedIndex === question.correctIndex;
  const isLast = data.answeredCount + 1 === data.questions.length;

  let progress: { furthestSeconds: number; completedAt: Date | null };
  try {
    progress = await db.$transaction(async (tx) => {
      await tx.sessionVideoQuestionResponse.create({
        data: {
          questionId: question.id,
          studentUserId: user.userId,
          selectedIndex: body.selectedIndex,
          isCorrect,
        },
      });
      const current = await tx.sessionVideoProgress.findUnique({
        where: { sessionId_studentUserId: { sessionId, studentUserId: user.userId } },
        select: { furthestSeconds: true, completedAt: true },
      });
      // Math.max, never `{ set: ... }`. v1 wrote the question's atSeconds
      // absolutely (spec 13 R57), twenty lines above a comment promising
      // furthestSeconds "only ever moves forward" — unreachable through its own
      // UI because the barrier forced ascending order, trivially reachable
      // through an API.
      const furthestSeconds = Math.max(current?.furthestSeconds ?? 0, question.atSeconds);
      // Completion is derived here and asserted nowhere (spec 13 D3).
      const completedAt = current?.completedAt ?? (isLast ? new Date() : null);
      return tx.sessionVideoProgress.upsert({
        where: { sessionId_studentUserId: { sessionId, studentUserId: user.userId } },
        create: { sessionId, studentUserId: user.userId, furthestSeconds, completedAt },
        update: { furthestSeconds, completedAt },
        select: { furthestSeconds: true, completedAt: true },
      });
    });
  } catch (err) {
    // The unique index on (questionId, studentUserId) IS the "one answer, no
    // retries" rule. A double tap losing that race must read as the answer it
    // already recorded, not as a 500 (spec 13 §10 D14).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const recorded = await db.sessionVideoQuestionResponse.findUnique({
        where: {
          questionId_studentUserId: { questionId: question.id, studentUserId: user.userId },
        },
        select: { isCorrect: true },
      });
      const after = await loadStudentVideoQuiz(sessionId, user.userId);
      return apiOk(res, {
        isCorrect: recorded?.isCorrect ?? isCorrect,
        correctIndex: question.correctIndex,
        furthestSeconds: after?.furthestSeconds ?? 0,
        completedAt: after?.completedAt ?? null,
        nextQuestionId: after?.nextQuestionId ?? null,
      });
    }
    throw err;
  }
```

8. Respond with `{ isCorrect, correctIndex: question.correctIndex, furthestSeconds: progress.furthestSeconds, completedAt: progress.completedAt, nextQuestionId }`, recomputing `nextQuestionId` as the id after this one in the ordered list (or null when `isLast`). **`correctIndex` here is the only path by which the answer key reaches a student, and only for the question they just answered** — safe because the first answer is final.

`PUT /sessions/:id/video-quiz/progress`:

```ts
videoQuizRouter.put("/sessions/:id/video-quiz/progress", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const sessionId = parseId(req.params.id);
  if (sessionId === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  const gate = await requireStudentOnSession(req, res, sessionId);
  if (gate === null) return undefined;

  const parsed = videoProgressRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid progress.", 400);

  // PUT, not PATCH: the write is idempotent and monotone, so repeating it with
  // the same value is a no-op — which matters under React Query's
  // refetch-on-focus behaviour. Read-then-write inside a transaction, because
  // v1 did it outside one and two concurrent saves (visibilitychange and
  // unmount fire together) could persist the lower value (spec 13 R64).
  const progress = await db.$transaction(async (tx) => {
    const current = await tx.sessionVideoProgress.findUnique({
      where: { sessionId_studentUserId: { sessionId, studentUserId: user.userId } },
      select: { furthestSeconds: true, completedAt: true },
    });
    const furthestSeconds = Math.max(current?.furthestSeconds ?? 0, parsed.data.furthestSeconds);
    return tx.sessionVideoProgress.upsert({
      where: { sessionId_studentUserId: { sessionId, studentUserId: user.userId } },
      // completedAt is untouched on both branches. This endpoint cannot set it
      // and cannot clear it: the answer endpoint derives it (spec 13 D3), and
      // v1's client-asserted boolean does not exist on the contract at all.
      create: { sessionId, studentUserId: user.userId, furthestSeconds },
      update: { furthestSeconds },
      select: { furthestSeconds: true, completedAt: true },
    });
  });

  return apiOk(res, progress);
});
```

- [ ] **Step 4: Run the suite → PASS.** Then
`pnpm turbo lint typecheck test:unit --filter=@space/backend` → clean.

- [ ] **Step 5: OpenAPI, same commit.** Add the three paths and the
`StudentVideoQuiz`, `SubmitVideoAnswerRequest`, `SubmitVideoAnswerResponse` and
`VideoProgressRequest` schemas to `src/docs/openapi.ts` in the file's house
style. The prose must say three things a reader cannot infer: that
`correctIndex` is absent from the student payload by design and returned only
for a question just answered; that `out_of_order` (409) is the server-side
barrier and what it does and does not prove; and that `completed` is not an
accepted field.

- [ ] **Step 6: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): student video quiz with a server-side ordering gate and derived completion"
```

---

### Task 4: Video quiz — authoring, re-grading, and the results nobody could see

> **v1 parity 2026-10-09 (R74):** the results read is **not built**. v1 shows no student's video-quiz result to any admin surface — the editor shows only `{responseCount}` per question (`jpc-space/src/components/sessions/video-questions-editor.tsx:75`). Delete `GET /sessions/:id/video-quiz/results` and `loadVideoQuizResults` (`apps/backend/src/routes/video-quiz.ts:439-461` and its query), the results `describe` block in Step 1, Step 2, the results bullet in Step 3 and `VideoQuizResults` from Step 5's OpenAPI list.

**Files:**
- Modify: `apps/backend/src/routes/video-quiz.ts`
- Modify: `apps/backend/src/lib/queries/video-quiz.ts` (add `loadVideoQuizResults`)
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: extend `apps/backend/src/__tests__/integration/video-quiz-routes.test.ts`

**Interfaces:**
- Consumes: `canManageSessionVideo`, `staffScopeForSeason` (Task 2); `videoQuestionInputSchema` (Task 1); `loadStudentVideoQuiz` (Task 3).
- Produces:
  - `loadVideoQuizResults(sessionId, restrictToGroupIds?): Promise<VideoQuizResultsData | null>`
  - `GET /api/v1/sessions/:id/video-questions`
  - `POST /api/v1/sessions/:id/video-questions`
  - `PATCH /api/v1/video-questions/:questionId`
  - `DELETE /api/v1/video-questions/:questionId`
  - `GET /api/v1/sessions/:id/video-quiz/results`

- [ ] **Step 1: Write the failing tests** (append to the same suite; the
`beforeEach(resetAnswers)` already isolates them)

```ts
describe("video question authoring", () => {
  it("lists questions WITH the answer key for a season admin", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/video-questions`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.questions).toHaveLength(3);
    expect(res.body.data.questions[0]).toMatchObject({ correctIndex: 0, responseCount: 0 });
  });

  it("refuses the authoring list to a student, a leader and a mentor", async () => {
    // This is the read that carries correctIndex for every question. In v1 the
    // query authorizes nothing at all and the admin page is the only gate
    // (spec 13 R68/R73) — the exact protection that evaporates behind an API.
    for (const token of [studentToken, leaderToken]) {
      const res = await request(app)
        .get(`/api/v1/sessions/${sessionId}/video-questions`)
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });

  it("creates a question and refuses one whose correct index is out of range", async () => {
    const ok = await request(app)
      .post(`/api/v1/sessions/${sessionId}/video-questions`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        atSeconds: 120,
        prompt: "space-v2-test new question",
        options: ["a", "b"],
        correctIndex: 1,
        points: 4,
      });
    expect(ok.status).toBe(201);
    expect(ok.body.data.question).toMatchObject({ atSeconds: 120, points: 4, responseCount: 0 });

    const bad = await request(app)
      .post(`/api/v1/sessions/${sessionId}/video-questions`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        atSeconds: 120,
        prompt: "space-v2-test bad question",
        options: ["a", "b"],
        correctIndex: 2,
      });
    expect(bad.status).toBe(400);

    await db.sessionVideoQuestion.deleteMany({ where: { id: ok.body.data.question.id } });
  });

  it("refuses creation by a leader — authoring is ADMIN/SUPER only (v1 R1)", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/video-questions`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({
        atSeconds: 10,
        prompt: "space-v2-test nope",
        options: ["a", "b"],
        correctIndex: 0,
      });
    expect(res.status).toBe(403);
  });

  it("RE-GRADES existing answers when the key changes (spec 13 D5)", async () => {
    // v1 freezes isCorrect at answer time and the update touches only the
    // question row, so fixing a wrong answer key leaves every prior grade
    // wrong — silently, with responseCount displayed two lines away.
    await request(app)
      .post(`/api/v1/sessions/${sessionId}/video-quiz/answers`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ questionId: q1, selectedIndex: 1 }); // wrong under correctIndex 0

    const patched = await request(app)
      .patch(`/api/v1/video-questions/${q1}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        atSeconds: 30,
        prompt: "space-v2-test q1",
        options: ["a", "b"],
        correctIndex: 1, // the key was wrong; fix it
        points: 2,
      });

    expect(patched.status).toBe(200);
    expect(patched.body.data.regradedCount).toBe(1);

    const response = await db.sessionVideoQuestionResponse.findUnique({
      where: { questionId_studentUserId: { questionId: q1, studentUserId: studentId } },
      select: { isCorrect: true },
    });
    expect(response?.isCorrect).toBe(true);

    // Restore the fixture's key for the suite's other cases.
    await db.sessionVideoQuestion.update({ where: { id: q1 }, data: { correctIndex: 0 } });
  });

  it("reports zero re-grades when only the points change", async () => {
    await request(app)
      .post(`/api/v1/sessions/${sessionId}/video-quiz/answers`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ questionId: q1, selectedIndex: 0 });

    const res = await request(app)
      .patch(`/api/v1/video-questions/${q1}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        atSeconds: 30,
        prompt: "space-v2-test q1",
        options: ["a", "b"],
        correctIndex: 0,
        points: 7,
      });
    expect(res.body.data.regradedCount).toBe(0);
    // Points are not stored on a response, so every earned score moved anyway.
    expect(res.body.data.pointsChanged).toBe(true);

    await db.sessionVideoQuestion.update({ where: { id: q1 }, data: { points: 2 } });
  });

  it("reports how many recorded answers a delete destroys (spec 13 D6)", async () => {
    const doomed = await db.sessionVideoQuestion.create({
      data: {
        sessionId,
        atSeconds: 200,
        prompt: "space-v2-test doomed",
        options: ["a", "b"],
        correctIndex: 0,
      },
      select: { id: true },
    });
    await db.sessionVideoQuestionResponse.create({
      data: { questionId: doomed.id, studentUserId: studentId, selectedIndex: 0, isCorrect: true },
    });

    const res = await request(app)
      .delete(`/api/v1/video-questions/${doomed.id}`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // v1 destroys student work behind a static confirm string with no count.
    expect(res.body.data).toEqual({ deleted: true, responsesRemoved: 1 });
    expect(await db.sessionVideoQuestion.count({ where: { id: doomed.id } })).toBe(0);
  });

  it("404s an unknown question on PATCH and DELETE", async () => {
    for (const call of [
      request(app).patch("/api/v1/video-questions/987654321").send({
        atSeconds: 1,
        prompt: "space-v2-test",
        options: ["a", "b"],
        correctIndex: 0,
      }),
      request(app).delete("/api/v1/video-questions/987654321"),
    ]) {
      const res = await call.set("authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    }
  });
});

describe("GET /api/v1/sessions/:id/video-quiz/results", () => {
  it("gives an admin every student's score — a capability v1 has for nobody", async () => {
    await request(app)
      .post(`/api/v1/sessions/${sessionId}/video-quiz/answers`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ questionId: q1, selectedIndex: 0 });

    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/video-quiz/results`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.questionCount).toBe(3);
    expect(res.body.data.totalPoints).toBe(6);
    const row = res.body.data.rows.find(
      (r: { studentUserId: number }) => r.studentUserId === studentId,
    );
    // Every ACTIVE student appears, including those who have answered nothing.
    expect(row).toMatchObject({ answeredCount: 1, earnedPoints: 2, completedAt: null });
  });

  it("gives a leader only their own group's members", async () => {
    // An ACTIVE student in a group this leader does NOT lead. Without them the
    // assertion below would pass for an admin too (every row would be in-group
    // by construction), so the test could not tell a scoped read from a
    // season-wide one.
    const groupB = await db.group.create({
      data: { seasonId, name: "Group B" },
      select: { id: true },
    });
    const outsider = await createTestUser("vqoutsider", "STUDENT");
    await db.seasonEnrollment.create({
      data: { seasonId, studentUserId: outsider.id, groupId: groupB.id, status: "ACTIVE" },
    });

    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/video-quiz/results`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.rows.map((r: { studentUserId: number }) => r.studentUserId);
    expect(ids).toContain(studentId);
    expect(ids).not.toContain(outsider.id);

    // The control: the season admin does see the outsider.
    const asAdmin = await request(app)
      .get(`/api/v1/sessions/${sessionId}/video-quiz/results`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(
      asAdmin.body.data.rows.map((r: { studentUserId: number }) => r.studentUserId),
    ).toContain(outsider.id);
  });

  it("refuses a student outright", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/video-quiz/results`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });
});
```

Run the suite → the new cases FAIL.

- [ ] **Step 2: `loadVideoQuizResults`**

> **v1 parity 2026-10-09:** step removed (R74) — see the note under the Task 4 heading.

Append to `apps/backend/src/lib/queries/video-quiz.ts`:

```ts
export interface VideoQuizResultRowData {
  studentUserId: number;
  studentName: string | null;
  groupId: number | null;
  groupName: string | null;
  answeredCount: number;
  questionCount: number;
  earnedPoints: number;
  totalPoints: number;
  completedAt: Date | null;
}

export interface VideoQuizResultsData {
  questionCount: number;
  totalPoints: number;
  rows: VideoQuizResultRowData[];
}

/**
 * Who answered what on a session's video quiz.
 *
 * A new capability: v1 renders no student's video-quiz result anywhere, for any
 * role. The only aggregate it shows is `responseCount` per question, which
 * counts answers rather than correct ones and is not broken down by student
 * (spec 13 R74/R76). The data has always been there, one grouped query away.
 *
 * The population is `SeasonEnrollment`, not "whoever has a response row", so a
 * student who has answered nothing still appears — the same rule the assignment
 * tracker uses, and the reason a leader can see who has not started.
 * `restrictToGroupIds` narrows the roster for a leader; the rows carry names.
 */
export async function loadVideoQuizResults(
  sessionId: number,
  restrictToGroupIds?: number[],
): Promise<VideoQuizResultsData | null> {
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { seasonId: true },
  });
  if (!session) return null;

  const questions = await db.sessionVideoQuestion.findMany({
    where: { sessionId },
    select: { id: true, points: true },
  });
  const pointsByQuestion = new Map(questions.map((q) => [q.id, q.points]));
  const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);

  const enrollments = await db.seasonEnrollment.findMany({
    where: {
      seasonId: session.seasonId,
      status: "ACTIVE",
      ...(restrictToGroupIds ? { groupId: { in: restrictToGroupIds } } : {}),
    },
    select: {
      studentUserId: true,
      groupId: true,
      group: { select: { name: true } },
      studentUser: { select: { name: true } },
    },
  });
  const studentIds = enrollments.map((e) => e.studentUserId);

  const [responses, progress] = await Promise.all([
    db.sessionVideoQuestionResponse.findMany({
      where: { question: { sessionId }, studentUserId: { in: studentIds } },
      select: { studentUserId: true, questionId: true, isCorrect: true },
    }),
    db.sessionVideoProgress.findMany({
      where: { sessionId, studentUserId: { in: studentIds } },
      select: { studentUserId: true, completedAt: true },
    }),
  ]);

  const tally = new Map<number, { answered: number; earned: number }>();
  for (const r of responses) {
    const entry = tally.get(r.studentUserId) ?? { answered: 0, earned: 0 };
    entry.answered += 1;
    if (r.isCorrect) entry.earned += pointsByQuestion.get(r.questionId) ?? 0;
    tally.set(r.studentUserId, entry);
  }
  const completedBy = new Map(progress.map((p) => [p.studentUserId, p.completedAt]));

  return {
    questionCount: questions.length,
    totalPoints,
    rows: enrollments
      .map((e) => {
        const entry = tally.get(e.studentUserId) ?? { answered: 0, earned: 0 };
        return {
          studentUserId: e.studentUserId,
          studentName: e.studentUser.name,
          groupId: e.groupId,
          groupName: e.group?.name ?? null,
          answeredCount: entry.answered,
          questionCount: questions.length,
          earnedPoints: entry.earned,
          totalPoints,
          completedAt: completedBy.get(e.studentUserId) ?? null,
        };
      })
      .sort((a, b) => (a.studentName ?? "").localeCompare(b.studentName ?? "")),
  };
}
```

- [ ] **Step 3: The authoring routes**

Every handler below is registered with `requireAuth` as its first handler
(`videoQuizRouter.<verb>(path, requireAuth, async (req, res) => …)`, ruling X5);
the PATCH is written out in full as the pattern. All four authoring handlers
begin the same way: resolve the session (for the two session-scoped paths) or
the question's `sessionId` (for the two question-scoped ones), then
`canManageSessionVideo`. A shared local helper above the routes:

```ts
/** The admin row shape — the only place `correctIndex` may be selected. */
const ADMIN_SELECT = {
  id: true,
  atSeconds: true,
  prompt: true,
  options: true,
  correctIndex: true,
  points: true,
  _count: { select: { responses: true } },
} as const;

function toAdminRow(q: {
  id: number;
  atSeconds: number;
  prompt: string;
  options: string[];
  correctIndex: number;
  points: number;
  _count: { responses: number };
}) {
  return {
    id: q.id,
    atSeconds: q.atSeconds,
    prompt: q.prompt,
    options: q.options,
    correctIndex: q.correctIndex,
    points: q.points,
    responseCount: q._count.responses,
  };
}
```

- **`GET /sessions/:id/video-questions`** — `parseId`; 404 when the session is
  missing; `canManageSessionVideo` → 403; then `findMany` with `ADMIN_SELECT`,
  `orderBy: [{ atSeconds: "asc" }, { id: "asc" }]`, respond
  `{ questions: rows.map(toAdminRow) }`.
- **`POST /sessions/:id/video-questions`** — gate **before** parsing (v1 R2:
  an unauthorized caller gets a refusal, not a validation message); parse with
  `videoQuestionInputSchema` → 400 `bad_request`; `create` with
  `createdById: user.userId` (v1 stamps it on create only — there is no
  `updatedById` column and one cannot be added under C1, so the field means
  "who first authored this"); respond `{ question: toAdminRow(created) }`, 201.
  **Note deliberately not added:** no check that the session has a `youtubeUrl`,
  and no check of `atSeconds` against the video's length — v1 has neither
  (R14/R18) and the length is not stored and cannot be (C1). The client-side
  guard against the resulting deadlock is Task 5's job (spec 13 §10 D2).
- **`PATCH /video-questions/:questionId`** — the re-grade:

```ts
videoQuizRouter.patch("/video-questions/:questionId", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const questionId = parseId(req.params.questionId);
  if (questionId === null) return apiError(res, "bad_request", "Invalid question id.", 400);

  const existing = await db.sessionVideoQuestion.findUnique({
    where: { id: questionId },
    select: { id: true, sessionId: true, options: true, correctIndex: true, points: true },
  });
  if (!existing) return apiError(res, "not_found", "Question not found.", 404);
  if (!(await canManageSessionVideo(user, existing.sessionId))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const parsed = videoQuestionInputSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid question.", 400);
  const body = parsed.data;

  const keyChanged =
    body.correctIndex !== existing.correctIndex ||
    body.options.length !== existing.options.length ||
    body.options.some((o, i) => o !== existing.options[i]);

  // Re-grade in the same transaction as the edit (spec 13 §10 D5). v1 changes
  // the key and leaves every recorded verdict frozen at its old value, so a
  // corrected answer key leaves every prior grade wrong — and shrinking the
  // options can strand a selectedIndex that is now out of range (R8/R9).
  const { question, regradedCount } = await db.$transaction(async (tx) => {
    const updated = await tx.sessionVideoQuestion.update({
      where: { id: questionId },
      data: {
        atSeconds: body.atSeconds,
        prompt: body.prompt,
        options: body.options,
        correctIndex: body.correctIndex,
        points: body.points,
      },
      select: ADMIN_SELECT,
    });

    let regraded = 0;
    if (keyChanged) {
      const responses = await tx.sessionVideoQuestionResponse.findMany({
        where: { questionId },
        select: { id: true, selectedIndex: true, isCorrect: true },
      });
      for (const r of responses) {
        // An index the shrunken options no longer contain can never be right.
        const nowCorrect =
          r.selectedIndex < body.options.length && r.selectedIndex === body.correctIndex;
        if (nowCorrect !== r.isCorrect) {
          await tx.sessionVideoQuestionResponse.update({
            where: { id: r.id },
            data: { isCorrect: nowCorrect },
          });
          regraded += 1;
        }
      }
    }
    return { question: updated, regradedCount: regraded };
  });

  return apiOk(res, {
    question: toAdminRow(question),
    regradedCount,
    // Points are never stored on a response (there is no pointsAwarded column),
    // so nothing needs re-grading when they change — but every student's score
    // moved, and the admin should be told rather than left to notice.
    pointsChanged: body.points !== existing.points,
  });
});
```

- **`DELETE /video-questions/:questionId`** — same lookup and gate; count
  responses first; delete inside a transaction; respond
  `{ deleted: true, responsesRemoved }`. The database cascade removes the
  responses (`schema.prisma:416`); the count exists so the client can warn
  before and confirm after. **`SessionVideoProgress` is deliberately left
  alone** — v1 leaves it stale (R11) and there is no soft-delete column to do
  better with; note it in the OpenAPI description.
- ~~**`GET /sessions/:id/video-quiz/results`**~~ *(v1 parity 2026-10-09: removed, R74 — v1 has no results read)* — 404 on a missing session, then
  `staffScopeForSeason(user, session.seasonId)`; `null` → 403;
  `{ kind: "season" }` → `loadVideoQuizResults(sessionId)`;
  `{ kind: "groups", groupIds }` → `loadVideoQuizResults(sessionId, groupIds)`.
  Using the existing scope helper rather than a fresh role switch is what keeps
  a leader's roster identical here and on the attendance screen.

- [ ] **Step 4:** Run the suite → PASS; `pnpm turbo lint typecheck test:unit --filter=@space/backend` → clean.

- [ ] **Step 5: OpenAPI, same commit** — the five paths plus
`VideoQuestionInput`, `VideoQuestionAdmin` and `VideoQuizResults`. Say in prose
that this list carries the answer key and must never be requested by a student
screen, that `regradedCount` exists because an edit rewrites history, and that
`responsesRemoved` counts destroyed student work.

- [ ] **Step 6: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): video question authoring with transactional re-grade and a results read"
```

---

### Task 5: Video quiz — the player, the editor, and the results, on device

**Files:**
- Create: `apps/mobile/src/hooks/use-video-quiz.ts`
- Create: `apps/mobile/src/components/VideoQuizPlayer.tsx`
- Create: `apps/mobile/src/components/VideoQuestionsEditor.tsx`
- Modify: `apps/mobile/app/(app)/session/[id]/index.tsx` (Plan 4's screen as Plan 6 Task 7 replaced it — gains a video section)
- Modify: `apps/mobile/package.json` (two deps)
- Test: `apps/mobile/src/__tests__/video-quiz-screen.test.tsx`

**Interfaces:**
- Consumes: Plan 4's `useSessionDetail(id)` and the `session/[id]` route; `queryKeys.videoQuiz` (Task 2); `studentVideoQuizSchema`, `videoQuestionAdminSchema`, `videoQuizResultsSchema`, `createVideoQuestionResponseSchema`, `updateVideoQuestionResponseSchema`, `deleteVideoQuestionResponseSchema`, `formatTimestamp`, `parseTimestamp`, `MAX_VIDEO_SECONDS` (Task 1); Task 3/4's endpoints.
- Produces: `useStudentVideoQuiz(sessionId)`, `useSubmitVideoAnswer(sessionId)`, `useSaveVideoProgress(sessionId)`, `useVideoQuestions(sessionId, enabled)`, `useVideoQuestionWrites(sessionId)`, `useVideoQuizResults(sessionId, enabled)`; the components `<VideoQuizPlayer />` and `<VideoQuestionsEditor />`.

- [ ] **Step 1: Install the player and make Jest tolerate it**

```bash
cd apps/mobile && npx expo install react-native-webview && pnpm add react-native-youtube-iframe
```

**The dependency and its limits, recorded because they change the design**
(spec 13 §10 D11):
- `react-native-youtube-iframe` wraps the same YouTube IFrame API inside a
  `react-native-webview` and exposes `getCurrentTime`/`seekTo`/play/pause across
  the bridge. Closest to v1's semantics of the four options; a native SDK does
  not exist (Android's is long deprecated, there is no first-party iOS one) and
  `Linking.openURL` into the YouTube app deletes the feature.
- **`getCurrentTime()` returns a Promise.** v1 polls a synchronous call every
  250 ms with a 0.1 s tolerance; across the bridge that tolerance is far too
  tight. This screen polls every 400 ms with a **0.75 s** tolerance and accepts
  a visible snap-back on overshoot.
- **A webview needs a dev-client build.** This screen cannot be exercised in
  Expo Go; the device checklist in Task 11 assumes `expo run:ios`/`run:android`.
- **The gate weakens on mobile regardless** — an embedded player still offers a
  route into the YouTube app, where nothing is gated. That is the second
  argument for the server-side ordering rule (D-13.2) and the reason the client
  barrier is a courtesy, not a control.

**No `jest.config.js` change.** The existing `transformIgnorePatterns` entry
`(jest-)?react-native` is an unanchored prefix inside the negative lookahead, so
`react-native-youtube-iframe` and `react-native-webview` are already
transformed. The player is mocked in the test (Step 2) as a component exposing
the three imperative methods the screen calls.

- [ ] **Step 2: Write the failing test**

```tsx
// apps/mobile/src/__tests__/video-quiz-screen.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "12" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
// The session screen statically imports Plan 11's StudentCheckInCard → QrScanner
// → expo-camera (a native module). Plan 11's stand-in, as every suite that
// renders session/[id] uses it.
jest.mock("expo-camera", () => require("./helpers/expo-camera"));
// A component, not a string: the player calls seekTo/getDuration/getCurrentTime
// through its ref, and a host-string mock has none of them.
jest.mock("react-native-youtube-iframe", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const MockPlayer = React.forwardRef<object, object>((_props, ref) => {
    React.useImperativeHandle(ref, () => ({
      getCurrentTime: () => Promise.resolve(0),
      getDuration: () => Promise.resolve(600),
      seekTo: () => undefined,
    }));
    return null;
  });
  return { __esModule: true, default: MockPlayer };
});

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { VideoQuizPlayer } from "../components/VideoQuizPlayer";
import { renderWithProviders } from "./helpers/render";

import SessionDetailScreen from "../../app/(app)/session/[id]/index";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const sessionDetail = {
  id: 12,
  title: "Week three",
  description: null,
  startsAt: "2099-03-01T18:00:00.000Z",
  // Plan 6's sessionDetailSchema fields (X13): the org day and wall time.
  dayKey: "2099-03-01",
  startTime: "20:00",
  durationMinutes: 90,
  location: null,
  youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  recurrenceGroupId: null,
  seasonId: 7,
  seasonCode: "S26",
  seasonTitle: "Spring 2026",
  checkInOpen: false,
  myAttendance: null,
  canMarkAttendance: false,
  canManageCheckIn: false, // Plan 4's flag — sessionDetailSchema requires it
};

const question = (id: number, atSeconds: number, answered = false) => ({
  id,
  atSeconds,
  prompt: `Question ${id}`,
  options: ["alpha", "beta"],
  points: 1,
  answered,
  selectedIndex: answered ? 0 : null,
  isCorrect: answered ? true : null,
});

const quiz = {
  videoId: "dQw4w9WgXcQ",
  youtubeUrl: sessionDetail.youtubeUrl,
  questions: [question(1, 30), question(2, 60)],
  furthestSeconds: 0,
  completedAt: null,
  earnedPoints: 0,
  totalPoints: 2,
  answeredCount: 0,
  nextQuestionId: 1,
};

const studentSession = {
  user: { id: 9, name: "S", email: "s@jpc.test", role: "STUDENT" as const, avatarPath: null, hasPassword: true },
  scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: 7, graduationYear: null },
};

const adminSession = {
  user: { id: 2, name: "A", email: "a@jpc.test", role: "ADMIN" as const, avatarPath: null, hasPassword: true },
  scopes: { seasonAdminIds: [7], groupLeaderIds: [], activeSeasonId: null, graduationYear: null },
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("student video quiz", () => {
  beforeEach(() => {
    useSessionStore.setState(studentSession);
  });

  it("renders the player and the score, and never requests the authoring list", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/sessions/12"
        ? Promise.resolve({ data: { data: sessionDetail } })
        : Promise.resolve({ data: { data: quiz } }),
    );

    renderWithProviders(<SessionDetailScreen />);

    expect(await screen.findByText("0 / 2 points")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/sessions/12/video-quiz");
    // The authoring read carries correctIndex for every question. A student
    // screen must never issue it, whatever the server would answer.
    expect(get).not.toHaveBeenCalledWith("/api/v1/sessions/12/video-questions");
  });

  it("opens the question modal at the barrier and posts the answer", async () => {
    // Rendered directly with an injected clock: a webview reports no playhead
    // under Jest. The clock reads 31 s, past question 1's barrier (30 s), so
    // the component's ordinary 400 ms poll opens the real modal on its own —
    // no test-only branch, and the barrier logic under test is the shipped one.
    post.mockResolvedValue({
      data: {
        data: {
          isCorrect: true,
          correctIndex: 0,
          furthestSeconds: 30,
          completedAt: null,
          nextQuestionId: 2,
        },
      },
    });

    renderWithProviders(
      <VideoQuizPlayer sessionId={12} quiz={quiz} readCurrentTime={async () => 31} />,
    );

    // The modal opens by itself; the test only waits for the prompt.
    expect(await screen.findByText("Question 1", {}, { timeout: 3000 })).toBeTruthy();
    fireEvent.press(screen.getByText("alpha"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/sessions/12/video-quiz/answers", {
        questionId: 1,
        selectedIndex: 0,
      }),
    );
    expect(await screen.findByText("Correct")).toBeTruthy();
  });

  it("falls back to a link when the URL does not resolve to a video", async () => {
    // v1 parity 2026-10-09 (jpc-space src/app/student/sessions/[id]/page.tsx:47-49,76-90):
    // only a "Watch recording" button to the raw URL, no title, no message (R37).
    get.mockImplementation((url: string) =>
      url === "/api/v1/sessions/12"
        ? Promise.resolve({ data: { data: { ...sessionDetail, youtubeUrl: "https://x.test/v" } } })
        : Promise.resolve({
            data: { data: { ...quiz, videoId: null, youtubeUrl: "https://x.test/v" } },
          }),
    );

    renderWithProviders(<SessionDetailScreen />);

    expect(await screen.findByText("Watch recording")).toBeTruthy();
    expect(screen.queryByText("Video unavailable")).toBeNull();
    expect(
      screen.queryByText("This session's video link can't be played in the app."),
    ).toBeNull();
  });

  it("shows a completed quiz without a barrier", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/sessions/12"
        ? Promise.resolve({ data: { data: sessionDetail } })
        : Promise.resolve({
            data: {
              data: {
                ...quiz,
                questions: [question(1, 30, true), question(2, 60, true)],
                answeredCount: 2,
                earnedPoints: 2,
                completedAt: "2099-03-02T10:00:00.000Z",
                nextQuestionId: null,
              },
            },
          }),
    );

    renderWithProviders(<SessionDetailScreen />);
    expect(await screen.findByText("2 / 2 points")).toBeTruthy();
    expect(screen.getByText("Quiz complete")).toBeTruthy();
  });
});

describe("admin video question editor", () => {
  beforeEach(() => {
    useSessionStore.setState(adminSession);
  });

  it("lists questions with their answer and creates a new one from a timestamp", async () => {
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/sessions/12") return Promise.resolve({ data: { data: sessionDetail } });
      if (url === "/api/v1/sessions/12/video-questions") {
        return Promise.resolve({
          data: {
            data: {
              questions: [
                {
                  id: 1,
                  atSeconds: 90,
                  prompt: "Question 1",
                  options: ["alpha", "beta"],
                  correctIndex: 1,
                  points: 1,
                  responseCount: 4,
                },
              ],
            },
          },
        });
      }
      return Promise.resolve({ data: { data: { questionCount: 1, totalPoints: 1, rows: [] } } });
    });
    post.mockResolvedValue({ data: { data: { question: { id: 2 } } } });

    renderWithProviders(<SessionDetailScreen />);

    // The timestamp round-trips through the shared formatter.
    expect(await screen.findByText("1:30")).toBeTruthy();
    expect(screen.getByText("4 answers recorded")).toBeTruthy();
    // Answer key visible to the admin — the other half of the split.
    expect(screen.getByText("Correct answer: beta")).toBeTruthy();

    fireEvent.press(screen.getByText("Add question"));
    fireEvent.changeText(screen.getByLabelText("Timestamp"), "2:00");
    fireEvent.changeText(screen.getByLabelText("Question"), "New prompt");
    fireEvent.changeText(screen.getByLabelText("Option 1"), "one");
    fireEvent.changeText(screen.getByLabelText("Option 2"), "two");
    fireEvent.press(screen.getByText("Save question"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/sessions/12/video-questions", {
        atSeconds: 120,
        prompt: "New prompt",
        options: ["one", "two"],
        correctIndex: 0,
        points: 1,
      }),
    );
  });

  it("refuses a timestamp the parser rejects, before any request", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/sessions/12"
        ? Promise.resolve({ data: { data: sessionDetail } })
        : Promise.resolve({ data: { data: { questions: [] } } }),
    );

    renderWithProviders(<SessionDetailScreen />);
    fireEvent.press(await screen.findByText("Add question"));
    // "1:60" — the trailing <60 rule v1 kept. (":30" is 30 seconds, as in v1 —
    // v1 parity 2026-10-09, jpc-space src/lib/video-time.ts:21-30.)
    fireEvent.changeText(screen.getByLabelText("Timestamp"), "1:60");
    fireEvent.changeText(screen.getByLabelText("Question"), "New prompt");
    fireEvent.changeText(screen.getByLabelText("Option 1"), "one");
    fireEvent.changeText(screen.getByLabelText("Option 2"), "two");
    fireEvent.press(screen.getByText("Save question"));

    await waitFor(() => expect(post).not.toHaveBeenCalled());
    expect(screen.getByLabelText("Timestamp").props.accessibilityHint).toContain("m:ss");
  });
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/video-quiz-screen.test.tsx` → FAIL.

- [ ] **Step 3: The hooks**

```ts
// apps/mobile/src/hooks/use-video-quiz.ts
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";
import {
  createVideoQuestionResponseSchema,
  deleteVideoQuestionResponseSchema,
  studentVideoQuizSchema,
  submitVideoAnswerResponseSchema,
  updateVideoQuestionResponseSchema,
  videoProgressResponseSchema,
  videoQuestionAdminSchema,
  videoQuizResultsSchema,
  type StudentVideoQuiz,
  type VideoQuestionAdmin,
  type VideoQuestionInput,
  type VideoQuizResults,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

const adminListSchema = z.array(videoQuestionAdminSchema);

export function useStudentVideoQuiz(
  sessionId: number | null,
  enabled: boolean,
): UseQueryResult<StudentVideoQuiz> {
  return useQuery({
    queryKey: queryKeys.videoQuiz.forSession(sessionId ?? -1),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/sessions/${sessionId}/video-quiz`);
      // Parsing against the .strict() student schema is the client half of the
      // answer-key split: a backend that starts sending correctIndex fails
      // here rather than rendering the answer to the open question.
      return studentVideoQuizSchema.parse(res.data.data);
    },
    enabled: enabled && sessionId !== null,
  });
}

export function useSubmitVideoAnswer(sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { questionId: number; selectedIndex: number }) => {
      const res = await apiClient.post(`/api/v1/sessions/${sessionId}/video-quiz/answers`, input);
      return submitVideoAnswerResponseSchema.parse(res.data.data);
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.videoQuiz.forSession(sessionId) }),
  });
}

/**
 * Progress is fire-and-forget on purpose: it is advisory (the server derives
 * completion and gates ordering on the answer set, not on this value), so a
 * failed save must never interrupt playback. No invalidation either — the value
 * this screen holds is always at least as fresh as the server's.
 */
export function useSaveVideoProgress(sessionId: number) {
  return useMutation({
    mutationFn: async (furthestSeconds: number) => {
      const res = await apiClient.put(`/api/v1/sessions/${sessionId}/video-quiz/progress`, {
        furthestSeconds,
      });
      return videoProgressResponseSchema.parse(res.data.data);
    },
  });
}

export function useVideoQuestions(
  sessionId: number | null,
  enabled: boolean,
): UseQueryResult<VideoQuestionAdmin[]> {
  return useQuery({
    queryKey: queryKeys.videoQuiz.questions(sessionId ?? -1),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/sessions/${sessionId}/video-questions`);
      return adminListSchema.parse(res.data.data.questions);
    },
    // `enabled` is the gate that keeps a student screen from ever issuing the
    // read that carries the answer key. Never call this hook unconditionally.
    enabled: enabled && sessionId !== null,
  });
}

export function useVideoQuestionWrites(sessionId: number) {
  const queryClient = useQueryClient();
  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.videoQuiz.all });
  };

  const create = useMutation({
    mutationFn: async (input: VideoQuestionInput) => {
      const res = await apiClient.post(`/api/v1/sessions/${sessionId}/video-questions`, input);
      return createVideoQuestionResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async (vars: { questionId: number; input: VideoQuestionInput }) => {
      const res = await apiClient.patch(`/api/v1/video-questions/${vars.questionId}`, vars.input);
      return updateVideoQuestionResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (questionId: number) => {
      const res = await apiClient.delete(`/api/v1/video-questions/${questionId}`);
      return deleteVideoQuestionResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });

  return { create, update, remove };
}

export function useVideoQuizResults(
  sessionId: number | null,
  enabled: boolean,
): UseQueryResult<VideoQuizResults> {
  return useQuery({
    queryKey: queryKeys.videoQuiz.results(sessionId ?? -1),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/sessions/${sessionId}/video-quiz/results`);
      return videoQuizResultsSchema.parse(res.data.data);
    },
    enabled: enabled && sessionId !== null,
  });
}
```

- [ ] **Step 4: `VideoQuizPlayer`**

`apps/mobile/src/components/VideoQuizPlayer.tsx` — props
`{ sessionId: number; quiz: StudentVideoQuiz }`. Behaviour, in full:

1. **No video id → only a link, as v1.** Render only a `Button`
   "Watch recording" calling `Linking.openURL(quiz.youtubeUrl)` when it is
   non-null — no title, no message (v1 `jpc-space/src/app/student/sessions/[id]/page.tsx:47-49,76-90`, R37).
   Edit `VideoQuizPlayer.tsx:39-51,210-212`. *(v1 parity 2026-10-09: was "EmptyState 'Video unavailable' with message and 'Watch on YouTube' button")*
2. **The player.** `<YoutubePlayer height={220} videoId={quiz.videoId} play={playing}
   initialPlayerParams={{ controls: false, modestbranding: true, rel: false, preventFullScreen: true }}
   onChangeState={...} onError={...} onReady={...} ref={playerRef} />`.
   *(v1 parity 2026-10-09: the load-error / timeout fallback below (R81, kept) may
   keep its "Video unavailable" message and button; only the no-id / no-questions
   case of (1) is v1's bare link.)*
   Native controls are suppressed for the same reason v1 suppresses them: the
   custom bar is the only scrub affordance, so the client-side barrier holds for
   an ordinary user. `onError` sets an error flag that renders the same fallback
   as (1) — v1 registers no error handler at all and shows a permanently black
   box (R81), which on a phone with intermittent connectivity is the common
   case. A 15-second load timeout does the same.
3. **The barrier comes from the server.** `const barrier = quiz.questions.find((q) => q.id === quiz.nextQuestionId)?.atSeconds ?? Number.POSITIVE_INFINITY;`
   Never recomputed from the answered set — `nextQuestionId` is the derivation
   (ruling C4), and it is the same value the server will accept an answer for.
4. **The poll.** `setInterval(async () => { const t = await playerRef.current?.getCurrentTime() ?? 0; ... }, 400)`,
   short-circuited while a question is open so modals cannot stack. When
   `t >= barrier - 0.75`: pause, `seekTo(barrier, true)`, open the modal.
   The 0.75 s tolerance replaces v1's 0.1 s because `getCurrentTime` is a
   promise across the webview bridge — v1's value is only defensible for a
   synchronous call.
5. **The seek bar.** A `Pressable` track with a filled portion and a
   `minHeight: 44` touch target (the 44 px rule from `jpc-space/CLAUDE.md`),
   converting an x-offset to a time and clamping forward seeks to the barrier.
   Backwards seeking is unrestricted, exactly as in v1.
6. **The modal.** `<Modal visible transparent animationType="slide"
   onRequestClose={handleLeave}>` with the prompt, one `Button` per option, and
   feedback after the answer resolves ("Correct" / "Not quite — the answer was
   X" from the mutation's `correctIndex`), then "Continue" which closes and
   resumes. `onRequestClose` is the **Android hardware back button**; leaving it
   undefined dismisses the modal and deletes the gate (spec 13 §10 D15). It is
   wired to an explicit `handleLeave` that pauses playback and navigates back
   rather than silently dismissing — v1's only exit is leaving the page, and a
   phone offers two gestures that do it by accident. Also render a visible
   "Leave the quiz" text button so the exit is discoverable rather than a
   gesture the student has to guess.
7. **The deadlock guard** (spec 13 §10 D2). On `onReady`, read
   `getDuration()`; if `barrier > duration + 1`, do not poll — render an
   `ErrorState` reading
   `"A question on this video is set past the end of the recording. Ask your leader to fix it."`
   with `onRetry` wired to the query's `refetch`. v1 hides this case entirely:
   `lockedFraction` falls back to 1 and the badge is suppressed, so the student
   sees an ordinary player that simply never completes (R78/R79). The duration
   is **not** sent to the server — storing it is a schema change (C1).
8. **Progress saves.** On pause (and ended), on `AppState` leaving `"active"`
   (v1's `visibilitychange`), and on unmount, call
   `useSaveVideoProgress(sessionId).mutate(Math.floor(furthestRef.current))` —
   and nowhere else, as v1 (`jpc-space/src/components/sessions/interactive-video-player.tsx:154,163,198`, R49).
   No interval: remove `PROGRESS_SAVE_MS` and the playing-interval effect
   (`VideoQuizPlayer.tsx:19,129-135`). *(v1 parity 2026-10-09: was "plus a 15-second save interval while playing")*
9. **The score card.** `{earnedPoints} / {totalPoints} points`, the answered
   count, and — when `completedAt` is non-null — a "Quiz complete" line.
10. **The clock is injectable, and that is the only test seam.**
    `VideoQuizPlayer` takes an optional prop
    `readCurrentTime?: () => Promise<number>`, defaulting to
    `() => playerRef.current?.getCurrentTime() ?? Promise.resolve(0)`. A webview
    reports no playhead under Jest, so the test passes `async () => 31` and the
    ordinary poll opens the real modal on its own tick — no test-only branch in
    the component, and the barrier logic under test is the shipped one (Step 2's
    barrier case renders the component directly for this reason). The poll
    starts on mount; the deadlock guard (7) stops it only once `getDuration()`
    has answered, so a player that never fires `onReady` still gates.
    Export the component as a named export, `export function VideoQuizPlayer`.

- [ ] **Step 5: `VideoQuestionsEditor`**

> **v1 parity 2026-10-09 (R74):** drop `useVideoQuizResults` (Step 3 hook), `videoQuizResultsSchema`/`VideoQuizResults` imports, the results table below and `canSeeResults` in Step 6 — leaders see nothing; the editor shows only `{responseCount} answers recorded` per question (v1 `video-questions-editor.tsx:75`).

`apps/mobile/src/components/VideoQuestionsEditor.tsx` — props
`{ sessionId: number }`. Renders `useVideoQuestions(sessionId, true)` as `Card`
rows: `formatTimestamp(atSeconds)`, the prompt, `Correct answer: {options[correctIndex]}`,
`{responseCount} answers recorded`, and Edit / Delete buttons. Below the list, a
collapsible form opened by "Add question": `Input` labelled **Timestamp**
(free text), **Question**, **Option 1**…**Option N** (start at 2, "Add option"
up to 6), a correct-answer selector over the current options, and **Points**.

Three rules the form owns:
- **Parse the timestamp client-side with the shared `parseTimestamp`** before
  submitting. `null` → set the field's `accessibilityHint` to
  `"Use m:ss or h:mm:ss (for example 2:30)."` and **do not call the mutation**.
  v1 sends the value, the action rejects it with the constant
  "Please fix the highlighted fields.", and the editor discards `fieldErrors`
  entirely — so the admin is told to fix highlighted fields and nothing is
  highlighted (R28). The check belongs where the input is.
  *(v1 parity 2026-10-09, R27: `parseTimestamp` no longer bounds the value, so a
  value over 86,400 passes this check and is rejected by the server's
  `videoQuestionInputSchema` `atSeconds` max — surface that 400 on the Timestamp
  field's `accessibilityHint` rather than dropping it. v1: `src/lib/video-quiz-actions.ts:17`.)*
- **Delete confirms with the real count.** First press flips the button title to
  `"Delete {responseCount} answers?"` (RN has no `window.confirm`, and the
  two-press pattern is what Plan 4 established); the second press calls the
  mutation and surfaces `responsesRemoved` in a status line.
- **Report the re-grade.** After an update, show
  `"{regradedCount} recorded answers were re-graded."` when non-zero, and
  `"Points changed — every student's score for this question moved."` when
  `pointsChanged`. v1 tells the admin neither.

~~Also render `useVideoQuizResults(sessionId, true)` beneath the editor as a
results table.~~ No results table: v1 shows no student's result to anybody
(`jpc-space/src/components/sessions/video-questions-editor.tsx:75`). *(v1 parity 2026-10-09: was "per-student results table beneath the editor")*

- [ ] **Step 6: Wire both into `session/[id]/index.tsx`**

The file is **Plan 6 Task 7's** replacement of Plan 4's screen (header from
`dayKey`/`startTime`, check-in console with Regenerate, "Edit session", the
session-quiz card, Plan 4's leader roster), plus **Plan 11 Task 10's** student
`StudentCheckInCard` branch. Keep all of it. Below the
session-quiz card, add one section, driven by role and by the session's
`youtubeUrl`:

```tsx
  const isStudent = user?.role === "STUDENT";
  // Mirrors canManageSessionVideo exactly: SUPER, or an ADMIN of this season.
  // NOT `canMarkAttendance` — that flag admits a group LEADER, who may not
  // author questions, and is false on a session an admin has not opened
  // check-in for. The server enforces the gate regardless; this only decides
  // whether the editor (and its answer-key read) is ever mounted.
  const canAuthorVideo =
    user?.role === "SUPER" ||
    (user?.role === "ADMIN" && (scopes?.seasonAdminIds ?? []).includes(detail.seasonId));
  // Results: authors, plus a LEADER (the server narrows a leader to their groups).
  const canSeeResults = canAuthorVideo || user?.role === "LEADER";
  const quiz = useStudentVideoQuiz(sessionId, isStudent && detail.youtubeUrl !== null);
```

- STUDENT with a `youtubeUrl`: `LoadingState` / `ErrorState` (with `onRetry`
  wired to `quiz.refetch`) / `<VideoQuizPlayer sessionId={sessionId} quiz={quiz.data} />`.
  When the quiz loads but `questions.length === 0`, render only a
  "Watch recording" button opening `session.youtubeUrl` and no player — no
  title, no message, exactly v1's `hasInteractiveVideo` branch (R38; v1
  `jpc-space/src/app/student/sessions/[id]/page.tsx:47-49,76-90`). *(v1 parity 2026-10-09: was "plain 'Watch on YouTube' button, minus the silence")*
- `canAuthorVideo` (SUPER, or ADMIN of the session's season):
  `<VideoQuestionsEditor sessionId={sessionId} />`. A LEADER gets nothing here
  and never `useVideoQuestions`, whose payload carries the answer key; drop
  `canSeeResults` from the block above. `user` and `scopes` come from
  `useSessionStore`. *(v1 parity 2026-10-09: was "editor renders results table; LEADER sees results table only")*
- No `youtubeUrl` at all: render nothing. Do not offer to author questions
  against a session with no video — v1 does exactly that and lets an admin
  build a full quiz that no student can ever reach (R17).

- [ ] **Step 7:** Run the suite → PASS. `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean. `pnpm turbo routes:generate --filter=@space/mobile` is **not** needed — no route file was added.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): interactive video quiz player, question editor and results"
```

---

## Stream B — Forum (Tasks 6–8)

### Task 6: Forum — the thread read and the upsert that creates the row

**Files:**
- Create: `apps/backend/src/lib/queries/forum.ts`
- Modify: `apps/backend/src/routes/forum.ts`
- Modify: `apps/backend/src/routes/submissions.ts` (refuse FORUM on the two generic writers — Step 4b)
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: `apps/backend/src/__tests__/integration/forum-routes.test.ts`

**Interfaces:**
- Consumes: `forumAudienceFor`, `ForumAudience`, `groupIdInSeason` (Task 2); `countWords`, `submitForumResponseRequestSchema`, `forumFeedQuerySchema` (Task 1); `plainTextToHtml`, `htmlToPlainText` (Plan 12's `packages/shared/src/html-text.ts`, ruling X3 — imported from the shared index by relative path, X12); `newPublicId`.
- Produces:
  - `loadForumAssignment(assignmentId): Promise<ForumAssignmentRow | null>` in `lib/queries/forum.ts` — the one "is this a live FORUM assignment" lookup; every forum route calls it **before** any audience check, so missing / deleted / non-FORUM is always 404
  - `loadForumView(assignmentId, user, audience, query): Promise<ForumViewData | null>` and `ForumViewData` in `lib/queries/forum.ts`
  - `displayNameFor(name: string | null): string` (exported from the same module — the one place the no-email rule is applied)
  - `GET /api/v1/assignments/:id/forum`
  - `PUT /api/v1/assignments/:id/forum/response`
  - `409 use_forum_endpoint` from `PUT /api/v1/submissions/by-assignment/:assignmentId` and `PATCH /api/v1/submissions/:publicId` for a FORUM assignment

**Status-code rule for the whole forum surface (decided here, applied in Tasks 6
and 7):** the assignment is resolved first — missing, soft-deleted or not
`FORUM` → **404 `not_found`** for every caller; only then does the audience gate
run → **403 `forbidden`**. An earlier draft let `forumAudienceFor` (which also
returns null for a non-FORUM id) answer first, so the handler said 403 while the
test said 404. The assignment's *type* is not secret — Plan 1's assignment
detail already returns it to anyone targeted — so ordering existence before
audience leaks nothing.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/backend/src/__tests__/integration/forum-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { newPublicId } from "../../lib/public-id";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

// Every string below is invented. Nothing a real student wrote is reproduced
// anywhere in this repository.
const OWN_TEXT = "space-v2-test response one two three four five six";

let seasonId: number;
let assignmentId: number;
let untargetedAssignmentId: number;
let groupAId: number;
let groupBId: number;
let studentAId: number;
let studentA2Id: number;
let studentAToken: string;
let studentA2Token: string;
let studentBToken: string;
let leaderAToken: string;
let leaderBToken: string;
let adminToken: string;
let mentorToken: string;

async function resetSubmissions(): Promise<void> {
  await db.forumComment.deleteMany({ where: { submission: { assignment: { seasonId } } } });
  await db.submission.deleteMany({ where: { assignment: { seasonId } } });
}

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;

  const studentA = await createTestUser("fstudenta", "STUDENT");
  const studentA2 = await createTestUser("fstudenta2", "STUDENT");
  const studentB = await createTestUser("fstudentb", "STUDENT");
  const leaderA = await createTestUser("fleadera", "LEADER");
  const leaderB = await createTestUser("fleaderb", "LEADER");
  const admin = await createTestUser("fadmin", "ADMIN");
  const mentor = await createTestUser("fmentor", "MENTOR");
  studentAId = studentA.id;
  studentA2Id = studentA2.id;

  const groupA = await db.group.create({
    data: { seasonId, name: "Group A", leaders: { create: { userId: leaderA.id } } },
    select: { id: true },
  });
  const groupB = await db.group.create({
    data: { seasonId, name: "Group B", leaders: { create: { userId: leaderB.id } } },
    select: { id: true },
  });
  groupAId = groupA.id;
  groupBId = groupB.id;

  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: studentA.id, groupId: groupA.id, status: "ACTIVE" },
      { seasonId, studentUserId: studentA2.id, groupId: groupA.id, status: "ACTIVE" },
      { seasonId, studentUserId: studentB.id, groupId: groupB.id, status: "ACTIVE" },
    ],
  });

  const assignment = await db.assignment.create({
    data: {
      seasonId,
      title: "space-v2-test-forum",
      type: "FORUM",
      forumMinWords: 5,
      forumAllowComments: true,
      isAllGroups: true,
      dueAt: new Date("2099-01-01T00:00:00.000Z"),
    },
    select: { id: true },
  });
  assignmentId = assignment.id;

  // Targeted at group B only — student A must never reach it.
  const untargeted = await db.assignment.create({
    data: {
      seasonId,
      title: "space-v2-test-forum-b-only",
      type: "FORUM",
      forumMinWords: 0,
      forumAllowComments: true,
      isAllGroups: false,
      targets: { create: { groupId: groupB.id } },
    },
    select: { id: true },
  });
  untargetedAssignmentId = untargeted.id;

  studentAToken = await login(app, studentA.email);
  studentA2Token = await login(app, studentA2.email);
  studentBToken = await login(app, studentB.email);
  leaderAToken = await login(app, leaderA.email);
  leaderBToken = await login(app, leaderB.email);
  adminToken = await login(app, admin.email);
  mentorToken = await login(app, mentor.email);
});

beforeEach(resetSubmissions);

afterAll(async () => {
  await cleanupTestData();
});

describe("PUT /api/v1/assignments/:id/forum/response", () => {
  it("posts on an assignment the student has never opened — no row exists first", async () => {
    // The whole point. v1's forum writes are addressed by a submission id that
    // `ensureDraftSubmission` created while *rendering* the page; ruling C6
    // removed that read-time write, so this PUT is the creator.
    expect(
      await db.submission.count({ where: { assignmentId, studentUserId: studentAId } }),
    ).toBe(0);

    const res = await request(app)
      .put(`/api/v1/assignments/${assignmentId}/forum/response`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ text: OWN_TEXT });

    expect(res.status).toBe(200);
    expect(res.body.data.posted).toBe(true);
    expect(res.body.data.submissionPublicId).toEqual(expect.any(String));

    const row = await db.submission.findUnique({
      where: { assignmentId_studentUserId: { assignmentId, studentUserId: studentAId } },
      select: { status: true, submittedAt: true, text: true },
    });
    expect(row?.status).toBe("SUBMITTED");
    expect(row?.submittedAt).not.toBeNull();
    // Stored as escaped HTML so v1's renderer, which is live against this same
    // database, shows it as paragraphs rather than one run-on line.
    expect(row?.text).toBe(`<p>${OWN_TEXT}</p>`);
  });

  it("is idempotent and overwrites on a second call (v1 R13)", async () => {
    const first = await request(app)
      .put(`/api/v1/assignments/${assignmentId}/forum/response`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ text: OWN_TEXT });
    const second = await request(app)
      .put(`/api/v1/assignments/${assignmentId}/forum/response`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ text: `${OWN_TEXT} seven` });

    expect(second.status).toBe(200);
    expect(second.body.data.submissionPublicId).toBe(first.body.data.submissionPublicId);
    expect(await db.submission.count({ where: { assignmentId, studentUserId: studentAId } })).toBe(
      1,
    );
  });

  it("enforces forumMinWords with the count the client shows", async () => {
    const res = await request(app)
      .put(`/api/v1/assignments/${assignmentId}/forum/response`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ text: "too short" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("too_few_words");
    expect(res.body.error.message).toContain("5");
  });

  // v1 parity 2026-10-09 (R11): invert this case — with a null/zero minimum an
  // empty response is accepted (200, status SUBMITTED), as v1
  // (jpc-space src/lib/forum-actions.ts:36-39).
  it("refuses an empty response even when the minimum is zero (spec 14 D8)", async () => {
    const res = await request(app)
      .put(`/api/v1/assignments/${untargetedAssignmentId}/forum/response`)
      .set("authorization", `Bearer ${studentBToken}`)
      .send({ text: "   " });
    expect(res.status).toBe(400);
  });

  it("REFUSES an assignment the student is not targeted by", async () => {
    // v1's post action checks identity, type and word count and nothing else —
    // targeting exists only as a page's early return (spec 14 R7/R15).
    const res = await request(app)
      .put(`/api/v1/assignments/${untargetedAssignmentId}/forum/response`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ text: OWN_TEXT });
    expect(res.status).toBe(403);
    expect(await db.submission.count({ where: { assignmentId: untargetedAssignmentId } })).toBe(0);
  });

  it("refuses staff — a leader has no response of their own", async () => {
    for (const token of [leaderAToken, adminToken, mentorToken]) {
      const res = await request(app)
        .put(`/api/v1/assignments/${assignmentId}/forum/response`)
        .set("authorization", `Bearer ${token}`)
        .send({ text: OWN_TEXT });
      expect(res.status).toBe(403);
    }
  });

  it("allows a late post, deliberately (spec 14 D5)", async () => {
    // dueAt on this assignment is in the past relative to nothing — it is
    // 2099-01-01 and the fixture posts "after" it only conceptually; what this
    // pins is that no due-date branch exists at all in the handler.
    const past = await db.assignment.create({
      data: {
        seasonId,
        title: "space-v2-test-forum-overdue",
        type: "FORUM",
        forumMinWords: 0,
        isAllGroups: true,
        dueAt: new Date("2000-01-01T00:00:00.000Z"),
      },
      select: { id: true },
    });
    const res = await request(app)
      .put(`/api/v1/assignments/${past.id}/forum/response`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ text: OWN_TEXT });
    expect(res.status).toBe(200);
  });

  it("404s a STANDARD assignment", async () => {
    const standard = await db.assignment.create({
      data: { seasonId, title: "space-v2-test-standard", type: "STANDARD", isAllGroups: true },
      select: { id: true },
    });
    const res = await request(app)
      .put(`/api/v1/assignments/${standard.id}/forum/response`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ text: OWN_TEXT });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/v1/assignments/:id/forum", () => {
  it("404s a STANDARD assignment for student and staff alike", async () => {
    const standard = await db.assignment.create({
      data: { seasonId, title: "space-v2-test-standard-get", type: "STANDARD", isAllGroups: true },
      select: { id: true },
    });
    for (const token of [studentAToken, adminToken]) {
      const res = await request(app)
        .get(`/api/v1/assignments/${standard.id}/forum`)
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("not_found");
    }
  });

  it("renders for a student with no submission row at all", async () => {
    const res = await request(app)
      .get(`/api/v1/assignments/${assignmentId}/forum`)
      .set("authorization", `Bearer ${studentAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.own).toMatchObject({
      submissionPublicId: null,
      text: "",
      status: "DRAFT",
      wordCount: 0,
      posted: false,
    });
    expect(res.body.data.locked).toBe(true);
    expect(res.body.data.posts).toEqual([]);
    expect(res.body.data.minWords).toBe(5);
    // v1's FORUM branch renders no due date at all (spec 14 R33/D10).
    expect(res.body.data.dueAt).toBe("2099-01-01T00:00:00.000Z");
  });

  it("keeps the feed locked until the student posts, then unlocks it", async () => {
    await request(app)
      .put(`/api/v1/assignments/${assignmentId}/forum/response`)
      .set("authorization", `Bearer ${studentA2Token}`)
      .send({ text: `${OWN_TEXT} peer` });

    const locked = await request(app)
      .get(`/api/v1/assignments/${assignmentId}/forum`)
      .set("authorization", `Bearer ${studentAToken}`);
    expect(locked.body.data.locked).toBe(true);
    expect(locked.body.data.posts).toEqual([]);

    await request(app)
      .put(`/api/v1/assignments/${assignmentId}/forum/response`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ text: OWN_TEXT });

    const unlocked = await request(app)
      .get(`/api/v1/assignments/${assignmentId}/forum`)
      .set("authorization", `Bearer ${studentAToken}`);
    expect(unlocked.body.data.locked).toBe(false);
    expect(unlocked.body.data.posts).toHaveLength(1);
    expect(unlocked.body.data.posts[0].studentUserId).toBe(studentA2Id);
  });

  it("never exposes an unposted peer's draft text (spec 14 R23)", async () => {
    // The single most important privacy rule in the domain, and in v1 it lives
    // entirely in a where clause.
    await db.submission.create({
      data: {
        assignmentId,
        studentUserId: studentA2Id,
        publicId: newPublicId(),
        status: "DRAFT",
        text: "<p>space-v2-test-secret-draft</p>",
      },
    });
    await request(app)
      .put(`/api/v1/assignments/${assignmentId}/forum/response`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ text: OWN_TEXT });

    const res = await request(app)
      .get(`/api/v1/assignments/${assignmentId}/forum`)
      .set("authorization", `Bearer ${studentAToken}`);

    expect(res.body.data.posts).toEqual([]);
    expect(JSON.stringify(res.body)).not.toContain("secret-draft");
  });

  it("shows only the reader's own group", async () => {
    for (const token of [studentAToken, studentA2Token, studentBToken]) {
      await request(app)
        .put(`/api/v1/assignments/${assignmentId}/forum/response`)
        .set("authorization", `Bearer ${token}`)
        .send({ text: OWN_TEXT });
    }

    const res = await request(app)
      .get(`/api/v1/assignments/${assignmentId}/forum`)
      .set("authorization", `Bearer ${studentAToken}`);

    expect(res.body.data.groupId).toBe(groupAId);
    expect(res.body.data.posts).toHaveLength(1);
    expect(res.body.data.posts[0].studentUserId).toBe(studentA2Id);
  });

  it("sends plain text and never an email address (spec 14 D6)", async () => {
    await request(app)
      .put(`/api/v1/assignments/${assignmentId}/forum/response`)
      .set("authorization", `Bearer ${studentA2Token}`)
      .send({ text: OWN_TEXT });
    await request(app)
      .put(`/api/v1/assignments/${assignmentId}/forum/response`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ text: OWN_TEXT });

    const res = await request(app)
      .get(`/api/v1/assignments/${assignmentId}/forum`)
      .set("authorization", `Bearer ${studentAToken}`);

    // v1 parity 2026-10-09 (R28): the body is v1-allow-list-sanitised HTML —
    // assert `toBe(\`<p>${OWN_TEXT}</p>\`)` and that a stored <script>/onclick is stripped.
    expect(res.body.data.posts[0].text).toBe(OWN_TEXT);
    expect(res.body.data.posts[0].text).not.toContain("<p>");
    expect(JSON.stringify(res.body)).not.toContain("@jpc.test");
  });

  // v1 parity 2026-10-09 (R53): this case and "gives an admin and a mentor every
  // group" become one case asserting 403 for LEADER, ADMIN, SUPER and MENTOR.
  it("gives a leader their own group's thread and refuses another group's", async () => {
    // New capability: v1 has no staff forum screen at all (spec 14 R53).
    for (const token of [studentAToken, studentBToken]) {
      await request(app)
        .put(`/api/v1/assignments/${assignmentId}/forum/response`)
        .set("authorization", `Bearer ${token}`)
        .send({ text: OWN_TEXT });
    }

    const leaderA = await request(app)
      .get(`/api/v1/assignments/${assignmentId}/forum`)
      .set("authorization", `Bearer ${leaderAToken}`);
    expect(leaderA.status).toBe(200);
    // Staff read every post they are scoped to, and are never locked.
    expect(leaderA.body.data.locked).toBe(false);
    expect(leaderA.body.data.own).toBeNull();
    expect(leaderA.body.data.posts.map((p: { studentUserId: number }) => p.studentUserId)).toEqual([
      studentAId,
    ]);

    const leaderB = await request(app)
      .get(`/api/v1/assignments/${assignmentId}/forum`)
      .set("authorization", `Bearer ${leaderBToken}`);
    expect(
      leaderB.body.data.posts.some((p: { studentUserId: number }) => p.studentUserId === studentAId),
    ).toBe(false);
  });

  it("gives an admin and a mentor every group", async () => {
    for (const token of [studentAToken, studentBToken]) {
      await request(app)
        .put(`/api/v1/assignments/${assignmentId}/forum/response`)
        .set("authorization", `Bearer ${token}`)
        .send({ text: OWN_TEXT });
    }
    for (const token of [adminToken, mentorToken]) {
      const res = await request(app)
        .get(`/api/v1/assignments/${assignmentId}/forum`)
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.posts).toHaveLength(2);
    }
  });

  it("refuses a student the assignment does not target", async () => {
    const res = await request(app)
      .get(`/api/v1/assignments/${untargetedAssignmentId}/forum`)
      .set("authorization", `Bearer ${studentAToken}`);
    expect(res.status).toBe(403);
  });

  // v1 parity 2026-10-09 (R27): replace with "returns every post in one
  // response, submittedAt desc" — no limit, no cursor (jpc-space src/lib/forum-query.ts:80-112).
  it("paginates instead of returning the whole thread (spec 14 D7)", async () => {
    const extras = await Promise.all(
      Array.from({ length: 3 }, (_, i) => createTestUser(`fbulk${i}`, "STUDENT")),
    );
    await db.seasonEnrollment.createMany({
      data: extras.map((u) => ({
        seasonId,
        studentUserId: u.id,
        groupId: groupAId,
        status: "ACTIVE" as const,
      })),
    });
    for (const u of extras) {
      const token = await login(app, u.email);
      await request(app)
        .put(`/api/v1/assignments/${assignmentId}/forum/response`)
        .set("authorization", `Bearer ${token}`)
        .send({ text: OWN_TEXT });
    }
    await request(app)
      .put(`/api/v1/assignments/${assignmentId}/forum/response`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ text: OWN_TEXT });

    const page1 = await request(app)
      .get(`/api/v1/assignments/${assignmentId}/forum?limit=2`)
      .set("authorization", `Bearer ${studentAToken}`);
    expect(page1.body.data.posts).toHaveLength(2);
    expect(page1.body.data.nextCursor).toEqual(expect.any(String));

    const page2 = await request(app)
      .get(`/api/v1/assignments/${assignmentId}/forum?limit=2&cursor=${page1.body.data.nextCursor}`)
      .set("authorization", `Bearer ${studentAToken}`);
    expect(page2.body.data.posts).toHaveLength(1);
    expect(page2.body.data.nextCursor).toBeNull();
  });
});
```

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern forum-routes` → FAIL.

- [ ] **Step 2: The query module**

`apps/backend/src/lib/queries/forum.ts` exports `displayNameFor`, the
`ForumViewData` interface and `loadForumView(assignmentId, user, audience, query)`.
The shape, spelled out:

```ts
/**
 * The one place a forum author's name is produced.
 *
 * v1 falls back to the author's email address when `name` is blank (spec 14
 * R30), so every student in a group sees the address of any group-mate who has
 * not set a name. These are young people's addresses, and `email` is not
 * selected anywhere in this module precisely so the fallback cannot come back.
 */
export function displayNameFor(name: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : "Group member";
}
```

```ts
export interface ForumAssignmentRow {
  id: number;
  seasonId: number;
  dueAt: Date | null;
  forumMinWords: number | null;
  forumAllowComments: boolean;
}

/**
 * The one existence check for the forum surface. `type: "FORUM"` in the where
 * is what makes every forum endpoint refuse a standard assignment (404) rather
 * than serve an empty thread — and because routes call this before
 * `forumAudienceFor`, the answer is 404 for every caller, never a 403 that
 * depends on who is asking.
 */
export async function loadForumAssignment(assignmentId: number): Promise<ForumAssignmentRow | null> {
  return db.assignment.findFirst({
    where: { id: assignmentId, deletedAt: null, type: "FORUM" },
    select: { id: true, seasonId: true, dueAt: true, forumMinWords: true, forumAllowComments: true },
  });
}
```

`loadForumView` runs, in order:

1. `loadForumAssignment(assignmentId)`. Null → return null (the route has
   already 404'd on the same call; this is the race where the row was deleted
   between the two reads, and it 404s too).
2. **Own response** — only for `audience.kind === "student"`, and looked up by
   `(assignmentId, callerUserId)`, never by an id the client supplied. v1's
   `loadForumView` takes `ownSubmissionId` as an argument and echoes it back
   without checking it belongs to anyone (spec 14 R3); an endpoint cannot do
   that. Missing row → `{ submissionPublicId: null, text: "", status: "DRAFT",
   wordCount: 0, posted: false, feedback: null, reviewedAt: null }`.
   Present → `text: htmlToPlainText(row.text ?? "")`, `posted: row.status !== "DRAFT"`,
   `wordCount: countWords(plainText)`, and `feedback: row.feedback ? htmlToPlainText(row.feedback) : null`
   with `reviewedAt`. Selecting `feedback` is decision D-14.8: v1's forum screen
   never does, so a reviewer's verdict on a forum post is invisible to the
   student who wrote it (spec 14 R34, §10 D9). It goes through
   `htmlToPlainText` for the same reason the post body does — `feedback` is rich
   text in v1 too (ruling C11).

> **v1 parity 2026-10-09:** (R34/R56) do **not** select or return `feedback` / `reviewedAt` — drop them from the missing-row default, the present-row map and the PUT response (`apps/backend/src/lib/queries/forum.ts:108,121-122`); v1 `forum-query.ts:54-57` never selects them. (R53) Staff audiences no longer exist, so every "Staff …" clause in steps 3–6 is dead and goes.
3. **Locked** — `audience.kind === "student" && !own.posted`. Staff are never
   locked. Locked → return early with `posts: []` and `nextCursor: null`; the
   peer query never runs. Same short-circuit as v1 (R19), and the cheapest path.
4. **Peer scope.** Student: the other ACTIVE enrolments in `audience.groupId`
   for this assignment's season, excluding the caller; `groupId === null` →
   empty feed (v1 R21, kept — an ungrouped student's post is stored and visible
   to nobody). Staff with `groupIds === null`: every ACTIVE enrolment in the
   season. Staff with `groupIds`: enrolments in those groups.
   **Resolved from `SeasonEnrollment`, not `GroupStudent`** (ruling C9,
   decision D-14.3).
5. **Posts.**

```ts
  const posts = await db.submission.findMany({
    where: {
      assignmentId,
      studentUserId: { in: peerIds },
      status: { not: "DRAFT" },
      NOT: { text: null },
    },
    orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    select: {
      id: true,
      publicId: true,
      studentUserId: true,
      text: true,
      submittedAt: true,
      studentUser: { select: { name: true } },
      _count: { select: { forumComments: true } },
      forumComments: {
        orderBy: { createdAt: "asc" },
        // Three inline, and the rest from the comments endpoint. v1 loads every
        // comment on every post with no take anywhere (spec 14 R27) — fine for
        // a server render, a response that grows without limit on a phone.
        take: 3,
        select: {
          id: true,
          authorUserId: true,
          body: true,
          createdAt: true,
          authorUser: { select: { name: true } },
        },
      },
    },
  });
```

   `status: { not: "DRAFT" }` **and** `NOT: { text: null }` are both required
   and are the privacy rule (R23); the second `orderBy` on `id` is what makes
   the cursor deterministic when two posts share a `submittedAt`. The cursor on
   the wire is the last row's `publicId`; resolve it to an id with one
   `findUnique` before the query, and treat an unresolvable cursor as no cursor.

> **v1 parity 2026-10-09:** (R27) no `take`, `cursor` or `skip` and no `nextCursor` — every post, `submittedAt` desc (v1 `jpc-space/src/lib/forum-query.ts:80-112`; edit `apps/backend/src/lib/queries/forum.ts:167-185,241`). (R26) no `take: 3` and no `_count` — every comment inline, `createdAt` asc (v1 `forum-query.ts:101-110`; `forum.ts:194-205`). (R31) also select `studentUser.avatarPath` / `authorUser.avatarPath` and map them to `authorAvatarUrl` via the gated avatar endpoint (D-14.6).
6. **Map.** `text: sanitizeForumHtml(p.text ?? "")` — the stored HTML passed
   through v1's allow-list (v1 `jpc-space/src/components/ui/rich-text-view.tsx:11-31`:
   tags `p br strong em s a ul ol li h2 h3 blockquote code pre`, `a` keeps
   `href`/`target`/`rel`, schemes `http`/`https`/`mailto`), replacing
   `htmlToPlainText` at `apps/backend/src/lib/queries/forum.ts:219` (R28).
   *(v1 parity 2026-10-09: was "htmlToPlainText — posts served and rendered as plain text")*
   `authorDisplayName: displayNameFor(...)`,
   `commentCount: p._count.forumComments`, and per comment
   `canDelete: await canDeleteForumComment(user, c.id)` — the gate itself, not a
   client-side lookalike, which is the fix for the class of bug that left v1's
   staff removal power unreachable (spec 14 R52).
   *(v1 parity 2026-10-09: drop `commentCount` (R26) and `canDelete` (R52) —
   the client shows delete only on the viewer's own comments, v1
   `forum-view.tsx:205`; edit `forum.ts:229-230`.)* At most three comments per
   post are inlined, so the per-row await is bounded; Task 7's
   `listForumComments` computes it the same way for the same reason. `canComment`
   per post is `assignment.forumAllowComments && (audience.kind === "student" ?
   own.posted : user.role !== "MENTOR")` — the same conditions the POST
   enforces (`canCommentOnForumSubmission` refuses MENTOR, who reads every group
   but stays read-only), so the affordance and the gate cannot drift. A staff
   audience otherwise only contains posts the caller may comment on: a LEADER's
   audience is exactly the groups they lead, and SUPER / the season ADMIN pass
   the gate outright.

- [ ] **Step 3: The two routes**

```ts
// Per-route requireAuth: this router shares the /api/v1 prefix (ruling X5).
forumRouter.get("/assignments/:id/forum", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const assignmentId = parseId(req.params.id);
  if (assignmentId === null) return apiError(res, "bad_request", "Invalid assignment id.", 400);

  const parsedQuery = forumFeedQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) return apiError(res, "bad_request", "Invalid query.", 400);

  // Existence first, for everyone (the status-code rule above).
  if ((await loadForumAssignment(assignmentId)) === null) {
    return apiError(res, "not_found", "Assignment not found.", 404);
  }

  // The gate answers "may this caller read this thread, and whose posts" in one
  // call. v1 answers it in a page's early returns and a query's where clause.
  const audience = await forumAudienceFor(user, assignmentId);
  if (audience === null) return apiError(res, "forbidden", "You don't have access to this.", 403);

  const view = await loadForumView(assignmentId, user, audience, parsedQuery.data);
  if (view === null) return apiError(res, "not_found", "Assignment not found.", 404);
  return apiOk(res, view);
});
```

`PUT /assignments/:id/forum/response` — registered as
`forumRouter.put("/assignments/:id/forum/response", requireAuth, async (req, res) => { … })`:

1. `parseId`; `user.role !== "STUDENT"` → 403 `"Only a student can post a response."`
   (v1's post action has **no** role check at all — R7).
2. `loadForumAssignment(assignmentId)` → 404 when missing, deleted or not
   `FORUM` (the status-code rule: existence before audience). Keep the row; its
   `forumMinWords` feeds step 5.
3. `forumAudienceFor(user, assignmentId)`; null or `kind !== "student"` → 403.
   This is where targeting, enrolment and season access are enforced, and it is
   the only place they can be now that no page render precedes the write
   (spec 14 D1/D5).
4. Parse with `submitForumResponseRequestSchema` → 400.
5. Word gate on the **plain text**, before wrapping, so the count the client
   showed and the count the server applied are the same string. This is the
   **only** length gate, as v1 (R11, `forum-actions.ts:36-39`): an empty post
   passes when the minimum is null or 0 *(v1 parity 2026-10-09)*:

```ts
  const words = countWords(parsed.data.text);
  const min = assignment.forumMinWords ?? 0;
  if (words < min) {
    return apiError(
      res,
      "too_few_words",
      `Please write at least ${min} words (you have ${words}).`,
      400,
    );
  }
  // No due-date branch, deliberately (spec 14 D5 / D-14.7): a discussion that
  // closes at a deadline stops being a discussion. v1 selects dueAt here and
  // never reads it; this is that behaviour, written down.
```

6. The upsert — the whole of decision D-14.1:

```ts
  const now = new Date();
  const html = plainTextToHtml(parsed.data.text);
  const submission = await db.submission.upsert({
    where: { assignmentId_studentUserId: { assignmentId, studentUserId: user.userId } },
    // Posting IS submitting: one write sets the body, the status and the
    // timestamp together (v1 R6), and re-posting overwrites and re-stamps
    // (R13), which promotes the post to the top of every group-mate's feed.
    update: { text: html, status: "SUBMITTED", submittedAt: now },
    create: {
      assignmentId,
      studentUserId: user.userId,
      publicId: newPublicId(),
      text: html,
      status: "SUBMITTED",
      submittedAt: now,
    },
    select: { publicId: true, status: true, feedback: true, reviewedAt: true }, // v1 parity 2026-10-09 (R34): drop feedback/reviewedAt
  });

  return apiOk(res, {
    submissionPublicId: submission.publicId,
    text: parsed.data.text,
    status: submission.status,
    wordCount: words,
    posted: true,
    // Carried so the response parses against forumOwnResponseSchema, and so an
    // update after a review does not blank the feedback the screen is showing.
    feedback: submission.feedback ? htmlToPlainText(submission.feedback) : null,
    reviewedAt: submission.reviewedAt,
  });
```

   A real upsert on the natural unique key, not v1's read-then-create-then-catch
   (ruling C6). A forum post has no draft-save step, so the first write is
   always a real post and there is never a window in which an empty row exists.

- [ ] **Step 4:** Run the suite → PASS; `pnpm turbo lint typecheck test:unit --filter=@space/backend` → clean.

- [ ] **Step 4a: Failing tests — the generic submission writers refuse FORUM**

The forum rules (post-to-unlock needs a real post, `forumMinWords`, escaped
storage) live only in the PUT above. `routes/submissions.ts` already exposes two
writers that would accept a FORUM assignment and skip all three: create-or-fetch
an empty row, then `PATCH {submit:true}` — an empty `SUBMITTED` post that
unlocks every peer's work (D-14.5), with raw text stored where v1 renders HTML
(C11). Append to `forum-routes.test.ts`:

```ts
describe("the generic submission routes refuse a FORUM assignment", () => {
  it("PUT /submissions/by-assignment/:id → 409 use_forum_endpoint, and no row", async () => {
    const res = await request(app)
      .put(`/api/v1/submissions/by-assignment/${assignmentId}`)
      .set("authorization", `Bearer ${studentAToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("use_forum_endpoint");
    expect(
      await db.submission.count({ where: { assignmentId, studentUserId: studentAId } }),
    ).toBe(0);
  });

  it("PATCH /submissions/:publicId → 409 for save and for submit, text untouched", async () => {
    // A row can exist (posted through the forum PUT, or written by v1).
    const posted = await request(app)
      .put(`/api/v1/assignments/${assignmentId}/forum/response`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ text: OWN_TEXT });
    const publicId = posted.body.data.submissionPublicId as string;

    for (const body of [{ text: "<b>x</b>" }, { text: "", submit: true }]) {
      const res = await request(app)
        .patch(`/api/v1/submissions/${publicId}`)
        .set("authorization", `Bearer ${studentAToken}`)
        .send(body);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("use_forum_endpoint");
    }
    const row = await db.submission.findUnique({
      where: { publicId },
      select: { text: true },
    });
    expect(row?.text).toBe(`<p>${OWN_TEXT}</p>`);
  });

  it("still serves a STANDARD assignment as before", async () => {
    const standard = await db.assignment.create({
      data: { seasonId, title: "space-v2-test-standard-ok", type: "STANDARD", isAllGroups: true },
      select: { id: true },
    });
    const res = await request(app)
      .put(`/api/v1/submissions/by-assignment/${standard.id}`)
      .set("authorization", `Bearer ${studentAToken}`);
    expect(res.status).toBe(200);
  });
});
```

Run the suite → the first two cases FAIL (200s today).

- [ ] **Step 4b: Refuse FORUM in `routes/submissions.ts`**

In `PUT /by-assignment/:assignmentId`, add `type: true` to the assignment
`select`, and directly after the `if (!assignment) … 404` line:

```ts
  // A forum post has exactly one writer: PUT /assignments/:id/forum/response,
  // which applies forumMinWords, refuses an empty post (it would unlock every
  // peer's work) and stores escaped HTML. Creating the row here would let a
  // client skip all three with a follow-up PATCH {submit:true} (plan 14 D-14.1).
  if (assignment.type === "FORUM") {
    return apiError(
      res,
      "use_forum_endpoint",
      "Post forum responses through the forum endpoint.",
      409,
    );
  }
```

In `PATCH /:publicId`, extend the select to
`assignment: { select: { dueAt: true, type: true } }` and, directly after the
author check (`throw new ForbiddenError()`), add the same `if
(sub.assignment.type === "FORUM") return apiError(res, "use_forum_endpoint", …, 409);`
— before the body is parsed, for both the save and the submit branch. A save
is refused too: it would replace a posted body with unescaped text while the
row stays `SUBMITTED`.

Run the suite → PASS. Run Plan 1's submission suite too
(`--testPathPattern submissions`) → still green: no STANDARD path changed.

- [ ] **Step 5: OpenAPI, same commit** — both paths plus `ForumView`,
`ForumPost`, `ForumOwnResponse` and `SubmitForumResponseRequest`. The prose must
say that the PUT creates the row (and why a GET must not), that `locked` is a
product mechanic rather than an error, that `text` is plain text in both
directions, and that a late post is allowed on purpose. Add a `409` response
(`use_forum_endpoint`) to the existing `PUT /submissions/by-assignment/{assignmentId}`
and `PATCH /submissions/{publicId}` entries, saying a FORUM assignment is
written only through `PUT /assignments/{id}/forum/response`.

- [ ] **Step 6: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): forum thread read, the upsert that creates the row, and FORUM refused on the generic writers"
```

---

### Task 7: Forum — comments, and the removal power that finally has a caller

> **v1 parity 2026-10-09:** (R26) do **not** build `GET /assignments/:id/forum/posts/:publicId/comments`, `listForumComments` or `forumCommentsQuerySchema` / `forumCommentsPageSchema` — v1 inlines every comment (`jpc-space/src/lib/forum-query.ts:101-110`); remove `apps/backend/src/routes/forum.ts:253-262` and the "paginates a long comment list" test. (R40) LEADER cannot comment — invert "lets the group's leader comment without posting anything" to expect 403. (R50/R52/R53) staff never read a thread and LEADER cannot delete: "lets staff delete a comment they did not write" becomes "lets SUPER / the season ADMIN delete by id (no UI)" and a LEADER gets 403; no `canDelete` in the POST response. Step 5's OpenAPI states there is no moderation, as v1 (D-14.4).

**Files:**
- Modify: `apps/backend/src/routes/forum.ts`
- Modify: `apps/backend/src/lib/queries/forum.ts` (add `listForumComments`)
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: extend `apps/backend/src/__tests__/integration/forum-routes.test.ts`

**Interfaces:**
- Consumes: `canCommentOnForumSubmission`, `canDeleteForumComment`, `forumAudienceFor` (Task 2); `addForumCommentRequestSchema`, `forumCommentsQuerySchema` (Task 1); `displayNameFor`, `loadForumAssignment` (Task 6).
- Produces:
  - `listForumComments(submissionId, user, query): Promise<{ comments: ForumCommentData[]; nextCursor: number | null }>`
  - `GET /api/v1/assignments/:id/forum/posts/:publicId/comments`
  - `POST /api/v1/assignments/:id/forum/posts/:publicId/comments`
  - `DELETE /api/v1/forum/comments/:commentId`

- [ ] **Step 1: Write the failing tests** (append to `forum-routes.test.ts`)

```ts
describe("forum comments", () => {
  const COMMENT = "space-v2-test comment body";

  async function postFor(token: string): Promise<string> {
    const res = await request(app)
      .put(`/api/v1/assignments/${assignmentId}/forum/response`)
      .set("authorization", `Bearer ${token}`)
      .send({ text: OWN_TEXT });
    return res.body.data.submissionPublicId as string;
  }

  it("lets a group-mate who has posted comment on a peer's response", async () => {
    const peerPost = await postFor(studentA2Token);
    await postFor(studentAToken);

    const res = await request(app)
      .post(`/api/v1/assignments/${assignmentId}/forum/posts/${peerPost}/comments`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ body: COMMENT });

    expect(res.status).toBe(201);
    expect(res.body.data.comment).toMatchObject({ body: COMMENT, canDelete: true });
    expect(res.body.data.comment.authorDisplayName).not.toContain("@");
  });

  it("refuses a commenter who has not posted their own response first (v1 R41)", async () => {
    const peerPost = await postFor(studentA2Token);

    const res = await request(app)
      .post(`/api/v1/assignments/${assignmentId}/forum/posts/${peerPost}/comments`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ body: COMMENT });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("post_first");
  });

  it("refuses a student from another group", async () => {
    const peerPost = await postFor(studentA2Token);
    await postFor(studentBToken);

    const res = await request(app)
      .post(`/api/v1/assignments/${assignmentId}/forum/posts/${peerPost}/comments`)
      .set("authorization", `Bearer ${studentBToken}`)
      .send({ body: COMMENT });
    expect(res.status).toBe(403);
  });

  it("lets the group's leader comment without posting anything (spec 14 D3)", async () => {
    // In v1 LEADER falls through to `return false` — a leader cannot join the
    // discussion of a group they lead. That is a missing `if`, not a policy.
    const peerPost = await postFor(studentAToken);

    const res = await request(app)
      .post(`/api/v1/assignments/${assignmentId}/forum/posts/${peerPost}/comments`)
      .set("authorization", `Bearer ${leaderAToken}`)
      .send({ body: COMMENT });
    expect(res.status).toBe(201);
  });

  it("refuses a mentor, who stays read-only", async () => {
    const peerPost = await postFor(studentAToken);
    const res = await request(app)
      .post(`/api/v1/assignments/${assignmentId}/forum/posts/${peerPost}/comments`)
      .set("authorization", `Bearer ${mentorToken}`)
      .send({ body: COMMENT });
    expect(res.status).toBe(403);
  });

  it("refuses a post that belongs to a different assignment (spec 14 D14)", async () => {
    const other = await db.assignment.create({
      data: {
        seasonId,
        title: "space-v2-test-forum-other",
        type: "FORUM",
        forumMinWords: 0,
        forumAllowComments: true,
        isAllGroups: true,
      },
      select: { id: true },
    });
    const peerPost = await postFor(studentA2Token);
    await postFor(studentAToken);

    const res = await request(app)
      .post(`/api/v1/assignments/${other.id}/forum/posts/${peerPost}/comments`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ body: COMMENT });
    expect(res.status).toBe(404);
  });

  it("refuses an empty or over-long body", async () => {
    const peerPost = await postFor(studentA2Token);
    await postFor(studentAToken);

    for (const body of ["   ", "x".repeat(5001)]) {
      const res = await request(app)
        .post(`/api/v1/assignments/${assignmentId}/forum/posts/${peerPost}/comments`)
        .set("authorization", `Bearer ${studentAToken}`)
        .send({ body });
      expect(res.status).toBe(400);
    }
  });

  it("paginates a long comment list and reports the count on the post", async () => {
    const peerPost = await postFor(studentA2Token);
    await postFor(studentAToken);

    for (let i = 0; i < 5; i += 1) {
      await request(app)
        .post(`/api/v1/assignments/${assignmentId}/forum/posts/${peerPost}/comments`)
        .set("authorization", `Bearer ${studentAToken}`)
        .send({ body: `${COMMENT} ${i}` });
    }

    const feed = await request(app)
      .get(`/api/v1/assignments/${assignmentId}/forum`)
      .set("authorization", `Bearer ${studentAToken}`);
    // Three inline plus a count — v1 returns every comment on every post.
    expect(feed.body.data.posts[0].commentCount).toBe(5);
    expect(feed.body.data.posts[0].comments).toHaveLength(3);

    const page = await request(app)
      .get(`/api/v1/assignments/${assignmentId}/forum/posts/${peerPost}/comments?limit=2`)
      .set("authorization", `Bearer ${studentAToken}`);
    expect(page.body.data.comments).toHaveLength(2);
    expect(page.body.data.nextCursor).toEqual(expect.any(Number));
  });

  it("lets staff delete a comment they did not write — and tells the client so", async () => {
    // v1's server allows SUPER and the season ADMIN to delete (R49), but the
    // control renders only for the viewer's own comments and no staff screen
    // shows a thread at all, so that power has never been exercisable (R52/R53).
    const peerPost = await postFor(studentA2Token);
    await postFor(studentAToken);
    const created = await request(app)
      .post(`/api/v1/assignments/${assignmentId}/forum/posts/${peerPost}/comments`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ body: COMMENT });
    const commentId = created.body.data.comment.id as number;

    const asLeader = await request(app)
      .get(`/api/v1/assignments/${assignmentId}/forum`)
      .set("authorization", `Bearer ${leaderAToken}`);
    const seen = asLeader.body.data.posts
      .flatMap((p: { comments: { id: number; canDelete: boolean }[] }) => p.comments)
      .find((c: { id: number }) => c.id === commentId);
    expect(seen.canDelete).toBe(true);

    const res = await request(app)
      .delete(`/api/v1/forum/comments/${commentId}`)
      .set("authorization", `Bearer ${leaderAToken}`);
    expect(res.status).toBe(200);
    expect(await db.forumComment.count({ where: { id: commentId } })).toBe(0);
  });

  it("refuses deletion by the post's author and by an unrelated leader", async () => {
    const peerPost = await postFor(studentA2Token);
    await postFor(studentAToken);
    const created = await request(app)
      .post(`/api/v1/assignments/${assignmentId}/forum/posts/${peerPost}/comments`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ body: COMMENT });
    const commentId = created.body.data.comment.id as number;

    for (const token of [studentA2Token, leaderBToken]) {
      const res = await request(app)
        .delete(`/api/v1/forum/comments/${commentId}`)
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
    expect(await db.forumComment.count({ where: { id: commentId } })).toBe(1);
  });

  it("404s an unknown comment", async () => {
    const res = await request(app)
      .delete("/api/v1/forum/comments/987654321")
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});
```

Run the suite → the new cases FAIL.

- [ ] **Step 2: `listForumComments`**

Append to `apps/backend/src/lib/queries/forum.ts`:

```ts
export interface ForumCommentData {
  id: number;
  authorUserId: number;
  authorDisplayName: string;
  body: string;
  createdAt: Date;
  canDelete: boolean;
}

/**
 * One post's comments, oldest first (v1 R26), bounded.
 *
 * `canDelete` is computed here rather than left to the client, which is the fix
 * for the class of bug that made v1's staff removal power unreachable: the
 * component derived the affordance from `authorUserId === currentUserId` while
 * the action allowed three more cases (spec 14 R49/R52).
 */
export async function listForumComments(
  submissionId: number,
  user: SessionUser,
  query: { cursor?: number; limit: number },
): Promise<{ comments: ForumCommentData[]; nextCursor: number | null }> {
  const rows = await db.forumComment.findMany({
    where: { submissionId },
    orderBy: { id: "asc" },
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      authorUserId: true,
      body: true,
      createdAt: true,
      authorUser: { select: { name: true } },
    },
  });
  const page = rows.slice(0, query.limit);
  const comments = await Promise.all(
    page.map(async (c) => ({
      id: c.id,
      authorUserId: c.authorUserId,
      authorDisplayName: displayNameFor(c.authorUser.name),
      // Plain text, rendered as plain text. v1's comment box is a textarea and
      // its comments are never parsed as HTML (R29) — do not accidentally give
      // this field the post body's treatment.
      body: c.body,
      createdAt: c.createdAt,
      canDelete: await canDeleteForumComment(user, c.id),
    })),
  );
  return {
    comments,
    nextCursor: rows.length > query.limit ? (page[page.length - 1]?.id ?? null) : null,
  };
}
```

- [ ] **Step 3: The three routes**

A shared local helper resolves the post and proves it belongs to the assignment
in the path:

```ts
/**
 * v1 addresses a forum write by a bare sequential `Submission.id`, so the gates
 * constrain *who* the caller is but never *which* row they name (spec 14 R5,
 * R43, D14). Nesting the post under its assignment and re-checking the pair
 * here means a mismatched id is a 404 rather than a silent success — and the
 * publicId is unguessable in the first place.
 */
async function resolvePost(assignmentId: number, publicId: string) {
  return db.submission.findFirst({
    where: { publicId, assignmentId },
    select: { id: true, status: true, studentUserId: true },
  });
}
```

All three are registered with `requireAuth` as the first handler
(`forumRouter.get(path, requireAuth, async …)`) — never `forumRouter.use`
(ruling X5). The two assignment-scoped routes apply Task 6's status-code rule:
`loadForumAssignment` → 404 before any audience or comment gate.

- **`GET /assignments/:id/forum/posts/:publicId/comments`** — `parseId` the
  assignment; parse the query with `forumCommentsQuerySchema`;
  `loadForumAssignment` → 404; `forumAudienceFor` → 403 on null;
  `resolvePost` → 404; **and, for a student audience, the same lock the feed
  applies** (their own response must be posted) → 403 `post_first`. Then
  `listForumComments`; respond with the `forumCommentsPageSchema` shape
  `{ comments, nextCursor }`.
- **`POST /assignments/:id/forum/posts/:publicId/comments`**:
  0. `parseId`; `loadForumAssignment` → 404.
  1. `resolvePost` → 404 (before the gate, but note in a comment that
     `canCommentOnForumSubmission` also returns false for a missing row, so a
     probe cannot distinguish "no such post" from "not allowed" — v1 has that
     property by accident and it is worth keeping deliberately, spec 14 §6).
  2. Parse the body → 400.
  3. `canCommentOnForumSubmission(user, post.id)` → 403 `forbidden`. This
     covers the type check, the `forumAllowComments` flag, the DRAFT-target
     refusal and the group comparison.
  4. **Post-first, for students only** (v1 R41): read the caller's own
     submission for the same assignment; missing or `DRAFT` → 403 `post_first`
     with `"Post your own response before commenting."` Staff bypass it by
     construction, exactly as in v1.
  5. `db.forumComment.create({ data: { submissionId: post.id, authorUserId: user.userId, body: parsed.data.body } })`,
     respond `{ comment: { ...mapped, canDelete: true } }` with 201. **No
     notification** — `NotificationType` has no forum member and adding one is a
     migration (C1). "Someone commented on your response" is the obvious first
     push in the product and is a **cutover task** (spec 14 D13).
- **`DELETE /forum/comments/:commentId`** — `parseId`; `findUnique` → 404;
  `canDeleteForumComment` → 403; hard `delete`; respond `{ deleted: true }`.
  Hard, because there is no `deletedAt` column and adding one is a migration;
  comments cannot nest, so nothing is orphaned (spec 14 R51).

- [ ] **Step 4:** Run the suite → PASS; turbo trio → clean.

- [ ] **Step 5: OpenAPI, same commit** — the three paths plus `ForumComment` and
`AddForumCommentRequest`. State that `canDelete` is authoritative and the client
must not re-derive it; that `post_first` is a rule, not an error condition; and
that **no moderation beyond comment deletion exists** — link the reader to this
plan's D-14.4 so the gap is documented where an integrator will meet it.

- [ ] **Step 6: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): forum comments with server-computed delete rights and staff moderation"
```

---

### Task 8: Forum — the thread on device

**Files:**
- Create: `apps/mobile/src/hooks/use-forum.ts`
- Create: `apps/mobile/src/components/ForumThread.tsx`
- Modify: `apps/mobile/app/(app)/assignment/[id]/index.tsx` (Plan 1's screen, moved to the directory form and role-branched by **Plan 5** — it gains the FORUM branch)
- Test: `apps/mobile/src/__tests__/forum-screen.test.tsx`

**Interfaces:**
- Consumes: Plan 1's `useAssignmentDetail(id)` and its `type`/`forumMinWords`/`forumAllowComments` fields; Plan 5's `assignment/[id]/index.tsx` (`isStudent` branch: `SubmissionSection` vs `AssignmentStaffPanel`) and its `dueOrgDay`/`dueOrgTime` detail fields; `queryKeys.forum` (Task 2); `forumViewSchema`, `forumOwnResponseSchema`, `forumCommentsPageSchema`, `addForumCommentResponseSchema`, `deleteForumCommentResponseSchema`, `countWords` (Task 1); Tasks 6–7's endpoints.
- Produces: `useForumThread(assignmentId, enabled)`, `useForumComments(assignmentId, postPublicId, enabled)`, `useSubmitForumResponse(assignmentId)`, `usePostComment(assignmentId)`, `useDeleteComment(assignmentId)`; the component `<ForumThread assignmentId={...} />`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/__tests__/forum-screen.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import AssignmentDetailScreen from "../../app/(app)/assignment/[id]/index";

const get = apiClient.get as jest.Mock;
const put = apiClient.put as jest.Mock;
const post = apiClient.post as jest.Mock;

const forumAssignment = {
  id: 41,
  seasonId: 7,
  seasonCode: "S26",
  seasonTitle: "Spring 2026",
  sessionId: null,
  sessionTitle: null,
  title: "Week three discussion",
  description: null,
  // Org midnight on Apr 1 (Cairo, UTC+2). Plan 5's detail carries the
  // server's org day/time and the screen renders those, never dueAt.
  dueAt: "2099-03-31T22:00:00.000Z",
  dueOrgDay: "2099-04-01",
  dueOrgTime: null,
  isOverdue: false,
  isAllGroups: true,
  type: "FORUM" as const,
  forumMinWords: 5,
  forumAllowComments: true,
  maxFileSizeMb: null,
  allowedMimeCategories: [],
  groupIds: null,
  mySubmission: null,
  canManage: false,
};

const lockedView = {
  assignmentId: 41,
  dueAt: forumAssignment.dueAt,
  own: {
    submissionPublicId: null,
    text: "",
    status: "DRAFT" as const,
    wordCount: 0,
    posted: false,
    feedback: null,
    reviewedAt: null,
  },
  locked: true,
  minWords: 5,
  allowComments: true,
  groupId: 3,
  posts: [],
  nextCursor: null,
};

const unlockedView = {
  ...lockedView,
  own: {
    submissionPublicId: "abc123defg",
    text: "space-v2-test my response one two three",
    status: "REVIEWED" as const,
    wordCount: 7,
    posted: true,
    feedback: "space-v2-test leader feedback",
    reviewedAt: "2099-03-03T09:00:00.000Z",
  },
  locked: false,
  posts: [
    {
      submissionPublicId: "peer000001",
      studentUserId: 12,
      authorDisplayName: "Group member",
      text: "space-v2-test peer response",
      submittedAt: "2099-03-02T10:00:00.000Z",
      commentCount: 1,
      comments: [
        {
          id: 5,
          authorUserId: 9,
          authorDisplayName: "Test student",
          body: "space-v2-test my comment",
          createdAt: "2099-03-02T11:00:00.000Z",
          canDelete: true,
        },
      ],
      canComment: true,
    },
  ],
};

const studentSession = {
  user: {
    id: 9,
    name: "Test student",
    email: "s@jpc.test",
    role: "STUDENT" as const,
    avatarPath: null,
    hasPassword: true,
  },
  scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: 7, graduationYear: null },
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(studentSession);
});

describe("forum branch of the assignment screen", () => {
  it("renders the compose box and the lock state with no submission in existence", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({ data: { data: forumAssignment } })
        : Promise.resolve({ data: { data: lockedView } }),
    );

    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByLabelText("Your response")).toBeTruthy();
    // A deliberate product mechanic, not an error — it gets a real empty state.
    expect(screen.getByText("Post to unlock the discussion")).toBeTruthy();
    expect(screen.getByText("0 / 5 words")).toBeTruthy();
    // v1's FORUM branch shows no due date at all (spec 14 R33).
    // v1 parity 2026-10-09 (R33): no due line on a FORUM assignment, as v1.
    expect(screen.queryByText("Due Apr 1, 2099")).toBeNull();
    // Nothing was created by opening the screen (ruling C6).
    expect(put).not.toHaveBeenCalled();
  });

  it("counts words with the shared counter and blocks a short post client-side", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({ data: { data: forumAssignment } })
        : Promise.resolve({ data: { data: lockedView } }),
    );

    renderWithProviders(<AssignmentDetailScreen />);
    fireEvent.changeText(await screen.findByLabelText("Your response"), "one two three");
    expect(screen.getByText("3 / 5 words")).toBeTruthy();

    fireEvent.press(screen.getByText("Post response"));
    await waitFor(() => expect(put).not.toHaveBeenCalled());
  });

  it("posts through the upsert on an assignment with no row", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({ data: { data: forumAssignment } })
        : Promise.resolve({ data: { data: lockedView } }),
    );
    put.mockResolvedValue({ data: { data: unlockedView.own } });

    renderWithProviders(<AssignmentDetailScreen />);
    fireEvent.changeText(
      await screen.findByLabelText("Your response"),
      "space-v2-test my response one two three",
    );
    fireEvent.press(screen.getByText("Post response"));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/api/v1/assignments/41/forum/response", {
        text: "space-v2-test my response one two three",
      }),
    );
  });

  it("renders peers, comment counts and a delete control the server authorised", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({ data: { data: forumAssignment } })
        : Promise.resolve({ data: { data: unlockedView } }),
    );

    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByText("space-v2-test peer response")).toBeTruthy();
    expect(screen.getByText("Group member")).toBeTruthy();
    expect(screen.getByText("space-v2-test my comment")).toBeTruthy();
    // canDelete comes from the server; the client never re-derives it.
    expect(screen.getByLabelText("Delete comment")).toBeTruthy();
    expect(screen.queryByText("Update response")).toBeTruthy();
    // v1 never renders feedback on a forum assignment, so a leader's verdict is
    // invisible to the student who wrote the post (spec 14 R34 / D9).
    expect(screen.getByText("space-v2-test leader feedback")).toBeTruthy();
  });

  it("posts a comment against the post's publicId", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({ data: { data: forumAssignment } })
        : Promise.resolve({ data: { data: unlockedView } }),
    );
    post.mockResolvedValue({ data: { data: { comment: { id: 6 } } } });

    renderWithProviders(<AssignmentDetailScreen />);
    fireEvent.changeText(
      await screen.findByLabelText("Add a comment"),
      "space-v2-test another comment",
    );
    fireEvent.press(screen.getByText("Comment"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/v1/assignments/41/forum/posts/peer000001/comments",
        { body: "space-v2-test another comment" },
      ),
    );
  });

  it("fetches the rest of a post's comments on 'Show all comments'", async () => {
    const threeComments = {
      ...unlockedView,
      posts: [{ ...unlockedView.posts[0], commentCount: 3 }],
    };
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/assignments/41") {
        return Promise.resolve({ data: { data: forumAssignment } });
      }
      if (url === "/api/v1/assignments/41/forum/posts/peer000001/comments") {
        return Promise.resolve({
          data: {
            data: {
              comments: [5, 6, 7].map((id) => ({
                id,
                authorUserId: 12,
                authorDisplayName: "Group member",
                body: `space-v2-test comment ${id}`,
                createdAt: "2099-03-02T11:00:00.000Z",
                canDelete: false,
              })),
              nextCursor: null,
            },
          },
        });
      }
      return Promise.resolve({ data: { data: threeComments } });
    });

    renderWithProviders(<AssignmentDetailScreen />);
    expect(await screen.findByText("2 more")).toBeTruthy();
    fireEvent.press(screen.getByText("Show all comments"));

    expect(await screen.findByText("space-v2-test comment 7")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/assignments/41/forum/posts/peer000001/comments");
  });

  it("hides the comment block entirely when the assignment disallows comments", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({
            data: { data: { ...forumAssignment, forumAllowComments: false } },
          })
        : Promise.resolve({
            data: {
              data: {
                ...unlockedView,
                allowComments: false,
                posts: [{ ...unlockedView.posts[0], comments: [], commentCount: 0, canComment: false }],
              },
            },
          }),
    );

    renderWithProviders(<AssignmentDetailScreen />);
    expect(await screen.findByText("space-v2-test peer response")).toBeTruthy();
    expect(screen.queryByLabelText("Add a comment")).toBeNull();
  });

  it("does not render the forum branch for a STANDARD assignment", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({ data: { data: { ...forumAssignment, type: "STANDARD" } } })
        : Promise.resolve({ data: { data: lockedView } }),
    );

    renderWithProviders(<AssignmentDetailScreen />);
    await screen.findByText("Week three discussion");
    expect(get).not.toHaveBeenCalledWith("/api/v1/assignments/41/forum");
  });
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/forum-screen.test.tsx` → FAIL.

- [ ] **Step 2: The hooks**

> **v1 parity 2026-10-09:** (R26/R27) no `useForumComments` and no cursor on `useForumThread`; (R52) no `canDelete` in fixtures. Step 1's tests change with them: drop "fetches the rest of a post's comments on 'Show all comments'"; "renders peers…" asserts the delete control on the viewer's own comment and its absence on another's; the feedback assertion becomes `queryByText(...)` → null (R34); "blocks a short post" keeps `minWords: 5`; add a case that a zero-minimum view enables "Post response" on empty text (R11).

```ts
// apps/mobile/src/hooks/use-forum.ts
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  addForumCommentResponseSchema,
  deleteForumCommentResponseSchema,
  forumCommentsPageSchema,
  forumOwnResponseSchema,
  forumViewSchema,
  type ForumView,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

export function useForumThread(
  assignmentId: number | null,
  enabled: boolean,
): UseQueryResult<ForumView> {
  return useQuery({
    queryKey: queryKeys.forum.thread(assignmentId ?? -1),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/assignments/${assignmentId}/forum`);
      return forumViewSchema.parse(res.data.data);
    },
    // Gated on the assignment being FORUM: a STANDARD assignment has no thread
    // and the endpoint would 404, which is not an error worth rendering.
    enabled: enabled && assignmentId !== null,
  });
}

/**
 * The rest of one post's comments, behind "Show all comments". The thread
 * inlines at most three per post (Task 6); this pages through the comments
 * endpoint with its numeric cursor. `enabled` stays false until the press, so
 * opening a thread issues one request, not one per post.
 */
export function useForumComments(assignmentId: number, postPublicId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: queryKeys.forum.comments(assignmentId, postPublicId),
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) => {
      const base = `/api/v1/assignments/${assignmentId}/forum/posts/${postPublicId}/comments`;
      const res = await apiClient.get(pageParam === null ? base : `${base}?cursor=${pageParam}`);
      return forumCommentsPageSchema.parse(res.data.data);
    },
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  });
}

function useInvalidateThread(assignmentId: number) {
  const queryClient = useQueryClient();
  return (): void => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.forum.thread(assignmentId) });
    // Expanded comment lists live under forum.comments(...); a new or removed
    // comment must refresh them too. Prefix-match on the forum subtree.
    void queryClient.invalidateQueries({ queryKey: [...queryKeys.forum.all, "comments", assignmentId] });
    // The post flips the submission's status, which the assignment detail also
    // reports — invalidate it too or the header keeps saying "Not started".
    void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.detail(assignmentId) });
  };
}

/**
 * The one write that creates the submission row. PUT, and idempotent: calling
 * it twice with the same text yields the same row, which is what makes it safe
 * on a screen React Query remounts and refocuses.
 */
export function useSubmitForumResponse(assignmentId: number) {
  const invalidate = useInvalidateThread(assignmentId);
  return useMutation({
    mutationFn: async (text: string) => {
      const res = await apiClient.put(`/api/v1/assignments/${assignmentId}/forum/response`, {
        text,
      });
      return forumOwnResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function usePostComment(assignmentId: number) {
  const invalidate = useInvalidateThread(assignmentId);
  return useMutation({
    mutationFn: async (vars: { postPublicId: string; body: string }) => {
      const res = await apiClient.post(
        `/api/v1/assignments/${assignmentId}/forum/posts/${vars.postPublicId}/comments`,
        { body: vars.body },
      );
      return addForumCommentResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useDeleteComment(assignmentId: number) {
  const invalidate = useInvalidateThread(assignmentId);
  return useMutation({
    mutationFn: async (commentId: number) => {
      const res = await apiClient.delete(`/api/v1/forum/comments/${commentId}`);
      return deleteForumCommentResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}
```

- [ ] **Step 3: `ForumThread`**

`apps/mobile/src/components/ForumThread.tsx` — props `{ assignmentId: number }`.
Structure:

1. `useForumThread(assignmentId, true)` → `LoadingState` / `ErrorState`
   (`onRetry` wired to `refetch`).
2. **Due date** — *not rendered here, and not in the header either.* v1's FORUM
   branch renders a "Forum" badge and the title and no due date at all
   (`jpc-space/src/app/student/assignments/[id]/page.tsx:53-60`, R33), so Plan 5's
   header `Due …` / `No due date` line is suppressed on FORUM (Step 4 note).
   *(v1 parity 2026-10-09: was "Plan 5's header shows the forum's due date")*
   Plan 5's `assignment/[id]/index.tsx` header
   already shows `Due {formatOrgDue(dueOrgDay, dueOrgTime)}` — the server's org
   day (X13) — for every other assignment type; a second, device-zone `formatDueDate(view.dueAt)` line here would
   duplicate it (and break the test's `getByText("Due Apr 1, 2099")`).
3. **Compose card**, rendered only when `view.own !== null` (a staff reader has
   no response of their own): a multiline `Input` labelled **Your response**
   seeded from `view.own.text`, a live counter
   `{countWords(draft)} / {view.minWords ?? 0} words` using the **shared**
   `countWords` — a divergent reimplementation is exactly how the button ends up
   enabled while the server refuses — and a `Button` titled
   `view.own.posted ? "Update response" : "Post response"`. The button is
   disabled while `countWords(draft) < (view.minWords ?? 0)` — v1's gate
   (`jpc-space/src/components/forum/forum-view.tsx:50-52,102`, R11; edit
   `ForumThread.tsx:29`). Surface the mutation's `error.response.data.error.message`
   verbatim beneath it. **No feedback block** (D-14.8, R34; remove
   `ForumThread.tsx:33-40`). *(v1 parity 2026-10-09: was "Math.max(1, minWords) gate; 'Feedback from your leader' card")*
   **Plain text, one `Input`, no rich-text editor.** The post body is HTML in
   storage but the server converts in both directions (Task 1's helpers), so the
   editor domain 8 wants is not needed here and must not be bolted on — the
   comment box must stay plain or the comment renderer starts showing markup
   (spec 14 D11).
4. **Locked state** — when `view.locked`, render an `EmptyState` titled
   "Post to unlock the discussion" with the message
   "You'll see everyone else's responses once you post yours." and no feed. It
   is the first thing a student sees and it is a mechanic, not a failure, so it
   gets a real empty state rather than a spinner or an error.
> **v1 parity 2026-10-09:** (R31) each post and comment shows `authorAvatarUrl` beside `authorDisplayName` (v1 `forum-query.ts:120-122,130-132`). (R28) the post `text` is sanitised HTML rendered as formatted rich text with an RN HTML renderer limited to v1's 14-tag allow-list (v1 `rich-text-view.tsx:11-31,43`; `forum-view.tsx:191`). (R26/R27) every comment is inline and every post arrives at once: drop the "N more" / "Show all comments" / "More comments" controls, `useForumComments`, and the "Load more" button. (R52) item 6's delete control renders only when `comment.authorUserId === user.id`. (R53) item 7's moderation note goes — no staff reader exists.

5. **Feed** — a `FlatList` of `Card`s: `authorDisplayName`, the post `text`,
   `formatDate(submittedAt)`, and the first comments with
   `{commentCount - comments.length} more` and a "Show all comments" press.
   Each post card owns a `const [expanded, setExpanded] = useState(false)` and
   calls `useForumComments(assignmentId, post.submissionPublicId, expanded)`;
   once expanded, it renders the flattened `data.pages` comments **instead of**
   the inline ones (they overlap — the first page starts at the same oldest
   comment), with a "More comments" button while `hasNextPage`, wired to
   `fetchNextPage`. A failed page shows the same `ErrorState`/`refetch` pair as
   the thread. Empty, unlocked feed →
   `EmptyState` "No one has posted yet."
   Pagination: a "Load more" `Button` shown while `nextCursor !== null`.
6. **Comments** — rendered only when `view.allowComments`. Per post: the
   comment list, a `Delete comment` icon button on any comment whose
   `canDelete` is true (two-press confirm, as elsewhere), and — when
   `post.canComment` — an `Input` labelled **Add a comment** with a `Comment`
   button.
7. **The moderation note.** Below the feed, for a LEADER/ADMIN/SUPER reader,
   render one line of body text: *"You can remove comments here. Removing a
   whole response isn't supported yet — ask the author to edit it."* That is
   decision D-14.4's residual gap, stated where the person who will hit it is
   standing, rather than only in this plan.

- [ ] **Step 4: Wire it into `assignment/[id]/index.tsx`**

> **v1 parity 2026-10-09:** (R53) staff branch renders `AssignmentStaffPanel` only — no `ForumThread` and no `isMentor` (`assignment/[id]/index.tsx:155`). (R33) on a FORUM assignment the header shows a "Forum" badge and the title with no due line: guard the due `Text` at `assignment/[id]/index.tsx:130-134` with `data.type !== "FORUM"` (v1 `jpc-space/src/app/student/assignments/[id]/page.tsx:53-60`).

Plan 5 Task 8 replaced this screen's default export with a role branch —
`{isStudent ? <SubmissionSection detail={data} /> : <AssignmentStaffPanel detail={data} />}`.
Verify: `grep -n "AssignmentStaffPanel" "apps/mobile/app/(app)/assignment/[id]/index.tsx"` → hits.
Add `import { ForumThread } from "../../../../src/components/ForumThread";`
(the file is one directory deeper than Plan 1 wrote it), add
`const isMentor = useSessionStore((s) => s.user?.role === "MENTOR");` beside
`isStudent`, and replace that one line with:

```tsx
          {/* The FORUM branch replaces the student's submission editor entirely —
              a forum assignment can never carry file attachments (domain 7
              forces maxFileSizeMb null and allowedMimeCategories empty for
              FORUM), and its response IS the submission. Staff keep Plan 5's
              authoring panel and read the thread below it (own === null);
              MENTOR has no forum audience (the API answers 403), so no thread. */}
          {isStudent ? (
            data.type === "FORUM" ? (
              <ForumThread assignmentId={data.id} />
            ) : (
              <SubmissionSection detail={data} />
            )
          ) : (
            <>
              <AssignmentStaffPanel detail={data} />
              {data.type === "FORUM" && !isMentor ? <ForumThread assignmentId={data.id} /> : null}
            </>
          )}
```

- [ ] **Step 5:** Run the suite → PASS; `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): forum thread with post-to-unlock, comments and staff removal"
```

---

## Stream C — JPC events (Tasks 9–10)

### Task 9: Events — one visibility predicate, a real write gate, a bounded window

**Files:**
- Create: `apps/backend/src/lib/queries/events.ts`
- Modify: `apps/backend/src/lib/org-time.ts` (Plan 3's file; add **one** function, `isOrgMidnight`)
- Modify: `apps/backend/src/routes/events.ts`
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: `apps/backend/src/__tests__/org-time.test.ts` (extend, unit)
- Test: `apps/backend/src/__tests__/integration/events-routes.test.ts`

**Interfaces:**
- Consumes: `isSuper`, `isAlumnus`, `isAdminOfSeason`, `isLeaderOfGroup` from `../lib/rbac`; `createJpcEventRequestSchema`, `updateJpcEventRequestSchema`, `mergedEventSchema`, `eventListQuerySchema` (Task 1); `config.orgTimezone` and `orgWallClock` (Plan 3); `orgDayKey` (Plan 4); `orgWallTime(date): string` and `orgWallClockToInstant(day, time): Date` (**Plan 5 Task 2**, all in `lib/org-time.ts` — consumed, never redefined).
- Produces:
  - in `lib/org-time.ts`: `isOrgMidnight(date: Date): boolean` only — beside Plan 4's `orgDayKey` and Plan 5's `orgWallTime` / `orgWallClockToInstant`, which this task **consumes** and does not redefine (a second definition is a duplicate-export compile error)
  - `viewerSeasonIds(user): Promise<number[] | "all">` and `eventVisibilityFilter(user): Promise<Prisma.JpcEventWhereInput>` in `lib/queries/events.ts`
  - `GET /api/v1/events`, `GET /api/v1/events/:id`, `POST /api/v1/events`, `PATCH /api/v1/events/:id`, `DELETE /api/v1/events/:id`

- [ ] **Step 1: Failing unit test for `isOrgMidnight`**

`orgWallTime` and `orgWallClockToInstant` already exist (Plan 5 Task 2, with
their own DST tests in this file). Verify before writing anything:
`grep -n "export function orgWallTime\|export function orgWallClockToInstant" apps/backend/src/lib/org-time.ts`
→ two hits. If either is missing, stop: Plan 5 has not run.

Add `isOrgMidnight` to the file's existing `from "../lib/org-time"` import in
`apps/backend/src/__tests__/org-time.test.ts` (`orgDayKey`, `orgWallTime` and
`orgWallClockToInstant` are already imported by Plans 4 and 5), then append:

```ts
// Every date below is in January, when Africa/Cairo is UTC+2 with no DST in
// force, so the assertions do not depend on Egypt's (reinstated, revisable)
// summer-time rule. If config.orgTimezone changes, these change with it.
describe("isOrgMidnight (Plan 14 — all-day events)", () => {
  it("recognises midnight in the organisation's zone, not the host's", () => {
    expect(isOrgMidnight(new Date("2099-01-14T22:00:00.000Z"))).toBe(true);
    expect(isOrgMidnight(new Date("2099-01-15T00:00:00.000Z"))).toBe(false);
  });

  it("agrees with Plan 5's composer: a null time is org midnight, a time is not", () => {
    expect(isOrgMidnight(orgWallClockToInstant("2099-01-20", null))).toBe(true);
    const instant = orgWallClockToInstant("2099-01-20", "09:05");
    expect(isOrgMidnight(instant)).toBe(false);
    expect(orgDayKey(instant)).toBe("2099-01-20");
    expect(orgWallTime(instant)).toBe("09:05");
  });

  it("is not fooled by a non-zero second", () => {
    expect(isOrgMidnight(new Date("2099-01-14T22:00:01.000Z"))).toBe(false);
  });
});
```

Run: `cd apps/backend && npx jest src/__tests__/org-time.test.ts` → FAIL (`isOrgMidnight` not exported).

- [ ] **Step 2: Implement it**

Append to `apps/backend/src/lib/org-time.ts`. It reads the parts through Plan
3's `orgWallClock` — do **not** add a second `Intl.DateTimeFormat` or a second
`partsFormatter` const (Plan 3 already declares one in this module; a second
`const` of that name does not compile):

```ts
/**
 * Is this instant midnight on the organisation's clock?
 *
 * Midnight is v1's only encoding of "all-day" — there is no `allDay` column and
 * adding one is a migration (ruling C1). v1 re-derived this in three separate
 * files with `getHours() !== 0 || getMinutes() !== 0`, each in the *viewer's*
 * timezone, against an instant the *server* had composed (spec 15 R19/R20), so
 * an all-day event stopped reading as all-day for anyone in another zone.
 * Ruling C2/X13: one zone, server-side, once. Plan 5's
 * `orgWallClockToInstant(day, null)` produces exactly these instants.
 */
export function isOrgMidnight(date: Date): boolean {
  const p = orgWallClock(date);
  return p.hour === 0 && p.minute === 0 && p.second === 0;
}
```

Run the unit test → PASS.

- [ ] **Step 3: Failing integration tests**

```ts
// apps/backend/src/__tests__/integration/events-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import {
  cleanupTestData,
  createTestSeason,
  createTestUser,
  login,
  testEventTitle,
} from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let otherSeasonId: number;
let allEventId: number;
let alumniEventId: number;
let seasonEventId: number;
let otherSeasonEventId: number;
let studentToken: string;
let alumnusToken: string;
let leaderToken: string;
let adminToken: string;
let mentorToken: string;
let superToken: string;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  const otherSeason = await createTestSeason();
  seasonId = season.id;
  otherSeasonId = otherSeason.id;

  const student = await createTestUser("evstudent", "STUDENT");
  const alumnus = await createTestUser("evalumnus", "STUDENT");
  const leader = await createTestUser("evleader", "LEADER");
  const admin = await createTestUser("evadmin", "ADMIN");
  const mentor = await createTestUser("evmentor", "MENTOR");
  const superUser = await createTestUser("evsuper", "SUPER");

  // An alumnus is role STUDENT with a graduationYear — the whole of spec 15's
  // headline defect turns on that. `graduationYear` is a column on User
  // (schema.prisma:111), not on StudentProfile, and login reads it from there
  // into the token's `graduationYear` claim.
  await db.user.update({ where: { id: alumnus.id }, data: { graduationYear: 2098 } });
  await db.studentProfile.create({
    data: { userId: alumnus.id, activeSeasonId: seasonId },
  });
  await db.studentProfile.create({
    data: { userId: student.id, activeSeasonId: seasonId },
  });

  const group = await db.group.create({
    data: { seasonId, name: "Group A", leaders: { create: { userId: leader.id } } },
    select: { id: true },
  });
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: student.id, groupId: group.id, status: "ACTIVE" },
      { seasonId, studentUserId: alumnus.id, groupId: group.id, status: "COMPLETED" },
    ],
  });

  const events = await db.$transaction([
    db.jpcEvent.create({
      data: {
        title: testEventTitle("all"),
        date: new Date("2099-06-01T00:00:00.000Z"),
        visibility: "ALL",
      },
      select: { id: true },
    }),
    db.jpcEvent.create({
      data: {
        title: testEventTitle("alumni"),
        date: new Date("2099-06-02T00:00:00.000Z"),
        visibility: "ALUMNI_ONLY",
      },
      select: { id: true },
    }),
    db.jpcEvent.create({
      data: {
        title: testEventTitle("season"),
        date: new Date("2099-06-03T00:00:00.000Z"),
        visibility: "SEASON",
        seasonId,
      },
      select: { id: true },
    }),
    db.jpcEvent.create({
      data: {
        title: testEventTitle("otherseason"),
        date: new Date("2099-06-04T00:00:00.000Z"),
        visibility: "SEASON",
        seasonId: otherSeason.id,
      },
      select: { id: true },
    }),
  ]);
  allEventId = events[0].id;
  alumniEventId = events[1].id;
  seasonEventId = events[2].id;
  otherSeasonEventId = events[3].id;

  studentToken = await login(app, student.email);
  alumnusToken = await login(app, alumnus.email);
  leaderToken = await login(app, leader.email);
  adminToken = await login(app, admin.email);
  mentorToken = await login(app, mentor.email);
  superToken = await login(app, superUser.email);
});

afterAll(async () => {
  await cleanupTestData();
});

const WINDOW = "?from=2099-01-01T00:00:00.000Z&to=2099-12-31T00:00:00.000Z";

async function idsFor(token: string): Promise<number[]> {
  const res = await request(app)
    .get(`/api/v1/events${WINDOW}`)
    .set("authorization", `Bearer ${token}`);
  expect(res.status).toBe(200);
  return (res.body.data.events as { id: number }[]).map((e) => e.id);
}

describe("GET /api/v1/events — visibility derived from the token", () => {
  it("shows ALL events to everyone", async () => {
    for (const token of [studentToken, alumnusToken, leaderToken, adminToken, mentorToken]) {
      expect(await idsFor(token)).toContain(allEventId);
    }
  });

  it("shows ALUMNI_ONLY events TO ALUMNI (spec 15 item 2 — the headline defect)", async () => {
    // In shipped v1, UpcomingEventsCard computes eligibility as
    // `user.role !== "STUDENT"` and an alumnus IS role STUDENT, so ALUMNI_ONLY
    // means staff-only on the only two surfaces alumni have.
    expect(await idsFor(alumnusToken)).toContain(alumniEventId);
    expect(await idsFor(leaderToken)).toContain(alumniEventId);
    expect(await idsFor(adminToken)).toContain(alumniEventId);
    // Still hidden from a current student, which is what the level means.
    expect(await idsFor(studentToken)).not.toContain(alumniEventId);
  });

  it("scopes SEASON events to the seasons a viewer holds", async () => {
    expect(await idsFor(studentToken)).toContain(seasonEventId);
    expect(await idsFor(studentToken)).not.toContain(otherSeasonEventId);
    expect(await idsFor(leaderToken)).toContain(seasonEventId);
    expect(await idsFor(adminToken)).toContain(seasonEventId);
    // A mentor holds none of the three claims, so sees no SEASON event —
    // v1's behaviour, kept: jpc-space/src/lib/jpc-events-query.ts:24-37
    // (`viewerSeasonIds` adds only activeSeasonId, seasonAdminIds and the
    // seasons of groupLeaderIds; a MENTOR token carries none). Spec 15 R51,
    // spec 19 R7. Spec 19 D19 recommends widening this; the coordinator ruled
    // v1 parity for this plan — a widening is a product decision, not a port.
    expect(await idsFor(mentorToken)).not.toContain(seasonEventId);
    // SUPER sees everything.
    expect(await idsFor(superToken)).toEqual(
      expect.arrayContaining([allEventId, alumniEventId, seasonEventId, otherSeasonEventId]),
    );
  });

  it("hides events on a soft-deleted season (spec 15 item 4)", async () => {
    await db.season.update({ where: { id: seasonId }, data: { deletedAt: new Date() } });
    expect(await idsFor(studentToken)).not.toContain(seasonEventId);
    await db.season.update({ where: { id: seasonId }, data: { deletedAt: null } });
  });

  it("hides an orphaned SEASON event from everyone but SUPER (spec 15 R54)", async () => {
    const orphan = await db.jpcEvent.create({
      data: {
        title: testEventTitle("orphan"),
        date: new Date("2099-06-05T00:00:00.000Z"),
        visibility: "SEASON",
        seasonId: null,
      },
      select: { id: true },
    });
    expect(await idsFor(studentToken)).not.toContain(orphan.id);
    expect(await idsFor(adminToken)).not.toContain(orphan.id);
    expect(await idsFor(superToken)).toContain(orphan.id);
  });

  it("cannot be widened by a query parameter", async () => {
    const res = await request(app)
      .get(`/api/v1/events${WINDOW}&visibility=ALUMNI_ONLY&includeAlumniOnly=true`)
      .set("authorization", `Bearer ${studentToken}`);
    expect((res.body.data.events as { id: number }[]).map((e) => e.id)).not.toContain(
      alumniEventId,
    );
  });

  it("windows on (endDate ?? date), so a multi-day event in progress stays (item 5)", async () => {
    const retreat = await db.jpcEvent.create({
      data: {
        title: testEventTitle("retreat"),
        date: new Date("2099-07-01T00:00:00.000Z"),
        endDate: new Date("2099-07-05T00:00:00.000Z"),
        visibility: "ALL",
      },
      select: { id: true },
    });
    // A window starting after the retreat began but before it ended.
    const res = await request(app)
      .get("/api/v1/events?from=2099-07-03T00:00:00.000Z&to=2099-07-10T00:00:00.000Z")
      .set("authorization", `Bearer ${studentToken}`);
    expect((res.body.data.events as { id: number }[]).map((e) => e.id)).toContain(retreat.id);
  });

  it("upcoming=true starts at today's org midnight and limit caps events, not total", async () => {
    // Spec 19 §7 / D19: the dashboards' UpcomingEventsCard. Three ALL events
    // dated far in the future plus one that ended in 2000.
    const future = await Promise.all(
      [1, 2, 3].map((n) =>
        db.jpcEvent.create({
          data: {
            title: testEventTitle(`upcoming${n}`),
            // Inside the default upper bound (now + 365d) so the window keeps them.
            date: new Date(Date.now() + n * 24 * 3600 * 1000),
            visibility: "ALL",
          },
          select: { id: true },
        }),
      ),
    );
    const past = await db.jpcEvent.create({
      data: {
        title: testEventTitle("past"),
        date: new Date("2000-01-01T10:00:00.000Z"),
        visibility: "ALL",
      },
      select: { id: true },
    });

    const res = await request(app)
      .get("/api/v1/events?upcoming=true&limit=2")
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    const ids = (res.body.data.events as { id: number }[]).map((e) => e.id);
    expect(ids).toHaveLength(2);
    expect(ids).not.toContain(past.id);
    // The uncapped read is the reference: the cap keeps its first two (date
    // ascending), and `total` is its length. Other visible staging rows may
    // exist, so the test compares against this read rather than fixed ids.
    const full = await request(app)
      .get("/api/v1/events?upcoming=true")
      .set("authorization", `Bearer ${studentToken}`);
    const fullIds = (full.body.data.events as { id: number }[]).map((e) => e.id);
    expect(fullIds).toEqual(expect.arrayContaining(future.map((e) => e.id)));
    expect(fullIds).not.toContain(past.id);
    expect(ids).toEqual(fullIds.slice(0, 2));
    expect(res.body.data.total).toBe(fullIds.length);
    expect(full.body.data.total).toBe(fullIds.length);
  });

  it("refuses upcoming together with from, and a limit outside 1–20", async () => {
    for (const qs of [
      "?upcoming=true&from=2099-01-01T00:00:00.000Z",
      "?limit=0",
      "?limit=21",
    ]) {
      const res = await request(app)
        .get(`/api/v1/events${qs}`)
        .set("authorization", `Bearer ${studentToken}`);
      expect(res.status).toBe(400);
    }
  });

  it("derives allDay, dayKey and time server-side, in the org zone", async () => {
    const midnight = await db.jpcEvent.create({
      data: {
        title: testEventTitle("orgmidnight"),
        // 00:00 on 2099-01-20 in Africa/Cairo (UTC+2 in January).
        date: new Date("2099-01-19T22:00:00.000Z"),
        visibility: "ALL",
      },
      select: { id: true },
    });
    const res = await request(app)
      .get(`/api/v1/events${WINDOW}`)
      .set("authorization", `Bearer ${superToken}`);
    type Row = { id: number; allDay: boolean; dayKey: string; time: string | null };
    const rows = res.body.data.events as Row[];

    // 00:00Z is not org midnight — NOT all-day, and its org time is shown.
    const utcMidnight = rows.find((e) => e.id === allEventId);
    expect(utcMidnight?.allDay).toBe(false);
    expect(utcMidnight?.dayKey).toBe("2099-06-01");
    expect(utcMidnight?.time).not.toBeNull();

    // Org midnight IS all-day, and its day is the org day — the 20th, although
    // the stored instant is on the 19th in UTC. A client bucketing by its own
    // zone would put this on the wrong day; this field is why it never has to.
    const orgMidnight = rows.find((e) => e.id === midnight.id);
    expect(orgMidnight).toMatchObject({ allDay: true, dayKey: "2099-01-20", time: null });
  });
});

// v1 parity 2026-10-09 (R70): DELETE this describe with GET /events/:id —
// v1 has no event detail (jpc-space season-calendar.tsx:374-380,458-487).
// Add instead: GET /events with no from/to returns an event dated now − 400d
// and one dated now + 800d (R57), and GET /events/:id/photo is 404 for a viewer
// the visibility predicate excludes (R31).
describe("GET /api/v1/events/:id", () => {
  it("serves the detail v1 has no page for", async () => {
    const res = await request(app)
      .get(`/api/v1/events/${allEventId}`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: allEventId, canManage: false });
    expect(res.body.data).toHaveProperty("description");
  });

  it("applies the same visibility predicate to the row", async () => {
    const res = await request(app)
      .get(`/api/v1/events/${alumniEventId}`)
      .set("authorization", `Bearer ${studentToken}`);
    // Not 403: a current student must not be able to tell an event they may not
    // see from one that does not exist.
    expect(res.status).toBe(404);
  });
});

describe("event writes are SUPER-only (spec 15 R1/R3)", () => {
  const body = {
    title: "space-v2-test-created",
    day: "2099-01-20",
    time: null,
    endDay: null,
    description: "space-v2-test description",
    url: null,
    visibility: "ALL" as const,
    seasonId: null,
  };

  it("creates an all-day event at org midnight", async () => {
    const res = await request(app)
      .post("/api/v1/events")
      .set("authorization", `Bearer ${superToken}`)
      .send({ ...body, title: `space-v2-test-${Date.now()}` });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ allDay: true, dayKey: "2099-01-20", time: null });
    // Africa/Cairo midnight on 2099-01-20 is 22:00Z on the 19th (UTC+2).
    expect(res.body.data.date).toBe("2099-01-19T22:00:00.000Z");
    // v1 returns only { success: true } and the client refetches (R39).
    expect(res.body.data.id).toEqual(expect.any(Number));
  });

  it("composes a timed event in the org zone, not the caller's", async () => {
    // The request carries no zone at all — the server's org zone is the only
    // one that can apply, so a SUPER travelling abroad cannot shift the event.
    const res = await request(app)
      .post("/api/v1/events")
      .set("authorization", `Bearer ${superToken}`)
      .send({ ...body, title: `space-v2-test-timed-${Date.now()}`, time: "18:30" });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ allDay: false, dayKey: "2099-01-20", time: "18:30" });
    expect(res.body.data.date).toBe("2099-01-20T16:30:00.000Z");
  });

  it("refuses create, update and delete to an ADMIN", async () => {
    const create = await request(app)
      .post("/api/v1/events")
      .set("authorization", `Bearer ${adminToken}`)
      .send(body);
    expect(create.status).toBe(403);

    const patch = await request(app)
      .patch(`/api/v1/events/${allEventId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ title: "space-v2-test-renamed" });
    expect(patch.status).toBe(403);

    const del = await request(app)
      .delete(`/api/v1/events/${allEventId}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(del.status).toBe(403);
  });

  it("accepts a partial update and re-refines against the merged row", async () => {
    const target = await db.jpcEvent.create({
      data: {
        title: testEventTitle("patchable"),
        // 18:30 on 2099-01-21, org time.
        date: new Date("2099-01-21T16:30:00.000Z"),
        visibility: "ALL",
      },
      select: { id: true },
    });

    // v1 reuses the create schema for update, so a partial is impossible.
    const ok = await request(app)
      .patch(`/api/v1/events/${target.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ description: "space-v2-test-updated" });
    expect(ok.status).toBe(200);
    expect(ok.body.data.title).toContain("space-v2-test-");
    // An untouched day/time survives the merge exactly.
    expect(ok.body.data.date).toBe("2099-01-21T16:30:00.000Z");

    // Changing only the time keeps the stored org day.
    const retimed = await request(app)
      .patch(`/api/v1/events/${target.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ time: "09:00" });
    expect(retimed.body.data).toMatchObject({ dayKey: "2099-01-21", time: "09:00" });

    // An end day before the stored start day is refused against the merge.
    const backwards = await request(app)
      .patch(`/api/v1/events/${target.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ endDay: "2099-01-01" });
    expect(backwards.status).toBe(400);

    // SEASON without a season, where the season would have to come from the
    // stored row — and does not.
    const bad = await request(app)
      .patch(`/api/v1/events/${target.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ visibility: "SEASON" });
    expect(bad.status).toBe(400);
  });

  it("detaches the season when visibility leaves SEASON (v1 R13)", async () => {
    const target = await db.jpcEvent.create({
      data: {
        title: testEventTitle("detach"),
        date: new Date("2099-09-02T00:00:00.000Z"),
        visibility: "SEASON",
        seasonId,
      },
      select: { id: true },
    });
    await request(app)
      .patch(`/api/v1/events/${target.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ visibility: "ALL" });

    const row = await db.jpcEvent.findUnique({
      where: { id: target.id },
      select: { seasonId: true },
    });
    expect(row?.seasonId).toBeNull();
  });

  it("404s a stale id instead of throwing a raw Prisma error (spec 15 item 11)", async () => {
    // v1's delete does not read the row first, so P2025 reaches the client as
    // an unhandled server-action error (R36).
    const del = await request(app)
      .delete("/api/v1/events/987654321")
      .set("authorization", `Bearer ${superToken}`);
    expect(del.status).toBe(404);
    expect(del.body.error.code).toBe("not_found");
  });

  it("deletes for real — there is no soft delete on this model", async () => {
    const doomed = await db.jpcEvent.create({
      data: {
        title: testEventTitle("doomed"),
        date: new Date("2099-09-03T00:00:00.000Z"),
        visibility: "ALL",
      },
      select: { id: true },
    });
    const res = await request(app)
      .delete(`/api/v1/events/${doomed.id}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deleted: true });
    expect(await db.jpcEvent.count({ where: { id: doomed.id } })).toBe(0);
  });
});
```

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern events-routes` → FAIL.

- [ ] **Step 4: The query module**

```ts
// apps/backend/src/lib/queries/events.ts
import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import type { SessionUser } from "../auth/tokens";
import { isAdminOfSeason, isAlumnus, isLeaderOfGroup, isSuper } from "../rbac";

/**
 * The seasons a viewer may see SEASON-scoped events for.
 *
 * Ported from v1's `viewerSeasonIds`, with ruling C7 applied: v1 reads
 * `user.seasonAdminIds` and `user.groupLeaderIds` straight off the token, and
 * those arrays are grants rather than identity — `loadScopes` fills them from
 * join tables with no role filter, so a row naming a student is reachable.
 * Every claim here is paired with the role that can legitimately hold it.
 */
export async function viewerSeasonIds(user: SessionUser): Promise<number[] | "all"> {
  if (isSuper(user)) return "all";
  const ids = new Set<number>();
  if (user.role === "STUDENT" && user.activeSeasonId) ids.add(user.activeSeasonId);
  for (const seasonId of user.seasonAdminIds) {
    if (isAdminOfSeason(user, seasonId)) ids.add(seasonId);
  }
  if (user.role === "LEADER" && user.groupLeaderIds.length > 0) {
    const groups = await db.group.findMany({
      where: { id: { in: user.groupLeaderIds } },
      select: { id: true, seasonId: true },
    });
    for (const g of groups) {
      if (isLeaderOfGroup(user, g.id)) ids.add(g.seasonId);
    }
  }
  return [...ids];
}

/**
 * The one visibility formula.
 *
 * v1 has two, at six call sites: four calendar pages pass a hardcoded literal
 * and `UpcomingEventsCard` computes `user.role !== "STUDENT"` — which is false
 * for an alumnus, because an alumnus is role STUDENT with a graduationYear. So
 * in shipped v1, ALUMNI_ONLY means "visible to staff, hidden from alumni", the
 * exact inverse of its name, on the only two surfaces alumni have (spec 15
 * R44/R45, §10 item 2). Deriving it here, from the token, means there is one
 * answer and no caller can widen it.
 *
 * SUPER is unfiltered so the manager list can show orphans and archived-season
 * events. Everyone else gets `season: { deletedAt: null }` on the SEASON branch
 * (item 4 — a soft-deleted season's events are a bug in any reading), which
 * also hides an R54 orphan, since a null relation cannot satisfy a relation
 * filter.
 */
export async function eventVisibilityFilter(
  user: SessionUser,
): Promise<Prisma.JpcEventWhereInput> {
  if (isSuper(user)) return {};

  const branches: Prisma.JpcEventWhereInput[] = [{ visibility: "ALL" }];
  if (isAlumnus(user) || user.role !== "STUDENT") {
    branches.push({ visibility: "ALUMNI_ONLY" });
  }

  const seasonIds = await viewerSeasonIds(user);
  if (seasonIds !== "all" && seasonIds.length > 0) {
    branches.push({
      visibility: "SEASON",
      seasonId: { in: seasonIds },
      season: { deletedAt: null },
    });
  }
  return { OR: branches };
}

/**
 * The window, on `(endDate ?? date)`.
 *
 * v1 has two different windows for the same rows — the agenda filters on `date`
 * while the dashboard card filters on `(endDate ?? date)` — so a five-day
 * retreat vanishes from the calendar on day two while the card two screens away
 * still shows it (spec 15 R66, §10 item 5). One rule, applied here, used by
 * every surface. Prisma cannot express COALESCE in a filter, so the null case
 * is spelled out.
 */
export function eventWindowFilter(from: Date, to: Date): Prisma.JpcEventWhereInput {
  return {
    AND: [
      { date: { lte: to } },
      { OR: [{ endDate: { gte: from } }, { endDate: null, date: { gte: from } }] },
    ],
  };
}
```

- [ ] **Step 5: The five routes**

A shared mapper above them turns a row into the list or detail shape — the one
place `allDay` is derived and the one place `imagePath` is *not* selected:

```ts
const LIST_SELECT = {
  id: true,
  title: true,
  date: true,
  endDate: true,
  url: true,
  visibility: true,
  seasonId: true,
  season: { select: { code: true, title: true } },
} as const;

// `imagePath` is deliberately absent from every select in this file. Uploads are
// off (ENABLE_UPLOADS defaults false) and v1 serves event photos through
// /api/uploads/[...path], which gates on nothing but "is logged in" — so any
// authenticated user who guesses a key can fetch a photo attached to an event
// they cannot see (spec 15 R32). The storage key never crosses this wire.
```

> **v1 parity 2026-10-09:** (R57) with no `from`/`to`, apply **no** window — every visible event, `date` asc (v1 `jpc-events-query.ts:43-69`); delete the `now + 365d` / `now − 30d` defaults (`routes/events.ts:103-108`). (R58/R31) `LIST_SELECT` also selects `description`, `createdById`, `season.title` and whether `imagePath` is set; `toListItem` returns v1's single row shape with `description`, `createdById`, `seasonTitle`, `endTime` and `imageUrl: hasPhoto ? \`/api/v1/events/${id}/photo\` : null` (the key itself still never leaves the server). Add `GET /:id/photo`: `findFirst` with `eventVisibilityFilter` → 404, then stream the stored file (allowed with uploads off). (R70) drop `GET /:id` and the detail shape; POST/PATCH respond with the list row. (R14/R18/R81) on a failed parse, POST and PATCH return 400 with `message` = the **first** Zod issue's message (v1 `jpc-event-actions.ts:79,119`). (R6/R17/R11) compose `endDate = body.endDay ? orgWallClockToInstant(body.endDay, body.endTime) : null` (`routes/events.ts:164`) and refuse `endDate < date`.

- **`GET /`** — parse `eventListQuerySchema` → 400 `bad_request`. Bounds:
  `to` defaults to `now + 365d`; `from` defaults to `now − 30d`, **or**, when
  `upcoming` is true, to the start of today in the org zone —
  `orgWallClockToInstant(orgDayKey(new Date()), null)` (spec 19 §7, C2/X13;
  v1's card used `startOfDay` in the host's zone, spec 19 R8). Spec 15 item 10:
  v1 returns every event ever created on every calendar render, for every role.
  `const where = { AND: [await eventVisibilityFilter(user), eventWindowFilter(from, to)] }`;
  then, together,
  `db.jpcEvent.findMany({ where, orderBy: [{ date: "asc" }, { id: "asc" }], ...(limit ? { take: limit } : {}), select: LIST_SELECT })`
  and `db.jpcEvent.count({ where })` (the count ignores `limit`). Map each row
  with the one mapper:

```ts
function toListItem(row: {
  id: number;
  title: string;
  date: Date;
  endDate: Date | null;
  url: string | null;
  visibility: JpcVisibility;
  seasonId: number | null;
  season: { code: string; title: string } | null;
}) {
  // Every day and time on the wire is computed here, in config.orgTimezone
  // (ruling X13) — the client buckets and labels by these strings and never
  // turns `date` into a day itself.
  const allDay = isOrgMidnight(row.date);
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    endDate: row.endDate,
    dayKey: orgDayKey(row.date),
    endDayKey: row.endDate ? orgDayKey(row.endDate) : null,
    time: allDay ? null : orgWallTime(row.date),
    allDay,
    url: row.url,
    visibility: row.visibility,
    seasonId: row.seasonId,
    seasonCode: row.season?.code ?? null,
  };
}
```

  Respond `{ events: rows.map(toListItem), total }` — the
  `jpcEventListResponseSchema` shape.
- **`GET /:id`** — `parseId`; `findFirst({ where: { AND: [{ id }, await eventVisibilityFilter(user)] } })`;
  missing → **404, not 403**, so a caller cannot distinguish an event they may
  not see from one that does not exist; add `description`, `seasonTitle` and
  `canManage: isSuper(user)`.
- **`POST /`** — `if (!isSuper(user)) return apiError(res, "forbidden", …, 403)`
  **first**, then parse. v1 enforces this inside the action rather than by page
  placement, which is one of the few places it gets the shape right (R3) — but
  it `throw`s a bare `Error("Forbidden")` that the client's error branch never
  sees (R2), so the envelope is the fix. Compose the instants on the server,
  in the org zone (D-15.6, ruling X13):

```ts
  // The body carries wall-clock fields and no zone; the org zone is the only
  // one that can apply. time === null → org midnight, v1's all-day encoding.
  const date = orgWallClockToInstant(body.day, body.time);
  // v1 parity 2026-10-09 (R6/R17): the end is endDay + optional endTime, as v1
  // (jpc-space src/lib/jpc-event-actions.ts:36-38); endTime alone is dropped.
  const endDate = body.endDay ? orgWallClockToInstant(body.endDay, body.endTime) : null;
  // v1 force-nulls the season whenever visibility is not SEASON (R13); kept,
  // because a detached seasonId on an ALL event is unreachable data.
  const seasonId = body.visibility === "SEASON" ? body.seasonId : null;
```

  Create with `createdById: user.userId` and respond with the **detail shape**,
  201 — v1 returns `{ success: true }` and makes the client refetch (R39).
- **`PATCH /:id`** — SUPER gate; `findUnique` → 404; parse with
  `updateJpcEventRequestSchema`; **merge the patch onto the stored row, read
  back as wall-clock fields, and re-run both refinements against the merged
  values**:

```ts
  const stored = {
    title: row.title,
    day: orgDayKey(row.date),
    time: isOrgMidnight(row.date) ? null : orgWallTime(row.date),
    endDay: row.endDate ? orgDayKey(row.endDate) : null,
    description: row.description,
    url: row.url,
    visibility: row.visibility,
    seasonId: row.seasonId,
  };
  // Drop undefined keys so an omitted field keeps its stored value.
  const patch = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined),
  );
  const merged = mergedEventSchema.safeParse({ ...stored, ...patch });
  if (!merged.success) return apiError(res, "bad_request", "Invalid event.", 400);
```

  then compose `date`/`endDate` from `merged.data` exactly as POST does, apply
  the same season force-null, `update`, and respond with the detail shape. `createdById` is untouched: it means "who first
  authored this", and there is no `updatedById` column to add under C1
  (spec 15 R34).
- **`DELETE /:id`** — SUPER gate; `findUnique` → 404 (v1 does not read first, so
  a stale id throws `P2025` at the client — R36); hard `delete`; respond
  `{ deleted: true }`. Hard because there is no `deletedAt` on this model and
  adding one is a migration; note in the OpenAPI description that a deleted
  event is unrecoverable, and that its stored photo (if any) is left behind
  exactly as v1 leaves it — the blob lifecycle belongs with the CMS work.

- [ ] **Step 6:** Run the suite → PASS; turbo trio → clean.

- [ ] **Step 7: OpenAPI, same commit** — the five paths plus `JpcEventListItem`,
`JpcEventDetail`, `CreateJpcEventRequest` and `UpdateJpcEventRequest`. Say that
visibility is derived from the token and cannot be widened by a parameter; that
the window is `(endDate ?? date)` and defaults when omitted; that `upcoming=true`
starts the window at today's org midnight, `limit` (1–20) caps `events` and
`total` is counted before the cap; that `allDay` is
server-derived against the organisation timezone; and that the photo endpoints
are deliberately absent while uploads are disabled.

- [ ] **Step 8: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): JPC events with one token-derived visibility rule and a bounded window"
```

---

### Task 10: Events — the manager, the detail v1 never had, and the calendar merge

> **v1 parity 2026-10-09 (R70):** there is **no event detail screen** — v1 has none (`jpc-space/src/components/sessions/season-calendar.tsx:374-380,458-487`, `upcoming-events-card.tsx:52-58`). Do not create (delete) `app/(app)/event/[id].tsx`, its `DETAIL_ROUTE_NAMES` entry and app-layout test, `useEventDetail` / `queryKeys.events.detail`, the "event detail screen" tests and Step 1. Event rows and cards call `Linking.openURL(event.url)` when `url` is set and are inert otherwise; SUPER edits in the manager list (`events.tsx`). The `jpcEventDetailSchema` consumer goes too.

**Files:**
- Create: `apps/mobile/src/hooks/use-events.ts`
- Create: `apps/mobile/app/(app)/event/[id].tsx`
- Modify: `apps/mobile/app/(app)/events.tsx` (replace the placeholder)
- Modify: `apps/mobile/app/(app)/calendar.tsx` (**Plan 6 Task 9's** role-branched rewrite of Plan 4's screen gains events)
- Modify: `apps/mobile/src/lib/day-groups.ts` (Plan 6's; append `groupCalendarByDay`)
- Modify: `apps/mobile/app/(app)/_layout.tsx` (`DETAIL_ROUTE_NAMES` gains `"event/[id]"`)
- Modify: `apps/mobile/src/__tests__/placeholder-screens.test.tsx` (drop `events`)
- Modify: `apps/mobile/src/__tests__/app-layout.test.tsx` (the new detail route)
- Test: `apps/mobile/src/__tests__/events-screen.test.tsx`
- Test: extend `apps/mobile/src/__tests__/calendar-screen.test.tsx` (Plan 4's file, as Plan 6 Task 9 left it)

**Interfaces:**
- Consumes: `queryKeys.events` (Task 2); `jpcEventListItemSchema`, `jpcEventDetailSchema` (Task 1); Task 9's endpoints; Plan 6 Task 9's `calendar.tsx` (`PinnedSeasonCalendar`, `RangeSessions`, `SessionDays`), `useSessionRange` and `groupSessionsByDay` / `DayGroup` in `src/lib/day-groups.ts`; Plan 5's `formatWallTime`; Plan 4's `formatDayKey`; `DETAIL_ROUTE_NAMES` (Plan 1).
- Produces: `useEvents()`, `useUpcomingEvents(limit)` (for Plan 16), `useEventDetail(id)`, `useCreateEvent()`, `useUpdateEvent(id)`, `useDeleteEvent()`; `groupCalendarByDay(sessions, events): CalendarDayGroup[]` and `CalendarEntry` in `src/lib/day-groups.ts`; the route `/event/[id]`.

- [ ] **Step 1: Register the detail route**

Extend the `DETAIL_ROUTE_NAMES` assertion in `app-layout.test.tsx` with
`"event/[id]"`; run → FAIL; create
`apps/mobile/app/(app)/event/[id].tsx` (Step 4 fills it — a stub of Plan 1
Task 2's exact shape is enough here), append `"event/[id]"` to the const, run
`pnpm turbo routes:generate --filter=@space/mobile`, run → PASS.

- [ ] **Step 2: Write the failing tests**

```tsx
// apps/mobile/src/__tests__/events-screen.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ id: "3" }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import EventsScreen from "../../app/(app)/events";
import EventDetailScreen from "../../app/(app)/event/[id]";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const listRow = {
  id: 3,
  title: "Summer retreat",
  date: "2099-06-30T21:00:00.000Z",
  endDate: "2099-07-04T21:00:00.000Z",
  dayKey: "2099-07-01",
  endDayKey: "2099-07-05",
  time: null,
  allDay: true,
  url: null,
  visibility: "ALL" as const,
  seasonId: null,
  seasonCode: null,
};

const detailRow = {
  ...listRow,
  description: "Five days away.",
  seasonTitle: null,
  canManage: true,
};

const superSession = {
  user: { id: 1, name: "Su", email: "su@jpc.test", role: "SUPER" as const, avatarPath: null, hasPassword: true },
  scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: null, graduationYear: null },
};

const alumnusSession = {
  user: { id: 8, name: "Al", email: "al@jpc.test", role: "STUDENT" as const, avatarPath: null, hasPassword: true },
  scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: null, graduationYear: 2098 },
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  get.mockResolvedValue({ data: { data: { events: [listRow], total: 1 } } });
});

describe("events screen", () => {
  it("shows SUPER the manager with a create form", async () => {
    useSessionStore.setState(superSession);
    post.mockResolvedValue({ data: { data: detailRow } });

    renderWithProviders(<EventsScreen />);

    expect(await screen.findByText("Summer retreat")).toBeTruthy();
    fireEvent.press(screen.getByText("New event"));
    fireEvent.changeText(screen.getByLabelText("Title"), "Graduation");
    fireEvent.changeText(screen.getByLabelText("Date"), "2099-09-01");
    fireEvent.changeText(screen.getByLabelText("Time"), "18:30");
    fireEvent.press(screen.getByText("Create event"));

    // Wall-clock fields only — the device composes no instant and applies no
    // zone; the server does that in the org zone (ruling X13).
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/events", {
        title: "Graduation",
        day: "2099-09-01",
        time: "18:30",
        endDay: null,
        description: null,
        url: null,
        visibility: "ALL",
        seasonId: null,
      }),
    );
  });

  // v1 parity 2026-10-09 (R14/R18): invert — the request IS sent, and the
  // server's 400 message renders once above the actions, not on the Time field.
  it("refuses a malformed time before any request", async () => {
    useSessionStore.setState(superSession);
    renderWithProviders(<EventsScreen />);

    fireEvent.press(await screen.findByText("New event"));
    fireEvent.changeText(screen.getByLabelText("Title"), "Graduation");
    fireEvent.changeText(screen.getByLabelText("Date"), "2099-09-01");
    fireEvent.changeText(screen.getByLabelText("Time"), "6pm");
    fireEvent.press(screen.getByText("Create event"));

    await waitFor(() => expect(post).not.toHaveBeenCalled());
    expect(screen.getByLabelText("Time").props.accessibilityHint).toContain("HH:mm");
  });

  it("shows a non-SUPER role the same list with no write controls", async () => {
    // Deep-linking here must not crash: /events is SUPER's sidebar entry, and
    // ALUMNI's "Events" points at /calendar (packages/shared/src/navigation.ts).
    useSessionStore.setState(alumnusSession);

    renderWithProviders(<EventsScreen />);

    expect(await screen.findByText("Summer retreat")).toBeTruthy();
    expect(screen.queryByText("New event")).toBeNull();
  });

  it("renders an empty state rather than nothing (spec 15 R75)", async () => {
    useSessionStore.setState(alumnusSession);
    get.mockResolvedValue({ data: { data: { events: [], total: 0 } } });

    renderWithProviders(<EventsScreen />);
    expect(await screen.findByText("No upcoming events")).toBeTruthy();
  });

  // v1 parity 2026-10-09 (R70): replace with "opens the event's url with
  // Linking, and does nothing for an event without one".
  it("navigates to the detail v1 has no page for", async () => {
    useSessionStore.setState(alumnusSession);
    renderWithProviders(<EventsScreen />);
    fireEvent.press(await screen.findByText("Summer retreat"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/event/[id]", params: { id: "3" } });
  });
});

describe("event detail screen", () => {
  it("shows the description and the date range", async () => {
    useSessionStore.setState(alumnusSession);
    get.mockResolvedValue({ data: { data: detailRow } });

    renderWithProviders(<EventDetailScreen />);

    expect(await screen.findByText("Five days away.")).toBeTruthy();
    // All-day, so no time is rendered — the boolean comes from the server, and
    // the label is built from the server's org days, not from `date` (whose
    // UTC day is June 30th).
    expect(screen.getByText("Jul 1, 2099 – Jul 5, 2099")).toBeTruthy();
    expect(screen.queryByText("Delete event")).toBeNull();
  });

  it("offers edit and delete to SUPER only", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue({ data: { data: detailRow } });

    renderWithProviders(<EventDetailScreen />);
    expect(await screen.findByText("Delete event")).toBeTruthy();
  });
});
```

And, in `calendar-screen.test.tsx` (Plan 4's file as **Plan 6 Task 9** left
it — reuse its `session(id, title, startsAt, dayKey)` helper, which Plan 6
Task 5 gave `startTime`, its `studentSession`, its `range(...)` helper, `get`
and `makeSession`):

First, **edit Plan 4's** "shows an empty state for a student with no season and
fetches nothing" case. The pinned calendar now always asks for events (an
alumnus is a STUDENT with no season, and ALUMNI's nav labels `/calendar`
"Events"), so "fetches nothing" becomes "fetches no sessions". Replace its last
line, `expect(get).not.toHaveBeenCalled();`, with:

```tsx
  // Events are org-wide and need no season; sessions do and are not fetched.
  expect(get).toHaveBeenCalledTimes(1);
  expect(get).toHaveBeenCalledWith("/api/v1/events");
```

(Plan 6's LEADER-with-no-groups and MENTOR cases keep
`expect(get).not.toHaveBeenCalled()`: both return before any branch component
mounts, so no events request is made.) Then append:

```tsx
const eventRow = (id: number, title: string, date: string, dayKey: string, time: string | null) => ({
  id, title, date, endDate: null, dayKey, endDayKey: null, time, allDay: time === null,
  url: null, visibility: "ALL" as const, seasonId: null, seasonCode: null,
});

describe("calendar — JPC events merged into the day buckets (Plan 14)", () => {
  it("interleaves JPC events with a student's sessions in the same day buckets", async () => {
    useSessionStore.setState(studentSession);
    get.mockImplementation((url: string) =>
      url.startsWith("/api/v1/events")
        ? Promise.resolve({
            data: { data: { events: [eventRow(3, "Summer retreat", "2099-03-01T09:00:00.000Z", "2099-03-01", "11:00")], total: 1 } },
          })
        : Promise.resolve({
            data: { data: { sessions: [session(1, "Kickoff", "2099-03-01T18:00:00.000Z", "2099-03-01")] } },
          }),
    );

    renderWithProviders(<CalendarScreen />);

    // One day header, both entries under it, event first (09:00Z before 18:00Z).
    expect(await screen.findByText("Summer retreat")).toBeTruthy();
    expect(screen.getByText("Kickoff")).toBeTruthy();
    expect(screen.getAllByText("Mar 1, 2099")).toHaveLength(1);
    const titles = screen.getAllByText(/^(Summer retreat|Kickoff)$/).map((n) => n.props.children);
    expect(titles).toEqual(["Summer retreat", "Kickoff"]);

    fireEvent.press(screen.getByText("Summer retreat"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/event/[id]", params: { id: "3" } });
  });

  it("still renders the calendar when the events request fails", async () => {
    // Two independent queries on one screen: an events outage must not take the
    // session calendar down with it.
    useSessionStore.setState(studentSession);
    get.mockImplementation((url: string) =>
      url.startsWith("/api/v1/events")
        ? Promise.reject(new Error("boom"))
        : Promise.resolve({
            data: { data: { sessions: [session(1, "Kickoff", "2099-03-01T18:00:00.000Z", "2099-03-01")] } },
          }),
    );

    renderWithProviders(<CalendarScreen />);
    expect(await screen.findByText("Kickoff")).toBeTruthy();
  });

  // v1 parity 2026-10-09 (R73): an alumnus's calendar tab renders only the
  // upcoming-events card — assert no sessions request is made and only events
  // with (endDate ?? date) >= today appear (at most four).
  it("shows an alumnus with no season the org's events instead of an empty wall", async () => {
    useSessionStore.setState({ ...studentSession, scopes: { ...studentSession.scopes, activeSeasonId: null } });
    get.mockImplementation((url: string) =>
      url.startsWith("/api/v1/events")
        ? Promise.resolve({
            data: { data: { events: [eventRow(4, "Alumni dinner", "2099-03-05T17:00:00.000Z", "2099-03-05", "19:00")], total: 1 } },
          })
        : Promise.reject(new Error(`unexpected GET ${url}`)),
    );

    renderWithProviders(<CalendarScreen />);
    expect(await screen.findByText("Alumni dinner")).toBeTruthy();
    expect(screen.queryByText("No season to show")).toBeNull();
  });

  it("shows a windowed (SUPER) calendar only the events inside its org-day window", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    get.mockImplementation((url: string) =>
      url.startsWith("/api/v1/events")
        ? Promise.resolve({
            data: {
              data: {
                events: [
                  eventRow(5, "In window", "2099-03-02T08:00:00.000Z", "2099-03-02", "10:00"),
                  eventRow(6, "Out of window", "2099-06-01T08:00:00.000Z", "2099-06-01", "10:00"),
                ],
                total: 2,
              },
            },
          })
        : Promise.resolve(range([session(1, "Kickoff", "2099-03-01T18:00:00.000Z", "2099-03-01")])),
    );

    renderWithProviders(<CalendarScreen />);
    expect(await screen.findByText("In window")).toBeTruthy();
    expect(screen.getByText("Kickoff")).toBeTruthy();
    expect(screen.queryByText("Out of window")).toBeNull();
  });
});
```

Run both suites → FAIL.

- [ ] **Step 3: The hooks**

```ts
// apps/mobile/src/hooks/use-events.ts
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  deleteJpcEventResponseSchema,
  jpcEventDetailSchema,
  jpcEventListResponseSchema,
  type CreateJpcEventBody,
  type JpcEventDetail,
  type JpcEventListItem,
  type JpcEventListResponse,
  type UpdateJpcEventBody,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

/**
 * No `from`/`to` from the client.
 *
 * v1 parity 2026-10-09 (R57): no server default window any more — the read
 * returns every visible event, as v1.
 *
 * The server defaults the window to [now − 30d, now + 365d]. Deriving calendar
 * bounds on the device would put a wall-clock decision on the wrong side of
 * ruling C2, and v1's unbounded read (every event ever created, on every
 * calendar render) is what the window exists to stop.
 */
export function useEvents(): UseQueryResult<JpcEventListItem[]> {
  return useQuery({
    queryKey: queryKeys.events.list(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/events");
      return jpcEventListResponseSchema.parse(res.data.data).events;
    },
  });
}

/**
 * The dashboards' "upcoming events" read (spec 19 §7): today onwards in the org
 * zone, capped server-side, with `total` for the SUPER tile. Built here so
 * Plan 16 composes it unchanged; nothing in this plan renders it.
 */
export function useUpcomingEvents(limit: number): UseQueryResult<JpcEventListResponse> {
  return useQuery({
    queryKey: queryKeys.events.upcoming(limit),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/events?upcoming=true&limit=${limit}`);
      return jpcEventListResponseSchema.parse(res.data.data);
    },
  });
}

export function useEventDetail(id: number | null): UseQueryResult<JpcEventDetail> {
  return useQuery({
    queryKey: queryKeys.events.detail(id ?? -1),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/events/${id}`);
      return jpcEventDetailSchema.parse(res.data.data);
    },
    enabled: id !== null,
  });
}

/**
 * Every write invalidates the whole events subtree, which is what the calendar
 * reads too. v1 revalidates five hardcoded paths and misses /alumni/calendar
 * and all six dashboards (spec 15 R38) — a prefix invalidation cannot have that
 * class of omission.
 */
function useInvalidateEvents() {
  const queryClient = useQueryClient();
  return (): void => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
  };
}

export function useCreateEvent() {
  const invalidate = useInvalidateEvents();
  return useMutation({
    mutationFn: async (body: CreateJpcEventBody) => {
      const res = await apiClient.post("/api/v1/events", body);
      return jpcEventDetailSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useUpdateEvent(id: number) {
  const invalidate = useInvalidateEvents();
  return useMutation({
    mutationFn: async (body: UpdateJpcEventBody) => {
      const res = await apiClient.patch(`/api/v1/events/${id}`, body);
      return jpcEventDetailSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useDeleteEvent() {
  const invalidate = useInvalidateEvents();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiClient.delete(`/api/v1/events/${id}`);
      return deleteJpcEventResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}
```

- [ ] **Step 4: The two screens**

**`events.tsx`** — one route, role branches inside, exactly as `/calendar` does:
- `useEvents()` → `LoadingState` / `ErrorState` (`onRetry` → `refetch`) /
  a list of `Card`s (v1 parity 2026-10-09, R70: not pushing `/event/[id]` — a
  card opens `url` when set; SUPER gets Edit / Delete inline, as v1's manager). Each card: title, the date
  label — `formatDayKey(dayKey)`, or
  `formatDayKey(dayKey) + " – " + formatDayKey(endDayKey)` when
  `endDayKey` is set, plus `· {time}` **only when `time !== null`** — every
  piece comes from the server in the org zone (ruling X13); the client never
  formats `date`/`endDate` (device-zone `formatDate`/`formatSessionTime` would
  move an org-midnight event to the previous day west of Cairo), and never
  tests hours itself. Then a visibility badge — `ALUMNI_ONLY` reads
  **"Alumni only"** (v1 `jpc-event-manager-client.tsx:114-115`, R46). A `SEASON` event is badged with its
  `seasonCode`; v1 styles `SEASON` identically to `ALL`, so nothing on its
  calendar distinguishes an organisation-wide event from a season-scoped one
  (spec 15 R68, item 12). For SUPER, each card also shows the photo thumbnail
  from `imageUrl` when set (R31, v1 `jpc-event-manager-client.tsx:100-102`)
  *(v1 parity 2026-10-09)*.
- Empty → `EmptyState` "No upcoming events" / "Nothing is scheduled in the next
  year." — on this manager list only. **The `UpcomingEventsCard` renders nothing
  at all when no event qualifies, as v1** (`jpc-space/src/components/events/upcoming-events-card.tsx:30`,
  `src/app/alumni/calendar/page.tsx:13-21`, R75): return `null` at
  `UpcomingEventsCard.tsx:26-27` (the alumnus's calendar tab, R73, shows that
  card; the dashboards are Plan 16's). *(v1 parity 2026-10-09: was "an empty state rather than nothing")*
- SUPER additionally gets a "New event" collapsible form at the top: `Input`s
  for **Title**, **Date** (`YYYY-MM-DD`), **Time** (optional `HH:mm`), **End
  date** (optional), **End time** (optional `HH:mm` — R6, v1 `jpc-event-form.tsx:129-151`), **Description**, **Link**, the current photo when editing (R31, v1 `jpc-event-form.tsx:171-182`), and a visibility selector — the `ALUMNI_ONLY` option labelled **"Alumni only (leaders, admins)"** (R46, v1 `jpc-event-form.tsx:195`; `EventForm.tsx:40`) *(v1 parity 2026-10-09)*; when
  `SEASON` is chosen, a season picker appears (`useSeasons()` from Plan 4).
  **The form sends wall-clock fields, and the server composes the instant in
  the org zone** (D-15.6, ruling X13): `{ day, time, endDay }` with an empty
  Time sent as `time: null` (all-day) and an empty End date as `endDay: null`.
  **No client-side schema validation, as v1** (R14/R18/R81; v1
  `jpc-event-actions.ts:72,79,119`, `jpc-event-form.tsx:77-83`): the form sends
  its values and shows the server's single first-issue `error.message` above the
  actions — not per field (remove the `safeParse` / `firstErrorByField` at
  `EventForm.tsx:86-95,101`). The server's 200-character title cap still
  applies. *(v1 parity 2026-10-09: was "parse with createJpcEventRequestSchema on device; per-field hints; no request")* v1 posts naive
  strings and lets the server resolve them in *its host's* zone, which is why
  editing an event from another timezone silently moves it (R15/R20/R82); the
  earlier draft of this plan moved that resolution to the *device's* zone, which
  is the same bug from the other side.
- Non-SUPER roles reaching `/events` by deep link get the same read-only list —
  never a crash and never a "not available" wall, because ALUMNI's nav labels
  `/calendar` "Events" and a mis-tap is likely.

**`event/[id].tsx`** — *(v1 parity 2026-10-09: not built — R70, see the note under the Task 10 heading.)* `useEventDetail(Number(id))`: title, the same
server-derived date label as the list card,
`description`, `seasonTitle` when present, and an "Open link" `Button` calling
`Linking.openURL(url)` when `url` is set. When `canManage`, an inline "Edit"
section PATCHing the same fields as the create form (partial — the endpoint
accepts one), and a "Delete event" button with the two-press confirm. This
screen is the reason `description` and the season stop being write-only data:
v1 has no event detail page anywhere (R70).

- [ ] **Step 5: The calendar merge — on Plan 6's restructured `calendar.tsx`**

Plan 6 Task 9 replaced Plan 4's screen with role branches:
`PinnedSeasonCalendar` (STUDENT / ALUMNI, `useSeasonSessions`), `RangeSessions`
(the windowed `useSessionRange` view used by `MultiSeasonCalendar` and
`AdminCalendar`), and a shared `SessionDays` renderer over
`groupSessionsByDay`. Verify before editing:
`grep -n "function SessionDays\|function PinnedSeasonCalendar\|function RangeSessions" "apps/mobile/app/(app)/calendar.tsx"`
→ three hits; `grep -n "export function groupSessionsByDay" apps/mobile/src/lib/day-groups.ts` → one hit.
If not, stop — Plan 6 has not run. The merge rides on that structure; it does
not reintroduce Plan 4's single-season screen.

(a) Append to `apps/mobile/src/lib/day-groups.ts` (Plan 6's file —
`groupSessionsByDay` stays as it is):

```ts
import type { JpcEventListItem } from "@space/shared";

export type CalendarEntry =
  | { kind: "session"; at: number; session: SessionListItem }
  | { kind: "event"; at: number; event: JpcEventListItem };

export interface CalendarDayGroup {
  dayKey: string;
  entries: CalendarEntry[];
}

/**
 * Sessions and JPC events in one list of org-day buckets (Plan 14). Both are
 * keyed by the **server's** `dayKey` (ruling X13) — the same `orgDayKey` on the
 * backend — so one day's sessions and events share a bucket by construction.
 * Days sort as ISO strings; entries within a day by instant (zone-independent),
 * so a 09:00 event precedes an 18:00 session. Unlike `groupSessionsByDay` this
 * cannot rely on input order: the two arrays arrive separately.
 */
export function groupCalendarByDay(
  sessions: SessionListItem[],
  events: JpcEventListItem[],
): CalendarDayGroup[] {
  const byDay = new Map<string, CalendarEntry[]>();
  const add = (dayKey: string, entry: CalendarEntry) => {
    const list = byDay.get(dayKey);
    if (list) list.push(entry);
    else byDay.set(dayKey, [entry]);
  };
  for (const s of sessions) add(s.dayKey, { kind: "session", at: Date.parse(s.startsAt), session: s });
  for (const e of events) add(e.dayKey, { kind: "event", at: Date.parse(e.date), event: e });
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([dayKey, entries]) => ({ dayKey, entries: entries.sort((x, y) => x.at - y.at) }));
}
```

(Merge the `import type` into the file's existing `@space/shared` type import:
`import type { JpcEventListItem, SessionListItem } from "@space/shared";`.)

(b) In `calendar.tsx`, change the shared import to
`import type { JpcEventListItem, SessionListItem } from "@space/shared";`,
replace `import { groupSessionsByDay } from "../../src/lib/day-groups";` with
`import { groupCalendarByDay } from "../../src/lib/day-groups";`, and add
`import { useEvents } from "../../src/hooks/use-events";`.

(c) Replace `SessionDays` with `CalendarDays` — the same session card, plus an
event card:

```tsx
/**
 * Day-grouped sessions and JPC events. Every day, time and order comes from the
 * server's org-clock values (X13) — never `formatDate(startsAt)` /
 * `formatDate(date)`, which are device-zone and would split an org-midnight
 * event from its day's sessions on a phone west of Cairo.
 */
function CalendarDays({
  sessions,
  events,
  showSeason,
}: {
  sessions: SessionListItem[];
  events: JpcEventListItem[];
  showSeason: boolean;
}) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <>
      {groupCalendarByDay(sessions, events).map((group) => (
        <View key={group.dayKey} style={{ marginBottom: theme.spacing.md }}>
          <Text variant="heading">{formatDayKey(group.dayKey)}</Text>
          {group.entries.map((entry) =>
            entry.kind === "session" ? (
              <Card
                key={`s${entry.session.id}`}
                style={{ marginTop: theme.spacing.sm }}
                onPress={() => router.push({ pathname: "/session/[id]", params: { id: String(entry.session.id) } })}
              >
                <Text variant="body">{entry.session.title}</Text>
                <Text variant="label" color={theme.colors.neutral[600]}>
                  {entry.session.location
                    ? `${formatWallTime(entry.session.startTime)} · ${entry.session.location}`
                    : formatWallTime(entry.session.startTime)}
                </Text>
                {showSeason ? (
                  <Text variant="caption" color={theme.colors.neutral[600]}>{entry.session.seasonTitle}</Text>
                ) : null}
              </Card>
            ) : (
              // v1 parity 2026-10-09 (R67/R68/R70; v1 season-calendar.tsx:69-73,355-367,471,484):
              // calendar icon, literal "JPC event" (no time), amber + lock for
              // ALUMNI_ONLY and navy otherwise, no season caption, and the url
              // (not a detail route). Now lives in
              // apps/mobile/src/components/calendar/CalendarEntries.tsx:110-135.
              <Card
                key={`e${entry.event.id}`}
                style={{ marginTop: theme.spacing.sm, backgroundColor: eventTint(theme, entry.event).background }}
                onPress={entry.event.url ? () => void Linking.openURL(entry.event.url as string) : undefined}
              >
                <Text variant="body" color={eventTint(theme, entry.event).foreground}>
                  {/* the app's lock icon before the title when ALUMNI_ONLY; a calendar icon in the time rail */}
                  {entry.event.title}
                </Text>
                <Text variant="label" color={eventTint(theme, entry.event).foreground}>
                  JPC event
                </Text>
              </Card>
            ),
          )}
        </View>
      ))}
    </>
  );
}
```

> **v1 parity 2026-10-09 (R73):** an alumnus does not reach `PinnedSeasonCalendar` — the calendar tab renders only the upcoming-events card for them (v1 `jpc-space/src/app/alumni/calendar/page.tsx:11,19`; `calendar.tsx:75-105`), with no session query. The season-less arm below stays for a current student with no season.

(d) `PinnedSeasonCalendar` — call `useEvents()` beside the sessions query and
let events fill a season-less calendar (an alumnus):

```tsx
  // Two queries, interleaved on the client — exactly what v1's calendar pages
  // do (season-calendar.tsx merges a session list and an event list). A single
  // /api/v1/calendar endpoint is the tidier shape and is deliberately deferred
  // (D-15.1). The events query is NOT allowed to fail the screen: its error is
  // swallowed into an empty array, because a calendar with no JPC events is
  // still a calendar and a calendar with no sessions is not.
  const events = useEvents();
  const eventRows = events.data ?? [];
```

and change the body chain's `seasonId === null`, empty and success arms to:

```tsx
  else if (current.seasonId === null)
    body =
      eventRows.length === 0 ? (
        <EmptyState title="No season to show" message="You aren't in a season right now, so there are no sessions on your calendar." />
      ) : (
        <CalendarDays sessions={[]} events={eventRows} showSeason={false} />
      );
  // …isPending / isError arms unchanged…
  else if (sessions.data.length === 0 && eventRows.length === 0)
    body = <EmptyState title="No sessions" message="This season doesn't have any sessions yet." />;
  else body = <CalendarDays sessions={sessions.data} events={eventRows} showSeason={false} />;
```

and add `void events.refetch();` to the `onRefresh` handler (both arms).

(e) `RangeSessions` — call `useEvents()` **above** its early returns (hooks
order), and show only events whose start day lies in the window the header
names (`fromDayKey`–`toDayKey`, inclusive, ISO strings compare correctly):

```tsx
  const events = useEvents();
  // …the existing isPending / isError returns, then `const data = range.data;`…
  const eventRows = (events.data ?? []).filter(
    (e) => e.dayKey >= data.fromDayKey && e.dayKey <= data.toDayKey,
  );
```

The empty arm becomes `data.sessions.length === 0 && eventRows.length === 0`
and the list arm `<CalendarDays sessions={data.sessions} events={eventRows} showSeason={showSeason} />`.
(`useEvents()` reads every visible event — no server window since the v1
parity revision, R57 — so paging "Earlier" or "Later" always finds its events.
*(v1 parity 2026-10-09: was "server's default window, today − 30 d to + 365 d")*)

The empty state appears only when **both** arrays are empty (v1 R71, kept).
`grep -n "formatSessionTime\|formatDate(" "apps/mobile/app/(app)/calendar.tsx"` → still no output (X13).

- [ ] **Step 6:** Drop `events` from `placeholder-screens.test.tsx`. Run
`cd apps/mobile && pnpm jest` → PASS; `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): JPC events manager, event detail and calendar merge"
```

---

### Task 11: Closing gate (coordinator)

- [ ] **Step 1: Everything green.**
`pnpm turbo lint typecheck test:unit build` → green, then the full serial
integration run:
`cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern integration` → green.
Record the suite and case counts.

- [ ] **Step 2: Mutation pass.** One at a time; restore after each. The named
suite **must** fail each time — a mutation that passes means the test is not
testing what it claims.

  1. **Video, the answer key.** In `lib/queries/video-quiz.ts`, add
     `correctIndex: true` to the student question select and pass it through in
     the route. → `video-quiz-routes`'s "never sends the answer key to a
     student" fails on the `JSON.stringify` assertion **and** on the exact-keys
     assertion; on mobile, `studentVideoQuizSchema`'s `.strict()` makes
     `video-quiz-screen` fail too. Both must break.
  2. **Video, the gate.** Remove the `nextQuestionId !== question.id` check from
     the answer handler. → "REFUSES an answer out of order" fails. This is
     decision D-13.2; if this mutation passes, the plan's headline claim is
     false.
  3. **Video, monotonicity.** Change the answer handler's
     `Math.max(current, atSeconds)` to `atSeconds`. → nothing in the suite
     fails as written; **add a case first** that answers q1 after q2 has moved
     `furthestSeconds` to 60 (via the progress PUT) and asserts it stays 60,
     then run the mutation. Fix the gap before the mutation, not after.
  4. **Forum, targeting.** Delete the `forumAudienceFor` call from
     `PUT /assignments/:id/forum/response`. → "REFUSES an assignment the student
     is not targeted by" fails. This is the roadmap's own done-criterion
     inverted, and the domain's most likely silent regression.
  5. **Forum, the draft privacy rule.** Remove `NOT: { text: null }` **or**
     `status: { not: "DRAFT" }` from the peer query. → "never exposes an
     unposted peer's draft text" fails.
  6. **Forum, delete rights.** Re-add the LEADER branch to
     `canDeleteForumComment`. → the LEADER-gets-403 delete case fails.
     *(v1 parity 2026-10-09: was "make canDelete author-only on the wire" — canDelete is gone, R52.)*
  7. **Events, the write gate.** Remove `isSuper(user)` from `POST /events`. →
     "refuses create, update and delete to an ADMIN" fails.
  8. **Events, the alumni rule.** Change `isAlumnus(user) || user.role !== "STUDENT"`
     to v1's `user.role !== "STUDENT"`. → "shows ALUMNI_ONLY events TO ALUMNI"
     fails. This is spec 15's headline defect; the test exists so the port
     cannot quietly reintroduce it.
  9. **X5, router-wide auth.** Add `forumRouter.use(requireAuth)` in
     `routes/forum.ts`. → `app.test.ts`'s "leaves an unknown /api/v1 path a
     not_found 404" fails with 401.
  10. **Forum bypass via the generic writers.** Delete the
     `assignment.type === "FORUM"` refusal from
     `PUT /submissions/by-assignment/:assignmentId`. → "PUT
     /submissions/by-assignment/:id → 409 use_forum_endpoint" fails. Restore,
     then delete the same refusal from `PATCH /submissions/:publicId` → the
     PATCH case fails. Each half of D-14.1's "only writer" claim must be pinned
     separately.
  11. **Forum status-code rule.** Move the `loadForumAssignment` check in
     `GET /assignments/:id/forum` below `forumAudienceFor`. → "404s a STANDARD
     assignment for student and staff alike" fails (403).
  12. **Events, org time.** In `toListItem`, replace `orgDayKey(row.date)`
     with `row.date.toISOString().slice(0, 10)` (the UTC day). → "derives
     allDay, dayKey and time server-side" fails on the org-midnight row.

- [ ] **Step 3: Emit check** (ruling X12 — all of `dist/`, not only routes).
`grep -rn 'require("@space/shared")' apps/backend/dist/` → empty. Every backend
file this plan adds (`routes/{video-quiz,forum,events}.ts`,
`lib/queries/{video-quiz,forum,events}.ts`) imports shared values by relative
path; a bare specifier anywhere crashes the built server with
`ERR_MODULE_NOT_FOUND`. Also `grep -rn "forum-text" apps packages` → empty
(ruling X3).

- [ ] **Step 4: Fixture-leak check.** After the full integration run, against
staging:

```
SELECT count(*) FROM "JpcEvent" WHERE title LIKE 'space-v2-test-%';
```

must be 0. `JpcEvent.season` is `SetNull`, so before Task 2 nothing in the
cleanup could reach these rows. Run the same check for
`SessionVideoQuestion`/`ForumComment` joined to a `space-v2-test-` season.
**Read-only queries only — never run a migration or a destructive statement
against staging.**

- [ ] **Step 5: Device checklist** (a dev-client build, not Expo Go — the
webview needs one):
  1. As a student, open a session with a YouTube recording: the player loads,
     playback stops at the first question, the modal cannot be dismissed by the
     Android back button or an iOS swipe, answering resumes playback, and the
     score card updates.
  2. Kill the app mid-video and reopen: playback resumes near where it stopped.
  3. As an admin on the same session: add a question at a timestamp typed as
     `2:30`, see it in the list, change its correct answer and read the
     "N recorded answers were re-graded" line, then check the question's
     `{responseCount} answers recorded` line counts the student's answer
     *(v1 parity 2026-10-09: was "check the results table shows the student's score")*.
  4. As a student, open a **forum** assignment never opened before: the compose
     box and the locked feed render, posting unlocks the feed, and a group-mate
     on a second device sees the post and can comment. Confirm no email address
     appears anywhere on the screen.
  5. As that group's leader: the thread is readable, a comment can be removed,
     and the "removing a whole response isn't supported yet" line is visible.
  6. As SUPER: create a JPC event, see it on `/events`, open its detail, and
     find it on `/calendar` interleaved with that day's sessions. As a student
     on a second device, confirm an `ALUMNI_ONLY` event is **not** visible and
     an `ALL` event is.

- [ ] **Step 6: Report.** Suite and case counts, the twelve mutation outcomes,
the fixture-leak query results, the device checklist, and every divergence from
this plan. Call out explicitly, for the product owner:
  - **the forum moderation gap** (D-14.4): staff can now read threads and remove
    comments, but there is still no way to hide a post and no student report
    action — both need schema (`hiddenAt`, a report row, a forum
    `NotificationType` value) and are **cutover tasks**;
  - **watch time is advisory** (D-13.2): the ordering rule is real, "did they
    watch it" is not and cannot be;
  - **the `ALUMNI_ONLY` behaviour change** (D-15.2): alumni now see events that
    v1 hid from them — the enum's UI label must be checked against the new
    meaning;
  - **deferred to cutover, with the column each needs:** a persisted video-quiz
    score (`pointsAwarded` on the response, or a grade row) so results can reach
    a gradebook, engagement or an export; a video duration column so a
    mistyped timestamp cannot deadlock a quiz; `hiddenAt` on `Submission` for
    forum post moderation; a forum `NotificationType` member for
    "someone commented on your response"; `updatedById` on `SessionVideoQuestion`
    so an answer-key edit is attributable.

---

## Revision 2026-10-05

Review pass against `review-plans-07-13.md`, the cross-plan rulings (X1–X16)
and the coordinator's spec-19 addendum. Changes:

- **Header:** dependencies restated against the execution order
  (… 9 → 10 → 11 → 12 → 13 → **14** → 15 → 16 → 17 → 18); Plan 12 added (html-text);
  consumers named (Plan 16 `useEvents` / `useUpcomingEvents`); Plan 4's
  `orgDayKey`, sessions' `dayKey` and `formatDayKey` consumed. Session screen path is the X7 directory form
  `session/[id]/index.tsx`. The `UpcomingEventsCard` is Plan 16's.
- **X3:** `packages/shared/src/forum-text.ts` removed. Conversion comes from
  Plan 12's `packages/shared/src/html-text.ts` (`htmlToPlainText`,
  `plainTextToHtml`); `countWords` moved into `forum.ts`. The `&#160;` pin
  corrected to 1 word (v1's `/&[a-z]+;/` cannot match `#`).
- **X5:** `forumRouter`/`videoQuizRouter` take `requireAuth` per route; only
  `eventsRouter` (exclusive prefix) keeps router-wide auth. The unfailable
  `app._router` count and CORS-`PUT` tests were dropped (CORS `PUT` is already on
  main — Contradiction 1 marked stale) and replaced by an unknown-path 404 guard.
- **Forum B2:** one status-code rule — `loadForumAssignment` (missing / deleted /
  non-FORUM → 404) runs before the audience gate (→ 403) on every forum route;
  GET test added.
- **Forum B3:** `PUT /submissions/by-assignment/:id` and
  `PATCH /submissions/:publicId` refuse a FORUM assignment with
  `409 use_forum_endpoint` (Task 6 Steps 4a/4b), with tests, OpenAPI and
  mutation items 10–11.
- **Forum:** DRAFT-target gate test no longer masked by a group mismatch;
  `canComment` excludes MENTOR; "Show all comments" built on
  `useForumComments` (`useInfiniteQuery`); every write hook parses a shared
  response schema (X10).
- **Video:** editor gated on SUPER / ADMIN-of-season, not `canMarkAttendance`;
  leader-results test has an out-of-group control; the barrier test is written
  in final form (direct render with an injected clock, a ref-capable player
  mock); the needless `jest.config.js` edit removed; write hooks Zod-parsed.
- **Events B1:** `graduationYear` set on `User`, not `StudentProfile`.
- **Events X13:** writes carry org wall-clock fields (`day`, `time`, `endDay`)
  and the server composes instants (`orgWallClockToInstant`); reads carry
  `dayKey`, `endDayKey`, `time`; the calendar buckets by org ISO day and labels
  with Plan 4's `formatDayKey`. `startOfDayInOrgTime` replaced by
  `orgWallTime`, `orgWallClockToInstant` beside Plan 4's `orgDayKey` (consumed,
  not redefined — the `dayKey` field name matches Plan 4's sessions); tests use
  January dates (no DST dependence).
- **Spec 19 addendum:** `GET /events` gains `?upcoming=true` (lower bound = today's
  org midnight on `endDate ?? date`) and `?limit=` (1–20), and returns `total`
  (counted before the cap); `useUpcomingEvents(limit)` and
  `queryKeys.events.upcoming(limit)` added for Plan 16. MENTOR still sees no
  SEASON events — v1 parity, `jpc-space/src/lib/jpc-events-query.ts:24-37`;
  spec 19 D19's widening is not taken here.
- **X11:** mobile session fixtures include `avatarPath: null`. **X12:** the emit
  check greps all of `dist/`.

Rejected: none of the plan-14 findings was wrong on verification. The nit
"export list omits `MAX_VIDEO_SECONDS`" was half-right — it was already
exported from `video-time.ts`; `video-quiz.ts` now imports it instead of
repeating `86_400`.

**Cross-plan consistency pass (2026-10-05, against plans 5, 6, 10 and 11 and the revised
order … 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 …):**

- **Header:** execution order corrected (17 now follows 7); Plans 5 and 6
  added as real dependencies with the exact names consumed.
- **Plan 5 owns the wall-clock helpers.** Task 1's `event.ts` no longer defines
  `isoDaySchema` / `wallTimeSchema` — it imports them from Plan 5's
  `packages/shared/src/org-time.ts` (a second definition is a duplicate
  `export *` compile error). Task 9 no longer defines `orgWallTime` /
  `orgWallClockToInstant`; it verifies Plan 5's and adds only
  `isOrgMidnight`, built on Plan 3's `orgWallClock` (the old private
  `partsFormatter`/`orgParts`/`orgOffsetMs` would have redeclared Plan 3's
  `partsFormatter` const). Its unit test is now `isOrgMidnight`-only.
- **Calendar merge retargeted at Plan 6 Task 9's `calendar.tsx`.** New
  `groupCalendarByDay` beside Plan 6's `groupSessionsByDay` in
  `src/lib/day-groups.ts`; `SessionDays` becomes `CalendarDays`;
  `PinnedSeasonCalendar` and `RangeSessions` each call `useEvents()` (the
  windowed branch filters events to its `fromDayKey`–`toDayKey`); a season-less
  alumnus now sees events. Plan 4's "no season … fetches nothing" case is edited
  to "fetches only `/api/v1/events`"; new cases cover the alumnus and the window
  filter. Times render with Plan 5's `formatWallTime`.
- **Forum on `assignment/[id]/index.tsx`** (Plan 5's move). Task 8 edits that
  file's `isStudent` branch: students get `ForumThread` in place of
  `SubmissionSection` on FORUM; staff keep `AssignmentStaffPanel` and read the
  thread below it (not MENTOR). The test import path, and the fixture's
  `dueOrgDay`/`dueOrgTime`, follow Plan 5. `ForumThread` no longer renders its
  own device-zone due line — Plan 5's header shows the org due day.
- **Session screen:** Task 5 extends Plan 6 Task 7's replacement of
  `session/[id]/index.tsx`; the `sessionDetail` fixture gains `dayKey`,
  `startTime` (Plan 6) and `canManageCheckIn` (Plan 4), all required by
  `sessionDetailSchema`.
- **X11:** inline session fixtures gain `hasPassword: true` (Plan 9's `MeUser`).
- **Plan 11:** the video suite mocks `expo-camera` with Plan 11's
  `helpers/expo-camera` stand-in — the session screen now imports
  `StudentCheckInCard` (Plan 11 Task 10), whose scanner pulls the native module.
  Step 6 names Plan 11's branch among what to keep. Plan 11 also added to the
  header's consumed plans.

## Revision 2026-10-09 — v1 parity

Owner ruling: v2 behaves exactly like v1 except where v1's behaviour is a defect. This revision
reverts the divergences below; the edits are marked *(v1 parity 2026-10-09)* in place. The code
built from the earlier text must be changed to match. Full classification:
`docs/superpowers/audits/2026-cutover/v1-parity-classification.tsv`.

| # | Rule(s) | REG | v1 behaviour (v1 file:line) | v2 code to change (file:line) | Where in this plan |
|---|---|---|---|---|---|
| 1 | 13 R23, R24 | - | `parseTimestamp` converts each part with `Number()`; empty part is 0, `0x10`/`1e3` accepted (`src/lib/video-time.ts:21-30`) | `packages/shared/src/video-time.ts:20,46` (drop `COMPONENT`, port v1 verbatim) | Task 1 Step 1 video-time tests; Step 2 `parseTimestamp`; Task 5 editor ":30" test |
| 2 | 13 R27 | - | No upper bound at parse time; 86,400 enforced only by the server action (`src/lib/video-time.ts:15-30`, `src/lib/video-quiz-actions.ts:17`) | `packages/shared/src/video-time.ts:40,60` (remove `maxSeconds`); editor surfaces the server 400 | Task 1 Produces, tests, impl; Task 5 Step 5 parse rule |
| 3 | 13 R30 | - | Four unanchored regexes find `?v=`/`&v=`, `youtu.be/`, `/embed/`, `/shorts/` anywhere (`src/lib/youtube.ts:4-13`) | `packages/shared/src/youtube.ts:54-66` (regex fallback after host check, with boundary) | D-13.7; Task 1 Step 2 note |
| 4 | 13 R37 | - | No video id / no questions → only a "Watch recording" button, no message (`src/app/student/sessions/[id]/page.tsx:47-49,76-90`) | `apps/mobile/src/components/VideoQuizPlayer.tsx:39-51,210-212`; session screen zero-question branch | Task 5 Step 4 items 1–2; Step 6 student bullet; fallback test |
| 5 | 13 R49 | - | Progress saved on pause, hidden, unmount only (`src/components/sessions/interactive-video-player.tsx:154,163,198`) | `apps/mobile/src/components/VideoQuizPlayer.tsx:19,129-135` (remove interval) | Task 5 Step 4 item 8 |
| 6 | 13 R74 | - | No surface shows any student's video-quiz result; editor shows `responseCount` only (`src/components/sessions/video-questions-editor.tsx:75`) | `apps/backend/src/routes/video-quiz.ts:439-461`, `loadVideoQuizResults`, `videoQuizResultsSchema`, `useVideoQuizResults`, `queryKeys.videoQuiz.results`, results table, `canSeeResults` | Task 1 schemas/Produces; Task 2 query keys; Task 4 heading note, Step 2, Step 3; Task 5 editor note, Step 5, Step 6; Task 11 device check 3 |
| 7 | 14 R11 | - | Only gate is `countWords >= (forumMinWords ?? 0)`; empty post allowed when min is 0/null (`src/lib/forum-actions.ts:36-39`, `src/components/forum/forum-view.tsx:50-52,102`) | `packages/shared/src/forum.ts:104-106`; `apps/mobile/src/components/ForumThread.tsx:29` | D-14.5; Task 1 schema + schema test; Task 6 PUT step 5 + empty-post test; Task 8 Step 3 item 3 |
| 8 | 14 R26 | - | Every comment inlined, `createdAt` asc (`src/lib/forum-query.ts:101-110`) | `apps/backend/src/lib/queries/forum.ts:194-205`; `routes/forum.ts:253-262`; `listForumComments`, `useForumComments`, "Show all comments" | Task 1 post schema + query schemas; Task 6 Step 2 note; Task 7 heading note; Task 8 notes |
| 9 | 14 R27 | - | Feed loads every post, `submittedAt` desc, no paging (`src/lib/forum-query.ts:80-112`) | `apps/backend/src/lib/queries/forum.ts:167-185,241`; `forumFeedQuerySchema`; ForumThread "Load more" | Task 1 `forumViewSchema`, `forumFeedQuerySchema`; Task 6 pagination test + Step 2 note; Task 8 notes |
| 10 | 14 R28 | - | Post bodies render as sanitised rich text: 14-tag allow-list `p br strong em s a ul ol li h2 h3 blockquote code pre`, `a[href,target,rel]`, schemes http/https/mailto (`src/components/ui/rich-text-view.tsx:11-31,43`; `forum-view.tsx:191`) | `apps/backend/src/lib/queries/forum.ts:219` (sanitise with v1's allow-list instead of `htmlToPlainText`); ForumThread renders with an RN HTML renderer limited to those tags | Task 1 `forumPostSchema.text`; Task 6 Step 2 item 6 + plain-text test; Task 8 Step 3 note |
| 11 | 14 R31 | - | Each post and comment author's avatar shown (`src/lib/forum-query.ts:120-122,130-132`) | add `authorAvatarUrl` via a gated id-addressed avatar read endpoint (none exists in `apps/backend/src/routes`); render in ForumThread | D-14.6; Task 1 comment/post schema notes; Task 6 Step 2 note; Task 8 Step 3 note |
| 12 | 14 R33 | - | FORUM header: "Forum" badge and title, no due date (`src/app/student/assignments/[id]/page.tsx:53-60`) | `apps/mobile/app/(app)/assignment/[id]/index.tsx:130-134` (guard with `type !== "FORUM"`) | Task 8 Step 3 item 2; Step 4 note; forum lock test |
| 13 | 14 R34, R56 | - | Forum screen never shows reviewer feedback; posts stay reviewable (`src/lib/forum-query.ts:54-57`, `forum-view.tsx:24-27`) | `apps/backend/src/lib/queries/forum.ts:108,121-122`; `forumOwnResponseSchema`; `ForumThread.tsx:33-40` | D-14.8; Task 1 `forumOwnResponseSchema`; Task 6 Step 2 note + PUT select; Task 8 Step 3 item 3, Step 2 note |
| 14 | 14 R40 | - | LEADER and MENTOR cannot comment (`src/lib/auth/permissions.ts:352`) | `apps/backend/src/lib/permissions.ts:559` (remove LEADER branch) | D-14.4 item 3; Task 2 `canCommentOnForumSubmission` doc, impl, test; Task 7 heading note |
| 15 | 14 R50 | - | Comment delete: author, SUPER or season ADMIN only (`src/lib/forum-actions.ts:115-118`) | `apps/backend/src/lib/permissions.ts:597-600` | D-14.4 item 2; Task 2 `canDeleteForumComment` doc, impl, tests; Task 7 note; Task 11 mutation 6 |
| 16 | 14 R52 | - | Delete control only on the viewer's own comments (`src/components/forum/forum-view.tsx:205`) | `apps/backend/src/lib/queries/forum.ts:229-230` (drop `canDelete`); ForumThread gates on `authorUserId === user.id` | D-14.4 item 2; Task 1 `forumCommentSchema`; Task 6 Step 2 item 6; Task 8 notes; Task 11 mutation 6 |
| 17 | 14 R53, R57 | REG-39 | No staff forum surface, no moderation (`src/app/student/assignments/[id]/page.tsx:14,24`; `src/lib/forum-actions.ts` whole file) | `apps/backend/src/lib/permissions.ts:577-602,625-635` (student-only `forumAudienceFor`); `assignment/[id]/index.tsx:155` | D-14.4; Task 2 `forumAudienceFor` doc, impl, tests; Task 6 staff tests + Step 2 note; Task 7 note; Task 8 Step 3 item 7, Step 4 note |
| 18 | 15 R6, R17 | - | Optional end date plus optional end time; end time alone dropped (`src/lib/jpc-event-actions.ts:17,36-38,73`; `src/app/super/events/jpc-event-form.tsx:129-151`) | `packages/shared/src/event.ts:66` (add `endTime`); `apps/backend/src/routes/events.ts:164`; `EventForm.tsx` | D-15.6; Task 1 `eventWriteBase` + list schema; Task 9 Step 5 note + POST compose; Task 10 Step 4 form |
| 19 | 15 R11 | - | End ≥ start on full date-times, equal allowed (`src/lib/jpc-event-actions.ts:23-26`) | `packages/shared/src/event.ts:81-87` (`refineEvent`) | D-15.6; Task 1 `refineEvent` |
| 20 | 15 R14, R18, R81 | REG-113 | No client validation; first Zod issue shown as one message (`src/lib/jpc-event-actions.ts:15,72,79,119`; `jpc-event-form.tsx:77-83`) | `apps/mobile/src/components/EventForm.tsx:86-95,101`; `routes/events.ts` create/patch error message | Task 9 Step 5 note; Task 10 Step 4 form + malformed-time test |
| 21 | 15 R31 | - | Each event carries `imageUrl`; manager list thumbnail, edit form current photo (`src/lib/jpc-events-query.ts:76`; `jpc-event-manager-client.tsx:100-102`; `jpc-event-form.tsx:171-182`) | `packages/shared/src/event.ts:43-48` (add `imageUrl`); new `GET /api/v1/events/:id/photo` gated on `eventVisibilityFilter` (not `storage.url()`, KEEP-FIX R32/R60) | D-15.7; Out of scope; Task 1 list schema; Task 9 Step 5 note + test note; Task 10 Step 4 |
| 22 | 15 R42, R44, R45; 03 R92 | REG-41 | **Resolved: 19-R6 KEEP-FIX wins; only labels/visual reverted.** v1's `role !== "STUDENT"` (`src/components/events/upcoming-events-card.tsx:23`) hides ALUMNI_ONLY from every alumnus, a broken flow, so v2 keeps `isAlumnus(user) \|\| role !== "STUDENT"` | none for visibility (`apps/backend/src/lib/queries/events.ts:57-59` stays); labels in row 23, visuals in rows 27 and 29 | D-15.2 (labels only); Task 9 predicate, test and Task 11 mutation 8 left as they were |
| 23 | 15 R46 | - | Form option "Alumni only (leaders, admins)"; manager badge "Alumni only" (`jpc-event-form.tsx:195`; `jpc-event-manager-client.tsx:114-115`) | `apps/mobile/src/components/EventForm.tsx:40`; manager row badge | D-15.2; Task 10 Step 4 |
| 24 | 15 R57 | - | Every event ever created, `date` asc, no window or limit (`src/lib/jpc-events-query.ts:43-69`) | `apps/backend/src/routes/events.ts:98-108` (remove −30d/+365d defaults) | D-15.5; Task 1 `eventListQuerySchema` doc; Task 9 Step 5 note + test note; Task 10 `useEvents` doc, Step 5(e) |
| 25 | 15 R58 | REG-114 | One row shape for every role incl. `description`, `imageUrl`, `seasonTitle`, `createdById` (`src/lib/jpc-events-query.ts:6-18,56-68`) | `packages/shared/src/event.ts:11-55` | Task 1 list/detail schemas; Task 9 Step 5 note |
| 26 | 15 R67 | - | Agenda event row: calendar icon, subtitle "JPC event", no time (`src/components/sessions/season-calendar.tsx:355-361,367`) | `apps/mobile/src/components/calendar/CalendarEntries.tsx:125-127` (was `calendar.tsx:62`) | Task 10 Step 5 calendar row code |
| 27 | 15 R68 | - | Amber + lock for `ALUMNI_ONLY`, navy otherwise; SEASON same as ALL (`season-calendar.tsx:69-73,364,471,484`) | `CalendarEntries.tsx:128-133` (remove `seasonCode` chip; add lock icon — amber tint already exists at `:48-53`) | Task 10 Step 5 calendar row code; Task 1 `seasonCode` doc |
| 28 | 15 R70 | REG-114 | No event detail page; event with `url` opens it, without is inert (`season-calendar.tsx:374-380,458-487`; `upcoming-events-card.tsx:52-58`) | delete `apps/mobile/app/(app)/event/[id].tsx`, its route registration, `useEventDetail`/`queryKeys.events.detail`, `GET /events/:id` (read) | Task 10 heading note, Step 1, Step 4 cards + detail, tests; Task 9 detail tests + Step 5 note; Task 1 detail schema |
| 29 | 15 R73 | - | Alumni Events page = only the UpcomingEventsCard (`src/app/alumni/calendar/page.tsx:11,19`) | `apps/mobile/app/(app)/calendar.tsx:75-105` (alumnus → card only, no session query) | D-15.1; Task 10 Step 5(d) note; alumnus calendar test |
| 30 | 15 R75 | REG-60 | Card renders nothing when no event qualifies (`upcoming-events-card.tsx:30`; `alumni/calendar/page.tsx:13-21`) | `apps/mobile/src/components/dashboard/UpcomingEventsCard.tsx:26-27` (return null; delete empty-state test) | Task 10 Step 4 empty bullet (the card's own test is Plan 16's) |

**Ruling C11 must be amended.** Row 10 conflicts with `_DECISIONS.md` C11 as written ("Nothing
renders as HTML"). v1 already sanitised forum post bodies with the allow-list above before
rendering, so it is not the unsanitised-HTML defect C11 targets. C11 should read, for forum
posts: "sanitise with v1's allow-list (`rich-text-view.tsx:11-31`)" rather than "nothing renders
as HTML". Until it is amended, row 10 is blocked on that ruling.

**Conflict with a KEEP-FIX row: resolved. 19-R6 KEEP-FIX wins; only labels/visual reverted.**
The REVERT rows 15 R42/R44/R45 and 03 R92 contradicted `19-dashboards R6` (KEEP-FIX, REG-41).
The coordinator ruled that v1's formula is a defect (no alumnus can ever see an ALUMNI_ONLY
event), so v2 keeps alumni visibility and REG-41 stands. The parts of those rows that are not
about who sees ALUMNI_ONLY still apply: v1's labels (R46), the lock icon and chip changes (R68),
and the alumnus calendar showing only the events card (R73).

**Resolved (owner 2026-10-10): stays deferred with the uploads switch until the CMS lands; port v1's rules then.**
*(v1 parity 2026-10-09; owner decision 2026-10-10: was "Awaiting owner (not changed)")* 15 R22–R29 (event photo upload: optional photo, jpeg/png/webp
MIME, 5 MB cap, extension from MIME subtype, key `events/YYYY/MM/{uuid}-event.{ext}`, written
before the row outside a transaction, cannot be removed, old blob never deleted —
`src/lib/jpc-event-actions.ts:44-60,81-96,121-136`). They conflict with `space-v2/CLAUDE.md`
"Uploads are switched off"; D-15.7 still defers `POST/DELETE /events/:id/photo`, which stays
behind `ENABLE_UPLOADS` (off) like every upload route. When the CMS
lands, port v1's rules as they are.
