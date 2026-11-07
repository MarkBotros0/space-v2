# Putting people into a season — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Two named routes into a season (Select from community, Invite new) in the People card, a "passed the previous season" suggestion, and a group-members picker that only lists the season's people and says where each one is.

**Architecture:** One additive change to `GET /seasons/:id/people-candidates` (`season.previous`, per-person `previous`). Everything else is mobile: a Students level in the People card, a re-sectioned picker, and a members sheet replacing `MultiSelect` in `GroupForm`.

**Tech Stack:** Express 5 + Prisma 7, Zod in `packages/shared`, Expo + NativeWind, Jest.

**Spec:** `docs/superpowers/specs/2026-11-07-season-people-entry-design.md` (approved by the owner 2026-11-07, both proposed answers taken).

## Global Constraints

- Copy, verbatim: "Select from community", "Invite new", "Passed {title}", "Didn't finish {title}", "Add anyway", "Added by choice", "Nobody is in {season} yet. Add people to the season first, from the season page."
- Previous season = latest-ended (`endDate` desc, then id desc) COMPLETED/ARCHIVED non-deleted season of `requiredProgram ?? program`, not this one; null for community-wide.
- Hard block (requiredProgram) override stays Super-only.
- Files ≤ 400 lines; no hex, no new animation; relative imports; typed routes, no `as Href`.
- Don't touch `apps/backend/src/lib/email-templates.ts` or the two email tests (another session).

## Review Focus

- Season whose own program has never finished: `previous` null, no callout, no "Passed" section.
- Previous-season passer who is now an alumnus: absent from a regular season's list; the callout counts them apart.
- Previous-season passer already in this season: not counted, not ticked.
- Group form on a season with an empty roster: guidance, not "No students found."
- Draft with people already: callout only for the passers not in it.

---

### Task 1: Reproduce the empty picker
- [ ] On the local DB (`space_test`), a draft with a group, leaders and no enrolments → `GET /seasons/:id/roster` is `[]`. Add one enrolment → it lists them. If an enrolled person is missing, stop and fix that first.

### Task 2: Backend `previous`
**Files:** `packages/shared/src/standing.ts`, `apps/backend/src/routes/seasons/people-candidates.ts`, new `apps/backend/src/lib/queries/seasons/previous-season.ts`, `src/docs/openapi.ts`, test `src/__tests__/integration/people-candidates-previous.test.ts`; fix the `season` `toEqual` in `people-candidates.test.ts`.
**Produces:** `peopleCandidatesResponseSchema.season.previous: {id, code, title} | null`; `peopleCandidateSchema.previous: "passed" | "not_passed" | "dropped" | null`; `findPreviousSeason(db, season): Promise<{id, code, title} | null>`.
- [ ] Tests: previous is the latest-ended finished season of the program; requiredProgram wins over program; null for community-wide and when none finished; draft/active seasons never count; per-person passed / not_passed / dropped / null.
- [ ] Implement, run `pnpm --filter @space/backend test:integration -- people-candidates`.

### Task 3: People card Students level + suggestion
**Files:** new `apps/mobile/src/design/seasons/students-level.tsx`, `people-card.tsx`, `app/(app)/seasons/[code]/index.tsx` (drop the Add people tile; load `useSeasonPeople` for an administering viewer of a DRAFT), `src/screens/season-people/model.ts` (`passedSuggestion(people)`).
**Produces:** `PeopleCard` props `onSelectFromCommunity?`, `onInviteNew?`, `suggestion?: { title: string; count: number; graduated: number; onAdd: () => void }`; route param `/seasons/[code]/people?preset=passed`.
- [ ] Tests (season-detail-screens / season-setup-entry): no Add people tile; both buttons for an admin of a draft or running season, none on a finished one; summary line words; callout text and count, hidden at zero.

### Task 4: Select from community + Invite new
**Files:** `people-list.tsx`, `model.ts` (`buildItems` gets the Passed / Didn't finish sections), `candidate-row.tsx` ("Added by choice", confirm for `previous !== "passed"`), `people.tsx`, `invite.tsx`.
- [ ] Tests (season-people): titles; Passed section ticked when `preset=passed` or the draft is empty; Didn't finish rows never ticked; ticking one asks and marks "Added by choice"; empty search offers Invite new.

### Task 5: Group form members sheet
**Files:** new `src/screens/group-form/members-sheet.tsx` + `members-model.ts`, `GroupForm.tsx`.
- [ ] Tests (new `group-members.test.tsx`): sections and row lines; empty roster guidance; picking someone from another group says it moves them.

### Task 6: Verify and ship
- [ ] Catalogue entries; `pnpm lint typecheck test:unit`; backend integration for the candidates files; ui-sweep on the four screens; commit as jesusprojectcommunity, don't push.
