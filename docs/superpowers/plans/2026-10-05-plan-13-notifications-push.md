# Plan 13 — Notifications Completed + Push Implementation Plan — push **WITHDRAWN** (owner decision 2026-10-10: push will be built later on Firebase)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish domain 10 — a device can read its own notification inbox,
mark all its notifications read as an **explicit** write, and set v1's five notification
preferences (`quizGraded` stays stored but is not settable, as in v1). Mobile push is not
part of this plan *(v1 parity 2026-10-09; owner decision 2026-10-10: was "— and take the mobile push story as far as the frozen schema
allows"; v1 has no push, and the owner will add push later on Firebase)*.

**Architecture:** Two file-disjoint workstreams over one new contract module.
Backend: `packages/shared/src/notification.ts` defines the wire shapes; a new
`apps/backend/src/routes/notifications.ts` serves the inbox; preferences extend
`routes/me.ts` *(v1 parity 2026-10-09; owner decision 2026-10-10: was "preferences and the device-registration endpoint")*; `lib/notifications.ts`
keeps v1's opt-out filter (no row, no email for an opted-out recipient) and gains a
written/suppressed return *(v1 parity 2026-10-09: was "gains the D4 channel split")*; two new libs —
`lib/notification-target.ts` (the D1 link parser) and `lib/best-effort.ts` (the
D6 helper) — are shared by every producer. Mobile: one new screen
`app/(app)/notifications.tsx` reached from a sidebar entry in every role's nav
plus an unread-badged bell in the shared screen header on every screen, as v1's
app shell (jpc-space `src/components/layout/app-shell.tsx:55-57`) *(v1 parity 2026-10-09: was "bell on the dashboard")*, and hooks in
`src/hooks/use-notifications.ts` *(v1 parity 2026-10-09; owner decision 2026-10-10: was "…, and an Expo push permission/token lifecycle that has nowhere on the server to register yet")*.

**Tech Stack:** Express 5, Prisma 7 (`src/generated/prisma`), Zod 3, jest +
supertest integration suite against the shared staging DB; Expo SDK 54 /
expo-router 6 (typed routes), React Query 5, Zustand 5, RNTL 13 via
`renderWithProviders` *(v1 parity 2026-10-09; owner decision 2026-10-10: was "…, `expo-notifications`")*.

**Spec:** `docs/superpowers/specs/domains/10-notifications.md` (81 rules; §10
D1–D12), `docs/superpowers/specs/domains/_DECISIONS.md` (C1, C6, C8 bind; C11
and C12 also touched), scope from
`docs/superpowers/plans/2026-08-24-migration-roadmap.md` § Plan 13.

---

## THE SCHEMA VERDICT — read this before Task 2 *(v1 parity 2026-10-09; owner decision 2026-10-10: was "before Task 5")*

`apps/backend/prisma/schema.prisma` was read directly. What is actually there:

| Model | Columns |
|---|---|
| `Notification` (`:594-607`) | `id`, `userId`, `type` (`NotificationType`), `title`, `body?`, `link?`, `readAt?`, `createdAt`. Indexes `@@index([userId, readAt])`, `@@index([userId, createdAt])`. **No** `entityId`/`entityType`, no dedupe key, no `channel`, no `expiresAt`, no delivery-status column. |
| `NotificationPreference` (`:609-623`) | `id`, `userId @unique`, six `Boolean @default(true)` — `assignmentCreated`, `submissionReviewed`, `sessionRescheduled`, `lowAttendanceFlag`, `mentorFollowup`, `quizGraded` — plus `createdAt`/`updatedAt`. **No** per-channel column, no push master switch. |
| `NotificationType` (`:63-70`) | Exactly six values, as the spec states. |

**Push is withdrawn, so nothing in this plan needs a new table.** The
earlier text found no device-token storage in the schema, made push delivery
"BLOCKED ON CUTOVER" (spec D5 option (a)), and shipped everything except the
row: `deviceRegistrationSchema`, `PUSH_NOTIFICATION_TYPES` + `shouldPush`,
`POST /api/v1/me/devices` answering `503 push_unavailable`, the client
permission/token flow, and a `DeviceToken` migration doc. v1 never had push
(no device or push model in `jpc-space/prisma/schema.prisma`, no push code in
`src/`; notifications are in-app plus email), and the owner will build push
later on Firebase under its own plan, so all of it is withdrawn here and in
Plan 18 (M10, Task 2b.10, M5's `pushEnabled`) *(v1 parity 2026-10-09; owner decision 2026-10-10: was "Decision: push delivery is BLOCKED ON CUTOVER … the migration, written out ready to apply")*.
The scaffolding already built from the earlier text is listed for removal in
the Revision 2026-10-09 table, row 7.

The inbox, mark-all-read, preferences, D1, D6, D8 and the whole mobile
surface ship without a migration.

One further consequence of the frozen schema, recorded here so it is not
rediscovered mid-task:

- **`link` cannot become `entityType`/`entityId` columns** (D1). Producers keep
  writing v1's exact path strings so v1 — still in production, same database —
  keeps working, and the API derives a route-independent `target` from the
  string in **one** tested function (Task 2). Plan 18's M4 (the columns and
  backfill) is withdrawn for v1 parity, so the string stays after cutover.
  *(v1 parity 2026-10-09; owner decision 2026-10-10: the "push master switch would also be a new column" bullet is withdrawn with push; was "Task 5's cutover doc carries the column addition and the backfill")*

---

## THE TWO DELIBERATE BEHAVIOUR CHANGES — reviewable in one place (item 1 withdrawn 2026-10-09; item 2 withdrawn 2026-10-10)

**1. Withdrawn — the preference keeps v1's semantics (Task 2).** v1 filters an
opted-out recipient out before the insert (jpc-space `src/lib/notifications.ts:56-94`,
spec R8/R9/R11): one switch governs every channel, so "off" means no in-app row
and no email *(v1 parity 2026-10-09; owner decision 2026-10-10: was "— and, at cutover, no push")*. `createNotificationsBulk` keeps that
filter; it only adds the dedupe and the written/suppressed counts. Spec D4's
channel split is **not** implemented, v1's inbox and v2's inbox show the same
rows for an opted-out user, and
`apps/backend/src/__tests__/integration/notifications.test.ts:110-123` keeps
pinning the v1 behaviour. *(v1 parity 2026-10-09: was "D4 — the in-app row is always written; preference governs email/push only")*

**2. Withdrawn — there is no push, so there is no push type list (Task 1).**
The earlier text narrowed spec D5 item 2's five push types to three
(`SESSION_RESCHEDULED`, `SUBMISSION_REVIEWED`, `QUIZ_GRADED`) as
`PUSH_NOTIFICATION_TYPES`. v1 sends no push and the owner will add push later
on Firebase, so the list, `shouldPush` and their test are withdrawn; the
Firebase plan decides which types push, and should keep the lock-screen
reasoning for `MENTOR_FOLLOWUP` (the title names a student flagged for
pastoral follow-up, R64, D8) *(v1 parity 2026-10-09; owner decision 2026-10-10: was "Push covers three types, not the spec's five")*.

---

## Global Constraints

- **No migrations, ever. No edits under `apps/backend/prisma/`.** Shared live
  staging database with v1 (C1).
- **`D:\Projects\JPC\jpc-space` is READ-ONLY.** Read it for behaviour; never
  write to it.
- Response envelope `{ data }` / `{ error: { code, message } }` via
  `apiOk`/`apiError`.
- Value imports from shared use the relative path in **every backend `src`
  file**, not only routes (ruling X12; the `rootDir` emit trap in `CLAUDE.md`):
  `"../../../../packages/shared/src/index"` from `src/routes/` and `src/lib/`.
  `import type` may use the package name. Mobile imports `@space/shared` by
  package name. The closing gate greps all of `dist/`.
- **Escaping is Plan 12's, imported, never redefined** (ruling X2): the backend
  escapes through `escapeHtml` from `apps/backend/src/lib/html.ts`, and the
  notification email is built by Plan 12's exported `buildNotificationHtml` in
  `lib/email.ts`. This plan adds no escaper and no second template.
- **`requireAuth` per route on shared prefixes** (ruling X5). `meRouter`
  (`/api/v1/me`) already attaches it per route; this plan's additions do the
  same. `notificationsRouter` owns `/api/v1/notifications` outright, so its
  router-level `use(requireAuth)` is allowed.
- **Notification links are v1's exact strings** (ruling X1). Every producer
  writes the path v1 writes for that type; `parseNotificationLink` (Task 2)
  recognises exactly the five shapes v1 emits, and Plan 18's M4 backfill maps
  the same five.
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
  unreachable `markNotificationReadAction` is not ported: mark-all is the only
  read write, as v1's UI — *v1 parity 2026-10-09: was "gets one endpoint, designed, not two ported"*).

**Prerequisites (execution order 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → **13**):** Plan 9's settings
screen (`app/(app)/settings.tsx`, Task 9 adds a section to it) and its
`me-settings-routes.test.ts` pattern; Plan 12's `apps/backend/src/lib/html.ts`
(`escapeHtml`) and `lib/email.ts`'s exported `buildNotificationHtml`; Plan 7's
`/student/[id]` route, served by `app/(app)/student/[id]/index.tsx` since
Plan 10 moved it to the directory form (Task 6 deep-links to it); Plan 1's
`/assignment/[id]` route, served by `app/(app)/assignment/[id]/index.tsx`
since Plan 5's move; and Plan 1's `/more`. The typed pathnames
`/student/[id]` and `/assignment/[id]` are unchanged by both moves. If any is missing, stop — do not
re-create it here.

**Execution shape:** Task 1 first (coordinator — both streams consume the
contracts). Then two agents in parallel: **backend** Tasks 2 → 3 → 4
(sequential, same files), **mobile** Tasks 6 → 7 → 8 → 9 (sequential,
same files) *(v1 parity 2026-10-09; owner decision 2026-10-10: was "2 → 3 → 4 → 5" and "6 → … → 10"; Tasks 5 and 10 are withdrawn)*. Task 11 is the coordinator's closing gate. The two streams share
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
  `NOTIFICATION_INBOX_LIMIT` (v1's 100; replaces `notificationListQuerySchema` — *v1 parity 2026-10-09: was "cursor/limit/unreadOnly query"*);
  `notificationListResponseSchema`; `unreadCountResponseSchema`;
  `markReadRequestSchema` → `MarkReadRequest`; `markReadResponseSchema`;
  `NOTIFICATION_PREFERENCE_KEY_BY_TYPE`; `NOTIFICATION_PREFERENCE_KEYS`;
  `notificationPreferencesSchema` → `NotificationPreferences`;
  `notificationPreferencesResponseSchema`;
  `notificationPreferencesUpdateSchema` → `NotificationPreferencesUpdate` (v1's five settable keys);
  `DEFAULT_NOTIFICATION_PREFERENCES`
  *(v1 parity 2026-10-09; owner decision 2026-10-10: was also `PUSH_NOTIFICATION_TYPES`; `shouldPush(type)`; `devicePlatformSchema` → `DevicePlatform`;
  `DEVICE_PLATFORM_TO_DB`; `deviceRegistrationSchema` → `DeviceRegistration` — withdrawn with push)*.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/__tests__/notification-contracts.test.ts
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_PREFERENCE_KEYS,
  NOTIFICATION_PREFERENCE_KEY_BY_TYPE,
  markReadRequestSchema,
  NOTIFICATION_INBOX_LIMIT,
  notificationPreferencesSchema,
  notificationPreferencesUpdateSchema,
  notificationSchema,
  notificationTypeSchema,
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

  it("refuses a partial body — PUT carries v1's five keys and never sets quizGraded", () => {
    expect(
      notificationPreferencesUpdateSchema.safeParse({ assignmentCreated: false }).success,
    ).toBe(false);
    // v1 settings-actions.ts:58-73: five fields; quizGraded is stripped, not written.
    expect(notificationPreferencesUpdateSchema.parse(DEFAULT_NOTIFICATION_PREFERENCES)).not.toHaveProperty(
      "quizGraded",
    );
  });
});

describe("markReadRequestSchema", () => {
  it("accepts only all: true — v1 has mark-all and nothing else (R47)", () => {
    expect(markReadRequestSchema.safeParse({ all: true }).success).toBe(true);
    expect(markReadRequestSchema.safeParse({ ids: [1, 2, 3] }).success).toBe(false);
    expect(markReadRequestSchema.safeParse({ ids: [1], all: true }).success).toBe(false);
    // Accepting a recipient id from a client is how this domain's one safe
    // property (everything is self-service — spec §4) would be lost.
    expect(markReadRequestSchema.safeParse({ all: true, userId: 2 }).success).toBe(false);
    expect(markReadRequestSchema.safeParse({ all: false }).success).toBe(false);
  });
});

describe("NOTIFICATION_INBOX_LIMIT", () => {
  it("is v1's 100 (notifications-page.tsx:17; R33)", () => {
    expect(NOTIFICATION_INBOX_LIMIT).toBe(100);
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
```

> **v1 parity 2026-10-09; owner decision 2026-10-10:** the `push policy` and `deviceRegistrationSchema` describes and their four imports
> (`DEVICE_PLATFORM_TO_DB`, `PUSH_NOTIFICATION_TYPES`, `deviceRegistrationSchema`, `shouldPush`) are
> withdrawn with push. Built code to change: `packages/shared/src/__tests__/notification-contracts.test.ts:4,7,8,14`
> (imports) and `:130-161` (the two describes).

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
 * `calendar` is a destination rather than an entity because one of the five
 * link shapes v1 actually emits is the bare `/student/calendar` (R67), and
 * pretending it names a session would be a lie the resolver has to keep.
 *
 * Wire values are lowercase. Plan 18's M4 stores the same set as the
 * uppercase Postgres enum `NotificationEntityType` (ASSIGNMENT, QUIZ,
 * CALENDAR, STUDENT, plus SUBMISSION/SESSION which nothing writes yet); the
 * mapping is written out in the cutover doc (Task 5) so the wire contract —
 * and every client built against it — does not change at cutover.
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

/**
 * v1's inbox is one list of the newest 100 rows, createdAt desc, with no
 * cursor and no read-state filter (jpc-space
 * src/app/(notifications)/notifications-page.tsx:14-27; spec R33, R39).
 * GET /notifications takes no query parameters.
 */
export const NOTIFICATION_INBOX_LIMIT = 100;

export const notificationListResponseSchema = z.object({
  items: z.array(notificationSchema),
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
 * Mark-all only, as v1: the single-id action was dead code (R47) and opening a
 * notification leaves it unread (R48). `.strict()` refuses `ids` and a
 * client-supplied `userId`.
 */
export const markReadRequestSchema = z.object({ all: z.literal(true) }).strict();
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
 * What PUT accepts: v1's five settable keys (jpc-space
 * src/lib/settings-actions.ts:58-73). `quizGraded` is not settable in v1 and
 * stays untouched by the write; Zod's default strip drops it if a client sends
 * it. GET still returns all six stored values.
 */
export const notificationPreferencesUpdateSchema = notificationPreferencesSchema.omit({
  quizGraded: true,
});
export type NotificationPreferencesUpdate = z.infer<typeof notificationPreferencesUpdateSchema>;
```

> **v1 parity 2026-10-09:** the block above now carries v1's list (`NOTIFICATION_INBOX_LIMIT = 100`,
> no `notificationListQuerySchema`, no `nextCursor`), mark-all-only `markReadRequestSchema`, and the
> five-key `notificationPreferencesUpdateSchema`. Built code to change:
> `packages/shared/src/notification.ts:58-66` (cursor/limit/unreadOnly query, `nextCursor`) and the
> `ids` arm of `markReadRequestSchema`; add the update schema. v1 to match: jpc-space
> `src/app/(notifications)/notifications-page.tsx:14-27`, `src/lib/notification-actions.ts:8-12`,
> `src/lib/settings-actions.ts:58-73`.
>
> **v1 parity 2026-10-09; owner decision 2026-10-10:** the block also no longer carries `PUSH_NOTIFICATION_TYPES`, `shouldPush`,
> `devicePlatformSchema`, `DEVICE_PLATFORM_TO_DB` or `deviceRegistrationSchema` (push withdrawn; v1 has
> none). Built code to delete: `packages/shared/src/notification.ts:151-196`.

- [ ] **Step 5: Export it**

In `packages/shared/src/index.ts`, add after the `submission` line:

```ts
export * from "./notification";
```

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @space/shared jest src/__tests__/notification-contracts.test.ts` → PASS
Run: `pnpm turbo lint typecheck test:unit` → clean.

- [ ] **Step 7: Commit**

```bash
git add packages/shared && git commit -m "feat(shared): notification wire contracts, preference keys derived from the enum"
```

---

### Task 2: Delivery library — v1 opt-out filter + counts, D1 target parser, D6 helper

**Files:**
- Create: `apps/backend/src/lib/notification-target.ts`
- Create: `apps/backend/src/lib/best-effort.ts`
- Modify: `apps/backend/src/lib/notifications.ts`
- Modify: every producer call site of `createNotificationsBulk` / `flagLowAttendance` in `apps/backend/src/routes/` (Step 7 enumerates them by plan)
- Test: `apps/backend/src/__tests__/notification-target.test.ts` (new, unit),
  `apps/backend/src/__tests__/best-effort.test.ts` (new, unit),
  `apps/backend/src/__tests__/integration/notifications.test.ts` (keep the opt-out case, add two)

**Not in this task, deliberately:** mail escaping. Plan 12 already routes every
notification email through its exported `buildNotificationHtml`
(`apps/backend/src/lib/email.ts`), which escapes title, body and link with
`escapeHtml` from `apps/backend/src/lib/html.ts`, and its `email-html.test.ts`
pins it (rulings X2, C11). An earlier draft of this task added a second,
private `escapeHtml` to `email.ts` (a duplicate identifier beside Plan 12's
import) and a `renderNotificationHtmlForTest` twin of the template; both are
withdrawn. Step 6 only verifies Plan 12's work is in place.

**Interfaces:**
- Consumes: `NotificationTarget`, `NotificationEntityType` from shared (Task 1, type-only); Plan 12's `buildNotificationHtml` (unchanged).
- Produces: `parseNotificationLink(link: string | null): NotificationTarget | null`;
  `NOTIFICATION_LINK_PATTERNS: readonly { re: RegExp; entityType: NotificationEntityType; hasId: boolean }[]`
  — the closed set of v1 link shapes, which Plan 18's M4 backfill SQL mirrors one-for-one;
  `bestEffort(label: string, fn: () => Promise<unknown>): Promise<void>`;
  `createNotificationsBulk(userIds, payload): Promise<BulkNotificationResult>`
  where `BulkNotificationResult = { written: number; suppressed: number }`.
  No current producer reads the counts (they run inside `bestEffort`, which
  returns void); they exist so the session-write response can report them
  later (`03-sessions.md` R17) without another signature change.

**The v1 link shapes — enumerated from jpc-space source, not from the spec.**
`grep -rn "link:" jpc-space/src/lib` finds every producer; there are exactly
nine call sites and five distinct shapes:

| Shape | v1 producer(s) | Type(s) |
|---|---|---|
| `/student/assignments/:id` | `assignment-actions.ts:91`, `submission-actions.ts:197` | `ASSIGNMENT_CREATED`, `SUBMISSION_REVIEWED` |
| `/student/quizzes` | `quiz-actions.ts:167`, `:483`, `:554` | `QUIZ_GRADED` |
| `/student/calendar` | `session-actions.ts:167` | `SESSION_RESCHEDULED` |
| `/admin/students/:id` | `note-actions.ts:84`, `attendance-notifications.ts:65` | `MENTOR_FOLLOWUP`, `LOW_ATTENDANCE_FLAG` |
| `/leader/students/:id` | `attendance-notifications.ts:73` | `LOW_ATTENDANCE_FLAG` |

v1 has no other notification writer (forum, video quizzes and events create
none). Under ruling X1 every v2 producer writes the same string v1 writes for
its type, so this table is also the complete set of shapes v2 writes — Plan 8's
`QUIZ_GRADED` sites write `/student/quizzes`, Plan 3's reschedule writes
`/student/calendar`, Plan 5's `ASSIGNMENT_CREATED` writes
`/student/assignments/:id`. A producer that writes anything else is a bug in
that producer, not a sixth row here. An earlier draft also accepted a bare
`/student/assignments`; no v1 producer writes it and current v2 does not
either (`routes/submissions.ts` already writes the id), so it is dropped — a
stray staging row of that shape resolves to `null` and opens the inbox, which
is the documented fallback.

- [ ] **Step 1: Write the failing unit tests**

```ts
// apps/backend/src/__tests__/notification-target.test.ts
import { NOTIFICATION_LINK_PATTERNS, parseNotificationLink } from "../lib/notification-target";

describe("parseNotificationLink", () => {
  // The complete set of link shapes v1 emits (jpc-space src/lib, nine
  // producers, five shapes — see the table in this task). Ruling X1: every v2
  // producer writes one of these. Anything else is a null target and a list
  // fallback on the client.
  it.each([
    ["/student/assignments/41", { entityType: "assignment", entityId: 41 }],
    ["/student/quizzes", { entityType: "quiz", entityId: null }],
    ["/student/calendar", { entityType: "calendar", entityId: null }],
    ["/admin/students/12", { entityType: "student", entityId: 12 }],
    ["/leader/students/12", { entityType: "student", entityId: 12 }],
  ])("maps %s", (link, expected) => {
    expect(parseNotificationLink(link)).toEqual(expected);
  });

  it("knows exactly five shapes — the set Plan 18's M4 backfill must mirror", () => {
    expect(NOTIFICATION_LINK_PATTERNS).toHaveLength(5);
  });

  it("returns null for a null link, an unknown shape, or a non-numeric id", () => {
    expect(parseNotificationLink(null)).toBeNull();
    expect(parseNotificationLink("/super/reports")).toBeNull();
    expect(parseNotificationLink("/student/assignments/abc")).toBeNull();
    // Not a v1 shape (no producer writes the bare list path).
    expect(parseNotificationLink("/student/assignments")).toBeNull();
    // Not v1's route either: v1 writes the quiz LIST for QUIZ_GRADED.
    expect(parseNotificationLink("/student/quizzes/7")).toBeNull();
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

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/backend && npx jest --testPathPattern "(notification-target|best-effort)"`
Expected: FAIL — `lib/notification-target.ts` and `lib/best-effort.ts` do not exist.

- [ ] **Step 3: Write the link parser**

```ts
// apps/backend/src/lib/notification-target.ts
import type {
  NotificationEntityType,
  NotificationTarget,
} from "../../../../packages/shared/src/index";

/**
 * The one place a stored `Notification.link` becomes a route-independent
 * target (spec D1).
 *
 * Every notification in the shared database carries a v1 role-prefixed web
 * path chosen by the producer, not by the recipient's role (R3) — and the
 * scheme is already broken inside v1, where a mentor holding a GroupLeader row
 * gets a /leader link that bounces them (R4). v2's routes are flat, so the
 * string is meaningless to a device. The clean fix is two columns; the schema
 * is frozen (C1), so this parses instead, and Plan 18's M4 backfills the
 * columns with SQL that mirrors NOTIFICATION_LINK_PATTERNS one row per entry.
 *
 * Do NOT let a screen parse the path. One function, one place, one test table.
 */
export const NOTIFICATION_LINK_PATTERNS: readonly {
  re: RegExp;
  entityType: NotificationEntityType;
  hasId: boolean;
}[] = [
  // ASSIGNMENT_CREATED, SUBMISSION_REVIEWED (v1 assignment-actions.ts:91, submission-actions.ts:197)
  { re: /^\/student\/assignments\/(\d+)$/, entityType: "assignment", hasId: true },
  // QUIZ_GRADED (v1 quiz-actions.ts:167, :483, :554) — the list, not a quiz
  { re: /^\/student\/quizzes$/, entityType: "quiz", hasId: false },
  // SESSION_RESCHEDULED (v1 session-actions.ts:167)
  { re: /^\/student\/calendar$/, entityType: "calendar", hasId: false },
  // MENTOR_FOLLOWUP, LOW_ATTENDANCE_FLAG (v1 note-actions.ts:84, attendance-notifications.ts:65)
  { re: /^\/admin\/students\/(\d+)$/, entityType: "student", hasId: true },
  // LOW_ATTENDANCE_FLAG to leaders (v1 attendance-notifications.ts:73)
  { re: /^\/leader\/students\/(\d+)$/, entityType: "student", hasId: true },
];

export function parseNotificationLink(link: string | null): NotificationTarget | null {
  if (!link) return null;
  // Relative paths only: a stored absolute URL is not a route this app owns,
  // and treating it as one would let a link written elsewhere pick a screen.
  if (!link.startsWith("/")) return null;

  const path = link.split("?")[0]?.replace(/\/+$/, "") ?? "";
  const normalised = path === "" ? "/" : path;

  for (const { re, entityType, hasId } of NOTIFICATION_LINK_PATTERNS) {
    const match = re.exec(normalised);
    if (match) return { entityType, entityId: hasId ? Number(match[1]) : null };
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

- [ ] **Step 5: Dedupe and count in `createNotificationsBulk`, keeping v1's opt-out filter** *(v1 parity 2026-10-09: was "Split the channels … (D4)")*

Replace the body of `apps/backend/src/lib/notifications.ts`'s
`createNotificationsBulk` (keep `CreateNotificationInput` and `PREF_FIELD`
exactly as they are — `PREF_FIELD`'s `satisfies` is a v2 improvement over v1's
`Record<..., string>` and must not be reverted):

```ts
export interface BulkNotificationResult {
  /** Rows written. One per distinct recipient who has not opted out. */
  written: number;
  /** Recipients skipped entirely (no row, no email) by their preference. */
  suppressed: number;
}

/**
 * Fan out one notification to many recipients.
 *
 * v1 semantics (jpc-space src/lib/notifications.ts:56-94, spec R8/R9/R11): an
 * opted-out recipient is filtered out **before** the insert, so the one
 * preference switch governs every channel — no in-app row, no email. If every
 * recipient opted out, nothing is written.
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
  const recipients = [...new Set(userIds)];
  if (recipients.length === 0) return { written: 0, suppressed: 0 };

  const prefs = await db.notificationPreference.findMany({
    where: { userId: { in: recipients } },
  });
  const prefField = PREF_FIELD[payload.type];
  // A user with no preference row has not opted out — defaults are all true
  // (R6). Only the literal `false` suppresses (R7).
  const optedOut = new Set(prefs.filter((p) => p[prefField] === false).map((p) => p.userId));
  // v1 (notifications.ts:74-75): opted-out users are dropped before the insert.
  const targets = recipients.filter((id) => !optedOut.has(id));
  if (targets.length === 0) return { written: 0, suppressed: optedOut.size };

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

  const users = await db.user.findMany({
    where: { id: { in: targets } },
    select: { email: true },
  });
  // Fire-and-forget: mail must never delay or fail the request that
  // triggered it. allSettled so one bad address cannot reject the batch.
  void Promise.allSettled(
    users.map((u) =>
      sendNotificationEmail(u.email, payload.title, payload.body ?? null, payload.link ?? null),
    ),
  );

  return { written: targets.length, suppressed: optedOut.size };
}
```

> **v1 parity 2026-10-09:** the block above now filters opted-out recipients before `createMany`
> (v1 `jpc-space/src/lib/notifications.ts:56-94`). The code built from the earlier text must change:
> `apps/backend/src/lib/notifications.ts:62-100` (`createNotificationsBulk`) — drop the always-write
> branch and the `mailTargets` split, filter before the insert, early-return when nothing is left; also
> delete the "Divergence from v1, ruled in spec D4" doc comment *(v1 parity 2026-10-09; owner decision 2026-10-10: was "Push (Task 5 / cutover) follows the same filtered list" — push is withdrawn)*. *(v1 parity 2026-10-09: was "row always written; preference gates email only (D4 split)")*
>
> **v1 parity 2026-10-09; owner decision 2026-10-10 — the email's "Open" button stays.** `sendNotificationEmail` keeps v1's "View in
> JPC Space" button and paste-able link (jpc-space `src/lib/email.ts:66-73,142-143,149`), but after
> cutover it is built as an app link to the notification's target, derived with
> `parseNotificationLink(payload.link)`, instead of `AUTH_URL + link`. That change is Plan 18
> Task 2b.4's; nothing here drops the button.

- [ ] **Step 6: Confirm Plan 12's mail escaping is the only one (C11, ruling X2)**

Nothing to write. Check:

Run: `grep -rn "function escapeHtml\|const escapeHtml" apps/backend/src/` → empty (the definition lives in `packages/shared/src/html-text.ts`; the backend re-exports it from `lib/html.ts`).
Run: `grep -n "buildNotificationHtml" apps/backend/src/lib/email.ts` → the exported definition and its call inside `sendNotificationEmail`.
Run: `cd apps/backend && npx jest src/__tests__/email-html.test.ts` → PASS (Plan 12's escaping test).

If any of these fails, Plan 12 is incomplete — stop rather than adding a
second escaper here.

- [ ] **Step 7: Route every producer through the helper (D6)**

Find every call site: `cd apps/backend/src && grep -rn "createNotificationsBulk\|flagLowAttendance" --include=*.ts routes/ lib/`.
`lib/notifications.ts` (the definition) and `lib/attendance-notifications.ts`'s
two internal awaits are not call sites to wrap — the latter is wrapped where
`flagLowAttendance` is called. Every other hit must end up inside `bestEffort`.
By the time this plan runs (execution order 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 →
9 → 10 → 11 → 12 → 13) the expected producers are below. Plans 6, 10 and 11
add **no** producer (checked: Plan 10's graduate/drop/delete notify nobody,
Plan 6 converts session wire fields but never touches Plan 3's `SESSION_RESCHEDULED` call site,
Plan 11's check-in notifies nobody):

| Plan | File | Type | Label |
|---|---|---|---|
| main | `routes/submissions.ts` (review) | `SUBMISSION_REVIEWED` | `notify:SUBMISSION_REVIEWED` |
| main | `routes/sessions.ts` (`flagLowAttendance` after attendance save) | `LOW_ATTENDANCE_FLAG` | `notify:LOW_ATTENDANCE_FLAG` |
| 3 | `routes/sessions.ts` (session reschedule) | `SESSION_RESCHEDULED` | `notify:SESSION_RESCHEDULED` |
| 5 | `lib/assignment-writes.ts` → `notifyAssignmentCreated` (the single call site; `POST /seasons/:id/assignments` and `PATCH /assignments/:id` both call it), link `/student/assignments/<id>` | `ASSIGNMENT_CREATED` | `notify:ASSIGNMENT_CREATED` |
| 8 | the four `QUIZ_GRADED` sites in Plan 8's quiz routes | `QUIZ_GRADED` | `notify:QUIZ_GRADED` |
| 12 | `routes/notes.ts` (flagged note) | `MENTOR_FOLLOWUP` | `notify:MENTOR_FOLLOWUP` |

If the grep finds a hit not in this table, wrap it the same way and name it in
the report; if a row in this table has no hit, say so in the report (the
owning plan may have been re-scoped) — do not invent the call.

The transformation is mechanical. A site written as

```ts
  try {
    await createNotificationsBulk(recipientIds, payload);
  } catch {
    // swallowed
  }
```

or as a bare `await createNotificationsBulk(recipientIds, payload);` becomes

```ts
  // Best-effort: the business write above has committed. A notification or
  // mail failure after that point must not report it as failed (spec D6,
  // R75) — and, unlike a bare catch, bestEffort logs (R21).
  await bestEffort("notify:<TYPE>", () => createNotificationsBulk(recipientIds, payload));
```

with `payload` — including its `link`, which is v1's exact string per ruling X1
and must not be edited here — unchanged. Concretely, the two sites already on
`main`:

1. `routes/submissions.ts` — replace the `try { await createNotificationsBulk(...) } catch { … }`
   block after the review update with:

```ts
  // Best-effort: the student is told, but a mail or notification failure must
  // not report the review itself as failed (spec D6, ruling from R75).
  await bestEffort("notify:SUBMISSION_REVIEWED", () =>
    createNotificationsBulk([sub.studentUserId], {
      type: "SUBMISSION_REVIEWED",
      // v1's exact title (submission-actions.ts:196). v1 has no return-for-revision
      // action, so there is no second title (v1 parity 2026-10-09).
      title: `Feedback ready on "${sub.assignment.title}"`,
      // v1's exact link (submission-actions.ts:197; ruling X1). main already
      // writes it — this step changes only the error handling.
      link: `/student/assignments/${sub.assignmentId}`,
    }),
  );
```

> **v1 parity 2026-10-09:** title is v1's single `Feedback ready on "<title>"`
> (jpc-space `src/lib/submission-actions.ts:193-198`). Remove the `returnForRevision` ternary at
> `apps/backend/src/routes/submissions.ts:451-464` together with Plan 2's return-for-revision action
> (08-submissions R21). *(v1 parity 2026-10-09: was "'<title> was returned for revision' / '<title> was reviewed'")*

2. `routes/sessions.ts` — `await flagLowAttendance(sessionId, parsed.data.entries);`
   becomes:

```ts
  // The attendance rows are committed. A notification failure after that point
  // must not tell the leader their marking failed (spec D6).
  await bestEffort("notify:LOW_ATTENDANCE_FLAG", () =>
    flagLowAttendance(sessionId, parsed.data.entries),
  );
```

   Wrapping at the call site covers both of `attendance-notifications.ts`'s
   internal `createNotificationsBulk` awaits — leave that file otherwise
   untouched.

And Plan 12's site in `routes/notes.ts` — its `try { await createNotificationsBulk(…) } catch { … }`
around the `MENTOR_FOLLOWUP` fan-out becomes
`await bestEffort("notify:MENTOR_FOLLOWUP", () => createNotificationsBulk(admins.map((a) => a.userId), { …the same payload… }));`.

Import `bestEffort` from `../lib/best-effort` in every route file touched.

- [ ] **Step 8: Keep v1's opt-out integration case and add a counting case** *(v1 parity 2026-10-09: was "Rewrite the opt-out integration case (D4) and add one")*

In `apps/backend/src/__tests__/integration/notifications.test.ts`, **keep** the
`"respects an opt-out on NotificationPreference"` case (`:110-123`) — it pins
v1's semantics (no row for an opted-out recipient; jpc-space
`src/lib/notifications.ts:62-75`) — and add after it:

```ts
it("reports what it wrote and whom it skipped", async () => {
  // v1 returned void, so a producer could not tell the caller how many people
  // were actually notified (§6; 03-sessions.md R17 needs this number).
  await db.notificationPreference.upsert({
    where: { userId: leaderId },
    update: { lowAttendanceFlag: false },
    create: { userId: leaderId, lowAttendanceFlag: false },
  });
  const result = await createNotificationsBulk([leaderId, adminId, leaderId], {
    type: "LOW_ATTENDANCE_FLAG",
    title: "space-v2-test counting probe",
    body: "b",
    link: `/admin/students/${studentId}`,
  });
  // leaderId appears twice and is deduped; leaderId is opted out, so only
  // adminId gets a row (v1 R8 — no row, no email for an opted-out user).
  expect(result).toEqual({ written: 1, suppressed: 1 });
});

it("writes nothing when every recipient opted out (v1 R11)", async () => {
  const result = await createNotificationsBulk([leaderId], {
    type: "LOW_ATTENDANCE_FLAG",
    title: "space-v2-test all-opted-out probe",
    body: "b",
    link: `/admin/students/${studentId}`,
  });
  expect(result).toEqual({ written: 0, suppressed: 1 });
  expect(
    await db.notification.count({ where: { title: "space-v2-test all-opted-out probe" } }),
  ).toBe(0);
});
```

> **v1 parity 2026-10-09:** if the inverted case ("writes the in-app row even for an opted-out
> recipient…") was built into `apps/backend/src/__tests__/integration/notifications.test.ts`, restore
> the original opt-out case (no row for the opted-out leader) and replace the `{ written: 2, suppressed: 1 }`
> expectation with the two cases above.

Add `import { createNotificationsBulk } from "../../lib/notifications";` at the
top. The last case depends on the counting case having created the opt-out row —
keep them adjacent and in this order (the suite is already order-dependent
through its shared `beforeAll`).

- [ ] **Step 9: Run the unit tests; hand the integration tests to the coordinator**

Run: `cd apps/backend && npx jest --testPathPattern "(notification-target|best-effort|email-html|email)"` → PASS
Run: `pnpm turbo lint typecheck test:unit --filter=@space/backend` → clean.
Do **not** run the integration suite as a subagent (`cleanupTestData` is
prefix-global and safe only under `--runInBand`).

- [ ] **Step 10: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): notification counts, v1 link-shape parser, best-effort producers"
```

---

### Task 3: Inbox endpoints — list, unread count, explicit mark-all-read

**Files:**
- Create: `apps/backend/src/routes/notifications.ts`
- Modify: `apps/backend/src/app.ts` (mount the router)
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: `apps/backend/src/__tests__/integration/notifications-routes.test.ts` (new)

**Interfaces:**
- Consumes: `NOTIFICATION_INBOX_LIMIT`, `notificationListResponseSchema`'s
  shape, `markReadRequestSchema`, `unreadCountResponseSchema`'s shape from
  shared (Task 1); `parseNotificationLink` (Task 2); `requireAuth`,
  `requireUser`, `apiOk`, `apiError`.
- Produces: `notificationsRouter` mounted at `/api/v1/notifications`;
  `GET /` → `{ data: { items, unreadCount } }` (newest 100, no query params);
  `GET /unread-count` → `{ data: { unreadCount } }`;
  `POST /read` with `{ all: true }` only → `{ data: { marked } }`.
  *(v1 parity 2026-10-09: was "cursor-paged list with unreadOnly; POST /read takes ids or all")*

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

> **v1 parity 2026-10-09:** the tests above still pin the cursor/unreadOnly list and the `ids` form
> of mark-read. Change them to v1 (R33, R39, R47): drop `"pages by cursor, newest first"` and
> `"filters to unread when asked"`, add one that seeds 101 rows and expects exactly 100 back,
> newest `createdAt` first, with no `nextCursor` key; replace `"marks the given ids and reports the count"`
> with a 400 for `{ ids: [...] }`; rewrite the idempotency and C8 cases on `{ all: true }` (Bob's
> `all: true` leaves Alice's rows unread). Built code to change:
> `apps/backend/src/routes/notifications.ts:70-102` (list) and `:135-151` (POST /read),
> `apps/backend/src/__tests__/integration/notifications-routes.test.ts`; v1 to match:
> jpc-space `src/app/(notifications)/notifications-page.tsx:14-27`, `src/lib/notification-actions.ts:8-12`.

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
  NOTIFICATION_INBOX_LIMIT,
} from "../../../../packages/shared/src/index";

export const notificationsRouter = Router();

// Allowed by ruling X5: this router owns /api/v1/notifications outright, so a
// router-level requireAuth cannot turn another router's unknown path into 401.
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
 * v1's list (notifications-page.tsx:14-27; R33, R39): the newest 100 rows,
 * createdAt desc, one list, no cursor and no read-state filter. `id` desc is
 * the tie-break for a fan-out written by one `createMany` (same createdAt, R18).
 *
 * This endpoint writes nothing. v1 never marked on render either (R48, R49) —
 * but v2's client refetches on mount, on focus and on reconnect, so if it did,
 * every return to the app would be a write. Ruling C6.
 */
notificationsRouter.get("/", async (req, res) => {
  const user = requireUser(req);

  const rows = await db.notification.findMany({
    where: { userId: user.userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: NOTIFICATION_INBOX_LIMIT,
    select: LIST_SELECT,
  });

  // A real count, not a filter over the page: v1 counted unread by filtering
  // the 100 rows it had already fetched, so past 100 the header silently
  // understated (R37). Indexed by @@index([userId, readAt]).
  const unreadCount = await db.notification.count({
    where: { userId: user.userId, readAt: null },
  });

  return apiOk(res, {
    items: rows.map(toWire),
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
 * Mark all read — the explicit write, and the only one (v1
 * notification-actions.ts:8-12). v1's single-id action was exported and never
 * called (R47) and opening a notification leaves it unread (R48), so there is
 * no `ids` form.
 *
 * The `userId` clause is the whole security model here (R43, spec §4).
 * `readAt: null` keeps repeats free and keeps `readAt` stable once set (R44).
 */
notificationsRouter.post("/read", async (req, res) => {
  const user = requireUser(req);

  const parsed = markReadRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid mark-read body.", 400);
  const result = await db.notification.updateMany({
    where: {
      userId: user.userId,
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  return apiOk(res, { marked: result.count });
});
```

- [ ] **Step 4: Mount it**

In `apps/backend/src/app.ts`:

```ts
import { notificationsRouter } from "./routes/notifications";
```

```ts
  app.use("/api/v1/notifications", notificationsRouter);
```

placed with the other `/api/v1` mounts, before `notFoundHandler` (order among
them is irrelevant — distinct prefixes). The CORS method list already includes
`PUT` on `main` (`app.ts` — added with `PUT /submissions/by-assignment/:id`),
which Task 4's `PUT /me/notification-preferences` needs; an earlier draft of
this step "fixed" it again — nothing to change.

- [ ] **Step 5: OpenAPI, same commit**

Add to `src/docs/openapi.ts`, house style (prose `description` on each path,
components for the shapes): `GET /notifications` (no query parameters; the
newest 100 rows, createdAt desc; response `items`/`unreadCount`;
description states that it performs no write — ruling C6),
`GET /notifications/unread-count`, `POST /notifications/read` (request is
`{ all: true }` only; `bad_request` 400 documented), plus `Notification` and
`NotificationTarget` schemas. *(v1 parity 2026-10-09: was "cursor/limit/unreadOnly query; ids | all union")*

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
- Test: `apps/backend/src/__tests__/integration/me-notifications-routes.test.ts` (new)

**Why a new file.** `me-routes.test.ts` does not use `fixtures.ts` — it builds
its own user, declares its own `PASSWORD`, and has no second user. Extending it
would mean undeclared `prefsUserId`/`prefsToken`/`otherUserId` (as an earlier
draft did) or a redeclared `PASSWORD`. Plan 9 hit the same wall and created
`me-settings-routes.test.ts`; this plan follows it with a fixture-based suite of
its own *(v1 parity 2026-10-09; owner decision 2026-10-10: was ", which Task 5 extends" — Task 5 is withdrawn)*.

**Interfaces:**
- Consumes: `notificationPreferencesSchema`, `DEFAULT_NOTIFICATION_PREFERENCES`,
  `NOTIFICATION_PREFERENCE_KEYS` from shared (Task 1).
- Produces: `GET /api/v1/me/notification-preferences` → `{ data: { preferences } }`;
  `PUT /api/v1/me/notification-preferences` → `{ data: { preferences } }`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/backend/src/__tests__/integration/me-notifications-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let prefsUserId: number;
let prefsToken: string;
let otherUserId: number;

beforeAll(async () => {
  await cleanupTestData();
  const prefsUser = await createTestUser("prefs", "STUDENT");
  const other = await createTestUser("prefs-other", "STUDENT");
  prefsUserId = prefsUser.id;
  otherUserId = other.id;
  prefsToken = await login(app, prefsUser.email);
});

afterAll(async () => {
  await db.notificationPreference.deleteMany({ where: { userId: { in: [prefsUserId, otherUserId] } } });
  await cleanupTestData();
  await db.$disconnect();
});

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
    // v1 parity (settings-actions.ts:58-73, R56/R57): PUT sets v1's five keys
    // only. A quizGraded in the body is stripped, so the column keeps its
    // default.
    expect(res.body.data.preferences.quizGraded).toBe(true);

    const row = await db.notificationPreference.findUnique({ where: { userId: prefsUserId } });
    expect(row?.quizGraded).toBe(true);
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

  it("refuses a partial body — PUT replaces v1's five", async () => {
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

- [ ] **Step 2: (Coordinator) run — expect FAIL (404s).**

- [ ] **Step 3: Implement in `routes/me.ts`**

```ts
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  notificationPreferencesUpdateSchema,
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
 * The caller's own notification preferences — all six stored keys. Only
 * v1's five are settable (PUT below); `quizGraded` is read back so the
 * contract stays derived from the enum.
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
 * Replace them. PUT, not PATCH: the body carries v1's five settable keys
 * (jpc-space settings-actions.ts:58-73). `quizGraded` is not settable in v1,
 * so it is stripped and left untouched (R56, R57). *(v1 parity 2026-10-09:
 * was "the body carries all six keys")*
 *
 * The target row is never an input (R54) — `user.userId` comes from the
 * verified token, so one user cannot write another's preferences no matter
 * what the body says.
 */
meRouter.put("/notification-preferences", requireAuth, async (req, res) => {
  const user = requireUser(req);

  const parsed = notificationPreferencesUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", "All five notification preferences are required.", 400);
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

Merge `DEFAULT_NOTIFICATION_PREFERENCES` and `notificationPreferencesUpdateSchema`
into `me.ts`'s existing relative shared import (Plan 9 created it for
`changePasswordRequestSchema`/`updateProfileRequestSchema`) rather than adding
a second import statement; `apiError` is already imported (Plan 9).

Note on `.safeParse`: `notificationPreferencesUpdateSchema` is a plain (non-strict)
object, so an extra `userId` (or `quizGraded`) key in the body parses and is discarded rather
than 400ing. That is deliberate and the cross-user test above pins the
outcome; the request schema on the *mark-read* path is `.strict()` because
there the extra key would be adjacent to a real id array.

> **v1 parity 2026-10-09:** built code to change — `apps/backend/src/routes/me.ts:274-286` parses
> the six-key schema and writes `quizGraded`; switch to `notificationPreferencesUpdateSchema` (five
> keys) so `quizGraded` is left untouched, and update the matching case in
> `me-notifications-routes.test.ts`. v1 to match: jpc-space `src/lib/settings-actions.ts:58-73`.

- [ ] **Step 4: OpenAPI, same commit** — both paths, the six-key
`NotificationPreferences` response schema and the five-key PUT body, and a description recording that a user with
no row is opted in to everything.

- [ ] **Step 5: (Coordinator) run the suites** →
`cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern "me-routes|me-notifications-routes"` → PASS (`me-routes` proves the existing `GET /me` is untouched).

- [ ] **Step 6: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): notification preferences read/replace, v1's five settable keys"
```

---

### Task 5: Push — the contract now, the table at cutover — **WITHDRAWN** (owner decision 2026-10-10: push will be built later on Firebase)

v1 never sent push: there is no device or push model in
`jpc-space/prisma/schema.prisma` and no push code in `src/`; notifications are
in-app plus email. The owner will add push later on Firebase, under its own
plan, so this task is withdrawn: no `POST /api/v1/me/devices`, no
`503 push_unavailable` stub, no `DeviceRegistration` OpenAPI entry, no device
tests in `me-notifications-routes.test.ts`, and no
`docs/superpowers/cutover/2026-08-24-notifications-push.md`. That doc's §1
(`DeviceToken`) goes with Plan 18's M10, its §2 (`Notification` target
columns) was already withdrawn with M4, and its §3 items go with push (the
master switch) or were withdrawn for v1 parity (M5's new types; v1 never
deletes a notification, R53). In-app notifications and email are unaffected
*(v1 parity 2026-10-09; owner decision 2026-10-10: was "the device contract now, the `DeviceToken` migration written for cutover")*.
The endpoint, test and doc already built are removed with the parity code
changes — Revision 2026-10-09 table, row 7.

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
- Produces: `queryKeys.notifications.{all, lists(), list(), unreadCount(), preferences()}`;
  `useNotifications()` (one `useQuery`, v1's newest 100 — no paging, no unread filter);
  `useUnreadCount(): UseQueryResult<number>`;
  `useMarkRead(): UseMutationResult<{ marked: number }, unknown, MarkReadInput>` where
  `MarkReadInput = { all: true }` *(v1 parity 2026-10-09: was "infinite query with unreadOnly; ids | all")*;
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

  it("deep-links a student target to the student detail route", () => {
    // Plan 7 shipped the /student/[id] route (student/[id]/index.tsx since Plan 10) before this plan.
    expect(routeForTarget({ entityType: "student", entityId: 12 })).toEqual({
      pathname: "/student/[id]",
      params: { id: "12" },
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
 * at a route file that exists by this plan (Plan 1's assignment/[id], now
 * assignment/[id]/index.tsx via Plan 5; Plan 7's student/[id], now
 * student/[id]/index.tsx via Plan 10); typed routes make a missing one a
 * compile error.
 *
 * The `student` arm has no list fallback: every v1 student link carries an id
 * (/admin|leader/students/:id), so entityId is never null for it. The switch
 * still falls back to the roster rather than asserting, so a future null
 * cannot crash the inbox.
 */
export type NotificationRoute =
  | { pathname: "/assignment/[id]"; params: { id: string } }
  | { pathname: "/assignments" }
  | { pathname: "/quizzes" }
  | { pathname: "/calendar" }
  | { pathname: "/student/[id]"; params: { id: string } }
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
      return target.entityId === null
        ? { pathname: "/students" }
        : { pathname: "/student/[id]", params: { id: String(target.entityId) } };
  }
}
```

Typed routes check both pathnames against the real tree: `/assignment/[id]`
(Plan 1; file `assignment/[id]/index.tsx` since Plan 5) and `/student/[id]`
(Plan 7; file `student/[id]/index.tsx` since Plan 10) are prerequisites of this plan, so a
typecheck failure on either is the prerequisite missing, not something to
work around with a cast.

- [ ] **Step 4: Add the query-key factory**

In `apps/mobile/src/lib/query-keys.ts`, add a sibling to `sessions` inside the
same `queryKeys` object:

```ts
  notifications: {
    all: ["notifications"] as const,
    lists: () => [...queryKeys.notifications.all, "list"] as const,
    // The unread-only inbox is a different server query, so it gets its own
    // cache entry rather than being filtered out of the full one.
    list: () => [...queryKeys.notifications.lists()] as const,
    unreadCount: () => [...queryKeys.notifications.all, "unread-count"] as const,
    preferences: () => [...queryKeys.notifications.all, "preferences"] as const,
  },
```

- [ ] **Step 5: Write the hooks**

```ts
// apps/mobile/src/hooks/use-notifications.ts
import {
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
  type NotificationPreferences,
  type NotificationPreferencesUpdate,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

export type MarkReadInput = { all: true };

/**
 * The inbox: v1's one list of the newest 100 (notifications-page.tsx:14-27;
 * R33, R39). No cursor, no unread filter. The unread count is a real count
 * from the server, not a filter over the 100 rows.
 */
export function useNotifications() {
  return useQuery({
    queryKey: queryKeys.notifications.list(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/notifications");
      return notificationListResponseSchema.parse(res.data.data);
    },
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
 * v1 changed read state from exactly one control — "Mark all read" — and
 * never on open (R47, R48, R49); v2 does the same. *(v1 parity 2026-10-09: was
 * "mobile marks one read on open")*
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
    mutationFn: async (preferences: NotificationPreferencesUpdate) => {
      // PUT with v1's five keys (settings-actions.ts:58-73) — quizGraded is
      // not settable in v1 and is never sent.
      const res = await apiClient.put("/api/v1/me/notification-preferences", preferences);
      return notificationPreferencesResponseSchema.parse(res.data.data).preferences;
    },
    onSuccess: (preferences) => {
      queryClient.setQueryData(queryKeys.notifications.preferences(), preferences);
    },
  });
}
```

> **v1 parity 2026-10-09:** built code to change — `apps/mobile/src/hooks/use-notifications.ts:25-41`
> (infinite query, `limit 20`, `unreadOnly`, `cursor` → one `useQuery` with no params),
> `MarkReadInput` and `useMarkRead` (mark-all only), `useUpdateNotificationPreferences` (five keys),
> `flattenNotifications` removed; `apps/mobile/src/lib/query-keys.ts` drops the `unreadOnly` key part.
> and drops `useInfiniteQuery` from its imports.

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
2. **A bell with an unread badge in the shared screen header, on every
   screen** (Task 8), as v1's app shell renders it on every page for every role
   (jpc-space `src/components/layout/app-shell.tsx:55-57`). *(v1 parity
   2026-10-09: was "a bell on the dashboard only")*

**Files:**
- Create: `apps/mobile/app/(app)/notifications.tsx`
- Modify: `packages/shared/src/navigation.ts` (add `"notifications"` to
  `NavIconName`; add the sidebar entry to SUPER, ADMIN, LEADER, STUDENT,
  MENTOR, ALUMNI)
- Modify: `packages/shared/src/__tests__/navigation.test.ts` (the pin test
  freezes every sidebar — six edits)
- Modify: `apps/mobile/src/__tests__/nav-routes.test.ts` (Plan 1's exact
  `/more` lists for STUDENT, ADMIN and alumni gain "Notifications")
- Modify: `apps/mobile/src/components/NavIcon.tsx` (one glyph)
- Test: `apps/mobile/src/__tests__/notifications-screen.test.tsx` (new)

**Interfaces:**
- Consumes: `useNotifications`, `useMarkRead` (Task 6),
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
  user: {
    id: 9, name: "Test student", email: "s@jpc.test", role: "STUDENT" as const,
    avatarPath: null, hasPassword: true, // every required MeUser field (ruling X11)
  },
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

Plan 1's `apps/mobile/src/__tests__/nav-routes.test.ts` pins three `/more`
lists exactly (`moreItemsFor` = sidebar minus tabs), and "Notifications" now
surfaces in each. As Plan 11 (STUDENT "Attendance") and 8 (ADMIN "My notes")
left them, the three expectations become:

```ts
    expect(moreItemsFor(navByRole.STUDENT).map((i) => i.label)).toEqual([
      "Current Season", "Attendance", "History", "Profile", "Notifications", "Settings",
    ]);
    expect(moreItemsFor(navByRole.ADMIN).map((i) => i.label)).toEqual([
      "My Season", "My notes", "Assignments", "Quizzes", "Reports", "Notifications", "Settings",
    ]);
    expect(moreItemsFor(navFor({ role: "STUDENT", graduationYear: 2024 })).map((i) => i.label)).toEqual([
      "Notifications", "Settings",
    ]);
```

Run: `cd apps/mobile && pnpm jest src/__tests__/nav-routes.test.ts src/__tests__/more-screen.test.tsx` → PASS once Step 3 has landed.

- [ ] **Step 5: Write the screen**

```tsx
// apps/mobile/app/(app)/notifications.tsx
import { useRouter } from "expo-router";
import { FlatList, Pressable } from "react-native";
import type { NotificationItem } from "@space/shared";

import { useMarkRead, useNotifications } from "../../src/hooks/use-notifications";
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
  const { data, isPending, isError, refetch, isRefetching } = useNotifications();
  const markRead = useMarkRead();

  const items = data?.items ?? [];

  const handlePress = (item: NotificationItem) => {
    // v1 (notification-bell.tsx:133-139, notifications-page.tsx:75-81):
    // opening a notification only navigates; it stays unread (R48).
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

> **v1 parity 2026-10-09:** built code to change — `apps/mobile/app/(app)/notifications.tsx:75`
> (remove the `markRead.mutate({ ids: [item.id] })` on press; keep only "Mark all read" at `:102`)
> and the `fetchNextPage`/`onEndReached` paging. In Step 1's test, rewrite
> `"marks one read and navigates on an explicit tap"` to assert `post` is **not** called and the
> route is pushed, drop `"does not re-mark a notification that is already read"`, drop
> `nextCursor` from the mocked responses, and keep a "Mark all read" → `{ all: true }` case.
> v1 to match: jpc-space `src/components/layout/notification-bell.tsx:133-139`,
> `src/app/(notifications)/notifications-page.tsx:14-81`.

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

### Task 8: Mobile — the unread bell in the shared header, on every screen

**Files:**
- Create: `apps/mobile/src/components/NotificationBell.tsx`
- Modify: `apps/mobile/app/(app)/dashboard.tsx`
- Test: `apps/mobile/src/__tests__/dashboard.test.tsx` (extend — read it first;
  its `get` mock currently serves one URL and must become a router)

**Interfaces:**
- Consumes: `useUnreadCount` (Task 6), `NavIcon` (Task 7's `notifications` glyph).
- Produces: `<NotificationBell />`, used only by the dashboard today.

- [ ] **Step 1: Extend the dashboard test**

The bell's query runs for every role and every season state, so the
dashboard now issues `GET /api/v1/notifications/unread-count` even in the
"no active season" branch. Two consequences for `dashboard.test.tsx` (read it
first — Plans 1 and 16 may have reshaped it; these edits are written against
its no-season case, which every version keeps):

1. The existing `"shows a distinct empty state when there is no active season,
   without calling the API"` case asserts `expect(get).not.toHaveBeenCalled()`.
   That is now false by design. Replace that one line with an assertion that
   no **session** fetch happened, which is what the case is about:

```tsx
    // The bell's own count is the only request; no season data is fetched.
    expect(
      get.mock.calls.filter(([url]) => url !== "/api/v1/notifications/unread-count"),
    ).toEqual([]);
```

2. Add the bell cases. They use the no-season state so the bell's request is
   the only one the dashboard makes; any other URL rejects, which would only
   put a sibling card into its error state and cannot affect the bell:

```tsx
function mockUnreadCount(unreadCount: number) {
  get.mockImplementation((url: string) =>
    url === "/api/v1/notifications/unread-count"
      ? Promise.resolve({ data: { data: { unreadCount } } })
      : Promise.reject(new Error(`not under test: ${url}`)),
  );
}

const noSeason = { scopes: { ...scopesWithSeason, activeSeasonId: null } };

it("shows the unread badge and opens the inbox", async () => {
  // The dashboard is the one destination in every role's tab bar, which is
  // why the bell lives here (spec D3 — a sidebar-only entry buries the badge).
  useSessionStore.setState(noSeason);
  mockUnreadCount(3);

  renderWithProviders(<DashboardScreen />);

  expect(await screen.findByLabelText("Notifications, 3 unread")).toBeTruthy();
  expect(screen.getByText("3")).toBeTruthy();

  fireEvent.press(screen.getByLabelText("Notifications, 3 unread"));
  expect(mockPush).toHaveBeenCalledWith("/notifications");
});

it("caps the badge at 9+", async () => {
  useSessionStore.setState(noSeason);
  mockUnreadCount(42);

  renderWithProviders(<DashboardScreen />);

  expect(await screen.findByText("9+")).toBeTruthy();
});

it("renders no badge at zero unread", async () => {
  useSessionStore.setState(noSeason);
  mockUnreadCount(0);

  renderWithProviders(<DashboardScreen />);

  expect(await screen.findByLabelText("Notifications")).toBeTruthy();
  expect(screen.queryByText("0")).toBeNull();
});
```

`dashboard.test.tsx` may not mock `expo-router` yet (the screen never
navigated before the bell). If it does not, add with the other mocks — the
factory reads `mockPush` lazily, inside the returned function, so the hoisted
`jest.mock` never touches it before its declaration:

```tsx
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args) }),
}));
```

If a `jest.mock("expo-router", …)` already exists there (a later dashboard
plan may have added one), add `push` to its `useRouter` return instead of
declaring a second mock. The existing season cases keep their own
`get.mockResolvedValue(...)`; that resolves the bell's request with a
sessions-shaped body, which fails `unreadCountResponseSchema` and leaves the
bell badge-less — none of those cases assert on the bell.

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/mobile && pnpm jest src/__tests__/dashboard.test.tsx`
Expected: the three new cases FAIL, and so does nothing else (the rewritten
no-season assertion passes before and after the bell exists).

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
 * Rendered in the shared screen header so it is on every screen for every
 * role, as v1's app shell (app-shell.tsx:55-57). *(v1 parity 2026-10-09: was
 * "sits on the dashboard only")*
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
          <Text variant="caption" color={theme.colors.white}>
            {count > 9 ? "9+" : String(count)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
```

(`theme.spacing.xs`, `theme.colors.error[600]` and the `caption` text variant
all exist — verified in `src/theme/tokens.ts`. Use `theme.colors.white` rather
than the literal `"#ffffff"` for the badge text.)

- [ ] **Step 4: Mount it**

Render `<NotificationBell />` from the shared screen header so every screen
under `(app)` shows it, as v1's app shell does for every page and role
(jpc-space `src/components/layout/app-shell.tsx:55-57`). It manages its own
query and renders regardless of `activeSeasonId` — an inbox is not
season-scoped.

> **v1 parity 2026-10-09:** built code to change — the bell is mounted only in
> `apps/mobile/src/components/dashboard/DashboardFrame.tsx:4,23`. Move it into the shared header
> (`apps/mobile/src/ui/Screen.tsx`, or a header set in `apps/mobile/app/(app)/_layout.tsx:125`, which
> today has `headerShown: false`) and remove it from `DashboardFrame`. Move the bell cases out of
> `apps/mobile/src/__tests__/dashboard.test.tsx:562+` into a test that renders a non-dashboard screen
> and finds the bell. The `/unread-count` endpoint and 60 s poll stay. *(v1 parity 2026-10-09: was
> "render it as the first child of dashboard.tsx")*

- [ ] **Step 5: Run the tests**

Run: `cd apps/mobile && pnpm jest src/__tests__/dashboard.test.tsx` → PASS (all).
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): unread notification bell in the shared header"
```

---

### Task 9: Mobile — v1's five preference toggles

**Files:**
- Create: `apps/mobile/src/components/NotificationPreferences.tsx`
- Modify: `apps/mobile/app/(app)/settings.tsx` (Plan 9's real screen — add one section)
- Modify: `apps/mobile/src/__tests__/settings-screen.test.tsx` (Plan 9's suite — give its `get` mock a preferences answer)
- Test: `apps/mobile/src/__tests__/notification-preferences.test.tsx` (new)

**Interfaces:**
- Consumes: `useNotificationPreferences`, `useUpdateNotificationPreferences`
  (Task 6); `NOTIFICATION_PREFERENCE_KEYS`, `type NotificationPreferences` from
  `@space/shared`.
- Produces: `<NotificationPreferences />`, used by the settings screen
  *(v1 parity 2026-10-09; owner decision 2026-10-10: was "and by the push section in Task 10")*.

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
  it("renders v1's five switches — quizGraded has none", async () => {
    renderWithProviders(<NotificationPreferences />);

    expect(await screen.findByLabelText("Assignment created")).toBeTruthy();
    expect(screen.getByLabelText("Submission reviewed")).toBeTruthy();
    expect(screen.getByLabelText("Session rescheduled")).toBeTruthy();
    expect(screen.getByLabelText("Low attendance flag")).toBeTruthy();
    expect(screen.getByLabelText("Mentor follow-up")).toBeTruthy();
    // v1 parity (settings-page.tsx:7-13, settings-form.tsx:27-53; R56/R57):
    // v1's form rendered five toggles; quizGraded is not settable.
    expect(screen.queryByLabelText("Quiz graded")).toBeNull();
  });

  it("states the real low-attendance threshold — two, not three (spec D12)", async () => {
    // v1's help text said "misses 3 in a row"; the rule is two
    // (attendance-notifications.ts `take: 2`, 04-attendance.md R79).
    renderWithProviders(<NotificationPreferences />);
    expect(await screen.findByText(/two consecutive/i)).toBeTruthy();
  });

  it("PUTs v1's five keys when one is toggled off", async () => {
    renderWithProviders(<NotificationPreferences />);

    fireEvent(await screen.findByLabelText("Mentor follow-up"), "valueChange", false);

    const { quizGraded: _notSettable, ...fiveTrue } = allTrue;
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/api/v1/me/notification-preferences", {
        ...fiveTrue,
        mentorFollowup: false,
      }),
    );
  });

  it("explains what turning one off actually does", async () => {
    // v1 semantics (notifications.ts:56-94, R8/R9): off means no inbox row and
    // no email. Saying so is the difference between a setting and a surprise.
    renderWithProviders(<NotificationPreferences />);
    expect(await screen.findByText(/not in your inbox/i)).toBeTruthy();
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
import type { NotificationPreferencesUpdate } from "@space/shared";

import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from "../hooks/use-notifications";
import { useTheme } from "../theme";
import { Card, ErrorState, LoadingState, Text } from "../ui";

/**
 * One row per settable type — v1's five (settings-page.tsx:7-13). `quizGraded`
 * is stored but not settable in v1, so it has no row (R56/R57).
 * *(v1 parity 2026-10-09: was "six, not v1's five")*
 */
type SettableKey = keyof NotificationPreferencesUpdate;

const LABELS: Record<SettableKey, { label: string; help: string }> = {
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
};

const ORDER: SettableKey[] = [
  "assignmentCreated",
  "submissionReviewed",
  "sessionRescheduled",
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

  const toggle = (key: SettableKey, value: boolean) => {
    // PUT carries v1's five keys; quizGraded is never sent (R56).
    const { quizGraded: _notSettable, ...settable } = data;
    update.mutate({ ...settable, [key]: value });
  };

  return (
    <Card>
      <Text variant="heading">Notifications</Text>
      <Text variant="body" color={theme.colors.neutral[600]}>
        Turning one off stops that kind of notification entirely — not in your inbox, not by
        email.
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

> **v1 parity 2026-10-09:** built code to change — `apps/mobile/src/components/NotificationPreferences.tsx:44-54`
> renders a sixth "Quiz graded" row and PUTs six keys; remove the row and send the five settable
> keys (the shared default constant `packages/shared/src/notification.ts:139-146` stays). Help copy
> changes from "They will still appear in your inbox" to the v1 semantics above (no row, no email).
> v1 to match: jpc-space `src/app/(settings)/settings-page.tsx:7-13`,
> `src/components/settings/settings-form.tsx:27-53`.

- [ ] **Step 4: Mount it in settings**

Plan 9 (earlier in the execution order) replaced the settings placeholder
with the real six-role screen, so there is exactly one case here. In
`apps/mobile/app/(app)/settings.tsx`, import

```tsx
import { NotificationPreferences } from "../../src/components/NotificationPreferences";
```

and render `<NotificationPreferences />` as its own block between Plan 9's
"Change password" card (or, when `hasPassword` is false, the "Profile" card)
and the "Security" card — inside the existing
`<View style={{ gap: theme.spacing.md }}>`, so it inherits the spacing. Change
nothing else: domain 18 owns the rest of the screen, domain 10 owns this block.

Plan 9's `settings-screen.test.tsx` mocks `apiClient.get` as a bare
`jest.fn()`, which now receives the preferences request. In its `beforeEach`,
after `jest.clearAllMocks()`, add:

```tsx
  (apiClient.get as jest.Mock).mockResolvedValue({
    data: {
      data: {
        preferences: {
          assignmentCreated: true,
          submissionReviewed: true,
          sessionRescheduled: true,
          lowAttendanceFlag: true,
          mentorFollowup: true,
          quizGraded: true,
        },
      },
    },
  });
```

so the section renders its switches rather than an error card. None of Plan
7's assertions change.

- [ ] **Step 5: Run the tests**

Run: `cd apps/mobile && pnpm jest src/__tests__/notification-preferences.test.tsx src/__tests__/settings-screen.test.tsx` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): v1's five notification preference toggles in settings"
```

---

### Task 10: Mobile — Expo push permission and token lifecycle — **WITHDRAWN** (owner decision 2026-10-10: push will be built later on Firebase)

v1 has no push, and the owner will add push later on Firebase, so the Expo
client is withdrawn: no `expo-notifications` dependency or `app.json` plugin,
no `src/lib/push.ts` / `src/lib/app-config.ts` (`easProjectId`), no EAS
project-id step, no `pushToken` in the session store or `token-storage`, and
no "Push notifications" row in `NotificationPreferences` — the settings
section is v1's five toggles only (Task 9) *(v1 parity 2026-10-09; owner decision 2026-10-10: was "the dependency, the config, the permission prompt and token lifecycle, and the push row")*.
The client code already built is removed with the parity code changes —
Revision 2026-10-09 table, row 7.

---

### Task 11: Closing gate (coordinator)

**Files:** none created — verification only.

- [ ] **Step 1: Full suites**

Run: `pnpm turbo lint typecheck test:unit build` (repo root) → all tasks green.
Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern integration` → green.
Run: `grep -rn 'require("@space/shared")' apps/backend/dist/` → empty — all of `dist/`, not just routes (ruling X12; the `rootDir` emit trap).
Run: `grep -rn "function escapeHtml\|const escapeHtml\|renderNotificationHtmlForTest" apps/backend/src/` → empty (ruling X2 — escaping is Plan 12's, imported).

- [ ] **Step 2: Mutation pass**

One at a time, restore after each. Each must fail the named test (item 7 is
the one checked by inspection).

1. **C6.** In `routes/notifications.ts`'s `GET /`, add
   `await db.notification.updateMany({ where: { userId: user.userId, readAt: null }, data: { readAt: new Date() } });`
   before the response → `"DOES NOT mark anything read (ruling C6)"` fails.
2. **C8, read.** Remove `userId: user.userId` from the same handler's `where`
   → `"NEVER returns another user's rows"` fails.
3. **C8, write.** Remove `userId: user.userId` from `POST /read`'s `where`
   → `"CANNOT mark another user's notification"` fails.
4. **C6, client.** In `app/(app)/notifications.tsx`, add
   `useEffect(() => { if (items.length) markRead.mutate({ all: true }); }, [items]);`
   → `"writes NOTHING when the inbox is merely read"` fails.
5. **R56/R57.** Delete `quizGraded` from `notificationPreferencesSchema` →
   the shared derived-keys test fails **and** `tsc` fails on the `satisfies`.
6. **D1.** Make `parseNotificationLink` return `null` unconditionally → the
   inbox test's `target` assertion fails.
7. **D6.** Replace `bestEffort(...)` in `routes/submissions.ts` with a bare
   `await createNotificationsBulk(...)` → `best-effort.test.ts` still passes
   (it tests the helper, not the call site), so **also** confirm by inspection
   that no `createNotificationsBulk` / `flagLowAttendance` call sits outside
   `bestEffort`:
   `grep -rn "createNotificationsBulk\|flagLowAttendance" apps/backend/src/routes/ apps/backend/src/lib/` and read each hit
   against Task 2 Step 7's producer table (the only unwrapped hits allowed are
   the definition in `lib/notifications.ts` and the two awaits inside
   `lib/attendance-notifications.ts`).
8. **X1.** In `routes/notes.ts` (Plan 12), change the `MENTOR_FOLLOWUP` link to
   `/students/${studentUserId}` → `notes-routes.test.ts` "notifies season
   admins on a flagged note WITHOUT quoting it" fails on the link assertion,
   and `parseNotificationLink` of the new value is `null`. Restore.
9. **v1 opt-out (R8, R11).** In `createNotificationsBulk`, write rows for
   `recipients` instead of the filtered `targets` → `"respects an opt-out on
   NotificationPreference"` and `"writes nothing when every recipient opted
   out"` fail. *(v1 parity 2026-10-09: added)*

- [ ] **Step 3: Device checklist (manual, dev build or Expo Go)**

Backend running (`pnpm --filter @space/backend dev`), `apiClient` base URL
pointed at it, signed in as a staging student:

1. Every screen (not only the dashboard) shows the bell in its header; with
   seeded unread rows the badge shows the count, capped at `9+`.
2. Tap the bell → the inbox lists the newest 100 rows, newest first, in one
   list with no paging (v1 R33).
3. Background the app and return → the badge refreshes; **the unread count does
   not change** (nothing was marked by looking).
4. Tap a `SUBMISSION_REVIEWED` row → it opens the assignment and the badge
   does **not** change — opening does not mark read (v1 R48).
5. "Mark all read" → badge clears; pull to refresh → still clear.
6. Settings → five toggles (no "Quiz graded", as v1); turn "Mentor follow-up"
   off, kill the app, reopen → still off.
   *(v1 parity 2026-10-09: items 1, 2, 4, 6 were "bell on dashboard", "pages of 20",
   "badge drops on open", "six toggles incl. quizGraded")*
7. ~~Settings → "Enable push notifications"~~ — withdrawn with Task 10 *(v1 parity 2026-10-09; owner decision 2026-10-10)*;
   Settings shows no push row.

- [ ] **Step 4: Report**

Report: suite counts, all nine mutation outcomes and device checklist results
(items 1–6). Both header behaviour changes are withdrawn, so there is none
left for the reviewer to accept.
*(v1 parity 2026-10-09: was "the two … changes (D4's channel split, and the three-type push list)")*
*(v1 parity 2026-10-09; owner decision 2026-10-10: was "including which branch of item 7 applied … the three-type push list")*

**Roadmap drift — resolved.** The roadmap's done criterion for this plan read
"a review recorded on one device produces a push on the student's device".
Push is withdrawn (owner decision 2026-10-10: push will be built later on
Firebase), so the criterion is now the half this plan proves: *a review
recorded on one device produces an inbox row and an unread-badge increment on
the student's device, and opening the inbox never writes (C6)* — device
checklist items 1–4. The roadmap is amended to match; there is no push half
for Plan 18 *(v1 parity 2026-10-09; owner decision 2026-10-10: was "the push half moves to Plan 18's M10 verification")*.

---

## Revision 2026-10-05

Applied from the plan review (`review-plans-07-13.md`) and the coordinator's cross-plan rulings. Each finding was checked against the current tree and against jpc-space's source.

- **S1 / X2:** Withdrew Task 2's private `escapeHtml`, the `renderNotificationHtmlForTest` twin and the `encodeURI` link handling. This plan now uses Plan 12's `escapeHtml` (`apps/backend/src/lib/html.ts`) and `buildNotificationHtml` (`lib/email.ts`). Step 6 verifies them, and the closing gate greps that no second escaper exists.
- **S2 / X1:** The link parser now covers exactly the five link shapes v1 writes. They were enumerated from `jpc-space/src/lib` (nine producers), and the table in Task 2 cites file:line for each:
  - `/student/assignments/:id`
  - `/student/quizzes`
  - `/student/calendar`
  - `/admin/students/:id`
  - `/leader/students/:id`

  They are exported as `NOTIFICATION_LINK_PATTERNS` so Plan 18's M4 can mirror them one-for-one. The bare `/student/assignments` shape is dropped, because no v1 or current v2 producer writes it. `/quizzes/:id` is not added: under X1, Plan 8 writes v1's `/student/quizzes`.
- **S3:** Step 7 now lists every `createNotificationsBulk` producer by plan (main, 3, 15, 6, 8), with a label and a mechanical transform for each, and checks call sites across `routes/` and `lib/`. The claim that Plan 3 consumes `BulkNotificationResult` was wrong and is removed.
- **S4:** The `submissions.ts` link "fix" and the CORS `PUT` "fix" are dropped. Both were already on `main`.
- **S5:** A student target now deep-links to `/student/[id]`, which Plan 7 ships before this plan.
- **S6:** The `push.test.ts` mock factories wrap their `mock*` consts lazily, so there is no TDZ error.
- **S7:** The EAS project id is now an explicit Task 10 Step 0 for the user (`eas init` writes `expo.extra.eas.projectId`). It is read in one place, `src/lib/app-config.ts` → `easProjectId()`, through `Constants`, never `process.env`. A missing id is its own `not_configured` status, separate from `denied`, with its own copy. Device checklist item 7 has an expected result for each branch.
- **S8:** The roadmap's done criterion ("push on the student's device") cannot be met before cutover. The closing-gate report now states this drift, proves the inbox/badge half, and points the push half at Plan 18 M10. The roadmap itself is not edited in this pass.
- **S9:** The preference and device tests moved to a new fixture-based `me-notifications-routes.test.ts`, which declares `prefsUserId`, `prefsToken` and `otherUserId`.
- **DevicePlatform:** The wire stays lowercase (`devicePlatformSchema`). New `DEVICE_PLATFORM_TO_DB` maps it to Plan 18 M10's `DevicePlatform { IOS ANDROID }`. The cutover doc's `DeviceToken` DDL now matches M10 exactly: enum column, plus a `lastSeenAt` index. The doc also gives the lowercase-wire ↔ uppercase-enum mapping for `entityType` (M4).
- **X5:** `notificationsRouter` owns its prefix, so router-level `requireAuth` is allowed there. Everything added to `meRouter` attaches it per route.
- **X9:** Task 9 no longer has a "settings is still a placeholder" branch, because Plan 9 runs first. It mounts the section in Plan 9's screen and gives Plan 9's suite a preferences mock.
- **X12:** The emit check greps all of `dist/`.
- **Nits fixed:**
  - The MENTOR_FOLLOWUP push-exclusion rationale was rewritten. Plan 12 removed the excerpt, but the student's name is still in the title.
  - Dropped the hard-coded case counts.
  - The dashboard test now answers only the bell's URL (other URLs reject). It also fixes the no-season case's `not.toHaveBeenCalled()`, which the bell would otherwise break.
  - Fixtures include `hasPassword` (X11).
  - The badge uses `theme.colors.white`.

**Cross-plan consistency pass (2026-10-05, against plans 5, 6, 10 and 11 and the revised
order … 7 → 8 → 9 → 10 → 11 → 12 → 13 …):**

- **Prerequisites / Step 7:** execution order corrected (17 now follows 7).
  Route files named at their post-move paths — `assignment/[id]/index.tsx`
  (Plan 5) and `student/[id]/index.tsx` (Plan 10); the typed pathnames
  `routeForTarget` returns are unchanged, so no code changes.
- **X1 producers re-audited across Plans 5, 6, 10 and 11:** only Plan 5 writes a
  notification (`ASSIGNMENT_CREATED`, link `/student/assignments/<id>` — one of
  the five v1 shapes), from a single call site, `notifyAssignmentCreated` in
  `lib/assignment-writes.ts`; Step 7's table row now names that file. Plan 11,
  16 and 17 write none. `NOTIFICATION_LINK_PATTERNS` stays exactly v1's five.
- **Nav pin:** Task 7 Step 4 also updates Plan 1's `nav-routes.test.ts`, whose
  exact STUDENT / ADMIN / alumni `/more` lists (as Plans 11 and 12 left them)
  would otherwise fail on the new "Notifications" sidebar entry.

## Revision 2026-10-09 — v1 parity

Owner ruling: v2 behaves exactly like v1 except where v1's behaviour is a defect. This revision
reverts the divergences below; the edits are marked *(v1 parity 2026-10-09)* in place. The code
built from the earlier text must be changed to match. Full classification:
`docs/superpowers/audits/2026-cutover/v1-parity-classification.tsv`.

| # | Rule(s) | REG | v1 behaviour (v1 file:line) | v2 code to change (file:line) | Where in this plan |
|---|---|---|---|---|---|
| 1 | 10-notifications R8, R9, R11; 03-sessions R50; 04-attendance R86; 07-assignments R64; 08-submissions R23 (delivery half); 09-notes R19; 12-quizzes R117 | REG-37 (cancelled) | An opted-out recipient is filtered out before the insert: no in-app row, no email; one switch governs every channel; nothing written if all opted out (`src/lib/notifications.ts:56-94`, filter `:74-75`) | `apps/backend/src/lib/notifications.ts:62-100` (`createNotificationsBulk`); `apps/backend/src/__tests__/integration/notifications.test.ts:110-123` | Goal/Architecture; header "behaviour change" item 1 (withdrawn); Task 2 title, Files, Step 5 code, Step 8 tests; Task 5 cutover doc push-dispatch recipients; Task 9 help copy + test; Task 11 mutation 9 and report |
| 2 | 08-submissions R21 (title), R23 (title) | REG-91 | Every review notifies `Feedback ready on "<title>"`; there is no return-for-revision (`src/lib/submission-actions.ts:178-198`) | `apps/backend/src/routes/submissions.ts:451-464` (drop the `returnForRevision` ternary with Plan 2's action) | Task 2 Step 7 producer snippet 1 |
| 3 | 10-notifications R33, R39 | - | Inbox is one list of the newest 100, createdAt desc; no cursor, no read-state filter (`src/app/(notifications)/notifications-page.tsx:14-27`) | `packages/shared/src/notification.ts:58-66`; `apps/backend/src/routes/notifications.ts:70-102`; `apps/mobile/src/hooks/use-notifications.ts:25-41`; `apps/mobile/app/(app)/notifications.tsx` paging | Task 1 Interfaces, Step 1 tests, Step 4 contract; Task 3 Interfaces, Step 1 note, Step 3 router, Step 5 OpenAPI; Task 6 Interfaces, Step 4 keys, Step 5 hooks; Task 7 screen; Task 11 device item 2 |
| 4 | 10-notifications R47, R48 | - | Only "mark all read" exists; opening a notification just navigates and it stays unread (`src/lib/notification-actions.ts:8-18` — single-id action never called; `src/components/layout/notification-bell.tsx:133-139`; `notifications-page.tsx:75-81`) | `apps/backend/src/routes/notifications.ts:135-151` (`ids` form); `apps/mobile/app/(app)/notifications.tsx:75` (markRead on press) | Goal; Task 1 `markReadRequestSchema` + test; Task 3 title, router POST /read; Task 6 `MarkReadInput`/`useMarkRead`; Task 7 `handlePress` + Step 5 note; Task 11 mutation 4, device item 4 |
| 5 | 10-notifications R36 | - | The bell with unread count is in the app shell on every page for every role (`src/components/layout/app-shell.tsx:55-57`) | `apps/mobile/src/components/dashboard/DashboardFrame.tsx:4,23` → shared header (`apps/mobile/src/ui/Screen.tsx` or `apps/mobile/app/(app)/_layout.tsx:125`) | Architecture; Task 7 rationale item 2; Task 8 title, bell doc comment, Step 4 + note; Task 11 device item 1 |
| 6 | 10-notifications R56, R57; 18-settings R15 | REG-101 | Five preference toggles and a five-field action; `quizGraded` cannot be switched off (`src/app/(settings)/settings-page.tsx:7-13`, `src/lib/settings-actions.ts:58-73`, `src/components/settings/settings-form.tsx:27-53`) | `apps/backend/src/routes/me.ts:274-286` (PUT takes five keys, leaves `quizGraded`); `apps/mobile/src/components/NotificationPreferences.tsx:44-54` (remove the sixth row); shared default constant `notification.ts:139-146` stays | Goal; Task 1 Interfaces, Step 1 test, Step 4 `notificationPreferencesUpdateSchema`; Task 4 tests, Step 3 code + note, Step 4, commit; Task 6 `useUpdateNotificationPreferences`; Task 9 title, tests, component, note, commit; Task 10 Step 6 "five switches"; Task 11 device item 6 |
| 7 | 10-notifications D5 (push), R28 (email link); 18-settings D3 | - | v1 has no push: no device or push model (`prisma/schema.prisma`), no push code in `src/`; notifications are in-app plus email (`src/lib/notifications.ts:56-94`, `src/lib/email.ts:135-159`). Owner decision 2026-10-10: push will be built later on Firebase | Remove the push scaffolding: `packages/shared/src/notification.ts:151-196` (`PUSH_NOTIFICATION_TYPES`, `shouldPush`, `devicePlatformSchema`, `DEVICE_PLATFORM_TO_DB`, `deviceRegistrationSchema`); `packages/shared/src/__tests__/notification-contracts.test.ts:4,7,8,14,130-161`; `apps/backend/src/routes/me.ts:9,292-322` (`POST /me/devices`); `apps/backend/src/docs/openapi.ts:818-825,3652-3668` (and "push at cutover" in `:3624`); `apps/backend/src/__tests__/integration/me-notifications-routes.test.ts:111-141`; `apps/mobile/src/lib/push.ts` (delete); `apps/mobile/src/lib/app-config.ts` (delete — `push.ts` is its only consumer); `apps/mobile/src/__tests__/push.test.ts` (delete); `apps/mobile/src/store/session.ts:16-23,34-35,38` (`pushToken`); `apps/mobile/src/__tests__/session-store.test.ts:65-69`; `apps/mobile/src/lib/token-storage.ts:6,21-27,32`; `apps/mobile/src/components/NotificationPreferences.tsx:2,10,11,13 (Button),59-68,72-74,94 ("and push"),121-138`; `apps/mobile/src/__tests__/notification-preferences.test.tsx:8` and `settings-screen.test.tsx:18` (`jest.mock("../lib/push")`); `apps/mobile/app.json:13` (plugin) and `apps/mobile/package.json:28` (`pnpm --filter @space/mobile remove expo-notifications`, which also updates `pnpm-lock.yaml`); `docs/superpowers/cutover/2026-08-24-notifications-push.md` (delete). Push wording in `apps/backend/src/lib/notifications.ts:41-43` and `__tests__/integration/notifications.test.ts:115` goes with row 1 | Title; Goal; Architecture; Tech Stack; Schema verdict; header item 2 (withdrawn); Execution shape; Task 1 Interfaces, Step 1 tests, Step 4 contract; Task 2 `BulkNotificationResult`, doc comment, Step 5 note (email "Open" button stays, as an app link — Plan 18 Task 2b.4); Task 4 rationale; Task 5 (withdrawn); Task 9 Produces; Task 10 (withdrawn); Task 11 device item 7, report, roadmap drift |

**Resolved (owner 2026-10-10):** mobile push is withdrawn — the owner will add notifications
later with Firebase, under its own plan. Expo push, the planned `DeviceToken` table,
`POST /me/devices`, Task 5, Task 10 and header item 2's three-type list are withdrawn in place
(marked *(v1 parity 2026-10-09; owner decision 2026-10-10)*), with Plan 18's M10, Task 2b.10 and M5's `pushEnabled`. The
already-built push scaffolding is removed with the parity code changes (row 7). In-app
notifications and email are unaffected; the email's "Open" button stays, built as an app link to
the notification's target (Plan 18 Task 2b.4).
