# Batch 2 (student) — remaining differences from v1

Compared on the `jpc-ui` emulator (375dp) against v1's 375px captures, light
and dark. Rulings (B2-n) are in `docs/superpowers/plans/2026-10-15-ui-plan-02-student.md`.
Foundation-level differences (no focus ring, no backdrop blur, glyph hinting,
status bar) are in `gaps-foundations.md` and not repeated.

## Login, forgot password, reset password

| Difference | Reason |
|---|---|
| Extra "I have an invite code" link under "Forgot password?". | B2-2 — v2-only invite flow. |
| "reset code" wording, TTL sentence, "I have a reset code" / "Request a new code" / "Back to sign in" links, confirm-password field, "Password updated" done card. | B2-3 — v2's pasted-code flow (Plan 10). |
| Send / Set buttons disabled until the fields are filled (v1 relies on `required`). | v2 behaviour kept. |
| Per-field validation messages instead of v1's single "Please enter a valid email and password.". | B2-1. |
| Card is vertically centred in the scroll area, a few px higher than v1 (status bar). | Platform. |

## Check-in link

| Difference | Reason |
|---|---|
| A confirm step (teal QR circle, "Check in to this session?", "Check in" button) before the write. | B2-4 — spec 04 D3/C6: no write on open. |
| "Already checked in" message doesn't name the recorded status ("(late)"). | Data gap — the refusal carries no `currentStatus`. |
| Invalid code inside the app reads "This check-in code is not valid." (link screen keeps "link"). | `checkInCopy` is shared with in-app scans. |

## More

| Difference | Reason |
|---|---|
| Two more rows for a student: Attendance and Notifications. | B2-5 — items come from shared `navFor` (spec 04 D14). |

## Settings

| Difference | Reason |
|---|---|
| A muted explainer under the Notifications header ("Turning one off stops the emails and push…"). | Spec 18 D4 (kept over v1 copy). |
| Sixth row "Quiz graded"; low-attendance row says "two in a row". | Spec 18 R56/R57 and D12. |
| Push notifications and Security sections. | v2-only, drawn with v1's Section. |
| Save profile stays disabled until the name is changed **and** valid (2–120 chars). | REG-80. |
| Success and server errors are toasts; "Password updated." adds "Signed out of N other device(s)." | B2-6 — v2's session revocation. |

## Notifications

| Difference | Reason |
|---|---|
| Header reads "{n} unread", not "{n} unread of {total}". | Data gap — the API pages by cursor and returns no total. |
| "Mark all read" button under the header; tapping a card marks it read; infinite scroll and pull-to-refresh. | v2 behaviour (spec D2, C6). |
| Timestamp separators are real "·" — v1 shows mojibake ("آ·"). | v1 encoding bug not reproduced. |

## Shell fixes found here (affect every rebuilt screen)

| Fix | Detail |
|---|---|
| Page background is `bg-brand-navy-50` (dark: background). | Every v1 role layout wraps pages in it; Plan 01's ShellFrame used plain background. |
| Top bar's bottom line no longer bright in dark mode. | The bar's bordered view now paints its own background; the navigator's light-grey scene colour was showing through the translucent border. |

## Dashboard

| Difference | Reason |
|---|---|
| "Session N of M · K sessions to go" (v1: "Week …"). | Spec 19 D12. |
| Budget tile reads "Absence budget left" (wraps to two lines; v1's "Absence budget" also wraps). | Spec 19 D14. |
| "Join stream" button and "Happening now" eyebrow only while a session runs; no "Watch recording" for future sessions. | Spec 19 D13. |
| Upcoming events card always shows, with an empty state; placed before Due soon in both branches. | Spec 19 D19/R10. |
| Greeting subtitle "You're all caught up." (no "this week"). | v1 counted the whole season (R67). |
| Next-session relative badge hidden while the session is in progress. | The eyebrow already says "Happening now". |
| No stagger fade-up on load. | Motion not ported (gaps-foundations). |
| Single-word stat labels may use 12px of the tile padding. | CSS overflows unbreakable words into the padding; React Native would break them mid-word. |

## Foundation fixes found here (affect every screen)

| Fix | Detail |
|---|---|
| `font-extrabold` / `font-black` now render Geist 800 / 900. | Only 400–700 faces were loaded; v1 uses font-black 96×. |
| ProgressRing draws its track and indicator. | NativeWind consumed `stroke-*` classes on svg without producing a colour; colours now resolve from the generated theme. |
| `tracking-*` letter spacing applied. | NativeWind dropped em letter spacing; base Text resolves em × font size. |

## Season

| Difference | Reason |
|---|---|
| "Session N of M" (v1: "Week …"). | Spec 02 R29 / 19 D12. |
| Leaders and members are listed in the server's order (by name). | v2 API ordering. |
| Upcoming sessions' time is the device's reading of `startsAt`. | Data gap — no org wall time in `/me/season`'s upcoming rows. |

## History

| Difference | Reason |
|---|---|
| The ▶/▼ marker is drawn as text. | No `<details>` element. |

## Attendance

| Difference | Reason |
|---|---|
| Row times are the device's reading of `startsAt` (the day comes from `dayKey`). | Data gap — no org wall time in `/me/attendance` rows. |

## Calendar

| Difference | Reason |
|---|---|
| Event rows without a url open v2's event screen (v1: inert). | v2 has an event detail route. |
| "Today / in N days" counts calendar days between org day keys (v1 rounds the instant distance, which can differ by one near evening sessions). | X13 — no device-clock day maths. |
| Events older than 30 days or more than a year ahead never load, so Month can't show them. | Server window of `GET /events` (D-15.1). |
| Alumni keep the pre-rebuild calendar. | v1 alumni have an Events page instead — batch 6. |
| Arabic chip titles truncate from the end of the line in their own direction. | Platform text layout. |
| Plain-background area below a short page (navy-50 tint ends 96px under the content) — reproduced. | v1 role layout's `pb-24` wrapper. |

## Quizzes and quiz runner

| Difference | Reason |
|---|---|
| Session and graded dates are the device's reading of `sessionDate` / `gradedAt`. | Data gap — instants with no org day key. |
| Answers save on a 1 s debounce in one batch with a visible "Saving… / Saved / Not saved" line and "Retry save". | v2 behaviour (spec 12 R55/R56). |
| Mixed Arabic/Latin punctuation can sit on the other side of a line than in Chrome. | Platform bidi. |

## Session detail

| Difference | Reason |
|---|---|
| "Your attendance" row in Details and an "About" card with the description. | B2-14 — v2 data kept, drawn as v1 rows/cards. |
| Check In opens a sheet that scans and shows the result in place, with an "Enter code instead" fallback and camera-permission states. | v2 behaviour: no write-on-render page (spec 04 D3), typed fallback, permission flow (§9 row 7). |
| Button stays disabled after checking in, with "You checked in at …" under it. | v2 shows the recorded check-in; v1 left the button enabled. |
| Play/Pause and "Leave the quiz" under the seek bar. | The native player has no controls (v1 taps the YouTube frame); D15 exit. |
| Any dismiss of a question sheet (back, backdrop, ×) leaves the quiz. | Spec 13 D15 — v1's sheet ignores dismissal. |
| End time is the start wall time plus the duration. | Data gap — no end time in the payload. |
| If the video can't play: "Watch recording" plus a one-line note. | Spec 13 R37 — v1 failed silently. |

## Assignments, assignment detail, forum

| Difference | Reason |
|---|---|
| Response boxes are plain text areas without v1's formatting toolbar. | Data gap — the API stores and returns submissions/forum posts as plain text; a rich editor would lose or escape its formatting. |
| RETURNED shows a warning dot and a "Returned" badge. | v2 status; v1 had no case. |
| "Late" badge next to Submitted. | v2's `isLate` flag kept. |
| "Start working" before a draft exists; editable only while DRAFT or RETURNED. | Ruling C6 and v2's edit rule (v1 created the draft on open and allowed edits until the due date). |
| No remove-file control; a note when the assignment expects a file. | Uploads are off; no mobile hook for file removal. |
| Forum keeps a due badge in the header and the leader's feedback card. | Spec 14 D10 / D9. |
| Comment delete asks first ("Delete comment?"). | v2 confirm kept, drawn with v1's ConfirmDialog. |
| "Group discussion · N" counts loaded posts; "Load more" / "Show all comments" paging. | The thread pages and returns no total. |
| Due dates in the list are the device's reading of `dueAt`. | Data gap — the student list has no `dueOrgDay`. |

## Profile

| Difference | Reason |
|---|---|
| No Full name or Email fields in the form; a card points to Settings for the name. | Spec 06 Decision 1 — this screen edits the six own columns only; PATCH /me owns the name. |
| No "Add photo" button; the avatar shows initials. | Uploads are off and v2 has no avatar read path. |
| Budget stat reads "Absence budget left" (v1: "Attendance"). | Spec 19 D14. |
| Success is a toast ("Profile saved."); v1 refreshed silently. | v2 feedback kept. |

## Data gaps (would need backend / contract work — not done in this batch)

| Gap | Effect today |
|---|---|
| No total in `GET /notifications`. | Header shows "{n} unread" only. |
| No org wall time on `/me/season` upcoming rows and `/me/attendance` rows. | Times are the device's reading of `startsAt`. |
| No org day key for quiz `sessionDate` / `gradedAt` or the student assignment list's `dueAt`. | Dates read in the device zone. |
| No end time in session detail. | End = start wall time + duration. |
| No `currentStatus` on the "already checked in" refusal. | Generic message. |
| No total post count in the forum view. | "Group discussion · N" counts loaded posts. |
| No avatar URL / upload endpoint (uploads off). | Initials only, no "Add photo". |
| Submissions and forum posts are plain text on the wire. | No rich-text toolbar. |
| No mobile hook for removing a submitted file. | No remove control. |
