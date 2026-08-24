# Plan 8 — Notes & Engagement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pastoral notes with the visibility model actually enforced in the
database query — no note leaves the API without a viewer having been named —
and an engagement score computed once on the server from a single definition
in `packages/shared`, consumed by the screens rather than re-derived.

**Architecture:** One careful backend workstream, not two. Notes and
engagement are separate route files (`routes/notes.ts`, `routes/engagement.ts`)
but a single sequential stream, because the domain's payload is the most
sensitive in the migration and every task's gate depends on the one before it.
The visibility rule is written once, in `lib/permissions.ts`, as a Prisma
`where` fragment that takes the viewer as a required argument — there is no
function anywhere in v2 that returns a note without one. Note bodies are
**plain text on the wire**: escaped on write, stripped on read, escaped again
at every mail interpolation. Engagement is a cohort aggregation with a
constant number of queries, never 4N. Two mobile screens consume the results;
`student/[id].tsx` is **extended**, not created — Plan 5 builds it.

**Tech Stack:** Express 5, Prisma 7 (`src/generated/prisma`), Zod, jest +
supertest integration suite against the shared staging DB; Expo SDK 54 /
expo-router 6 (typed routes), React Query 5, RNTL 13 via `renderWithProviders`.

**Spec:** `docs/superpowers/specs/domains/09-notes.md` (90 rules; §4 and §10
D1–D15 are load-bearing), `docs/superpowers/specs/domains/_DECISIONS.md`
(C1, C4, C6, C8, C11 all bind here), and
`docs/superpowers/specs/domains/04-attendance.md` for the attendance and
absence-budget inputs engagement consumes — **cited, never restated**.
Scope from `docs/superpowers/plans/2026-08-24-migration-roadmap.md` § Plan 8.

## Global Constraints

- **`D:\Projects\JPC\jpc-space` is READ-ONLY.** Read it constantly; never write to it, never run `git` there.
- **No migrations, ever.** No edits under `apps/backend/prisma/`. Shared live staging DB (C1). `EngagementNote` has **no `deletedAt`** and gains none here.
- **Notes are pastoral records about named young people.** Never paste real note content into a test, a fixture, a commit message, or a report. Every fixture row carries the `space-v2-test-` prefix in `User.email` or `Season.code`.
- **Never run database commands or integration tests outside the task step that says to.** `cleanupTestData` is prefix-global and safe only under `--runInBand`.
- Response envelope `{ data }` / `{ error: { code, message } }` via `apiOk`/`apiError`.
- Value imports from shared use the relative path `"../../../../packages/shared/src/index"` in route files (the `rootDir` emit trap in `CLAUDE.md`). `import type` may use the package name.
- `src/docs/openapi.ts` changes in the **same commit** as the route it documents.
- Integration fixtures come from `apps/backend/src/__tests__/integration/fixtures.ts`: `createTestSeason` / `createTestUser` / `login` / `cleanupTestData`; `jest.setTimeout(60000)`. `cleanupTestData` **already deletes `EngagementNote`** (lines 125–132) — it does so by `studentUser`/`authorUser` prefix match, because `EngagementNote`'s two `User` relations are `onDelete: Restrict` and the season graph above does not reach them. No fixture change is needed for notes; do not add one.
- Mobile: relative imports only (no `@/`); every response parsed with a Zod schema from `@space/shared`, never cast; dependent queries pass `enabled` and guard manual `refetch()`; tab screens pass `edges={["top","left","right"]}` to `Screen`; tests use `renderWithProviders`; `jest.mock` factories may only close over consts named `mock*`; never `as Href` / `as any`.

**Execution shape:** strictly sequential. Task 1 (contracts) → Task 2 (gate +
reads) → Task 3 (writes + sanitisation) → Task 4 (engagement) → Task 5
(`/notes` screen) → Task 6 (student detail extension) → Task 7 (closing gate
with mutation pass). Tasks 5 and 6 may run as two subagents in parallel once
Task 4 has landed; nothing else in this plan parallelises.

## Prerequisites

This plan sits after Plan 5 in the roadmap and consumes two things it builds:

- `apps/backend/src/lib/permissions.ts` must already export
  `canViewStudent(user, studentUserId)` (Plan 5 Task 2). Every note read gates
  on it *and* on the visibility rule — two gates, in that order (spec R39, §4
  item 4).
- `apps/mobile/app/(app)/student/[id].tsx` must already exist with
  `useStudentDetail(id, role)` from `apps/mobile/src/hooks/use-students.ts`
  (Plan 5 Task 7). Task 6 **extends** that file; it does not create it.

If either is missing, stop and say so rather than reimplementing it here — a
second `canViewStudent` is exactly the drift C8 exists to prevent.

## Divergence ledger — what this plan adopts, and what it refuses

Every row cites the rule it answers to. Read this before Task 1; the tasks
assume it.

| # | v1 behaviour | v2 | Authority |
|---|---|---|---|
| 1 | Note read has **no gate below the page**; `loadStudentDetail` returns every note to any caller and four pages each remember to call `filterVisibleNotes` | The visibility rule is a Prisma `where` fragment taking the viewer as a **required** argument. No exported function returns notes without one | spec §4 item 1, D5 #1, ruling C8 |
| 2 | A STUDENT sees no notes because no student-facing page renders them | `role === "STUDENT"` is refused **explicitly**, `403`, before any query — including for their own notes | spec D5 #2, D6 |
| 3 | Notes ride inside `loadStudentDetail`'s payload | Notes have their own route, own gate, own query. `GET /students/:id` carries none | spec D5 #3 |
| 4 | `visibility` matched by **equality** while the composer's copy promises admins can read everything | **Equality kept** (R32–R35). The *copy* is fixed. The ladder is **not** implemented — see "Deferred" below | spec D3 option 2 (its own recommendation) |
| 5 | Note bodies are unsanitised HTML rendered with `dangerouslySetInnerHTML` in three places | Bodies are **plain text on the wire**: escaped + paragraph-wrapped on write, tag-stripped + entity-decoded on read (which also handles v1's legacy TipTap rows) | ruling C11, spec D1 |
| 6 | 140 characters of the raw note body are emailed unescaped to every season admin | The follow-up notification carries **no excerpt**. Title and link unchanged; body is a fixed string. Separately, every mail interpolation escapes | spec D2, ruling C11 |
| 7 | Update validates **nothing** — an edit may set the body to `""` | `PATCH` reuses the create schema's `body` bound (2–20000) | spec §7, fixes R25 |
| 8 | Delete is a hard delete, unreachable from any UI | **Not shipped.** `DELETE /notes/:id` answers `501 delete_unavailable`. Soft delete needs a `deletedAt` column, which needs a migration, which C1 forbids while v1 writes to this table | spec D4 #2, ruling C1 |
| 9 | Author-only edit; SUPER **not** exempt | Kept, deliberately. `canEditNote` is author equality and nothing else | spec R23/R28, §4 item 5 |
| 10 | ADMIN write gate reads `StudentProfile.activeSeasonId`, so an admin can open a student they cannot write about | Write gate resolves through `SeasonEnrollment`, matching `canViewStudent` | spec D12 first half, fixes R47/R48 |
| 11 | LEADER write gate and the score's targeting both read `GroupStudent` (globally unique — one group per student in the whole database) | Both resolve through `SeasonEnrollment.groupId` | ruling C9, fixes R49/R50 and R59 |
| 12 | "At risk" defined three times, three ways | **One** definition, in `packages/shared`, component-wise (`attendancePct < 60 || submissionPct < 60`), with a zero-denominator guard so a season that has not started flags nobody | spec D7 recommendation, ruling C4; guard fixes R56 |
| 13 | Engagement denominator is every past session in the season, including ones that ran before the student enrolled | Denominator is past sessions at or after `SeasonEnrollment.enrolledAt` | spec D8 recommendation #1, fixes R55 |
| 14 | 4N concurrent queries on the mentor dashboard, 4N sequential on reports | A cohort endpoint with a **constant** number of queries, independent of cohort size | spec D10, ruling C4 |
| 15 | A student's composite score is computed and thrown away | The student's own endpoint returns the **two components and no composite**, and the schema is `.strict()` so a server that leaks `score` fails at the client boundary | spec D9 recommendation |
| 16 | `/notes` is a MENTOR-only tab; ADMIN/LEADER/SUPER can author but cannot list what they wrote | `/me/notes` opens to all four authoring roles and the navigation follows in the same change | spec D14, fixes R44 |
| 17 | No rate limit and no audit trail on note reads | Note reads are rate-limited and log `(viewerId, studentUserId, noteCount, at)` | spec D15 |
| 18 | The mentor composer's student picker queries every non-deleted STUDENT directly, alumni included, bypassing the visible-students scope | **No cross-student picker exists.** The composer lives on the student detail screen, where the student is already in context and already gated. D13's defect cannot be ported because the query it describes has no v2 counterpart | spec D13 |

### Deferred — needs the pastoral owner's decision, not an engineer's

**The visibility ladder (spec D3 option 1) is not implemented and must not be
added without an explicit decision from whoever owns pastoral policy.** Making
`LEADERS` mean "leaders and above" would retroactively grant every season
admin read access to every historic `LEADERS`-visibility note — records written
by staff who were shown a different promise at the time. That is a privacy
expansion applied backwards to existing records about named young people. The
spec says so in as many words ("it needs an explicit decision by whoever owns
the pastoral policy, not an engineer") and recommends option 2. This plan
therefore ships the equality semantics v1 actually implements and **fixes the
misleading UI copy instead**. Do not silently widen access. If the ladder is
later approved, it is a one-line change to `noteVisibilityWhere` plus a
migration-free backfill of nothing — but the decision comes first.

### Deferred to cutover (needs a migration — C1)

- `EngagementNote.deletedAt` — until it exists, delete is unavailable (row 8 above).
- `followUpFlagged` resolution state (`resolvedAt`/`resolvedById`) and a follow-up queue (spec D11). Until then the flag stays a notification trigger; this plan renders it as a badge only where a reader can act on it.
- A stored engagement score (spec D10, §5 item 3). Ship the aggregation now; materialise only if real cohort sizes demand it, post-freeze.
- Notification `link` format. v1's `/admin/students/:id` is kept verbatim, matching the rest of `apps/backend`; rewriting links to v2's route tree is one cutover change across all notification types, not this plan's.

### The C3 inheritance — state it, do not fix it here

Ruling C3 establishes that v1 measures `lateMinutes` from `checkInOpenAt` —
the moment an admin pressed a button — rather than from `session.startsAt`,
and that v2's correction of the *instant* creates a deliberate divergence
between v1-era and v2-era rows in the same column.

Where that lands in this domain is not what it first looks like, and the spec
is precise about it (R67, D8):

- **The engagement score is immune.** `attendancePct` counts attendance *rows* with status `PRESENT` or `LATE` (R54) and never reads `lateMinutes`. Nothing in Task 4 touches that column.
- **Every absence-budget-derived figure inherits the defect in full.** `computeAttendanceBudget` charges raw `lateMinutes` (R65), so the budget percentage — and the `100 − budgetPct` number v1 shows students under the label "Attendance" (R68) — is a function of staff behaviour, not student behaviour.

The budget is **domain 4's**, specced as its R88–R92 and ruled on in its §10
D1/D2. This plan neither computes it nor fixes it. Where a screen here shows
an engagement number beside a budget number, the two are labelled distinctly
(spec D8 recommendation #2: the budget figure is *absence budget remaining*,
never "Attendance") and the plan cross-references
`docs/superpowers/specs/domains/04-attendance.md` rather than restating a
single one of its rules.

---

### Task 1: Contracts — `packages/shared/src/note.ts`

**Files:**
- Create: `packages/shared/src/note.ts`
- Modify: `packages/shared/src/index.ts` (add the export line)
- Test: `packages/shared/src/__tests__/note-schemas.test.ts`

**Interfaces:**
- Consumes: `userRoleSchema` from `./auth`.
- Produces (exact names every later task imports): `noteVisibilitySchema` / `NoteVisibility`; `NOTE_BODY_MIN`, `NOTE_BODY_MAX`; `noteSummarySchema` / `NoteSummary`; `authoredNoteSchema` / `AuthoredNote`; `createNoteRequestSchema` / `CreateNoteBody`; `updateNoteRequestSchema` / `UpdateNoteBody`; `noteListQuerySchema` / `NoteListQuery`; `noteListResponseSchema`; `authoredNoteListResponseSchema`; `engagementScoreSchema` / `EngagementScore`; `engagementRowSchema` / `EngagementRow`; `studentEngagementSchema` / `StudentEngagement`; `studentSelfEngagementSchema` / `StudentSelfEngagement`; `seasonEngagementResponseSchema`; `AT_RISK_PCT`; `isAtRisk`.

**One file, not two.** Spec §8 suggests splitting notes and engagement because
they share no type (R63). They ship in one plan, one backend workstream and one
commit series here, and the file is 150 lines — a second file would add an
index export and a second review surface for four schemas nobody reads
separately. If Plan 11 (Reports) finds the coupling awkward when it consumes
`engagementRowSchema`, splitting is a rename, not a redesign.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/__tests__/note-schemas.test.ts
import {
  AT_RISK_PCT,
  createNoteRequestSchema,
  isAtRisk,
  noteVisibilitySchema,
  studentSelfEngagementSchema,
  updateNoteRequestSchema,
} from "../index";

describe("noteVisibilitySchema", () => {
  it("accepts exactly the three enum members the database has", () => {
    expect(noteVisibilitySchema.parse("LEADERS")).toBe("LEADERS");
    expect(noteVisibilitySchema.parse("MENTORS")).toBe("MENTORS");
    expect(noteVisibilitySchema.parse("ADMINS")).toBe("ADMINS");
  });

  it("is NOT derived from the role enum — a new role must never become a visibility", () => {
    expect(noteVisibilitySchema.safeParse("SUPER").success).toBe(false);
    expect(noteVisibilitySchema.safeParse("STUDENT").success).toBe(false);
  });
});

describe("createNoteRequestSchema", () => {
  it("defaults followUpFlagged to false and leaves seasonId absent", () => {
    const parsed = createNoteRequestSchema.parse({ body: "Checked in today.", visibility: "LEADERS" });
    expect(parsed.followUpFlagged).toBe(false);
    expect(parsed.seasonId).toBeUndefined();
  });

  it("refuses a body outside 2..20000", () => {
    expect(createNoteRequestSchema.safeParse({ body: "x", visibility: "LEADERS" }).success).toBe(false);
    expect(
      createNoteRequestSchema.safeParse({ body: "x".repeat(20001), visibility: "LEADERS" }).success,
    ).toBe(false);
  });

  it("has no studentUserId field — the subject is a path parameter, never a body field", () => {
    const parsed = createNoteRequestSchema.parse({
      body: "Checked in today.",
      visibility: "LEADERS",
      studentUserId: 99,
    });
    expect("studentUserId" in parsed).toBe(false);
  });
});

describe("updateNoteRequestSchema", () => {
  it("applies the SAME bound create applies — v1's update validated nothing (R25)", () => {
    expect(updateNoteRequestSchema.safeParse({ body: "" }).success).toBe(false);
    expect(updateNoteRequestSchema.safeParse({ body: "Corrected." }).success).toBe(true);
  });

  it("carries body only — visibility and the flag are immutable after creation (R24)", () => {
    const parsed = updateNoteRequestSchema.parse({ body: "Corrected.", visibility: "ADMINS" });
    expect("visibility" in parsed).toBe(false);
  });
});

describe("isAtRisk — the ONE definition (D7)", () => {
  const base = {
    score: 0,
    attendancePct: 100,
    submissionPct: 100,
    attendanceTotal: 10,
    attendancePresent: 10,
    submissionsExpected: 10,
    submissionsCompleted: 10,
  };

  it("flags a student weak in ONE component, which the composite would hide", () => {
    // 55% attendance, 95% submissions: composite 75 ("Medium" on v1's reports),
    // but this student has stopped turning up. Component-wise catches it.
    expect(
      isAtRisk({ ...base, attendancePct: 55, submissionPct: 95, score: 75 }),
    ).toBe(true);
  });

  it("does not flag a student above the threshold on both components", () => {
    expect(isAtRisk({ ...base, attendancePct: 61, submissionPct: 61, score: 61 })).toBe(false);
  });

  it("never flags on a component with a zero denominator (R56)", () => {
    // A season with no past sessions scored every student 0% attendance in v1
    // and therefore flagged the whole cohort at risk on day one.
    expect(
      isAtRisk({ ...base, attendancePct: 0, attendanceTotal: 0, attendancePresent: 0 }),
    ).toBe(false);
  });

  it("keeps the threshold in one named constant", () => {
    expect(AT_RISK_PCT).toBe(60);
  });
});

describe("studentSelfEngagementSchema", () => {
  it("is strict, so a server leaking the composite to a student fails the parse (D9)", () => {
    const selfPayload = {
      attendancePct: 80,
      submissionPct: 90,
      attendanceTotal: 10,
      attendancePresent: 8,
      submissionsExpected: 10,
      submissionsCompleted: 9,
      seasonId: 7,
      seasonTitle: "Spring 2099",
    };
    expect(studentSelfEngagementSchema.safeParse(selfPayload).success).toBe(true);
    expect(studentSelfEngagementSchema.safeParse({ ...selfPayload, score: 85 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd packages/shared && npx jest src/__tests__/note-schemas.test.ts`
Expected: FAIL — `Cannot find module` / the exports do not exist.

- [ ] **Step 3: Write the contracts**

```ts
// packages/shared/src/note.ts
import { z } from "zod";

import { userRoleSchema } from "./auth";

/**
 * NoteVisibility's three values are role names (spec R34), but this is a
 * DIFFERENT enum from UserRole with a different domain: plural, no SUPER, no
 * STUDENT. Deriving it from userRoleSchema would mean a future role addition
 * silently becomes a note audience. Declared standalone on purpose (§8).
 *
 * These are matched by EQUALITY, not as a ladder — an ADMIN does not read a
 * LEADERS note. See the plan's divergence ledger row 4 and spec D3.
 */
export const noteVisibilitySchema = z.enum(["LEADERS", "MENTORS", "ADMINS"]);
export type NoteVisibility = z.infer<typeof noteVisibilitySchema>;

/** v1's create bound (R1). v2 applies it to update as well, fixing R25. */
export const NOTE_BODY_MIN = 2;
export const NOTE_BODY_MAX = 20000;

/**
 * `body` is PLAIN TEXT on the wire, in both directions.
 *
 * v1 stores TipTap HTML and renders it raw (R6, spec D1). React Native has no
 * dangerouslySetInnerHTML to inherit, so the wire format is chosen for safety
 * rather than compatibility: the API escapes on write and strips tags on read
 * (including v1's existing rows), and every HTML sink — only email — escapes
 * again. Ruling C11.
 *
 * `canEdit` and `edited` are server-derived (ruling C4). A client must not
 * compare author ids to decide whether to show an edit control, and must not
 * compare timestamps to decide whether a note was amended.
 */
export const noteSummarySchema = z.object({
  id: z.number().int(),
  body: z.string(),
  visibility: noteVisibilitySchema,
  followUpFlagged: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  edited: z.boolean(),
  authorId: z.number().int(),
  authorName: z.string().nullable(),
  authorRole: userRoleSchema,
  seasonId: z.number().int().nullable(),
  seasonTitle: z.string().nullable(),
  canEdit: z.boolean(),
});
export type NoteSummary = z.infer<typeof noteSummarySchema>;

/** The /me/notes shape: the same note, plus who it is about. */
export const authoredNoteSchema = noteSummarySchema.extend({
  student: z.object({
    id: z.number().int(),
    name: z.string().nullable(),
    email: z.string(),
  }),
});
export type AuthoredNote = z.infer<typeof authoredNoteSchema>;

/**
 * `studentUserId` is deliberately NOT a field here — the subject is a path
 * parameter, so a client cannot address a note at a student other than the one
 * named in the URL the gate checked (§8).
 *
 * `seasonId` stays optional: the server defaults it from the student's active
 * season (R4). Spec D12 also floats requiring the caller to name it; §8's own
 * contract table keeps it optional and the composer has no season picker, so
 * D12's first half (the write gate) is adopted and its second half is not.
 */
export const createNoteRequestSchema = z.object({
  body: z.string().min(NOTE_BODY_MIN).max(NOTE_BODY_MAX),
  visibility: noteVisibilitySchema,
  followUpFlagged: z.boolean().default(false),
  seasonId: z.number().int().positive().optional(),
});
export type CreateNoteBody = z.output<typeof createNoteRequestSchema>;

/** Body only (R24 — visibility, flag and season are immutable after creation). */
export const updateNoteRequestSchema = z.object({
  body: z.string().min(NOTE_BODY_MIN).max(NOTE_BODY_MAX),
});
export type UpdateNoteBody = z.output<typeof updateNoteRequestSchema>;

/**
 * Cursor pagination replaces v1's silent 100-row cap (R41), under which a
 * student with a long pastoral history had older notes no surface could reach.
 */
export const noteListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  studentId: z.coerce.number().int().positive().optional(),
});
export type NoteListQuery = z.output<typeof noteListQuerySchema>;

export const noteListResponseSchema = z.object({
  notes: z.array(noteSummarySchema),
  nextCursor: z.string().nullable(),
});

export const authoredNoteListResponseSchema = z.object({
  notes: z.array(authoredNoteSchema),
  nextCursor: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Engagement
// ---------------------------------------------------------------------------

/** The seven fields of v1's EngagementScore interface (engagement.ts:3-11). */
export const engagementScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  attendancePct: z.number().int().min(0).max(100),
  submissionPct: z.number().int().min(0).max(100),
  attendanceTotal: z.number().int().min(0),
  attendancePresent: z.number().int().min(0),
  submissionsExpected: z.number().int().min(0),
  submissionsCompleted: z.number().int().min(0),
});
export type EngagementScore = z.infer<typeof engagementScoreSchema>;

/** The at-risk threshold, in ONE place. v1 wrote `60` in two files (D7). */
export const AT_RISK_PCT = 60;

/**
 * The single definition of "at risk" (ruling C4, spec D7).
 *
 * v1 had three and they disagreed: absence minutes over budget (dead code),
 * `attendancePct < 60 || submissionPct < 60` on the mentor dashboard, and
 * `score < 60` on reports. This is the component-wise one, because the
 * composite hides exactly the case pastoral staff care about — a student who
 * has stopped turning up but is still submitting.
 *
 * The zero-denominator guards are new. v1 returned 0% for a component with no
 * inputs (R56), so a season with no past sessions flagged its entire cohort
 * on day one. A student cannot be at risk for missing sessions that have not
 * happened.
 */
export function isAtRisk(s: EngagementScore): boolean {
  const attendanceRisk = s.attendanceTotal > 0 && s.attendancePct < AT_RISK_PCT;
  const submissionRisk = s.submissionsExpected > 0 && s.submissionPct < AT_RISK_PCT;
  return attendanceRisk || submissionRisk;
}

/** One student's engagement, staff view. */
export const studentEngagementSchema = engagementScoreSchema.extend({
  studentUserId: z.number().int(),
  seasonId: z.number().int(),
  seasonTitle: z.string().nullable(),
  atRisk: z.boolean(),
});
export type StudentEngagement = z.infer<typeof studentEngagementSchema>;

/**
 * The SAME student's engagement as the student themselves sees it (spec D9).
 *
 * The two components are facts they can act on. The composite is a staff
 * triage number whose threshold exists to sort a cohort, and showing a young
 * person a single "engagement: 47%" figure is a product decision nobody has
 * made. `.strict()` so a server that starts leaking `score` or `atRisk` into
 * this arm fails at the client boundary instead of quietly rendering it.
 */
export const studentSelfEngagementSchema = z
  .object({
    attendancePct: z.number().int().min(0).max(100),
    submissionPct: z.number().int().min(0).max(100),
    attendanceTotal: z.number().int().min(0),
    attendancePresent: z.number().int().min(0),
    submissionsExpected: z.number().int().min(0),
    submissionsCompleted: z.number().int().min(0),
    seasonId: z.number().int(),
    seasonTitle: z.string().nullable(),
  })
  .strict();
export type StudentSelfEngagement = z.infer<typeof studentSelfEngagementSchema>;

/** One row of the cohort endpoint. */
export const engagementRowSchema = studentEngagementSchema.extend({
  studentName: z.string().nullable(),
  groupId: z.number().int().nullable(),
  groupName: z.string().nullable(),
});
export type EngagementRow = z.infer<typeof engagementRowSchema>;

export const seasonEngagementResponseSchema = z.object({
  students: z.array(engagementRowSchema),
});
```

- [ ] **Step 4: Export it**

In `packages/shared/src/index.ts`, append below the existing lines:

```ts
export * from "./note";
```

- [ ] **Step 5: Run the tests**

Run: `cd packages/shared && npx jest src/__tests__/note-schemas.test.ts` → PASS (all 11).
Run: `pnpm turbo lint typecheck --filter=@space/shared` → clean.

- [ ] **Step 6: Commit**

```bash
git add packages/shared && git commit -m "feat(shared): note and engagement Zod contracts with the single at-risk definition"
```

---

### Task 2: The visibility gate, and the note reads that cannot escape it

**Files:**
- Modify: `apps/backend/src/lib/permissions.ts` (add `noteVisibilityWhere`, `canViewNote`, `canEditNote`)
- Create: `apps/backend/src/lib/queries/notes.ts`
- Create: `apps/backend/src/lib/rate-limit.ts`
- Modify: `apps/backend/src/routes/auth.ts` (import the shared handler instead of its local copy)
- Create: `apps/backend/src/routes/notes.ts`
- Modify: `apps/backend/src/app.ts` (three mounts)
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: `apps/backend/src/__tests__/integration/notes-routes.test.ts`

**Interfaces:**
- Consumes: `canViewStudent` (Plan 5), `isSuper`/`isMentor` from `../rbac`, `noteListQuerySchema` (Task 1), `apiOk`/`apiError`, `parseId`, `requireAuth`/`requireUser`.
- Produces: `noteVisibilityWhere(user: SessionUser): Prisma.EngagementNoteWhereInput | null`; `canViewNote(user, noteId): Promise<boolean>`; `canEditNote(user, noteId): Promise<boolean>`; `listNotesForStudent(user, studentUserId, query)`; `listAuthoredNotes(user, query)`; `toNoteSummary(row, user)`; `rateLimitHandler`; the routers `notesRouter`, `studentNotesRouter`, `myNotesRouter`; endpoints `GET /api/v1/students/:id/notes` and `GET /api/v1/me/notes`.

- [ ] **Step 1: Write the failing integration tests**

```ts
// apps/backend/src/__tests__/integration/notes-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

// Same reason as the other integration suites: the shared Neon staging
// Postgres autosuspends, and the first query after idle has been measured
// around 18s.
jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let studentUserId: number;
let groupAId: number;
let mentorsNoteId: number;
let adminsNoteId: number;
let leadersNoteId: number;
let legacyHtmlNoteId: number;
let superToken: string;
let adminToken: string;
let mentorToken: string;
let insideLeaderToken: string;
let outsideLeaderToken: string;
let studentToken: string;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;

  const student = await createTestUser("note-subject", "STUDENT");
  const insideLeader = await createTestUser("note-inside-leader", "LEADER");
  const outsideLeader = await createTestUser("note-outside-leader", "LEADER");
  const admin = await createTestUser("note-admin", "ADMIN");
  const mentor = await createTestUser("note-mentor", "MENTOR");
  const superUser = await createTestUser("note-super", "SUPER");
  studentUserId = student.id;

  const groupA = await db.group.create({
    data: { seasonId, name: "Group A", leaders: { create: { userId: insideLeader.id } } },
    select: { id: true },
  });
  groupAId = groupA.id;
  const groupB = await db.group.create({
    data: { seasonId, name: "Group B", leaders: { create: { userId: outsideLeader.id } } },
    select: { id: true },
  });

  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  // Ruling C9: the enrolment carries the per-season group, and it is what every
  // gate here consults. groupB exists so outsideLeader is a real leader in the
  // same season who simply does not lead THIS student.
  await db.seasonEnrollment.create({
    data: { seasonId, studentUserId: student.id, groupId: groupA.id, status: "ACTIVE" },
  });
  expect(groupB.id).not.toBe(groupA.id);

  // Three notes, one per visibility, each by a different author. Bodies are
  // invented placeholder text — never real pastoral content.
  const mentorsNote = await db.engagementNote.create({
    data: {
      studentUserId: student.id,
      authorUserId: mentor.id,
      seasonId,
      body: "<p>space-v2-test mentors-only observation</p>",
      visibility: "MENTORS",
    },
    select: { id: true },
  });
  mentorsNoteId = mentorsNote.id;

  const adminsNote = await db.engagementNote.create({
    data: {
      studentUserId: student.id,
      authorUserId: admin.id,
      seasonId,
      body: "<p>space-v2-test admins-only observation</p>",
      visibility: "ADMINS",
    },
    select: { id: true },
  });
  adminsNoteId = adminsNote.id;

  const leadersNote = await db.engagementNote.create({
    data: {
      studentUserId: student.id,
      authorUserId: insideLeader.id,
      seasonId,
      body: "<p>space-v2-test leaders-only observation</p>",
      visibility: "LEADERS",
    },
    select: { id: true },
  });
  leadersNoteId = leadersNote.id;

  // A row in v1's exact stored format: TipTap HTML, entities and a script tag.
  // This is what the shared database already contains, and the read path has
  // to cope with it (ruling C11 — sanitise on read for everything stored).
  const legacy = await db.engagementNote.create({
    data: {
      studentUserId: student.id,
      authorUserId: insideLeader.id,
      seasonId,
      body: "<p>Legacy &amp; <b>bold</b></p><p>second line</p><script>alert(1)</script>",
      visibility: "LEADERS",
    },
    select: { id: true },
  });
  legacyHtmlNoteId = legacy.id;

  superToken = await login(app, superUser.email);
  adminToken = await login(app, admin.email);
  mentorToken = await login(app, mentor.email);
  insideLeaderToken = await login(app, insideLeader.email);
  outsideLeaderToken = await login(app, outsideLeader.email);
  studentToken = await login(app, student.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/students/:id/notes — the visibility gate", () => {
  it("gives a LEADER who leads this student only LEADERS notes and their own", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${insideLeaderToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.notes.map((n: { id: number }) => n.id);
    expect(ids).toEqual(expect.arrayContaining([leadersNoteId, legacyHtmlNoteId]));
    // THE test this plan exists for. v1's query returned all four rows and a
    // pure function in the page filtered them; here the filter is the query.
    expect(ids).not.toContain(mentorsNoteId);
    expect(ids).not.toContain(adminsNoteId);
    // And nothing else leaked either — no body of a hidden note in the payload.
    expect(JSON.stringify(res.body)).not.toContain("mentors-only");
    expect(JSON.stringify(res.body)).not.toContain("admins-only");
  });

  it("refuses a LEADER of another group in the same season outright", async () => {
    // canViewStudent fails first: this leader may not read the STUDENT at all,
    // so the visibility rule is never reached. Two gates, in order (R39).
    const res = await request(app)
      .get(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${outsideLeaderToken}`);
    expect(res.status).toBe(403);
  });

  it("gives an ADMIN only ADMINS notes — visibility is equality, not a ladder (R36)", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.notes.map((n: { id: number }) => n.id);
    expect(ids).toContain(adminsNoteId);
    expect(ids).not.toContain(leadersNoteId);
    expect(ids).not.toContain(mentorsNoteId);
  });

  it("gives a MENTOR only MENTORS notes", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${mentorToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.notes.map((n: { id: number }) => n.id);
    expect(ids).toEqual([mentorsNoteId]);
  });

  it("gives SUPER everything (R32)", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.notes.map((n: { id: number }) => n.id);
    expect(ids).toEqual(
      expect.arrayContaining([mentorsNoteId, adminsNoteId, leadersNoteId, legacyHtmlNoteId]),
    );
  });

  it("REFUSES a student their own notes explicitly — 403, never an empty array (D5 #2)", async () => {
    // An empty array would be indistinguishable from "no notes exist", which is
    // exactly the accident v1 relied on: students saw nothing because no page
    // rendered notes, not because any check refused them (R40).
    const res = await request(app)
      .get(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("returns the author's own note regardless of visibility (R33)", async () => {
    // The admin authored the ADMINS note; give the inside leader one too and
    // check the leader gets it back even though ADMINS is not their role's
    // literal.
    const own = await db.engagementNote.create({
      data: {
        studentUserId,
        authorUserId: (await db.engagementNote.findUniqueOrThrow({
          where: { id: leadersNoteId },
          select: { authorUserId: true },
        })).authorUserId,
        seasonId,
        body: "<p>space-v2-test own admins-visibility note</p>",
        visibility: "ADMINS",
      },
      select: { id: true },
    });

    const res = await request(app)
      .get(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${insideLeaderToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.notes.map((n: { id: number }) => n.id)).toContain(own.id);
  });

  it("returns plain text, not the HTML v1 stored (ruling C11)", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${superToken}`);

    const legacy = res.body.data.notes.find((n: { id: number }) => n.id === legacyHtmlNoteId);
    expect(legacy.body).toBe("Legacy & bold\nsecond line\nalert(1)");
    expect(legacy.body).not.toContain("<");
  });

  it("pages with a cursor instead of v1's silent 100-row cap (R41)", async () => {
    const first = await request(app)
      .get(`/api/v1/students/${studentUserId}/notes?limit=2`)
      .set("authorization", `Bearer ${superToken}`);
    expect(first.status).toBe(200);
    expect(first.body.data.notes).toHaveLength(2);
    expect(first.body.data.nextCursor).not.toBeNull();

    const second = await request(app)
      .get(`/api/v1/students/${studentUserId}/notes?limit=2&cursor=${first.body.data.nextCursor}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(second.status).toBe(200);
    const firstIds = first.body.data.notes.map((n: { id: number }) => n.id);
    const secondIds = second.body.data.notes.map((n: { id: number }) => n.id);
    expect(secondIds.some((id: number) => firstIds.includes(id))).toBe(false);
  });

  it("404s for a student that does not exist rather than leaking existence by 403", async () => {
    const res = await request(app)
      .get("/api/v1/students/2147483600/notes")
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(404);
  });
});

describe("GET /api/v1/me/notes", () => {
  it("returns only the caller's own notes, with the student attached", async () => {
    const res = await request(app)
      .get("/api/v1/me/notes")
      .set("authorization", `Bearer ${mentorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.notes.map((n: { id: number }) => n.id)).toEqual([mentorsNoteId]);
    expect(res.body.data.notes[0].student).toMatchObject({ id: studentUserId });
  });

  it("works for an ADMIN too — v1 had no authored-notes surface for them (R44)", async () => {
    const res = await request(app)
      .get("/api/v1/me/notes")
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.notes.map((n: { id: number }) => n.id)).toContain(adminsNoteId);
  });

  it("filters to one student with ?studentId", async () => {
    const res = await request(app)
      .get(`/api/v1/me/notes?studentId=${studentUserId}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(
      res.body.data.notes.every((n: { student: { id: number } }) => n.student.id === studentUserId),
    ).toBe(true);
  });

  it("refuses a STUDENT — they can never author a note (R51)", async () => {
    const res = await request(app)
      .get("/api/v1/me/notes")
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });
});
```

Note for the implementer: `groupAId` is asserted against in the fixture and
used by Task 3's tests in the same file — keep the `let` declaration.

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern notes-routes`
Expected: FAIL — every case 404s, no route exists.

- [ ] **Step 3: Add the gate to `lib/permissions.ts`**

Append below `canEditStudent` (Plan 5's addition). Extend the file's imports
with `import type { Prisma } from "../generated/prisma/client";` and add
`isMentor` if it is not already imported (it is).

```ts
/**
 * NoteVisibility literal → the single role that matches it.
 *
 * EQUALITY, not a hierarchy (spec R34, R37). An ADMIN does not read a LEADERS
 * note; a MENTOR does not read a LEADERS note either, despite reading every
 * student in the system. Only SUPER (R32) and the author (R33) cross the
 * boundary.
 *
 * This is v1's implemented behaviour, kept deliberately. v1's composer copy
 * promised something else ("in addition to you and admins"), and spec D3 rules
 * that reconciling them by widening access — retroactively letting admins read
 * notes written under a different promise — is a pastoral-policy decision, not
 * an engineer's. The COPY is what this migration fixes; see Task 6.
 */
const NOTE_VISIBILITY_FOR_ROLE: Partial<Record<SessionUser["role"], "LEADERS" | "MENTORS" | "ADMINS">> = {
  LEADER: "LEADERS",
  MENTOR: "MENTORS",
  ADMIN: "ADMINS",
};

/**
 * The note visibility rule, as a Prisma `where` fragment.
 *
 * This is THE most important function in this domain, and its shape is the
 * point. v1 had no read gate below the page: `loadStudentDetail` selected every
 * note for a student with no viewer argument and no visibility clause, and four
 * separate pages each had to remember to call `filterVisibleNotes` afterwards
 * and to pass the filtered array rather than the raw one (spec R38, D5). The
 * failure mode is silent — the wrong array renders perfectly, just with other
 * people's confidential notes in it — and the identical shape already shipped
 * as a live defect in this backend once (domain 4's D6).
 *
 * So: the viewer is a required argument, the rule is a `where`, and there is no
 * exported function in v2 that reads EngagementNote without one. Ruling C8.
 *
 * Returns **null** for a caller who may never read any note (STUDENT). Callers
 * must refuse on null — never substitute an empty filter, and never return an
 * empty array, which is indistinguishable from "no notes exist" (D5 #2).
 */
export function noteVisibilityWhere(user: SessionUser): Prisma.EngagementNoteWhereInput | null {
  if (user.role === "STUDENT") return null;
  if (isSuper(user)) return {};

  const visibility = NOTE_VISIBILITY_FOR_ROLE[user.role];
  const own: Prisma.EngagementNoteWhereInput = { authorUserId: user.userId };
  return visibility ? { OR: [own, { visibility }] } : own;
}

/**
 * May this caller read this specific note?
 *
 * Both gates, in order: the visibility rule on the note, then canViewStudent on
 * its subject. v1 had these as two independent implicit checks neither of which
 * knew about the other (R39), each called by hand in a page.
 */
export async function canViewNote(user: SessionUser, noteId: number): Promise<boolean> {
  const scope = noteVisibilityWhere(user);
  if (scope === null) return false;

  const note = await db.engagementNote.findFirst({
    where: { AND: [{ id: noteId }, scope] },
    select: { studentUserId: true },
  });
  if (!note) return false;
  return canViewStudent(user, note.studentUserId);
}

/**
 * May this caller edit this note? Author equality, and nothing else.
 *
 * SUPER is deliberately NOT exempt (spec R23, R28, §4 item 5). For a pastoral
 * record written by a named member of staff, "only the person who wrote it may
 * change what it says" is a defensible property and it is what v1 implements.
 * Note that this makes edit strictly narrower than view — do not derive one
 * from the other.
 */
export async function canEditNote(user: SessionUser, noteId: number): Promise<boolean> {
  const note = await db.engagementNote.findUnique({
    where: { id: noteId },
    select: { authorUserId: true },
  });
  if (!note) return false;
  return note.authorUserId === user.userId;
}
```

- [ ] **Step 4: Write the query module**

```ts
// apps/backend/src/lib/queries/notes.ts
import type { AuthoredNote, NoteListQuery, NoteSummary } from "@space/shared";

import { db } from "../../db/client";
import type { SessionUser } from "../auth/tokens";
import { noteVisibilityWhere } from "../permissions";
import { noteBodyToText } from "../note-text";

/**
 * The row shape both list functions select. Kept in one place so the two
 * projections cannot drift into disagreeing about which columns travel.
 */
const NOTE_SELECT = {
  id: true,
  body: true,
  visibility: true,
  followUpFlagged: true,
  createdAt: true,
  updatedAt: true,
  authorUserId: true,
  seasonId: true,
  authorUser: { select: { name: true, role: true } },
  season: { select: { title: true } },
} as const;

type NoteRow = {
  id: number;
  body: string;
  visibility: "LEADERS" | "MENTORS" | "ADMINS";
  followUpFlagged: boolean;
  createdAt: Date;
  updatedAt: Date;
  authorUserId: number;
  seasonId: number | null;
  authorUser: { name: string | null; role: "SUPER" | "ADMIN" | "LEADER" | "STUDENT" | "MENTOR" };
  season: { title: string } | null;
};

/**
 * `@updatedAt` fires on create as well as update, so the two timestamps are
 * within a few milliseconds of each other on an unedited row. A second of
 * tolerance separates "written" from "amended" without a new column (C1).
 * v1 wrote updatedAt and never read it (R24, R26); D4 #3 says surface it.
 */
function wasEdited(row: { createdAt: Date; updatedAt: Date }): boolean {
  return row.updatedAt.getTime() - row.createdAt.getTime() > 1000;
}

export function toNoteSummary(row: NoteRow, user: SessionUser): NoteSummary {
  return {
    id: row.id,
    // Plain text on the wire, always. The stored column holds v1's TipTap HTML
    // for every pre-migration row (ruling C11 — sanitise on read for what is
    // already stored).
    body: noteBodyToText(row.body),
    visibility: row.visibility,
    followUpFlagged: row.followUpFlagged,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    edited: wasEdited(row),
    authorId: row.authorUserId,
    authorName: row.authorUser.name,
    authorRole: row.authorUser.role,
    seasonId: row.seasonId,
    seasonTitle: row.season?.title ?? null,
    // Server-derived (ruling C4): the client must not compare author ids to
    // decide whether to render an edit control.
    canEdit: row.authorUserId === user.userId,
  };
}

export interface NotePage<T> {
  notes: T[];
  nextCursor: string | null;
}

function cursorClause(cursor: string | undefined) {
  const id = Number(cursor);
  return cursor !== undefined && Number.isInteger(id) && id > 0
    ? { cursor: { id }, skip: 1 }
    : {};
}

/**
 * Notes about one student, narrowed to what THIS viewer may read.
 *
 * There is deliberately no variant of this function without a `user`. That is
 * the whole lesson of spec D5: the unfiltered variant is what every future
 * caller forgets to wrap.
 *
 * Returns null when the caller may read no notes at all — the route must turn
 * that into a 403, not an empty page.
 */
export async function listNotesForStudent(
  user: SessionUser,
  studentUserId: number,
  query: NoteListQuery,
): Promise<NotePage<NoteSummary> | null> {
  const scope = noteVisibilityWhere(user);
  if (scope === null) return null;

  const rows = await db.engagementNote.findMany({
    where: { AND: [{ studentUserId }, scope] },
    // createdAt is the domain's ordering key (R39) and the head of the
    // [studentUserId, createdAt] index; id breaks ties so the cursor is stable.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...cursorClause(query.cursor),
    select: NOTE_SELECT,
  });

  const page = rows.slice(0, query.limit);
  return {
    notes: page.map((r) => toNoteSummary(r, user)),
    nextCursor: rows.length > query.limit ? String(page[page.length - 1]?.id ?? "") || null : null,
  };
}

/**
 * Notes THIS caller wrote, across students.
 *
 * v1 offered this to MENTOR only (R44) even though four roles can author. The
 * author-equality narrowing is the whole protection here — R33 makes the
 * visibility filter a no-op over one's own notes — so it is a `where` clause,
 * not a post-filter.
 */
export async function listAuthoredNotes(
  user: SessionUser,
  query: NoteListQuery,
): Promise<NotePage<AuthoredNote>> {
  const rows = await db.engagementNote.findMany({
    where: {
      authorUserId: user.userId,
      ...(query.studentId ? { studentUserId: query.studentId } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...cursorClause(query.cursor),
    select: {
      ...NOTE_SELECT,
      studentUserId: true,
      studentUser: { select: { name: true, email: true } },
    },
  });

  const page = rows.slice(0, query.limit);
  return {
    notes: page.map((r) => ({
      ...toNoteSummary(r, user),
      student: { id: r.studentUserId, name: r.studentUser.name, email: r.studentUser.email },
    })),
    nextCursor: rows.length > query.limit ? String(page[page.length - 1]?.id ?? "") || null : null,
  };
}
```

`noteBodyToText` does not exist yet — it lands in Task 3 with the rest of the
text handling. Create `apps/backend/src/lib/note-text.ts` now with just that
function and its helper so this task compiles; Task 3 adds the write-side
half to the same file. Copy the implementation and its doc comment verbatim
from Task 3 Step 3 rather than writing a placeholder.

- [ ] **Step 5: Extract the rate-limit handler**

```ts
// apps/backend/src/lib/rate-limit.ts
import type { Options as RateLimitOptions } from "express-rate-limit";

import { apiError } from "./api-response";

/**
 * express-rate-limit's default 429 body is plain text, which would be the one
 * response in the API outside the { error: { code, message } } envelope.
 * Extracted from routes/auth.ts so the notes routes reuse the same handler
 * rather than growing a second copy that drifts.
 */
export const rateLimitHandler: RateLimitOptions["handler"] = (_req, res) => {
  apiError(res, "too_many_requests", "Too many requests. Please try again later.", 429);
};
```

In `apps/backend/src/routes/auth.ts`, delete the local `rateLimitHandler`
const and import it from `"../lib/rate-limit"` instead. Nothing else in that
file changes; `authLimiter` and `refreshLimiter` keep their windows and limits.

- [ ] **Step 6: Write the read routes**

```ts
// apps/backend/src/routes/notes.ts
import { Router } from "express";
import rateLimit from "express-rate-limit";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { parseId } from "../lib/parse-id";
import { canViewStudent } from "../lib/permissions";
import { listAuthoredNotes, listNotesForStudent } from "../lib/queries/notes";
import { rateLimitHandler } from "../lib/rate-limit";
import { requireAuth, requireUser } from "../middleware/require-auth";
import { noteListQuerySchema } from "../../../../packages/shared/src/index";

/**
 * Notes are mounted as three routers from one file rather than as routes added
 * to routes/students.ts and routes/me.ts.
 *
 * The specced URLs are nested under other domains (GET /students/:id/notes,
 * GET /me/notes), but spec D5 #3 requires notes never to ride inside another
 * domain's payload or handler — the student-detail response is only as safe as
 * its most careless consumer. Three mounts of one router keeps every specced
 * URL and keeps the whole pastoral surface in one file that can be reviewed as
 * a unit. Express falls through an unmatched path to the next router on the
 * same prefix, so mounting after studentsRouter shadows nothing.
 */
export const notesRouter = Router();
export const studentNotesRouter = Router();
export const myNotesRouter = Router();

/**
 * Spec D15: once notes are an API, a compromised staff token can enumerate
 * /students/:id/notes across every student id and exfiltrate the entire
 * pastoral record set at machine speed, and nothing in v1 or in this backend
 * would record it. Generous enough for a person paging through a caseload,
 * far below a scripted sweep.
 */
const noteReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  handler: rateLimitHandler,
});

notesRouter.use(requireAuth);
studentNotesRouter.use(requireAuth);
myNotesRouter.use(requireAuth);

/**
 * Spec D15 again: "who looked at what" is a question someone may one day have
 * to answer about records concerning named young people. Ids and a count only
 * — never a body, never a name.
 */
function auditNoteRead(viewerId: number, studentUserId: number, noteCount: number): void {
  console.info(
    JSON.stringify({
      event: "note_read",
      viewerId,
      studentUserId,
      noteCount,
      at: new Date().toISOString(),
    }),
  );
}

studentNotesRouter.get("/:id/notes", noteReadLimiter, async (req, res) => {
  const user = requireUser(req);
  const studentUserId = parseId(req.params.id);
  if (studentUserId === null) return apiError(res, "bad_request", "Invalid student id.", 400);

  // Explicit, and first. v1 excluded students by the absence of a screen
  // (R40) — in v2 the student opens the same app over the same API, so the
  // refusal has to be a rule. 403 rather than an empty array, which would be
  // indistinguishable from "this student has no notes" (D5 #2, D6).
  if (user.role === "STUDENT") {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const student = await db.user.findFirst({
    where: { id: studentUserId, role: "STUDENT" },
    select: { id: true },
  });
  if (!student) return apiError(res, "not_found", "Student not found.", 404);

  // Gate one: may this caller see the student at all. Gate two is inside the
  // query. v1 had both as page-level conventions that did not know about each
  // other (R39).
  if (!(await canViewStudent(user, studentUserId))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const parsed = noteListQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid query.", 400);

  const page = await listNotesForStudent(user, studentUserId, parsed.data);
  if (page === null) return apiError(res, "forbidden", "You don't have access to this.", 403);

  auditNoteRead(user.userId, studentUserId, page.notes.length);
  return apiOk(res, page);
});

myNotesRouter.get("/notes", noteReadLimiter, async (req, res) => {
  const user = requireUser(req);
  // Only the four roles that can author have anything to list (R46–R49, R51).
  if (user.role === "STUDENT") {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const parsed = noteListQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid query.", 400);

  return apiOk(res, await listAuthoredNotes(user, parsed.data));
});
```

In `apps/backend/src/app.ts`, import the three routers and mount them **after**
the existing routers:

```ts
import { myNotesRouter, notesRouter, studentNotesRouter } from "./routes/notes";
```

```ts
  // Notes mount three ways on purpose — see the comment in routes/notes.ts.
  // These sit after the domain routers whose prefixes they share: Express
  // falls through unmatched paths, and /students/:id/notes cannot be matched
  // by studentsRouter's /:id.
  app.use("/api/v1/notes", notesRouter);
  app.use("/api/v1/students", studentNotesRouter);
  app.use("/api/v1/me", myNotesRouter);
```

- [ ] **Step 7: Run the suite**

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern notes-routes` → PASS (all read cases).
Run: `pnpm turbo lint typecheck test:unit --filter=@space/backend` → clean.

- [ ] **Step 8: OpenAPI, same commit**

Add `GET /api/v1/students/{id}/notes` and `GET /api/v1/me/notes` to
`apps/backend/src/docs/openapi.ts` with the `NoteSummary` and `AuthoredNote`
response interfaces and a prose `description` per house style, stating: the
visibility rule is applied in the query and is equality-based (an ADMIN does
not read a LEADERS note); a STUDENT receives `403`, never an empty list; and
`body` is plain text, not the HTML the column holds. Document the `403`
`forbidden`, `404` `not_found` and `429` `too_many_requests` codes.

- [ ] **Step 9: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): row-scoped note visibility gate and the reads that cannot escape it"
```

---

### Task 3: Note writes — sanitisation, the follow-up notification, and the delete that is not shipped

**Files:**
- Create: `apps/backend/src/lib/html.ts`
- Modify: `apps/backend/src/lib/note-text.ts` (add the write half beside Task 2's `noteBodyToText`)
- Modify: `apps/backend/src/lib/email.ts` (escape every interpolation; extract `buildNotificationHtml`)
- Modify: `apps/backend/src/lib/permissions.ts` (add `canWriteNote`)
- Modify: `apps/backend/src/routes/notes.ts` (POST / PATCH / DELETE)
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: `apps/backend/src/__tests__/note-text.test.ts` (unit), `apps/backend/src/__tests__/email-html.test.ts` (unit), extend `apps/backend/src/__tests__/integration/notes-routes.test.ts`

**Interfaces:**
- Consumes: `createNoteRequestSchema`, `updateNoteRequestSchema` (Task 1), `canEditNote` / `noteVisibilityWhere` (Task 2), `toNoteSummary` (Task 2), `createNotificationsBulk`.
- Produces: `escapeHtml(input: string): string`; `toStoredNoteHtml(text: string): string`; `noteBodyToText(stored: string): string`; `buildNotificationHtml(title, body, viewLink): string`; `canWriteNote(user, studentUserId): Promise<boolean>`; endpoints `POST /api/v1/students/:id/notes`, `PATCH /api/v1/notes/:id`, `DELETE /api/v1/notes/:id`.

**The security argument, stated once.** Spec D1 option 2 says "keep HTML on the
wire, sanitise on write and on read, render through a whitelisting RN HTML
component". This plan takes the same decision one step further and carries
**plain text** on the wire, because the whitelisting half is the expensive,
error-prone half and React Native does not need it: nothing in `apps/mobile`
renders HTML, and the only HTML sink in the whole system is email, which
escapes. That leaves escaping — five characters, trivially correct — as the
security boundary, and tag-stripping as a mere presentation conversion for
v1's existing rows. No sanitiser dependency is added, and no whitelist can rot.
The stored column keeps paragraph-wrapped escaped HTML so v1's still-running
`dangerouslySetInnerHTML` readers render v2's notes correctly and safely.

- [ ] **Step 1: Write the failing unit tests**

```ts
// apps/backend/src/__tests__/note-text.test.ts
import { noteBodyToText, toStoredNoteHtml } from "../lib/note-text";

describe("toStoredNoteHtml — the write half", () => {
  it("escapes markup so nothing a caller sends can execute in v1's raw render", () => {
    expect(toStoredNoteHtml("<script>alert(1)</script>")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
  });

  it("wraps each line in a paragraph so v1's reader still renders it as prose", () => {
    expect(toStoredNoteHtml("first\nsecond")).toBe("<p>first</p><p>second</p>");
  });

  it("escapes ampersands and quotes", () => {
    expect(toStoredNoteHtml(`Tom & "Jerry"`)).toBe("<p>Tom &amp; &quot;Jerry&quot;</p>");
  });
});

describe("noteBodyToText — the read half", () => {
  it("round-trips what the write half stored", () => {
    const original = `Tom & "Jerry"\nsecond line`;
    expect(noteBodyToText(toStoredNoteHtml(original))).toBe(original);
  });

  it("renders v1's TipTap rows as readable text with the tags gone", () => {
    expect(noteBodyToText("<p>Legacy &amp; <b>bold</b></p><p>second line</p>")).toBe(
      "Legacy & bold\nsecond line",
    );
  });

  it("turns <br> into a line break rather than joining words", () => {
    expect(noteBodyToText("<p>one<br>two</p>")).toBe("one\ntwo");
  });

  it("leaves no angle bracket behind for any sink to interpret", () => {
    expect(noteBodyToText("<p>a</p><script>alert(1)</script>")).not.toContain("<");
  });

  it("decodes &amp; last, so an escaped entity does not become a live one", () => {
    // "&amp;lt;" is the stored form of the literal text "&lt;". Decoding &amp;
    // first would yield "&lt;" and a second pass would turn it into "<".
    expect(noteBodyToText("<p>&amp;lt;</p>")).toBe("&lt;");
  });
});
```

```ts
// apps/backend/src/__tests__/email-html.test.ts
import { buildNotificationHtml } from "../lib/email";

describe("buildNotificationHtml", () => {
  it("escapes the title — v1 interpolated it into an <h1> untouched", () => {
    const html = buildNotificationHtml("<script>alert(1)</script>", null, null);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes the body", () => {
    const html = buildNotificationHtml("Follow-up flagged", "<img src=x onerror=alert(1)>", null);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("escapes the link before it lands in an href attribute", () => {
    const html = buildNotificationHtml("Title", null, `https://x.test/a"onmouseover="alert(1)`);
    expect(html).not.toContain(`"onmouseover="`);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/backend && npx jest src/__tests__/note-text.test.ts src/__tests__/email-html.test.ts`
Expected: FAIL — `toStoredNoteHtml` and `buildNotificationHtml` are not exported.

- [ ] **Step 3: Write the text handling**

```ts
// apps/backend/src/lib/html.ts
const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * The one escaper. Ruling C11 says nothing renders as HTML and every mail
 * interpolation escapes; this is what both halves of that call.
 *
 * Five characters, no whitelist, nothing to keep up to date — which is exactly
 * why the wire format for note bodies is plain text rather than sanitised
 * HTML. The hard part of sanitising is deciding what to KEEP, and nothing in
 * this product needs to keep any of it.
 */
export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}
```

```ts
// apps/backend/src/lib/note-text.ts
import { escapeHtml } from "./html";

/**
 * Plain text → the form stored in EngagementNote.body.
 *
 * The column is shared with a running v1 that renders it with
 * dangerouslySetInnerHTML in two places (spec R6, D1), so v2 cannot store raw
 * text there without changing how v1 displays it — and must not store anything
 * a caller could turn into markup. Escaping and wrapping each line in a
 * paragraph satisfies both: v1 renders v2's notes as prose, and a body
 * containing <script> arrives in an admin's browser as visible text.
 */
export function toStoredNoteHtml(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

const ENTITIES: [RegExp, string][] = [
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&quot;/g, '"'],
  [/&#0?39;/g, "'"],
  [/&apos;/g, "'"],
  [/&nbsp;/g, " "],
  // &amp; LAST. Decoding it first would turn the stored "&amp;lt;" — the
  // escaped form of the literal text "&lt;" — into "&lt;", which the next rule
  // would then decode into a live "<".
  [/&amp;/g, "&"],
];

/**
 * The stored column → plain text for the wire.
 *
 * Ruling C11 requires sanitising on read for everything already stored, and
 * every pre-migration row is TipTap HTML written by v1. Block-level closers
 * become newlines first so "<p>a</p><p>b</p>" reads as two lines rather than
 * "ab"; then all tags go.
 *
 * This is a presentation conversion, NOT the security boundary. Its output is
 * rendered as text by React Native and escaped again by lib/html.ts before it
 * ever reaches an HTML sink, so a tag this regex fails to recognise is a
 * cosmetic bug, not an injection.
 */
export function noteBodyToText(stored: string): string {
  const withBreaks = stored
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  const stripped = withBreaks.replace(/<[^>]*>/g, "");
  const decoded = ENTITIES.reduce((acc, [pattern, char]) => acc.replace(pattern, char), stripped);
  return decoded.replace(/\n{3,}/g, "\n\n").trim();
}
```

If Task 2 already created `note-text.ts` with `noteBodyToText`, this step adds
`toStoredNoteHtml` and the `html.ts` import beside it — do not duplicate the
file.

- [ ] **Step 4: Escape every mail interpolation**

In `apps/backend/src/lib/email.ts`, extract and export the body builder, and
escape at every interpolation site. `renderShell`'s `title` argument is now
pre-escaped by its caller:

```ts
import { escapeHtml } from "./html";

/**
 * The notification email's body, as a pure function so the escaping is
 * testable without a transport.
 *
 * Ruling C11: v1 interpolated a notification's title and body straight into
 * this HTML (jpc-space/src/lib/email.ts:145-150). The worst case it enabled is
 * spec D2 — the first 140 characters of a pastoral note, raw HTML and possibly
 * cut mid-tag, mailed to every season admin. v2 does not put note content in a
 * notification at all (see routes/notes.ts), and escapes regardless, because
 * "no caller currently passes markup" is not a property anyone can maintain.
 */
export function buildNotificationHtml(
  title: string,
  body: string | null,
  viewLink: string | null,
): string {
  const bodyHtml = `
    <p style="font-size: 16px; color: ${TEXT}; line-height: 1.6; margin: 0 0 24px 0;">
      ${escapeHtml(body ?? "You have a new notification in JPC Space.")}
    </p>
    ${viewLink ? buttonHtml(escapeHtml(viewLink), "View in JPC Space") : ""}
  `;
  return renderShell(escapeHtml(title), "Jesus Project Community", bodyHtml);
}
```

and in `sendNotificationEmail`, replace the inline `bodyHtml` construction and
the `renderShell(...)` call with:

```ts
  await getTransporter().sendMail({
    from: fromAddress(),
    to: email,
    subject: `JPC Space — ${title}`,
    html: buildNotificationHtml(title, body, viewLink),
  });
```

(The `subject` is a plain-text header, not HTML — it stays unescaped.)

- [ ] **Step 5: Run the unit tests**

Run: `cd apps/backend && npx jest src/__tests__/note-text.test.ts src/__tests__/email-html.test.ts` → PASS (all 9).

- [ ] **Step 6: Write the failing integration tests**

Append to `apps/backend/src/__tests__/integration/notes-routes.test.ts`:

```ts
describe("POST /api/v1/students/:id/notes", () => {
  it("stores a note authored by the session user, and returns it as plain text", async () => {
    const res = await request(app)
      .post(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${insideLeaderToken}`)
      .send({ body: "space-v2-test wrote a note", visibility: "LEADERS" });

    expect(res.status).toBe(201);
    expect(res.body.data.note).toMatchObject({
      body: "space-v2-test wrote a note",
      visibility: "LEADERS",
      followUpFlagged: false,
      edited: false,
      canEdit: true,
    });

    const row = await db.engagementNote.findUniqueOrThrow({
      where: { id: res.body.data.note.id },
      select: { authorUserId: true, seasonId: true, body: true },
    });
    // authorUserId comes from the session, never from input (R9), and the
    // season defaults from the student's enrolment (R4).
    expect(row.authorUserId).toBe(res.body.data.note.authorId);
    expect(row.seasonId).toBe(seasonId);
    expect(row.body).toBe("<p>space-v2-test wrote a note</p>");
  });

  it("neutralises markup on the way in and on the way out (ruling C11)", async () => {
    const created = await request(app)
      .post(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ body: "<script>alert(1)</script> space-v2-test", visibility: "ADMINS" });

    expect(created.status).toBe(201);
    const row = await db.engagementNote.findUniqueOrThrow({
      where: { id: created.body.data.note.id },
      select: { body: true },
    });
    // The stored column is what v1 renders raw, so this is the assertion that
    // matters: no live tag ever lands in it.
    expect(row.body).not.toContain("<script");
    expect(row.body).toContain("&lt;script&gt;");
    // And the wire carries text, which React Native renders as text.
    expect(created.body.data.note.body).toBe("<script>alert(1)</script> space-v2-test");
  });

  it("refuses a LEADER who does not lead this student (R49 through SeasonEnrollment)", async () => {
    const res = await request(app)
      .post(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${outsideLeaderToken}`)
      .send({ body: "space-v2-test should not land", visibility: "LEADERS" });
    expect(res.status).toBe(403);
  });

  it("refuses a STUDENT writing about themselves (R51)", async () => {
    const res = await request(app)
      .post(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ body: "space-v2-test self note", visibility: "LEADERS" });
    expect(res.status).toBe(403);
  });

  it("lets an ADMIN write about an enrolled student even with no activeSeasonId (D12)", async () => {
    // v1's gate read StudentProfile.activeSeasonId, so an admin could OPEN a
    // student they could not write about (R47/R48). This student has an
    // enrolment in the admin's season and no StudentProfile row at all.
    const res = await request(app)
      .post(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ body: "space-v2-test admin note", visibility: "ADMINS" });
    expect(res.status).toBe(201);
  });

  it("rejects a seasonId the student is not enrolled in", async () => {
    const other = await createTestSeason();
    const res = await request(app)
      .post(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ body: "space-v2-test wrong season", visibility: "ADMINS", seasonId: other.id });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("season_not_enrolled");
  });

  it("notifies season admins on a flagged note WITHOUT quoting it (spec D2)", async () => {
    const before = await db.notification.count({ where: { type: "MENTOR_FOLLOWUP" } });

    const res = await request(app)
      .post(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${superToken}`)
      .send({
        body: "space-v2-test confidential sentence that must not travel",
        visibility: "MENTORS",
        followUpFlagged: true,
      });
    expect(res.status).toBe(201);

    const notifications = await db.notification.findMany({
      where: { type: "MENTOR_FOLLOWUP" },
      orderBy: { id: "desc" },
      take: 1,
      select: { body: true, title: true, link: true },
    });
    expect(await db.notification.count({ where: { type: "MENTOR_FOLLOWUP" } })).toBe(before + 1);
    // v1 put body.slice(0, 140) here and mailed it unescaped to every season
    // admin — including admins who cannot open the note in the app at all.
    expect(notifications[0]?.body).not.toContain("confidential");
    expect(notifications[0]?.title).toContain("Follow-up flagged");
    expect(notifications[0]?.link).toBe(`/admin/students/${studentUserId}`);
  });
});

describe("PATCH /api/v1/notes/:id", () => {
  it("lets the author correct the body and marks the note edited", async () => {
    const created = await request(app)
      .post(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${insideLeaderToken}`)
      .send({ body: "space-v2-test first wording", visibility: "LEADERS" });

    const res = await request(app)
      .patch(`/api/v1/notes/${created.body.data.note.id}`)
      .set("authorization", `Bearer ${insideLeaderToken}`)
      .send({ body: "space-v2-test corrected wording" });

    expect(res.status).toBe(200);
    expect(res.body.data.note.body).toBe("space-v2-test corrected wording");
  });

  it("refuses everyone but the author — SUPER included (R23)", async () => {
    const res = await request(app)
      .patch(`/api/v1/notes/${leadersNoteId}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ body: "space-v2-test rewritten by someone else" });
    expect(res.status).toBe(403);
  });

  it("validates the body v1's update did not validate at all (R25)", async () => {
    const created = await request(app)
      .post(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${insideLeaderToken}`)
      .send({ body: "space-v2-test to be emptied", visibility: "LEADERS" });

    const res = await request(app)
      .patch(`/api/v1/notes/${created.body.data.note.id}`)
      .set("authorization", `Bearer ${insideLeaderToken}`)
      .send({ body: "" });
    expect(res.status).toBe(400);
  });

  it("cannot change visibility or the follow-up flag (R24)", async () => {
    const created = await request(app)
      .post(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${insideLeaderToken}`)
      .send({ body: "space-v2-test immutable fields", visibility: "LEADERS" });

    await request(app)
      .patch(`/api/v1/notes/${created.body.data.note.id}`)
      .set("authorization", `Bearer ${insideLeaderToken}`)
      .send({ body: "space-v2-test still leaders", visibility: "ADMINS", followUpFlagged: true });

    const row = await db.engagementNote.findUniqueOrThrow({
      where: { id: created.body.data.note.id },
      select: { visibility: true, followUpFlagged: true },
    });
    expect(row).toMatchObject({ visibility: "LEADERS", followUpFlagged: false });
  });
});

describe("DELETE /api/v1/notes/:id", () => {
  it("answers 501 — delete needs a deletedAt column, which C1 forbids (spec D4 #2)", async () => {
    const res = await request(app)
      .delete(`/api/v1/notes/${leadersNoteId}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe("delete_unavailable");

    // And nothing was destroyed.
    expect(
      await db.engagementNote.findUnique({ where: { id: leadersNoteId }, select: { id: true } }),
    ).not.toBeNull();
  });
});
```

The `createTestSeason` import must be added to the suite's fixture import line
if the read tests did not already need it (they did — it is imported).

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern notes-routes` → the new cases FAIL (404 / 405).

- [ ] **Step 7: Add the write gate**

Append to `apps/backend/src/lib/permissions.ts`:

```ts
/**
 * May this caller write a note about this student?
 *
 * Two deliberate divergences from v1's canWriteNote
 * (jpc-space/src/lib/auth/permissions.ts:405-427):
 *
 * 1. ADMIN resolves through SeasonEnrollment, not StudentProfile.activeSeasonId
 *    (spec D12, R47/R48). v1's gate meant an admin lost the ability to write
 *    about a student the moment that student's active-season pointer moved,
 *    while canViewStudent — which checks enrolments — still let them open the
 *    page. "Why can't I write a note about this student I can clearly see" is
 *    a support question with a code answer.
 * 2. LEADER resolves through SeasonEnrollment.groupId, not GroupStudent
 *    (ruling C9, R49/R50). GroupStudent.studentUserId is @unique across the
 *    whole database, so it holds one group per student for all time; asking it
 *    here follows a student's CURRENT group across every season and refuses
 *    any student who has no GroupStudent row at all.
 *
 * SUPER and MENTOR write about any student with no scope check — v1's R46,
 * kept. It matches canReadAllStudents, and spec §4 item 7 records the
 * consequence plainly: one compromised mentor account reaches every pastoral
 * record in the product.
 */
export async function canWriteNote(user: SessionUser, studentUserId: number): Promise<boolean> {
  if (isSuper(user) || isMentor(user)) return true;

  if (user.role === "ADMIN") {
    if (user.seasonAdminIds.length === 0) return false;
    const enrollment = await db.seasonEnrollment.findFirst({
      where: { studentUserId, seasonId: { in: user.seasonAdminIds } },
      select: { id: true },
    });
    return enrollment !== null;
  }

  if (user.role === "LEADER") {
    if (user.groupLeaderIds.length === 0) return false;
    const enrollment = await db.seasonEnrollment.findFirst({
      where: { studentUserId, groupId: { in: user.groupLeaderIds } },
      select: { id: true },
    });
    return enrollment !== null;
  }

  // STUDENT can never write a note, including about themselves (R51).
  return false;
}
```

- [ ] **Step 8: Write the three handlers**

Append to `apps/backend/src/routes/notes.ts` (extend its imports with
`canEditNote`, `canWriteNote` from `../lib/permissions`, `toNoteSummary` from
`../lib/queries/notes`, `toStoredNoteHtml` from `../lib/note-text`,
`createNotificationsBulk` from `../lib/notifications`, and
`createNoteRequestSchema` / `updateNoteRequestSchema` from the shared relative
import):

```ts
const NOTE_SELECT_FOR_SUMMARY = {
  id: true,
  body: true,
  visibility: true,
  followUpFlagged: true,
  createdAt: true,
  updatedAt: true,
  authorUserId: true,
  seasonId: true,
  authorUser: { select: { name: true, role: true } },
  season: { select: { title: true } },
} as const;

studentNotesRouter.post("/:id/notes", async (req, res) => {
  const user = requireUser(req);
  const studentUserId = parseId(req.params.id);
  if (studentUserId === null) return apiError(res, "bad_request", "Invalid student id.", 400);

  const student = await db.user.findFirst({
    where: { id: studentUserId, role: "STUDENT" },
    select: { id: true },
  });
  if (!student) return apiError(res, "not_found", "Student not found.", 404);

  // Gated independently of the read path (ruling C8 #1): narrowing a list only
  // hides rows, it does not stop a caller who already knows an id.
  if (!(await canWriteNote(user, studentUserId))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const parsed = createNoteRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid note body.", 400);

  // R4: default the season from the student's enrolment. R5 records that v1
  // never maintains this afterwards — a note keeps pointing at the season it
  // was written in, which is the right behaviour for a dated record and is
  // kept. When the caller names a season it must be one this student is
  // actually enrolled in, or the note files itself under a season nobody can
  // reach it from.
  let seasonId: number | null = null;
  if (parsed.data.seasonId !== undefined) {
    const enrollment = await db.seasonEnrollment.findUnique({
      where: {
        studentUserId_seasonId: { studentUserId, seasonId: parsed.data.seasonId },
      },
      select: { seasonId: true },
    });
    if (!enrollment) {
      return apiError(res, "season_not_enrolled", "That student is not enrolled in that season.", 400);
    }
    seasonId = enrollment.seasonId;
  } else {
    const active = await db.seasonEnrollment.findFirst({
      where: { studentUserId, status: "ACTIVE" },
      orderBy: { enrolledAt: "desc" },
      select: { seasonId: true },
    });
    seasonId = active?.seasonId ?? null;
  }

  const created = await db.engagementNote.create({
    data: {
      studentUserId,
      // From the session, never from input (R9).
      authorUserId: user.userId,
      seasonId,
      body: toStoredNoteHtml(parsed.data.body),
      visibility: parsed.data.visibility,
      followUpFlagged: parsed.data.followUpFlagged,
    },
    select: NOTE_SELECT_FOR_SUMMARY,
  });

  // R13: flagged AND seasoned. A flagged note about a student with no season
  // notifies nobody, exactly as in v1 — there is no season whose admins to
  // notify. R14: recipients are that season's admins only.
  if (parsed.data.followUpFlagged && seasonId !== null) {
    const [admins, subject] = await Promise.all([
      db.seasonAdmin.findMany({ where: { seasonId }, select: { userId: true } }),
      db.user.findUnique({ where: { id: studentUserId }, select: { name: true } }),
    ]);
    if (admins.length > 0) {
      try {
        await createNotificationsBulk(
          admins.map((a) => a.userId),
          {
            type: "MENTOR_FOLLOWUP",
            title: `Follow-up flagged for ${subject?.name ?? "a student"}`,
            // NO EXCERPT. v1 put body.slice(0, 140) here — raw HTML, possibly
            // cut mid-tag — and createNotificationsBulk mails it onward, so
            // confidential content about a named young person left the system
            // to every season admin's inbox, including admins who cannot open
            // the note in the app at all (spec D2, R16/R17, R36). The
            // notification says a follow-up exists and links to it.
            body: "A member of staff flagged a note for follow-up. Open the student to read it.",
            // v1's link, verbatim. Rewriting notification links to v2's route
            // tree is one change across every notification type and is a
            // cutover item, not this plan's.
            link: `/admin/students/${studentUserId}`,
          },
        );
      } catch {
        // Best-effort, matching the review path in routes/submissions.ts: a
        // mail or notification failure must not report the note as unsaved.
        // v1 was non-transactional here too (R20) and failed in the same
        // direction — note kept, nobody told — but silently.
      }
    }
  }

  return apiOk(res, { note: toNoteSummary(created, user) }, 201);
});

notesRouter.patch("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid note id.", 400);

  const existing = await db.engagementNote.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return apiError(res, "not_found", "Note not found.", 404);
  // Author equality, SUPER not exempt (R23).
  if (!(await canEditNote(user, id))) {
    return apiError(res, "forbidden", "Only the note's author can edit it.", 403);
  }

  const parsed = updateNoteRequestSchema.safeParse(req.body);
  // v1's update validated nothing at all, so an edit could blank a note
  // entirely (R25). Same bound as create.
  if (!parsed.success) return apiError(res, "bad_request", "Invalid note body.", 400);

  const updated = await db.engagementNote.update({
    where: { id },
    // body only. visibility, followUpFlagged and seasonId are immutable after
    // creation (R24) — a note written to the wrong audience is corrected by
    // writing a new one, not by silently re-aiming the old one.
    data: { body: toStoredNoteHtml(parsed.data.body) },
    select: NOTE_SELECT_FOR_SUMMARY,
  });

  return apiOk(res, { note: toNoteSummary(updated, user) });
});

/**
 * Delete is declared and refused, rather than absent.
 *
 * Spec D4 #2: v1's delete is a HARD delete with no tombstone, and it has no UI
 * caller anywhere — in practice v1 notes are permanent. Shipping a hard delete
 * that v1's users never had, and adding soft delete later, destroys every note
 * removed in between, irrecoverably, about named young people. Soft delete
 * needs a deletedAt column; C1 forbids the migration while v1 writes to this
 * table. So the capability waits for cutover.
 *
 * 501 rather than 404 so a client can tell "this note does not exist" from
 * "this system cannot delete notes yet" and say the right thing.
 */
notesRouter.delete("/:id", (_req, res) =>
  apiError(
    res,
    "delete_unavailable",
    "Notes cannot be deleted yet. Correct a note by editing it.",
    501,
  ),
);
```

- [ ] **Step 9: Run everything this task touched**

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern notes-routes` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/backend` → clean. (`notifications.test.ts` exercises `createNotificationsBulk`; confirm the email change did not break it.)

- [ ] **Step 10: OpenAPI, same commit**

Document `POST /api/v1/students/{id}/notes`, `PATCH /api/v1/notes/{id}` and
`DELETE /api/v1/notes/{id}` in `apps/backend/src/docs/openapi.ts`: the request
bodies, the `201` shape, and the codes `forbidden` 403, `not_found` 404,
`season_not_enrolled` 400, `delete_unavailable` 501. The prose must state that
`body` is plain text in both directions, that only the author may edit, and
that the follow-up notification deliberately carries no excerpt of the note.

- [ ] **Step 11: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): note writes with escaped bodies, excerpt-free follow-up, and no hard delete"
```

---

### Task 4: Engagement computed once, server-side

**Files:**
- Create: `apps/backend/src/lib/queries/engagement.ts`
- Create: `apps/backend/src/routes/engagement.ts`
- Modify: `apps/backend/src/app.ts` (two mounts)
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: `apps/backend/src/__tests__/integration/engagement-routes.test.ts`

**Interfaces:**
- Consumes: `isAtRisk`, `EngagementRow`, `StudentEngagement`, `StudentSelfEngagement` (Task 1); `canViewStudent` (Plan 5), `canAccessSeason` and `staffScopeForSeason` (existing, `lib/permissions.ts`).
- Produces: `computeEngagementForSeason(seasonId, opts): Promise<EngagementRow[]>`; the routers `studentEngagementRouter`, `seasonEngagementRouter`; endpoints `GET /api/v1/students/:id/engagement`, `GET /api/v1/seasons/:id/engagement`.

**Query budget.** Spec §5 asks for "two queries for the whole cohort". This
lands at **five**, and the load-bearing property is that it is five regardless
of cohort size, against v1's 4N concurrent (R80) or 4N sequential (R81). It
cannot be two because two of the per-student inputs are not expressible as a
single `groupBy`: the attendance denominator is cut per student at their own
`enrolledAt` (D8 #1), and assignment targeting depends on each student's group
for that season (C9). Both are resolved in memory from cohort-wide fetches.

- [ ] **Step 1: Write the failing integration tests**

```ts
// apps/backend/src/__tests__/integration/engagement-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { newPublicId } from "../../lib/public-id";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let groupAId: number;
let earlyStudentId: number;
let lateJoinerId: number;
let otherGroupStudentId: number;
let superToken: string;
let leaderToken: string;
let earlyStudentToken: string;
let lateJoinerToken: string;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;

  const early = await createTestUser("eng-early", "STUDENT");
  const late = await createTestUser("eng-late", "STUDENT");
  const otherGroup = await createTestUser("eng-other", "STUDENT");
  const leader = await createTestUser("eng-leader", "LEADER");
  const superUser = await createTestUser("eng-super", "SUPER");
  earlyStudentId = early.id;
  lateJoinerId = late.id;
  otherGroupStudentId = otherGroup.id;

  const groupA = await db.group.create({
    data: { seasonId, name: "Group A", leaders: { create: { userId: leader.id } } },
    select: { id: true },
  });
  groupAId = groupA.id;
  const groupB = await db.group.create({ data: { seasonId, name: "Group B" }, select: { id: true } });

  // Four past sessions. The late joiner enrols after the first two.
  const sessionRows = await Promise.all(
    ["2020-01-01", "2020-01-08", "2020-01-15", "2020-01-22"].map((d) =>
      db.session.create({
        data: {
          seasonId,
          title: `Session ${d}`,
          startsAt: new Date(`${d}T18:00:00.000Z`),
          durationMinutes: 60,
        },
        select: { id: true },
      }),
    ),
  );

  await db.seasonEnrollment.createMany({
    data: [
      {
        seasonId,
        studentUserId: early.id,
        groupId: groupA.id,
        status: "ACTIVE",
        enrolledAt: new Date("2019-12-01T00:00:00.000Z"),
      },
      {
        seasonId,
        studentUserId: late.id,
        groupId: groupA.id,
        status: "ACTIVE",
        enrolledAt: new Date("2020-01-10T00:00:00.000Z"),
      },
      {
        seasonId,
        studentUserId: otherGroup.id,
        groupId: groupB.id,
        status: "ACTIVE",
        enrolledAt: new Date("2019-12-01T00:00:00.000Z"),
      },
    ],
  });

  // early: present at 2 of 4 → 50%. late: present at 1 of the 2 sessions that
  // ran after they enrolled → 50% under the fixed denominator, 25% under v1's.
  await db.attendance.createMany({
    data: [
      { sessionId: sessionRows[0]!.id, studentUserId: early.id, status: "PRESENT" },
      { sessionId: sessionRows[1]!.id, studentUserId: early.id, status: "LATE" },
      { sessionId: sessionRows[2]!.id, studentUserId: early.id, status: "ABSENT" },
      { sessionId: sessionRows[2]!.id, studentUserId: late.id, status: "PRESENT" },
      { sessionId: sessionRows[3]!.id, studentUserId: late.id, status: "ABSENT" },
    ],
  });

  // Two assignments: one for everyone, one targeted at Group A only.
  const allGroups = await db.assignment.create({
    data: { seasonId, title: "For all", isAllGroups: true },
    select: { id: true },
  });
  const groupAOnly = await db.assignment.create({
    data: {
      seasonId,
      title: "For group A",
      isAllGroups: false,
      targets: { create: { groupId: groupA.id } },
    },
    select: { id: true },
  });

  // early completes both → 100%. late completes neither → 0%.
  await db.submission.createMany({
    data: [
      {
        assignmentId: allGroups.id,
        studentUserId: early.id,
        publicId: newPublicId(),
        status: "SUBMITTED",
      },
      {
        assignmentId: groupAOnly.id,
        studentUserId: early.id,
        publicId: newPublicId(),
        status: "REVIEWED",
      },
    ],
  });

  superToken = await login(app, superUser.email);
  leaderToken = await login(app, leader.email);
  earlyStudentToken = await login(app, early.email);
  lateJoinerToken = await login(app, late.email);
  expect(groupB.id).not.toBe(groupA.id);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/seasons/:id/engagement", () => {
  it("returns one row per active enrolment with the composite and the flag", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/engagement`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    const rows: Array<{ studentUserId: number }> = res.body.data.students;
    expect(rows).toHaveLength(3);

    const early = res.body.data.students.find(
      (r: { studentUserId: number }) => r.studentUserId === earlyStudentId,
    );
    // 2 of 4 present (PRESENT and LATE both count — R54) → 50%.
    // 2 of 2 assignments done → 100%. Composite = round(50*0.5 + 100*0.5) = 75.
    expect(early).toMatchObject({
      attendanceTotal: 4,
      attendancePresent: 2,
      attendancePct: 50,
      submissionsExpected: 2,
      submissionsCompleted: 2,
      submissionPct: 100,
      score: 75,
      // Component-wise: attendance is under 60 even though the composite is 75.
      // v1's reports screen called this student "Medium" (D7).
      atRisk: true,
      groupName: "Group A",
    });
  });

  it("scores a mid-season joiner only against sessions after they enrolled (R55)", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/engagement`)
      .set("authorization", `Bearer ${superToken}`);

    const late = res.body.data.students.find(
      (r: { studentUserId: number }) => r.studentUserId === lateJoinerId,
    );
    // Two sessions ran after 2020-01-10; one attended. v1 divided by all four
    // and reported 25%, the largest source of spurious at-risk flags.
    expect(late).toMatchObject({ attendanceTotal: 2, attendancePresent: 1, attendancePct: 50 });
  });

  it("counts a group-targeted assignment only for that group's students (C9)", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/engagement`)
      .set("authorization", `Bearer ${superToken}`);

    const other = res.body.data.students.find(
      (r: { studentUserId: number }) => r.studentUserId === otherGroupStudentId,
    );
    // Group B: only the isAllGroups assignment is expected of them.
    expect(other).toMatchObject({ submissionsExpected: 1, submissionsCompleted: 0 });
  });

  it("narrows a LEADER to the students in the groups they lead (ruling C8 #2)", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/engagement`)
      .set("authorization", `Bearer ${leaderToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.students.map((r: { studentUserId: number }) => r.studentUserId);
    expect(ids).toEqual(expect.arrayContaining([earlyStudentId, lateJoinerId]));
    expect(ids).not.toContain(otherGroupStudentId);
  });

  it("refuses a STUDENT the cohort view", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/engagement`)
      .set("authorization", `Bearer ${earlyStudentToken}`);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/students/:id/engagement", () => {
  it("gives staff the full score", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${earlyStudentId}/engagement`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ score: 75, attendancePct: 50, atRisk: true });
  });

  it("gives a student their own components and NOT the composite (D9)", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${earlyStudentId}/engagement`)
      .set("authorization", `Bearer ${earlyStudentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ attendancePct: 50, submissionPct: 100 });
    // A single "engagement: 75%" figure shown to a young person is a product
    // decision nobody has made; the components are facts they can act on.
    expect(res.body.data.score).toBeUndefined();
    expect(res.body.data.atRisk).toBeUndefined();
  });

  it("refuses a student another student's engagement", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${earlyStudentId}/engagement`)
      .set("authorization", `Bearer ${lateJoinerToken}`);
    expect(res.status).toBe(403);
  });

  it("404s when the student has no enrolment to score", async () => {
    const orphan = await createTestUser("eng-orphan", "STUDENT");
    const res = await request(app)
      .get(`/api/v1/students/${orphan.id}/engagement`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("no_season");
  });
});
```

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern engagement-routes` → FAIL (404s).

- [ ] **Step 2: Write the aggregation**

```ts
// apps/backend/src/lib/queries/engagement.ts
import type { EngagementRow } from "@space/shared";
import { isAtRisk } from "@space/shared";

import { db } from "../../db/client";

export interface EngagementCohortOptions {
  /** Restrict to these students (a leader's roster, or a single detail view). */
  studentUserIds?: number[];
  /** Restrict to one group's students. */
  groupId?: number;
}

/**
 * Engagement for a whole cohort, in a constant number of queries.
 *
 * v1 issued four queries per student — 4N concurrently on the mentor dashboard
 * (R80), 4N sequentially on reports (R81) — and its own bulk helper was a
 * sequential loop over the single-student function and was never called anyway
 * (R82). Under React Query, which refetches on mount, on focus and on
 * reconnect, that shape re-issues the whole fan-out every time the app comes
 * back to the foreground (spec D10). This is five queries whether the cohort is
 * one student or four hundred.
 *
 * Formula, ported verbatim from jpc-space/src/lib/engagement.ts:
 *   score = round(attendancePct * 0.5 + submissionPct * 0.5)   (R53)
 *   attendance counts PRESENT and LATE alike                   (R54)
 *   a submission counts as done at SUBMITTED|REVIEWED|RETURNED (R57)
 *   assignment due dates are ignored                           (R60)
 *
 * Two deliberate corrections:
 *   - The attendance denominator is the past sessions at or after the student's
 *     own enrolledAt, not every past session in the season (R55, spec D8 #1).
 *     A student who joined in week six was scored against weeks one to five.
 *   - Assignment targeting resolves through SeasonEnrollment.groupId, not
 *     GroupStudent (R59, ruling C9).
 *
 * NOT corrected here, and not this domain's to correct: nothing below reads
 * Attendance.lateMinutes, so the score is untouched by ruling C3's
 * wrong-instant lateness defect. The absence-budget figures that DO inherit it
 * belong to domain 4 — see docs/superpowers/specs/domains/04-attendance.md.
 */
export async function computeEngagementForSeason(
  seasonId: number,
  opts: EngagementCohortOptions = {},
): Promise<EngagementRow[]> {
  // 1 — the cohort.
  const enrollments = await db.seasonEnrollment.findMany({
    where: {
      seasonId,
      status: "ACTIVE",
      ...(opts.studentUserIds ? { studentUserId: { in: opts.studentUserIds } } : {}),
      ...(opts.groupId ? { groupId: opts.groupId } : {}),
    },
    select: {
      studentUserId: true,
      enrolledAt: true,
      groupId: true,
      group: { select: { name: true } },
      studentUser: { select: { name: true } },
      season: { select: { title: true } },
    },
  });
  if (enrollments.length === 0) return [];
  const ids = enrollments.map((e) => e.studentUserId);

  // 2 — every past session in the season, with its instant, so each student's
  // denominator can be cut at their own enrolment date in memory.
  const now = new Date();
  const pastSessions = await db.session.findMany({
    where: { seasonId, startsAt: { lte: now } },
    select: { id: true, startsAt: true },
  });

  // 3 — the cohort's attendance over those sessions. Rows rather than a
  // groupBy, because the per-student enrolment cutoff cannot be expressed as
  // one grouped aggregate. Still one query.
  const attendance =
    pastSessions.length === 0
      ? []
      : await db.attendance.findMany({
          where: {
            studentUserId: { in: ids },
            sessionId: { in: pastSessions.map((s) => s.id) },
            status: { in: ["PRESENT", "LATE"] },
          },
          select: { studentUserId: true, sessionId: true },
        });

  // 4 — the season's assignments and their targets.
  const assignments = await db.assignment.findMany({
    where: { seasonId, deletedAt: null },
    select: { id: true, isAllGroups: true, targets: { select: { groupId: true } } },
  });

  // 5 — the cohort's completed submissions against them.
  const submissions =
    assignments.length === 0
      ? []
      : await db.submission.findMany({
          where: {
            studentUserId: { in: ids },
            assignmentId: { in: assignments.map((a) => a.id) },
            status: { in: ["SUBMITTED", "REVIEWED", "RETURNED"] },
          },
          select: { studentUserId: true, assignmentId: true },
        });
  // Keyed as a set rather than v1's `a.submissions[0]`, which took whichever
  // row Prisma happened to return first (R61). Submission is unique on
  // (assignmentId, studentUserId), so there is only ever one — but "any
  // completed row counts" is the intent, and a set says so.
  const completed = new Set(submissions.map((s) => `${s.studentUserId}:${s.assignmentId}`));

  const presentBy = new Map<number, Set<number>>();
  for (const row of attendance) {
    const set = presentBy.get(row.studentUserId) ?? new Set<number>();
    set.add(row.sessionId);
    presentBy.set(row.studentUserId, set);
  }

  return enrollments.map((e) => {
    const eligibleSessions = pastSessions.filter(
      (s) => s.startsAt.getTime() >= e.enrolledAt.getTime(),
    );
    const attendanceTotal = eligibleSessions.length;
    const present = presentBy.get(e.studentUserId) ?? new Set<number>();
    const attendancePresent = eligibleSessions.filter((s) => present.has(s.id)).length;
    const attendancePct =
      attendanceTotal > 0 ? Math.round((attendancePresent / attendanceTotal) * 100) : 0;

    const expectedAssignments = assignments.filter(
      (a) =>
        a.isAllGroups ||
        (e.groupId !== null && a.targets.some((t) => t.groupId === e.groupId)),
    );
    const submissionsExpected = expectedAssignments.length;
    const submissionsCompleted = expectedAssignments.filter((a) =>
      completed.has(`${e.studentUserId}:${a.id}`),
    ).length;
    const submissionPct =
      submissionsExpected > 0 ? Math.round((submissionsCompleted / submissionsExpected) * 100) : 0;

    const score = Math.round(attendancePct * 0.5 + submissionPct * 0.5);
    const base = {
      score,
      attendancePct,
      submissionPct,
      attendanceTotal,
      attendancePresent,
      submissionsExpected,
      submissionsCompleted,
    };

    return {
      ...base,
      studentUserId: e.studentUserId,
      studentName: e.studentUser.name,
      seasonId,
      seasonTitle: e.season.title,
      groupId: e.groupId,
      groupName: e.group?.name ?? null,
      // The one definition, from packages/shared. Never recomputed at a render
      // site (ruling C4) and never re-stated with a literal 60 (D7).
      atRisk: isAtRisk(base),
    };
  });
}

```

- [ ] **Step 3: Write the routes**

```ts
// apps/backend/src/routes/engagement.ts
import { Router } from "express";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { parseId } from "../lib/parse-id";
import { canAccessSeason, canViewStudent, staffScopeForSeason } from "../lib/permissions";
import { computeEngagementForSeason } from "../lib/queries/engagement";
import { requireAuth, requireUser } from "../middleware/require-auth";

export const studentEngagementRouter = Router();
export const seasonEngagementRouter = Router();

studentEngagementRouter.use(requireAuth);
seasonEngagementRouter.use(requireAuth);

/**
 * One student's engagement.
 *
 * v1's computeEngagementForStudent takes two integers and returns a score for
 * any student in any season, with no authorization of any kind (R64) — its
 * only protection was which page called it (R85). The gate is here, before the
 * call, and the PAYLOAD narrows by role as well (ruling C8 #2).
 */
studentEngagementRouter.get("/:id/engagement", async (req, res) => {
  const user = requireUser(req);
  const studentUserId = parseId(req.params.id);
  if (studentUserId === null) return apiError(res, "bad_request", "Invalid student id.", 400);

  if (!(await canViewStudent(user, studentUserId))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const requestedSeasonId = parseId(
    typeof req.query.seasonId === "string" ? req.query.seasonId : undefined,
  );
  const enrollment = await db.seasonEnrollment.findFirst({
    where: {
      studentUserId,
      ...(requestedSeasonId !== null ? { seasonId: requestedSeasonId } : { status: "ACTIVE" }),
    },
    orderBy: { enrolledAt: "desc" },
    select: { seasonId: true },
  });
  // v1 simply omitted the engagement card when the student had no active
  // season (R83). An endpoint has to say so.
  if (!enrollment) {
    return apiError(res, "no_season", "This student has no season to score.", 404);
  }

  const rows = await computeEngagementForSeason(enrollment.seasonId, {
    studentUserIds: [studentUserId],
  });
  const row = rows[0];
  if (!row) return apiError(res, "no_season", "This student has no season to score.", 404);

  if (user.role === "STUDENT") {
    // The student's own arm: the two components, no composite, no flag (D9).
    // The composite is a staff triage number whose threshold exists to sort a
    // cohort; the components are facts the student can act on.
    return apiOk(res, {
      attendancePct: row.attendancePct,
      submissionPct: row.submissionPct,
      attendanceTotal: row.attendanceTotal,
      attendancePresent: row.attendancePresent,
      submissionsExpected: row.submissionsExpected,
      submissionsCompleted: row.submissionsCompleted,
      seasonId: row.seasonId,
      seasonTitle: row.seasonTitle,
    });
  }

  return apiOk(res, {
    studentUserId: row.studentUserId,
    seasonId: row.seasonId,
    seasonTitle: row.seasonTitle,
    atRisk: row.atRisk,
    score: row.score,
    attendancePct: row.attendancePct,
    submissionPct: row.submissionPct,
    attendanceTotal: row.attendanceTotal,
    attendancePresent: row.attendancePresent,
    submissionsExpected: row.submissionsExpected,
    submissionsCompleted: row.submissionsCompleted,
  });
});

/**
 * The cohort endpoint — the one the mentor dashboard and the reports screen
 * both consume. v1's per-student fan-out is unshippable on mobile (spec D10).
 */
seasonEngagementRouter.get("/:id/engagement", async (req, res) => {
  const user = requireUser(req);
  const seasonId = parseId(req.params.id);
  if (seasonId === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  // A cohort listing is a staff surface. canAccessSeason admits students to
  // their own season, so the role check is separate and comes first.
  if (user.role === "STUDENT") {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }
  if (!(await canAccessSeason(user, seasonId))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const groupId = parseId(typeof req.query.groupId === "string" ? req.query.groupId : undefined);

  // A LEADER sees their own groups' students, not the season's. The same
  // helper the attendance roster narrows with, so the two cannot drift.
  // MENTOR and SUPER read the whole cohort (canReadAllStudents).
  const scope = await staffScopeForSeason(user, seasonId);
  if (user.role === "LEADER") {
    if (scope === null || scope.kind !== "groups") {
      return apiOk(res, { students: [] });
    }
    if (groupId !== null && !scope.groupIds.includes(groupId)) {
      return apiError(res, "forbidden", "You don't have access to this.", 403);
    }
    const enrollments = await db.seasonEnrollment.findMany({
      where: {
        seasonId,
        status: "ACTIVE",
        groupId: { in: groupId !== null ? [groupId] : scope.groupIds },
      },
      select: { studentUserId: true },
    });
    const students = await computeEngagementForSeason(seasonId, {
      studentUserIds: enrollments.map((e) => e.studentUserId),
    });
    return apiOk(res, { students });
  }

  const students = await computeEngagementForSeason(seasonId, {
    ...(groupId !== null ? { groupId } : {}),
  });
  return apiOk(res, { students });
});
```

In `apps/backend/src/app.ts`:

```ts
import { seasonEngagementRouter, studentEngagementRouter } from "./routes/engagement";
```

```ts
  // Same fall-through mounting as the notes routers: /students/:id/engagement
  // and /seasons/:id/engagement cannot be matched by those domains' /:id
  // routes, and keeping this domain's arithmetic in one file keeps its single
  // definition single (ruling C4).
  app.use("/api/v1/students", studentEngagementRouter);
  app.use("/api/v1/seasons", seasonEngagementRouter);
```

- [ ] **Step 4: Run the suite**

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern engagement-routes` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/backend` → clean.

- [ ] **Step 5: OpenAPI, same commit**

Document both paths. The prose must state: the score is derived server-side and
never recomputed by a client (C4); the student's own arm omits `score` and
`atRisk` deliberately; the attendance denominator starts at the student's
enrolment date, which is a deliberate divergence from v1; and that the score
does **not** read `lateMinutes`, so it is unaffected by ruling C3 — with a
pointer to domain 4 for the numbers that are.

- [ ] **Step 6: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): cohort engagement endpoint with one at-risk definition"
```

---

### Task 5: Mobile — the authored-notes screen

**Files:**
- Modify: `packages/shared/src/navigation.ts` (add `/notes` to three sidebars — spec D14)
- Create: `apps/mobile/src/hooks/use-notes.ts`
- Modify: `apps/mobile/src/lib/query-keys.ts` (add the `notes` factory)
- Modify: `apps/mobile/app/(app)/notes.tsx` (replace the placeholder)
- Modify: `apps/mobile/src/__tests__/placeholder-screens.test.tsx` (drop the `notes` entry and decrement its count assertion)
- Test: `apps/mobile/src/__tests__/notes-screen.test.tsx`

**Interfaces:**
- Consumes: `apiClient`, `useSessionStore`, `authoredNoteListResponseSchema` / `type AuthoredNote` from `@space/shared`, `formatDate` from `../../src/lib/format`.
- Produces: `queryKeys.notes.all/lists()/authored()/byStudent(studentId)`; `useAuthoredNotes(enabled: boolean): UseQueryResult<AuthoredNote[]>`. Task 6 adds `useStudentNotes` and `useCreateNote` to the same hook file.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/__tests__/notes-screen.test.tsx
import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn() },
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import NotesScreen from "../../app/(app)/notes";

const get = apiClient.get as jest.Mock;

const emptyScopes = {
  seasonAdminIds: [] as number[],
  groupLeaderIds: [] as number[],
  activeSeasonId: null as number | null,
  graduationYear: null as number | null,
};
const mentorSession = {
  user: { id: 2, name: "Test mentor", email: "men@jpc.test", role: "MENTOR" as const },
  scopes: emptyScopes,
};
const studentSession = {
  user: { id: 9, name: "Test student", email: "stu@jpc.test", role: "STUDENT" as const },
  scopes: emptyScopes,
};

const note = {
  id: 5,
  body: "Checked in after the session.",
  visibility: "MENTORS" as const,
  followUpFlagged: true,
  createdAt: "2099-03-01T18:00:00.000Z",
  updatedAt: "2099-03-01T18:00:00.000Z",
  edited: false,
  authorId: 2,
  authorName: "Test mentor",
  authorRole: "MENTOR" as const,
  seasonId: 7,
  seasonTitle: "Spring 2099",
  canEdit: true,
  student: { id: 21, name: "Sara Student", email: "sara@jpc.test" },
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("NotesScreen", () => {
  it("lists the notes this staff member wrote, with who they are about", async () => {
    useSessionStore.setState(mentorSession);
    get.mockResolvedValue({ data: { data: { notes: [note], nextCursor: null } } });

    renderWithProviders(<NotesScreen />);

    expect(await screen.findByText("Sara Student")).toBeTruthy();
    expect(screen.getByText("Checked in after the session.")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/me/notes");
  });

  it("labels visibility in the equality terms the API actually enforces", async () => {
    useSessionStore.setState(mentorSession);
    get.mockResolvedValue({ data: { data: { notes: [note], nextCursor: null } } });

    renderWithProviders(<NotesScreen />);

    // v1's composer promised "in addition to you and admins", which was false:
    // an ADMIN cannot read a MENTORS note (R36, D3). The copy tells the truth.
    expect(await screen.findByText("Visible to mentors only")).toBeTruthy();
  });

  it("shows the follow-up badge and the edited marker from server-derived fields", async () => {
    useSessionStore.setState(mentorSession);
    get.mockResolvedValue({
      data: { data: { notes: [{ ...note, edited: true }], nextCursor: null } },
    });

    renderWithProviders(<NotesScreen />);

    expect(await screen.findByText("Follow-up flagged")).toBeTruthy();
    expect(screen.getByText("Edited")).toBeTruthy();
  });

  it("navigates to the student on press", async () => {
    useSessionStore.setState(mentorSession);
    get.mockResolvedValue({ data: { data: { notes: [note], nextCursor: null } } });

    renderWithProviders(<NotesScreen />);
    fireEvent.press(await screen.findByText("Sara Student"));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/student/[id]",
      params: { id: "21" },
    });
  });

  it("shows a student their own empty branch without calling the API", async () => {
    useSessionStore.setState(studentSession);

    renderWithProviders(<NotesScreen />);

    // A STUDENT gets 403 from /me/notes; the screen must not fire a request it
    // knows will be refused.
    expect(await screen.findByText("Notes")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("shows an empty state when this author has written nothing", async () => {
    useSessionStore.setState(mentorSession);
    get.mockResolvedValue({ data: { data: { notes: [], nextCursor: null } } });

    renderWithProviders(<NotesScreen />);

    expect(await screen.findByText("No notes yet")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/mobile && pnpm jest src/__tests__/notes-screen.test.tsx`
Expected: FAIL — the placeholder renders "This screen isn't built yet".

- [ ] **Step 3: Extend navigation (spec D14)**

In `packages/shared/src/navigation.ts`, add a `/notes` **sidebar** entry to
`SUPER`, `ADMIN` and `LEADER`. MENTOR already has the tab (line 139) and keeps
it; all three of the others have five tabs already, and the sidebar is what
`/more` renders.

```ts
  // In SUPER.sidebar, after the "/students" entries:
    { href: "/notes", label: "My notes", icon: "notes" },
  // In ADMIN.sidebar, after "/students":
    { href: "/notes", label: "My notes", icon: "notes" },
  // In LEADER.sidebar, after "/groups":
    { href: "/notes", label: "My notes", icon: "notes" },
```

Spec D14's reasoning, worth a comment above the SUPER entry:

```ts
    // GET /me/notes is open to every role that can author (spec §7, R44) —
    // ADMIN, LEADER and SUPER could all write notes in v1 and none of them
    // could list what they had written. The nav has to follow in the same
    // change, or the route is reachable only by typing a URL a phone user
    // cannot type (spec D14).
```

`icon: "notes"` is already a member of the icon union (`navigation.ts:31`), so
no type change is needed. `ALL_NAV_HREFS` derives from these arrays, so
`role-tabs.test.tsx`'s coverage check picks the new entries up automatically —
run it in Step 7 and expect it to stay green because `app/(app)/notes.tsx`
already exists.

- [ ] **Step 4: Add the query-key factory**

In `apps/mobile/src/lib/query-keys.ts`, add a sibling inside the same
`queryKeys` object, following the file's spreading pattern:

```ts
  notes: {
    all: ["notes"] as const,
    lists: () => [...queryKeys.notes.all, "list"] as const,
    authored: () => [...queryKeys.notes.lists(), "authored"] as const,
    byStudent: (studentId: number) => [...queryKeys.notes.lists(), { studentId }] as const,
  },
```

- [ ] **Step 5: Write the hook**

```ts
// apps/mobile/src/hooks/use-notes.ts
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { authoredNoteListResponseSchema, type AuthoredNote } from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

/**
 * The notes this caller wrote, across students.
 *
 * `enabled` is passed by the screen rather than derived here, because the one
 * role that must NOT call this (STUDENT) gets a 403, not an empty list — the
 * API refuses students explicitly (spec D5 #2), and a query that fires only to
 * be refused would surface as an error state on a screen that should simply
 * say the surface is not theirs.
 */
export function useAuthoredNotes(enabled: boolean): UseQueryResult<AuthoredNote[]> {
  return useQuery({
    queryKey: queryKeys.notes.authored(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/me/notes");
      return authoredNoteListResponseSchema.parse(res.data.data).notes;
    },
    enabled,
  });
}
```

- [ ] **Step 6: Write the screen**

Replace `apps/mobile/app/(app)/notes.tsx`:

```tsx
import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import type { AuthoredNote, NoteVisibility } from "@space/shared";

import { useAuthoredNotes } from "../../src/hooks/use-notes";
import { formatDate } from "../../src/lib/format";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

/**
 * The truth about the visibility setting, in the words the API enforces.
 *
 * v1's composer said "Who can read this note (in addition to you and admins)",
 * which was simply false: filterVisibleNotes matches the viewer's role against
 * the setting by EQUALITY, so an admin reads none of the LEADERS notes the
 * schema defaults to and none of the MENTORS notes the mentor composer
 * hard-coded (spec R36, D3). Widening the rule to match the old copy would
 * retroactively expose historic notes; fixing the copy does not.
 */
const VISIBILITY_LABEL: Record<NoteVisibility, string> = {
  LEADERS: "Visible to group leaders only",
  MENTORS: "Visible to mentors only",
  ADMINS: "Visible to season admins only",
};

function NoteRow({ item }: { item: AuthoredNote }) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({ pathname: "/student/[id]", params: { id: String(item.student.id) } })
      }
    >
      <Card style={{ marginBottom: theme.spacing.sm }}>
        <Text variant="heading">{item.student.name ?? item.student.email}</Text>
        <Text variant="body">{item.body}</Text>
        <Text variant="label" color={theme.colors.neutral[600]}>
          {`${formatDate(item.createdAt)} · ${VISIBILITY_LABEL[item.visibility]}`}
        </Text>
        {item.followUpFlagged ? (
          <Text variant="caption" color={theme.colors.neutral[600]}>
            Follow-up flagged
          </Text>
        ) : null}
        {/* Server-derived (ruling C4): the client never compares timestamps. */}
        {item.edited ? (
          <Text variant="caption" color={theme.colors.neutral[600]}>
            Edited
          </Text>
        ) : null}
      </Card>
    </Pressable>
  );
}

export default function NotesScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  // Four roles can author (spec R46–R49); a STUDENT never can (R51) and the
  // API refuses them, so the screen does not ask.
  const canAuthor = role !== null && role !== "STUDENT";
  const { data, isPending, isError, refetch, isRefetching } = useAuthoredNotes(canAuthor);

  const handleRefresh = () => {
    if (canAuthor) void refetch();
  };

  if (!canAuthor) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Notes" message="This screen is for staff who write pastoral notes." />
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "left", "right"]} onRefresh={handleRefresh} refreshing={isRefetching}>
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load your notes." onRetry={() => void refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          title="No notes yet"
          message="Notes you write about a student appear here. Open a student to write one."
        />
      ) : (
        <>
          {data.map((item) => (
            <NoteRow key={item.id} item={item} />
          ))}
        </>
      )}
    </Screen>
  );
}
```

- [ ] **Step 7: Update the placeholder guard test and run everything**

In `apps/mobile/src/__tests__/placeholder-screens.test.tsx`: remove the
`NotesScreen` import and its `["notes", NotesScreen, "Notes"]` row, and
decrement the `toHaveLength(...)` assertion by one (it reads 18 on `main`; it
may read less if another plan landed first — decrement whatever is there, do
not hardcode).

Run: `cd apps/mobile && pnpm jest src/__tests__/notes-screen.test.tsx src/__tests__/placeholder-screens.test.tsx src/__tests__/role-tabs.test.tsx` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean. The
`router.push({ pathname: "/student/[id]" … })` typecheck needs Plan 5's route
file; if it is missing, that is the prerequisite failure, not a bug here.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile packages/shared && git commit -m "feat(mobile): authored-notes screen, opened to every authoring role"
```

---

### Task 6: Mobile — engagement and notes on the student detail screen

**Files:**
- Modify: `apps/mobile/app/(app)/student/[id].tsx` (**created by Plan 5 Task 7 — extend it, do not rewrite it**)
- Modify: `apps/mobile/src/hooks/use-notes.ts` (add `useStudentNotes`, `useCreateNote`)
- Create: `apps/mobile/src/hooks/use-engagement.ts`
- Modify: `apps/mobile/src/lib/query-keys.ts` (add the `engagement` factory)
- Test: `apps/mobile/src/__tests__/student-engagement-notes.test.tsx`

**Interfaces:**
- Consumes: Plan 5's `useStudentDetail(id, role)` and the file's existing structure — `ProfileCard`, `EnrollmentRow`, `enrollmentStatusLabel`, the `Screen edges={["top","left","right"]} scroll` wrapper, `useTheme`, and `Card` / `EmptyState` / `ErrorState` / `LoadingState` / `Screen` / `Text` from `../../../src/ui`. Plus `noteListResponseSchema`, `noteSummarySchema`, `studentEngagementSchema`, `type NoteSummary`, `type NoteVisibility`, `type StudentEngagement` from `@space/shared`; `VISIBILITY_LABEL` is duplicated here rather than imported from the screen file (screens do not import from screens).
- Produces: `useStudentNotes(studentId: number | null, enabled: boolean)`; `useCreateNote(studentId: number)`; `useStudentEngagement(studentId: number | null, enabled: boolean)`; the `<EngagementCard />`, `<NotesSection />` and `<NoteComposer />` components inside `student/[id].tsx`.

**Placement.** Both blocks are rendered as siblings *after* the existing
"Seasons" card, each owning its own query. Notes must not be folded into the
student-detail payload — spec D5 #3: notes never ride inside another domain's
response, because that response is then only as safe as its most careless
consumer.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/__tests__/student-engagement-notes.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "21" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import StudentDetailScreen from "../../app/(app)/student/[id]";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const emptyScopes = {
  seasonAdminIds: [] as number[],
  groupLeaderIds: [] as number[],
  activeSeasonId: null as number | null,
  graduationYear: null as number | null,
};
const superSession = {
  user: { id: 1, name: "Test super", email: "sup@jpc.test", role: "SUPER" as const },
  scopes: emptyScopes,
};

// Plan 5's internal-arm detail payload, trimmed to what this screen needs.
const detail = {
  id: 21,
  name: "Sara Student",
  email: "sara@jpc.test",
  avatarPath: null,
  graduationYear: null,
  currentGroup: { id: 3, name: "Group A" },
  enrollments: [],
  profile: {
    university: null,
    year: null,
    gifts: null,
    activeSeasonId: 7,
    activeSeasonTitle: "Spring 2099",
    activeSeasonCode: "S99",
    phone: null,
    dateOfBirth: null,
    spiritualBackground: null,
    notes: null,
  },
};

const engagement = {
  studentUserId: 21,
  seasonId: 7,
  seasonTitle: "Spring 2099",
  atRisk: true,
  score: 75,
  attendancePct: 50,
  submissionPct: 100,
  attendanceTotal: 4,
  attendancePresent: 2,
  submissionsExpected: 2,
  submissionsCompleted: 2,
};

const note = {
  id: 5,
  body: "Checked in after the session.",
  visibility: "LEADERS" as const,
  followUpFlagged: false,
  createdAt: "2099-03-01T18:00:00.000Z",
  updatedAt: "2099-03-01T18:00:00.000Z",
  edited: false,
  authorId: 1,
  authorName: "Test super",
  authorRole: "SUPER" as const,
  seasonId: 7,
  seasonTitle: "Spring 2099",
  canEdit: true,
};

function mockAllEndpoints(overrides: { notes?: unknown[]; engagementStatus?: "ok" } = {}) {
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/students/21") return Promise.resolve({ data: { data: detail } });
    if (url === "/api/v1/students/21/engagement") {
      return Promise.resolve({ data: { data: engagement } });
    }
    if (url === "/api/v1/students/21/notes") {
      return Promise.resolve({
        data: { data: { notes: overrides.notes ?? [note], nextCursor: null } },
      });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(superSession);
});

describe("student detail — engagement block", () => {
  it("renders the server's score and components without recomputing anything", async () => {
    mockAllEndpoints();

    renderWithProviders(<StudentDetailScreen />);

    expect(await screen.findByText("Engagement")).toBeTruthy();
    expect(screen.getByText("75")).toBeTruthy();
    expect(screen.getByText("Attendance 50%")).toBeTruthy();
    expect(screen.getByText("Submissions 100%")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/students/21/engagement");
  });

  it("takes the at-risk flag from the contract, not from a local threshold", async () => {
    mockAllEndpoints();

    renderWithProviders(<StudentDetailScreen />);

    // Composite 75 with attendance at 50: a client comparing `score < 60`
    // would show nothing here. The single definition lives in packages/shared
    // and travels on the wire (rulings C4, D7).
    expect(await screen.findByText("At risk")).toBeTruthy();
  });

  it("says so plainly when the student has no season to score", async () => {
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/students/21") return Promise.resolve({ data: { data: detail } });
      if (url === "/api/v1/students/21/notes") {
        return Promise.resolve({ data: { data: { notes: [], nextCursor: null } } });
      }
      return Promise.reject(Object.assign(new Error("no season"), { status: 404 }));
    });

    renderWithProviders(<StudentDetailScreen />);

    expect(await screen.findByText("No season to score yet")).toBeTruthy();
  });
});

describe("student detail — notes", () => {
  it("fetches notes from their own gated endpoint, never from the detail payload", async () => {
    mockAllEndpoints();

    renderWithProviders(<StudentDetailScreen />);

    expect(await screen.findByText("Checked in after the session.")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/students/21/notes");
  });

  it("states the visibility rule the API actually enforces", async () => {
    mockAllEndpoints();

    renderWithProviders(<StudentDetailScreen />);

    expect(await screen.findByText(/Visible to group leaders only/)).toBeTruthy();
  });

  it("posts a new note with the chosen visibility and clears the field", async () => {
    mockAllEndpoints();
    post.mockResolvedValue({ data: { data: { note } } });

    renderWithProviders(<StudentDetailScreen />);

    const input = await screen.findByLabelText("New note");
    fireEvent.changeText(input, "space-v2-test new observation");
    fireEvent.press(screen.getByText("Visible to season admins only"));
    fireEvent.press(screen.getByText("Save note"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/students/21/notes", {
        body: "space-v2-test new observation",
        visibility: "ADMINS",
        followUpFlagged: false,
      }),
    );
  });

  it("warns, in the composer, that the audience is exactly one staff group", async () => {
    mockAllEndpoints();

    renderWithProviders(<StudentDetailScreen />);

    // v1's copy said "in addition to you and admins" and was wrong (R36, D3).
    expect(
      await screen.findByText(/Only the group you choose can read this note/),
    ).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/mobile && pnpm jest src/__tests__/student-engagement-notes.test.tsx`
Expected: FAIL — "Engagement" is not rendered; the screen makes one GET.

- [ ] **Step 3: Add the engagement query-key factory and hook**

In `apps/mobile/src/lib/query-keys.ts`, beside the `notes` factory from Task 5:

```ts
  engagement: {
    all: ["engagement"] as const,
    student: (studentId: number) => [...queryKeys.engagement.all, "student", studentId] as const,
    season: (seasonId: number) => [...queryKeys.engagement.all, "season", seasonId] as const,
  },
```

```ts
// apps/mobile/src/hooks/use-engagement.ts
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { studentEngagementSchema, type StudentEngagement } from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

/**
 * One student's engagement, staff arm.
 *
 * Parsed with the staff schema specifically. The student's own arm is a
 * different, narrower shape (no composite, no flag — spec D9), and a union
 * parse would quietly accept either and hide a role-routing bug.
 *
 * Nothing here recomputes anything. `score` and `atRisk` arrive derived
 * (ruling C4) because v1 defined "at risk" three different ways in three files
 * and the three disagreed (spec D7).
 */
export function useStudentEngagement(
  studentId: number | null,
  enabled: boolean,
): UseQueryResult<StudentEngagement> {
  return useQuery({
    queryKey: queryKeys.engagement.student(studentId ?? -1),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/students/${studentId}/engagement`);
      return studentEngagementSchema.parse(res.data.data);
    },
    enabled: enabled && studentId !== null,
    // A 404 means "no season to score", which is a real answer, not a
    // transient failure — retrying it three times just delays the message.
    retry: false,
  });
}
```

- [ ] **Step 4: Add the note hooks**

Append to `apps/mobile/src/hooks/use-notes.ts` (merge the `@space/shared` and
react-query import statements into one each, per lint):

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  noteListResponseSchema,
  noteSummarySchema,
  type NoteSummary,
  type NoteVisibility,
} from "@space/shared";

export function useStudentNotes(
  studentId: number | null,
  enabled: boolean,
): UseQueryResult<NoteSummary[]> {
  return useQuery({
    queryKey: queryKeys.notes.byStudent(studentId ?? -1),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/students/${studentId}/notes`);
      return noteListResponseSchema.parse(res.data.data).notes;
    },
    enabled: enabled && studentId !== null,
  });
}

export function useCreateNote(studentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      body: string;
      visibility: NoteVisibility;
      followUpFlagged: boolean;
    }) => {
      const res = await apiClient.post(`/api/v1/students/${studentId}/notes`, input);
      return noteSummarySchema.parse(res.data.data.note);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notes.byStudent(studentId) });
      // The author's own list gained a row too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.notes.authored() });
    },
  });
}
```

- [ ] **Step 5: Extend the student detail screen**

In `apps/mobile/app/(app)/student/[id].tsx`, **keep everything Plan 5 wrote**
and add the two components below `EnrollmentRow`, plus their imports:

```tsx
import { useState } from "react";
import type { NoteSummary, NoteVisibility } from "@space/shared";

import { useStudentEngagement } from "../../../src/hooks/use-engagement";
import { useCreateNote, useStudentNotes } from "../../../src/hooks/use-notes";
import { Button, Input } from "../../../src/ui";
```

```tsx
const VISIBILITY_LABEL: Record<NoteVisibility, string> = {
  LEADERS: "Visible to group leaders only",
  MENTORS: "Visible to mentors only",
  ADMINS: "Visible to season admins only",
};

const VISIBILITY_ORDER: NoteVisibility[] = ["LEADERS", "MENTORS", "ADMINS"];

/**
 * The engagement card.
 *
 * Every number here is served, not computed. v1 re-derived the score at each
 * render site (four student-detail pages, the mentor dashboard, the reports
 * screen), which is how "at risk" ended up meaning three different things
 * (spec R73/R74, D7) and how the mentor dashboard came to issue 4N queries per
 * render (R80, D10).
 *
 * The absence-budget figure is NOT here. It is domain 4's number on domain 4's
 * terms, it means "absence budget remaining" rather than "attendance" (spec
 * R68/R87, D8 #2), and it inherits ruling C3's wrong-instant lateness defect,
 * which this domain's attendancePct does not — see
 * docs/superpowers/specs/domains/04-attendance.md.
 */
function EngagementCard({ studentId, enabled }: { studentId: number; enabled: boolean }) {
  const theme = useTheme();
  const { data, isPending, isError } = useStudentEngagement(studentId, enabled);

  if (!enabled) return null;

  return (
    <Card style={{ marginTop: theme.spacing.md }}>
      <Text variant="heading">Engagement</Text>
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <Text variant="body" color={theme.colors.neutral[600]}>
          No season to score yet
        </Text>
      ) : (
        <>
          <Text variant="title">{String(data.score)}</Text>
          <Text variant="label" color={theme.colors.neutral[600]}>
            {`Attendance ${data.attendancePct}%`}
          </Text>
          <Text variant="label" color={theme.colors.neutral[600]}>
            {`Submissions ${data.submissionPct}%`}
          </Text>
          <Text variant="caption" color={theme.colors.neutral[600]}>
            {`${data.attendancePresent}/${data.attendanceTotal} sessions · ${data.submissionsCompleted}/${data.submissionsExpected} assignments`}
          </Text>
          {data.atRisk ? <Text variant="label">At risk</Text> : null}
        </>
      )}
    </Card>
  );
}

function NoteCard({ item }: { item: NoteSummary }) {
  const theme = useTheme();
  return (
    <Card style={{ marginTop: theme.spacing.sm }}>
      <Text variant="body">{item.body}</Text>
      <Text variant="label" color={theme.colors.neutral[600]}>
        {`${item.authorName ?? "Staff"} · ${formatDate(item.createdAt)}`}
      </Text>
      <Text variant="caption" color={theme.colors.neutral[600]}>
        {VISIBILITY_LABEL[item.visibility]}
      </Text>
      {item.followUpFlagged ? <Text variant="caption">Follow-up flagged</Text> : null}
      {item.edited ? (
        <Text variant="caption" color={theme.colors.neutral[600]}>
          Edited
        </Text>
      ) : null}
    </Card>
  );
}

function NoteComposer({ studentId }: { studentId: number }) {
  const theme = useTheme();
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<NoteVisibility>("LEADERS");
  const create = useCreateNote(studentId);

  return (
    <Card style={{ marginTop: theme.spacing.md }}>
      <Text variant="heading">Write a note</Text>
      {/*
        The copy v1 got wrong. Its composer said "Who can read this note (in
        addition to you and admins)" while the filter matched the viewer's role
        against the setting by equality, so admins read none of the LEADERS
        notes the schema defaults to (spec R36, D3). Widening the rule to match
        the promise would expose historic notes written under a different one;
        the plan defers that to the pastoral owner and tells the truth here.
      */}
      <Text variant="caption" color={theme.colors.neutral[600]}>
        Only the group you choose can read this note, plus you and SUPER users. Season admins do
        not automatically see leader or mentor notes.
      </Text>
      <Input label="New note" value={body} onChangeText={setBody} multiline numberOfLines={5} />
      {VISIBILITY_ORDER.map((v) => (
        <Button
          key={v}
          title={VISIBILITY_LABEL[v]}
          variant={v === visibility ? "primary" : "secondary"}
          onPress={() => setVisibility(v)}
        />
      ))}
      <Button
        title="Save note"
        loading={create.isPending}
        onPress={() => {
          if (body.trim().length < 2) return;
          create.mutate(
            // followUpFlagged is sent explicitly rather than omitted so the
            // request shape matches the contract's default exactly.
            { body: body.trim(), visibility, followUpFlagged: false },
            { onSuccess: () => setBody("") },
          );
        }}
      />
      {create.isError ? (
        <Text variant="caption" color={theme.colors.neutral[600]}>
          Couldn&apos;t save that note. Check your connection and try again.
        </Text>
      ) : null}
    </Card>
  );
}

/**
 * Notes come from their own gated endpoint, always.
 *
 * They deliberately do NOT ride inside the student-detail payload (spec D5
 * #3): in v1 they did, and the payload's safety then depended on every
 * consumer remembering to filter it afterwards (R38). A separate request means
 * a separate gate, and it means this block can be refused without the rest of
 * the screen failing.
 */
function NotesSection({ studentId, enabled }: { studentId: number; enabled: boolean }) {
  const theme = useTheme();
  const { data, isPending, isError, refetch } = useStudentNotes(studentId, enabled);

  if (!enabled) return null;

  return (
    <>
      <NoteComposer studentId={studentId} />
      <Card style={{ marginTop: theme.spacing.md }}>
        <Text variant="heading">Notes</Text>
        {isPending ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="Couldn't load notes." onRetry={() => void refetch()} />
        ) : data.length === 0 ? (
          <Text variant="body" color={theme.colors.neutral[600]}>
            No notes about this student yet.
          </Text>
        ) : (
          data.map((n) => <NoteCard key={n.id} item={n} />)
        )}
      </Card>
    </>
  );
}
```

and inside the screen's success branch, **after** the existing "Seasons" card:

```tsx
          <EngagementCard studentId={id} enabled={role !== null && role !== "STUDENT"} />
          <NotesSection studentId={id} enabled={role !== null && role !== "STUDENT"} />
```

**Check two primitives before running.** `Text`'s variant scale must actually
have `"title"` (`src/ui/Text.tsx`) — Plan 1 flagged the same thing; if it does
not, use the largest heading variant it has, in the code and in the test's
`getByText("75")` target. `Button`'s `ButtonVariant` union must have
`"primary"` and `"secondary"` (`src/ui/Button.tsx`); if `"primary"` is
expressed as the default rather than a named variant, pass `undefined` for the
selected state instead. Do not silence either with a cast.

`role` and `id` are already in scope in Plan 5's component (`role` from
`useSessionStore`, `id` from the parsed route param). The `enabled` guard
mirrors the API: a STUDENT is refused notes outright (spec D5 #2), so the
screen does not fire a request it knows will 403 — and a student reaching
their own detail screen sees the profile and enrolments without two error
cards.

- [ ] **Step 6: Run the tests**

Run: `cd apps/mobile && pnpm jest src/__tests__/student-engagement-notes.test.tsx src/__tests__/student-detail.test.tsx` → PASS.
`student-detail.test.tsx` is Plan 5's suite and mocks only `apiClient.get`
for `/api/v1/students/21`; its `get.mockResolvedValue` answers every URL, so
the two new queries resolve with a student-detail payload and fail their
parses into error branches — which the file does not assert on. If any of its
cases break, extend its mock to `mockImplementation` by URL rather than
loosening this task's schemas.

Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): engagement card and gated notes section on student detail"
```

---

### Task 7: Closing gate (coordinator)

**Files:** none created — verification only.

- [ ] **Step 1: Full suite**

Run at the repo root: `pnpm turbo lint typecheck test:unit build` → green.
Then the full serial integration run:
`cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern integration` → green.

Record the suite counts before and after this plan.

- [ ] **Step 2: Mutation pass**

Five mutations, **one at a time**, restoring after each. Each must make the
named test fail — a mutation the suite survives is a test that is not testing
what it claims.

1. **Drop the visibility gate.** In `lib/permissions.ts`'s
   `noteVisibilityWhere`, return `{}` for every non-student role instead of the
   `OR`. → `notes-routes.test.ts` "gives a LEADER who leads this student only
   LEADERS notes and their own" must fail: the leader now receives the
   `MENTORS` note. *(This is the roadmap's stated done-criterion for Plan 8.)*
2. **Recompute engagement client-side.** In
   `apps/mobile/app/(app)/student/[id].tsx`'s `EngagementCard`, replace
   `data.atRisk` with a local `data.score < 60`. →
   `student-engagement-notes.test.tsx` "takes the at-risk flag from the
   contract, not from a local threshold" must fail (composite 75, attendance
   50).
3. **Restore v1's excerpt.** In `routes/notes.ts`, set the follow-up
   notification's `body` to `parsed.data.body.slice(0, 140)`. →
   `notes-routes.test.ts` "notifies season admins on a flagged note WITHOUT
   quoting it" must fail.
4. **Stop escaping on write.** In `routes/notes.ts`, store
   `parsed.data.body` directly instead of `toStoredNoteHtml(parsed.data.body)`.
   → `notes-routes.test.ts` "neutralises markup on the way in and on the way
   out" must fail on the stored-column assertion.
5. **Restore v1's attendance denominator.** In
   `lib/queries/engagement.ts`, drop the `s.startsAt >= e.enrolledAt` filter so
   `eligibleSessions` is every past session. → `engagement-routes.test.ts`
   "scores a mid-season joiner only against sessions after they enrolled" must
   fail (25% instead of 50%).

- [ ] **Step 3: Emit check**

`grep -rn 'require("@space/shared")' apps/backend/dist/apps/backend/src/routes/` → empty.
(The `rootDir` trap in `CLAUDE.md`: `routes/notes.ts` carries this plan's only
value import from shared, via the relative path.)

- [ ] **Step 4: Manual device pass**

Backend running, `apiClient` pointed at it, against staging:

1. As a MENTOR: the Notes tab lists notes they wrote, with the student's name and the truthful visibility label.
2. As a LEADER of a group: open a student they lead → engagement card shows served numbers; notes list shows `LEADERS` notes and their own, and no `ADMINS` note.
3. Write a note as that leader → it appears in the list and on the Notes screen without a manual refresh.
4. As a STUDENT: their own detail screen shows no notes section and no engagement card, and no request to either endpoint is issued.
5. As an ADMIN: `/more` now offers "My notes"; it lists what that admin wrote.

- [ ] **Step 5: Report**

Report: suite counts, all five mutation outcomes, the device pass, and any
divergence from this plan found while implementing. State explicitly in the
report that the D3 **ladder was not implemented** and why, so the deferral is
carried forward rather than rediscovered.
