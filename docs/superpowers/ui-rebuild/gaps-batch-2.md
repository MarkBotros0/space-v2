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
