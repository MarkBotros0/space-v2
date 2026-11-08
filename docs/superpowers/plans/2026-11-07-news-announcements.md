# News (announcements) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Season and community announcements ("News"): posted by a season's admin or a Super, read in More → News, surfaced on Home, notified in-app and by push.

**Architecture:** Two new tables (`Announcement`, `AnnouncementRead`) behind a new router at `/api/v1/announcements`. Who may read is one Prisma `where` (`announcementVisibilityFilter`); what counts as unread narrows it (`announcementUnreadFilter`); who is notified is one recipient query that also gives the composer its reach count. The app adds `/news`, `/news/[id]`, `/news/new`, `/news/[id]/edit`, a News row in every role's More, a Home card, and gives the mentor a More tab.

**Tech Stack:** Express 5, Prisma 7, Zod (`packages/shared`), Expo Router, React Query, NativeWind, Jest + supertest.

**Spec:** `docs/superpowers/specs/2026-11-07-news-announcements-design.md` (approved by the owner 2026-11-07).

## Global Constraints

- Migration is additive only. New folder after `20261107180000_mentor_follow_ups`.
- No `process.env` outside `src/lib/config.ts`. Prisma client from `src/generated/prisma`. Relative imports only. Value imports of `packages/shared` from a route **folder** use `../../../../../packages/shared/src/index`.
- Every source and test file ≤ 400 lines.
- Envelope `{ data }` / `{ error: { code, message } }`; 403 through `forbidden(res)`.
- Title 1..120 chars after trim; body 1..5000 after trim; plain text, never rendered as HTML.
- Excerpt: first 280 chars of the body. Push body: first 120 chars.
- Unread window: 30 days, and the post must be newer than the reader's `User.createdAt`.
- Notification link: `/news/<id>`; type `ANNOUNCEMENT`; preference key `announcement`.
- Audit lines carry ids only, never title or body. No body in a Sentry event.
- Mobile: semantic tokens only, no hex, no `shadow-`, radii `rounded-group|control|full`; Text variants only; no entrance animation; status in words; press targets ≥ 44pt.
- Commits authored as `jesusprojectcommunity` (repo config). Commit only this plan's files; other sessions have uncommitted work here. Don't push.

## Review Focus

1. **A season post leaking.** A mentor, a former admin of a finished season, a dropped student, or a student of another season sees it in the feed, `/unread` or `GET /:id`. They must get nothing, and a 404 on the detail.
2. **A Super's Home flooded.** Season posts never count as unread for a Super, and Supers aren't notified of them.
3. **Reach and recipients disagree.** The confirm sheet's "notifies N people" must equal the rows actually written. Both come from one function.
4. **A test run notifying real people.** A community post fans out to every account in the database the tests hit. The test cleanup deletes those rows. `config.enablePush` stays false in tests.
5. **A deleted post opened from an old notification.** The detail shows "This post was removed", never an error or a blank screen.

---

### Task 1: Schema, migration and shared contracts

**Files:**
- Modify: `apps/backend/prisma/schema.prisma` (enum `AnnouncementAudience`, models `Announcement` and `AnnouncementRead` exactly as in the spec's Data section; `ANNOUNCEMENT` on `NotificationType`; `announcement Boolean @default(true)` on `NotificationPreference`; back-relations on `User` (`announcementsAuthored @relation("AnnouncementAuthor")`, `announcementReads`) and `Season` (`announcements`))
- Create: `apps/backend/prisma/migrations/20261107200000_announcements/migration.sql`, generated with `prisma migrate dev --create-only` against the local `space_test`, plus a hand-added `CHECK (("audience" = 'SEASON') = ("seasonId" IS NOT NULL))` named `Announcement_audience_season_check`
- Modify: `packages/shared/src/enums.ts` (`ANNOUNCEMENT` in `notificationTypeSchema`; new `announcementAudienceSchema = z.enum(["COMMUNITY","SEASON"])`)
- Modify: `packages/shared/src/notification.ts` (`"announcement"` in `notificationEntityTypeSchema`; `ANNOUNCEMENT: "announcement"` in `NOTIFICATION_PREFERENCE_KEY_BY_TYPE`; `announcement` in `notificationPreferencesSchema` and the defaults; `ANNOUNCEMENT` in `PUSH_NOTIFICATION_TYPES`)
- Modify: `apps/backend/src/lib/notifications.ts` (`ANNOUNCEMENT: "announcement"` in `PREF_FIELD`)
- Create: `packages/shared/src/announcement.ts`, exported from `index.ts`
- Test: `packages/shared/src/__tests__/announcement.test.ts`

**Interfaces (produces):**
- Constants: `ANNOUNCEMENT_TITLE_MAX = 120`, `ANNOUNCEMENT_BODY_MAX = 5000`, `ANNOUNCEMENT_EXCERPT_LENGTH = 280`, `ANNOUNCEMENT_PUSH_LENGTH = 120`, `ANNOUNCEMENT_UNREAD_DAYS = 30`, `ANNOUNCEMENT_PAGE_SIZE = 20`
- `announcementListItemSchema`: `{ id, audience, seasonId: number|null, seasonTitle: string|null, title, excerpt, authorName: string|null, createdAt: string, editedAt: string|null, isRead: boolean }`
- `announcementDetailSchema` = list item minus `excerpt`, plus `body: string, canEdit: boolean, canDelete: boolean, seasonFinished: boolean`
- `announcementPageResponseSchema`: `{ items: AnnouncementListItem[], nextCursor: string|null }`
- `announcementUnreadResponseSchema`: `{ count: number, latest: AnnouncementListItem|null }`
- `announcementTargetsResponseSchema`: `{ community: boolean, communityReach: number, seasons: { id, code, title, reach }[] }`
- `createAnnouncementRequestSchema`: discriminated on `audience`. `COMMUNITY` takes `{ title, body }`; `SEASON` takes `{ seasonId: positive int, title, body }`. Strict, trimmed.
- `updateAnnouncementRequestSchema`: `{ title?, body? }`, strict, at least one key.
- Types `z.infer` of each.

- [ ] **Step 1: Write the shared tests.** They assert:
  - the create schema rejects a 121-char title, an empty-after-trim body, a 5001-char body, `SEASON` without `seasonId`, and `COMMUNITY` with a `seasonId`;
  - the update schema rejects `{}`;
  - `NOTIFICATION_PREFERENCE_KEYS` contains `"announcement"`, and `shouldPush("ANNOUNCEMENT")` is true.
- [ ] **Step 2: Run** `pnpm --filter @space/shared test` and confirm it fails because the module is missing.
- [ ] **Step 3: Implement** the schemas, the enum additions and the Prisma changes. Generate the migration and add the CHECK. Run `pnpm --filter @space/backend db:generate`.
- [ ] **Step 4: Run** `pnpm --filter @space/shared test` and `pnpm typecheck`. Expected: PASS. A compile error anywhere means a `Record<NotificationType, …>` still lacks `ANNOUNCEMENT`; add it there.
- [ ] **Step 5: Apply** the migration to local `space_test` (`pnpm --filter @space/backend db:migrate:deploy`, after confirming the host is 127.0.0.1:55440). Commit: `feat: announcements schema and shared contracts`.

### Task 2: Read side (feed, unread, detail, mark read)

**Files:**
- Create: `apps/backend/src/lib/queries/announcements.ts`
- Create: `apps/backend/src/lib/permissions/announcement.ts`, re-exported from `permissions/index.ts`
- Create: `apps/backend/src/routes/announcements/index.ts` (route table), `read.ts` (handlers), `serialize.ts` (row → wire)
- Modify: `apps/backend/src/app.ts` (mount `app.use("/api/v1/announcements", announcementsRouter)` beside events)
- Modify: `apps/backend/src/lib/notification-target.ts` (pattern `/^\/news\/(\d+)$/` → `{ entityType: "announcement", id: "number" }`)
- Modify: `apps/backend/src/__tests__/integration/fixtures.ts` `cleanupTestData`. Before the season block, collect test announcements (title prefix `TEST_PREFIX`, or `authorId` a test user), delete `Notification` rows whose `link` is `/news/<id>` for those ids, then delete the announcements.
- Create: `apps/backend/src/__tests__/integration/announcements-setup.ts`, `announcements-read.test.ts`

**Interfaces (produces):**
- `announcementVisibilityFilter(user: SessionUser): Promise<Prisma.AnnouncementWhereInput>`
  - SUPER: `{}`.
  - Everyone else: `OR` of `{ audience: "COMMUNITY" }` and, unless MENTOR, `{ audience: "SEASON", seasonId: { in: readableSeasonIds }, season: { deletedAt: null } }`.
  - `readableSeasonIds` is the union of three sets: `user.seasonAdminIds`, the seasons of `user.groupLeaderIds` (via `group.findMany`), and the seasons where the user has a `SeasonEnrollment` matching `seasonParticipant`.
- `announcementUnreadFilter(user: SessionUser, userCreatedAt: Date, now: Date): Promise<Prisma.AnnouncementWhereInput>`
  - The base is `createdAt > max(userCreatedAt, now − 30 days)`, `reads: { none: { userId } }`, and `authorId` not the user.
  - On top of that, the post must be addressed to the user: `COMMUNITY`, or `SEASON` with `seasonId` in the user's **live** seasons.
  - Live seasons are `seasonAdminIds`, the leader groups' seasons and `activeSeasonId`, each restricted to `season.status = ACTIVE`. Empty for SUPER and MENTOR.
- `canReadAnnouncement(user, id): Promise<boolean>`: `findFirst` with `{ id, ...visibilityFilter }`
- `toListItem(row, isRead)` and `toDetail(row, flags)` in `serialize.ts`.
- Routes: `GET /` (`?cursor`), `GET /unread`, `GET /:id`, `POST /:id/read`. The cursor is `createdAt|id` base64; order is `createdAt desc, id desc`. `isRead` is `true` for any item that `announcementUnreadFilter` wouldn't match, so a Super's season posts never show "New".

- [ ] **Step 1: Write `announcements-setup.ts`.** It seeds:
  - a live season with its admin, a group leader, an ACTIVE student, a WITHDRAWN student, and a studying alumnus;
  - a finished (COMPLETED) season with its former admin (SeasonAdmin row) and a COMPLETED student;
  - another live season with its own student;
  - a mentor and a Super;
  - one community post, one live-season post, one finished-season post and one other-season post, inserted directly with `testEventTitle(...)` titles.
- [ ] **Step 2: Write `announcements-read.test.ts`.** Each case asserts the feed ids, the `/unread` count and the `GET /:id` status:
  - `"student reads community and own season, not other season"`
  - `"dropped student no longer reads the season"`, which asserts a 404 on the season post
  - `"finished student keeps reading the finished season"`
  - `"former admin of a finished season is cut off"`, which asserts a 404
  - `"studying alumnus reads the community-wide season's posts"`
  - `"leader and admin read their season"`
  - `"mentor reads community only"`, which asserts a 404 on the season post
  - `"super reads everything but only community posts are unread"`: `/unread.count` counts the community post only, and the season posts' `isRead` is true
  - `"author's own post is never unread"`
  - `"post older than 30 days or the account is not unread"`, which back-dates `createdAt`
  - `"POST /:id/read is idempotent and clears unread"`, which posts twice, expects 204 both times, then `count` drops by 1
  - `"GET /:id of a missing id is 404 not_found"`
  - `"feed pages with nextCursor"`, which inserts `ANNOUNCEMENT_PAGE_SIZE + 1` community posts
- [ ] **Step 3: Run** `pnpm --filter @space/backend test:integration -- announcements-read` and confirm it fails with a 404 route.
- [ ] **Step 4: Implement** the query module, the gate, the routes and the link pattern. Extend `notification-target` tests with the `/news/12` row.
- [ ] **Step 5: Run** the suite and `src/__tests__/notification-target*.test.ts`. Expected: PASS. Commit: `feat(backend): News feed, unread and detail`.

### Task 3: Write side (post, edit, delete, targets, notify)

**Files:**
- Create: `apps/backend/src/routes/announcements/write.ts`, `targets.ts`
- Create: `apps/backend/src/lib/announcement-notifications.ts`
- Modify: `apps/backend/src/lib/permissions/announcement.ts`, `src/lib/audit.ts` (operations `announcement.create`, `announcement.update`, `announcement.delete`)
- Test: `apps/backend/src/__tests__/integration/announcements-write.test.ts`, `announcements-notify.test.ts`

**Interfaces (produces):**
- `postTargetsFor(user): Promise<{ community: boolean; seasons: { id; code; title }[] }>`. SUPER gets `community: true` plus every ACTIVE non-deleted season. An admin gets `community: false` plus the ACTIVE seasons in `seasonAdminIds`. Anyone else gets nothing.
- `canPostTo(user, target: { audience; seasonId? }): Promise<"ok" | "forbidden" | "season_draft" | "season_finished" | "not_found">`
- `canEditAnnouncement(user, row)`: false when the season is COMPLETED or ARCHIVED, for everyone. Otherwise true for a SUPER, and true for the author while `isAdminOfSeason(user, row.seasonId)` holds; community posts are SUPER-only.
- `canDeleteAnnouncement(user, row)`: the same as edit, except a SUPER may delete on a finished season (owner, 2026-11-07).
- `announcementRecipients(target, excludeUserId): Promise<number[]>`. Every user is `deletedAt: null`, and the author is excluded.
  - COMMUNITY: every such user.
  - SEASON: users with an `ACTIVE` enrolment in the season while it is ACTIVE, plus its `SeasonAdmin` and `GroupLeader` users, minus SUPER and MENTOR roles.
- `notifyAnnouncement(post): Promise<void>` calls `createNotificationsBulk(recipients, { type: "ANNOUNCEMENT", title: post.title, body: post.body.slice(0, 120), link: "/news/" + post.id })`. It runs after the create transaction, inside `runInBackground("announcement-notify", …)`.
- Routes:
  - `GET /targets` returns targets, each with `reach = announcementRecipients(...).length`, and `communityReach` (0 when not allowed).
  - `POST /` returns 201 `{ data: detail }`.
  - `PATCH /:id` returns 200 detail and sets `editedAt = now`.
  - `DELETE /:id` returns 204.
  - Error mapping: invalid body → 400 `bad_request`; not allowed → 403; unknown or invisible id → 404; draft → 409 `season_draft`; finished → 409 `season_finished`. The 409 messages: "This season hasn't started yet." and "This season has finished."

- [ ] **Step 1: Write `announcements-write.test.ts`:**
  - `"admin posts to own active season"` → 201;
  - `"admin cannot post to community"` → 403;
  - `"admin cannot post to another season"` → 403;
  - `"leader and student cannot post"` → 403;
  - `"draft season refused season_draft"`;
  - `"finished season refused season_finished"`;
  - `"author edits, editedAt set, audience unchanged"` (a PATCH carrying `audience` → 400, since the schema is strict);
  - `"former admin cannot edit"`;
  - `"nobody edits a finished season's post, super included"` → 409 `season_finished`;
  - `"super deletes a finished season's post, its author cannot"`;
  - `"targets: super sees community and active seasons, admin sees own season, student sees none"`, where reach equals the count from `announcementRecipients`.
- [ ] **Step 2: Write `announcements-notify.test.ts`.** It waits for the background job with the helper `follow-ups-routes.test.ts` uses:
  - `"season post notifies live students, admins and leaders, not the author, super, mentor, dropped or finished-season people"`;
  - `"community post notifies a test student and the mentor but not the author"`, which checks only test users' rows;
  - `"turned-off announcement preference still writes the row"`;
  - `"edit sends nothing new"`;
  - `"notification target parses to announcement id"`, through `GET /api/v1/notifications`.
- [ ] **Step 3: Run** both suites and confirm they fail.
- [ ] **Step 4: Implement.** Write the audit line after each successful write.
- [ ] **Step 5: Run** both suites plus `notifications.test.ts`. Expected: PASS. Commit: `feat(backend): post, edit and delete News, with notifications`.

### Task 4: OpenAPI and backend docs

**Files:**
- Create: `apps/backend/src/docs/paths/announcements.ts`, registered in `src/docs/openapi.ts` beside `forumEventsPaths`
- Modify: the `NotificationType` / preferences components in `src/docs/components/enums-notifications-notes.ts`, plus `apps/backend/README.md` (an endpoint table row for each route)
- Test: the existing docs test (`src/__tests__/*openapi*`) must still pass. Add one assertion that `/api/v1/announcements/{id}` exists with get, patch and delete.

- [ ] **Step 1:** Add the assertion and run it to confirm it fails.
- [ ] **Step 2:** Write the paths (interfaces as in Task 2 and Task 3, error codes listed per operation).
- [ ] **Step 3:** Run `pnpm --filter @space/backend test:unit`. Expected: PASS. Commit: `docs(backend): announcements in OpenAPI`.

### Task 5: Navigation (News for everyone, More for the mentor)

**Files:**
- Modify: `packages/shared/src/navigation.ts`
  - `NavIconName` gains `"news"`.
  - `{ href: "/news", label: "News", icon: "news" }` goes second in every nav's `sidebar` (SUPER, ADMIN, LEADER, MENTOR, STUDENT, ALUMNI, STUDENT_BETWEEN).
  - MENTOR's `tabs` last entry becomes `{ href: "/more", label: "More", icon: "more" }`.
  - Header comment updated: Profile is a tab for alumni only.
- Modify: `packages/shared/src/__tests__/navigation.test.ts`
- Modify: `apps/mobile/src/design/icons/nav-icon.tsx` (`news` → lucide `Megaphone`)
- Create: `apps/mobile/app/(app)/news/index.tsx` (temporary placeholder `Screen`, replaced in Task 7) so the derived `PUSHED_NAV_ROUTE_NAMES` resolves. Add `"news"` to `DIRECTORY_ROUTE_HREFS`.
- Modify: `apps/mobile/src/screens/profile/*` (delete `account-actions.tsx` and its use on Profile for MENTOR; the mentor now reaches those through More). Fix the mobile tests that pinned the mentor's Profile tab (`grep -rn "MENTOR" src/__tests__ | grep -i profile`).

- [ ] **Step 1: Write the navigation tests.** They assert:
  - `"every nav lists News in More"`: for each of the seven navs, `/news` is in `sidebar` and not in `tabs`;
  - `"mentor tabs are Home, Community, Notes, Follow-ups, More"`;
  - `"Profile is a tab for alumni only"`.
- [ ] **Step 2: Run** them and confirm they fail.
- [ ] **Step 3: Implement.** Run `pnpm --filter @space/mobile typecheck` (it regenerates typed routes) and `pnpm --filter @space/mobile test`, then fix the snapshot or tab tests that pinned the old mentor bar. Never weaken a test's intent: update the expected bar to the new one.
- [ ] **Step 4: Run** `pnpm test:unit`. Expected: PASS. Commit: `feat: News in every More; the mentor gets More (owner, 2026-11-07)`.

### Task 6: Mobile data layer

**Files:**
- Create: `apps/mobile/src/hooks/use-announcements.ts`
- Modify: `apps/mobile/src/lib/query-keys.ts` (`announcements: { all, feed(), unread(), detail(id), targets() }`)
- Modify: `apps/mobile/src/lib/notification-route.ts` (`announcement` arm → `{ pathname: "/news/[id]", params: { id } }`, or `/news` when null)
- Test: `apps/mobile/src/__tests__/use-announcements.test.tsx`, plus a row in the notification-route test

**Interfaces (produces):**
- Reads: `useAnnouncementFeed()` (infinite, `nextCursor`), `useAnnouncementUnread()`, `useAnnouncement(id: number | null)` (`enabled: id !== null`), `useAnnouncementTargets(enabled: boolean)`.
- Writes: `useMarkAnnouncementRead()`, `useCreateAnnouncement()`, `useUpdateAnnouncement(id)`, `useDeleteAnnouncement()`. Every mutation invalidates `announcements.all` on success.
- Every response is parsed with the Task 1 schemas.
- `useAnnouncement` exposes a 404 as `{ removed: true }`, so the screen can say "This post was removed" (pattern: how `event/[id].tsx` tells not-found apart).

- [ ] **Step 1:** Write the tests. The feed parses and pages, a schema drift throws, `useAnnouncement` maps a 404 to removed, and `routeForTarget({ entityType: "announcement", entityId: 7 })` returns `/news/[id]` with `id: "7"`.
- [ ] **Step 2:** Run the tests and confirm they fail.
- [ ] **Step 3:** Implement the hooks, keys and route arm.
- [ ] **Step 4:** Run the tests and confirm they pass. Commit: `feat(mobile): News hooks`.

### Task 7: News list and post screens

**Files:**
- Modify: `apps/mobile/app/(app)/news/index.tsx` (list)
- Create: `apps/mobile/app/(app)/news/[id]/index.tsx` (post)
- Create: `apps/mobile/src/screens/news/post-card.tsx`, `audience-chip.tsx`, `linkified-text.tsx`, `post-view.tsx`, `delete-post-sheet.tsx`
- Modify: the detail route registry (`DETAIL_ROUTE_NAMES` source) with `news/[id]/index`, `news/new`, `news/[id]/edit`
- Modify: `apps/mobile/src/design/layout/more-menu.tsx` (the News row gets a trailing count pill from `useAnnouncementUnread`, labelled "News, N unread")
- Test: `apps/mobile/src/__tests__/news-list.test.tsx`, `news-post.test.tsx`, `linkified-text.test.tsx`, `more-news-row.test.tsx`

**Interfaces:**
- `linkify(text: string): ({ kind: "text"; value } | { kind: "link"; url })[]`. Only `https?://` URLs are matched, and trailing `.,)` is not part of a link. `LinkifiedText` renders links with `Linking.openURL` and `accessibilityRole="link"`, with no underline (owner: nothing underlined) and the `primary` colour.
- `AudienceChip({ audience, seasonTitle })` renders a `StatusChip` with the text "Everyone" or the season title.
- `PostCard`:
  - It is a whole-card `Pressable` with press dim.
  - It shows the chip, plus a dot and the word "New" when `!isRead`.
  - The title uses the `headline` variant, in the heavier weight when unread.
  - The excerpt is capped at 3 lines.
  - The meta line is "Name · 3 Nov", with "· Edited" when edited. The author falls back to "Former member".

- [ ] **Step 1: Write the tests:**
  - linkify cases (a plain URL, a URL with a trailing period, no `javascript:` link);
  - the list renders cards, shows "New" for unread, shows the New post button only when targets allow, and shows the empty state "No news yet";
  - the post marks itself read on mount and shows Edit and Delete only with `canEdit` / `canDelete`;
  - delete confirms in one sheet, then calls `dismissTo("/news")`;
  - a removed post shows "This post was removed";
  - the More row reads "News, 2 unread".
  - Use `renderWithProviders`.
- [ ] **Step 2:** Run the tests and confirm they fail.
- [ ] **Step 3: Implement.** Follow `app/(app)/events.tsx` and `event/[id].tsx` for structure, pull-to-refresh (`use-pull-refresh`) and `RouteSkeleton` / `RouteError` / `EmptyState`. Format dates with the app's existing date helper in the org zone.
- [ ] **Step 4:** Run the tests plus `design-consistency.test.ts` and `calm-motion.test.ts`. Expected: PASS. Commit: `feat(mobile): News list and post`.

### Task 8: Composer (new and edit)

**Files:**
- Create: `apps/mobile/app/(app)/news/new.tsx`, `apps/mobile/app/(app)/news/[id]/edit.tsx`
- Create: `apps/mobile/src/screens/news/post-form.tsx`, `confirm-post-sheet.tsx`
- Test: `apps/mobile/src/__tests__/news-compose.test.tsx`

**Behaviour:**
- **To:**
  - A Super gets a `SegmentedControl` "Everyone / A season". "A season" shows a picker of `targets.seasons`, preselected when there is exactly one.
  - An admin gets a read-only "To: {title}" row.
  - On Edit, To is always read-only.
- **Fields:** `Input` Title (max 120) and a multiline Message (`min-h`, grows, max 5000, with a counter shown past 4000). The form sits in `Screen` with a `footer={<SaveBar …/>}`.
- **Posting:** Post opens `ConfirmPostSheet`: "Post to {Everyone | title}?" with "This notifies {reach} people." Confirming creates the post, then calls `router.replace({ pathname: "/news/[id]", params: { id } })`. Save on Edit calls `router.back()`.
- **Errors:** a 409 shows its message inline, as a callout above the fields.
- **Unsaved words:** leaving with unsaved words uses the app's existing unsaved-changes guard if one exists (`grep -rn "beforeRemove\|unsaved" src`). Otherwise there's no guard, and this is noted in the commit.

- [ ] **Step 1: Write the tests:**
  - a Super sees the segmented control, and switching to A season shows the picker;
  - an admin sees "To: Test Season" and no segmented control;
  - the confirm sheet shows the reach;
  - a successful post calls `replace` with the new id;
  - edit shows To read-only and calls `back()` on save;
  - a 409 `season_finished` shows "This season has finished.".
  - Query fields with `getByLabelText` and errors via `accessibilityHint`.
- [ ] **Step 2:** Run the tests and confirm they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests and confirm they pass. Commit: `feat(mobile): post and edit News`.

### Task 9: Home card and notification settings

**Files:**
- Create: `apps/mobile/src/screens/news/news-home-card.tsx`
- Modify the six Homes:
  - `src/screens/staff-today/super-today.tsx`: under the overdue callout, above Seasons.
  - `src/screens/staff-today/admin-today.tsx`, `src/screens/leader-today/*` and `src/components/dashboard/MentorDashboard.tsx`: first in the content.
  - `src/screens/today/student-today.tsx`: after an open check-in, else first.
  - `src/components/dashboard/AlumniDashboard.tsx`: first.
- Modify: `src/components/NotificationPreferences.tsx` (a "New posts in News" switch for every role; the Super branch now lists only this switch instead of saying nothing can be turned off)
- Test: `apps/mobile/src/__tests__/news-home-card.test.tsx`, plus the existing notification-preferences test

**Interfaces:** `NewsHomeCard()` reads `useAnnouncementUnread()`.
- It renders `null` while loading, on error, or when `count === 0`. It never shows a skeleton or an error on Home.
- Otherwise it shows the latest's chip, title and two lines, plus "and N more" when `count > 1`. The card opens the post, and a `PillButton` "See all" opens `/news`.

- [ ] **Step 1:** Write the tests: hidden at 0, the latest plus "and 2 more" at 3, the press routes to `/news/[id]`, and Super Today renders the card under the overdue callout. In the preferences tests, a Super sees one switch, and a student sees seven.
- [ ] **Step 2:** Run the tests and confirm they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm --filter @space/mobile test`. Expected: PASS. Commit: `feat(mobile): News on Home and in notification settings`.

### Task 10: Catalogue, sweep, docs, final verification

**Files:**
- Modify: `apps/mobile/src/screens/design-catalogue/*` (PostCard read and unread, AudienceChip, NewsHomeCard with a fixed sample)
- Create: `apps/mobile/.maestro/sweep/super-scenarios/news.yaml` and a student flow. These shoot More → News, a post, New post with the keyboard open on Message, the confirm sheet (then cancel; flows never post), and Home with the card. A seeded post comes from a sweep seed script, if the sweep rig has one (`tools/ui-reference/`). Otherwise the flow shoots the empty states and the catalogue covers the cards.
- Modify: `CLAUDE.md`. Add a "News (owner, 2026-11-07)" section: who posts and reads, unread rules, notifications, finished seasons. Update the mentor nav line and the Profile/More lines ("MENTOR and alumni also have it as a tab" → alumni only; "on Profile for MENTOR" removed).

- [ ] **Step 1:** Run `pnpm lint`, `pnpm typecheck` and `pnpm test` (integration serially against local `space_test`). Expected: all green. Record the counts.
- [ ] **Step 2:** Run the `ui-sweep` skill for the News flows and look at every shot. Fix what it finds.
- [ ] **Step 3:** Commit: `feat: News sweep flows, catalogue and CLAUDE.md`.
