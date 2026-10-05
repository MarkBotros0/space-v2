# Plan 11 — Student Self-Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A student sees their own season from the phone: the current season
with their group and the next sessions, their attendance budget and history,
their past seasons, and their own profile, which they can edit. They check in
to a session by scanning the room QR or typing its code, and a
`/checkin/<token>` link opens the app, sends them through login if needed, and
brings them back. An alumnus gets a read-only history and profile. A mentor's
Profile tab shows something useful.

**Architecture:** Four self-scoped reads and one self-scoped write on the
existing `meRouter` (`/api/v1/me` is its own prefix, and `requireAuth` is
attached per route, ruling X5). The subject is always the token's user and
never a parameter (spec 02 D13, spec 06 §7). Every derived number is computed
once, server-side, and sent on the contract (ruling C4): attendance %, season
progress, upcoming sessions, the absence budget with `remainingPct`, the
streak, and per-session budget cost. Every "which day" value is an
org-calendar `dayKey` from Plan 4's `orgDayKey` (ruling X13). Budget and
streak live in one pure module, `lib/attendance-budget.ts`, so Plan 16's
dashboard reads the same numbers through `GET /me/attendance` instead of
recomputing them (spec 19 D14, §7). On mobile, `/history`, `/profile` and
`/season`'s student branch replace placeholders. `/attendance` is new and gets
a STUDENT sidebar entry (spec 04 D14). `session/[id]` gains a student check-in
card (an expo-camera QR scanner plus an enter-code fallback). The deep link is
a root-level route outside `(app)`, and it never writes on open (spec 04 D3,
ruling C6). Lateness on the scan write moves to the session start (ruling
C3); no plan before this one had made that change.

**Tech Stack:** Express 5 + Prisma 7 (no schema change); Expo SDK 54 /
expo-router 6 (typed routes), React Query 5, Zustand 5, Zod contracts from
`@space/shared`, `expo-camera` ~17.0.10 (new — Task 10), RNTL 13 via
`renderWithProviders`.

**Spec:** `docs/superpowers/specs/domains/02-seasons.md` (R26–R41, §7 `me/season-history`,
§8, §9 `/season` STUDENT + `/history` rows, D2, D13, D14);
`04-attendance.md` (§7 `me/attendance`, §8 new schemas, §9 rows 3, 4, 7,
R56, R63, R69–R74, R88–R96, D1, D3, D14, D15); `06-students.md` (§7 `/me/profile`,
§8 `updateOwnProfileInputSchema`, §9 last two rows, R20–R26); `18-settings.md`
(D2, D8, D9 item 1, R9); `19-dashboards.md` (§7 `GET /me/attendance` amended
with `streak`, D14 `remainingPct`); `05-groups.md` (R88–R90); `09-notes.md`
R69 (streak); `_DECISIONS.md` (C1, C2, C3, C4, C6, C8, C9). Audit gaps
G2, G10, G11, G12, G21 (`coverage-audit.md`).

v1 reference (read-only): `jpc-space/src/lib/season-history-query.ts:18-80`,
`app/student/history/page.tsx`, `app/alumni/history/page.tsx`,
`components/students/season-history.tsx`, `app/student/profile/page.tsx:1-139`,
`app/alumni/profile/page.tsx:1-65`, `app/student/attendance/page.tsx:1-182`,
`lib/engagement.ts:109-172, 245-273`, `app/student/season/page.tsx:40-281`,
`app/checkin/[token]/page.tsx:1-77`, `components/sessions/student-checkin-button.tsx`,
`components/sessions/qr-scanner-view.tsx:1-53`.

**Depends on** (execution order 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → **11** → 12 → 13 → 14 → 15 → 16 → 17 → 18):
- Plan 1: `makeSession`/`makeUser`/`makeScopes`, `listRouteNames`, `PLACEHOLDER_SCREENS` derivation (X9), `src/lib/nav-routes.ts` (`navHref`, `moreItemsFor`, `NAV_ROUTES`), `/more` (`app/(app)/more.tsx` with its local `initialsFor`).
- Plan 3: `lib/org-time.ts`, `config.orgTimezone`.
- Plan 4: `orgDayKey` (`lib/org-time.ts`), `sessionDetailSchema` (`canManageCheckIn`, `myAttendance`), `apiErrorBodySchema`, `apiErrorMessage`, `formatDayKey`, `queryKeys.sessions.detail`, `session/[id]/index.tsx`, `season.tsx` and its `season-screens.test.tsx`.
- Plan 5: `isoDaySchema` in `packages/shared/src/org-time.ts`, reused for every `dayKey` and for date of birth. This plan defines no day schema of its own and uses none of `wallTimeSchema` / `orgWallTime` / `orgWallClockToInstant`. Plan 5 moved `assignment/[id].tsx` to `assignment/[id]/index.tsx`; nothing here links to it.
- Plan 6: `apps/mobile/src/hooks/use-check-in.ts` (`useCheckInState`, `useRegenerateCheckIn`) — Task 10 **appends** `useCheckIn` to it; the restructured `session/[id]/index.tsx` (`CheckInConsole`, `LiveCheckInRoster`, `SessionQuizzesCard`) and the `session-detail.test.tsx` Plan 6 replaced (`routeGets`, `baseDetail`); `sessionDetailSchema`'s now-required `dayKey`/`startTime`. Plan 6's session write format (`startDay`/`startTime`) does not touch this plan: its fixtures write `Session` rows through Prisma (`startsAt` is still the column) and post no sessions over HTTP.
- Plan 7: `packages/shared/src/student.ts` (`emptyToNull`, `studentProfilePrivateSchema`), `routes/students.ts` (`SELF_EDITABLE`/`ADMIN_EDITABLE`), `integration/students-routes.test.ts` (`student1Id`, `student1Token`, `adminToken`, `testEmail`).
- Plan 9: `routes/me.ts` as Task 5 of that plan left it (`ME_SELECT`, `PATCH /me` = name only, relative shared import), `/settings` screen, `useLogout` (pre-existing in `use-session.ts`).
- Plan 10: `app/login.tsx` and `login-screen.test.tsx` as Plans 9/10 left them (invite / forgot-password links); Plan 7's `student/[id]` is now `student/[id]/index.tsx` (nothing here links to it).
- Plan 6 added cards to `session/[id]/index.tsx` and `season.tsx`. This plan inserts one branch into each, so place it as described and leave every Plan 6 addition where it is.

**Not in this plan (owner named):** the student dashboard tiles that read
`GET /me/attendance` and link to `/attendance`, `/history` and `/profile` —
**Plan 16**. The profile's "Assignments completed/expected" counter (v1's stats
strip) is engagement's `submissionsCompleted`/`submissionsExpected`, which
**Plan 12** builds. Plan 12 or Plan 16 adds it to `/profile`. Avatar upload and
image read-back are deferred with uploads (CLAUDE.md; there is no avatar read
path in v2, so `/profile` renders initials). Check-in token regeneration is
**Plan 6**. The rotating check-in code (spec 04 D3 option 1), the check-in
role gate, error-code collapse and rate limit (spec 04 D4), and https
universal links for v1's printed `https://…/checkin/<token>` sheets are
**Plan 18's** register; see Decision 9.

## Decisions this plan locks in

1. **One writer per column (spec 18 D2/D8 over spec 06 §8).** `PATCH /me/profile`
   writes only the six `StudentProfile` columns a student may edit:
   `university`, `year`, `phone`, `dateOfBirth`, `spiritualBackground` and
   `gifts`. `User.name` belongs to Plan 9's `PATCH /me`. A student may not
   change `User.email` (spec 18 D8's recommendation: changing a login
   identifier with no verification is an account-takeover primitive). Spec
   06 §8 had put `name` and `email` in `updateOwnProfileInputSchema`.
   `_DECISIONS.md` does not rule on it, so this follows spec 18's
   recommendation and the reason is stated here. Plan 7's `PATCH /students/:id`
   also let the subject write `name` and `email` (`SELF_EDITABLE`), which is a
   back door around the same decision. Task 4 narrows it to the same six
   columns, and staff keep `name`/`email` through `ADMIN_EDITABLE`. Changing a
   name stays a two-tap trip: `/profile` → "Open settings".
2. **MENTOR's `/profile` tab is the account card.** It shows initials, name,
   email and role, plus **Settings** and **Sign out**. v1's mentor tab pointed
   at a page that never existed (spec 18 R11). MENTOR has no More tab, so on a
   phone this is the mentor's only route to `/settings` and to signing out
   (spec 18 R9). SUPER, ADMIN and LEADER have no `/profile` nav entry, but if
   they reach the route they get the same card. The route never calls
   `/me/profile` for them.
3. **`/history` takes no parameter.** Spec 02 §7 sketched `?excludeCurrent=`.
   Instead the server derives R35 from the token: a current student's active
   season is excluded, and an alumnus sees every enrollment. The client
   decides nothing.
4. **Soft-deleted seasons are hidden from the student surfaces** (spec 02 D2's
   recommendation, a deliberate divergence from v1 R27/R38). They disappear
   from `/history`, and `/season` and `/attendance` answer "no active season"
   when the pointer names a deleted season.
5. **`/season`'s student content comes from a new `GET /me/season`, not from
   composing existing reads.** Composing would mean `GET /seasons/:id` plus
   `GET /groups/:id` plus a client-side "starts after now" filter and a
   client-side progress count. The client would then derive values, which
   rulings C2 and C4 forbid. `GET /groups/:id` also withholds leader emails
   from students, while v1 showed them (R89), and `SeasonDetail.studentCount`
   tells a student the whole season's size. The new read resolves the group
   through `SeasonEnrollment` (ruling C9: v1 R31/R88 read the global
   `GroupStudent`). Leaders come with email; peers come with name only and an
   `isYou` flag (R89). Members are ACTIVE enrollments in that group for that
   season, which is the same rule as `groupListItemSchema.studentCount`.
6. **Ruling C3 lands on the scan write here.** `POST /sessions/check-in`
   measured `minutesLate` from `checkInOpenAt` (v1 R63), and no earlier plan
   changed that. Plan 18 M3 assumes v2 already writes from `startsAt`. This plan
   owns the student check-in surface, and the success copy "N minutes after
   session start" is only true once C3 is in (spec 04 D15: "fix the copy in
   the same change as D1"), so the fix lands here. The threshold is zero
   (ruling C3 over spec 04 D1's 15-minute grace).
7. **The deep link never writes on open** (spec 04 D3, ruling C6). v1's
   `/checkin/[token]` checked the student in as a side effect of rendering
   (R69). v2's `/checkin/[token]` shows one **Check in** button, and pressing
   it is the write. An anonymous visitor goes to `/login?returnTo=/checkin/<token>`
   and comes back afterwards (R56). `returnTo` is accepted **only** in the
   form `/checkin/<10-char token>` and is rebuilt as a typed `Href`, so it
   cannot become an open redirect.
8. **What the scanner accepts:** the bare 10-character token (what Plan 4's
   console QR encodes), v1's printed URL `http(s)://<any host>/checkin/<token>`
   (R41; v1 R72 checked the origin, but the app has no web origin to compare,
   and the token is the credential whichever host printed it), and the app's
   own `spacev2://checkin/<token>`. `parseCheckInCode` in `packages/shared` is
   the one parser, and the enter-code field uses it too.
9. **Not changed here, and recorded:** the check-in endpoint keeps its five
   distinct codes (v1 R59 parity; the result screen branches on them, and
   spec 04 D4's collapse would remove that). It also keeps having no role gate
   and no rate limit. A per-IP limiter would bucket a whole classroom behind
   one NAT, so it would need a per-user key. Both items, the rotating code,
   and https universal links are listed for Plan 18's register in the closing
   gate.
10. **`GET /me/attendance` covers the active season only.** Spec 04 §7's
    optional `?seasonId` is not built, because no screen needs it and it would
    be one more authorization surface. The response is
    `{ season, budget, streak, sessions }`. It is the spec 04 §8 shape plus
    spec 19's `streak` and `remainingPct`, with `season` nullable so that "no
    active season" is a value rather than an error.
11. **Date of birth travels as a calendar date, `"YYYY-MM-DD"`.** v1 stores a
    date input as UTC midnight, and a calendar date has no instant. Reading
    `toISOString().slice(0, 10)` and writing `${d}T00:00:00.000Z` round-trips
    the value in every timezone. Plan 7's staff detail serialises the same
    column as a full ISO instant. Both are correct for their screens, and the
    difference is noted here so nobody "unifies" one into the other.

## Global Constraints

- Relative imports only, **no `@/` alias**, in both apps. No `process.env` outside `apps/backend/src/lib/config.ts`. Never import `@prisma/client`. **No migrations, no schema edits** (ruling X14, C1).
- Backend **value** imports from `packages/shared` use the relative path in **every** backend src file (ruling X12): `"../../../../packages/shared/src/index"` from `src/routes/` and `src/lib/`, one more `../` from `src/lib/queries/`. `import type` may use `"@space/shared"`. This plan's only backend value imports are in `routes/me.ts`.
- `requireAuth` is attached **per route** on `meRouter` (ruling X5), the same way Plan 9 does it.
- `src/docs/openapi.ts` changes in the same commit as the route it documents.
- Every response is parsed with a shared Zod schema. That includes queries **and mutations** (ruling X10), and never `as T`.
- Dependent queries pass `enabled`; manual `refetch()` is guarded; nullable ids go into query keys as `null`.
- Screens map states to `LoadingState` / `ErrorState` (`onRetry`) / `EmptyState`. Screens under `(app)` pass `edges={["top", "left", "right"]}` to `Screen`.
- Tests: `renderWithProviders`; `jest.mock` factories may only close over consts named `mock*`, or `require(...)` a helper; query `Input` fields with `getByLabelText` and assert field errors via `accessibilityHint`. Session fixtures come from `makeSession` (ruling X11).
- Route-count tests are derived (ruling X9). Replacing a placeholder deletes its `PLACEHOLDER_SCREENS` row and nothing else. `attendance` is a nav href, so `ALL_ROUTE_NAMES` picks it up and no `DETAIL_ROUTE_NAMES` edit is needed. `app/checkin/[token].tsx` lives outside `(app)` and is in neither list.
- Typed routes: never `as Href` / `as any`. After adding a route file run `pnpm turbo routes:generate --filter=@space/mobile`.
- Wall-clock/day values come from the server's `dayKey` and are rendered with `formatDayKey` (ruling X13). Session start **times** are display-only (`formatSessionTime`); C2 lets the client format, never derive.
- Integration suites hit the shared staging DB and **run serially**: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern <suite>`. If tasks are parallelised across agents, the agents write integration tests without running them, and the coordinator runs every integration step serially.

**Execution shape:** Task 1 (shared contracts) goes first. Backend Tasks 2 →
3 → 4 form one sequential stream: all three touch `routes/me.ts` or
`openapi.ts`, and Task 3 consumes Task 2. Task 2b (C3 on check-in) is
independent of 3 and 4, but it shares `openapi.ts`, so run it in the same
stream. Mobile Task 5 (foundation) needs only Task 1. Tasks 6, 7, 8 and 9
(history, attendance + nav, profile, student season) then touch disjoint
files and may run in parallel after Task 5, with one exception: Task 6 and
Task 8 both edit `placeholder-screens.test.tsx` (different rows), so run them
in order or merge carefully. Task 10 (check-in on `session/[id]`) needs Task 5.
Task 11 (deep link + login return) needs Task 10. Task 12 is the
coordinator's closing gate. The mobile tasks pass their unit tests against
mocks; end-to-end confirmation is the device checklist in Task 12, which
needs Tasks 2–4 deployed to the dev backend.

---

### Task 1: Shared contracts

**Files:**
- Modify: `packages/shared/src/attendance.ts` (append)
- Modify: `packages/shared/src/season.ts` (append)
- Modify: `packages/shared/src/student.ts` (Plan 7's file; append)
- Test: `packages/shared/src/__tests__/self-service.test.ts` (new)

**Interfaces:**
- Consumes: `attendanceStatusSchema`, `seasonStatusSchema` (`./enums`); Plan 7's module-private `emptyToNull` in `student.ts`; Plan 5's `isoDaySchema` (`packages/shared/src/org-time.ts` — `YYYY-MM-DD`, a real calendar day). Reused for every `dayKey` and for date of birth; not redefined.
- Produces (exact names later tasks and plans use):
  - `attendance.ts`: `CHECK_IN_TOKEN_RE`; `parseCheckInCode(raw: string): string | null`; `checkInResponseSchema` / `CheckInResponse`; `checkInErrorCodeSchema` / `CheckInErrorCode`; `attendanceBudgetSchema` / `AttendanceBudget`; `myAttendanceSessionSchema` / `MyAttendanceSession`; `myAttendanceResponseSchema` / `MyAttendanceResponse`.
  - `season.ts`: `seasonHistoryCurriculumItemSchema`, `seasonHistoryRowSchema` / `SeasonHistoryRow`, `seasonHistoryResponseSchema`; `mySeasonLeaderSchema`, `mySeasonMemberSchema`, `mySeasonGroupSchema`, `mySeasonUpcomingSessionSchema`, `mySeasonSchema` / `MySeason`, `mySeasonResponseSchema`.
  - `student.ts`: `OWN_PROFILE_FIELDS` / `OwnProfileField`; `updateOwnProfileInputSchema` / `UpdateOwnProfileInput` (`z.input`); `myProfileSchema` / `MyProfile`; `myProfileResponseSchema`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/__tests__/self-service.test.ts
import {
  attendanceBudgetSchema,
  myProfileSchema,
  parseCheckInCode,
  seasonHistoryRowSchema,
  updateOwnProfileInputSchema,
} from "../index";

describe("parseCheckInCode (Decision 8)", () => {
  it("accepts the bare 10-character token the v2 console's QR encodes", () => {
    expect(parseCheckInCode("AbC123XyZ0")).toBe("AbC123XyZ0");
    expect(parseCheckInCode("  AbC123XyZ0\n")).toBe("AbC123XyZ0");
  });

  it("accepts v1's printed URL form from any host (spec 04 R41)", () => {
    expect(parseCheckInCode("https://space.jpc.example/checkin/AbC123XyZ0")).toBe("AbC123XyZ0");
    expect(parseCheckInCode("http://localhost:3000/checkin/AbC123XyZ0/")).toBe("AbC123XyZ0");
    expect(parseCheckInCode("https://space.jpc.example/checkin/AbC123XyZ0?utm=x")).toBe("AbC123XyZ0");
  });

  it("accepts the app's own deep link", () => {
    expect(parseCheckInCode("spacev2://checkin/AbC123XyZ0")).toBe("AbC123XyZ0");
  });

  it("refuses everything else", () => {
    for (const raw of [
      "",
      "hello",
      "AbC123XyZ",
      "AbC123XyZ01",
      "AbC-23XyZ0",
      "https://x.example/checkin/AbC123XyZ0/extra",
      "https://x.example/other/AbC123XyZ0",
      "javascript:alert(1)",
    ]) {
      expect(parseCheckInCode(raw)).toBeNull();
    }
  });
});

describe("updateOwnProfileInputSchema (Decision 1)", () => {
  it("turns a cleared field into null and leaves absent ones absent (PATCH, v1 R26)", () => {
    expect(updateOwnProfileInputSchema.parse({ phone: "", gifts: "Music" })).toEqual({
      phone: null,
      gifts: "Music",
    });
  });

  it("takes a calendar date and refuses anything that is not a real one", () => {
    expect(updateOwnProfileInputSchema.parse({ dateOfBirth: "2001-04-05" })).toEqual({
      dateOfBirth: "2001-04-05",
    });
    expect(updateOwnProfileInputSchema.parse({ dateOfBirth: "" })).toEqual({ dateOfBirth: null });
    for (const bad of ["05/04/2001", "2001-4-5", "2001-04-05T00:00:00.000Z"]) {
      const result = updateOwnProfileInputSchema.safeParse({ dateOfBirth: bad });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0]?.message).toBe("Use YYYY-MM-DD.");
    }
    // Plan 5's isoDaySchema rejects a well-formed but impossible day with its own message.
    const impossible = updateOwnProfileInputSchema.safeParse({ dateOfBirth: "2001-02-30" });
    expect(impossible.success).toBe(false);
    if (!impossible.success) expect(impossible.error.issues[0]?.message).toBe("Not a real calendar day.");
  });

  it("has no name, email, notes or activeSeasonId — refused, not dropped (R23/R24, spec 18 D2/D8)", () => {
    for (const body of [{ name: "X Y" }, { email: "a@b.test" }, { notes: "x" }, { activeSeasonId: 3 }]) {
      expect(updateOwnProfileInputSchema.safeParse(body).success).toBe(false);
    }
  });

  it("keeps v1's server-side bounds (R20)", () => {
    expect(updateOwnProfileInputSchema.safeParse({ phone: "1".repeat(60) }).success).toBe(true);
    expect(updateOwnProfileInputSchema.safeParse({ phone: "1".repeat(61) }).success).toBe(false);
    expect(updateOwnProfileInputSchema.safeParse({ gifts: "g".repeat(2001) }).success).toBe(false);
  });
});

describe("privacy-strict read contracts", () => {
  const profile = {
    name: "Mina Adel",
    email: "mina@jpc.test",
    avatarPath: null,
    graduationYear: null,
    activeSeasonTitle: "GBV 2026",
    university: null,
    year: null,
    phone: null,
    dateOfBirth: "2001-04-05",
    spiritualBackground: null,
    gifts: null,
  };

  it("myProfileSchema fails loudly if staff-only notes ever reach the subject (R23)", () => {
    expect(myProfileSchema.safeParse(profile).success).toBe(true);
    expect(myProfileSchema.safeParse({ ...profile, notes: "internal" }).success).toBe(false);
  });

  it("seasonHistoryRowSchema fails loudly on any submissions/feedback field (R34)", () => {
    const row = {
      seasonId: 1,
      title: "GBV 2025",
      startDate: "2025-02-01T00:00:00.000Z",
      endDate: "2025-06-30T00:00:00.000Z",
      groupName: null,
      attendancePct: 50,
      curriculum: [],
    };
    expect(seasonHistoryRowSchema.safeParse(row).success).toBe(true);
    expect(seasonHistoryRowSchema.safeParse({ ...row, feedback: "Great" }).success).toBe(false);
  });

  it("attendanceBudgetSchema bounds both percentages to 0–100", () => {
    const budget = { minutesUsed: 105, budgetMinutes: 180, budgetPct: 58, remainingPct: 42, absentCount: 1, lateCount: 1 };
    expect(attendanceBudgetSchema.safeParse(budget).success).toBe(true);
    expect(attendanceBudgetSchema.safeParse({ ...budget, budgetPct: 101 }).success).toBe(false);
    expect(attendanceBudgetSchema.safeParse({ ...budget, remainingPct: -1 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd packages/shared && pnpm jest src/__tests__/self-service.test.ts`
Expected: FAIL — none of the imported names exist.

- [ ] **Step 3: Append to `packages/shared/src/attendance.ts`**

```ts
// ---------------------------------------------------------------------------
// Student self-service — Plan 11
// ---------------------------------------------------------------------------

/** `newPublicId()`'s alphabet and length — what `Session.checkInToken` holds (spec 04 R35). */
export const CHECK_IN_TOKEN_RE = /^[0-9A-Za-z]{10}$/;
const CHECK_IN_URL_RE = /^https?:\/\/[^/?#\s]+\/checkin\/([0-9A-Za-z]{10})\/?(?:[?#]\S*)?$/i;
const CHECK_IN_APP_LINK_RE = /^spacev2:\/\/\/?checkin\/([0-9A-Za-z]{10})\/?$/i;

/**
 * The one parser for anything a student scans or types (Plan 11 Decision 8):
 * the bare token (Plan 4's console QR), v1's printed
 * `http(s)://<host>/checkin/<token>` (spec 04 R41), or this app's own
 * `spacev2://checkin/<token>`. Anything else is null. Regexes rather than
 * `new URL`, whose React Native polyfill is incomplete.
 */
export function parseCheckInCode(raw: string): string | null {
  const value = raw.trim();
  if (CHECK_IN_TOKEN_RE.test(value)) return value;
  const match = CHECK_IN_URL_RE.exec(value) ?? CHECK_IN_APP_LINK_RE.exec(value);
  return match?.[1] ?? null;
}

/** `POST /sessions/check-in` success. A scan can never produce ABSENT (spec 04 R64). */
export const checkInResponseSchema = z.object({
  status: z.enum(["PRESENT", "LATE"]),
  /** Whole minutes after the SESSION START (ruling C3), 0 when on time. */
  minutesLate: z.number().int().min(0),
});
export type CheckInResponse = z.infer<typeof checkInResponseSchema>;

/** The five refusals of spec 04 R59, so the client branches on codes, never on message text. */
export const checkInErrorCodeSchema = z.enum([
  "invalid_token",
  "not_open",
  "closed",
  "not_enrolled",
  "already_checked_in",
]);
export type CheckInErrorCode = z.infer<typeof checkInErrorCodeSchema>;

/**
 * Spec 04 R88–R90, computed once in `apps/backend/src/lib/attendance-budget.ts`.
 * `remainingPct` = max(0, 100 − budgetPct) is spec 19 D14's "Absence budget
 * left" — sent, not inverted on the client.
 */
export const attendanceBudgetSchema = z.object({
  minutesUsed: z.number().int().min(0),
  budgetMinutes: z.number().int().min(0),
  budgetPct: z.number().int().min(0).max(100),
  remainingPct: z.number().int().min(0).max(100),
  absentCount: z.number().int().min(0),
  lateCount: z.number().int().min(0),
});
export type AttendanceBudget = z.infer<typeof attendanceBudgetSchema>;

export const myAttendanceSessionSchema = z.object({
  sessionId: z.number(),
  title: z.string(),
  startsAt: z.string(),
  dayKey: isoDaySchema,
  /** Null = no record for this past session (v1 "No record"). */
  status: attendanceStatusSchema.nullable(),
  checkedInAt: z.string().nullable(),
  /** Only for LATE rows. */
  lateMinutes: z.number().int().nullable(),
  /** What this session cost the budget (R95): the season's absence weight for ABSENT, the row's minutes for LATE. */
  costMinutes: z.number().int().nullable(),
});
export type MyAttendanceSession = z.infer<typeof myAttendanceSessionSchema>;

/** `GET /api/v1/me/attendance` — the active season only (Plan 11 Decision 10). */
export const myAttendanceResponseSchema = z.object({
  /** Null when the student has no active season, or it was soft-deleted. */
  season: z
    .object({
      id: z.number(),
      title: z.string(),
      absenceBudgetMinutes: z.number().int(),
      absenceWeightMinutes: z.number().int(),
    })
    .nullable(),
  budget: attendanceBudgetSchema.nullable(),
  /** Spec 09 R69 / spec 19 R70: consecutive attended past sessions; ABSENT breaks it, unmarked is skipped. */
  streak: z.number().int().min(0),
  /** Past sessions (`startsAt <= now`), newest first (R94). */
  sessions: z.array(myAttendanceSessionSchema),
});
export type MyAttendanceResponse = z.infer<typeof myAttendanceResponseSchema>;
```

(`attendanceStatusSchema` is already imported at the top of the file. Add
`import { isoDaySchema } from "./org-time";` — Plan 5's org-calendar day
schema. Every `dayKey` below is an org day computed by `orgDayKey` (ruling
X13); this plan defines no second day schema.)

- [ ] **Step 4: Append to `packages/shared/src/season.ts`**

Add `import { isoDaySchema } from "./org-time";` (Plan 5) to the imports. Plan 3's
conversion already imports `z` and `seasonStatusSchema`; if either is
missing, add `import { z } from "zod";` /
`import { seasonStatusSchema } from "./enums";`. Then append:

```ts
// ---------------------------------------------------------------------------
// Student self-service — Plan 11
// ---------------------------------------------------------------------------

export const seasonHistoryCurriculumItemSchema = z.object({
  sessionId: z.number(),
  title: z.string(),
  startsAt: z.string(),
  dayKey: isoDaySchema,
});

/**
 * One past enrollment (spec 02 R33–R41). `.strict()` on purpose: R34 is a
 * privacy rule — history carries attendance % and curriculum ONLY. A
 * submissions/feedback/notes field arriving here fails the parse instead of
 * being silently stripped.
 */
export const seasonHistoryRowSchema = z
  .object({
    seasonId: z.number(),
    title: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    groupName: z.string().nullable(),
    attendancePct: z.number().int().min(0).max(100),
    curriculum: z.array(seasonHistoryCurriculumItemSchema),
  })
  .strict();
export type SeasonHistoryRow = z.infer<typeof seasonHistoryRowSchema>;

export const seasonHistoryResponseSchema = z.object({ seasons: z.array(seasonHistoryRowSchema) });

/** v1 showed leaders' emails to their students (spec 05 R89). */
export const mySeasonLeaderSchema = z.object({ id: z.number(), name: z.string(), email: z.string() });

/** Peers: name only — never an email (R89). Strict so an address cannot slip in. */
export const mySeasonMemberSchema = z
  .object({ id: z.number(), name: z.string(), isYou: z.boolean() })
  .strict();

export const mySeasonGroupSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  leaders: z.array(mySeasonLeaderSchema),
  members: z.array(mySeasonMemberSchema),
});

export const mySeasonUpcomingSessionSchema = z.object({
  id: z.number(),
  title: z.string(),
  startsAt: z.string(),
  dayKey: isoDaySchema,
  location: z.string().nullable(),
});

/**
 * `GET /api/v1/me/season` — the student's current season page (v1
 * app/student/season/page.tsx), every figure server-derived (C4).
 */
export const mySeasonSchema = z.object({
  id: z.number(),
  code: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: seasonStatusSchema,
  startDate: z.string(),
  endDate: z.string(),
  /** R29: session-based, not calendar-based — completed = startsAt <= now. */
  progress: z.object({
    completedSessions: z.number().int().min(0),
    totalSessions: z.number().int().min(0),
    pct: z.number().int().min(0).max(100),
  }),
  /** From SeasonEnrollment.groupId for THIS season (C9), not GroupStudent. */
  group: mySeasonGroupSchema.nullable(),
  /** R30: the next three sessions, `startsAt >= now`, ascending. */
  upcoming: z.array(mySeasonUpcomingSessionSchema).max(3),
});
export type MySeason = z.infer<typeof mySeasonSchema>;

export const mySeasonResponseSchema = z.object({ season: mySeasonSchema.nullable() });
```

- [ ] **Step 5: Append to `packages/shared/src/student.ts`**

Add `import { isoDaySchema } from "./org-time";` (Plan 5) to its imports, then append:

```ts
// ---------------------------------------------------------------------------
// The student's own profile — Plan 11 (GET/PATCH /api/v1/me/profile)
// ---------------------------------------------------------------------------

/**
 * The StudentProfile columns a student edits about themselves — and nothing
 * else (Plan 11 Decision 1). `User.name` is Plan 9's PATCH /me; `User.email`
 * is staff-only (spec 18 D8); `notes` and `activeSeasonId` never (R23).
 * routes/students.ts's SELF_EDITABLE is narrowed to this same set.
 */
export const OWN_PROFILE_FIELDS = [
  "university",
  "year",
  "phone",
  "dateOfBirth",
  "spiritualBackground",
  "gifts",
] as const;
export type OwnProfileField = (typeof OWN_PROFILE_FIELDS)[number];

/**
 * PATCH semantics: absent = untouched, "" or null = cleared (R26). `.strict()`
 * makes name/email/notes/activeSeasonId a parse failure (spec 06 §8: "a type
 * error rather than a runtime no-op"); the route refuses them by name first.
 * The mobile form validates with THIS schema before sending.
 */
export const updateOwnProfileInputSchema = z
  .object({
    university: emptyToNull(160),
    year: emptyToNull(40),
    phone: emptyToNull(60),
    /** A calendar date, "YYYY-MM-DD" (Plan 11 Decision 11) — Plan 5's isoDaySchema, not a copy. */
    dateOfBirth: z
      .string()
      .nullish()
      .transform((v) => (v === "" ? null : v))
      .pipe(isoDaySchema.nullish()),
    spiritualBackground: emptyToNull(4000),
    gifts: emptyToNull(2000),
  })
  .strict();
export type UpdateOwnProfileInput = z.input<typeof updateOwnProfileInputSchema>;

/**
 * What the student reads back about themselves. `.strict()`: staff-only
 * `notes` arriving here fails the parse (R23) instead of being stripped.
 */
export const myProfileSchema = z
  .object({
    name: z.string(),
    email: z.string(),
    avatarPath: z.string().nullable(),
    /** Non-null = alumnus (read-only profile). */
    graduationYear: z.number().int().nullable(),
    activeSeasonTitle: z.string().nullable(),
    university: z.string().nullable(),
    year: z.string().nullable(),
    phone: z.string().nullable(),
    dateOfBirth: isoDaySchema.nullable(),
    spiritualBackground: z.string().nullable(),
    gifts: z.string().nullable(),
  })
  .strict();
export type MyProfile = z.infer<typeof myProfileSchema>;

export const myProfileResponseSchema = z.object({ profile: myProfileSchema });
```

- [ ] **Step 6: Run the tests and the package gate**

Run: `cd packages/shared && pnpm jest src/__tests__/self-service.test.ts` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/shared` → clean.

- [ ] **Step 7: Commit**

```bash
git add packages/shared && git commit -m "feat(shared): student self-service contracts — history, my season, my attendance, own profile, check-in"
```

---

### Task 2: Backend — absence budget and streak, defined once

**Files:**
- Create: `apps/backend/src/lib/attendance-budget.ts` (pure, no DB import)
- Create: `apps/backend/src/lib/queries/attendance-budget.ts` (the DB read)
- Test: `apps/backend/src/__tests__/attendance-budget.test.ts`

**Interfaces:**
- Consumes: Prisma `AttendanceStatus` type (`src/generated/prisma/enums`).
- Produces: `budgetFrom(input: BudgetInput): AttendanceBudget`, `costMinutesFor(status, lateMinutes, absenceWeightMinutes): number | null`, `streakFrom(newestFirst: (AttendanceStatus | null)[]): number`, `interface AttendanceBudget` in `lib/attendance-budget.ts`; `computeAttendanceBudget(studentUserId: number, season: BudgetSeason): Promise<AttendanceBudget>` and `interface BudgetSeason` in `lib/queries/attendance-budget.ts`. **Plans 12 and 16 import these; they never re-derive the budget or the streak** (spec 19 §7: "computed by the one server function").

- [ ] **Step 1: Write the failing unit test**

```ts
// apps/backend/src/__tests__/attendance-budget.test.ts
import { budgetFrom, costMinutesFor, streakFrom } from "../lib/attendance-budget";

describe("budgetFrom (spec 04 R88–R90, spec 19 D14)", () => {
  it("charges the absence weight per ABSENT and the actual minutes per LATE", () => {
    expect(
      budgetFrom({ absentCount: 1, lateCount: 1, lateMinutesSum: 15, absenceWeightMinutes: 90, absenceBudgetMinutes: 180 }),
    ).toEqual({ minutesUsed: 105, budgetMinutes: 180, budgetPct: 58, remainingPct: 42, absentCount: 1, lateCount: 1 });
  });

  it("caps budgetPct at 100, so remainingPct bottoms out at 0 — minutesUsed is never capped", () => {
    expect(
      budgetFrom({ absentCount: 3, lateCount: 0, lateMinutesSum: 0, absenceWeightMinutes: 90, absenceBudgetMinutes: 180 }),
    ).toMatchObject({ minutesUsed: 270, budgetPct: 100, remainingPct: 0 });
  });

  it("is 0% used / 100% left for a clean record", () => {
    expect(
      budgetFrom({ absentCount: 0, lateCount: 0, lateMinutesSum: 0, absenceWeightMinutes: 90, absenceBudgetMinutes: 180 }),
    ).toMatchObject({ minutesUsed: 0, budgetPct: 0, remainingPct: 100 });
  });

  it("does not divide by zero when a season's budget is 0", () => {
    const base = { lateCount: 0, lateMinutesSum: 0, absenceWeightMinutes: 90, absenceBudgetMinutes: 0 };
    expect(budgetFrom({ ...base, absentCount: 0 })).toMatchObject({ budgetPct: 0, remainingPct: 100 });
    expect(budgetFrom({ ...base, absentCount: 1 })).toMatchObject({ budgetPct: 100, remainingPct: 0 });
  });
});

describe("costMinutesFor (R95)", () => {
  it("is the season's weight for ABSENT and the row's own minutes for LATE", () => {
    expect(costMinutesFor("ABSENT", null, 90)).toBe(90);
    expect(costMinutesFor("ABSENT", 40, 90)).toBe(90);
    expect(costMinutesFor("LATE", 12, 90)).toBe(12);
  });

  it("is null for PRESENT, for no record, and for a LATE without minutes (R89 — costs nothing)", () => {
    expect(costMinutesFor("PRESENT", null, 90)).toBeNull();
    expect(costMinutesFor(null, null, 90)).toBeNull();
    expect(costMinutesFor("LATE", null, 90)).toBeNull();
  });
});

describe("streakFrom (spec 09 R69, newest first)", () => {
  it("counts consecutive PRESENT/LATE back from the newest", () => {
    expect(streakFrom(["PRESENT", "LATE", "PRESENT"])).toBe(3);
  });

  it("skips an unmarked session instead of breaking on it", () => {
    expect(streakFrom([null, "PRESENT", null, "LATE", "ABSENT", "PRESENT"])).toBe(2);
  });

  it("stops at the first ABSENT", () => {
    expect(streakFrom(["ABSENT", "PRESENT", "PRESENT"])).toBe(0);
  });

  it("is 0 with no sessions or no records", () => {
    expect(streakFrom([])).toBe(0);
    expect(streakFrom([null, null])).toBe(0);
  });
});
```

Run: `cd apps/backend && npx jest src/__tests__/attendance-budget.test.ts` → FAIL (module missing).

- [ ] **Step 2: Write the pure module**

```ts
// apps/backend/src/lib/attendance-budget.ts
import type { AttendanceStatus } from "../generated/prisma/enums";

/**
 * The absence budget and the attendance streak — defined ONCE (ruling C4,
 * spec 19 §7). v1 computed these in `lib/engagement.ts:109-172, 250-273` and
 * re-derived pieces of them in three pages; here every caller (GET
 * /me/attendance today, Plan 16's dashboard through it) gets the same numbers.
 *
 * Pure on purpose: no DB import, so the arithmetic is unit-tested without a
 * database. `queries/attendance-budget.ts` feeds it.
 *
 * Inherits ruling C3's caveat: LATE rows charge their raw `lateMinutes`
 * (spec 04 R88, D2), and rows written by v1 measured those minutes from
 * check-in opening, not the session start.
 */
export interface AttendanceBudget {
  minutesUsed: number;
  budgetMinutes: number;
  budgetPct: number;
  remainingPct: number;
  absentCount: number;
  lateCount: number;
}

export interface BudgetInput {
  absentCount: number;
  lateCount: number;
  /** SUM(lateMinutes) over LATE rows; a null lateMinutes contributes 0 (R89). */
  lateMinutesSum: number;
  absenceWeightMinutes: number;
  absenceBudgetMinutes: number;
}

export function budgetFrom(input: BudgetInput): AttendanceBudget {
  const minutesUsed = input.absentCount * input.absenceWeightMinutes + input.lateMinutesSum;
  // R90: rounded and capped at 100. A zero budget would be 0/0 or x/0 in v1
  // (NaN / Infinity); it is either untouched or exhausted here.
  const budgetPct =
    input.absenceBudgetMinutes > 0
      ? Math.min(Math.round((minutesUsed / input.absenceBudgetMinutes) * 100), 100)
      : minutesUsed > 0
        ? 100
        : 0;
  return {
    minutesUsed,
    budgetMinutes: input.absenceBudgetMinutes,
    budgetPct,
    // Spec 19 D14: "Absence budget left" is sent, never inverted on a client.
    remainingPct: Math.max(0, 100 - budgetPct),
    absentCount: input.absentCount,
    lateCount: input.lateCount,
  };
}

/** R95: what one session cost the budget. Null = nothing to show. */
export function costMinutesFor(
  status: AttendanceStatus | null,
  lateMinutes: number | null,
  absenceWeightMinutes: number,
): number | null {
  if (status === "ABSENT") return absenceWeightMinutes;
  if (status === "LATE") return lateMinutes;
  return null;
}

/**
 * Spec 09 R69: consecutive attended sessions counting back from the most
 * recent PAST session. ABSENT breaks it; a session with no record is skipped
 * (not penalised). `newestFirst` is the statuses of past sessions, newest first.
 */
export function streakFrom(newestFirst: (AttendanceStatus | null)[]): number {
  let streak = 0;
  for (const status of newestFirst) {
    if (status === null) continue;
    if (status === "ABSENT") break;
    streak += 1;
  }
  return streak;
}
```

- [ ] **Step 3: Write the DB read**

```ts
// apps/backend/src/lib/queries/attendance-budget.ts
import { db } from "../../db/client";
import { budgetFrom, type AttendanceBudget } from "../attendance-budget";

export interface BudgetSeason {
  id: number;
  absenceBudgetMinutes: number;
  absenceWeightMinutes: number;
}

/**
 * v1 `computeAttendanceBudget` (lib/engagement.ts:109-151), minus its own
 * season lookup — callers already hold the season row. R91 kept: every
 * attendance row in the season counts, whatever the session's date.
 */
export async function computeAttendanceBudget(
  studentUserId: number,
  season: BudgetSeason,
): Promise<AttendanceBudget> {
  const [absentCount, late] = await Promise.all([
    db.attendance.count({
      where: { studentUserId, status: "ABSENT", session: { seasonId: season.id } },
    }),
    db.attendance.aggregate({
      where: { studentUserId, status: "LATE", session: { seasonId: season.id } },
      _count: { _all: true },
      _sum: { lateMinutes: true },
    }),
  ]);
  return budgetFrom({
    absentCount,
    lateCount: late._count._all,
    lateMinutesSum: late._sum.lateMinutes ?? 0,
    absenceWeightMinutes: season.absenceWeightMinutes,
    absenceBudgetMinutes: season.absenceBudgetMinutes,
  });
}
```

- [ ] **Step 4: Run**

Run: `cd apps/backend && npx jest src/__tests__/attendance-budget.test.ts` → PASS.
Run: `pnpm turbo lint typecheck --filter=@space/backend` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): absence budget and attendance streak, defined once"
```

---

### Task 2b: Backend — check-in lateness from the session start (ruling C3)

**Files:**
- Modify: `apps/backend/src/routes/sessions.ts` (`POST /check-in` only)
- Modify: `apps/backend/src/docs/openapi.ts` (`/api/v1/sessions/check-in` description)
- Test: `apps/backend/src/__tests__/integration/check-in-routes.test.ts` (append a describe)

**Interfaces:**
- Consumes: nothing new.
- Produces: `POST /api/v1/sessions/check-in` → `{ data: { status, minutesLate } }` with `minutesLate` = whole minutes after `session.startsAt` (was: after `checkInOpenAt`). Codes unchanged.

- [ ] **Step 1: Write the failing integration tests.** Add
`import { newPublicId } from "../../lib/public-id";` to the imports of
`check-in-routes.test.ts`, then append the describe below (its `beforeAll` already has `seasonId`, `studentUserId`, `adminToken`, `studentToken`, and an ACTIVE enrollment for the student):

```ts
describe("lateness is measured from the session start, not from opening (ruling C3, spec 04 D1)", () => {
  it("marks a scan 20 minutes after startsAt LATE by 20 — although check-in opened only now", async () => {
    const started = await db.session.create({
      data: {
        seasonId,
        title: "Started 20 minutes ago",
        // +5s so floor() lands on 20 however slow the round-trip is.
        startsAt: new Date(Date.now() - 20 * 60_000 - 5_000),
        durationMinutes: 90,
      },
      select: { id: true },
    });
    const open = await request(app)
      .post(`/api/v1/sessions/${started.id}/check-in-open`)
      .set("authorization", `Bearer ${adminToken}`);

    const res = await request(app)
      .post("/api/v1/sessions/check-in")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ token: open.body.data.checkInToken });

    // Measured from checkInOpenAt (v1 R63) this would be PRESENT / 0.
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: "LATE", minutesLate: 20 });
    const row = await db.attendance.findUnique({
      where: { sessionId_studentUserId: { sessionId: started.id, studentUserId } },
      select: { status: true, lateMinutes: true },
    });
    expect(row).toEqual({ status: "LATE", lateMinutes: 20 });
  });

  it("marks a scan before the start PRESENT even when check-in opened half an hour earlier", async () => {
    const upcoming = await db.session.create({
      data: {
        seasonId,
        title: "Starts in 10 minutes",
        startsAt: new Date(Date.now() + 10 * 60_000),
        durationMinutes: 90,
        checkInToken: newPublicId(),
        // Opened 30 minutes ago: v1 would charge 30 "late" minutes to an early arrival.
        checkInOpenAt: new Date(Date.now() - 30 * 60_000),
      },
      select: { id: true, checkInToken: true },
    });

    const res = await request(app)
      .post("/api/v1/sessions/check-in")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ token: upcoming.checkInToken });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: "PRESENT", minutesLate: 0 });
  });
});
```

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern check-in-routes`
Expected: the two new cases FAIL (`PRESENT/0` and `LATE/30`); the existing cases PASS.

- [ ] **Step 2: Implement.** In `routes/sessions.ts`'s `POST /check-in`
handler, add `startsAt: true` to the `db.session.findUnique` select, and
replace the `minutesLate` computation with:

```ts
  // Ruling C3: lateness is measured from the session's START — not from when
  // an admin pressed "Open check-in" (spec 04 R63, D1), which made a punctual
  // student LATE whenever the console opened early. The threshold is zero
  // until Plan 18 M3 adds `Season.lateThresholdMinutes` (C3 over spec 04 D1's
  // 15-minute grace). Rows v1 writes still mean "minutes since opening";
  // C3 accepts that divergence and Plan 18 M3 backfills it.
  const minutesLate = Math.max(
    0,
    Math.floor((now.getTime() - session.startsAt.getTime()) / 60_000),
  );
```

The `not_open` check above it stays. Rewrite its comment so it no longer
mentions "the lateness computation below": `// Checked separately from isCheckInOpen so "never opened" stays distinguishable from "opened and since expired".`

- [ ] **Step 3: OpenAPI.** In `src/docs/openapi.ts`, `/api/v1/sessions/check-in`
→ `post.description` becomes:
`"Marks the caller PRESENT, or LATE with the whole minutes elapsed since the session's start (ruling C3 — not since check-in opened). Check-in hard-stops three hours after opening even if never explicitly closed."`
and `minutesLate` gains `description: "Whole minutes after Session.startsAt; 0 when on time."`.

- [ ] **Step 4: Run** the suite (Step 1's command) → PASS.
`pnpm turbo lint typecheck --filter=@space/backend` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/backend && git commit -m "fix(backend): check-in lateness measured from the session start (ruling C3)"
```

---

### Task 3: Backend — `GET /me/season-history`, `GET /me/season`, `GET /me/attendance`

**Files:**
- Create: `apps/backend/src/lib/queries/me.ts`
- Modify: `apps/backend/src/routes/me.ts` (three routes)
- Modify: `apps/backend/src/docs/openapi.ts` (three paths)
- Test: `apps/backend/src/__tests__/integration/me-self-service-routes.test.ts` (new)

**Interfaces:**
- Consumes: `computeAttendanceBudget` (Task 2), `costMinutesFor`, `streakFrom`; `orgDayKey` (Plan 4, `lib/org-time.ts`); `isAlumnus` (`lib/rbac.ts`); `SessionUser`.
- Produces: `loadSeasonHistory(user)`, `loadMySeason(user, now?)`, `loadMyAttendance(user, now?)`, `UPCOMING_LIMIT = 3` in `lib/queries/me.ts`; endpoints:
  - `GET /api/v1/me/season-history` → `{ data: { seasons: SeasonHistoryRow[] } }` — role `STUDENT` (alumni included) else `403 forbidden`
  - `GET /api/v1/me/season` → `{ data: { season: MySeason | null } }` — `STUDENT` else 403
  - `GET /api/v1/me/attendance` → `{ data: MyAttendanceResponse }` — `STUDENT` else 403

- [ ] **Step 1: Write the failing integration suite**

```ts
// apps/backend/src/__tests__/integration/me-self-service-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();
const DAY = 24 * 60 * 60 * 1000;

let pastSeasonId: number;
let currentSeasonId: number;
let studentId: number;
let peerId: number;
let leaderId: number;
let studentToken: string;
let alumnusToken: string;
let leaderToken: string;
let adminToken: string;

beforeAll(async () => {
  await cleanupTestData();

  const past = await createTestSeason({ year: 2098 });
  const current = await createTestSeason();
  const deleted = await createTestSeason({ year: 2097 });
  pastSeasonId = past.id;
  currentSeasonId = current.id;
  await db.season.update({ where: { id: past.id }, data: { title: "Past Season" } });
  await db.season.update({
    where: { id: current.id },
    data: { title: "Current Season", description: "The season we are in." },
  });
  // Spec 02 D2: a soft-deleted season disappears from the student surfaces.
  await db.season.update({ where: { id: deleted.id }, data: { title: "Deleted Season", deletedAt: new Date() } });

  const student = await createTestUser("self-student", "STUDENT");
  const peer = await createTestUser("peer", "STUDENT");
  const withdrawn = await createTestUser("withdrawn-peer", "STUDENT");
  const alumnus = await createTestUser("alumnus", "STUDENT");
  const leader = await createTestUser("leader", "LEADER");
  const admin = await createTestUser("admin", "ADMIN");
  studentId = student.id;
  peerId = peer.id;
  leaderId = leader.id;
  // graduationYear is a token claim read at login — set it before logging in.
  await db.user.update({ where: { id: alumnus.id }, data: { graduationYear: 2098 } });

  const pastGroup = await db.group.create({ data: { seasonId: past.id, name: "Group A1" }, select: { id: true } });
  const currentGroup = await db.group.create({
    data: {
      seasonId: current.id,
      name: "Group B1",
      description: "Tuesday group",
      leaders: { create: { userId: leader.id } },
    },
    select: { id: true },
  });

  // Ruling C9 trap: GroupStudent (one row per student, database-wide) still
  // points at LAST season's group. /me/season must not read it.
  await db.groupStudent.create({ data: { groupId: pastGroup.id, studentUserId: student.id } });

  await db.seasonEnrollment.createMany({
    data: [
      { studentUserId: student.id, seasonId: past.id, groupId: pastGroup.id, status: "COMPLETED", enrolledAt: new Date(Date.now() - 400 * DAY) },
      { studentUserId: student.id, seasonId: current.id, groupId: currentGroup.id, status: "ACTIVE", enrolledAt: new Date(Date.now() - 30 * DAY) },
      { studentUserId: student.id, seasonId: deleted.id, status: "COMPLETED", enrolledAt: new Date(Date.now() - 500 * DAY) },
      { studentUserId: peer.id, seasonId: current.id, groupId: currentGroup.id, status: "ACTIVE" },
      { studentUserId: withdrawn.id, seasonId: current.id, groupId: currentGroup.id, status: "WITHDRAWN" },
      // R33: history lists an enrollment whatever its status.
      { studentUserId: alumnus.id, seasonId: past.id, status: "WITHDRAWN" },
    ],
  });

  // activeSeasonId is a token claim read at login — set it before logging in.
  await db.studentProfile.create({
    data: {
      userId: student.id,
      activeSeasonId: current.id,
      university: "Cairo University",
      phone: "+20 100 000 0000",
      dateOfBirth: new Date("2001-04-05T00:00:00.000Z"),
      notes: "STAFF ONLY — never sent to the subject",
    },
  });
  await db.studentProfile.create({ data: { userId: alumnus.id, university: "Ain Shams" } });

  // Past season: two sessions; the student attended one → 50% (R36).
  const pastOne = await db.session.create({
    // 23:30Z is 01:30 on the 2nd in Cairo — the dayKey must say the 2nd (X13).
    data: { seasonId: past.id, title: "Past one", startsAt: new Date("2098-03-01T23:30:00.000Z") },
    select: { id: true },
  });
  await db.session.create({
    data: { seasonId: past.id, title: "Past two", startsAt: new Date("2098-03-08T18:00:00.000Z") },
  });
  await db.attendance.create({ data: { sessionId: pastOne.id, studentUserId: student.id, status: "PRESENT" } });

  // Current season: three past sessions, four future ones.
  const now = Date.now();
  const mk = (title: string, offsetDays: number) =>
    db.session.create({
      data: { seasonId: current.id, title, startsAt: new Date(now + offsetDays * DAY) },
      select: { id: true },
    });
  const week1 = await mk("Week 1", -21);
  const week2 = await mk("Week 2", -14);
  await mk("Week 3", -7); // unmarked: the streak skips it
  const week4 = await mk("Week 4", 7);
  await mk("Week 5", 14);
  await mk("Week 6", 21);
  await mk("Week 7", 28);
  await db.attendance.createMany({
    data: [
      { sessionId: week1.id, studentUserId: student.id, status: "ABSENT" },
      { sessionId: week2.id, studentUserId: student.id, status: "PRESENT" },
      // R91: a LATE on a future-dated session still counts toward the budget.
      { sessionId: week4.id, studentUserId: student.id, status: "LATE", lateMinutes: 15 },
    ],
  });

  studentToken = await login(app, student.email);
  alumnusToken = await login(app, alumnus.email);
  leaderToken = await login(app, leader.email);
  adminToken = await login(app, admin.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

const get = (path: string, token: string) =>
  request(app).get(path).set("authorization", `Bearer ${token}`);

describe("GET /api/v1/me/season-history (spec 02 R33–R41)", () => {
  it("lists past enrollments only — not the current season, not a deleted one (R35, D2)", async () => {
    const res = await get("/api/v1/me/season-history", studentToken);
    expect(res.status).toBe(200);
    const titles = res.body.data.seasons.map((s: { title: string }) => s.title);
    expect(titles).toEqual(["Past Season"]);
    expect(res.body.data.seasons[0]).toMatchObject({
      seasonId: pastSeasonId,
      groupName: "Group A1",
      attendancePct: 50,
    });
    expect(res.body.data.seasons[0].curriculum.map((c: { title: string }) => c.title)).toEqual([
      "Past one",
      "Past two",
    ]);
  });

  it("keys each curriculum session to its org-calendar day (ruling X13)", async () => {
    const res = await get("/api/v1/me/season-history", studentToken);
    expect(res.body.data.seasons[0].curriculum[0].dayKey).toBe("2098-03-02");
  });

  it("carries attendance % and curriculum only — no submissions, feedback or notes (R34)", async () => {
    const res = await get("/api/v1/me/season-history", studentToken);
    expect(Object.keys(res.body.data.seasons[0]).sort()).toEqual(
      ["attendancePct", "curriculum", "endDate", "groupName", "seasonId", "startDate", "title"].sort(),
    );
  });

  it("shows an alumnus every enrollment, WITHDRAWN included (R33, R35)", async () => {
    const res = await get("/api/v1/me/season-history", alumnusToken);
    expect(res.status).toBe(200);
    expect(res.body.data.seasons).toHaveLength(1);
    expect(res.body.data.seasons[0]).toMatchObject({ title: "Past Season", attendancePct: 0, groupName: null });
  });

  it("refuses staff — self-service is for students (spec 02 D13)", async () => {
    const res = await get("/api/v1/me/season-history", leaderToken);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/v1/me/season-history");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/v1/me/season (v1 student/season, G21)", () => {
  it("returns the active season with server-derived progress (R29)", async () => {
    const res = await get("/api/v1/me/season", studentToken);
    expect(res.status).toBe(200);
    expect(res.body.data.season).toMatchObject({
      id: currentSeasonId,
      title: "Current Season",
      description: "The season we are in.",
      status: "ACTIVE",
      progress: { completedSessions: 3, totalSessions: 7, pct: 43 },
    });
  });

  it("resolves the group through this season's enrollment, not GroupStudent (ruling C9, R88)", async () => {
    const res = await get("/api/v1/me/season", studentToken);
    expect(res.body.data.season.group).toMatchObject({ name: "Group B1", description: "Tuesday group" });
  });

  it("shows leaders with email and peers by name only, ACTIVE members only (R89)", async () => {
    const res = await get("/api/v1/me/season", studentToken);
    const group = res.body.data.season.group;
    expect(group.leaders).toEqual([{ id: leaderId, name: "Test leader", email: expect.stringMatching(/@jpc\.test$/) }]);
    expect(group.members).toEqual([
      { id: peerId, name: "Test peer", isYou: false },
      { id: studentId, name: "Test self-student", isYou: true },
    ]);
  });

  it("lists the next three sessions, soonest first, each with its org day (R30, X13)", async () => {
    const res = await get("/api/v1/me/season", studentToken);
    const upcoming = res.body.data.season.upcoming;
    expect(upcoming.map((s: { title: string }) => s.title)).toEqual(["Week 4", "Week 5", "Week 6"]);
    expect(upcoming[0].dayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("is null for a student with no active season (R28)", async () => {
    const res = await get("/api/v1/me/season", alumnusToken);
    expect(res.status).toBe(200);
    expect(res.body.data.season).toBeNull();
  });

  it("refuses staff", async () => {
    expect((await get("/api/v1/me/season", adminToken)).status).toBe(403);
  });
});

describe("GET /api/v1/me/attendance (spec 04 §7, spec 19 D14)", () => {
  it("returns the budget with remainingPct, the streak, and past sessions newest first", async () => {
    const res = await get("/api/v1/me/attendance", studentToken);
    expect(res.status).toBe(200);
    expect(res.body.data.season).toEqual({
      id: currentSeasonId,
      title: "Current Season",
      absenceBudgetMinutes: 180,
      absenceWeightMinutes: 90,
    });
    // 1 ABSENT × 90 + 15 LATE minutes (on a FUTURE session — R91) = 105 of 180.
    expect(res.body.data.budget).toEqual({
      minutesUsed: 105,
      budgetMinutes: 180,
      budgetPct: 58,
      remainingPct: 42,
      absentCount: 1,
      lateCount: 1,
    });
    // Week 3 unmarked (skipped), Week 2 PRESENT, Week 1 ABSENT (breaks) → 1.
    expect(res.body.data.streak).toBe(1);
    const rows = res.body.data.sessions;
    expect(rows.map((r: { title: string }) => r.title)).toEqual(["Week 3", "Week 2", "Week 1"]);
    expect(rows.map((r: { status: string | null }) => r.status)).toEqual([null, "PRESENT", "ABSENT"]);
    expect(rows.map((r: { costMinutes: number | null }) => r.costMinutes)).toEqual([null, null, 90]);
    expect(rows[0].dayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("answers an alumnus (no active season) with the empty shape, not an error (R93)", async () => {
    const res = await get("/api/v1/me/attendance", alumnusToken);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ season: null, budget: null, streak: 0, sessions: [] });
  });

  it("refuses staff", async () => {
    expect((await get("/api/v1/me/attendance", leaderToken)).status).toBe(403);
  });
});
```

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern me-self-service-routes`
Expected: FAIL — every route 404s (`not_found`).

- [ ] **Step 2: Write the queries**

```ts
// apps/backend/src/lib/queries/me.ts
import { db } from "../../db/client";
import type { AttendanceStatus, SeasonStatus } from "../../generated/prisma/enums";
import type { SessionUser } from "../auth/tokens";
import { costMinutesFor, streakFrom, type AttendanceBudget } from "../attendance-budget";
import { orgDayKey } from "../org-time";
import { isAlumnus } from "../rbac";
import { computeAttendanceBudget } from "./attendance-budget";

/*
 * The student's own reads. Every function takes the SessionUser and reads
 * `user.userId` — the subject is the token's, never a parameter (spec 02 D13:
 * v1's loadSeasonHistory took any studentUserId and was safe only because
 * both call sites happened to pass their own).
 */

// ---------------------------------------------------------------------------
// Season history — v1 lib/season-history-query.ts:18-80
// ---------------------------------------------------------------------------

export interface SeasonHistoryCurriculumItem {
  sessionId: number;
  title: string;
  startsAt: Date;
  dayKey: string;
}

export interface SeasonHistoryRow {
  seasonId: number;
  title: string;
  startDate: Date;
  endDate: Date;
  groupName: string | null;
  attendancePct: number;
  curriculum: SeasonHistoryCurriculumItem[];
}

export async function loadSeasonHistory(user: SessionUser): Promise<SeasonHistoryRow[]> {
  // R35, decided from the token (Plan 11 Decision 3): a current student's
  // history excludes the season they are in; an alumnus sees everything.
  const excludeSeasonId = isAlumnus(user) ? null : user.activeSeasonId;

  // R33: one row per enrollment, enrolledAt desc, whatever its status.
  // R34: no submissions, feedback or notes are selected — ever.
  const enrollments = await db.seasonEnrollment.findMany({
    where: {
      studentUserId: user.userId,
      season: { deletedAt: null }, // spec 02 D2 (diverges from v1 R38)
      ...(excludeSeasonId !== null ? { seasonId: { not: excludeSeasonId } } : {}),
    },
    orderBy: { enrolledAt: "desc" },
    select: {
      seasonId: true,
      season: { select: { title: true, startDate: true, endDate: true } },
      group: { select: { name: true } },
    },
  });
  if (enrollments.length === 0) return []; // R41

  const seasonIds = enrollments.map((e) => e.seasonId);
  const [sessions, attended] = await Promise.all([
    db.session.findMany({
      where: { seasonId: { in: seasonIds } },
      orderBy: { startsAt: "asc" }, // R39
      select: { id: true, title: true, startsAt: true, seasonId: true },
    }),
    db.attendance.findMany({
      where: {
        studentUserId: user.userId,
        status: { in: ["PRESENT", "LATE"] },
        session: { seasonId: { in: seasonIds } },
      },
      select: { session: { select: { seasonId: true } } },
    }),
  ]);

  const curricula = new Map<number, SeasonHistoryCurriculumItem[]>();
  for (const s of sessions) {
    const list = curricula.get(s.seasonId) ?? [];
    list.push({ sessionId: s.id, title: s.title, startsAt: s.startsAt, dayKey: orgDayKey(s.startsAt) });
    curricula.set(s.seasonId, list);
  }
  const attendedBySeason = new Map<number, number>();
  for (const a of attended) {
    attendedBySeason.set(a.session.seasonId, (attendedBySeason.get(a.session.seasonId) ?? 0) + 1);
  }

  return enrollments.map((e) => {
    const curriculum = curricula.get(e.seasonId) ?? [];
    const present = attendedBySeason.get(e.seasonId) ?? 0;
    return {
      seasonId: e.seasonId,
      title: e.season.title,
      startDate: e.season.startDate,
      endDate: e.season.endDate,
      groupName: e.group?.name ?? null,
      // R36/R37: PRESENT+LATE over every session the season has now, rounded;
      // 0 with no sessions. Retroactive by design (spec 02 D14 — accepted).
      attendancePct: curriculum.length > 0 ? Math.round((present / curriculum.length) * 100) : 0,
      curriculum,
    };
  });
}

// ---------------------------------------------------------------------------
// Current season — v1 app/student/season/page.tsx:40-89
// ---------------------------------------------------------------------------

export const UPCOMING_LIMIT = 3;

export interface MySeason {
  id: number;
  code: string;
  title: string;
  description: string | null;
  status: SeasonStatus;
  startDate: Date;
  endDate: Date;
  progress: { completedSessions: number; totalSessions: number; pct: number };
  group: {
    id: number;
    name: string;
    description: string | null;
    leaders: { id: number; name: string; email: string }[];
    members: { id: number; name: string; isYou: boolean }[];
  } | null;
  upcoming: { id: number; title: string; startsAt: Date; dayKey: string; location: string | null }[];
}

export async function loadMySeason(user: SessionUser, now: Date = new Date()): Promise<MySeason | null> {
  const seasonId = user.activeSeasonId;
  if (seasonId === null) return null; // R28

  const season = await db.season.findFirst({
    // Spec 02 D2: v1 R27 showed a soft-deleted season to its students.
    where: { id: seasonId, deletedAt: null },
    select: { id: true, code: true, title: true, description: true, status: true, startDate: true, endDate: true },
  });
  if (!season) return null;

  const [enrollment, upcoming, totalSessions, completedSessions] = await Promise.all([
    // Ruling C9: the group for THIS season comes from the enrollment. v1 read
    // GroupStudent with no season filter (R31/R88) and could show last
    // season's group beside this season's progress.
    db.seasonEnrollment.findUnique({
      where: { studentUserId_seasonId: { studentUserId: user.userId, seasonId } },
      select: {
        group: {
          select: {
            id: true,
            name: true,
            description: true,
            leaders: {
              orderBy: { user: { name: "asc" } },
              select: { user: { select: { id: true, name: true, email: true } } },
            },
          },
        },
      },
    }),
    db.session.findMany({
      where: { seasonId, startsAt: { gte: now } }, // R30
      orderBy: { startsAt: "asc" },
      take: UPCOMING_LIMIT,
      select: { id: true, title: true, startsAt: true, location: true },
    }),
    db.session.count({ where: { seasonId } }),
    db.session.count({ where: { seasonId, startsAt: { lte: now } } }),
  ]);

  const group = enrollment?.group ?? null;
  // Members = ACTIVE enrollments in this group for this season — the same rule
  // groupListItemSchema.studentCount uses (C9), so the two never disagree.
  const members = group
    ? await db.seasonEnrollment.findMany({
        where: { seasonId, groupId: group.id, status: "ACTIVE", studentUser: { deletedAt: null } },
        orderBy: { studentUser: { name: "asc" } },
        select: { studentUser: { select: { id: true, name: true } } },
      })
    : [];

  return {
    ...season,
    progress: {
      completedSessions,
      totalSessions,
      pct: totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0,
    },
    group: group
      ? {
          id: group.id,
          name: group.name,
          description: group.description,
          leaders: group.leaders.map((l) => l.user),
          // R89: peers by name only — never an email.
          members: members.map((m) => ({
            id: m.studentUser.id,
            name: m.studentUser.name,
            isYou: m.studentUser.id === user.userId,
          })),
        }
      : null,
    upcoming: upcoming.map((s) => ({ ...s, dayKey: orgDayKey(s.startsAt) })),
  };
}

// ---------------------------------------------------------------------------
// Attendance — v1 app/student/attendance/page.tsx:44-72 + engagement streak
// ---------------------------------------------------------------------------

export interface MyAttendanceSessionRow {
  sessionId: number;
  title: string;
  startsAt: Date;
  dayKey: string;
  status: AttendanceStatus | null;
  checkedInAt: Date | null;
  lateMinutes: number | null;
  costMinutes: number | null;
}

export interface MyAttendance {
  season: { id: number; title: string; absenceBudgetMinutes: number; absenceWeightMinutes: number } | null;
  budget: AttendanceBudget | null;
  streak: number;
  sessions: MyAttendanceSessionRow[];
}

export async function loadMyAttendance(user: SessionUser, now: Date = new Date()): Promise<MyAttendance> {
  const none: MyAttendance = { season: null, budget: null, streak: 0, sessions: [] };
  if (user.activeSeasonId === null) return none; // R93

  const season = await db.season.findFirst({
    where: { id: user.activeSeasonId, deletedAt: null },
    select: { id: true, title: true, absenceBudgetMinutes: true, absenceWeightMinutes: true },
  });
  if (!season) return none;

  const [budget, past] = await Promise.all([
    computeAttendanceBudget(user.userId, season),
    db.session.findMany({
      where: { seasonId: season.id, startsAt: { lte: now } }, // R94
      orderBy: { startsAt: "desc" },
      select: {
        id: true,
        title: true,
        startsAt: true,
        attendance: {
          where: { studentUserId: user.userId },
          select: { status: true, checkedInAt: true, lateMinutes: true },
        },
      },
    }),
  ]);

  const sessions = past.map((s) => {
    const record = s.attendance[0] ?? null;
    const status = record?.status ?? null;
    return {
      sessionId: s.id,
      title: s.title,
      startsAt: s.startsAt,
      dayKey: orgDayKey(s.startsAt),
      status,
      checkedInAt: record?.checkedInAt ?? null,
      lateMinutes: status === "LATE" ? (record?.lateMinutes ?? null) : null,
      costMinutes: costMinutesFor(status, record?.lateMinutes ?? null, season.absenceWeightMinutes),
    };
  });

  // The streak walks the SAME past-session list (spec 09 R69) — no second
  // query, unlike v1's separate computeAttendanceStreak scan (R70).
  return { season, budget, streak: streakFrom(sessions.map((s) => s.status)), sessions };
}
```

- [ ] **Step 3: Mount the routes.** In `apps/backend/src/routes/me.ts`, add
imports:

```ts
import { loadMyAttendance, loadMySeason, loadSeasonHistory } from "../lib/queries/me";
```

and append, after Plan 9's routes:

```ts
const STUDENTS_ONLY = "This is only available to students and alumni.";

/*
 * Student self-service reads (Plan 11). requireAuth per route (ruling X5).
 * Role STUDENT covers alumni too (role stays STUDENT, graduationYear set).
 * Staff get 403, not an empty shape: a staff client calling these is a bug.
 */
meRouter.get("/season-history", requireAuth, async (req, res) => {
  const user = requireUser(req);
  if (user.role !== "STUDENT") return apiError(res, "forbidden", STUDENTS_ONLY, 403);
  return apiOk(res, { seasons: await loadSeasonHistory(user) });
});

meRouter.get("/season", requireAuth, async (req, res) => {
  const user = requireUser(req);
  if (user.role !== "STUDENT") return apiError(res, "forbidden", STUDENTS_ONLY, 403);
  return apiOk(res, { season: await loadMySeason(user) });
});

meRouter.get("/attendance", requireAuth, async (req, res) => {
  const user = requireUser(req);
  if (user.role !== "STUDENT") return apiError(res, "forbidden", STUDENTS_ONLY, 403);
  return apiOk(res, await loadMyAttendance(user));
});
```

- [ ] **Step 4: OpenAPI (same commit).** In `src/docs/openapi.ts`, add three
component schemas to `components.schemas` and three paths after
`"/api/v1/me"`:

```ts
      SeasonHistoryRow: {
        type: "object",
        additionalProperties: false,
        description: "A past enrollment — attendance % and curriculum ONLY (spec 02 R34: no submissions, feedback or notes, by design).",
        properties: {
          seasonId: { type: "integer" },
          title: { type: "string" },
          startDate: { type: "string", format: "date-time" },
          endDate: { type: "string", format: "date-time" },
          groupName: { type: ["string", "null"] },
          attendancePct: { type: "integer", minimum: 0, maximum: 100 },
          curriculum: {
            type: "array",
            items: {
              type: "object",
              properties: {
                sessionId: { type: "integer" },
                title: { type: "string" },
                startsAt: { type: "string", format: "date-time" },
                dayKey: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Org-calendar day (ruling X13)." },
              },
            },
          },
        },
      },
      MySeason: {
        type: "object",
        properties: {
          id: { type: "integer" },
          code: { type: "string" },
          title: { type: "string" },
          description: { type: ["string", "null"] },
          status: { $ref: "#/components/schemas/SeasonStatus" },
          startDate: { type: "string", format: "date-time" },
          endDate: { type: "string", format: "date-time" },
          progress: {
            type: "object",
            description: "Session-based (R29): completed = startsAt <= now.",
            properties: {
              completedSessions: { type: "integer" },
              totalSessions: { type: "integer" },
              pct: { type: "integer", minimum: 0, maximum: 100 },
            },
          },
          group: {
            type: ["object", "null"],
            description: "From this season's SeasonEnrollment (ruling C9). Leaders carry email; peers never do (R89).",
            properties: {
              id: { type: "integer" },
              name: { type: "string" },
              description: { type: ["string", "null"] },
              leaders: { type: "array", items: { type: "object", properties: { id: { type: "integer" }, name: { type: "string" }, email: { type: "string" } } } },
              members: { type: "array", items: { type: "object", properties: { id: { type: "integer" }, name: { type: "string" }, isYou: { type: "boolean" } } } },
            },
          },
          upcoming: {
            type: "array",
            maxItems: 3,
            items: {
              type: "object",
              properties: {
                id: { type: "integer" },
                title: { type: "string" },
                startsAt: { type: "string", format: "date-time" },
                dayKey: { type: "string" },
                location: { type: ["string", "null"] },
              },
            },
          },
        },
      },
      MyAttendance: {
        type: "object",
        properties: {
          season: {
            type: ["object", "null"],
            properties: {
              id: { type: "integer" },
              title: { type: "string" },
              absenceBudgetMinutes: { type: "integer" },
              absenceWeightMinutes: { type: "integer" },
            },
          },
          budget: {
            type: ["object", "null"],
            properties: {
              minutesUsed: { type: "integer" },
              budgetMinutes: { type: "integer" },
              budgetPct: { type: "integer", minimum: 0, maximum: 100 },
              remainingPct: { type: "integer", minimum: 0, maximum: 100, description: "max(0, 100 − budgetPct) — 'Absence budget left' (spec 19 D14)." },
              absentCount: { type: "integer" },
              lateCount: { type: "integer" },
            },
          },
          streak: { type: "integer", minimum: 0, description: "Consecutive attended past sessions; ABSENT breaks it, unmarked is skipped." },
          sessions: {
            type: "array",
            description: "Past sessions, newest first.",
            items: {
              type: "object",
              properties: {
                sessionId: { type: "integer" },
                title: { type: "string" },
                startsAt: { type: "string", format: "date-time" },
                dayKey: { type: "string" },
                status: { oneOf: [{ $ref: "#/components/schemas/AttendanceStatus" }, { type: "null" }] },
                checkedInAt: { type: ["string", "null"], format: "date-time" },
                lateMinutes: { type: ["integer", "null"] },
                costMinutes: { type: ["integer", "null"] },
              },
            },
          },
        },
      },
```

```ts
    "/api/v1/me/season-history": {
      get: {
        tags: ["Me"],
        summary: "The caller's past seasons (students and alumni)",
        description: "Self only. A current student's active season is excluded; an alumnus sees every enrollment. Soft-deleted seasons are hidden.",
        responses: {
          200: ok({ type: "object", properties: { seasons: { type: "array", items: { $ref: "#/components/schemas/SeasonHistoryRow" } } } }, "Past seasons, most recent enrollment first."),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
        },
      },
    },
    "/api/v1/me/season": {
      get: {
        tags: ["Me"],
        summary: "The caller's current season — progress, group, next sessions (students)",
        responses: {
          200: ok({ type: "object", properties: { season: { oneOf: [{ $ref: "#/components/schemas/MySeason" }, { type: "null" }] } } }, "Null when the student has no active season."),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
        },
      },
    },
    "/api/v1/me/attendance": {
      get: {
        tags: ["Me"],
        summary: "The caller's absence budget, streak and past-session attendance (students)",
        responses: {
          200: ok({ $ref: "#/components/schemas/MyAttendance" }, "Empty shape (season null) when there is no active season."),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
        },
      },
    },
```

- [ ] **Step 5: Run**

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern me-self-service-routes` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/backend` → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): student season history, current season and attendance reads under /me"
```

---

### Task 4: Backend — `GET/PATCH /me/profile`, one writer per column

**Files:**
- Modify: `apps/backend/src/lib/queries/me.ts` (append `loadMyProfile`)
- Modify: `apps/backend/src/routes/me.ts` (two routes)
- Modify: `apps/backend/src/routes/students.ts` (`SELF_EDITABLE`, `ADMIN_EDITABLE`)
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: `apps/backend/src/__tests__/integration/me-self-service-routes.test.ts` (append), `apps/backend/src/__tests__/integration/students-routes.test.ts` (append)

**Interfaces:**
- Consumes: `OWN_PROFILE_FIELDS`, `updateOwnProfileInputSchema` (Task 1, **value** imports via the relative path, ruling X12); `isAlumnus`.
- Produces: `loadMyProfile(userId: number): Promise<MyProfileRow | null>`; `GET /api/v1/me/profile` → `{ data: { profile: MyProfile } }` (STUDENT incl. alumni, else 403); `PATCH /api/v1/me/profile` → `{ data: { profile: MyProfile } }`. Errors: `forbidden` 403 (staff, alumni), `forbidden_field` 403 (any key outside `OWN_PROFILE_FIELDS`), `bad_request` 400, `not_found` 404. Self-edits through `PATCH /students/:id` are narrowed to the same six fields.

- [ ] **Step 1: Write the failing tests.** Append to
`me-self-service-routes.test.ts` (same file, same fixtures; it runs after the
read tests, so the student's original phone is still in place for the GET
case):

```ts
describe("GET /api/v1/me/profile (spec 06 §7)", () => {
  it("returns the student's own profile — never their staff-only notes (R23)", async () => {
    const res = await get("/api/v1/me/profile", studentToken);
    expect(res.status).toBe(200);
    expect(res.body.data.profile).toMatchObject({
      name: "Test self-student",
      university: "Cairo University",
      phone: "+20 100 000 0000",
      dateOfBirth: "2001-04-05",
      activeSeasonTitle: "Current Season",
      graduationYear: null,
    });
    expect(res.body.data.profile).not.toHaveProperty("notes");
    expect(JSON.stringify(res.body)).not.toContain("STAFF ONLY");
  });

  it("serves an alumnus their read-only record", async () => {
    const res = await get("/api/v1/me/profile", alumnusToken);
    expect(res.status).toBe(200);
    expect(res.body.data.profile).toMatchObject({ university: "Ain Shams", graduationYear: 2098 });
  });

  it("refuses staff", async () => {
    expect((await get("/api/v1/me/profile", leaderToken)).status).toBe(403);
  });
});

describe("PATCH /api/v1/me/profile (Plan 11 Decision 1)", () => {
  const patch = (body: unknown, token = studentToken) =>
    request(app).patch("/api/v1/me/profile").set("authorization", `Bearer ${token}`).send(body as object);

  it("writes only the fields sent; '' clears to null (R26); returns the fresh row", async () => {
    const res = await patch({ phone: "+20 122 222 2222", gifts: "" });
    expect(res.status).toBe(200);
    expect(res.body.data.profile).toMatchObject({
      phone: "+20 122 222 2222",
      gifts: null,
      university: "Cairo University", // untouched
    });
    const row = await db.studentProfile.findUnique({
      where: { userId: studentId },
      select: { phone: true, gifts: true, notes: true },
    });
    expect(row).toEqual({ phone: "+20 122 222 2222", gifts: null, notes: "STAFF ONLY — never sent to the subject" });
  });

  it("stores a calendar date of birth at UTC midnight and reads it back unchanged (Decision 11)", async () => {
    const res = await patch({ dateOfBirth: "2002-07-09" });
    expect(res.status).toBe(200);
    expect(res.body.data.profile.dateOfBirth).toBe("2002-07-09");
    const row = await db.studentProfile.findUnique({ where: { userId: studentId }, select: { dateOfBirth: true } });
    expect(row?.dateOfBirth?.toISOString()).toBe("2002-07-09T00:00:00.000Z");
  });

  it("400s an impossible date", async () => {
    const res = await patch({ dateOfBirth: "2002-02-30" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("refuses name, email, notes and activeSeasonId by name — loudly, not v1's silent drop (R24)", async () => {
    for (const body of [{ name: "New Name" }, { email: "x@jpc.test" }, { notes: "mine now" }, { activeSeasonId: 1 }]) {
      const res = await patch(body);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("forbidden_field");
    }
  });

  it("is read-only for an alumnus", async () => {
    const res = await patch({ phone: "+20 1" }, alumnusToken);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("refuses staff", async () => {
    expect((await patch({ phone: "+20 1" }, leaderToken)).status).toBe(403);
  });
});
```

Append to `students-routes.test.ts` (Plan 7's suite; `student1Id`,
`student1Token`, `adminToken` and `testEmail` are already in scope there):

```ts
describe("PATCH /api/v1/students/:id — one writer per column (Plan 11, spec 18 D2/D8)", () => {
  it("refuses a student's own email change with forbidden_field", async () => {
    const res = await request(app)
      .patch(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${student1Token}`)
      .send({ email: testEmail("self-email") });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden_field");
  });

  it("refuses a student's own name change here — PATCH /me owns User.name", async () => {
    const res = await request(app)
      .patch(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${student1Token}`)
      .send({ name: "Self Renamed" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden_field");
  });

  it("still lets an admin correct a student's name", async () => {
    const res = await request(app)
      .patch(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ name: "Admin Corrected" });
    expect(res.status).toBe(200);
  });
});
```

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern "me-self-service-routes|students-routes"`
Expected: the profile cases FAIL (404), and the two student self-edit cases FAIL (200).

- [ ] **Step 2: Append `loadMyProfile` to `lib/queries/me.ts`**

```ts
// ---------------------------------------------------------------------------
// Own profile — v1 app/student/profile/page.tsx, app/alumni/profile/page.tsx
// ---------------------------------------------------------------------------

export interface MyProfileRow {
  name: string;
  email: string;
  avatarPath: string | null;
  graduationYear: number | null;
  activeSeasonTitle: string | null;
  university: string | null;
  year: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  spiritualBackground: string | null;
  gifts: string | null;
}

/**
 * Deliberately NOT GET /students/:id with id = self (spec 06 §7): `notes` is
 * not in this select at all, so no future flag can leak it (R23, R71).
 */
export async function loadMyProfile(userId: number): Promise<MyProfileRow | null> {
  const row = await db.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
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
          activeSeason: { select: { title: true, deletedAt: true } },
        },
      },
    },
  });
  if (!row) return null;
  const p = row.studentProfile;
  return {
    name: row.name,
    email: row.email,
    avatarPath: row.avatarPath,
    graduationYear: row.graduationYear,
    activeSeasonTitle: p?.activeSeason && p.activeSeason.deletedAt === null ? p.activeSeason.title : null,
    university: p?.university ?? null,
    year: p?.year ?? null,
    phone: p?.phone ?? null,
    // A calendar date stored at UTC midnight (Plan 11 Decision 11).
    dateOfBirth: p?.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : null,
    spiritualBackground: p?.spiritualBackground ?? null,
    gifts: p?.gifts ?? null,
  };
}
```

- [ ] **Step 3: Add the routes to `routes/me.ts`.** Extend the existing
relative shared import (keep Plan 9's names):

```ts
import {
  OWN_PROFILE_FIELDS,
  changePasswordRequestSchema,
  updateOwnProfileInputSchema,
  updateProfileRequestSchema,
} from "../../../../packages/shared/src/index";
```

Extend the queries import to `loadMyAttendance, loadMyProfile, loadMySeason, loadSeasonHistory`,
add `import { isAlumnus } from "../lib/rbac";`, and append:

```ts
const OWN_PROFILE_KEYS: ReadonlySet<string> = new Set(OWN_PROFILE_FIELDS);

meRouter.get("/profile", requireAuth, async (req, res) => {
  const user = requireUser(req);
  if (user.role !== "STUDENT") return apiError(res, "forbidden", STUDENTS_ONLY, 403);
  const profile = await loadMyProfile(user.userId);
  if (!profile) return apiError(res, "not_found", "Profile not found.", 404);
  return apiOk(res, { profile });
});

/*
 * The student's own StudentProfile columns — and nothing else (Plan 11
 * Decision 1, spec 18 D2/D8). Name is PATCH /me; email is staff-only; notes
 * and activeSeasonId never (R23). Keys are checked RAW, before the schema,
 * so the refusal names the field instead of v1's silent drop (R24).
 */
meRouter.patch("/profile", requireAuth, async (req, res) => {
  const user = requireUser(req);
  if (user.role !== "STUDENT") return apiError(res, "forbidden", STUDENTS_ONLY, 403);
  if (isAlumnus(user)) {
    return apiError(res, "forbidden", "Alumni records are read-only — contact the JPC team to update your details.", 403);
  }
  if (typeof req.body !== "object" || req.body === null || Array.isArray(req.body)) {
    return apiError(res, "bad_request", "Invalid profile body.", 400);
  }
  for (const key of Object.keys(req.body as Record<string, unknown>)) {
    if (!OWN_PROFILE_KEYS.has(key)) {
      return apiError(res, "forbidden_field", `Field "${key}" is not editable here.`, 403);
    }
  }
  const parsed = updateOwnProfileInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", parsed.error.issues[0]?.message ?? "Invalid profile body.", 400);
  }
  if (!(await loadMyProfile(user.userId))) return apiError(res, "not_found", "Profile not found.", 404);

  const body = parsed.data;
  // Prisma reads `undefined` as "leave the column alone" — exactly PATCH.
  const data = {
    university: body.university,
    year: body.year,
    phone: body.phone,
    dateOfBirth:
      body.dateOfBirth === undefined
        ? undefined
        : body.dateOfBirth === null
          ? null
          : new Date(`${body.dateOfBirth}T00:00:00.000Z`),
    spiritualBackground: body.spiritualBackground,
    gifts: body.gifts,
  };
  // Upsert, as Plan 7 does: v1's unconditional update threw for a STUDENT
  // with no profile row (spec 06 §2).
  await db.studentProfile.upsert({
    where: { userId: user.userId },
    create: { userId: user.userId, ...data },
    update: data,
  });

  const profile = await loadMyProfile(user.userId);
  if (!profile) return apiError(res, "not_found", "Profile not found.", 404);
  return apiOk(res, { profile });
});
```

- [ ] **Step 4: Narrow Plan 7's self-edit allowlist.** In
`apps/backend/src/routes/students.ts`, replace the two allowlists and extend
their doc comment's first bullet:

```ts
/*
 * - The subject edits their own StudentProfile columns only — the same six
 *   PATCH /me/profile accepts (Plan 11 Decision 1). `name` belongs to
 *   PATCH /me and `email` is staff-only (spec 18 D2/D8: changing a login
 *   identifier without verification is an account-takeover primitive).
 */
const SELF_EDITABLE = new Set([
  "university", "year", "phone", "dateOfBirth", "spiritualBackground", "gifts",
]);
const ADMIN_EDITABLE = new Set([...SELF_EDITABLE, "name", "email", "notes"]);
```

(ADMIN keeps exactly the set it had before. SUPER is still unchecked.)

- [ ] **Step 5: OpenAPI.** Add the component and path:

```ts
      MyProfile: {
        type: "object",
        additionalProperties: false,
        description: "The caller's own profile. Never carries staff-only notes (spec 06 R23).",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          avatarPath: { type: ["string", "null"] },
          graduationYear: { type: ["integer", "null"], description: "Non-null = alumnus; the profile is then read-only." },
          activeSeasonTitle: { type: ["string", "null"] },
          university: { type: ["string", "null"] },
          year: { type: ["string", "null"] },
          phone: { type: ["string", "null"] },
          dateOfBirth: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "A calendar date." },
          spiritualBackground: { type: ["string", "null"] },
          gifts: { type: ["string", "null"] },
        },
      },
```

```ts
    "/api/v1/me/profile": {
      get: {
        tags: ["Me"],
        summary: "The caller's own student profile (students and alumni)",
        responses: {
          200: ok({ type: "object", properties: { profile: { $ref: "#/components/schemas/MyProfile" } } }, "The profile."),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
      patch: {
        tags: ["Me"],
        summary: "Edit the caller's own StudentProfile columns (students; alumni are read-only)",
        description: "PATCH: absent = untouched, '' or null = cleared. Any key outside university/year/phone/dateOfBirth/spiritualBackground/gifts is refused 403 forbidden_field — name is PATCH /me, email is staff-only.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  university: { type: ["string", "null"], maxLength: 160 },
                  year: { type: ["string", "null"], maxLength: 40 },
                  phone: { type: ["string", "null"], maxLength: 60 },
                  dateOfBirth: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                  spiritualBackground: { type: ["string", "null"], maxLength: 4000 },
                  gifts: { type: ["string", "null"], maxLength: 2000 },
                },
              },
            },
          },
        },
        responses: {
          200: ok({ type: "object", properties: { profile: { $ref: "#/components/schemas/MyProfile" } } }, "The updated profile."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
```

Also update `PATCH /api/v1/students/{id}`'s description, if Plan 7 documented
the self-edit set, to say "the subject may edit university, year, phone,
dateOfBirth, spiritualBackground and gifts only".

- [ ] **Step 6: Run**

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern "me-self-service-routes|students-routes"` → PASS (Plan 7's existing "lets the student edit their own contact fields" sends only `phone` and stays green).
Run: `pnpm turbo lint typecheck test:unit build --filter=@space/backend` → clean, then
`grep -rn 'require("@space/shared")' apps/backend/dist/` → empty (ruling X12).

- [ ] **Step 7: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): own student profile read/edit; one writer per profile column"
```

---

### Task 5: Mobile foundation — `me` query keys, self-service hooks, one initials helper

**Files:**
- Modify: `apps/mobile/src/lib/query-keys.ts` (add `me`)
- Create: `apps/mobile/src/hooks/use-self-service.ts`
- Create: `apps/mobile/src/lib/initials.ts`
- Modify: `apps/mobile/app/(app)/more.tsx` (use `initialsOf`; delete the local `initialsFor`)
- Test: `apps/mobile/src/__tests__/use-self-service.test.tsx`, `apps/mobile/src/__tests__/initials.test.ts`

**Interfaces:**
- Consumes: Task 1's schemas; `apiClient`.
- Produces (exact names; Plan 16 reuses `useMyAttendance` and the key):
  - `queryKeys.me.all`, `queryKeys.me.seasonHistory(activeSeasonId: number | null)`, `queryKeys.me.season(seasonId: number | null)`, `queryKeys.me.attendance(seasonId: number | null)`, `queryKeys.me.profile()`
  - `useSeasonHistory(activeSeasonId: number | null, enabled: boolean): UseQueryResult<SeasonHistoryRow[]>`
  - `useMySeason(seasonId: number | null): UseQueryResult<MySeason | null>`
  - `useMyAttendance(seasonId: number | null): UseQueryResult<MyAttendanceResponse>`
  - `useMyProfile(enabled: boolean): UseQueryResult<MyProfile>`
  - `useUpdateStudentProfile(): UseMutationResult<MyProfile, Error, UpdateOwnProfileInput>` (distinct from Plan 9's `useUpdateProfile`, which is `PATCH /me` name)
  - `initialsOf(name: string | null, fallback: string): string`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/mobile/src/__tests__/initials.test.ts
import { initialsOf } from "../lib/initials";

describe("initialsOf (v1 more-menu / student profile / student season)", () => {
  it("takes the first letters of the first two words, uppercased", () => {
    expect(initialsOf("Mina Adel", "?")).toBe("MA");
    expect(initialsOf("mina adel botros", "?")).toBe("MA");
    expect(initialsOf("  mina  ", "?")).toBe("M");
  });

  it("falls back when there is no usable name", () => {
    expect(initialsOf(null, "S")).toBe("S");
    expect(initialsOf("   ", "S")).toBe("S");
  });
});
```

```tsx
// apps/mobile/src/__tests__/use-self-service.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), patch: jest.fn() } }));

import { apiClient } from "../lib/api-client";
import {
  useMyAttendance,
  useMySeason,
  useSeasonHistory,
  useUpdateStudentProfile,
} from "../hooks/use-self-service";

const get = apiClient.get as jest.Mock;
const patch = apiClient.patch as jest.Mock;

/** One client per test, created OUTSIDE the wrapper so re-renders keep the cache. */
function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const attendance = {
  season: { id: 7, title: "Spring", absenceBudgetMinutes: 180, absenceWeightMinutes: 90 },
  budget: { minutesUsed: 105, budgetMinutes: 180, budgetPct: 58, remainingPct: 42, absentCount: 1, lateCount: 1 },
  streak: 1,
  sessions: [],
};

const profile = {
  name: "Mina Adel", email: "mina@jpc.test", avatarPath: null, graduationYear: null,
  activeSeasonTitle: "Spring", university: null, year: null, phone: "+20 122",
  dateOfBirth: null, spiritualBackground: null, gifts: null,
};

beforeEach(() => jest.clearAllMocks());

describe("useMyAttendance", () => {
  it("does not fetch without an active season (spec 04 R93)", () => {
    const { result } = renderHook(() => useMyAttendance(null), { wrapper: makeWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
    expect(get).not.toHaveBeenCalled();
  });

  it("fetches and parses the student's attendance", async () => {
    get.mockResolvedValue({ data: { data: attendance } });
    const { result } = renderHook(() => useMyAttendance(7), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/api/v1/me/attendance");
    expect(result.current.data?.budget?.remainingPct).toBe(42);
  });

  it("fails at the boundary on a drifted payload", async () => {
    get.mockResolvedValue({ data: { data: { ...attendance, budget: { ...attendance.budget, budgetPct: 140 } } } });
    const { result } = renderHook(() => useMyAttendance(7), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useSeasonHistory / useMySeason", () => {
  it("fetches history only when enabled", async () => {
    get.mockResolvedValue({ data: { data: { seasons: [] } } });
    const disabled = renderHook(() => useSeasonHistory(7, false), { wrapper: makeWrapper() });
    expect(disabled.result.current.fetchStatus).toBe("idle");
    expect(get).not.toHaveBeenCalled();

    const enabled = renderHook(() => useSeasonHistory(7, true), { wrapper: makeWrapper() });
    await waitFor(() => expect(enabled.result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/api/v1/me/season-history");
    expect(enabled.result.current.data).toEqual([]);
  });

  it("unwraps a null season (no active season) rather than erroring", async () => {
    get.mockResolvedValue({ data: { data: { season: null } } });
    const { result } = renderHook(() => useMySeason(7), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/api/v1/me/season");
    expect(result.current.data).toBeNull();
  });
});

describe("useUpdateStudentProfile (ruling X10 — mutations parse too)", () => {
  it("PATCHes /me/profile and returns the parsed profile", async () => {
    patch.mockResolvedValue({ data: { data: { profile } } });
    const { result } = renderHook(() => useUpdateStudentProfile(), { wrapper: makeWrapper() });
    let saved: unknown;
    await act(async () => {
      saved = await result.current.mutateAsync({ phone: "+20 122" });
    });
    expect(patch).toHaveBeenCalledWith("/api/v1/me/profile", { phone: "+20 122" });
    expect(saved).toEqual(profile);
  });

  it("rejects a response that carries staff-only notes (R23 — strict schema)", async () => {
    patch.mockResolvedValue({ data: { data: { profile: { ...profile, notes: "internal" } } } });
    const { result } = renderHook(() => useUpdateStudentProfile(), { wrapper: makeWrapper() });
    await act(async () => {
      await expect(result.current.mutateAsync({ phone: "+20 122" })).rejects.toThrow();
    });
  });
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/use-self-service.test.tsx src/__tests__/initials.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 2: Query keys.** In `apps/mobile/src/lib/query-keys.ts`, add a
sibling factory inside `queryKeys` (same spreading pattern; `null` rather than
a sentinel, as the file's header requires):

```ts
  /**
   * The caller's own resources (/api/v1/me/*). Keys that the server resolves
   * from the token's activeSeasonId carry it, so a refreshed token pointing at
   * another season never serves the old season's cache.
   */
  me: {
    all: ["me"] as const,
    seasonHistory: (activeSeasonId: number | null) =>
      [...queryKeys.me.all, "season-history", { activeSeasonId }] as const,
    season: (seasonId: number | null) => [...queryKeys.me.all, "season", { seasonId }] as const,
    attendance: (seasonId: number | null) => [...queryKeys.me.all, "attendance", { seasonId }] as const,
    profile: () => [...queryKeys.me.all, "profile"] as const,
  },
```

- [ ] **Step 3: Hooks**

```ts
// apps/mobile/src/hooks/use-self-service.ts
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  myAttendanceResponseSchema,
  myProfileResponseSchema,
  mySeasonResponseSchema,
  seasonHistoryResponseSchema,
  type MyAttendanceResponse,
  type MyProfile,
  type MySeason,
  type SeasonHistoryRow,
  type UpdateOwnProfileInput,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

/*
 * The student's own reads (Plan 11). Every endpoint resolves its subject from
 * the token — these hooks never send an id. Each is gated: the season-scoped
 * ones on a non-null season (spec 04 R93: no season, no queries), the rest on
 * the caller's role (staff get 403 from these endpoints).
 */

export function useSeasonHistory(
  activeSeasonId: number | null,
  enabled: boolean,
): UseQueryResult<SeasonHistoryRow[]> {
  return useQuery({
    queryKey: queryKeys.me.seasonHistory(activeSeasonId),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/me/season-history");
      return seasonHistoryResponseSchema.parse(res.data.data).seasons;
    },
    enabled,
  });
}

export function useMySeason(seasonId: number | null): UseQueryResult<MySeason | null> {
  return useQuery({
    queryKey: queryKeys.me.season(seasonId),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/me/season");
      return mySeasonResponseSchema.parse(res.data.data).season;
    },
    enabled: seasonId !== null,
  });
}

/** Plan 16's dashboard budget/streak tile reads this same hook and key (spec 19 §7). */
export function useMyAttendance(seasonId: number | null): UseQueryResult<MyAttendanceResponse> {
  return useQuery({
    queryKey: queryKeys.me.attendance(seasonId),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/me/attendance");
      return myAttendanceResponseSchema.parse(res.data.data);
    },
    enabled: seasonId !== null,
  });
}

export function useMyProfile(enabled: boolean): UseQueryResult<MyProfile> {
  return useQuery({
    queryKey: queryKeys.me.profile(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/me/profile");
      return myProfileResponseSchema.parse(res.data.data).profile;
    },
    enabled,
  });
}

/** PATCH /me/profile; the server's row (parsed — X10) replaces the cached one. */
export function useUpdateStudentProfile(): UseMutationResult<MyProfile, Error, UpdateOwnProfileInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateOwnProfileInput) => {
      const res = await apiClient.patch("/api/v1/me/profile", body);
      return myProfileResponseSchema.parse(res.data.data).profile;
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.me.profile(), profile);
    },
  });
}
```

- [ ] **Step 4: One initials helper**

```ts
// apps/mobile/src/lib/initials.ts
/**
 * v1's rule, used by its More menu, student profile and student season page:
 * the first letters of the first two words of the name, uppercased; `fallback`
 * when there is no usable name. One copy here instead of three.
 */
export function initialsOf(name: string | null, fallback: string): string {
  const trimmed = name?.trim();
  if (!trimmed) return fallback;
  const parts = trimmed.split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || fallback;
}
```

In `apps/mobile/app/(app)/more.tsx`, delete the local `initialsFor` function,
add `import { initialsOf } from "../../src/lib/initials";`, and change the
call to `initialsOf(user.name, user.role.charAt(0).toUpperCase())`. The
behaviour is identical, and `more-screen.test.tsx`'s "MA" case covers it.

- [ ] **Step 5: Run**

Run: `cd apps/mobile && pnpm jest src/__tests__/use-self-service.test.tsx src/__tests__/initials.test.ts src/__tests__/more-screen.test.tsx` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): self-service hooks, me query keys, one initials helper"
```

---

### Task 6: `/history` — students and alumni (G10)

**Files:**
- Modify: `apps/mobile/app/(app)/history.tsx` (replace the placeholder)
- Modify: `apps/mobile/src/__tests__/placeholder-screens.test.tsx` (delete the `history` row and its import, ruling X9)
- Test: `apps/mobile/src/__tests__/history-screen.test.tsx`

**Interfaces:**
- Consumes: `useSeasonHistory` (Task 5); `formatDate`, `formatDayKey` (Plan 4); `makeSession`.
- Produces: the `/history` screen. Plan 16's alumni "View my history" links here.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/__tests__/history-screen.test.tsx
import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import HistoryScreen from "../../app/(app)/history";

const get = apiClient.get as jest.Mock;

const row = {
  seasonId: 3,
  title: "GBV 2025",
  startDate: "2025-02-01T00:00:00.000Z",
  endDate: "2025-06-30T00:00:00.000Z",
  groupName: "Group A1",
  attendancePct: 50,
  curriculum: [
    // 23:30Z on the 1st is the 2nd in Cairo; the server says so in dayKey.
    { sessionId: 31, title: "Opening night", startsAt: "2025-03-01T23:30:00.000Z", dayKey: "2025-03-02" },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("HistoryScreen", () => {
  it("lists a student's past seasons with attendance, group and a collapsed curriculum", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    get.mockResolvedValue({ data: { data: { seasons: [row] } } });

    renderWithProviders(<HistoryScreen />);

    expect(await screen.findByText("GBV 2025")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/me/season-history");
    expect(screen.getByText("History")).toBeTruthy();
    expect(screen.getByText("50% attended · Participated")).toBeTruthy();
    expect(screen.getByText(/Group A1/)).toBeTruthy();
    expect(screen.queryByText("Opening night")).toBeNull();

    fireEvent.press(screen.getByText("Curriculum (1 session)"));

    expect(screen.getByText("Opening night")).toBeTruthy();
    // The server's org-calendar day, not the device's reading of startsAt (X13).
    expect(screen.getByText("Mar 2, 2025")).toBeTruthy();
  });

  it("titles the alumni variant and uses its empty copy", async () => {
    useSessionStore.setState(makeSession("STUDENT", { graduationYear: 2024 }));
    get.mockResolvedValue({ data: { data: { seasons: [] } } });

    renderWithProviders(<HistoryScreen />);

    expect(await screen.findByText("No past seasons")).toBeTruthy();
    expect(screen.getByText("My History")).toBeTruthy();
    expect(screen.getByText("Your completed seasons will appear here.")).toBeTruthy();
  });

  it("refuses to render anything but attendance and curriculum — a feedback field fails the parse (R34)", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    get.mockResolvedValue({ data: { data: { seasons: [{ ...row, feedback: "Great work" }] } } });

    renderWithProviders(<HistoryScreen />);

    expect(await screen.findByText("Couldn't load your history.")).toBeTruthy();
    expect(screen.queryByText("Great work")).toBeNull();
  });

  it("gives staff an explanation and never calls the student endpoint", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }));

    renderWithProviders(<HistoryScreen />);

    expect(await screen.findByText("Season history is for students and alumni.")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/history-screen.test.tsx` → FAIL (placeholder).

- [ ] **Step 2: Write the screen** — replace `apps/mobile/app/(app)/history.tsx`:

```tsx
import { useState } from "react";
import { Pressable, View } from "react-native";
import type { SeasonHistoryRow } from "@space/shared";

import { useSeasonHistory } from "../../src/hooks/use-self-service";
import { formatDate, formatDayKey } from "../../src/lib/format";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

const EDGES = ["top", "left", "right"] as const;

/**
 * /history — STUDENT (sidebar) and ALUMNI (tab). One screen for v1's two
 * pages (spec 02 §9): the only difference was whether the current season is
 * excluded, and the server decides that from the token (Plan 11 Decision 3).
 * Privacy-critical (R34): the contract carries attendance % and curriculum
 * only, and its schema is strict, so nothing else can reach this screen.
 */
function SeasonHistoryCard({ row }: { row: SeasonHistoryRow }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const count = row.curriculum.length;

  return (
    <Card style={{ marginTop: theme.spacing.sm, gap: theme.spacing.xs }}>
      <Text variant="heading">{row.title}</Text>
      <Text variant="caption" color={theme.colors.neutral[600]}>
        {`${formatDate(row.startDate)} – ${formatDate(row.endDate)}${row.groupName ? ` · ${row.groupName}` : ""}`}
      </Text>
      {/* R40: v1 badges every row "Participated"; the enrollment status is not read. */}
      <Text variant="label">{`${row.attendancePct}% attended · Participated`}</Text>
      {count > 0 ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            onPress={() => setOpen((o) => !o)}
          >
            <Text variant="label" color={theme.colors.brand.navy[900]}>
              {`Curriculum (${count} ${count === 1 ? "session" : "sessions"})`}
            </Text>
          </Pressable>
          {open
            ? row.curriculum.map((s) => (
                <View
                  key={s.sessionId}
                  style={{ flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.sm }}
                >
                  <Text variant="body" style={{ flex: 1 }}>
                    {s.title}
                  </Text>
                  <Text variant="caption" color={theme.colors.neutral[600]}>
                    {formatDayKey(s.dayKey)}
                  </Text>
                </View>
              ))
            : null}
        </>
      ) : null}
    </Card>
  );
}

export default function HistoryScreen() {
  const theme = useTheme();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const graduationYear = useSessionStore((s) => s.scopes?.graduationYear ?? null);
  const activeSeasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  const isStudent = role === "STUDENT";
  const isAlumnus = isStudent && graduationYear !== null;
  const { data, isPending, isError, refetch, isRefetching } = useSeasonHistory(activeSeasonId, isStudent);

  if (!isStudent) {
    return (
      <Screen edges={EDGES}>
        <EmptyState title="History" message="Season history is for students and alumni." />
      </Screen>
    );
  }

  return (
    <Screen edges={EDGES} scroll onRefresh={() => void refetch()} refreshing={isRefetching}>
      <Text variant="title">{isAlumnus ? "My History" : "History"}</Text>
      <Text variant="label" color={theme.colors.neutral[600]}>
        {isAlumnus ? "The seasons you journeyed through" : "Seasons you've participated in"}
      </Text>
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load your history." onRetry={() => void refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          title="No past seasons"
          message={
            isAlumnus ? "Your completed seasons will appear here." : "Once you complete a season, it'll appear here."
          }
        />
      ) : (
        data.map((row) => <SeasonHistoryCard key={row.seasonId} row={row} />)
      )}
    </Screen>
  );
}
```

(`theme.colors.brand.navy[900]` is the same token Plan 13's notification row uses.)

- [ ] **Step 3: Delete the placeholder row.** In `placeholder-screens.test.tsx`
delete the `["history", HistoryScreen, …]` row and its import. No count
changes (X9).

- [ ] **Step 4: Run**

Run: `cd apps/mobile && pnpm jest src/__tests__/history-screen.test.tsx src/__tests__/placeholder-screens.test.tsx` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): season history for students and alumni"
```

---

### Task 7: `/attendance` — budget, streak, past sessions, and a nav home (G12)

**Files:**
- Modify: `packages/shared/src/navigation.ts` (`NavIconName` + STUDENT sidebar entry)
- Modify: `packages/shared/src/__tests__/navigation.test.ts` (STUDENT sidebar pin)
- Modify: `apps/mobile/src/components/NavIcon.tsx` (glyph)
- Modify: `apps/mobile/src/lib/nav-routes.ts` (`NAV_ROUTES` row)
- Modify: `apps/mobile/src/__tests__/nav-routes.test.ts`, `apps/mobile/src/__tests__/more-screen.test.tsx`
- Create: `apps/mobile/app/(app)/attendance.tsx`
- Test: `apps/mobile/src/__tests__/attendance-screen.test.tsx`

**Interfaces:**
- Consumes: `useMyAttendance` (Task 5); `formatDayKey`, `formatSessionTime`.
- Produces: nav href `/attendance` (STUDENT sidebar only, so it appears in More; ALUMNI and staff never see it); route `attendance` (in `ALL_ROUTE_NAMES` through `ALL_NAV_HREFS`, so `DETAIL_ROUTE_NAMES` does not change); `NavIconName` `"attendance"`. Plan 16's "Absence budget left" tile links here.

- [ ] **Step 1: Write the failing tests.** In `packages/shared/src/__tests__/navigation.test.ts`,
inside the `navByRole.STUDENT` expected shape, insert after
`["/quizzes", "Quizzes", "quizzes"],` in **`sidebar`** (the tabs stay as they
are):

```ts
        ["/attendance", "Attendance", "attendance"],
```

In `apps/mobile/src/__tests__/nav-routes.test.ts`, the STUDENT expectation becomes:

```ts
    expect(moreItemsFor(navByRole.STUDENT).map((i) => i.label)).toEqual([
      "Current Season", "Attendance", "History", "Profile", "Settings",
    ]);
```

In `more-screen.test.tsx`'s "shows the student's sidebar-only destinations"
case, the label loop becomes
`["Current Season", "Attendance", "History", "Profile", "Settings"]`.

```tsx
// apps/mobile/src/__tests__/attendance-screen.test.tsx
import { screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import AttendanceScreen from "../../app/(app)/attendance";

const get = apiClient.get as jest.Mock;

const payload = {
  season: { id: 7, title: "Spring", absenceBudgetMinutes: 180, absenceWeightMinutes: 90 },
  budget: { minutesUsed: 105, budgetMinutes: 180, budgetPct: 58, remainingPct: 42, absentCount: 1, lateCount: 1 },
  streak: 1,
  sessions: [
    { sessionId: 3, title: "Week 3", startsAt: "2099-03-15T18:00:00.000Z", dayKey: "2099-03-15",
      status: "LATE", checkedInAt: "2099-03-15T18:12:00.000Z", lateMinutes: 12, costMinutes: 12 },
    { sessionId: 2, title: "Week 2", startsAt: "2099-03-08T18:00:00.000Z", dayKey: "2099-03-08",
      status: "ABSENT", checkedInAt: null, lateMinutes: null, costMinutes: 90 },
    { sessionId: 1, title: "Week 1", startsAt: "2099-03-01T18:00:00.000Z", dayKey: "2099-03-01",
      status: null, checkedInAt: null, lateMinutes: null, costMinutes: null },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("AttendanceScreen", () => {
  it("shows the server's budget, the rule in words, the streak and each past session's cost", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    get.mockResolvedValue({ data: { data: payload } });

    renderWithProviders(<AttendanceScreen />);

    expect(await screen.findByText("58% used")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/me/attendance");
    expect(screen.getByText("105 of 180 min")).toBeTruthy();
    expect(screen.getByText("Absent = 90 min · Late = actual minutes late")).toBeTruthy(); // R96
    expect(screen.getByText("Streak: 1 session")).toBeTruthy();
    expect(screen.getByText("12 min late")).toBeTruthy();
    expect(screen.getByText("−12 min from budget")).toBeTruthy();
    expect(screen.getByText("−90 min from budget")).toBeTruthy(); // R95, from costMinutes
    expect(screen.getByText("Late")).toBeTruthy();
    expect(screen.getByText("Absent")).toBeTruthy();
    expect(screen.getByText("No record")).toBeTruthy();
    expect(screen.getByText(/Mar 8, 2099/)).toBeTruthy(); // from dayKey (X13)
  });

  it("shows the empty state when no session has happened yet", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    get.mockResolvedValue({ data: { data: { ...payload, sessions: [] } } });

    renderWithProviders(<AttendanceScreen />);

    expect(await screen.findByText("No sessions yet")).toBeTruthy();
  });

  it("runs no query for a student with no active season (R93)", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: null }));

    renderWithProviders(<AttendanceScreen />);

    expect(await screen.findByText("Not enrolled")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("is not available to staff and fetches nothing", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));

    renderWithProviders(<AttendanceScreen />);

    expect(await screen.findByText("Not available")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});
```

Run: `cd packages/shared && pnpm jest src/__tests__/navigation.test.ts` → FAIL (sidebar pin).
Run: `cd apps/mobile && pnpm jest src/__tests__/attendance-screen.test.tsx src/__tests__/nav-routes.test.ts` → FAIL.

- [ ] **Step 2: Nav entry.** In `packages/shared/src/navigation.ts`:
add `| "attendance"` to `NavIconName` (after `"assignments"`), and in
`STUDENT.sidebar` insert after the `/quizzes` entry:

```ts
    // Spec 04 D14: v1 reached /student/attendance only from the dashboard's
    // budget tile; the budget it explains must have a home of its own. STUDENT
    // sidebar only — it surfaces in More. Not ALUMNI (no active season).
    { href: "/attendance", label: "Attendance", icon: "attendance" },
```

`STUDENT.tabs` is unchanged (v1's five slots; the pin test freezes them).
In `apps/mobile/src/components/NavIcon.tsx`'s `GLYPHS` add
`attendance: "checkmark-done-circle",` (the `Record<NavIconName, …>` type makes
this a compile error until added). In `apps/mobile/src/lib/nav-routes.ts`'s
`NAV_ROUTES` add `"/attendance": "/attendance",` (typecheck fails until Step 3's
route file exists — expected).

- [ ] **Step 3: Write the screen**

```tsx
// apps/mobile/app/(app)/attendance.tsx
import type { ReactNode } from "react";
import { View } from "react-native";
import type { MyAttendanceSession } from "@space/shared";

import { useMyAttendance } from "../../src/hooks/use-self-service";
import { formatDayKey, formatSessionTime } from "../../src/lib/format";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

const EDGES = ["top", "left", "right"] as const;

function statusLabel(status: MyAttendanceSession["status"]): string {
  if (status === "PRESENT") return "Present";
  if (status === "LATE") return "Late";
  if (status === "ABSENT") return "Absent";
  return "No record";
}

/** One past session. Cost and lateness are the server's (R95, C4) — nothing is computed here. */
function SessionRow({ row }: { row: MyAttendanceSession }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        borderTopWidth: theme.borderWidths.thin,
        borderTopColor: theme.colors.neutral[100],
      }}
    >
      <View style={{ flex: 1 }}>
        <Text variant="body">{row.title}</Text>
        <Text variant="caption" color={theme.colors.neutral[600]}>
          {`${formatDayKey(row.dayKey)} · ${formatSessionTime(row.startsAt)}`}
        </Text>
        {row.lateMinutes !== null && row.lateMinutes > 0 ? (
          <Text variant="caption" color={theme.colors.warning[700]}>{`${row.lateMinutes} min late`}</Text>
        ) : null}
        {row.costMinutes !== null && row.costMinutes > 0 ? (
          <Text variant="caption" color={theme.colors.error[600]}>{`−${row.costMinutes} min from budget`}</Text>
        ) : null}
      </View>
      <Text variant="label">{statusLabel(row.status)}</Text>
    </View>
  );
}

/**
 * /attendance — v1 /student/attendance (spec 04 R93–R96). The budget, the
 * streak and every per-session cost come from GET /me/attendance, computed
 * once in lib/attendance-budget.ts (C4); Plan 16's dashboard tile reads the
 * same query key, so the two can never disagree.
 */
export default function AttendanceScreen() {
  const theme = useTheme();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const activeSeasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  const isStudent = role === "STUDENT";
  const seasonId = isStudent ? activeSeasonId : null;
  const { data, isPending, isError, refetch, isRefetching } = useMyAttendance(seasonId);

  const notEnrolled = <EmptyState title="Not enrolled" message="Enroll in a season to track attendance." />;
  let body: ReactNode;
  if (!isStudent) {
    body = <EmptyState title="Not available" message="Attendance tracking is for students." />;
  } else if (seasonId === null) {
    body = notEnrolled;
  } else if (isPending) {
    body = <LoadingState />;
  } else if (isError) {
    body = <ErrorState message="Couldn't load your attendance." onRetry={() => void refetch()} />;
  } else if (data.season === null) {
    body = notEnrolled;
  } else {
    const { budget, season, streak, sessions } = data;
    body = (
      <>
        <Card style={{ gap: theme.spacing.xs }}>
          <Text variant="caption" color={theme.colors.neutral[600]}>
            Absence budget
          </Text>
          <Text
            variant="title"
            color={budget !== null && budget.budgetPct >= 100 ? theme.colors.error[600] : undefined}
          >
            {budget !== null ? `${budget.budgetPct}% used` : "—"}
          </Text>
          {budget !== null ? (
            <Text variant="body">{`${budget.minutesUsed} of ${budget.budgetMinutes} min`}</Text>
          ) : null}
          <Text variant="caption" color={theme.colors.neutral[600]}>
            {`Absent = ${season.absenceWeightMinutes} min · Late = actual minutes late`}
          </Text>
          <Text variant="label">{`Streak: ${streak} ${streak === 1 ? "session" : "sessions"}`}</Text>
        </Card>
        {sessions.length === 0 ? (
          <EmptyState title="No sessions yet" message="Past sessions will appear here." />
        ) : (
          <Card style={{ marginTop: theme.spacing.md }}>
            <Text variant="heading">Session history</Text>
            {sessions.map((row) => (
              <SessionRow key={row.sessionId} row={row} />
            ))}
          </Card>
        )}
      </>
    );
  }

  return (
    <Screen
      edges={EDGES}
      scroll
      onRefresh={() => {
        if (seasonId !== null) void refetch();
      }}
      refreshing={isRefetching}
    >
      <Text variant="title">Attendance</Text>
      {body}
    </Screen>
  );
}
```

Run `pnpm turbo routes:generate --filter=@space/mobile`.

- [ ] **Step 4: Run**

Run: `cd packages/shared && pnpm jest src/__tests__/navigation.test.ts` → PASS.
Run: `cd apps/mobile && pnpm jest src/__tests__/attendance-screen.test.tsx src/__tests__/nav-routes.test.ts src/__tests__/more-screen.test.tsx src/__tests__/app-layout.test.tsx src/__tests__/role-tabs.test.tsx` → PASS
(the layout and role-tabs tests now see `attendance` through `ALL_NAV_HREFS`
and find its file on disk; no count is edited).
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile --filter=@space/shared` → clean.

- [ ] **Step 5: Commit**

```bash
git add packages/shared apps/mobile && git commit -m "feat(mobile): student attendance screen with budget, streak and a nav home"
```

---

### Task 8: `/profile` — student editable, alumni read-only, mentor account card (G11)

**Files:**
- Modify: `apps/mobile/app/(app)/profile.tsx` (replace the placeholder)
- Modify: `apps/mobile/src/__tests__/placeholder-screens.test.tsx` (delete the `profile` row and import)
- Test: `apps/mobile/src/__tests__/profile-screen.test.tsx`

**Interfaces:**
- Consumes: `useMyProfile`, `useUpdateStudentProfile`, `useMyAttendance`, `initialsOf` (Task 5); `OWN_PROFILE_FIELDS`, `updateOwnProfileInputSchema` (Task 1); `apiErrorMessage` (Plan 4); `useLogout`; the `/settings` route (Plan 9).
- Produces: the `/profile` screen: STUDENT branch (form plus a stats strip with "Absence budget left" and "Streak"), ALUMNI read-only card, and an account card for every other role (Decision 2).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/__tests__/profile-screen.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), patch: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
const mockLogout = jest.fn(() => Promise.resolve());
jest.mock("../hooks/use-session", () => ({ useLogout: () => mockLogout }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import ProfileScreen from "../../app/(app)/profile";

const get = apiClient.get as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const profile = {
  name: "Mina Adel",
  email: "mina@jpc.test",
  avatarPath: null,
  graduationYear: null,
  activeSeasonTitle: "GBV 2026",
  university: "Cairo University",
  year: null,
  phone: "+20 100",
  dateOfBirth: "2001-04-05",
  spiritualBackground: null,
  gifts: null,
};

const attendance = {
  season: { id: 7, title: "GBV 2026", absenceBudgetMinutes: 180, absenceWeightMinutes: 90 },
  budget: { minutesUsed: 105, budgetMinutes: 180, budgetPct: 58, remainingPct: 42, absentCount: 1, lateCount: 1 },
  streak: 3,
  sessions: [],
};

function routeGets(p: typeof profile = profile) {
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/me/profile") return Promise.resolve({ data: { data: { profile: p } } });
    if (url === "/api/v1/me/attendance") return Promise.resolve({ data: { data: attendance } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("ProfileScreen — STUDENT", () => {
  beforeEach(() => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { name: "Mina Adel" }));
    routeGets();
  });

  it("shows identity, the correctly labelled budget figure, the streak, and the editable fields", async () => {
    renderWithProviders(<ProfileScreen />);

    expect(await screen.findByText("Mina Adel")).toBeTruthy();
    expect(screen.getByText("MA")).toBeTruthy(); // initials — no avatar read path in v2
    expect(screen.getByText("mina@jpc.test")).toBeTruthy();
    // Spec 19 D14 / spec 09 R68: the server's remainingPct, under a label that says what it is.
    expect(await screen.findByText("Absence budget left")).toBeTruthy();
    expect(screen.getByText("42%")).toBeTruthy();
    expect(screen.getByText("Streak")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByLabelText("University").props.value).toBe("Cairo University");
    expect(screen.getByLabelText("Date of birth (YYYY-MM-DD)").props.value).toBe("2001-04-05");
    // Decision 1: no name or email field on this screen.
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.queryByLabelText("Email")).toBeNull();
  });

  it("saves through PATCH /me/profile with the six fields only", async () => {
    patch.mockResolvedValue({ data: { data: { profile: { ...profile, phone: "+20 122" } } } });
    renderWithProviders(<ProfileScreen />);

    fireEvent.changeText(await screen.findByLabelText("Phone"), "+20 122");
    fireEvent.press(screen.getByText("Save profile"));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/me/profile", {
        university: "Cairo University",
        year: "",
        phone: "+20 122",
        dateOfBirth: "2001-04-05",
        spiritualBackground: "",
        gifts: "",
      }),
    );
    expect(await screen.findByText("Profile saved.")).toBeTruthy();
  });

  it("validates with the server's schema before sending — an impossible date never leaves", async () => {
    renderWithProviders(<ProfileScreen />);

    fireEvent.changeText(await screen.findByLabelText("Date of birth (YYYY-MM-DD)"), "2001-02-30");
    fireEvent.press(screen.getByText("Save profile"));

    await waitFor(() =>
      expect(screen.getByLabelText("Date of birth (YYYY-MM-DD)").props.accessibilityHint).toBe("Not a real calendar day."),
    );
    expect(patch).not.toHaveBeenCalled();
  });

  it("treats a response carrying notes as a failed save (X10, R23)", async () => {
    patch.mockResolvedValue({ data: { data: { profile: { ...profile, notes: "internal" } } } });
    renderWithProviders(<ProfileScreen />);

    fireEvent.press(await screen.findByText("Save profile"));

    expect(await screen.findByText("Couldn't save your profile.")).toBeTruthy();
  });

  it("sends name changes to Settings (PATCH /me owns User.name)", async () => {
    renderWithProviders(<ProfileScreen />);

    fireEvent.press(await screen.findByText("Open settings"));

    expect(mockPush).toHaveBeenCalledWith("/settings");
  });

  it("shows no stats and runs no attendance query without an active season", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: null }, { name: "Mina Adel" }));
    renderWithProviders(<ProfileScreen />);

    expect(await screen.findByText("Mina Adel")).toBeTruthy();
    expect(screen.queryByText("Absence budget left")).toBeNull();
    expect(get).not.toHaveBeenCalledWith("/api/v1/me/attendance");
  });
});

describe("ProfileScreen — ALUMNI", () => {
  it("is a read-only record with no form and no attendance query", async () => {
    useSessionStore.setState(makeSession("STUDENT", { graduationYear: 2024 }));
    routeGets({ ...profile, graduationYear: 2024, activeSeasonTitle: null });

    renderWithProviders(<ProfileScreen />);

    expect(await screen.findByText("Alumnus · Class of 2024")).toBeTruthy();
    expect(screen.getByText("Cairo University")).toBeTruthy();
    expect(screen.getByText("To update your details, please contact the JPC team.")).toBeTruthy();
    expect(screen.queryByText("Save profile")).toBeNull();
    expect(get).not.toHaveBeenCalledWith("/api/v1/me/attendance");
  });
});

describe("ProfileScreen — MENTOR (Decision 2)", () => {
  it("is the account card with Settings and Sign out, and calls no student endpoint", async () => {
    useSessionStore.setState(makeSession("MENTOR", {}, { name: "Maged Mentor", email: "maged@jpc.test" }));

    renderWithProviders(<ProfileScreen />);

    expect(screen.getByText("Maged Mentor")).toBeTruthy();
    expect(screen.getByText("MM")).toBeTruthy();
    expect(screen.getByText("MENTOR")).toBeTruthy();
    fireEvent.press(screen.getByText("Settings"));
    expect(mockPush).toHaveBeenCalledWith("/settings");
    fireEvent.press(screen.getByText("Sign out"));
    await waitFor(() => expect(mockLogout).toHaveBeenCalledTimes(1));
    expect(get).not.toHaveBeenCalled();
  });
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/profile-screen.test.tsx` → FAIL (placeholder).

- [ ] **Step 2: Write the screen** — replace `apps/mobile/app/(app)/profile.tsx`:

```tsx
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import {
  OWN_PROFILE_FIELDS,
  updateOwnProfileInputSchema,
  type MyProfile,
  type OwnProfileField,
  type UpdateOwnProfileInput,
} from "@space/shared";

import { useLogout } from "../../src/hooks/use-session";
import { useMyAttendance, useMyProfile, useUpdateStudentProfile } from "../../src/hooks/use-self-service";
import { apiErrorMessage } from "../../src/lib/api-error";
import { initialsOf } from "../../src/lib/initials";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Button, Card, ErrorState, Input, LoadingState, Screen, Text } from "../../src/ui";

const EDGES = ["top", "left", "right"] as const;

const FIELD_LABELS: Record<OwnProfileField, string> = {
  university: "University",
  year: "Year",
  phone: "Phone",
  dateOfBirth: "Date of birth (YYYY-MM-DD)",
  spiritualBackground: "Spiritual background",
  gifts: "Gifts",
};
const MULTILINE: ReadonlySet<OwnProfileField> = new Set(["spiritualBackground", "gifts"]);

type FormValues = Record<OwnProfileField, string>;

function toFormValues(p: MyProfile): FormValues {
  return {
    university: p.university ?? "",
    year: p.year ?? "",
    phone: p.phone ?? "",
    dateOfBirth: p.dateOfBirth ?? "",
    spiritualBackground: p.spiritualBackground ?? "",
    gifts: p.gifts ?? "",
  };
}

function isOwnProfileField(key: string): key is OwnProfileField {
  return OWN_PROFILE_FIELDS.some((field) => field === key);
}

function IdentityCard({ name, email, badge }: { name: string; email: string; badge: string }) {
  const theme = useTheme();
  return (
    <Card style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: theme.radii.full,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.neutral[100],
        }}
      >
        {/* Avatar images are deferred with uploads (CLAUDE.md); v2 has no avatar read path. */}
        <Text variant="heading">{initialsOf(name, email.charAt(0).toUpperCase() || "?")}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="heading">{name}</Text>
        <Text variant="caption" color={theme.colors.neutral[600]}>
          {email}
        </Text>
        <Text variant="label">{badge}</Text>
      </View>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ flex: 1, alignItems: "center" }}>
      <Text variant="title">{value}</Text>
      <Text variant="caption">{label}</Text>
    </Card>
  );
}

function ProfileForm({ profile }: { profile: MyProfile }) {
  const theme = useTheme();
  const update = useUpdateStudentProfile();
  const [values, setValues] = useState<FormValues>(() => toFormValues(profile));
  const [errors, setErrors] = useState<Partial<Record<OwnProfileField, string>>>({});
  const [message, setMessage] = useState<string | null>(null);

  const save = () => {
    setMessage(null);
    const body: UpdateOwnProfileInput = values;
    // The SAME schema the server runs — v1's client and server copies had
    // drifted (spec 06 R21); here they cannot.
    const parsed = updateOwnProfileInputSchema.safeParse(body);
    if (!parsed.success) {
      const next: Partial<Record<OwnProfileField, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && isOwnProfileField(key) && next[key] === undefined) {
          next[key] = issue.message;
        }
      }
      setErrors(next);
      return;
    }
    setErrors({});
    update.mutate(body, {
      onSuccess: () => setMessage("Profile saved."),
      onError: (err) => setMessage(apiErrorMessage(err, "Couldn't save your profile.")),
    });
  };

  return (
    <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
      <Text variant="heading">Your details</Text>
      {OWN_PROFILE_FIELDS.map((field) => (
        <Input
          key={field}
          label={FIELD_LABELS[field]}
          value={values[field]}
          onChangeText={(text) => setValues((v) => ({ ...v, [field]: text }))}
          error={errors[field]}
          multiline={MULTILINE.has(field)}
          autoCapitalize={field === "dateOfBirth" ? "none" : "sentences"}
          keyboardType={field === "phone" ? "phone-pad" : "default"}
        />
      ))}
      {message ? (
        <Text variant="label" accessibilityLiveRegion="polite">
          {message}
        </Text>
      ) : null}
      <Button title="Save profile" onPress={save} loading={update.isPending} />
    </Card>
  );
}

/** v1 /student/profile — the six own columns editable, nothing else (Decision 1). */
function StudentProfile() {
  const theme = useTheme();
  const router = useRouter();
  const activeSeasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  const profile = useMyProfile(true);
  const attendance = useMyAttendance(activeSeasonId);

  if (profile.isPending) {
    return (
      <Screen edges={EDGES}>
        <LoadingState />
      </Screen>
    );
  }
  if (profile.isError) {
    return (
      <Screen edges={EDGES}>
        <ErrorState message="Couldn't load your profile." onRetry={() => void profile.refetch()} />
      </Screen>
    );
  }

  const p = profile.data;
  const budget = attendance.data?.budget ?? null;

  return (
    <Screen
      edges={EDGES}
      scroll
      onRefresh={() => {
        void profile.refetch();
        if (activeSeasonId !== null) void attendance.refetch();
      }}
      refreshing={profile.isRefetching}
    >
      <IdentityCard name={p.name} email={p.email} badge="Student" />
      {budget !== null ? (
        <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
          {/* v1 labelled this "Attendance" (spec 09 R68); it is the budget LEFT (spec 19 D14). */}
          <Stat label="Absence budget left" value={`${budget.remainingPct}%`} />
          <Stat label="Streak" value={String(attendance.data?.streak ?? 0)} />
        </View>
      ) : null}
      <ProfileForm profile={p} />
      <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
        <Text variant="heading">Name and email</Text>
        <Text variant="body" color={theme.colors.neutral[600]}>
          Change your name in Settings. To change your email, contact the JPC team.
        </Text>
        <Button title="Open settings" variant="secondary" onPress={() => router.push("/settings")} />
      </Card>
    </Screen>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="caption" color={theme.colors.neutral[600]}>
        {label}
      </Text>
      <Text variant="body">{value ?? "—"}</Text>
    </View>
  );
}

/** v1 /alumni/profile — read-only (app/alumni/profile/page.tsx:31-46). */
function AlumniProfile() {
  const theme = useTheme();
  const profile = useMyProfile(true);

  if (profile.isPending) {
    return (
      <Screen edges={EDGES}>
        <LoadingState />
      </Screen>
    );
  }
  if (profile.isError) {
    return (
      <Screen edges={EDGES}>
        <ErrorState message="Couldn't load your profile." onRetry={() => void profile.refetch()} />
      </Screen>
    );
  }

  const p = profile.data;
  return (
    <Screen edges={EDGES} scroll onRefresh={() => void profile.refetch()} refreshing={profile.isRefetching}>
      <Text variant="title">Profile</Text>
      <Text variant="label" color={theme.colors.neutral[600]}>
        Your alumni record
      </Text>
      <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.md }}>
        <Field label="Name" value={p.name} />
        <Field label="Email" value={p.email} />
        <Field label="Status" value={p.graduationYear !== null ? `Alumnus · Class of ${p.graduationYear}` : null} />
        <Field label="University" value={p.university} />
      </Card>
      <Text variant="caption" color={theme.colors.neutral[600]} style={{ marginTop: theme.spacing.md }}>
        To update your details, please contact the JPC team.
      </Text>
    </Screen>
  );
}

/**
 * Every non-student role (Decision 2). MENTOR has Profile as a TAB but no More
 * tab, so this card is their only route to Settings and to signing out on a
 * phone (spec 18 R9, R11 — v1's /mentor/profile never existed). Reads only the
 * session store: no student endpoint is called.
 */
function AccountProfile() {
  const theme = useTheme();
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const logout = useLogout();

  return (
    <Screen edges={EDGES} scroll>
      <Text variant="title">Profile</Text>
      {user ? <IdentityCard name={user.name} email={user.email} badge={user.role} /> : null}
      <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
        <Button title="Settings" onPress={() => router.push("/settings")} />
        <Button title="Sign out" variant="secondary" onPress={() => void logout()} />
      </View>
    </Screen>
  );
}

export default function ProfileScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const graduationYear = useSessionStore((s) => s.scopes?.graduationYear ?? null);
  // Three components, not one with branches: each calls different hooks, and
  // a role change remounts cleanly instead of reordering hooks.
  if (role === "STUDENT") return graduationYear !== null ? <AlumniProfile /> : <StudentProfile />;
  return <AccountProfile />;
}
```

- [ ] **Step 3: Delete the placeholder row.** In `placeholder-screens.test.tsx`
delete the `["profile", ProfileScreen, …]` row and its import.

- [ ] **Step 4: Run**

Run: `cd apps/mobile && pnpm jest src/__tests__/profile-screen.test.tsx src/__tests__/placeholder-screens.test.tsx` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): profile — student self-edit, alumni record, account card for mentors"
```

---

### Task 9: `/season` — the student branch (G21)

**Files:**
- Create: `apps/mobile/src/components/season/StudentSeason.tsx`
- Modify: `apps/mobile/app/(app)/season.tsx` (Plan 4's screen: dispatch by role)
- Modify: `apps/mobile/src/__tests__/season-screens.test.tsx` (delete Plan 4's two STUDENT cases, which this task supersedes)
- Test: `apps/mobile/src/__tests__/student-season.test.tsx`

**Interfaces:**
- Consumes: `useMySeason`, `initialsOf` (Task 5); `formatDate`, `formatDayKey`, `formatSessionTime`; the `/session/[id]` and `/calendar` routes (Plan 4).
- Produces: `StudentSeason` component. `season.tsx`'s staff body becomes the module-private `StaffSeason`, and its behaviour does not change.

- [ ] **Step 1: Write the failing test.** First delete, from Plan 4's
`season-screens.test.tsx`, the two cases `"renders for a STUDENT from the pinned season, read-only, without the seasons list (G21)"`
and `"shows a student with no season an empty state, not a spinner"`. They
asserted the interim `GET /seasons/:id` read, which this task replaces. If
that leaves `studentSession` unused, delete it as well.

```tsx
// apps/mobile/src/__tests__/student-season.test.tsx
import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import SeasonScreen from "../../app/(app)/season";

const get = apiClient.get as jest.Mock;

const mySeason = {
  id: 7,
  code: "gbv-2026",
  title: "GBV 2026",
  description: "The spring season.",
  status: "ACTIVE" as const,
  startDate: "2026-02-01T00:00:00.000Z",
  endDate: "2026-06-30T00:00:00.000Z",
  progress: { completedSessions: 3, totalSessions: 7, pct: 43 },
  group: {
    id: 4,
    name: "Group B1",
    description: "Tuesday group",
    leaders: [{ id: 5, name: "Lina Leader", email: "lina@jpc.test" }],
    members: [
      { id: 6, name: "Peer Person", isYou: false },
      { id: 9, name: "Test student", isYou: true },
    ],
  },
  upcoming: [
    { id: 41, title: "Week 4", startsAt: "2099-03-22T18:00:00.000Z", dayKey: "2099-03-22", location: "Hall B" },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("SeasonScreen — STUDENT branch (v1 student/season)", () => {
  it("renders the season, server-derived progress, the group with leaders, and the next sessions", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    get.mockResolvedValue({ data: { data: { season: mySeason } } });

    renderWithProviders(<SeasonScreen />);

    expect(await screen.findByText("GBV 2026")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/me/season");
    // Neither the staff detail read nor the seasons list (spec 02 §5 over-fetch).
    expect(get).not.toHaveBeenCalledWith("/api/v1/seasons/7");
    expect(get).not.toHaveBeenCalledWith("/api/v1/seasons");
    expect(screen.getByText("Session 3 of 7")).toBeTruthy(); // R29, not "Week N of M"
    expect(screen.getByText("4 to go")).toBeTruthy();
    expect(screen.getByText("Your group")).toBeTruthy();
    expect(screen.getByText("Group B1")).toBeTruthy();
    expect(screen.getByText("Leader")).toBeTruthy();
    expect(screen.getByText("Lina Leader")).toBeTruthy();
    expect(screen.getByText("lina@jpc.test")).toBeTruthy(); // R89: leaders' emails, not peers'
    expect(screen.getByText("Members (2)")).toBeTruthy();
    expect(screen.getByText("Peer Person")).toBeTruthy();
    expect(screen.getByText("You")).toBeTruthy();
    expect(screen.getByText("The spring season.")).toBeTruthy();
    expect(screen.getByText("Week 4")).toBeTruthy();
    expect(screen.queryByText("Save changes")).toBeNull(); // no staff edit
  });

  it("opens an upcoming session and the calendar", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    get.mockResolvedValue({ data: { data: { season: mySeason } } });

    renderWithProviders(<SeasonScreen />);

    fireEvent.press(await screen.findByText("Week 4"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]", params: { id: "41" } });
    fireEvent.press(screen.getByText("See calendar"));
    expect(mockPush).toHaveBeenCalledWith("/calendar");
  });

  it("omits the group card without a group and says when nothing is upcoming", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    get.mockResolvedValue({ data: { data: { season: { ...mySeason, group: null, upcoming: [] } } } });

    renderWithProviders(<SeasonScreen />);

    expect(await screen.findByText("No upcoming sessions.")).toBeTruthy();
    expect(screen.queryByText("Your group")).toBeNull();
  });

  it("shows the no-season state without a request when the student has no active season (R28)", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: null }));

    renderWithProviders(<SeasonScreen />);

    expect(await screen.findByText("No active season")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("shows the same state when the server answers null (deleted season — spec 02 D2)", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    get.mockResolvedValue({ data: { data: { season: null } } });

    renderWithProviders(<SeasonScreen />);

    expect(await screen.findByText("No active season")).toBeTruthy();
  });
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/student-season.test.tsx` → FAIL.

- [ ] **Step 2: Write the component**

```tsx
// apps/mobile/src/components/season/StudentSeason.tsx
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import type { MySeason } from "@space/shared";

import { useMySeason } from "../../hooks/use-self-service";
import { formatDate, formatDayKey, formatSessionTime } from "../../lib/format";
import { initialsOf } from "../../lib/initials";
import { useSessionStore } from "../../store/session";
import { useTheme } from "../../theme";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../ui";

const EDGES = ["top", "left", "right"] as const;

function GroupCard({ group }: { group: NonNullable<MySeason["group"]> }) {
  const theme = useTheme();
  return (
    <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
      <Text variant="caption" color={theme.colors.neutral[600]}>
        Your group
      </Text>
      <Text variant="heading">{group.name}</Text>
      {group.description ? (
        <Text variant="body" color={theme.colors.neutral[600]}>
          {group.description}
        </Text>
      ) : null}
      <Text variant="label">{group.leaders.length === 1 ? "Leader" : "Leaders"}</Text>
      {group.leaders.length === 0 ? (
        <Text variant="body" color={theme.colors.neutral[600]}>
          No leaders assigned yet.
        </Text>
      ) : (
        group.leaders.map((leader) => (
          <View key={leader.id} style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: theme.radii.full,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.colors.neutral[100],
              }}
            >
              <Text variant="label">{initialsOf(leader.name, leader.email.charAt(0).toUpperCase() || "?")}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="body">{leader.name}</Text>
              <Text variant="caption" color={theme.colors.neutral[600]}>
                {leader.email}
              </Text>
            </View>
          </View>
        ))
      )}
      <Text variant="label">{`Members (${group.members.length})`}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs }}>
        {group.members.map((member) => (
          <View
            key={member.id}
            style={{
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: theme.spacing.xs,
              borderRadius: theme.radii.full,
              backgroundColor: member.isYou ? theme.colors.brand.teal[100] : theme.colors.neutral[100],
            }}
          >
            <Text variant="caption">{member.isYou ? "You" : member.name}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function UpcomingCard({ upcoming }: { upcoming: MySeason["upcoming"] }) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text variant="heading">Upcoming sessions</Text>
        <Button title="See calendar" variant="ghost" onPress={() => router.push("/calendar")} />
      </View>
      {upcoming.length === 0 ? (
        <Text variant="body" color={theme.colors.neutral[600]}>
          No upcoming sessions.
        </Text>
      ) : (
        upcoming.map((s) => (
          <Pressable
            key={s.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/session/[id]", params: { id: String(s.id) } })}
          >
            <Text variant="body">{s.title}</Text>
            <Text variant="caption" color={theme.colors.neutral[600]}>
              {`${formatDayKey(s.dayKey)} · ${formatSessionTime(s.startsAt)}${s.location ? ` · ${s.location}` : ""}`}
            </Text>
          </Pressable>
        ))
      )}
    </Card>
  );
}

/**
 * The student's `/season` (v1 app/student/season/page.tsx:40-281, G21). One
 * read, GET /me/season (Plan 11 Decision 5): progress and "upcoming" are
 * server-derived (C4) and the group comes from this season's enrollment (C9).
 */
export function StudentSeason() {
  const theme = useTheme();
  const seasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  const { data, isPending, isError, refetch, isRefetching } = useMySeason(seasonId);

  const noSeason = <EmptyState title="No active season" message="An admin will enroll you when you're ready." />;
  let body: ReactNode;
  if (seasonId === null) body = noSeason;
  else if (isPending) body = <LoadingState />;
  else if (isError) body = <ErrorState message="Couldn't load your season." onRetry={() => void refetch()} />;
  else if (data === null) body = noSeason;
  else {
    const { completedSessions, totalSessions, pct } = data.progress;
    body = (
      <>
        <Card style={{ gap: theme.spacing.xs }}>
          <Text variant="caption" color={theme.colors.neutral[600]}>
            Current season
          </Text>
          <Text variant="title">{data.title}</Text>
          <Text variant="label" color={theme.colors.neutral[600]}>
            {`${formatDate(data.startDate)} – ${formatDate(data.endDate)}`}
          </Text>
          <Text variant="label">{data.group ? `${data.status} · ${data.group.name}` : data.status}</Text>
          {totalSessions > 0 ? (
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text variant="label">{`Session ${completedSessions} of ${totalSessions}`}</Text>
              <Text variant="caption" color={theme.colors.neutral[600]}>
                {pct >= 100 ? "Complete" : `${totalSessions - completedSessions} to go`}
              </Text>
            </View>
          ) : null}
        </Card>
        {data.group ? <GroupCard group={data.group} /> : null}
        {data.description ? (
          <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.xs }}>
            <Text variant="caption" color={theme.colors.neutral[600]}>
              About this season
            </Text>
            <Text variant="body">{data.description}</Text>
          </Card>
        ) : null}
        <UpcomingCard upcoming={data.upcoming} />
      </>
    );
  }

  return (
    <Screen
      edges={EDGES}
      scroll
      onRefresh={() => {
        if (seasonId !== null) void refetch();
      }}
      refreshing={isRefetching}
    >
      {body}
    </Screen>
  );
}
```

(`theme.colors.brand.teal[100]` comes from the same brand ramp as `navy`.
`tokens.ts` defines `ADMIN` as `brand.teal[500]`.)

- [ ] **Step 3: Dispatch in `season.tsx`.** In `apps/mobile/app/(app)/season.tsx`:
rename `export default function SeasonScreen()` to `function StaffSeason()`
and leave its body unchanged. Replace the file's header comment sentence "The richer student content (upcoming sessions, group card with leaders) is Plan 11"
with "The student branch is `StudentSeason` (Plan 11)". Add
`import { StudentSeason } from "../../src/components/season/StudentSeason";`
and append:

```tsx
export default function SeasonScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  // Two components rather than one with branches: the student half reads
  // GET /me/season and the staff half reads useCurrentSeasonId +
  // GET /seasons/:id — different hooks, so dispatch before any are called.
  return role === "STUDENT" ? <StudentSeason /> : <StaffSeason />;
}
```

If Plan 6 has already restructured `season.tsx`, keep its structure and
apply the same rule: the default export dispatches on `role === "STUDENT"`
before calling any staff hook.

- [ ] **Step 4: Run**

Run: `cd apps/mobile && pnpm jest src/__tests__/student-season.test.tsx src/__tests__/season-screens.test.tsx` → PASS (the remaining ADMIN case is unaffected).
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): student current-season page — progress, group with leaders, upcoming sessions"
```

---

### Task 10: Student check-in on `session/[id]` — QR scanner and enter-code (G2)

**Files:**
- Modify: `apps/mobile/package.json` (via `npx expo install expo-camera`)
- Modify: `apps/mobile/app.json` (expo-camera config plugin)
- Create: `apps/mobile/src/__tests__/helpers/expo-camera.tsx` (the Jest stand-in for expo-camera)
- Create: `apps/mobile/src/lib/check-in-result.ts`
- Modify: `apps/mobile/src/hooks/use-check-in.ts` (Plan 6's file — append `useCheckIn`)
- Create: `apps/mobile/src/components/check-in/QrScanner.tsx`, `CheckInResult.tsx`, `StudentCheckInCard.tsx`
- Modify: `apps/mobile/app/(app)/session/[id]/index.tsx` (Plan 4's screen: one new branch)
- Modify: `apps/mobile/src/__tests__/session-detail.test.tsx` (as Plan 6 replaced it: camera mock line + one student assertion)
- Test: `apps/mobile/src/__tests__/check-in-result.test.ts`, `apps/mobile/src/__tests__/student-check-in.test.tsx`

**Interfaces:**
- Consumes: `checkInResponseSchema`, `checkInErrorCodeSchema`, `parseCheckInCode` (Task 1); `apiErrorBodySchema`, `sessionDetailSchema` (Plan 4); `queryKeys.sessions.all` (Plan 4), `queryKeys.me.all` (Task 5); the existing `POST /api/v1/sessions/check-in` (C3 since Task 2b).
- Produces: `useCheckIn(): UseMutationResult<CheckInResponse, Error, string>`; `CheckInOutcome`, `checkInRefusalCode(err)`, `checkInCopy(outcome)` in `src/lib/check-in-result.ts`; `<QrScanner onCode onCancel />`, `<CheckInResult outcome />`, `<StudentCheckInCard detail />`; test helper `mockCamera`, `resetMockCamera(permission?)`, `scanMockBarcode(data)`. Task 11 reuses `useCheckIn`, `CheckInResult` and `check-in-result.ts`.

- [ ] **Step 1: Add the dependency (Expo-managed version)**

```bash
cd apps/mobile && npx expo install expo-camera
grep '"expo-camera"' package.json
```

Expected: `"expo-camera": "~17.0.10"`, the version SDK 54.0.35's
`bundledNativeModules.json` pins. If `expo install` writes a different 17.0.x
patch, keep what it wrote. `npx expo install --check` must report no
mismatch. Then add the config plugin to the **existing** `plugins` array in
`apps/mobile/app.json` (keep every entry earlier plans added):

```json
["expo-camera", {
  "cameraPermission": "JPC Space uses the camera to scan the check-in code your leader shows.",
  "microphonePermission": false,
  "recordAudioAndroid": false
}]
```

(The plugin writes iOS `NSCameraUsageDescription` and the Android `CAMERA`
permission for dev and EAS builds. Expo Go already includes the module.
`jest.config.js` needs no change: its `transformIgnorePatterns` allowlist
already matches `expo-camera` through `expo(nent)?`, and every test mocks it
anyway.)

- [ ] **Step 2: The camera stand-in for Jest.** One helper module, which
each test pulls in with `jest.mock("expo-camera", () => require("./helpers/expo-camera"))`.
A factory may `require`, so the `mock*` rule holds, and the test then imports
the same module instance to drive it.

```tsx
// apps/mobile/src/__tests__/helpers/expo-camera.tsx
import { Text } from "react-native";

/*
 * Jest stand-in for expo-camera (native module — nothing to render under
 * the test renderer). Usage in a test file:
 *   jest.mock("expo-camera", () => require("./helpers/expo-camera"));
 *   import { resetMockCamera, scanMockBarcode, mockCamera } from "./helpers/expo-camera";
 * The factory `require`s this module, so the test's import receives the same
 * instance and can set the permission and simulate a decoded QR code.
 */
export interface MockPermission {
  granted: boolean;
  canAskAgain: boolean;
  status: "granted" | "denied" | "undetermined";
}

type ScanHandler = (result: { data: string }) => void;

export const mockCamera: {
  permission: MockPermission | null;
  requestPermission: jest.Mock;
  onBarcodeScanned: ScanHandler | null;
} = {
  permission: null,
  requestPermission: jest.fn(),
  onBarcodeScanned: null,
};

export const GRANTED: MockPermission = { granted: true, canAskAgain: true, status: "granted" };

export function resetMockCamera(permission: MockPermission | null = GRANTED): void {
  mockCamera.permission = permission;
  mockCamera.requestPermission = jest.fn(() => Promise.resolve(permission));
  mockCamera.onBarcodeScanned = null;
}

/** Simulates the camera decoding a QR code. */
export function scanMockBarcode(data: string): void {
  mockCamera.onBarcodeScanned?.({ data });
}

export function useCameraPermissions(): [MockPermission | null, jest.Mock] {
  return [mockCamera.permission, mockCamera.requestPermission];
}

export function CameraView(props: { onBarcodeScanned?: ScanHandler }) {
  mockCamera.onBarcodeScanned = props.onBarcodeScanned ?? null;
  return <Text testID="mock-camera">camera</Text>;
}
```

- [ ] **Step 3: Write the failing tests**

```ts
// apps/mobile/src/__tests__/check-in-result.test.ts
import { checkInCopy, checkInRefusalCode } from "../lib/check-in-result";

const axiosError = (status: number, data: unknown) =>
  Object.assign(new Error(String(status)), { isAxiosError: true, response: { status, data } });

describe("checkInRefusalCode", () => {
  it("reads the server's code from the error envelope (spec 04 R59)", () => {
    expect(checkInRefusalCode(axiosError(409, { error: { code: "closed", message: "Check-in has closed." } }))).toBe("closed");
    expect(checkInRefusalCode(axiosError(404, { error: { code: "invalid_token", message: "x" } }))).toBe("invalid_token");
  });

  it("is 'unknown' for a network error, a non-envelope body, or a code it does not know", () => {
    expect(checkInRefusalCode(Object.assign(new Error("Network Error"), { isAxiosError: true }))).toBe("unknown");
    expect(checkInRefusalCode(axiosError(502, "<html>"))).toBe("unknown");
    expect(checkInRefusalCode(axiosError(400, { error: { code: "bad_request", message: "x" } }))).toBe("unknown");
    expect(checkInRefusalCode(new Error("boom"))).toBe("unknown");
  });
});

describe("checkInCopy", () => {
  it("says on-time and late differently, with the minutes after the session START (C3, spec 04 D15)", () => {
    expect(checkInCopy({ kind: "checked_in", status: "PRESENT", minutesLate: 0 })).toEqual({
      title: "You're checked in!",
      message: null,
    });
    expect(checkInCopy({ kind: "checked_in", status: "LATE", minutesLate: 1 }).message).toBe(
      "1 minute after session start.",
    );
    expect(checkInCopy({ kind: "checked_in", status: "LATE", minutesLate: 12 })).toEqual({
      title: "Checked in — late",
      message: "12 minutes after session start.",
    });
  });

  it("explains each refusal in v1's words", () => {
    expect(checkInCopy({ kind: "refused", code: "not_open" }).message).toBe(
      "Check-in hasn't been opened yet. Ask your leader to open it.",
    );
    expect(checkInCopy({ kind: "refused", code: "already_checked_in" }).title).toBe("Already checked in");
    expect(checkInCopy({ kind: "refused", code: "not_enrolled" }).message).toBe("You are not enrolled in this season.");
  });
});
```

```tsx
// apps/mobile/src/__tests__/student-check-in.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
jest.mock("expo-camera", () => require("./helpers/expo-camera"));
jest.mock("react-native-qrcode-svg", () => "QRCode");
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "12" }),
  useRouter: () => ({ push: mockPush }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { mockCamera, resetMockCamera, scanMockBarcode } from "./helpers/expo-camera";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import SessionDetailScreen from "../../app/(app)/session/[id]/index";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const detail = {
  id: 12, title: "Week 3", description: null,
  startsAt: "2099-03-15T18:00:00.000Z", dayKey: "2099-03-15", startTime: "20:00", // required since Plan 6
  durationMinutes: 90, location: "Hall B",
  youtubeUrl: null, recurrenceGroupId: null, seasonId: 7, seasonCode: "s7", seasonTitle: "Spring",
  checkInOpen: true, myAttendance: null, canMarkAttendance: false, canManageCheckIn: false,
};

const refusal = (status: number, code: string) =>
  Object.assign(new Error(String(status)), {
    isAxiosError: true,
    response: { status, data: { error: { code, message: code } } },
  });

function serve(d: typeof detail = detail) {
  get.mockImplementation((url: string) =>
    url === "/api/v1/sessions/12"
      ? Promise.resolve({ data: { data: d } })
      : Promise.reject(new Error(`unexpected GET ${url}`)),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  resetMockCamera();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
});

describe("Student check-in on session detail (spec 04 §9 rows 3, 7)", () => {
  it("scans the console's QR (a bare token), posts it, and shows the result", async () => {
    serve();
    post.mockResolvedValue({ data: { data: { status: "PRESENT", minutesLate: 0 } } });
    renderWithProviders(<SessionDetailScreen />);

    fireEvent.press(await screen.findByText("Scan QR code"));
    expect(screen.getByTestId("mock-camera")).toBeTruthy();
    scanMockBarcode("AbC123XyZ0");

    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/sessions/check-in", { token: "AbC123XyZ0" }));
    expect(await screen.findByText("You're checked in!")).toBeTruthy();
  });

  it("accepts v1's printed URL form and posts only the token (R41, Decision 8)", async () => {
    serve();
    post.mockResolvedValue({ data: { data: { status: "LATE", minutesLate: 12 } } });
    renderWithProviders(<SessionDetailScreen />);

    fireEvent.press(await screen.findByText("Scan QR code"));
    scanMockBarcode("https://space.jpc.example/checkin/AbC123XyZ0");

    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/sessions/check-in", { token: "AbC123XyZ0" }));
    expect(await screen.findByText("Checked in — late")).toBeTruthy();
    expect(screen.getByText("12 minutes after session start.")).toBeTruthy();
  });

  it("ignores a QR that is not a check-in code, and posts once however often the camera fires", async () => {
    serve();
    post.mockResolvedValue({ data: { data: { status: "PRESENT", minutesLate: 0 } } });
    renderWithProviders(<SessionDetailScreen />);

    fireEvent.press(await screen.findByText("Scan QR code"));
    scanMockBarcode("https://example.com/menu");
    expect(await screen.findByText("That doesn't look like a check-in code.")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();

    // The camera reports the same frame repeatedly — one write, not three.
    scanMockBarcode("AbC123XyZ0");
    scanMockBarcode("AbC123XyZ0");
    scanMockBarcode("AbC123XyZ0");
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  });

  it("checks in by typed code, validating it with the same parser first", async () => {
    serve();
    post.mockResolvedValue({ data: { data: { status: "PRESENT", minutesLate: 0 } } });
    renderWithProviders(<SessionDetailScreen />);

    fireEvent.press(await screen.findByText("Enter code"));
    fireEvent.changeText(screen.getByLabelText("Check-in code"), "abc");
    fireEvent.press(screen.getByText("Check in"));
    expect(screen.getByLabelText("Check-in code").props.accessibilityHint).toBe(
      "That doesn't look like a check-in code.",
    );
    expect(post).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText("Check-in code"), " AbC123XyZ0 ");
    fireEvent.press(screen.getByText("Check in"));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/sessions/check-in", { token: "AbC123XyZ0" }));
  });

  it("explains a refusal by its code", async () => {
    serve();
    post.mockRejectedValue(refusal(409, "closed"));
    renderWithProviders(<SessionDetailScreen />);

    fireEvent.press(await screen.findByText("Scan QR code"));
    scanMockBarcode("AbC123XyZ0");

    expect(await screen.findByText("Check-in is now closed.")).toBeTruthy();
    expect(screen.getByText("Can't check in")).toBeTruthy();
  });

  it("asks for camera permission when it has not been decided — no camera until granted", async () => {
    resetMockCamera({ granted: false, canAskAgain: true, status: "undetermined" });
    serve();
    renderWithProviders(<SessionDetailScreen />);

    fireEvent.press(await screen.findByText("Scan QR code"));
    expect(screen.queryByTestId("mock-camera")).toBeNull();
    fireEvent.press(screen.getByText("Allow camera"));
    expect(mockCamera.requestPermission).toHaveBeenCalledTimes(1);
  });

  it("sends a permanently denied camera to the OS settings, and keeps the code fallback", async () => {
    const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue();
    resetMockCamera({ granted: false, canAskAgain: false, status: "denied" });
    serve();
    renderWithProviders(<SessionDetailScreen />);

    fireEvent.press(await screen.findByText("Scan QR code"));
    fireEvent.press(screen.getByText("Open settings"));
    expect(openSettings).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByText("Cancel"));
    expect(screen.getByText("Enter code")).toBeTruthy();
  });

  it("offers nothing to scan while check-in is not open — the server's flag decides (C4, R73)", async () => {
    serve({ ...detail, checkInOpen: false });
    renderWithProviders(<SessionDetailScreen />);

    expect(await screen.findByText("Check-in isn't open right now.")).toBeTruthy();
    expect(screen.queryByText("Scan QR code")).toBeNull();
  });

  it("shows a student who already scanned in when they did, with no controls", async () => {
    serve({
      ...detail,
      myAttendance: { status: "PRESENT", notes: null, lateMinutes: null, checkedInAt: "2099-03-15T17:58:00.000Z" },
    });
    renderWithProviders(<SessionDetailScreen />);

    expect(await screen.findByText(/You checked in at/)).toBeTruthy();
    expect(screen.queryByText("Scan QR code")).toBeNull();
  });

  it("refreshes the session after a successful check-in", async () => {
    serve();
    post.mockResolvedValue({ data: { data: { status: "PRESENT", minutesLate: 0 } } });
    renderWithProviders(<SessionDetailScreen />);

    fireEvent.press(await screen.findByText("Scan QR code"));
    scanMockBarcode("AbC123XyZ0");

    await waitFor(() =>
      expect(get.mock.calls.filter(([url]) => url === "/api/v1/sessions/12").length).toBeGreaterThanOrEqual(2),
    );
  });

  it("is not shown to staff", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/sessions/12")
        return Promise.resolve({ data: { data: { ...detail, canMarkAttendance: true, canManageCheckIn: true } } });
      // Plan 6's staff cards: the console reads check-in state, the quiz card its quizzes.
      if (url === "/api/v1/sessions/12/check-in")
        return Promise.resolve({ data: { data: {
          state: "not_open", isOpen: false, checkInToken: null, checkInOpenAt: null,
          checkInClosedAt: null, expiresAt: null, expiresAtTime: null,
        } } });
      if (url === "/api/v1/sessions/12/quizzes") return Promise.resolve({ data: { data: { quizzes: [] } } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    renderWithProviders(<SessionDetailScreen />);

    expect(await screen.findByText("Week 3")).toBeTruthy();
    expect(screen.queryByText("Scan QR code")).toBeNull();
    expect(screen.queryByText("Your check-in")).toBeNull();
  });
});
```

In `session-detail.test.tsx` (the file Plan 6 Task 7 replaced), add
`jest.mock("expo-camera", () => require("./helpers/expo-camera"));` beside its
other `jest.mock` calls. In its first case ("shows a student the org-time
header and their attendance, and no staff cards (C4)"), replace
`expect(screen.queryByText("Check-in")).toBeNull();` with
`expect(screen.getByText("Check-in isn't open right now.")).toBeTruthy();`.
The student now has a card (G2). It is the student variant; the
`queryByText("Edit session")` / `queryByText("Mark attendance")` assertions
and the "no `/quizzes` GET" assertion beside it still guard the staff cards.

Run: `cd apps/mobile && pnpm jest src/__tests__/check-in-result.test.ts src/__tests__/student-check-in.test.tsx src/__tests__/session-detail.test.tsx`
Expected: FAIL — modules missing; no student card.

- [ ] **Step 4: Outcome mapping**

```ts
// apps/mobile/src/lib/check-in-result.ts
import axios from "axios";
import {
  apiErrorBodySchema,
  checkInErrorCodeSchema,
  type CheckInErrorCode,
  type CheckInResponse,
} from "@space/shared";

export type CheckInOutcome =
  | { kind: "checked_in"; status: CheckInResponse["status"]; minutesLate: number }
  | { kind: "refused"; code: CheckInErrorCode | "unknown" };

/** The server's refusal code, parsed — never read off the body by cast (X10). */
export function checkInRefusalCode(err: unknown): CheckInErrorCode | "unknown" {
  if (!axios.isAxiosError(err)) return "unknown";
  const body = apiErrorBodySchema.safeParse(err.response?.data);
  if (!body.success) return "unknown";
  const code = checkInErrorCodeSchema.safeParse(body.data.error.code);
  return code.success ? code.data : "unknown";
}

export interface CheckInCopy {
  title: string;
  message: string | null;
}

/** v1 app/checkin/[token]/page.tsx's words. "After session start" is now TRUE (C3, spec 04 D15). */
export function checkInCopy(outcome: CheckInOutcome): CheckInCopy {
  if (outcome.kind === "checked_in") {
    if (outcome.status === "PRESENT") return { title: "You're checked in!", message: null };
    const m = outcome.minutesLate;
    return { title: "Checked in — late", message: `${m} minute${m === 1 ? "" : "s"} after session start.` };
  }
  switch (outcome.code) {
    case "already_checked_in":
      return { title: "Already checked in", message: "You already checked in to this session." };
    case "invalid_token":
      return { title: "Can't check in", message: "This check-in code is not valid." };
    case "not_open":
      return { title: "Can't check in", message: "Check-in hasn't been opened yet. Ask your leader to open it." };
    case "closed":
      return { title: "Can't check in", message: "Check-in is now closed." };
    case "not_enrolled":
      return { title: "Can't check in", message: "You are not enrolled in this season." };
    default:
      return { title: "Can't check in", message: "Couldn't check you in. Check your connection and try again." };
  }
}
```

- [ ] **Step 5: The mutation**

`apps/mobile/src/hooks/use-check-in.ts` already exists (Plan 6 Task 7:
`useCheckInState`, `useRegenerateCheckIn`). Do not recreate it. Merge the
imports — add `type UseMutationResult` to the `@tanstack/react-query` import
and `checkInResponseSchema, type CheckInResponse` to the `@space/shared`
import (`apiClient`/`queryKeys` are already imported) — and append:

```ts

/**
 * POST /sessions/check-in with a token from the scanner, the code field or a
 * deep link. Parsed (X10). On success every session view (myAttendance,
 * the leader's live roster) and the student's own attendance/budget refetch.
 */
export function useCheckIn(): UseMutationResult<CheckInResponse, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => {
      const res = await apiClient.post("/api/v1/sessions/check-in", { token });
      return checkInResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.me.all });
    },
  });
}
```

- [ ] **Step 6: The components**

```tsx
// apps/mobile/src/components/check-in/CheckInResult.tsx
import { View } from "react-native";

import { checkInCopy, type CheckInOutcome } from "../../lib/check-in-result";
import { useTheme } from "../../theme";
import { Text } from "../../ui";

export function CheckInResult({ outcome }: { outcome: CheckInOutcome }) {
  const theme = useTheme();
  const copy = checkInCopy(outcome);
  const ok = outcome.kind === "checked_in";
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ gap: theme.spacing.xs }}>
      <Text variant="heading" color={ok ? theme.colors.success[700] : theme.colors.error[600]}>
        {copy.title}
      </Text>
      {copy.message ? <Text variant="body">{copy.message}</Text> : null}
    </View>
  );
}
```

```tsx
// apps/mobile/src/components/check-in/QrScanner.tsx
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef, useState, type ReactNode } from "react";
import { Linking, View } from "react-native";
import { parseCheckInCode } from "@space/shared";

import { useTheme } from "../../theme";
import { Button, Text } from "../../ui";

export interface QrScannerProps {
  /** Called once, with a token parseCheckInCode accepted. */
  onCode: (token: string) => void;
  onCancel: () => void;
}

/**
 * expo-camera's barcode scanner in place of v1's WASM qr-scanner
 * (qr-scanner-view.tsx). The permission flow has no v1 equivalent (spec 04 §9
 * row 7): undecided → ask; denied for good → the OS settings, with the code
 * field still one tap away (Cancel → Enter code).
 */
export function QrScanner({ onCode, onCancel }: QrScannerProps) {
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  // The camera reports the same frame many times a second; one write only.
  const handled = useRef(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const onScanned = ({ data }: { data: string }) => {
    if (handled.current) return;
    const token = parseCheckInCode(data);
    if (!token) {
      setScanError("That doesn't look like a check-in code.");
      return;
    }
    handled.current = true;
    onCode(token);
  };

  let body: ReactNode;
  if (!permission) {
    body = <Text variant="body">Checking camera access…</Text>;
  } else if (!permission.granted && permission.canAskAgain) {
    body = (
      <>
        <Text variant="body">JPC Space needs your camera to scan the check-in code your leader shows.</Text>
        <Button title="Allow camera" onPress={() => void requestPermission()} />
      </>
    );
  } else if (!permission.granted) {
    body = (
      <>
        <Text variant="body">
          Camera access is turned off for JPC Space. Turn it on in Settings, or enter the code instead.
        </Text>
        <Button title="Open settings" variant="secondary" onPress={() => void Linking.openSettings()} />
      </>
    );
  } else {
    body = (
      <>
        <View style={{ height: 280, borderRadius: theme.radii.lg, overflow: "hidden" }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={onScanned}
          />
        </View>
        <Text variant="caption" color={theme.colors.neutral[600]}>
          Point your camera at the QR code displayed by your leader.
        </Text>
        {scanError ? (
          <Text variant="label" color={theme.colors.error[600]} accessibilityRole="alert">
            {scanError}
          </Text>
        ) : null}
      </>
    );
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {body}
      <Button title="Cancel" variant="ghost" onPress={onCancel} />
    </View>
  );
}
```

```tsx
// apps/mobile/src/components/check-in/StudentCheckInCard.tsx
import { useState, type ReactNode } from "react";
import { parseCheckInCode, type SessionDetail } from "@space/shared";

import { useCheckIn } from "../../hooks/use-check-in";
import { checkInRefusalCode, type CheckInOutcome } from "../../lib/check-in-result";
import { formatSessionTime } from "../../lib/format";
import { useTheme } from "../../theme";
import { Button, Card, Input, Text } from "../../ui";
import { CheckInResult } from "./CheckInResult";
import { QrScanner } from "./QrScanner";

type Mode = "idle" | "scanning" | "entering";
const NOT_A_CODE = "That doesn't look like a check-in code.";

/**
 * The student's check-in on /session/[id] (v1 student-checkin-button.tsx).
 * Unlike v1 it POSTS the token rather than navigating to a write-on-render
 * page (R69/R72, spec 04 D3). Whether check-in is open is the server's
 * `checkInOpen` (C4) — never the client's own three-hour sum (R51, R73).
 */
export function StudentCheckInCard({ detail }: { detail: SessionDetail }) {
  const theme = useTheme();
  const checkIn = useCheckIn();
  const [mode, setMode] = useState<Mode>("idle");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | undefined>(undefined);
  const [outcome, setOutcome] = useState<CheckInOutcome | null>(null);

  const submit = (token: string) => {
    setMode("idle");
    setOutcome(null);
    checkIn.mutate(token, {
      onSuccess: (data) => setOutcome({ kind: "checked_in", status: data.status, minutesLate: data.minutesLate }),
      onError: (err) => setOutcome({ kind: "refused", code: checkInRefusalCode(err) }),
    });
  };

  const submitTyped = () => {
    const token = parseCheckInCode(code);
    if (!token) {
      setCodeError(NOT_A_CODE);
      return;
    }
    setCodeError(undefined);
    setCode("");
    submit(token);
  };

  const checkedInAt = detail.myAttendance?.checkedInAt ?? null;
  let body: ReactNode;
  if (outcome?.kind === "checked_in") {
    body = <CheckInResult outcome={outcome} />;
  } else if (checkedInAt !== null) {
    body = <Text variant="body">{`You checked in at ${formatSessionTime(checkedInAt)}.`}</Text>;
  } else if (!detail.checkInOpen && outcome === null) {
    body = (
      <Text variant="body" color={theme.colors.neutral[600]}>
        Check-in isn't open right now.
      </Text>
    );
  } else {
    let controls: ReactNode;
    if (checkIn.isPending) {
      controls = <Text variant="body">Checking you in…</Text>;
    } else if (mode === "scanning") {
      controls = <QrScanner onCode={submit} onCancel={() => setMode("idle")} />;
    } else if (mode === "entering") {
      controls = (
        <>
          <Input
            label="Check-in code"
            value={code}
            onChangeText={setCode}
            autoCapitalize="none"
            autoCorrect={false}
            error={codeError}
          />
          <Button title="Check in" onPress={submitTyped} />
          <Button title="Cancel" variant="ghost" onPress={() => setMode("idle")} />
        </>
      );
    } else {
      controls = (
        <>
          <Button title="Scan QR code" onPress={() => setMode("scanning")} />
          <Button title="Enter code" variant="secondary" onPress={() => setMode("entering")} />
        </>
      );
    }
    body = (
      <>
        {outcome ? <CheckInResult outcome={outcome} /> : null}
        {controls}
      </>
    );
  }

  return (
    <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
      <Text variant="heading">Your check-in</Text>
      {body}
    </Card>
  );
}
```

- [ ] **Step 7: Wire it into the session detail.** In
`apps/mobile/app/(app)/session/[id]/index.tsx` (Plan 4), add the imports

```tsx
import { StudentCheckInCard } from "../../../../src/components/check-in/StudentCheckInCard";
import { useSessionStore } from "../../../../src/store/session";
```

In `SessionDetailBody`, add
`const role = useSessionStore((s) => s.user?.role ?? null);` directly after
`const router = useRouter();`, which keeps it before the early returns. Then
replace the `{/* Student check-in (scanner / enter code) is Plan 11 (ruling X15). */}`
comment and the console/roster ternary with:

```tsx
      {data.canManageCheckIn ? (
        <CheckInConsole detail={data} />
      ) : data.canMarkAttendance ? (
        <LiveCheckInRoster detail={data} />
      ) : role === "STUDENT" ? (
        // Spec 04 §9 row 3: students get the check-in action (Plan 11, G2).
        <StudentCheckInCard detail={data} />
      ) : null}
```

If Plan 6 has added branches here (for example the session-quiz card),
leave them in place. The student card is the last branch of this ternary.

- [ ] **Step 8: Run**

Run: `cd apps/mobile && pnpm jest src/__tests__/check-in-result.test.ts src/__tests__/student-check-in.test.tsx src/__tests__/session-detail.test.tsx` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): student check-in by QR scan or code on session detail"
```

---

### Task 11: `/checkin/<token>` deep link with login → return (spec 04 R56)

**Files:**
- Create: `apps/mobile/app/checkin/[token].tsx` (root Stack, **outside** `(app)`, so it is not a tab and not in `DETAIL_ROUTE_NAMES`; it has no children, so the file form is correct under X7)
- Create: `apps/mobile/src/lib/return-to.ts`
- Modify: `apps/mobile/app/login.tsx`
- Modify: `apps/mobile/src/__tests__/login-screen.test.tsx`
- Test: `apps/mobile/src/__tests__/return-to.test.ts`, `apps/mobile/src/__tests__/checkin-link-screen.test.tsx`

**Interfaces:**
- Consumes: `useCheckIn`, `CheckInResult`, `checkInRefusalCode`, `CheckInOutcome` (Task 10); `parseCheckInCode` (Task 1); the app scheme `spacev2` (`app.json`, already set).
- Produces: route `/checkin/[token]` (opens from `spacev2://checkin/<token>`); `returnHrefFor(raw: string | string[] | undefined): Href | null`; `/login` honours `?returnTo=` for check-in links only.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/mobile/src/__tests__/return-to.test.ts
import { returnHrefFor } from "../lib/return-to";

describe("returnHrefFor (no open redirect — Decision 7)", () => {
  it("rebuilds a check-in link as a typed route", () => {
    expect(returnHrefFor("/checkin/AbC123XyZ0")).toEqual({
      pathname: "/checkin/[token]",
      params: { token: "AbC123XyZ0" },
    });
  });

  it("refuses everything else", () => {
    for (const raw of [undefined, "", "/dashboard", "https://evil.example/checkin/AbC123XyZ0", "/checkin/short", "//evil.example", ["/checkin/AbC123XyZ0"]]) {
      expect(returnHrefFor(raw)).toBeNull();
    }
  });
});
```

```tsx
// apps/mobile/src/__tests__/checkin-link-screen.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { post: jest.fn() } }));
let mockParams: Record<string, string> = { token: "AbC123XyZ0" };
const mockReplace = jest.fn();
jest.mock("expo-router", () => {
  const { Text } = require("react-native");
  return {
    useLocalSearchParams: () => mockParams,
    useRouter: () => ({ replace: mockReplace }),
    Redirect: ({ href }: { href: unknown }) => <Text testID="redirect">{JSON.stringify(href)}</Text>,
  };
});

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import CheckInLinkScreen from "../../app/checkin/[token]";

const post = apiClient.post as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { token: "AbC123XyZ0" };
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("CheckInLinkScreen", () => {
  it("sends an anonymous visitor to login carrying the way back (R56)", () => {
    useSessionStore.setState({ status: "anonymous" });

    renderWithProviders(<CheckInLinkScreen />);

    const href = JSON.parse(screen.getByTestId("redirect").props.children);
    expect(href).toEqual({ pathname: "/login", params: { returnTo: "/checkin/AbC123XyZ0" } });
    expect(post).not.toHaveBeenCalled();
  });

  it("does NOT check in on open — the write is an explicit press (spec 04 D3, C6, R69)", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    post.mockResolvedValue({ data: { data: { status: "PRESENT", minutesLate: 0 } } });

    renderWithProviders(<CheckInLinkScreen />);

    expect(screen.getByText("Check in to the session this code belongs to?")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText("Check in"));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/sessions/check-in", { token: "AbC123XyZ0" }));
    expect(await screen.findByText("You're checked in!")).toBeTruthy();
  });

  it("shows a refusal by its code", async () => {
    useSessionStore.setState(makeSession("STUDENT"));
    post.mockRejectedValue(
      Object.assign(new Error("403"), {
        isAxiosError: true,
        response: { status: 403, data: { error: { code: "not_enrolled", message: "x" } } },
      }),
    );

    renderWithProviders(<CheckInLinkScreen />);
    fireEvent.press(screen.getByText("Check in"));

    expect(await screen.findByText("You are not enrolled in this season.")).toBeTruthy();
  });

  it("rejects a malformed token without offering to check in, and never carries it through login", () => {
    mockParams = { token: "not-a-token" };
    useSessionStore.setState(makeSession("STUDENT"));
    const { unmount } = renderWithProviders(<CheckInLinkScreen />);
    expect(screen.getByText("This check-in link is not valid.")).toBeTruthy();
    expect(screen.queryByText("Check in")).toBeNull();
    unmount();

    useSessionStore.setState({ status: "anonymous" });
    renderWithProviders(<CheckInLinkScreen />);
    expect(JSON.parse(screen.getByTestId("redirect").props.children)).toBe("/login");
  });

  it("goes to the dashboard on request", () => {
    useSessionStore.setState(makeSession("STUDENT"));
    renderWithProviders(<CheckInLinkScreen />);
    fireEvent.press(screen.getByText("Go to dashboard"));
    expect(mockReplace).toHaveBeenCalledWith("/dashboard");
  });
});
```

In `login-screen.test.tsx`: above the `expo-router` mock add
`let mockSearchParams: Record<string, string | undefined> = {};`, add
`useLocalSearchParams: () => mockSearchParams,` to that mock's returned
object (keep every member Plans 9/10 added, such as `push`), reset
`mockSearchParams = {};` in `beforeEach`, and append:

```tsx
  it("returns to a check-in deep link after signing in (spec 04 R56)", async () => {
    mockSearchParams = { returnTo: "/checkin/AbC123XyZ0" };
    mockLogin.mockResolvedValue(undefined);

    renderWithProviders(<LoginScreen />);
    fireEvent.changeText(screen.getByLabelText("Email"), "sara@jpc.test");
    fireEvent.changeText(screen.getByLabelText("Password"), "hunter2");
    fireEvent.press(screen.getByText("Sign in"));

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({ pathname: "/checkin/[token]", params: { token: "AbC123XyZ0" } }),
    );
  });

  it("ignores any other returnTo — no open redirect", async () => {
    mockSearchParams = { returnTo: "https://evil.example/phish" };
    mockLogin.mockResolvedValue(undefined);

    renderWithProviders(<LoginScreen />);
    fireEvent.changeText(screen.getByLabelText("Email"), "sara@jpc.test");
    fireEvent.changeText(screen.getByLabelText("Password"), "hunter2");
    fireEvent.press(screen.getByText("Sign in"));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/dashboard"));
  });
```

Run: `cd apps/mobile && pnpm jest src/__tests__/return-to.test.ts src/__tests__/checkin-link-screen.test.tsx src/__tests__/login-screen.test.tsx`
Expected: FAIL — modules missing; login ignores `returnTo`.

- [ ] **Step 2: `return-to.ts`**

```ts
// apps/mobile/src/lib/return-to.ts
import type { Href } from "expo-router";

const CHECK_IN_PATH_RE = /^\/checkin\/([0-9A-Za-z]{10})$/;

/**
 * Where /login may send the user after signing in. ONLY a check-in link
 * (`/checkin/<10-char token>`, Plan 11 Decision 7), rebuilt as a typed route —
 * never the raw string, so a crafted `returnTo` cannot redirect anywhere else.
 * Extend deliberately, one typed shape at a time.
 */
export function returnHrefFor(raw: string | string[] | undefined): Href | null {
  if (typeof raw !== "string") return null;
  const token = CHECK_IN_PATH_RE.exec(raw)?.[1];
  return token ? { pathname: "/checkin/[token]", params: { token } } : null;
}
```

- [ ] **Step 3: The deep-link screen**

```tsx
// apps/mobile/app/checkin/[token].tsx
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { parseCheckInCode } from "@space/shared";

import { CheckInResult } from "../../src/components/check-in/CheckInResult";
import { useCheckIn } from "../../src/hooks/use-check-in";
import { checkInRefusalCode, type CheckInOutcome } from "../../src/lib/check-in-result";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Button, Screen, Text } from "../../src/ui";

/**
 * `spacev2://checkin/<token>` (v1 app/checkin/[token]/page.tsx). Outside the
 * (app) tab shell, like v1's standalone page (R70). Two deliberate changes:
 *  - it NEVER writes on open (spec 04 D3, ruling C6): v1 checked in as a side
 *    effect of rendering (R69), so a refresh or a link preview re-ran it.
 *    Here the write is the "Check in" press.
 *  - anonymous → /login?returnTo=/checkin/<token> → back here (R56). Only a
 *    well-formed token is carried; anything else goes to plain /login.
 * The boot gate (app/_layout.tsx) has resolved the session before this mounts.
 */
export default function CheckInLinkScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { token: raw } = useLocalSearchParams<{ token: string }>();
  const status = useSessionStore((s) => s.status);
  const checkIn = useCheckIn();
  const [outcome, setOutcome] = useState<CheckInOutcome | null>(null);
  const token = typeof raw === "string" ? parseCheckInCode(raw) : null;

  if (status !== "authenticated") {
    return (
      <Redirect href={token ? { pathname: "/login", params: { returnTo: `/checkin/${token}` } } : "/login"} />
    );
  }

  const confirm = (value: string) =>
    checkIn.mutate(value, {
      onSuccess: (data) => setOutcome({ kind: "checked_in", status: data.status, minutesLate: data.minutesLate }),
      onError: (err) => setOutcome({ kind: "refused", code: checkInRefusalCode(err) }),
    });

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center", gap: theme.spacing.md }}>
        <Text variant="title">Session check-in</Text>
        {token === null ? (
          <Text variant="body">This check-in link is not valid.</Text>
        ) : outcome ? (
          <CheckInResult outcome={outcome} />
        ) : (
          <>
            <Text variant="body">Check in to the session this code belongs to?</Text>
            <Button title="Check in" loading={checkIn.isPending} onPress={() => confirm(token)} />
          </>
        )}
        <Button title="Go to dashboard" variant="secondary" onPress={() => router.replace("/dashboard")} />
      </View>
    </Screen>
  );
}
```

- [ ] **Step 4: Login honours `returnTo`.** In `apps/mobile/app/login.tsx`:
import `useLocalSearchParams` beside `useRouter` from `expo-router` and add
`import { returnHrefFor } from "../src/lib/return-to";`. In the component, add
`const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();`, and in
`onSubmit` replace `router.replace("/dashboard");` with:

```tsx
      // Spec 04 R56: a check-in link that needed a login lands back on itself.
      // returnHrefFor admits only that one typed shape (Decision 7).
      router.replace(returnHrefFor(returnTo) ?? "/dashboard");
```

Run `pnpm turbo routes:generate --filter=@space/mobile`.

- [ ] **Step 5: Run**

Run: `cd apps/mobile && pnpm jest src/__tests__/return-to.test.ts src/__tests__/checkin-link-screen.test.tsx src/__tests__/login-screen.test.tsx src/__tests__/app-layout.test.tsx src/__tests__/boot-gate.test.tsx` → PASS
(`app-layout`'s disk scan covers only `app/(app)`, so the root-level
`checkin/[token].tsx` is outside it by design).
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean (typecheck proves `{ pathname: "/checkin/[token]", … }` and `/login` with params are real routes).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): check-in deep link with login return; never writes on open"
```

---

### Task 12: Closing gate (coordinator)

**Files:** none created — verification only.

- [ ] **Step 1: Full suite.** `pnpm turbo lint typecheck test:unit build` (repo root) → green.
Then, **serially**: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern "me-self-service-routes|check-in-routes|students-routes|me-routes|me-settings-routes|sessions-routes"` → green.
`grep -rn 'require("@space/shared")' apps/backend/dist/` → empty (X12).
`cd apps/mobile && npx expo install --check` → no version mismatch (expo-camera ~17.0.x for SDK 54).

- [ ] **Step 2: Mutation pass.** Run each mutation alone and restore it before
the next. Each one must make the named test fail.

1. `loadSeasonHistory`: delete the `excludeSeasonId` spread → "lists past enrollments only" fails (Current Season appears).
2. `loadSeasonHistory`: delete `season: { deletedAt: null }` → the same test fails (Deleted Season appears).
3. `loadMySeason`: read the group through `db.groupStudent.findUnique({ where: { studentUserId: user.userId } })` instead of the enrollment → "resolves the group through this season's enrollment" fails (Group A1).
4. `loadMySeason`: select `email` on members and pass it through → `mySeasonMemberSchema` is strict, so `use-self-service`/`student-season` parse fails; the integration "peers by name only" `toEqual` fails.
5. `streakFrom`: `if (status === null) break;` → unit "skips an unmarked session" fails, and integration `streak` becomes 0.
6. `budgetFrom`: drop `Math.min(…, 100)` → unit "caps budgetPct at 100" fails.
7. `costMinutesFor`: return `lateMinutes` for ABSENT → unit (R95) and integration `costMinutes [null, null, 90]` fail.
8. `routes/sessions.ts` check-in: measure from `session.checkInOpenAt` again → both C3 integration cases fail.
9. `PATCH /me/profile`: delete the raw-key loop → `{ email }` becomes 400 (strict schema), so "refuses … by name" fails on `forbidden_field`.
10. `routes/students.ts`: put `"email"` back into `SELF_EDITABLE` → "refuses a student's own email change" fails.
11. `history.tsx`: render `formatDate(s.startsAt)` instead of `formatDayKey(s.dayKey)` → run `TZ=UTC pnpm jest src/__tests__/history-screen.test.tsx`; "Mar 2, 2025" fails.
12. `useUpdateStudentProfile`: return `res.data.data.profile` unparsed → "rejects a response that carries staff-only notes" and the profile "treats a response carrying notes as a failed save" fail.
13. `useMyAttendance`: `enabled: true` → "does not fetch without an active season" and attendance "runs no query" fail.
14. `QrScanner`: delete the `handled` ref guard → "posts once however often the camera fires" fails.
15. `QrScanner`: call `onCode(data)` without `parseCheckInCode` → "ignores a QR that is not a check-in code" and "posts only the token" fail.
16. `checkin/[token].tsx`: add `useEffect(() => { if (token) confirm(token); }, [])` → "does NOT check in on open" fails.
17. `return-to.ts`: drop the `^` anchor from `CHECK_IN_PATH_RE` → "refuses everything else" fails on the `https://evil.example/checkin/…` case.
18. `session/[id]/index.tsx`: move the `StudentCheckInCard` branch first, ahead of the `canManageCheckIn` check, without the role test → "is not shown to staff" fails.
19. `navigation.ts`: remove the `/attendance` STUDENT entry → `navigation.test.ts`, `nav-routes.test.ts` and `role-tabs.test.tsx` fail.
20. `StudentSeason`: link an upcoming row to `"/calendar"` → "opens an upcoming session" fails.

- [ ] **Step 3: Device checklist.** Use a dev build: `cd apps/mobile && npx expo run:ios` (or `run:android`), because the `spacev2://` scheme and the camera plugin need one. Point the backend at staging.

As a **student** with an active season:
1. More → **Attendance** is listed. It shows "N% used", "X of Y min", the rule line, the streak, and past sessions with "− N min from budget" where applicable. Pull to refresh works.
2. More → **Current Season** shows the title, "Session N of M", **your** group with its leader's name and email, members by name with "You", and three upcoming sessions. Tap one: session detail opens. "See calendar" opens the calendar.
3. More → **History** lists past seasons only (not the current one). "Curriculum (N sessions)" expands with org-calendar dates.
4. More → **Profile** shows initials, the "Absence budget left" and "Streak" stats, and the six fields. Change Phone, Save, kill the app and reopen: the value survives. An impossible date is refused inline. "Open settings" reaches Settings.
5. On a second phone as an **admin**, open check-in on today's session. On the student's session detail tap "Scan QR code" and grant the camera. Scan the console QR: "You're checked in!", and the header switches to "Your attendance: Present". Scan again: "Already checked in".
6. Deny the camera permanently in OS settings, then "Scan QR code" → "Open settings" opens the OS page, and Cancel → "Enter code" with the code shown under the console QR works.
7. After the session's start time, check in a different student: "Checked in — late · N minutes after session start", and N matches the minutes since `startsAt`, not since the console opened (C3).
8. Close check-in: the student card reads "Check-in isn't open right now."
9. Signed out, open `spacev2://checkin/<token>` (iOS: `xcrun simctl openurl booted spacev2://checkin/<token>`; Android: `adb shell am start -W -a android.intent.action.VIEW -d "spacev2://checkin/<token>"`). The login screen appears. Sign in and you land on "Session check-in", and **nothing is recorded until "Check in" is pressed**.

As an **alumnus**: History tab lists every past enrollment. The Profile tab is the read-only record with "Alumnus · Class of N". No Attendance entry appears in More.

As a **mentor**: the Profile tab shows the account card, "Settings" opens settings, and "Sign out" signs out.

- [ ] **Step 4: Register for Plan 18** (the coordinator appends these to
Plan 18's deferred/drop register; this plan does not edit Plan 18):
(a) the rotating check-in code (spec 04 D3 option 1; the static token is still forwardable);
(b) spec 04 D4: a STUDENT role gate on `POST /sessions/check-in`, and a **per-user** rate limit (a per-IP limiter would bucket a whole classroom behind one NAT). The five distinct codes are kept on purpose (Decision 9);
(c) https universal links / app links for v1's printed `https://<host>/checkin/<token>` sheets (until then those URLs open v1's web page, which keeps working until cutover);
(d) avatar image read-back on `/profile` (with the uploads/CMS track);
(e) the C3 era boundary: check-in rows written by v2 since this plan measure from `startsAt`, so Plan 18 M3's backfill must treat them as `SESSION_START`.

- [ ] **Step 5: Report** suite counts, the 20 mutation outcomes, the checklist results, and any divergence from this plan found while implementing.

---

## Names this plan produces (for later plans)

- **Endpoints:** `GET /api/v1/me/season-history`, `GET /api/v1/me/season`, `GET /api/v1/me/attendance` (`{ season, budget, streak, sessions }`, budget carries `remainingPct`), `GET/PATCH /api/v1/me/profile`. Changed: `POST /api/v1/sessions/check-in` lateness now runs from `startsAt` (C3); `PATCH /students/:id` self-edits are limited to the six profile columns.
- **Shared:** `CHECK_IN_TOKEN_RE`, `parseCheckInCode`, `checkInResponseSchema`, `checkInErrorCodeSchema`, `attendanceBudgetSchema`, `myAttendanceSessionSchema`, `myAttendanceResponseSchema`, `seasonHistoryCurriculumItemSchema`, `seasonHistoryRowSchema`, `seasonHistoryResponseSchema`, `mySeasonSchema` (+ `mySeasonLeaderSchema`, `mySeasonMemberSchema`, `mySeasonGroupSchema`, `mySeasonUpcomingSessionSchema`), `mySeasonResponseSchema`, `OWN_PROFILE_FIELDS`, `updateOwnProfileInputSchema`, `myProfileSchema`, `myProfileResponseSchema`; nav href `/attendance` (STUDENT sidebar), `NavIconName` `"attendance"`. Day values reuse Plan 5's `isoDaySchema`.
- **Backend:** `lib/attendance-budget.ts` (`budgetFrom`, `costMinutesFor`, `streakFrom`, `AttendanceBudget`); `lib/queries/attendance-budget.ts` (`computeAttendanceBudget`); `lib/queries/me.ts` (`loadSeasonHistory`, `loadMySeason`, `loadMyAttendance`, `loadMyProfile`, `UPCOMING_LIMIT`).
- **Mobile:** `queryKeys.me.{all,seasonHistory,season,attendance,profile}`; `use-self-service.ts` (`useSeasonHistory`, `useMySeason`, `useMyAttendance`, `useMyProfile`, `useUpdateStudentProfile`); `use-check-in.ts` (`useCheckIn`); `lib/check-in-result.ts` (`CheckInOutcome`, `checkInRefusalCode`, `checkInCopy`); `lib/return-to.ts` (`returnHrefFor`); `lib/initials.ts` (`initialsOf`); components `check-in/{QrScanner,CheckInResult,StudentCheckInCard}`, `season/StudentSeason`; routes `/attendance` (new), `/history`, `/profile`, `/season` student branch, `/checkin/[token]` (root, outside `(app)`); test helper `helpers/expo-camera.tsx` (`mockCamera`, `resetMockCamera`, `scanMockBarcode`, `GRANTED`).

## Revision 2026-10-05

Cross-plan consistency pass (execution order 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → …):
- `Depends on` reordered to the execution order and now names Plan 6 (its `use-check-in.ts`, restructured session detail and replaced `session-detail.test.tsx`) and Plan 10 (`login.tsx`, `student/[id]/index.tsx`).
- Task 10: `use-check-in.ts` is **modified** (append `useCheckIn`, merge imports), not created — Plan 6 Task 7 created it.
- Task 10 test fixtures: session detail carries `dayKey`/`startTime` (required since Plan 6); the staff case mocks Plan 6's `GET /sessions/12/check-in` and `/quizzes` instead of the stale season-wide list; the edited `session-detail.test.tsx` case is named as Plan 6 left it.
