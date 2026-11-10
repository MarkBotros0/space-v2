# Settings and account (owner, 2026-11-06)

> Owner ruling, moved verbatim from the root `CLAUDE.md` (2026-11-10). Backend paths are under
> `apps/backend/src/`, mobile paths under `apps/mobile/src/`, unless written in full.

- **One Profile page** (owner, 2026-11-07): `/profile` is read-only (name, email, phone, date
  of birth, address; a student's or alumnus's university, faculty, graduation year and
  "School of N"), with no role badge and no season figures. Its Edit opens `/edit-profile`, one
  form with one Save: the `User` columns (PATCH /me, every role) and, for a student or a
  studying alumnus, the academic record (PATCH /me/profile); an alumnus's academic record is
  read-only. Profile is in no sidebar: More's name row and Home's avatar open it (a tab for
  alumni only). Notification settings open from the gear on Notifications.
- Home's bell opens `/notifications` and the avatar opens Profile: plain
  buttons, never dropdowns (owner, 2026-11-07). The theme lives on More, for every role.
- Notification settings show only the kinds a person can be sent: a student's six, a group
  leader's Submissions received and Low-attendance flags, a season admin's Low-attendance
  flags, a mentor's Follow-up reminders; every role also gets New announcements, so Super has a switch too. A note's
  follow-up flag notifies nobody (owner, 2026-11-07); the mentor's own follow-ups (see
  `docs/rules/mentor.md`) send the only `MENTOR_FOLLOWUP`. An assignment's reminder
  (`ASSIGNMENT_REMINDER`) has no switch of its own: the student's New assignments switch
  (`assignmentCreated`) turns both off.
- A student's page (staff view): the This season card shows Attendance, Assignments and
  Quizzes (`quizzesGiven/Taken/quizPct` on the staff engagement arm), never the composite
  score; its tabs run Submissions, Attendance, Notes, Seasons, the first open.
- No password form in the app: "Forgot password?" on sign-in is the only way
  to set one. No "Sign out everywhere".
- Sign out and Delete account (DELETE /me, a soft delete) live on More, for every role
  (the mentor has a More tab too).
- A student's graduation year is the university's (`StudentProfile.universityGraduationYear`,
  may be in the future — not `User.graduationYear`, which marks a JPCS alumnus).
