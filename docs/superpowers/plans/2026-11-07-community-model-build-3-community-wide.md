# Community model, Build 3: Community-wide seasons — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Super can run a season for the whole community, students and alumni together, that runs alone, with everyone as a full student.

**Architecture:** One new column, `Season.isCommunityWide`. The regular-season rule already sits in one function (`isBarredFromStudentSeat`), so a seat's rule changes there. Start takes one global advisory lock so two starts can't both slip past the "runs alone" rule. An alumnus who is studying is a person with `graduationYear` and a non-null `activeSeasonId`; the existing `isAlumnus` stays a permanent fact, and a new `isStudyingAlumnus` tells every screen and gate which experience they get.

**Tech Stack:** Express 5, Prisma 7, Zod (`packages/shared`), Expo + expo-router, React Query, NativeWind, Jest.

**Spec:** `docs/superpowers/specs/2026-11-06-community-model-design.md`, section "Community-wide seasons" and rollout item 3.

## Owner rulings (2026-11-07)

- A community-wide season has **no required program and graduates nobody**. It keeps pass results. The form hides both options once community-wide is on.
- **Select all available ticks both tabs**, and shows the count: `Select all available (186)`.

## Global Constraints

- Work on branch `community-model` in `/home/mark/projects/JPC/space-v2-community`, from `52620180`. Never touch the shared checkout. Commits use the repo-local author and end with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_016bpCTuvMRmKUfFfPhax16c`
- No push, deploy, or migration on Prisma Postgres without the owner saying so at the time. Local `.env` points at local `space_test`, so migrations apply there only.
- Migrations only add. Tokens are unchanged: role changes reach people through `markSessionsStale`, signing nobody out.
- `lib/roles` guards every seat write. Lock order is global start lock (Start only), then Season, then People, then rows.
- Refusals are `409` with the reason in words. Never move someone automatically.
- Never import `@prisma/client`. No `process.env` outside `src/lib/config.ts`. No `@/` alias. A value import of `packages/shared` from a route folder uses the relative path, as its neighbours do. Files stay at or under 400 lines. Change `src/docs` in the same commit as a route.
- UI: read `ui-ux-pro-max`'s `references/pro-rules.md` before UI work; this repo's `CLAUDE.md` rules win where they differ. Use `design/ui`, Text variants and tokens. No new animation. Never colour alone; unavailable rows aren't dimmed.
- **Never source `apps/backend/.env` and never print a database URL.**
- One integration file: from `apps/backend`, `npx jest --config jest.integration.config.js --testPathPattern integration/<name> --runInBand`. One mobile file: `npx jest <path> --silent` from `apps/mobile`. Implementers don't run whole suites.
- "Graduation" is the community one, `User.graduationYear`. Never touch `StudentProfile.universityGraduationYear`.

## Review Focus

1. An alumnus studying in a community-wide season opens the app: they get student tabs and can take quizzes and hand in work, not the read-only alumni portal. They still see alumni-only events. Pinned in Task 5.
2. That season ends: they return to the alumni portal on their next refresh, keep their class, and a Did not pass doesn't touch it. Pinned in Task 6.
3. Two starts at the same moment, one community-wide and one regular: exactly one wins. Pinned in Task 2.
4. Someone both staff and a student in the same draft, whichever they got first: Start lists them. Pinned in Task 2.
5. Select all with a filter or search on, on either tab: it must say and tick what it means. Pinned in Task 4.

---

### Task 1: The flag, its rules, and seats

**Files:**
- Create: `apps/backend/prisma/migrations/20261107140000_season_community_wide/migration.sql`
- Modify: `apps/backend/prisma/schema.prisma`, `packages/shared/src/season.ts`, `apps/backend/src/lib/queries/seasons.ts`, `apps/backend/src/routes/seasons/crud.ts`, `apps/backend/src/routes/seasons/duplicate.ts`, `apps/backend/src/docs/paths/seasons.ts`, `apps/backend/src/lib/roles/seat-rules.ts`, `apps/backend/src/lib/roles/student-seats.ts`, `apps/mobile/src/components/season/SeasonForm.tsx`, `apps/mobile/app/(app)/seasons/[code]/edit.tsx`, season page and list rows
- Test: `apps/backend/src/__tests__/integration/community-wide-seasons.test.ts` (new), `apps/backend/src/__tests__/integration/community-wide-seats.test.ts` (new), `apps/mobile/src/__tests__/season-form-community.test.tsx` (new)

**Interfaces:**
- Produces: `Season.isCommunityWide Boolean @default(false)`, in every season response; `Seat["season"]` and `StudentSeatSeason` gain `isCommunityWide: boolean`; `eligibilityRefusal(person, kind, season: { isCommunityWide: boolean })`.

- [ ] **Step 1: Failing tests, `community-wide-seasons`**
  - A Super creates a draft with `isCommunityWide: true`; a season admin sending the field is refused as `graduatesOnPass` is today.
  - `isCommunityWide: true` with `graduatesOnPass: true`, or with a `requiredProgram`, on create or update: `409 community_wide_rules`, message `A community-wide season has no required program and graduates nobody.`
  - The flag can be changed while DRAFT by a Super; on an ACTIVE or finished season: `409 season_started`.
  - Duplicating a season copies the flag.
- [ ] **Step 2: Failing tests, `community-wide-seats`**
  - An alumnus joins a community-wide draft and an ACTIVE community-wide season as a student; the same alumnus joining a regular one still gets `is_alumnus`.
  - A Super or Mentor is `permanent_role` in a community-wide season. Someone serving elsewhere in an ACTIVE season is `already_in_role`.
  - Switching a draft from community-wide to regular with an alumnus on its roster succeeds, and Start then lists them as `is_alumnus`.
- [ ] **Step 3: Implement.** The migration adds the column. `isBarredFromStudentSeat(person, season)` returns false for a community-wide season, the one place this rule lives. `readSeatSeason` selects the flag. `eligibilityRefusal` takes the season; Start, `newPersonRefusal` and imports pass it.
- [ ] **Step 4: Mobile, failing test first.** `SeasonForm`: a Super-only switch `Community-wide season`, description `Everyone can take part as a student, alumni too. It runs alone: no other season can be active.` Turning it on hides and clears the Graduating and Required program fields. Disabled once started. Season page and list rows show a `Community-wide` chip, in words.
- [ ] **Step 5:** Run the three files, `pnpm --filter @space/backend db:migrate:deploy` for local, typecheck. Commit.

### Task 2: It runs alone, and the Start checks

**Files:**
- Modify: `apps/backend/src/routes/seasons/start.ts`, `apps/backend/src/lib/queries/season-start.ts`, `apps/backend/src/lib/roles/active-role.ts` (the lock helper), `packages/shared/src/season-lifecycle.ts`, `apps/backend/src/docs/paths/seasons.ts`, `apps/mobile/src/screens/season-start/issue-list.tsx`, the start route under `apps/mobile/app/(app)/seasons/[code]/`
- Test: `apps/backend/src/__tests__/integration/community-wide-start.test.ts` (new), `apps/backend/src/__tests__/integration/season-start-races.test.ts`, `apps/mobile/src/__tests__/season-start.test.tsx`

**Interfaces:**
- Consumes: `isCommunityWide`.
- Produces: `lockSeasonStart(tx)`, a `pg_advisory_xact_lock` on one fixed key, taken first in `startSeason`. `SeasonStartCheck` gains `seasonsInTheWay: { id: number; code: string; title: string }[]`; `ready` is false while it's non-empty.

- [ ] **Step 1: Failing tests.**
  - A community-wide draft can't start while another season is ACTIVE: `409 start_blocked`, and `seasonsInTheWay` names it. A regular draft can't start while a community-wide season is ACTIVE; two regular seasons still run side by side.
  - Message: `3G 2026 is still running. End it first.` Regular draft: `The community-wide season JPC 2027 is running. End it first.`
  - Race: a community-wide and a regular Start at once, using the `lock-holds.ts` helpers: exactly one is 200, the other `start_blocked`.
  - A person both staff and a student in the same draft, in either order: an item with reason `already_in_role`, in a community-wide draft and a regular one. This was carried from Build 2.
  - An alumnus student in a community-wide draft isn't an issue.
- [ ] **Step 2: Implement.** A seat's row can't change a Start's verdict about other seasons, so only Start takes `lockSeasonStart`. `seasonsInTheWay` is read in `loadSeasonStartCheck`.
- [ ] **Step 3: Mobile.** The checklist shows `seasonsInTheWay` first, each with its message and `Open {title}`, then the people issues. Failing test first.
- [ ] **Step 4:** Run the files. Commit.

### Task 3: The picker's rows

**Files:**
- Modify: `apps/backend/src/routes/seasons/people-candidates.ts`, the `PeopleCandidate` schema in `packages/shared`, `apps/backend/src/docs/components/people.ts`, `apps/backend/src/routes/seasons/enrollments.ts`
- Test: `apps/backend/src/__tests__/integration/people-candidates.test.ts`

**Interfaces:**
- Produces: `PeopleCandidate.pool: "student" | "alumni"` (`alumni` when `graduationYear` is set) and `candidates.season.isCommunityWide`.

- [ ] **Step 1: Failing tests.** A community-wide season's `poolFor` includes alumni, each with `pool: "alumni"`; a regular season's has none. Super and Mentor are never listed. Someone serving elsewhere is `in_role`, and someone serving in this same season is `in_role` too. Alumni's `last` shows their last season. Already passed stays `already_passed`.
- [ ] **Step 2: Implement** by replacing `poolFor`'s placeholder. Batched `POST /seasons/:id/enrollments` of 200 people, half alumni, stays within its timeout: pin it.
- [ ] **Step 3:** Run the file. Commit.

### Task 4: Students and Alumni tabs, Select all

**Files:**
- Modify: `apps/mobile/src/screens/season-people/people-list.tsx`, `apps/mobile/src/screens/season-people/people-filters.tsx`, `apps/mobile/src/screens/season-people/model.ts`
- Test: `apps/mobile/src/__tests__/season-people.test.tsx`

**Interfaces:**
- Consumes: `pool`, `season.isCommunityWide`.
- Produces: `selectAllTargets(people, filters)`: every available, selectable person matching `filters`, across both tabs.

- [ ] **Step 1: Failing tests.**
  - A regular season shows no tabs and no alumni. A community-wide season shows `SegmentedControl` `Students | Alumni`, each with its rows.
  - `Select all available (N)`, with N counted over both tabs. It ticks both tabs, skipping already passed, in role and blocked; ticks stay when switching tabs; the second tap reads `Clear available`.
  - Search and the Last season filter narrow what it ticks, and N says so; the tab doesn't. Switching tabs keeps them.
  - `Add {n} people` counts ticks on both tabs. An unticked person stays out of the POST.
- [ ] **Step 2: Implement.** Tab state is local. The virtualised list renders only the current tab.
- [ ] **Step 3:** Run the file. Commit.

### Task 5: An alumnus studying

**Files:**
- Modify: `packages/shared/src/navigation.ts`, `apps/backend/src/lib/rbac.ts`, `apps/backend/src/routes/me.ts`, `apps/backend/src/routes/quizzes/attempts.ts`, `apps/backend/src/lib/queries/dashboard.ts`, `apps/backend/src/lib/queries/events.ts`, `apps/mobile/src/lib/dashboard-branch.ts`, `apps/mobile/src/lib/alumni-guard.ts`, `apps/mobile/app/(app)/_layout.tsx`, `apps/mobile/app/(app)/(tabs)/calendar.tsx`, `apps/mobile/app/(app)/(tabs)/history.tsx`, `apps/mobile/app/(app)/(tabs)/profile.tsx`, `apps/mobile/src/design/layout/user-menu.tsx`
- Test: `packages/shared/src/__tests__/navigation.test.ts`, `apps/backend/src/__tests__/integration/alumni-studying.test.ts` (new), `apps/mobile/src/__tests__/alumni-studying.test.tsx` (new)

**Interfaces:**
- Produces: shared `isStudyingAlumnus(user: NavAudience): boolean`, meaning `isAlumnus` and `activeSeasonId != null`. `navFor` returns the student nav for them. `isAlumnus` keeps meaning the permanent fact.

Every `isAlumnus` call gets one of two answers. Experience (the student portal): `navFor`, `dashboardBranchFor`, the alumni guard, calendar, history, profile, `routes/me.ts:251`, `routes/me.ts:364` and `attempts.ts:26` follow `isStudyingAlumnus`. Fact (keeps `isAlumnus`): `lib/queries/events.ts`, so alumni-only events stay visible; `user-menu`'s label, which reads `Alumnus · Student in {season}` for them. `dashboard.ts:202`'s `FEED_STUDENT` filter includes alumni with an ACTIVE enrolment in this season.

- [ ] **Step 1: Failing tests, backend.** A studying alumnus: `/me` carries `activeSeasonId`; their Today has student content, not a 403; starts, saves and submits a quiz attempt; submits an assignment; checks in. An alumnus not studying still gets today's refusals. They're on the attendance roster, tracker, reports and End's review. Alumni-only events still list for them.
- [ ] **Step 2: Failing tests, mobile.** Student tabs and Today; the alumni guard lets them through; `Profile` shows the student form with `Alumnus · School of 2025`; the university fields stay separate; an alumni-only event shows on Calendar.
- [ ] **Step 3: Implement.** A Calendar's events for them come from the student query plus alumni-only events. `grep -rn isAlumnus` again at the end: every hit sits on the list above.
- [ ] **Step 4:** Run the files. Commit.

### Task 6: Ending one

**Files:**
- Modify: `apps/backend/src/routes/seasons/end.ts`, `apps/backend/src/routes/seasons/results.ts`, `apps/backend/src/lib/queries/season-end.ts`, `apps/mobile/app/(app)/seasons/[code]/end.tsx`, `apps/mobile/src/screens/season-end/review-list.tsx`, `apps/mobile/src/screens/season-end/result-sheet.tsx`, `apps/backend/scripts/community-preflight.ts`, `apps/backend/scripts/community-preflight-review.ts`
- Test: `apps/backend/src/__tests__/integration/community-wide-end.test.ts` (new), `apps/backend/src/__tests__/integration/community-preflight.test.ts`, the End screen's test

- [ ] **Step 1: Failing tests.**
  - Ending a community-wide season: an alumnus with Passed or Did not pass keeps their class, nobody graduates, a non-alumnus who passed stays a student, and all their sessions go stale. An alumnus's next token gives the alumni portal again.
  - Correcting a result in it doesn't graduate anyone, and the sheet shows no graduation note. An alumnus shows a `School of 2025` line on the review.
  - End's confirmation states the eligible count: `This ends the season for {n} people.` This was carried from Build 2 and applies to every season.
  - The next season's picker: an alumnus who did not pass a community-wide program isn't blocked from a later community-wide one with no requirement.
  - Preflight's `alumniHoldingActiveEnrollment` doesn't list someone in a community-wide season, and does list someone in a regular one. Two ACTIVE seasons with one community-wide is a new violation, `communityWideNotAlone`, which blocks `--apply`.
- [ ] **Step 2: Implement.** A CHECK isn't needed for graduating: Task 1 refuses the combination, and `graduatePassed` follows `graduatesOnPass`, so it's already off.
- [ ] **Step 3:** Run the files. Commit.

### Task 7: Docs and the full run

**Files:**
- Modify: `CLAUDE.md`, `apps/backend/README.md`, spec's Community-wide seasons section, `apps/backend/scripts/seed-sweep/community.ts`

- [ ] **Step 1:** `CLAUDE.md`: a "Community-wide seasons" section with the flag, its two exclusions, runs alone with `lockSeasonStart`, `isStudyingAlumnus` against `isAlumnus`, Select all across both tabs. Fix "Build 3 ... isn't" at the Community model section's head. Spec: add the owner's two rulings. Remove `Build 3` comments in code that are now false.
- [ ] **Step 2:** Add a community-wide draft and one studying alumnus to the sweep seed, for Task 8.
- [ ] **Step 3:** The controller runs `pnpm lint`, `typecheck`, `build`, `test` in tmux `jpc-full`, and fixes what breaks. Commit.

### Task 8: The UI sweep (controller)

The owner moved the sweep to the end of this build. It covers Build 1, 2 and 3 screens.

- [ ] **Step 1:** Run the `ui-sweep` skill on: people picker with both tabs and with 200 rows; staff pickers; Start checklist including `seasonsInTheWay`; End's review and result sheet; Results; the graduation exception sheet with the keyboard open; Remove on a draft; dialogs over sheets; between-seasons Today; finished season page; a studying alumnus's tabs and Today. Both themes, font 1.0 and 1.3, 360dp and 375dp.
- [ ] **Step 2:** Fix what it finds, add one line per class of bug to `CLAUDE.md`'s "Rules from the UI sweep", and shoot again.
- [ ] **Step 3:** Commit. Release stays with the owner: on their word, migrate Prisma Postgres, push both remotes, verify `/health`, build TestFlight. Remove or keep the test data as they say.
