# The mentor (owner, 2026-11-07)

> Owner ruling, moved verbatim from the root `CLAUDE.md` (2026-11-10). Backend paths are under
> `apps/backend/src/`, mobile paths under `apps/mobile/src/`, unless written in full.

Spec: `docs/superpowers/specs/2026-11-07-mentor-redesign-design.md`. A mentor walks alongside
students across seasons, so **the mentor sees nothing season-shaped**: no This season card, no
at-risk, no seasons, no groups, no Reports (`/reports` refuses them in the app; it is a pushed
route now, a tab for no role).
- **Nav:** Home · Community (`/students`; their people are **members**, students and alumni alike, never "students" in the copy) · Notes · Follow-ups · More (their profile is More's name row).
- **Home** (`MentorDashboard`): up to four numbers from `GET /me/mentor-summary`, each the total of
  the list it opens: Follow-ups due (`/follow-ups`) and Absent lately (`/students?absent=1`), shown
  only above zero (both zero is one "All caught up" row), Notes this week (`/notes?range=week`),
  Members. Then recent notes and events.
- **Follow-ups** (`MentorFollowUp`): flagged from the student's page ("Remind me to follow up",
  optional reason), due 7 days later, one open per mentor and student (409
  `already_following_up`). The backend's own scheduler
  (`lib/scheduler/`, run by incoming requests) sends it around 9:00 AM Cairo on the due day, at the
  first request after that.
  Each due follow-up is claimed by stamping `remindedAt`, then one `MENTOR_FOLLOWUP` goes to that
  mentor alone. It stays open until Mark done.
- **Absent lately:** the last two marked sessions that have started, any season, both ABSENT
  (LATE breaks it; fewer than two marks never counts): `GET /students?absentLately=1`, MENTOR only.
- **A student's page** (`MentorStudentPage`): no group under the name; Follow up; details; Notes
  (first) and Attendance grouped by season name. No figures, Submissions or Seasons.
- **Students** rows show university and faculty, never a season or group; the filter offers Who
  (Everyone / Absent lately) and sorts by name or university. **Notes** lists every note they may
  read (`/me/visible-notes`, `withinDays=7` for This week), with the author instead of a season.
