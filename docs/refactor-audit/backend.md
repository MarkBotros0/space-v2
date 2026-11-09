# Backend clean-code audit — apps/backend (space-v2-refactor)

Scope: `apps/backend/src` (excl. `src/generated`, `src/__tests__` except helper duplication) + `apps/backend/scripts`.
256 production `.ts` files, ~32.3k LOC (routes 10.8k, lib 12.5k, docs ~6k of OpenAPI data).
Read-only audit; nothing in the repo was changed. Deliberate decisions in CLAUDE.md (relative `packages/shared` import in
`routes/auth.ts`, no nanoid, latin1→UTF-8 filename decode, upload guard order, `process.env` only in config, 400-line cap)
are not flagged.

Scripts used (all in `/tmp/claude-1000/-home-mark-projects-JPC-space-v2/95b40820-faa1-4f0a-8f4a-a404312a7af9/scratchpad/be-audit/`):
`fnlen.js` (function length + nesting via the TS compiler API), `cycles.js` (Tarjan SCC over relative imports),
`n1.js` (awaited DB/loader calls inside loops and async `.map` callbacks), `noselect.js` (finds without `select`, repeated
`select` shapes), `unused.js` (exports with no production importer). Outputs are the matching `*.out` files.

Severity: high = correctness/perf risk or a pattern repeated >50 times; medium = real duplication / maintainability;
low = cosmetic or local. Waves: 1 dead code, 2 shared foundations, 4 backend refactor.

---

## 1. Long functions and deep nesting (script totals)

`fnlen.js`: **1,263 functions** measured; **91 longer than 50 lines** (54 in routes, 28 in lib, 8 in scripts, 1 `app.ts`);
**3 with nesting depth > 3** (if/loop/switch/try/ternary; `else if` does not add a level).

Nesting > 3:

| depth | location | name | len |
|---|---|---|---|
| 4 | src/routes/seasons/duplicate.ts:67 | `$transaction` callback in `duplicateSeason` | 117 |
| 4 | src/lib/imports/students/commit.ts:120 | `$transaction` callback in `commitStudentImport` | 90 |
| 4 | src/lib/imports/delimited.ts:75 | `splitRecords` (CSV state machine; acceptable) | 75 |

Top 40 > 50 lines (full list of 91 in `be-audit/fnlen.out`):

| lines | location | name |
|---|---|---|
| 207 | src/lib/queries/reports/summary.ts:51 | buildEngagementSummary |
| 172 | src/routes/seasons/duplicate.ts:18 | duplicateSeason |
| 157 | src/lib/queries/forum.ts:96 | loadForumView |
| 151 | src/lib/imports/students/commit.ts:75 | commitStudentImport |
| 151 | src/routes/users/accounts.ts:40 | updateUser |
| 149 | src/lib/queries/engagement.ts:49 | computeEngagementForSeasons |
| 149 | src/lib/queries/students/detail.ts:29 | loadStudentDetail |
| 143 | src/lib/exports/season-workbook.ts:75 | buildSeasonWorkbook |
| 143 | scripts/seed-sweep/activity.ts:7 | seedActivity |
| 136 | src/routes/seasons/people-candidates.ts:72 | listPeopleCandidates |
| 127 | src/routes/quizzes/grading.ts:17 | listAttempts |
| 122 | src/routes/quizzes/grading.ts:145 | gradeAttempt |
| 122 | src/routes/video-quiz/student.ts:69 | answerVideoQuestion |
| 115 | scripts/seed-sweep/community.ts:29 | seedCommunityScenario |
| 114 | src/lib/queries/dashboard.ts:225 | loadMentorDashboard |
| 113 | src/routes/submissions/queue.ts:26 | listSubmissionQueue |
| 105 | src/lib/queries/season-end.ts:12 | loadSeasonEndCheck |
| 104 | src/lib/imports/groups.ts:60 | buildGroupImportPreview |
| 104 | src/routes/quizzes/attempts.ts:228 | submitAttempt |
| 103 | src/app.ts:37 | createApp (router mounting; fine) |
| 103 | src/lib/queries/me/season-record.ts:17 | loadSeasonRecord |
| 100 | src/routes/seasons/end.ts:54 | endSeason |
| 99 | src/lib/queries/organisation-report.ts:19 | buildOrganisationReport |
| 97 | src/routes/students/profile.ts:40 | createStudent |
| 96 | src/routes/sessions/attendance.ts:36 | saveAttendance |
| 95 | src/routes/quizzes/paper-grades.ts:110 | saveGrades |
| 94 | src/lib/queries/assignments/staff.ts:109 | loadAssignmentTracker |
| 94 | src/routes/students/profile.ts:138 | updateStudent |
| 87 | src/routes/submissions/writes.ts:22 | updateSubmission |
| 86 | src/routes/users/list.ts:14 | listUsers |
| 84 | src/lib/queries/season-start.ts:27 | loadSeasonStartCheck |
| 83 | src/routes/engagement.ts:55 | anonymous GET handler |
| 81 | src/lib/queries/dashboard.ts:119 | loadSeasonStaffDashboard |
| 81 | src/routes/notes.ts:149 | anonymous POST `/:id/notes` |
| 81 | src/routes/seasons/crud.ts:184 | updateSeason |
| 80 | src/lib/exports/season-workbook.ts:291 | loadSeasonExportData |
| 80 | src/routes/quizzes/student-detail.ts:67 | loadStudentQuizDetail |
| 77 | src/lib/queries/me/season.ts:39 | loadMySeason |
| 77 | src/routes/sessions/check-in.ts:14 | studentCheckIn |
| 75 | src/lib/attendance-notifications.ts:9 | flagLowAttendance |

Most of the length in route handlers is the same preamble repeated (parse id → 400, safeParse → 400, load → 404,
gate → 403) plus an in-handler transaction. Items BE-001..BE-004 below remove most of it without moving rules around.

| ID | sev | evidence | proposed change | risk | wave |
|---|---|---|---|---|---|
| BE-001 | medium | `routes/users/accounts.ts:40-190` `updateUser`: 151 lines, a 117-line transaction (`:60`) holding seven role rules (own role, confirm SUPER, last SUPER, live season role, use_graduate…) | Move the transaction body to `lib/users/update-user.ts` as `updateUserInTx(tx, actorId, id, body)` returning `{ok}|{refusal}` (or throwing `ApiError`, see BE-030); handler keeps parse + audit + respond | Medium: role/lock order is safety-critical; existing integration tests cover it (users-edge-routes, stored-roles) | 4 |
| BE-002 | medium | `routes/seasons/duplicate.ts:18-190` `duplicateSeason`: 172 lines, depth 4 | Extract `cloneSeasonContent(tx, source, target, shift)` to `lib/seasons/duplicate.ts` with one helper per entity (groups, sessions, assignments) | Low-medium | 4 |
| BE-003 | medium | `routes/seasons/end.ts:54-153` `endSeason` (100 lines, defines its own `EndRefused` error class at `:33`) | Move to `lib/seasons/end.ts` beside `lib/queries/season-end.ts` (its check), throw shared `ApiError` | Medium (End is the most delicate write) | 4 |
| BE-004 | medium | Quiz handlers: `routes/quizzes/grading.ts:17` (127), `:145` (122), `routes/quizzes/attempts.ts:228` (104), `routes/video-quiz/student.ts:69` (122) | Grading/submit logic into `lib/quizzes/{grading,attempts}.ts`; handlers become ~20 lines | Medium; quiz-result hold rules (`studentAttemptStatus`) must stay on every read | 4 |
| BE-005 | low | `lib/queries/reports/summary.ts:51` (207 lines, depth 1) and `lib/queries/engagement.ts:49` (149) are long but linear (one query block + one fold) | Split into `load…Rows` + pure `fold…` functions so the fold is unit-testable; not urgent | Low | 4 |
| BE-006 | low | Seed scripts `scripts/seed-sweep/activity.ts:7` (143), `community.ts:29` (115), `scenarios.ts:30` (97) | Leave: linear fixture data; splitting adds nothing | — | — |

## 2. God modules / multiple responsibilities

| ID | sev | evidence | proposed change | risk | wave |
|---|---|---|---|---|---|
| BE-010 | medium | `routes/me.ts` (385 lines, near the 400 cap): `/me` profile, password change with its own limiter (`:140`), delete account (`:196`), student academic profile (`:230`,`:248`), notification preferences (`:319`,`:337`), dashboard (`:360`), plus date helpers `dayFromDate`/`dateFromDay` (`:63`,`:68`) and mounting of two sub-routers (`:33-34`) | Folder `routes/me/` with `index.ts` route table + `account.ts`, `profile.ts`, `preferences.ts`, `dashboard.ts`; move the date helpers to `lib/org-time.ts` (they convert day strings) | Low; path list unchanged | 4 |
| BE-011 | medium | `routes/imports.ts` (312): two routers (`importsRouter` `:91`, `seasonImportsRouter` `:213`), a limiter factory (`:70`), a JSON parser (`:87`), its own `requireSuper` (`:103`), four handlers each with try/catch mapping (`:132,:172,:269,:303`) | Folder `routes/imports/` (`students.ts`, `season-groups.ts`, `limits.ts`) | Low | 4 |
| BE-012 | medium | `lib/queries/dashboard.ts` (338): student (`:60`), leader check-in (`:96`), staff (`:119`), mentor (`:225`) dashboards | `lib/queries/dashboard/{student,staff,mentor}.ts` + `index.ts` re-export; matches the per-role shape of the endpoints | Low | 4 |
| BE-013 | medium | `lib/exports/season-workbook.ts` (370): data load (`:291`), sheet building (`:75`), size summary (`:226`,`:267`) | `season-workbook/{load,build,summary}.ts` | Low | 4 |
| BE-014 | low | `lib/queries/students/list.ts` (349): scope resolution (`:36`), filters, in-memory related sort (`:151`), main list (`:216`), dropped list (`:294`) | Move `listDroppedEnrollments` + `studentListScope` into sibling files; keep `listStudents` | Low | 4 |
| BE-015 | low | `lib/queries/forum.ts` (315): display-name helper, assignment load, feed view (157-line `loadForumView`), comments list, audience check | Split `forum/feed.ts`, `forum/comments.ts`; shares BE-024 | Low | 4 |
| BE-016 | low | "queries" folder holds writes: `lib/queries/students/writes.ts` (graduation, draft-row clearing — 274 lines) and `lib/queries/groups/membership.ts` (seat writes under locks). `lib` mixes flat domain files (`assignment-writes.ts`, `*-notifications.ts`, `follow-ups.ts`, `check-in.ts`, `quiz-results.ts`, `quiz-scope.ts`) with folders | Adopt `lib/<domain>/` for services (see §4); move these two writes files to `lib/students/graduation.ts`, `lib/groups/membership.ts` | Low (import churn only) | 4 |
| BE-017 | low | Misplaced modules: `routes/quizzes/notify.ts` (notification producer living in routes; every other producer is `lib/*-notifications.ts`); `routes/submissions/editable.ts:46` (a permission verdict in routes); `routes/respond.ts` (`forbidden`) sits apart from `lib/api-response.ts` | Move to `lib/quizzes/notify.ts`, `lib/permissions/submission.ts`, `lib/api-response.ts` | Low | 2 |

## 3. Duplicated logic

| ID | sev | evidence | proposed change | risk | wave |
|---|---|---|---|---|---|
| BE-020 | high | Id preamble: **118 `parseId(` calls in 48 files**, each followed by `apiError(res,"bad_request","Invalid X id.",400)`. Most frequent: "Invalid season id." ×25, "Invalid session id." ×15, "Invalid quiz id." ×13, "Invalid student id." ×11, "Invalid assignment id." ×9, "Invalid user id." ×6, "Invalid post id." ×4, "Invalid id." ×4 (e.g. `routes/assignments.ts:36-37`, `:119-120`) | `lib/http/params.ts`: `idParam(req, res, noun): number \| null` that sends the existing message (`Invalid ${noun} id.`), keeping the exact strings. Express 5 `router.param` was considered but rejected: the noun differs per router and some routes use non-`id` names | Low; message strings identical | 2 |
| BE-021 | high | Load-or-404: `"Season not found."` ×26, `"Session not found."` ×19, `"Quiz not found."` ×18, `"Assignment not found."` ×14, `"Student not found."` ×9, `"User not found."` ×8 (131 `not_found` total). `db.season.findFirst/findUnique` ×23 in routes, typically `{ where:{id,deletedAt:null}, select:{id:true} }` (`routes/seasons/staff-candidates.ts:60`, `roster.ts:32`, `results.ts:21`) | Domain loaders `findLiveSeason(id, select)` etc. in `lib/queries/seasons.ts` (already exists) plus a `notFound(res, "Season")` responder; **not** one generic `loadOr404`: the selects differ per handler on purpose | Low | 2 |
| BE-022 | high | Season status sets re-spelled: `isSeasonFinished` exists (`lib/roles/student-seats.ts:33`) but the same predicate is inlined at `routes/imports.ts:162`, `routes/students/profile.ts:61`, `routes/seasons/results.ts:45`, `routes/seasons/crud.ts:180,222`, `lib/roles/seat-rules.ts:104`, `lib/roles/standing.ts:47`, `lib/permissions/announcement.ts:28-29`; `{in:["COMPLETED","ARCHIVED"]}` at `lib/queries/previous-season.ts:20,44`, `students/last-season.ts:22`, `students/writes.ts:269`, `season-participants.ts:23`; live set `{in:["DRAFT","ACTIVE"]}` at `lib/auth/scopes.ts:15`, `lib/roles/staff-seats.ts:37` (`UNFINISHED_SEASON`), `lib/attendance-notifications.ts:46` (`liveSeason`), `routes/seasons/crud.ts:48`. `routes/seasons/crud.ts:162` re-declares the `SeasonStatus` union instead of importing the generated enum | `lib/seasons/status.ts`: `FINISHED_SEASON_STATUSES`, `LIVE_SEASON_STATUSES`, `isSeasonFinished`, `isSeasonLive`, `liveSeasonWhere`; import `SeasonStatus` from `generated/prisma/enums` | Low; pure | 2 |
| BE-023 | high | Over-fetch pagination (`take: limit+1`, slice, `nextCursor = last.x`) written 8 times: `routes/users/list.ts:78-85`, `routes/events.ts:146`, `routes/quizzes/grading.ts:141`, `routes/announcements/read.ts:59`, `lib/queries/forum.ts:191/250` and `:270/295`, `lib/queries/notes.ts:129/137`, `:211`, `:236`; a partial helper already exists at `lib/queries/notes.ts:153-167`. Cursor parsing is done four ways: Zod in shared (most), manual `parseId` (`routes/users/list.ts:33-35`), manual decode (`routes/announcements/read.ts:43-48`), base64 offset (`lib/queries/reports/rows.ts:90`), in-memory index (`lib/queries/students/list.ts:174`) | `lib/pagination.ts`: `pageOf(rows, limit, keyOf) → {page,nextCursor}`; move manual cursor parsing to shared Zod schemas. Keep the opaque cursors where the sort is compound (events, announcements, reports) — those differ for a reason | Low | 2 |
| BE-024 | medium | Forum comment projection written 3×: select at `lib/queries/forum.ts:267-278` and `routes/forum.ts:215-222`; mapping `{id, authorUserId, authorDisplayName: displayNameFor(..), body, createdAt, canDelete}` at `lib/queries/forum.ts:232-240`, `:282-291`, `routes/forum.ts:226-235` | `FORUM_COMMENT_SELECT` + `toForumComment(row, canDelete)` in `lib/queries/forum.ts` | Low | 4 |
| BE-025 | medium | Two different `requireSuper`: `routes/users/super-only.ts:9` (returns user or null, generic 403, also imported cross-domain by `routes/seasons/admins.ts:12`, `routes/seasons/start.ts:12`) and `routes/imports.ts:103` (returns boolean, custom message). Plus 10 inline `if (!isSuper(user)) return …` (e.g. `routes/events.ts:181,215,271` with the identical message ×3; `routes/students/lifecycle.ts:37,97`; `routes/students/enrollments.ts:165`) | One Express middleware factory in `middleware/require-auth.ts`: `requireRole(predicate, message?)`; mount per route (`eventsRouter.post("/", requireRole(isSuper, "Only a super admin can manage events."), …)`). Keeps each message | Low; message text must not change (mobile shows it) | 2 |
| BE-026 | medium | Student-only gate repeated: `user.role !== "STUDENT"` → 403 at `routes/me.ts:232,250`, `routes/me-season-reads.ts:25,31,40,46` (6× same `STUDENTS_ONLY`), `routes/quizzes/attempts.ts:66,163,233` ("Only a student can take a quiz." ×3), `routes/submissions/writes.ts:132`, `routes/forum.ts:72` | Same `requireRole(isStudentRole, msg)` middleware; for `me-season-reads.ts` mount once with `router.use` | Low | 2 |
| BE-027 | medium | Seasons a leader leads, `db.group.findMany({where:{id:{in:user.groupLeaderIds}}, select:{seasonId}})`, at `lib/queries/events.ts:22-29`, `lib/queries/announcements.ts:19-23`, `:65-69`, `lib/permissions/season.ts:183-186`; per-season variants at `lib/permissions/season.ts:11-13`, `:67-70`, `lib/queries/groups/read.ts:34`. `lib/queries/events.ts:28` also re-checks `isLeaderOfGroup` on rows already filtered by those ids (redundant) | `ledSeasonIds(user, {liveOnly})` and `ledGroupIdsInSeason(user, seasonId)` in `lib/permissions/season.ts`. Note the variants differ on `season.deletedAt` filtering (`season.ts:184` filters, the others don't) — make it an explicit option, don't silently unify | Medium: a filter difference is a behaviour difference; needs owner nod | 4 |
| BE-028 | medium | "Live students of a season" recipient query: `routes/quizzes/notify.ts:51-59`, `lib/session-notifications.ts:52-55`, `lib/assignment-writes.ts:85-93`. The third **omits** `studentUser:{deletedAt:null}` that the other two have | `liveStudentIds(seasonId, {groupIds?})` in `lib/queries/season-participants.ts` (where `seasonParticipant` already lives). Whether deleted accounts should be skipped for ASSIGNMENT_CREATED is a behaviour question: flag to owner, don't fix silently | Medium | 4 |
| BE-029 | low | `email_taken` with two messages: "Email already in use." (`routes/users/accounts.ts:282,307`) vs "A user with that email already exists." (`routes/students/profile.ts:71,123,175,225`). `codeTaken` (`routes/seasons/crud.ts:107`) is imported by `duplicate.ts` (fine) | Constant `EMAIL_TAKEN` in the error catalogue (BE-040); pick one message only with owner approval (client-visible) | Low | 2 |
| BE-02A | low | Body-validation messages done three ways across 88 `safeParse` sites (69 body, 19 query): fixed string ("Invalid season body." etc.), `issues[0]?.message ?? fallback` (7× in 4 files, e.g. `routes/users/accounts.ts:52-56`), `bodyErrorMessage` with path prefix (`lib/assignment-writes.ts:121`, 3 uses). "Invalid query." alone ×11 | `parseOr400(schema, input, res, fallback)` in `lib/http/validate.ts` that keeps each site's current message policy via a parameter; do not unify messages (clients/tests assert them) | Low | 2 |
| BE-02B | low | Lock-order rule (Season → People → rows) applied by hand at 20 call sites: `lockSeason` ×5, `lockPeople` ×15 (e.g. `routes/seasons/end.ts:73,105`, `routes/seasons/crud.ts:280,290`, `routes/groups.ts:198,210`) | Optional `withSeatLocks(tx,{season,mode,people})` in `lib/roles/` that takes both in order. Rejected as mandatory: many sites need to read between the two locks (`end.ts` reads the roster after the season lock), so a wrapper would only fit some | Medium (deadlock-sensitive) | 4 (optional) |
| BE-02C | low | Test helpers: token minting `async function mint(userId){ loadScopes → signAccessToken }` copied in 8 integration tests (e.g. `__tests__/integration/draft-season-student.test.ts:16`, `finished-group-rename.test.ts:19`); bearer-header builder `const as = (token) => ({authorization:\`Bearer …\`})` in 29 test files although `integration/season-enrollments-setup.ts:31` already exports one | Add `tokenFor(userId)` and `bearer(token)` to `__tests__/integration/fixtures.ts` | Low | 2 |
| BE-02D | low | Scripts print the DB host 4 ways: `scripts/seed-sweep.ts:32`, `community-preflight.ts:233`, `convert-stored-roles.ts:92`, `create-super-admin.ts:43` | `scripts/lib/db-host.ts` | Low | 2 |

Rejected duplication candidates (look alike, change for different reasons):
- Per-domain `toDetail` / `toListItem` serializers (`routes/events.ts:67,94`, `routes/announcements/serialize.ts`, `routes/users/views.ts`): different contracts, keep separate.
- Notification producers (`lib/*-notifications.ts`, `routes/quizzes/notify.ts`): fan-out is already centralised in `createNotificationsBulk` (`lib/notifications.ts:59`) with dedupe and preference handling; only recipient queries repeat (BE-028).
- The P2002 catch blocks (11 sites in 9 files, e.g. `routes/seasons/crud.ts:155,239`, `routes/students/profile.ts:121,223`): each maps to a domain-specific 409 (`code_taken`, `email_taken`, `already_enrolled`), so a central Prisma→HTTP mapping would lose meaning. Keep per-site, but via BE-030's `ApiError`.
- Zod schemas: none are duplicated from `packages/shared`. Only `lib/config.ts` (env) and one `emailSchema` at `lib/imports/groups.ts:16` exist locally; the latter is close to shared's `student/writes.ts:16` but without `toLowerCase` (normalisation is done separately by `normaliseEmail`), so leave it.

## 4. Layering

Measured:
- **59 of 76 route files import `db`** directly (`../db/client`); 67 lib files do too.
- `db.`/`tx.` call sites: **381 in routes, 260 in lib** (164 of those in `lib/queries`). Routes contain **114 write calls** and **49 `$transaction` sites in 26 files** vs only 4 in lib (3 files).
- Per route domain: quizzes 81, seasons 72, sessions 37, video-quiz 25, students 22, users 21, submissions 21, me 15, groups 15, announcements 12, events 11, assignments 11, notes 8, forum 7, auth 5, notifications 4, imports 3, follow-ups 3, dev 3, me-devices 2, engagement 2, mentor-summary 1; reports, exports, health, docs, me-season-reads 0.
- 33 route files already import from `lib/queries`; lib never imports routes (no upward dependency). Cross-route imports: `routes/seasons/{admins,start}.ts` → `routes/users/super-only.ts`; `routes/students/invite.ts:9` → `routes/users/invites.ts` (`answerResend`).

Where rules live today:
- Good, in lib: authorization (`lib/rbac.ts` pure, `lib/permissions/*` DB gates), seat/role rules (`lib/roles/*` incl. lock helpers), season start/end checks (`lib/queries/season-start.ts`, `season-end.ts`), graduation (`lib/queries/students/writes.ts`), imports (`lib/imports/*`), notifications.
- In handlers: user role-change rules (`routes/users/accounts.ts:60-170`), End season transaction (`routes/seasons/end.ts:72-143`), duplicate season (`routes/seasons/duplicate.ts`), quiz grading/submission/reopen (`routes/quizzes/grading.ts`, `attempts.ts`), video-quiz answering (`routes/video-quiz/student.ts:69`), attendance save (`routes/sessions/attendance.ts:36`), check-in (`routes/sessions/check-in.ts:14`), season update/status transitions (`routes/seasons/crud.ts:162-264`), question reordering (`routes/quizzes/questions.ts:182,220`).

Recommendation (BE-035, medium, wave 4): **do not add a full repository layer.** Prisma's typed client with per-call
`select` already is the data-access abstraction, and almost every query has a bespoke projection (only 5 repeated
`select` shapes >70 chars exist across the codebase — `be-audit/noselect.out`); repositories would be 1:1 wrappers
that add a file per model and hide the `select`, which is where the codebase's correctness lives (e.g.
`routes/quizzes/student-detail.ts:9-19` relies on *not* selecting `correctIndex`). A lighter split fits the existing
patterns:

1. **Routes** (`routes/<domain>/`): HTTP only — params, `safeParse`, call one gate + one service, map result to envelope. Target ≤ ~40 lines per handler, no `$transaction`.
2. **Domain services** (`lib/<domain>/`, e.g. `lib/seasons/end.ts`, `lib/quizzes/grading.ts`, `lib/users/update-user.ts`): own the transaction, locks, and rules; take a `SessionUser` + validated input; return a value or throw `ApiError` (BE-030). They may call Prisma directly.
3. **Reads** (`lib/queries/<domain>`): reusable selects/loaders/projections (as today), writes moved out (BE-016).
4. **Gates** (`lib/permissions`, `lib/rbac.ts`): unchanged.

Reference pattern: the **announcements** domain — `routes/announcements/{index,read,write,serialize,targets}.ts`
(each handler ≤ 25 lines, e.g. `write.ts:23-43`), gate in `lib/permissions/announcement.ts` (pure `canPostTo`,
`canEditAnnouncement` verdicts), visibility in `lib/queries/announcements.ts` (`announcementVisibilityFilter`),
fan-out in `lib/announcement-notifications.ts`. It still calls `db.announcement.create` from the handler, which is
fine for one-statement writes. For a transactional service, `lib/roles/student-seats.ts` (`seatStudents`) is the best
existing example.

Migrate incrementally, largest-handler first: users/accounts → seasons/end → seasons/duplicate → quizzes grading/attempts → video-quiz → sessions/attendance. Each move is behaviour-neutral and covered by existing integration suites.

## 5. Error handling

Current producers (counts over `src`, excl. generated/tests/docs):
- `apiError(res, code, msg, status)` inline: **513 calls in 65 files** (`bad_request` 207, `not_found` 131, `forbidden` 24, 60+ domain codes).
- `forbidden(res)` (`routes/respond.ts:10`): 119 calls in 45 files — yet **24 inline `apiError(res,"forbidden",…)`** remain (custom messages, listed in BE-025/026).
- Thrown and mapped centrally in `middleware/error-handler.ts`: only `ForbiddenError` / `UnauthorizedError` (`lib/auth/errors.ts`), body-parser errors, `MulterError`. `ForbiddenError` is thrown in just 3 places (`routes/submissions/files.ts:88,165`, `writes.ts:42`) — a second way to 403 alongside `forbidden(res)`.
- Ad-hoc Error subclasses thrown to abort a transaction and caught in the same handler: `EndRefused` (`routes/seasons/end.ts:33`, thrown 5×), `GroupHasSoleTargetsError` (`routes/groups.ts:176`), `GroupOutsideSeasonError` (`lib/queries/groups/membership.ts:180`), `ImportRowsInvalidError`/`ImportSeasonGoneError` (`lib/imports/students/commit.ts:33,41`), `ImportParseError` (`lib/imports/delimited.ts:33`), `FileNotFoundError` (`lib/storage/index.ts:32`). 18 `catch (err)` blocks in routes.
- Returned refusal values, four shapes: `SeatRefusal {code,message}` + `refusalStatus` (`lib/roles/seat-rules.ts:19`, `staff-seats.ts:6`; 32 `return {code:…}` sites in 10 files); `fail: [code,msg,status] as const` tuples (10 sites, `routes/users/accounts.ts`, `routes/quizzes/attempts.ts`); string verdict unions (`PostVerdict` `lib/permissions/announcement.ts:66`, `routes/submissions/editable.ts:46`, `calendarScopeFor` `lib/permissions/season.ts:160`); `AssignmentRefRefusal` (`lib/assignment-writes.ts:16`).
- Prisma: one helper `isUniqueViolation` (`lib/prisma-errors.ts:7`, 11 uses in 9 files; aliased as `isPrismaUniqueViolation` in `routes/follow-ups.ts:14`). No P2025 mapping (code reads first instead, `routes/events.ts:275`).

There is one mapping point for *unexpected* errors and for auth errors, but no shared hierarchy for expected domain refusals.

| ID | sev | evidence | proposed change | risk | wave |
|---|---|---|---|---|---|
| BE-030 | high | Above: 4 refusal shapes + 7 local error classes + inline apiError | Add `class ApiError extends Error {code; status}` in `lib/api-error.ts`; map it once in `error-handler.ts` (before the 500 branch, never reported to Sentry). Services throw it (rolls back the transaction for free — exactly what `EndRefused` and the `fail` tuples emulate). Convert `EndRefused`, `GroupHasSoleTargetsError`, the `fail` tuples first; keep `SeatRefusal` as data but add `toApiError(refusal)` (subsumes `refusalStatus`). Make `ForbiddenError` a subclass so both 403 paths agree | Medium: every converted site must keep code/message/status byte-identical; snapshot-style integration tests exist | 2 (class + mapping), 4 (conversions) |
| BE-031 | low | `refusalStatus` lives in `lib/roles/staff-seats.ts:6` but applies to every `SeatRefusal` (defined in `seat-rules.ts:19`) | Move next to the type | Low | 2 |
| BE-032 | low | `res.status(204).end()` at `routes/announcements/read.ts:104`, `write.ts:86` bypass the envelope helpers (correct for 204, but undocumented) | Add `apiNoContent(res)` to `lib/api-response.ts` | Low | 2 |

## 6. Magic numbers / strings

| ID | sev | evidence | proposed change | risk | wave |
|---|---|---|---|---|---|
| BE-040 | medium | Error codes are bare strings: `"bad_request"` ×214, `"not_found"` ×157, `"forbidden"` ×40 literals, `"season_finished"` ×5 (message "This season has finished." ×4, also returned as data in `routes/students/enrollments.ts:81,129,177`, `routes/seasons/enrollments.ts:59`), `"email_taken"` ×6, 60+ single-use codes | `lib/api-error-codes.ts` (or `packages/shared/src/errors.ts` so mobile can switch on them) exporting a `const` union + canned messages for repeated pairs (`SEASON_FINISHED`, `EMAIL_TAKEN`, `notFound(noun)`, `invalidId(noun)`). Type `apiError`'s `code` param with it | Low | 2 |
| BE-041 | medium | Rate-limit window `15 * 60 * 1000` ×11: `routes/auth.ts:36,37,44,214,219`, `routes/me.ts:41`, `routes/me-devices.ts:53`, `routes/imports.ts:71`, `routes/notes.ts:54`, `routes/exports.ts:50`, `routes/dev.ts:28`; `60*60*1000` at `routes/users/invites.ts:16` | `RATE_LIMIT_WINDOW_MS` default in `lib/rate-limit/index.ts` (`makeLimiter` takes `windowMs` optional) | Low | 2 |
| BE-042 | low | Day length spelled three ways: `DAY_MS` (`lib/follow-ups.ts:7`), `86_400_000` (`lib/queries/notes.ts:193`, `routes/sessions/reads.ts:59`), `24*60*60*1000` (`lib/queries/announcements.ts:84`, `lib/auth/tokens.ts:11`) | `MS_PER_DAY/HOUR/MINUTE` in `lib/org-time.ts` (already the time module) | Low | 2 |
| BE-043 | low | Season status literal sets — see BE-022 | `lib/seasons/status.ts` | Low | 2 |
| BE-044 | low | Notification links hard-coded in producers: `/admin/students/${id}` (`lib/attendance-notifications.ts:71`, `lib/follow-ups.ts:114`), `/leader/students/${id}` (`lib/attendance-notifications.ts:79`), `SESSION_CANCELLED_LINK` (`lib/session-notifications.ts:8`) while `lib/notification-target.ts` parses them | Builders in `lib/notification-target.ts` beside the parser so the two can't drift | Low | 2 |
| BE-045 | low | Batch caps inline: `take: 200` (`lib/follow-ups.ts:100`), `PER_ROLE` (`routes/dev.ts`), mixed with named constants elsewhere (`ANNOUNCEMENT_PAGE_SIZE`, `BULK_INVITE_MAIL_CONCURRENCY`) | Name the remaining ones in-module; no central file needed | Low | 2 |

## 7. SOLID

| ID | sev | evidence | proposed change | risk | wave |
|---|---|---|---|---|---|
| BE-050 | medium | Role if-chains that resolve a "scope" per role, each re-written per domain: `calendarScopeFor` (`lib/permissions/season.ts:157-196`: SUPER / ADMIN / LEADER / else), `studentListScope` (`lib/queries/students/list.ts:36-47`), `staffScopeForSeason` (`season.ts:59`), `attendanceScopeFor` (`:84`), `submissionQueueScopeFor` (`lib/permissions/submission.ts:114`), `reportScopeFor` (`lib/permissions/report.ts:23`), `viewerSeasonIds` (`lib/queries/events.ts`). 115 `role ===/!==` literal comparisons in 39 files (most: `routes/users/accounts.ts` 10, `lib/rbac.ts` 10, `routes/me.ts` 6) | Not a full strategy-object refactor (each domain's answer genuinely differs). Instead one shared primitive `staffSeasonScope(user) → {kind:"all"}|{kind:"seasons",ids}|{kind:"groups",…}` in `lib/permissions/season.ts` that the domain scopes build on, plus BE-027. Keep role comparisons in `lib/rbac.ts` predicates (`isStudentRole`, `isLeaderRole`) rather than literals in handlers | Medium (authz) | 4 |
| BE-051 | low | Only one `switch` on a discriminant in the codebase (`lib/roles/active-role.ts:128`, on `role.kind`) — fine | none | — | — |
| BE-052 | low | Infrastructure coupling: `lib/email.ts` binds nodemailer/Gmail directly (`:35-40`) and `lib/push.ts` mixes the device-token DB read with the Expo HTTP call (`:1,13,33`). Storage already has an interface (`lib/storage/index.ts:25` `Storage`, two drivers), Sentry is behind `reportError` (`lib/sentry.ts`). Callers are few (email: `lib/invites.ts`, `lib/auth/password-reset.ts`, `routes/users/invites.ts`; push: `lib/notifications.ts`) and tests use `jest.mock` on the module | Honest call: a `Mailer`/`PushSender` interface is only worth it when a second transport arrives (the CMS/S3 note in CLAUDE.md is the analogous case). Low-cost step now: split `push.ts` into `push/tokens.ts` (DB) + `push/expo.ts` (HTTP) | Low | 4 (optional) |
| BE-053 | low | Fat interface: `SessionUser` (token claims) is passed everywhere, including pure helpers that need one field (e.g. `isAdminOfSeason(u, id)` only reads `seasonAdminIds`) — acceptable; no action | none | — | — |
| BE-054 | low | Redundant branch: `lib/permissions/forum.ts:94-95` — `if (author && isAdminOfSeason) return true; if (isAdminOfSeason) return true;` the first line is subsumed by the second | Delete line 94 | Low | 1 |

## 8. Circular imports

`be-audit/cycles.js` over all 256 production files (relative imports, `index.ts` resolution): **1 cycle**.

| ID | sev | evidence | proposed change | risk | wave |
|---|---|---|---|---|---|
| BE-060 | low | `lib/storage/index.ts:5-6` imports `./local` and `./s3`; `lib/storage/local.ts:9` imports the value `FileNotFoundError` (and types) back from `./index`; `s3.ts:3` imports types only. Works today only because `FileNotFoundError` is used lazily inside methods | Move `PutMeta`, `PutResult`, `Storage`, `FileNotFoundError`, `buildStorageKey` to `lib/storage/types.ts`; `index.ts` keeps `getStorage()` and re-exports | Low | 2 |

No route↔lib or lib→routes cycles; lib never imports routes.

## 9. N+1 and over-fetching

`be-audit/n1.js` found 31 awaited DB/loader calls inside loops or async `.map` callbacks (13 in scripts/seed — ignored).
No `include:` is used anywhere in routes or lib (everything uses `select`), and only 2 finds lack a `select`
(`lib/auth/tokens.ts:122` refresh token — needs most columns; `lib/notifications.ts:70` preferences — needs the
boolean columns), so over-fetching through relations is not an issue.

| ID | sev | evidence | proposed change | risk | wave |
|---|---|---|---|---|---|
| BE-070 | high | `lib/attendance-notifications.ts:24-82` `flagLowAttendance`: per absent student, up to 6 queries — `attendance.findMany` (`:25`), `groupIdInSeason` (`:42`), `groupLeader.findMany` (`:47`), `seasonAdmin.findMany` (`:51`, **loop-invariant**: same `seasonId` every iteration), `user.findUnique` (`:59`), then up to 2 `createNotificationsBulk` (`:67,:75`). Runs on every attendance save | Hoist admins out of the loop; fetch last-two attendance rows for all absent students in one query (window by `studentUserId`), enrolments' `groupId` and names in one `findMany` each, leaders for those groups in one query; then build notifications in memory | Low-medium; covered by `attendance-notifications.test.ts` | 4 |
| BE-071 | high | `lib/queries/forum.ts:232-240` (feed) and `:282-291` (comments list): `canDelete: await canDeleteForumComment(user, c.id)` per comment; `lib/permissions/forum.ts:72-84` re-reads the comment row (already loaded) and may call `hasActiveEnrollment` (`:92`) and the leader branch per comment. A page of 20 posts × N comments → 1-3 queries each | Split the gate: a pure `canDeleteLoadedComment(user, comment, ctx)` where ctx (season id, caller's live enrolment, led groups) is computed once per request; keep `canDeleteForumComment(id)` for the DELETE route | Medium (authz parity: add a test that the list flag equals the DELETE gate) | 4 |
| BE-072 | medium | `lib/queries/assignments/staff.ts:38-45` `listAssignmentsForSeason`: `Promise.all(rows.map(async a => db.seasonEnrollment.count(...)))` — one count per assignment | One `seasonEnrollment.groupBy({by:["groupId"], where:{seasonId,...seasonParticipant}, _count})` then sum per assignment's target groups (all-groups = total) | Low | 4 |
| BE-073 | low | `lib/queries/groups/membership.ts:269-279`: per student `groupStudent.deleteMany` + `seasonEnrollment.update` inside a transaction | `deleteMany({studentUserId:{in:eligible}, seasonId})` + `updateMany` — two statements total | Low | 4 |
| BE-074 | low | `routes/seasons/end.ts:114-119`: `updateMany` per not-passed student (each has its own `resultReason`) | Acceptable (distinct data per row, bounded by roster); could group by identical reason. Leave | — | — |
| BE-075 | low | `lib/queries/students/writes.ts:182-184` `clearDraftRows`: `hasWorkInSeason` per draft row | Bounded (a person rarely has >1 draft row); leave unless profiling says otherwise | — | — |
| BE-076 | low | `lib/follow-ups.ts:104-117`: per due follow-up a claim `updateMany` + notification; deliberate claim-then-send, cron-only, capped at 200 (`:100`) | Could claim in one `updateManyAndReturn` and fan out in one bulk call; low value | Low | 4 (optional) |
| BE-077 | low | Per-row writes inside transactions that need returned ids or have no bulk form: `routes/seasons/duplicate.ts:111-113,141-143,148` (`create` to build id maps; `createMany` already used for rows without mapping), `routes/quizzes/attempts.ts:204-215` (upsert per answer — Prisma has no bulk upsert), `:292`, `routes/quizzes/questions.ts:182,220` (reorder), `routes/video-quiz/staff.ts:140-145` | Leave; `createManyAndReturn` could replace the duplicate.ts loops, but Postgres does not guarantee RETURNING order matches input, so mapping old→new ids would need a natural key — not worth it | — | — |
| BE-078 | low | `routes/dev.ts:51-58`: one `user.findMany` per role (5) in `Promise.all` | Dev-only route; leave | — | — |

## 10. Dead / test-only code (wave 1)

From `be-audit/unused.out` (exports with no production importer; types and "exported but only used in-file" omitted):

| ID | sev | evidence | proposed change | risk | wave |
|---|---|---|---|---|---|
| BE-080 | low | Production exports used only by tests: `isAdminOfAnySeason` (`lib/rbac.ts:54`), `sentryEnabled` (`lib/sentry.ts:40`), `checkStudentSeat` (`lib/roles/student-seats.ts:68`; production uses `seatStudents`; CLAUDE.md "Roles" names it among the refusal helpers, so update the doc in the same change) | Delete with their tests, or keep `checkStudentSeat` and note it is a test seam | Low | 1 |
| BE-081 | low | Exports used only inside their own module (export keyword can go): `buttonHtml`, `codeBoxHtml`, `renderShell`, `stepsHtml` (`lib/email-templates.ts`), `dueAtFor` (`lib/follow-ups.ts:11`), `withDerivedAuthorRoles` (`lib/queries/notes.ts`), `SEASON_START_LOCK_KEY` (`lib/roles/active-role.ts`), `SESSION_CANCELLED_LINK` (`lib/session-notifications.ts:8`), `READ_ONLY_ALLOWED_WRITES` (`middleware/read-only.ts`), `isEditableStatus` (`routes/submissions/editable.ts`), `isMissingColumn` (`scripts/community-preflight-wide.ts`), `superAdminInputSchema` (`scripts/create-super-admin/create.ts`) | Drop `export` | None | 1 |

## Notes

- I measured "function length" as first-to-last line including comments; several long handlers are ~30% comments citing rulings — still worth splitting, but the code-only length is smaller.
- The scratchpad is shared with other auditors: two of my scripts (`cycles.js`, `unused.js` at the scratchpad root) were overwritten by another agent mid-run; I re-created them under `be-audit/` and re-ran — the numbers above come from the `be-audit/` copies.
- No checks (tsc, lint, tests) were run; this was a read-only static audit.
