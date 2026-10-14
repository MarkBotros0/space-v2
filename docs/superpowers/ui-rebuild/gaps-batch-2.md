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
