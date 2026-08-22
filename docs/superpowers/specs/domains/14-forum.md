# Domain 14 — Forum

> Status: draft · Phase: 4 (engagement) · v1 API status: **none** — confirmed; `src/app/api/v1/` contains `assignments`, `auth`, `groups`, `me`, `seasons`, `sessions`, `submissions` and nothing forum-related, and `grep -rn forum src/` matches no route handler.

A FORUM assignment is not a separate entity. It is a `Submission` row with a
discussion attached: the student's response *is* `Submission.text`, posting it
*is* setting `Submission.status = SUBMITTED`, and the only new table in the
whole domain is `ForumComment`. Everything else this domain touches is owned
elsewhere.

Boundary notes, decided here so the three specs do not overlap:

- **Domain 7 (Assignments)** owns `AssignmentType`, `forumMinWords` and
  `forumAllowComments` — their validation, their mutual exclusion with the file
  config, and their persistence (`07-assignments.md` R5–R7, R14–R16, R21, R25).
  This domain only *reads* those three fields and enforces them at write time.
- **Domain 8 (Submissions)** owns the `Submission` row, its `publicId`, its
  status vocabulary and its state machine. This domain adds exactly one new
  edge to that machine — DRAFT/SUBMITTED → SUBMITTED via a forum post (R6) —
  and does not restate the rest. Domain 8's R60 is the dependency this whole
  spec is built around; see §10 D1.
- **Domain 6 (Students)** owns `User.avatarPath` and `GroupStudent`. This domain
  reads current group membership as its entire visibility rule (R19) and reads
  avatars for display (R30).

**Confirmation of the upstream finding.** Domain 8's R60 is correct in every
particular, verified against source:

| Claim | Verified at |
|---|---|
| `ensureDraftSubmission(...)` is called during a GET | `src/app/student/assignments/[id]/page.tsx:40` — in the body of an async page component, before the FORUM branch at `:42` |
| `stub.id` is passed into `loadForumView` | `src/app/student/assignments/[id]/page.tsx:43` |
| That id is returned as `ownSubmissionId` | `src/lib/forum-query.ts:47` (the parameter), `src/lib/forum-query.ts:63` (echoed into the returned object) |
| Every forum write targets that id | `src/lib/forum-actions.ts:18-19, 24-25` (post); `src/lib/forum-actions.ts:58-59, 69-72` (comment) |
| The view tolerates a missing row | `src/lib/forum-query.ts:59` — `const ownStatus = own?.status ?? "DRAFT";` |
| Without an id the student cannot post | `src/components/forum/forum-view.tsx:59` passes `data.ownSubmissionId` as the sole addressing argument; `src/lib/forum-actions.ts:24-32` returns "Response not found." on a miss |

Nothing in the upstream finding is wrong. One correction of emphasis: the view
tolerates a missing *row*, but it cannot tolerate a missing *id* — and the id
is not nullable in `ForumViewData` (`src/lib/forum-query.ts:25`), so v1 has no
representation for "this student has no submission yet". §10 D1 specifies the
replacement.

## 1. v1 source

| File | Holds |
|---|---|
| `src/lib/forum-actions.ts:18-52` | `submitForumPostAction` — the post write. Ownership gate, type gate, word-count gate, and the `status`/`submittedAt` update. |
| `src/lib/forum-actions.ts:54-99` | `addForumCommentAction` — comment validation, the permission gate, and the post-first-to-unlock check. |
| `src/lib/forum-actions.ts:101-123` | `deleteForumCommentAction` — the only deletion in the domain. |
| `src/lib/forum-query.ts:44-141` | `loadForumView` — the single read. Own response, lock state, peer feed, comments, avatars. |
| `src/lib/forum-query.ts:5-34` | `ForumCommentView`, `ForumPostView`, `ForumViewData` — the wire shape, as bare interfaces. |
| `src/lib/forum.ts:7-16` | `countWords` — the HTML-stripping word counter behind `forumMinWords`. Shared client/server, no runtime directive. |
| `src/lib/auth/permissions.ts:320-353` | `canCommentOnForumSubmission` — the only row-scoped gate this domain has. |
| `src/app/student/assignments/[id]/page.tsx:22-75` | The FORUM branch: role gate, targeting check, `ensureDraftSubmission`, `loadForumView`, and a header that deliberately omits the due date. |
| `src/components/forum/forum-view.tsx:43-139` | `ForumView` — compose box, word counter, lock state, feed. |
| `src/components/forum/forum-view.tsx:141-249` | `ForumPostCard` — one peer post, its comments, the comment box and the delete control. |
| `src/lib/assignment-actions.ts:184-213` | `ensureDraftSubmission` — the row this domain depends on and does not create. Owned by domain 7/8; cited because §10 D1 turns on it. |
| `src/lib/assignments-query.ts:73-112` | `loadAssignmentById` — supplies `type`, `forumMinWords`, `forumAllowComments` to the page. |
| `src/lib/submissions-query.ts:33-95` | `loadSubmissionByPublicId` — the staff read. Selects neither `assignment.type` nor `forumComments`; see R54. |
| `src/lib/submissions-query.ts:123-128` | The leader queue `where`/`orderBy` that forum posts silently enter. |
| `src/components/ui/rich-text-view.tsx:11-31, 43` | The sanitiser applied to a forum post body at render. |
| `src/components/ui/rich-text-editor.tsx` | The compose control (`forum-view.tsx:78-82`). |
| `src/lib/storage/index.ts:22-27`, `src/lib/storage/local.ts:33-36`, `src/lib/storage/s3.ts:19-21` | Avatar URL resolution per author, per post, per comment. The S3 driver throws. |
| `prisma/schema.prisma:78-81` | `AssignmentType` — `STANDARD`, `FORUM`. |
| `prisma/schema.prisma:476-481` | `Assignment.type`, `forumMinWords`, `forumAllowComments`. |
| `prisma/schema.prisma:513-537` | `Submission` — the post body, reused. |
| `prisma/schema.prisma:552-566` | `ForumComment` — the only table this domain owns. |

There is **no forum route under `src/app/api/v1/`**, no forum test, and no
staff-facing forum page. `ForumView` is imported in exactly one place
(`src/app/student/assignments/[id]/page.tsx:14`).

## 2. Data model

### `ForumComment` (`prisma/schema.prisma:554-566`) — the only model this domain owns

| Field | Meaning |
|---|---|
| `submissionId` → `Submission` | `onDelete: Cascade` (`:557`). The comment hangs off the *post*, which is a submission row. There is no thread entity and no parent-comment column — the discussion is exactly two levels deep, and cannot nest. |
| `authorUserId` → `User` | `onDelete: Restrict` (`:559`). A user who has ever commented cannot be hard-deleted. Note the asymmetry with `Submission.studentUserId`, also `Restrict` (`:520`) — but v1 soft-deletes users anyway, so neither fires. |
| `body` `String` | **Plain text, not HTML.** It is written from a `Textarea` (`forum-view.tsx:225-232`) and rendered with `whitespace-pre-wrap` inside a `<p>` (`forum-view.tsx:219`) — never through `RichTextView`. This is the opposite of the post body (R27/R28) and is easy to get wrong in a port. |
| `createdAt` | The only ordering key (R26). |
| `updatedAt` `@updatedAt` | **Written by Prisma, never meaningfully changed and never read.** No edit action exists (R44) and no query selects it (`forum-query.ts:103-109` selects `id`, `authorUserId`, `body`, `createdAt` and the author only). It will always equal `createdAt`. |
| `@@index([submissionId])`, `@@index([authorUserId])` | Support the feed's nested read and nothing else — no query in v1 filters by `authorUserId`. |

No soft delete, no `deletedAt`, no edit history, no `reportedAt`/`hiddenAt`, no
moderator column. Deletion is physical (R46).

### `Submission` fields this domain writes or reads (`prisma/schema.prisma:513-537`)

| Field | Use here |
|---|---|
| `text` | **The forum post body.** Rich-text HTML, same storage as a standard submission (domain 8 R54). Nullable in the schema (`:521`); the feed's `where` explicitly excludes nulls (R22) and the view coerces to `""` (`forum-query.ts:64`). |
| `status` | Doubles as the post/unpost flag. `DRAFT` = not posted = feed locked; anything else = posted (R6, R18). |
| `submittedAt` | The post's timestamp *and* the feed's sort key (R14, R23). |
| `id` | The address of every forum write (R5) — **not `publicId`**, which this domain never uses at all. |
| `feedback`, `reviewedAt`, `reviewedById` | Written by domain 8's review path against a forum post, and **never rendered on the forum screen** (R56, §10 D9). |
| `@@unique([assignmentId, studentUserId])` (`:534`) | The natural key an upsert must use (§10 D1). |

### `Assignment` fields read (owned by domain 7, `prisma/schema.prisma:476-481`)

`type` (must be `FORUM` for any write to proceed — R8, R34), `forumMinWords`
(nullable; null is treated as 0 — R9), `forumAllowComments` (default `false`;
gates both the UI block and the permission — R31, R34), `dueAt` (**selected by
the post action and never used** — R12), `seasonId` (read only by the
permission gates — `permissions.ts:328, 335`).

### `User.avatarPath` (`prisma/schema.prisma:112`)

Nullable. Resolved to a URL per post author and per comment author on every
feed load (R30).

**Nullable-but-treated-as-required:** `ForumViewData.ownSubmissionId` is a
non-nullable `number` (`forum-query.ts:25`) fed from a row that may not exist.
That mismatch is the whole of §10 D1.

## 3. Business rules

### Entry and the submission dependency

- **R1.** The forum surface is selected purely by `assignment.type === "FORUM"`;
  the page returns before the standard submission form is ever constructed —
  `src/app/student/assignments/[id]/page.tsx:42-75`.
- **R2.** The forum view is loaded with three arguments — assignment id, student
  id and an **already-existing** submission id — `src/lib/forum-query.ts:44-48`,
  called at `src/app/student/assignments/[id]/page.tsx:43` with `stub.id` from
  the read-time `ensureDraftSubmission` at `:40`.
- **R3.** `loadForumView` does not verify that `ownSubmissionId` belongs to
  `studentUserId` or to `assignmentId`; it echoes the caller's argument straight
  back into the returned object — `src/lib/forum-query.ts:54-57, 63`. Safety
  rests entirely on the page having produced the id. *(implicit)*
- **R4.** A missing row degrades to `ownStatus = "DRAFT"` and `ownText = ""`,
  which renders as "locked" rather than as an error —
  `src/lib/forum-query.ts:59-60, 64`.
- **R5.** Every forum write is addressed by the **sequential integer**
  `Submission.id` (post, comment) or `ForumComment.id` (delete) — never by
  `publicId` — `src/lib/forum-actions.ts:19, 59, 101`. Domain 8's
  unguessable `publicId` (its R5) protects nothing here. *(implicit — the
  addressing choice, not a check)*
- **R6.** Posting **is** submitting: one update writes `text`,
  `status: "SUBMITTED"` and `submittedAt = new Date()` together —
  `src/lib/forum-actions.ts:42-45`. See §10 D2 for how this interacts with
  domain 8's state machine (`08-submissions.md` §3, R8/R9).

### Posting a response

- **R7.** The post action's only authorization is identity: the row's
  `studentUserId` must equal the caller, else `ForbiddenError` —
  `src/lib/forum-actions.ts:33`. There is **no role check** — `getCurrentUserOrRedirect`
  at `:22` is the only session call, and no `requireRole` appears in the file.
- **R8.** A post is refused unless the parent assignment's `type` is `FORUM` —
  `src/lib/forum-actions.ts:34`.
- **R9.** The word-count gate is `countWords(text) >= (forumMinWords ?? 0)`; a
  null minimum means zero — `src/lib/forum-actions.ts:36-39`.
- **R10.** `countWords` strips HTML tags, replaces `&nbsp;` and any named
  entity with a space, collapses whitespace, trims, and counts
  whitespace-separated tokens; empty input returns 0 —
  `src/lib/forum.ts:9-15`. Numeric and hex entities (`&#160;`) are **not**
  handled and count as words.
- **R11.** When `forumMinWords` is null or 0 the gate passes on empty text
  (`0 >= 0`), so an empty response can be posted and marked `SUBMITTED` —
  `src/lib/forum-actions.ts:36-39`. The client agrees: `meetsMin` is also true,
  so the button is enabled — `src/components/forum/forum-view.tsx:50-52, 102`.
  *(implicit — nothing asserts non-emptiness anywhere)*
- **R12.** The post action **selects `assignment.dueAt` and never reads it** —
  `src/lib/forum-actions.ts:29` vs `:36-45`. A forum response can be posted at
  any time, before or after the due date. *(implicit — cross-referenced as
  `07-assignments.md` R51; stated here because it is this domain's write)*
- **R13.** Re-posting is unrestricted and unlimited: the same action overwrites
  `text` and stamps a **new** `submittedAt` every time —
  `src/lib/forum-actions.ts:42-45`. The UI advertises it, switching the button
  to "Update response" once `ownStatus !== "DRAFT"` —
  `src/components/forum/forum-view.tsx:53, 103`.
- **R14.** Because the feed sorts on `submittedAt` descending
  (`src/lib/forum-query.ts:94`), an edit silently promotes a post to the top of
  every group-mate's feed. There is no "edited" marker anywhere. *(implicit —
  a consequence of R13 plus the sort key)*
- **R15.** The post action performs **no targeting check**. It never reads
  `isAllGroups` or `AssignmentTarget`; the only place targeting is enforced is
  the page render — `src/app/student/assignments/[id]/page.tsx:29-38`. A student
  whose group membership changed after the row was created can still post.
  *(implicit — this is the domain's analogue of the leader-attendance gap)*
- **R16.** Posting notifies nobody. `src/lib/forum-actions.ts` contains no
  `createNotification` call (0 matches in the file) — not the leader, not the
  group, not the assignment's author.
- **R17.** A forum assignment can never carry file attachments: domain 7 forces
  `maxFileSizeMb` to null and `allowedMimeCategories` to `[]` for `FORUM`
  (`src/lib/assignment-actions.ts:66-67`), and the forum surface renders no file
  control at all (`src/components/forum/forum-view.tsx:69-138`). *(implicit)*
- **R18.** Post success revalidates four paths — the assignment page, the
  student assignment list, the leader queue and the admin assignment list —
  `src/lib/forum-actions.ts:47-50`. Comment writes revalidate only the
  assignment page — `:97, 121`.

### Who can read a thread — the visibility rule

- **R19.** The feed is locked until the student's own response is posted:
  `locked = ownStatus === "DRAFT"`, and a locked view returns with an empty
  `posts` array before any peer query runs —
  `src/lib/forum-query.ts:60, 72`. The UI substitutes a "Post to unlock the
  discussion" empty state — `src/components/forum/forum-view.tsx:110-115`.
- **R20.** Once unlocked, the audience is **the viewer's current group**: the
  query reads the viewer's single `GroupStudent` row, then every other student
  in that same `groupId` — `src/lib/forum-query.ts:74-84`. Not the assignment's
  target groups, not the season, not the whole cohort.
- **R21.** A student with **no** current group membership sees an empty feed
  even on an `isAllGroups` assignment — `src/lib/forum-query.ts:78`. Their own
  post is still stored and still visible to nobody. *(implicit — an early
  return, not a stated rule)*
- **R22.** A group of one short-circuits to an empty feed —
  `src/lib/forum-query.ts:85`.
- **R23.** Peer posts are filtered to `status: { not: "DRAFT" }` **and**
  `NOT: { text: null }` — `src/lib/forum-query.ts:88-93`. An unposted
  group-mate's draft text is therefore never exposed. This is the single most
  important privacy rule in the domain and it lives entirely in a `where`
  clause. *(implicit)*
- **R24.** The peer set is derived from **current** membership, so a student who
  moves group loses access to their old group's thread and gains access to the
  new one's, retroactively, for assignments they may never have been targeted
  by — `src/lib/forum-query.ts:74-84`. Nothing records which group a post was
  written in. *(implicit)*
- **R25.** Peer posts are ordered `submittedAt` descending —
  `src/lib/forum-query.ts:94`. Rows with a null `submittedAt` cannot occur here
  because R23 excludes `DRAFT`, and `submittedAt` is only ever set alongside a
  non-`DRAFT` status (R6; domain 8 R9).
- **R26.** Comments are nested in the same query, ordered `createdAt` ascending,
  and **every** comment on **every** peer post is loaded —
  `src/lib/forum-query.ts:101-110`.
- **R27.** **Nothing in the feed is paginated or capped.** There is no `take`,
  no `skip` and no cursor on the peer query, the comment include, or the peer-id
  query — `src/lib/forum-query.ts:80-112`. A group of 30 students on a
  long-running discussion loads every post and every comment in one render.
  *(implicit — an absence, and the one that hurts most on a phone)*
- **R28.** A post body is rendered through `RichTextView`, which sanitises
  against a 14-tag allow-list with `href/target/rel` on anchors and
  http/https/mailto schemes only — `src/components/forum/forum-view.tsx:191`;
  `src/components/ui/rich-text-view.tsx:11-31, 43`. Storage is raw; sanitisation
  is render-time only.
- **R29.** A comment body is rendered as **plain text** in a
  `whitespace-pre-wrap` paragraph, never sanitised and never parsed as HTML —
  `src/components/forum/forum-view.tsx:219`.
- **R30.** An author with no `name` is displayed by their **email address** —
  `src/lib/forum-query.ts:36-38`, applied to post authors at `:119` and comment
  authors at `:129`. Student email addresses are therefore shown to group-mates
  whenever the profile name is blank.
- **R31.** Avatar URLs are resolved one call at a time — once per post author
  (`src/lib/forum-query.ts:120-122`) and once per comment author
  (`:130-132`) — inside nested `Promise.all`s over the whole feed.
- **R32.** The comment block, including the compose box and every existing
  comment, is hidden wholesale when `forumAllowComments` is false —
  `src/components/forum/forum-view.tsx:193`; the flag is carried on
  `ForumViewData.allowComments` — `src/lib/forum-query.ts:68` — and defaults to
  `false` when the assignment row is missing.
- **R33.** The FORUM branch renders **no due date** — the header shows only a
  "Forum" badge and the title (`src/app/student/assignments/[id]/page.tsx:53-60`),
  where the STANDARD branch renders a due badge
  (`src/app/student/assignments/[id]/page.tsx:107-118`). A student on a forum
  assignment cannot see when it is due. *(implicit — an omission in one branch)*
- **R34.** The FORUM branch renders **no reviewer feedback**. `ForumView` takes
  only `data` and `currentUserId` (`src/components/forum/forum-view.tsx:24-27`)
  and `loadForumView` never selects `feedback`
  (`src/lib/forum-query.ts:54-57`), whereas the STANDARD branch passes it into
  the form (`src/app/student/assignments/[id]/page.tsx:137`). Feedback written
  on a forum post is invisible to its author. *(implicit)*

### Commenting

- **R35.** A comment body is trimmed, must be at least 1 character after
  trimming, and at most 5,000 — `src/lib/forum-actions.ts:54-56`. The first
  issue's message is returned verbatim to the client — `:64-67`.
- **R36.** Commenting is gated by `canCommentOnForumSubmission(user, submissionId)`,
  which throws `ForbiddenError` on failure — `src/lib/forum-actions.ts:69`.
- **R37.** That gate returns false unless the target's assignment has
  `type === "FORUM"` **and** `forumAllowComments === true` —
  `src/lib/auth/permissions.ts:332`. The flag is thus enforced on the server, not
  only in the UI (R32).
- **R38.** SUPER, and any ADMIN of the assignment's season, may comment
  unconditionally — `src/lib/auth/permissions.ts:334-335`.
- **R39.** A STUDENT may comment only when their current `GroupStudent.groupId`
  equals the post author's current `GroupStudent.groupId`; either party being
  ungrouped denies — `src/lib/auth/permissions.ts:337-350`.
- **R40.** **LEADER and MENTOR cannot comment at all.** Neither role is handled,
  so both fall through to `return false` —
  `src/lib/auth/permissions.ts:352`. A leader cannot participate in the
  discussion of a group they lead. *(implicit — denial by fall-through, not by a
  stated rule)*
- **R41.** Post-first-to-unlock is re-checked server-side, but **only for
  STUDENT**: the caller's own submission for the same assignment must exist and
  not be `DRAFT` — `src/lib/forum-actions.ts:78-91`. SUPER and season ADMINs
  bypass it by construction.
- **R42.** That re-check reads the caller's own row by the unique
  `(assignmentId, studentUserId)` pair derived from the *target* submission's
  assignment — `src/lib/forum-actions.ts:71-87` — so it correctly ties the two
  submissions to the same assignment.
- **R43.** Nothing verifies that the **target** submission is posted. A student
  who satisfies R39 and R41 may comment on a group-mate's `DRAFT` row if they
  can supply its id — `src/lib/forum-actions.ts:69-95` reads only
  `assignmentId` from the target (`:71-74`). Unreachable through the UI because
  R23 hides drafts, reachable through a server action call with a guessed
  sequential id (R5). *(implicit)*
- **R44.** Nothing prevents commenting on one's own post; the feed simply never
  renders it (`src/lib/forum-query.ts:81` excludes self). *(implicit)*
- **R45.** Comment creation is a single unconditional insert after the gates —
  no rate limit, no duplicate detection, no length-vs-content check beyond R35 —
  `src/lib/forum-actions.ts:93-95`.
- **R46.** Commenting notifies nobody, including the post's author —
  `src/lib/forum-actions.ts:93-98`.

### Editing, deletion and moderation

- **R47.** **There is no comment edit action.** No function in
  `src/lib/forum-actions.ts` updates a `ForumComment`, and `db.forumComment` is
  referenced exactly three times across `src/` — `create` (`:93`),
  `findUnique` (`:104`), `delete` (`:120`).
- **R48.** **There is no post delete and no post hide.** Nothing in v1 deletes a
  `Submission` (domain 8 R16), and no forum action clears `text` or reverts
  `status`. A posted response can only be overwritten by its author (R13).
- **R49.** A comment may be deleted by its **author**, by **SUPER**, or by an
  **ADMIN of the assignment's season** — `src/lib/forum-actions.ts:115-118`.
- **R50.** LEADER and MENTOR cannot delete a comment — they are neither author
  nor `isAdmin` under `:116-117`, so `:118` throws. Combined with R40, a leader
  has no read, write or moderation capability on their own group's thread.
- **R51.** Deletion is a hard `db.forumComment.delete` — no soft delete, no
  tombstone, no "deleted by" record, and the body is gone —
  `src/lib/forum-actions.ts:120`. Because comments cannot nest (§2), no replies
  are orphaned; the question "what does a deleted parent do to its replies" has
  no answer in v1 because there are no replies.
- **R52.** The delete control is rendered **only when the comment is the
  viewer's own** — `src/components/forum/forum-view.tsx:205`. The SUPER/ADMIN
  branch of R49 is therefore **unreachable through any v1 UI**: admins never see
  the forum screen at all (R53). *(implicit — a server capability with no client)*
- **R53.** **No staff surface exists.** `ForumView` is imported in one file
  (`src/app/student/assignments/[id]/page.tsx:14`), and that page begins with
  `requireRole(user, ["STUDENT"])` — `:24`. No admin, leader, mentor or super
  page renders a forum thread. *(implicit — enforced by which page renders the
  control)*
- **R54.** The staff submission-detail read selects neither `assignment.type`
  nor `forumComments` — `src/lib/submissions-query.ts:34-66`. A reviewer opening
  a forum post sees it as an ordinary submission with a text body, no indication
  it is a discussion, and no comments.
- **R55.** Forum posts enter the leader review queue as ordinary work, because
  R6 sets `status: "SUBMITTED"` and the queue filters on
  `status: { in: ["SUBMITTED", "REVIEWED", "RETURNED"] }` with no type filter —
  `src/lib/submissions-query.ts:123-127`. *(implicit)*
- **R56.** Reviewing a forum post is fully permitted — domain 8's
  `reviewSubmissionAction` has no type precondition (`08-submissions.md` R20,
  R25) — and sets `status: "REVIEWED"`, which keeps the post visible in peers'
  feeds (R23 excludes only `DRAFT`) while making the feedback invisible to its
  author (R34).
- **R57.** **There is no moderation of any kind.** No report or flag action, no
  hide, no thread lock, no word filter, no rate limit, no audit log, no
  notification to staff — `src/lib/forum-actions.ts` (123 lines) contains only
  post, comment and delete-own-comment, and no staff can read a thread (R53).
- **R58.** All timestamps are server-side `new Date()` (`src/lib/forum-actions.ts:44`)
  and Prisma's `@default(now())` (`prisma/schema.prisma:561`), and both are
  rendered only as relative distances — `formatDistanceToNowStrict` at
  `src/components/forum/forum-view.tsx:185, 203`. No timezone is applied
  anywhere; the relative rendering is what conceals it.

## 4. Authorization

Role gates are pure claims checks; row-scoped gates hit the database.

| Operation | Roles | Row-scoped condition | v1 citation |
|---|---|---|---|
| Open the forum screen | **STUDENT only** | assignment in the student's `activeSeasonId`, and targeted at their current group unless `isAllGroups` | `src/app/student/assignments/[id]/page.tsx:24, 29-38` |
| Read own response | any authenticated | caller must hold the submission id (never verified) | `src/lib/forum-query.ts:54-57` — R3 |
| Read the peer feed | STUDENT (in practice) | own submission not `DRAFT` **and** same current group as each author **and** each author's submission not `DRAFT` and `text` not null | `src/lib/forum-query.ts:60, 74-84, 88-93` — R19, R20, R23 |
| Post / update a response | **any authenticated** | `submission.studentUserId === caller`; assignment `type === FORUM`; word count ≥ `forumMinWords ?? 0` | `src/lib/forum-actions.ts:33, 34, 36-39` |
| Comment | SUPER, ADMIN (of the season), STUDENT (conditional). **LEADER and MENTOR: never** | assignment `type === FORUM` and `forumAllowComments`; for STUDENT: same current group as the post author **and** own submission on that assignment exists and is not `DRAFT` | `src/lib/auth/permissions.ts:332-352`; `src/lib/forum-actions.ts:78-91` |
| Delete a comment | author (any role), SUPER, ADMIN of the assignment's season | `comment.authorUserId === caller` **or** `seasonAdminIds.includes(seasonId)` | `src/lib/forum-actions.ts:115-118` |
| Edit a comment | — | **no such operation** | R47 |
| Delete / hide a post | — | **no such operation** | R48 |
| Read a thread as staff | — | **no such operation** | R53 |

Things a v2 implementer must not reproduce, and must not silently drop:

- **The post action has no role gate and no targeting gate.** The only checks
  are identity, assignment type and word count (R7, R15). Every other constraint
  a reader might assume — "the student is enrolled", "the assignment targets
  them", "the season is active", "the due date has not passed" — exists only
  because `src/app/student/assignments/[id]/page.tsx:24-38` refused to render
  the page. This is the same shape as the leader-attendance defect: **the page's
  query narrowed the set, the action underneath checked nothing.** In v2 the
  post endpoint must re-run the targeting check itself.
- **The read gate is not a gate, it is an argument.** `loadForumView` trusts
  `ownSubmissionId` (R3). A v2 endpoint must derive the caller's own submission
  from `(assignmentId, callerUserId)` and must never accept a submission id from
  the client for the "own response" slot.
- **`canCommentOnForumSubmission` is genuinely row-scoped and correct** —
  it re-reads the target, re-checks the type and flag, and compares live group
  membership (`permissions.ts:324-350`). Port it, do not rewrite it. It is the
  one gate in this domain that would survive an API.
- **Leaders and mentors are excluded by accident, not by policy** (R40, R50,
  R53). Nothing in v1 states that a leader should be unable to read or moderate
  their group's discussion; it falls out of a missing `if`. Treat this as a
  decision to make (§10 D3), not behaviour to preserve.

## 5. Read surface

**`loadForumView(assignmentId, studentUserId, ownSubmissionId)`** —
`src/lib/forum-query.ts:44-141`. The domain's only read.

Returns one object (`ForumViewData`, `:24-34`): `ownSubmissionId` (echoed
input), `ownText`, `ownStatus`, `locked`, `minWords`, `allowComments`, and
`posts`. Each post carries `submissionId`, `studentUserId`, `authorName`,
`authorAvatarUrl`, `text`, `submittedAt` and a `comments` array of
`{ id, authorUserId, authorName, authorAvatarUrl, body, createdAt }`.

**Query sequence — four round trips before the feed, then N avatar calls:**

1. `assignment.findUnique` for `forumMinWords` / `forumAllowComments` (`:49-52`).
2. `submission.findUnique` by the supplied id for `text` / `status` (`:54-57`).
3. **Early return if locked** (`:72`) — the cheapest path, two queries.
4. `groupStudent.findUnique` for the viewer's group (`:74-77`); early return if
   ungrouped (`:78`).
5. `groupStudent.findMany` for peer ids (`:80-83`); early return if alone (`:85`).
6. `submission.findMany` with `forumComments` included (`:87-112`) — one query
   for posts and all their comments.
7. `storage.url(...)` **per post author and per comment author**
   (`:120-122, 130-132`), inside nested `Promise.all`s. With the local driver
   this is string manipulation (`src/lib/storage/local.ts:33-36`); with the S3
   driver it **throws** (`src/lib/storage/s3.ts:19-21`), taking the whole page
   down for any thread whose participants have avatars.

**No role branching.** There is exactly one shape, produced for exactly one
consumer, and no staff variant exists (R53).

**Over-fetch and unboundedness:** the feed returns every non-draft peer post and
every comment on each, with no limit (R27). It also returns each post's full
`text` even though only the visible cards are read — acceptable in a server
render, expensive over a mobile connection. Queries 4 and 5 are a join in
disguise (the same pattern domain 8 flags at its R49).

**Reads owned elsewhere that touch forum data:** `loadSubmissionByPublicId`
(`src/lib/submissions-query.ts:33-95`) returns a forum post's `text` to every
reviewer without its comments or its type (R54); `listSubmissionsForLeader`
(`:109-151`) includes forum posts as queue rows (R55). Both are domain 8's.

## 6. Write surface

| Action | Inputs | Validation | Writes | Cascades / side effects | Returns |
|---|---|---|---|---|---|
| `submitForumPostAction` `forum-actions.ts:18-52` | `submissionId: number`, `text: string` | row exists; `studentUserId === caller` (throws); `assignment.type === FORUM`; `countWords(text) >= forumMinWords ?? 0`. **No Zod schema, no length cap on `text`, no due-date check, no targeting check, no status precondition** | `Submission.text`, `status = SUBMITTED`, `submittedAt = now` — one update (`:42-45`) | revalidates 4 paths (`:47-50`); **no notification** (R16); makes the whole peer feed visible to this student for the first time (R19) | `{ ok: true }` / `{ ok: false, error }` |
| `addForumCommentAction` `forum-actions.ts:58-99` | `submissionId: number`, `body: string` | Zod: trimmed, 1–5,000 (`:54-56`); `canCommentOnForumSubmission` (throws, `:69`); target exists (`:71-75`); for STUDENT, own submission on the same assignment exists and is not `DRAFT` (`:78-91`) | one `ForumComment` row (`:93-95`) | revalidates the assignment page (`:97`); **no notification** (R46) | `{ ok: true }` / `{ ok: false, error }` |
| `deleteForumCommentAction` `forum-actions.ts:101-123` | `commentId: number` | comment exists (`:113`); author **or** SUPER **or** season ADMIN, else throws (`:115-118`) | hard-deletes the row (`:120`) | revalidates the assignment page (`:121`); nothing else — no tombstone, no audit | `{ ok: true }` / `{ ok: false, error }` |

**Non-atomic sequences:** none inside this domain — each action performs a
single write. The composite risk is across domains: the post action's single
update depends on a row created by a *different* code path during a page render
(R2, §10 D1), so the "create then post" sequence as a whole is neither atomic
nor owned by anyone.

**Ordering hazard.** `addForumCommentAction` runs the permission gate at `:69`
*before* confirming the target exists at `:71-75`. `canCommentOnForumSubmission`
already returns false for a missing row (`permissions.ts:331`), so a
non-existent id produces `ForbiddenError` rather than "Response not found." —
the `:75` branch is unreachable. Harmless, but it means a probe cannot
distinguish "no such submission" from "not allowed", which is the *desirable*
behaviour and should be kept deliberately in v2 rather than by accident.

**Errors are strings, not codes** — `{ ok: false, error: "<English sentence>" }`
(`src/lib/forum-actions.ts:12`), including the user-facing word-count message
interpolated at `:39`. Authorization throws `ForbiddenError`. v2 replaces both
with the envelope in `CLAUDE.md`.

## 7. Proposed API

Base `/api/v1`. Envelope `{ data }` / `{ error: { code, message } }`.
**Every endpoint below is new** — v1 has no forum route and `apps/backend/src/routes/`
has no forum file.

| Method | Path | Status | Auth | Request | Response |
|---|---|---|---|---|---|
| GET | `/assignments/:id/forum` | **new** | bearer; caller must be targeted by the assignment (R15 made explicit) | query: `cursor?`, `limit?` | `ForumView`: own response + lock state + config + a **paginated** page of peer posts |
| PUT | `/assignments/:id/forum/response` | **new** | bearer; STUDENT targeted by the assignment | `{ text }` | `ForumOwnResponse` — **upserts** the submission row (§10 D1), applies R9, sets `SUBMITTED`/`submittedAt` |
| GET | `/assignments/:id/forum/posts/:submissionId/comments` | **new** | bearer; same gate as the feed | `cursor?`, `limit?` | paginated comments for one post (R26/R27 made bounded) |
| POST | `/assignments/:id/forum/posts/:submissionId/comments` | **new** | bearer + `canCommentOnForumSubmission` (gate does not exist in `apps/backend/src/lib/permissions.ts` — its exports are `canAccessSeason`, `canAccessGroup`, `canMarkAttendance`, `canViewSubmission`) | `{ body }` | the created `ForumComment` |
| DELETE | `/forum/comments/:commentId` | **new** | bearer; author, SUPER, or season ADMIN (R49) — **plus LEADER if §10 D3 says yes** | — | `{ deleted: true }` |

Design notes that are decisions, not transcription:

- **The feed is addressed by assignment, not by submission.** v1 addresses
  everything by `Submission.id` (R5) because the page already had one. An
  assignment-scoped path lets the server derive the caller's own row from
  `(assignmentId, callerUserId)` — closing R3 — and makes the upsert in `PUT`
  natural.
- **`PUT`, not `POST`.** Posting and updating are the same operation in v1
  (R13), keyed by the unique `(assignmentId, studentUserId)` pair. A `PUT` on a
  singleton sub-resource says that honestly and is idempotent, which matters
  under React Query's refetch-on-focus behaviour.
- **Peer posts and comments paginate separately.** R27 is the rule most likely
  to be ported by accident. A phone must not load a 30-post thread with every
  comment in one response; return the first page of comments inline with each
  post (say 3) plus a `commentCount`, and let the comment endpoint fetch the
  rest.
- **The feed response must carry `commentCount` per post**, which v1 never
  computes — the UI counts the array it already has
  (`src/components/forum/forum-view.tsx:125` counts *posts*, not comments).
  Without it, a paginated comment list has no affordance.
- **Return `canComment` and `canDelete` per row.** v1's client re-derives the
  delete affordance from `authorUserId === currentUserId`
  (`src/components/forum/forum-view.tsx:205`), which is why R49's admin branch
  is unreachable (R52). Computing it server-side fixes that class of bug
  permanently.
- **Do not expose author email as a display name.** R30 leaks it. The response
  should carry a resolved `authorDisplayName` with a non-email fallback and no
  `authorEmail` field at all (§10 D6).
- **`avatarUrl` should be a stable URL or omitted**, not the result of a
  per-author driver call (R31). Resolving N avatars per feed is a foot-gun
  waiting for the S3 driver (§10 D12).
- **Where a staff thread view lands is §10 D3.** If it is wanted, it is
  `GET /assignments/:id/forum?groupId=` for a leader/admin, reusing the same
  response shape with a group selector — not a second endpoint.

## 8. Proposed shared contracts

New file `packages/shared/src/forum.ts`. v1's shapes are three bare
`interface`s in `src/lib/forum-query.ts:5-34`; per `CLAUDE.md` ("Domain
contracts are Zod, not bare interfaces") they land here as Zod from the start —
there is nothing to convert, because nothing exists yet.

| Contract | Kind | Fields |
|---|---|---|
| `forumCommentSchema` | new | `id`, `authorUserId`, `authorDisplayName`, `authorAvatarUrl` (nullable), `body` (**plain text** — §2), `createdAt` ISO string, `canDelete` boolean (server-computed, R49/R52) |
| `forumPostSchema` | new | `submissionId`, `studentUserId`, `authorDisplayName`, `authorAvatarUrl` (nullable), `text` (**HTML** — R28), `submittedAt` ISO string, `commentCount`, `comments` (first page only), `canComment` boolean |
| `forumOwnResponseSchema` | new | `submissionId` (**nullable** — the field that closes §10 D1), `text`, `status` via the shared `SubmissionStatus`, `wordCount`, `posted` boolean |
| `forumViewSchema` | new | `own`: `forumOwnResponseSchema`; `locked` boolean (R19); `minWords` nullable int; `allowComments` boolean; `posts` array; `nextCursor` nullable |
| `submitForumResponseRequestSchema` | new | `text`: string. **Add a max length** — v1 has none (§6), and domain 7 caps `description` at 20,000 (`07-assignments.md` R2); match it. |
| `addForumCommentRequestSchema` | new | `body`: string, trimmed, min 1, max 5,000 — the exact shape of `src/lib/forum-actions.ts:54-56` |
| `forumFeedQuerySchema` | new | `cursor?`, `limit?` |

**Reuse, do not redefine:** `SubmissionStatus` from
`packages/shared/src/enums.ts`; `AssignmentType`, `forumMinWords` and
`forumAllowComments` from `packages/shared/src/assignment.ts` (domain 7 owns
them — this domain must not restate the assignment contract inside
`forumViewSchema` beyond the two flattened config values the screen needs).

**`countWords` must be shared, not duplicated.** v1 already treats it as a
client/server helper with no runtime directive (`src/lib/forum.ts:1`) and calls
it from both the action (`src/lib/forum-actions.ts:36`) and the component
(`src/components/forum/forum-view.tsx:51`) so the live counter and the gate
agree. In v2 it belongs in `packages/shared` for the same reason — a divergent
reimplementation in the RN client produces a button that is enabled while the
server refuses. Carry R10's exact semantics, including the unhandled numeric
entities.

## 9. Screens

The v2 tree has `apps/mobile/app/(app)/assignments.tsx` (list) and **no dynamic
segments anywhere** — `find apps/mobile/app -type f` returns 23 files, none with
`[...]` in the name. Every route below is new.

| v1 page(s) | v2 route | Exists? | Roles | Notes |
|---|---|---|---|---|
| `/student/assignments/[id]` FORUM branch (`src/app/student/assignments/[id]/page.tsx:42-75`) | `/assignments/[id]` — forum section inside the shared detail route | **no — must be created** (domain 7 owns the route; this domain owns the forum branch inside it) | STUDENT | Compose box + word counter + lock state + feed. Domain 8 owns the sibling STANDARD branch of the same route. |
| `ForumView` compose card (`src/components/forum/forum-view.tsx:72-107`) | in-screen component | **no** | STUDENT | Needs a rich-text **editor** on RN (§10 D11). Live word counter must use the shared `countWords`. |
| `ForumPostCard` + comments (`src/components/forum/forum-view.tsx:141-249`) | in-screen list | **no** | STUDENT | Must paginate (R27). Comment compose is a plain `Textarea` equivalent, not rich text (R29). |
| *(none in v1)* — staff thread view | `/assignments/[id]` forum section, leader/admin branch | **no** | LEADER, ADMIN, SUPER, MENTOR — **pending §10 D3** | v1 has no staff forum screen at all (R53). This is a new capability, not a port. |
| *(none in v1)* — reviewer sees forum context | `/submissions/[publicId]` (domain 8) | **no** | reviewers | Domain 8 owns the route; this domain owns the "this is a forum post, here is its thread" section that R54 currently omits. |

**Mobile-specific concerns this domain raises:**

- **Rich text twice over.** The post body is HTML (R28) and needs both a
  renderer and an editor on RN, exactly as domain 8 flags for `text`/`feedback`.
  The comment body is plain text (R29) and needs neither — do not accidentally
  unify them.
- **The lock state is the first screen a student sees** (R19) and reads as an
  error if rendered badly. It is a deliberate product mechanic ("post to
  unlock"), so it deserves a real empty state, not a spinner.
- **A thread is the only screen in the product where a student reads other
  students' writing.** It is also the screen most likely to be open on a phone
  in a room with no adult present. That is the argument for D2 and D3 below.

## 10. Open questions and divergences

**D1 — nothing creates the submission row, so nothing can be posted. Blocking.**
Confirmed above: the forum's entire write surface is addressed by a submission
id (R5) produced by `ensureDraftSubmission` during a **GET**
(`src/app/student/assignments/[id]/page.tsx:40`), and domain 8's D15 removes
that read-time write. v2 additionally has no counterpart to
`ensureDraftSubmission` at all, so today a v2 student on a forum assignment has
no row, no id and no way to post.

*Recommendation, and it must be decided with domain 8's D15:* **make
`PUT /assignments/:id/forum/response` the creator.** It upserts on the unique
pair `(assignmentId, studentUserId)` (`prisma/schema.prisma:534`) and, in the
same statement, writes `text`, `status = SUBMITTED` and `submittedAt` — which
is exactly what R6 already does, minus the assumption that the row exists. This
is domain 8's D15 option 1 applied to the forum, and it is strictly better here
than there: a forum post has no draft-save step, so the *first* write is always
a real post and there is no window in which an empty row is useful.

Consequences to specify at the same time:

- `forumOwnResponseSchema.submissionId` must be **nullable** (§8). The screen
  must render the compose box, the word counter and the locked feed with no row
  in existence.
- The upsert is the only place the targeting check can live (R15), because there
  is no longer a page render doing it. It must read `isAllGroups` /
  `AssignmentTarget` itself.
- Use a real upsert, not v1's read-then-create-then-catch (domain 8 R59).
- Domain 7's assignment-detail GET must not create anything either; it already
  reads the caller's submission stub (`08-submissions.md` §10 D15) and must
  tolerate a null one for forum assignments.

**D2 — there is no moderation, and this is the product risk of the domain.**
Confirmed by absence (R57): no report, no flag, no hide, no lock, no word
filter, no rate limit, no audit, no staff notification. The only removal
mechanism is comment deletion by the author or by SUPER/season-ADMIN (R49) —
and that admin power **cannot be exercised** because no admin UI renders a
thread (R52, R53). In practice, in v1 today, the only person who can remove a
comment written by a young person is the person who wrote it.

The post body is worse: there is no delete or hide for a post at all (R48). A
response that should not be visible can only be **overwritten by its own
author**, and it stays visible to the whole group in the meantime.

*Recommendation — treat a minimum moderation set as in-scope for this domain,
not as a later enhancement:*

1. Staff read access to threads (D3) — you cannot moderate what you cannot see.
2. Staff delete on comments, exposed in the UI, using the gate that already
   exists (R49) plus LEADER per D3.
3. Staff hide on a *post*. This is new behaviour and needs a decision on
   mechanism: a `hiddenAt` column is a schema change and therefore blocked
   while the database is shared with v1, so the available lever is reverting
   `status` to `DRAFT`, which removes it from every feed (R23) without
   destroying the text. That overloads `DRAFT` further and interacts with
   domain 8's D3 — flag it there rather than deciding unilaterally.
4. A report/flag affordance for students. Also a schema change; if it cannot
   land before v1 retires, the fallback is a "report to your leader" action that
   sends a notification rather than writing a row.

Items 1 and 2 are pure v2 work with no schema change and should not wait.
Items 3 and 4 need a product owner's answer and a schema window.

**D3 — leaders and mentors have no access to their own group's discussion, by
accident.** R40 (cannot comment — fall-through to `false` at
`permissions.ts:352`), R50 (cannot delete a comment), R53 (cannot read a thread
at all — the page is `requireRole(user, ["STUDENT"])`). Nothing in v1 states
this as policy; it is what happens when the only screen was built for students.
Meanwhile SUPER and season ADMINs *can* comment and delete (R38, R49) but have
no screen to do it from.

*Recommendation:* grant LEADER read on threads for groups they lead, and
comment + delete-comment on the same scope; grant ADMIN/SUPER read across the
season; keep MENTOR read-only, consistent with their read-all-no-write posture
elsewhere (`08-submissions.md` §4). This is the decision that makes D2's
moderation plan implementable. It is a **widening** of v1 behaviour, so it needs
an explicit yes — but the alternative is shipping an unsupervised student
discussion board to a phone.

**D4 — visibility is keyed to current group membership, not to the assignment.**
R20 and R24: the feed is "students who share my `GroupStudent.groupId` right
now". A student who changes group stops seeing the thread they participated in
and starts seeing a different one; their own post remains in the old group's
feed, authored by someone who is no longer in that group. Nothing records the
group a post was written in.

*Recommendation:* keep group-scoped visibility — it is the right product rule
and the reason the feature is safe at all — but **resolve the group from the
assignment's targeting where possible** rather than from live membership, and
document the move case explicitly. At minimum, the v2 feed query must state
which of the two it means, because they diverge silently. Related open
question for the product owner: should a moved student's old posts stay visible
to their old group? v1 says yes, by omission.

**D5 — the post write has no targeting, due-date or role gate.** R7, R12, R15.
This is the domain's instance of the pattern the first batch flagged: the page's
checks at `src/app/student/assignments/[id]/page.tsx:29-38` are the whole of the
authorization, and `submitForumPostAction` re-checks none of them. A ported
endpoint that only reproduces `forum-actions.ts` inherits an open write.

*Recommendation:* the `PUT` in D1 must re-check season and targeting server-side.
On the due date, v1 deliberately (or at least consistently) allows late forum
posts — the action selects `dueAt` and ignores it (R12). Recommend keeping that
permissive behaviour, because a discussion that closes at a deadline stops being
a discussion, but **write it down as a rule** rather than leaving it as an unused
select. If the product wants a cutoff, it is a new restriction and needs an
explicit decision.

**D6 — student email addresses are shown to peers.** R30: `displayName` falls
back to `email` when `name` is blank (`src/lib/forum-query.ts:36-38`), applied to
both post and comment authors. Every student in a group sees the email of any
group-mate who has not set a name. These are young people's addresses.

*Recommendation:* do not port the fallback into the forum response. Use the
name, or a stable non-identifying fallback ("Group member"), and never send
`email` in a forum payload. Whether the same fallback should change elsewhere in
v1 is a cross-domain question — flagged, not specced here.

**D7 — the thread is unbounded in three dimensions at once.** R27: every peer,
every post, every comment, in one query with no `take`
(`src/lib/forum-query.ts:80-112`). Fine for a server-rendered page on a laptop;
on a phone it is a single response that grows without limit for the life of the
season, re-fetched on every focus under React Query's defaults.

*Recommendation:* cursor-paginate posts and comments independently (§7), return
`commentCount` per post, and cap the inline comment preview. Diverging is free —
no client depends on v1's shape because v1 has no API.

**D8 — an empty response can be posted.** R11: with `forumMinWords` null or 0,
`countWords("") >= 0` passes on both client and server, so a student can post
nothing, flip to `SUBMITTED`, unlock the peer feed, and read everyone else's
work without contributing. Domain 7 defaults the form field to 50
(`07-assignments.md` R21) but permits 0 explicitly (its R6, range 0–2000), and a
`FORUM` assignment created through any other path gets null.

*Recommendation:* require at least one word regardless of `forumMinWords`
(`min(1)` on the shared schema, §8). "Post to unlock" is a contribution
mechanic; an empty post defeats it entirely. This is a new restriction —
confirm it, but the default should be to close it.

**D9 — a forum post can be reviewed, and the student can never see the
feedback.** R34, R55, R56: posting sets `SUBMITTED`, which puts the post in the
leader queue as an ordinary submission (`src/lib/submissions-query.ts:123-127`);
a reviewer can write `feedback` and set `REVIEWED` with no type check
(`08-submissions.md` R20, R25); and the forum screen renders no feedback at all
because `loadForumView` never selects it. The reviewer also sees no indication
they are reviewing a discussion post and cannot see its comments (R54).

*Recommendation:* decide which of the two this is. If forum posts are reviewable
work, the forum screen must render `feedback` and the reviewer screen must show
the thread — both are v2 additions. If they are not, exclude
`assignment.type === "FORUM"` from the leader queue and refuse review on them.
Cross-references domain 8's D10/D11; do not decide it inside domain 8 without
this context.

**D10 — R33: forum assignments show the student no due date.** The FORUM branch
renders a badge and a title (`src/app/student/assignments/[id]/page.tsx:53-60`)
while the STANDARD branch renders the due badge
(`:107-118`). Combined with D5 (no due-date enforcement) the field is invisible
and inert on the one assignment type where it is set but unused.
*Recommendation:* render the due date on the forum screen in v2. It costs
nothing and the omission is plainly a branch that was not finished.

**D11 — RN needs a rich-text editor for the post and none for the comment.**
R28 vs R29. The post body is HTML written through `RichTextEditor`; the comment
is plain text through a `Textarea`. Existing posts in the shared database are
already HTML, so a *renderer* is mandatory. If an editor is not ready, a
plain-text compose that emits a single `<p>` is an acceptable fallback (the same
call domain 8 makes) — but the comment box must **not** acquire one, or the
plain-text render at `forum-view.tsx:219` starts showing markup.

**D12 — the S3 storage driver throws on `url()`, and the feed calls it once per
author.** `src/lib/storage/s3.ts:19-21` is a stub that raises
`"S3Storage.url not implemented."`, and `getStorage()` selects it whenever
`STORAGE_DRIVER === "s3"` (`src/lib/storage/index.ts:24-25`). R31 calls `url()`
for every post author and every comment author with an `avatarPath`. On an S3
deployment the entire forum page throws. v1 is presumably running the local
driver today; this is recorded as a latent v1 production issue, not a v2 task.
*Recommendation:* in v2, serve avatars through an id-addressed endpoint like
domain 8's file download rather than a driver-generated URL, and never resolve N
of them inside a feed query. Note also that the local driver's URL points at
`/api/uploads/...` (`src/lib/storage/local.ts:33-35`), which domain 8's D1
established is gated on nothing but a session — so avatar paths are readable by
any logged-in user today.

**D13 — nothing about a forum is ever notified.** R16 and R46: no notification
when a peer posts, when someone comments on your response, or when your comment
is deleted. A discussion board where participants learn of replies only by
reopening the page is a discussion board nobody returns to.
*Recommendation:* the obvious first push notification in the product is
"someone commented on your response". It needs a new `NotificationType` value,
which is a schema change and therefore blocked until v1 is retired — same
constraint domain 8 records at its D14. Raise it now so it is queued for the
first migration window rather than discovered during Phase 4.

**D14 — writes are addressed by sequential integer ids.** R5 and R43: a comment
can be posted against any `submissionId` the caller can guess, and the gates
(R39, R41) constrain *who* the caller is but not *which* row they name — so a
group-mate's `DRAFT` response is a valid comment target even though the feed
hides it (R23). Low severity in v1 because server actions are awkward to call
directly; higher once there is a public API.
*Recommendation:* the endpoints in §7 nest the post under its assignment, so the
server can verify `submission.assignmentId === :id` before the gate runs. Add
that check explicitly, and add the missing "target must not be `DRAFT`"
condition to the comment path.

**D15 — timezones, as everywhere in v1.** R58: `new Date()` and
`@default(now())` with relative-only rendering
(`src/components/forum/forum-view.tsx:185, 203`). The forum happens to be the
safest surface in the product for this, because "3 hours ago" is
timezone-independent — but the moment a v2 screen shows an absolute post time,
it inherits the same unhandled problem the rest of the migration has. Flagged,
not solved here.

---

**Rule count:** 58 numbered rules (R1–R58), of which **19 are marked
`(implicit)`**: R3, R5, R11, R12, R14, R15, R17, R21, R23, R24, R27, R33, R34,
R40, R43, R44, R52, R53, R55.

**The three that matter most:** R23 (the entire privacy rule of the feature
lives in a `where` clause), R57 (no moderation exists, and the one admin removal
power that does exist has no UI — R52), and R15/R7 (the post write checks
identity and nothing else; every other constraint is the page's).
