# Batch 5 (super) — remaining differences from v1

Every screen is source-matched and capture-pending (plan 05, "Capture status").

## Dashboard
- Four stat cards in a 2×2 grid and v1's title and subtitle. Labels that encode v2 decisions stay: "Students (not graduated)" (D20) and the Seasons card's "All statuses" sublabel; the events card also says "From today, next 12 months". The numbers come from the organisation roll-up (spec 19 §7), not v1's four counts.
- While the roll-up loads or fails the whole card grid is replaced by v1's route skeleton or error; v1 has no such state.

## Seasons
- The list is v1's program-grouped table with a pencil per row. V2-only kept: the program filter chips (standing in for v1's `/super/seasons/program/[program]` and `/year/[year]` pages, B5-3). The Groups column is absent because the list contract carries no group count.
- "New season" opens its own screen (v1) instead of the old inline form. The form is v1's: Program, Year, Code (auto-filled until typed over), Description, Start and End date pickers, Status select, Attendance rules. The old "Saved as:" slug preview is gone; the schema error still blocks a bad code.
- Duplicate sits on the season detail beside Edit season (v1) as a sheet with Year, Code and date pickers. Delete sits on the edit screen header behind v1's confirm dialog; the list rows no longer carry either action, and the arm-then-press control is gone.
- The season detail's super and admin buttons beyond Edit and Duplicate (Roster, New group, New session) are v2-only and unchanged from batch 4.

## Users, import and events
- Users is v1's table (avatar, role and status badges, last login) with Search, "Show more", "Send N invites" (native confirm kept) and "Import profiles". The role-grant and invite-expiry copy on the edit screen is v2-only and kept.
- Import is v1's three steps (mode tiles, season select, preview with a 50-row "Show more"). Preview paging is client-side.
- Events are v1's list with pencil and trash, an inline new-event form and a confirm dialog. Date pickers replace typed dates; Time stays a text "HH:mm" field.

## Reports
- The organisation view has v1's three stat cards, "Active members per season", "Alumni by graduation year" (text lines, not a chart) and "Students per season" table. Export menu and the charts' look are v2's own, as in batch 4.

## Calendar
- v1's "All active seasons across JPC." view: one colour per season with a legend. It reads each ACTIVE season's own session list (as the leader's calendar does), because GET /sessions is windowed and cannot give v1's whole-season grid, so a very large organisation loads one request per active season.
