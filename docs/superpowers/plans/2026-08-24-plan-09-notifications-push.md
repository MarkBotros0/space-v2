# Plan 9 — Notifications Completed + Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish domain 10 — a device can read its own notification inbox,
mark notifications read as an **explicit** write, and set all six notification
preferences — and take the mobile push story as far as the frozen schema
allows.

**Architecture:** Two file-disjoint workstreams over one new contract module.
Backend: `packages/shared/src/notification.ts` defines the wire shapes; a new
`apps/backend/src/routes/notifications.ts` serves the inbox; preferences and the
device-registration endpoint extend `routes/me.ts`; `lib/notifications.ts`
gains the D4 channel split and a written/suppressed return; two new libs —
`lib/notification-target.ts` (the D1 link parser) and `lib/best-effort.ts` (the
D6 helper) — are shared by every producer. Mobile: one new screen
`app/(app)/notifications.tsx` reached from a sidebar entry in every role's nav
plus an unread-badged bell on the dashboard, hooks in
`src/hooks/use-notifications.ts`, and an Expo push permission/token lifecycle
that has nowhere on the server to register yet.

**Tech Stack:** Express 5, Prisma 7 (`src/generated/prisma`), Zod 3, jest +
supertest integration suite against the shared staging DB; Expo SDK 54 /
expo-router 6 (typed routes), React Query 5, Zustand 5, RNTL 13 via
`renderWithProviders`, `expo-notifications`.

**Spec:** `docs/superpowers/specs/domains/10-notifications.md` (81 rules; §10
D1–D12), `docs/superpowers/specs/domains/_DECISIONS.md` (C1, C6, C8 bind; C11
and C12 also touched), scope from
`docs/superpowers/plans/2026-08-24-migration-roadmap.md` § Plan 9.

---

## THE SCHEMA VERDICT — read this before Task 5

`apps/backend/prisma/schema.prisma` was read directly. What is actually there:

| Model | Columns |
|---|---|
| `Notification` (`:594-607`) | `id`, `userId`, `type` (`NotificationType`), `title`, `body?`, `link?`, `readAt?`, `createdAt`. Indexes `@@index([userId, readAt])`, `@@index([userId, createdAt])`. **No** `entityId`/`entityType`, no dedupe key, no `channel`, no `expiresAt`, no delivery-status column. |
| `NotificationPreference` (`:609-623`) | `id`, `userId @unique`, six `Boolean @default(true)` — `assignmentCreated`, `submissionReviewed`, `sessionRescheduled`, `lowAttendanceFlag`, `mentorFollowup`, `quizGraded` — plus `createdAt`/`updatedAt`. **No** per-channel column, no push master switch. |
| `NotificationType` (`:63-70`) | Exactly six values, as the spec states. |

**There is no device-token storage anywhere in the schema.** A grep for
`token`/`device`/`push`/`expo` across all 773 lines returns `InviteToken`,
`RefreshToken` (`tokenHash` — a bcrypt-style hash of a refresh credential),
`PasswordResetToken`, and `Session.checkInToken`. Not one of them can hold an
Expo push token without overloading a column that means something else, and
**C1 forbids exactly that** ("Do not work around a missing column by
overloading an existing one").

**Decision: push delivery is BLOCKED ON CUTOVER (spec D5 option (a)).** This
plan ships everything push needs *except* the row:

- the wire contract (`deviceRegistrationSchema`) and the type policy
  (`PUSH_NOTIFICATION_TYPES` + `shouldPush`), both tested;
- `POST /api/v1/me/devices`, mounted and documented, answering
  `503 push_unavailable` — the same honest-unavailability shape the repo
  already uses for `uploads_disabled` (`CLAUDE.md`, "API surface");
- the client permission flow and token lifecycle, which work end-to-end up to
  that 503;
- **the migration, written out ready to apply**, in
  `docs/superpowers/cutover/2026-08-24-notifications-push.md` (Task 5). It is
  a doc, not a file under `apps/backend/prisma/` — nothing in this plan touches
  `prisma/`.

Nothing else in the plan is blocked on it. The inbox, mark-read, preferences,
D1, D4, D6, D8 and the whole mobile surface ship without a migration.

Two further consequences of the frozen schema, recorded here so they are not
rediscovered mid-task:

- **A push master switch would also be a new column.** D5 item 3 wants one.
  There is none. Until cutover the master switch is the OS permission itself —
  revoking notification permission on the device is the off switch — and the
  six existing per-type booleans gate which types would push. Do not invent a
  seventh preference column and do not overload `quizGraded`.
- **`link` cannot become `entityType`/`entityId` columns** (D1). Producers keep
  writing v1's exact path strings so v1 — still in production, same database —
  keeps working, and the API derives a route-independent `target` from the
  string in **one** tested function (Task 2). Task 5's cutover doc carries the
  column addition and the backfill.

---

## THE TWO DELIBERATE BEHAVIOUR CHANGES — reviewable in one place

**1. D4 — the preference stops suppressing the in-app row (Task 2).** Today
(v1 R8, and v2's `createNotificationsBulk` verbatim) an opted-out recipient
gets *no row and no email*: the notification is not hidden, it is never
recorded. The spec's D4 recommendation is to split the semantics — the in-app
row is history and is **always** written; the preference governs outbound
channels only (email now, push at cutover). This plan implements the split.

Two consequences a reviewer must accept or reject explicitly:

- The shared database means **v1's own inbox will start showing rows to users
  who opted out there**. v1 renders `where: { userId }` with no preference
  filter (`notifications-page.tsx:14-27`), so a row written by v2 for an
  opted-out user is visible in the old web app too. The spec anticipates this
  ("it makes an opted-out user's inbox non-empty where v1's was empty") and
  still recommends the split.
- `apps/backend/src/__tests__/integration/notifications.test.ts:110-123`
  currently pins the old semantics. Task 2 rewrites that case. That is the
  test changing because the behaviour changed on purpose — not a test being
  loosened to fit.

If the reviewer rejects the split, the revert is small: restore the
`targets = userIds.filter(...)` line in `createNotificationsBulk`, restore the
old test, and note in the report that "off" means "no record".

**2. Push covers three types, not the spec's five (Task 1).**
`10-notifications.md` D5 item 2 proposes pushing `SESSION_RESCHEDULED`,
`SUBMISSION_REVIEWED`, `QUIZ_GRADED`, `LOW_ATTENDANCE_FLAG` and
`MENTOR_FOLLOWUP`, then withdraws `LOW_ATTENDANCE_FLAG` in its own next
sentence (04's D7/D12 unsettled, and R87 gives the flag no dedupe, so it can
burst). The roadmap sizes this plan at "the 2–3 interruptive types only".
`PUSH_NOTIFICATION_TYPES` therefore ships as **`SESSION_RESCHEDULED`,
`SUBMISSION_REVIEWED`, `QUIZ_GRADED`** — the three where the recipient is
actively waiting. `MENTOR_FOLLOWUP` is additionally excluded because R63 puts
the first 140 characters of a pastoral note into the notification body, and a
lock-screen preview is the worst possible place for it (R64, D8). Adding a
type later is one array entry plus one test line.

---

## Global Constraints

- **No migrations, ever. No edits under `apps/backend/prisma/`.** Shared live
  staging database with v1 (C1).
- **`D:\Projects\JPC\jpc-space` is READ-ONLY.** Read it for behaviour; never
  write to it.
- Response envelope `{ data }` / `{ error: { code, message } }` via
  `apiOk`/`apiError`.
- Value imports from shared use the relative path
  `"../../../../packages/shared/src/index"` in backend route files (the
  `rootDir` emit trap in `CLAUDE.md`); mobile imports `@space/shared` by
  package name.
- No `@/` path alias in either app. Mobile uses relative imports.
- `src/docs/openapi.ts` changes in the same commit as the route it documents.
- Integration fixtures: every row carries the `space-v2-test-` prefix in
  `User.email` or `Season.code`; use `createTestUser`/`createTestSeason`/
  `login`/`cleanupTestData` from `__tests__/integration/fixtures.ts`;
  `jest.setTimeout(60000)`.
- **Integration tests are coordinator-only.** Subagents write them and do not
  run them; the coordinator runs the suite serially:
  `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern <suite>`.
- Mobile: every response is **parsed with a Zod schema from `@space/shared`**,
  never cast. Dependent queries pass `enabled` and guard manual `refetch()`.
  Screens map states to `LoadingState` / `ErrorState` (with `onRetry`) /
  `EmptyState`. Screens under the tab shell pass
  `edges={["top", "left", "right"]}` to `Screen`. Tests use
  `renderWithProviders`; `jest.mock` factories may only close over consts named
  `mock*`; query `Input` fields with `getByLabelText`, assert errors via
  `accessibilityHint`. Never `as Href` / `as any`.
- **Never print or read secrets.** `GMAIL_USER` and `GMAIL_APP_PASSWORD` are
  referred to by name only; `apps/backend/.env` is not read by this plan.
- Rulings that bind here: **C1** (frozen schema), **C6** (a GET never writes),
  **C8** (row-scoped at the API, payload narrowed), **C11** (escape on every
  mail interpolation), **C12** (dead v1 code is not a specification — v1's
  unreachable `markNotificationReadAction` gets one endpoint, designed, not two
  ported).

**Execution shape:** Task 1 first (coordinator — both streams consume the
contracts). Then two agents in parallel: **backend** Tasks 2 → 3 → 4 → 5
(sequential, same files), **mobile** Tasks 6 → 7 → 8 → 9 → 10 (sequential,
same files). Task 11 is the coordinator's closing gate. The two streams share
no file except `packages/shared/src/index.ts`, which Task 1 finishes.

---

### Task 1: Contracts — the notification wire shapes (coordinator)

**Files:**
- Modify: `packages/shared/src/enums.ts` (add `notificationTypeSchema`)
- Create: `packages/shared/src/notification.ts`
- Modify: `packages/shared/src/index.ts` (add one export line)
- Test: `packages/shared/src/__tests__/notification-contracts.test.ts`

**Interfaces:**
- Consumes: `z` from zod, the existing enum-schema style in `enums.ts:1-25`.
- Produces (exact names every later task imports): `notificationTypeSchema` →
  type `NotificationType`; `notificationEntityTypeSchema` →
  `NotificationEntityType`; `notificationTargetSchema` → `NotificationTarget`;
  `notificationSchema` → `NotificationItem`;
  `notificationListQuerySchema` → `NotificationListQuery`;
  `notificationListResponseSchema`; `unreadCountResponseSchema`;
  `markReadRequestSchema` → `MarkReadRequest`; `markReadResponseSchema`;
  `NOTIFICATION_PREFERENCE_KEY_BY_TYPE`; `NOTIFICATION_PREFERENCE_KEYS`;
  `notificationPreferencesSchema` → `NotificationPreferences`;
  `notificationPreferencesResponseSchema`;
  `DEFAULT_NOTIFICATION_PREFERENCES`; `PUSH_NOTIFICATION_TYPES`;
  `shouldPush(type)`; `deviceRegistrationSchema` → `DeviceRegistration`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/__tests__/notification-contracts.test.ts
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_PREFERENCE_KEYS,
  NOTIFICATION_PREFERENCE_KEY_BY_TYPE,
  PUSH_NOTIFICATION_TYPES,
  deviceRegistrationSchema,
  markReadRequestSchema,
  notificationListQuerySchema,
  notificationPreferencesSchema,
  notificationSchema,
  notificationTypeSchema,
  shouldPush,
} from "../index";

describe("notificationTypeSchema", () => {
  it("mirrors the six values in prisma/schema.prisma:63-70", () => {
    expect(notificationTypeSchema.options).toEqual([
      "ASSIGNMENT_CREATED",
      "SUBMISSION_REVIEWED",
      "SESSION_RESCHEDULED",
      "LOW_ATTENDANCE_FLAG",
      "MENTOR_FOLLOWUP",
      "QUIZ_GRADED",
    ]);
  });
});

describe("notificationPreferencesSchema", () => {
  it("carries one key per notification type — all six, derived from the enum", () => {
    // v1 lost quizGraded precisely by hand-writing five of six field names
    // (spec R56, R57). The shape is derived here, and this is the runtime
    // half of that guarantee; the `satisfies` in the source is the compile half.
    expect(Object.keys(notificationPreferencesSchema.shape).sort()).toEqual(
      notificationTypeSchema.options
        .map((t) => NOTIFICATION_PREFERENCE_KEY_BY_TYPE[t])
        .sort(),
    );
    expect(NOTIFICATION_PREFERENCE_KEYS).toHaveLength(6);
    expect(NOTIFICATION_PREFERENCE_KEYS).toContain("quizGraded");
  });

  it("defaults every key to true — a user with no row is opted in (R6, R58)", () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES).toEqual({
      assignmentCreated: true,
      submissionReviewed: true,
      sessionRescheduled: true,
      lowAttendanceFlag: true,
      mentorFollowup: true,
      quizGraded: true,
    });
  });

  it("refuses a partial body — PUT carries all six keys", () => {
    expect(notificationPreferencesSchema.safeParse({ assignmentCreated: false }).success).toBe(
      false,
    );
    expect(notificationPreferencesSchema.safeParse(DEFAULT_NOTIFICATION_PREFERENCES).success).toBe(
      true,
    );
  });
});

describe("markReadRequestSchema", () => {
  it("accepts either ids or all: true, never both, never a userId", () => {
    expect(markReadRequestSchema.safeParse({ ids: [1, 2, 3] }).success).toBe(true);
    expect(markReadRequestSchema.safeParse({ all: true }).success).toBe(true);
    expect(markReadRequestSchema.safeParse({ ids: [1], all: true }).success).toBe(false);
    // Accepting a recipient id from a client is how this domain's one safe
    // property (everything is self-service — spec §4) would be lost.
    expect(markReadRequestSchema.safeParse({ ids: [1], userId: 2 }).success).toBe(false);
    expect(markReadRequestSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(markReadRequestSchema.safeParse({ all: false }).success).toBe(false);
  });

  it("bounds the id batch", () => {
    expect(markReadRequestSchema.safeParse({ ids: Array.from({ length: 201 }, (_, i) => i + 1) }).success).toBe(
      false,
    );
  });
});

describe("notificationListQuerySchema", () => {
  it("coerces query strings and defaults to a 20-row page", () => {
    expect(notificationListQuerySchema.parse({})).toEqual({ limit: 20, unreadOnly: false });
    expect(notificationListQuerySchema.parse({ cursor: "41", limit: "50", unreadOnly: "true" })).toEqual({
      cursor: 41,
      limit: 50,
      unreadOnly: true,
    });
  });

  it("caps the page at 50", () => {
    expect(notificationListQuerySchema.safeParse({ limit: "500" }).success).toBe(false);
  });
});

describe("notificationSchema", () => {
  it("carries the raw v1 link and the parsed target side by side (D1)", () => {
    const parsed = notificationSchema.parse({
      id: 7,
      type: "SUBMISSION_REVIEWED",
      title: "Essay one was reviewed",
      body: null,
      link: "/student/assignments/41",
      target: { entityType: "assignment", entityId: 41 },
      readAt: null,
      createdAt: "2026-08-24T10:00:00.000Z",
    });
    expect(parsed.target).toEqual({ entityType: "assignment", entityId: 41 });
  });

  it("allows a null target for a link shape nothing recognises", () => {
    expect(
      notificationSchema.safeParse({
        id: 7,
        type: "QUIZ_GRADED",
        title: "t",
        body: null,
        link: "/super/somewhere-new",
        target: null,
        readAt: null,
        createdAt: "2026-08-24T10:00:00.000Z",
      }).success,
    ).toBe(true);
  });
});

describe("push policy", () => {
  it("pushes only the three types the recipient is actively waiting on", () => {
    expect([...PUSH_NOTIFICATION_TYPES].sort()).toEqual([
      "QUIZ_GRADED",
      "SESSION_RESCHEDULED",
      "SUBMISSION_REVIEWED",
    ]);
    expect(shouldPush("SESSION_RESCHEDULED")).toBe(true);
    // The highest-volume fan-out in the system (spec D5 item 2).
    expect(shouldPush("ASSIGNMENT_CREATED")).toBe(false);
    // Can burst (04 R87, no dedupe) and is deferred until 04's D7/D12 settle.
    expect(shouldPush("LOW_ATTENDANCE_FLAG")).toBe(false);
    // Carries 140 characters of a pastoral note (R63/R64) — never on a lock screen.
    expect(shouldPush("MENTOR_FOLLOWUP")).toBe(false);
  });
});

describe("deviceRegistrationSchema", () => {
  it("takes a token and a platform, and no user id", () => {
    expect(deviceRegistrationSchema.safeParse({ token: "ExponentPushToken[x]", platform: "ios" }).success).toBe(
      true,
    );
    expect(
      deviceRegistrationSchema.safeParse({ token: "t", platform: "ios", userId: 3 }).success,
    ).toBe(false);
    expect(deviceRegistrationSchema.safeParse({ token: "t", platform: "web" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @space/shared jest src/__tests__/notification-contracts.test.ts`
Expected: FAIL — none of those exports exist.

- [ ] **Step 3: Add the enum schema**

Append to `packages/shared/src/enums.ts`, matching the file's existing style:

```ts
export const notificationTypeSchema = z.enum([
  "ASSIGNMENT_CREATED",
  "SUBMISSION_REVIEWED",
  "SESSION_RESCHEDULED",
  "LOW_ATTENDANCE_FLAG",
  "MENTOR_FOLLOWUP",
  "QUIZ_GRADED",
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;
```

- [ ] **Step 4: Write the domain contract**

```ts
// packages/shared/src/notification.ts
import { z } from "zod";

import { notificationTypeSchema, type NotificationType } from "./enums";

// Wire shapes — timestamps are strings, matching the note in season.ts.

/**
 * The route-independent reference that replaces `link` (spec D1).
 *
 * `Notification.link` is a v1 role-prefixed web path chosen by the producer
 * (R3), and v2's routes are flat, so `/admin/students/12` resolves to nothing
 * in the mobile app. The schema is frozen (C1), so the columns this wants
 * cannot exist yet: until cutover the API derives the target from the stored
 * string in one place (apps/backend/src/lib/notification-target.ts) and keeps
 * writing `link` verbatim so v1 — still in production against the same
 * database — keeps working. No client may parse the path itself.
 *
 * `calendar` is a destination rather than an entity because one of the six
 * link shapes v1 actually emits is the bare `/student/calendar` (R67), and
 * pretending it names a session would be a lie the resolver has to keep.
 */
export const notificationEntityTypeSchema = z.enum([
  "assignment",
  "quiz",
  "calendar",
  "student",
]);
export type NotificationEntityType = z.infer<typeof notificationEntityTypeSchema>;

export const notificationTargetSchema = z.object({
  entityType: notificationEntityTypeSchema,
  /** Null for the two list-level links v1 emits (`/student/quizzes`, `/student/calendar`). */
  entityId: z.number().int().positive().nullable(),
});
export type NotificationTarget = z.infer<typeof notificationTargetSchema>;

export const notificationSchema = z.object({
  id: z.number().int(),
  type: notificationTypeSchema,
  title: z.string(),
  body: z.string().nullable(),
  /** The raw v1 path, still written for v1's benefit. Clients render `target`. */
  link: z.string().nullable(),
  target: notificationTargetSchema.nullable(),
  /** Read state is a timestamp, not a boolean — null means unread (§2). */
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type NotificationItem = z.infer<typeof notificationSchema>;

export const notificationListQuerySchema = z.object({
  /** Id of the last row of the previous page; the list is ordered by id desc. */
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export const notificationListResponseSchema = z.object({
  items: z.array(notificationSchema),
  nextCursor: z.number().int().nullable(),
  /**
   * Rides along so the common case — open the inbox, render the badge — is one
   * request. It is a real `count`, not a filter over the page: v1 counted
   * unread by filtering the 100 rows it had fetched and silently understated
   * beyond that (R37).
   */
  unreadCount: z.number().int().min(0),
});

export const unreadCountResponseSchema = z.object({
  unreadCount: z.number().int().min(0),
});

/**
 * One endpoint for both v1 actions — the single-id one was dead code (R47) and
 * C12 says dead code is not a specification. `.strict()` on both arms is what
 * refuses `{ ids, all }` together and refuses a client-supplied `userId`.
 */
export const markReadRequestSchema = z.union([
  z.object({ ids: z.array(z.number().int().positive()).min(1).max(200) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);
export type MarkReadRequest = z.infer<typeof markReadRequestSchema>;

export const markReadResponseSchema = z.object({
  /** The number v1's markRead discarded (§6). */
  marked: z.number().int().min(0),
});

/**
 * NotificationType → its Boolean column on NotificationPreference.
 * `satisfies` makes a type without a column a compile error, mirroring
 * apps/backend/src/lib/notifications.ts:19-26.
 */
export const NOTIFICATION_PREFERENCE_KEY_BY_TYPE = {
  ASSIGNMENT_CREATED: "assignmentCreated",
  SUBMISSION_REVIEWED: "submissionReviewed",
  SESSION_RESCHEDULED: "sessionRescheduled",
  LOW_ATTENDANCE_FLAG: "lowAttendanceFlag",
  MENTOR_FOLLOWUP: "mentorFollowup",
  QUIZ_GRADED: "quizGraded",
} as const satisfies Record<NotificationType, string>;

export type NotificationPreferenceKey =
  (typeof NOTIFICATION_PREFERENCE_KEY_BY_TYPE)[NotificationType];

export const NOTIFICATION_PREFERENCE_KEYS: readonly NotificationPreferenceKey[] =
  notificationTypeSchema.options.map((t) => NOTIFICATION_PREFERENCE_KEY_BY_TYPE[t]);

/**
 * All six keys, required. The `satisfies` below is the structural fix for
 * R56/R57: drop a key and the object no longer satisfies
 * `Record<NotificationPreferenceKey, boolean>`, which is a compile error rather
 * than a preference nobody can set.
 */
export const notificationPreferencesSchema = z.object({
  assignmentCreated: z.boolean(),
  submissionReviewed: z.boolean(),
  sessionRescheduled: z.boolean(),
  lowAttendanceFlag: z.boolean(),
  mentorFollowup: z.boolean(),
  quizGraded: z.boolean(),
}) satisfies z.ZodType<Record<NotificationPreferenceKey, boolean>>;
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

/** A user with no preference row is opted in to everything (R6, R58). */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  assignmentCreated: true,
  submissionReviewed: true,
  sessionRescheduled: true,
  lowAttendanceFlag: true,
  mentorFollowup: true,
  quizGraded: true,
};

export const notificationPreferencesResponseSchema = z.object({
  preferences: notificationPreferencesSchema,
});

/**
 * Which types warrant an interruptive push (spec D5 item 2, narrowed).
 *
 * ASSIGNMENT_CREATED is the highest-volume fan-out in the system and is not
 * time-critical. LOW_ATTENDANCE_FLAG can burst (04 R87 gives it no dedupe) and
 * waits on 04's D7/D12. MENTOR_FOLLOWUP's body is the first 140 characters of a
 * pastoral note (R63), which must never reach a lock screen (R64, D8).
 */
export const PUSH_NOTIFICATION_TYPES = [
  "SESSION_RESCHEDULED",
  "SUBMISSION_REVIEWED",
  "QUIZ_GRADED",
] as const satisfies readonly NotificationType[];

export function shouldPush(type: NotificationType): boolean {
  return (PUSH_NOTIFICATION_TYPES as readonly NotificationType[]).includes(type);
}

/**
 * Device registration (spec D5). The row this writes does not exist yet — the
 * schema is frozen and there is no DeviceToken model — so the endpoint answers
 * 503 until cutover. The contract is fixed now so the client is built once.
 */
export const deviceRegistrationSchema = z
  .object({
    token: z.string().min(1).max(200),
    platform: z.enum(["ios", "android"]),
  })
  .strict();
export type DeviceRegistration = z.infer<typeof deviceRegistrationSchema>;
```

- [ ] **Step 5: Export it**

In `packages/shared/src/index.ts`, add after the `submission` line:

```ts
export * from "./notification";
```

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @space/shared jest src/__tests__/notification-contracts.test.ts` → PASS (11 cases)
Run: `pnpm turbo lint typecheck test:unit` → clean.

- [ ] **Step 7: Commit**

```bash
git add packages/shared && git commit -m "feat(shared): notification wire contracts, preference keys derived from the enum"
```

---

### Task 2: Delivery library — D4 channel split, D1 target parser, D6 helper, C11 escaping

**Files:**
- Create: `apps/backend/src/lib/notification-target.ts`
- Create: `apps/backend/src/lib/best-effort.ts`
- Modify: `apps/backend/src/lib/notifications.ts`
- Modify: `apps/backend/src/lib/email.ts` (escape at the template boundary)
- Modify: `apps/backend/src/routes/submissions.ts:379-389` (best-effort helper; fix the link's missing assignment id)
- Modify: `apps/backend/src/routes/sessions.ts:227` (best-effort helper)
- Test: `apps/backend/src/__tests__/notification-target.test.ts` (new, unit),
  `apps/backend/src/__tests__/best-effort.test.ts` (new, unit),
  `apps/backend/src/__tests__/email.test.ts` (extend, unit),
  `apps/backend/src/__tests__/integration/notifications.test.ts` (rewrite the opt-out case, add one)

**Interfaces:**
- Consumes: `NotificationTarget` from `@space/shared` (Task 1).
- Produces: `parseNotificationLink(link: string | null): NotificationTarget | null`;
  `bestEffort(label: string, fn: () => Promise<unknown>): Promise<void>`;
  `createNotificationsBulk(userIds, payload): Promise<BulkNotificationResult>`
  where `BulkNotificationResult = { written: number; suppressed: number }`
  (Task 3 and Plan 3's reschedule both consume the return value).

- [ ] **Step 1: Write the failing unit tests**

```ts
// apps/backend/src/__tests__/notification-target.test.ts
import { parseNotificationLink } from "../lib/notification-target";

describe("parseNotificationLink", () => {
  // The complete set of link shapes the nine v1 producers emit (spec R3, R62,
  // R63, R66, R67, R68, R69), plus the one v2 currently writes. Nothing else
  // reaches this table; anything else is a null target and a list fallback on
  // the client.
  it.each([
    ["/student/assignments/41", { entityType: "assignment", entityId: 41 }],
    ["/student/assignments", { entityType: "assignment", entityId: null }],
    ["/student/quizzes", { entityType: "quiz", entityId: null }],
    ["/student/calendar", { entityType: "calendar", entityId: null }],
    ["/admin/students/12", { entityType: "student", entityId: 12 }],
    ["/leader/students/12", { entityType: "student", entityId: 12 }],
  ])("maps %s", (link, expected) => {
    expect(parseNotificationLink(link)).toEqual(expected);
  });

  it("returns null for a null link, an unknown shape, or a non-numeric id", () => {
    expect(parseNotificationLink(null)).toBeNull();
    expect(parseNotificationLink("/super/reports")).toBeNull();
    expect(parseNotificationLink("/student/assignments/abc")).toBeNull();
    expect(parseNotificationLink("https://evil.test/student/assignments/1")).toBeNull();
  });

  it("ignores a trailing slash and a query string", () => {
    expect(parseNotificationLink("/student/assignments/41/")).toEqual({
      entityType: "assignment",
      entityId: 41,
    });
    expect(parseNotificationLink("/student/calendar?from=mail")).toEqual({
      entityType: "calendar",
      entityId: null,
    });
  });
});
```

```ts
// apps/backend/src/__tests__/best-effort.test.ts
import { bestEffort } from "../lib/best-effort";

describe("bestEffort", () => {
  it("never rejects into its caller", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      bestEffort("test-label", () => Promise.reject(new Error("transport down"))),
    ).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it("always logs the failure — v1's email failures were invisible (R21)", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await bestEffort("notify:SUBMISSION_REVIEWED", () => Promise.reject(new Error("boom")));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0]?.[0])).toContain("notify:SUBMISSION_REVIEWED");
    spy.mockRestore();
  });

  it("awaits a successful effect and logs nothing", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const fn = jest.fn().mockResolvedValue(undefined);
    await bestEffort("ok", fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
```

Extend `apps/backend/src/__tests__/email.test.ts` (read it first and match its
existing mocking of `nodemailer`; if it asserts on the rendered HTML it already
has the seam this needs):

```ts
it("escapes notification title and body before interpolating them into the mail", async () => {
  // R29/C11: title and body are built from user-controlled strings on every
  // type — assignment titles, quiz titles, student names, and 140 characters
  // of a mentor's free-text note. The in-app surfaces render through React and
  // escape; the mail is real HTML sent to a real inbox and does not.
  const html = renderNotificationHtmlForTest(
    '<img src=x onerror="alert(1)">',
    "5 < 6 & 7 > 2",
    null,
  );
  expect(html).not.toContain("<img");
  expect(html).toContain("&lt;img");
  expect(html).toContain("5 &lt; 6 &amp; 7 &gt; 2");
});
```

If `email.test.ts` has no such seam, export a small
`export function renderNotificationHtmlForTest(title, body, link)` from
`email.ts` that returns the same string `sendNotificationEmail` passes to
`sendMail`, and have `sendNotificationEmail` call it — one function, two
callers, no duplicated template.

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/backend && npx jest --testPathPattern "(notification-target|best-effort|email)"`
Expected: FAIL — `lib/notification-target.ts` and `lib/best-effort.ts` do not exist; the escaping case fails on the raw `<img`.

- [ ] **Step 3: Write the link parser**

```ts
// apps/backend/src/lib/notification-target.ts
import type { NotificationTarget } from "../../../../packages/shared/src/index";

/**
 * The one place a stored `Notification.link` becomes a route-independent
 * target (spec D1).
 *
 * Every notification in the shared database carries a v1 role-prefixed web
 * path chosen by the producer, not by the recipient's role (R3) — and the
 * scheme is already broken inside v1, where a mentor holding a GroupLeader row
 * gets a /leader link that bounces them (R4). v2's routes are flat, so the
 * string is meaningless to a device. The clean fix is two columns; the schema
 * is frozen (C1), so this parses instead, and the same function backfills the
 * columns at cutover (docs/superpowers/cutover/2026-08-24-notifications-push.md).
 *
 * Do NOT let a screen parse the path. One function, one place, one test table.
 */
const PATTERNS: {
  re: RegExp;
  build: (id: string | undefined) => NotificationTarget;
}[] = [
  {
    re: /^\/student\/assignments\/(\d+)$/,
    build: (id) => ({ entityType: "assignment", entityId: Number(id) }),
  },
  { re: /^\/student\/assignments$/, build: () => ({ entityType: "assignment", entityId: null }) },
  { re: /^\/student\/quizzes$/, build: () => ({ entityType: "quiz", entityId: null }) },
  { re: /^\/student\/calendar$/, build: () => ({ entityType: "calendar", entityId: null }) },
  {
    re: /^\/(?:admin|leader)\/students\/(\d+)$/,
    build: (id) => ({ entityType: "student", entityId: Number(id) }),
  },
];

export function parseNotificationLink(link: string | null): NotificationTarget | null {
  if (!link) return null;
  // Relative paths only: a stored absolute URL is not a route this app owns,
  // and treating it as one would let a link written elsewhere pick a screen.
  if (!link.startsWith("/")) return null;

  const path = link.split("?")[0]?.replace(/\/+$/, "") ?? "";
  const normalised = path === "" ? "/" : path;

  for (const { re, build } of PATTERNS) {
    const match = re.exec(normalised);
    if (match) return build(match[1]);
  }
  return null;
}
```

- [ ] **Step 4: Write the best-effort helper**

```ts
// apps/backend/src/lib/best-effort.ts
/**
 * Run a side effect that must never fail the business write that triggered it
 * (spec D6, and 04's D13 from the latency direction).
 *
 * v1 awaits every notification write with no catch, *after* the assignment /
 * session / submission has already committed, so a createMany failure
 * propagates out and the user is told their action failed when it succeeded
 * (R75). They retry, and on the paths that are not idempotent the retry writes
 * a second row. The mirror-image defect is the email half, which is never
 * awaited and never surfaced, so an outage is completely invisible (R20, R21).
 *
 * Two properties, both load-bearing: it never rejects into its caller, and it
 * always logs.
 */
export async function bestEffort(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[best-effort] ${label} failed:`, err instanceof Error ? err.message : err);
  }
}
```

- [ ] **Step 5: Split the channels in `createNotificationsBulk` (D4)**

Replace the body of `apps/backend/src/lib/notifications.ts`'s
`createNotificationsBulk` (keep `CreateNotificationInput` and `PREF_FIELD`
exactly as they are — `PREF_FIELD`'s `satisfies` is a v2 improvement over v1's
`Record<..., string>` and must not be reverted):

```ts
export interface BulkNotificationResult {
  /** Rows written. One per distinct recipient, always — see below. */
  written: number;
  /** Recipients whose *outbound* channels were suppressed by their preference. */
  suppressed: number;
}

/**
 * Fan out one notification to many recipients.
 *
 * Divergence from v1, ruled in spec D4: the in-app row is the user's history
 * and is **always** written. v1 filtered opted-out recipients out before the
 * insert (R8), so "off" meant "no record" — a user who only wanted the emails
 * to stop had to give up their inbox too, and with push arriving that single
 * boolean would be governing three channels. Here the preference governs
 * outbound channels only: email now, push at cutover.
 *
 * Consequence, accepted deliberately: v1 renders the same table with no
 * preference filter, so an opted-out user's v1 inbox stops being empty.
 *
 * Returns counts because v1 returned void and the caller could not learn what
 * happened (§6); domain 3's session write response needs the number
 * (`03-sessions.md` R17).
 */
export async function createNotificationsBulk(
  userIds: number[],
  payload: Omit<CreateNotificationInput, "userId">,
): Promise<BulkNotificationResult> {
  // Deduped: producers resolve recipients from more than one join table
  // (attendance-notifications.ts reads GroupLeader and SeasonAdmin), and
  // createMany has no skipDuplicates and no constraint to trip (R15).
  const targets = [...new Set(userIds)];
  if (targets.length === 0) return { written: 0, suppressed: 0 };

  const prefs = await db.notificationPreference.findMany({
    where: { userId: { in: targets } },
  });
  const prefField = PREF_FIELD[payload.type];
  // A user with no preference row has not opted out — defaults are all true
  // (R6). Only the literal `false` suppresses (R7).
  const optedOut = new Set(prefs.filter((p) => p[prefField] === false).map((p) => p.userId));

  await db.notification.createMany({
    data: targets.map((userId) => ({
      userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      // Keep writing v1's path verbatim: v1 is still in production against
      // this database and a notification it cannot open is a broken link for
      // real users. The route-independent target is derived on read
      // (lib/notification-target.ts). Spec D1.
      link: payload.link,
    })),
  });

  const mailTargets = targets.filter((id) => !optedOut.has(id));
  if (mailTargets.length > 0) {
    const users = await db.user.findMany({
      where: { id: { in: mailTargets } },
      select: { email: true },
    });
    // Fire-and-forget: mail must never delay or fail the request that
    // triggered it. allSettled so one bad address cannot reject the batch.
    void Promise.allSettled(
      users.map((u) =>
        sendNotificationEmail(u.email, payload.title, payload.body ?? null, payload.link ?? null),
      ),
    );
  }

  return { written: targets.length, suppressed: optedOut.size };
}
```

- [ ] **Step 6: Escape at the mail template boundary (C11, D8)**

In `apps/backend/src/lib/email.ts` add, above `renderShell`:

```ts
/**
 * Escape before interpolating into the HTML mail (ruling C11, spec D8/R29).
 *
 * `title` and `body` are built from user-controlled strings on every
 * notification type — assignment, quiz and session titles, student names, and
 * the first 140 characters of a mentor's note. The in-app surfaces render
 * through React and escape; this template does not, and the mail is real HTML
 * delivered to a real inbox.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
```

and apply it at every interpolation of caller-supplied text inside
`sendNotificationEmail` / the extracted `renderNotificationHtmlForTest`:
`escapeHtml(title)` in the shell heading and the subject's interpolation is
plain text (subjects are not HTML — leave the subject unescaped), and
`escapeHtml(body ?? "You have a new notification in JPC Space.")` in the body
paragraph. `viewLink` is server-built from `config.authUrl` plus the stored
`link`; run it through `encodeURI` before it reaches `buttonHtml`'s `href`.

- [ ] **Step 7: Route the producers through the helper (D6)**

Find every call site: `cd apps/backend/src && grep -rn "createNotificationsBulk\|flagLowAttendance" --include=*.ts routes/`.
At plan time that is exactly two (plus any reschedule producer Plan 3 has since
added — wrap that too):

1. `routes/submissions.ts:379-389` — replace the silent `try/catch` with the
   helper, **and fix the link**, which currently drops the assignment id that
   R66 requires:

```ts
  // Best-effort: the student is told, but a mail or notification failure must
  // not report the review itself as failed (spec D6, ruling from R75).
  await bestEffort("notify:SUBMISSION_REVIEWED", () =>
    createNotificationsBulk([sub.studentUserId], {
      type: "SUBMISSION_REVIEWED",
      title: parsed.data.returnForRevision
        ? `${sub.assignment.title} was returned for revision`
        : `${sub.assignment.title} was reviewed`,
      // R66: the link is /student/assignments/:id. This wrote the bare list
      // path, so the row could not deep-link in either app.
      link: `/student/assignments/${sub.assignmentId}`,
    }),
  );
```

   The `findUnique` above it selects `{ id, status, studentUserId, assignment: { select: { title: true } } }` —
   add `assignmentId: true` to that select or `sub.assignmentId` does not exist.

2. `routes/sessions.ts:227` — `await flagLowAttendance(sessionId, parsed.data.entries);`
   becomes:

```ts
  // The attendance rows are committed. A notification failure after that point
  // must not tell the leader their marking failed (spec D6).
  await bestEffort("notify:LOW_ATTENDANCE_FLAG", () =>
    flagLowAttendance(sessionId, parsed.data.entries),
  );
```

   Wrapping at the call site covers both of `attendance-notifications.ts`'s
   internal `createNotificationsBulk` awaits (`:62`, `:70`) — leave that file
   otherwise untouched.

Import `bestEffort` from `../lib/best-effort` in both route files.

- [ ] **Step 8: Rewrite the opt-out integration case (D4) and add one**

In `apps/backend/src/__tests__/integration/notifications.test.ts`, replace the
`"respects an opt-out on NotificationPreference"` case (`:110-123`) with:

```ts
it("writes the in-app row even for an opted-out recipient, and suppresses only their outbound channels", async () => {
  // BEHAVIOUR CHANGE, spec D4: v1 filtered opted-out recipients out before the
  // insert (R8), so "off" meant "no record" and the user lost their history to
  // stop the emails. The row is now always written; the preference governs
  // email (and push at cutover). This test is the old one, inverted on
  // purpose — see the plan header.
  await db.notification.deleteMany({ where: { userId: { in: [leaderId, adminId] } } });
  await db.notificationPreference.upsert({
    where: { userId: leaderId },
    update: { lowAttendanceFlag: false },
    create: { userId: leaderId, lowAttendanceFlag: false },
  });

  await flagLowAttendance(secondSessionId, [{ studentUserId: studentId, status: "ABSENT" }]);

  const recipients = await db.notification.findMany({
    where: { userId: { in: [leaderId, adminId] }, type: "LOW_ATTENDANCE_FLAG" },
    select: { userId: true },
  });
  expect(recipients.map((r) => r.userId).sort()).toEqual([adminId, leaderId].sort());
});

it("reports what it wrote and whose channels it suppressed", async () => {
  // v1 returned void, so a producer could not tell the caller how many people
  // were actually notified (§6; 03-sessions.md R17 needs this number).
  const result = await createNotificationsBulk([leaderId, adminId, leaderId], {
    type: "LOW_ATTENDANCE_FLAG",
    title: "space-v2-test counting probe",
    body: "b",
    link: `/admin/students/${studentId}`,
  });
  // leaderId appears twice and is deduped; leaderId is opted out from the case above.
  expect(result).toEqual({ written: 2, suppressed: 1 });
});
```

Add `import { createNotificationsBulk } from "../../lib/notifications";` at the
top. The second case depends on the first having created the opt-out row —
keep them adjacent and in this order (the suite is already order-dependent
through its shared `beforeAll`).

- [ ] **Step 9: Run the unit tests; hand the integration tests to the coordinator**

Run: `cd apps/backend && npx jest --testPathPattern "(notification-target|best-effort|email)"` → PASS
Run: `pnpm turbo lint typecheck test:unit --filter=@space/backend` → clean.
Do **not** run the integration suite as a subagent (`cleanupTestData` is
prefix-global and safe only under `--runInBand`).

- [ ] **Step 10: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): notification channel split, link target parser, best-effort producer helper, mail escaping"
```

---

### Task 3: Inbox endpoints — list, unread count, explicit mark-read

**Files:**
- Create: `apps/backend/src/routes/notifications.ts`
- Modify: `apps/backend/src/app.ts` (mount the router; add `PUT` to the CORS method list)
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: `apps/backend/src/__tests__/integration/notifications-routes.test.ts` (new)

**Interfaces:**
- Consumes: `notificationListQuerySchema`, `notificationListResponseSchema`'s
  shape, `markReadRequestSchema`, `unreadCountResponseSchema`'s shape from
  shared (Task 1); `parseNotificationLink` (Task 2); `requireAuth`,
  `requireUser`, `apiOk`, `apiError`.
- Produces: `notificationsRouter` mounted at `/api/v1/notifications`;
  `GET /` → `{ data: { items, nextCursor, unreadCount } }`;
  `GET /unread-count` → `{ data: { unreadCount } }`;
  `POST /read` → `{ data: { marked } }`.

- [ ] **Step 1: Write the failing integration tests**

```ts
// apps/backend/src/__tests__/integration/notifications-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let aliceId: number;
let bobId: number;
let aliceToken: string;
let bobToken: string;

async function seedFor(userId: number, count: number, link = "/student/assignments/41") {
  await db.notification.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      userId,
      type: "SUBMISSION_REVIEWED" as const,
      title: `space-v2-test notification ${i}`,
      body: null,
      link,
    })),
  });
}

beforeAll(async () => {
  await cleanupTestData();

  const alice = await createTestUser("alice", "STUDENT");
  const bob = await createTestUser("bob", "STUDENT");
  aliceId = alice.id;
  bobId = bob.id;
  aliceToken = await login(app, alice.email);
  bobToken = await login(app, bob.email);
});

afterEach(async () => {
  await db.notification.deleteMany({ where: { userId: { in: [aliceId, bobId] } } });
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/notifications", () => {
  it("returns the caller's own rows with the parsed target and a real unread count", async () => {
    await seedFor(aliceId, 3);

    const res = await request(app)
      .get("/api/v1/notifications")
      .set("authorization", `Bearer ${aliceToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(3);
    expect(res.body.data.unreadCount).toBe(3);
    expect(res.body.data.nextCursor).toBeNull();
    // D1: the client never sees a bare v1 path it has to parse.
    expect(res.body.data.items[0].target).toEqual({ entityType: "assignment", entityId: 41 });
    expect(res.body.data.items[0].readAt).toBeNull();
  });

  it("NEVER returns another user's rows (ruling C8)", async () => {
    await seedFor(bobId, 2);

    const res = await request(app)
      .get("/api/v1/notifications")
      .set("authorization", `Bearer ${aliceToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.unreadCount).toBe(0);
  });

  it("DOES NOT mark anything read (ruling C6)", async () => {
    await seedFor(aliceId, 2);

    // Twice, because React Query refetches on mount, on focus and on
    // reconnect — under v1's mark-on-render this is where the writes pile up.
    await request(app).get("/api/v1/notifications").set("authorization", `Bearer ${aliceToken}`);
    const second = await request(app)
      .get("/api/v1/notifications")
      .set("authorization", `Bearer ${aliceToken}`);

    expect(second.body.data.unreadCount).toBe(2);
    const unread = await db.notification.count({ where: { userId: aliceId, readAt: null } });
    expect(unread).toBe(2);
  });

  it("pages by cursor, newest first", async () => {
    await seedFor(aliceId, 5);

    const first = await request(app)
      .get("/api/v1/notifications?limit=2")
      .set("authorization", `Bearer ${aliceToken}`);
    expect(first.body.data.items).toHaveLength(2);
    expect(first.body.data.nextCursor).toBe(first.body.data.items[1].id);

    const second = await request(app)
      .get(`/api/v1/notifications?limit=2&cursor=${first.body.data.nextCursor}`)
      .set("authorization", `Bearer ${aliceToken}`);
    expect(second.body.data.items).toHaveLength(2);
    // Descending by id, and the cursor row itself is skipped.
    expect(second.body.data.items[0].id).toBeLessThan(first.body.data.items[1].id);

    const ids = [...first.body.data.items, ...second.body.data.items].map(
      (i: { id: number }) => i.id,
    );
    expect(new Set(ids).size).toBe(4);
  });

  it("filters to unread when asked", async () => {
    await seedFor(aliceId, 2);
    const rows = await db.notification.findMany({ where: { userId: aliceId }, select: { id: true } });
    await db.notification.update({
      where: { id: rows[0]!.id },
      data: { readAt: new Date() },
    });

    const res = await request(app)
      .get("/api/v1/notifications?unreadOnly=true")
      .set("authorization", `Bearer ${aliceToken}`);

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.unreadCount).toBe(1);
  });

  it("refuses an anonymous caller", async () => {
    const res = await request(app).get("/api/v1/notifications");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/v1/notifications/unread-count", () => {
  it("counts only the caller's unread rows", async () => {
    await seedFor(aliceId, 2);
    await seedFor(bobId, 5);

    const res = await request(app)
      .get("/api/v1/notifications/unread-count")
      .set("authorization", `Bearer ${aliceToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ unreadCount: 2 });
  });
});

describe("POST /api/v1/notifications/read", () => {
  it("marks the given ids and reports the count", async () => {
    await seedFor(aliceId, 3);
    const rows = await db.notification.findMany({ where: { userId: aliceId }, select: { id: true } });

    const res = await request(app)
      .post("/api/v1/notifications/read")
      .set("authorization", `Bearer ${aliceToken}`)
      .send({ ids: [rows[0]!.id] });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ marked: 1 });
    expect(await db.notification.count({ where: { userId: aliceId, readAt: null } })).toBe(2);
  });

  it("is idempotent — a repeat marks zero and never re-stamps readAt (R44)", async () => {
    await seedFor(aliceId, 1);
    const row = (await db.notification.findFirst({ where: { userId: aliceId } }))!;

    await request(app)
      .post("/api/v1/notifications/read")
      .set("authorization", `Bearer ${aliceToken}`)
      .send({ ids: [row.id] });
    const firstStamp = (await db.notification.findUnique({ where: { id: row.id } }))!.readAt;

    const repeat = await request(app)
      .post("/api/v1/notifications/read")
      .set("authorization", `Bearer ${aliceToken}`)
      .send({ ids: [row.id] });

    expect(repeat.body.data).toEqual({ marked: 0 });
    expect((await db.notification.findUnique({ where: { id: row.id } }))!.readAt).toEqual(firstStamp);
  });

  it("marks everything with all: true", async () => {
    await seedFor(aliceId, 4);

    const res = await request(app)
      .post("/api/v1/notifications/read")
      .set("authorization", `Bearer ${aliceToken}`)
      .send({ all: true });

    expect(res.body.data).toEqual({ marked: 4 });
    expect(await db.notification.count({ where: { userId: aliceId, readAt: null } })).toBe(0);
  });

  it("CANNOT mark another user's notification, even with its real id (ruling C8, R43)", async () => {
    await seedFor(bobId, 1);
    const bobRow = (await db.notification.findFirst({ where: { userId: bobId } }))!;

    const res = await request(app)
      .post("/api/v1/notifications/read")
      .set("authorization", `Bearer ${aliceToken}`)
      .send({ ids: [bobRow.id] });

    // The id is accepted as input and updates nothing — the userId clause in
    // the `where` is the only thing standing between this and a cross-user
    // write. Do not "simplify" it away.
    expect(res.body.data).toEqual({ marked: 0 });
    expect((await db.notification.findUnique({ where: { id: bobRow.id } }))!.readAt).toBeNull();
  });

  it("refuses a body carrying both arms, or a userId", async () => {
    const both = await request(app)
      .post("/api/v1/notifications/read")
      .set("authorization", `Bearer ${aliceToken}`)
      .send({ ids: [1], all: true });
    expect(both.status).toBe(400);

    const spoofed = await request(app)
      .post("/api/v1/notifications/read")
      .set("authorization", `Bearer ${aliceToken}`)
      .send({ ids: [1], userId: bobId });
    expect(spoofed.status).toBe(400);
  });
});
```

- [ ] **Step 2: (Coordinator runs it) — expect FAIL**

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern notifications-routes`
Expected: every case 404s — the router does not exist.

- [ ] **Step 3: Write the router**

```ts
// apps/backend/src/routes/notifications.ts
import { Router } from "express";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { parseNotificationLink } from "../lib/notification-target";
import { requireAuth, requireUser } from "../middleware/require-auth";
import {
  markReadRequestSchema,
  notificationListQuerySchema,
} from "../../../../packages/shared/src/index";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

const LIST_SELECT = {
  id: true,
  type: true,
  title: true,
  body: true,
  link: true,
  readAt: true,
  createdAt: true,
} as const;

type Row = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
};

function toWire(row: Row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    // Derived here, once, never on a client (spec D1).
    target: parseNotificationLink(row.link),
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The caller's own inbox.
 *
 * Everything in this domain is self-service (spec §4): `userId` comes from the
 * verified token and appears in the `where` clause itself, never as a filter
 * applied after the rows are fetched and never as a request parameter. Ruling
 * C8.
 *
 * Ordered by `id` desc rather than v1's `createdAt` desc: a fan-out written by
 * one `createMany` gives every row the same `createdAt` (R18), which makes a
 * createdAt cursor ambiguous exactly where the pages are densest. Insertion
 * order is the same order for every row that matters and it is unique.
 *
 * This endpoint writes nothing. v1 never marked on render either (R48, R49) —
 * but v2's client refetches on mount, on focus and on reconnect, so if it did,
 * every return to the app would be a write. Ruling C6.
 */
notificationsRouter.get("/", async (req, res) => {
  const user = requireUser(req);

  const parsed = notificationListQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid query.", 400);
  const { cursor, limit, unreadOnly } = parsed.data;

  const where = { userId: user.userId, ...(unreadOnly ? { readAt: null } : {}) };

  // One extra row tells us whether another page exists without a second count
  // query — the same shape as the submissions queue.
  const rows = await db.notification.findMany({
    where,
    orderBy: { id: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: LIST_SELECT,
  });

  const page = rows.slice(0, limit);

  // A real count, not a filter over the page: v1 counted unread by filtering
  // the 100 rows it had already fetched, so past 100 the header silently
  // understated (R37). Indexed by @@index([userId, readAt]).
  const unreadCount = await db.notification.count({
    where: { userId: user.userId, readAt: null },
  });

  return apiOk(res, {
    items: page.map(toWire),
    nextCursor: rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
    unreadCount,
  });
});

/**
 * The badge's endpoint.
 *
 * Separate from the list so rendering a number never fetches 20 rows. v1 paid
 * for both on every authenticated page render, for every role, whether or not
 * the bell was ever opened (R36) — and this count must not ride on `GET /me`,
 * which the client caches as session identity (spec D11).
 */
notificationsRouter.get("/unread-count", async (req, res) => {
  const user = requireUser(req);
  const unreadCount = await db.notification.count({
    where: { userId: user.userId, readAt: null },
  });
  return apiOk(res, { unreadCount });
});

/**
 * Mark read — the explicit write.
 *
 * One endpoint, not v1's two: its single-id action was exported and never
 * called (R47), and ruling C12 says unreachable code is not a specification.
 *
 * The `userId` clause is the whole security model here. `ids` is
 * client-supplied and is NOT an ownership assertion — a forged id updates zero
 * rows only because the `where` narrows it (R43, spec §4). Never reduce this
 * to `updateMany({ where: { id: { in: ids } } })`.
 *
 * `readAt: null` keeps repeats free and keeps `readAt` stable once set (R44),
 * which is what makes the client's debounced batching safe.
 */
notificationsRouter.post("/read", async (req, res) => {
  const user = requireUser(req);

  const parsed = markReadRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid mark-read body.", 400);
  const body = parsed.data;

  const result = await db.notification.updateMany({
    where: {
      userId: user.userId,
      readAt: null,
      ...("ids" in body ? { id: { in: body.ids } } : {}),
    },
    data: { readAt: new Date() },
  });

  return apiOk(res, { marked: result.count });
});
```

- [ ] **Step 4: Mount it, and fix the CORS method list**

In `apps/backend/src/app.ts`:

```ts
import { notificationsRouter } from "./routes/notifications";
```

```ts
  app.use("/api/v1/notifications", notificationsRouter);
```

placed with the other `/api/v1` mounts (order among them is irrelevant —
distinct prefixes).

In the same file, the CORS options list `methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]`
**omits `PUT`**. That is already wrong on `main` — `PUT /api/v1/submissions/by-assignment/:assignmentId`
exists — and Task 4 adds a second `PUT`. Change it to:

```ts
  app.use(cors({ origin: config.mobileAppOrigin, methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] }));
```

Report it: it is a pre-existing bug this plan happened to walk into.

- [ ] **Step 5: OpenAPI, same commit**

Add to `src/docs/openapi.ts`, house style (prose `description` on each path,
components for the shapes): `GET /notifications` (query `cursor`, `limit`
1–50 default 20, `unreadOnly`; response `items`/`nextCursor`/`unreadCount`;
description states that it performs no write — ruling C6),
`GET /notifications/unread-count`, `POST /notifications/read` (request is the
`ids | all` union; `bad_request` 400 documented; description states that ids
are not an ownership assertion), plus `Notification` and `NotificationTarget`
schemas.

- [ ] **Step 6: (Coordinator) run the suite**

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern notifications` → PASS (both notification suites).
Run: `pnpm turbo lint typecheck test:unit build --filter=@space/backend` → clean.

- [ ] **Step 7: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): notification inbox endpoints — list, unread count, explicit mark-read"
```

---

### Task 4: Notification preferences — read and replace

**Files:**
- Modify: `apps/backend/src/routes/me.ts`
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: `apps/backend/src/__tests__/integration/me-routes.test.ts` (extend — read it first for its fixtures)

**Interfaces:**
- Consumes: `notificationPreferencesSchema`, `DEFAULT_NOTIFICATION_PREFERENCES`,
  `NOTIFICATION_PREFERENCE_KEYS` from shared (Task 1).
- Produces: `GET /api/v1/me/notification-preferences` → `{ data: { preferences } }`;
  `PUT /api/v1/me/notification-preferences` → `{ data: { preferences } }`.

- [ ] **Step 1: Write the failing tests**

Append to `me-routes.test.ts` (reuse its existing user fixture and token; if it
has none, create one with `createTestUser("prefs", "STUDENT")` + `login`):

```ts
describe("notification preferences", () => {
  const allTrue = {
    assignmentCreated: true,
    submissionReviewed: true,
    sessionRescheduled: true,
    lowAttendanceFlag: true,
    mentorFollowup: true,
    quizGraded: true,
  };

  afterEach(async () => {
    await db.notificationPreference.deleteMany({ where: { userId: prefsUserId } });
  });

  it("returns all six keys, all true, when the user has no row (R6, R58, R59)", async () => {
    const res = await request(app)
      .get("/api/v1/me/notification-preferences")
      .set("authorization", `Bearer ${prefsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.preferences).toEqual(allTrue);
  });

  it("creates the row on first write and returns what was stored", async () => {
    const res = await request(app)
      .put("/api/v1/me/notification-preferences")
      .set("authorization", `Bearer ${prefsToken}`)
      .send({ ...allTrue, assignmentCreated: false, quizGraded: false });

    expect(res.status).toBe(200);
    expect(res.body.data.preferences.assignmentCreated).toBe(false);
    // v1 could not turn this one off from any surface: its input type declared
    // five fields and the form rendered five toggles, so the column kept its
    // default forever (R56, R57).
    expect(res.body.data.preferences.quizGraded).toBe(false);

    const row = await db.notificationPreference.findUnique({ where: { userId: prefsUserId } });
    expect(row?.quizGraded).toBe(false);
  });

  it("updates the existing row rather than creating a second", async () => {
    await request(app)
      .put("/api/v1/me/notification-preferences")
      .set("authorization", `Bearer ${prefsToken}`)
      .send({ ...allTrue, mentorFollowup: false });
    await request(app)
      .put("/api/v1/me/notification-preferences")
      .set("authorization", `Bearer ${prefsToken}`)
      .send(allTrue);

    const rows = await db.notificationPreference.findMany({ where: { userId: prefsUserId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.mentorFollowup).toBe(true);
  });

  it("refuses a partial body — PUT replaces all six", async () => {
    const res = await request(app)
      .put("/api/v1/me/notification-preferences")
      .set("authorization", `Bearer ${prefsToken}`)
      .send({ assignmentCreated: false });

    expect(res.status).toBe(400);
  });

  it("never lets a caller write someone else's preferences", async () => {
    // The target is not an input at all (R54) — a userId in the body is
    // ignored by the schema and the row written is the token's.
    const res = await request(app)
      .put("/api/v1/me/notification-preferences")
      .set("authorization", `Bearer ${prefsToken}`)
      .send({ ...allTrue, userId: otherUserId, assignmentCreated: false });

    expect(res.status).toBe(200);
    expect(await db.notificationPreference.findUnique({ where: { userId: otherUserId } })).toBeNull();
  });

  it("refuses an anonymous caller", async () => {
    expect((await request(app).get("/api/v1/me/notification-preferences")).status).toBe(401);
  });
});
```

If `me-routes.test.ts` has no second user, add
`const other = await createTestUser("prefs-other", "STUDENT"); otherUserId = other.id;`
to its `beforeAll`.

- [ ] **Step 2: (Coordinator) run — expect FAIL (404s).**

- [ ] **Step 3: Implement in `routes/me.ts`**

```ts
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  notificationPreferencesSchema,
} from "../../../../packages/shared/src/index";
```

```ts
const PREFERENCE_SELECT = {
  assignmentCreated: true,
  submissionReviewed: true,
  sessionRescheduled: true,
  lowAttendanceFlag: true,
  mentorFollowup: true,
  quizGraded: true,
} as const;

/**
 * The caller's own notification preferences — all six keys.
 *
 * v1 read the sixth column from the database and dropped it on the floor while
 * projecting to a five-field type (§5, R56), which is why `quizGraded` could
 * never be turned off. The contract is derived from the enum
 * (packages/shared/src/notification.ts), so a seventh type would be a compile
 * error rather than a silently unreachable toggle.
 *
 * No row means opted in to everything (R6) — the row is created lazily, on
 * first save, and most users have none (R59).
 */
meRouter.get("/notification-preferences", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const row = await db.notificationPreference.findUnique({
    where: { userId: user.userId },
    select: PREFERENCE_SELECT,
  });
  return apiOk(res, { preferences: row ?? DEFAULT_NOTIFICATION_PREFERENCES });
});

/**
 * Replace them. PUT, not PATCH: the body carries all six keys, so there is no
 * way for a client that has not been updated to leave a new key at its default
 * without saying so.
 *
 * The target row is never an input (R54) — `user.userId` comes from the
 * verified token, so one user cannot write another's preferences no matter
 * what the body says.
 */
meRouter.put("/notification-preferences", requireAuth, async (req, res) => {
  const user = requireUser(req);

  const parsed = notificationPreferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", "All six notification preferences are required.", 400);
  }

  const preferences = await db.notificationPreference.upsert({
    where: { userId: user.userId },
    update: parsed.data,
    create: { userId: user.userId, ...parsed.data },
    select: PREFERENCE_SELECT,
  });

  return apiOk(res, { preferences });
});
```

`me.ts` currently imports only `apiOk` — add `apiError` to that import.

Note on `.safeParse`: `notificationPreferencesSchema` is a plain (non-strict)
object, so an extra `userId` key in the body parses and is discarded rather
than 400ing. That is deliberate and the cross-user test above pins the
outcome; the request schema on the *mark-read* path is `.strict()` because
there the extra key would be adjacent to a real id array.

- [ ] **Step 4: OpenAPI, same commit** — both paths, the six-key
`NotificationPreferences` schema, and a description recording that a user with
no row is opted in to everything.

- [ ] **Step 5: (Coordinator) run the me suite** →
`npx jest --config jest.integration.config.js --runInBand --testPathPattern me-routes` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): notification preferences read/replace, all six keys"
```

---

### Task 5: Push — the contract now, the table at cutover

**Files:**
- Create: `docs/superpowers/cutover/2026-08-24-notifications-push.md`
- Modify: `apps/backend/src/routes/me.ts` (the device endpoint)
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: `apps/backend/src/__tests__/integration/me-routes.test.ts` (extend)

**Interfaces:**
- Consumes: `deviceRegistrationSchema`, `shouldPush`, `PUSH_NOTIFICATION_TYPES`
  from shared (Task 1).
- Produces: `POST /api/v1/me/devices` → `503 { error: { code: "push_unavailable" } }`
  until the cutover migration lands. The mobile client (Task 10) treats that
  code as "keep the token locally, stop retrying this session".

- [ ] **Step 1: Write the failing test**

Append to `me-routes.test.ts`:

```ts
describe("POST /api/v1/me/devices", () => {
  it("answers 503 push_unavailable — there is no table to write to yet", async () => {
    // The schema is frozen while v1 runs (ruling C1) and there is no
    // DeviceToken model, so registration cannot be honoured. 503 rather than
    // 404 or 501: the endpoint exists and the caller is entitled to it, the
    // capability is switched off — the same shape as uploads_disabled.
    const res = await request(app)
      .post("/api/v1/me/devices")
      .set("authorization", `Bearer ${prefsToken}`)
      .send({ token: "ExponentPushToken[space-v2-test]", platform: "ios" });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("push_unavailable");
  });

  it("validates the body before answering, so the contract is exercised now", async () => {
    const res = await request(app)
      .post("/api/v1/me/devices")
      .set("authorization", `Bearer ${prefsToken}`)
      .send({ token: "t", platform: "web" });

    expect(res.status).toBe(400);
  });

  it("refuses an anonymous caller", async () => {
    const res = await request(app)
      .post("/api/v1/me/devices")
      .send({ token: "t", platform: "ios" });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: (Coordinator) run — expect FAIL.**

- [ ] **Step 3: Implement the endpoint**

In `routes/me.ts` (import `deviceRegistrationSchema` alongside the others):

```ts
/**
 * Register this device for push.
 *
 * BLOCKED ON CUTOVER. Expo push needs a device token per user, which is a new
 * table (`DeviceToken`: userId, token @unique, platform, lastSeenAt) — and the
 * schema is frozen while v1 runs against the same database (ruling C1). There
 * is no existing column that legitimately holds an Expo push token, and C1
 * forbids overloading one that means something else.
 *
 * So the contract ships and the write does not. The body is validated first,
 * so a client integration error surfaces as a 400 today rather than at
 * cutover; a well-formed registration gets 503 and the client keeps the token
 * locally.
 *
 * To finish this at cutover: apply the migration in
 * docs/superpowers/cutover/2026-08-24-notifications-push.md, then replace the
 * 503 below with the upsert described there. Nothing else changes — not the
 * route, not the schema, not the client.
 */
meRouter.post("/devices", requireAuth, async (req, res) => {
  const parsed = deviceRegistrationSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid device registration.", 400);

  return apiError(
    res,
    "push_unavailable",
    "Push notifications aren't available yet.",
    503,
  );
});
```

`requireUser` is deliberately not called — nothing user-scoped happens yet.
`requireAuth` still runs so an anonymous caller gets 401, which is the
behaviour the endpoint will keep.

- [ ] **Step 4: Write the cutover document**

Create `docs/superpowers/cutover/2026-08-24-notifications-push.md` (the
directory is new — this is the first entry in the "migration thaw" list the
roadmap's Plan 13 step 2 will execute):

````markdown
# Cutover — notifications: push device tokens, and the `link` columns

Written 2026-08-24 during Plan 9. **Do not apply while jpc-space is still
writing to this database** (`_DECISIONS.md` C1). Both migrations are additive
and neither breaks v1, but `prisma/migrations/` is a verbatim copy of v1's and
must stay that way until v1 stops.

## 1. Device tokens (unblocks push)

```prisma
model DeviceToken {
  id         Int      @id @default(autoincrement())
  userId     Int
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  token      String   @unique
  platform   String
  lastSeenAt DateTime @default(now())
  createdAt  DateTime @default(now())

  @@index([userId])
}
```

and on `User`, alongside `notifications` / `notificationPreference`:

```prisma
  deviceTokens DeviceToken[]
```

SQL:

```sql
CREATE TABLE "DeviceToken" (
  "id"         SERIAL PRIMARY KEY,
  "userId"     INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "token"      TEXT NOT NULL,
  "platform"   TEXT NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");
CREATE INDEX "DeviceToken_userId_idx" ON "DeviceToken"("userId");
```

`token` is unique rather than `(userId, token)`: a device handed to a second
user must move, not accumulate — the upsert below re-points it.

Then replace the 503 in `apps/backend/src/routes/me.ts`'s `POST /devices` with:

```ts
  const user = requireUser(req);
  await db.deviceToken.upsert({
    where: { token: parsed.data.token },
    update: { userId: user.userId, platform: parsed.data.platform, lastSeenAt: new Date() },
    create: { userId: user.userId, token: parsed.data.token, platform: parsed.data.platform },
  });
  return apiOk(res, { registered: true });
```

and add `DELETE /api/v1/me/devices/:token` — `deleteMany({ where: { token, userId: user.userId } })`,
scoped to the caller so a token string is not a delete primitive for anyone
holding it.

Dispatch, to be written then, in `apps/backend/src/lib/push.ts`, called from
`createNotificationsBulk` beside the mail fan-out and behind the same
best-effort seam:

- recipients = targets minus `optedOut` (the same set the mail branch uses — a
  type the user turned off must not push either);
- gated on `shouldPush(payload.type)` (`packages/shared/src/notification.ts`,
  three types today);
- one batched POST to `https://exp.host/--/api/v2/push/send`, `Promise.allSettled`,
  never awaited into the request;
- drop tokens Expo reports as `DeviceNotRegistered`.

## 2. `Notification` target columns (spec D1)

```prisma
  entityType String?
  entityId   Int?
```

```sql
ALTER TABLE "Notification" ADD COLUMN "entityType" TEXT;
ALTER TABLE "Notification" ADD COLUMN "entityId" INTEGER;
```

Backfill with the same function the API already reads through —
`parseNotificationLink` in `apps/backend/src/lib/notification-target.ts`,
whose test table is the closed set of shapes the producers emit. After the
backfill, producers stop writing `link` and the parser becomes the backfill's
only remaining caller.

## 3. Also blocked on this migration (from the same spec)

- A push master switch on `NotificationPreference` (D5 item 3) — until then the
  OS permission is the master switch.
- `08-submissions.md` D14's submit→leader notification, which needs a new
  `NotificationType` enum value.
- D10's retention rule: hard-delete read notifications older than 180 days, as
  a scheduled job. Nothing has ever deleted a `Notification` (R53) and the
  100-row ceiling that hid the growth goes away with pagination.
````

- [ ] **Step 5: OpenAPI, same commit** — `POST /api/v1/me/devices`, request
`DeviceRegistration`, documented responses `503 push_unavailable` (with the
reason: the table lands at cutover) and `400 bad_request`.

- [ ] **Step 6: (Coordinator) run the me suite** → PASS.
Run `pnpm turbo lint typecheck test:unit build --filter=@space/backend` → clean.

- [ ] **Step 7: Commit**

```bash
git add apps/backend docs && git commit -m "feat(backend): device registration contract, push blocked on cutover with the migration written"
```

---

### Task 6: Mobile — query keys, hooks, and the target→route resolver

**Files:**
- Modify: `apps/mobile/src/lib/query-keys.ts`
- Create: `apps/mobile/src/lib/notification-route.ts`
- Create: `apps/mobile/src/hooks/use-notifications.ts`
- Test: `apps/mobile/src/__tests__/notification-route.test.ts` (new)

**Interfaces:**
- Consumes: `apiClient`, the `queryKeys` pattern, and from `@space/shared`:
  `notificationListResponseSchema`, `unreadCountResponseSchema`,
  `markReadResponseSchema`, `notificationPreferencesResponseSchema`,
  `type NotificationItem`, `type NotificationTarget`,
  `type NotificationPreferences`.
- Produces: `queryKeys.notifications.{all, lists(), list(unreadOnly), unreadCount(), preferences()}`;
  `useNotifications(unreadOnly?: boolean)`;
  `useUnreadCount(): UseQueryResult<number>`;
  `useMarkRead(): UseMutationResult<{ marked: number }, unknown, MarkReadInput>` where
  `MarkReadInput = { ids: number[] } | { all: true }`;
  `useNotificationPreferences(): UseQueryResult<NotificationPreferences>`;
  `useUpdateNotificationPreferences()`;
  `routeForTarget(target: NotificationTarget | null): NotificationRoute | null`.

- [ ] **Step 1: Write the failing resolver test**

```ts
// apps/mobile/src/__tests__/notification-route.test.ts
import { routeForTarget } from "../lib/notification-route";

describe("routeForTarget", () => {
  it("sends an assignment target to the assignment detail route", () => {
    expect(routeForTarget({ entityType: "assignment", entityId: 41 })).toEqual({
      pathname: "/assignment/[id]",
      params: { id: "41" },
    });
  });

  it("falls back to the list when the target names no specific row", () => {
    expect(routeForTarget({ entityType: "assignment", entityId: null })).toEqual({
      pathname: "/assignments",
    });
    expect(routeForTarget({ entityType: "quiz", entityId: null })).toEqual({
      pathname: "/quizzes",
    });
    expect(routeForTarget({ entityType: "calendar", entityId: null })).toEqual({
      pathname: "/calendar",
    });
  });

  it("sends a student target to the students list", () => {
    // The per-student detail route belongs to Plan 5. Until it exists this
    // lands on the list rather than a route the typed-route table has never
    // heard of.
    expect(routeForTarget({ entityType: "student", entityId: 12 })).toEqual({
      pathname: "/students",
    });
  });

  it("returns null for a notification with no resolvable target", () => {
    expect(routeForTarget(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/mobile && pnpm jest src/__tests__/notification-route.test.ts`
Expected: FAIL — `../lib/notification-route` does not exist.

- [ ] **Step 3: Write the resolver**

```ts
// apps/mobile/src/lib/notification-route.ts
import type { NotificationTarget } from "@space/shared";

/**
 * A notification's target → a route in this app.
 *
 * The server derives `target` from the stored v1 path in one place
 * (apps/backend/src/lib/notification-target.ts, spec D1); this is the other
 * half — one switch, one place, no screen parsing anything. Every arm points
 * at a route file that exists today; when Plan 5 adds `student/[id]`, the
 * student arm becomes a deep link and this test file is where that is pinned.
 */
export type NotificationRoute =
  | { pathname: "/assignment/[id]"; params: { id: string } }
  | { pathname: "/assignments" }
  | { pathname: "/quizzes" }
  | { pathname: "/calendar" }
  | { pathname: "/students" };

export function routeForTarget(target: NotificationTarget | null): NotificationRoute | null {
  if (!target) return null;

  switch (target.entityType) {
    case "assignment":
      return target.entityId === null
        ? { pathname: "/assignments" }
        : { pathname: "/assignment/[id]", params: { id: String(target.entityId) } };
    case "quiz":
      return { pathname: "/quizzes" };
    case "calendar":
      return { pathname: "/calendar" };
    case "student":
      return { pathname: "/students" };
  }
}
```

**Before running typecheck:** confirm `apps/mobile/app/(app)/assignment/[id].tsx`
exists (Plan 1 Task 2 created it). If this checkout does not have it, drop the
first arm to `{ pathname: "/assignments" }`, delete the corresponding test
case, and say so in the report — typed routes are on and a pathname with no
route file is a compile error, which is exactly the guard working.

- [ ] **Step 4: Add the query-key factory**

In `apps/mobile/src/lib/query-keys.ts`, add a sibling to `sessions` inside the
same `queryKeys` object:

```ts
  notifications: {
    all: ["notifications"] as const,
    lists: () => [...queryKeys.notifications.all, "list"] as const,
    // The unread-only inbox is a different server query, so it gets its own
    // cache entry rather than being filtered out of the full one.
    list: (unreadOnly: boolean) => [...queryKeys.notifications.lists(), { unreadOnly }] as const,
    unreadCount: () => [...queryKeys.notifications.all, "unread-count"] as const,
    preferences: () => [...queryKeys.notifications.all, "preferences"] as const,
  },
```

- [ ] **Step 5: Write the hooks**

```ts
// apps/mobile/src/hooks/use-notifications.ts
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  markReadResponseSchema,
  notificationListResponseSchema,
  notificationPreferencesResponseSchema,
  unreadCountResponseSchema,
  type NotificationItem,
  type NotificationPreferences,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

export type MarkReadInput = { ids: number[] } | { all: true };

/**
 * The inbox, paginated.
 *
 * v1 had no cursor and truncated at 100 rows with an unread count computed
 * over those rows, so past 100 the header was simply wrong (R33, R37, R39).
 * On a phone this is a FlatList and paging is not optional.
 */
export function useNotifications(unreadOnly = false) {
  return useInfiniteQuery({
    queryKey: queryKeys.notifications.list(unreadOnly),
    initialPageParam: undefined as number | undefined,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: "20" });
      if (unreadOnly) params.set("unreadOnly", "true");
      if (pageParam !== undefined) params.set("cursor", String(pageParam));
      const res = await apiClient.get(`/api/v1/notifications?${params.toString()}`);
      return notificationListResponseSchema.parse(res.data.data);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/**
 * The badge.
 *
 * A count, not a list: v1 fetched eight rows plus a count on every
 * authenticated page render for every role, opened bell or not (R36). Polled
 * slowly and refetched on focus (spec D11) — and deliberately NOT carried on
 * `GET /me`, which the client caches as session identity.
 */
export function useUnreadCount(): UseQueryResult<number> {
  return useQuery({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/notifications/unread-count");
      return unreadCountResponseSchema.parse(res.data.data).unreadCount;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/**
 * Marking read is an explicit write, called from a user action — never from a
 * `useEffect` keyed on query data (ruling C6, spec D2).
 *
 * v1 changed read state from exactly one control and never on open (R48, R49).
 * Mobile users expect mark-on-open, which is a new write on a screen React
 * Query refetches on mount, on focus and on reconnect; wiring it to the query
 * resolving would fire it on every one of those. The endpoint is idempotent
 * (its `readAt: null` filter), which is what makes a repeat free rather than a
 * second timestamp.
 */
export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: MarkReadInput) => {
      const res = await apiClient.post("/api/v1/notifications/read", input);
      return markReadResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.lists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount() });
    },
  });
}

export function useNotificationPreferences(): UseQueryResult<NotificationPreferences> {
  return useQuery({
    queryKey: queryKeys.notifications.preferences(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/me/notification-preferences");
      return notificationPreferencesResponseSchema.parse(res.data.data).preferences;
    },
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (preferences: NotificationPreferences) => {
      // PUT with all six keys — the contract has no partial form, which is
      // what keeps a client from silently leaving a key at its default.
      const res = await apiClient.put("/api/v1/me/notification-preferences", preferences);
      return notificationPreferencesResponseSchema.parse(res.data.data).preferences;
    },
    onSuccess: (preferences) => {
      queryClient.setQueryData(queryKeys.notifications.preferences(), preferences);
    },
  });
}

/** Flattened pages, for a FlatList's `data`. */
export function flattenNotifications(
  pages: { items: NotificationItem[] }[] | undefined,
): NotificationItem[] {
  return (pages ?? []).flatMap((p) => p.items);
}
```

- [ ] **Step 6: Run the tests**

Run: `cd apps/mobile && pnpm jest src/__tests__/notification-route.test.ts` → PASS
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): notification hooks, query keys, and the target→route resolver"
```

---

### Task 7: Mobile — the inbox screen and its home in the navigation

**The D3 decision, and why.** `/notifications` is in no role's navigation and
the tab shell has no header to hang a bell on (`(app)/_layout.tsx` sets
`headerShown: false`). The five tab slots per role are full and role-defined.
So this task does **both** halves:

1. **A `sidebar` entry in all six navs** (`packages/shared/src/navigation.ts`),
   which is the smaller change and the one that makes the route reachable
   through the shared mechanism: `ALL_NAV_HREFS` → `ALL_ROUTE_NAMES` →
   `Tabs.Screen` with the existing `{ href: null }` fallback. No
   `DETAIL_ROUTE_NAMES` edit, no second source of truth. Every role including
   MENTOR gets an entry — MENTOR has no `/more` tab, so a "put it behind More"
   answer would leave one role unable to reach their own inbox.
2. **A bell with an unread badge on the dashboard** (Task 8), because a
   sidebar-only entry buries the badge and, as the spec puts it, the badge is
   the entire point. `/dashboard` is the one href in every one of the six navs'
   `tabs`, so this reaches every role in one tap.

**Files:**
- Create: `apps/mobile/app/(app)/notifications.tsx`
- Modify: `packages/shared/src/navigation.ts` (add `"notifications"` to
  `NavIconName`; add the sidebar entry to SUPER, ADMIN, LEADER, STUDENT,
  MENTOR, ALUMNI)
- Modify: `packages/shared/src/__tests__/navigation.test.ts` (the pin test
  freezes every sidebar — six edits)
- Modify: `apps/mobile/src/components/NavIcon.tsx` (one glyph)
- Test: `apps/mobile/src/__tests__/notifications-screen.test.tsx` (new)

**Interfaces:**
- Consumes: `useNotifications`, `useMarkRead`, `flattenNotifications` (Task 6),
  `routeForTarget` (Task 6), `formatDate` from `../../src/lib/format`.
- Produces: the `/notifications` route; nothing else imports this screen.

- [ ] **Step 1: Write the failing screen test**

```tsx
// apps/mobile/src/__tests__/notifications-screen.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import NotificationsScreen from "../../app/(app)/notifications";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const studentSession = {
  user: { id: 9, name: "Test student", email: "s@jpc.test", role: "STUDENT" as const, avatarPath: null },
  scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: 7, graduationYear: null },
};

const unread = {
  id: 5,
  type: "SUBMISSION_REVIEWED" as const,
  title: "Essay one was reviewed",
  body: null,
  link: "/student/assignments/41",
  target: { entityType: "assignment" as const, entityId: 41 },
  readAt: null,
  createdAt: "2026-08-24T10:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(studentSession);
});

describe("NotificationsScreen", () => {
  it("lists the caller's notifications", async () => {
    get.mockResolvedValue({
      data: { data: { items: [unread], nextCursor: null, unreadCount: 1 } },
    });

    renderWithProviders(<NotificationsScreen />);

    expect(await screen.findByText("Essay one was reviewed")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/notifications?limit=20");
  });

  it("writes NOTHING when the inbox is merely read (ruling C6, spec D2)", async () => {
    get.mockResolvedValue({
      data: { data: { items: [unread], nextCursor: null, unreadCount: 1 } },
    });

    renderWithProviders(<NotificationsScreen />);
    await screen.findByText("Essay one was reviewed");

    // v1's inbox performed no write at all, and React Query refetches on
    // mount, on focus and on reconnect — a mark-read in a useEffect keyed on
    // this data would fire on every one of them.
    expect(post).not.toHaveBeenCalled();
  });

  it("marks one read and navigates on an explicit tap", async () => {
    get.mockResolvedValue({
      data: { data: { items: [unread], nextCursor: null, unreadCount: 1 } },
    });
    post.mockResolvedValue({ data: { data: { marked: 1 } } });

    renderWithProviders(<NotificationsScreen />);
    fireEvent.press(await screen.findByText("Essay one was reviewed"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/notifications/read", { ids: [5] }),
    );
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/assignment/[id]",
      params: { id: "41" },
    });
  });

  it("does not re-mark a notification that is already read", async () => {
    get.mockResolvedValue({
      data: {
        data: {
          items: [{ ...unread, readAt: "2026-08-24T11:00:00.000Z" }],
          nextCursor: null,
          unreadCount: 0,
        },
      },
    });

    renderWithProviders(<NotificationsScreen />);
    fireEvent.press(await screen.findByText("Essay one was reviewed"));

    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(post).not.toHaveBeenCalled();
  });

  it("marks all read from its own explicit control", async () => {
    get.mockResolvedValue({
      data: { data: { items: [unread], nextCursor: null, unreadCount: 1 } },
    });
    post.mockResolvedValue({ data: { data: { marked: 1 } } });

    renderWithProviders(<NotificationsScreen />);
    fireEvent.press(await screen.findByText("Mark all read"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/notifications/read", { all: true }),
    );
  });

  it("shows an empty state with no notifications", async () => {
    get.mockResolvedValue({ data: { data: { items: [], nextCursor: null, unreadCount: 0 } } });

    renderWithProviders(<NotificationsScreen />);

    expect(await screen.findByText("No notifications")).toBeTruthy();
  });

  it("navigates without marking when the notification has no resolvable target", async () => {
    get.mockResolvedValue({
      data: {
        data: {
          items: [{ ...unread, link: "/super/unknown", target: null }],
          nextCursor: null,
          unreadCount: 1,
        },
      },
    });
    post.mockResolvedValue({ data: { data: { marked: 1 } } });

    renderWithProviders(<NotificationsScreen />);
    fireEvent.press(await screen.findByText("Essay one was reviewed"));

    // Still marked read — the user has seen it — but there is nowhere to go.
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/mobile && pnpm jest src/__tests__/notifications-screen.test.tsx`
Expected: FAIL — `app/(app)/notifications.tsx` does not exist.

- [ ] **Step 3: Add the nav entries and the glyph**

In `packages/shared/src/navigation.ts`:

1. Add `| "notifications"` to the `NavIconName` union (alphabetically it sits
   next to `notes`).
2. Insert, **immediately before the `/settings` entry** in `SUPER.sidebar`,
   `ADMIN.sidebar`, `LEADER.sidebar`, `STUDENT.sidebar` and `ALUMNI.sidebar`,
   and **at the end** of `MENTOR.sidebar` (which also ends with `/settings` —
   so before it there too, keeping the rule uniform):

```ts
    { href: "/notifications", label: "Notifications", icon: "notifications" },
```

Do **not** add it to any `tabs` array: the five slots per role are v1's and the
pin test freezes them; the badge lives on the dashboard bell (Task 8).

In `apps/mobile/src/components/NavIcon.tsx`, add to `GLYPHS`:

```ts
  notifications: "notifications",
```

(`Record<NavIconName, IoniconName>` makes the missing entry a compile error, so
this is not optional.)

- [ ] **Step 4: Update the nav pin test**

`packages/shared/src/__tests__/navigation.test.ts`'s last case freezes every
sidebar as `[href, label, icon]` triples. Add

```ts
        ["/notifications", "Notifications", "notifications"],
```

immediately before the `["/settings", "Settings", "settings"]` line in **all
six** expected shapes (SUPER, ADMIN, LEADER, STUDENT, MENTOR, alumni). Change
nothing else — the `tabs` arrays and the five-tab case stay exactly as they
are.

- [ ] **Step 5: Write the screen**

```tsx
// apps/mobile/app/(app)/notifications.tsx
import { useRouter } from "expo-router";
import { FlatList, Pressable } from "react-native";
import type { NotificationItem } from "@space/shared";

import {
  flattenNotifications,
  useMarkRead,
  useNotifications,
} from "../../src/hooks/use-notifications";
import { formatDate } from "../../src/lib/format";
import { routeForTarget } from "../../src/lib/notification-route";
import { useTheme } from "../../src/theme";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

/**
 * The inbox — one route for everybody.
 *
 * v1 had six byte-identical role pages whose only difference was a URL gate;
 * the body re-derived the viewer from the session and scoped to their own id,
 * so collapsing them loses no authorization because there never was any (R40).
 *
 * Reading this screen performs no write. Read state changes from a tap or from
 * "Mark all read", never from the list query resolving — ruling C6, spec D2.
 */
function NotificationRow({
  item,
  onPress,
}: {
  item: NotificationItem;
  onPress: (item: NotificationItem) => void;
}) {
  const theme = useTheme();
  const isUnread = item.readAt === null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isUnread }}
      onPress={() => onPress(item)}
    >
      <Card
        style={{
          marginBottom: theme.spacing.sm,
          borderLeftWidth: isUnread ? 3 : 0,
          borderLeftColor: theme.colors.brand.navy[900],
        }}
      >
        <Text variant="heading">{item.title}</Text>
        {item.body ? (
          <Text variant="body" color={theme.colors.neutral[600]}>
            {item.body}
          </Text>
        ) : null}
        <Text variant="label" color={theme.colors.neutral[600]}>
          {formatDate(item.createdAt)}
          {isUnread ? " · Unread" : ""}
        </Text>
      </Card>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data, isPending, isError, refetch, isRefetching, fetchNextPage, hasNextPage } =
    useNotifications();
  const markRead = useMarkRead();

  const items = flattenNotifications(data?.pages);

  const handlePress = (item: NotificationItem) => {
    // Explicit: the user tapped. Already-read rows are skipped so a re-open
    // costs nothing (the endpoint is idempotent anyway — R44).
    if (item.readAt === null) markRead.mutate({ ids: [item.id] });

    const route = routeForTarget(item.target);
    if (route) router.push(route);
  };

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
        <ErrorState message="Couldn't load your notifications." onRetry={refetch} />
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "left", "right"]}>
      <Button
        title="Mark all read"
        variant="secondary"
        onPress={() => markRead.mutate({ all: true })}
        loading={markRead.isPending}
      />
      {items.length === 0 ? (
        <EmptyState title="No notifications" message="You're all caught up." />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <NotificationRow item={item} onPress={handlePress} />}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (hasNextPage) void fetchNextPage();
          }}
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          style={{ marginTop: theme.spacing.sm }}
        />
      )}
    </Screen>
  );
}
```

`Screen` is used **without** `scroll`/`onRefresh` here: those branches render a
`ScrollView`, and a `FlatList` inside one loses virtualisation. The non-scroll
branch is a plain `View`, which is what a list wants. Check `Button`'s prop
names in `src/ui/Button.tsx` and `theme.colors.brand.navy` in
`src/theme/tokens.ts` before relying on them; use whatever the files actually
export.

- [ ] **Step 6: Run the screen test and the guards**

Run: `cd apps/mobile && pnpm jest src/__tests__/notifications-screen.test.tsx src/__tests__/role-tabs.test.tsx src/__tests__/app-layout.test.tsx` → PASS.
`role-tabs.test.tsx` asserts every `ALL_NAV_HREFS` entry has a route file on
disk and that `routeNameForHref` names a real file — both are satisfied by
`app/(app)/notifications.tsx` existing. If either fails, the file is
misnamed, not the test.

Run: `pnpm --filter @space/shared jest` → PASS (the pin test now expects the
new entries).
Run: `pnpm turbo lint typecheck test:unit` → clean (typed routes: the new route
file must be picked up; if `typecheck` complains about `/notifications` not
existing in the route table, run `pnpm turbo routes:generate --filter=@space/mobile`).

- [ ] **Step 7: Commit**

```bash
git add apps/mobile packages/shared && git commit -m "feat(mobile): notification inbox screen, reachable from every role's nav"
```

---

### Task 8: Mobile — the unread bell on the dashboard

**Files:**
- Create: `apps/mobile/src/components/NotificationBell.tsx`
- Modify: `apps/mobile/app/(app)/dashboard.tsx`
- Test: `apps/mobile/src/__tests__/dashboard.test.tsx` (extend — read it first;
  its `get` mock currently serves one URL and must become a router)

**Interfaces:**
- Consumes: `useUnreadCount` (Task 6), `NavIcon` (Task 7's `notifications` glyph).
- Produces: `<NotificationBell />`, used only by the dashboard today.

- [ ] **Step 1: Extend the dashboard test**

```tsx
it("shows the unread badge and opens the inbox", async () => {
  // The dashboard is the one destination in every role's tab bar, which is
  // why the bell lives here (spec D3 — a sidebar-only entry buries the badge).
  get.mockImplementation((url: string) =>
    url === "/api/v1/notifications/unread-count"
      ? Promise.resolve({ data: { data: { unreadCount: 3 } } })
      : Promise.resolve({ data: { data: { sessions: [] } } }),
  );

  renderWithProviders(<DashboardScreen />);

  expect(await screen.findByLabelText("Notifications, 3 unread")).toBeTruthy();
  expect(screen.getByText("3")).toBeTruthy();

  fireEvent.press(screen.getByLabelText("Notifications, 3 unread"));
  expect(mockPush).toHaveBeenCalledWith("/notifications");
});

it("caps the badge at 9+", async () => {
  get.mockImplementation((url: string) =>
    url === "/api/v1/notifications/unread-count"
      ? Promise.resolve({ data: { data: { unreadCount: 42 } } })
      : Promise.resolve({ data: { data: { sessions: [] } } }),
  );

  renderWithProviders(<DashboardScreen />);

  expect(await screen.findByText("9+")).toBeTruthy();
});

it("renders no badge at zero unread", async () => {
  get.mockImplementation((url: string) =>
    url === "/api/v1/notifications/unread-count"
      ? Promise.resolve({ data: { data: { unreadCount: 0 } } })
      : Promise.resolve({ data: { data: { sessions: [] } } }),
  );

  renderWithProviders(<DashboardScreen />);

  expect(await screen.findByLabelText("Notifications")).toBeTruthy();
  expect(screen.queryByText("0")).toBeNull();
});
```

`dashboard.test.tsx` does not currently mock `expo-router` (the screen never
navigated). Add at the top, with the other mocks:

```tsx
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));
```

and switch its existing `get.mockResolvedValue(...)` calls to the
`mockImplementation` URL-router form shown above, so the existing session
cases keep passing while the bell's query resolves too.

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/mobile && pnpm jest src/__tests__/dashboard.test.tsx`
Expected: the three new cases FAIL; the existing ones PASS.

- [ ] **Step 3: Write the bell**

```tsx
// apps/mobile/src/components/NotificationBell.tsx
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";

import { useUnreadCount } from "../hooks/use-notifications";
import { useTheme } from "../theme";
import { Text } from "../ui";
import { NavIcon } from "./NavIcon";

/**
 * The inbox's entry point and its badge.
 *
 * The tab shell has no header (`(app)/_layout.tsx` sets `headerShown: false`)
 * and every role's five tab slots are taken, so this sits on the dashboard —
 * the one href present in all six navs' `tabs`. Spec D3.
 *
 * The count comes from its own endpoint on a slow poll, not from a list fetch
 * and not from `GET /me` (spec D11): v1 paid for eight rows plus a count on
 * every authenticated page render for every role, opened bell or not (R36).
 */
export function NotificationBell() {
  const theme = useTheme();
  const router = useRouter();
  const { data } = useUnreadCount();
  const count = data ?? 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
      onPress={() => router.push("/notifications")}
      style={{ alignSelf: "flex-end", flexDirection: "row", alignItems: "center", gap: theme.spacing.xs }}
    >
      <NavIcon name="notifications" color={theme.colors.neutral[900]} size={24} />
      {count > 0 ? (
        <View
          style={{
            minWidth: 20,
            paddingHorizontal: 6,
            borderRadius: 10,
            backgroundColor: theme.colors.error[600],
            alignItems: "center",
          }}
        >
          {/* Capped like v1's bell (R38) — the exact number stops being useful
              past a handful and the badge stops fitting. */}
          <Text variant="caption" color="#ffffff">
            {count > 9 ? "9+" : String(count)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
```

Check `theme.spacing.xs`, `theme.colors.error[600]` and the `caption` text
variant exist in `src/theme/tokens.ts` / `src/ui/Text.tsx`; substitute the
nearest real token if not.

- [ ] **Step 4: Mount it**

In `apps/mobile/app/(app)/dashboard.tsx`, render `<NotificationBell />` as the
first child inside `Screen`, above the season/sessions conditional. It manages
its own query and renders regardless of `activeSeasonId` — an inbox is not
season-scoped.

- [ ] **Step 5: Run the tests**

Run: `cd apps/mobile && pnpm jest src/__tests__/dashboard.test.tsx` → PASS (all).
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): unread notification bell on the dashboard"
```

---

### Task 9: Mobile — the six preference toggles

**Files:**
- Create: `apps/mobile/src/components/NotificationPreferences.tsx`
- Modify: `apps/mobile/app/(app)/settings.tsx`
- Modify: `apps/mobile/src/__tests__/placeholder-screens.test.tsx` (only if
  settings is still a placeholder — read it first)
- Test: `apps/mobile/src/__tests__/notification-preferences.test.tsx` (new)

**Interfaces:**
- Consumes: `useNotificationPreferences`, `useUpdateNotificationPreferences`
  (Task 6); `NOTIFICATION_PREFERENCE_KEYS`, `type NotificationPreferences` from
  `@space/shared`.
- Produces: `<NotificationPreferences />`, used by the settings screen (and by
  the push section in Task 10).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/__tests__/notification-preferences.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), put: jest.fn() },
}));

import { apiClient } from "../lib/api-client";
import { renderWithProviders } from "./helpers/render";

import { NotificationPreferences } from "../components/NotificationPreferences";

const get = apiClient.get as jest.Mock;
const put = apiClient.put as jest.Mock;

const allTrue = {
  assignmentCreated: true,
  submissionReviewed: true,
  sessionRescheduled: true,
  lowAttendanceFlag: true,
  mentorFollowup: true,
  quizGraded: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  get.mockResolvedValue({ data: { data: { preferences: allTrue } } });
  put.mockResolvedValue({ data: { data: { preferences: allTrue } } });
});

describe("NotificationPreferences", () => {
  it("renders a switch for all six types — including the one v1 could never set", async () => {
    renderWithProviders(<NotificationPreferences />);

    expect(await screen.findByLabelText("Assignment created")).toBeTruthy();
    expect(screen.getByLabelText("Submission reviewed")).toBeTruthy();
    expect(screen.getByLabelText("Session rescheduled")).toBeTruthy();
    expect(screen.getByLabelText("Low attendance flag")).toBeTruthy();
    expect(screen.getByLabelText("Mentor follow-up")).toBeTruthy();
    // R56/R57: v1's form rendered five toggles and its action spread a
    // five-field object, so this column kept its default forever.
    expect(screen.getByLabelText("Quiz graded")).toBeTruthy();
  });

  it("states the real low-attendance threshold — two, not three (spec D12)", async () => {
    // v1's help text said "misses 3 in a row"; the rule is two
    // (attendance-notifications.ts `take: 2`, 04-attendance.md R79).
    renderWithProviders(<NotificationPreferences />);
    expect(await screen.findByText(/two consecutive/i)).toBeTruthy();
  });

  it("PUTs all six keys when one is toggled off", async () => {
    renderWithProviders(<NotificationPreferences />);

    fireEvent(await screen.findByLabelText("Quiz graded"), "valueChange", false);

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/api/v1/me/notification-preferences", {
        ...allTrue,
        quizGraded: false,
      }),
    );
  });

  it("explains what turning one off actually does", async () => {
    // Spec D4: the in-app row is always written now; the switch governs
    // outbound channels. Saying so is the difference between a setting and a
    // surprise.
    renderWithProviders(<NotificationPreferences />);
    expect(await screen.findByText(/still appear in your inbox/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/mobile && pnpm jest src/__tests__/notification-preferences.test.tsx`
Expected: FAIL — the component does not exist.

- [ ] **Step 3: Write the component**

```tsx
// apps/mobile/src/components/NotificationPreferences.tsx
import { Switch, View } from "react-native";
import type { NotificationPreferences as Prefs } from "@space/shared";

import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from "../hooks/use-notifications";
import { useTheme } from "../theme";
import { Card, ErrorState, LoadingState, Text } from "../ui";

/**
 * One row per notification type — six, not v1's five.
 *
 * The labels are keyed off the preference column names so a key that exists in
 * the contract but not here is a compile error (`Record<keyof Prefs, ...>`),
 * which is the UI half of the fix for R56/R57.
 */
const LABELS: Record<keyof Prefs, { label: string; help: string }> = {
  assignmentCreated: {
    label: "Assignment created",
    help: "When new work is set for you.",
  },
  submissionReviewed: {
    label: "Submission reviewed",
    help: "When a leader records feedback on your work.",
  },
  sessionRescheduled: {
    label: "Session rescheduled",
    help: "When a session in your season moves.",
  },
  lowAttendanceFlag: {
    label: "Low attendance flag",
    // Spec D12: v1's copy said three. The rule is two.
    help: "When a student in your group misses two consecutive sessions.",
  },
  mentorFollowup: {
    label: "Mentor follow-up",
    help: "When a mentor flags a student for follow-up.",
  },
  quizGraded: {
    label: "Quiz graded",
    help: "When a quiz you took has been graded.",
  },
};

const ORDER: (keyof Prefs)[] = [
  "assignmentCreated",
  "submissionReviewed",
  "sessionRescheduled",
  "quizGraded",
  "lowAttendanceFlag",
  "mentorFollowup",
];

export function NotificationPreferences() {
  const theme = useTheme();
  const { data, isPending, isError, refetch } = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();

  if (isPending) return <LoadingState />;
  if (isError) {
    return <ErrorState message="Couldn't load your notification settings." onRetry={refetch} />;
  }

  const toggle = (key: keyof Prefs, value: boolean) => {
    // PUT replaces all six: there is no partial form of this contract, which
    // is exactly what stops a client from leaving a key at its default without
    // saying so.
    update.mutate({ ...data, [key]: value });
  };

  return (
    <Card>
      <Text variant="heading">Notifications</Text>
      <Text variant="body" color={theme.colors.neutral[600]}>
        Turning one off stops the emails and push for that kind of notification. They will still
        appear in your inbox — that is your history.
      </Text>
      {ORDER.map((key) => (
        <View
          key={key}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: theme.spacing.sm,
            marginTop: theme.spacing.sm,
          }}
        >
          <View style={{ flexShrink: 1 }}>
            <Text variant="body">{LABELS[key].label}</Text>
            <Text variant="caption" color={theme.colors.neutral[600]}>
              {LABELS[key].help}
            </Text>
          </View>
          <Switch
            accessibilityLabel={LABELS[key].label}
            value={data[key]}
            onValueChange={(value) => toggle(key, value)}
            disabled={update.isPending}
          />
        </View>
      ))}
    </Card>
  );
}
```

- [ ] **Step 4: Mount it in settings**

Read `apps/mobile/app/(app)/settings.tsx` first.

- If it is still the eight-line placeholder (an `EmptyState` reading "Settings"
  / "This screen isn't built yet."), replace it with:

```tsx
import { NotificationPreferences } from "../../src/components/NotificationPreferences";
import { Screen, Text } from "../../src/ui";

export default function SettingsScreen() {
  return (
    <Screen edges={["top", "left", "right"]} scroll>
      <Text variant="heading">Settings</Text>
      {/* Domain 18 owns the rest of this screen (Plan 7); domain 10 owns the
          notification block inside it. */}
      <NotificationPreferences />
    </Screen>
  );
}
```

  and remove the `["settings", SettingsScreen, "Settings"]` entry from
  `placeholder-screens.test.tsx`, dropping its length assertion from 18 to 17.
  Leave every other entry untouched.

- If Plan 7 has already built it, insert `<NotificationPreferences />` as a
  section in the existing layout and change nothing else — no placeholder test
  edit is needed in that case.

- [ ] **Step 5: Run the tests**

Run: `cd apps/mobile && pnpm jest src/__tests__/notification-preferences.test.tsx src/__tests__/placeholder-screens.test.tsx` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): six notification preference toggles in settings"
```

---

### Task 10: Mobile — Expo push permission and token lifecycle

Push **delivery** is blocked on cutover (see the header). What ships here is
everything on the device: the dependency, the config, the permission prompt
behind an explicit control, the token, its storage, its clearing on logout, and
an honest message about why it is not doing anything yet.

**Files:**
- Modify: `apps/mobile/package.json` (via `npx expo install`, not by hand)
- Modify: `apps/mobile/app.json` (plugin entry)
- Create: `apps/mobile/src/lib/push.ts`
- Modify: `apps/mobile/src/lib/token-storage.ts`
- Modify: `apps/mobile/src/store/session.ts`
- Modify: `apps/mobile/src/components/NotificationPreferences.tsx` (the push row)
- Test: `apps/mobile/src/__tests__/push.test.ts` (new),
  `apps/mobile/src/__tests__/session-store.test.ts` (extend)

**Interfaces:**
- Consumes: `apiClient`, `useSessionStore`.
- Produces: `requestPushToken(): Promise<string | null>`;
  `registerPushToken(token: string): Promise<"registered" | "unavailable" | "failed">`;
  `enablePush(): Promise<{ token: string | null; status: "registered" | "unavailable" | "denied" | "failed" }>`;
  session store gains `pushToken: string | null` and `setPushToken`;
  `token-storage` gains `savePushToken` / `loadPushToken`, and `clearSession`
  clears the push token too.

- [ ] **Step 1: Install the dependency**

Run: `cd apps/mobile && npx expo install expo-notifications`

`expo install` picks the version matching Expo SDK 54 — do **not** hand-write a
version into `package.json`. Then `pnpm install` at the root so the workspace
lockfile is consistent (`.npmrc` sets `shamefully-hoist=true`; Metro needs it).

In `apps/mobile/app.json`, add the plugin:

```json
    "plugins": ["expo-router", "expo-secure-store", "expo-notifications"],
```

Nothing else in `app.json` changes. Two facts to record rather than work
around: push does not work in Expo Go on Android (SDK 53+ removed it), so a
development build is required to see a real notification; and
`getExpoPushTokenAsync` needs an EAS project id, which this app does not have
(`extra` holds only `apiBaseUrl`). `requestPushToken` below returns `null` with
a single warning in that case rather than throwing — which is the honest state
of push in this repo today.

- [ ] **Step 2: Write the failing test**

```ts
// apps/mobile/src/__tests__/push.test.ts
const mockGetPermissions = jest.fn();
const mockRequestPermissions = jest.fn();
const mockGetToken = jest.fn();

jest.mock("expo-notifications", () => ({
  getPermissionsAsync: mockGetPermissions,
  requestPermissionsAsync: mockRequestPermissions,
  getExpoPushTokenAsync: mockGetToken,
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: "test-project" } } } },
}));

const mockPost = jest.fn();
jest.mock("../lib/api-client", () => ({ apiClient: { post: mockPost } }));

const mockSavePushToken = jest.fn();
jest.mock("../lib/token-storage", () => ({ savePushToken: mockSavePushToken }));

import { enablePush, registerPushToken, requestPushToken } from "../lib/push";
import { useSessionStore } from "../store/session";

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("requestPushToken", () => {
  it("returns the token when permission is already granted, without prompting again", async () => {
    mockGetPermissions.mockResolvedValue({ status: "granted" });
    mockGetToken.mockResolvedValue({ data: "ExponentPushToken[abc]" });

    await expect(requestPushToken()).resolves.toBe("ExponentPushToken[abc]");
    expect(mockRequestPermissions).not.toHaveBeenCalled();
  });

  it("prompts once when permission is undetermined", async () => {
    mockGetPermissions.mockResolvedValue({ status: "undetermined" });
    mockRequestPermissions.mockResolvedValue({ status: "granted" });
    mockGetToken.mockResolvedValue({ data: "ExponentPushToken[abc]" });

    await expect(requestPushToken()).resolves.toBe("ExponentPushToken[abc]");
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
  });

  it("returns null when the user denies, and never asks for a token", async () => {
    mockGetPermissions.mockResolvedValue({ status: "undetermined" });
    mockRequestPermissions.mockResolvedValue({ status: "denied" });

    await expect(requestPushToken()).resolves.toBeNull();
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it("returns null rather than throwing when the token service fails", async () => {
    mockGetPermissions.mockResolvedValue({ status: "granted" });
    mockGetToken.mockRejectedValue(new Error("no EAS project"));

    await expect(requestPushToken()).resolves.toBeNull();
  });
});

describe("registerPushToken", () => {
  it("treats 503 push_unavailable as expected, not as an error", async () => {
    // The server has nowhere to store it until the cutover migration; the
    // client keeps the token locally and stops asking.
    mockPost.mockRejectedValue({
      isAxiosError: true,
      response: { status: 503, data: { error: { code: "push_unavailable" } } },
    });

    await expect(registerPushToken("ExponentPushToken[abc]")).resolves.toBe("unavailable");
  });

  it("reports success when the server accepts the token", async () => {
    mockPost.mockResolvedValue({ data: { data: { registered: true } } });

    await expect(registerPushToken("ExponentPushToken[abc]")).resolves.toBe("registered");
    expect(mockPost).toHaveBeenCalledWith("/api/v1/me/devices", {
      token: "ExponentPushToken[abc]",
      platform: expect.stringMatching(/^(ios|android)$/),
    });
  });
});

describe("enablePush", () => {
  it("stores the token in the session store and in secure storage", async () => {
    mockGetPermissions.mockResolvedValue({ status: "granted" });
    mockGetToken.mockResolvedValue({ data: "ExponentPushToken[abc]" });
    mockPost.mockRejectedValue({
      isAxiosError: true,
      response: { status: 503, data: { error: { code: "push_unavailable" } } },
    });

    const result = await enablePush();

    expect(result).toEqual({ token: "ExponentPushToken[abc]", status: "unavailable" });
    expect(useSessionStore.getState().pushToken).toBe("ExponentPushToken[abc]");
    expect(mockSavePushToken).toHaveBeenCalledWith("ExponentPushToken[abc]");
  });

  it("reports denial without touching storage", async () => {
    mockGetPermissions.mockResolvedValue({ status: "undetermined" });
    mockRequestPermissions.mockResolvedValue({ status: "denied" });

    expect(await enablePush()).toEqual({ token: null, status: "denied" });
    expect(mockSavePushToken).not.toHaveBeenCalled();
  });
});
```

Add to `src/__tests__/session-store.test.ts`:

```ts
it("drops the push token on clear", () => {
  useSessionStore.setState({ pushToken: "ExponentPushToken[abc]" });
  useSessionStore.getState().clear();
  expect(useSessionStore.getState().pushToken).toBeNull();
});
```

- [ ] **Step 3: Run to see it fail**

Run: `cd apps/mobile && pnpm jest src/__tests__/push.test.ts src/__tests__/session-store.test.ts`
Expected: FAIL — `../lib/push` does not exist and the store has no `pushToken`.

- [ ] **Step 4: Extend the store and the token storage**

In `src/store/session.ts`, add to `SessionState`:

```ts
  /**
   * This device's Expo push token, once the user has enabled push. Held here
   * so a screen can tell whether push is on without re-reading SecureStore,
   * and cleared on sign-out because the token identifies a (user, device)
   * pair, not a device.
   */
  pushToken: string | null;
  setPushToken: (token: string | null) => void;
```

and to the store body: `pushToken: null,`,
`setPushToken: (pushToken) => set({ pushToken }),`, and add `pushToken: null`
to the object `clear()` sets.

In `src/lib/token-storage.ts`:

```ts
const PUSH_KEY = "space.pushToken";

export async function savePushToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(PUSH_KEY, token);
}

export async function loadPushToken(): Promise<string | null> {
  return SecureStore.getItemAsync(PUSH_KEY);
}
```

and add `await SecureStore.deleteItemAsync(PUSH_KEY);` to `clearSession()`.
**Read `src/__tests__/api-client.test.ts` first** — if it asserts on the number
of `deleteItemAsync` calls made by `clearSession`, update that count in the
same commit.

- [ ] **Step 5: Write the push library**

```ts
// apps/mobile/src/lib/push.ts
import { Platform } from "react-native";
import axios from "axios";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";

import { apiClient } from "./api-client";
import { savePushToken } from "./token-storage";
import { useSessionStore } from "../store/session";

export type PushStatus = "registered" | "unavailable" | "denied" | "failed";

/**
 * Ask for notification permission (once) and get this device's Expo token.
 *
 * Called from an explicit control in settings, never from an effect on app
 * start: a permission prompt that appears at a moment the user did not ask for
 * is the fastest way to get it denied permanently.
 *
 * Returns null — never throws — when permission is refused or when the token
 * service cannot answer. It cannot answer today: `getExpoPushTokenAsync` needs
 * an EAS project id, and `app.json` has none. That is part of what "push is
 * blocked on cutover" means in this repo.
 */
export async function requestPushToken(): Promise<string | null> {
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== "granted") return null;

  try {
    const projectId = (
      Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined
    )?.eas?.projectId;
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return token.data;
  } catch (err) {
    console.warn("[push] could not obtain an Expo push token:", err);
    return null;
  }
}

/**
 * Hand the token to the API.
 *
 * `503 push_unavailable` is the expected answer until the cutover migration
 * adds the DeviceToken table (see
 * docs/superpowers/cutover/2026-08-24-notifications-push.md). It is a state,
 * not an error: the caller keeps the token and stops retrying.
 */
export async function registerPushToken(token: string): Promise<"registered" | "unavailable" | "failed"> {
  try {
    await apiClient.post("/api/v1/me/devices", {
      token,
      platform: Platform.OS === "ios" ? "ios" : "android",
    });
    return "registered";
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 503) return "unavailable";
    return "failed";
  }
}

/** Permission → token → store → server, in one call for the settings control. */
export async function enablePush(): Promise<{ token: string | null; status: PushStatus }> {
  const token = await requestPushToken();
  if (!token) return { token: null, status: "denied" };

  useSessionStore.getState().setPushToken(token);
  await savePushToken(token);

  const status = await registerPushToken(token);
  return { token, status };
}
```

- [ ] **Step 6: Surface it in settings**

Add to `NotificationPreferences.tsx`, below the six switches:

```tsx
      <View style={{ marginTop: theme.spacing.md }}>
        <Text variant="body">Push notifications</Text>
        <Text variant="caption" color={theme.colors.neutral[600]}>
          {pushToken
            ? "This device is ready for push. Delivery switches on when the server migration lands."
            : "Get alerted when a session moves, or when your work or a quiz is graded."}
        </Text>
        <Button
          title={pushToken ? "Push enabled on this device" : "Enable push notifications"}
          variant="secondary"
          disabled={pushToken !== null}
          onPress={() => void enablePush()}
        />
      </View>
```

with `const pushToken = useSessionStore((s) => s.pushToken);` at the top of the
component and the matching imports. The copy names the three types that would
push (`PUSH_NOTIFICATION_TYPES`) rather than promising all six.

- [ ] **Step 7: Run everything mobile**

Run: `cd apps/mobile && pnpm jest` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.
If `jest-expo` fails to transform `expo-notifications`, the mock at the top of
`push.test.ts` is what keeps the real module out of the unit suite — make sure
every test file that transitively imports `src/lib/push.ts` carries it.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): expo push permission flow and token lifecycle (delivery blocked on cutover)"
```

---

### Task 11: Closing gate (coordinator)

**Files:** none created — verification only.

- [ ] **Step 1: Full suites**

Run: `pnpm turbo lint typecheck test:unit build` (repo root) → all tasks green.
Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern integration` → green.
Run: `grep -rn 'require("@space/shared")' apps/backend/dist/apps/backend/src/routes/` → empty (the `rootDir` emit trap; the new route file must not have picked up a bare specifier).

- [ ] **Step 2: Mutation pass**

One at a time, restore after each. Each must fail the named test.

1. **C6.** In `routes/notifications.ts`'s `GET /`, add
   `await db.notification.updateMany({ where: { userId: user.userId, readAt: null }, data: { readAt: new Date() } });`
   before the response → `"DOES NOT mark anything read (ruling C6)"` fails.
2. **C8, read.** Remove `userId: user.userId` from the same handler's `where`
   → `"NEVER returns another user's rows"` fails.
3. **C8, write.** Remove `userId: user.userId` from `POST /read`'s `where`
   → `"CANNOT mark another user's notification"` fails.
4. **C6, client.** In `app/(app)/notifications.tsx`, add
   `useEffect(() => { if (items.length) markRead.mutate({ ids: items.map((i) => i.id) }); }, [items]);`
   → `"writes NOTHING when the inbox is merely read"` fails.
5. **R56/R57.** Delete `quizGraded` from `notificationPreferencesSchema` →
   the shared derived-keys test fails **and** `tsc` fails on the `satisfies`.
6. **D1.** Make `parseNotificationLink` return `null` unconditionally → the
   inbox test's `target` assertion fails.
7. **D6.** Replace `bestEffort(...)` in `routes/submissions.ts` with a bare
   `await createNotificationsBulk(...)` → `best-effort.test.ts` still passes
   (it tests the helper, not the call site), so **also** confirm by inspection
   that no `createNotificationsBulk` / `flagLowAttendance` call in
   `src/routes/` sits outside `bestEffort`:
   `grep -rn "createNotificationsBulk\|flagLowAttendance" apps/backend/src/routes/` and read each hit.

- [ ] **Step 3: Device checklist (manual, dev build or Expo Go)**

Backend running (`pnpm --filter @space/backend dev`), `apiClient` base URL
pointed at it, signed in as a staging student:

1. Dashboard shows the bell; with seeded unread rows the badge shows the count,
   capped at `9+`.
2. Tap the bell → the inbox lists rows newest first; scrolling past 20 loads
   another page.
3. Background the app and return → the badge refreshes; **the unread count does
   not change** (nothing was marked by looking).
4. Tap a `SUBMISSION_REVIEWED` row → it opens the assignment and the badge
   drops by one.
5. "Mark all read" → badge clears; pull to refresh → still clear.
6. Settings → six toggles; turn `quizGraded` off, kill the app, reopen → still
   off (the column v1 could never write).
7. Settings → "Enable push notifications" → the OS prompt appears; accepting
   leaves the button in its enabled state and produces no crash (registration
   answers 503 by design).

- [ ] **Step 4: Report**

Report: suite counts, all seven mutation outcomes, device checklist results,
and — explicitly — whether the reviewer accepts the two deliberate behaviour
changes in the header (D4's channel split, and the three-type push list).
