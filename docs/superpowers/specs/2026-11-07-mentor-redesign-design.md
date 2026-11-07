# Mentor redesign — design

Owner answers gathered 2026-11-07. Calls marked **(my call)** are mine, open to correction.

## Why

A mentor walks alongside students across seasons, not inside one. Today's mentor app is
built from season pieces (at-risk from the season engagement report, a Reports tab,
season figures on a student's page) that answer a season admin's questions, not a mentor's.
The mentor's questions are: who needs me, whom have I promised to come back to, and what
has been written about this person.

## Goals

- The mentor sees **nothing season-related**: no This season card, no at-risk, no
  seasons list, no Reports.
- The mentor sees, per student: the details, **notes** (author, date, body), and
  **attendance history across all seasons**.
- **Follow-ups**: a mentor flags a student to come back to. After **7 days** a reminder
  goes **once**, to **that mentor only**. The flag stays until the mentor marks it done.
- **Absent lately** = missed the **last 2 sessions in a row** they were expected at.

## Non-goals

- No change to how other roles see mentors' notes (visibility rules stay).
- No mentor writes to seasons, groups, attendance or submissions.
- A note's own follow-up flag (`EngagementNote.followUpFlagged`) stays as it is; it is
  not the new follow-up.

## Navigation

MENTOR tabs: **Home · Students · Notes · Follow-ups · Profile**. Reports leaves the
mentor's nav (and `/reports` refuses a mentor in the app; the API keeps its reads for now,
**(my call)**: removing API access is a separate, reversible step).

## Home

Four number cards, each opening its list:

| Card | Number | Opens |
|---|---|---|
| Follow-ups due | my open follow-ups at or past 7 days | Follow-ups, Due first |
| Absent lately | students who missed their last 2 sessions in a row | Students, filtered "Absent lately" |
| Notes this week | notes visible to me written in the last 7 days | Notes, "This week" |
| Students | everyone I can see | Students |

Below the cards: the upcoming events card every Home keeps. The recent activity feed
and at-risk list go **(my call)**: they are season views.

## Follow-ups

- **Data:** new table `MentorFollowUp` (additive migration): `id`, `mentorUserId`,
  `studentUserId`, `reason` (optional, up to 500 chars), `createdAt`, `dueAt`
  (createdAt + 7 days), `remindedAt` (null until the reminder goes), `doneAt` (null
  while open). At most **one open follow-up per mentor and student**: flagging again
  while one is open answers 409 `already_following_up`.
- **API:** `GET /follow-ups` (open first, then done in the last 30 days),
  `POST /students/:id/follow-ups` `{ reason? }`, `POST /follow-ups/:id/done`. MENTOR
  only; a mentor touches only their own.
- **The reminder:** a daily Vercel Cron calls `GET /internal/follow-ups/remind` (Vercel Cron sends GET) with
  `CRON_SECRET`; it sends one `MENTOR_FOLLOWUP` notification (in-app, and push where
  it is on) for each open follow-up past `dueAt` with `remindedAt` null, and stamps
  `remindedAt` in the same transaction, so it never sends twice. Hobby allows one run a
  day, so a reminder lands within a day of the 7 days. **(my call)**; the owner sets
  `CRON_SECRET` on Vercel. Until then nothing is sent, but Home still counts it as due.
- **Screen:** `/follow-ups` tab: Due, then Waiting (not yet 7 days, "due on {date}"),
  then Done recently. Each row: the student, the reason, when flagged; Mark done.
- The notification setting "Mentor follow-ups" comes back for the mentor only (a
  mentor's one switchable kind).

## A student's page, as the mentor sees it

- Header: name. Then "Remind me to follow up" (or the open follow-up's date with Mark done).
- Details card (phone calls, as today).
- Sections: **Notes** (first, open) · **Attendance**: every season, newest first,
  grouped by season with that season's title as a header (not a season figure, just
  where the session was).
- No This season card, no engagement summary, no Seasons tab, no Submissions tab
  **(my call)**: submissions are season work.

## Absent lately

For each student: their most recent 2 finished sessions where they had a mark (any season,
any status). Both ABSENT → absent lately. A late mark breaks the run (there is no excused status)
**(my call)**. Computed on the server for the mentor's list and Home count
(`GET /students?absentLately=1`, mentor only); fewer than 2 marked sessions → never.

## Notes tab

The existing list of notes visible to the mentor, with a "This week" filter (Home's card
opens it on). Each row: student, author, date, body. Writing a note stays on the
student's page.

## Out of scope / left to the builder

- Exact copy beyond what is above, row layouts (follow the kit: GroupedList, ListRow,
  StatTile, PillButton).
- Whether Students' filter is a FilterButton sheet (yes: the app's pattern) with Absent
  lately as one of its choices.

## Testing

Backend integration: follow-up create/duplicate/done/ownership; the reminder sends once
and only after 7 days; absent-lately rules (two absences, a late breaking it, fewer than
two marks). Mobile: nav for MENTOR, Home cards' numbers and targets, follow-ups screen
states, student page without season parts.
