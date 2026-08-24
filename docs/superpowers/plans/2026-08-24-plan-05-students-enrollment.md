# Plan 5 — Students & Enrollment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Domain 6's greenfield API — student list/detail with per-role payload
narrowing, student create/update, and the append-only enrollment state machine
— plus the three list screens and the student detail route on the device.

**Architecture:** One new router (`routes/students.ts`) over one new query
module (`lib/queries/students.ts`), mirroring the `groups.ts` pattern. A
**single list endpoint** `GET /api/v1/students?status=active|alumni|dropped`
serves all three list surfaces — this also sidesteps the literal-vs-param
shadowing a `/students/alumni` route would have against `/students/:id`. The
detail returns **three role-shaped payloads** (spec 06 §4.2 is the contract;
the narrow arms use `.strict()` profiles so a leaked field fails the client
parse). Writes are role-allowlisted; enrollment rows transition status and are
**never deleted**. On mobile, one `StudentList` component backs three thin
screens, and `student/[id]` is this plan's dynamic route.

**Tech Stack:** Express 5, Prisma 7 (`src/generated/prisma`), Zod, jest +
supertest integration suite against the shared staging DB; Expo SDK 54 /
expo-router 6 (typed routes), React Query 5 (`useInfiniteQuery` for the
paginated list), Zustand 5, RNTL 13 via `renderWithProviders`.

**Spec:** `docs/superpowers/specs/domains/06-students.md` (91 rules; §4.2's
field-visibility table is the read contract; §10 D1–D16),
`docs/superpowers/specs/domains/05-groups.md` §10 item 1 (membership
convention ratified by this domain), `_DECISIONS.md` (C1, C8, C9 bind),
scope from `docs/superpowers/plans/2026-08-24-migration-roadmap.md` § Plan 5.

## Global Constraints

- **No migrations, ever.** No edits under `apps/backend/prisma/`. Shared live
  staging DB (C1). Soft-delete columns that exist: `User.deletedAt`,
  `StudentProfile.deletedAt`, `Season.deletedAt`. `SeasonEnrollment` has
  **none** — its terminal states are `status` + `completedAt`/`droppedAt`,
  and rows are never deleted.
- Response envelope `{ data }` / `{ error: { code, message } }` via
  `apiOk`/`apiError`.
- **Value** imports from shared use the relative path
  `"../../../../packages/shared/src/index"` in backend route files (the
  `rootDir` emit trap in CLAUDE.md). **Type-only** imports may use
  `"@space/shared"` (erased at emit — `credentials.ts` precedent).
- `src/docs/openapi.ts` changes in the same commit as the route it documents.
- Integration fixtures: every row carries the `space-v2-test-` prefix in
  `User.email` or `Season.code`; use `createTestUser`/`createTestSeason`/
  `login`/`cleanupTestData`/`testEmail` from `__tests__/integration/fixtures.ts`;
  `jest.setTimeout(60000)`. **Fixtures are synthetic** — never reproduce a real
  student's data.
- **The staging DB contains real students.** Any list assertion made as
  SUPER/MENTOR (unscoped) must confine itself to fixture rows by passing
  `?q=space-v2-test-` (search matches `email contains`, and every fixture
  email starts with the prefix). Never assert an exact length on an unscoped,
  unfiltered list.
- **Integration tests are serial.** Executed task-by-task (the default), each
  task runs its own suite:
  `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern students`.
  If backend tasks are ever parallelized across agents, the agents write tests
  unrun and the coordinator runs them serially.
- v1 rules ported faithfully unless a spec §10 item or `_DECISIONS.md` ruling
  says otherwise; **every divergence below names its ruling**.
- **C8:** gate the row, not just the route; narrow the payload, not just the
  access. **C9:** any per-season membership question resolves through
  `SeasonEnrollment`, never `GroupStudent`; `GroupStudent` may only answer
  "current group", advisorily.
- **D7:** `POST /students` sets **no password** (`passwordHash: null`).
  v1's hard-coded `ChangeMe123!` (and its plaintext log line, R17) are NOT
  ported. Credentials arrive with Plan 7's invites; until then a created
  student has no login path — exactly like v1's CSV import
  (`src/lib/student-import.ts:260`). Never log a credential.
- Mobile: relative imports only (no `@/`); every response parsed with a Zod
  schema from `@space/shared`; dependent queries pass `enabled`; states map to
  `LoadingState`/`ErrorState` (with `onRetry`)/`EmptyState`; tab screens pass
  `edges={["top","left","right"]}`; tests use `renderWithProviders`,
  `jest.mock` factories close only over `mock*` consts, `Input` fields queried
  with `getByLabelText`; typed routes — never `as Href`/`as any`; after adding
  a route file run `pnpm turbo routes:generate --filter=@space/mobile`.

**Not in this plan** (deliberate scope cuts, each with its home):
attendance %, submissions, engagement-note and document sub-resources of the
detail (spec 06 §7's sub-resource split — notes/engagement land in Plan 8,
documents ride with uploads/CMS); graduation (`User.graduationYear`,
SUPER-only per R55) and soft-delete `DELETE /students/:id` — they ride with
the student write screens in a later plan; `GET/PATCH /me/profile` (Plan 7's
credential boundary); mobile create/edit forms and drop bottom-sheets (the
write endpoints ship API-first, per the roadmap's plan split); photo/document
uploads (`ENABLE_UPLOADS` is off).

**Execution shape:** Task 1 first (both streams consume the contracts). Then
two independent streams: **backend** Tasks 2 → 3 → 4 → 5 (sequential — they
share `routes/students.ts` and one integration suite) and **mobile** Tasks
6 → 7 (sequential — Task 7 consumes Task 6's query-key factory and hook
file). The streams may run in parallel; screens mock `apiClient`, so they do
not need the backend. Task 8 is the coordinator's closing gate.

---

### Task 1: Contracts — `packages/shared/src/student.ts`

**Files:**
- Create: `packages/shared/src/student.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from "./student";`)
- Test: `packages/shared/src/__tests__/student-schemas.test.ts`

**Interfaces:**
- Consumes: `enrollmentStatusSchema`, `seasonStatusSchema` from `./enums`.
- Produces (exact names later tasks import): `studentListItemSchema` /
  `StudentListItem`, `droppedEnrollmentSummarySchema`,
  `studentListResponseSchema` / `StudentListResponse`,
  `studentListStatusSchema` / `StudentListStatus`, `studentListQuerySchema` /
  `StudentListQuery`, `studentProfilePublicSchema`,
  `studentProfilePrivateSchema`, `studentProfileInternalSchema`,
  `enrollmentHistoryItemSchema` / `EnrollmentHistoryItem`,
  `studentDetailPublicSchema` / `StudentDetailPublic`,
  `studentDetailPrivateSchema` / `StudentDetailPrivate`,
  `studentDetailInternalSchema` / `StudentDetailInternal`,
  `createStudentRequestSchema` / `CreateStudentBody`,
  `updateStudentRequestSchema` / `UpdateStudentBody`,
  `createEnrollmentRequestSchema` / `CreateEnrollmentBody`,
  `updateEnrollmentRequestSchema` / `UpdateEnrollmentBody`.

The brief consolidates the spec §8's proposed `student.ts` + `enrollment.ts`
into **one file** — enrollment schemas have no consumer outside the student
surface in this plan (YAGNI; split later if domain 5 ever imports them).

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/__tests__/student-schemas.test.ts
import {
  createStudentRequestSchema,
  studentDetailPublicSchema,
  studentListQuerySchema,
  updateEnrollmentRequestSchema,
  updateStudentRequestSchema,
} from "../index";

describe("createStudentRequestSchema", () => {
  const valid = { name: "Test Student", email: "space-v2-test-x@jpc.test" };

  it("coerces empty strings to null (v1 rule R26: a cleared field is stored null, never \"\")", () => {
    const parsed = createStudentRequestSchema.parse({ ...valid, university: "" });
    expect(parsed.university).toBeNull();
  });

  it("bounds name at 2–120 like v1's server schema (R20)", () => {
    expect(createStudentRequestSchema.safeParse({ ...valid, name: "x" }).success).toBe(false);
  });

  it("has no password field at all — D7 is structural, not a default", () => {
    // parse strips unknown keys; the schema must not even know the word.
    expect("password" in createStudentRequestSchema.shape).toBe(false);
    expect("passwordHash" in createStudentRequestSchema.shape).toBe(false);
  });
});

describe("updateStudentRequestSchema (PATCH semantics)", () => {
  it("distinguishes 'clear this field' (null) from 'leave it alone' (absent)", () => {
    const cleared = updateStudentRequestSchema.parse({ gifts: null });
    expect(cleared.gifts).toBeNull();
    const untouched = updateStudentRequestSchema.parse({});
    expect(untouched.gifts).toBeUndefined();
  });

  it("still coerces empty string to null on the fields it does receive", () => {
    expect(updateStudentRequestSchema.parse({ phone: "" }).phone).toBeNull();
  });
});

describe("studentDetailPublicSchema", () => {
  const base = {
    id: 1, name: "Test", email: "t@jpc.test", avatarPath: null, graduationYear: null,
    currentGroup: null, enrollments: [],
  };
  const publicProfile = {
    university: null, year: null, gifts: null,
    activeSeasonId: null, activeSeasonTitle: null, activeSeasonCode: null,
  };

  it("REFUSES a payload carrying a withheld field — the leak detector (spec 06 D3)", () => {
    // The public profile is .strict(): a server that leaks `phone` to a
    // LEADER/MENTOR client fails the parse instead of quietly delivering it.
    const leaked = { ...base, profile: { ...publicProfile, phone: "+20 100" } };
    expect(studentDetailPublicSchema.safeParse(leaked).success).toBe(false);
    expect(studentDetailPublicSchema.safeParse({ ...base, profile: publicProfile }).success).toBe(true);
  });
});

describe("studentListQuerySchema", () => {
  it("defaults to the active list with a 25-row page", () => {
    const parsed = studentListQuerySchema.parse({});
    expect(parsed).toMatchObject({ status: "active", limit: 25 });
  });

  it("coerces the string query params HTTP delivers", () => {
    const parsed = studentListQuerySchema.parse({ cursor: "42", limit: "10", seasonId: "7" });
    expect(parsed).toMatchObject({ cursor: 42, limit: 10, seasonId: 7 });
  });
});

describe("updateEnrollmentRequestSchema", () => {
  it("accepts only the two terminal transitions — re-activation does not exist (R50)", () => {
    expect(updateEnrollmentRequestSchema.safeParse({ status: "ACTIVE" }).success).toBe(false);
    expect(updateEnrollmentRequestSchema.safeParse({ status: "WITHDRAWN" }).success).toBe(true);
  });

  it("refuses a dropReason on a COMPLETED transition", () => {
    expect(
      updateEnrollmentRequestSchema.safeParse({ status: "COMPLETED", dropReason: "why" }).success,
    ).toBe(false);
  });

  it("stores an empty reason as null (R66)", () => {
    expect(
      updateEnrollmentRequestSchema.parse({ status: "WITHDRAWN", dropReason: "" }).dropReason,
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @space/shared jest src/__tests__/student-schemas.test.ts`
Expected: FAIL — the exports don't exist.

- [ ] **Step 3: Write the contracts**

```ts
// packages/shared/src/student.ts
import { z } from "zod";

import { enrollmentStatusSchema, seasonStatusSchema } from "./enums";

// Wire shapes — timestamps travel as ISO strings (see the note in season.ts).
//
// `name` is `z.string()`, non-nullable, everywhere in this file: User.name is
// `String` in the schema (prisma/schema.prisma:106). The `string | null` in
// every v1 student type is D9's defect and does not port; nor do the
// `name ?? email` render fallbacks it forced.

/**
 * "" → null on optional free-text (v1 rule R26): a cleared field is stored
 * null, never "". `undefined` survives untouched so PATCH can distinguish
 * "clear this field" (null) from "leave it alone" (absent).
 */
const emptyToNull = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => (v === "" ? null : v));

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export const droppedEnrollmentSummarySchema = z.object({
  enrollmentId: z.number(),
  seasonId: z.number(),
  seasonTitle: z.string(),
  /**
   * Nullable on purpose: the column is nullable and only dropEnrollment sets
   * it alongside the status today. v1 read it with a non-null assertion
   * (students-query.ts:196) that a future bulk-withdraw would break silently
   * (spec 06 §2); the contract encodes the schema's truth instead.
   */
  droppedAt: z.string().nullable(),
  dropReason: z.string().nullable(),
});

export const studentListItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
  avatarPath: z.string().nullable(),
  university: z.string().nullable(),
  year: z.string().nullable(),
  graduationYear: z.number().nullable(),
  activeSeasonTitle: z.string().nullable(),
  /**
   * The student's current group from GroupStudent — the ONE question that
   * table may answer, and only advisorily (ruling C9). Every per-season
   * membership decision in this domain goes through SeasonEnrollment instead.
   */
  currentGroupName: z.string().nullable(),
  /**
   * Non-null only on `status=dropped` rows: the dropped list is
   * enrollment-keyed (R43) — a student dropped from three seasons appears
   * three times, and screens must key rows on `enrollmentId`, not `id`.
   */
  droppedEnrollment: droppedEnrollmentSummarySchema.nullable(),
});
export type StudentListItem = z.infer<typeof studentListItemSchema>;

export const studentListResponseSchema = z.object({
  students: z.array(studentListItemSchema),
  nextCursor: z.number().nullable(),
  /**
   * The whole population under the current filters — D14's fix. v1 capped at
   * 200 rows and printed `rows.length` as if it were the count, so a
   * 250-student database read "200 students".
   */
  total: z.number(),
});
export type StudentListResponse = z.infer<typeof studentListResponseSchema>;

export const studentListStatusSchema = z.enum(["active", "alumni", "dropped"]);
export type StudentListStatus = z.infer<typeof studentListStatusSchema>;

export const studentListQuerySchema = z.object({
  status: studentListStatusSchema.default("active"),
  /** "has an enrollment in this season" — resolved through SeasonEnrollment (C9). */
  seasonId: z.coerce.number().int().positive().optional(),
  /** Matches name, email or university, case-insensitive, ANDed with scope (R33). */
  q: z.string().trim().max(120).optional(),
  /** Row id of the last row of the previous page (enrollment id when status=dropped). */
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type StudentListQuery = z.output<typeof studentListQuerySchema>;

// ---------------------------------------------------------------------------
// Detail — three role-shaped arms (spec 06 §4.2 is the contract)
// ---------------------------------------------------------------------------

/**
 * The cut every admitted staff role may read. `.strict()` — and kept strict by
 * `.extend()` below — so a client parsing the narrow arm FAILS on a payload
 * carrying a withheld field, instead of stripping it silently. That parse
 * failure is the leak detector D3 asks for.
 */
export const studentProfilePublicSchema = z
  .object({
    university: z.string().nullable(),
    year: z.string().nullable(),
    gifts: z.string().nullable(),
    activeSeasonId: z.number().nullable(),
    activeSeasonTitle: z.string().nullable(),
    activeSeasonCode: z.string().nullable(),
  })
  .strict();

/** + the personal data SUPER/ADMIN and the student themselves may read. */
export const studentProfilePrivateSchema = studentProfilePublicSchema.extend({
  phone: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  spiritualBackground: z.string().nullable(),
});

/** + staff-only internal notes. Never sent to the subject (R23). */
export const studentProfileInternalSchema = studentProfilePrivateSchema.extend({
  notes: z.string().nullable(),
});

export const enrollmentHistoryItemSchema = z.object({
  enrollmentId: z.number(),
  seasonId: z.number(),
  seasonCode: z.string(),
  seasonTitle: z.string(),
  seasonStatus: seasonStatusSchema,
  startDate: z.string(),
  endDate: z.string(),
  /** The historic group for THAT season, from SeasonEnrollment.groupId (C9, R5). */
  groupName: z.string().nullable(),
  status: enrollmentStatusSchema,
  enrolledAt: z.string(),
  completedAt: z.string().nullable(),
  droppedAt: z.string().nullable(),
  /** Free-text personal data — always null in the public (LEADER/MENTOR) shape. */
  dropReason: z.string().nullable(),
});
export type EnrollmentHistoryItem = z.infer<typeof enrollmentHistoryItemSchema>;

const studentDetailBase = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
  avatarPath: z.string().nullable(),
  graduationYear: z.number().nullable(),
  /** Advisory current group (GroupStudent — the one question it may answer, C9/R4). */
  currentGroup: z.object({ id: z.number(), name: z.string() }).nullable(),
  /**
   * Enrollment history, `enrolledAt desc`. For a LEADER, only the rows whose
   * group is one of theirs (spec 06 §7: "the scoped season rows").
   * Sub-resources (attendance, submissions, notes, documents, engagement) are
   * NOT fields of this schema — they become their own endpoints in later
   * plans (spec 06 §7's split).
   */
  enrollments: z.array(enrollmentHistoryItemSchema),
});

export const studentDetailPublicSchema = studentDetailBase.extend({
  profile: studentProfilePublicSchema,
});
export type StudentDetailPublic = z.infer<typeof studentDetailPublicSchema>;

export const studentDetailPrivateSchema = studentDetailBase.extend({
  profile: studentProfilePrivateSchema,
});
export type StudentDetailPrivate = z.infer<typeof studentDetailPrivateSchema>;

export const studentDetailInternalSchema = studentDetailBase.extend({
  profile: studentProfileInternalSchema,
});
export type StudentDetailInternal = z.infer<typeof studentDetailInternalSchema>;

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Creation (SUPER-only in v2 — see the route). No password field exists here:
 * D7's `ChangeMe123!` is not ported; the account gets credentials from Plan
 * 7's invites, exactly like v1's CSV import (`passwordHash: null`).
 */
export const createStudentRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email(),
  university: emptyToNull(160),
  year: emptyToNull(40),
  phone: emptyToNull(60),
  dateOfBirth: z.string().datetime({ offset: true }).nullish(),
  spiritualBackground: emptyToNull(4000),
  gifts: emptyToNull(2000),
  notes: emptyToNull(4000),
  /**
   * Optional first enrollment (spec 06 D1): when present, one transaction
   * creates User + StudentProfile + an ACTIVE SeasonEnrollment AND points
   * activeSeasonId at the same season — the two definitions of "in this
   * season" (R9–R13) agree by construction, as v1's CSV import already got
   * right and its form never did (R15).
   */
  seasonId: z.number().int().positive().nullish(),
});
export type CreateStudentBody = z.output<typeof createStudentRequestSchema>;

/**
 * PATCH: absent = untouched, null = cleared. Which keys a caller may send at
 * all is decided per role in the route (SELF_EDITABLE / ADMIN_EDITABLE) —
 * before this schema runs.
 */
export const updateStudentRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().email(),
    university: emptyToNull(160),
    year: emptyToNull(40),
    phone: emptyToNull(60),
    dateOfBirth: z.string().datetime({ offset: true }).nullish(),
    spiritualBackground: emptyToNull(4000),
    gifts: emptyToNull(2000),
    notes: emptyToNull(4000),
    activeSeasonId: z.number().int().positive().nullish(),
  })
  .partial();
export type UpdateStudentBody = z.output<typeof updateStudentRequestSchema>;

export const createEnrollmentRequestSchema = z.object({
  seasonId: z.number().int().positive(),
  // No groupId: group membership is written by the groups endpoints
  // (PATCH /groups/:id → setGroupStudents), never here. One writer per fact.
});
export type CreateEnrollmentBody = z.output<typeof createEnrollmentRequestSchema>;

export const updateEnrollmentRequestSchema = z
  .object({
    /**
     * The only two transitions that exist, both out of ACTIVE (R48–R50).
     * ACTIVE is deliberately not accepted: no un-drop, no re-activate — the
     * only v1 path that ever resurrected a WITHDRAWN enrollment was the group
     * form's delete-and-recreate, the most damaging defect in the domain
     * (D2), and v2's group writes already refuse to touch status.
     */
    status: z.enum(["WITHDRAWN", "COMPLETED"]),
    dropReason: emptyToNull(500),
  })
  .refine((v) => v.status === "WITHDRAWN" || v.dropReason == null, {
    path: ["dropReason"],
    message: "A drop reason only accompanies a withdrawal.",
  });
export type UpdateEnrollmentBody = z.output<typeof updateEnrollmentRequestSchema>;
```

Add `export * from "./student";` to `packages/shared/src/index.ts`.

- [ ] **Step 4: Run the test and the workspace checks**

Run: `pnpm --filter @space/shared jest src/__tests__/student-schemas.test.ts` → PASS.
Run: `pnpm turbo lint typecheck --filter=@space/shared` → clean.

- [ ] **Step 5: Commit**

```bash
git add packages/shared && git commit -m "feat(shared): student and enrollment Zod contracts with role-shaped detail arms"
```

---

### Task 2: Gates + `GET /api/v1/students` (list, all three statuses)

**Files:**
- Modify: `apps/backend/src/lib/permissions.ts` (add `canViewStudent`, `canEditStudent` — this task owns ALL permissions.ts changes so Tasks 3–5 never touch it)
- Create: `apps/backend/src/lib/queries/students.ts`
- Create: `apps/backend/src/routes/students.ts`
- Modify: `apps/backend/src/app.ts` (mount the router)
- Modify: `apps/backend/src/docs/openapi.ts` (same commit)
- Test: create `apps/backend/src/__tests__/integration/students-routes.test.ts`

**Interfaces:**
- Consumes: `studentListQuerySchema` (Task 1, value import via relative path), shared types via `import type ... from "@space/shared"`, `canReadAllStudents`/`isSuper`/`isMentor` from `../rbac`, `apiOk`/`apiError`, `requireAuth`/`requireUser`, `parseId`.
- Produces: `canViewStudent(user: SessionUser, studentUserId: number): Promise<boolean>` and `canEditStudent(user: SessionUser, studentUserId: number): Promise<boolean>` in `lib/permissions.ts` (Tasks 3–4 consume); `listStudents(user: SessionUser, query: StudentListQuery): Promise<StudentListResult | null>` in `lib/queries/students.ts` where `StudentListResult = { students: StudentListItem[]; nextCursor: number | null; total: number }` (null = caller may not read this surface at all → route answers 403); the mounted endpoint `GET /api/v1/students`; the suite's shared fixture block (Tasks 3–5 extend this file and reuse it).

- [ ] **Step 1: Create the integration suite with its fixture block and the failing list tests**

```ts
// apps/backend/src/__tests__/integration/students-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login, testEmail } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

// Every fixture email starts with this. Unscoped (SUPER/MENTOR) list
// assertions pass ?q=space-v2-test- so real rows in the shared staging DB can
// never satisfy or break them.
const PFX = "space-v2-test-";

let seasonAId: number;
let seasonBId: number;
let groupId: number;
let superToken: string;
let adminToken: string; // season admin of A only
let mentorToken: string;
let leaderToken: string; // leads the one group in A
let student1Id: number; // enrolled in A (group-linked via the ENROLLMENT row) and in B
let student1Token: string;
let student2Id: number; // enrolled in B only
let alumnusId: number; // graduationYear set, COMPLETED enrollment in A
let droppedId: number; // WITHDRAWN enrollment in A, no group
let droppedEnrollmentId: number;
let deletedDroppedId: number; // soft-deleted user with a WITHDRAWN enrollment (D12)

beforeAll(async () => {
  await cleanupTestData();

  seasonAId = (await createTestSeason()).id;
  seasonBId = (await createTestSeason()).id;

  const superUser = await createTestUser("super", "SUPER");
  const admin = await createTestUser("admin", "ADMIN");
  await db.seasonAdmin.create({ data: { seasonId: seasonAId, userId: admin.id } });
  const mentor = await createTestUser("mentor", "MENTOR");
  const leader = await createTestUser("leader", "LEADER");

  const group = await db.group.create({
    data: { seasonId: seasonAId, name: "Group A", leaders: { create: { userId: leader.id } } },
    select: { id: true },
  });
  groupId = group.id;

  const student1 = await createTestUser("student-one", "STUDENT");
  student1Id = student1.id;
  await db.studentProfile.create({
    data: {
      userId: student1Id,
      activeSeasonId: seasonAId,
      university: "Test University",
      year: "3rd",
      phone: "+20 100 000 0000",
      spiritualBackground: "Test background",
      gifts: "Teaching",
      notes: "Internal staff note",
    },
  });
  // The group link lives on the ENROLLMENT row only — deliberately NO
  // GroupStudent row, so any scope that quietly falls back to GroupStudent
  // (v1's unreachable leader branch, students-query.ts:50-55) fails the
  // leader tests below (ruling C9).
  await db.seasonEnrollment.create({
    data: { studentUserId: student1Id, seasonId: seasonAId, groupId, status: "ACTIVE" },
  });
  // A second, group-less enrollment in B: the leader detail test (Task 3)
  // proves row scoping by seeing 1 of these 2.
  await db.seasonEnrollment.create({
    data: { studentUserId: student1Id, seasonId: seasonBId, status: "COMPLETED", completedAt: new Date() },
  });

  const student2 = await createTestUser("student-two", "STUDENT");
  student2Id = student2.id;
  await db.studentProfile.create({ data: { userId: student2Id } });
  await db.seasonEnrollment.create({
    data: { studentUserId: student2Id, seasonId: seasonBId, status: "ACTIVE" },
  });

  const alumnus = await createTestUser("alumnus", "STUDENT");
  alumnusId = alumnus.id;
  await db.user.update({ where: { id: alumnusId }, data: { graduationYear: 2024 } });
  await db.studentProfile.create({ data: { userId: alumnusId, university: "Alumni University" } });
  await db.seasonEnrollment.create({
    data: { studentUserId: alumnusId, seasonId: seasonAId, status: "COMPLETED", completedAt: new Date() },
  });

  const dropped = await createTestUser("dropped", "STUDENT");
  droppedId = dropped.id;
  await db.studentProfile.create({ data: { userId: droppedId } });
  const droppedEnrollment = await db.seasonEnrollment.create({
    data: {
      studentUserId: droppedId,
      seasonId: seasonAId,
      status: "WITHDRAWN",
      droppedAt: new Date("2099-06-01T00:00:00.000Z"),
      dropReason: "Moved away",
    },
    select: { id: true },
  });
  droppedEnrollmentId = droppedEnrollment.id;

  const deletedDropped = await createTestUser("deleted-dropped", "STUDENT");
  deletedDroppedId = deletedDropped.id;
  await db.seasonEnrollment.create({
    data: { studentUserId: deletedDroppedId, seasonId: seasonAId, status: "WITHDRAWN", droppedAt: new Date() },
  });
  await db.user.update({ where: { id: deletedDroppedId }, data: { deletedAt: new Date() } });

  superToken = await login(app, superUser.email);
  adminToken = await login(app, admin.email);
  mentorToken = await login(app, mentor.email);
  leaderToken = await login(app, leader.email);
  student1Token = await login(app, student1.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/students (active)", () => {
  it("returns every non-graduated, non-deleted student for SUPER, with a real total", async () => {
    const res = await request(app)
      .get(`/api/v1/students?q=${PFX}`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.students.map((s: { id: number }) => s.id);
    // droppedId IS here: WITHDRAWN is an enrollment fact, not a user state —
    // the active list excludes only alumni (R29) and the soft-deleted.
    expect(ids).toEqual(expect.arrayContaining([student1Id, student2Id, droppedId]));
    expect(ids).not.toContain(alumnusId);
    expect(ids).not.toContain(deletedDroppedId);
    expect(res.body.data.total).toBe(3);
    const row = res.body.data.students.find((s: { id: number }) => s.id === student1Id);
    expect(row).toMatchObject({
      name: "Test student-one",
      university: "Test University",
      activeSeasonTitle: "Test Season",
      droppedEnrollment: null,
    });
  });

  it("narrows ADMIN to students ever enrolled in their seasons (R31, kept)", async () => {
    const res = await request(app)
      .get(`/api/v1/students?q=${PFX}`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.students.map((s: { id: number }) => s.id);
    expect(ids).toEqual(expect.arrayContaining([student1Id, droppedId]));
    expect(ids).not.toContain(student2Id); // season B is not theirs
  });

  it("narrows LEADER to their groups' members through the ENROLLMENT row (C9)", async () => {
    // student1 has NO GroupStudent row — only SeasonEnrollment.groupId links
    // them to the leader's group. A scope that reads GroupStudent returns [].
    const res = await request(app)
      .get(`/api/v1/students?q=${PFX}`)
      .set("authorization", `Bearer ${leaderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.students.map((s: { id: number }) => s.id)).toEqual([student1Id]);
    expect(res.body.data.total).toBe(1);
  });

  it("refuses a STUDENT caller — no student roster for students (C8)", async () => {
    const res = await request(app)
      .get("/api/v1/students")
      .set("authorization", `Bearer ${student1Token}`);
    expect(res.status).toBe(403);
  });

  it("filters by seasonId through enrollments, any status", async () => {
    const res = await request(app)
      .get(`/api/v1/students?q=${PFX}&seasonId=${seasonBId}`)
      .set("authorization", `Bearer ${superToken}`);

    const ids = res.body.data.students.map((s: { id: number }) => s.id);
    expect([...ids].sort()).toEqual([student1Id, student2Id].sort());
  });

  it("searches university case-insensitively, ANDed with scope (R33)", async () => {
    const res = await request(app)
      .get(`/api/v1/students?q=${encodeURIComponent("test university")}`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(res.body.data.students.map((s: { id: number }) => s.id)).toEqual([student1Id]);
  });

  it("pages with a stable cursor and a constant total (D14 — no silent 200-row cap)", async () => {
    const first = await request(app)
      .get(`/api/v1/students?q=${PFX}&limit=2`)
      .set("authorization", `Bearer ${superToken}`);
    expect(first.body.data.students).toHaveLength(2);
    expect(first.body.data.nextCursor).not.toBeNull();
    expect(first.body.data.total).toBe(3);

    const second = await request(app)
      .get(`/api/v1/students?q=${PFX}&limit=2&cursor=${first.body.data.nextCursor}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(second.body.data.students).toHaveLength(1);
    expect(second.body.data.nextCursor).toBeNull();
    const firstIds = first.body.data.students.map((s: { id: number }) => s.id);
    expect(firstIds).not.toContain(second.body.data.students[0].id);
  });
});

describe("GET /api/v1/students?status=alumni", () => {
  it("lists alumni with the graduation year for ADMIN and MENTOR", async () => {
    for (const token of [adminToken, mentorToken]) {
      const res = await request(app)
        .get(`/api/v1/students?status=alumni&q=${PFX}`)
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      const row = res.body.data.students.find((s: { id: number }) => s.id === alumnusId);
      expect(row).toMatchObject({ graduationYear: 2024, university: "Alumni University" });
    }
  });

  it("refuses LEADER — v1 gave them no alumni surface (spec 06 §4.1)", async () => {
    const res = await request(app)
      .get("/api/v1/students?status=alumni")
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/students?status=dropped", () => {
  it("returns enrollment-keyed rows with the drop reason (R43)", async () => {
    const res = await request(app)
      .get(`/api/v1/students?status=dropped&q=${PFX}`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    const row = res.body.data.students.find((s: { id: number }) => s.id === droppedId);
    expect(row.droppedEnrollment).toMatchObject({
      enrollmentId: droppedEnrollmentId,
      seasonId: seasonAId,
      dropReason: "Moved away",
    });
  });

  it("excludes soft-deleted students (D12 — v1 listed their name and reason forever)", async () => {
    const res = await request(app)
      .get(`/api/v1/students?status=dropped&q=${PFX}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.body.data.students.map((s: { id: number }) => s.id)).not.toContain(deletedDroppedId);
  });

  it("narrows ADMIN to their seasons' withdrawals (R45)", async () => {
    const res = await request(app)
      .get(`/api/v1/students?status=dropped&q=${PFX}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.students.length).toBeGreaterThan(0);
    for (const s of res.body.data.students) {
      expect(s.droppedEnrollment.seasonId).toBe(seasonAId);
    }
  });

  it("refuses MENTOR — as an endpoint this hands every drop reason to read-all (spec 06 §4.3/§7)", async () => {
    const res = await request(app)
      .get("/api/v1/students?status=dropped")
      .set("authorization", `Bearer ${mentorToken}`);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the suite to see it fail**

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern students`
Expected: FAIL — every request 404s (`not_found` catch-all; the router doesn't exist).

- [ ] **Step 3: Add the two gates to `lib/permissions.ts`**

Append (below `canReviewSubmission`, same import set — `canReadAllStudents` is
not needed here, `isSuper`/`isMentor` already imported):

```ts
/**
 * May this caller read this student at all? (spec 06 §4.1 "Read student detail")
 *
 * v1's loadStudentDetail performed no authorization — four pages each called
 * canViewStudent by convention before it (R70). Here the gate lives in the
 * handler. One deliberate divergence from v1's gate: the LEADER branch
 * resolves through SeasonEnrollment.groupId, not GroupStudent (ruling C9) —
 * GroupStudent holds one row per student across the whole database, so it
 * answers "are they in my group NOW", denying a leader their own students'
 * history the moment a new season reassigns them. canViewSubmission already
 * made this exact call; the two must not disagree.
 */
export async function canViewStudent(user: SessionUser, studentUserId: number): Promise<boolean> {
  if (isSuper(user) || isMentor(user)) return true;
  if (user.userId === studentUserId) return true;
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
  return false;
}

/**
 * May this caller edit this student's profile?
 *
 * Divergence from v1, per spec 06 D4: v1's canEditStudent tested the
 * activeSeasonId pointer while canViewStudent tested enrollments, so an ADMIN
 * could edit a student their list never showed them and not edit one it did.
 * Both gates are enrollment-based here, and edit additionally requires the
 * enrollment to be ACTIVE — an admin's write power over a person ends when
 * that person's season with them does.
 */
export async function canEditStudent(user: SessionUser, studentUserId: number): Promise<boolean> {
  if (isSuper(user)) return true;
  if (user.userId === studentUserId) return true;
  if (user.role !== "ADMIN" || user.seasonAdminIds.length === 0) return false;
  const enrollment = await db.seasonEnrollment.findFirst({
    where: { studentUserId, seasonId: { in: user.seasonAdminIds }, status: "ACTIVE" },
    select: { id: true },
  });
  return enrollment !== null;
}
```

- [ ] **Step 4: Write `lib/queries/students.ts`**

```ts
// apps/backend/src/lib/queries/students.ts
import type {
  StudentListItem,
  StudentListQuery,
} from "@space/shared";

import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import type { SessionUser } from "../auth/tokens";
import { canReadAllStudents, isMentor, isSuper } from "../rbac";

export interface StudentListResult {
  students: StudentListItem[];
  nextCursor: number | null;
  total: number;
}

type StudentScope = { kind: "all" } | { kind: "ids"; ids: number[] };

/**
 * D6's single implementation of "which students may this caller see".
 *
 * SUPER and MENTOR read all (canReadAllStudents). ADMIN gets the distinct
 * students EVER enrolled in their seasons, regardless of enrollment status —
 * v1's semantics (R30/R31), kept: the list answers "ever mine", not
 * "currently mine". LEADER gets the distinct students whose ENROLLMENT names
 * one of their groups — ruling C9; v1's (unreachable — no leader list page
 * ever existed, R28) branch read GroupStudent instead, which forgets a
 * leader's students the moment a later season reassigns them.
 *
 * null = this caller has no student-list surface at all (STUDENT) → 403.
 */
async function studentListScope(user: SessionUser): Promise<StudentScope | null> {
  if (canReadAllStudents(user)) return { kind: "all" };
  if (user.role === "ADMIN") {
    if (user.seasonAdminIds.length === 0) return { kind: "ids", ids: [] };
    const enrollments = await db.seasonEnrollment.findMany({
      where: { seasonId: { in: user.seasonAdminIds } },
      select: { studentUserId: true },
      distinct: ["studentUserId"],
    });
    return { kind: "ids", ids: enrollments.map((e) => e.studentUserId) };
  }
  if (user.role === "LEADER") {
    if (user.groupLeaderIds.length === 0) return { kind: "ids", ids: [] };
    const enrollments = await db.seasonEnrollment.findMany({
      where: { groupId: { in: user.groupLeaderIds } },
      select: { studentUserId: true },
      distinct: ["studentUserId"],
    });
    return { kind: "ids", ids: enrollments.map((e) => e.studentUserId) };
  }
  return null;
}

function searchFilter(q: string | undefined): Prisma.UserWhereInput {
  if (!q) return {};
  return {
    OR: [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { studentProfile: { university: { contains: q, mode: "insensitive" } } },
    ],
  };
}

const LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  avatarPath: true,
  graduationYear: true,
  studentProfile: {
    select: {
      university: true,
      year: true,
      activeSeason: { select: { title: true } },
    },
  },
  // Advisory current group — the one question GroupStudent may answer (C9).
  groupStudentMembership: { select: { group: { select: { name: true } } } },
} as const;

type ListRow = Prisma.UserGetPayload<{ select: typeof LIST_SELECT }>;

function toListItem(u: ListRow): StudentListItem {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    avatarPath: u.avatarPath,
    university: u.studentProfile?.university ?? null,
    year: u.studentProfile?.year ?? null,
    graduationYear: u.graduationYear,
    activeSeasonTitle: u.studentProfile?.activeSeason?.title ?? null,
    currentGroupName: u.groupStudentMembership?.group.name ?? null,
    droppedEnrollment: null,
  };
}

/** Returns null when the caller may not read this surface at all → 403. */
export async function listStudents(
  user: SessionUser,
  query: StudentListQuery,
): Promise<StudentListResult | null> {
  if (query.status === "dropped") return listDroppedEnrollments(user, query);

  // Alumni surface: SUPER, ADMIN, MENTOR (spec 06 §4.1/§7). LEADER never had
  // one; as an endpoint the empty-scope convention would leak "you exist but
  // see nothing" — refuse instead (C8).
  if (query.status === "alumni" && !(isSuper(user) || isMentor(user) || user.role === "ADMIN")) {
    return null;
  }

  const scope = await studentListScope(user);
  if (scope === null) return null;
  if (scope.kind === "ids" && scope.ids.length === 0) {
    return { students: [], nextCursor: null, total: 0 };
  }

  // AND-composed so the scope clause can never be overwritten by a filter —
  // the same discipline as the submissions queue (a disappearing scope clause
  // is a data leak, not a lost filter).
  const where: Prisma.UserWhereInput = {
    AND: [
      { role: "STUDENT", deletedAt: null },
      // R29/R38: graduationYear is the whole alumnus marker; the two lists
      // are the same table filtered on the same column.
      { graduationYear: query.status === "alumni" ? { not: null } : null },
      ...(scope.kind === "ids" ? [{ id: { in: scope.ids } }] : []),
      // Season filter through enrollments, any status (C9; matches the ADMIN
      // scope's "ever enrolled" meaning).
      ...(query.seasonId ? [{ seasonEnrollments: { some: { seasonId: query.seasonId } } }] : []),
      searchFilter(query.q),
    ],
  };

  const orderBy: Prisma.UserOrderByWithRelationInput[] =
    query.status === "alumni"
      ? [{ graduationYear: "desc" }, { name: "asc" }, { id: "asc" }] // R40
      : [{ name: "asc" }, { id: "asc" }]; // R34's order, without its cap

  const [rows, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy,
      take: query.limit + 1, // one extra row answers "is there another page"
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: LIST_SELECT,
    }),
    db.user.count({ where }),
  ]);

  const page = rows.slice(0, query.limit);
  return {
    students: page.map(toListItem),
    nextCursor: rows.length > query.limit ? (page[page.length - 1]?.id ?? null) : null,
    total,
  };
}

/**
 * The dropped list is a list of ENROLLMENTS, not students (R43): its row key
 * is the enrollment id and a student dropped from three seasons appears three
 * times. SUPER and ADMIN only — v1's gate also admitted MENTOR but no mentor
 * page ever called it; as an endpoint that would hand every drop reason in
 * the database to read-all (spec 06 §4.3), so the surface narrows (§7).
 */
async function listDroppedEnrollments(
  user: SessionUser,
  query: StudentListQuery,
): Promise<StudentListResult | null> {
  if (!isSuper(user) && user.role !== "ADMIN") return null;
  if (user.role === "ADMIN" && user.seasonAdminIds.length === 0) {
    return { students: [], nextCursor: null, total: 0 };
  }

  const where: Prisma.SeasonEnrollmentWhereInput = {
    AND: [
      { status: "WITHDRAWN" },
      // D12: v1 filtered neither deletedAt nor role here, so a soft-deleted
      // student's name, email and drop reason stayed listed forever, with a
      // click-through that 404s.
      { studentUser: { role: "STUDENT", deletedAt: null, ...searchFilter(query.q) } },
      ...(user.role === "ADMIN" ? [{ seasonId: { in: user.seasonAdminIds } }] : []),
      ...(query.seasonId ? [{ seasonId: query.seasonId }] : []),
    ],
  };

  const [rows, total] = await Promise.all([
    db.seasonEnrollment.findMany({
      where,
      orderBy: [{ droppedAt: "desc" }, { id: "desc" }], // R46
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        seasonId: true,
        droppedAt: true,
        dropReason: true,
        season: { select: { title: true } },
        studentUser: { select: LIST_SELECT },
      },
    }),
    db.seasonEnrollment.count({ where }),
  ]);

  const page = rows.slice(0, query.limit);
  return {
    students: page.map((r) => ({
      ...toListItem(r.studentUser),
      droppedEnrollment: {
        enrollmentId: r.id,
        seasonId: r.seasonId,
        seasonTitle: r.season.title,
        // Nullable on the contract: only dropEnrollment sets it today, but
        // nothing in the schema guarantees that (spec 06 §2's warning about
        // v1's non-null assertion at students-query.ts:196).
        droppedAt: r.droppedAt?.toISOString() ?? null,
        dropReason: r.dropReason,
      },
    })),
    nextCursor: rows.length > query.limit ? (page[page.length - 1]?.id ?? null) : null,
    total,
  };
}
```

- [ ] **Step 5: Write the route and mount it**

```ts
// apps/backend/src/routes/students.ts
import { Router } from "express";

import { apiOk, apiError } from "../lib/api-response";
import { listStudents } from "../lib/queries/students";
import { studentListQuerySchema } from "../../../../packages/shared/src/index";
import { requireAuth, requireUser } from "../middleware/require-auth";

export const studentsRouter = Router();

studentsRouter.use(requireAuth);

/**
 * One endpoint, three list surfaces: ?status=active|alumni|dropped. This is
 * also why no /students/alumni literal route exists to be shadowed by (or to
 * shadow) "/:id". Scope is per-role (spec 06 §4.1); dropped rows are
 * enrollment-keyed (R43).
 */
studentsRouter.get("/", async (req, res) => {
  const user = requireUser(req);
  const parsed = studentListQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid query.", 400);

  const result = await listStudents(user, parsed.data);
  if (result === null) return apiError(res, "forbidden", "You don't have access to this.", 403);
  return apiOk(res, result);
});
```

In `apps/backend/src/app.ts`, add the import next to its siblings and mount it
(order among the API routers is not significant — each has its own prefix):

```ts
import { studentsRouter } from "./routes/students";
// ...
app.use("/api/v1/students", studentsRouter);
```

- [ ] **Step 6: Run the suite**

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern students` → the Task-2 describes PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/backend` → clean.

- [ ] **Step 7: OpenAPI** — add `GET /api/v1/students` to `src/docs/openapi.ts`
in this same commit (house style: hand-authored, prose `description`).
Document: the `status` query enum and that `dropped` rows are
enrollment-keyed; per-role narrowing (SUPER/MENTOR all, ADMIN ever-enrolled,
LEADER via enrollment `groupId` — C9); that `alumni` excludes LEADER and
`dropped` excludes MENTOR and LEADER (403 `forbidden`); cursor + `total`
semantics (D14).

- [ ] **Step 8: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): student list with role narrowing, status surfaces, and cursor pagination"
```

---

### Task 3: `GET /api/v1/students/:id` — role-shaped detail

**Files:**
- Modify: `apps/backend/src/lib/queries/students.ts` (add `loadStudentDetail`)
- Modify: `apps/backend/src/routes/students.ts` (add the route)
- Modify: `apps/backend/src/docs/openapi.ts` (same commit)
- Test: extend `apps/backend/src/__tests__/integration/students-routes.test.ts`

**Interfaces:**
- Consumes: `canViewStudent` (Task 2), `parseId`, the suite's fixtures (Task 2), shared detail types (Task 1).
- Produces: `type StudentDetailView = "public" | "private" | "internal"` and `loadStudentDetail(studentUserId: number, view: StudentDetailView, user: SessionUser): Promise<StudentDetailPublic | StudentDetailPrivate | StudentDetailInternal | null>` in `lib/queries/students.ts`; endpoint `GET /api/v1/students/:id` (Task 7's screen consumes it).

- [ ] **Step 1: Append the failing tests**

```ts
describe("GET /api/v1/students/:id", () => {
  it("returns the internal shape to SUPER — notes and phone included", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.profile).toMatchObject({
      university: "Test University",
      phone: "+20 100 000 0000",
      spiritualBackground: "Test background",
      notes: "Internal staff note",
    });
    // Both enrollments, newest first (R72); the historic group comes from the
    // ENROLLMENT row (C9/R5), not GroupStudent — none exists for student1.
    expect(res.body.data.enrollments).toHaveLength(2);
    const inA = res.body.data.enrollments.find(
      (e: { seasonId: number }) => e.seasonId === seasonAId,
    );
    expect(inA).toMatchObject({ status: "ACTIVE", groupName: "Group A" });
    expect(res.body.data.currentGroup).toBeNull(); // advisory pointer genuinely unset
  });

  it("returns the internal shape to a season ADMIN of the student", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.profile.notes).toBe("Internal staff note");
  });

  it("refuses an ADMIN outside the student's seasons", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${student2Id}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it("withholds phone, DOB, spiritual background and notes from MENTOR — absence, not null (D3)", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${mentorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.profile).toHaveProperty("university", "Test University");
    // The keys must not exist on the wire at all — a null would still admit
    // the field exists and still round-trip through generic clients.
    expect(res.body.data.profile).not.toHaveProperty("phone");
    expect(res.body.data.profile).not.toHaveProperty("dateOfBirth");
    expect(res.body.data.profile).not.toHaveProperty("spiritualBackground");
    expect(res.body.data.profile).not.toHaveProperty("notes");
  });

  it("admits a LEADER to their own student with the public shape and only their rows", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${leaderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.profile).not.toHaveProperty("phone");
    expect(res.body.data.profile).not.toHaveProperty("notes");
    // student1 holds two enrollments; only the one naming the leader's group
    // travels (spec 06 §7: "the scoped season rows").
    expect(res.body.data.enrollments).toHaveLength(1);
    expect(res.body.data.enrollments[0].seasonId).toBe(seasonAId);
    expect(res.body.data.enrollments[0].dropReason).toBeNull();
  });

  it("refuses a LEADER outside their groups (C8 — the row gate, not just the route)", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${student2Id}`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(403);
  });

  it("returns the private shape to the student themselves — never their internal notes (R23)", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${student1Token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.profile).toHaveProperty("phone", "+20 100 000 0000");
    expect(res.body.data.profile).not.toHaveProperty("notes");
  });

  it("refuses a student reading another student", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${student2Id}`)
      .set("authorization", `Bearer ${student1Token}`);
    expect(res.status).toBe(403);
  });

  it("404s a soft-deleted student (R69)", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${deletedDroppedId}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(404);
  });
});
```

Run the suite → new describe FAILS (404 on every case; route missing).

- [ ] **Step 2: Add `loadStudentDetail` to `lib/queries/students.ts`**

Append (add `StudentDetailPublic`, `StudentDetailPrivate`,
`StudentDetailInternal`, `EnrollmentHistoryItem` to the type-only shared
import at the top):

```ts
export type StudentDetailView = "public" | "private" | "internal";
export type StudentDetail = StudentDetailPublic | StudentDetailPrivate | StudentDetailInternal;

/**
 * The role-shaped detail (spec 06 §4.2). The profile arms are built FIELD BY
 * FIELD, never by spreading the Prisma row: a spread is how a newly selected
 * column leaks to the narrow roles without any diff touching this function,
 * and the absence tests only stay meaningful while construction is explicit.
 *
 * Sub-resources (attendance %, submissions, notes, documents, engagement) are
 * deliberately absent — they become their own endpoints in later plans (§7's
 * split), which also kills v1's 2-queries-per-enrollment N+1 (R76).
 */
export async function loadStudentDetail(
  studentUserId: number,
  view: StudentDetailView,
  user: SessionUser,
): Promise<StudentDetail | null> {
  const row = await db.user.findFirst({
    // R69: role and soft-delete are part of resolution, not decoration.
    where: { id: studentUserId, role: "STUDENT", deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      avatarPath: true,
      graduationYear: true,
      studentProfile: {
        select: {
          university: true,
          year: true,
          phone: true,
          dateOfBirth: true,
          spiritualBackground: true,
          gifts: true,
          notes: true,
          activeSeasonId: true,
          activeSeason: { select: { title: true, code: true } },
        },
      },
      groupStudentMembership: { select: { group: { select: { id: true, name: true } } } },
    },
  });
  if (!row) return null;

  const enrollments = await db.seasonEnrollment.findMany({
    where: { studentUserId },
    orderBy: { enrolledAt: "desc" }, // R72
    select: {
      id: true,
      seasonId: true,
      groupId: true,
      status: true,
      enrolledAt: true,
      completedAt: true,
      droppedAt: true,
      dropReason: true,
      season: {
        select: { title: true, code: true, status: true, startDate: true, endDate: true },
      },
      group: { select: { name: true } },
    },
  });

  // LEADER sees only the rows naming one of their groups (§7's "scoped
  // season rows"); every other admitted role sees the full history.
  const scoped =
    user.role === "LEADER"
      ? enrollments.filter((e) => e.groupId !== null && user.groupLeaderIds.includes(e.groupId))
      : enrollments;

  const history: EnrollmentHistoryItem[] = scoped.map((e) => ({
    enrollmentId: e.id,
    seasonId: e.seasonId,
    seasonCode: e.season.code,
    seasonTitle: e.season.title,
    seasonStatus: e.season.status,
    startDate: e.season.startDate.toISOString(),
    endDate: e.season.endDate.toISOString(),
    groupName: e.group?.name ?? null, // the historic group, from the enrollment (C9/R5)
    status: e.status,
    enrolledAt: e.enrolledAt.toISOString(),
    completedAt: e.completedAt?.toISOString() ?? null,
    droppedAt: e.droppedAt?.toISOString() ?? null,
    // Free-text personal data: withheld from the narrow roles.
    dropReason: view === "public" ? null : e.dropReason,
  }));

  const p = row.studentProfile;
  const base = {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarPath: row.avatarPath,
    graduationYear: row.graduationYear,
    currentGroup: row.groupStudentMembership?.group
      ? { id: row.groupStudentMembership.group.id, name: row.groupStudentMembership.group.name }
      : null,
    enrollments: history,
  };
  const publicProfile = {
    university: p?.university ?? null,
    year: p?.year ?? null,
    gifts: p?.gifts ?? null,
    activeSeasonId: p?.activeSeasonId ?? null,
    activeSeasonTitle: p?.activeSeason?.title ?? null,
    activeSeasonCode: p?.activeSeason?.code ?? null,
  };
  if (view === "public") return { ...base, profile: publicProfile };

  const privateProfile = {
    ...publicProfile,
    phone: p?.phone ?? null,
    dateOfBirth: p?.dateOfBirth?.toISOString() ?? null,
    spiritualBackground: p?.spiritualBackground ?? null,
  };
  if (view === "private") return { ...base, profile: privateProfile };

  return { ...base, profile: { ...privateProfile, notes: p?.notes ?? null } };
}
```

- [ ] **Step 3: Add the route**

Append to `routes/students.ts` (extend its imports: `parseId` from
`"../lib/parse-id"`, `canViewStudent` from `"../lib/permissions"`,
`loadStudentDetail` and `type StudentDetailView` from
`"../lib/queries/students"`, `isSuper` from `"../lib/rbac"`, `type
{ SessionUser }` from `"../lib/auth/tokens"`):

```ts
/**
 * Which of the three §4.2 shapes this caller receives. SUPER and ADMIN read
 * everything; the subject reads their own personal data but never the
 * staff-only internal notes (R23); MENTOR and LEADER get the narrow cut —
 * v1 delivered them the full object and relied on React props to not render
 * it (§4.2's LEADER column), which an endpoint cannot do.
 */
function detailViewFor(user: SessionUser, studentUserId: number): StudentDetailView {
  if (isSuper(user) || user.role === "ADMIN") return "internal";
  if (user.userId === studentUserId) return "private";
  return "public";
}

studentsRouter.get("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid student id.", 400);

  // The gate lives in the handler, not in a call-site convention (R70/C8).
  if (!(await canViewStudent(user, id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const detail = await loadStudentDetail(id, detailViewFor(user, id), user);
  if (!detail) return apiError(res, "not_found", "Student not found.", 404);
  return apiOk(res, detail);
});
```

Registration order note: `"/"`, `"/:id"` and Task 5's `"/:id/enrollments"`
never shadow one another (different segment counts) — no ordering constraint
beyond keeping `"/"` first for readability.

- [ ] **Step 4: Run the suite and the workspace checks**

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern students` → PASS (Tasks 2 + 3 describes).
Run: `pnpm turbo lint typecheck test:unit --filter=@space/backend` → clean.

- [ ] **Step 5: OpenAPI** — add `GET /api/v1/students/:id` in the same commit.
Document the three response shapes and, explicitly, the absence contract:
which fields do not exist on the wire for MENTOR/LEADER (phone, dateOfBirth,
spiritualBackground, notes, per-row dropReason) and that the subject never
receives `notes`.

- [ ] **Step 6: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): role-shaped student detail with enrollment history (C8/C9)"
```

---

### Task 4: `POST /api/v1/students` + `PATCH /api/v1/students/:id`

**Files:**
- Modify: `apps/backend/src/routes/students.ts`
- Modify: `apps/backend/src/docs/openapi.ts` (same commit)
- Test: extend `apps/backend/src/__tests__/integration/students-routes.test.ts`

**Interfaces:**
- Consumes: `createStudentRequestSchema`, `updateStudentRequestSchema` (Task 1, via the existing relative shared import), `canEditStudent` (Task 2), `Prisma` error class as a **value** from `"../generated/prisma/client"` (verify against how `db/client.ts` imports it and match that path).
- Produces: `POST /api/v1/students` → `{ data: { id, email } }` 201; `PATCH /api/v1/students/:id` → `{ data: { id } }`; error codes `email_taken` (409), `forbidden_field` (403).

- [ ] **Step 1: Append the failing tests**

```ts
describe("POST /api/v1/students", () => {
  it("creates user + profile + ACTIVE enrollment in one transaction, with NO password (D7/D1)", async () => {
    const email = testEmail("created");
    const res = await request(app)
      .post("/api/v1/students")
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Created Student", email, seasonId: seasonAId, university: "" });

    expect(res.status).toBe(201);
    const row = await db.user.findUnique({
      where: { id: res.body.data.id },
      select: {
        passwordHash: true,
        role: true,
        studentProfile: { select: { activeSeasonId: true, university: true } },
        seasonEnrollments: { select: { seasonId: true, status: true } },
      },
    });
    expect(row).toMatchObject({
      // D7: ChangeMe123! is NOT ported. No credentials until Plan 7's
      // invites — the same no-login-path state v1's CSV import produces.
      passwordHash: null,
      role: "STUDENT",
      // D1: the profile pointer and the enrollment agree by construction,
      // and ""→null held (R26).
      studentProfile: { activeSeasonId: seasonAId, university: null },
      seasonEnrollments: [{ seasonId: seasonAId, status: "ACTIVE" }],
    });
  });

  it("creates no enrollment when seasonId is omitted", async () => {
    const res = await request(app)
      .post("/api/v1/students")
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Unenrolled Student", email: testEmail("unenrolled") });

    expect(res.status).toBe(201);
    const count = await db.seasonEnrollment.count({
      where: { studentUserId: res.body.data.id },
    });
    expect(count).toBe(0);
  });

  it("refuses ADMIN — creation is SUPER-only in v2 (v1's ADMIN create was unscoped, spec 06 §4.3)", async () => {
    const res = await request(app)
      .post("/api/v1/students")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ name: "Nope Student", email: testEmail("nope") });
    expect(res.status).toBe(403);
  });

  it("refuses a duplicate email with 409, not a Prisma error (R18)", async () => {
    const email = testEmail("dupe");
    await request(app)
      .post("/api/v1/students")
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "First Dupe", email });
    const clash = await request(app)
      .post("/api/v1/students")
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Second Dupe", email });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("email_taken");
  });
});

describe("PATCH /api/v1/students/:id", () => {
  it("lets the student edit their own contact fields (R22)", async () => {
    const res = await request(app)
      .patch(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${student1Token}`)
      .send({ phone: "+20 111 111 1111" });

    expect(res.status).toBe(200);
    const profile = await db.studentProfile.findUnique({
      where: { userId: student1Id },
      select: { phone: true, notes: true },
    });
    expect(profile?.phone).toBe("+20 111 111 1111");
  });

  it("refuses the subject's own write of notes with forbidden_field (R23 — loudly, not v1's silent drop, R24)", async () => {
    const res = await request(app)
      .patch(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${student1Token}`)
      .send({ notes: "self-written" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden_field");
    const profile = await db.studentProfile.findUnique({
      where: { userId: student1Id },
      select: { notes: true },
    });
    expect(profile?.notes).toBe("Internal staff note");
  });

  it("lets ADMIN write notes but NOT activeSeasonId (the allowlist)", async () => {
    const ok = await request(app)
      .patch(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ notes: "Updated by admin" });
    expect(ok.status).toBe(200);

    const refused = await request(app)
      .patch(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ activeSeasonId: seasonBId });
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe("forbidden_field");
  });

  it("lets SUPER move activeSeasonId", async () => {
    const res = await request(app)
      .patch(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ activeSeasonId: seasonBId });
    expect(res.status).toBe(200);
    const profile = await db.studentProfile.findUnique({
      where: { userId: student1Id },
      select: { activeSeasonId: true },
    });
    expect(profile?.activeSeasonId).toBe(seasonBId);
    // Restore for any later reader of the fixture.
    await db.studentProfile.update({
      where: { userId: student1Id },
      data: { activeSeasonId: seasonAId },
    });
  });

  it("refuses ADMIN for a student with no ACTIVE enrollment in their seasons (D4)", async () => {
    // droppedId's only season-A enrollment is WITHDRAWN.
    const res = await request(app)
      .patch(`/api/v1/students/${droppedId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ university: "X" });
    expect(res.status).toBe(403);
  });

  it("clears with null and leaves absent fields untouched (PATCH semantics)", async () => {
    const res = await request(app)
      .patch(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ gifts: null });
    expect(res.status).toBe(200);
    const profile = await db.studentProfile.findUnique({
      where: { userId: student1Id },
      select: { gifts: true, university: true },
    });
    expect(profile?.gifts).toBeNull();
    expect(profile?.university).toBe("Test University");
  });
});
```

Run the suite → new describes FAIL (404s).

- [ ] **Step 2: Implement both routes**

Append to `routes/students.ts`. Extend the shared relative import with
`createStudentRequestSchema, updateStudentRequestSchema`; add
`canEditStudent` to the permissions import; import `db` from
`"../db/client"`; import `{ Prisma }` as a value from
`"../generated/prisma/client"` (match the exact specifier `db/client.ts`
itself uses for the generated client and keep the `../` depth correct for
`routes/`).

```ts
/**
 * Per-role PATCH allowlists, checked against the RAW body keys before the
 * schema runs (a schema parse cannot distinguish "sent null" from "absent"
 * after the fact for refusal purposes — and refusal must name the key).
 *
 * - The subject edits their own identity and contact fields (R22) but never
 *   `notes` or `activeSeasonId` (R23). v1 silently dropped those from a
 *   self-edit (R24); an API that pretends a write worked teaches clients to
 *   trust it, so this refuses with `forbidden_field` instead.
 * - ADMIN adds `notes`. NOT `activeSeasonId`: repointing a student's season
 *   is the same unscoped power v1's create leaked to every admin (§4.3), and
 *   it follows creation to SUPER in v2.
 * - SUPER: everything (allowlist `null` = unchecked).
 */
const SELF_EDITABLE = new Set([
  "name", "email", "university", "year", "phone", "dateOfBirth", "spiritualBackground", "gifts",
]);
const ADMIN_EDITABLE = new Set([...SELF_EDITABLE, "notes"]);

studentsRouter.post("/", async (req, res) => {
  const user = requireUser(req);
  // v2 ruling (roadmap Plan 5): creation is SUPER-only. v1 admitted any ADMIN
  // with no season scoping at all — an admin could create a student pointed
  // at any season in the system (spec 06 §4.3, D4).
  if (!isSuper(user)) {
    return apiError(res, "forbidden", "Only a super user can create students.", 403);
  }

  const parsed = createStudentRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid student body.", 400);
  const body = parsed.data;

  if (body.seasonId != null) {
    const season = await db.season.findFirst({
      where: { id: body.seasonId, deletedAt: null },
      select: { id: true },
    });
    if (!season) return apiError(res, "not_found", "Season not found.", 404);
  }

  // Friendly 409 first; the P2002 catch below converts the race loser to the
  // same answer instead of a 500 (v1 raised the raw Prisma error, R18). Note
  // R19 stands: User.email is @unique at the database level, so a
  // soft-deleted student's address stays reserved — freeing it needs a
  // migration (C1, cutover list).
  const clash = await db.user.findUnique({ where: { email: body.email }, select: { id: true } });
  if (clash) return apiError(res, "email_taken", "A user with that email already exists.", 409);

  try {
    const created = await db.$transaction(async (tx) => {
      const student = await tx.user.create({
        data: {
          email: body.email,
          name: body.name,
          role: "STUDENT", // forced, never an input (R14)
          // D7: no password. Credentials come from Plan 7's invites; v1's
          // hard-coded ChangeMe123! and its plaintext log line (R16/R17) are
          // deliberately not ported. Never log a credential.
          passwordHash: null,
          studentProfile: {
            create: {
              // D1: pointer and enrollment agree by construction.
              activeSeasonId: body.seasonId ?? null,
              university: body.university ?? null,
              year: body.year ?? null,
              phone: body.phone ?? null,
              dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
              spiritualBackground: body.spiritualBackground ?? null,
              gifts: body.gifts ?? null,
              notes: body.notes ?? null,
            },
          },
        },
        select: { id: true, email: true },
      });
      if (body.seasonId != null) {
        // The enrollment v1's form never created (R15) — the fix
        // commitStudentImport already models (student-import.ts:253-273).
        await tx.seasonEnrollment.create({
          data: { studentUserId: student.id, seasonId: body.seasonId, status: "ACTIVE" },
        });
      }
      return student;
    });
    return apiOk(res, created, 201);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return apiError(res, "email_taken", "A user with that email already exists.", 409);
    }
    throw err;
  }
});

studentsRouter.patch("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid student id.", 400);
  if (typeof req.body !== "object" || req.body === null || Array.isArray(req.body)) {
    return apiError(res, "bad_request", "Invalid student body.", 400);
  }

  const student = await db.user.findFirst({
    where: { id, role: "STUDENT", deletedAt: null },
    select: { id: true },
  });
  if (!student) return apiError(res, "not_found", "Student not found.", 404);

  if (!(await canEditStudent(user, id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const allowed = isSuper(user) ? null : user.userId === id ? SELF_EDITABLE : ADMIN_EDITABLE;
  if (allowed) {
    for (const key of Object.keys(req.body as Record<string, unknown>)) {
      if (!allowed.has(key)) {
        return apiError(res, "forbidden_field", `Field "${key}" is not editable by your role.`, 403);
      }
    }
  }

  const parsed = updateStudentRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid student body.", 400);
  const body = parsed.data;

  if (body.email !== undefined) {
    const clash = await db.user.findUnique({ where: { email: body.email }, select: { id: true } });
    if (clash && clash.id !== id) {
      return apiError(res, "email_taken", "A user with that email already exists.", 409);
    }
  }

  // Prisma treats `undefined` as "leave the column alone", which is exactly
  // this endpoint's PATCH contract — absent keys pass through untouched,
  // explicit nulls clear.
  const profileData = {
    university: body.university,
    year: body.year,
    phone: body.phone,
    dateOfBirth:
      body.dateOfBirth === undefined
        ? undefined
        : body.dateOfBirth
          ? new Date(body.dateOfBirth)
          : null,
    spiritualBackground: body.spiritualBackground,
    gifts: body.gifts,
    notes: body.notes,
    activeSeasonId: body.activeSeasonId,
  };

  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { name: body.name, email: body.email },
      });
      // Upsert, not update: every creation path makes a profile row today,
      // but v1's unconditional update throws for a STUDENT without one
      // (spec 06 §2's flagged hazard) — the upsert closes that hole without
      // a schema change.
      await tx.studentProfile.upsert({
        where: { userId: id },
        update: profileData,
        create: {
          userId: id,
          university: body.university ?? null,
          year: body.year ?? null,
          phone: body.phone ?? null,
          dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
          spiritualBackground: body.spiritualBackground ?? null,
          gifts: body.gifts ?? null,
          notes: body.notes ?? null,
          activeSeasonId: body.activeSeasonId ?? null,
        },
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return apiError(res, "email_taken", "A user with that email already exists.", 409);
    }
    throw err;
  }

  return apiOk(res, { id });
});
```

- [ ] **Step 3: Run the suite and the workspace checks**

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern students` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/backend` → clean.

- [ ] **Step 4: OpenAPI** — add both paths in the same commit. Document:
SUPER-only creation and WHY there is no password field (D7 — invites are the
only credential path, Plan 7); the optional `seasonId` transaction semantics
(D1); the per-role PATCH allowlists and `forbidden_field`; `email_taken`.

- [ ] **Step 5: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): student create (no credentials, D7) and role-allowlisted update"
```

---

### Task 5: Enrollment writes — create + status transitions

**Files:**
- Modify: `apps/backend/src/routes/students.ts`
- Modify: `apps/backend/src/docs/openapi.ts` (same commit)
- Test: extend `apps/backend/src/__tests__/integration/students-routes.test.ts`

**Interfaces:**
- Consumes: `createEnrollmentRequestSchema`, `updateEnrollmentRequestSchema` (Task 1), `isAdminOfSeason` from `"../lib/rbac"` (add to the rbac import), fixtures.
- Produces: `POST /api/v1/students/:id/enrollments` → `{ data: { id, seasonId, status } }` 201; `PATCH /api/v1/students/:id/enrollments/:seasonId` → `{ data: { id, status } }`; error codes `already_enrolled` (409), `not_active` (409).

**Boundary (state it in code comments and OpenAPI):** these endpoints own
enrollment **existence and status** only. `groupId` is written exclusively by
the groups endpoints (`PATCH /api/v1/groups/:id` → `setGroupStudents`, which
already upserts and never touches status — the v2-side fix for spec 06 D2).
Nothing here ever deletes an enrollment row; `SeasonEnrollment` is the
append-only history its own schema comment claims to be.

- [ ] **Step 1: Append the failing tests**

These tests create their own local students inside each `it` rather than
mutating the suite's shared fixtures — a dropped shared fixture would change
what the earlier list/detail describes see on a partial re-run.

```ts
describe("POST /api/v1/students/:id/enrollments", () => {
  it("creates an ACTIVE enrollment and points an unset activeSeasonId at it (R47, D1)", async () => {
    const s = await createTestUser("enrollee", "STUDENT");
    await db.studentProfile.create({ data: { userId: s.id } });

    const res = await request(app)
      .post(`/api/v1/students/${s.id}/enrollments`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ seasonId: seasonAId });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ seasonId: seasonAId, status: "ACTIVE" });
    const profile = await db.studentProfile.findUnique({
      where: { userId: s.id },
      select: { activeSeasonId: true },
    });
    expect(profile?.activeSeasonId).toBe(seasonAId);
  });

  it("never overwrites an activeSeasonId that is already set", async () => {
    const s = await createTestUser("enrollee-b", "STUDENT");
    await db.studentProfile.create({ data: { userId: s.id, activeSeasonId: seasonBId } });

    const res = await request(app)
      .post(`/api/v1/students/${s.id}/enrollments`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ seasonId: seasonAId });

    expect(res.status).toBe(201);
    const profile = await db.studentProfile.findUnique({
      where: { userId: s.id },
      select: { activeSeasonId: true },
    });
    expect(profile?.activeSeasonId).toBe(seasonBId);
  });

  it("refuses an enrollment into a season the caller does not administer (R64's shape)", async () => {
    const res = await request(app)
      .post(`/api/v1/students/${student2Id}/enrollments`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ seasonId: seasonBId });
    expect(res.status).toBe(403);
  });

  it("refuses a LEADER", async () => {
    const res = await request(app)
      .post(`/api/v1/students/${student2Id}/enrollments`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ seasonId: seasonAId });
    expect(res.status).toBe(403);
  });

  it("refuses a duplicate — one enrollment per student per season, ever (R2)", async () => {
    const res = await request(app)
      .post(`/api/v1/students/${student1Id}/enrollments`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ seasonId: seasonAId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("already_enrolled");
  });
});

describe("PATCH /api/v1/students/:id/enrollments/:seasonId", () => {
  async function makeActiveEnrollee(label: string): Promise<number> {
    const s = await createTestUser(label, "STUDENT");
    await db.studentProfile.create({ data: { userId: s.id } });
    await db.seasonEnrollment.create({
      data: { studentUserId: s.id, seasonId: seasonAId, status: "ACTIVE" },
    });
    return s.id;
  }

  it("drops an ACTIVE enrollment with a reason — and the row SURVIVES (never deleted)", async () => {
    const sid = await makeActiveEnrollee("to-drop");
    const res = await request(app)
      .patch(`/api/v1/students/${sid}/enrollments/${seasonAId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ status: "WITHDRAWN", dropReason: "Left the program" });

    expect(res.status).toBe(200);
    const rows = await db.seasonEnrollment.findMany({
      where: { studentUserId: sid, seasonId: seasonAId },
      select: { status: true, droppedAt: true, dropReason: true },
    });
    expect(rows).toHaveLength(1); // transitioned in place, not delete+recreate
    expect(rows[0]).toMatchObject({ status: "WITHDRAWN", dropReason: "Left the program" });
    expect(rows[0]?.droppedAt).not.toBeNull();
  });

  it("completes an ACTIVE enrollment with completedAt (R48's write, made per-enrollment)", async () => {
    const sid = await makeActiveEnrollee("to-complete");
    const res = await request(app)
      .patch(`/api/v1/students/${sid}/enrollments/${seasonAId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ status: "COMPLETED" });

    expect(res.status).toBe(200);
    const row = await db.seasonEnrollment.findFirst({
      where: { studentUserId: sid, seasonId: seasonAId },
      select: { status: true, completedAt: true, dropReason: true },
    });
    expect(row).toMatchObject({ status: "COMPLETED", dropReason: null });
    expect(row?.completedAt).not.toBeNull();
  });

  it("refuses a second transition out of a terminal state — no un-drop (R49/R50)", async () => {
    const sid = await makeActiveEnrollee("terminal");
    await request(app)
      .patch(`/api/v1/students/${sid}/enrollments/${seasonAId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ status: "WITHDRAWN" });

    const res = await request(app)
      .patch(`/api/v1/students/${sid}/enrollments/${seasonAId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ status: "COMPLETED" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("not_active");
  });

  it("gates on the season BEFORE the row lookup — no existence leak (fixes R65)", async () => {
    // adminToken does not administer season B; the answer must be 403 even
    // though no such enrollment exists, proving the gate runs first.
    const res = await request(app)
      .patch(`/api/v1/students/${student1Id}/enrollments/${seasonBId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ status: "WITHDRAWN" });
    expect(res.status).toBe(403);
  });

  it("refuses ACTIVE in the body — re-activation does not exist (R50)", async () => {
    const res = await request(app)
      .patch(`/api/v1/students/${student1Id}/enrollments/${seasonAId}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ status: "ACTIVE" });
    expect(res.status).toBe(400);
  });
});
```

Run the suite → new describes FAIL (404s).

- [ ] **Step 2: Implement both routes**

Append to `routes/students.ts` (add `isAdminOfSeason` to the rbac import and
the two enrollment schemas to the shared relative import):

```ts
/**
 * Explicit enrollment — the endpoint v1 never had (spec 06 §7): its only
 * creation paths were "be added to a group" (which destroyed history, D2)
 * and CSV import. Group membership is NOT set here: groupId belongs to the
 * groups endpoints (PATCH /groups/:id → setGroupStudents), one writer per
 * fact, per-season membership through the enrollment (C9).
 */
studentsRouter.post("/:id/enrollments", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid student id.", 400);

  const parsed = createEnrollmentRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid enrollment body.", 400);
  const { seasonId } = parsed.data;

  // Season-admin power over the TARGET season; SUPER passes inside the
  // predicate. Gate before any lookup — a refused caller learns nothing.
  if (!isAdminOfSeason(user, seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const season = await db.season.findFirst({
    where: { id: seasonId, deletedAt: null },
    select: { id: true },
  });
  if (!season) return apiError(res, "not_found", "Season not found.", 404);

  const student = await db.user.findFirst({
    where: { id, role: "STUDENT", deletedAt: null },
    select: { id: true, studentProfile: { select: { activeSeasonId: true } } },
  });
  if (!student) return apiError(res, "not_found", "Student not found.", 404);

  const existing = await db.seasonEnrollment.findUnique({
    where: { studentUserId_seasonId: { studentUserId: id, seasonId } },
    select: { id: true },
  });
  if (existing) {
    // R2: one enrollment per student per season, EVER. A WITHDRAWN row is
    // history, not an obstacle to clear — re-admission is a transition v1
    // never had (R50) and is not invented here.
    return apiError(res, "already_enrolled", "This student already has an enrollment in that season.", 409);
  }

  try {
    const enrollment = await db.$transaction(async (tx) => {
      const row = await tx.seasonEnrollment.create({
        // Entry is always ACTIVE (R47).
        data: { studentUserId: id, seasonId, status: "ACTIVE" },
        select: { id: true, seasonId: true, status: true },
      });
      // D1's reconciliation, applied conservatively: point an UNSET pointer
      // at the new enrollment so the student is assignable on the roster
      // (R11) — but never steal a pointer another season already holds.
      if (student.studentProfile && student.studentProfile.activeSeasonId === null) {
        await tx.studentProfile.update({
          where: { userId: id },
          data: { activeSeasonId: seasonId },
        });
      }
      return row;
    });
    return apiOk(res, enrollment, 201);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return apiError(res, "already_enrolled", "This student already has an enrollment in that season.", 409);
    }
    throw err;
  }
});

/**
 * The enrollment state machine's only two transitions, both out of ACTIVE
 * (R48–R50): → WITHDRAWN (drop, with optional reason) and → COMPLETED.
 * Addressed by (student, season) — the natural unique key — rather than a
 * bare enrollment id: the bare-id shape is exactly what let v1's document
 * delete lose its row-scoped gate unnoticed (D5's lesson, applied here).
 * The row is transitioned in place, never deleted, never resurrected.
 */
studentsRouter.patch("/:id/enrollments/:seasonId", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  const seasonId = parseId(req.params.seasonId);
  if (id === null || seasonId === null) {
    return apiError(res, "bad_request", "Invalid student or season id.", 400);
  }

  const parsed = updateEnrollmentRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid enrollment body.", 400);

  // R64's gate, moved BEFORE the lookup: v1 fetched the enrollment first and
  // gated second, so a refused caller still learned whether an arbitrary id
  // existed (R65).
  if (!isAdminOfSeason(user, seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const enrollment = await db.seasonEnrollment.findUnique({
    where: { studentUserId_seasonId: { studentUserId: id, seasonId } },
    select: { id: true, status: true },
  });
  if (!enrollment) return apiError(res, "not_found", "Enrollment not found.", 404);
  if (enrollment.status !== "ACTIVE") {
    // R49 (drop refuses non-ACTIVE) generalised to both transitions; there
    // is no path out of a terminal state (R50).
    return apiError(res, "not_active", "Only an active enrollment can be completed or dropped.", 409);
  }

  const updated = await db.seasonEnrollment.update({
    where: { id: enrollment.id },
    data:
      parsed.data.status === "WITHDRAWN"
        ? { status: "WITHDRAWN", droppedAt: new Date(), dropReason: parsed.data.dropReason ?? null }
        : { status: "COMPLETED", completedAt: new Date() },
    select: { id: true, status: true },
  });
  return apiOk(res, updated);
});
```

Route-order note: both paths have three segments; neither conflicts with
`"/:id"` (two segments). No re-ordering of earlier routes.

- [ ] **Step 3: Run the suite and the workspace checks**

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern students` → PASS (all five describes).
Run: `pnpm turbo lint typecheck test:unit --filter=@space/backend` → clean.

- [ ] **Step 4: OpenAPI** — add both enrollment paths in the same commit.
Document `already_enrolled` and `not_active`; the (student, season)
addressing; the never-deletes guarantee; and the boundary sentence: "group
membership is written only by `PATCH /api/v1/groups/:id`".

- [ ] **Step 5: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): explicit enrollment create and append-only status transitions (C9)"
```

---

### Task 6: Mobile — students, alumni and dropped lists

**Files:**
- Create: `apps/mobile/src/hooks/use-students.ts` (list hook; Task 7 appends the detail hook)
- Create: `apps/mobile/src/components/StudentList.tsx`
- Modify: `apps/mobile/src/lib/query-keys.ts` (add the `students` factory)
- Modify: `apps/mobile/app/(app)/students/index.tsx`, `students/alumni.tsx`, `students/dropped.tsx` (replace the placeholders)
- Modify: `apps/mobile/src/__tests__/placeholder-screens.test.tsx` (read it first; remove the three students entries — it asserts every placeholder renders "This screen isn't built yet.", which stops being true here)
- Test: `apps/mobile/src/__tests__/students-list.test.tsx`

**Interfaces:**
- Consumes: `studentListResponseSchema`, types `StudentListItem`/`StudentListStatus`/`UserRole` from `@space/shared`; `apiClient`, `useSessionStore`, `renderWithProviders`, `formatDate`, the `ui` primitives.
- Produces: `queryKeys.students.all/lists()/list(status, q)/details()/detail(id)` (Task 7 consumes `detail`); `useStudentList(status: StudentListStatus, q: string, enabled: boolean)` (an `useInfiniteQuery` result whose pages are `StudentListResponse`); `<StudentList status allowedRoles title />` from `src/components/StudentList.tsx`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/__tests__/students-list.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

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

import StudentsScreen from "../../app/(app)/students/index";
import AlumniScreen from "../../app/(app)/students/alumni";
import DroppedScreen from "../../app/(app)/students/dropped";

const get = apiClient.get as jest.Mock;

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
const mentorSession = {
  user: { id: 2, name: "Test mentor", email: "men@jpc.test", role: "MENTOR" as const },
  scopes: emptyScopes,
};
const studentSession = {
  user: { id: 9, name: "Test student", email: "stu@jpc.test", role: "STUDENT" as const },
  scopes: { ...emptyScopes, activeSeasonId: 7 },
};

const activeRow = {
  id: 21,
  name: "Sara Student",
  email: "sara@jpc.test",
  avatarPath: null,
  university: "Cairo University",
  year: "3rd",
  graduationYear: null,
  activeSeasonTitle: "Spring 2099",
  currentGroupName: "Group A",
  droppedEnrollment: null,
};

const page = (students: unknown[], nextCursor: number | null = null, total = students.length) => ({
  data: { data: { students, nextCursor, total } },
});

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("StudentsScreen (active)", () => {
  it("lists students with the season/group line and the real total", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue(page([activeRow]));

    renderWithProviders(<StudentsScreen />);

    expect(await screen.findByText("Sara Student")).toBeTruthy();
    expect(screen.getByText(/Spring 2099/)).toBeTruthy();
    expect(screen.getByText("1 total")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/students?status=active");
  });

  it("navigates to the detail route on press", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue(page([activeRow]));

    renderWithProviders(<StudentsScreen />);
    fireEvent.press(await screen.findByText("Sara Student"));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/student/[id]",
      params: { id: "21" },
    });
  });

  it("shows the role gate for a STUDENT without calling the API", async () => {
    useSessionStore.setState(studentSession);

    renderWithProviders(<StudentsScreen />);

    expect(await screen.findByText(/isn't available for your role/)).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("submits a search and refetches with q", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue(page([activeRow]));

    renderWithProviders(<StudentsScreen />);
    await screen.findByText("Sara Student");

    const input = screen.getByLabelText("Search students");
    fireEvent.changeText(input, "sara");
    fireEvent(input, "submitEditing");

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("/api/v1/students?status=active&q=sara"),
    );
  });

  it("loads the next page through the cursor", async () => {
    useSessionStore.setState(superSession);
    get.mockImplementation((url: string) =>
      url.includes("cursor=21")
        ? Promise.resolve(page([{ ...activeRow, id: 22, name: "Second Student" }], null, 2))
        : Promise.resolve(page([activeRow], 21, 2)),
    );

    renderWithProviders(<StudentsScreen />);
    await screen.findByText("Sara Student");
    fireEvent.press(screen.getByText("Load more"));

    expect(await screen.findByText("Second Student")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/students?status=active&cursor=21");
  });
});

describe("AlumniScreen", () => {
  it("queries status=alumni and shows the class year", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue(
      page([{ ...activeRow, graduationYear: 2024, activeSeasonTitle: null, currentGroupName: null }]),
    );

    renderWithProviders(<AlumniScreen />);

    expect(await screen.findByText(/Class of 2024/)).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/students?status=alumni");
  });
});

describe("DroppedScreen", () => {
  it("renders one row per dropped enrollment (R43), with the reason", async () => {
    const d1 = {
      ...activeRow,
      id: 30,
      name: "Dina Dropped",
      activeSeasonTitle: null,
      currentGroupName: null,
      droppedEnrollment: {
        enrollmentId: 900,
        seasonId: 7,
        seasonTitle: "Spring 2099",
        droppedAt: "2099-06-01T00:00:00.000Z",
        dropReason: "Moved away",
      },
    };
    const d2 = {
      ...d1,
      droppedEnrollment: {
        ...d1.droppedEnrollment,
        enrollmentId: 901,
        seasonId: 8,
        seasonTitle: "Fall 2099",
        dropReason: null,
      },
    };
    useSessionStore.setState(superSession);
    get.mockResolvedValue(page([d1, d2]));

    renderWithProviders(<DroppedScreen />);

    // The same student twice — enrollment-keyed, never collapsed by user id.
    expect(await screen.findAllByText("Dina Dropped")).toHaveLength(2);
    expect(screen.getByText(/Moved away/)).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/students?status=dropped");
  });

  it("hides the list from MENTOR — the endpoint refuses them, so the screen never asks", async () => {
    useSessionStore.setState(mentorSession);

    renderWithProviders(<DroppedScreen />);

    expect(await screen.findByText(/isn't available for your role/)).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/mobile && pnpm jest src/__tests__/students-list.test.tsx`
Expected: FAIL — all three screens are still placeholders ("This screen isn't built yet.").

- [ ] **Step 3: Add the query-key factory**

In `apps/mobile/src/lib/query-keys.ts`, add a sibling to `sessions` inside the
same `queryKeys` object (same spreading pattern — the file's header comment
explains why):

```ts
  students: {
    all: ["students"] as const,
    lists: () => [...queryKeys.students.all, "list"] as const,
    list: (status: string, q: string) => [...queryKeys.students.lists(), { status, q }] as const,
    details: () => [...queryKeys.students.all, "detail"] as const,
    detail: (id: number) => [...queryKeys.students.details(), id] as const,
  },
```

- [ ] **Step 4: Write the list hook**

```ts
// apps/mobile/src/hooks/use-students.ts
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  studentListResponseSchema,
  type StudentListResponse,
  type StudentListStatus,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

async function fetchStudentsPage(
  status: StudentListStatus,
  q: string,
  cursor: number | null,
): Promise<StudentListResponse> {
  const params = new URLSearchParams({ status });
  if (q) params.set("q", q);
  if (cursor !== null) params.set("cursor", String(cursor));
  const res = await apiClient.get(`/api/v1/students?${params.toString()}`);
  return studentListResponseSchema.parse(res.data.data);
}

/**
 * Cursor-paginated student list. `enabled` is the role gate: the endpoint
 * 403s roles outside each surface, and the screen knows its allowed roles up
 * front — asking anyway would render an error state where a calm "not for
 * your role" empty state belongs.
 */
export function useStudentList(status: StudentListStatus, q: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: queryKeys.students.list(status, q),
    queryFn: ({ pageParam }) => fetchStudentsPage(status, q, pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  });
}
```

- [ ] **Step 5: Write the shared component and the three screens**

```tsx
// apps/mobile/src/components/StudentList.tsx
import { useState } from "react";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import type { StudentListItem, StudentListStatus, UserRole } from "@space/shared";

import { useStudentList } from "../hooks/use-students";
import { formatDate } from "../lib/format";
import { useSessionStore } from "../store/session";
import { useTheme } from "../theme";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text } from "../ui";

function subtitleFor(status: StudentListStatus, item: StudentListItem): string {
  if (status === "alumni") {
    return [`Class of ${item.graduationYear ?? "—"}`, item.university]
      .filter(Boolean)
      .join(" · ");
  }
  if (status === "dropped") {
    const d = item.droppedEnrollment;
    if (!d) return item.email;
    return [d.seasonTitle, d.droppedAt ? formatDate(d.droppedAt) : null]
      .filter(Boolean)
      .join(" · ");
  }
  return (
    [item.university, item.activeSeasonTitle, item.currentGroupName].filter(Boolean).join(" · ") ||
    item.email
  );
}

function StudentRow({ status, item }: { status: StudentListStatus; item: StudentListItem }) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/student/[id]", params: { id: String(item.id) } })}
    >
      <Card style={{ marginBottom: theme.spacing.sm }}>
        <Text variant="heading">{item.name}</Text>
        <Text variant="label" color={theme.colors.neutral[600]}>
          {subtitleFor(status, item)}
        </Text>
        {status === "dropped" && item.droppedEnrollment?.dropReason ? (
          <Text variant="caption" color={theme.colors.neutral[600]}>
            {item.droppedEnrollment.dropReason}
          </Text>
        ) : null}
      </Card>
    </Pressable>
  );
}

export interface StudentListProps {
  status: StudentListStatus;
  /** Mirrors the endpoint's per-surface role gate — the screen never asks for a 403. */
  allowedRoles: readonly UserRole[];
  title: string;
}

export function StudentList({ status, allowedRoles, title }: StudentListProps) {
  const theme = useTheme();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const allowed = role !== null && allowedRoles.includes(role);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const {
    data,
    isPending,
    isError,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useStudentList(status, q, allowed);

  if (!allowed) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title={title} message="This list isn't available for your role." />
      </Screen>
    );
  }

  const students = data?.pages.flatMap((p) => p.students) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  return (
    <Screen
      edges={["top", "left", "right"]}
      onRefresh={() => void refetch()}
      refreshing={isRefetching}
    >
      <Input
        label="Search students"
        value={search}
        onChangeText={setSearch}
        returnKeyType="search"
        onSubmitEditing={() => setQ(search.trim())}
      />
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState
          message="Couldn't load students. Check your connection and try again."
          onRetry={() => void refetch()}
        />
      ) : students.length === 0 ? (
        <EmptyState
          title={title}
          message={q ? "No students match your search." : "Nothing here yet."}
        />
      ) : (
        <>
          <Text variant="caption" color={theme.colors.neutral[600]}>
            {/* The real population under the current filters (D14) — v1
                printed the fetched row count as if it were the total. */}
            {`${total} total`}
          </Text>
          {students.map((item) => (
            <StudentRow
              // Dropped rows are enrollment-keyed (R43): one student can
              // appear once per dropped season, so the user id collides.
              key={item.droppedEnrollment?.enrollmentId ?? item.id}
              status={status}
              item={item}
            />
          ))}
          {hasNextPage ? (
            <Button
              title="Load more"
              variant="secondary"
              onPress={() => void fetchNextPage()}
              loading={isFetchingNextPage}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}
```

Replace the three placeholder screens:

```tsx
// apps/mobile/app/(app)/students/index.tsx
import { StudentList } from "../../../src/components/StudentList";

export default function StudentsScreen() {
  // LEADER is included: their nav has no /students tab, but the endpoint
  // narrows them to their groups' members, and the route stays reachable by
  // navigation (spec 06 §9's leader-roster decision, answered "yes, scoped").
  return (
    <StudentList
      status="active"
      allowedRoles={["SUPER", "ADMIN", "MENTOR", "LEADER"]}
      title="Students"
    />
  );
}
```

```tsx
// apps/mobile/app/(app)/students/alumni.tsx
import { StudentList } from "../../../src/components/StudentList";

export default function AlumniScreen() {
  return <StudentList status="alumni" allowedRoles={["SUPER", "ADMIN", "MENTOR"]} title="Alumni" />;
}
```

```tsx
// apps/mobile/app/(app)/students/dropped.tsx
import { StudentList } from "../../../src/components/StudentList";

export default function DroppedScreen() {
  // No MENTOR: the endpoint refuses read-all access to drop reasons
  // (spec 06 §4.3), and the screen mirrors its gate.
  return <StudentList status="dropped" allowedRoles={["SUPER", "ADMIN"]} title="Dropped students" />;
}
```

- [ ] **Step 6: Update `placeholder-screens.test.tsx`**

Read it, remove the `students/index`, `students/alumni` and `students/dropped`
entries from its screen list (they no longer render the placeholder copy).
Keep every other entry.

- [ ] **Step 7: Run the tests**

Run: `cd apps/mobile && pnpm jest src/__tests__/students-list.test.tsx src/__tests__/placeholder-screens.test.tsx` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` — the
typecheck of `router.push({ pathname: "/student/[id]" … })` **fails until
Task 7's route file exists**. If running Task 6 before Task 7, expect exactly
that one error and re-run after Task 7 lands; the jest suites pass because the
router is mocked.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): students, alumni and dropped lists over one paginated component"
```

---

### Task 7: Mobile — `student/[id]` detail route

**Files:**
- Create: `apps/mobile/app/(app)/student/[id].tsx`
- Modify: `apps/mobile/app/(app)/_layout.tsx` (append to `DETAIL_ROUTE_NAMES`)
- Modify: `apps/mobile/src/hooks/use-students.ts` (append the detail hook)
- Modify (read first): `apps/mobile/src/__tests__/app-layout.test.tsx`, `apps/mobile/src/__tests__/role-tabs.test.tsx` — see Steps 1 and 5.
- Test: `apps/mobile/src/__tests__/student-detail.test.tsx`

**Interfaces:**
- Consumes: `queryKeys.students.detail(id)` (Task 6); `studentDetailPublicSchema`/`studentDetailPrivateSchema`/`studentDetailInternalSchema` + types, `EnrollmentHistoryItem`, `UserRole` from `@space/shared`; `DETAIL_ROUTE_NAMES` in `_layout.tsx` (created by Plan 1 Task 2).
- Produces: `useStudentDetail(id: number | null, role: UserRole | null): UseQueryResult<StudentDetail>` and `type StudentDetail = StudentDetailPublic | StudentDetailPrivate | StudentDetailInternal`; the route `/student/[id]` in the typed route tree (unblocks Task 6's `router.push` typecheck).

**If Plan 1 has not landed yet** (no `DETAIL_ROUTE_NAMES` in `_layout.tsx`):
create the mechanism exactly as Plan 1 Task 2 specifies — an exported
`export const DETAIL_ROUTE_NAMES = ["student/[id]"] as const;` below
`ALL_ROUTE_NAMES` with the doc comment explaining that `Tabs` auto-registers
every file and undeclared screens appear in the tab bar, and
`...DETAIL_ROUTE_NAMES` appended to `orderedRouteNames` (detail routes are
never in `tabByRouteName`, so each renders with the existing `{ href: null }`
fallback). If it exists, append `"student/[id]"` to the array.

- [ ] **Step 1: Extend the layout test**

Add to `apps/mobile/src/__tests__/app-layout.test.tsx`, following the file's
existing assertion style for hidden screens (Plan 1's case for
`assignment/[id]` is the template if it landed; otherwise extend whatever
`href: null` assertion the file already makes):

```tsx
it("declares student/[id] hidden from the tab bar", () => {
  useSessionStore.setState(studentSession); // the file's existing fixture
  const screens = renderLayoutAndCollectScreens(); // the file's existing helper pattern
  const detail = screens.find((s) => s.name === "student/[id]");
  expect(detail).toBeTruthy();
  expect(detail?.options?.href).toBeNull();
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/app-layout.test.tsx` → FAIL (no such screen).

- [ ] **Step 2: Write the failing detail-screen test**

```tsx
// apps/mobile/src/__tests__/student-detail.test.tsx
import { screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn() },
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
const mentorSession = {
  user: { id: 2, name: "Test mentor", email: "men@jpc.test", role: "MENTOR" as const },
  scopes: emptyScopes,
};

const enrollment = {
  enrollmentId: 500,
  seasonId: 7,
  seasonCode: "S99",
  seasonTitle: "Spring 2099",
  seasonStatus: "ACTIVE" as const,
  startDate: "2099-01-01T00:00:00.000Z",
  endDate: "2099-12-31T00:00:00.000Z",
  groupName: "Group A",
  status: "WITHDRAWN" as const,
  enrolledAt: "2099-01-01T00:00:00.000Z",
  completedAt: null,
  droppedAt: "2099-06-01T00:00:00.000Z",
  dropReason: "Moved away",
};

const base = {
  id: 21,
  name: "Sara Student",
  email: "sara@jpc.test",
  avatarPath: null,
  graduationYear: null,
  currentGroup: { id: 3, name: "Group A" },
  enrollments: [enrollment],
};

const publicProfile = {
  university: "Cairo University",
  year: "3rd",
  gifts: null,
  activeSeasonId: 7,
  activeSeasonTitle: "Spring 2099",
  activeSeasonCode: "S99",
};
const internalProfile = {
  ...publicProfile,
  phone: "+20 100 000 0000",
  dateOfBirth: null,
  spiritualBackground: null,
  notes: "Watch attendance",
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("StudentDetailScreen", () => {
  it("renders identity, internal notes and phone for SUPER", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue({ data: { data: { ...base, profile: internalProfile } } });

    renderWithProviders(<StudentDetailScreen />);

    expect(await screen.findByText("Sara Student")).toBeTruthy();
    expect(screen.getByText(/\+20 100 000 0000/)).toBeTruthy();
    expect(screen.getByText("Watch attendance")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/students/21");
  });

  it("renders enrollment history with the status label and drop reason", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue({ data: { data: { ...base, profile: internalProfile } } });

    renderWithProviders(<StudentDetailScreen />);

    expect(await screen.findByText("Spring 2099")).toBeTruthy();
    expect(screen.getByText(/Dropped/)).toBeTruthy();
    expect(screen.getByText("Moved away")).toBeTruthy();
  });

  it("shows no notes or phone to MENTOR — the public arm has no such fields", async () => {
    useSessionStore.setState(mentorSession);
    // The mentor arm's payload: dropReason nulled, profile is the public cut.
    get.mockResolvedValue({
      data: {
        data: {
          ...base,
          enrollments: [{ ...enrollment, dropReason: null }],
          profile: publicProfile,
        },
      },
    });

    renderWithProviders(<StudentDetailScreen />);

    expect(await screen.findByText("Sara Student")).toBeTruthy();
    expect(screen.queryByText("Watch attendance")).toBeNull();
    expect(screen.queryByText(/\+20 100 000 0000/)).toBeNull();
  });

  it("fails loudly when the server leaks a withheld field to a narrow role", async () => {
    useSessionStore.setState(mentorSession);
    // A server bug serving the INTERNAL payload to a mentor: the public arm
    // is .strict(), so the parse throws and the screen shows its error state
    // instead of quietly rendering someone's personal data.
    get.mockResolvedValue({ data: { data: { ...base, profile: internalProfile } } });

    renderWithProviders(<StudentDetailScreen />);

    expect(await screen.findByText(/Couldn't load this student/)).toBeTruthy();
  });
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/student-detail.test.tsx` → FAIL (module not found).

- [ ] **Step 3: Add the detail hook**

Append to `apps/mobile/src/hooks/use-students.ts` (merge the `@space/shared`
import lines into one statement, per lint; add `useQuery`, `type
UseQueryResult` to the react-query import):

```ts
import {
  studentDetailInternalSchema,
  studentDetailPrivateSchema,
  studentDetailPublicSchema,
  type StudentDetailInternal,
  type StudentDetailPrivate,
  type StudentDetailPublic,
  type UserRole,
} from "@space/shared";

export type StudentDetail = StudentDetailPublic | StudentDetailPrivate | StudentDetailInternal;

/**
 * The endpoint returns a different shape per role (spec 06 §4.2). Parsing the
 * caller's OWN arm — whose profile is `.strict()` — means a server that leaks
 * a withheld field fails the parse at the client boundary instead of quietly
 * delivering personal data (D3). A union parse would accept the widest shape
 * and hide exactly that bug.
 */
function detailSchemaFor(role: UserRole) {
  if (role === "SUPER" || role === "ADMIN") return studentDetailInternalSchema;
  if (role === "STUDENT") return studentDetailPrivateSchema; // self view — never `notes`
  return studentDetailPublicSchema; // LEADER, MENTOR
}

/** `id`/`role` are null while the route param or session is unresolved. */
export function useStudentDetail(
  id: number | null,
  role: UserRole | null,
): UseQueryResult<StudentDetail> {
  return useQuery({
    queryKey: queryKeys.students.detail(id ?? -1),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/students/${id}`);
      return detailSchemaFor(role as UserRole).parse(res.data.data);
    },
    enabled: id !== null && role !== null,
  });
}
```

- [ ] **Step 4: Create the route file and register it**

`apps/mobile/app/(app)/student/[id].tsx` (note the extra `../` — one level
deeper than the tab screens):

```tsx
import { useLocalSearchParams } from "expo-router";
import type { EnrollmentHistoryItem } from "@space/shared";

import { useStudentDetail, type StudentDetail } from "../../../src/hooks/use-students";
import { formatDate } from "../../../src/lib/format";
import { useSessionStore } from "../../../src/store/session";
import { useTheme } from "../../../src/theme";
import { Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../../src/ui";

function enrollmentStatusLabel(status: EnrollmentHistoryItem["status"]): string {
  if (status === "COMPLETED") return "Completed";
  if (status === "WITHDRAWN") return "Dropped";
  return "Active";
}

function ProfileCard({ detail }: { detail: StudentDetail }) {
  const theme = useTheme();
  const p = detail.profile;
  const rows: [string, string][] = [];
  if (p.university) rows.push(["University", p.university]);
  if (p.year) rows.push(["Year", p.year]);
  if (p.gifts) rows.push(["Gifts", p.gifts]);
  // Present only on the private/internal arms — the server narrows by role
  // (spec 06 §4.2) and the client renders what its arm carries, deriving
  // and requesting nothing extra.
  if ("phone" in p && p.phone) rows.push(["Phone", p.phone]);
  if ("dateOfBirth" in p && p.dateOfBirth) rows.push(["Date of birth", formatDate(p.dateOfBirth)]);
  if ("spiritualBackground" in p && p.spiritualBackground) {
    rows.push(["Spiritual background", p.spiritualBackground]);
  }
  if (rows.length === 0) return null;

  return (
    <Card style={{ marginTop: theme.spacing.md }}>
      <Text variant="heading">Profile</Text>
      {rows.map(([label, value]) => (
        <Text key={label} variant="body">
          <Text variant="label" color={theme.colors.neutral[600]}>{`${label}: `}</Text>
          {value}
        </Text>
      ))}
    </Card>
  );
}

function EnrollmentRow({ item }: { item: EnrollmentHistoryItem }) {
  const theme = useTheme();
  return (
    <Card style={{ marginTop: theme.spacing.sm }}>
      <Text variant="body">{item.seasonTitle}</Text>
      <Text variant="label" color={theme.colors.neutral[600]}>
        {[enrollmentStatusLabel(item.status), item.groupName].filter(Boolean).join(" · ")}
      </Text>
      {item.dropReason ? (
        <Text variant="caption" color={theme.colors.neutral[600]}>
          {item.dropReason}
        </Text>
      ) : null}
    </Card>
  );
}

export default function StudentDetailScreen() {
  const theme = useTheme();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const parsed = Number(rawId);
  const id = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

  const { data, isPending, isError, refetch } = useStudentDetail(id, role);

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {id === null ? (
        <EmptyState title="Not found" message="That student link isn't valid." />
      ) : isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load this student." onRetry={() => void refetch()} />
      ) : (
        <>
          <Text variant="title">{data.name}</Text>
          <Text variant="label" color={theme.colors.neutral[600]}>
            {data.email}
          </Text>
          {data.graduationYear !== null ? (
            <Text variant="label" color={theme.colors.neutral[600]}>
              {`Alumnus — Class of ${data.graduationYear}`}
            </Text>
          ) : null}
          {data.currentGroup ? (
            <Text variant="label" color={theme.colors.neutral[600]}>
              {`Current group: ${data.currentGroup.name}`}
            </Text>
          ) : null}
          <ProfileCard detail={data} />
          {"notes" in data.profile && data.profile.notes ? (
            <Card style={{ marginTop: theme.spacing.md }}>
              <Text variant="heading">Internal notes</Text>
              <Text variant="caption" color={theme.colors.neutral[600]}>
                Staff only — the student never receives this field.
              </Text>
              <Text variant="body">{data.profile.notes}</Text>
            </Card>
          ) : null}
          <Card style={{ marginTop: theme.spacing.md }}>
            <Text variant="heading">Seasons</Text>
            {data.enrollments.length === 0 ? (
              <Text variant="body" color={theme.colors.neutral[600]}>
                No enrollments yet.
              </Text>
            ) : (
              data.enrollments.map((e) => <EnrollmentRow key={e.enrollmentId} item={e} />)
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}
```

In `_layout.tsx`, append `"student/[id]"` to `DETAIL_ROUTE_NAMES` (or create
the const + `orderedRouteNames` spread per the fallback note above).

- [ ] **Step 5: Check the two guard tests**

Read `role-tabs.test.tsx`. If its coverage check is "every nav href has a
route file", the new directory changes nothing. If it also asserts the
inverse ("every route file is a nav href"), exclude `DETAIL_ROUTE_NAMES` from
that direction by importing the const from `_layout.tsx` — one source of
truth, no hardcoded second list. State in the commit message which case it was.

- [ ] **Step 6: Regenerate typed routes, run everything**

Run: `pnpm turbo routes:generate --filter=@space/mobile`
Run: `cd apps/mobile && pnpm jest src/__tests__/student-detail.test.tsx src/__tests__/app-layout.test.tsx src/__tests__/role-tabs.test.tsx src/__tests__/students-list.test.tsx` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean
(this is also what unblocks Task 6's `router.push` typecheck).

- [ ] **Step 7: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): student detail route with role-arm parsing"
```

---

### Task 8: Closing gate (coordinator)

**Files:** none created — verification only.

- [ ] **Step 1: Full suite**

Run at the repo root: `pnpm turbo lint typecheck test:unit build` → green.
Then the full serial integration run:
`cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern integration` → green.

- [ ] **Step 2: Mutation pass**

Three mutations, one at a time, each must break at least one named test, then
restore:

1. **Drop the LEADER narrowing.** In `lib/queries/students.ts`
   `studentListScope`, make the LEADER branch return `{ kind: "all" }` — the
   "narrows LEADER to their groups' members through the ENROLLMENT row (C9)"
   test must fail (it pins `toEqual([student1Id])` and `total: 1`).
2. **Widen the ADMIN allowlist.** In `routes/students.ts`, add
   `"activeSeasonId"` to `ADMIN_EDITABLE` — the "lets ADMIN write notes but
   NOT activeSeasonId" test must fail on the 403 assertion.
3. **Break the role shaping.** In `routes/students.ts` `detailViewFor`,
   return `"internal"` unconditionally — the MENTOR absence test
   (`not.toHaveProperty("phone")` …) and the LEADER public-shape test must
   fail.

- [ ] **Step 3: Emit check**

`grep -rn 'require("@space/shared")' apps/backend/dist/apps/backend/src/routes/` → empty
(the CLAUDE.md `rootDir` trap; `routes/students.ts` carries this plan's only
new value import from shared).

- [ ] **Step 4: Device checklist (manual, on Expo Go or a dev build)**

Backend running (`pnpm --filter @space/backend dev`), `apiClient` base URL
pointed at it. Against staging accounts:

1. As SUPER: Students tab lists real students with a correct total; search
   narrows; "Load more" pages.
2. Open a student → detail shows profile, internal notes card, and the
   Seasons history with per-season group names.
3. As a LEADER account: the same student route shows no phone/notes and only
   the leader's seasons; a student outside their groups errors (403).
4. Alumni and Dropped screens render their filters; a dropped row shows the
   reason.
5. As a STUDENT account: the Students screen shows the role-gate empty state.

- [ ] **Step 5: Report**

Report: suite counts, the three mutation outcomes, device checklist results,
and any divergence from this plan discovered while implementing.
