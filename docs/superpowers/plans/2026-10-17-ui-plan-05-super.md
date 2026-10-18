# UI Plan 05 — Batch 5: Super screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the screens only a SUPER reaches so each matches v1's `/super/*` pages at 375px in light and dark: the dashboard, seasons (list, program and year views, new, edit, detail with Edit / Duplicate / Delete), users (list, new, edit, import) and JPC events (list, detail, form). Every v2 hook, query key, permission and navigation stays.

**Architecture:** Same loop as batches 2–4. Batch 4 already ported everything v1 shares between `/admin/*` and `/super/*` (calendar, students and their forms, reports shell, session and assignment pages, season detail tabs, `SeasonsList`). Those route files are role-driven, so SUPER already renders v1 there; this batch only verifies them and rebuilds the SUPER-only branches and routes.

**Tech Stack:** Expo SDK 54, React Native 0.81, expo-router 6, NativeWind 4.2.7, lucide-react-native, React Query 5, date-fns, Jest (jest-expo) + @testing-library/react-native.

**Spec:** `docs/superpowers/specs/2026-10-14-mobile-ui-v1-match-design.md` (§2, §3 batch 5, §6, §7, §8)

**Prerequisites:** Plan 04 (PR #23) merged. This branch starts from the Plan 04 head because batch 5 reuses its design pieces (`form-parts`, `design/seasons/*`, shared `StudentDetail`); the PR is opened against `main` and merges after #23. v1 source is read from the `MarkBotros0/jpc-space` clone (read-only), `src/app/super/**` and `src/components/{seasons,users,events}/**`.

**Capture status (binding for this batch):** as in batch 4, no devbox is available. Screens are source-matched; side-by-side captures are listed in backlog section 14 and each gap-note entry says "source-matched, capture pending".

## Global Constraints

- The v1 repo is READ-ONLY.
- Match v1 at 375px: same class strings, variants, icons and copy. Deviations go in `docs/superpowers/ui-rebuild/gaps-batch-5.md`.
- **No backend or `packages/shared` change.** Needs a contract change go in the gap note.
- Phone width only: drop `md:`/`lg:`/`sm:` classes. Page stacks are `flex-col gap-4`.
- Text goes through `src/design/ui/text.tsx`; Button and Badge placed as v1 blocks get `self-start`; inputs keep an explicit `accessibilityLabel`.
- Relative imports only; no `as Href`/`as any`.
- Admin, leader and student branches of shared files are untouched unless a task says otherwise; their tests stay green.
- Ask before any push beyond the owner's per-plan yes. **Never start an EAS build, store submission or production deploy without an explicit yes at that moment.**
- The batch ends with mobile `tsc`, `eslint` and the full jest suite green.

## Rulings

| # | Screen | Flag | Ruling |
|---|---|---|---|
| B5-1 | Dashboard | v2 data | v1 shows four stat cards (Students, Alumni, Seasons, Upcoming events) and the upcoming-events card. v2 keeps its labels that encode decisions (D20 "Students (not graduated)", "All statuses") and the organisation roll-up query; layout, card style and links are v1's. |
| B5-2 | Seasons list | create inline | v2 had an inline "New season" form on the list; v1 has a "New season" button to a page. The list gets v1's button and a new `/seasons/new` route. Duplicate and Delete move from list rows to the season detail (v1). |
| B5-3 | Season views | v1 routes | v1's `/super/seasons/year/[year]` and `program/[program]` are filters in v2 (spec 02 §9, G20). They stay filters, drawn as v1's grouped list, not routes. |
| B5-4 | Forms | v2 validation | Layout, labels and copy are v1's; validation and payloads are v2's (Zod from `packages/shared`). Dates use the design `DatePicker`; the typed ISO text boxes go. |
| B5-5 | Delete | confirm | Arm-then-press controls become v1's `ConfirmDialog`. |
| B5-6 | Capture | no devbox | See "Capture status". |

## File Structure

```
apps/mobile/
  src/components/dashboard/SuperDashboard.tsx      # restyle
  src/components/season/SeasonForm.tsx             # NEW (create + edit, v1 layout)
  src/components/season/DuplicateSeasonDialog.tsx  # NEW
  src/components/UserForm.tsx, user list pieces    # restyle
  src/components/EventForm.tsx                     # restyle
  app/(app)/{seasons/index,seasons/new,seasons/[code]/{index,edit}}.tsx
  app/(app)/{users/*,user/[id],events,event/[id]}.tsx
docs/superpowers/ui-rebuild/gaps-batch-5.md        # NEW
```

## The per-screen loop

1. Read v1's page and components, then the v2 screen and its test.
2. **RED:** edit the test for the new markup and copy; watch it fail.
3. **GREEN:** rewrite with design components and v1 class strings; hooks stay. Run the file, then the mobile suite.
4. Record remaining differences in the gap note; append captures to backlog section 14.
5. **Commit** with the task's message.

Commands: `cd apps/mobile && npx jest src/__tests__/<file> --forceExit`; `npx tsc --noEmit`; `npx eslint src app`.

---

### Task 1: Super dashboard (B5-1)
v1 `super/dashboard/page.tsx`. Files: `SuperDashboard.tsx`; test `dashboard.test.tsx` (SUPER cases). Commit `feat(mobile): v1 super dashboard`.

### Task 2: Seasons list, new, edit, detail actions (B5-2…B5-5)
v1 `super/seasons/**`, `components/seasons/{seasons-list,season-form,duplicate-season-dialog,delete-season-button}.tsx`. Files: `seasons/index.tsx`, `seasons/new.tsx`, `seasons/[code]/{index,edit}.tsx`, `SeasonForm.tsx`, `DuplicateSeasonDialog.tsx`; tests `seasons-screen`, `season-write*`. Commit `feat(mobile): v1 super seasons`.

### Task 3: Users (list, new, edit, import)
v1 `super/users/**`, `components/users/*`. Files: `users/{index,new,import}.tsx`, `user/[id].tsx`, user form and list pieces; matching tests. Commit `feat(mobile): v1 super users`.

### Task 4: JPC events (list, detail, form)
v1 `super/events/page.tsx`, `components/events/*`. Files: `events.tsx`, `event/[id].tsx`, `EventForm.tsx`; tests. Commit `feat(mobile): v1 super events`.

### Task 5: Shared SUPER screens verified, gap note, backlog
Verify the SUPER view of calendar, students (list, alumni, dropped, detail, new, edit), reports, more, notifications and settings against v1 `super/*` (shared with admin or batch 3). Write `gaps-batch-5.md`, append the capture list to backlog section 14, add the `CLAUDE.md` one-liner, run the three checks. Commit `docs(mobile): batch-5 gap note and capture backlog`.
