# Polls in announcements

Date: 2026-11-09. Status: **draft for the owner's review.**

## Why

Announcements let a season's admin or a Super tell people things. The owner wants them to be able
to *ask* too ("support polls in the announcements"): a question to the season or the community
with answers to pick, and the counts coming back to the poster.

## What the owner decided (2026-11-09)

- **A poll sits under a post.** A post is still its message (the question goes in the message); the
  poster may add one poll below it. A post without a poll is unchanged.
- **The poster chooses** per poll whether people pick **one answer or several**.
- **Results:** a reader sees the counts **after they vote**, or once the poll is closed. The poster
  sees them always.
- **Names are visible to the poster** (and Supers): they can see who picked each option. Readers
  see counts only, never names.
- **Closing:** a poll is open until the poster closes it **by hand**. While it is open, people
  **may change their vote**.
- **Editing: anything, with warnings.** After votes are in, the poster may still rename, add and
  remove options, change one/several, or remove the poll, but the app warns them first about the
  votes it affects.
- **Closing notifies nobody.** The post just reads "Closed" with the final results.
- **No extra nudge.** A poll is a post like any other: one push when posted ("New announcement"),
  the unread count, Home's announcements row. Nothing new keeps an unvoted poll in front of people.

Everything else below is my call unless marked otherwise. The owner can overrule any of it.

## Goals, non-goals, anti-goals

Goals: adding a poll to a post takes seconds; voting is one or two taps; the poster can read the
result and who answered at a glance.

Non-goals: polls without a message, more than one poll per post, end dates or scheduled closing,
anonymous polls, free-text "Other" answers, ranked choice, results exported to a sheet, reminders
to people who haven't voted, a "who hasn't voted" list.

Anti-goals: a reader seeing who voted for what; a vote counted against an option it wasn't cast for
without the poster being told; results that a reader can see before voting (it would sway them);
anything that animates like a game (bars growing, confetti, counting up).

## Rules (backend)

**Who votes.** Anyone who may read the post (`announcementVisibilityFilter`), with one exception
*(my call)*: a Super does not vote on a **season** post, since they read it as an overseer, not as
its audience (it matches who it notifies). That holds even for a season poll the Super wrote. A
Super votes on a community post; an admin votes on their own season poll like anyone else. Mentors read community posts only, so they vote on those.

**When votes are taken.** Only while the poll is open and the post's season (if any) is ACTIVE. A
finished season's poll reads as closed and nothing on it changes, a Super included, matching "nobody
edits a finished season's post". Deleting the post deletes its poll and votes.

**Who sees results and names.** The **managers** of a poll are exactly who may edit the post
(`canEditAnnouncement`: a Super, or the author while still admin of that season) *(my call: an
author who has stopped being admin no longer sees names)*. A finished season's poll: Supers see
names; everyone who could read it sees counts. Counts are shown to a reader whose vote is on the
poll now, to managers always, and to everyone once the poll is closed. Someone whose vote an edit
removed (several → one) sees the choices again until they vote *(my call)*.

**Voting.** One request replaces the caller's whole vote: `PUT /announcements/:id/poll/vote` with
`{ version: number, optionIds: number[] }`. One id for a one-answer poll, one or more for several.
There is no withdrawing a vote, only changing it *(my call: an empty list is `400`)*. A closed poll is
`409 poll_closed`; a finished season is `409 season_finished`.

**The poll's version.** `AnnouncementPoll.version` starts at 1 and goes up on every poll edit
(rename, add, remove, one/several). The app sends the version it showed; any mismatch is `409
poll_changed` and nothing is saved, so the app refetches and shows the new wording. This also covers a
rename made while a reader had the screen open, so nobody's vote lands on wording they never saw.
With the version matching, an option id not on the poll, or two ids on a one-answer poll, is `400`.
Close and reopen don't change the version.

**Whose votes count.** The vote rows as they are *(my call)*: someone who later loses access to the post
(dropped from the season, out of their seat) keeps their vote in the counts and in the voters list. A
soft-deleted account (`DELETE /me`) likewise, named "Former member".

**Closing and reopening.** Managers `POST /:id/poll/close` and `/:id/poll/reopen` *(reopening is my
call; "anything" covered it)*. Neither notifies anyone nor sets the post's "Edited".

**Who picked what.** Managers `GET /:id/poll/voters`: per option, the voters' names (a deleted
account reads "Former member"), newest last. Everyone else gets 404 (as for a post they can't read,
so a reader doesn't learn the route exists). No paging *(my call: the whole community is a few hundred
people)*.

**Editing the poll.** Through the existing `PATCH /announcements/:id`, which grows an optional `poll`:

- absent: the poll is left alone (so editing just the message never touches votes);
- `null`: remove the poll and every vote;
- `{ allowsMultiple, options: [{ id?, label }] }`: the whole new poll. An option sent **with its id**
  keeps its votes under the new wording; an existing option missing from the list is removed with
  its votes; an option without an id is new. Order is the list's order.
- Changing several → one: anyone who had picked more than one option loses their vote (they may vote
  again); anyone who picked exactly one keeps it *(my call)*.

Anything that would delete votes (removing an option that has votes, removing the poll, several → one
with people affected) needs `confirmVoteLoss: true` in the body; without it the PATCH answers `409
poll_votes_lost` with `{ votes: N }` and changes nothing. This catches votes cast between the poster
opening the form and saving it. A post can gain a poll through edit too. Renaming alone needs no
confirmation, but the app still warns (below). The edit still sends no notification.

**Limits.** 2 to 10 options; each label trimmed, 1 to 150 characters, unique ignoring case; plain
text. Validated in the shared Zod schema, used by both the API and the form.

**Concurrency.** A vote, an edit and a close each run in one transaction that locks the poll row
(`SELECT … FOR UPDATE`), so a vote can't land on an option an edit is removing, and the
vote-loss count the 409 reports is the true one.

**Logs.** Poll edits, close and reopen are audited under the post's id (`announcement.poll.*`). A
vote is not audited. Neither option text nor names go into a log or a Sentry event.

## Data (one additive migration)

- `AnnouncementPoll`: `announcementId` (unique, cascade on the post), `allowsMultiple`, `version`
  (int, default 1), `closedAt`, `closedById`, `createdAt`.
- `AnnouncementPollOption`: `id`, `pollId` (cascade), `label`, `position`.
- `AnnouncementPollVote`: `optionId` (cascade), `pollId` (for counting one person's vote and for the
  lock), `userId` (cascade on a hard-deleted user), `createdAt`; primary key `(optionId, userId)`,
  index `(pollId, userId)`.

## Contract (`packages/shared/src/announcement.ts`)

- List item gains `hasPoll: boolean` and `pollClosed: boolean | null`, for the feed's "Poll" chip.
- Detail gains `poll: null | { version, allowsMultiple, closed, canVote, canManage, myOptionIds,
  voterCount, multiPickVoters: number | null, options: [{ id, label, votes: number | null }] }`.
  `multiPickVoters` (people who picked more than one) is for managers only, so the warning sheet
  can say how many a several → one change affects. `votes` is null when the viewer may not see
  counts yet; `voterCount` (people, not votes) likewise.
- Create and update request schemas gain the `poll` field above; update gains `confirmVoteLoss`.
- New: vote request, voters response.
- `openapi.ts` documents all of it in the same commit.

## The app

**The post (`post-view.tsx`, a new `screens/announcements/poll/` folder).** Below the message, one
`rounded-group` card:

- A header line: "Poll · Pick one" or "Poll · Pick any", and "Closed" as a word when it is.
- **Before voting:** each option is a full-width row (min 44pt) with a radio or checkbox, then a
  **Vote** button (`self-start`), disabled until something is picked. *(My call: a Vote button even
  for one answer, so a stray tap never casts a vote.)*
- **After voting / closed / manager:** each option shows its label, a static bar in the primary
  tone, the count and the percentage *(of voters, so several-answer polls can add up past 100%)*;
  the option(s) you picked say "Your vote" in words beside a check, never colour alone. A footer
  reads "N people voted". While open: a **Change vote** pill brings the choices back with yours
  ticked. Bars and numbers appear at once: no grow or count-up (calm motion).
- **A manager who may vote but hasn't** sees the results, with a **Vote** pill that brings the
  choices up (as Change vote does). A Super on a season poll sees results only.
- **Managers** also get **See who voted** (a pill), opening a sheet grouped by option with names, and
  **Close poll** / **Reopen poll** pills. Closing asks for nothing *(my call: it's undone by Reopen)*.
- Screen readers: each result row reads "Option, 12 votes, 40 percent, your vote".

**The composer (`post-form.tsx`).** An **Add a poll** pill under the message. It opens a section:
option fields (start with two, "Add option" up to ten, a remove button on each beyond two), a switch
"Let people pick more than one", and **Remove poll**. The option fields scroll above the keyboard
like the rest of the form (`Screen` + `SaveBar` footer). Errors sit under the field they belong to.
The confirm-post sheet mentions "with a poll" in its summary.

**Editing with votes in (the warnings).** Edit has no confirm sheet today; it gains one, shown only
when the edit touches a poll that has votes. On Save, the sheet that confirms changes its words *(never a second modal, per the iOS rule)*:
- renamed options: "Votes stay with the new wording: ‘Sat’ → ‘Saturday’ (12 votes)";
- removed options: "Removing ‘Friday’ deletes its 5 votes";
- several → one: "7 people who picked more than one answer will need to vote again";
- removing the poll: "Removes the poll and its 24 votes".
If the server answers `poll_votes_lost` (votes came in meanwhile), the sheet shows the new count and
asks again.

**The feed and Home.** A post card with a poll shows a "Poll" chip beside the audience chip (and
"Poll · Closed" once closed). Home's announcements row is unchanged.

**Catalogue and sweep.** The catalogue's `announcements` section gains the poll card in its states
(to vote, voted one/several, closed, manager with names). `seed-sweep/announcements.ts` adds a season
post with an open poll; the student flow `s57` shows it before voting (sweep flows never save, so the
voted state is shown from a seeded vote on another student) and the super flow `s56` opens the voters
sheet and the composer with a poll.

## Tests

- Backend integration: vote rules (who, one vs several, change, withdraw, closed, finished season, a
  Super on a season post, `poll_changed`), result visibility per viewer, voters list gate, every edit
  case including `poll_votes_lost` and several → one, close/reopen permissions, delete cascades.
- Shared: schema limits (2–10, length, duplicates).
- Mobile: poll card states and labels, composer validation, the warning sheet's wording, the
  `poll_votes_lost` retry.
- `poll_changed` on a stale version (rename, remove, several → one) for the vote.
- The UI sweep on the post, the composer with a poll and the voters sheet.

## Left to the builder

File splits (400-line rule), hook names and query keys (`announcements.detail` refetches after a
vote), exact copy beyond what's quoted, and the Prisma relation names.
