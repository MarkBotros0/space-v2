# Plan 8 — Quizzes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Domain 12 end to end — an admin authors and publishes a quiz, a student takes it on a phone, staff grade it — with the answer key structurally unable to reach a student client, the live-quiz corruption not ported, and `saveQuizGradesAction`'s two authorization holes fixed rather than carried over.

**Architecture:** Every quiz route lives in one new file,
`apps/backend/src/routes/quizzes.ts`, mounted at `/api/v1/quizzes`. Quiz
creation is therefore `POST /api/v1/quizzes` with `seasonId` **in the body**,
not `POST /api/v1/seasons/:id/quizzes` — the same recorded deviation Plan 3
made for `POST /api/v1/sessions` (`2026-10-05-plan-03-season-session-writes.md`
Task 4 Step 3), for the same reason: the domain's routes stay in one file that
no other workstream touches. The contract split is the spine of the whole plan:
`quizQuestionStudentSchema` has **no `correctIndex` field at all** and
`quizQuestionAuthoringSchema` does. On the server the guarantee is a raw-JSON
integration test (Task 4), backed by a student-question mapper whose object
literal is typed as `QuizQuestionStudent` (an added `correctIndex` line fails
the excess-property check; a spread would not — which is why the test, not the
type, is the guarantee). Mobile adds four screens over the
`DETAIL_ROUTE_NAMES` mechanism Plan 1 established — list, runner, grading, and
the authoring builder (Task 11).

**Tech Stack:** Express 5, Prisma 7 (`src/generated/prisma`), Zod contracts in
`packages/shared`, jest + supertest integration suite against the shared
staging DB; Expo SDK 54 / expo-router 6 (typed routes), React Query 5,
RNTL 13 via `renderWithProviders`.

**Spec:** `docs/superpowers/specs/domains/12-quizzes.md` (all of §10 — D1, D2,
D3, D4, D5, D7, D8, D9, D10, D12, D13, D15 are each implemented or explicitly
declined below), `docs/superpowers/specs/domains/_DECISIONS.md` (C1, C4, C6,
C8, C9, C11, C12), scope from
`docs/superpowers/plans/2026-08-24-migration-roadmap.md` § Plan 8.

## Global Constraints

- **No migrations, ever.** No edits under `apps/backend/prisma/`. The staging
  database is shared with running v1 (ruling C1). Every Prisma call below is
  written against the models as they actually are — see "Schema facts" next.
- **`D:\Projects\JPC\jpc-space` is READ-ONLY.** Read it for behaviour; never write to it.
- Response envelope `{ data }` / `{ error: { code, message } }` via `apiOk` / `apiError`.
- Value imports from shared in backend route files use the relative path
  `"../../../../packages/shared/src/index"` (the `rootDir` emit trap in `CLAUDE.md`).
- `src/docs/openapi.ts` changes in the **same commit** as the route it documents.
- Integration fixtures: every row carries the `space-v2-test-` prefix in
  `User.email` or `Season.code`; use `createTestSeason` / `createTestUser` /
  `login` / `cleanupTestData` from `__tests__/integration/fixtures.ts`;
  `jest.setTimeout(60000)`.
- **Integration tests are serial.** Each backend task runs its own suite:
  `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern quizzes`.
  If these tasks are ever split across agents, agents write tests **unrun** and
  the coordinator runs them serially.
- **`cleanupTestData` does not know about quiz rows.** It deletes by season
  prefix but its explicit delete order stops at `session` / `assignment`;
  `Quiz.season` is `onDelete: Cascade`, so `season.deleteMany` does cascade
  quizzes → grades/questions/attempts → answers. **`QuizGrade.studentUserId`
  and `QuizAttempt.studentUserId` are `onDelete: Restrict` against `User`**,
  and the season cascade fires before `user.deleteMany`, so the ordering works
  out — but verify this on the first integration run rather than assuming it.
  If `user.deleteMany` throws a foreign-key error, the fix is to add
  `db.quizAnswer/quizAttempt/quizGrade.deleteMany` scoped to
  `{ quiz: { seasonId: { in: seasonIds } } }` to `fixtures.ts` **above** the
  `season.deleteMany` line, in the same commit as the first quiz suite.
- Mobile: relative imports only (no `@/`); every response parsed with a Zod
  schema from `@space/shared`, never cast; dependent queries pass `enabled` and
  guard manual `refetch()`; states map to `LoadingState` / `ErrorState`
  (`onRetry`) / `EmptyState`; tab screens pass `edges={["top","left","right"]}`;
  tests use `renderWithProviders`; `jest.mock` factories may only close over
  consts named `mock*`; query `Input` by `getByLabelText`; never `as Href`;
  after adding a route file run `pnpm turbo routes:generate --filter=@space/mobile`.
- **No rich text anywhere in this domain.** `prompt`, `options`, `notes` and
  essay `text` are plain text in v1 and stay plain (spec §9). Ruling C11 needs
  no sanitiser step here — but nothing in this domain may be rendered as HTML
  or interpolated unescaped into mail.

## Schema facts this plan is written against

Read from `apps/backend/prisma/schema.prisma` (verbatim, lines cited):

- `enum QuizKind { PAPER ONLINE }` (`:83-86`), `enum QuizQuestionType { MCQ ESSAY }`
  (`:88-91`), `enum QuizAttemptStatus { IN_PROGRESS SUBMITTED GRADED }` (`:93-97`).
  **There is no `ABANDONED`/`EXPIRED` value and adding one is a migration (C1).**
- `Quiz` (`:644-667`): `seasonId` (Cascade), `sessionId Int?` (SetNull),
  `title`, `kind QuizKind @default(PAPER)`, `maxScore Int @default(100)`,
  `publishedAt DateTime?`, `createdById Int?` (SetNull), `createdAt`,
  `updatedAt`. Relations `grades`, `questions`, `attempts`.
  `@@index([seasonId])`, `@@index([sessionId])`. **No `deletedAt` — a delete
  here is a hard delete**, which is why this plan does not expose one (D9/C12).
- `QuizGrade` (`:669-685`): `quizId` (Cascade), `studentUserId` (**Restrict**),
  `score Int?`, `notes String?`, `gradedById Int?` (SetNull), `gradedAt DateTime?`.
  **`@@unique([quizId, studentUserId])`** — the key the grade upsert uses:
  `quizId_studentUserId`.
- `QuizQuestion` (`:689-705`): `quizId` (Cascade), `order Int`, `type`,
  `prompt`, `points Int @default(1)`, `options String[]`, `correctIndex Int?`.
  `@@index([quizId, order])`.
- `QuizAttempt` (`:709-732`): `quizId` (Cascade), `studentUserId` (**Restrict**),
  `attemptNumber Int @default(1)`, `status @default(IN_PROGRESS)`,
  `autoScore Int?`, `manualScore Int?`, `totalScore Int?`, `submittedAt`,
  `gradedById Int?` (SetNull), `gradedAt`.
  **`@@unique([quizId, studentUserId, attemptNumber])`** — Prisma key
  `quizId_studentUserId_attemptNumber`; `@@index([quizId, status])`.
- `QuizAnswer` (`:734-749`): `attemptId` (Cascade), `questionId` (**Cascade**),
  `selectedIndex Int?`, `text String?`, `isCorrect Boolean?`, `pointsAwarded Int?`.
  **`@@unique([attemptId, questionId])`** — Prisma key `attemptId_questionId`.
- `NotificationType` includes `QUIZ_GRADED`, and
  `apps/backend/src/lib/notifications.ts`'s `PREF_FIELD` already maps it to
  `quizGraded`. **`createNotificationsBulk(userIds, payload)` is the only
  notification entry point** — there is no `createNotification` singular in v2.

**Spec-vs-schema contradiction to know about:** the spec (§2) says `Quiz.sessionId`
is "nullable in the schema, required in code". The schema is authoritative and
it is nullable — so this plan accepts a null `sessionId` at creation (D12's
recommendation) instead of reproducing v1's `z.number().int().positive()`
requirement. Everything downstream (`sessionTitle`, `sessionDate`, ordering)
already handles null because v1 had to handle the orphan case anyway.

**Execution shape:** Task 1 first — every later task consumes the contracts.
Tasks 2 → 3 → 4 → 5 → 6 are the backend and are **sequential, not parallel**:
they all edit `routes/quizzes.ts`, and single-file contention is
coordinator-only per the roadmap. (This is a deliberate deviation from the
roadmap's "2 backend agents" for Plan 8: the alternative — two route files for
one domain — buys parallelism by fragmenting the one file a reader needs to
hold in their head, and the spec's headline risk is exactly a careless edit
across two quiz reads that live apart.) Task 7 is the mobile foundation.
Tasks 8+9 (list + runner) and Task 10 (grading screen) are then two independent
screen workstreams. Task 11 (the authoring UI) runs after Tasks 8 and 9 — it
edits both of their screens. Task 11b (the session-quiz card's row press)
runs after Task 9 — it links to Task 9's `quiz/[id]` route. Task 12 is the
coordinator's closing gate.

**Depends on** (execution order 1 → 2 → 3 → 4 → 5 → 6 → 7 → **8** → 9 → 10 → …):
Plan 1 (`DETAIL_ROUTE_NAMES`; Task 0's derived route-count
tests — ruling X9), Plan 4 (`useCurrentSeasonId` from
`src/hooks/use-seasons.ts` — the only source of a staff season, ruling X8;
`apiErrorMessage` from `src/lib/api-error.ts`; `dayKey` on session list rows),
Plan 6 (`SessionQuizzesCard` in `src/components/SessionQuizzesCard.tsx`,
`sessionQuizItemSchema` in `packages/shared/src/session.ts`, its replaced
`session-detail.test.tsx` harness — Task 11b; and the now-required
`startTime` on session list rows, which this plan's session-list fixtures
carry), Phase 0's `useSeasonSessions`. Plans 5 and 7 also run before this
one; nothing here consumes them. Plan 10 runs **after** this plan.

---

### Task 1: Contracts — the two-schema split

**Files:**
- Modify: `packages/shared/src/enums.ts` (three quiz enums)
- Create: `packages/shared/src/quiz.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from "./quiz";`)
- Test: `packages/shared/src/__tests__/quiz-schemas.test.ts`

**Interfaces:**
- Consumes: `z` from zod; nothing else from the package.
- Produces (exact names every later task imports): `quizKindSchema`,
  `quizQuestionTypeSchema`, `quizAttemptStatusSchema` (+ types `QuizKind`,
  `QuizQuestionType`, `QuizAttemptStatus`); `quizSummarySchema`/`QuizSummary`;
  `quizQuestionAuthoringSchema`/`QuizQuestionAuthoring`;
  `quizQuestionStudentSchema`/`QuizQuestionStudent`;
  `quizAuthoringDetailSchema`/`QuizAuthoringDetail`;
  `studentQuizDetailSchema`/`StudentQuizDetail`;
  `studentQuizResultSchema`/`StudentQuizResult`;
  `quizGradeSheetSchema`/`QuizGradeSheet`;
  `quizGradingAnswerSchema`, `quizGradingAttemptSchema`/`QuizGradingAttempt`,
  `quizGradingPageSchema`/`QuizGradingPage`; `quizListPageSchema`,
  `studentQuizListPageSchema`; request schemas `createQuizRequestSchema`
  (`CreateQuizBody`), `updateQuizRequestSchema` (`UpdateQuizBody`),
  `quizQuestionRequestSchema` (`QuizQuestionBody`),
  `reorderQuestionsRequestSchema`, `publishQuizRequestSchema`,
  `saveQuizAnswersRequestSchema` (`SaveQuizAnswersBody`),
  `saveQuizGradesRequestSchema` (`SaveQuizGradesBody`),
  `gradeEssayAnswersRequestSchema` (`GradeEssayAnswersBody`),
  `reopenAttemptRequestSchema`, `quizListQuerySchema`, `quizAttemptsQuerySchema`;
  type `QuizQuestionInput` (`z.input` of `quizQuestionRequestSchema` — what a
  client form sends); and the mutation response schemas (ruling X10 — no
  client casts a write response): `quizCreatedResponseSchema`,
  `quizUpdatedResponseSchema`, `quizQuestionDeletedResponseSchema`,
  `reorderQuestionsResponseSchema`, `publishQuizResponseSchema`,
  `saveQuizAnswersResponseSchema`, `reopenAttemptResponseSchema`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/__tests__/quiz-schemas.test.ts
import {
  createQuizRequestSchema,
  gradeEssayAnswersRequestSchema,
  quizQuestionRequestSchema,
  quizQuestionStudentSchema,
  reorderQuestionsRequestSchema,
  saveQuizAnswersRequestSchema,
  saveQuizGradesRequestSchema,
} from "../index";

describe("the answer-key split (spec D2)", () => {
  it("has no correctIndex key on the student question schema, even as optional", () => {
    // The protection in v1 was a `select` list in a 559-line file that also
    // held the two reads that DO return the key. Here it is the type: if this
    // shape ever gains the field, this fails before any handler can leak it.
    expect(Object.keys(quizQuestionStudentSchema.shape)).not.toContain("correctIndex");
  });

  it("strips a correctIndex a careless handler passed in", () => {
    const parsed = quizQuestionStudentSchema.parse({
      id: 1, order: 0, type: "MCQ", prompt: "Capital of France?", points: 2,
      options: ["London", "Paris"], selectedIndex: 1, text: null,
      isCorrect: null, pointsAwarded: null,
      correctIndex: 1,
    } as never);
    expect(JSON.stringify(parsed)).not.toContain("correctIndex");
  });
});

describe("createQuizRequestSchema", () => {
  const base = { seasonId: 7, sessionId: 12, title: "Week 1 quiz" };

  it("requires maxScore for PAPER (R3)", () => {
    expect(createQuizRequestSchema.safeParse({ ...base, kind: "PAPER" }).success).toBe(false);
    expect(
      createQuizRequestSchema.safeParse({ ...base, kind: "PAPER", maxScore: 20 }).success,
    ).toBe(true);
  });

  it("REJECTS maxScore for ONLINE instead of silently zeroing it (R4, §7)", () => {
    expect(
      createQuizRequestSchema.safeParse({ ...base, kind: "ONLINE", maxScore: 20 }).success,
    ).toBe(false);
    expect(createQuizRequestSchema.safeParse({ ...base, kind: "ONLINE" }).success).toBe(true);
  });

  it("accepts a session-less quiz (D12) — the column is nullable", () => {
    expect(
      createQuizRequestSchema.safeParse({ ...base, sessionId: null, kind: "ONLINE" }).success,
    ).toBe(true);
  });
});

describe("quizQuestionRequestSchema", () => {
  it("needs at least 2 options and an in-range correctIndex for MCQ (R17, R18)", () => {
    const mcq = { type: "MCQ", prompt: "Pick one", points: 2, options: ["a"], correctIndex: 0 };
    expect(quizQuestionRequestSchema.safeParse(mcq).success).toBe(false);
    expect(
      quizQuestionRequestSchema.safeParse({ ...mcq, options: ["a", "b"], correctIndex: 2 }).success,
    ).toBe(false);
    expect(
      quizQuestionRequestSchema.safeParse({ ...mcq, options: ["a", "b"], correctIndex: 1 }).success,
    ).toBe(true);
  });

  it("normalises ESSAY to no options and no correct answer in the transform (R19)", () => {
    const parsed = quizQuestionRequestSchema.parse({
      type: "ESSAY", prompt: "  Discuss.  ", points: 5,
      options: ["stray", "values"], correctIndex: 1,
    });
    expect(parsed).toMatchObject({ prompt: "Discuss.", options: [], correctIndex: null });
  });

  it("caps options at 6 and prompt at 2000 (R16)", () => {
    expect(
      quizQuestionRequestSchema.safeParse({
        type: "MCQ", prompt: "Pick", points: 1,
        options: ["a", "b", "c", "d", "e", "f", "g"], correctIndex: 0,
      }).success,
    ).toBe(false);
  });
});

describe("saveQuizAnswersRequestSchema", () => {
  it("has no hard-coded index ceiling — the option count is a server check (R51)", () => {
    // v1 capped selectedIndex at 5 in the schema, which is neither the real
    // bound nor a check against this question's options.
    expect(
      saveQuizAnswersRequestSchema.safeParse({
        answers: [{ questionId: 3, selectedIndex: 5, text: null }],
      }).success,
    ).toBe(true);
  });

  it("refuses an empty batch", () => {
    expect(saveQuizAnswersRequestSchema.safeParse({ answers: [] }).success).toBe(false);
  });
});

describe("saveQuizGradesRequestSchema", () => {
  it("allows a null score as an explicit clear (diverging from R89)", () => {
    expect(
      saveQuizGradesRequestSchema.safeParse({
        entries: [{ studentUserId: 9, score: null, notes: null }],
      }).success,
    ).toBe(true);
  });

  it("refuses a negative score", () => {
    expect(
      saveQuizGradesRequestSchema.safeParse({
        entries: [{ studentUserId: 9, score: -1, notes: null }],
      }).success,
    ).toBe(false);
  });
});

describe("gradeEssayAnswersRequestSchema / reorderQuestionsRequestSchema", () => {
  it("requires at least one award and a non-negative integer", () => {
    expect(gradeEssayAnswersRequestSchema.safeParse({ awards: [] }).success).toBe(false);
    expect(
      gradeEssayAnswersRequestSchema.safeParse({ awards: [{ questionId: 1, points: -1 }] }).success,
    ).toBe(false);
  });

  it("requires a non-empty questionIds list to reorder", () => {
    expect(reorderQuestionsRequestSchema.safeParse({ questionIds: [] }).success).toBe(false);
    expect(reorderQuestionsRequestSchema.safeParse({ questionIds: [3, 1, 2] }).success).toBe(true);
  });
});
```

Run: `pnpm --filter @space/shared jest src/__tests__/quiz-schemas.test.ts` → FAIL (module `./quiz` does not exist).

- [ ] **Step 2: Add the three enums to `packages/shared/src/enums.ts`**

Append (beside the existing role/status enums — do **not** redeclare these
locally in `quiz.ts`, per spec §8):

```ts
export const quizKindSchema = z.enum(["PAPER", "ONLINE"]);
export type QuizKind = z.infer<typeof quizKindSchema>;

export const quizQuestionTypeSchema = z.enum(["MCQ", "ESSAY"]);
export type QuizQuestionType = z.infer<typeof quizQuestionTypeSchema>;

export const quizAttemptStatusSchema = z.enum(["IN_PROGRESS", "SUBMITTED", "GRADED"]);
export type QuizAttemptStatus = z.infer<typeof quizAttemptStatusSchema>;
```

- [ ] **Step 3: Write `packages/shared/src/quiz.ts`**

```ts
import { z } from "zod";

import { quizAttemptStatusSchema, quizKindSchema, quizQuestionTypeSchema } from "./enums";

// Wire shapes — timestamps are ISO strings, per the note in season.ts.
//
// THE CENTRAL DECISION OF THIS DOMAIN (spec §8, D2): there is no schema
// anywhere in this file with an optional `correctIndex`. The presence of the
// answer key is a DIFFERENT TYPE, so a client parsing the student shape can
// never be handed the key as a typed field. On the server, the raw-JSON
// integration test in the attempts task is the guarantee; the typed
// `toStudentQuestion` mapper there catches the most likely edit (a
// `correctIndex` line added to its literal) at typecheck, but structural
// typing lets a spread through, so the test is what must never be weakened.
// v1's protection was a `select` list living in the same file as the two
// reads that do return the key.

// ---------------------------------------------------------------------------
// Read shapes
// ---------------------------------------------------------------------------

/**
 * A staff list row.
 *
 * `gradedCount` and `studentCount` are computed once, server-side, against ONE
 * defined student set (ruling C4; spec R98/R110/R114, where three different
 * "graded" numbers and three different "students in this season" coexisted and
 * every ONLINE quiz read as permanently pending). Definitions, fixed here:
 * `studentCount` is the ACTIVE SeasonEnrollment population of the quiz's season
 * narrowed to the caller's scope; `gradedCount` is QuizGrade rows with a
 * non-null score for PAPER, and QuizAttempt rows with status GRADED for ONLINE.
 */
export const quizSummarySchema = z.object({
  id: z.number(),
  title: z.string(),
  kind: quizKindSchema,
  publishedAt: z.string().nullable(),
  questionCount: z.number(),
  maxScore: z.number(),
  sessionId: z.number().nullable(),
  sessionTitle: z.string().nullable(),
  sessionDate: z.string().nullable(),
  seasonId: z.number(),
  seasonCode: z.string(),
  gradedCount: z.number(),
  studentCount: z.number(),
});
export type QuizSummary = z.infer<typeof quizSummarySchema>;

export const quizListPageSchema = z.object({
  items: z.array(quizSummarySchema),
  nextCursor: z.number().nullable(),
});
export type QuizListPage = z.infer<typeof quizListPageSchema>;

/** Authoring projection — the ONLY read shape carrying the answer key. */
export const quizQuestionAuthoringSchema = z.object({
  id: z.number(),
  order: z.number(),
  type: quizQuestionTypeSchema,
  prompt: z.string(),
  points: z.number(),
  options: z.array(z.string()),
  correctIndex: z.number().nullable(),
});
export type QuizQuestionAuthoring = z.infer<typeof quizQuestionAuthoringSchema>;

export const quizAuthoringDetailSchema = z.object({
  id: z.number(),
  title: z.string(),
  kind: quizKindSchema,
  seasonId: z.number(),
  seasonCode: z.string(),
  sessionId: z.number().nullable(),
  sessionTitle: z.string().nullable(),
  publishedAt: z.string().nullable(),
  maxScore: z.number(),
  attemptCount: z.number(),
  gradeCount: z.number(),
  /**
   * Derived server-side (C4): false once any attempt exists, which is what
   * makes questions immutable at that point (spec D3). The screen reads this
   * rather than re-deriving "does it have attempts" from a count it happens
   * to have — the server's answer is the one the write path enforces.
   */
  canEditStructure: z.boolean(),
  /** Whether this caller may reopen an attempt / publish (canManageQuiz). */
  canManage: z.boolean(),
  questions: z.array(quizQuestionAuthoringSchema),
});
export type QuizAuthoringDetail = z.infer<typeof quizAuthoringDetailSchema>;

/**
 * The student projection. No `correctIndex`, ever.
 *
 * `isCorrect` and `pointsAwarded` ARE here and are correct to send (R34): both
 * are null until submit, and after an auto-graded submit the student learns
 * which MCQs were wrong without learning what was right.
 */
export const quizQuestionStudentSchema = z.object({
  id: z.number(),
  order: z.number(),
  type: quizQuestionTypeSchema,
  prompt: z.string(),
  points: z.number(),
  options: z.array(z.string()),
  selectedIndex: z.number().nullable(),
  text: z.string().nullable(),
  isCorrect: z.boolean().nullable(),
  pointsAwarded: z.number().nullable(),
});
export type QuizQuestionStudent = z.infer<typeof quizQuestionStudentSchema>;

/**
 * `autoScore` and `manualScore` are deliberately absent: v1 returned both to
 * the student and rendered neither (spec §5). `totalScore` is the only score a
 * student is ever shown.
 */
export const studentQuizDetailSchema = z.object({
  id: z.number(),
  title: z.string(),
  kind: quizKindSchema,
  seasonId: z.number(),
  maxScore: z.number(),
  sessionTitle: z.string().nullable(),
  attemptId: z.number().nullable(),
  attemptNumber: z.number(),
  status: quizAttemptStatusSchema.nullable(),
  totalScore: z.number().nullable(),
  submittedAt: z.string().nullable(),
  gradedAt: z.string().nullable(),
  questions: z.array(quizQuestionStudentSchema),
});
export type StudentQuizDetail = z.infer<typeof studentQuizDetailSchema>;

/** One row of the student's results list. */
export const studentQuizResultSchema = z.object({
  quizId: z.number(),
  title: z.string(),
  kind: quizKindSchema,
  maxScore: z.number(),
  score: z.number().nullable(),
  notes: z.string().nullable(),
  gradedAt: z.string().nullable(),
  sessionTitle: z.string().nullable(),
  sessionDate: z.string().nullable(),
  /** ONLINE only; null for PAPER and for a never-started ONLINE quiz. */
  attemptStatus: quizAttemptStatusSchema.nullable(),
});
export type StudentQuizResult = z.infer<typeof studentQuizResultSchema>;

export const studentQuizListPageSchema = z.object({
  items: z.array(studentQuizResultSchema),
  nextCursor: z.null(),
});
export type StudentQuizListPage = z.infer<typeof studentQuizListPageSchema>;

export const quizGradeRowSchema = z.object({
  studentUserId: z.number(),
  studentName: z.string().nullable(),
  score: z.number().nullable(),
  notes: z.string().nullable(),
  gradedAt: z.string().nullable(),
  /** D13: the audit column v1 wrote and never read. One join, real information. */
  gradedByName: z.string().nullable(),
});
export type QuizGradeRow = z.infer<typeof quizGradeRowSchema>;

export const quizGradeSheetSchema = z.object({
  id: z.number(),
  title: z.string(),
  kind: quizKindSchema,
  maxScore: z.number(),
  seasonId: z.number(),
  sessionTitle: z.string().nullable(),
  studentCount: z.number(),
  rows: z.array(quizGradeRowSchema),
});
export type QuizGradeSheet = z.infer<typeof quizGradeSheetSchema>;

/** Grader-only: carries the answer key by design (R103). */
export const quizGradingAnswerSchema = z.object({
  questionId: z.number(),
  type: quizQuestionTypeSchema,
  prompt: z.string(),
  points: z.number(),
  options: z.array(z.string()),
  correctIndex: z.number().nullable(),
  selectedIndex: z.number().nullable(),
  isCorrect: z.boolean().nullable(),
  text: z.string().nullable(),
  pointsAwarded: z.number().nullable(),
});
export type QuizGradingAnswer = z.infer<typeof quizGradingAnswerSchema>;

export const quizGradingAttemptSchema = z.object({
  attemptId: z.number(),
  studentUserId: z.number(),
  studentName: z.string().nullable(),
  attemptNumber: z.number(),
  status: quizAttemptStatusSchema,
  autoScore: z.number().nullable(),
  manualScore: z.number().nullable(),
  totalScore: z.number().nullable(),
  submittedAt: z.string().nullable(),
  gradedByName: z.string().nullable(),
  answers: z.array(quizGradingAnswerSchema),
});
export type QuizGradingAttempt = z.infer<typeof quizGradingAttemptSchema>;

export const quizGradingPageSchema = z.object({
  id: z.number(),
  title: z.string(),
  kind: quizKindSchema,
  maxScore: z.number(),
  hasEssays: z.boolean(),
  studentCount: z.number(),
  /**
   * Students in scope with no attempt at all, and students whose latest attempt
   * is still IN_PROGRESS, both appear — the second is spec D5/R102, where a
   * student vanished from the grading list entirely (including one an admin
   * had just reopened) because the read filtered to SUBMITTED|GRADED.
   */
  items: z.array(quizGradingAttemptSchema),
  waiting: z.array(
    z.object({
      studentUserId: z.number(),
      studentName: z.string().nullable(),
      /** null = never started; a date = an IN_PROGRESS attempt open since then. */
      startedAt: z.string().nullable(),
    }),
  ),
  nextCursor: z.number().nullable(),
});
export type QuizGradingPage = z.infer<typeof quizGradingPageSchema>;

// ---------------------------------------------------------------------------
// Write shapes
// ---------------------------------------------------------------------------

export const createQuizRequestSchema = z
  .object({
    /**
     * In the body, not the path. Quiz routes all live in one file mounted at
     * /api/v1/quizzes, so creation cannot hang off /seasons/:id — the same
     * recorded deviation Plan 3 made for POST /api/v1/sessions.
     */
    seasonId: z.number().int().positive(),
    /** Nullable: the column is (schema.prisma:648) and D12 recommends allowing it. */
    sessionId: z.number().int().positive().nullable().default(null),
    title: z.string().trim().min(1).max(200),
    kind: quizKindSchema,
    maxScore: z.number().int().min(1).max(1000).optional(),
  })
  .refine((v) => v.kind !== "PAPER" || v.maxScore !== undefined, {
    path: ["maxScore"],
    message: "Max score is required for paper quizzes.",
  })
  // R4 zeroed a caller's maxScore silently for ONLINE. Refusing is honest: an
  // ONLINE quiz's maxScore is the sum of its question points and nothing else.
  .refine((v) => v.kind !== "ONLINE" || v.maxScore === undefined, {
    path: ["maxScore"],
    message: "An online quiz derives its max score from its questions.",
  });
export type CreateQuizBody = z.output<typeof createQuizRequestSchema>;

/**
 * `kind` is absent by design: v1 writes it once at create and never again, and
 * a kind change would reinterpret every existing grade or attempt.
 */
export const updateQuizRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    maxScore: z.number().int().min(1).max(1000).optional(),
    sessionId: z.number().int().positive().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });
export type UpdateQuizBody = z.output<typeof updateQuizRequestSchema>;

/**
 * v1 validated, then normalised in a separate `normalizeQuestion` helper that
 * every write had to remember to call. The normalisation is a `transform` here
 * so it cannot be forgotten (spec §8).
 */
export const quizQuestionRequestSchema = z
  .object({
    type: quizQuestionTypeSchema,
    prompt: z.string().trim().min(2).max(2000),
    points: z.number().int().min(1).max(100),
    options: z.array(z.string().trim().min(1).max(500)).max(6).default([]),
    correctIndex: z.number().int().min(0).nullable().default(null),
  })
  .refine((d) => d.type === "ESSAY" || d.options.length >= 2, {
    path: ["options"],
    message: "Add at least 2 options.",
  })
  .refine(
    (d) => d.type === "ESSAY" || (d.correctIndex !== null && d.correctIndex < d.options.length),
    { path: ["correctIndex"], message: "Mark the correct answer." },
  )
  .transform((d) =>
    d.type === "ESSAY" ? { ...d, options: [] as string[], correctIndex: null } : d,
  );
export type QuizQuestionBody = z.output<typeof quizQuestionRequestSchema>;
/** What a client form sends (before the schema's defaults and transform run). */
export type QuizQuestionInput = z.input<typeof quizQuestionRequestSchema>;

/** New in v2 (R20: v1 had no reorder at all). Must be a permutation — checked server-side. */
export const reorderQuestionsRequestSchema = z.object({
  questionIds: z.array(z.number().int().positive()).min(1),
});
export type ReorderQuestionsBody = z.infer<typeof reorderQuestionsRequestSchema>;

export const publishQuizRequestSchema = z.object({ publish: z.boolean() });
export type PublishQuizBody = z.infer<typeof publishQuizRequestSchema>;

/**
 * A batch, unlike v1's one-answer-per-call. The runner debounces and flushes
 * everything pending in one request, so a backgrounded phone loses at most one
 * flush instead of one answer per silent failure (R55/R56 and spec §9).
 */
export const saveQuizAnswersRequestSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.number().int().positive(),
        /** Bounds against THIS question's options.length are a server check (R51). */
        selectedIndex: z.number().int().min(0).nullable().default(null),
        text: z.string().max(20000).nullable().default(null),
      }),
    )
    .min(1)
    .max(100),
});
export type SaveQuizAnswersBody = z.output<typeof saveQuizAnswersRequestSchema>;

/**
 * `score: null` CLEARS the grade row.
 *
 * v1 skipped null entries entirely (R89), so a grade entered against the wrong
 * student could never be removed. Spec D7 recommends a separate
 * DELETE /quizzes/:id/grades/:studentUserId; this plan folds it into the batch
 * instead, because the client is a grid that submits the whole sheet and a
 * separate endpoint would mean one extra round trip per cleared cell. The
 * upper bound against the quiz's own maxScore is a server check (R88/D7).
 */
export const saveQuizGradesRequestSchema = z.object({
  entries: z
    .array(
      z.object({
        studentUserId: z.number().int().positive(),
        score: z.number().int().min(0).nullable(),
        notes: z.string().max(1000).nullable().default(null),
      }),
    )
    .min(1)
    .max(200),
});
export type SaveQuizGradesBody = z.output<typeof saveQuizGradesRequestSchema>;

/**
 * Every ESSAY question of the quiz must appear. v1 recomputed manualScore from
 * only the awards present in the call, so a partial payload silently lowered a
 * student's total (R72); completeness is checked server-side against the quiz.
 */
export const gradeEssayAnswersRequestSchema = z.object({
  awards: z
    .array(z.object({ questionId: z.number().int().positive(), points: z.number().int().min(0) }))
    .min(1),
});
export type GradeEssayAnswersBody = z.infer<typeof gradeEssayAnswersRequestSchema>;

export const reopenAttemptRequestSchema = z.object({
  studentUserId: z.number().int().positive(),
});
export type ReopenAttemptBody = z.infer<typeof reopenAttemptRequestSchema>;

export const quizListQuerySchema = z.object({
  seasonId: z.coerce.number().int().positive().optional(),
  sessionId: z.coerce.number().int().positive().optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type QuizListQuery = z.infer<typeof quizListQuerySchema>;

export const quizAttemptsQuerySchema = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type QuizAttemptsQuery = z.infer<typeof quizAttemptsQuerySchema>;

// ---------------------------------------------------------------------------
// Write responses — every client mutation parses one of these (ruling X10).
// ---------------------------------------------------------------------------

/** POST /quizzes */
export const quizCreatedResponseSchema = z.object({ id: z.number() });
/** PATCH /quizzes/:id */
export const quizUpdatedResponseSchema = z.object({ updated: z.literal(true) });
/** DELETE /quizzes/:id/questions/:questionId */
export const quizQuestionDeletedResponseSchema = z.object({ deleted: z.literal(true) });
/** PUT /quizzes/:id/questions/order */
export const reorderQuestionsResponseSchema = z.object({
  questions: z.array(quizQuestionAuthoringSchema),
});
/** POST /quizzes/:id/publish */
export const publishQuizResponseSchema = z.object({ publishedAt: z.string().nullable() });
/** PATCH /quizzes/:id/attempt */
export const saveQuizAnswersResponseSchema = z.object({ saved: z.number() });
/** POST /quizzes/:id/attempts/reopen */
export const reopenAttemptResponseSchema = z.object({
  attemptId: z.number(),
  attemptNumber: z.number(),
});
```

- [ ] **Step 4: Export it.** In `packages/shared/src/index.ts` append
`export * from "./quiz";` after the `./submission` line.

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @space/shared jest src/__tests__/quiz-schemas.test.ts` → PASS (all).
Run: `pnpm turbo lint typecheck test:unit` → clean.

- [ ] **Step 6: Commit**

```bash
git add packages/shared && git commit -m "feat(shared): quiz contracts with the student/authoring answer-key split"
```

---

### Task 2: Backend — gates, scope, and quiz create / update / list

**Files:**
- Modify: `apps/backend/src/lib/permissions.ts` (append `canManageQuiz`, `canGradeQuiz`)
- Create: `apps/backend/src/lib/quiz-scope.ts`
- Create: `apps/backend/src/routes/quizzes.ts`
- Modify: `apps/backend/src/app.ts` (mount the router)
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: `apps/backend/src/__tests__/integration/quizzes-routes.test.ts` (new suite — this task writes its whole `beforeAll`, which Tasks 3–6 extend)

**Interfaces:**
- Consumes: `apiOk`/`apiError`, `parseId`, `requireAuth`/`requireUser`,
  `isAdminOfSeason` from `lib/rbac`, `staffScopeForSeason`/`canAccessSeason`
  from `lib/permissions`, and `createQuizRequestSchema` /
  `updateQuizRequestSchema` / `quizListQuerySchema` from shared (Task 1).
- Produces:
  - `canManageQuiz(user: SessionUser, quizId: number): Promise<boolean>` — SUPER or admin of the quiz's season.
  - `canGradeQuiz(user: SessionUser, quizId: number): Promise<boolean>` — `staffScopeForSeason(quiz.seasonId) !== null`.
  - `visibleStudentIdsForQuiz(user: SessionUser, seasonId: number): Promise<number[] | null>` in `lib/quiz-scope.ts` — the caller's student set, derived server-side, sorted ascending; `null` = no staff scope at all.
  - `quizzesRouter`, mounted at `/api/v1/quizzes`.
  - `POST /api/v1/quizzes` → `{ data: { id } }` 201; `PATCH /api/v1/quizzes/:id` → `{ data: { updated: true } }`; `GET /api/v1/quizzes?seasonId=&sessionId=&cursor=&limit=` → staff `{ data: { items: QuizSummary[], nextCursor } }`, student `{ data: { items: StudentQuizResult[], nextCursor: null } }`.
  - The suite's exported fixture ids (`seasonId`, `sessionId`, tokens) that Tasks 3–6 reuse.

- [ ] **Step 1: Write the failing integration suite**

```ts
// apps/backend/src/__tests__/integration/quizzes-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

// Same reason as the submissions suite: the shared Neon staging Postgres
// autosuspends, and the first query after idling has been measured at ~18s.
jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let otherSeasonId: number;
let sessionId: number;
let ownStudentId: number;
let otherGroupStudentId: number;
let superToken: string;
let adminToken: string;
let otherAdminToken: string;
let leaderToken: string;
let studentToken: string;
let paperQuizId: number;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;
  const otherSeason = await createTestSeason();
  otherSeasonId = otherSeason.id;

  const superUser = await createTestUser("super", "SUPER");
  const admin = await createTestUser("admin", "ADMIN");
  const otherAdmin = await createTestUser("otheradmin", "ADMIN");
  const leader = await createTestUser("leader", "LEADER");
  const student = await createTestUser("student", "STUDENT");
  const otherStudent = await createTestUser("otherstudent", "STUDENT");
  ownStudentId = student.id;
  otherGroupStudentId = otherStudent.id;

  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  // The D1 fixture: an ADMIN of a DIFFERENT season. v1 let this user write
  // grades into any season at all, because its season check ran only for LEADER.
  await db.seasonAdmin.create({ data: { seasonId: otherSeasonId, userId: otherAdmin.id } });

  const groupA = await db.group.create({
    data: {
      seasonId,
      name: "Group A",
      leaders: { create: { userId: leader.id } },
      students: { create: { studentUserId: student.id } },
    },
    select: { id: true },
  });
  const groupB = await db.group.create({
    data: { seasonId, name: "Group B" },
    select: { id: true },
  });

  // Ruling C9: membership for a season is the enrolment's groupId, not
  // GroupStudent (which is unique on studentUserId across the whole database).
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: student.id, groupId: groupA.id, status: "ACTIVE" },
      { seasonId, studentUserId: otherStudent.id, groupId: groupB.id, status: "ACTIVE" },
    ],
  });

  const session = await db.session.create({
    data: {
      seasonId,
      title: "Week 1",
      startsAt: new Date("2099-03-01T18:00:00.000Z"),
      durationMinutes: 90,
    },
    select: { id: true },
  });
  sessionId = session.id;

  superToken = await login(app, superUser.email);
  adminToken = await login(app, admin.email);
  otherAdminToken = await login(app, otherAdmin.email);
  leaderToken = await login(app, leader.email);
  studentToken = await login(app, student.email);
});

afterAll(async () => {
  await cleanupTestData();
});

describe("POST /api/v1/quizzes", () => {
  it("creates a PAPER quiz with the author's max score", async () => {
    const res = await request(app)
      .post("/api/v1/quizzes")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ seasonId, sessionId, title: "Paper quiz", kind: "PAPER", maxScore: 20 });

    expect(res.status).toBe(201);
    paperQuizId = res.body.data.id;
    const row = await db.quiz.findUnique({
      where: { id: paperQuizId },
      select: { maxScore: true, kind: true, createdById: true, publishedAt: true },
    });
    expect(row).toMatchObject({ maxScore: 20, kind: "PAPER", publishedAt: null });
    // R5/D13: the audit column v1 wrote and never read. Kept, and now read back
    // on the grading screen.
    expect(row?.createdById).not.toBeNull();
  });

  it("creates an ONLINE quiz at maxScore 0 and refuses a caller-supplied one", async () => {
    const refused = await request(app)
      .post("/api/v1/quizzes")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ seasonId, sessionId, title: "Online quiz", kind: "ONLINE", maxScore: 50 });
    expect(refused.status).toBe(400);

    const ok = await request(app)
      .post("/api/v1/quizzes")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ seasonId, sessionId, title: "Online quiz", kind: "ONLINE" });
    expect(ok.status).toBe(201);
    const row = await db.quiz.findUnique({
      where: { id: ok.body.data.id },
      select: { maxScore: true },
    });
    // Derived from question points from here on (R11).
    expect(row?.maxScore).toBe(0);
  });

  it("refuses a session that belongs to another season (R7)", async () => {
    const strayer = await db.session.create({
      data: {
        seasonId: otherSeasonId,
        title: "Elsewhere",
        startsAt: new Date("2099-03-02T18:00:00.000Z"),
        durationMinutes: 60,
      },
      select: { id: true },
    });
    const res = await request(app)
      .post("/api/v1/quizzes")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ seasonId, sessionId: strayer.id, title: "Mismatched", kind: "PAPER", maxScore: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("session_not_in_season");
  });

  it("allows a session-less quiz (D12) — the column is nullable", async () => {
    const res = await request(app)
      .post("/api/v1/quizzes")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ seasonId, sessionId: null, title: "Season-level", kind: "PAPER", maxScore: 10 });
    expect(res.status).toBe(201);
  });

  it("refuses an admin of another season, a leader, and a student", async () => {
    const body = { seasonId, sessionId, title: "Nope", kind: "PAPER", maxScore: 10 };
    for (const token of [otherAdminToken, leaderToken, studentToken]) {
      const res = await request(app)
        .post("/api/v1/quizzes")
        .set("authorization", `Bearer ${token}`)
        .send(body);
      expect(res.status).toBe(403);
    }
  });

  it("lets SUPER create in any season", async () => {
    const res = await request(app)
      .post("/api/v1/quizzes")
      .set("authorization", `Bearer ${superToken}`)
      .send({ seasonId: otherSeasonId, sessionId: null, title: "Super", kind: "PAPER", maxScore: 5 });
    expect(res.status).toBe(201);
  });
});

describe("PATCH /api/v1/quizzes/:id", () => {
  it("renames a quiz", async () => {
    const res = await request(app)
      .patch(`/api/v1/quizzes/${paperQuizId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ title: "Paper quiz (renamed)" });
    expect(res.status).toBe(200);
    const row = await db.quiz.findUnique({ where: { id: paperQuizId }, select: { title: true } });
    expect(row?.title).toBe("Paper quiz (renamed)");
  });

  it("refuses maxScore on an ONLINE quiz, and on a PAPER quiz that has grades", async () => {
    const online = await db.quiz.create({
      data: { seasonId, sessionId, title: "Online", kind: "ONLINE", maxScore: 0 },
      select: { id: true },
    });
    const wrongKind = await request(app)
      .patch(`/api/v1/quizzes/${online.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ maxScore: 30 });
    expect(wrongKind.status).toBe(409);
    expect(wrongKind.body.error.code).toBe("wrong_quiz_kind");

    const graded = await db.quiz.create({
      data: { seasonId, sessionId, title: "Graded paper", kind: "PAPER", maxScore: 10 },
      select: { id: true },
    });
    await db.quizGrade.create({
      data: { quizId: graded.id, studentUserId: ownStudentId, score: 8, gradedAt: new Date() },
    });
    const rebase = await request(app)
      .patch(`/api/v1/quizzes/${graded.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ maxScore: 30 });
    // Moving the denominator under scores already awarded is R13's corruption
    // in its PAPER form. Refused, not silently applied.
    expect(rebase.status).toBe(409);
    expect(rebase.body.error.code).toBe("quiz_has_grades");
  });

  it("never accepts kind", async () => {
    const res = await request(app)
      .patch(`/api/v1/quizzes/${paperQuizId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ kind: "ONLINE" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/quizzes", () => {
  it("lists a season's quizzes for staff with one server-side graded count", async () => {
    const res = await request(app)
      .get(`/api/v1/quizzes?seasonId=${seasonId}`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const row = res.body.data.items.find((q: { id: number }) => q.id === paperQuizId);
    expect(row).toBeTruthy();
    // Two ACTIVE enrolments in this season; an admin sees both (R106).
    expect(row.studentCount).toBe(2);
    expect(row.gradedCount).toBe(0);
    expect(row.seasonCode).toBeTruthy();
  });

  it("narrows a leader's counts to their own group (R108/R110)", async () => {
    const res = await request(app)
      .get(`/api/v1/quizzes?seasonId=${seasonId}`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(200);
    const row = res.body.data.items.find((q: { id: number }) => q.id === paperQuizId);
    // Group A holds one student; Group B's is another leader's problem.
    expect(row.studentCount).toBe(1);
  });

  it("serves a STUDENT their own results, never the staff row shape", async () => {
    await db.quizGrade.upsert({
      where: { quizId_studentUserId: { quizId: paperQuizId, studentUserId: ownStudentId } },
      create: {
        quizId: paperQuizId, studentUserId: ownStudentId, score: 15,
        notes: "Nice work.", gradedAt: new Date(),
      },
      update: { score: 15, notes: "Nice work.", gradedAt: new Date() },
    });

    const res = await request(app)
      .get(`/api/v1/quizzes?seasonId=${seasonId}`)
      .set("authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    const row = res.body.data.items.find((q: { quizId: number }) => q.quizId === paperQuizId);
    expect(row).toMatchObject({ score: 15, notes: "Nice work.", kind: "PAPER" });
    // The staff shape's fields must not exist on a student's row at all.
    expect(row.gradedCount).toBeUndefined();
    expect(row.studentCount).toBeUndefined();
  });

  it("keeps the other group's student enrolled — the fixture every scope test rests on", async () => {
    // Group B's student is what makes the leader's studentCount of 1 meaningful
    // and what Tasks 5 and 6 use as the out-of-scope target. Asserted here so
    // the binding is real rather than an unused variable.
    const enrolment = await db.seasonEnrollment.findUnique({
      where: { studentUserId_seasonId: { studentUserId: otherGroupStudentId, seasonId } },
      select: { groupId: true },
    });
    expect(enrolment?.groupId).not.toBeNull();
  });

  it("refuses a season the caller has no staff scope in", async () => {
    const res = await request(app)
      .get(`/api/v1/quizzes?seasonId=${otherSeasonId}`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(403);
  });
});
```

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern quizzes`
Expected: FAIL — every request 404s, no router is mounted.

- [ ] **Step 2: Append the two gates to `lib/permissions.ts`**

```ts
/**
 * The authoring gate: SUPER, or an admin of the quiz's own season.
 *
 * Same rule as v1's canManageQuiz (permissions.ts:135-146). What changes is that
 * here it is the ONLY thing between a caller and a question write — there is no
 * longer a page that simply does not render the builder.
 */
export async function canManageQuiz(user: SessionUser, quizId: number): Promise<boolean> {
  if (isSuper(user)) return true;
  const quiz = await db.quiz.findUnique({ where: { id: quizId }, select: { seasonId: true } });
  if (!quiz) return false;
  return isAdminOfSeason(user, quiz.seasonId);
}

/**
 * The grading gate: anyone with a staff scope in the quiz's season — SUPER, the
 * season's admin, or a leader with a group in it.
 *
 * Expressed through staffScopeForSeason rather than a hand-written copy of v1's
 * isLeaderInSeason, deliberately: the same call that answers "may they grade"
 * also produces the student set they may grade over (lib/quiz-scope.ts), so the
 * gate and the scope cannot drift apart. v1 kept them in different files and the
 * write side never consulted the scope at all (R93).
 */
export async function canGradeQuiz(user: SessionUser, quizId: number): Promise<boolean> {
  const quiz = await db.quiz.findUnique({ where: { id: quizId }, select: { seasonId: true } });
  if (!quiz) return false;
  return (await staffScopeForSeason(user, quiz.seasonId)) !== null;
}
```

(`staffScopeForSeason`, `isAdminOfSeason`, `isSuper` and `db` are already in
scope in that file — no new imports needed.)

- [ ] **Step 3: Write `apps/backend/src/lib/quiz-scope.ts`**

```ts
import { db } from "../db/client";

import type { SessionUser } from "./auth/tokens";
import { staffScopeForSeason } from "./permissions";

/**
 * Which students this caller may grade in this season.
 *
 * THE ENDPOINT DERIVES THIS. It is never accepted from the client.
 *
 * v1's two grading reads took `studentUserIds` as a parameter and enforced
 * nothing (R105); the only scoping in the system was the array each page
 * computed for its own read, while saveQuizGradesAction iterated whatever array
 * the caller sent and upserted every id verbatim (R93). That is the same shape
 * as the confirmed attendance defect — a group-scoped read feeding an unscoped
 * write — and ruling C8 exists to end it.
 *
 * Ruling C9: membership is the per-season enrolment's groupId. GroupStudent is
 * unique on studentUserId across the entire database, so it answers "what group
 * is this student in *now*", which is the wrong question for any past season.
 *
 * Returns null when the caller has no staff scope in the season at all.
 */
export async function visibleStudentIdsForQuiz(
  user: SessionUser,
  seasonId: number,
): Promise<number[] | null> {
  const scope = await staffScopeForSeason(user, seasonId);
  if (scope === null) return null;

  const enrollments = await db.seasonEnrollment.findMany({
    where: {
      seasonId,
      status: "ACTIVE",
      ...(scope.kind === "groups" ? { groupId: { in: scope.groupIds } } : {}),
    },
    select: { studentUserId: true },
  });
  // Sorted so the grading list's cursor — which pages over these ids — is stable.
  return enrollments.map((e) => e.studentUserId).sort((a, b) => a - b);
}
```

- [ ] **Step 4: Create `apps/backend/src/routes/quizzes.ts`**

```ts
import { Router } from "express";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { parseId } from "../lib/parse-id";
import { canAccessSeason, canManageQuiz } from "../lib/permissions";
import { visibleStudentIdsForQuiz } from "../lib/quiz-scope";
import { isAdminOfSeason } from "../lib/rbac";
import { requireAuth, requireUser } from "../middleware/require-auth";
import {
  createQuizRequestSchema,
  quizListQuerySchema,
  updateQuizRequestSchema,
} from "../../../../packages/shared/src/index";

export const quizzesRouter = Router();

quizzesRouter.use(requireAuth);

/**
 * The student's own results — v1's listQuizResultsForStudent, ported.
 *
 * PAPER rows start from QuizGrade, so a paper quiz stays invisible until it is
 * graded (R36); ONLINE rows start from Quiz filtered to published, so they
 * appear as soon as they are available, attempted or not (R37). Merged by
 * session date descending, a null date sunk to the bottom (R38).
 */
async function listQuizResultsForStudent(studentUserId: number, seasonId: number) {
  const [grades, onlineQuizzes] = await Promise.all([
    db.quizGrade.findMany({
      where: { studentUserId, quiz: { seasonId, kind: "PAPER" } },
      select: {
        score: true,
        notes: true,
        gradedAt: true,
        quiz: {
          select: {
            id: true,
            title: true,
            maxScore: true,
            session: { select: { title: true, startsAt: true } },
          },
        },
      },
    }),
    db.quiz.findMany({
      where: { seasonId, kind: "ONLINE", publishedAt: { not: null } },
      select: {
        id: true,
        title: true,
        maxScore: true,
        session: { select: { title: true, startsAt: true } },
        attempts: {
          where: { studentUserId },
          orderBy: { attemptNumber: "desc" },
          take: 1,
          select: { status: true, totalScore: true, gradedAt: true },
        },
      },
    }),
  ]);

  const rows = [
    ...grades.map((g) => ({
      quizId: g.quiz.id,
      title: g.quiz.title,
      kind: "PAPER" as const,
      maxScore: g.quiz.maxScore,
      score: g.score,
      notes: g.notes,
      gradedAt: g.gradedAt,
      sessionTitle: g.quiz.session?.title ?? null,
      sessionDate: g.quiz.session?.startsAt ?? null,
      attemptStatus: null,
    })),
    ...onlineQuizzes.map((q) => {
      const attempt = q.attempts[0];
      const status = attempt?.status ?? null;
      return {
        quizId: q.id,
        title: q.title,
        kind: "ONLINE" as const,
        maxScore: q.maxScore,
        // Only a GRADED attempt has a score to show (R37).
        score: status === "GRADED" ? (attempt?.totalScore ?? null) : null,
        notes: null,
        gradedAt: attempt?.gradedAt ?? null,
        sessionTitle: q.session?.title ?? null,
        sessionDate: q.session?.startsAt ?? null,
        attemptStatus: status,
      };
    }),
  ];

  return rows.sort((a, b) => (b.sessionDate?.getTime() ?? 0) - (a.sessionDate?.getTime() ?? 0));
}

/**
 * Create a quiz.
 *
 * POST /api/v1/quizzes with seasonId in the BODY, not
 * POST /api/v1/seasons/:id/quizzes. Every quiz route lives in this one file, so
 * creation cannot hang off the seasons router — the same recorded deviation
 * Plan 3 made for POST /api/v1/sessions, for the same file-disjointness reason.
 * Do not "fix" it back to a nested path without moving the whole domain.
 */
quizzesRouter.post("/", async (req, res) => {
  const user = requireUser(req);

  const parsed = createQuizRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid quiz body.", 400);
  const body = parsed.data;

  // R1: creating is a season-admin power. isAdminOfSeason short-circuits SUPER
  // and pairs the claim with the role that can hold it (ruling C7).
  if (!isAdminOfSeason(user, body.seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const season = await db.season.findFirst({
    where: { id: body.seasonId, deletedAt: null },
    select: { id: true },
  });
  if (!season) return apiError(res, "not_found", "Season not found.", 404);

  if (body.sessionId !== null) {
    // R7: v1 wrote both ids side by side and checked nothing — the pair was
    // consistent only because one component passed both from the same page.
    const session = await db.session.findUnique({
      where: { id: body.sessionId },
      select: { seasonId: true },
    });
    if (!session) return apiError(res, "not_found", "Session not found.", 404);
    if (session.seasonId !== body.seasonId) {
      return apiError(res, "session_not_in_season", "That session is in another season.", 400);
    }
  }

  const quiz = await db.quiz.create({
    data: {
      seasonId: body.seasonId,
      sessionId: body.sessionId,
      title: body.title,
      kind: body.kind,
      // PAPER: the author's number. ONLINE: 0, then derived from question points
      // on every question write (R4, R11).
      maxScore: body.kind === "PAPER" ? (body.maxScore as number) : 0,
      createdById: user.userId,
    },
    select: { id: true },
  });

  return apiOk(res, { id: quiz.id }, 201);
});

quizzesRouter.patch("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);

  const quiz = await db.quiz.findUnique({
    where: { id },
    select: { id: true, seasonId: true, kind: true },
  });
  if (!quiz) return apiError(res, "not_found", "Quiz not found.", 404);
  if (!(await canManageQuiz(user, id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const parsed = updateQuizRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid quiz body.", 400);
  const body = parsed.data;

  if (body.maxScore !== undefined) {
    if (quiz.kind !== "PAPER") {
      return apiError(
        res,
        "wrong_quiz_kind",
        "An online quiz derives its max score from its questions.",
        409,
      );
    }
    const grades = await db.quizGrade.count({ where: { quizId: id } });
    if (grades > 0) {
      return apiError(res, "quiz_has_grades", "This quiz already has grades.", 409);
    }
  }

  if (body.sessionId !== undefined && body.sessionId !== null) {
    const session = await db.session.findUnique({
      where: { id: body.sessionId },
      select: { seasonId: true },
    });
    if (!session) return apiError(res, "not_found", "Session not found.", 404);
    if (session.seasonId !== quiz.seasonId) {
      return apiError(res, "session_not_in_season", "That session is in another season.", 400);
    }
  }

  await db.quiz.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.maxScore !== undefined ? { maxScore: body.maxScore } : {}),
      ...(body.sessionId !== undefined ? { sessionId: body.sessionId } : {}),
    },
  });

  return apiOk(res, { updated: true });
});

/**
 * The list, role-scoped.
 *
 * One route, two row shapes: staff get quizSummary, a STUDENT gets their own
 * results. The precedent is GET /seasons/:id/assignments, which already returns
 * a different row shape per role and whose client hook parses the student arm
 * specifically (Plan 1 Task 1). Collapsing v1's three list pages into one
 * endpoint is what fixes R108 (a leader with groups in two seasons saw one
 * season's quizzes measured against both seasons' students) and R109 (no season
 * picker existed at all).
 */
quizzesRouter.get("/", async (req, res) => {
  const user = requireUser(req);

  const parsed = quizListQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid query.", 400);
  const { seasonId, sessionId, cursor, limit } = parsed.data;

  const resolvedSeasonId = seasonId ?? user.activeSeasonId;
  if (resolvedSeasonId === null || resolvedSeasonId === undefined) {
    // No season to talk about is an empty list, not an error — v1's student list
    // did the same for a student with no active season (R39).
    return apiOk(res, { items: [], nextCursor: null });
  }

  if (user.role === "STUDENT") {
    if (!(await canAccessSeason(user, resolvedSeasonId))) {
      return apiError(res, "forbidden", "You don't have access to this.", 403);
    }
    return apiOk(res, {
      items: await listQuizResultsForStudent(user.userId, resolvedSeasonId),
      nextCursor: null,
    });
  }

  const studentIds = await visibleStudentIdsForQuiz(user, resolvedSeasonId);
  if (studentIds === null) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const rows = await db.quiz.findMany({
    where: {
      seasonId: resolvedSeasonId,
      ...(sessionId !== undefined ? { sessionId } : {}),
      ...(cursor !== undefined ? { id: { lt: cursor } } : {}),
    },
    orderBy: { id: "desc" },
    take: limit + 1,
    select: {
      id: true,
      title: true,
      kind: true,
      publishedAt: true,
      maxScore: true,
      sessionId: true,
      seasonId: true,
      season: { select: { code: true } },
      session: { select: { title: true, startsAt: true } },
      // _count only. v1 selected the whole `grades` relation ({ id: true } for
      // every row) purely to take .length (R98) — every grade row for the quiz,
      // fetched and discarded.
      _count: { select: { questions: true } },
    },
  });
  const page = rows.slice(0, limit);
  const quizIds = page.map((q) => q.id);

  // ONE definition of "graded", computed once, server-side (ruling C4; spec
  // D10). PAPER: a grade row with a real score. ONLINE: an attempt that reached
  // GRADED — v1's dashboards never consulted QuizAttempt at all, so every ONLINE
  // quiz read as permanently pending (R114).
  const [paperGraded, onlineGraded] = await Promise.all([
    db.quizGrade.groupBy({
      by: ["quizId"],
      where: { quizId: { in: quizIds }, studentUserId: { in: studentIds }, score: { not: null } },
      _count: { _all: true },
    }),
    db.quizAttempt.groupBy({
      by: ["quizId"],
      where: { quizId: { in: quizIds }, studentUserId: { in: studentIds }, status: "GRADED" },
      _count: { _all: true },
    }),
  ]);
  const paperBy = new Map(paperGraded.map((g) => [g.quizId, g._count._all]));
  const onlineBy = new Map(onlineGraded.map((g) => [g.quizId, g._count._all]));

  return apiOk(res, {
    items: page.map((q) => ({
      id: q.id,
      title: q.title,
      kind: q.kind,
      publishedAt: q.publishedAt,
      questionCount: q._count.questions,
      maxScore: q.maxScore,
      sessionId: q.sessionId,
      sessionTitle: q.session?.title ?? null,
      sessionDate: q.session?.startsAt ?? null,
      seasonId: q.seasonId,
      seasonCode: q.season.code,
      gradedCount: (q.kind === "PAPER" ? paperBy.get(q.id) : onlineBy.get(q.id)) ?? 0,
      studentCount: studentIds.length,
    })),
    nextCursor: rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
  });
});
```

**Verify at implementation time:** `db.quizGrade.groupBy` / `db.quizAttempt.groupBy`
with `_count: { _all: true }` is the Prisma 7 shape used elsewhere in this
backend — if the generated client wants `_count: true`, use that and read
`g._count` as a number. The counts, not the call shape, are what the tests pin.

- [ ] **Step 5: Mount it.** In `apps/backend/src/app.ts` add
`import { quizzesRouter } from "./routes/quizzes";` beside the other route
imports and `app.use("/api/v1/quizzes", quizzesRouter);` after the submissions
line. The router owns that prefix exclusively, so its router-wide
`quizzesRouter.use(requireAuth)` is allowed under ruling X5 (an unknown path
under any *other* prefix still falls through to `not_found`). CORS needs no
change: `app.ts` already lists `"PUT"` in `cors({ methods })` (added for
`PUT /submissions/by-assignment/:id`), which covers Task 4's attempt PUT.

- [ ] **Step 6: Run the suite**

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern quizzes` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/backend` → clean.

- [ ] **Step 7: OpenAPI, same commit.** Add `POST /api/v1/quizzes`,
`PATCH /api/v1/quizzes/{id}` and `GET /api/v1/quizzes` to `src/docs/openapi.ts`
in the file's hand-authored style — `ok(...)` success wrapper, `errRef` entries
for 400/403/404/409 — with a prose `description` recording (a) why creation
carries `seasonId` in the body, (b) that the list's row shape differs by role,
and (c) the single definitions of `gradedCount` and `studentCount`.

- [ ] **Step 8: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): quiz create, update, and role-scoped list with server-derived counts"
```

---

### Task 3: Backend — question authoring, reorder, publish (the D3 and D4 gates)

**Files:**
- Modify: `apps/backend/src/routes/quizzes.ts`
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: extend `apps/backend/src/__tests__/integration/quizzes-routes.test.ts`

**Interfaces:**
- Consumes: `canManageQuiz` (Task 2), `quizQuestionRequestSchema`,
  `reorderQuestionsRequestSchema`, `publishQuizRequestSchema` (Task 1).
- Produces (same file, used by Tasks 4–6 and the screens):
  - `assertStructurallyEditable(quizId): Promise<boolean>` — local helper, false once any attempt exists.
  - `recomputeMaxScore(tx, quizId): Promise<void>` — local helper, runs **inside** the caller's transaction.
  - `POST /api/v1/quizzes/:id/questions` → `{ data: QuizQuestionAuthoring }` 201
  - `PATCH /api/v1/quizzes/:id/questions/:questionId` → `{ data: QuizQuestionAuthoring }`
  - `DELETE /api/v1/quizzes/:id/questions/:questionId` → `{ data: { deleted: true } }`
  - `PUT /api/v1/quizzes/:id/questions/order` → `{ data: { questions: QuizQuestionAuthoring[] } }`
  - `POST /api/v1/quizzes/:id/publish` → `{ data: { publishedAt: string | null } }`
  - New error codes: `quiz_has_attempts`, `quiz_has_graded_attempts`, `wrong_quiz_kind`, `invalid_order`, `question_not_in_quiz`, `no_questions`, `mcq_without_answer`.

- [ ] **Step 1: Write the failing tests** (append to the same suite)

```ts
describe("question authoring", () => {
  let quizId: number;

  beforeEach(async () => {
    const quiz = await db.quiz.create({
      data: { seasonId, sessionId, title: "Authoring", kind: "ONLINE", maxScore: 0 },
      select: { id: true },
    });
    quizId = quiz.id;
  });

  it("adds a question, orders it at the end, and recomputes maxScore (R11, R20)", async () => {
    const first = await request(app)
      .post(`/api/v1/quizzes/${quizId}/questions`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ type: "MCQ", prompt: "Capital of France?", points: 2,
        options: ["London", "Paris"], correctIndex: 1 });
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ order: 0, correctIndex: 1, points: 2 });

    const second = await request(app)
      .post(`/api/v1/quizzes/${quizId}/questions`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ type: "ESSAY", prompt: "Discuss the reading.", points: 5,
        options: [], correctIndex: null });
    expect(second.status).toBe(201);
    expect(second.body.data).toMatchObject({ order: 1, options: [], correctIndex: null });

    const quiz = await db.quiz.findUnique({ where: { id: quizId }, select: { maxScore: true } });
    expect(quiz?.maxScore).toBe(7);
  });

  it("renumbers survivors on delete instead of leaving order sparse (R21)", async () => {
    const ids: number[] = [];
    for (const prompt of ["One", "Two", "Three"]) {
      const res = await request(app)
        .post(`/api/v1/quizzes/${quizId}/questions`)
        .set("authorization", `Bearer ${adminToken}`)
        .send({ type: "ESSAY", prompt, points: 1, options: [], correctIndex: null });
      ids.push(res.body.data.id);
    }

    const del = await request(app)
      .delete(`/api/v1/quizzes/${quizId}/questions/${ids[1]}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(del.status).toBe(200);

    const rows = await db.quizQuestion.findMany({
      where: { quizId }, orderBy: { order: "asc" }, select: { prompt: true, order: true },
    });
    // v1 left gaps (0, 2, ...) because nothing renumbered; harmless for display
    // but it made `order` a label rather than a position, which a reorder
    // endpoint cannot live with.
    expect(rows.map((r) => r.order)).toEqual([0, 1]);
    expect(rows.map((r) => r.prompt)).toEqual(["One", "Three"]);
    const quiz = await db.quiz.findUnique({ where: { id: quizId }, select: { maxScore: true } });
    expect(quiz?.maxScore).toBe(2);
  });

  it("reorders by an explicit permutation and refuses anything else", async () => {
    const ids: number[] = [];
    for (const prompt of ["One", "Two", "Three"]) {
      const res = await request(app)
        .post(`/api/v1/quizzes/${quizId}/questions`)
        .set("authorization", `Bearer ${adminToken}`)
        .send({ type: "ESSAY", prompt, points: 1, options: [], correctIndex: null });
      ids.push(res.body.data.id);
    }

    const ok = await request(app)
      .put(`/api/v1/quizzes/${quizId}/questions/order`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ questionIds: [ids[2], ids[0], ids[1]] });
    expect(ok.status).toBe(200);
    expect(ok.body.data.questions.map((q: { prompt: string }) => q.prompt)).toEqual([
      "Three", "One", "Two",
    ]);

    const partial = await request(app)
      .put(`/api/v1/quizzes/${quizId}/questions/order`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ questionIds: [ids[0]] });
    expect(partial.status).toBe(400);
    expect(partial.body.error.code).toBe("invalid_order");
  });

  it("refuses every structural write once an attempt exists (spec D3)", async () => {
    const q = await request(app)
      .post(`/api/v1/quizzes/${quizId}/questions`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ type: "MCQ", prompt: "Pick", points: 2, options: ["a", "b"], correctIndex: 0 });
    const questionId = q.body.data.id;

    await request(app)
      .post(`/api/v1/quizzes/${quizId}/publish`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ publish: true });
    await db.quizAttempt.create({
      data: { quizId, studentUserId: ownStudentId, attemptNumber: 1 },
    });

    const add = await request(app)
      .post(`/api/v1/quizzes/${quizId}/questions`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ type: "ESSAY", prompt: "Late addition", points: 1, options: [], correctIndex: null });
    const edit = await request(app)
      .patch(`/api/v1/quizzes/${quizId}/questions/${questionId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ type: "MCQ", prompt: "Rewritten", points: 9, options: ["a", "b"], correctIndex: 1 });
    const remove = await request(app)
      .delete(`/api/v1/quizzes/${quizId}/questions/${questionId}`)
      .set("authorization", `Bearer ${adminToken}`);
    const reorder = await request(app)
      .put(`/api/v1/quizzes/${quizId}/questions/order`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ questionIds: [questionId] });

    // Three compounding v1 rules die here: R22 (edit a live quiz freely),
    // R13 (maxScore rebased under graded attempts), R23 (deleting a question
    // cascade-deletes QuizAnswer rows on GRADED attempts while their scores
    // keep the points those answers earned). Nothing versions or snapshots a
    // quiz, so refusing is the only honest option inside the frozen schema (C1).
    for (const res of [add, edit, remove, reorder]) {
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("quiz_has_attempts");
    }
  });

  it("refuses a question on a PAPER quiz (R25)", async () => {
    const paper = await db.quiz.create({
      data: { seasonId, sessionId, title: "Paper", kind: "PAPER", maxScore: 10 },
      select: { id: true },
    });
    const res = await request(app)
      .post(`/api/v1/quizzes/${paper.id}/questions`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ type: "ESSAY", prompt: "Nope", points: 1, options: [], correctIndex: null });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("wrong_quiz_kind");
  });

  it("refuses a leader — authoring is admin-only (R15)", async () => {
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/questions`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ type: "ESSAY", prompt: "Nope", points: 1, options: [], correctIndex: null });
    expect(res.status).toBe(403);
  });

  it("refuses a question id from another quiz (R50 at the authoring edge)", async () => {
    const other = await db.quiz.create({
      data: { seasonId, sessionId, title: "Other", kind: "ONLINE", maxScore: 0 },
      select: { id: true },
    });
    const stray = await db.quizQuestion.create({
      data: { quizId: other.id, order: 0, type: "ESSAY", prompt: "Elsewhere", points: 1,
        options: [], correctIndex: null },
      select: { id: true },
    });
    const res = await request(app)
      .patch(`/api/v1/quizzes/${quizId}/questions/${stray.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ type: "ESSAY", prompt: "Hijack", points: 1, options: [], correctIndex: null });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("question_not_in_quiz");
  });
});

describe("publish / unpublish", () => {
  it("refuses to publish with no questions, or with an unanswerable MCQ (R28, R29)", async () => {
    const quiz = await db.quiz.create({
      data: { seasonId, sessionId, title: "Empty", kind: "ONLINE", maxScore: 0 },
      select: { id: true },
    });
    const empty = await request(app)
      .post(`/api/v1/quizzes/${quiz.id}/publish`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ publish: true });
    expect(empty.status).toBe(409);
    expect(empty.body.error.code).toBe("no_questions");

    // Written straight to the database: an MCQ whose correctIndex points past
    // the end of its options. R18 stops this at the question write, but R24's
    // positional key means an option edit can produce it later, which is
    // exactly why v1 re-checked at publish.
    await db.quizQuestion.create({
      data: { quizId: quiz.id, order: 0, type: "MCQ", prompt: "Broken", points: 1,
        options: ["a", "b"], correctIndex: 5 },
    });
    const bad = await request(app)
      .post(`/api/v1/quizzes/${quiz.id}/publish`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ publish: true });
    expect(bad.status).toBe(409);
    expect(bad.body.error.code).toBe("mcq_without_answer");
  });

  it("publishes and unpublishes a clean quiz", async () => {
    const quiz = await db.quiz.create({
      data: { seasonId, sessionId, title: "Publishable", kind: "ONLINE", maxScore: 0 },
      select: { id: true },
    });
    await db.quizQuestion.create({
      data: { quizId: quiz.id, order: 0, type: "MCQ", prompt: "Pick", points: 1,
        options: ["a", "b"], correctIndex: 0 },
    });

    const on = await request(app)
      .post(`/api/v1/quizzes/${quiz.id}/publish`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ publish: true });
    expect(on.status).toBe(200);
    expect(on.body.data.publishedAt).not.toBeNull();

    const off = await request(app)
      .post(`/api/v1/quizzes/${quiz.id}/publish`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ publish: false });
    expect(off.status).toBe(200);
    expect(off.body.data.publishedAt).toBeNull();
  });

  it("refuses to unpublish once an attempt has been graded (spec D4)", async () => {
    const quiz = await db.quiz.create({
      data: { seasonId, sessionId, title: "Live", kind: "ONLINE", maxScore: 1,
        publishedAt: new Date() },
      select: { id: true },
    });
    await db.quizQuestion.create({
      data: { quizId: quiz.id, order: 0, type: "MCQ", prompt: "Pick", points: 1,
        options: ["a", "b"], correctIndex: 0 },
    });
    await db.quizAttempt.create({
      data: { quizId: quiz.id, studentUserId: ownStudentId, attemptNumber: 1,
        status: "GRADED", autoScore: 1, manualScore: 0, totalScore: 1,
        submittedAt: new Date(), gradedAt: new Date() },
    });

    const res = await request(app)
      .post(`/api/v1/quizzes/${quiz.id}/publish`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ publish: false });
    // v1's unpublish ran no validation at all (R30) and both student reads
    // filter on publishedAt (R32, R37), so a graded student lost their own
    // result with no trace — and the notification they had already received
    // linked to a list the quiz was no longer in (R40, R118).
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("quiz_has_graded_attempts");
  });

  it("refuses publishing a PAPER quiz", async () => {
    const paper = await db.quiz.create({
      data: { seasonId, sessionId, title: "Paper", kind: "PAPER", maxScore: 10 },
      select: { id: true },
    });
    const res = await request(app)
      .post(`/api/v1/quizzes/${paper.id}/publish`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ publish: true });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("wrong_quiz_kind");
  });
});
```

Run the suite → the new cases FAIL (404s).

- [ ] **Step 2: Add the two helpers** to `routes/quizzes.ts`, above the routes:

```ts
import type { Prisma } from "../generated/prisma/client";

/**
 * Recompute an ONLINE quiz's maxScore as the sum of its question points (R11).
 *
 * Takes the transaction client, because in v1 this ran as a separate update
 * *after* the question write with nothing tying the two together (R14) — a
 * failure between them left maxScore stale, silently changing the denominator
 * of every score the quiz had produced.
 */
async function recomputeMaxScore(tx: Prisma.TransactionClient, quizId: number): Promise<void> {
  const agg = await tx.quizQuestion.aggregate({ where: { quizId }, _sum: { points: true } });
  await tx.quiz.update({ where: { id: quizId }, data: { maxScore: agg._sum.points ?? 0 } });
}

/**
 * Spec D3: a quiz with attempts is structurally frozen.
 *
 * v1 allowed questions to be added, edited and deleted on a published quiz with
 * graded attempts (R22), rebasing maxScore retroactively (R13) and
 * cascade-deleting QuizAnswer rows out of GRADED attempts whose scores kept the
 * points those answers earned (R23, schema.prisma:739). Nothing records what a
 * quiz looked like when it was taken; answer snapshots would be a schema change
 * and are therefore blocked (C1). So the cheap correct version is: freeze.
 */
async function hasAttempts(quizId: number): Promise<boolean> {
  return (await db.quizAttempt.count({ where: { quizId } })) > 0;
}

/**
 * The shared preamble for all five authoring writes: exists, is ONLINE, caller
 * may manage it, and (unless `allowWithAttempts`) has no attempts yet.
 * Returns null once it has already answered the response.
 */
async function loadAuthorableQuiz(
  req: Parameters<typeof requireUser>[0],
  res: Parameters<typeof apiOk>[0],
  quizId: number,
  opts: { allowWithAttempts?: boolean } = {},
): Promise<{ id: number; kind: "PAPER" | "ONLINE" } | null> {
  const user = requireUser(req);
  const quiz = await db.quiz.findUnique({ where: { id: quizId }, select: { id: true, kind: true } });
  if (!quiz) {
    apiError(res, "not_found", "Quiz not found.", 404);
    return null;
  }
  if (!(await canManageQuiz(user, quizId))) {
    apiError(res, "forbidden", "You don't have access to this.", 403);
    return null;
  }
  if (quiz.kind !== "ONLINE") {
    // R25: nothing in v1 scoped question writes to ONLINE quizzes, so questions
    // could be attached to a PAPER quiz where they were invisible everywhere
    // except one count.
    apiError(res, "wrong_quiz_kind", "This is a paper quiz — it has no questions.", 409);
    return null;
  }
  if (!opts.allowWithAttempts && (await hasAttempts(quizId))) {
    apiError(
      res,
      "quiz_has_attempts",
      "Students have started this quiz, so its questions can no longer change.",
      409,
    );
    return null;
  }
  return quiz;
}
```

**Verify at implementation time:** `Prisma.TransactionClient` is exported from
`../generated/prisma/client` in this codebase (`routes/submissions.ts` already
imports `type { Prisma }` from there). If the generated namespace names it
differently, take the type from `Parameters<Parameters<typeof db.$transaction>[0]>[0]`
rather than widening to `any`.

- [ ] **Step 3: The four question routes**

```ts
quizzesRouter.post("/:id/questions", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);
  const quiz = await loadAuthorableQuiz(req, res, id);
  if (!quiz) return undefined;

  const parsed = quizQuestionRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid question.", 400);

  const created = await db.$transaction(async (tx) => {
    // R20: order is the current count. It stays that way, but a real reorder
    // endpoint exists now, and delete renumbers, so `order` is a position.
    const count = await tx.quizQuestion.count({ where: { quizId: id } });
    const question = await tx.quizQuestion.create({
      data: { quizId: id, order: count, ...parsed.data },
      select: {
        id: true, order: true, type: true, prompt: true, points: true,
        options: true, correctIndex: true,
      },
    });
    await recomputeMaxScore(tx, id);
    return question;
  });

  return apiOk(res, created, 201);
});

quizzesRouter.patch("/:id/questions/:questionId", async (req, res) => {
  const id = parseId(req.params.id);
  const questionId = parseId(req.params.questionId);
  if (id === null || questionId === null) {
    return apiError(res, "bad_request", "Invalid id.", 400);
  }
  const quiz = await loadAuthorableQuiz(req, res, id);
  if (!quiz) return undefined;

  const existing = await db.quizQuestion.findUnique({
    where: { id: questionId },
    select: { quizId: true },
  });
  // Addressed through its quiz, so a bare question id can never reach another
  // quiz's row — v1 took questionId alone and derived the gate from it.
  if (!existing || existing.quizId !== id) {
    return apiError(res, "question_not_in_quiz", "Question not found.", 404);
  }

  const parsed = quizQuestionRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid question.", 400);

  const updated = await db.$transaction(async (tx) => {
    // `order` is deliberately not writable here — reordering has its own
    // endpoint, so a question edit cannot silently move a question.
    const question = await tx.quizQuestion.update({
      where: { id: questionId },
      data: parsed.data,
      select: {
        id: true, order: true, type: true, prompt: true, points: true,
        options: true, correctIndex: true,
      },
    });
    await recomputeMaxScore(tx, id);
    return question;
  });

  return apiOk(res, updated);
});

quizzesRouter.delete("/:id/questions/:questionId", async (req, res) => {
  const id = parseId(req.params.id);
  const questionId = parseId(req.params.questionId);
  if (id === null || questionId === null) {
    return apiError(res, "bad_request", "Invalid id.", 400);
  }
  const quiz = await loadAuthorableQuiz(req, res, id);
  if (!quiz) return undefined;

  const existing = await db.quizQuestion.findUnique({
    where: { id: questionId },
    select: { quizId: true },
  });
  if (!existing || existing.quizId !== id) {
    return apiError(res, "question_not_in_quiz", "Question not found.", 404);
  }

  await db.$transaction(async (tx) => {
    await tx.quizQuestion.delete({ where: { id: questionId } });
    // R21: v1 left `order` sparse. Renumbering keeps it a position, which is
    // what the reorder endpoint and the runner's numbering both assume.
    const survivors = await tx.quizQuestion.findMany({
      where: { quizId: id },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    for (const [index, row] of survivors.entries()) {
      await tx.quizQuestion.update({ where: { id: row.id }, data: { order: index } });
    }
    await recomputeMaxScore(tx, id);
  });

  return apiOk(res, { deleted: true });
});

/**
 * Reorder. New in v2 — v1 had no reorder action, no drag handle, and no `order`
 * on its update path (R20), so the only way to move a question was to delete
 * and re-add it, which under D3's freeze would now be impossible.
 */
quizzesRouter.put("/:id/questions/order", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);
  const quiz = await loadAuthorableQuiz(req, res, id);
  if (!quiz) return undefined;

  const parsed = reorderQuestionsRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid order body.", 400);
  const { questionIds } = parsed.data;

  const current = await db.quizQuestion.findMany({ where: { quizId: id }, select: { id: true } });
  const currentIds = new Set(current.map((q) => q.id));
  const sent = new Set(questionIds);
  // Exact permutation or nothing: a partial list would leave the omitted
  // questions holding stale positions and silently reshuffle the paper.
  const isPermutation =
    sent.size === questionIds.length &&
    sent.size === currentIds.size &&
    questionIds.every((qid) => currentIds.has(qid));
  if (!isPermutation) {
    return apiError(res, "invalid_order", "Send every question id exactly once.", 400);
  }

  const questions = await db.$transaction(async (tx) => {
    for (const [index, questionId] of questionIds.entries()) {
      await tx.quizQuestion.update({ where: { id: questionId }, data: { order: index } });
    }
    return tx.quizQuestion.findMany({
      where: { quizId: id },
      orderBy: { order: "asc" },
      select: {
        id: true, order: true, type: true, prompt: true, points: true,
        options: true, correctIndex: true,
      },
    });
  });

  return apiOk(res, { questions });
});
```

**Note on the transaction loops:** `order` has no unique constraint
(`@@index([quizId, order])` only), so writing positions one at a time inside a
transaction cannot collide — no two-phase shuffle is needed.

- [ ] **Step 4: Publish / unpublish**

```ts
quizzesRouter.post("/:id/publish", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);
  // Publishing IS allowed with attempts — republishing a live quiz changes
  // nothing structural (R31 only moves the timestamp, which is read as a
  // boolean everywhere). Unpublishing is the guarded direction, below.
  const quiz = await loadAuthorableQuiz(req, res, id, { allowWithAttempts: true });
  if (!quiz) return undefined;

  const parsed = publishQuizRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid publish body.", 400);

  if (parsed.data.publish) {
    const questions = await db.quizQuestion.findMany({
      where: { quizId: id },
      select: { type: true, correctIndex: true, options: true },
    });
    if (questions.length === 0) {
      return apiError(res, "no_questions", "Add at least one question before publishing.", 409);
    }
    // Re-checked here because R18's guarantee at write time can be broken later
    // by an option edit — correctIndex is a position into `options`, not a
    // reference to one (R24).
    const badMcq = questions.some(
      (q) => q.type === "MCQ" && (q.correctIndex === null || q.correctIndex >= q.options.length),
    );
    if (badMcq) {
      return apiError(
        res, "mcq_without_answer", "Every multiple-choice question needs a correct answer.", 409,
      );
    }
  } else {
    // Spec D4. v1 wrote publishedAt: null unconditionally and both student
    // reads filter on it, so a student who had submitted and been graded lost
    // the quiz from their list AND got a 404 on the detail route, with the
    // notification they had already received pointing at the empty list.
    const graded = await db.quizAttempt.count({ where: { quizId: id, status: "GRADED" } });
    if (graded > 0) {
      return apiError(
        res,
        "quiz_has_graded_attempts",
        "Students have graded results for this quiz; unpublishing would hide them.",
        409,
      );
    }
  }

  const updated = await db.quiz.update({
    where: { id },
    data: { publishedAt: parsed.data.publish ? new Date() : null },
    select: { publishedAt: true },
  });

  return apiOk(res, { publishedAt: updated.publishedAt });
});
```

Add `publishQuizRequestSchema`, `quizQuestionRequestSchema` and
`reorderQuestionsRequestSchema` to the shared import block at the top of the
file.

- [ ] **Step 5: Run the suite**

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern quizzes` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/backend` → clean.

- [ ] **Step 6: OpenAPI, same commit** — the five paths, with the D3 freeze and
the D4 unpublish guard spelled out in prose and every new error code listed.

- [ ] **Step 7: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): quiz question authoring, reorder, and guarded publish"
```

---

### Task 4: Backend — quiz detail by role, and the student attempt lifecycle

**This task carries the mandatory answer-key integration test.** It is the one
assertion the whole plan exists to make true.

**Files:**
- Modify: `apps/backend/src/routes/quizzes.ts`
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: extend `apps/backend/src/__tests__/integration/quizzes-routes.test.ts`

**Interfaces:**
- Consumes: `canManageQuiz`, `canGradeQuiz` (Task 2), `canAccessSeason`,
  `createNotificationsBulk` from `lib/notifications`,
  `saveQuizAnswersRequestSchema` (Task 1).
- Produces:
  - `loadStudentQuizDetail(quizId, studentUserId): Promise<StudentQuizDetailRow | null>` — **the select without `correctIndex`**, each question built by the typed `toStudentQuestion` mapper; `StudentQuizDetailRow` is the shared `StudentQuizDetail` with its two timestamps as `Date`. Task 9's screen consumes its shape.
  - `loadQuizAuthoringDetail(quizId, canManage: boolean)` — the select **with** `correctIndex`.
  - `GET /api/v1/quizzes/:id` → staff `{ data: QuizAuthoringDetail }`, student `{ data: StudentQuizDetail }`.
  - `PUT /api/v1/quizzes/:id/attempt` → `{ data: StudentQuizDetail }` (create-or-resume, idempotent).
  - `PATCH /api/v1/quizzes/:id/attempt` → `{ data: { saved: number } }`.
  - `POST /api/v1/quizzes/:id/attempt/submit` → `{ data: StudentQuizDetail }`.
  - New error codes: `quiz_not_published`, `attempt_closed`, `attempt_incomplete`, `no_attempt`, `answer_out_of_range`, `wrong_answer_type`.

- [ ] **Step 1: Write the failing tests**

```ts
/**
 * QUIZ_GRADED rows for the suite's student. v1's link for this type is the
 * bare list path `/student/quizzes` (ruling X1), so a row cannot be tied to
 * one quiz by its link — and every quiz in this file grades the same
 * `ownStudentId`, while notifications are only cleaned in beforeAll/afterAll.
 * So every notification assertion in Tasks 4–6 is a DELTA from a baseline
 * taken inside the same test, never an absolute count. The suite runs
 * --runInBand and `ownStudentId` belongs to this file alone, so nothing else
 * writes these rows mid-test. (Tasks 5 and 6 append below and reuse this.)
 */
async function quizGradedCount(): Promise<number> {
  return db.notification.count({
    where: { userId: ownStudentId, type: "QUIZ_GRADED", link: "/student/quizzes" },
  });
}

describe("GET /api/v1/quizzes/:id and the attempt lifecycle", () => {
  let onlineQuizId: number;
  let mcqId: number;
  let essayId: number;

  async function buildPublishedQuiz(opts: { withEssay: boolean }) {
    const quiz = await db.quiz.create({
      data: { seasonId, sessionId, title: "Runner quiz", kind: "ONLINE", maxScore: 0 },
      select: { id: true },
    });
    const mcq = await db.quizQuestion.create({
      data: {
        quizId: quiz.id, order: 0, type: "MCQ",
        prompt: "Capital of France?", points: 2,
        options: ["London", "Paris"], correctIndex: 1,
      },
      select: { id: true },
    });
    let essay = { id: 0 };
    if (opts.withEssay) {
      essay = await db.quizQuestion.create({
        data: {
          quizId: quiz.id, order: 1, type: "ESSAY",
          prompt: "Discuss the reading.", points: 5, options: [], correctIndex: null,
        },
        select: { id: true },
      });
    }
    await db.quiz.update({
      where: { id: quiz.id },
      data: { maxScore: opts.withEssay ? 7 : 2, publishedAt: new Date() },
    });
    return { quizId: quiz.id, mcqId: mcq.id, essayId: essay.id };
  }

  beforeEach(async () => {
    const built = await buildPublishedQuiz({ withEssay: true });
    onlineQuizId = built.quizId;
    mcqId = built.mcqId;
    essayId = built.essayId;
  });

  // ---------------------------------------------------------------------
  // THE ANSWER-KEY TEST (spec D2). Do not weaken this to a field check on a
  // parsed object: the assertion is against the RAW serialised response,
  // because that is what actually travels to a phone.
  // ---------------------------------------------------------------------
  it("never lets the answer key reach a student, at the raw-JSON level", async () => {
    const res = await request(app)
      .get(`/api/v1/quizzes/${onlineQuizId}`)
      .set("authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("correctIndex");
    // The value as well as the key: correctIndex is 1 here, and "Paris" is the
    // option it points at. The option list itself is legitimately present, so
    // the assertion is on the marker, not on the word.
    expect(res.body.data.questions[0]).not.toHaveProperty("correctIndex");
    expect(Object.keys(res.body.data.questions[0]).sort()).toEqual(
      ["id", "isCorrect", "options", "order", "pointsAwarded", "points", "prompt",
        "selectedIndex", "text", "type"].sort(),
    );

    // ...and the same guarantee on the two other student-facing responses.
    const started = await request(app)
      .put(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(JSON.stringify(started.body)).not.toContain("correctIndex");

    const list = await request(app)
      .get(`/api/v1/quizzes?seasonId=${seasonId}`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(JSON.stringify(list.body)).not.toContain("correctIndex");
  });

  it("serves staff the authoring shape from the same path", async () => {
    const res = await request(app)
      .get(`/api/v1/quizzes/${onlineQuizId}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.questions[0].correctIndex).toBe(1);
    expect(res.body.data.canEditStructure).toBe(true);
    expect(res.body.data.canManage).toBe(true);
  });

  it("gives a leader the authoring shape but no manage rights", async () => {
    const res = await request(app)
      .get(`/api/v1/quizzes/${onlineQuizId}`)
      .set("authorization", `Bearer ${leaderToken}`);
    // A leader grades, and grading needs the key (R103) — same audience v1's
    // essay grader served it to.
    expect(res.status).toBe(200);
    expect(res.body.data.questions[0].correctIndex).toBe(1);
    expect(res.body.data.canManage).toBe(false);
  });

  it("404s an unpublished quiz for a student and 200s it for staff (R32)", async () => {
    const draft = await db.quiz.create({
      data: { seasonId, sessionId, title: "Draft", kind: "ONLINE", maxScore: 0 },
      select: { id: true },
    });
    const asStudent = await request(app)
      .get(`/api/v1/quizzes/${draft.id}`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(asStudent.status).toBe(404);

    const asAdmin = await request(app)
      .get(`/api/v1/quizzes/${draft.id}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(asAdmin.status).toBe(200);
  });

  it("creates an attempt lazily and returns the same one on a repeat call (R44, D15)", async () => {
    const first = await request(app)
      .put(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe("IN_PROGRESS");
    expect(first.body.data.attemptNumber).toBe(1);

    const second = await request(app)
      .put(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`);
    // Idempotent: a screen that mounts twice, or React Query refetching on
    // focus, must not produce a second attempt (ruling C6).
    expect(second.body.data.attemptId).toBe(first.body.data.attemptId);

    const rows = await db.quizAttempt.count({
      where: { quizId: onlineQuizId, studentUserId: ownStudentId },
    });
    expect(rows).toBe(1);
  });

  it("does not write an attempt on a GET (ruling C6)", async () => {
    await request(app)
      .get(`/api/v1/quizzes/${onlineQuizId}`)
      .set("authorization", `Bearer ${studentToken}`);
    const rows = await db.quizAttempt.count({ where: { quizId: onlineQuizId } });
    expect(rows).toBe(0);
  });

  it("saves a batch of answers and refuses a closed attempt", async () => {
    await request(app)
      .put(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`);

    const save = await request(app)
      .patch(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({
        answers: [
          { questionId: mcqId, selectedIndex: 1, text: null },
          { questionId: essayId, selectedIndex: null, text: "Because." },
        ],
      });
    expect(save.status).toBe(200);
    expect(save.body.data.saved).toBe(2);

    // Saving twice is an upsert on (attemptId, questionId) — one row per
    // question per attempt (R53), and no grading happens on save (R54).
    const again = await request(app)
      .patch(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ answers: [{ questionId: mcqId, selectedIndex: 0, text: null }] });
    expect(again.status).toBe(200);
    const answers = await db.quizAnswer.findMany({
      where: { question: { quizId: onlineQuizId } },
      select: { questionId: true, selectedIndex: true, isCorrect: true, pointsAwarded: true },
    });
    expect(answers).toHaveLength(2);
    expect(answers.every((a) => a.isCorrect === null && a.pointsAwarded === null)).toBe(true);
  });

  it("bounds selectedIndex against THIS question's options, not a constant (R51)", async () => {
    await request(app)
      .put(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`);
    const res = await request(app)
      .patch(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      // The MCQ has 2 options. v1's schema allowed 0-5 and checked nothing, so
      // an out-of-range index stored fine and simply scored 0 later.
      .send({ answers: [{ questionId: mcqId, selectedIndex: 4, text: null }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("answer_out_of_range");
  });

  it("refuses a value of the wrong shape for the question type (R52)", async () => {
    await request(app)
      .put(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`);
    const res = await request(app)
      .patch(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ answers: [{ questionId: essayId, selectedIndex: 1, text: null }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("wrong_answer_type");
  });

  it("refuses a question from another quiz (R50)", async () => {
    await request(app)
      .put(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`);
    const other = await buildPublishedQuiz({ withEssay: false });
    const res = await request(app)
      .patch(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ answers: [{ questionId: other.mcqId, selectedIndex: 0, text: null }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("question_not_in_quiz");
  });

  it("refuses a submit with any question unanswered (R59)", async () => {
    await request(app)
      .put(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`);
    await request(app)
      .patch(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ answers: [{ questionId: mcqId, selectedIndex: 1, text: null }] });

    const res = await request(app)
      .post(`/api/v1/quizzes/${onlineQuizId}/attempt/submit`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("attempt_incomplete");
  });

  it("submits a mixed quiz to SUBMITTED with autoScore only (R63)", async () => {
    const before = await quizGradedCount();
    await request(app)
      .put(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`);
    await request(app)
      .patch(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({
        answers: [
          { questionId: mcqId, selectedIndex: 1, text: null },
          { questionId: essayId, selectedIndex: null, text: "Because." },
        ],
      });

    const res = await request(app)
      .post(`/api/v1/quizzes/${onlineQuizId}/attempt/submit`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("SUBMITTED");
    // The student sees no score yet — an essay is waiting for a human.
    expect(res.body.data.totalScore).toBeNull();

    const attempt = await db.quizAttempt.findFirst({
      where: { quizId: onlineQuizId, studentUserId: ownStudentId },
      select: { autoScore: true, manualScore: true, totalScore: true, submittedAt: true },
    });
    expect(attempt).toMatchObject({ autoScore: 2, manualScore: null, totalScore: null });
    expect(attempt?.submittedAt).not.toBeNull();

    // R65: the essay path notifies nobody — there is nothing graded to tell them about.
    expect((await quizGradedCount()) - before).toBe(0);
  });

  it("auto-grades an all-MCQ quiz, all-or-nothing, and notifies once (R60, R64, R65)", async () => {
    const built = await buildPublishedQuiz({ withEssay: false });
    const before = await quizGradedCount();
    await request(app)
      .put(`/api/v1/quizzes/${built.quizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`);
    await request(app)
      .patch(`/api/v1/quizzes/${built.quizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ answers: [{ questionId: built.mcqId, selectedIndex: 0, text: null }] });

    const res = await request(app)
      .post(`/api/v1/quizzes/${built.quizId}/attempt/submit`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("GRADED");
    // Wrong answer: full points or nothing — no partial credit anywhere (R60).
    expect(res.body.data.totalScore).toBe(0);
    expect(res.body.data.questions[0].isCorrect).toBe(false);
    // R34: the student learns WHICH question was wrong, never what was right.
    expect(JSON.stringify(res.body)).not.toContain("correctIndex");

    const attempt = await db.quizAttempt.findFirst({
      where: { quizId: built.quizId, studentUserId: ownStudentId },
      select: { manualScore: true, gradedAt: true, gradedById: true },
    });
    // R64: gradedById stays null on the auto path — nobody graded it.
    expect(attempt).toMatchObject({ manualScore: 0, gradedById: null });
    expect(attempt?.gradedAt).not.toBeNull();

    // Exactly one new row, carrying v1's link (ruling X1 — v1's three sites all
    // write the bare list path; the row is still rendered by v1 today).
    expect((await quizGradedCount()) - before).toBe(1);
  });

  it("refuses a second submit and a save after submit (R49, R58)", async () => {
    const built = await buildPublishedQuiz({ withEssay: false });
    await request(app)
      .put(`/api/v1/quizzes/${built.quizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`);
    await request(app)
      .patch(`/api/v1/quizzes/${built.quizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ answers: [{ questionId: built.mcqId, selectedIndex: 1, text: null }] });
    await request(app)
      .post(`/api/v1/quizzes/${built.quizId}/attempt/submit`)
      .set("authorization", `Bearer ${studentToken}`);

    const resubmit = await request(app)
      .post(`/api/v1/quizzes/${built.quizId}/attempt/submit`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(resubmit.status).toBe(409);
    expect(resubmit.body.error.code).toBe("attempt_closed");

    const lateSave = await request(app)
      .patch(`/api/v1/quizzes/${built.quizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ answers: [{ questionId: built.mcqId, selectedIndex: 0, text: null }] });
    expect(lateSave.status).toBe(409);
    expect(lateSave.body.error.code).toBe("attempt_closed");

    const restart = await request(app)
      .put(`/api/v1/quizzes/${built.quizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`);
    // R45: one attempt per student unless staff reopen it.
    expect(restart.status).toBe(409);
    expect(restart.body.error.code).toBe("attempt_closed");
  });

  it("refuses an attempt from staff and from a student outside the season", async () => {
    const staff = await request(app)
      .put(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(staff.status).toBe(403);

    const outsider = await createTestUser("outsider", "STUDENT");
    const outsiderToken = await login(app, outsider.email);
    const res = await request(app)
      .put(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(403);
  });
});
```

**Note for the implementer:** these cases create attempts for `ownStudentId`
repeatedly across `beforeEach`-built quizzes; each quiz is new, so the
`@@unique([quizId, studentUserId, attemptNumber])` constraint is never in
contention between cases. Do not share one quiz across the lifecycle cases.

Run the suite → the new cases FAIL.

- [ ] **Step 2: The two loaders — separate functions, separate selects**

Add to `routes/quizzes.ts`:

```ts
/**
 * The student projection.
 *
 * NEVER SELECTS correctIndex. v1's equivalent had exactly this property and
 * said so in a comment (quiz-query.ts:373-374) — but it lived in the same file
 * as the two reads that DO return the key, so the protection was one "let's
 * reuse this query" refactor away from evaporating.
 *
 * What protects it here, stated exactly (no stronger claim):
 * 1. The raw-JSON integration test above — the guarantee. It fails on any
 *    path by which the key reaches the response.
 * 2. `toStudentQuestion` below returns an object LITERAL typed as the shared
 *    `QuizQuestionStudent`, so TypeScript's excess-property check rejects a
 *    `correctIndex: q.correctIndex` line added to it. It does NOT catch a
 *    spread (`...q`) or a select widened and passed through some other way —
 *    structural typing allows extra keys on non-literals — which is why (1)
 *    exists and is the one that must never be weakened.
 * The loader's return type is `StudentQuizDetailRow`: the shared wire type
 * with its two timestamps as `Date` (the backend hands Dates to res.json()).
 */
type StudentQuizDetailRow = Omit<StudentQuizDetail, "submittedAt" | "gradedAt"> & {
  submittedAt: Date | null;
  gradedAt: Date | null;
};

interface StudentQuestionSource {
  id: number;
  order: number;
  type: "MCQ" | "ESSAY";
  prompt: string;
  points: number;
  options: string[];
}
interface StudentAnswerSource {
  selectedIndex: number | null;
  text: string | null;
  isCorrect: boolean | null;
  pointsAwarded: number | null;
}

function toStudentQuestion(
  q: StudentQuestionSource,
  a: StudentAnswerSource | undefined,
): QuizQuestionStudent {
  return {
    id: q.id,
    order: q.order,
    type: q.type,
    prompt: q.prompt,
    points: q.points,
    options: q.options,
    selectedIndex: a?.selectedIndex ?? null,
    text: a?.text ?? null,
    // Null until submit (R52/R54), so nothing leaks mid-attempt.
    isCorrect: a?.isCorrect ?? null,
    pointsAwarded: a?.pointsAwarded ?? null,
  };
}

async function loadStudentQuizDetail(
  quizId: number,
  studentUserId: number,
): Promise<StudentQuizDetailRow | null> {
  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: {
      id: true,
      title: true,
      kind: true,
      seasonId: true,
      maxScore: true,
      publishedAt: true,
      session: { select: { title: true } },
      questions: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          type: true,
          prompt: true,
          points: true,
          options: true,
          // correctIndex is absent on purpose. Do not add it "for the review
          // screen" — the student's own isCorrect/pointsAwarded is the review.
        },
      },
    },
  });
  // R32: a non-ONLINE or unpublished quiz simply does not exist for a student.
  if (!quiz || quiz.kind !== "ONLINE" || quiz.publishedAt === null) return null;

  const attempt = await db.quizAttempt.findFirst({
    where: { quizId, studentUserId },
    orderBy: { attemptNumber: "desc" },
    select: {
      id: true,
      attemptNumber: true,
      status: true,
      totalScore: true,
      submittedAt: true,
      gradedAt: true,
      answers: {
        select: {
          questionId: true,
          selectedIndex: true,
          text: true,
          isCorrect: true,
          pointsAwarded: true,
        },
      },
    },
  });
  const answerByQuestion = new Map((attempt?.answers ?? []).map((a) => [a.questionId, a]));

  return {
    id: quiz.id,
    title: quiz.title,
    kind: quiz.kind,
    seasonId: quiz.seasonId,
    maxScore: quiz.maxScore,
    sessionTitle: quiz.session?.title ?? null,
    attemptId: attempt?.id ?? null,
    attemptNumber: attempt?.attemptNumber ?? 0,
    status: attempt?.status ?? null,
    // autoScore/manualScore deliberately absent: v1 sent both and rendered
    // neither. totalScore is the only score a student is shown.
    totalScore: attempt?.totalScore ?? null,
    submittedAt: attempt?.submittedAt ?? null,
    gradedAt: attempt?.gradedAt ?? null,
    questions: quiz.questions.map((q) => toStudentQuestion(q, answerByQuestion.get(q.id))),
  };
}

/** The authoring/grading projection — the answer key, for the audience that needs it. */
async function loadQuizAuthoringDetail(quizId: number, canManage: boolean) {
  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: {
      id: true,
      title: true,
      kind: true,
      seasonId: true,
      sessionId: true,
      publishedAt: true,
      maxScore: true,
      season: { select: { code: true } },
      session: { select: { title: true } },
      _count: { select: { attempts: true, grades: true } },
      questions: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          type: true,
          prompt: true,
          points: true,
          options: true,
          correctIndex: true,
        },
      },
    },
  });
  if (!quiz) return null;

  return {
    id: quiz.id,
    title: quiz.title,
    kind: quiz.kind,
    seasonId: quiz.seasonId,
    seasonCode: quiz.season.code,
    sessionId: quiz.sessionId,
    sessionTitle: quiz.session?.title ?? null,
    publishedAt: quiz.publishedAt,
    maxScore: quiz.maxScore,
    attemptCount: quiz._count.attempts,
    gradeCount: quiz._count.grades,
    // Derived once, server-side (C4): the same condition the write path
    // enforces, so the screen never has to guess whether the builder is live.
    canEditStructure: canManage && quiz.kind === "ONLINE" && quiz._count.attempts === 0,
    canManage,
    questions: quiz.questions,
  };
}
```

Add `import type { QuizQuestionStudent, StudentQuizDetail } from "@space/shared";`
to `routes/quizzes.ts` — **type-only**, so it is erased at emit and the
`rootDir` trap (CLAUDE.md, ruling X12) does not apply; every *value* import
from shared stays on the relative path. Prisma's `QuizQuestionType` enum value
is the string union `"MCQ" | "ESSAY"`, so `quiz.questions` passes to
`toStudentQuestion` without a cast.

- [ ] **Step 3: `GET /:id` — role dispatch to those two loaders**

```ts
/**
 * One path, two projections, chosen by role on the server.
 *
 * Spec §7 recommends two separate handlers so the authoring select is
 * unreachable from a student token by construction. This is that, one level in:
 * the dispatch is the first thing the handler does, the two loaders are separate
 * functions with separate Prisma selects and separate response types, and
 * neither can be reached with the other's audience. A single handler that
 * built one object and deleted fields for students is what must never exist.
 */
quizzesRouter.get("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);

  const quiz = await db.quiz.findUnique({ where: { id }, select: { seasonId: true } });
  if (!quiz) return apiError(res, "not_found", "Quiz not found.", 404);

  if (user.role === "STUDENT") {
    if (!(await canAccessSeason(user, quiz.seasonId))) {
      // R35's ordering, kept deliberately: a student outside the season and a
      // quiz that does not exist are indistinguishable from the response.
      return apiError(res, "not_found", "Quiz not found.", 404);
    }
    const detail = await loadStudentQuizDetail(id, user.userId);
    if (!detail) return apiError(res, "not_found", "Quiz not found.", 404);
    return apiOk(res, detail);
  }

  // Staff: grading needs the answer key (R103), and canGradeQuiz is the
  // audience that grades. canManage narrows further, to authoring.
  if (!(await canGradeQuiz(user, id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }
  const detail = await loadQuizAuthoringDetail(id, await canManageQuiz(user, id));
  if (!detail) return apiError(res, "not_found", "Quiz not found.", 404);
  return apiOk(res, detail);
});
```

- [ ] **Step 4: `PUT /:id/attempt` — lazy create-or-resume**

```ts
/**
 * Start or resume this student's attempt.
 *
 * PUT, and idempotent, for the reason ruling C6 gives and Plan 1's
 * PUT /submissions/by-assignment/:id already demonstrates: a screen that
 * remounts, or React Query refetching on focus, must not produce a second row.
 * The attempt is addressed by QUIZ, never by attempt id — there is at most one
 * live attempt per (quiz, student) and the server can always find it, which
 * removes both the client's attemptId bookkeeping and the need for ownership to
 * be the only gate (v1's saveQuizAnswerAction had no role check at all and
 * compared user ids; here the id comes from the token and is never in the URL).
 */
quizzesRouter.put("/:id/attempt", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);

  // R41: only a student has an attempt of their own.
  if (user.role !== "STUDENT") {
    return apiError(res, "forbidden", "Only a student can take a quiz.", 403);
  }

  const quiz = await db.quiz.findUnique({
    where: { id },
    select: { seasonId: true, kind: true, publishedAt: true },
  });
  if (!quiz) return apiError(res, "not_found", "Quiz not found.", 404);
  if (quiz.kind !== "ONLINE" || quiz.publishedAt === null) {
    return apiError(res, "quiz_not_published", "This quiz is not available.", 409);
  }
  if (!(await canAccessSeason(user, quiz.seasonId))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const latest = await db.quizAttempt.findFirst({
    where: { quizId: id, studentUserId: user.userId },
    orderBy: { attemptNumber: "desc" },
    select: { id: true, status: true },
  });

  if (latest && latest.status !== "IN_PROGRESS") {
    // R45: one attempt per student per quiz; a retake needs staff (see Task 5).
    return apiError(
      res,
      "attempt_closed",
      "You've already submitted this quiz. Ask your leader to reopen it.",
      409,
    );
  }

  if (!latest) {
    // A real upsert on the natural unique key, not v1's read-then-create with
    // no transaction (R119/D15) — two concurrent calls both saw no attempt,
    // both created attemptNumber 1, and the loser surfaced a raw Prisma error
    // to the student instead of the friendly message.
    await db.quizAttempt.upsert({
      where: {
        quizId_studentUserId_attemptNumber: {
          quizId: id,
          studentUserId: user.userId,
          attemptNumber: 1,
        },
      },
      // Empty update: the point is to return the existing row untouched.
      update: {},
      create: { quizId: id, studentUserId: user.userId, attemptNumber: 1 },
      select: { id: true },
    });
  }

  const detail = await loadStudentQuizDetail(id, user.userId);
  if (!detail) return apiError(res, "not_found", "Quiz not found.", 404);
  return apiOk(res, detail);
});
```

- [ ] **Step 5: `PATCH /:id/attempt` — batch answer save**

```ts
/** Resolve the caller's live attempt, or answer and return null. */
async function resolveOpenAttempt(
  res: Parameters<typeof apiOk>[0],
  quizId: number,
  studentUserId: number,
) {
  const attempt = await db.quizAttempt.findFirst({
    where: { quizId, studentUserId },
    orderBy: { attemptNumber: "desc" },
    select: { id: true, status: true },
  });
  if (!attempt) {
    apiError(res, "no_attempt", "Start the quiz before saving answers.", 409);
    return null;
  }
  if (attempt.status !== "IN_PROGRESS") {
    apiError(res, "attempt_closed", "This attempt is closed.", 409);
    return null;
  }
  return attempt;
}

quizzesRouter.patch("/:id/attempt", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);
  if (user.role !== "STUDENT") {
    return apiError(res, "forbidden", "Only a student can take a quiz.", 403);
  }

  const parsed = saveQuizAnswersRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid answers.", 400);

  const attempt = await resolveOpenAttempt(res, id, user.userId);
  if (!attempt) return undefined;

  const questions = await db.quizQuestion.findMany({
    where: { quizId: id },
    select: { id: true, type: true, options: true },
  });
  const byId = new Map(questions.map((q) => [q.id, q]));

  for (const answer of parsed.data.answers) {
    const question = byId.get(answer.questionId);
    // R50 — the one cross-entity consistency check v1 did make, kept.
    if (!question) {
      return apiError(res, "question_not_in_quiz", "That question is not in this quiz.", 400);
    }
    if (question.type === "MCQ") {
      // R52: v1 validated neither of these. An ESSAY accepted a selectedIndex
      // and an MCQ accepted free text; only the client's good manners kept the
      // data coherent.
      if (answer.text !== null) {
        return apiError(res, "wrong_answer_type", "A multiple-choice answer has no text.", 400);
      }
      // R51: the real bound is THIS question's option count, not v1's constant 5.
      if (answer.selectedIndex !== null && answer.selectedIndex >= question.options.length) {
        return apiError(res, "answer_out_of_range", "That option does not exist.", 400);
      }
    } else if (answer.selectedIndex !== null) {
      return apiError(res, "wrong_answer_type", "An essay answer has no option index.", 400);
    }
  }

  await db.$transaction(
    parsed.data.answers.map((answer) =>
      db.quizAnswer.upsert({
        where: { attemptId_questionId: { attemptId: attempt.id, questionId: answer.questionId } },
        create: {
          attemptId: attempt.id,
          questionId: answer.questionId,
          selectedIndex: answer.selectedIndex,
          text: answer.text,
        },
        // isCorrect and pointsAwarded are untouched — saving never grades (R54).
        update: { selectedIndex: answer.selectedIndex, text: answer.text },
      }),
    ),
  );

  return apiOk(res, { saved: parsed.data.answers.length });
});
```

- [ ] **Step 6: `POST /:id/attempt/submit` — completeness and auto-scoring**

```ts
quizzesRouter.post("/:id/attempt/submit", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);
  if (user.role !== "STUDENT") {
    return apiError(res, "forbidden", "Only a student can take a quiz.", 403);
  }

  const attempt = await resolveOpenAttempt(res, id, user.userId);
  if (!attempt) return undefined;

  const quiz = await db.quiz.findUnique({ where: { id }, select: { title: true } });
  if (!quiz) return apiError(res, "not_found", "Quiz not found.", 404);

  const [questions, answers] = await Promise.all([
    db.quizQuestion.findMany({
      where: { quizId: id },
      select: { id: true, type: true, points: true, correctIndex: true },
    }),
    // Read INSIDE the request that scores them, unlike v1, which read the
    // answers off the attempt, validated, and then opened a transaction that
    // scored from the stale in-memory copy (R120).
    db.quizAnswer.findMany({
      where: { attemptId: attempt.id },
      select: { questionId: true, selectedIndex: true, text: true },
    }),
  ]);
  const answerBy = new Map(answers.map((a) => [a.questionId, a]));

  // R59: one unanswered question rejects the whole submit.
  for (const q of questions) {
    const a = answerBy.get(q.id);
    const answered =
      q.type === "MCQ"
        ? a?.selectedIndex !== null && a?.selectedIndex !== undefined
        : Boolean(a?.text && a.text.trim().length > 0);
    if (!answered) {
      return apiError(res, "attempt_incomplete", "Answer every question before submitting.", 409);
    }
  }

  let autoScore = 0;
  const scored = questions
    .filter((q) => q.type === "MCQ")
    .map((q) => {
      // R60: full points or nothing. No partial credit, no negative marking,
      // no per-option weighting anywhere in this domain.
      const isCorrect = answerBy.get(q.id)?.selectedIndex === q.correctIndex;
      const pointsAwarded = isCorrect ? q.points : 0;
      autoScore += pointsAwarded;
      return { questionId: q.id, isCorrect, pointsAwarded };
    });
  const hasEssays = questions.some((q) => q.type === "ESSAY");
  const now = new Date();

  await db.$transaction([
    ...scored.map((s) =>
      db.quizAnswer.update({
        where: { attemptId_questionId: { attemptId: attempt.id, questionId: s.questionId } },
        data: { isCorrect: s.isCorrect, pointsAwarded: s.pointsAwarded },
      }),
    ),
    db.quizAttempt.update({
      where: { id: attempt.id },
      data: hasEssays
        ? { status: "SUBMITTED", submittedAt: now, autoScore }
        : {
            status: "GRADED",
            submittedAt: now,
            autoScore,
            manualScore: 0,
            totalScore: autoScore,
            gradedAt: now,
            // gradedById stays null: nobody graded it (R64).
          },
    }),
  ]);

  if (!hasEssays) {
    // Best-effort, outside the transaction, and swallowed — the same shape as
    // submissions.ts's review notification. A mail failure must not report a
    // submitted quiz as failed.
    try {
      await createNotificationsBulk([user.userId], {
        type: "QUIZ_GRADED",
        title: `Quiz graded: ${quiz.title}`,
        body: "Your quiz was graded automatically.",
        // v1's exact link (ruling X1) — see QUIZ_GRADED_LINK below.
        link: QUIZ_GRADED_LINK,
      });
    } catch {
      // Swallowed deliberately; see above.
    }
  }

  const detail = await loadStudentQuizDetail(id, user.userId);
  if (!detail) return apiError(res, "not_found", "Quiz not found.", 404);
  return apiOk(res, detail);
});
```

Add `createNotificationsBulk` (from `../lib/notifications`), `canGradeQuiz` and
`saveQuizAnswersRequestSchema` to the imports, and declare the link once near
the top of `routes/quizzes.ts` (Tasks 5 and 6 reuse it at their three other
`QUIZ_GRADED` sites):

```ts
/**
 * v1's exact link for every QUIZ_GRADED row — `quiz-actions.ts:167,483,554`
 * all write the bare list path. Ruling X1: every plan writes v1's link format,
 * because v1 renders these same rows from the shared database today and a
 * v2-only path would be a dead link in v1. Plan 13's link parser maps this
 * shape to the mobile `/quizzes` tab; any remap is Plan 18's cutover backfill.
 * Do not "improve" it to a per-quiz path here.
 */
const QUIZ_GRADED_LINK = "/student/quizzes";
```

**Nothing tells a grader an attempt is waiting.** That is R65/D14, and it stays
unbuilt: a new `NotificationType` value is a schema change and therefore blocked
under C1. The grading screen's "waiting" list (Task 5) is the substitute.

- [ ] **Step 7: Run the suite**

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern quizzes` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/backend` → clean.

- [ ] **Step 8: OpenAPI, same commit** — `GET /api/v1/quizzes/{id}` documented
as **two response schemas selected by role**, with the answer-key guarantee
stated in prose, plus the three attempt paths and their error codes.

- [ ] **Step 9: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): quiz detail by role and the student attempt lifecycle"
```

---

### Task 5: Backend — the ONLINE grading surface (attempts, essay marks, reopen)

**Files:**
- Modify: `apps/backend/src/routes/quizzes.ts`
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: extend `apps/backend/src/__tests__/integration/quizzes-routes.test.ts`

**Interfaces:**
- Consumes: `canGradeQuiz`, `canManageQuiz`, `visibleStudentIdsForQuiz` (Task 2),
  `gradeEssayAnswersRequestSchema`, `reopenAttemptRequestSchema`,
  `quizAttemptsQuerySchema` (Task 1), `createNotificationsBulk`.
- Produces:
  - `GET /api/v1/quizzes/:id/attempts?cursor=&limit=` → `{ data: QuizGradingPage }`
  - `POST /api/v1/quizzes/:id/attempts/:attemptId/grade` → `{ data: QuizGradingAttempt }`
  - `POST /api/v1/quizzes/:id/attempts/reopen` → `{ data: { attemptId, attemptNumber } }` 201
  - New error codes: `student_not_in_scope`, `attempt_not_submitted`, `awards_incomplete`, `score_exceeds_max`, `attempt_open`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("ONLINE grading", () => {
  let quizId: number;
  let mcqId: number;
  let essayId: number;
  let attemptId: number;

  beforeEach(async () => {
    const quiz = await db.quiz.create({
      data: {
        seasonId, sessionId, title: "Graded quiz", kind: "ONLINE",
        maxScore: 7, publishedAt: new Date(),
      },
      select: { id: true },
    });
    quizId = quiz.id;
    const mcq = await db.quizQuestion.create({
      data: { quizId, order: 0, type: "MCQ", prompt: "Capital of France?", points: 2,
        options: ["London", "Paris"], correctIndex: 1 },
      select: { id: true },
    });
    const essay = await db.quizQuestion.create({
      data: { quizId, order: 1, type: "ESSAY", prompt: "Discuss.", points: 5,
        options: [], correctIndex: null },
      select: { id: true },
    });
    mcqId = mcq.id;
    essayId = essay.id;

    const attempt = await db.quizAttempt.create({
      data: {
        quizId, studentUserId: ownStudentId, attemptNumber: 1,
        status: "SUBMITTED", autoScore: 2, submittedAt: new Date(),
        answers: {
          create: [
            { questionId: mcqId, selectedIndex: 1, isCorrect: true, pointsAwarded: 2 },
            { questionId: essayId, text: "Because of the river." },
          ],
        },
      },
      select: { id: true },
    });
    attemptId = attempt.id;
  });

  it("lists attempts for the caller's own students, never a client-supplied set", async () => {
    const res = await request(app)
      .get(`/api/v1/quizzes/${quizId}/attempts`)
      .set("authorization", `Bearer ${leaderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0]).toMatchObject({
      attemptId, studentUserId: ownStudentId, status: "SUBMITTED", autoScore: 2,
    });
    // The grader gets the answer key — correct for this audience (R103).
    const mcqAnswer = res.body.data.items[0].answers.find(
      (a: { questionId: number }) => a.questionId === mcqId,
    );
    expect(mcqAnswer.correctIndex).toBe(1);
    // Leader scope = their own group only, so the other group's student is not
    // in the population at all.
    expect(res.body.data.studentCount).toBe(1);
  });

  it("shows a student whose latest attempt is still in progress instead of hiding them (R102, D5)", async () => {
    await db.quizAttempt.update({ where: { id: attemptId }, data: { status: "IN_PROGRESS" } });

    const res = await request(app)
      .get(`/api/v1/quizzes/${quizId}/attempts`)
      .set("authorization", `Bearer ${leaderToken}`);

    expect(res.status).toBe(200);
    // v1's read filtered to SUBMITTED|GRADED and took one row per student, so a
    // student with an in-progress attempt vanished from the grading list — as
    // did any student an admin had just granted a retake to, whose earlier
    // graded attempt disappeared behind the new one.
    expect(res.body.data.items).toHaveLength(0);
    expect(res.body.data.waiting).toEqual([
      expect.objectContaining({ studentUserId: ownStudentId }),
    ]);
    expect(res.body.data.waiting[0].startedAt).not.toBeNull();
  });

  it("lists a never-started student as waiting with a null startedAt", async () => {
    const res = await request(app)
      .get(`/api/v1/quizzes/${quizId}/attempts`)
      .set("authorization", `Bearer ${adminToken}`);
    // The admin's scope is the whole season: our student (SUBMITTED) plus the
    // other group's student, who has not started.
    expect(res.body.data.studentCount).toBe(2);
    expect(res.body.data.waiting).toEqual([
      expect.objectContaining({ studentUserId: otherGroupStudentId, startedAt: null }),
    ]);
  });

  it("grades essays, requires every essay, and rejects an over-max award", async () => {
    const before = await quizGradedCount();
    const incomplete = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/${attemptId}/grade`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ awards: [{ questionId: mcqId, points: 2 }] });
    // Awards naming a non-essay question were silently skipped in v1 (R71),
    // and manualScore was recomputed from only what arrived, so a partial
    // payload quietly lowered the total (R72).
    expect(incomplete.status).toBe(400);
    expect(incomplete.body.error.code).toBe("awards_incomplete");

    const tooHigh = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/${attemptId}/grade`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ awards: [{ questionId: essayId, points: 99 }] });
    // v1 clamped silently (R70); D8 says reject, so a miskey is visible.
    expect(tooHigh.status).toBe(400);
    expect(tooHigh.body.error.code).toBe("score_exceeds_max");

    const ok = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/${attemptId}/grade`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ awards: [{ questionId: essayId, points: 4 }] });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({
      status: "GRADED", autoScore: 2, manualScore: 4, totalScore: 6,
    });
    expect(ok.body.data.gradedByName).toBe("Test leader");

    expect((await quizGradedCount()) - before).toBe(1);

    // A re-save at the same total is a no-op for the student (D8's unified
    // rule: notify on a first grade and on a score change, silent otherwise —
    // v1's two paths disagreed, R75 vs R92).
    await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/${attemptId}/grade`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ awards: [{ questionId: essayId, points: 4 }] });
    expect((await quizGradedCount()) - before).toBe(1);

    // A changed total does notify again.
    await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/${attemptId}/grade`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ awards: [{ questionId: essayId, points: 5 }] });
    expect((await quizGradedCount()) - before).toBe(2);
  });

  it("refuses grading an attempt whose student is outside the caller's scope (R68)", async () => {
    const strangerAttempt = await db.quizAttempt.create({
      data: {
        quizId, studentUserId: otherGroupStudentId, attemptNumber: 1,
        status: "SUBMITTED", autoScore: 0, submittedAt: new Date(),
        answers: { create: [{ questionId: essayId, text: "Mine." }] },
      },
      select: { id: true },
    });

    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/${strangerAttempt.id}/grade`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ awards: [{ questionId: essayId, points: 1 }] });
    // v1's gate was season-wide with no group check at all, so a leader could
    // grade any student in the season, including another leader's.
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("student_not_in_scope");
  });

  it("refuses grading an attempt that is still in progress (R69)", async () => {
    await db.quizAttempt.update({ where: { id: attemptId }, data: { status: "IN_PROGRESS" } });
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/${attemptId}/grade`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ awards: [{ questionId: essayId, points: 1 }] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("attempt_not_submitted");
  });

  it("lets a LEADER reopen an attempt, and tells the student (D5)", async () => {
    await db.quizAttempt.update({
      where: { id: attemptId },
      data: { status: "GRADED", manualScore: 4, totalScore: 6, gradedAt: new Date() },
    });
    const before = await quizGradedCount();

    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/reopen`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ studentUserId: ownStudentId });

    // v1 gated reopen on canManageQuiz — admin only — so the leader looking at
    // the grading screen could see a stuck student and do nothing about it.
    expect(res.status).toBe(201);
    expect(res.body.data.attemptNumber).toBe(2);

    const attempts = await db.quizAttempt.findMany({
      where: { quizId, studentUserId: ownStudentId },
      orderBy: { attemptNumber: "asc" },
      select: { attemptNumber: true, status: true, totalScore: true },
    });
    // History is preserved: the graded attempt is untouched (R81).
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({ attemptNumber: 1, status: "GRADED", totalScore: 6 });
    expect(attempts[1]).toMatchObject({ attemptNumber: 2, status: "IN_PROGRESS" });

    // v1 sent NOTHING on reopen — the student was never told they had a retake.
    expect((await quizGradedCount()) - before).toBe(1);
  });

  it("reopens a SUBMITTED attempt, then refuses while that one is open", async () => {
    // v1's action allowed reopening a SUBMITTED (ungraded) attempt — its only
    // status check was `!== IN_PROGRESS` — while its UI offered the control
    // only for GRADED (R82). The action's rule is the real one and is kept: a
    // student who submitted and needs another go should not have to wait for
    // someone to grade the attempt first.
    const first = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/reopen`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ studentUserId: ownStudentId });
    expect(first.status).toBe(201);
    expect(first.body.data.attemptNumber).toBe(2);

    // Attempt 2 is now IN_PROGRESS, so a second reopen would create a third
    // live attempt for one student.
    const second = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/reopen`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ studentUserId: ownStudentId });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("attempt_open");
  });

  it("refuses reopening for a student outside the caller's scope", async () => {
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/reopen`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ studentUserId: otherGroupStudentId });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("student_not_in_scope");
  });

  it("refuses reopening when the student has never attempted", async () => {
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/reopen`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ studentUserId: otherGroupStudentId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("no_attempt");
  });
});
```

- [ ] **Step 2: The attempts list**

```ts
quizzesRouter.get("/:id/attempts", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);

  const quiz = await db.quiz.findUnique({
    where: { id },
    select: { id: true, title: true, kind: true, maxScore: true, seasonId: true },
  });
  if (!quiz) return apiError(res, "not_found", "Quiz not found.", 404);
  if (!(await canGradeQuiz(user, id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const parsed = quizAttemptsQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid query.", 400);
  const { cursor, limit } = parsed.data;

  // Derived, never accepted (R105). visibleStudentIdsForQuiz returns them
  // sorted, so paging over the ids is stable and needs no second sort.
  const studentIds = await visibleStudentIdsForQuiz(user, quiz.seasonId);
  if (studentIds === null) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }
  const remaining = cursor === undefined ? studentIds : studentIds.filter((sid) => sid > cursor);
  const pageIds = remaining.slice(0, limit);

  const questions = await db.quizQuestion.findMany({
    where: { quizId: id },
    orderBy: { order: "asc" },
    select: {
      id: true, type: true, prompt: true, points: true, options: true, correctIndex: true,
    },
  });

  const attempts = await db.quizAttempt.findMany({
    where: { quizId: id, studentUserId: { in: pageIds } },
    // Latest attempt per student — every status, not just SUBMITTED|GRADED
    // (R102/D5): an in-progress attempt hid its student from the list entirely.
    orderBy: [{ studentUserId: "asc" }, { attemptNumber: "desc" }],
    distinct: ["studentUserId"],
    select: {
      id: true,
      studentUserId: true,
      attemptNumber: true,
      status: true,
      autoScore: true,
      manualScore: true,
      totalScore: true,
      submittedAt: true,
      createdAt: true,
      studentUser: { select: { name: true } },
      // D13: the audit column v1 wrote and never read anywhere.
      gradedBy: { select: { name: true } },
      answers: {
        select: {
          questionId: true, selectedIndex: true, text: true,
          isCorrect: true, pointsAwarded: true,
        },
      },
    },
  });

  const scored = attempts.filter((a) => a.status !== "IN_PROGRESS");
  const inProgress = attempts.filter((a) => a.status === "IN_PROGRESS");
  const startedIds = new Set(attempts.map((a) => a.studentUserId));

  const names = await db.user.findMany({
    where: { id: { in: pageIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(names.map((u) => [u.id, u.name]));

  return apiOk(res, {
    id: quiz.id,
    title: quiz.title,
    kind: quiz.kind,
    maxScore: quiz.maxScore,
    hasEssays: questions.some((q) => q.type === "ESSAY"),
    studentCount: studentIds.length,
    items: scored.map((att) => {
      const answerBy = new Map(att.answers.map((a) => [a.questionId, a]));
      return {
        attemptId: att.id,
        studentUserId: att.studentUserId,
        studentName: att.studentUser.name,
        attemptNumber: att.attemptNumber,
        status: att.status,
        autoScore: att.autoScore,
        manualScore: att.manualScore,
        totalScore: att.totalScore,
        submittedAt: att.submittedAt,
        gradedByName: att.gradedBy?.name ?? null,
        // Projected over the quiz's CURRENT questions (R104): a question added
        // after this attempt was submitted shows with every answer field null.
        // Under D3's freeze that can no longer happen going forward, but rows
        // v1 already produced still look like this.
        answers: questions.map((q) => {
          const a = answerBy.get(q.id);
          return {
            questionId: q.id,
            type: q.type,
            prompt: q.prompt,
            points: q.points,
            options: q.options,
            correctIndex: q.correctIndex,
            selectedIndex: a?.selectedIndex ?? null,
            isCorrect: a?.isCorrect ?? null,
            text: a?.text ?? null,
            pointsAwarded: a?.pointsAwarded ?? null,
          };
        }),
      };
    }),
    waiting: [
      ...inProgress.map((att) => ({
        studentUserId: att.studentUserId,
        studentName: att.studentUser.name,
        startedAt: att.createdAt,
      })),
      ...pageIds
        .filter((sid) => !startedIds.has(sid))
        .map((sid) => ({
          studentUserId: sid,
          studentName: nameById.get(sid) ?? null,
          startedAt: null,
        })),
    ],
    nextCursor: remaining.length > limit ? (pageIds[pageIds.length - 1] ?? null) : null,
  });
});
```

**Why paging over ids rather than over attempt rows:** `distinct` plus a cursor
on the attempt table is fragile (the cursor row may not be the distinct
survivor), and the student set is already an in-memory array bounded by the
caller's own roster. v1 paginated nothing at all and returned every attempt's
every answer, full essay text included, in one payload (R112).

- [ ] **Step 3: Essay grading**

```ts
quizzesRouter.post("/:id/attempts/:attemptId/grade", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  const attemptId = parseId(req.params.attemptId);
  if (id === null || attemptId === null) return apiError(res, "bad_request", "Invalid id.", 400);

  const quiz = await db.quiz.findUnique({
    where: { id },
    select: { id: true, title: true, seasonId: true },
  });
  if (!quiz) return apiError(res, "not_found", "Quiz not found.", 404);
  if (!(await canGradeQuiz(user, id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const attempt = await db.quizAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true, quizId: true, studentUserId: true, status: true,
      autoScore: true, totalScore: true,
    },
  });
  // Addressed through its quiz: a bare attempt id can never reach another quiz.
  if (!attempt || attempt.quizId !== id) {
    return apiError(res, "not_found", "Attempt not found.", 404);
  }

  // R68: v1 checked the season and stopped. A leader could grade a student in
  // another leader's group because the group scope existed only in the array
  // the page computed for the READ.
  const studentIds = await visibleStudentIdsForQuiz(user, quiz.seasonId);
  if (studentIds === null || !studentIds.includes(attempt.studentUserId)) {
    return apiError(res, "student_not_in_scope", "That student is not in your groups.", 403);
  }

  if (attempt.status === "IN_PROGRESS") {
    return apiError(res, "attempt_not_submitted", "This attempt has not been submitted.", 409);
  }

  const parsed = gradeEssayAnswersRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid awards.", 400);

  const essays = await db.quizQuestion.findMany({
    where: { quizId: id, type: "ESSAY" },
    select: { id: true, points: true },
  });
  const maxBy = new Map(essays.map((q) => [q.id, q.points]));

  // Every essay, exactly once. v1 recomputed manualScore from only the awards
  // present, so an omitted essay contributed 0 and silently lowered the total.
  const sent = new Set(parsed.data.awards.map((a) => a.questionId));
  if (sent.size !== parsed.data.awards.length || sent.size !== essays.length ||
      !essays.every((q) => sent.has(q.id))) {
    return apiError(res, "awards_incomplete", "Send a mark for every essay question.", 400);
  }
  for (const award of parsed.data.awards) {
    const max = maxBy.get(award.questionId) as number;
    // D8: reject rather than clamp, matching D7's rule for paper scores.
    if (award.points > max) {
      return apiError(res, "score_exceeds_max", `That question is out of ${max}.`, 400);
    }
  }

  const manualScore = parsed.data.awards.reduce((sum, a) => sum + a.points, 0);
  // autoScore is trusted as stored and never recomputed (R73) — recomputing it
  // would need the questions as they were when taken, which nothing records.
  const totalScore = (attempt.autoScore ?? 0) + manualScore;
  const scoreChanged = attempt.totalScore !== totalScore;
  const now = new Date();

  await db.$transaction([
    ...parsed.data.awards.map((award) =>
      db.quizAnswer.update({
        where: { attemptId_questionId: { attemptId, questionId: award.questionId } },
        data: { pointsAwarded: award.points },
      }),
    ),
    db.quizAttempt.update({
      where: { id: attemptId },
      data: {
        manualScore,
        totalScore,
        status: "GRADED",
        gradedById: user.userId,
        gradedAt: now,
      },
    }),
  ]);

  if (scoreChanged) {
    // D8's single rule for both grading paths: notify on a first grade and on
    // any score change, silent on a no-op re-save. v1's two paths disagreed —
    // ONLINE notified on every call (R75), PAPER never re-notified (R92).
    try {
      await createNotificationsBulk([attempt.studentUserId], {
        type: "QUIZ_GRADED",
        title: `Quiz graded: ${quiz.title}`,
        body: "Your quiz has been graded.",
        link: QUIZ_GRADED_LINK,
      });
    } catch {
      // Best-effort; a transport failure must not fail the grade.
    }
  }

  const page = await db.quizAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true, studentUserId: true, attemptNumber: true, status: true,
      autoScore: true, manualScore: true, totalScore: true, submittedAt: true,
      studentUser: { select: { name: true } },
      gradedBy: { select: { name: true } },
    },
  });
  return apiOk(res, {
    attemptId: page?.id,
    studentUserId: page?.studentUserId,
    studentName: page?.studentUser.name ?? null,
    attemptNumber: page?.attemptNumber,
    status: page?.status,
    autoScore: page?.autoScore ?? null,
    manualScore: page?.manualScore ?? null,
    totalScore: page?.totalScore ?? null,
    submittedAt: page?.submittedAt ?? null,
    gradedByName: page?.gradedBy?.name ?? null,
    answers: [],
  });
});
```

**Note:** the response's `answers: []` is deliberate — the client refetches the
list after a grade (it needs the recomputed page anyway) and re-sending every
essay's full text on a write is payload for nothing. `quizGradingAttemptSchema`
still types it, so the shape is uniform.

- [ ] **Step 4: Reopen**

```ts
/**
 * Grant a retake.
 *
 * Gated on canGradeQuiz, not canManageQuiz — spec D5's recommendation. v1 made
 * this admin-only (R79), so the leader actually looking at the grading screen
 * could see a student stuck behind a dead attempt and had to find an admin. And
 * because there is no expiry, no timeout and no ABANDONED status (R47, and
 * adding one is a schema change under C1), a dropped connection mid-quiz makes
 * this endpoint the ONLY way that student ever takes the quiz.
 */
quizzesRouter.post("/:id/attempts/reopen", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);

  const quiz = await db.quiz.findUnique({
    where: { id },
    select: { id: true, title: true, seasonId: true, kind: true, publishedAt: true },
  });
  if (!quiz) return apiError(res, "not_found", "Quiz not found.", 404);
  if (!(await canGradeQuiz(user, id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const parsed = reopenAttemptRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid body.", 400);

  const studentIds = await visibleStudentIdsForQuiz(user, quiz.seasonId);
  if (studentIds === null || !studentIds.includes(parsed.data.studentUserId)) {
    return apiError(res, "student_not_in_scope", "That student is not in your groups.", 403);
  }

  // R84: v1 checked neither kind nor publishedAt, so a retake could be opened
  // on an unpublished quiz the student then could not see.
  if (quiz.kind !== "ONLINE" || quiz.publishedAt === null) {
    return apiError(res, "quiz_not_published", "This quiz is not available to students.", 409);
  }

  const latest = await db.quizAttempt.findFirst({
    where: { quizId: id, studentUserId: parsed.data.studentUserId },
    orderBy: { attemptNumber: "desc" },
    select: { attemptNumber: true, status: true },
  });
  if (!latest) return apiError(res, "no_attempt", "That student has no attempt to reopen.", 409);
  if (latest.status === "IN_PROGRESS") {
    return apiError(res, "attempt_open", "That student already has an attempt open.", 409);
  }

  const created = await db.quizAttempt.create({
    data: {
      quizId: id,
      studentUserId: parsed.data.studentUserId,
      // R81: a NEW attempt; the previous one and its answers stay intact.
      attemptNumber: latest.attemptNumber + 1,
    },
    select: { id: true, attemptNumber: true },
  });

  // v1 sent nothing at all, so a student was never told a retake existed. There
  // is no dedicated NotificationType and adding one is a schema change (C1), so
  // QUIZ_GRADED is reused with copy that says what actually happened — D5's
  // explicit second option.
  try {
    await createNotificationsBulk([parsed.data.studentUserId], {
      type: "QUIZ_GRADED",
      title: `You can retake: ${quiz.title}`,
      body: "Your quiz has been reopened, so you can take it again.",
      link: QUIZ_GRADED_LINK,
    });
  } catch {
    // Best-effort.
  }

  return apiOk(res, { attemptId: created.id, attemptNumber: created.attemptNumber }, 201);
});
```

Add `gradeEssayAnswersRequestSchema`, `reopenAttemptRequestSchema` and
`quizAttemptsQuerySchema` to the shared import block.

- [ ] **Step 5: Run the suite**

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern quizzes` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/backend` → clean.

- [ ] **Step 6: OpenAPI, same commit** — the three paths, documenting that the
student set is server-derived, that `waiting` exists so nobody disappears, and
that reopen is a leader power in v2 and notifies the student.

- [ ] **Step 7: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): online quiz grading, scoped to the caller's own students"
```

---

### Task 6: Backend — the PAPER grade sheet, and the fixed batch write (spec D1)

This is the domain's headline finding. v1's `saveQuizGradesAction` is unscoped
in two independent ways at once, and both are fixed here rather than ported.

**Files:**
- Modify: `apps/backend/src/routes/quizzes.ts`
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: extend `apps/backend/src/__tests__/integration/quizzes-routes.test.ts`

**Interfaces:**
- Consumes: `canGradeQuiz`, `visibleStudentIdsForQuiz`, `saveQuizGradesRequestSchema`, `createNotificationsBulk`.
- Produces:
  - `GET /api/v1/quizzes/:id/grades` → `{ data: QuizGradeSheet }`
  - `POST /api/v1/quizzes/:id/grades` → `{ data: QuizGradeSheet }` (the sheet after the write)
  - Reuses error codes `student_not_in_scope`, `score_exceeds_max`, `wrong_quiz_kind`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("PAPER grades", () => {
  let quizId: number;

  beforeEach(async () => {
    const quiz = await db.quiz.create({
      data: { seasonId, sessionId, title: "Paper sheet", kind: "PAPER", maxScore: 20 },
      select: { id: true },
    });
    quizId = quiz.id;
  });

  it("returns a row per student in the caller's scope, ungraded ones included (R100)", async () => {
    const asAdmin = await request(app)
      .get(`/api/v1/quizzes/${quizId}/grades`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.data.rows).toHaveLength(2);
    expect(asAdmin.body.data.studentCount).toBe(2);
    expect(asAdmin.body.data.rows[0]).toMatchObject({ score: null, notes: null, gradedAt: null });

    const asLeader = await request(app)
      .get(`/api/v1/quizzes/${quizId}/grades`)
      .set("authorization", `Bearer ${leaderToken}`);
    // The leader's own group only — and this scope is now the SAME derivation
    // the write below uses, which is the whole point of D1.
    expect(asLeader.body.data.rows).toHaveLength(1);
    expect(asLeader.body.data.rows[0].studentUserId).toBe(ownStudentId);
  });

  it("saves a batch and notifies only the newly graded", async () => {
    const before = await quizGradedCount();
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/grades`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ entries: [{ studentUserId: ownStudentId, score: 18, notes: "Strong." }] });

    expect(res.status).toBe(200);
    const row = res.body.data.rows.find(
      (r: { studentUserId: number }) => r.studentUserId === ownStudentId,
    );
    expect(row).toMatchObject({ score: 18, notes: "Strong." });
    expect(row.gradedByName).toBe("Test leader");
    expect((await quizGradedCount()) - before).toBe(1);

    // Re-saving the same score is silent (D8's unified rule).
    await request(app)
      .post(`/api/v1/quizzes/${quizId}/grades`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ entries: [{ studentUserId: ownStudentId, score: 18, notes: "Strong." }] });
    expect((await quizGradedCount()) - before).toBe(1);

    // Changing the score notifies again.
    await request(app)
      .post(`/api/v1/quizzes/${quizId}/grades`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ entries: [{ studentUserId: ownStudentId, score: 19, notes: "Strong." }] });
    expect((await quizGradedCount()) - before).toBe(2);
  });

  // -------------------------------------------------------------------
  // D1, half one: the season check ran only for LEADER, so an ADMIN of ANY
  // season passed with no check at all — a season-scoped role behaving
  // globally. otherAdminToken administers otherSeasonId and nothing else.
  // -------------------------------------------------------------------
  it("refuses an ADMIN of a different season (R86 — the live v1 hole)", async () => {
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/grades`)
      .set("authorization", `Bearer ${otherAdminToken}`)
      .send({ entries: [{ studentUserId: ownStudentId, score: 20, notes: null }] });
    expect(res.status).toBe(403);

    const written = await db.quizGrade.count({ where: { quizId } });
    expect(written).toBe(0);
  });

  // -------------------------------------------------------------------
  // D1, half two: the action iterated the caller-supplied array and upserted
  // each studentUserId verbatim — a student in another leader's group, in
  // another season, or enrolled nowhere.
  // -------------------------------------------------------------------
  it("rejects the WHOLE batch when any student is out of scope (R93)", async () => {
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/grades`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({
        entries: [
          { studentUserId: ownStudentId, score: 15, notes: null },
          { studentUserId: otherGroupStudentId, score: 20, notes: null },
        ],
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("student_not_in_scope");
    // Whole-batch rejection, not skip-the-offender: a client bug must be loud,
    // and the valid half must not land while the caller is told it failed.
    expect(await db.quizGrade.count({ where: { quizId } })).toBe(0);
  });

  it("rejects a score above the quiz's maxScore rather than clamping (R88, D7)", async () => {
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/grades`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ entries: [{ studentUserId: ownStudentId, score: 21, notes: null }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("score_exceeds_max");
    // v1 had no server bound at all: the only clamp was Math.min in the form,
    // so an above-max score stored fine and rendered as a >100% average.
    expect(await db.quizGrade.count({ where: { quizId } })).toBe(0);
  });

  it("clears a grade when the score is null (diverging from R89)", async () => {
    await request(app)
      .post(`/api/v1/quizzes/${quizId}/grades`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ entries: [{ studentUserId: ownStudentId, score: 12, notes: "Typo." }] });
    expect(await db.quizGrade.count({ where: { quizId } })).toBe(1);

    const cleared = await request(app)
      .post(`/api/v1/quizzes/${quizId}/grades`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ entries: [{ studentUserId: ownStudentId, score: null, notes: null }] });
    expect(cleared.status).toBe(200);
    // v1 skipped null entries entirely, so a grade entered against the wrong
    // student could never be removed.
    expect(await db.quizGrade.count({ where: { quizId } })).toBe(0);
  });

  it("refuses a PAPER grade against an ONLINE quiz (R94, D10)", async () => {
    const online = await db.quiz.create({
      data: { seasonId, sessionId, title: "Online", kind: "ONLINE", maxScore: 5,
        publishedAt: new Date() },
      select: { id: true },
    });
    const res = await request(app)
      .post(`/api/v1/quizzes/${online.id}/grades`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ entries: [{ studentUserId: ownStudentId, score: 5, notes: null }] });
    // Such a row was invisible to the student (their PAPER read filters on
    // kind) but counted in every staff "graded" number and in the export.
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("wrong_quiz_kind");
  });

  it("refuses a student caller outright", async () => {
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/grades`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ entries: [{ studentUserId: ownStudentId, score: 20, notes: null }] });
    expect(res.status).toBe(403);
  });
});
```

Run the suite → the new cases FAIL.

- [ ] **Step 2: The grade sheet read**

```ts
/** Build the sheet for a scope. Shared by the GET and by the POST's response. */
async function buildGradeSheet(quizId: number, studentIds: number[]) {
  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: {
      id: true, title: true, kind: true, maxScore: true, seasonId: true,
      session: { select: { title: true } },
    },
  });
  if (!quiz) return null;

  const [students, grades] = await Promise.all([
    db.user.findMany({
      // R100: deleted users are not on the sheet; ordered by name.
      where: { id: { in: studentIds }, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.quizGrade.findMany({
      where: { quizId, studentUserId: { in: studentIds } },
      select: {
        studentUserId: true, score: true, notes: true, gradedAt: true,
        gradedBy: { select: { name: true } },
      },
    }),
  ]);
  const gradeBy = new Map(grades.map((g) => [g.studentUserId, g]));

  return {
    id: quiz.id,
    title: quiz.title,
    kind: quiz.kind,
    maxScore: quiz.maxScore,
    seasonId: quiz.seasonId,
    sessionTitle: quiz.session?.title ?? null,
    studentCount: studentIds.length,
    rows: students.map((s) => {
      const g = gradeBy.get(s.id);
      return {
        studentUserId: s.id,
        studentName: s.name,
        score: g?.score ?? null,
        notes: g?.notes ?? null,
        gradedAt: g?.gradedAt ?? null,
        gradedByName: g?.gradedBy?.name ?? null,
      };
    }),
  };
}

quizzesRouter.get("/:id/grades", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);

  const quiz = await db.quiz.findUnique({ where: { id }, select: { seasonId: true } });
  if (!quiz) return apiError(res, "not_found", "Quiz not found.", 404);
  if (!(await canGradeQuiz(user, id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const studentIds = await visibleStudentIdsForQuiz(user, quiz.seasonId);
  if (studentIds === null) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const sheet = await buildGradeSheet(id, studentIds);
  if (!sheet) return apiError(res, "not_found", "Quiz not found.", 404);
  return apiOk(res, sheet);
});
```

- [ ] **Step 3: The write — spec D1's three corrections in one handler**

```ts
/**
 * Save PAPER grades.
 *
 * The v1 action this replaces (saveQuizGradesAction) is the domain's
 * authorization hole, twice over:
 *
 *   (a) R86 — its season check was written
 *       `user.role === "LEADER" && !(await isLeaderInSeason(...))`, so an ADMIN
 *       of any season passed with no scope check whatsoever. Every other write
 *       in the domain routes through canManageQuiz/canGradeQuiz, both of which
 *       check the season. This one did not.
 *   (b) R93 — it then iterated the caller-supplied array and upserted every
 *       studentUserId verbatim, with no check that the student was in the
 *       caller's groups, in the quiz's season, or enrolled anywhere. The only
 *       scoping in the whole system was the array the PAGE passed to the READ.
 *
 * All three of D1's corrections are here: one gate for every role, a
 * server-derived visible set that every entry must be inside, and whole-batch
 * rejection so a client bug is loud rather than half-applied. The upserts and
 * deletes also share one transaction — v1 ran two sequential unbatched loops
 * (R95), so a failure at student 15 of 30 left half the class graded, some of
 * them notified, and returned an error as though nothing had happened.
 */
quizzesRouter.post("/:id/grades", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);

  const quiz = await db.quiz.findUnique({
    where: { id },
    select: { id: true, title: true, kind: true, maxScore: true, seasonId: true },
  });
  if (!quiz) return apiError(res, "not_found", "Quiz not found.", 404);

  // (a) One gate, no role-conditional branch.
  if (!(await canGradeQuiz(user, id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  // R94/D10: a QuizGrade against an ONLINE quiz is invisible to the student and
  // counts everywhere else.
  if (quiz.kind !== "PAPER") {
    return apiError(res, "wrong_quiz_kind", "This is an online quiz — grade its attempts.", 409);
  }

  const parsed = saveQuizGradesRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid grade entries.", 400);

  // (b) Derived here, never taken from the request.
  const studentIds = await visibleStudentIdsForQuiz(user, quiz.seasonId);
  if (studentIds === null) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }
  const visible = new Set(studentIds);

  // (c) Validate the WHOLE batch before writing any of it.
  for (const entry of parsed.data.entries) {
    if (!visible.has(entry.studentUserId)) {
      return apiError(
        res, "student_not_in_scope", `Student ${entry.studentUserId} is not in your groups.`, 403,
      );
    }
    // R88/D7: the only bound in v1 was Math.min in the form, so an above-max
    // score stored fine and rendered as a >100% average in the student's own
    // list and in the season export.
    if (entry.score !== null && entry.score > quiz.maxScore) {
      return apiError(res, "score_exceeds_max", `This quiz is out of ${quiz.maxScore}.`, 400);
    }
  }

  const existing = await db.quizGrade.findMany({
    where: { quizId: id, studentUserId: { in: parsed.data.entries.map((e) => e.studentUserId) } },
    select: { studentUserId: true, score: true },
  });
  const previousScore = new Map(existing.map((g) => [g.studentUserId, g.score]));

  // One `now` for the whole batch, as v1 did (R91) — a batch is one act.
  const now = new Date();
  const writes = parsed.data.entries.map((entry) =>
    entry.score === null
      ? // Null CLEARS the row. v1 skipped null entries, so an existing grade
        // could never be removed — a typo was correctable, a grade against the
        // wrong student was not. deleteMany (not delete) so clearing an
        // already-absent row is a no-op rather than a P2025.
        db.quizGrade.deleteMany({ where: { quizId: id, studentUserId: entry.studentUserId } })
      : db.quizGrade.upsert({
          where: { quizId_studentUserId: { quizId: id, studentUserId: entry.studentUserId } },
          create: {
            quizId: id,
            studentUserId: entry.studentUserId,
            score: entry.score,
            notes: entry.notes,
            gradedById: user.userId,
            gradedAt: now,
          },
          update: {
            score: entry.score,
            notes: entry.notes,
            gradedById: user.userId,
            gradedAt: now,
          },
        }),
  );
  await db.$transaction(writes);

  // D8's single rule, shared with the essay path: a first grade or a changed
  // score notifies; a no-op re-save is silent. v1's two paths disagreed.
  const notifyIds = parsed.data.entries
    .filter((e) => e.score !== null && previousScore.get(e.studentUserId) !== e.score)
    .map((e) => e.studentUserId);
  if (notifyIds.length > 0) {
    try {
      await createNotificationsBulk(notifyIds, {
        type: "QUIZ_GRADED",
        title: `Quiz graded: ${quiz.title}`,
        body: "Your quiz has been graded.",
        link: QUIZ_GRADED_LINK,
      });
    } catch {
      // Best-effort, outside the transaction. v1 issued three queries per
      // student here, one student at a time (R96); createNotificationsBulk
      // batches the whole set.
    }
  }

  const sheet = await buildGradeSheet(id, studentIds);
  if (!sheet) return apiError(res, "not_found", "Quiz not found.", 404);
  return apiOk(res, sheet);
});
```

Add `saveQuizGradesRequestSchema` to the shared import block.

**`DELETE /api/v1/quizzes/:id` is deliberately not implemented.** v1's
`deleteQuizAction` hard-deletes and cascades to every grade, question, attempt
and answer, and it **has no caller anywhere in v1** — ruling C12 says an
unreachable action's semantics are not a specification, and spec D9 recommends
omitting it or gating it hard. `Quiz` has no `deletedAt` column, so a soft
delete is a migration and blocked by C1. Nothing in this plan needs the
capability; if a screen ever does, design it then.

- [ ] **Step 4: Run the suite**

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern quizzes` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/backend` → clean.

- [ ] **Step 5: OpenAPI, same commit** — both paths, with D1's three
corrections named in the `description` and `student_not_in_scope` /
`score_exceeds_max` / `wrong_quiz_kind` documented as whole-batch rejections.

- [ ] **Step 6: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): paper grade sheet with the season and roster checks v1 lacked"
```

---

### Task 7: Mobile — routes, query keys and hooks

**Files:**
- Modify: `apps/mobile/app/(app)/_layout.tsx` (extend `DETAIL_ROUTE_NAMES`)
- Create: `apps/mobile/app/(app)/quiz/[id]/index.tsx`, `apps/mobile/app/(app)/quiz/[id]/grade.tsx` (two stubs, same shape as Plan 1 Task 2's)
- Modify: `apps/mobile/src/lib/query-keys.ts` (add the `quizzes` factory)
- Create: `apps/mobile/src/hooks/use-quizzes.ts`
- Test: extend `apps/mobile/src/__tests__/app-layout.test.tsx`

**Interfaces:**
- Consumes: `DETAIL_ROUTE_NAMES` (Plan 1 Task 2), the shared quiz schemas (Task 1), `apiClient`, `queryKeys`.
- Produces: routes `/quiz/[id]` and `/quiz/[id]/grade` in the typed tree;
  `queryKeys.quizzes.all/lists()/bySeason(seasonId)/details()/detail(id)/attempt(id)/attempts(id)/grades(id)`;
  hooks `useQuizList(seasonId)`, `useStudentQuizList(seasonId)`,
  `useStudentQuizDetail(id)`, `useQuizAuthoringDetail(id, enabled)`,
  `useStartAttempt(id)`, `useSaveAnswers(id)`, `useSubmitAttempt(id)`,
  `useQuizGradeSheet(id, enabled)`, `useSaveQuizGrades(id)`,
  `useQuizAttempts(id, enabled)`, `useGradeEssays(id)`, `useReopenAttempt(id)`.

- [ ] **Step 1: Extend the layout test**

Plan 1 Task 0 made `app-layout.test.tsx` derive its counts from
`DETAIL_ROUTE_NAMES` (ruling X9), so appending to the const can never fail a
derived count — the failing-first assertion has to name the routes. Add (using
the file's own `user()`/`scopes` fixtures and its `mockScreens` capture of
`{ name, title, href }`; if Plan 1 Task 0 renamed them, use its names):

```tsx
it.each(["quiz/[id]/index", "quiz/[id]/grade"])("registers %s as a hidden detail route", (name) => {
  useSessionStore.getState().setSession(user("STUDENT"), scopes);
  render(<AppLayout />);
  const detail = mockScreens.find((s) => s.name === name);
  expect(detail).toBeDefined();
  expect(detail?.href).toBeNull();
});
```

Run `cd apps/mobile && pnpm jest src/__tests__/app-layout.test.tsx` → FAIL (names absent).

- [ ] **Step 2: Create the two stubs and extend the const**

`apps/mobile/app/(app)/quiz/[id]/index.tsx`:

```tsx
import { useLocalSearchParams } from "expo-router";

import { Screen, Text } from "../../../../src/ui";

export default function QuizDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen edges={["top", "left", "right"]}>
      <Text variant="heading">Quiz {id}</Text>
    </Screen>
  );
}
```

`apps/mobile/app/(app)/quiz/[id]/grade.tsx` is the same with the heading
`Grade quiz {id}`. Both are four levels deep, hence `../../../../src/ui`.

**Why `quiz/[id]/index.tsx` and not `quiz/[id].tsx`:** ruling X7 — a dynamic
segment with child routes uses the directory form, never `x/[id].tsx` beside
`x/[id]/` (Plan 4 does the same for `session/[id]/index.tsx` beside Plan 2's
`session/[id]/attendance.tsx`). The route names are `quiz/[id]/index` and
`quiz/[id]/grade`; the hrefs are `/quiz/[id]` and `/quiz/[id]/grade`. Task 11
adds `quiz/[id]/edit` and `quiz/new` the same way.

Append the two names to `DETAIL_ROUTE_NAMES` in `_layout.tsx`, keeping every
entry already there (by the time this plan runs, Plans 1, 2 and 4–6
and 5 have appended theirs — e.g. `"assignment/[id]/index"` (Plan 5 moved
it), `"session/[id]/index"`, `"session/[id]/attendance"`, `"group/[id]/index"`
(Plan 6 moved it), `"student/[id]"`):

```tsx
  "quiz/[id]/index",
  "quiz/[id]/grade",
```

- [ ] **Step 3: Add the query-key factory** to `query-keys.ts`, same spreading
pattern as the others:

```ts
  quizzes: {
    all: ["quizzes"] as const,
    lists: () => [...queryKeys.quizzes.all, "list"] as const,
    bySeason: (seasonId: number | null) => [...queryKeys.quizzes.lists(), { seasonId }] as const,
    details: () => [...queryKeys.quizzes.all, "detail"] as const,
    // number | null, like sessions.bySeason — a null key never collides with a
    // real quiz's cache entry, so no -1 sentinel anywhere.
    detail: (id: number | null) => [...queryKeys.quizzes.details(), { id }] as const,
    attempts: (id: number | null) => [...queryKeys.quizzes.detail(id), "attempts"] as const,
    grades: (id: number | null) => [...queryKeys.quizzes.detail(id), "grades"] as const,
  },
```

Nesting `attempts` and `grades` under `detail(id)` is deliberate: grading a
quiz invalidates `detail(id)` and both children fall out with it.

- [ ] **Step 4: Write `apps/mobile/src/hooks/use-quizzes.ts`**

```ts
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  quizAuthoringDetailSchema,
  quizGradeSheetSchema,
  quizGradingAttemptSchema,
  quizGradingPageSchema,
  quizListPageSchema,
  reopenAttemptResponseSchema,
  saveQuizAnswersResponseSchema,
  studentQuizDetailSchema,
  studentQuizListPageSchema,
  type QuizAuthoringDetail,
  type QuizGradeSheet,
  type QuizGradingPage,
  type QuizListPage,
  type StudentQuizDetail,
  type StudentQuizResult,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

/** Staff list. Parses the staff arm specifically — see the student hook below. */
export function useQuizList(seasonId: number | null): UseQueryResult<QuizListPage> {
  return useQuery({
    queryKey: [...queryKeys.quizzes.bySeason(seasonId), "staff"] as const,
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/quizzes?seasonId=${seasonId}`);
      return quizListPageSchema.parse(res.data.data);
    },
    enabled: seasonId !== null,
  });
}

/**
 * Student list.
 *
 * GET /quizzes returns a different row shape per role, so each hook parses its
 * own arm rather than a union — a union parse would quietly accept the staff
 * shape and hide a role-routing bug. Same reasoning as Plan 1's
 * useStudentAssignments.
 */
export function useStudentQuizList(
  seasonId: number | null,
): UseQueryResult<StudentQuizResult[]> {
  return useQuery({
    queryKey: [...queryKeys.quizzes.bySeason(seasonId), "student"] as const,
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/quizzes?seasonId=${seasonId}`);
      return studentQuizListPageSchema.parse(res.data.data).items;
    },
    enabled: seasonId !== null,
  });
}

export function useStudentQuizDetail(
  id: number | null,
): UseQueryResult<StudentQuizDetail> {
  return useQuery({
    queryKey: [...queryKeys.quizzes.detail(id), "student"] as const,
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/quizzes/${id}`);
      return studentQuizDetailSchema.parse(res.data.data);
    },
    enabled: id !== null,
  });
}

/**
 * Staff detail — the authoring/grading shape, WITH the answer key.
 *
 * A separate hook from useStudentQuizDetail even though the URL is the same,
 * because the schemas are different types and the role decides which one the
 * server sends. Never call both from one screen.
 */
export function useQuizAuthoringDetail(
  id: number | null,
  enabled: boolean,
): UseQueryResult<QuizAuthoringDetail> {
  return useQuery({
    queryKey: [...queryKeys.quizzes.detail(id), "staff"] as const,
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/quizzes/${id}`);
      return quizAuthoringDetailSchema.parse(res.data.data);
    },
    enabled: enabled && id !== null,
  });
}

/** Idempotent create-or-resume (ruling C6). Safe to call from a button that double-fires. */
export function useStartAttempt(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.put(`/api/v1/quizzes/${id}/attempt`);
      return studentQuizDetailSchema.parse(res.data.data);
    },
    onSuccess: (detail) => {
      queryClient.setQueryData([...queryKeys.quizzes.detail(id), "student"], detail);
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.lists() });
    },
  });
}

export interface AnswerInput {
  questionId: number;
  selectedIndex: number | null;
  text: string | null;
}

export function useSaveAnswers(id: number) {
  return useMutation({
    mutationFn: async (answers: AnswerInput[]) => {
      const res = await apiClient.patch(`/api/v1/quizzes/${id}/attempt`, { answers });
      return saveQuizAnswersResponseSchema.parse(res.data.data);
    },
    // Deliberately no invalidation: the runner holds the authoritative draft in
    // local state while the student is typing, and refetching mid-attempt would
    // overwrite an unflushed edit with the server's older copy.
  });
}

export function useSubmitAttempt(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post(`/api/v1/quizzes/${id}/attempt/submit`);
      return studentQuizDetailSchema.parse(res.data.data);
    },
    onSuccess: (detail) => {
      queryClient.setQueryData([...queryKeys.quizzes.detail(id), "student"], detail);
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.lists() });
    },
  });
}

export function useQuizGradeSheet(
  id: number | null,
  enabled: boolean,
): UseQueryResult<QuizGradeSheet> {
  return useQuery({
    queryKey: queryKeys.quizzes.grades(id),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/quizzes/${id}/grades`);
      return quizGradeSheetSchema.parse(res.data.data);
    },
    enabled: enabled && id !== null,
  });
}

export interface GradeEntryInput {
  studentUserId: number;
  score: number | null;
  notes: string | null;
}

export function useSaveQuizGrades(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entries: GradeEntryInput[]) => {
      const res = await apiClient.post(`/api/v1/quizzes/${id}/grades`, { entries });
      return quizGradeSheetSchema.parse(res.data.data);
    },
    onSuccess: (sheet) => {
      queryClient.setQueryData(queryKeys.quizzes.grades(id), sheet);
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.lists() });
    },
  });
}

export function useQuizAttempts(
  id: number | null,
  enabled: boolean,
): UseQueryResult<QuizGradingPage> {
  return useQuery({
    queryKey: queryKeys.quizzes.attempts(id),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/quizzes/${id}/attempts`);
      return quizGradingPageSchema.parse(res.data.data);
    },
    enabled: enabled && id !== null,
  });
}

export function useGradeEssays(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      attemptId: number;
      awards: { questionId: number; points: number }[];
    }) => {
      const res = await apiClient.post(
        `/api/v1/quizzes/${id}/attempts/${input.attemptId}/grade`,
        { awards: input.awards },
      );
      return quizGradingAttemptSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.attempts(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.lists() });
    },
  });
}

export function useReopenAttempt(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (studentUserId: number) => {
      const res = await apiClient.post(`/api/v1/quizzes/${id}/attempts/reopen`, {
        studentUserId,
      });
      return reopenAttemptResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.attempts(id) });
    },
  });
}
```

Every name in that import block is produced by Task 1; if any fails to resolve,
Task 1 was not fully applied — do not stub it locally.

- [ ] **Step 5: Regenerate typed routes and run**

Run: `pnpm turbo routes:generate --filter=@space/mobile`
Run: `cd apps/mobile && pnpm jest src/__tests__/app-layout.test.tsx src/__tests__/role-tabs.test.tsx` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.
Check `role-tabs.test.tsx` the way Plan 1 Task 2 Step 4 did: if it asserts
"every route file is a nav href" in the inverse direction, exclude
`DETAIL_ROUTE_NAMES` by importing the const rather than hardcoding a second list.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): quiz detail routes, query keys and hooks"
```

---

### Task 8: Mobile — the quizzes list (student and staff branches)

**Files:**
- Modify: `apps/mobile/app/(app)/quizzes.tsx` (replace the 9-line placeholder)
- Modify: `apps/mobile/src/__tests__/placeholder-screens.test.tsx` (drop `quizzes`)
- Test: `apps/mobile/src/__tests__/quizzes-screen.test.tsx`

**Interfaces:**
- Consumes: `useQuizList`, `useStudentQuizList` (Task 7); `useSessionStore`; `formatDate` from `../../src/lib/format`; **`useCurrentSeasonId` from `src/hooks/use-seasons.ts` (Plan 4)** for the staff branch — staff have no `scopes.activeSeasonId` (it is read from the StudentProfile and is always null for ADMIN/LEADER/SUPER), so ruling X8 makes Plan 4's hook the only source of a staff season.
- Produces: nothing downstream; the two detail screens are reached from here by `router.push`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/__tests__/quizzes-screen.test.tsx
import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import QuizzesScreen from "../../app/(app)/quizzes";

const get = apiClient.get as jest.Mock;

const studentSession = {
  user: { id: 9, name: "Test student", email: "s@jpc.test", role: "STUDENT" as const, avatarPath: null },
  scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: 7, graduationYear: null },
};
// activeSeasonId is null for every staff role on a real device (it is the
// student profile pointer) — the fixture says so, and the staff season comes
// from GET /api/v1/seasons via useCurrentSeasonId (ruling X8).
const leaderSession = {
  user: { id: 5, name: "Test leader", email: "l@jpc.test", role: "LEADER" as const, avatarPath: null },
  scopes: { seasonAdminIds: [], groupLeaderIds: [3], activeSeasonId: null, graduationYear: null },
};

const seasonsList = {
  data: { data: { seasons: [{
    id: 7, code: "s26", title: "Spring 2026", program: "TEST", year: 2026, status: "ACTIVE",
    startDate: "2026-01-01T00:00:00.000Z", endDate: "2026-12-31T00:00:00.000Z",
  }] } },
};

/** Staff screens make two GETs: the seasons list, then the season's quizzes. */
function staffGets(quizPage: unknown) {
  get.mockImplementation((url: string) =>
    url === "/api/v1/seasons"
      ? Promise.resolve(seasonsList)
      : url === "/api/v1/quizzes?seasonId=7"
        ? Promise.resolve({ data: { data: quizPage } })
        : Promise.reject(new Error(`unexpected GET ${url}`)),
  );
}

function studentRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    quizId: 41, title: "Week 1 quiz", kind: "PAPER", maxScore: 20, score: 15,
    notes: "Nice work.", gradedAt: "2099-03-02T10:00:00.000Z",
    sessionTitle: "Week 1", sessionDate: "2099-03-01T18:00:00.000Z",
    attemptStatus: null, ...over,
  };
}

function staffRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 41, title: "Week 1 quiz", kind: "PAPER", publishedAt: null, questionCount: 0,
    maxScore: 20, sessionId: 12, sessionTitle: "Week 1",
    sessionDate: "2099-03-01T18:00:00.000Z", seasonId: 7, seasonCode: "s26",
    gradedCount: 3, studentCount: 8, ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("QuizzesScreen — student", () => {
  it("lists results with the score and the average hero", async () => {
    useSessionStore.setState(studentSession);
    get.mockResolvedValue({
      data: {
        data: {
          items: [studentRow(), studentRow({ quizId: 42, title: "Week 2 quiz", score: 5, maxScore: 10 })],
          nextCursor: null,
        },
      },
    });

    renderWithProviders(<QuizzesScreen />);

    expect(await screen.findByText("Week 1 quiz")).toBeTruthy();
    // The row renders one label line, so the assertion matches the whole line —
    // getByText("15 / 20") would find nothing.
    expect(screen.getByText("Week 1 · 15 / 20")).toBeTruthy();
    // (15/20 + 5/10) / 2 = 62.5% → 63%. Presentation arithmetic over
    // server-supplied scores, not a business rule re-derived on the device.
    expect(screen.getByText("63% average")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/quizzes?seasonId=7");
  });

  it("labels an online quiz by its attempt status and opens the runner", async () => {
    useSessionStore.setState(studentSession);
    get.mockResolvedValue({
      data: {
        data: {
          items: [
            studentRow({ quizId: 51, title: "Online quiz", kind: "ONLINE", score: null,
              notes: null, gradedAt: null, attemptStatus: null }),
            studentRow({ quizId: 52, title: "Waiting quiz", kind: "ONLINE", score: null,
              notes: null, gradedAt: null, attemptStatus: "SUBMITTED" }),
          ],
          nextCursor: null,
        },
      },
    });

    renderWithProviders(<QuizzesScreen />);

    expect(await screen.findByText("Week 1 · Not started")).toBeTruthy();
    expect(screen.getByText("Week 1 · Waiting to be marked")).toBeTruthy();

    fireEvent.press(screen.getByText("Online quiz"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/quiz/[id]",
      params: { id: "51" },
    });
  });

  it("shows an empty state with no active season and never calls the API", async () => {
    useSessionStore.setState({
      ...studentSession,
      scopes: { ...studentSession.scopes, activeSeasonId: null },
    });

    renderWithProviders(<QuizzesScreen />);

    expect(await screen.findByText("No active season")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("QuizzesScreen — staff", () => {
  it("shows the server's graded progress and routes to the grading screen", async () => {
    useSessionStore.setState(leaderSession);
    staffGets({ items: [staffRow()], nextCursor: null });

    renderWithProviders(<QuizzesScreen />);

    expect(await screen.findByText("Week 1 quiz")).toBeTruthy();
    // One number from the server (ruling C4). v1 computed "graded" three
    // different ways and got three different answers.
    expect(screen.getByText("Paper · 3/8 graded")).toBeTruthy();

    fireEvent.press(screen.getByText("Week 1 quiz"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/quiz/[id]/grade",
      params: { id: "41" },
    });
  });

  it("shows an online quiz's draft state", async () => {
    useSessionStore.setState(leaderSession);
    staffGets({
      items: [staffRow({ id: 51, title: "Online quiz", kind: "ONLINE",
        publishedAt: null, questionCount: 4, maxScore: 7, gradedCount: 0 })],
      nextCursor: null,
    });

    renderWithProviders(<QuizzesScreen />);

    expect(await screen.findByText("Online quiz")).toBeTruthy();
    expect(screen.getByText("Online · Draft · 4 questions")).toBeTruthy();
  });

  it("takes a staff season from the seasons list, never from scopes.activeSeasonId (X8)", async () => {
    useSessionStore.setState(leaderSession);
    staffGets({ items: [staffRow()], nextCursor: null });

    renderWithProviders(<QuizzesScreen />);

    expect(await screen.findByText("Week 1 quiz")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/seasons");
    expect(get).toHaveBeenCalledWith("/api/v1/quizzes?seasonId=7");
  });
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/quizzes-screen.test.tsx` → FAIL (placeholder renders "This screen isn't built yet").

- [ ] **Step 2: Write the screen**

Replace `apps/mobile/app/(app)/quizzes.tsx`:

```tsx
import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import type { QuizSummary, StudentQuizResult } from "@space/shared";

import { useQuizList, useStudentQuizList } from "../../src/hooks/use-quizzes";
import { useCurrentSeasonId } from "../../src/hooks/use-seasons";
import { formatDate } from "../../src/lib/format";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

/**
 * Three v1 pages collapse into this one: /student/quizzes, /leader/quizzes and
 * /admin/quizzes (Decision D1 — one route per destination, role branches
 * inside). The branch is on role, and each branch calls its own hook, because
 * GET /quizzes returns a different row shape per role.
 */
function studentStatus(row: StudentQuizResult): string {
  if (row.kind === "PAPER") {
    // A paper quiz is only in this list because a grade row exists (R36), so a
    // null score here means the grader saved a row with no mark — rare, but
    // real, and "Pending" is the honest label.
    return row.score === null ? "Pending" : `${row.score} / ${row.maxScore}`;
  }
  if (row.attemptStatus === null) return "Not started";
  if (row.attemptStatus === "IN_PROGRESS") return "In progress";
  if (row.attemptStatus === "SUBMITTED") return "Waiting to be marked";
  return row.score === null ? "Graded" : `${row.score} / ${row.maxScore}`;
}

function StudentQuizzes({ seasonId }: { seasonId: number | null }) {
  const theme = useTheme();
  const router = useRouter();
  const { data, isPending, isError, refetch, isRefetching } = useStudentQuizList(seasonId);

  const handleRefresh = () => {
    if (seasonId !== null) void refetch();
  };

  if (seasonId === null) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState
          title="No active season"
          message="You don't have an active season right now, so there are no quizzes to show."
        />
      </Screen>
    );
  }
  if (isPending) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <LoadingState />
      </Screen>
    );
  }
  if (isError) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <ErrorState message="Couldn't load your quizzes." onRetry={refetch} />
      </Screen>
    );
  }

  // Scored rows only, so an unattempted quiz cannot drag the average down.
  const scored = data.filter((r) => r.score !== null && r.maxScore > 0);
  const average =
    scored.length === 0
      ? null
      : Math.round(
          (scored.reduce((sum, r) => sum + (r.score as number) / r.maxScore, 0) / scored.length) *
            100,
        );

  return (
    <Screen edges={["top", "left", "right"]} onRefresh={handleRefresh} refreshing={isRefetching} scroll>
      {average !== null ? (
        <Card style={{ marginBottom: theme.spacing.sm }}>
          <Text variant="heading">{`${average}% average`}</Text>
          <Text variant="label" color={theme.colors.neutral[600]}>
            {`Across ${scored.length} graded ${scored.length === 1 ? "quiz" : "quizzes"}`}
          </Text>
        </Card>
      ) : null}

      {data.length === 0 ? (
        <EmptyState title="No quizzes" message="This season doesn't have any quizzes for you yet." />
      ) : (
        data.map((row) => (
          <Pressable
            key={`${row.kind}-${row.quizId}`}
            accessibilityRole="button"
            onPress={() =>
              router.push({ pathname: "/quiz/[id]", params: { id: String(row.quizId) } })
            }
          >
            <Card style={{ marginBottom: theme.spacing.sm }}>
              <Text variant="heading">{row.title}</Text>
              <Text variant="label" color={theme.colors.neutral[600]}>
                {`${row.sessionTitle ?? "No session"} · ${studentStatus(row)}`}
              </Text>
              {row.notes ? <Text variant="body">{row.notes}</Text> : null}
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

function staffStatus(row: QuizSummary): string {
  if (row.kind === "PAPER") return `Paper · ${row.gradedCount}/${row.studentCount} graded`;
  const state = row.publishedAt === null ? "Draft" : `${row.gradedCount}/${row.studentCount} graded`;
  return `Online · ${state} · ${row.questionCount} question${row.questionCount === 1 ? "" : "s"}`;
}

function StaffQuizzes() {
  const theme = useTheme();
  const router = useRouter();
  // Ruling X8: a staff season comes from Plan 4's hook — never
  // scopes.activeSeasonId, which is the student-profile pointer and always
  // null for staff.
  const current = useCurrentSeasonId();
  const seasonId = current.seasonId;
  const { data, isPending, isError, refetch, isRefetching } = useQuizList(seasonId);

  const handleRefresh = () => {
    if (seasonId !== null) void refetch();
    else current.refetch();
  };

  return (
    <Screen edges={["top", "left", "right"]} onRefresh={handleRefresh} refreshing={isRefetching} scroll>
      {current.isPending ? (
        <LoadingState />
      ) : current.isError ? (
        <ErrorState message="Couldn't load your seasons." onRetry={current.refetch} />
      ) : seasonId === null ? (
        <EmptyState title="No season" message="You aren't attached to a season yet." />
      ) : isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load quizzes." onRetry={refetch} />
      ) : data.items.length === 0 ? (
        <EmptyState title="No quizzes" message="This season doesn't have any quizzes yet." />
      ) : (
        data.items.map((row) => (
          <Pressable
            key={row.id}
            accessibilityRole="button"
            onPress={() =>
              router.push({ pathname: "/quiz/[id]/grade", params: { id: String(row.id) } })
            }
          >
            <Card style={{ marginBottom: theme.spacing.sm }}>
              <Text variant="heading">{row.title}</Text>
              <Text variant="label" color={theme.colors.neutral[600]}>
                {staffStatus(row)}
              </Text>
              <Text variant="caption" color={theme.colors.neutral[600]}>
                {row.sessionDate ? formatDate(row.sessionDate) : "No session"}
              </Text>
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

export default function QuizzesScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  // A student's season IS the pinned profile pointer.
  const studentSeasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);

  if (role === "STUDENT") return <StudentQuizzes seasonId={studentSeasonId} />;
  if (role === "LEADER" || role === "ADMIN" || role === "SUPER") {
    return <StaffQuizzes />;
  }
  // MENTOR has no quiz access anywhere in v1 and /quizzes is not in the mentor
  // nav (spec D11). Confirmed as deliberate rather than widened here.
  return (
    <Screen edges={["top", "left", "right"]}>
      <EmptyState title="Quizzes" message="This screen isn't available for your role." />
    </Screen>
  );
}
```

Check `Text`'s real variants in `src/ui/Text.tsx` and `Screen`'s `scroll` /
`onRefresh` prop names before relying on them, exactly as Plan 1 Task 3 did.

- [ ] **Step 3: Drop `quizzes` from `placeholder-screens.test.tsx`** (entry and
import — it asserts each placeholder renders "This screen isn't built yet", no
longer true here). There is no count to change: Plan 1 Task 0 removed the
length pin (ruling X9).

- [ ] **Step 4: Run**

Run: `cd apps/mobile && pnpm jest src/__tests__/quizzes-screen.test.tsx src/__tests__/placeholder-screens.test.tsx` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): quizzes list with student and staff branches"
```

---

### Task 9: Mobile — the quiz runner

**Files:**
- Modify: `apps/mobile/app/(app)/quiz/[id]/index.tsx` (replace Task 7's stub)
- Test: `apps/mobile/src/__tests__/quiz-runner.test.tsx`

**Interfaces:**
- Consumes: `useStudentQuizDetail`, `useStartAttempt`, `useSaveAnswers`, `useSubmitAttempt`, `useQuizAuthoringDetail` (Task 7).
- Produces: nothing downstream.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/__tests__/quiz-runner.test.tsx
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), put: jest.fn(), patch: jest.fn(), post: jest.fn() },
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41" }),
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import QuizDetailScreen from "../../app/(app)/quiz/[id]/index";

const get = apiClient.get as jest.Mock;
const put = apiClient.put as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const post = apiClient.post as jest.Mock;

const studentSession = {
  user: { id: 9, name: "Test student", email: "s@jpc.test", role: "STUDENT" as const, avatarPath: null },
  scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: 7, graduationYear: null },
};

const mcq = {
  id: 100, order: 0, type: "MCQ" as const, prompt: "Capital of France?", points: 2,
  options: ["London", "Paris"], selectedIndex: null, text: null,
  isCorrect: null, pointsAwarded: null,
};
const essay = {
  id: 101, order: 1, type: "ESSAY" as const, prompt: "Discuss.", points: 5,
  options: [], selectedIndex: null, text: null, isCorrect: null, pointsAwarded: null,
};

function detail(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 41, title: "Week 1 quiz", kind: "ONLINE", seasonId: 7, maxScore: 7,
    sessionTitle: "Week 1", attemptId: null, attemptNumber: 0, status: null,
    totalScore: null, submittedAt: null, gradedAt: null,
    questions: [mcq, essay], ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(studentSession);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("quiz runner", () => {
  it("starts an attempt on an explicit press, never on render (ruling C6)", async () => {
    get.mockResolvedValue({ data: { data: detail() } });
    put.mockResolvedValue({
      data: { data: detail({ attemptId: 900, attemptNumber: 1, status: "IN_PROGRESS" }) },
    });

    renderWithProviders(<QuizDetailScreen />);

    expect(await screen.findByText("Week 1 quiz")).toBeTruthy();
    expect(put).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText("Start quiz"));
    await waitFor(() => expect(put).toHaveBeenCalledWith("/api/v1/quizzes/41/attempt"));
    expect(await screen.findByText("Capital of France?")).toBeTruthy();
  });

  it("debounces answer saves into one batched PATCH and shows the save state", async () => {
    get.mockResolvedValue({
      data: { data: detail({ attemptId: 900, attemptNumber: 1, status: "IN_PROGRESS" }) },
    });
    patch.mockResolvedValue({ data: { data: { saved: 2 } } });

    renderWithProviders(<QuizDetailScreen />);

    fireEvent.press(await screen.findByLabelText("Answer 1 option 2: Paris"));
    fireEvent.changeText(screen.getByLabelText("Answer 2"), "Because of the river.");
    // Nothing has gone out yet — v1 fired one request per keystroke-ish event
    // and ignored the result (R55), so a failed save was silent and the student
    // saw their answer in local state as though it had persisted.
    expect(patch).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/quizzes/41/attempt", {
        answers: [
          { questionId: 100, selectedIndex: 1, text: null },
          { questionId: 101, selectedIndex: null, text: "Because of the river." },
        ],
      }),
    );
    expect(await screen.findByText("Saved")).toBeTruthy();
  });

  it("says so when a save fails instead of pretending it worked", async () => {
    get.mockResolvedValue({
      data: { data: detail({ attemptId: 900, attemptNumber: 1, status: "IN_PROGRESS" }) },
    });
    patch.mockRejectedValue(new Error("offline"));

    renderWithProviders(<QuizDetailScreen />);
    fireEvent.press(await screen.findByLabelText("Answer 1 option 2: Paris"));
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(await screen.findByText("Not saved")).toBeTruthy();
  });

  it("keeps Submit disabled until every question is answered (R59)", async () => {
    get.mockResolvedValue({
      data: { data: detail({ attemptId: 900, attemptNumber: 1, status: "IN_PROGRESS" }) },
    });
    patch.mockResolvedValue({ data: { data: { saved: 1 } } });
    post.mockResolvedValue({
      data: {
        data: detail({
          attemptId: 900, attemptNumber: 1, status: "SUBMITTED",
          questions: [
            { ...mcq, selectedIndex: 1 },
            { ...essay, text: "Because." },
          ],
        }),
      },
    });

    renderWithProviders(<QuizDetailScreen />);

    fireEvent.press(await screen.findByLabelText("Answer 1 option 2: Paris"));
    fireEvent.press(screen.getByText("Submit"));
    // Still incomplete: the essay is blank. The server refuses this too
    // (409 attempt_incomplete) — the disabled control is the courtesy, the
    // server check is the rule.
    expect(post).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText("Answer 2"), "Because.");
    fireEvent.press(screen.getByText("Submit"));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/attempt/submit"),
    );
  });

  it("shows the graded result per question without ever seeing an answer key", async () => {
    get.mockResolvedValue({
      data: {
        data: detail({
          attemptId: 900, attemptNumber: 1, status: "GRADED", totalScore: 5,
          gradedAt: "2099-03-02T10:00:00.000Z",
          questions: [
            { ...mcq, selectedIndex: 0, isCorrect: false, pointsAwarded: 0 },
            { ...essay, text: "Because.", pointsAwarded: 5 },
          ],
        }),
      },
    });

    renderWithProviders(<QuizDetailScreen />);

    expect(await screen.findByText("5 / 7")).toBeTruthy();
    // R34: the student is told which MCQ was wrong, and never what was right —
    // there is no correctIndex in the contract to render.
    expect(screen.getByText("Incorrect")).toBeTruthy();
  });

  it("tells a submitted student to wait rather than offering the form again", async () => {
    get.mockResolvedValue({
      data: {
        data: detail({ attemptId: 900, attemptNumber: 1, status: "SUBMITTED" }),
      },
    });

    renderWithProviders(<QuizDetailScreen />);

    expect(await screen.findByText(/waiting to be marked/i)).toBeTruthy();
    expect(screen.queryByText("Submit")).toBeNull();
  });

  it("gives staff a read-only preview with a link to grading", async () => {
    useSessionStore.setState({
      user: { id: 5, name: "Test leader", email: "l@jpc.test", role: "LEADER" as const, avatarPath: null },
      scopes: { seasonAdminIds: [], groupLeaderIds: [3], activeSeasonId: null, graduationYear: null },
    });
    get.mockResolvedValue({
      data: {
        data: {
          id: 41, title: "Week 1 quiz", kind: "ONLINE", seasonId: 7, seasonCode: "s26",
          sessionId: 12, sessionTitle: "Week 1", publishedAt: "2099-02-01T00:00:00.000Z",
          maxScore: 7, attemptCount: 2, gradeCount: 0,
          canEditStructure: false, canManage: false,
          questions: [{ id: 100, order: 0, type: "MCQ", prompt: "Capital of France?",
            points: 2, options: ["London", "Paris"], correctIndex: 1 }],
        },
      },
    });

    renderWithProviders(<QuizDetailScreen />);

    expect(await screen.findByText("Capital of France?")).toBeTruthy();
    // Staff DO see the key — that is the audience it exists for.
    expect(screen.getByText("Correct answer: Paris")).toBeTruthy();
    fireEvent.press(screen.getByText("Grade this quiz"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/quiz/[id]/grade",
      params: { id: "41" },
    });
  });
});
```

**Verify at implementation time:** RNTL 13's `waitFor` detects Jest fake timers
and advances them itself; the explicit `act(() => jest.advanceTimersByTime(...))`
above is there to fire the debounce deterministically before the assertion. If
the combination hangs, switch the debounce delay to a module-level exported
constant and have the test import it — do not drop the debounce assertion.

- [ ] **Step 2: Implement the runner**

Replace `apps/mobile/app/(app)/quiz/[id]/index.tsx`. Structure, in full:

```tsx
import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable } from "react-native";
import type { QuizQuestionStudent, StudentQuizDetail } from "@space/shared";

import {
  useQuizAuthoringDetail,
  useSaveAnswers,
  useStartAttempt,
  useStudentQuizDetail,
  useSubmitAttempt,
  type AnswerInput,
} from "../../../../src/hooks/use-quizzes";
import { useSessionStore } from "../../../../src/store/session";
import { useTheme } from "../../../../src/theme";
import {
  Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text,
} from "../../../../src/ui";

/**
 * How long after the last edit the pending answers are flushed.
 *
 * v1 saved each answer fire-and-forget and relied on re-saving everything at
 * submit to cover the losses (R55, R56). On a phone that assumption breaks: the
 * app is backgrounded, the network drops mid-quiz, and the "one sitting" never
 * happens — and because an IN_PROGRESS attempt has no expiry (R47) and blocks
 * the student from ever starting again (R45), a lost save is not a lost answer,
 * it is a stuck student. So: a real debounce, a batched PATCH, and a visible
 * save state.
 */
const SAVE_DEBOUNCE_MS = 1000;

type SaveState = "idle" | "saving" | "saved" | "error";
```

Then the pieces, each described precisely enough to write directly:

1. **`QuizDetailScreen`** — parse `id` from `useLocalSearchParams` the way Plan 1
   Task 3 does (`Number(raw)`, integer and positive, else `null`). Read
   `role` from the store. If `role === "STUDENT"` render `<StudentRunner id={id} />`;
   if `LEADER | ADMIN | SUPER` render `<StaffPreview id={id} />`; otherwise the
   role `EmptyState`. Null id → `EmptyState "Not found"`.

2. **`StudentRunner`** — `useStudentQuizDetail(id)`. States: `LoadingState`,
   `ErrorState` with `onRetry={refetch}`, then a branch on `data.status`:
   - `null` → the not-started card: title, `${questions.length} questions ·
     ${maxScore} points`, and a `Button title="Start quiz"` calling
     `start.mutate()` from `useStartAttempt(id)` with `loading={start.isPending}`.
     **The button is the only thing that creates an attempt** — nothing writes
     during a render (ruling C6; and v1 had this property too, R48).
   - `"IN_PROGRESS"` → `<AttemptForm detail={data} id={id} />`.
   - `"SUBMITTED"` → a card reading "Submitted — waiting to be marked", the
     submitted date, and no controls.
   - `"GRADED"` → the result: `${totalScore} / ${maxScore}` as a heading, then
     each question with its prompt, the student's own answer, and
     `isCorrect === true ? "Correct" : isCorrect === false ? "Incorrect" : null`
     plus `pointsAwarded` where non-null. **Never render a correct answer — the
     contract has none to render.**

3. **`AttemptForm`** — local state `answers: Record<number, {selectedIndex, text}>`
   seeded from `detail.questions` (each question's saved `selectedIndex`/`text`,
   so a resumed attempt shows what the server has). A `pendingRef =
   useRef<Set<number>>(new Set())` of question ids edited since the last flush,
   a `timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)`, and
   `saveState: SaveState`.
   - `queueSave(questionId)` — record the id in `pendingRef`, clear any existing
     timer, set `saveState` to `"saving"`, and start a `SAVE_DEBOUNCE_MS` timer
     whose callback builds `AnswerInput[]` from `pendingRef` **in question
     order** and calls `save.mutate(payload, { onSuccess: () => { pendingRef.current.clear(); setSaveState("saved"); }, onError: () => setSaveState("error") })`.
   - `useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, [])`
     so a screen that unmounts mid-debounce does not fire into a dead component.
   - MCQ rendering: each option a `Pressable` with
     `accessibilityLabel={`Answer ${index + 1} option ${optionIndex + 1}: ${option}`}`,
     visually selected when `answers[q.id].selectedIndex === optionIndex`;
     pressing sets it and calls `queueSave(q.id)`.
   - ESSAY rendering: `<Input label={`Answer ${index + 1}`} multiline
     numberOfLines={6} value={...} onChangeText={...} />`, calling `queueSave(q.id)`
     on change.
   - A save-state line: `"Saving…"` / `"Saved"` / `"Not saved"` (`"Not saved"`
     in `theme.colors.danger`-equivalent, plus a `Button title="Retry save"`
     that re-fires the flush immediately).
   - `Button title="Submit"` with `disabled={!isComplete || save.isPending}`,
     where `isComplete` is every MCQ having a non-null `selectedIndex` and every
     ESSAY a non-blank trimmed `text` — the same rule the server enforces (R59).
     `onPress` flushes any pending answers first (await the mutation), then
     calls `submit.mutate()`. A `409 attempt_incomplete` from the server still
     surfaces as an inline error message; the disabled button is a courtesy, not
     the rule.

4. **`StaffPreview`** — `useQuizAuthoringDetail(id, true)`. Renders the title,
   the publish state, and each question with its prompt, points, options, and —
   for MCQ — `Correct answer: ${options[correctIndex]}` when `correctIndex` is
   non-null and in range. A `Button title="Grade this quiz"` pushing
   `{ pathname: "/quiz/[id]/grade", params: { id: String(id) } }`. For a PAPER
   quiz, render "This is a paper quiz — there are no questions to preview."
   rather than redirecting away, which is what v1's builder route did
   (`edit/page.tsx:30-32`).

- [ ] **Step 3: Run**

Run: `cd apps/mobile && pnpm jest src/__tests__/quiz-runner.test.tsx` → PASS (all 7).
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): quiz runner with debounced batched saves and a visible save state"
```

---

### Task 10: Mobile — the grading screen

**Files:**
- Modify: `apps/mobile/app/(app)/quiz/[id]/grade.tsx` (replace Task 7's stub)
- Test: `apps/mobile/src/__tests__/quiz-grading.test.tsx`

**Interfaces:**
- Consumes: `useQuizAuthoringDetail`, `useQuizGradeSheet`, `useSaveQuizGrades`, `useQuizAttempts`, `useGradeEssays`, `useReopenAttempt` (Task 7).
- Produces: nothing downstream.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/__tests__/quiz-grading.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import QuizGradeScreen from "../../app/(app)/quiz/[id]/grade";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const leaderSession = {
  user: { id: 5, name: "Test leader", email: "l@jpc.test", role: "LEADER" as const, avatarPath: null },
  scopes: { seasonAdminIds: [], groupLeaderIds: [3], activeSeasonId: null, graduationYear: null },
};

function authoring(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 41, title: "Week 1 quiz", kind: "PAPER", seasonId: 7, seasonCode: "s26",
    sessionId: 12, sessionTitle: "Week 1", publishedAt: null, maxScore: 20,
    attemptCount: 0, gradeCount: 0, canEditStructure: false, canManage: false,
    questions: [], ...over,
  };
}

const gradeSheet = {
  id: 41, title: "Week 1 quiz", kind: "PAPER", maxScore: 20, seasonId: 7,
  sessionTitle: "Week 1", studentCount: 2,
  rows: [
    { studentUserId: 9, studentName: "Test student", score: null, notes: null,
      gradedAt: null, gradedByName: null },
    { studentUserId: 10, studentName: "Second student", score: 18, notes: "Good.",
      gradedAt: "2099-03-02T10:00:00.000Z", gradedByName: "Test leader" },
  ],
};

const attemptsPage = {
  id: 41, title: "Online quiz", kind: "ONLINE", maxScore: 7, hasEssays: true,
  studentCount: 2,
  items: [
    {
      attemptId: 900, studentUserId: 9, studentName: "Test student", attemptNumber: 1,
      status: "SUBMITTED", autoScore: 2, manualScore: null, totalScore: null,
      submittedAt: "2099-03-02T10:00:00.000Z", gradedByName: null,
      answers: [
        { questionId: 100, type: "MCQ", prompt: "Capital of France?", points: 2,
          options: ["London", "Paris"], correctIndex: 1, selectedIndex: 1,
          isCorrect: true, text: null, pointsAwarded: 2 },
        { questionId: 101, type: "ESSAY", prompt: "Discuss.", points: 5,
          options: [], correctIndex: null, selectedIndex: null, isCorrect: null,
          text: "Because of the river.", pointsAwarded: null },
      ],
    },
  ],
  waiting: [{ studentUserId: 10, studentName: "Second student", startedAt: null }],
  nextCursor: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(leaderSession);
});

describe("grading screen — PAPER", () => {
  beforeEach(() => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/quizzes/41"
        ? Promise.resolve({ data: { data: authoring() } })
        : Promise.resolve({ data: { data: gradeSheet } }),
    );
  });

  it("renders the grid with existing marks and saves only edited rows", async () => {
    post.mockResolvedValue({ data: { data: gradeSheet } });

    renderWithProviders(<QuizGradeScreen />);

    expect(await screen.findByText("Test student")).toBeTruthy();
    expect(screen.getByDisplayValue("18")).toBeTruthy();
    expect(screen.getByText("1/2 graded")).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText("Score for Test student"), "15");
    fireEvent.press(screen.getByText("Save grades"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/grades", {
        // Only the touched row. Sending every row would restamp gradedBy and
        // gradedAt on marks this caller never made — the same reasoning as the
        // attendance screen's untouched-row rule.
        entries: [{ studentUserId: 9, score: 15, notes: null }],
      }),
    );
  });

  it("clears a grade when the field is emptied", async () => {
    post.mockResolvedValue({ data: { data: gradeSheet } });

    renderWithProviders(<QuizGradeScreen />);

    fireEvent.changeText(await screen.findByLabelText("Score for Second student"), "");
    fireEvent.press(screen.getByText("Save grades"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/grades", {
        entries: [{ studentUserId: 10, score: null, notes: "Good." }],
      }),
    );
  });

  it("surfaces the server's over-max refusal instead of clamping locally", async () => {
    post.mockRejectedValue({
      response: { status: 400, data: { error: { code: "score_exceeds_max",
        message: "This quiz is out of 20." } } },
    });

    renderWithProviders(<QuizGradeScreen />);
    fireEvent.changeText(await screen.findByLabelText("Score for Test student"), "25");
    fireEvent.press(screen.getByText("Save grades"));

    // v1's only bound was Math.min in the form, so an above-max score was
    // silently rewritten on the way in and nobody ever saw the mistake.
    expect(await screen.findByText("This quiz is out of 20.")).toBeTruthy();
  });
});

describe("grading screen — ONLINE", () => {
  beforeEach(() => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/quizzes/41"
        ? Promise.resolve({
            data: { data: authoring({ kind: "ONLINE", maxScore: 7,
              publishedAt: "2099-02-01T00:00:00.000Z", attemptCount: 1 }) },
          })
        : Promise.resolve({ data: { data: attemptsPage } }),
    );
  });

  it("lists submitted attempts, shows the key to the grader, and marks essays", async () => {
    post.mockResolvedValue({ data: { data: { attemptId: 900 } } });

    renderWithProviders(<QuizGradeScreen />);

    expect(await screen.findByText("Test student")).toBeTruthy();
    expect(screen.getByText("Because of the river.")).toBeTruthy();
    // R103: the grader sees what was right. This is the audience the answer key
    // exists for — and the student contract has no field to carry it.
    expect(screen.getByText("Correct answer: Paris")).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText("Marks for Discuss."), "4");
    fireEvent.press(screen.getByText("Save marks"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/attempts/900/grade", {
        awards: [{ questionId: 101, points: 4 }],
      }),
    );
  });

  it("shows students who have not finished rather than dropping them (R102, D5)", async () => {
    renderWithProviders(<QuizGradeScreen />);

    expect(await screen.findByText("Waiting")).toBeTruthy();
    expect(screen.getByText("Second student")).toBeTruthy();
    expect(screen.getByText("Not started")).toBeTruthy();
  });

  it("lets a leader reopen a graded attempt", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/quizzes/41"
        ? Promise.resolve({
            data: { data: authoring({ kind: "ONLINE", maxScore: 7,
              publishedAt: "2099-02-01T00:00:00.000Z", attemptCount: 1 }) },
          })
        : Promise.resolve({
            data: {
              data: {
                ...attemptsPage,
                items: [{ ...attemptsPage.items[0], status: "GRADED",
                  manualScore: 4, totalScore: 6, gradedByName: "Test leader" }],
              },
            },
          }),
    );
    post.mockResolvedValue({ data: { data: { attemptId: 901, attemptNumber: 2 } } });

    renderWithProviders(<QuizGradeScreen />);

    fireEvent.press(await screen.findByText("Reopen for a retake"));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/attempts/reopen", {
        studentUserId: 9,
      }),
    );
  });
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/quiz-grading.test.tsx` → FAIL (stub).

- [ ] **Step 2: Implement the screen**

`apps/mobile/app/(app)/quiz/[id]/grade.tsx`, in three components:

1. **`QuizGradeScreen`** — parse `id`; read `role`. Non-staff
   (`STUDENT`, `MENTOR`, no user) → `EmptyState "This screen isn't available for
   your role."` with no query. Staff → `useQuizAuthoringDetail(id, true)` for
   `kind`, `title`, `maxScore` and `canManage`, then branch:
   `kind === "PAPER"` → `<PaperGrid id={id} detail={detail} />`,
   else `<OnlineGrading id={id} detail={detail} />`. Two v1 pages collapse here
   (`/admin/season/[code]/quizzes/[id]/grade` and
   `/leader/sessions/[id]/quiz/[quizId]`), ending the asymmetry where the leader
   route was `requireRole(["LEADER"])` and the admin route `["ADMIN","SUPER"]`,
   so neither role could open the other's page.

2. **`PaperGrid`** — `useQuizGradeSheet(id, true)` + `useSaveQuizGrades(id)`.
   Header: `${sheet.rows.filter(r => r.score !== null).length}/${sheet.studentCount} graded`
   and `Out of ${sheet.maxScore}`. Local state
   `edits: Record<number, { score: string; notes: string }>` holding **only
   touched rows** — seeded lazily on first edit from the row's current values.
   Each row renders the student name, an
   `<Input label={`Score for ${name}`} keyboardType="number-pad" />` and an
   `<Input label={`Notes for ${name}`} />`, plus a caption
   `Graded by ${gradedByName}` when present (D13 — information no v1 user could
   see). "Save grades" builds `entries` from `edits` only: an empty score string
   becomes `score: null` (an explicit clear), otherwise `Number(value)`; notes
   fall back to the row's existing notes. Errors: read
   `err.response?.data?.error?.message` and render it in an inline error line —
   **never clamp or pre-truncate a score locally**; the server is the bound
   (D7). Disable the button while `save.isPending`.

3. **`OnlineGrading`** — `useQuizAttempts(id, true)`, `useGradeEssays(id)`,
   `useReopenAttempt(id)`. Header: `${items.length}/${studentCount} submitted`.
   For each `item`, a `Card` with the student name, `Attempt ${attemptNumber}`,
   the status, `Auto ${autoScore ?? 0}` and `Total ${totalScore ?? "—"}`, plus
   `Graded by ${gradedByName}` when present. Inside, each answer in order:
   - MCQ → prompt, `Their answer: ${options[selectedIndex] ?? "No answer"}`,
     `Correct answer: ${options[correctIndex]}` when `correctIndex` is non-null
     and in range, and `isCorrect ? "Correct" : "Incorrect"`.
   - ESSAY → prompt, the `text` rendered as plain text (no HTML anywhere in this
     domain — ruling C11 has nothing to sanitise but nothing may be rendered as
     markup either), and an
     `<Input label={`Marks for ${prompt}`} keyboardType="number-pad" />` seeded
     from `pointsAwarded ?? ""`, with a caption `out of ${points}`.
   - "Save marks" sends **every essay** of that attempt (the server rejects a
     partial payload with `awards_incomplete`, which is the point — v1 silently
     lowered the total instead). Server errors surface inline, same as the grid.
   - For **every** caller who reached this screen — not gated on
     `detail.canManage`, because reopen is gated server-side on
     `canGradeQuiz` (Task 5: leaders may reopen; v1's admin-only gate was the
     bug) — a `Button title="Reopen for a retake" variant="secondary"` calling
     `reopen.mutate(item.studentUserId)`, shown for a `GRADED` or `SUBMITTED`
     attempt and hidden for `IN_PROGRESS`.
   - Below the list, a "Waiting" section from `page.waiting`: each entry as
     `name` plus `startedAt === null ? "Not started" : "In progress since ${formatDate(startedAt)}"`,
     with the same reopen control for an in-progress row. This section is D5's
     answer to R102 — v1 dropped these students from the screen entirely and
     gave the grader no way to notice, let alone act.

- [ ] **Step 3: Run**

Run: `cd apps/mobile && pnpm jest src/__tests__/quiz-grading.test.tsx` → PASS (all 6).
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): quiz grading screen for paper grids and online attempts"
```

---

### Task 11: Mobile — quiz authoring (create, build, reorder, publish)

The authoring UI v1 had (`src/components/quizzes/create-quiz-form.tsx`,
`src/components/quizzes/quiz-builder.tsx`,
`src/app/admin/season/[code]/quizzes/[quizId]/edit/page.tsx`, actions in
`src/lib/quiz-actions.ts:29-84, 218-328`) over this plan's own Task 2–3
endpoints; spec 12 §9. Without it the closing gate's first device-checklist
item cannot be executed (coverage gap G8). Two routes: `quiz/new` (the create
form) and `quiz/[id]/edit` (the builder). Divergences from v1, each already
decided by the backend tasks: questions can be **reordered** (R20 — v1 had no
reorder at all); the builder **locks** once a student has started
(`canEditStructure`, spec D3) instead of letting edits cascade-delete answers;
unpublish of a quiz with graded attempts is refused with the server's message
(D4); a PAPER quiz opens a "no questions" card rather than v1's silent
redirect (`edit/page.tsx:30-32`).

**Files:**
- Create: `apps/mobile/src/hooks/use-quiz-authoring.ts`
- Create: `apps/mobile/src/components/QuestionEditor.tsx`
- Create: `apps/mobile/app/(app)/quiz/new.tsx`, `apps/mobile/app/(app)/quiz/[id]/edit.tsx`
- Modify: `apps/mobile/app/(app)/_layout.tsx` (`DETAIL_ROUTE_NAMES` gains `"quiz/new"`, `"quiz/[id]/edit"`)
- Modify: `apps/mobile/app/(app)/quizzes.tsx` (staff branch: "New quiz" button; ADMIN/SUPER open a draft ONLINE quiz in the builder)
- Modify: `apps/mobile/app/(app)/quiz/[id]/index.tsx` (`StaffPreview` gains an "Edit quiz" button when `canManage`)
- Test: `apps/mobile/src/__tests__/quiz-authoring.test.tsx` (new), `apps/mobile/src/__tests__/quizzes-screen.test.tsx` (extend), `apps/mobile/src/__tests__/app-layout.test.tsx` (extend)

**Interfaces:**
- Consumes: Task 1's `createQuizRequestSchema`, `quizQuestionRequestSchema`, `QuizQuestionInput`, `quizQuestionAuthoringSchema`, `quizCreatedResponseSchema`, `quizUpdatedResponseSchema`, `quizQuestionDeletedResponseSchema`, `reorderQuestionsResponseSchema`, `publishQuizResponseSchema`; Task 7's `useQuizAuthoringDetail`, `queryKeys.quizzes`; Plan 4's `useCurrentSeasonId` and `apiErrorMessage`; Phase 0's `useSeasonSessions`.
- Produces: hooks `useCreateQuiz()`, `useUpdateQuiz(id)`, `useAddQuestion(id)`, `useUpdateQuestion(id)`, `useDeleteQuestion(id)`, `useReorderQuestions(id)`, `usePublishQuiz(id)`; component `<QuestionEditor />`; routes `/quiz/new` and `/quiz/[id]/edit` (route names `quiz/new`, `quiz/[id]/edit`).

- [ ] **Step 1: Failing layout assertion.** In `app-layout.test.tsx`, extend
Task 7's `it.each` list to
`["quiz/[id]/index", "quiz/[id]/grade", "quiz/[id]/edit", "quiz/new"]`. Run
`cd apps/mobile && pnpm jest src/__tests__/app-layout.test.tsx` → FAIL (two
names absent).

- [ ] **Step 2: Failing screen tests.**

```tsx
// apps/mobile/src/__tests__/quiz-authoring.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41" }),
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import NewQuizScreen from "../../app/(app)/quiz/new";
import QuizEditScreen from "../../app/(app)/quiz/[id]/edit";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const put = apiClient.put as jest.Mock;
const del = apiClient.delete as jest.Mock;

const adminSession = {
  user: { id: 2, name: "Test admin", email: "a@jpc.test", role: "ADMIN" as const, avatarPath: null },
  scopes: { seasonAdminIds: [7], groupLeaderIds: [], activeSeasonId: null, graduationYear: null },
};
const leaderSession = {
  user: { id: 5, name: "Test leader", email: "l@jpc.test", role: "LEADER" as const, avatarPath: null },
  scopes: { seasonAdminIds: [], groupLeaderIds: [3], activeSeasonId: null, graduationYear: null },
};

const seasonsList = {
  data: { data: { seasons: [{
    id: 7, code: "s26", title: "Spring 2026", program: "TEST", year: 2026, status: "ACTIVE",
    startDate: "2026-01-01T00:00:00.000Z", endDate: "2026-12-31T00:00:00.000Z",
  }] } },
};
const sessionsList = {
  data: { data: { sessions: [{
    id: 12, title: "Week 1", startsAt: "2099-03-01T18:00:00.000Z", dayKey: "2099-03-01",
    startTime: "20:00", // required since Plan 6 (org wall-clock start, X13)
    durationMinutes: 60, location: null, recurrenceGroupId: null, attendanceMarked: false,
    seasonId: 7, seasonCode: "s26", seasonTitle: "Spring 2026",
    checkInToken: null, checkInOpenAt: null, checkInClosedAt: null,
  }] } },
};

const mcq = {
  id: 100, order: 0, type: "MCQ" as const, prompt: "Capital of France?", points: 2,
  options: ["London", "Paris"], correctIndex: 1,
};
const essay = {
  id: 101, order: 1, type: "ESSAY" as const, prompt: "Discuss.", points: 5,
  options: [] as string[], correctIndex: null,
};

function authoring(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 41, title: "Week 1 quiz", kind: "ONLINE", seasonId: 7, seasonCode: "s26",
    sessionId: 12, sessionTitle: "Week 1", publishedAt: null, maxScore: 7,
    attemptCount: 0, gradeCount: 0, canEditStructure: true, canManage: true,
    questions: [mcq, essay], ...over,
  };
}

const conflict = (code: string, message: string) =>
  Object.assign(new Error("409"), {
    isAxiosError: true,
    response: { status: 409, data: { error: { code, message } } },
  });

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("NewQuizScreen", () => {
  beforeEach(() => {
    useSessionStore.setState(adminSession);
    get.mockImplementation((url: string) =>
      url === "/api/v1/seasons"
        ? Promise.resolve(seasonsList)
        : url === "/api/v1/seasons/7/sessions"
          ? Promise.resolve(sessionsList)
          : Promise.reject(new Error(`unexpected GET ${url}`)),
    );
  });

  it("creates an ONLINE quiz on a session in the current season and opens the builder", async () => {
    post.mockResolvedValue({ data: { data: { id: 77 } } });
    renderWithProviders(<NewQuizScreen />);

    fireEvent.changeText(await screen.findByLabelText("Title"), "Week 3 quiz");
    fireEvent.press(screen.getByText("Online"));
    fireEvent.press(await screen.findByText("Week 1"));
    fireEvent.press(screen.getByText("Create & add questions"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/quizzes", {
        seasonId: 7, sessionId: 12, title: "Week 3 quiz", kind: "ONLINE",
      }),
    );
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/quiz/[id]/edit", params: { id: "77" } });
  });

  it("creates a PAPER quiz with v1's default max score and opens its grade sheet", async () => {
    post.mockResolvedValue({ data: { data: { id: 78 } } });
    renderWithProviders(<NewQuizScreen />);

    fireEvent.changeText(await screen.findByLabelText("Title"), "Paper quiz");
    fireEvent.press(screen.getByText("Create quiz"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/quizzes", {
        seasonId: 7, sessionId: null, title: "Paper quiz", kind: "PAPER", maxScore: 100,
      }),
    );
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/quiz/[id]/grade", params: { id: "78" } });
  });

  it("refuses a PAPER quiz with no max score before calling the API", async () => {
    renderWithProviders(<NewQuizScreen />);

    fireEvent.changeText(await screen.findByLabelText("Title"), "Paper quiz");
    fireEvent.changeText(screen.getByLabelText("Max score"), "");
    fireEvent.press(screen.getByText("Create quiz"));

    expect(await screen.findByText("Max score is required for paper quizzes.")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("is not available to a leader and fetches nothing", async () => {
    useSessionStore.setState(leaderSession);
    get.mockReset();
    renderWithProviders(<NewQuizScreen />);
    expect(await screen.findByText("Not available")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("QuizEditScreen (the builder)", () => {
  beforeEach(() => {
    useSessionStore.setState(adminSession);
  });

  it("lists questions in order with the answer key", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    renderWithProviders(<QuizEditScreen />);

    expect(await screen.findByText("1. Capital of France?")).toBeTruthy();
    expect(screen.getByText("2. Discuss.")).toBeTruthy();
    expect(screen.getByText("Correct answer: Paris")).toBeTruthy();
    expect(screen.getByText("Draft · 7 points")).toBeTruthy();
  });

  it("adds an MCQ through the editor and sends exactly the form's question", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    post.mockResolvedValue({
      data: { data: { id: 102, order: 2, type: "MCQ", prompt: "2 + 2?", points: 2, options: ["3", "4"], correctIndex: 1 } },
    });
    renderWithProviders(<QuizEditScreen />);

    fireEvent.press(await screen.findByText("Add question"));
    fireEvent.changeText(screen.getByLabelText("Question prompt"), "2 + 2?");
    fireEvent.changeText(screen.getByLabelText("Points"), "2");
    fireEvent.changeText(screen.getByLabelText("Option 1"), "3");
    fireEvent.changeText(screen.getByLabelText("Option 2"), "4");
    fireEvent.press(screen.getByLabelText("Mark option 2 correct"));
    fireEvent.press(screen.getByText("Save question"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/questions", {
        type: "MCQ", prompt: "2 + 2?", points: 2, options: ["3", "4"], correctIndex: 1,
      }),
    );
  });

  it("refuses an MCQ with no correct answer marked, locally, with the schema's message", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    renderWithProviders(<QuizEditScreen />);

    fireEvent.press(await screen.findByText("Add question"));
    fireEvent.changeText(screen.getByLabelText("Question prompt"), "2 + 2?");
    fireEvent.changeText(screen.getByLabelText("Option 1"), "3");
    fireEvent.changeText(screen.getByLabelText("Option 2"), "4");
    fireEvent.press(screen.getByText("Save question"));

    expect(await screen.findByText("Mark the correct answer.")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("edits a question in place", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    patch.mockResolvedValue({ data: { data: { ...mcq, prompt: "Capital of Italy?" } } });
    renderWithProviders(<QuizEditScreen />);

    fireEvent.press(await screen.findByLabelText("Edit question 1"));
    fireEvent.changeText(screen.getByLabelText("Question prompt"), "Capital of Italy?");
    fireEvent.press(screen.getByText("Save question"));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/quizzes/41/questions/100", {
        type: "MCQ", prompt: "Capital of Italy?", points: 2, options: ["London", "Paris"], correctIndex: 1,
      }),
    );
  });

  it("reorders by sending the full permutation", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    put.mockResolvedValue({ data: { data: { questions: [{ ...essay, order: 0 }, { ...mcq, order: 1 }] } } });
    renderWithProviders(<QuizEditScreen />);

    fireEvent.press(await screen.findByLabelText("Move question 2 up"));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/api/v1/quizzes/41/questions/order", { questionIds: [101, 100] }),
    );
  });

  it("deletes only on a second, confirming press", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    del.mockResolvedValue({ data: { data: { deleted: true } } });
    renderWithProviders(<QuizEditScreen />);

    fireEvent.press(await screen.findByLabelText("Delete question 1"));
    expect(del).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText("Really delete question 1"));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/quizzes/41/questions/100"));
  });

  it("publishes, and shows the server's refusal verbatim", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    post.mockRejectedValue(conflict("mcq_without_answer", "Every multiple-choice question needs a correct answer."));
    renderWithProviders(<QuizEditScreen />);

    fireEvent.press(await screen.findByText("Publish"));

    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/publish", { publish: true }));
    expect(await screen.findByText("Every multiple-choice question needs a correct answer.")).toBeTruthy();
  });

  it("locks the structure once a student has started (canEditStructure: false — spec D3)", async () => {
    get.mockResolvedValue({
      data: { data: authoring({ canEditStructure: false, attemptCount: 1, publishedAt: "2099-02-01T00:00:00.000Z" }) },
    });
    renderWithProviders(<QuizEditScreen />);

    expect(await screen.findByText("Students have started this quiz, so its questions can no longer change.")).toBeTruthy();
    expect(screen.queryByText("Add question")).toBeNull();
    expect(screen.queryByLabelText("Edit question 1")).toBeNull();
    expect(screen.queryByLabelText("Move question 2 up")).toBeNull();
    // Publishing state can still change; D4's guard is the server's.
    expect(screen.getByText("Unpublish")).toBeTruthy();
  });

  it("renames a PAPER quiz and shows no question builder", async () => {
    get.mockResolvedValue({
      data: { data: authoring({ kind: "PAPER", maxScore: 20, questions: [], canEditStructure: false }) },
    });
    patch.mockResolvedValue({ data: { data: { updated: true } } });
    renderWithProviders(<QuizEditScreen />);

    expect(await screen.findByText("This is a paper quiz — it has no questions. Grade it from the grade sheet.")).toBeTruthy();
    expect(screen.queryByText("Add question")).toBeNull();
    fireEvent.changeText(screen.getByLabelText("Quiz title"), "Renamed");
    fireEvent.press(screen.getByText("Save title"));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/v1/quizzes/41", { title: "Renamed" }));
  });

  it("is not available to a leader and fetches nothing", async () => {
    useSessionStore.setState(leaderSession);
    renderWithProviders(<QuizEditScreen />);
    expect(await screen.findByText("Not available")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});
```

Append to `quizzes-screen.test.tsx` (it already has `staffGets` and
`staffRow` from Task 8):

```tsx
describe("QuizzesScreen — authoring entry points (Task 11)", () => {
  const adminSession = {
    user: { id: 2, name: "Test admin", email: "a@jpc.test", role: "ADMIN" as const, avatarPath: null },
    scopes: { seasonAdminIds: [7], groupLeaderIds: [], activeSeasonId: null, graduationYear: null },
  };

  it("gives an admin a New quiz button", async () => {
    useSessionStore.setState(adminSession);
    staffGets({ items: [], nextCursor: null });
    renderWithProviders(<QuizzesScreen />);
    fireEvent.press(await screen.findByText("New quiz"));
    expect(mockPush).toHaveBeenCalledWith("/quiz/new");
  });

  it("opens an admin's draft ONLINE quiz in the builder, not the grade screen", async () => {
    useSessionStore.setState(adminSession);
    staffGets({
      items: [staffRow({ id: 51, title: "Draft online", kind: "ONLINE", publishedAt: null, questionCount: 0 })],
      nextCursor: null,
    });
    renderWithProviders(<QuizzesScreen />);
    fireEvent.press(await screen.findByText("Draft online"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/quiz/[id]/edit", params: { id: "51" } });
  });

  it("gives a leader no New quiz button", async () => {
    useSessionStore.setState(leaderSession);
    staffGets({ items: [], nextCursor: null });
    renderWithProviders(<QuizzesScreen />);
    expect(await screen.findByText("No quizzes")).toBeTruthy();
    expect(screen.queryByText("New quiz")).toBeNull();
  });
});
```

Run `cd apps/mobile && pnpm jest src/__tests__/quiz-authoring.test.tsx src/__tests__/quizzes-screen.test.tsx` → FAIL.

- [ ] **Step 3: Hooks.**

```ts
// apps/mobile/src/hooks/use-quiz-authoring.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import {
  publishQuizResponseSchema,
  quizCreatedResponseSchema,
  quizQuestionAuthoringSchema,
  quizQuestionDeletedResponseSchema,
  quizUpdatedResponseSchema,
  reorderQuestionsResponseSchema,
  type createQuizRequestSchema,
  type QuizQuestionInput,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

/** What the create form sends — the request schema's input side. */
export type CreateQuizInput = z.input<typeof createQuizRequestSchema>;

/**
 * Every builder write invalidates the quiz's own detail (whose staff entry
 * holds the questions and canEditStructure) and the lists (questionCount,
 * maxScore and the draft badge all change).
 */
function useInvalidateQuiz(id: number | null) {
  const queryClient = useQueryClient();
  return () => {
    if (id !== null) void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.detail(id) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.lists() });
  };
}

export function useCreateQuiz() {
  const invalidate = useInvalidateQuiz(null);
  return useMutation({
    mutationFn: async (body: CreateQuizInput) => {
      const res = await apiClient.post("/api/v1/quizzes", body);
      return quizCreatedResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useUpdateQuiz(id: number) {
  const invalidate = useInvalidateQuiz(id);
  return useMutation({
    mutationFn: async (body: { title?: string; maxScore?: number }) => {
      const res = await apiClient.patch(`/api/v1/quizzes/${id}`, body);
      return quizUpdatedResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useAddQuestion(id: number) {
  const invalidate = useInvalidateQuiz(id);
  return useMutation({
    mutationFn: async (body: QuizQuestionInput) => {
      const res = await apiClient.post(`/api/v1/quizzes/${id}/questions`, body);
      return quizQuestionAuthoringSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useUpdateQuestion(id: number) {
  const invalidate = useInvalidateQuiz(id);
  return useMutation({
    mutationFn: async (input: { questionId: number; body: QuizQuestionInput }) => {
      const res = await apiClient.patch(`/api/v1/quizzes/${id}/questions/${input.questionId}`, input.body);
      return quizQuestionAuthoringSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useDeleteQuestion(id: number) {
  const invalidate = useInvalidateQuiz(id);
  return useMutation({
    mutationFn: async (questionId: number) => {
      const res = await apiClient.delete(`/api/v1/quizzes/${id}/questions/${questionId}`);
      return quizQuestionDeletedResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

/** Sends the FULL permutation — the server refuses anything else (`invalid_order`). */
export function useReorderQuestions(id: number) {
  const invalidate = useInvalidateQuiz(id);
  return useMutation({
    mutationFn: async (questionIds: number[]) => {
      const res = await apiClient.put(`/api/v1/quizzes/${id}/questions/order`, { questionIds });
      return reorderQuestionsResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function usePublishQuiz(id: number) {
  const invalidate = useInvalidateQuiz(id);
  return useMutation({
    mutationFn: async (publish: boolean) => {
      const res = await apiClient.post(`/api/v1/quizzes/${id}/publish`, { publish });
      return publishQuizResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}
```

(`createQuizRequestSchema` is imported with an inline `type` modifier because
this file uses it only as `typeof createQuizRequestSchema`.)

- [ ] **Step 4: `QuestionEditor`.**

```tsx
// apps/mobile/src/components/QuestionEditor.tsx
import { useState } from "react";
import { Pressable, View } from "react-native";
import {
  quizQuestionRequestSchema,
  type QuizQuestionAuthoring,
  type QuizQuestionInput,
  type QuizQuestionType,
} from "@space/shared";

import { useTheme } from "../theme";
import { Button, Input, Text } from "../ui";

export interface QuestionEditorProps {
  /** Present when editing; absent when adding. */
  initial?: QuizQuestionAuthoring;
  submitting: boolean;
  /** A server error from the caller's mutation, shown under the form. */
  serverError: string | null;
  onSubmit: (body: QuizQuestionInput) => void;
  onCancel: () => void;
}

const MAX_OPTIONS = 6; // quizQuestionRequestSchema: options .max(6)

/**
 * One form for add and edit (v1 quiz-builder.tsx's QuestionForm). Validated
 * with the SAME shared schema the server parses, so the messages a phone shows
 * ("Add at least 2 options.", "Mark the correct answer.") are the server's own
 * refinements, not a hand-copied second set.
 */
export function QuestionEditor({ initial, submitting, serverError, onSubmit, onCancel }: QuestionEditorProps) {
  const theme = useTheme();
  const [type, setType] = useState<QuizQuestionType>(initial?.type ?? "MCQ");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [points, setPoints] = useState(initial ? String(initial.points) : "1");
  const [options, setOptions] = useState<string[]>(
    initial && initial.type === "MCQ" ? initial.options : ["", ""],
  );
  const [correctIndex, setCorrectIndex] = useState<number | null>(initial?.correctIndex ?? null);
  const [localError, setLocalError] = useState<string | null>(null);

  const removeOption = (index: number) => {
    setOptions((prev) => prev.filter((_, i) => i !== index));
    setCorrectIndex((prev) => (prev === null || prev === index ? null : prev > index ? prev - 1 : prev));
  };

  const submit = () => {
    const body: QuizQuestionInput =
      type === "ESSAY"
        ? { type, prompt, points: Number(points) }
        : { type, prompt, points: Number(points), options, correctIndex };
    const parsed = quizQuestionRequestSchema.safeParse(body);
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? "Check the question.");
      return;
    }
    setLocalError(null);
    onSubmit(body);
  };

  const error = localError ?? serverError;

  return (
    <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
      <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
        <Button
          title="Multiple choice"
          variant={type === "MCQ" ? "primary" : "secondary"}
          onPress={() => setType("MCQ")}
        />
        <Button
          title="Essay"
          variant={type === "ESSAY" ? "primary" : "secondary"}
          onPress={() => setType("ESSAY")}
        />
      </View>
      <Input label="Question prompt" value={prompt} onChangeText={setPrompt} multiline />
      <Input label="Points" value={points} onChangeText={setPoints} keyboardType="number-pad" />
      {type === "MCQ" ? (
        <>
          {options.map((option, index) => (
            <View key={index} style={{ gap: theme.spacing.xs }}>
              <Input
                label={`Option ${index + 1}`}
                value={option}
                onChangeText={(value) =>
                  setOptions((prev) => prev.map((o, i) => (i === index ? value : o)))
                }
              />
              <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityLabel={`Mark option ${index + 1} correct`}
                  accessibilityState={{ selected: correctIndex === index }}
                  onPress={() => setCorrectIndex(index)}
                >
                  <Text variant="label">{correctIndex === index ? "✓ Correct answer" : "Mark correct"}</Text>
                </Pressable>
                {options.length > 2 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove option ${index + 1}`}
                    onPress={() => removeOption(index)}
                  >
                    <Text variant="label" color={theme.colors.error[500]}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
          {options.length < MAX_OPTIONS ? (
            <Button title="Add option" variant="ghost" onPress={() => setOptions((prev) => [...prev, ""])} />
          ) : null}
        </>
      ) : null}
      {error ? <Text variant="label" color={theme.colors.error[500]}>{error}</Text> : null}
      <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
        <Button title="Save question" onPress={submit} loading={submitting} />
        <Button title="Cancel" variant="ghost" onPress={onCancel} />
      </View>
    </View>
  );
}
```

- [ ] **Step 5: `quiz/new.tsx`.**

```tsx
// apps/mobile/app/(app)/quiz/new.tsx
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { createQuizRequestSchema, type QuizKind } from "@space/shared";

import { useCreateQuiz, type CreateQuizInput } from "../../../src/hooks/use-quiz-authoring";
import { useCurrentSeasonId } from "../../../src/hooks/use-seasons";
import { useSeasonSessions } from "../../../src/hooks/use-sessions";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { formatDayKey } from "../../../src/lib/format";
import { useSessionStore } from "../../../src/store/session";
import { useTheme } from "../../../src/theme";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text } from "../../../src/ui";

/**
 * v1 create-quiz-form.tsx, as a screen. Creating is a season-admin power
 * (POST /quizzes is isAdminOfSeason-gated), so only ADMIN/SUPER get the form;
 * the server stays the gate. Defaults mirror v1: PAPER, max score 100.
 * The season is the staff current season (ruling X8); a session is optional
 * (spec D12 — the column is nullable).
 */
function NewQuizForm() {
  const theme = useTheme();
  const router = useRouter();
  const current = useCurrentSeasonId();
  const sessions = useSeasonSessions(current.seasonId);
  const create = useCreateQuiz();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<QuizKind>("PAPER");
  const [maxScore, setMaxScore] = useState("100");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (current.isPending) return <LoadingState />;
  if (current.isError) return <ErrorState message="Couldn't load your seasons." onRetry={current.refetch} />;
  const seasonId = current.seasonId;
  if (seasonId === null) {
    return <EmptyState title="No season" message="You aren't an admin of a season yet." />;
  }

  const submit = () => {
    const body: CreateQuizInput =
      kind === "PAPER"
        ? { seasonId, sessionId, title, kind, ...(maxScore.trim() === "" ? {} : { maxScore: Number(maxScore) }) }
        : { seasonId, sessionId, title, kind };
    const parsed = createQuizRequestSchema.safeParse(body);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the quiz details.");
      return;
    }
    setError(null);
    create.mutate(body, {
      onSuccess: ({ id }) =>
        router.replace(
          kind === "ONLINE"
            ? { pathname: "/quiz/[id]/edit", params: { id: String(id) } }
            : { pathname: "/quiz/[id]/grade", params: { id: String(id) } },
        ),
      onError: (err) => setError(apiErrorMessage(err, "Couldn't create the quiz.")),
    });
  };

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <Text variant="heading">New quiz</Text>
      <Input label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Week 3 Quiz" />
      <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
        <Button title="Paper" variant={kind === "PAPER" ? "primary" : "secondary"} onPress={() => setKind("PAPER")} />
        <Button title="Online" variant={kind === "ONLINE" ? "primary" : "secondary"} onPress={() => setKind("ONLINE")} />
      </View>
      {kind === "PAPER" ? (
        <Input label="Max score" value={maxScore} onChangeText={setMaxScore} keyboardType="number-pad" />
      ) : (
        <Text variant="caption" color={theme.colors.neutral[600]}>
          An online quiz's max score is the sum of its question points.
        </Text>
      )}
      <Text variant="label">Session (optional)</Text>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected: sessionId === null }}
        onPress={() => setSessionId(null)}
      >
        <Text variant="body">{sessionId === null ? "✓ No session" : "No session"}</Text>
      </Pressable>
      {(sessions.data ?? []).map((s) => (
        <Pressable
          key={s.id}
          accessibilityRole="radio"
          accessibilityState={{ selected: sessionId === s.id }}
          onPress={() => setSessionId(s.id)}
        >
          <Text variant="body">{s.title}</Text>
          <Text variant="caption" color={theme.colors.neutral[600]}>
            {sessionId === s.id ? `✓ ${formatDayKey(s.dayKey)}` : formatDayKey(s.dayKey)}
          </Text>
        </Pressable>
      ))}
      {error ? <Text variant="label" color={theme.colors.error[500]}>{error}</Text> : null}
      <Button
        title={kind === "ONLINE" ? "Create & add questions" : "Create quiz"}
        onPress={submit}
        loading={create.isPending}
      />
    </Card>
  );
}

export default function NewQuizScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {role === "ADMIN" || role === "SUPER" ? (
        <NewQuizForm />
      ) : (
        <EmptyState title="Not available" message="Only a season admin can create quizzes." />
      )}
    </Screen>
  );
}
```

- [ ] **Step 6: `quiz/[id]/edit.tsx` — the builder.**

```tsx
// apps/mobile/app/(app)/quiz/[id]/edit.tsx
import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { QuizAuthoringDetail, QuizQuestionAuthoring } from "@space/shared";

import { QuestionEditor } from "../../../../src/components/QuestionEditor";
import {
  useAddQuestion,
  useDeleteQuestion,
  usePublishQuiz,
  useReorderQuestions,
  useUpdateQuestion,
  useUpdateQuiz,
} from "../../../../src/hooks/use-quiz-authoring";
import { useQuizAuthoringDetail } from "../../../../src/hooks/use-quizzes";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import { useSessionStore } from "../../../../src/store/session";
import { useTheme } from "../../../../src/theme";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text } from "../../../../src/ui";

function parseId(raw: string | undefined): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function QuizSettings({ quiz, onError }: { quiz: QuizAuthoringDetail; onError: (m: string | null) => void }) {
  const theme = useTheme();
  const update = useUpdateQuiz(quiz.id);
  const [title, setTitle] = useState(quiz.title);
  const [maxScore, setMaxScore] = useState(String(quiz.maxScore));

  const save = (body: { title?: string; maxScore?: number }) => {
    onError(null);
    update.mutate(body, { onError: (err) => onError(apiErrorMessage(err, "Couldn't save the quiz.")) });
  };

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <Input label="Quiz title" value={title} onChangeText={setTitle} />
      <Button title="Save title" variant="secondary" onPress={() => save({ title })} loading={update.isPending} />
      {quiz.kind === "PAPER" ? (
        <>
          {/* Refused server-side once grades exist (quiz_has_grades). */}
          <Input label="Max score" value={maxScore} onChangeText={setMaxScore} keyboardType="number-pad" />
          <Button title="Save max score" variant="secondary" onPress={() => save({ maxScore: Number(maxScore) })} />
        </>
      ) : null}
    </Card>
  );
}

function QuestionRow({
  quiz,
  question,
  index,
  editable,
  onError,
}: {
  quiz: QuizAuthoringDetail;
  question: QuizQuestionAuthoring;
  index: number;
  editable: boolean;
  onError: (m: string | null) => void;
}) {
  const theme = useTheme();
  const update = useUpdateQuestion(quiz.id);
  const remove = useDeleteQuestion(quiz.id);
  const reorder = useReorderQuestions(quiz.id);
  const [editing, setEditing] = useState(false);
  const [armed, setArmed] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const n = index + 1;
  const ids = quiz.questions.map((q) => q.id);

  const move = (delta: -1 | 1) => {
    const target = index + delta;
    const next = [...ids];
    [next[index], next[target]] = [next[target] as number, next[index] as number];
    onError(null);
    reorder.mutate(next, { onError: (err) => onError(apiErrorMessage(err, "Couldn't reorder.")) });
  };

  const onDelete = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    onError(null);
    remove.mutate(question.id, {
      onError: (err) => {
        setArmed(false);
        onError(apiErrorMessage(err, "Couldn't delete the question."));
      },
    });
  };

  const correct =
    question.type === "MCQ" && question.correctIndex !== null ? question.options[question.correctIndex] : undefined;

  return (
    <Card style={{ marginTop: theme.spacing.sm, gap: theme.spacing.xs }}>
      <Text variant="body">{`${n}. ${question.prompt}`}</Text>
      <Text variant="caption" color={theme.colors.neutral[600]}>
        {`${question.type === "MCQ" ? "Multiple choice" : "Essay"} · ${question.points} pt${question.points === 1 ? "" : "s"}`}
      </Text>
      {question.type === "MCQ"
        ? question.options.map((o, i) => (
            <Text key={i} variant="label">{`${String.fromCharCode(65 + i)}. ${o}`}</Text>
          ))
        : null}
      {correct !== undefined ? <Text variant="label">{`Correct answer: ${correct}`}</Text> : null}
      {editable ? (
        editing ? (
          <QuestionEditor
            initial={question}
            submitting={update.isPending}
            serverError={serverError}
            onCancel={() => setEditing(false)}
            onSubmit={(body) =>
              update.mutate(
                { questionId: question.id, body },
                {
                  onSuccess: () => setEditing(false),
                  onError: (err) => setServerError(apiErrorMessage(err, "Couldn't save the question.")),
                },
              )
            }
          />
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
            <Button
              title="Up"
              variant="ghost"
              accessibilityLabel={`Move question ${n} up`}
              disabled={index === 0 || reorder.isPending}
              onPress={() => move(-1)}
            />
            <Button
              title="Down"
              variant="ghost"
              accessibilityLabel={`Move question ${n} down`}
              disabled={index === ids.length - 1 || reorder.isPending}
              onPress={() => move(1)}
            />
            <Button title="Edit" variant="secondary" accessibilityLabel={`Edit question ${n}`} onPress={() => setEditing(true)} />
            <Button
              title={armed ? "Really delete?" : "Delete"}
              variant="ghost"
              accessibilityLabel={armed ? `Really delete question ${n}` : `Delete question ${n}`}
              loading={remove.isPending}
              onPress={onDelete}
            />
          </View>
        )
      ) : null}
    </Card>
  );
}

function QuizBuilder({ id }: { id: number }) {
  const theme = useTheme();
  const router = useRouter();
  const { data, isPending, isError, refetch, isRefetching } = useQuizAuthoringDetail(id, true);
  const add = useAddQuestion(id);
  const publish = usePublishQuiz(id);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isPending) return <LoadingState />;
  if (isError) return <ErrorState message="Couldn't load this quiz." onRetry={() => void refetch()} />;
  if (!data.canManage) {
    return <EmptyState title="Not available" message="Only an admin of this quiz's season can edit it." />;
  }

  const published = data.publishedAt !== null;

  return (
    <Screen edges={["top", "left", "right"]} scroll onRefresh={() => void refetch()} refreshing={isRefetching}>
      <Text variant="title">{data.title}</Text>
      <Text variant="label" color={theme.colors.neutral[600]}>
        {`${published ? "Published" : "Draft"} · ${data.maxScore} points`}
      </Text>
      <QuizSettings quiz={data} onError={setError} />

      {data.kind === "PAPER" ? (
        <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
          <Text variant="body">This is a paper quiz — it has no questions. Grade it from the grade sheet.</Text>
          <Button
            title="Open grade sheet"
            variant="secondary"
            onPress={() => router.push({ pathname: "/quiz/[id]/grade", params: { id: String(id) } })}
          />
        </Card>
      ) : (
        <>
          <Button
            title={published ? "Unpublish" : "Publish"}
            variant={published ? "secondary" : "primary"}
            style={{ marginTop: theme.spacing.md }}
            loading={publish.isPending}
            onPress={() => {
              setError(null);
              publish.mutate(!published, {
                onError: (err) => setError(apiErrorMessage(err, "Couldn't change the publish state.")),
              });
            }}
          />
          {!data.canEditStructure ? (
            <Text variant="label" style={{ marginTop: theme.spacing.sm }}>
              Students have started this quiz, so its questions can no longer change.
            </Text>
          ) : null}
          {data.questions.length === 0 ? (
            <EmptyState title="No questions yet" message="Add multiple-choice or essay questions, then publish the quiz." />
          ) : (
            data.questions.map((q, index) => (
              <QuestionRow
                key={q.id}
                quiz={data}
                question={q}
                index={index}
                editable={data.canEditStructure}
                onError={setError}
              />
            ))
          )}
          {data.canEditStructure ? (
            adding ? (
              <Card style={{ marginTop: theme.spacing.md }}>
                <QuestionEditor
                  submitting={add.isPending}
                  serverError={addError}
                  onCancel={() => setAdding(false)}
                  onSubmit={(body) =>
                    add.mutate(body, {
                      onSuccess: () => {
                        setAdding(false);
                        setAddError(null);
                      },
                      onError: (err) => setAddError(apiErrorMessage(err, "Couldn't add the question.")),
                    })
                  }
                />
              </Card>
            ) : (
              <Button title="Add question" style={{ marginTop: theme.spacing.md }} onPress={() => setAdding(true)} />
            )
          ) : null}
        </>
      )}
      {error ? (
        <Text variant="label" color={theme.colors.error[500]} style={{ marginTop: theme.spacing.sm }}>
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}

export default function QuizEditScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = parseId(raw);
  const role = useSessionStore((s) => s.user?.role ?? null);

  // v1's builder route was requireRole(["ADMIN","SUPER"]) + canManageQuiz; the
  // role check here avoids a pointless fetch, and canManage (server-derived,
  // C4) is checked in QuizBuilder. The server enforces both on every write.
  if (role !== "ADMIN" && role !== "SUPER") {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Not available" message="Only a season admin can edit quizzes." />
      </Screen>
    );
  }
  if (id === null) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Not found" message="That quiz doesn't exist." />
      </Screen>
    );
  }
  return <QuizBuilder id={id} />;
}
```

- [ ] **Step 7: Entry points.**

In `apps/mobile/app/(app)/quizzes.tsx`'s `StaffQuizzes`: read
`const role = useSessionStore((s) => s.user?.role ?? null);` and
`const canAuthor = role === "ADMIN" || role === "SUPER";`. Render, as the
first child of the `Screen` (before the state branches):

```tsx
{canAuthor && seasonId !== null ? (
  <Button
    title="New quiz"
    style={{ marginBottom: theme.spacing.sm }}
    onPress={() => router.push("/quiz/new")}
  />
) : null}
```

and change the row's `onPress` to:

```tsx
onPress={() =>
  router.push(
    canAuthor && row.kind === "ONLINE" && row.publishedAt === null
      ? { pathname: "/quiz/[id]/edit", params: { id: String(row.id) } }
      : { pathname: "/quiz/[id]/grade", params: { id: String(row.id) } },
  )
}
```

(add `Button` to the `../../src/ui` import). A published quiz still opens the
grade screen; its builder is one tap further via the preview below.

In `apps/mobile/app/(app)/quiz/[id]/index.tsx`'s `StaffPreview` (Task 9),
next to "Grade this quiz", add:

```tsx
{data.canManage ? (
  <Button
    title="Edit quiz"
    variant="secondary"
    onPress={() => router.push({ pathname: "/quiz/[id]/edit", params: { id: String(id) } })}
  />
) : null}
```

and extend Task 9's "gives staff a read-only preview" test with
`expect(screen.queryByText("Edit quiz")).toBeNull();` (its fixture has
`canManage: false`).

- [ ] **Step 8: Register the routes.** Append `"quiz/new"` and
`"quiz/[id]/edit"` to `DETAIL_ROUTE_NAMES` in `_layout.tsx`. `quiz/new` is a
static segment beside the dynamic `quiz/[id]/` directory — expo-router matches
static segments first, so `/quiz/new` never resolves as a quiz id. Run
`pnpm turbo routes:generate --filter=@space/mobile`.

- [ ] **Step 9: Run.**

Run: `cd apps/mobile && pnpm jest src/__tests__/quiz-authoring.test.tsx src/__tests__/quizzes-screen.test.tsx src/__tests__/quiz-runner.test.tsx src/__tests__/app-layout.test.tsx src/__tests__/role-tabs.test.tsx` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 10: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): quiz authoring — create, build, reorder and publish"
```

---

### Task 11b: Mobile — session-quiz card rows open the quiz (Plan 6 follow-up)

Plan 6 Task 7 put `SessionQuizzesCard` on the leader/admin session detail
(`GET /api/v1/sessions/:id/quizzes`, coverage gap G18) with **unpressable**
rows, because `quiz/[id]` did not exist yet and typed routes forbid linking a
missing route (Plan 6 D-16.10). This task adds the press. A row opens the
staff preview at `/quiz/[id]` (Task 9's `StaffPreview`), which already offers
"Grade this quiz" and — after Task 11 — "Edit quiz" when `canManage`. That is
one destination for every kind and status, instead of re-deriving the quizzes
list's draft-vs-published routing here. It also swaps Plan 6's inlined
`kind` enum for this plan's `quizKindSchema`, as Plan 6 invited.

**Files:**
- Modify: `packages/shared/src/session.ts` (`sessionQuizItemSchema.kind` → `quizKindSchema`)
- Modify: `apps/mobile/src/components/SessionQuizzesCard.tsx` (Plan 6's — rows become `Pressable`)
- Test: `apps/mobile/src/__tests__/session-detail.test.tsx` (Plan 6's replaced file — one new case)

**Interfaces:**
- Consumes: Plan 6's `SessionQuizzesCard`, `useSessionQuizzes(id, enabled)`, `sessionQuizItemSchema`, and the `routeGets`/`baseDetail`/`leader()`/`mockPush` harness in `session-detail.test.tsx`; Task 1's `quizKindSchema` (`packages/shared/src/enums.ts`); Task 9's `/quiz/[id]` route.
- Produces: nothing new by name — `SessionQuizzesCard` rows navigate to `{ pathname: "/quiz/[id]", params: { id } }`.

- [ ] **Step 1: Failing test.** Append to `apps/mobile/src/__tests__/session-detail.test.tsx`
(Plan 6's file already imports `fireEvent` and mocks `useRouter` with `mockPush`):

```tsx
it("opens a session quiz's staff preview from the quiz card (Plan 8 Task 11b)", async () => {
  useSessionStore.setState(leader());
  routeGets({
    detail: { ...baseDetail, canMarkAttendance: true, canManageCheckIn: false },
    quizzes: [{ id: 41, title: "Online quiz", kind: "ONLINE", maxScore: 10, questionCount: 4, publishedAt: null }],
  });
  renderWithProviders(<SessionDetailScreen />);

  fireEvent.press(await screen.findByText("Online quiz"));

  expect(mockPush).toHaveBeenCalledWith({ pathname: "/quiz/[id]", params: { id: "41" } });
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/session-detail.test.tsx` → FAIL (`mockPush` not called).

- [ ] **Step 2: Use the shared quiz kind.** In `packages/shared/src/session.ts`,
add `quizKindSchema` to the existing `./enums` import and change
`sessionQuizItemSchema`'s `kind: z.enum(["PAPER", "ONLINE"]),` to
`kind: quizKindSchema,`. Update the schema's doc comment: the kind is now
Plan 8's enum. (Same two literals, so Plan 6's contract tests stay green.)

- [ ] **Step 3: Make the rows pressable.** In
`apps/mobile/src/components/SessionQuizzesCard.tsx`, replace the
`react-native` import with
`import { Pressable } from "react-native";`, add
`import { useRouter } from "expo-router";`, and add
`const router = useRouter();` directly after `const theme = useTheme();` (before
the early returns — hooks order). Replace the row map with:

```tsx
      {quizzes.data.map((q) => (
        <Pressable
          key={q.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/quiz/[id]", params: { id: String(q.id) } })}
        >
          <Text variant="body">{q.title}</Text>
          <Text variant="caption" color={theme.colors.neutral[600]}>
            {q.kind === "ONLINE" && q.publishedAt === null ? `Max score: ${q.maxScore} · Draft` : `Max score: ${q.maxScore}`}
          </Text>
        </Pressable>
      ))}
```

and change the doc comment's "Rows are not pressable yet …" sentence to "A row
opens the quiz's staff preview (`/quiz/[id]`, Plan 8 Task 11b)."

- [ ] **Step 4: Run.**

Run: `cd apps/mobile && pnpm jest src/__tests__/session-detail.test.tsx` → PASS (Plan 6's quiz-card cases unchanged).
Run: `cd packages/shared && pnpm exec jest src/__tests__/season-admin-contracts.test.ts` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile --filter=@space/shared` → clean (the typed href `/quiz/[id]` resolves because Task 7 registered it).

- [ ] **Step 5: Commit**

```bash
git add packages/shared apps/mobile && git commit -m "feat(mobile): session quiz card rows open the quiz preview"
```

---

### Task 12: Closing gate (coordinator)

**Files:** none created — verification only.

- [ ] **Step 1: Full suite**

Run: `pnpm turbo lint typecheck test:unit build` (repo root) → green.
Then the serial integration run:
`cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern integration` → green.
`routes:generate` output must be current — `typecheck` depends on it through
turbo, so a clean run proves it.

- [ ] **Step 2: Mutation pass**

One at a time, restore after each. Each mutation **must** make the named test
fail; a mutation that leaves the suite green means the test is not testing what
it claims.

1. **The answer key.** In `routes/quizzes.ts`'s `GET /:id`, delete the
   `user.role === "STUDENT"` branch so every caller gets
   `loadQuizAuthoringDetail`. → the raw-JSON answer-key test fails on
   `expect(raw).not.toContain("correctIndex")`.
   *(Typecheck will NOT fail here — `apiOk` takes `unknown`, so nothing at the
   handler level is typed against the student shape. That is expected; the
   raw-JSON test is the guarantee.)*
1b. **The typed mapper.** Widen `StudentQuestionSource` with
   `correctIndex: number | null`, add `correctIndex: true` to the student
   select, and add `correctIndex: q.correctIndex,` to `toStudentQuestion`'s
   returned literal. → `pnpm turbo typecheck --filter=@space/backend` fails
   with an excess-property error on `QuizQuestionStudent`. (This is the one
   edit the type does catch; the Task 4 note says exactly which ones it
   does not.)
2. **The D1 season check.** In `POST /:id/grades`, restore v1's condition —
   replace `if (!(await canGradeQuiz(user, id)))` with
   `if (user.role === "LEADER" && !(await canGradeQuiz(user, id)))`. → the
   "refuses an ADMIN of a different season" test fails.
3. **The D1 roster check.** In the same handler, drop the
   `if (!visible.has(entry.studentUserId))` rejection. → the "rejects the WHOLE
   batch when any student is out of scope" test fails.
4. **The D3 freeze.** In `loadAuthorableQuiz`, remove the `hasAttempts` guard. →
   the "refuses every structural write once an attempt exists" test fails on all
   four verbs.
5. **The D4 unpublish guard.** In `POST /:id/publish`, drop the graded-attempt
   count check. → the "refuses to unpublish once an attempt has been graded"
   test fails.
6. **The runner's batching.** In `use-quizzes.ts`'s `useSaveAnswers`, send only
   the last-edited answer instead of the batch. → the debounce test's payload
   assertion fails.
7. **The builder lock.** In `quiz/[id]/edit.tsx`, pass `editable={true}` to
   every `QuestionRow` and drop the `data.canEditStructure` gate on "Add
   question". → the "locks the structure once a student has started" test fails.
8. **The full permutation.** In `useReorderQuestions`, send only the two
   swapped ids. → the "reorders by sending the full permutation" test fails.
9. **The notification link.** Change `QUIZ_GRADED_LINK` to `"/quizzes"` (a
   v2-style path). → every non-zero `quizGradedCount()` delta assertion fails,
   because the helper counts only rows carrying v1's link (ruling X1).

- [ ] **Step 3: Check the emitted build for the CLAUDE.md require trap**

Run: `grep -rn 'require("@space/shared")' apps/backend/dist/` → empty (all of `dist/`, ruling X12).
(`routes/quizzes.ts` has a value import from shared, so it is exactly the file
this trap catches. The relative import path is what keeps it out of `dist`.)

- [ ] **Step 4: Device checklist (manual, Expo Go or a dev build)**

Backend running, `apiClient` pointed at it. On staging:

1. As an **admin** (Task 11's screens): Quizzes → "New quiz", create an
   ONLINE quiz on a session, add two MCQs and an essay, reorder them, publish. Then try to add a question after a student has
   started — refused, with the message the API sends.
2. As a **student**: the quizzes tab lists the published quiz as "Not started";
   open it, press "Start quiz", answer one MCQ, kill the app, reopen — the
   answer survived (so the debounce actually flushed). Answer the rest, submit.
3. **Watch the network**: on a proxy or through the dev console, confirm no
   response to the student contains `correctIndex`. The integration test is the
   real guard; this is the sanity check that the deployed build matches it.
4. As a **leader**: open the grading screen, mark the essay, save. The student's
   screen shows the total after a refetch; the student's notification carries
   v1's link `/student/quizzes` (ruling X1), which Plan 13's parser opens as the
   Quizzes tab — and the same row renders correctly in v1.
5. As a **leader**: reopen the attempt. The student sees the retake and a
   notification telling them so.
6. As an **admin**: a PAPER quiz's grid saves a score, clears one by emptying
   the field, and refuses a score above the max with the server's message.
7. As a **leader**: confirm the grid and the attempts list show **only your own
   group's** students, while an admin sees the whole season.
8. As a **leader**: open a session that has a quiz — its Quizzes card row opens
   that quiz's preview (Task 11b).

- [ ] **Step 5: Report**

Suite counts (unit and integration), the ten mutation outcomes (1, 1b, 2–9), the device
checklist results, and any divergence from this plan found while implementing —
in particular anything the "verify at implementation time" notes turned up
(Prisma `groupBy` shape, `Prisma.TransactionClient`, RNTL fake timers,
`cleanupTestData`'s ordering against the `Restrict` relations on `QuizGrade`
and `QuizAttempt`).

---

## Revision 2026-10-05

Applied the cross-plan rulings, the 01–06 review, and the coverage audit:
- **New Task 11 — quiz authoring UI** (coverage gap G8, ruling X15): `quiz/new` (create form, v1 defaults PAPER / max score 100, optional session from the current season) and `quiz/[id]/edit` (builder: add/edit/delete/reorder questions through one shared-schema-validated `QuestionEditor`, publish/unpublish, the D3 lock when `canEditStructure` is false, a PAPER card instead of v1's redirect), hooks in `src/hooks/use-quiz-authoring.ts`, entry points on the staff Quizzes list and the staff preview, full tests. The closing gate is now Task 12, with three new mutations.
- **B3:** every `QUIZ_GRADED` count is a delta from a baseline taken in the same test, through one `quizGradedCount()` helper — absolute counts accumulated across quizzes graded for the same student.
- **X1 / S2:** all four `QUIZ_GRADED` sites write v1's exact link, `QUIZ_GRADED_LINK = "/student/quizzes"` (`jpc-space/src/lib/quiz-actions.ts:167,483,554`), not `/quizzes/${id}`; tests assert it.
- **S18:** the "widening the select does not typecheck" claim was false and is removed everywhere (header, `quiz.ts` comment, Task 4, mutation 1). The student loader now returns `StudentQuizDetailRow` and builds questions through a `toStudentQuestion` mapper typed `QuizQuestionStudent` (catches an added `correctIndex` line; stated plainly that it does not catch a spread); the raw-JSON test remains the guarantee; new mutation 1b proves what the type does catch.
- **X8 / S1:** the staff Quizzes branch gets its season from Plan 4's `useCurrentSeasonId()`; staff fixtures use `activeSeasonId: null` and mock `GET /api/v1/seasons`; a new test pins it. `Depends on` now names Plan 4.
- **X10 / S3:** new shared response schemas (`quizCreatedResponseSchema`, `quizUpdatedResponseSchema`, `quizQuestionDeletedResponseSchema`, `reorderQuestionsResponseSchema`, `publishQuizResponseSchema`, `saveQuizAnswersResponseSchema`, `reopenAttemptResponseSchema`) and `QuizQuestionInput`; `useGradeEssays` parses `quizGradingAttemptSchema`; no `as` casts remain on responses.
- **X7 / S4:** the `quiz/[id]/index.tsx` rationale now cites ruling X7 (Plan 4 uses the same form for `session/[id]`); the `DETAIL_ROUTE_NAMES` snippet appends instead of restating a stale full list.
- **X9 / B5, X11 / B4:** no hardcoded counts are edited; layout assertions name the routes explicitly; every session-store fixture has `avatarPath: null`.
- **S5:** `queryKeys.quizzes.detail/attempts/grades` take `number | null` — no `-1` sentinels.
- **S19:** the CORS `"PUT"` step is dropped (already in `app.ts`); the reopen control is stated as shown to every grader (`canGradeQuiz` gate), not `canManage || true`.
- **X12:** the emitted-build grep covers all of `dist/`. X5 checked: `quizzesRouter.use(requireAuth)` is allowed because the router owns `/api/v1/quizzes` exclusively.


Cross-plan consistency pass (execution order 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → …):
- `Depends on` fixed: Plan 10 runs **after** this plan; Plan 6 is now named (session-quiz card, `sessionQuizItemSchema`, required `startTime` on session rows).
- **New Task 11b:** `SessionQuizzesCard` (Plan 6) rows become pressable and open `/quiz/[id]` (staff preview → grade/edit); `sessionQuizItemSchema.kind` switches to `quizKindSchema`; one failing-first case in Plan 6's `session-detail.test.tsx`; device checklist item 8.
- Task 7's `DETAIL_ROUTE_NAMES` example list now uses the moved names (`assignment/[id]/index`, `group/[id]/index`) and lists only plans that ran earlier.
- Task 11's `sessionsList` fixture carries `startTime` (required on session list rows since Plan 6).
