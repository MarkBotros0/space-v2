# Domain 08 — Submissions

> Status: draft · Phase: 1 (student read/write) and 2 (leader review) · v1 API status: **partial** — the migration design's "done" does not hold; see §7.

A submission is one student's response to one assignment: optional rich text,
optional attached files, a status, and a reviewer's written feedback. This
domain owns the submission row, its files, its state transitions, and its
review. **Domain 7 (Assignments)** owns the assignment's lifecycle, its
targeting (`isAllGroups` / `AssignmentTarget`), its due date and its file-policy
fields (`maxFileSizeMb`, `allowedMimeCategories`) — this domain only *reads*
those and enforces them at upload time.

Boundary notes, decided here so the two specs do not overlap:

- **`submission-tracker.tsx` belongs to domain 7.** It is fed by
  `loadSubmissionTracker` / `SubmissionTrackerRow` in
  `src/lib/assignments-query.ts:157`, is rendered only from the admin
  *assignment* detail page (`src/app/admin/season/[code]/assignments/[id]/page.tsx:88-91`),
  and its rows are one-per-*targeted student* (including a synthetic `PENDING`
  row for students with no submission at all) rather than one-per-submission.
  Its per-assignment roll-up is an assignment-completion view. The only thing
  this domain claims from it is the link target it produces
  (`/leader/submissions/{publicId}`, `submission-tracker.tsx:64`) — see §9.
- `ensureDraftSubmission` (`src/lib/assignment-actions.ts:184-213`) physically
  lives in domain 7's action file but creates a `Submission` row; its rules are
  restated here (R1–R4, R58–R61) because the row it creates is this domain's.
  It runs during a page **render**, not from a form — see R58 and §10 D15.
- **Forum assignments** (`AssignmentType.FORUM`) reuse the `Submission` row as
  the post body and add `ForumComment`. That is **domain 14**. The student
  assignment page branches away before the submission form
  (`src/app/student/assignments/[id]/page.tsx:42-75`); everything below applies
  to `STANDARD` assignments unless stated.

## 1. v1 source

| File | Holds |
|---|---|
| `src/lib/submission-actions.ts:1-204` | All five writes: save draft, submit, upload file, remove file, review. The MIME category table and the owner-only loader. |
| `src/lib/submissions-query.ts:1-151` | The two reads: `loadSubmissionByPublicId` (detail) and `listSubmissionsForLeader` (leader queue). |
| `src/lib/assignment-actions.ts:184-213` | `ensureDraftSubmission` — lazily creates the DRAFT row and its `publicId`. |
| `src/lib/auth/permissions.ts:162-190` | `canViewSubmission` — the read gate. |
| `src/lib/auth/permissions.ts:292-315` | `canReviewSubmission` — the review gate. |
| `src/lib/public-id.ts:1-9` | `newPublicId()` — nanoid v5, 62-char alphabet, length 10. |
| `src/lib/storage/index.ts:13-40` | `Storage` interface, driver selection, `buildStorageKey`. |
| `src/lib/storage/local.ts:8-37` | Local filesystem driver. No containment check on `get`/`delete` (see §10, D6). |
| `src/lib/notifications.ts:36-53` | `createNotification` — preference check, row insert, best-effort email. |
| `src/app/api/uploads/[...path]/route.ts:11-37` | v1's file-serving route. Gated on "is logged in" only (see §10, D1). |
| `src/app/api/v1/submissions/[publicId]/route.ts:40-105` | v1's mobile API: submission detail + student text PATCH. |
| `src/app/api/v1/submissions/[publicId]/files/route.ts:28-95` | v1's mobile API: file upload + file delete. |
| `src/components/assignments/student-submission-form.tsx:1-280` | The student's surface. Holds the *only* enforcement of the read-only-after-due / after-review rules. |
| `src/components/assignments/submission-review-form.tsx:1-65` | The reviewer's surface. Feedback only — no grade field exists. |
| `src/components/ui/submission-status-badge.tsx:6-27` | The status vocabulary and its four labels, in one place. |
| `src/components/assignments/leader-queue-list.tsx:15-80` | The leader queue table and its late badge. |
| `src/app/student/assignments/[id]/page.tsx:22-146` | Student's own view: targeting checks, draft creation, form props. |
| `src/app/leader/submissions/page.tsx:8-27` | Leader queue page: role gate and the pending/late counters. |
| `src/app/leader/submissions/[publicId]/page.tsx:24-121` | Leader/admin/mentor detail + review page. |
| `src/app/mentor/dashboard/page.tsx:79-91` | Global "recent submissions" list — the widest read in v1. |
| `src/app/student/dashboard/page.tsx:57-68` | On-time counters over the student's own submitted work. |
| `src/app/leader/dashboard/page.tsx:67-75, 99-105` | Per-student completion counts for the leader's groups. |
| `src/app/admin/dashboard/page.tsx:61, 86, 118` | Season-level submitted/reviewed roll-up. |
| `src/lib/students-query.ts:367-385` | Student-detail submission history (domain 6 consumer; links here by `publicId`). |
| `src/lib/engagement.ts:17, 70` | Submission-% engagement metric (domain 9 consumer). |
| `src/lib/season-export.ts:19-21` | Export labels and the "turned in" status set (domain 17 consumer). |
| `prisma/schema.prisma:50-55, 513-550` | `SubmissionStatus`, `Submission`, `SubmissionFile`. |

v1 has **no test files anywhere**; the source above is the only statement of
intent.

## 2. Data model

### `Submission` (`prisma/schema.prisma:513-537`)

| Field | Meaning |
|---|---|
| `publicId` `String @unique` | The URL identifier. Only entity in the schema with one (`schema.prisma:515-516`). Generated at row creation, never regenerated. |
| `assignmentId` → `Assignment` | `onDelete: Cascade` (`:518`). Assignments are soft-deleted in practice (`assignment-actions.ts:154`), so this cascade never fires. |
| `studentUserId` → `User` | `onDelete: Restrict` (`:520`) — a student with submissions cannot be hard-deleted. |
| `text` `String?` | The written response. **Rich-text HTML**, not plain text (`student-submission-form.tsx:180-185` writes it via `RichTextEditor`). Stored raw; sanitised only at render (`rich-text-view.tsx:43`). |
| `status` `SubmissionStatus @default(DRAFT)` | See R14–R21. |
| `submittedAt` `DateTime?` | Set on submit (`submission-actions.ts:87`). **Never cleared** — see R18. |
| `reviewedAt` `DateTime?` | Set on every review write (`submission-actions.ts:182`). Used as the "already reviewed" flag by the review form (`leader/submissions/[publicId]/page.tsx:107`). |
| `feedback` `String?` | Reviewer's comment. Rich-text HTML, same as `text`. There is **no grade column** — see R28. |
| `reviewedById` `Int?` → `User?` | **Written but never read.** Only writer is `submission-actions.ts:183`; no query in v1 selects it, and v2 never writes it at all. |
| `@@unique([assignmentId, studentUserId])` (`:534`) | One submission per student per assignment. Load-bearing for R2/R4. |
| `@@index([studentUserId])`, `@@index([assignmentId, status])` | Support the leader queue and the tracker. |

Absent: `createdById` / `updatedById`. The schema's own header comment claims
"Audit columns (`createdById` / `updatedById`) on Season, Assignment,
**Submission**" — the `Submission` model has neither (§10, D9).

### `SubmissionFile` (`prisma/schema.prisma:539-550`)

| Field | Meaning |
|---|---|
| `submissionId` → `Submission` | `onDelete: Cascade` (`:542`) — DB-level row cascade only; blobs are not touched (§10, D5). |
| `originalName` | Client-supplied filename, stored verbatim (`submission-actions.ts:131`). |
| `storagePath` | Driver-relative key returned by `Storage.put` (`storage/index.ts:20`, `local.ts:20`). **Exposed to API clients** (`api/v1/.../route.ts:33`; v2 `routes/submissions.ts:45`). |
| `mimeType` | Client-declared type, defaulted to `application/octet-stream` when the browser sends none (`submission-actions.ts:133`). Never sniffed from content. |
| `sizeBytes` | Client-reported size in v1 (`file.size`); actual buffered size in v2 (`routes/submissions.ts:219`). |
| `uploadedAt` | The only ordering key for files (R39). |

No file-count column, no per-submission size total, no checksum, no
soft-delete. Files are hard-deleted (R12).

### `SubmissionStatus` (`prisma/schema.prisma:50-55`)

`DRAFT`, `SUBMITTED`, `REVIEWED`, `RETURNED` — in that declaration order, which
is also Postgres's sort order for the enum type and therefore the meaning of
`orderBy: { status: "asc" }` in R24.

### Enums / relations traversed but owned elsewhere

`Assignment.dueAt`, `Assignment.maxFileSizeMb`, `Assignment.allowedMimeCategories`,
`Assignment.seasonId`, `Assignment.type`, `Season.code`, `GroupStudent.groupId`,
`User.name` / `User.email`, `NotificationType.SUBMISSION_REVIEWED`.

## 3. Business rules

### Creation and identity

- **R1.** A submission row is never created by an explicit "start submission"
  action; it is created lazily the first time the student opens the assignment
  page — `ensureDraftSubmission(assignment.id, user.userId)` — `src/app/student/assignments/[id]/page.tsx:40`.
- **R2.** `ensureDraftSubmission` returns the existing row for the
  `(assignmentId, studentUserId)` pair if one exists, and otherwise creates one
  with `status: "DRAFT"` and a fresh `publicId` — `src/lib/assignment-actions.ts:188-202`.
- **R3.** A create that loses the race against a concurrent render is recovered
  by re-reading the unique pair rather than surfacing the constraint violation;
  only a still-missing row rethrows — `src/lib/assignment-actions.ts:203-212`.
- **R4.** At most one submission exists per (assignment, student), enforced by
  the database rather than by application code — `prisma/schema.prisma:534`. *(implicit)*
- **R5.** `publicId` is a 10-character string over the 62-character alphabet
  `0-9A-Za-z`, generated by nanoid v5's `customAlphabet` — `src/lib/public-id.ts:4-5`.
  The keyspace is 62^10 ≈ 8.4×10^17, so it is not practically guessable, but
  v1 never treats it as a secret: every route that accepts one still runs
  `canViewSubmission` — `src/app/leader/submissions/[publicId]/page.tsx:30`.
- **R6.** `newPublicId()` is also called once per *file upload* to build a
  unique storage-key prefix; that value is discarded and never stored —
  `src/lib/submission-actions.ts:119-124`.

*(R58–R61 belong to this subsection; they were added after coordinator review
and are numbered at the end of the list rather than renumbering R7 onward.)*

- **R58.** **The submission row is written during a GET.**
  `ensureDraftSubmission` is called in the body of the student assignment
  *page component*, before any branch renders and before the FORUM check —
  `src/app/student/assignments/[id]/page.tsx:40`. Merely opening an assignment
  materialises a `DRAFT` submission for that student; there is no user action,
  no form, and no confirmation involved.
- **R59.** `ensureDraftSubmission` is **idempotent in effect but not atomic**:
  it reads the unique `(assignmentId, studentUserId)` pair and returns the
  existing row (`src/lib/assignment-actions.ts:188-192`); otherwise it creates
  (`:193-202`); on any create failure it re-reads the same pair and returns the
  row if one now exists, rethrowing only when it still does not (`:203-212`).
  It is a read-then-create guarded by a catch, not an upsert or a transaction —
  correctness rests entirely on the database unique constraint (R4,
  `prisma/schema.prisma:534`). It lives in **domain 7's file**
  (`src/lib/assignment-actions.ts:184-213`) despite creating a `Submission`
  row; the row it creates is this domain's, so the rule is stated here.
- **R60.** The FORUM branch **depends on the stub already existing**: the page
  passes `stub.id` into `loadForumView(assignment.id, user.userId, stub.id)` —
  `src/app/student/assignments/[id]/page.tsx:40, 43` — and that id is returned
  to the client as `ownSubmissionId` (`src/lib/forum-query.ts:47, 63`), which is
  the `submissionId` argument every forum write targets
  (`src/lib/forum-actions.ts:18-24` for the post,
  `src/lib/forum-actions.ts:57-71` for comments). The *view* tolerates a missing
  row — `ownStatus = own?.status ?? "DRAFT"`, `src/lib/forum-query.ts:59` — but
  without an id the student cannot post at all. Removing the read-time write is
  therefore not free for **domain 14**; see §10 D15.
- **R61.** Because a submission's mere existence is what flips a student's
  assignment row from `PENDING` to `DRAFT` — `sub?.status ?? "PENDING"` in both
  `listAssignmentsForStudent` (`src/lib/assignments-query.ts:237`) and
  `loadSubmissionTracker` (`src/lib/assignments-query.ts:178`) — R58 changes
  what those views report with no student action in between. The consequences on
  the assignment side (list/tracker counts) are **domain 7's rule**; stated here
  only as the cause. *(implicit — the status is derived from row existence, not
  from anything the student did)*

### Student writes

- **R7.** Every student-facing write first loads the submission and rejects it
  unless `studentUserId` equals the caller's id; a missing row throws
  "Submission not found" — `src/lib/submission-actions.ts:35-55`.
- **R8.** Saving a draft writes `text` and unconditionally sets
  `status: "DRAFT"`, regardless of the current status — `src/lib/submission-actions.ts:64-67`.
  This means a `SUBMITTED` or `REVIEWED` submission is demoted back to `DRAFT`
  by a save (see §10, D3).
- **R9.** Submitting writes `text`, sets `status: "SUBMITTED"` and stamps
  `submittedAt = now` — `src/lib/submission-actions.ts:82-91`.
- **R10.** Lateness is *computed and discarded* at submit time
  (`isLate`, then `void isLate`) — no field records it —
  `src/lib/submission-actions.ts:79-80, 93`. Lateness is always re-derived at
  read time as `submittedAt > assignment.dueAt`
  (`src/app/leader/submissions/page.tsx:15`;
  `src/app/leader/submissions/[publicId]/page.tsx:33-36`;
  `src/components/assignments/leader-queue-list.tsx:46`).
- **R11.** A submission with no due date is never late — the comparison
  short-circuits on a null `dueAt` — `src/lib/submission-actions.ts:80`,
  `src/app/leader/submissions/[publicId]/page.tsx:34-36`.
- **R12.** Removing a file deletes the blob first (failure swallowed) and then
  the row; the caller must own the parent submission — `src/lib/submission-actions.ts:147-158`.
- **R13.** File removal has **no status or due-date condition** — the only
  check is ownership, so a student may strip attachments off an already-reviewed
  submission — `src/lib/submission-actions.ts:154-158`.

### State machine

Statuses: `DRAFT`, `SUBMITTED`, `REVIEWED`, `RETURNED` (`prisma/schema.prisma:50-55`).

| From ⟍ To | DRAFT | SUBMITTED | REVIEWED | RETURNED |
|---|---|---|---|---|
| *(none)* | student, implicitly on first open (R1, R2) | — | — | — |
| **DRAFT** | student, save draft (R8) | student, submit (R9) | reviewer, review (R20) — **legal in v1 although never submitted** | no code path (R21) |
| **SUBMITTED** | student, save draft (R8) — demotion | student, re-submit (R9); `submittedAt` overwritten | reviewer, review (R20) | no code path (R21) |
| **REVIEWED** | student, save draft (R8) — demotion, `feedback`/`reviewedAt` retained (R19) | student, re-submit (R9) | reviewer, review again (R20); re-notifies (R23) | no code path (R21) |
| **RETURNED** | student, save draft (R8) | student, submit (R9) | reviewer, review (R20) | no code path (R21) |

- **R14.** The student's own UI blocks *all* editing once the submission is
  `REVIEWED`, or once it is `SUBMITTED` and the due date has passed:
  `readOnly = status === "REVIEWED" || (status === "SUBMITTED" && dueAt && isPast(dueAt))`
  — `src/components/assignments/student-submission-form.tsx:96`.
- **R15.** That read-only rule is **enforced nowhere but the client**: neither
  the server actions nor v1's own `/api/v1` PATCH inspect `status` or `dueAt`
  before writing — `src/lib/submission-actions.ts:57-98`;
  `src/app/api/v1/submissions/[publicId]/route.ts:76-105`. A student can edit or
  re-submit after the due date and after review through the API. *(implicit —
  and dropped entirely the moment there is an API; see §10, D2)*
- **R16.** There is no withdraw operation. Nothing in v1 deletes a `Submission`
  row (`grep db.submission.delete` across `src/` returns nothing); the closest
  thing is R8's demotion to `DRAFT`.
- **R17.** Submitting requires either non-empty text or at least one attached
  file — enforced only by disabling the button:
  `submitDisabled = pending || (text.trim() === "" && files.length === 0)` —
  `src/components/assignments/student-submission-form.tsx:158`. The server
  accepts an empty submit. *(implicit)*
- **R18.** `submittedAt` is never cleared, so a row demoted to `DRAFT` by R8
  keeps a `submittedAt` in the past — `src/lib/submission-actions.ts:64-67`.
  Downstream counters hide the inconsistency only because they filter on
  `status`, not on `submittedAt` (`src/app/student/dashboard/page.tsx:59-61`).
- **R19.** Review artefacts (`feedback`, `reviewedAt`, `reviewedById`) are never
  cleared by any student write — `src/lib/submission-actions.ts:64-67, 82-91`,
  and the student form renders `feedback` whenever it is non-null regardless of
  status — `src/components/assignments/student-submission-form.tsx:268-277`.
- **R20.** Reviewing writes `feedback`, stamps `reviewedAt = now`, records
  `reviewedById = caller` and sets `status: "REVIEWED"` — in one update —
  `src/lib/submission-actions.ts:178-191`.
- **R21.** **No code path ever writes `RETURNED`.** The only producer in the
  repository is the seed script (`prisma/seed.ts:446`); every other reference
  reads it (`src/lib/submissions-query.ts:126`,
  `src/app/student/dashboard/page.tsx:60`, `src/lib/engagement.ts:70`,
  `src/lib/season-export.ts:21`, `src/components/ui/submission-status-badge.tsx:22`).
  It behaves as a synonym for "turned in" everywhere it is read.

### Review

- **R22.** Review is gated on **both** `canReviewSubmission` and
  `canViewSubmission`, in that order — `src/lib/submission-actions.ts:172-173`.
- **R23.** Every successful review — including an edit of existing feedback —
  creates a `SUBMISSION_REVIEWED` notification for the student, titled
  `Feedback ready on "<assignment title>"` and linking to
  `/student/assignments/{assignmentId}` — `src/lib/submission-actions.ts:193-198`.
  Delivery honours `NotificationPreference.submissionReviewed` and additionally
  fires a best-effort email — `src/lib/notifications.ts:36-53`.
- **R24.** Feedback is validated as a string of at most 20,000 characters and
  nothing else — `src/lib/submission-actions.ts:163-165, 175-176`. The empty
  string passes, so "Mark as reviewed" with no feedback is a valid review that
  still sets `REVIEWED` and still notifies. *(implicit — feedback is optional in
  effect, required by nothing)*
- **R25.** Review has **no precondition on the current status**: a `DRAFT`
  submission the student never submitted can be reviewed, which also makes it
  visible in the leader queue afterwards (R26) — `src/lib/submission-actions.ts:167-191`. *(implicit)*
- **R26.** There is no release/publish step — feedback becomes visible to the
  student on the next render of their assignment page
  (`src/components/assignments/student-submission-form.tsx:268`), and the
  notification is sent in the same call (R23).
- **R28.** **There is no grade.** No numeric score, no band, no rubric — the
  review surface is a single rich-text field
  (`src/components/assignments/submission-review-form.tsx:47-51`) and the model
  has no score column (`prisma/schema.prisma:513-537`). Numeric scoring in v1
  exists only on `QuizGrade` (`prisma/schema.prisma:~QuizGrade.score`), a
  different domain.
- **R29.** The reviewer's button text is the only signal of re-review:
  `alreadyReviewed = Boolean(reviewedAt)` switches "Mark as reviewed" to
  "Update review" — `src/app/leader/submissions/[publicId]/page.tsx:107`,
  `src/components/assignments/submission-review-form.tsx:43, 59`.

### Files

- **R30.** A student may attach files only when the assignment declares a file
  size limit: the student page derives `acceptsFiles = assignment.maxFileSizeMb != null`
  and the form renders the file control only under that flag —
  `src/app/student/assignments/[id]/page.tsx:140`,
  `src/components/assignments/student-submission-form.tsx:187`. **The upload
  action never checks it** (`src/lib/submission-actions.ts:100-141`), so on a
  text-only assignment the API accepts attachments. *(implicit — see §10, D4)*
- **R31.** The size limit is `maxFileSizeMb` megabytes **per file**, not per
  submission and not per assignment; there is no cap on the number of files and
  no aggregate check — `src/lib/submission-actions.ts:111-114`.
- **R32.** When `maxFileSizeMb` is null the size check is skipped entirely
  (`if (maxMb && …)`), so an unlimited-size upload is accepted —
  `src/lib/submission-actions.ts:111-114`. *(implicit — the null branch is not
  written as a rule, it falls out of the truthiness test)*
- **R33.** Allowed types are declared as *categories* — `image`, `pdf`, `doc`,
  `audio`, `video`, `text` — each mapping to a regex over the MIME type —
  `src/lib/submission-actions.ts:21-28`.
- **R34.** An empty `allowedMimeCategories` array means **everything is
  allowed**, not "nothing" — `src/lib/submission-actions.ts:30-33`.
- **R35.** An unrecognised category name silently matches nothing rather than
  erroring (`MIME_CATEGORY_MAP[c]?.test(mime) ?? false`) —
  `src/lib/submission-actions.ts:32`.
- **R36.** The MIME checked is the **client-declared** `File.type`; content is
  never sniffed, and a file whose browser reports no type is stored as
  `application/octet-stream` — `src/lib/submission-actions.ts:115, 133`.
- **R37.** The storage key is `submissions/YYYY/MM/{fresh publicId}-{sanitised name}`,
  where the name is stripped to `[A-Za-z0-9._-]` and truncated to 80 characters,
  and the date parts are **UTC** — `src/lib/storage/index.ts:29-40`.
- **R38.** The blob is written before the database row; there is no
  compensation if the row insert fails — `src/lib/submission-actions.ts:126-137`.
- **R39.** Files are ordered by `uploadedAt` ascending everywhere they are read
  — `src/lib/submissions-query.ts:64`, `src/app/student/assignments/[id]/page.tsx:87`.
- **R40.** Re-submitting does **nothing** to previously attached files: they
  carry over untouched, because submit only writes `text`, `status` and
  `submittedAt` — `src/lib/submission-actions.ts:82-91`.
- **R41.** Deleting a submission would cascade-delete its `SubmissionFile` rows
  at the database level and leave every blob behind — `prisma/schema.prisma:542`.
  Nothing in v1 exercises this path (R16). *(implicit)*
- **R42.** v1's file listing exposes `storagePath` to every caller entitled to
  read the submission — `src/lib/submissions-query.ts:59`,
  `src/app/api/v1/submissions/[publicId]/route.ts:33`. Combined with D1 that is
  the whole exploit chain.
- **R43.** v1's UI has **no download link at all** — the leader detail page
  lists attachments and prints "File download isn't wired up in the demo build"
  — `src/app/leader/submissions/[publicId]/page.tsx:95-97`; the student form
  lists names and sizes only — `src/components/assignments/student-submission-form.tsx:192-219`.

### Reads, ordering, filtering

- **R44.** The leader queue is built from students in the caller's
  `groupLeaderIds`; an empty leader list, or leader groups with no members,
  short-circuits to an empty array — `src/lib/submissions-query.ts:112, 121`.
- **R45.** The leader queue shows only `SUBMITTED`, `REVIEWED` and `RETURNED` —
  a student's `DRAFT` is never visible to their leader —
  `src/lib/submissions-query.ts:126`. *(implicit — the privacy rule lives in a
  `where` clause)*
- **R46.** The leader queue is **not scoped to a season or an assignment**: any
  submission by a currently-enrolled group member is returned, including work
  from previous seasons — `src/lib/submissions-query.ts:123-127`. *(implicit)*
- **R47.** Queue ordering is `status` ascending then `submittedAt` descending;
  because Postgres sorts an enum by declaration order
  (`prisma/schema.prisma:50-55`), this puts `SUBMITTED` (awaiting review) first,
  then `REVIEWED`, then `RETURNED` — `src/lib/submissions-query.ts:128`. *(implicit)*
- **R48.** Group name on a queue row comes from the student's **current**
  `GroupStudent` membership, not the group they were in when they submitted —
  `src/lib/submissions-query.ts:115-119, 149`.
- **R49.** The detail read resolves the student's group with a second query
  keyed on `studentUserId` (a student has at most one current group) rather than
  joining — `src/lib/submissions-query.ts:70-73`; `prisma/schema.prisma:GroupStudent.studentUserId @unique`.
- **R50.** A `publicId` that matches no row is a 404 at the page level via
  `notFound()` — `src/lib/submissions-query.ts:68` — and the authorization check
  runs *after* the row is loaded, so a valid-but-unauthorised id is
  distinguishable from a non-existent one by the response
  (`src/app/leader/submissions/[publicId]/page.tsx:29-30`). *(implicit)*
- **R51.** The queue page's header counts "pending" as `status === "SUBMITTED"`
  and "late" as `submittedAt > assignmentDueAt` over the same rows —
  `src/app/leader/submissions/page.tsx:13-16`.
- **R52.** No submission read anywhere in v1 is paginated; the leader queue,
  the student history (`take: 100`, `src/lib/students-query.ts:369-372`) and the
  mentor feed (`take: 8`, `src/app/mentor/dashboard/page.tsx:80-82`) are the
  only bounds that exist. *(implicit)*
- **R53.** The student's own view is reachable only through the assignment page,
  which first requires the assignment to belong to the student's
  `activeSeasonId` and, unless `isAllGroups`, to target the student's current
  group — `src/app/student/assignments/[id]/page.tsx:29-38`. There is no
  student-facing "my submissions" list route. *(implicit — this is domain 7's
  visibility rule; restated because it is the only thing standing between a
  student and another assignment's submission form)*
- **R54.** `text` and `feedback` are stored as raw HTML and sanitised only at
  render time, against an allow-list of 14 tags and `href/target/rel` on
  anchors, schemes limited to http/https/mailto —
  `src/components/ui/rich-text-view.tsx:11-31, 43`.

### Cross-domain consumers (read-only; owned elsewhere)

- **R55.** Engagement's "submission %" counts `SUBMITTED | REVIEWED | RETURNED`
  over expected assignments — `src/lib/engagement.ts:17, 70` (domain 9).
- **R56.** The season export uses the same three-status "turned in" set and the
  four badge labels — `src/lib/season-export.ts:19-21` (domain 17).
- **R57.** The mentor dashboard reads the eight most recent `SUBMITTED |
  REVIEWED` submissions **across every season and every student**, with no scope
  filter — `src/app/mentor/dashboard/page.tsx:79-91`. *(implicit — it relies on
  the mentor's read-all role rather than any query scope)*

*(R27 intentionally unused — numbering preserved after a merge of two grading
rules into R28.)*

## 4. Authorization

Role gates are pure claims checks (`src/lib/rbac.ts`, `requireRole` at
`src/lib/auth/permissions.ts:25-35`). Row-scoped gates hit the database.

| Operation | Roles | Row-scoped condition | v1 citation |
|---|---|---|---|
| Create draft (implicit, on assignment open) | STUDENT | assignment is in the student's `activeSeasonId` and targets their group | `src/app/student/assignments/[id]/page.tsx:24-40` |
| Save draft | any authenticated | `submission.studentUserId === caller` | `src/lib/submission-actions.ts:53, 62` |
| Submit | any authenticated | `submission.studentUserId === caller` | `src/lib/submission-actions.ts:53, 77` |
| Upload file | any authenticated | `submission.studentUserId === caller` | `src/lib/submission-actions.ts:53, 105` |
| Remove file | any authenticated | `file.submission.studentUserId === caller` | `src/lib/submission-actions.ts:155` |
| Read one submission | SUPER, MENTOR (unconditional); ADMIN, LEADER, STUDENT (conditional) | owner, **or** season admin of `assignment.seasonId`, **or** leader of the student's current group | `src/lib/auth/permissions.ts:162-190` |
| Review | SUPER (unconditional); ADMIN, LEADER (conditional) | season admin of `assignment.seasonId`, **or** leader of the student's current group. **MENTOR cannot review.** | `src/lib/auth/permissions.ts:292-315` |
| Open the leader queue page | LEADER only | rows restricted to `groupLeaderIds` | `src/app/leader/submissions/page.tsx:10-12` |
| Open the submission detail page | LEADER, ADMIN, SUPER, MENTOR | plus `canViewSubmission` | `src/app/leader/submissions/[publicId]/page.tsx:26, 30` |
| Download a file | any authenticated | **none** | `src/app/api/uploads/[...path]/route.ts:12-19` |

Notes a v2 implementer must not reproduce:

- **The student write gates carry no role check at all.** `loadOwnedSubmission`
  compares user ids, so a LEADER or ADMIN who somehow owned a submission row
  would pass; conversely there is no `requireRole(user, ["STUDENT"])` anywhere
  in `submission-actions.ts`. Identity, not role, is the gate — that is
  correct and should be kept, but it must be *written down* rather than
  inherited from "only students see the form".
- **v1 relies on the UI for the entire status/due-date policy** (R14/R15). In
  v2 these must become server-side gates or they do not exist.
- **v1 relies on the UI for "students never see each other's work"**: there is
  no student-facing list route and the detail page requires a non-STUDENT role
  (`src/app/leader/submissions/[publicId]/page.tsx:26`). But
  `canViewSubmission` already returns `false` for a non-owning student
  (`permissions.ts:189`), so v2's API gate is sound where the page gate was
  incidental.
- **MENTOR reads everything.** `canViewSubmission` returns `true` for any
  mentor before touching the row (`permissions.ts:166`), including `DRAFT`
  work in progress and every past season. This is deliberate in v1
  (`canReadAllStudents`) but is worth a product decision for v2 (§10, D8).
- **File download is authorised by nothing but a session** — see §10, D1.

## 5. Read surface

**`loadSubmissionByPublicId(publicId)`** — `src/lib/submissions-query.ts:33-95`.
Returns one flattened object: submission scalars (`id`, `publicId`, `status`,
`text`, `feedback`, `submittedAt`, `reviewedAt`), assignment context
(`assignmentId`, title, `dueAt`, description, `seasonId`, `seasonCode`), student
identity (`studentUserId`, name, email), current `groupName`, and the file list.
Two queries: the submission (`:34`) and the group membership (`:70`). No role
branching — **the same object is returned to every caller**, including the
student's own email/name and every file's `storagePath`. `seasonId` is computed
(`:87`) and read by no consumer. 404s via `notFound()` before any authorization
runs (R50).

**`listSubmissionsForLeader(groupLeaderIds)`** — `src/lib/submissions-query.ts:109-151`.
Two queries plus an in-memory join: group members (`:115`), then their
submissions (`:123`), then group names mapped by student id (`:119, 149`). Row
shape: `publicId`, `status`, `submittedAt`, `reviewedAt`, `assignmentTitle`,
`assignmentDueAt`, `studentName`, `studentEmail`, `groupName`. No text, no
feedback, no files — the queue is a list, the detail read is separate.
Unbounded (R52), unscoped by season (R46), excludes drafts (R45).

**Other reads that touch this domain** (owned by their own domains, listed so a
v2 endpoint is not duplicated):

| Consumer | Reads | Citation |
|---|---|---|
| Student dashboard | own `SUBMITTED/REVIEWED/RETURNED` rows with `submittedAt` and `assignment.dueAt`, filtered to the active season and non-deleted assignments with a due date, for the on-time counter | `src/app/student/dashboard/page.tsx:57-68` |
| Leader dashboard | `{studentUserId, status}` for all group members in the season, non-deleted assignments, to count completions per student | `src/app/leader/dashboard/page.tsx:67-75, 99-105` |
| Admin dashboard | season-wide statuses for a submitted/reviewed roll-up | `src/app/admin/dashboard/page.tsx:61, 86, 118` |
| Mentor dashboard | eight most recent submissions globally (R57) | `src/app/mentor/dashboard/page.tsx:79-91` |
| Student detail (domain 6) | up to 100 of one student's submissions with `publicId`, status, timestamps, assignment and season titles | `src/lib/students-query.ts:367-385` |
| Assignment detail API (domain 7) | the caller's own submission stub alongside the assignment | `src/app/api/v1/assignments/[id]/route.ts:42` |

**N+1s / over-fetch:** none that loop, but three patterns to fix rather than
port — the detail read's second membership query (R49) is a join in disguise;
the leader queue materialises every member and every matching submission before
mapping (R44–R48); and the leader queue selects `assignment.dueAt` purely so the
page can recompute lateness per row (R10).

## 6. Write surface

| Action | Inputs | Validation | Writes | Cascades / side effects | Returns |
|---|---|---|---|---|---|
| `saveSubmissionDraftAction` `submission-actions.ts:57-70` | `submissionId`, `text` | ownership only (R7); **no length limit on `text`** | `text`, `status = DRAFT` | revalidates `/student/assignments` | `{ ok: true }` |
| `submitSubmissionAction` `:72-98` | `submissionId`, `text` | ownership only; no status, due-date or emptiness check (R15, R17) | `text`, `status = SUBMITTED`, `submittedAt = now` | revalidates three paths; **no notification to the leader** | `{ ok: true }` |
| `uploadSubmissionFileAction` `:100-141` | `submissionId`, `FormData` with `file` | file present; per-file size (R31/R32); MIME category (R33–R36) | `SubmissionFile` row | blob written to storage **before** the row (R38); no transaction | `{ ok: true, fileId }` |
| `removeSubmissionFileAction` `:143-161` | `fileId` | file exists; ownership via `file.submission.studentUserId` | deletes the `SubmissionFile` row | blob delete attempted first, failure swallowed (R12) | `{ ok: true }` |
| `reviewSubmissionAction` `:167-204` | `submissionId`, `feedback` | `canReviewSubmission` **and** `canViewSubmission` (R22); feedback ≤ 20,000 chars (R24) | `feedback`, `reviewedAt`, `reviewedById`, `status = REVIEWED` | `SUBMISSION_REVIEWED` notification + best-effort email (R23); revalidates three paths | `{ ok: true }` |

**Non-atomic sequences to fix in v2:**

1. Review updates the row and *then* creates the notification, outside a
   transaction — `submission-actions.ts:178-198`. A notification failure after a
   successful update leaves the student silently un-notified; the action still
   returns `ok`.
2. Upload writes the blob and then the row — `:126-137`. A row-insert failure
   orphans a blob permanently (nothing reconciles storage against the table).
3. File removal deletes the blob and then the row — `:157-158`. The ordering is
   deliberate and defensible (an orphaned blob is recoverable, an orphaned row
   is not) and v2 kept it with that reasoning written down
   (`apps/backend/src/routes/submissions.ts:246-252`).
4. `ensureDraftSubmission` is a read-then-create with a catch-and-re-read rather
   than an upsert — `assignment-actions.ts:188-212`.

**Errors are strings, not codes.** Every failure is
`{ ok: false, error: "<English sentence>" }` (`submission-actions.ts:17-19`) —
except authorization, which throws `ForbiddenError`. v2's API replaces these
with codes (§7).

## 7. Proposed API

Base: `/api/v1`. Envelope `{ data }` / `{ error: { code, message } }`.

### Does "API status: done" hold? No.

`2026-08-21-full-migration-design.md:121` lists this domain as **done**. What
`apps/backend/src/routes/submissions.ts` (333 lines) actually implements is
v1's `/api/v1/submissions/*` route files — which were themselves only the
*student* half of the domain, plus one deliberate new download endpoint. **The
review path has no endpoint at all**, and neither does the leader queue.
Concretely, missing from v2:

- `reviewSubmissionAction` — no counterpart. `canReviewSubmission` does not even
  exist in `apps/backend/src/lib/permissions.ts` (its exports are
  `canAccessSeason`, `canAccessGroup`, `canMarkAttendance`, `canViewSubmission`
  — `permissions.ts:6, 31, 55, 72`).
- `listSubmissionsForLeader` — no counterpart; there is no list endpoint of any
  kind, only `GET /:publicId`.
- The `SUBMISSION_REVIEWED` notification side effect (R23).
- **Any way to create a submission at all.** v1 creates the row during a page
  render (R58); v2 has no counterpart to `ensureDraftSubmission`, so every
  existing endpoint here presupposes a row that nothing in v2 can produce. See
  §10 D15 for the fix and the recommended endpoint.

The claim is accurate for what the `/api/v1` *port* covered and inaccurate as a
statement about this domain. Phase 1 (student) can proceed on the existing
endpoints; **Phase 2 (leader review) needs two new endpoints and one new
permission gate before any screen work starts.**

| Method | Path | Status | Auth | Request | Response |
|---|---|---|---|---|---|
| GET | `/submissions/:publicId` | **exists** — `apps/backend/src/routes/submissions.ts:56-86` | bearer + `canViewSubmission` | — | `SubmissionDetail` (see §8) |
| PATCH | `/submissions/:publicId` | **partial** — `routes/submissions.ts:88-118` | bearer + author only | `{ text, submit? }` | `{ saved, submitted }` |
| POST | `/submissions/:publicId/files` | **exists, disabled** — `routes/submissions.ts:165-226` | bearer + author only | multipart, field `file` | `{ file: { id, originalName, mimeType, sizeBytes } }` 201 |
| DELETE | `/submissions/:publicId/files?fileId=` | **exists** — `routes/submissions.ts:228-255` | bearer + author only | — | `{ deleted: true }` |
| GET | `/submissions/:publicId/files/:fileId` | **exists** (deliberate divergence, not a port) — `routes/submissions.ts:280-333` | bearer + `canViewSubmission` | — | binary stream, RFC 6266 `Content-Disposition` |
| PUT | `/assignments/:id/submission` | **new** — nothing in v2 creates a submission row (§10 D15) | bearer; STUDENT targeted by the assignment | `{ text, submit? }` | `SubmissionDetail` (carries the `publicId` for later calls) |
| GET | `/submissions` | **new** | bearer; LEADER/ADMIN/SUPER/MENTOR | query: `status?`, `seasonId?`, `assignmentId?`, `groupId?`, cursor + limit | list of queue rows (see §8) |
| POST | `/submissions/:publicId/review` | **new** | bearer + `canReviewSubmission` (gate itself is new) | `{ feedback }` | updated `SubmissionDetail` |

Shape mismatches in the endpoints that exist — fix these rather than adding a
second endpoint:

- **PATCH is `partial`, not `exists`.** It reproduces R15 faithfully: it selects
  `assignment.dueAt` (`routes/submissions.ts:94`) and never reads it, and it has
  no status check, so it permits editing after review and after the due date.
  Whatever §10/D2 decides must land here.
- **PATCH cannot express "attach only, no text change"** — `text` is required
  (`packages/shared/src/submission.ts:6`), so a client saving after an upload
  must resend the whole body. Acceptable for now; note it before the screen is
  built.
- **`GET /submissions/:publicId` returns one shape to everyone**, including
  `storagePath` on each file (`routes/submissions.ts:45`) and the student's
  email (`:83`). A student fetching their own submission gets their own email
  back harmlessly, but `storagePath` is now dead weight the client never uses —
  drop it from the response and from the contract (§10, D7).
- **The queue endpoint should not mirror `listSubmissionsForLeader` literally.**
  It should take an explicit season filter (fixing R46) and be cursor-paginated
  (fixing R52), and it should derive its row scope from the caller's role the
  way `getVisibleStudents` does (`src/lib/auth/permissions.ts:198-248`) so
  ADMIN and SUPER get a queue too — in v1 only LEADER has one
  (`src/app/leader/submissions/page.tsx:10`), which is why the admin assignment
  page has to link into a leader-namespaced URL (§9).
- **`POST /submissions/:publicId/review` is the right shape, not `PATCH
  /submissions/:publicId`**, because the author gate on PATCH is the exact
  inverse of the reviewer gate: the author may never write `feedback`, and the
  reviewer may never write `text`
  (`routes/submissions.ts:97-99` states this intent for PATCH).

### Uploads are off — what that means for Phase 1

`ENABLE_UPLOADS` defaults to `false` (`apps/backend/src/lib/config.ts:41`), so
`POST /submissions/:publicId/files` answers `503 uploads_disabled`
(`routes/submissions.ts:157-163`) while file handling moves to a CMS. Reads and
deletes of already-recorded files are unaffected — the guard is mounted only on
the POST.

This is not a footnote for the student screen. Under R30, an assignment with
`maxFileSizeMb` set is telling the student that files are part of the expected
answer; with uploads off, that student can read the assignment, see the
attachment affordance, and be unable to comply. Options, in order of
preference:

1. **Hide the attach control when the capability is off, and say why.** The
   client needs to know the flag — expose it on the session/config payload (a
   `capabilities: { uploads: boolean }` field) rather than probing with a
   throwaway POST. Show the assignment's declared file policy as read-only text
   ("This assignment expects a file — uploads are temporarily unavailable")
   so the student understands the gap rather than thinking the app is broken.
2. Attempt the upload and translate `503 uploads_disabled` into that same
   message. Simpler, but the student only learns after picking a file.
3. Block submission of file-expecting assignments entirely. Rejected — R17
   already permits a text-only submit, and blocking would be a new restriction
   v1 never had.

Existing attachments must still render and remain downloadable via
`GET /submissions/:publicId/files/:fileId` throughout, and delete must still
work — otherwise a student cannot correct a file uploaded before the switch.
Recommend option 1, and treat the capability flag as a Phase 1 deliverable of
this domain rather than of the shell.

## 8. Proposed shared contracts

`packages/shared/src/submission.ts` today holds **one Zod schema and two bare
interfaces** — `updateSubmissionRequestSchema` (`:5-9`), then
`SubmissionFileSummary` (`:14-20`) and `SubmissionDetail` (`:22-39`) as plain
`interface`s. Per `CLAUDE.md`'s convention ("Domain contracts are Zod, not bare
interfaces… the remaining interfaces predate this and should convert as each
domain lands"), **converting both interfaces to Zod schemas with `z.infer`
types is part of this domain's work**, not a later cleanup — the mobile hooks
are required to parse responses rather than cast.

| Contract | Kind | Fields |
|---|---|---|
| `submissionStatusSchema` | new enum | The four values from `prisma/schema.prisma:50-55`. Reuse `SubmissionStatus` from `packages/shared/src/enums.ts` rather than redeclaring the union. |
| `submissionFileSummarySchema` | **convert** from `SubmissionFileSummary` | `id`, `originalName`, `mimeType`, `sizeBytes`. **Drop `storagePath`** (§10, D7). |
| `submissionDetailSchema` | **convert** from `SubmissionDetail` | Current fields minus `storagePath` on files, plus a derived `isLate` boolean (R10 — computed server-side once instead of by every client) and `canReview` for the viewing user, so the screen does not re-implement §4. Timestamps stay ISO strings, per the note in `season.ts`. |
| `updateSubmissionRequestSchema` | **exists** (`submission.ts:5-9`) | `text` (string), `submit` (optional boolean). Consider making `text` optional so an attach-only save is expressible (§7). |
| `reviewSubmissionRequestSchema` | new | `feedback`: string, max 20,000 (R24). Whether empty is permitted is a §10/D10 decision. |
| `submissionQueueItemSchema` | new | `publicId`, `status`, `submittedAt`, `reviewedAt`, `isLate`, `assignmentId`, `assignmentTitle`, `assignmentDueAt`, `studentUserId`, `studentName`, `studentEmail`, `groupName` — mirrors `LeaderQueueRow` (`src/lib/submissions-query.ts:97-107`) plus the ids the mobile list needs to navigate. |
| `submissionQueueQuerySchema` | new | `status?`, `seasonId?`, `assignmentId?`, `groupId?`, `cursor?`, `limit?`. |
| `submissionUploadResponseSchema` | new | `{ file: submissionFileSummarySchema }` — matches `routes/submissions.ts:221-224`. |

**Reuse, do not redefine:** `SubmissionStatus` from `packages/shared/src/enums.ts`;
the assignment fields (`title`, `dueAt`, `description`, file policy) from
`packages/shared/src/assignment.ts` — this domain must not restate domain 7's
assignment contract inside `submissionDetailSchema` beyond the flattened display
fields v1 already returns.

## 9. Screens

The v2 tree is flat: `apps/mobile/app/(app)/` has `submissions.tsx` (a
placeholder — `EmptyState "This screen isn't built yet."`) and one
subdirectory, `students/` (`index`, `alumni`, `dropped`). **There are no
dynamic segments anywhere in the v2 route tree**, so every detail route below
is new.

| v1 page(s) | v2 route | Exists? | Roles | Notes |
|---|---|---|---|---|
| `/leader/submissions` (`src/app/leader/submissions/page.tsx`) | `/submissions` | placeholder only — `apps/mobile/app/(app)/submissions.tsx` | LEADER, ADMIN, SUPER, MENTOR | Already in the tab bar for two roles (`packages/shared/src/navigation.ts:95, 103`). Needs `GET /submissions` (new). Widen beyond LEADER: v1 gives admins no queue at all (R44, §7). |
| `/leader/submissions/[publicId]` (`src/app/leader/submissions/[publicId]/page.tsx`) | `/submissions/[publicId]` | **no — must be created** | LEADER, ADMIN, SUPER, MENTOR (view); review control only when `canReview` | The single highest-value missing route in this domain. Renders detail + attachments + the review form. |
| `/student/assignments/[id]` submission half (`src/app/student/assignments/[id]/page.tsx:77-143`) | `/assignments/[id]` | **no — must be created** (domain 7 owns the route; this domain owns the submission section inside it) | STUDENT | Text editor, attachment list, save-draft / submit. Uploads disabled in Phase 1 — see §7. |
| Attachment download (v1: none, R43) | in-screen action on `/submissions/[publicId]` and `/assignments/[id]` | **no** | anyone passing `canViewSubmission` | New capability; the endpoint already exists (`routes/submissions.ts:280-333`). Needs a native file-save/share step, which the migration design already flags as a mobile foundation gap. |
| Admin assignment tracker link (`src/app/admin/season/[code]/assignments/[id]/page.tsx:88-91`) | deep-links into `/submissions/[publicId]` | **no** | ADMIN, SUPER | Removes v1's oddity of an admin page linking into `/leader/…` (§10, D11). |
| Student detail submission history (`src/components/students/student-detail.tsx:250-270`) | deep-links into `/submissions/[publicId]` | **no** | per `canViewSubmission` | Domain 6 owns the screen; the link target is this domain's. |

Rich text is the other Phase 1 question this domain raises: `text` and
`feedback` are HTML (R54) and React Native has no `dangerouslySetInnerHTML`.
Both a renderer and an editor are needed. If an editor is not ready, a plain-text
submission that the web still renders correctly (a single `<p>`) is an
acceptable Phase 1 fallback; rendering existing HTML feedback is not optional,
because reviews written in v1 are already in the database.

## 10. Open questions and divergences

**D1 — v1 serves any stored file to any logged-in user. Confirmed.**
`src/app/api/uploads/[...path]/route.ts:11-19` takes the URL path segments,
joins them into a storage path, checks only `getCurrentUser()` truthiness
(`:12-13`), and streams whatever it finds. No ownership check, no
`canViewSubmission`, no submission lookup. Combined with R42 — `storagePath` is
returned in the submission detail payload — any authenticated user who obtains
or guesses a path reads any student's private submission. The paths are
partially predictable: `submissions/YYYY/MM/{10-char id}-{sanitised name}`
(R37), so the date prefix and often the filename are known and only the
`publicId` component resists guessing.
*Status in v2:* already fixed and does not need re-deciding.
`apps/backend/src/routes/submissions.ts:280-333` addresses the file by id scoped
to its submission, cross-checks that the file's submission matches the
`publicId` in the path (`:299-301`), and gates on `canViewSubmission`
(`:307-309`); `apps/backend/src/lib/storage/local.ts:27-34` additionally proves
the resolved path stays inside the storage root, which v1's driver does not
(`src/lib/storage/local.ts:23-25` joins without containment).
*Recommendation:* no v2 change; record this as a v1 production issue for the
owner to decide on separately — it is live today.

**D2 — the entire "can't edit after due / after review" policy is client-side.
Decide it before writing the PATCH.** R14 vs R15: the UI blocks editing, the
server does not, and v2's PATCH inherited the gap verbatim including the unused
`dueAt` select (`routes/submissions.ts:94`). A mobile client is not a trusted
enforcement point.
*Recommendation:* enforce server-side, and pick the semantics explicitly.
Proposed: reject any student write when `status === "REVIEWED"` (`409
submission_locked`); allow edits after the due date but keep the original
`submittedAt` (so lateness is not silently reset — currently a re-submit
overwrites `submittedAt`, R9, which can turn an on-time submission late or a
late one later). Both need a product answer, not an implementer's guess.

**D3 — saving a draft demotes a reviewed submission back to `DRAFT` while
keeping the feedback.** `submission-actions.ts:64-67` sets `status: "DRAFT"`
unconditionally (R8), and R19 means `feedback`/`reviewedAt`/`reviewedById`
survive. The row then disappears from the leader queue (R45) while the student
still sees stale feedback on new text. This is a bug, reachable in v1 today
whenever `readOnly` is false (i.e. any reviewed-then-edited case where the UI
is bypassed, and any `RETURNED` case where it is not).
*Recommendation:* do not port. Either forbid the write (D2) or, if
re-submission after review is wanted, define an explicit transition that clears
`reviewedAt`/`feedback` and notifies the reviewer. **Decide this together with
D15** — `DRAFT` is currently entered by two unrelated paths, only one of which
is a deliberate user action.

**D4 — files can be attached to assignments that accept no files, at unlimited
size.** R30 and R32: `acceptsFiles` is a UI-only derivation, and a null
`maxFileSizeMb` skips the size check rather than rejecting the upload. In v1 the
only protection is that the file input is not rendered. v2 partially covers this
with multer's process-level `MAX_UPLOAD_BYTES`
(`routes/submissions.ts:126`, default 25 MB — `config.ts:32`), but still accepts
the upload.
*Recommendation:* reject with `mime_not_allowed`/`uploads_not_accepted` when
`maxFileSizeMb` is null, making "null means this assignment takes no files" a
server rule. Also add a file-count cap; there is none today (R31).

**D5 — deleting a submission would orphan every blob.** `SubmissionFile`
cascades from `Submission` at the database level (`schema.prisma:542`) with no
storage cleanup, and `Submission` cascades from `Assignment`
(`schema.prisma:518`). Nothing exercises it in v1 because assignments are
soft-deleted (R16, `assignment-actions.ts:154`).
*Recommendation:* if v2 ever adds hard delete or a purge, delete blobs first in
application code. Until then, do not add a submission-delete endpoint — R16 is
a real product rule, not an oversight.

**D6 — MIME type is taken on trust.** R36: `file.type` is whatever the client
declares, and it is echoed back as the `Content-Type` of the download
(`routes/submissions.ts:322`). A file declared `image/svg+xml` or `text/html`
and served with that type is a stored-XSS vector for any web client that renders
it inline; the RN client is safer, but the API is shared.
*Recommendation:* keep the declared type in `mimeType` for display, but serve
downloads as `application/octet-stream` with the existing attachment
disposition, or sniff and reject on mismatch. Decide before uploads are
re-enabled with the CMS.

**D7 — `storagePath` should leave the API contract.** R42. It was needed in v1
only because the client built `/api/uploads/{path}` URLs from it
(`src/lib/storage/local.ts:33-35`). v2 addresses files by id, so the field is
dead weight that describes the server's internal layout.
*Recommendation:* remove from `SubmissionFileSummary`
(`packages/shared/src/submission.ts:14-20`) and from the GET response
(`routes/submissions.ts:45`) in the same change as the Zod conversion (§8).

**D8 — mentors read every submission in every season, including drafts.**
`permissions.ts:166` short-circuits before loading the row, and the mentor
dashboard already renders a global feed (R57). Whether an unsubmitted `DRAFT` —
a student's unfinished work — should be readable by a mentor who is not their
leader is a product question v1 never asked.
*Recommendation:* keep the mentor's read-all for `SUBMITTED`/`REVIEWED`/`RETURNED`,
exclude `DRAFT` from mentor visibility unless the mentor is the student's
leader. Cheap to add in `canViewSubmission`; impossible to retrofit once
mentor screens assume the wider view.

**D9 — the schema comment claims audit columns on `Submission` that do not
exist.** `prisma/schema.prisma` header comment vs `:513-537` — no `createdById`,
no `updatedById`, and the one audit-ish field that does exist, `reviewedById`,
is written and never read (§2). No migration is possible (shared database), so
this is a documentation defect only.
*Recommendation:* start reading `reviewedById` in v2 — surface "reviewed by
<name>" on the detail screen, which is information leaders currently have no way
to see, and which makes the column's existence justified.

**D10 — an empty review is a valid review.** R24: `z.string().max(20000)`
accepts `""`, so "Mark as reviewed" with no text sets `REVIEWED`, notifies the
student, and shows them an empty feedback card. Related: R25 lets a `DRAFT` that
was never submitted be reviewed.
*Recommendation:* require non-empty feedback (`min(1)`) — there is no grade
(R28), so empty feedback carries no information whatsoever — and require
`status !== "DRAFT"` before review. Both are new restrictions; confirm with the
product owner rather than assuming.

**D11 — `RETURNED` exists in the vocabulary but has no producer.** R21. It is
badge-styled (`submission-status-badge.tsx:22-26`), counted as "turned in" in
four places, exported with a label — and no code path can ever set it. Either it
was intended as "returned for revision" (a reviewer sending work back) and was
never built, or it is vestigial.
*Recommendation:* decide now. If "returned for revision" is wanted, it is the
correct fix for D3 — a reviewer action that sets `RETURNED`, clears nothing,
and re-opens editing for the student. If not, keep reading it (rows exist in
seeded/staging data) but do not surface it as a reviewer choice.

**D12 — v1's leader queue is unscoped and unpaginated.** R46, R52: submissions
from past seasons appear in a leader's queue as long as the student is still in
their group, and nothing bounds the list.
*Recommendation:* the new `GET /submissions` takes an explicit season filter
defaulting to the caller's active season, and is cursor-paginated. Diverging
here is safe — no client depends on the v1 behaviour, because v1 had no list
endpoint.

**D13 — v1's admin surface links into leader-namespaced URLs.** The admin
assignment page passes `reviewBasePath="/leader/submissions"`
(`src/app/admin/season/[code]/assignments/[id]/page.tsx:90`), and
`student-detail.tsx:50` defaults to the same. The target page does accept
ADMIN (`leader/submissions/[publicId]/page.tsx:26`), so it works — but its
failure path redirects to `/leader/submissions`, which requires `LEADER`
(`leader/submissions/page.tsx:10`), so an admin who fails `canViewSubmission`
is redirected straight into a `ForbiddenError`.
*Recommendation:* v2's flat route tree removes the cause — one
`/submissions/[publicId]` for all roles. Make the failure a rendered
"not available" state rather than a redirect.

**D14 — nobody is notified when a student submits.** R23 covers review→student;
there is no submit→leader notification anywhere in `submission-actions.ts`. A
leader learns about new work only by opening the queue.
*Recommendation:* out of scope for parity, but worth raising — a mobile app
with push notifications makes this the obvious first candidate, and the
`NotificationType` enum would need a new value, which is a schema change and
therefore blocked until v1 is retired.

**D15 — a GET creates a row, and that must not survive into v2.** R58: reading
the student assignment page writes a `DRAFT` submission
(`src/app/student/assignments/[id]/page.tsx:40`). Two reasons this cannot be
ported as-is:

- *A GET that writes is wrong on its own terms.* v2's
  `GET /api/v1/submissions/:publicId` and domain 7's `GET /assignments/:id`
  (`apps/backend/src/routes/assignments.ts:46-60`, which already reads the
  caller's own submission stub) must stay side-effect-free. Note that today
  neither of them creates anything — the v2 API has **no** counterpart to
  `ensureDraftSubmission`, so a v2 student currently has no way to obtain a
  submission row at all. Something has to create it; it must not be the GET.
- *React Query turns "once per navigation" into "every focus".* v1's write
  happens once per server render of one page. Under the mobile conventions
  (`CLAUDE.md`, "Data fetching follows `app/(app)/dashboard.tsx`") queries
  refetch on mount, on window focus and on reconnect, so the same code shape
  becomes a write every time the student tabs back to the app — inflating
  `createdAt`, and, through R61, flipping assignment rows between `PENDING` and
  `DRAFT` for reasons no one can explain from the UI.

Options, in order of preference:

1. **Lazy creation inside the existing `PATCH`.** Address the resource by
   `(assignmentId, studentUserId)` rather than `publicId` for the first write —
   e.g. `PUT /assignments/:id/submission` — and upsert. The student's first
   *deliberate* act (typing and saving, or submitting) is what creates the row.
   No new round trip, no empty rows from browsing, and the `publicId` is
   returned in the response for subsequent addressing. **Recommended.**
2. **An explicit `POST /assignments/:id/submission`** that the screen calls when
   the student first types or first taps "attach". Honest and simple, but it is
   a second request the client must sequence before every other submission
   write, and a mistimed call recreates the browsing problem.
3. Keep read-time creation but move it behind an explicit non-GET call the
   screen makes on entry. Rejected — it is option 2 with the empty-row problem
   intact.

Whichever is chosen, use a real upsert on the unique pair
(`prisma/schema.prisma:534`) rather than porting R59's read-then-create-then-
catch. And decide it **with D3**: "what creates a submission" and "what may put
one back into `DRAFT`" are one decision, because today `DRAFT` is reached both
by a student saving deliberately (R8) and by a page render nobody asked for
(R58).

*Consequence for domain 14 (Forum), flagged for whoever specs it:* per R60 the
forum view is handed `stub.id` and every forum write targets it
(`src/lib/forum-actions.ts:18-24, 57-71`), so a forum assignment has no usable
screen until a submission row exists. Options 1 and 2 both need a forum-specific
answer — most likely the forum post action itself upserts the row, since
`submitForumPostAction` already sets `status`/`submittedAt` in one update
(`src/lib/forum-actions.ts:41-44`). Domain 14 should not assume this domain
leaves a row lying around for it.

---

**Rule count:** 60 numbered rules (R1–R61, R27 unused), of which **16 are marked
`(implicit)`**: R4, R15, R17, R24, R25, R30, R32, R41, R45, R46, R47, R50, R52,
R53, R57, R61 — plus R13's absence-of-check, called out in place.
