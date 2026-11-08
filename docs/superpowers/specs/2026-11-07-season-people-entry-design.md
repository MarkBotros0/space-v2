# Putting people into a season — design

Status: **approved by the owner 2026-11-07, with two answers:**
1. *"He can select a season to add its passing students."* The picker has an
   **Add the people who passed** chooser listing every finished season with
   passers; the season this one normally follows (below) is only the
   preselected suggestion.
2. *"Admin or super admin."* Whoever administers the season may override the
   required-program block, a season admin as well as a Super.

## Why

The owner set up the draft season GBV 2026 (1 group, 3 students, 2 leaders, no
admins) as Super and as an admin and found adding people confusing:

- "Add people" is a Manage tile, far from the People card it changes, and its
  hint ("Students, leaders and admins") promises more than it does: it only adds
  students.
- Nothing says there are two ways in: picking someone who already has an
  account, or inviting someone who has never signed in. "Invite new" is a small
  button in the header of the picker screen.
- The group form's "Pick students…" select looks like it could add anyone, said
  "No students found." with nobody to pick, and doesn't show who is already in
  which group.
- The usual case is never offered: the people who passed last season join the
  next one together.

## Goals

1. Two routes, named the same everywhere: **Select from community** (people who
   already have an account) and **Invite new** (someone with no account). Season
   admins and Supers can use both, while the season is a draft or running.
2. Both live in the People card, with the students. The **Add people Manage
   tile goes away.**
3. The group form only picks the group's members from people **already in this
   season**. Each row says whether that person is in a group and which one, and
   that picking moves them.
4. When filling a draft, the picker suggests **the people who passed the
   previous season** and ticks them. The admin can untick anyone or add more.
   Adding someone who didn't pass or didn't finish is allowed, and it is a
   deliberate step with the reason spelled out.
5. Helper text wherever someone could ask "who is where?".

## Non-goals

- No change to who may add people, the one-active-role rule, the lock order or
  the all-or-nothing add (`POST /seasons/:id/enrollments`).
- Leaders and admins keep their own pickers ("Add leader" in the group form,
  Manage admins). This work is about students.
- The group form never invites anyone and never enrols anyone into the season.
- Finished seasons stay read-only: no add buttons, no suggestion.
- No new animations.

## What the owner will see

### Season page, People card (`design/seasons/people-card.tsx`)

The card reads top to bottom: Admins (Super only), **Students**, Groups, Not in a group.

New **Students** level, between Admins and Groups, shown to whoever administers
a draft or running season:

```
[people icon]  Students (3)
               3 people are in GBV 2026. 1 isn't in a group yet.

[ Select from community ]   [ Invite new ]
Select from community: people who already have an account.
Invite new: someone who has never signed in. They get an email.
```

- Two buttons side by side, wrapping on a narrow phone at font 1.3 (`flex-wrap`).
  Select from community is `secondary`, Invite new is `secondary` too: neither is
  "the" answer. (My call; the next step card keeps the one primary button.)
- The summary line names counts in words: "Nobody is in GBV 2026 yet." / "3
  people are in GBV 2026. All are in a group." / "... 1 isn't in a group yet."
- Finished season: the level shows the count line only, no buttons.
- A viewer who can't administer sees no buttons (as today).

**Suggestion callout** inside the Students level, for a **draft** only, when the
season has a previous season (see Backend) with at least one person who passed
it and isn't in this season yet:

```
12 people passed GBV 2025.
Most seasons start with everyone who passed the last one.
[ Add the 12 who passed ]
```

It opens Select from community with those 12 ticked. It disappears once they
are all in (or once none of them can be added). It is a plain tinted block
(`bg-info-soft`, `rounded-control`), no animation.

The **Add people** Manage tile is removed. The other tiles are unchanged.

### Select from community (`/seasons/[code]/people`, `screens/season-people/`)

The existing picker, renamed and reorganised:

- Title "Select from community", subtitle "Add people to GBV 2026" (plus
  "Requires X" when set). The header's "Invite new" button stays, so someone who
  can't find a name has the other route one tap away; the empty search result
  says "Not here? They may not have an account yet." with an Invite new action.
- When there is a previous season, the list opens with a section on top:

  ```
  PASSED GBV 2025 · 12            (ticked)
  Banner: "We ticked the 12 people who passed GBV 2025. Untick anyone who isn't
  coming this season."
  ```

  then **Everyone else** (available people, not ticked), then the existing
  headed sections for people who can't be added as they stand.
- People who **didn't pass or dropped out of the previous season** get their own
  section, **"Didn't finish GBV 2025"**, never ticked. Each row says why in words
  ("Did not pass GBV 2025", "Dropped from GBV 2025"). Ticking one opens the
  existing confirm: "Add Mina even though they did not pass GBV 2025?" with
  **Add anyway**; the row then reads "Added by choice".
  - If the season has a `requiredProgram` and they are *blocked* by it, that is
    today's hard block, and only a Super's Override lets them in (unchanged).
- Coming from the suggestion callout preselects the "passed" section; opening
  the picker any other way on a **draft** does the same when the season has
  nobody yet; otherwise nothing is preselected (adding to a running season is a
  late addition, one by one). (My call.)
- "Select all available" keeps its meaning (available rows matching filters).
- Save bar: "Add 12 people". The rest (all or nothing, refusal handling) stays.

### Invite new (`/seasons/[code]/invite`)

Title "Invite new". Subtitle: "For someone who has never had an account. They
join GBV 2026 and get an email to set up their account. Already have an
account? Use Select from community." with a PillButton to it (`replace`, so
Back returns to the season page).

### The group form's members (`components/GroupForm.tsx`)

The Students field becomes **Members**, picked from the season's roster only.

- Field help: "Pick from the people already in GBV 2026. To add someone to the
  season, use Select from community or Invite new on the season page."
- The sheet replaces the generic `MultiSelect` with a members sheet that has
  sections, each row naming where the person is now:
  - **In this group** (ticked) — "In Group 1"
  - **Not in a group** — "Not in a group yet"
  - **In another group** — "In Group 2 · picking moves them here"
- A count under the field: "3 members. 1 person in the season isn't in a group."
- Empty roster: the sheet and the field say "Nobody is in GBV 2026 yet. Add
  people to the season first, from the season page." and offer a button back to
  the season page (`dismissTo` the season), instead of "No students found."
- Search by name stays; email moves off the row (names only, like the rest of
  the app; email remains searchable). (My call.)
- Saving still replaces the group's member list; the edit form keeps saying so.

Why the picker came up empty in the screenshot: the picker lists the season's
roster (`GET /seasons/:id/roster`, `seasonRosterMember`), which is correct, and
the season page two minutes later showed 3 students in the group. The likely
cause is that at 12:35 nobody was enrolled in GBV 2026 yet, and the form gave no
hint why. The builder confirms this by reproducing on the local database (a
draft with leaders and no enrolments) before changing anything; if the roster
is empty while people *are* enrolled, that is a bug to fix first and the spec is
revisited.

## Backend

Additive only. `GET /seasons/:id/people-candidates` gains:

- `season.previous: { id, code, title } | null` — the season this one follows:
  the most recently ended (`COMPLETED` or `ARCHIVED`, not deleted) season of
  `requiredProgram` if set, else of the same `program`, other than this one.
  Null for a community-wide season. (**Owner question 1.**)
- Per person `previous: "passed" | "not_passed" | "dropped" | null` — how their
  enrolment in that season ended (`result` PASSED / NOT_PASSED, WITHDRAWN →
  dropped); null if they weren't in it.

`program` is a required column, so every season can have a previous one.

The callout counts **people who passed the previous season, are listed by this
picker and are selectable now, and aren't in this season yet**. A passer of a
graduating season is an alumnus, so a regular season doesn't list them and the
count leaves them out; the banner then adds "N more graduated and are alumni
now." (My call.) The season page gets these numbers by loading the candidates
query itself, only for someone who administers a **draft** (one request,
about 200 rows, the same one the picker reuses from the cache). No field on the
season detail. (My call.) On a draft that already has people, the callout counts
and the picker ticks only the passers not in it yet.

No new write endpoint. "Add anyway" for someone who didn't pass, where no hard
block applies, needs no server change: they are `available` today, and the
add runs through the same seat checks as everyone else. Nothing extra is
recorded: it is an ordinary enrolment, the confirm is the deliberate step. (My
call.) The group form is already unreachable for a finished season (read-only);
the builder checks that and leaves it. Where the
hard block applies, Super's override is unchanged. (**Owner question 2.**)

Shared Zod schemas change in the same commit; the OpenAPI document too.

## Constraints (from CLAUDE.md)

- Mobile conventions: `Screen`, tokens, Text variants, `PillButton` for light
  actions, no new animation, reduced motion honoured, no `className` on
  `Animated.*`. Every file ≤ 400 lines: the members sheet goes in
  `src/screens/group-form/`, the Students level in its own file under
  `design/seasons/`.
- Navigation: callout and buttons `push`; Invite ↔ Select from community
  `replace`; the empty group-form link `dismissTo` the season.
- One active role, lock order and finished-season rules are untouched because no
  write path changes.
- Community-wide seasons: no previous-season suggestion; the Students/Alumni
  tabs stay.
- Tests: update `season-people`, `season-setup-entry`, the people card and group
  form tests, a backend integration test for `previous`. Design catalogue gets
  the Students level and the members sheet. Run `ui-sweep` on the season page,
  Select from community, Invite new and the group form.

## Owner answers (2026-11-07)

1. The admin selects the season whose passers to add; the last finished season
   of the required program, else of its own program, is preselected.
2. A season's admin or a Super may override a block.

## As built (where it differs from the text above)

- `people-candidates` carries `season.suggestedSourceId`, `season.sources`
  (finished seasons with passers, `passed` and `graduated` counts, newest end
  first) and per person `places` (each finished season and how it ended),
  instead of a single `previous`.
- `overridable` is true for every caller of that list; `overrideUserIds` and
  `POST /seasons/:id/enrollments/:userId/override` accept the season's admin.

## Calls I made (check these)

- Both route buttons are secondary, side by side.
- Preselection happens from the callout, or on a draft with nobody in it yet.
- Group form rows show names, not emails.
- The Students field in the group form is renamed Members.
- The callout leaves out passers who graduated, and says how many.
- "Add anyway" records nothing beyond the enrolment.
- The season page loads the candidates list for a draft's admins; no new field
  on the season detail.
