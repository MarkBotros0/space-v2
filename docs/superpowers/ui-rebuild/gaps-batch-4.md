# Batch 4 (admin) — remaining differences from v1

Every difference left between the v1 `/admin/*` pages and the rebuilt v2 screens, with its reason: a platform detail, a ruling (B4-n in `docs/superpowers/plans/2026-10-17-ui-plan-04-admin.md`, or B2-n / B3-n from earlier batches), or a data gap.

**Capture status: source-matched, capture pending for every screen.** The cloud session that built this batch had no v1 copy, emulator or Maestro, so no side-by-side capture was taken. The per-screen capture list is in the backlog doc ("UI rebuild captures").

## Dashboard
- Admin and leader share `StaffDashboard`; the admin card keeps the at-risk preview ("Students at risk"), not v1's full "All students" roster (D6). B4-1.
- Hero ring neutral, "Session n of m" instead of "Week" (D2, D12).

## Season list and detail
- ADMIN sees v1's "My Season" list; one season redirects to its detail. Detail tabs Overview / Groups / Sessions, with v2's Roster, New group, New session and EditSeason actions kept (v1 had none of them on this page). B4-2.
- No Edit / Duplicate season for ADMIN (v1 `canEdit={false}`); SUPER keeps "Edit season".

## Calendar, sessions
- Session form values are org-wall strings (`startDay` / `startTime`), picked with the design DatePicker / TimePicker; the server composes the instant (X13). "Repeat weekly" and "Apply to" keep v1 copy.
- Calendar list rows are the phone card variant of v1's table.

## Groups
- Group form: leaders and students are MultiSelects over the season roster (C9) with v2's "moves them here" hints. Saving replaces both lists (R30) and the form says so.
- Groups list keeps the season switcher (Plan 6 D-16.16); v1 forced one season and refused SUPER.

## Roster and import
- Roster grid is a phone list of one Select per student (v1's table, phone branch). The import screen keeps the paste flow, because uploads are off (`ENABLE_UPLOADS=false`): Preview → status table → "Apply n assignment(s)" → "Assignments applied" with skipped rows listed.

## Assignments (list, detail, forms)
- List: the Due column cannot show v1's second line ("MMM d, h:mm a"): `GET /seasons/:id/assignments` carries `dueOrgDay` but no `dueOrgTime`, and formatting `dueAt` on the device would break X13. Data gap (backend): add `dueOrgTime` to the staff list item.
- List Scope badge names the groups (v1 said "Some groups"); the Submissions cell reads "n/m submitted".
- Detail: the subtitle is `formatOrgDue` ("Due Apr 1, 2099, 11:59 PM"), v1 adds the weekday ("Due Wed, Apr 1, 2099 · 11:59 PM"). Edit sits below the description in the badge area rather than in the header row beside the title (phone width). The delete control and the Forum / config badge are v2's.
- Tracker is grouped under a "Group (n)" eyebrow (REG-84); v1 was one flat table. Pending rows say "Not started" (v1 "Pending"). "Submitted" is `formatShortDateTime`, in the device zone: the tracker payload has no org-clock stamp for it.
- Form: due date and time are the design DatePicker + TimePicker over org-day strings (C2), plus a v2-only "Clear due date" (v1 could not unset a date). Description uses v1's RichTextEditor. "Linked session" is a Combobox whose option subtitle is the server's `dayKey`, not `startsAt.toLocaleString()` (X13). The orphaned-work warning when narrowing groups is v2's (§10 item 5).
- The date picker opens on the current month, so picking a far date takes month taps (v1's web calendar has the same behaviour).
