# Announcement Polls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A post in Announcements may carry one poll (one answer or several) that its readers vote on, with results, voter names for the poster, closing, and edit-with-warnings.

**Architecture:** Three additive tables under `Announcement`. The poll rides on the existing post endpoints (create, PATCH, detail, feed), plus four new routes under `/announcements/:id/poll/*`. Every poll write takes a row lock on the poll in one transaction, and a `version` on the poll refuses votes made from a stale screen. The mobile app adds a `screens/announcements/poll/` folder (card, voters sheet, composer section, edit warnings) and wires it into `post-view.tsx` and `post-form.tsx`.

**Tech Stack:** Express 5, Prisma 7 (`src/generated/prisma`), Zod in `packages/shared`, Expo + expo-router, React Query, NativeWind, Jest + supertest (integration on local Postgres `space_test`), Maestro sweep.

**Spec:** `docs/superpowers/specs/2026-11-09-announcement-polls-design.md` (owner approved 2026-11-09). Read it before any task; it holds the rules this plan only names.

## Global Constraints

- Options: 2 to 10; each label trimmed, 1 to 150 characters, unique ignoring case, plain text.
- Wire envelope `{ data }` / `{ error: { code, message } }`; 403 via `forbidden(res)`; a post the caller can't read, and the voters list for a non-manager, is 404 `not_found`.
- Codes: `poll_closed` 409, `season_finished` 409, `poll_changed` 409, `poll_votes_lost` 409 (with `votes` in the body), `bad_request` 400.
- The migration is additive. Name it `20261109090000_announcement_polls`. Apply it locally only (`space_test`), and say so in the commit.
- No `process.env` outside `config.ts`; no `@prisma/client`; value imports of `packages/shared` from `routes/announcements/*` use `../../../../../packages/shared/src/index` (as `write.ts` does).
- No option text, body or names in an audit line, log or Sentry event.
- Mobile: relative imports; `Screen`/`SaveBar` footer; `rounded-group|control|full`; Text variants only; no hex or shadows; no animation on bars or numbers (calm motion); "Your vote" in words beside a check, never colour alone; one sheet that changes its words, never a second modal.
- Every file 400 lines or fewer.
- Commits are authored by the repo-local config (`jesusprojectcommunity`). Don't push unless the owner asks.

## Review Focus

1. **A rename while a reader has the poll open.** Their vote must come back `poll_changed`, not land on the new wording. A test goes in Task 3.
2. **Two people editing and voting at once.** An edit that removes an option while a vote for it is in flight must not leave a vote on a deleted option, and the 409 count must be true. A test with `Promise.all` goes in Task 5.
3. **A several → one edit when nobody had picked more than one.** It must need no `confirmVoteLoss` and keep every vote. A test goes in Task 5.
4. **A poll on a post whose season has just finished.** Voting, close and edit all refuse with `season_finished`, and the card reads Closed. Tests go in Tasks 3 and 4.
5. **Option labels that differ only in case or spaces** ("Sat", " sat "). They're refused by the shared schema on create and on edit. A test goes in Task 1.

---

### Task 1: Schema, migration and shared contract

**Files:**
- Modify: `apps/backend/prisma/schema.prisma` (after `AnnouncementRead`, ~line 931; back-relations on `Announcement` and `User`)
- Create: `apps/backend/prisma/migrations/20261109090000_announcement_polls/migration.sql`
- Modify: `packages/shared/src/announcement.ts`
- Test: `packages/shared/src/__tests__/announcement.test.ts`

**Interfaces:**
- Produces (Prisma): `AnnouncementPoll { id, announcementId @unique, allowsMultiple Boolean, version Int @default(1), closedAt DateTime?, closedById Int? (SetNull), createdAt }`; `AnnouncementPollOption { id, pollId (Cascade), label, position Int }` with `@@index([pollId, position])`; `AnnouncementPollVote { optionId (Cascade), pollId (Cascade), userId (Cascade), createdAt; @@id([optionId, userId]); @@index([pollId, userId]) }`. Relation `Announcement.poll AnnouncementPoll?`.
- Produces (shared): `POLL_OPTIONS_MIN = 2`, `POLL_OPTIONS_MAX = 10`, `POLL_OPTION_MAX = 150`;
  `pollOptionInputSchema = { id?: int positive, label }`;
  `pollInputSchema = { allowsMultiple: boolean, options: pollOptionInput[] }` with the limits and the case-insensitive uniqueness (`superRefine`, issue path `["options", i, "label"]`);
  `announcementPollSchema = { version, allowsMultiple, closed, canVote, canManage, myOptionIds: int[], voterCount: int|null, multiPickVoters: int|null, options: { id, label, votes: int|null }[] }`;
  list item `+ hasPoll: boolean, pollClosed: boolean | null`; detail `+ poll: announcementPollSchema.nullable()`;
  create requests `+ poll?: pollInputSchema` (no `id` allowed in options on create: refine);
  update request becomes `{ body, poll?: pollInputSchema | null, confirmVoteLoss?: boolean }` (strict);
  `pollVoteRequestSchema = { version: int positive, optionIds: int positive[] min 1 }` (strict);
  `pollVotersResponseSchema = { options: { id, label, voters: { name: string | null }[] }[] }`;
  `pollVotesLostSchema = { votes: int min 0 }` (the 409 body's extra field). Export all types via `z.infer`.

- [ ] **Step 1: Write the failing shared tests** in `announcement.test.ts`:
  `pollInputSchema` accepts 2 and 10 options and refuses 1 and 11; refuses a label of 151 characters and an empty-after-trim label; refuses `["Sat", " sat "]` with the issue at `["options", 1, "label"]`; `createAnnouncementRequestSchema` refuses an option with `id`; `updateAnnouncementRequestSchema` accepts `poll: null` and no `poll`; `pollVoteRequestSchema` refuses `optionIds: []`.
- [ ] **Step 2: Run** `pnpm --filter @space/shared test -- announcement`. Expected: FAIL (exports missing).
- [ ] **Step 3: Add the schemas** above to `packages/shared/src/announcement.ts`. If the file goes past 400 lines, move the poll schemas to `packages/shared/src/announcement-poll.ts` and re-export them from `index.ts`.
- [ ] **Step 4: Run** the same test. Expected: PASS.
- [ ] **Step 5: Add the Prisma models and migration.** Write the SQL by hand to match the models: three `CREATE TABLE`s, the FKs with their `ON DELETE`, a unique index on `announcementId`, and the two indexes. Run `pnpm --filter @space/backend db:migrate:deploy` against the local `.env` (check the host is `127.0.0.1:55440` first; never print `DATABASE_URL`), then `pnpm --filter @space/backend db:generate`. Expected: applied, and the client is generated.
- [ ] **Step 6: Run** `pnpm typecheck`. Expected: errors only where serializers now lack `hasPoll`/`poll`; those are fixed in Task 2, so commit together with Task 2 if the build must stay green.
- [ ] **Step 7: Commit** `feat(shared,db): announcement poll tables and contract`, saying in the message that the migration was applied to local `space_test` only.

### Task 2: Serialize the poll on reads and decide who sees what

**Files:**
- Create: `apps/backend/src/lib/permissions/announcement-poll.ts` (export from `permissions/index.ts`)
- Create: `apps/backend/src/routes/announcements/poll-serialize.ts`
- Modify: `apps/backend/src/routes/announcements/serialize.ts`, `read.ts`, `write.ts` (the `toDetail` call sites)
- Test: `apps/backend/src/__tests__/integration/announcements-poll-read.test.ts`; extend `announcements-setup.ts` with `insertPoll(postId, { allowsMultiple, labels, closed? }): Promise<{ pollId: number; optionIds: number[] }>` and `insertVote(pollId, optionId, userId)`

**Interfaces:**
- Consumes: Task 1 models and `announcementPollSchema`.
- Produces:
  `canVotePoll(user: SessionUser, row: AnnouncementRowForAuth, closed: boolean): boolean`: open, not finished, and not (`isSuper(user)` and `audience === "SEASON"`);
  `canManagePoll(user, row): boolean` = `canEditAnnouncement(user, row)`;
  `canSeePollNames(user, row): boolean` = `canManagePoll || (isFinished(row) && isSuper(user))`;
  `isPollClosed(row, poll): boolean` = `poll.closedAt !== null || isFinished(row)`;
  `POLL_SELECT` (Prisma select for the poll with options ordered by `position`);
  `loadPollView(user: SessionUser, row: AnnouncementRow): Promise<AnnouncementPoll | null>`, which counts votes per option (`groupBy optionId`), distinct voters, the viewer's `myOptionIds`, and `multiPickVoters` (managers only) from the vote rows as they are;
  `toDetail(row, isRead, flags, poll: AnnouncementPoll | null)`; `toListItem` fills `hasPoll` and `pollClosed` from `ANNOUNCEMENT_SELECT`, which gains `poll: { select: { closedAt: true } }`.
- Counts rule: `votes`/`voterCount` are non-null when `canManagePoll || myOptionIds.length > 0 || closed`.

- [ ] **Step 1: Write failing integration tests** (`announcements-poll-read.test.ts`, using the fixtures): a student who hasn't voted gets `votes: null` and `voterCount: null` on every option, with `canVote: true`; after `insertVote` they get the numbers and `myOptionIds`; the admin author gets counts without voting, `canManage: true` and a `multiPickVoters` number; the Super on a season poll gets `canVote: false` and `canManage: true`; the mentor on a community poll gets `canVote: true`; a closed poll shows counts to a non-voter; a finished season's poll has `closed: true`, `canVote: false`, `canManage: false`; `GET /announcements` items carry `hasPoll: true` and `pollClosed: false` for the poll post and `hasPoll: false`, `pollClosed: null` for the others; a post without a poll has `poll: null`.
- [ ] **Step 2: Run** `pnpm --filter @space/backend test:integration -- announcements-poll-read`. Expected: FAIL.
- [ ] **Step 3: Implement** the predicates, `POLL_SELECT`, `loadPollView`, the serializer changes, and pass the poll into every `toDetail` (`getOne`, `createPost`, `updatePost`).
- [ ] **Step 4: Run** that test and the existing `announcements-read`/`-write`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): announcement detail and feed carry the poll`.

### Task 3: Voting

**Files:**
- Create: `apps/backend/src/routes/announcements/poll-vote.ts`, `apps/backend/src/lib/announcement-poll-lock.ts`
- Modify: `apps/backend/src/routes/announcements/index.ts` (register `PUT /:id/poll/vote` before `/:id`)
- Test: `apps/backend/src/__tests__/integration/announcements-poll-vote.test.ts`

**Interfaces:**
- Produces: `lockPoll(tx: Prisma.TransactionClient, pollId: number): Promise<void>` (`SELECT "id" FROM "AnnouncementPoll" WHERE "id" = $1 FOR UPDATE`, as `invites.ts` does). Every poll write in Tasks 3 to 5 calls it first inside its `$transaction`.
  `castVote(req, res)`: `200 { data: AnnouncementDetail }` (the post with the fresh poll, so the app needs no refetch).
- Order of checks: parse id (400) → readable post with a poll (404) → finished (409 `season_finished`) → `canVotePoll` false and not closed (403) → body schema (400) → in the transaction: lock → closed (409 `poll_closed`) → version mismatch (409 `poll_changed`) → ids not all on the poll, or more than one on a one-answer poll (400) → delete the caller's votes on the poll, insert the new ones.

- [ ] **Step 1: Write failing tests:** a student votes on a one-answer poll (200, `myOptionIds` = [id], counts visible); changing the vote replaces it (one row left); several ids on a several-answer poll are all stored; two ids on a one-answer poll → 400; an id from another poll → 400; `optionIds: []` → 400; a stale `version` → 409 `poll_changed` and nothing stored; **after a rename via `db` that bumps `version`, the old version → 409 `poll_changed`** (Review Focus 1); a closed poll → 409 `poll_closed`; **a finished season's poll → 409 `season_finished`** (Review Focus 4); a Super on a season poll → 403; the Super on a community poll → 200; an outsider (another season's student) → 404.
- [ ] **Step 2: Run** `pnpm --filter @space/backend test:integration -- announcements-poll-vote`. Expected: FAIL.
- [ ] **Step 3: Implement** `lockPoll` and `castVote` in the order above.
- [ ] **Step 4: Run** it. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): vote on an announcement poll`.

### Task 4: Close, reopen and who voted

**Files:**
- Create: `apps/backend/src/routes/announcements/poll-manage.ts`
- Modify: `routes/announcements/index.ts` (`POST /:id/poll/close`, `POST /:id/poll/reopen`, `GET /:id/poll/voters`, all before `/:id`)
- Test: `apps/backend/src/__tests__/integration/announcements-poll-manage.test.ts`

**Interfaces:**
- Produces: `closePoll`, `reopenPoll` → `200 { data: AnnouncementDetail }`; they set or clear `closedAt`/`closedById` under `lockPoll`, leave `version` and `editedAt` alone, and audit `announcement.poll.close` / `announcement.poll.reopen` with `{ season }` only. Closing a closed poll, or reopening an open one, is idempotent (200).
  `listVoters` → `200 { data: PollVotersResponse }`: options in `position` order, voters by vote `createdAt` ascending, `name: null` for a soft-deleted user.
- Gates: close/reopen need `canManagePoll` (finished → 409 `season_finished` first, as PATCH does; else 403); voters need `canSeePollNames`, else 404.

- [ ] **Step 1: Write failing tests:** the author admin closes (200, `closed: true`, `editedAt` unchanged, no notification row created); reopens; a student → 403; a finished season → 409 `season_finished`; voters for the author list names per option in vote order; a soft-deleted voter (`deletedAt` set) reads `name: null` and still counts; **a student dropped after voting (enrolment WITHDRAWN) still counts and is still listed**; a student asking for voters → 404; the Super on a finished season's poll gets voters (200).
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement** `poll-manage.ts`.
- [ ] **Step 4: Run** it. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): close, reopen and list voters on a poll`.

### Task 5: Create and edit a post's poll

**Files:**
- Create: `apps/backend/src/routes/announcements/poll-write.ts`
- Modify: `apps/backend/src/routes/announcements/write.ts` (`createPost` and `updatePost` call into it inside a transaction)
- Test: `apps/backend/src/__tests__/integration/announcements-poll-write.test.ts`

**Interfaces:**
- Produces: `createPollFor(tx, announcementId: number, input: PollInput): Promise<void>`;
  `planPollEdit(current: { allowsMultiple; options: { id }[] } & { votesByOption: Map<number, number>; multiPickUserIds: number[] } | null, next: PollInput | null | undefined): { lostVotes: number; bumpVersion: boolean; ... }`, a pure function (unit-test it);
  `applyPollEdit(tx, announcementId, next, plan): Promise<void>`.
- Rules (from the spec): `poll` absent → untouched; `null` → delete the poll (lost = all votes); object → options with an `id` are kept and renamed (an `id` not on this poll → 400), missing ones deleted, new ones created, `position` = list order; several → one deletes all votes of users with more than one pick (and keeps everyone else's); a post without a poll gains one. `bumpVersion` when anything but nothing changed (labels, set, order or `allowsMultiple`). `lostVotes > 0` without `confirmVoteLoss: true` → `409 poll_votes_lost` with `{ error: {...}, votes: lostVotes }`, nothing written (`apiError` may need an `extra` argument; check `lib/api-response.ts`). Audit `announcement.poll.update` with `{ season }`. A message-only PATCH still sets `editedAt` as today; a poll change sets it too.

- [ ] **Step 1: Write failing unit tests** for `planPollEdit` (`src/__tests__/poll-edit-plan.test.ts`): rename only → lost 0, bump; remove an option with 5 votes → lost 5; several → one with two multi-pickers holding 4 votes between them → lost 4; **several → one with no multi-pickers → lost 0** (Review Focus 3); identical input → no bump; `null` with 9 votes → lost 9.
- [ ] **Step 2: Write failing integration tests:** create with a poll (201, `poll.version: 1`, options in order); create with a poll on a draft season → 409 `season_draft` as today, with no rows left behind; PATCH a rename keeps the votes and bumps `version`; PATCH removing a voted option without confirm → 409 `poll_votes_lost` with `votes`, unchanged in the db; with `confirmVoteLoss: true` → 200 and the votes gone; PATCH `poll: null` with votes → same pair; PATCH body only → votes and version untouched; PATCH adding a poll to a plain post; PATCH with an option id from another poll → 400; **duplicate labels "Sat"/" sat " → 400** (Review Focus 5); **concurrent: `Promise.all` of an edit removing option A (with `confirmVoteLoss`) and a vote for A at the old version → afterwards no vote row points at a missing option, and the vote either 409s or landed before the edit and was counted in `lostVotes`** (Review Focus 2).
- [ ] **Step 3: Run** `pnpm --filter @space/backend test -- poll-edit-plan` and `test:integration -- announcements-poll-write`. Expected: FAIL.
- [ ] **Step 4: Implement** `poll-write.ts` and wire `createPost`/`updatePost` into `db.$transaction` with `lockPoll` before reading the current votes. `notifyAnnouncement` still runs after create only.
- [ ] **Step 5: Run** both, plus the existing announcement suites. Expected: PASS.
- [ ] **Step 6: Commit** `feat(backend): add and edit a poll on a post, with vote-loss confirmation`.

### Task 6: OpenAPI

**Files:**
- Modify: `apps/backend/src/docs/components/announcements.ts`, `apps/backend/src/docs/paths/announcements.ts`
- Test: `apps/backend/src/__tests__/openapi-announcements.test.ts`

- [ ] **Step 1: Extend the test** to expect the paths `/announcements/{id}/poll/vote` (put), `/poll/close`, `/poll/reopen` (post), `/poll/voters` (get), and the `AnnouncementPoll` component on the detail.
- [ ] **Step 2: Run** `pnpm --filter @space/backend test -- openapi-announcements`. Expected: FAIL.
- [ ] **Step 3: Document** the routes, the request and response shapes, and the 409 codes (`poll_closed`, `poll_changed`, `poll_votes_lost` with `votes`).
- [ ] **Step 4: Run** it. Expected: PASS. **Commit** `docs(api): announcement polls`.

### Task 7: Mobile hooks

**Files:**
- Modify: `apps/mobile/src/hooks/use-announcements.ts` (or split to `use-announcement-poll.ts` if it passes 400 lines), `apps/mobile/src/lib/query-keys.ts`
- Test: `apps/mobile/src/__tests__/use-announcements.test.tsx`

**Interfaces:**
- Produces: `useVotePoll(postId: number)` → mutation of `{ version, optionIds }`, which writes the returned detail into `queryKeys.announcements.detail(postId)` and invalidates `feed()`; `useClosePoll(postId)`, `useReopenPoll(postId)` (same cache write); `usePollVoters(postId: number, enabled: boolean)` with key `queryKeys.announcements.voters(postId)`, parsed with `pollVotersResponseSchema`; `pollVotesLost(err: unknown): number | null` in `lib/api-error.ts`, which reads `votes` off a 409 `poll_votes_lost`. `useUpdateAnnouncement` now sends `UpdateAnnouncementRequest` with `poll` and `confirmVoteLoss`. On a `poll_changed` error, `useVotePoll` invalidates `detail(postId)`.

- [ ] **Step 1: Write failing hook tests:** a vote puts the response in the detail cache; a 409 `poll_changed` invalidates the detail; `pollVotesLost` returns 7 for a 409 carrying `votes: 7` and null otherwise; voters are parsed and not fetched while `enabled` is false.
- [ ] **Step 2: Run** `pnpm --filter @space/mobile test -- use-announcements`. Expected: FAIL.
- [ ] **Step 3: Implement**, then **run** again. Expected: PASS. **Commit** `feat(mobile): poll hooks`.

### Task 8: The poll card on a post

**Files:**
- Create: `apps/mobile/src/screens/announcements/poll/poll-card.tsx`, `poll-choices.tsx`, `poll-results.tsx`, `voters-sheet.tsx`, `poll-copy.ts`
- Modify: `apps/mobile/src/screens/announcements/post-view.tsx` (render `PollCard` under the message when `post.poll`)
- Test: `apps/mobile/src/__tests__/announcement-poll-card.test.tsx` (fixtures in `__tests__/helpers/announcements.ts`)

**Interfaces:**
- Consumes: Task 7 hooks; `AnnouncementPoll`.
- Produces: `PollCard({ postId, poll }: { postId: number; poll: AnnouncementPoll })`. Mode is local state: `"choose"` when `canVote && myOptionIds.length === 0 && !canManage`, or after Change vote / Vote; otherwise `"results"`. `poll-copy.ts` holds the strings: header `"Poll · Pick one"` / `"Poll · Pick any"`, `"Closed"`, `"Vote"`, `"Change vote"`, `"Your vote"`, `"See who voted"`, `"Close poll"`, `"Reopen poll"`, footer `"1 person voted"` / `"N people voted"`, and the row label `` `${label}, ${votes} vote(s), ${pct} percent${mine ? ", your vote" : ""}` ``. Percent = `round(votes / voterCount * 100)`, 0 when `voterCount` is 0.
- Behaviour: choices are rows of at least 44pt with `accessibilityRole` `radio` or `checkbox` and `accessibilityState.checked`; Vote is disabled until something is ticked; Change vote opens choose with your picks ticked; a manager who may vote and hasn't gets a Vote pill in results; a Super on a season poll gets no Vote pill; bars are a static `View` whose width is a percentage, `bg-primary` on `bg-muted`, no animation; voters open in a `Sheet`, grouped by option, "Former member" for `name: null`; on `poll_changed` → toast "The poll changed. Have another look." and back to choose with the new options; other errors → `InlineError`.

- [ ] **Step 1: Write failing render tests** (`renderWithProviders`): a non-voter sees radios and a disabled Vote, and pressing an option enables it; a several-answer poll renders checkboxes; voted shows "Your vote" and the row's accessibility label with percent; Change vote returns to choices with the pick checked; Closed shows results and no Vote or Change vote; a manager who hasn't voted sees results plus a Vote pill; a Super on a season poll (`canVote: false`, `canManage: true`) sees no Vote pill but sees See who voted and Close poll; the voters sheet lists "Former member".
- [ ] **Step 2: Run** `pnpm --filter @space/mobile test -- announcement-poll-card`. Expected: FAIL.
- [ ] **Step 3: Implement** the files and the `post-view.tsx` hook-up.
- [ ] **Step 4: Run** it plus `announcements-post` and the design-consistency, calm-motion and no-classname-on-animated tests. Expected: PASS. **Commit** `feat(mobile): vote on and read a poll`.

### Task 9: Adding a poll in the composer

**Files:**
- Create: `apps/mobile/src/screens/announcements/poll/poll-editor.tsx`
- Modify: `apps/mobile/src/screens/announcements/post-form.tsx` (state `poll: PollInput | null`; `PostFormValues` gains `poll`), `confirm-post-sheet.tsx` (adds "with a poll" to the summary), `app/(app)/announcements/new.tsx` and `[id]/edit.tsx` (pass `initial.poll` from the detail: options with their ids)
- Test: `apps/mobile/src/__tests__/announcement-poll-editor.test.tsx`

**Interfaces:**
- Produces: `PollEditor({ value, onChange, errors }: { value: PollInput; onChange: (v: PollInput) => void; errors: Record<number, string> & { options?: string } })`. An **Add a poll** `PillButton` under the message sets `{ allowsMultiple: false, options: [{label:""},{label:""}] }`; option inputs are labelled "Option 1"…; "Add option" is hidden at 10; a remove button on each option beyond two, labelled "Remove option N"; a switch "Let people pick more than one"; a destructive pill **Remove poll**. Errors come from the shared schema's issues mapped by index: "Enter this option (up to 150 characters).", "Two options say the same thing.", and for the count "Add at least two options.".

- [ ] **Step 1: Write failing tests:** Add a poll shows two option fields; Add option stops at 10; removing goes back to two and no further; a duplicate shows its error via `accessibilityHint`; submitting a new post sends `poll` with labels and no ids; editing a post with a poll prefills it and sends the ids back.
- [ ] **Step 2: Run** `pnpm --filter @space/mobile test -- announcement-poll-editor`. Expected: FAIL.
- [ ] **Step 3: Implement**, then **run** it plus `announcements-post`. Expected: PASS. **Commit** `feat(mobile): add a poll to a post`.

### Task 10: Edit warnings and the vote-loss retry

**Files:**
- Create: `apps/mobile/src/screens/announcements/poll/edit-warnings.ts` (pure), `apps/mobile/src/screens/announcements/confirm-edit-sheet.tsx`
- Modify: `post-form.tsx` (edit mode: Save opens the sheet when `editWarnings` is non-empty; otherwise saves straight away as today), `app/(app)/announcements/[id]/edit.tsx` (on `pollVotesLost(err) !== null`, reopen the sheet with the server's count and send `confirmVoteLoss: true` on confirm)
- Test: `apps/mobile/src/__tests__/announcement-poll-edit-warnings.test.tsx`

**Interfaces:**
- Produces: `editWarnings(current: AnnouncementPoll | null, next: PollInput | null): { lines: string[]; losesVotes: boolean }`, with the spec's exact lines:
  `` `Votes stay with the new wording: ‘${old}’ → ‘${new}’ (${n} votes)` ``, only for a renamed option with votes;
  `` `Removing ‘${label}’ deletes its ${n} votes` ``;
  `` `${multiPickVoters} people who picked more than one answer will need to vote again` `` (only when it is above 0);
  `` `Removes the poll and its ${total} votes` ``.
  Use "1 vote" / "1 person" in the singular. `ConfirmEditSheet({ open, lines, serverLostVotes: number | null, pending, onConfirm, onClose })`: one sheet; when `serverLostVotes` is set it swaps its words to `` `New votes came in: this change now deletes ${n} votes.` `` (never a second modal).

- [ ] **Step 1: Write failing tests:** each warning line from fixtures, singular and plural; no lines when nothing with votes changes; a 409 `poll_votes_lost` reopens the same sheet with the new count, and confirming resends with `confirmVoteLoss: true`.
- [ ] **Step 2: Run** `pnpm --filter @space/mobile test -- announcement-poll-edit-warnings`. Expected: FAIL.
- [ ] **Step 3: Implement**, then **run** it. Expected: PASS. **Commit** `feat(mobile): warn before a poll edit changes votes`.

### Task 11: Feed chip, catalogue, sweep seed and flows, docs

**Files:**
- Modify: `apps/mobile/src/screens/announcements/post-card.tsx` (a "Poll" or "Poll · Closed" chip after the audience chip, and in its accessibility label), `apps/mobile/src/screens/design-catalogue/announcements-section.tsx` (`PollCard` in to-vote, voted-one, voted-several, closed and manager states, plus the editor), `apps/backend/scripts/seed-sweep/announcements.ts` (a season post "[Sweep] Which evening suits the retreat?" with an open several-answer poll of three options, and two votes by other seeded students), `apps/mobile/.maestro/sweep/student-scenarios/s57-announcements.yaml` (open the poll post and shoot it before voting; no save), `apps/mobile/.maestro/sweep/super-scenarios/s56-announcements.yaml` (open the poll post, See who voted, shoot; open New, Add a poll, shoot; never save), `CLAUDE.md` (a "Polls" paragraph under Announcements naming the rules and files)
- Test: extend `apps/mobile/src/__tests__/announcements-post.test.tsx` (or the feed test) for the chip

- [ ] **Step 1: Write the failing chip test** (a `hasPoll` item shows "Poll"; with `pollClosed` it shows "Poll · Closed"; neither shows without a poll), **run** it (FAIL), implement, **run** it (PASS).
- [ ] **Step 2: Add** the catalogue states, the seed and the flow steps; run `pnpm --filter @space/backend typecheck` for the seed.
- [ ] **Step 3: Commit** `feat(mobile): poll chip, catalogue, sweep seed and flows` plus the `CLAUDE.md` paragraph.

### Task 12: Whole-branch verification

- [ ] **Step 1: Run** `pnpm lint`, `pnpm typecheck` and `pnpm test` (integration runs on local `space_test`; start it in tmux as `space-v2-test`, logging to `~/logs/space-v2-test.log`). Expected: all green. Report the counts.
- [ ] **Step 2: Run the `ui-sweep` skill** on flows s56, s57 and s90. Look at every shot: the poll card at 360dp and font 1.3, the composer's option fields above the keyboard on Android, dark mode bars at 3:1, and "Your vote" not wrapping mid-word.
- [ ] **Step 3:** Fix what the sweep finds (each as its own commit), then report what ran and what didn't. Don't push or apply the migration anywhere else without the owner.
