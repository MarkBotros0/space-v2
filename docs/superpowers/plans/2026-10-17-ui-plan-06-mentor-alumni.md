# UI Plan 06 — Batch 6: Mentor and alumni screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the screens only a MENTOR or an alumnus reaches so each matches v1's `/mentor/*` and `/alumni/*` pages at 375px: the two dashboards, "My notes", and the profile (alumni record; the mentor's account card). Every v2 hook, query key, permission and navigation stays.

**Architecture:** Same loop as batches 2–5. Mentor students, student detail, history, settings, notifications and more are role-driven files already rebuilt in earlier batches. This batch rebuilds the mentor and alumni branches that still use the legacy `src/ui` primitives.

**Spec:** `docs/superpowers/specs/2026-10-14-mobile-ui-v1-match-design.md`

**Prerequisites:** branched from `main` (not stacked, per project convention). Batches 4 and 5 (PRs #23, #24) touch `app/(app)/{calendar,reports,dashboard}.tsx`, so this batch deliberately leaves those three files alone to avoid conflicts; see "Deferred".

**Capture status:** no devbox. Screens are source-matched; captures are listed in backlog section 14.

## Global Constraints
- The v1 repo is READ-ONLY. No backend or `packages/shared` change. Relative imports only; no `as Href`/`as any`.
- Match v1 class strings, variants, icons and copy at phone width. Deviations go in `docs/superpowers/ui-rebuild/gaps-batch-6.md`.
- Students must never see staff notes (owner ruling): nothing here widens note visibility.
- The batch ends with mobile `tsc`, `eslint` and the full jest suite green.

## Rulings
| # | Screen | Ruling |
|---|---|---|
| B6-1 | Mentor dashboard | v1 title and subtitle, "Flagged for follow-up" card with warning icon, "Recent activity" card, quick links. v2 keeps "At risk" wording (R48: "Flagged for follow-up" belongs to notes), the shared engagement cache (D17), and no quick links (they are tabs, spec 19 §9). |
| B6-2 | Alumni dashboard | v1 welcome card: teal eyebrow with cap icon, h1, paragraph, outline "View my history" button. |
| B6-3 | Notes | v1 header "My notes" with count. The composer stays on the student page (v2); the student filter is dropped (no per-author student filter endpoint). Visibility is shown in words (v2 ruling), not the raw enum. |
| B6-4 | Profile | Alumni record uses v1's Card with Field grid and a success Badge. Mentor/other account card is v2-only; it gets design primitives. |

## Deferred (follow-up after #23/#24 merge)
Alumni "Events" screen (`calendar.tsx` alumni branch), mentor Reports (`reports.tsx`) and the legacy loading state in `dashboard.tsx`.

## Tasks
1. Mentor dashboard — commit `feat(mobile): v1 mentor dashboard`.
2. Alumni dashboard — commit `feat(mobile): v1 alumni dashboard`.
3. Notes and profile — commit `feat(mobile): v1 notes and alumni profile`.
4. Gap note, backlog captures, CLAUDE.md line, full checks, push and PR against `main`.
