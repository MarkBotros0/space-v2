# UI Plan 04 — Batch 4: Admin screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the screens an admin reaches so each matches v1's `/admin/*` pages at 375px in light and dark. Every v2 hook, query key, permission and navigation stays. Super and mentor branches of shared route files keep their current rendering unless v1's markup is identical for those roles (the student lists and student detail, which v1 shares between `/admin/students` and `/super/students`).

**Architecture:** Same loop as batches 2 and 3. Each screen's admin branch is rewritten with `src/design` components and v1 class strings. v1 admin pieces that several screens share (season status badge, list-row card, season detail tabs, session/group/assignment forms, students lists) are ported first into `src/design/`. Screens already rebuilt in batch 3 for every staff role (attendance, quiz grading, notifications, settings, More) are only verified.

**Tech Stack:** Expo SDK 54, React Native 0.81, expo-router 6, NativeWind 4.2.7, lucide-react-native, React Query 5, date-fns, Jest (jest-expo) + @testing-library/react-native, Maestro.

**Spec:** `docs/superpowers/specs/2026-10-14-mobile-ui-v1-match-design.md` (§2, §3 batch 4, §6, §7, §8)

**Prerequisites:** Plan 03 merged (main `75d4961`). v1 source read from the `MarkBotros0/jpc-space` clone (read-only, owner-approved 2026-10-08), `src/app/admin/**` and `src/components/**`.

**Capture status (binding for this batch):** the devbox (v1 copy on `:3100`, `jpc-ui` emulator, Maestro) is not available in the cloud session that executes this plan. Each screen is rebuilt from v1's **source**, and the v1-vs-v2 side-by-side capture step (spec §6.4, §7) is **not done here**. It is recorded per screen in `docs/superpowers/plans/2026-10-06-backlog-owner-actions.md` ("UI rebuild captures") for the devbox, and every screen's gap note says "source-matched, capture pending". The batch is not "done" in the spec's sense until those captures pass.

## Global Constraints

- The v1 repo is READ-ONLY. No pushes, PRs, edits or files there.
- Match v1 exactly at 375px: same class strings, variants, icons and copy. Deviate only per the Rulings or where React Native cannot do it. Every deviation goes in `docs/superpowers/ui-rebuild/gaps-batch-4.md`.
- **No backend or `packages/shared` change.** A gap that needs a contract change goes in the gap note's "Data gaps (backend)" table.
- Phone width only: drop `md:`/`lg:`/`sm:` classes. Admin pages use `flex-col gap-4` page stacks.
- Text goes through `src/design/ui/text.tsx`. Button and Badge placed as v1 blocks get `self-start`. Inputs keep an explicit `accessibilityLabel`.
- Relative imports only; no `as Href`/`as any`.
- Super/mentor/leader branches of shared files are untouched unless a task says otherwise; their tests stay green unchanged.
- Ask the owner before any push. **Never start an EAS build, store submission or production deploy without the owner's explicit yes at that moment.**
- The batch ends with `pnpm typecheck`, `pnpm lint` and `pnpm test:unit` green.

## Rulings

Precedence as in batches 2 and 3: a numbered v2 domain decision kept by the owner in PR #21 wins over v1 for behaviour and for copy that encodes it, drawn in v1's layout. Wording-only differences take v1's words. B2-* and B3-* rulings still apply. New rulings are appended here as tasks settle them, with their cost if wrong.

| # | Screen | Flag | Ruling |
|---|---|---|---|
| B4-1 | Dashboard | shared with leader | New `AdminDashboard` in `src/components/dashboard/`; only `case "ADMIN"` switches. v1 admin shows **all students** sorted by lowest attendance; v2 keeps D6 (at-risk preview, not the roster), so the card is titled "All students" only when v2 supplies the full roster; otherwise it keeps the leader's at-risk card titled "Students at risk". Hero keeps D2 (neutral ring), D5, D12 (Session, not Week). Eyebrow "Current season". |
| B4-2 | Season list / detail | v1 redirects | `/season` (My Season) renders the list; a single season redirects to its detail (v1). Detail is v1 `SeasonDetail` tabs Overview / Groups / Sessions with `canEdit={false}` for admins (no Edit / Duplicate). |
| B4-3 | Lists | row idiom | v1 `DataTable` collapses to cards on a phone; use the ported `DataTable` phone row. Link-style rows are pressable as a whole. |
| B4-4 | Forms | v2 validation | Form layout, labels and copy are v1's; field validation and submit payloads are v2's (Zod from `packages/shared`). Error summary box is the ported `Field` error style. |
| B4-5 | Capture | no devbox | See "Capture status". |

## File Structure

```
apps/mobile/
  src/design/seasons/season-status-badge.tsx   # NEW v1 badge + labels
  src/design/seasons/season-detail.tsx         # NEW v1 tabs (Overview, Groups, Sessions)
  src/design/lists/list-row.tsx                # NEW pressable v1 card row
  src/components/dashboard/AdminDashboard.tsx  # NEW
  app/(app)/{dashboard,season,calendar,groups,assignments,quizzes,reports,students/*}.tsx
  app/(app)/seasons/[code]/{index,roster/index,roster/import}.tsx
  app/(app)/{group,session,assignment,quiz}/**
docs/superpowers/ui-rebuild/gaps-batch-4.md    # NEW
```

## The per-screen loop

1. Read v1's page and the components it renders (paths in each task) and the current v2 screen + test.
2. **RED:** edit the screen's test per "Test changes". Run it and watch the changed assertions fail.
3. **GREEN:** rewrite the admin rendering with ported components and v1 class strings; hooks stay. Run the file, then the mobile suite.
4. Record remaining differences in the gap note. Append the capture to the backlog list.
5. **Commit** with the task's message.

Commands: one file `cd apps/mobile && npx jest src/__tests__/<file> --forceExit 2>&1 | tail -30`; types/lint `pnpm typecheck && pnpm lint`.

---

### Task 1: Shared batch-4 pieces
Files: `src/design/seasons/season-status-badge.tsx`, `src/design/lists/list-row.tsx`; test `src/__tests__/batch4-shared.test.tsx`.
Status badge: DRAFT → default "Draft", ACTIVE → success "Active", COMPLETED → info "Completed", ARCHIVED → warning "Archived" (v1 `season-status-badge.tsx`). `ListRow({ onPress, children })`: `rounded-2xl border border-border bg-card px-4 py-4` + `shadowStyle("soft")`, `accessibilityRole="link"`.
Commit `feat(mobile): batch-4 shared pieces`.

### Task 2: Admin dashboard (B4-1)
v1 `app/admin/dashboard/page.tsx`. Files: `AdminDashboard.tsx`, `app/(app)/dashboard.tsx`; test `dashboard.test.tsx` (ADMIN cases). Commit `feat(mobile): v1 admin dashboard`.

### Task 3: My Season + season detail (B4-2)
v1 `admin/season/page.tsx`, `season/[code]/page.tsx`, `components/seasons/{seasons-list,season-detail}.tsx`. Files: `app/(app)/season.tsx`, `app/(app)/seasons/[code]/index.tsx` (admin branch), `src/design/seasons/season-detail.tsx`. Commit `feat(mobile): v1 admin season list and detail`.

### Task 4: Calendar, new session, edit session
v1 `admin/season/[code]/calendar/{page,new/page}.tsx`, `sessions/[id]/edit/page.tsx`, `components/sessions/session-form.tsx`. Files: `app/(app)/calendar.tsx` (admin), `session/new.tsx`, `session/[id]/edit.tsx`, `src/components/SessionForm.tsx`. Commit `feat(mobile): v1 admin calendar and session forms`.

### Task 5: Groups, group detail, group forms
v1 `groups/page.tsx`, `groups/new`, `groups/[id]`, `groups/[id]/edit`, `components/groups/{groups-list,group-form}.tsx`. Files: `app/(app)/groups.tsx` (admin), `group/**`, `src/components/GroupForm.tsx`. Commit `feat(mobile): v1 admin groups`.

### Task 6: Roster and roster import
v1 `roster/page.tsx`, `roster/import/page.tsx`, `components/groups/{roster-grid,group-import-form}.tsx`. Files: `app/(app)/seasons/[code]/roster/**`. Commit `feat(mobile): v1 admin roster`.

### Task 7: Assignments list, detail, forms
v1 `assignments/**`, `components/assignments/{assignments-list,assignment-form}.tsx`. Files: `app/(app)/assignments.tsx` (admin), `assignment/new|[id]/index|[id]/edit`, `src/components/assignment-form.tsx`. Commit `feat(mobile): v1 admin assignments`.

### Task 8: Quizzes list, create, edit
v1 `admin/quizzes/page.tsx`, `season/[code]/quizzes/[quizId]/edit`, `components/quizzes/{create-quiz-form,quiz-builder}.tsx`. Files: `app/(app)/quizzes.tsx` (admin), `quiz/new.tsx`, `quiz/[id]/edit.tsx`. Commit `feat(mobile): v1 admin quizzes`.

### Task 9: Session detail console (admin)
v1 `season/[code]/sessions/[id]/page.tsx`. File: `app/(app)/session/[id]/index.tsx` (console branch). Commit `feat(mobile): v1 admin session detail`.

### Task 10: Reports
v1 `season/[code]/reports/page.tsx`, `components/reports/reports-view.tsx`. File: `app/(app)/reports.tsx` (admin branch). Commit `feat(mobile): v1 admin reports`.

### Task 11: Students, alumni, dropped, student detail
v1 `students/**`, `components/students/{students-list,alumni-list,dropped-students-list,student-detail}.tsx`. Files: `app/(app)/students/*`, `student/[id]/index.tsx` (admin, and super where v1 is identical). Commit `feat(mobile): v1 admin students`.

### Task 12: Verification, gap note, backlog
`gaps-batch-4.md`; capture list appended to the backlog doc; `CLAUDE.md` one-liner for the batch-4 shared pieces; `pnpm typecheck && pnpm lint && pnpm test:unit`. Commit `docs(mobile): batch-4 gap note and capture backlog`.
