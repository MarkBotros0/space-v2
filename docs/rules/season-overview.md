# A season's overview (owner, 2026-11-07)

> Owner ruling, moved verbatim from the root `CLAUDE.md` (2026-11-10). Backend paths are under
> `apps/backend/src/`, mobile paths under `apps/mobile/src/`, unless written in full.

`/seasons/[code]` is one page: the summary, the next step, then one **People** card
(`screens/season/people-card.tsx`): Admins (Super only), then each group with its leaders and up to
six of its students as pills, then "Not in a group". New group, Move students (the roster) and Manage
admins (`/seasons/[code]/admins`) live inside it; there is no separate Groups or Admins section. The
Manage tiles name what they open, never "Manage ...": Quizzes and Assignments (the staff lists with
`?seasonId`), then Sessions (`/seasons/[code]/sessions`) (owner, 2026-11-13: Sessions swapped with Quizzes), Passing (`/seasons/[code]/passing`: who is
on track, the pass criteria; admins, supers and the season's leaders, never a mentor), End season,
Results (current admins and supers; a former admin uses the Reports link). Edit
and Duplicate are icon buttons beside the name. There is no figures card (students, groups,
sessions): the People card and the tiles already give those counts (owner, 2026-11-13). Quizzes, Assignments and Sessions
each show how many the season has ("4 quizzes"), or "None yet" (owner, 2026-11-13); quizzes count drafts,
assignments leave out deleted ones. **A finished season is read-only**: people, groups
and sessions are read, nothing is added, moved or marked; a note offers "Duplicate as a draft".
Finished seasons still never reopen.

**Putting people into a season** (owner, 2026-11-07; spec
`docs/superpowers/specs/2026-11-07-season-people-entry-design.md`). There is no Add people tile: the
People card's Students level has the two ways in, **Community** (owner 2026-11-08; the button and links say
Community, the picker screen is titled Select from community; `/seasons/[code]/people`, people with an account) and **Invite new** (`/seasons/[code]/invite`); each
screen links to the other with `replace`. The picker's **Add the people who passed** chooser ticks a
finished season's passers (`people-candidates` `season.sources`, per person `places`); the season this
one normally follows (`suggestedSourceId`: the last finished season of `requiredProgram`, else of its
own `program`) is preselected on an empty draft, from `?from=`, and suggested on a draft's People card.
Someone who didn't pass or dropped out of the chosen season is ticked only after "Add anyway" ("Added
by choice"). A season's admin or a Super may override a required-program block. The group form's
Members pick only from the season's roster (`screens/group-form/`), each row saying where the person is
now; an empty roster points back to the season page.
