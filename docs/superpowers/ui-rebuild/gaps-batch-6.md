# Batch 6 (mentor and alumni) — remaining differences from v1

Every screen is source-matched and capture-pending (plan 06, "Capture status").

## Mentor dashboard
- v1's title, subtitle, events card, and two cards (warning-icon title with an "All students" ghost button; info-icon "Recent activity"). The first card is titled "At risk", not "Flagged for follow-up" (R48), and shows "N of M" because the list is capped; it shares Reports' cache (D17).
- Recent activity is the server's merged feed (D18), not v1's 4 attendance + 4 submissions. Rows link to the student, or to the submission when there is one.
- No quick-link tiles: Students, Notes, Reports and Settings are tabs or sidebar entries here.

## Alumni dashboard
- v1's welcome card with eyebrow, heading, paragraph and the outline "View my history" button. The history icon sits inside the button.

## Notes (My notes)
- v1's header and one card per note. Dropped: the composer (notes are written from a student's page) and the student filter (no endpoint filters the author's own notes by student). The visibility badge says it in words, not v1's raw enum (R36). The count reads "N+" while more pages remain.

## Profile
- Alumni: v1's read-only card of Name, Email, Status (success badge), University, and the "contact the JPC team" line.
- Mentor and other non-student roles: v2-only account card (initials avatar, role badge, Settings, Sign out), drawn with the student's identity-card styling.

## Alumni Events
- v1's "Events" page: title, subtitle and the upcoming-events card (server window, capped at 4 like the dashboard). The old pinned-season calendar for alumni is gone; alumni have no season in v1 either.

## Mentor Reports and calendar
- Reports is the shared batch-4 screen, already in v1's layout for a mentor. Its charts (`src/components/charts/*`) and band colours still use the legacy theme; they are v2's own drawings (see gaps-batch-4) and stay until the legacy theme is retired.
- The mentor has no calendar (spec 03 §9); the route shows v1-styled "isn't available" state.

## Cleanup
- `DashboardFrame` and the legacy calendar list/grid components are deleted; `dashboard.tsx`'s loading frame and `calendar.tsx` no longer import `src/ui` or `src/theme`.

## Captures owed (add to backlog section 14 once #23 lands)

| Screen | Role | Check |
|---|---|---|
| Dashboard | MENTOR | at-risk rows with badges, activity rows |
| Notes | MENTOR, LEADER, ADMIN | note cards, follow-up badge, Load more |
| Dashboard | ALUMNI | welcome card, history button |
| Events | ALUMNI | title, upcoming-events card |
| Profile | ALUMNI | record card with status badge |
| Profile | MENTOR | account card, Settings, Sign out |
