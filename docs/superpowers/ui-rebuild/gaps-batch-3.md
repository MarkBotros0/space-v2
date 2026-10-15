# Batch 3 (leader) — remaining differences from v1

Every difference left between the v1 leader pages and the rebuilt v2 screens, with its reason: a platform detail, a ruling (B3-n in `docs/superpowers/plans/2026-10-15-ui-plan-03-leader.md`, or B2-n from batch 2), or a data gap. Captures: `~/projects/JPC/.v2-captures/batch-3/` (devbox only).

## Dashboard
- Attendance figures differ (v1 ring 13% / rows 0–17%; v2 0%): v2 reads the server's engagement figures (spec 19 D5, C4), which count attendance differently from v1's page arithmetic. Data, not layout.
- The ring is always teal, and row percentages are red because every listed row is at risk (D2: no 70/85 tiers). B3-4.
- The card lists only at-risk students ("Your students at risk") with "N/M submitted" instead of every student with "N pending" (D6, D4). B3-4.
- The callout reads "{n} students at risk" (the v2 rule: below 60%, attendance or submissions) instead of "Students below 70% attendance". B3-4.
- The events card shows its empty state where v1 renders nothing (D19, B2-9).
- "Session 12 of 12" / "Session 12/12" instead of "Week …" (D12).
- No season: v2 shows "No season yet"; v1 renders the dashboard with zeros. B3-4.
- The DEV user-switcher icon in v1's top bar is a dev tool, not ported.

## Groups
- Members come from one `GET /groups/:id` per group (the list rows carry only a count; adding members to the list contract is a backend change). B3-5.
- Groups of ACTIVE seasons come first; groups of other seasons follow under a "Past seasons" eyebrow, but only when both kinds exist (spec 05 §9). v1 sorts all groups by name together. B3-5.
- Group cards are not pressable (v1), so the leader no longer reaches `/group/[id]`; that screen is the admin page (batch 4).
- The STUDENT branch of `/groups` (deep link only, no v1 page) keeps its pre-rebuild rendering until the batch-6 cleanup.

## Calendar
- Sessions are read per led season (`GET /seasons/:id/sessions` for each `seasonId` in the leader's groups) and merged on the device. `GET /sessions` is still capped at 8 weeks / 120 days, because the D-16.7 parity amendment (unbounded when no dates are given) was never built in the backend. B3-6.
- "Today" in the agenda is the device date, as for the student (batch-2 note).
- No visible difference in the light and dark captures.

## More, Settings, Notifications
- More lists My notes, Quizzes, Notifications and Settings (v1: Quizzes, Settings), from the shared `navFor` (B2-5, spec 09 D14). B3-7.
- Settings: six rows (+ "Quiz graded"); low-attendance copy "misses two in a row" (v1 "3"); the D4 inbox explainer; Push and Security sections (B2-6 and the batch-2 gap note).
- Notifications: "{n} unread" without "of {total}" (no total in the API), and the v2 "Mark all read" button (B2-7).

## Submissions
- The list shows every SUBMITTED, REVIEWED and RETURNED row (v1) via `pendingOnly=false`. B3-8.
- The second line shows the group only: queue items carry no `studentEmail` (contract change needed), and a student with no name shows "Student" instead of v1's email fallback.
- Totals can differ from v1 (17 vs 19 on the reference data): v2 counts enrolment-scoped rows server-side (spec 08 D12, C9).
- Dates are formatted from the instant in the device zone (no org fields on queue items, X13).
- "Load more" paging (D12) has no v1 counterpart.
- Shared fix: `DataTable` keeps each "·" with the cell before it, so a wrapped meta row ends a line with the separator, as in v1.

## Submission review
- The feedback editor is a plain Textarea without v1's rich-text toolbar: feedback travels as plain text (C11, B2-16). The backend also stores feedback raw rather than through `plainTextToHtml` (backend data-gap table). B3-9.
- "Return for revision" (outline, beside the primary) is v2's (spec 08 D11). B3-9.
- After a verdict the reviewer stays on the page (v1), with a toast "Review saved." / "Returned for revision." (v2 feedback).
- The attachments note reads "Files can't be opened in the app yet." (v1's line points at TODO.md; the mobile app has no file-download hook yet).
- The group name comes from the enrolment (C9), so it can differ from v1's for a student who changed groups (e.g. "Delta" vs v1 "Alpha").
- Badge dates are formatted from instants in the device zone (X13).

## Quizzes
- Graded counts come from the server (C4/D10): ONLINE quizzes count graded attempts, so a row can read "1/8 graded · Partial" where v1 always showed "0/8 · Pending".
- v1's order (session date, newest first) is applied on the device because the API orders by id (backend data-gap table). B3-10.
- Session dates come from an instant in the device zone (X13).
- Arabic titles truncate at the line end the platform picks (RN `numberOfLines`); v1's CSS ellipsis can fall on the other side for RTL text.
- Admin and super keep the pre-rebuild staff list until batch 4/5.
