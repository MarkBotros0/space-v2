# News: season and community announcements

Date: 2026-11-07. Status: **draft for the owner's review.**

## Why

The owner wants a place to tell people things: "I can announce anything." The app has nothing like it.
The only "announce" in the code is a screen-reader announcement. Events (`JpcEvent`) are dated items
on the calendar, not messages. Notifications are each person's own inbox of things that happened to
them. Nothing lets a season's admin speak to their season, or a Super to the whole community.

## What the owner decided (2026-11-07)

- Announcements are called **News** in the app *(the name was my suggestion: it's short enough for
  the pill and the More row; the owner went with it)*. Every user has it.
- **A season announcement** is posted by **that season's admin** or **a Super**. It goes to that season's
  people.
- **A community announcement** is posted by **a Super only**. It goes to everyone.
- A post can be about anything: plain words, no fixed kinds.
- News lives **in More** for every role, not in the tab bar.
- **Every role gets a More tab**, the mentor included: their Profile tab becomes More, "match mentor
  with the others". More is where everyone manages their profile and notifications and signs out or
  deletes their account.
- A new post **sends a notification**: in the Notifications list and by push, with a switch in
  notification settings.

Everything else below is my call unless marked otherwise. The owner can overrule any of it.

## Goals, non-goals, anti-goals

Goals: one feed per person, holding every post they may read, newest first; posting that takes under
a minute; people notice a new post without hunting for it.

Non-goals (not in this build): images or files on a post (uploads are off; a CMS is coming), comments
or reactions, pinning, scheduled posts, saved drafts of a post, posting to one group, attaching an
event, email delivery (notifications never email, owner 2026-11-07), read receipts for the author.

Anti-goals: a post reaching someone who shouldn't read it (a former leader, another season, a
mentor seeing a season post); a Super being pinged for every season's posts; News feeling like a social
feed (no likes, counts or anything that animates in).

## Who reads what

**A community post** (`audience: COMMUNITY`): every account that can sign in, whatever its role or
season (students between seasons, alumni, mentors, staff, Supers).

**A season post** (`audience: SEASON`, `seasonId`): the season's people, worked out at read time from
live rows, never stored per person:

- Its **students**: `seasonParticipant` (`lib/queries/season-participants.ts`), so ACTIVE enrolments
  while the season is live, ACTIVE and COMPLETED once it is finished, never WITHDRAWN. That includes
  **alumni seated in a community-wide season**, since `seasonParticipant` already does.
- Its **admins and leaders**, through the scopes on their token (`seasonAdminIds`, `groupLeaderIds`,
  DRAFT or ACTIVE seasons only). Once the season ends they lose it with their scopes, the same as
  everything else in a finished season ("Former staff are cut off").
- **Supers**: every season's posts.
- **Not mentors.** "The mentor sees nothing season-shaped." Mentors read community posts only.

A student who finished the season keeps reading its posts. They read their own past season's work too
(read-only), and the posts are part of that season. A student who dropped (WITHDRAWN) stops.

## Who posts, edits and deletes

| | Community post | Season post |
|---|---|---|
| **Post** | Super | Super, or an admin of that season |
| **Edit** (title and body only) | Super | its author while they still admin that season, or a Super |
| **Delete** | Super | its author while they still admin that season, or a Super |

- **Only an ACTIVE season takes posts.** A DRAFT season is refused with `season_draft`: its roster isn't
  live, and a draft sends no notifications. A finished one is refused with `season_finished`.
- **A finished season's posts are read-only.** Nobody edits them. A Super may still delete one, to take
  down something posted by mistake (owner, 2026-11-07); its author may not.
- An edit sends no new notification. The post shows "Edited" next to its date.
- Delete is permanent (no soft delete), behind a confirm sheet. A notification that pointed at it now
  opens the detail screen, which says "This post was removed."
- Leaders don't post. A leader who needs to say something asks the admin.
- An audience or season can't be changed after posting. Delete and post again instead.

## Unread

*(My calls, after the builder check.)* "Unread" is narrower than "may read", so Home stays quiet:

- **Only posts addressed to you count**: community posts, and season posts of a season you are live in
  (the same people a post notifies). A Super reads every season's posts in News, but only community
  posts are ever unread for them; a season post shows no "New" for a Super.
- **No backlog**: a post counts only if it went up after the account was created and within the last
  30 days. A new student isn't greeted by "and 14 more".
- `announcementVisibilityFilter(user)` answers "may read"; `announcementUnreadFilter(user)` narrows it.
  `/unread`, the More count, the Home card and each item's `isRead` use the second.

## Notifications

- New `NotificationType` **`ANNOUNCEMENT`**, with a preference column `announcement Boolean @default(true)`.
  Following the existing rule in `lib/notifications.ts`, the in-app row is always written and the
  preference turns off push only.
- **Who is notified when a post goes up:**
  - Community post: every active account except the author.
  - Season post: the season's live people, meaning ACTIVE enrolments plus its serving admins and
    leaders, minus the author. **Supers aren't notified about season posts.** They read every season's
    posts in News, but a push for each would be noise.
- Title: the post's title. Body: the first ~120 characters of the post. Link: `/news/<id>`, plus one
  new row in `NOTIFICATION_LINK_PATTERNS` → `{ entityType: "announcement", entityId }` and the
  matching case in the mobile notification router.
- Sent in the background, after the post is saved (`createNotificationsBulk` → `runInBackground`
  push), so posting to a few hundred people answers at once.
- Notification settings get a **News** switch ("New posts in News") for **every** role. That means
  Super is no longer "told nothing there can be turned off"; the screen's Super branch changes too.

## Relation to events

They stay separate. An event is a date on the calendar (when, where, who may come); a post is a
message. A post can mention an event in its words. A later build can attach one. `JpcEvent` and its
`JpcVisibility` are untouched. News reuses the same reading of "a season's people", not the events
table.

## Data (one additive migration)

```prisma
enum AnnouncementAudience { COMMUNITY SEASON }

model Announcement {
  id        Int                  @id @default(autoincrement())
  audience  AnnouncementAudience
  seasonId  Int?                 // required when SEASON, null when COMMUNITY (checked in the route; a CHECK constraint too)
  title     String               // 1..120 after trim
  body      String               // 1..5000 after trim, plain text
  authorId  Int?                 // SetNull: the post outlives a deleted author ("Former member")
  createdAt DateTime             @default(now())
  updatedAt DateTime             @updatedAt
  editedAt  DateTime?            // set by PATCH only; drives "Edited"
  season    Season?              @relation(fields: [seasonId], references: [id], onDelete: Cascade)
  author    User?                @relation("AnnouncementAuthor", fields: [authorId], references: [id], onDelete: SetNull)
  reads     AnnouncementRead[]
  @@index([audience, createdAt])
  @@index([seasonId, createdAt])
}

model AnnouncementRead {
  announcementId Int
  userId         Int
  readAt         DateTime @default(now())
  announcement   Announcement @relation(fields: [announcementId], references: [id], onDelete: Cascade)
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([announcementId, userId])
  @@index([userId])
}
```

Plus `ANNOUNCEMENT` on `NotificationType` and `announcement` on `NotificationPreference`. The
migration is additive. A soft-deleted season's posts are hidden from everyone but Super, as with
events.

## API (`/api/v1/announcements`, router-wide `requireAuth`)

| Method and path | What it does |
|---|---|
| `GET /` | The caller's feed, newest first, cursor-paged (the events cursor pattern). Each item: `id, audience, seasonId, seasonTitle, title, excerpt` (first 280 chars), `authorName, createdAt, editedAt, isRead`. |
| `GET /unread` | `{ count, latest }`, where `latest` is the newest unread item or null. Feeds the Home card and the More row's count. |
| `GET /targets` | Where the caller may post: `{ community: boolean, seasons: [{ id, code, title, reach }] }`, plus `communityReach`. `reach` is how many people the post would notify. An empty list with `community: false` means the caller can't post. |
| `GET /:id` | The full post plus `canEdit, canDelete`. 404 `not_found` when it doesn't exist **or** the caller may not read it (no existence leak). |
| `POST /:id/read` | Marks it read (upsert, idempotent). The app calls it when the detail opens. |
| `POST /` | `{ audience, seasonId?, title, body }` → 201 with the post. Refusals: 400 `bad_request`, 403 `forbidden`, 409 `season_draft` / `season_finished`. Then notifies. |
| `PATCH /:id` | `{ title?, body? }`. 403 for a non-editor, 409 `season_finished`. Sets `editedAt`. |
| `DELETE /:id` | 204. 403 for a non-deleter. |

- Gates live in `lib/permissions/announcement.ts`: `canReadAnnouncement`, `canPostTo`,
  `canEditAnnouncement`, `canDeleteAnnouncement`. The feed's filter is one function,
  `announcementVisibilityFilter(user)` in `lib/queries/announcements.ts`, used by the feed, `/unread`
  and `GET /:id`, so there is one answer to "may this person read this".
- Zod contracts in `packages/shared/src/announcement.ts` (request and response schemas, limits as
  constants); the mobile hooks parse with them.
- Audit line on create, edit and delete (id, audience, seasonId). Never the body. No body in a Sentry
  event.
- Hand-written OpenAPI in `src/docs/paths/announcements.ts`, in the same commit as the routes.
- Post bodies are plain text: stored as typed, rendered as text, never as HTML.

## The app

**Navigation.** `/news` is a pushed route (in `PUSHED_NAV_ROUTE_NAMES`), and `/news/[id]`, `/news/new`
and `/news/[id]/edit` are detail routes (`DETAIL_ROUTE_NAMES`). `navFor` puts **News** (icon: megaphone)
in every role's `items`, near the top, so More lists it. The mentor's `tabs` become Home · Community ·
Notes · Follow-ups · More. Their Profile becomes the name row on More, as for other roles, and
`profile/account-actions.tsx` (More's contents on Profile for MENTOR) goes. Alumni keep their
Profile tab. CLAUDE.md's mentor nav line is updated to match.

**More row.** The News row shows the unread count as a small count pill, with the count in its
accessibility label ("News, 2 unread"). There's no badge on the More tab itself.

**News (`/news`).** Inside `Screen`, titled "News". Posters get a **New post** header button. The list
is one card per post (`rounded-group`, flat):

- A chip naming the audience, "Everyone" or the season's title.
- The title (`headline`).
- Up to three lines of excerpt.
- "Name · 3 Nov" and "· Edited" when edited.
- An unread post has a dot **and** the word "New" beside the chip (not colour alone) and a heavier
  title. Reading it clears both.

The whole card is the press target (press dims). It supports pull to refresh and loads more at the end.
States follow the shared primitives (`RouteSkeleton`, `RouteError` with retry, `EmptyState` "No news
yet"; posters' version adds "Post something for your season" with the button). A Super sees every
season's posts in one feed, each chip naming its season.

**A post (`/news/[id]`).** Title (`title` variant), the audience chip, then "Name · 3 Nov 2026, 18:40"
and "Edited". The body is selectable text, with `http(s)` links tappable (a small in-house
linkifier, no new dependency). For an editor or deleter, Edit and Delete are icon buttons beside the
title. Delete opens one confirm sheet; deleting goes `dismissTo("/news")` and shows a toast. Opening the post marks it
read. A missing or forbidden post shows "This post was removed" with a way back.

**New post (`/news/new`), Edit (`/news/[id]/edit`).** The form sits in `Screen`, with `SaveBar` in the
footer, riding the keyboard.

- **To**, for a Super: a segmented "Everyone / A season", then a picker of ACTIVE seasons. For an
  admin, a read-only "To: {season}" (one active role means an admin serves at most one ACTIVE season).
  Edit shows To read-only.
- **Title**: one line, labelled, up to 120 characters.
- **Message**: multiline, `min-h`, grows, up to 5000 characters, with a counter once past 4000.
- **Post** opens a confirm sheet: "Post to {Everyone | season}? This notifies {reach} people." Then
  it `replace`s to the new post (create → show the record). **Save** (edit) uses `back()`.

Leaving with unsaved words asks first, using the app's existing pattern if it has one.

**Home.** A **News card** goes on every role's Home whenever `GET /unread` has something: the newest
unread post's chip, title and two lines, plus "and N more" when there are more. A tap opens that post;
a See all `PillButton` opens `/news`. With nothing unread there's no card at all. It goes at the top
of Home, under anything that is time-critical right now: a student's open check-in leads, and
Super's overdue callout stays first. On Super Home (redesigned and landed,
`2026-11-07-super-home-overview-design.md`) the card goes directly under the overdue callout, above
Seasons *(my call)*; it shows only community posts there (see Unread).

**Design rules that apply** (from CLAUDE.md and the ui-ux-pro-max pass, over the owned kit). Reuse the
kit and add no new component beyond the post card and the linkifier.

- Status is said in words.
- Every press target is ≥ 44pt.
- Text is 4.5:1 and icons 3:1 in both themes.
- No fixed heights on text; title rows use `min-w-0 flex-1` with the chip `shrink-0`.
- Font scaling is capped where a fixed box holds text.
- Nothing animates in: no stagger, no count-up.
- The post card and the News card join the design catalogue.

## Tests

- **Backend integration**:
  - The reading matrix: student, finished student, dropped student, studying alumnus in a
    community-wide season, admin, leader, former admin, mentor and Super, each against community,
    live-season, finished-season and other-season posts.
  - Posting gates, including draft and finished refusals.
  - Edit and delete rules.
  - Who gets notified, and that Supers aren't for season posts.
  - The preference turning off push but not the inbox row.
  - Read and unread counts.
  - 404 with no existence leak.
- **Shared**: schema limits, `navFor` (News for every role, the mentor's More tab).
- **Mobile**: the More row and its count, the Home card's presence and absence, the composer's To
  states per role, the confirm sheet, the delete flow (`dismissTo`), the removed-post state, and
  the notification link routing.
- **UI sweep**: a flow for News, a post, the composer with the keyboard open, and the Home card, at
  360dp and 375dp, font 1.0 and 1.3, light and dark. Sweep flows never post.

## Left to the builder

File splits (400-line cap), hook and query-key names, the exact excerpt cut, the cursor shape,
whether `/unread` piggybacks on an existing Home request, the icon glyph, and how the reach count is
computed (it must match who the post actually notifies).
