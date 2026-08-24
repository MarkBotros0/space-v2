# Plan 10 — Video Quizzes, Forum & JPC Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The three remaining engagement domains land on device — a student watches a session video and answers timed questions that the *server* keeps in order, posts to a forum thread on an assignment they have never opened, and every role sees JPC events on the calendar they already have.

**Architecture:** Two foundation tasks, then three file-disjoint streams that
can run in parallel, then a closing gate. Every shared file — contracts,
`lib/permissions.ts`, `app.ts`, the integration fixtures, the mobile query-key
factory — is touched **only** in Tasks 1 and 2, so the three streams never edit
the same file as each other. Each stream owns its own backend route file, its
own query module, and its own screen(s).

**Tech Stack:** Express 5, Prisma 7 (`src/generated/prisma`), Zod contracts in
`packages/shared`, jest + supertest against the shared staging DB; Expo SDK 54 /
expo-router 6, React Query 5, RNTL 13, and
`react-native-youtube-iframe` over `react-native-webview` for playback.

**Spec:** `docs/superpowers/specs/domains/13-video-quizzes.md`,
`14-forum.md`, `15-events.md` (all three, including each §10),
`_DECISIONS.md` (C1, C4, C6, C8, C9, C10, C11, C12); roadmap § Plan 10.

**Depends on:** Plan 1 (`DETAIL_ROUTE_NAMES`, `assignment/[id]`,
`PUT /submissions/by-assignment/:assignmentId`, the hooks/test patterns),
Plan 3 (`lib/org-time.ts`, session writes), Plan 4 (`app/(app)/calendar.tsx`,
`app/(app)/session/[id].tsx`, `useCurrentSeasonId`, `useSessionDetail`).
Plan 6 (domain 12, text quizzes) **does not exist yet** — see D-13.6 below for
the contract rule this plan defines and Plan 6 must adopt by name.

## Global Constraints

- **No migrations, ever** (ruling C1). No edits under `apps/backend/prisma/`.
  The staging database is shared with running v1.
- **`D:\Projects\JPC\jpc-space` is READ-ONLY.** Read it constantly; never write
  to it, never run `git` in it.
- **Forum posts are written by young people.** No real post or comment text is
  ever copied into this repo, into a test, or into a report. Every fixture
  string is invented and prefixed `space-v2-test-`.
- Response envelope `{ data }` / `{ error: { code, message } }` via
  `apiOk`/`apiError`.
- Value imports from shared use the relative path
  `"../../../../packages/shared/src/index"` in backend route files (the
  `rootDir` emit trap in `CLAUDE.md`). Mobile imports `@space/shared`.
- `src/docs/openapi.ts` changes in the **same commit** as the route it
  documents.
- Integration fixtures: every row carries `space-v2-test-` in `User.email`,
  `Season.code`, or (new in Task 2) `JpcEvent.title`; use
  `createTestSeason`/`createTestUser`/`login`/`cleanupTestData` from
  `__tests__/integration/fixtures.ts`; `jest.setTimeout(60000)`.
- **Integration tests are serial** (`jest.integration.config.js` sets
  `maxWorkers: 1`, and `cleanupTestData` is prefix-global). Each task runs its
  own suite:
  `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern <suite>`.
  If the three streams are parallelized across agents, the agents write the
  integration tests but do **not** run them; the coordinator runs them serially
  in Task 11.
- Mobile conventions from Phase 0 hold: relative imports (no `@/`), Zod-parse
  every response, `enabled` on dependent queries **and** guarded `refetch`,
  `LoadingState`/`ErrorState`/`EmptyState` primitives, `edges={["top","left","right"]}`
  on tab screens, `renderWithProviders`, `mock*` closure rule, typed routes +
  `routes:generate` after any route file is added.
- v1 rules are ported faithfully unless a spec §10 item or `_DECISIONS.md`
  ruling says otherwise. **Every divergence below names its source.**

## Decisions this plan makes (read before Task 1)

Recorded here because a reviewer must be able to reject them without reading
eleven tasks. Each cites the spec item it answers.

**D-13.1 — Video quizzes do NOT share domain 12's model.** Verified against
`apps/backend/prisma/schema.prisma`: domain 12 owns `Quiz` (:640), `QuizGrade`
(:669), `QuizQuestion` (:689), `QuizAttempt` (:709), `QuizAnswer` (:734); this
domain owns `SessionVideoQuestion` (:394), `SessionVideoQuestionResponse`
(:413), `SessionVideoProgress` (:427). No shared table, no shared column, no FK
between the two graphs. `Quiz.sessionId` is a nullable `SetNull` link to
`Session`; `SessionVideoQuestion.sessionId` is a required `Cascade` link — they
touch the same parent and nothing else. Consequences: separate contract files,
separate endpoints, and a student's video answer can never be stored as a
`QuizAnswer` (there is no `attemptId` to hang it on).

**D-13.2 — Playback gating becomes server-checked, as an ordering rule.**
Spec 13 §10 D1's headline finding: the barrier lives entirely in
`interactive-video-player.tsx` (R39–R43) and `submitVideoAnswerAction` checks
nothing (R47), so an API turns "watch the video" into one scripted loop.
`POST /sessions/:id/video-quiz/answers` therefore rejects any answer whose
question is **not the earliest unanswered question** for that student on that
session (ordered `atSeconds` asc, `id` asc as tiebreak — R13 permits duplicate
timestamps). That reproduces the barrier's ordering guarantee exactly, from data
the server already stores.
**What is not enforceable, stated plainly:** that the student actually watched.
`furthestSeconds` is client-reported (R48) and no server can observe a YouTube
iframe's playhead. Watch time is **advisory**; the ordering rule is the gate.
Rate-limiting progress to wall-clock time was considered and rejected — it
breaks legitimate playback-speed changes and only makes cheating tedious.

**D-13.3 — The answer key never travels to a student, enforced by schema
shape.** Two endpoints, two gates, two Zod schemas:
`videoQuestionAdminSchema` **has** `correctIndex`; `studentVideoQuestionSchema`
**has no such field and is `.strict()`**, so an extra key fails the parse at the
mobile boundary rather than rendering. `correctIndex` reaches a student on
exactly one path: the submit response for the question they just answered
(R60), which is safe because R54 makes the first answer final.
**Name this rule the "answer-key split" and reuse it by name.** Plan 6 (domain
12) does not exist yet; when it lands, its `quizQuestionSchema` pair must follow
this same split — one admin schema carrying `correctIndex`, one student schema
that is `.strict()` and cannot carry it. Flag in the Plan 6 report that this
plan defined the pattern first.

**D-13.4 — Completion is derived, not asserted** (spec 13 D3). `completed` is
absent from the request contract. The server sets `completedAt` when the last
unanswered question is answered, inside the same transaction. This fixes both
v1 failures at once: the false positive (`saveVideoProgress(id, 0, true)` marks
a student complete, R48) and the false negative (answer the last question, close
the app before the video ends, never complete, R65).

**D-13.5 — `furthestSeconds` only ever moves forward on both writers** (spec 13
D4). v1's answer path writes `{ set: question.atSeconds }` (R57) twenty lines
above a comment promising the opposite. Both v2 writers use
`Math.max(existing, incoming)` inside a transaction.

**D-13.6 — Editing an answer key re-grades in the same transaction** (spec 13
D5). Changing `correctIndex` or `options` re-evaluates every existing
`SessionVideoQuestionResponse` for that question and returns `regradedCount`.
Silently leaving stale grades is the one option ruled out.

**D-13.7 — YouTube parsing is rewritten, not ported, and lives in
`packages/shared`.** v1's four unanchored regexes have no host check (R33) and
no trailing boundary (R34), and reject `/live/` and `/v/` (R32) — which is what
a premiere or streamed session produces. Enumerated in Task 1. **Domain 3's
save-time validation (spec 13 D7c) is flagged, not done here**: `routes/sessions.ts`
is Plan 3's file, and this plan keeps its streams disjoint. The resolved
`videoId` travels on this domain's own student payload instead.

**D-14.1 — Nothing may assume a submission row exists.**
`PUT /api/v1/assignments/:id/forum/response` **is** the creator: one upsert on
`@@unique([assignmentId, studentUserId])` writing `text`, `status = SUBMITTED`
and `submittedAt` together. Ruling C6 forbids v1's read-time
`ensureDraftSubmission`, and `forumOwnResponseSchema.submissionPublicId` is
therefore **nullable** — the screen renders the compose box, the word counter
and the locked feed with no row in existence.

**D-14.2 — Forum posts are addressed by `Submission.publicId`, never the
integer id.** v1 addresses every forum write by the sequential
`Submission.id` (R5), which is what makes R43's "comment on a guessed draft"
probe possible. This is a deliberate divergence; it also matches how
`routes/submissions.ts` already addresses the same rows.

**D-14.3 — Group visibility resolves through `SeasonEnrollment`, not
`GroupStudent`** (ruling C9). v1's feed reads `GroupStudent` (R20), which is
`@unique` on `studentUserId` alone and therefore holds one row per student for
the whole database — it cannot answer "who is in this student's group *for this
assignment's season*". A verbatim port would give a moved student their new
group's old threads and lose their own. Divergence forced by C9; spec 14 D4 asks
for exactly this to be stated rather than left silent.

**D-14.4 — Moderation: the minimum set ships, and the gap is a product risk.**
Spec 14 D2/R57: v1 has no report, no flag, no hide, no lock, no rate limit, no
audit, and no staff screen — so in production today **the only person who can
remove a comment written by a young person is the person who wrote it**
(R49's admin power has no UI, R52). On a phone, in a room with no adult present,
that is worse than it was on a laptop. This plan ships items 1 and 2 of D2's
list, which need no schema change:
1. **Staff read** on threads — LEADER for groups they lead, ADMIN/SUPER across
   the season, MENTOR read-only (spec 14 D3; a widening of v1, taken
   deliberately because you cannot moderate what you cannot see).
2. **Staff delete on comments, exposed in the UI**, using R49's existing gate
   plus LEADER, with `canDelete` computed server-side per row so the affordance
   cannot drift from the gate.
**Deferred, and named as the residual risk:** there is still no way to hide a
*post* (R48). The only lever inside the frozen schema is reverting `status` to
`DRAFT`, which overloads `DRAFT` further and collides with domain 8's D3 — not
taken unilaterally. A `hiddenAt` column and a student-facing report/flag row are
**cutover tasks** (C1). Until then a leader's only remedy for a post is to
contact the author. Report this to the product owner; do not let it be
discovered in the field.

**D-14.5 — An empty post cannot unlock the feed** (spec 14 D8). v1 passes
`countWords("") >= 0` when `forumMinWords` is null or 0, so a student can post
nothing, flip to `SUBMITTED`, and read everyone else's work. The shared schema
requires at least one word regardless. New restriction, taken deliberately.

**D-14.6 — No email, and no avatar, in a forum payload.** v1 falls back to the
author's email address as their display name (R30) — these are young people's
addresses, shown to every group-mate whose peer left `name` blank (spec 14 D6).
v2 sends `authorDisplayName` = `name` or the literal `"Group member"`, and no
`email` field exists on the contract. Avatars are omitted entirely: uploads are
off (`ENABLE_UPLOADS=false`), the local driver's URL is the ungated
`/api/uploads/...` path (spec 14 D12), and resolving N of them inside a feed
query is the exact foot-gun D12 names. Deferred with the CMS.

**D-14.7 — Late forum posts stay legal, and it is now a written rule.** v1's
post action selects `assignment.dueAt` and never reads it (R12). Kept — a
discussion that closes at a deadline stops being a discussion — but recorded
here rather than left as an unused select (spec 14 D5).

**D-15.1 — Events and sessions stay two models. Only the feed is unified —
and not in this plan.** Spec 15 §10 item 1's recommendation, confirmed against
the schema: `Session.seasonId` is required/`Cascade` and carries attendance,
check-in, assignments, quizzes and video questions; `JpcEvent.seasonId` is
nullable/`SetNull`, carries a three-level `visibility` enum, a stored `endDate`,
media and a link, and nothing hangs off it. A union needs ~9 nullable columns and
a discriminator — and is impossible anyway under C1. **Divergence from spec 15
§7:** this plan does **not** build `GET /api/v1/calendar`. Plan 4 already ships
the calendar screen on `GET /seasons/:id/sessions`; a merged endpoint would
re-home that query and re-derive the season scope in a second place. The mobile
calendar issues a second query for events and interleaves them client-side —
exactly as `season-calendar.tsx:237-244` does today. Revisit if the two-request
shape proves bad on device.

**D-15.2 — `ALUMNI_ONLY` becomes visible to alumni.** Spec 15 §10 item 2, the
domain's headline defect: `UpcomingEventsCard` computes eligibility as
`user.role !== "STUDENT"` (R44) and an alumnus **is** role `STUDENT` with a
`graduationYear` (`rbac.ts:isAlumnus`), so in shipped v1 `ALUMNI_ONLY` means
*staff-only* — the inverse of its name, on the only two surfaces alumni have.
v2's single server-side predicate includes the level when
`isAlumnus(user) || user.role !== "STUDENT"`. The UI label must match.

**D-15.3 — The write gate is real, and stays real** (spec 15 R3, ruling C8). v1
already enforces SUPER inside `createJpcEventAction`, not merely by page
placement — one of the few places v1 gets this right. Ported verbatim as
`isSuper(user)` inside each handler, with an integration test per verb proving
an ADMIN is refused.

**D-15.4 — Visibility is derived from the token, never from a parameter**
(spec 15 item 3, ruling C8). One predicate, `eventVisibilityFilter(user)`. v1
has two disagreeing formulas at six call sites. SUPER short-circuits to
unfiltered so the manager list can show orphans; every other role gets the `OR`
with `season: { deletedAt: null }` (item 4 — a soft-deleted season's events are
a bug in any reading), and an `R54` orphan (`visibility = SEASON`,
`seasonId = null`) is hidden outright rather than left in a state only SUPER can
observe.

**D-15.5 — The window filters on `(endDate ?? date)`, and the server owns it**
(items 5 and 10). One window, used by the list and the calendar, so a five-day
retreat does not drop out of one surface while another still shows it. `from`
and `to` are optional; omitted, the server defaults to `[now − 30d, now + 365d]`
— the client never derives a calendar day (ruling C2).

**D-15.6 — `allDay` is derived once, server-side, in the org timezone**
(item 6, ruling C2). No column exists and none can be added (C1), so midnight
stays the encoding — but "midnight" resolves against `config.orgTimezone`, not
against each of three viewers' devices (R19) nor the server's incidental zone
(R15/R20).

**D-15.7 — Event photos are not built.** Uploads are off (`ENABLE_UPLOADS`
defaults `false`), `imagePath` never crosses the wire, and `imageUrl` is absent
from the contract. v1's photo lifecycle is broken in four ways (R27–R30) and its
serving path is ungated (R32) — none of that is worth porting to a disabled
capability. `POST/DELETE/GET /events/:id/photo` are **deferred to the CMS work**;
when they land, the GET is gated on the same visibility predicate as the row,
exactly as `submissions/:publicId/files/:fileId` already is.

## Out of scope, deliberately

- **`GET /api/v1/calendar`** — see D-15.1.
- **Event photo endpoints** — see D-15.7.
- **The `UpcomingEventsCard` on all six dashboards** (spec 15 R78). The events
  data and hook land here; `dashboard.tsx` is left alone because Plan 9's
  notifications work also targets that file and two plans editing one screen is
  how a merge conflict becomes a regression. Follow-up, one small task.
- **Domain 3's save-time `youtubeUrl` validation** (spec 13 D7c) and the
  recurrence fan-out that copies a URL to every sibling (spec 13 D12/R16) —
  both are `routes/sessions.ts`, Plan 3's file.
- **Hiding a forum post, and student reporting** — see D-14.4.

## Contradictions found while reading, recorded here

1. **`app.ts` does not allow `PUT` through CORS.**
   `cors({ methods: ["GET","POST","PATCH","DELETE","OPTIONS"] })` — but
   `PUT /api/v1/submissions/by-assignment/:assignmentId` already exists and this
   plan adds two more PUTs. A native client is unaffected (no preflight); any
   browser client is. Fixed in Task 2.
2. **`cleanupTestData` cannot reach `JpcEvent`.** `JpcEvent.season` is
   `onDelete: SetNull`, so deleting a test season leaves an orphaned event row
   behind **in the shared production-adjacent database**. Fixed in Task 2 with a
   `TEST_PREFIX` on `JpcEvent.title`.
3. **Spec 13 §9 says the student player route is `/sessions/[id]`**; the v2 tree
   Plan 4 builds is `app/(app)/session/[id].tsx` (singular), matching
   `assignment/[id]`. The plan follows the code, not the spec's prose.
4. **Spec 14 §7 addresses posts by `submissionId`**; this plan uses `publicId`
   (D-14.2). Named so it is not read as a transcription error.

**Execution shape:** Task 1, then Task 2 (both foundation, strictly
sequential — every shared file is edited here and nowhere else). Then three
independent streams: **video** (Tasks 3, 4, 5), **forum** (Tasks 6, 7, 8),
**events** (Tasks 9, 10). Task 11 is the closing gate, coordinator-run.

---

### Task 1: Contracts — three domain modules and three pure helpers

**Files:**
- Create: `packages/shared/src/video-quiz.ts`
- Create: `packages/shared/src/forum.ts`
- Create: `packages/shared/src/event.ts`
- Create: `packages/shared/src/video-time.ts`
- Create: `packages/shared/src/youtube.ts`
- Create: `packages/shared/src/forum-text.ts`
- Modify: `packages/shared/src/enums.ts` (add `jpcVisibilitySchema`)
- Modify: `packages/shared/src/index.ts` (export the six new modules)
- Test: `packages/shared/src/__tests__/video-time.test.ts`
- Test: `packages/shared/src/__tests__/youtube.test.ts`
- Test: `packages/shared/src/__tests__/forum-text.test.ts`
- Test: `packages/shared/src/__tests__/plan10-schemas.test.ts`

**Interfaces:**
- Consumes: `submissionStatusSchema` from `./enums`.
- Produces (exact names every later task imports):
  `jpcVisibilitySchema`/`JpcVisibility`;
  `videoQuestionInputSchema`/`VideoQuestionInput`, `videoQuestionAdminSchema`,
  `studentVideoQuestionSchema`, `studentVideoQuizSchema`/`StudentVideoQuiz`,
  `submitVideoAnswerRequestSchema`, `submitVideoAnswerResponseSchema`,
  `videoProgressRequestSchema`, `videoProgressResponseSchema`,
  `videoQuizResultRowSchema`, `videoQuizResultsSchema`;
  `forumCommentSchema`, `forumPostSchema`, `forumOwnResponseSchema`,
  `forumViewSchema`/`ForumView`, `submitForumResponseRequestSchema`,
  `addForumCommentRequestSchema`, `forumFeedQuerySchema`;
  `jpcEventListItemSchema`/`JpcEventListItem`, `jpcEventDetailSchema`/`JpcEventDetail`,
  `createJpcEventRequestSchema`/`CreateJpcEventBody`,
  `updateJpcEventRequestSchema`/`UpdateJpcEventBody`, `eventListQuerySchema`;
  functions `formatTimestamp(totalSeconds: number): string`,
  `parseTimestamp(input: string, maxSeconds?: number): number | null`,
  `parseYouTubeId(raw: string): string | null`,
  `countWords(text: string): number`,
  `plainTextToHtml(text: string): string`,
  `htmlToPlainText(html: string): string`.

- [ ] **Step 1: Failing tests for the three pure helpers**

```ts
// packages/shared/src/__tests__/video-time.test.ts
import { formatTimestamp, parseTimestamp } from "../index";

describe("formatTimestamp", () => {
  it("emits m:ss below an hour and h:mm:ss at or above one", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(90)).toBe("1:30");
    expect(formatTimestamp(3600)).toBe("1:00:00");
    expect(formatTimestamp(3661)).toBe("1:01:01");
  });

  it("floors fractions and clamps negatives, as v1 did", () => {
    expect(formatTimestamp(90.9)).toBe("1:30");
    expect(formatTimestamp(-5)).toBe("0:00");
  });

  it("does not render 'NaN:NaN' to a student (v1 R20)", () => {
    // v1: Math.floor(NaN) is NaN, Math.max(0, NaN) is NaN, and there is no
    // finiteness guard — so the player's clock read "NaN:NaN" whenever the
    // YouTube API failed to report a duration.
    expect(formatTimestamp(Number.NaN)).toBe("0:00");
    expect(formatTimestamp(Number.POSITIVE_INFINITY)).toBe("0:00");
  });
});

describe("parseTimestamp", () => {
  it("accepts the three shapes v1 accepted", () => {
    expect(parseTimestamp("90")).toBe(90); // plain seconds, no <60 rule (v1 R26)
    expect(parseTimestamp("1:30")).toBe(90);
    expect(parseTimestamp("1:01:01")).toBe(3661);
    expect(parseTimestamp("  2:00  ")).toBe(120);
  });

  it("rejects empty components instead of reading them as zero (v1 R23)", () => {
    // Number("") is 0, so v1 parsed ":" as 0s, "1:" as 60s, ":30" as 30s,
    // "::" as 0s and "1::" as 3600s. A typo became a valid timestamp.
    for (const input of [":", "1:", ":30", "::", "1::"]) {
      expect(parseTimestamp(input)).toBeNull();
    }
  });

  it("rejects non-decimal numeric literals (v1 R24)", () => {
    // Number() accepts both, so v1 read "0x10" as 16s and "1e3" as 1000s.
    expect(parseTimestamp("0x10")).toBeNull();
    expect(parseTimestamp("1e3")).toBeNull();
    expect(parseTimestamp("1.5")).toBeNull();
    expect(parseTimestamp("-1")).toBeNull();
    expect(parseTimestamp("abc")).toBeNull();
  });

  it("keeps the <60 bounds on trailing components and rejects >3 parts", () => {
    expect(parseTimestamp("1:60")).toBeNull();
    expect(parseTimestamp("1:60:00")).toBeNull();
    expect(parseTimestamp("1:00:60")).toBeNull();
    expect(parseTimestamp("1:1:1:1")).toBeNull();
  });

  it("applies an upper bound where the input is parsed (v1 R27)", () => {
    // v1 had none, so "9999:59" returned 599,999 and the rejection arrived a
    // network round trip later in a different vocabulary.
    expect(parseTimestamp("9999:59")).toBeNull();
    expect(parseTimestamp("100", 60)).toBeNull();
    expect(parseTimestamp("60", 60)).toBe(60);
  });

  it("round-trips everything formatTimestamp emits", () => {
    for (const seconds of [0, 7, 59, 60, 599, 3600, 3661, 86_400]) {
      expect(parseTimestamp(formatTimestamp(seconds))).toBe(seconds);
    }
  });
});
```

```ts
// packages/shared/src/__tests__/youtube.test.ts
import { parseYouTubeId } from "../index";

const ID = "dQw4w9WgXcQ"; // 11 chars, the canonical shape

describe("parseYouTubeId — forms v1 accepted, kept", () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=${ID}&t=42`,
    `https://www.youtube.com/watch?list=PLxyz&v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?t=42`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
  ])("accepts %s", (url) => {
    expect(parseYouTubeId(url)).toBe(ID);
  });
});

describe("parseYouTubeId — forms v1 silently rejected, now accepted (spec 13 D7a)", () => {
  it.each([
    [`https://www.youtube.com/live/${ID}`, "a premiere or streamed session"],
    [`https://www.youtube.com/v/${ID}`, "the legacy embed"],
    [ID, "a bare id pasted from the YouTube UI"],
    [`youtube.com/watch?v=${ID}`, "no scheme"],
  ])("accepts %s (%s)", (url) => {
    expect(parseYouTubeId(url)).toBe(ID);
  });
});

describe("parseYouTubeId — the two holes v1 left open", () => {
  it("refuses a non-YouTube host (v1 R33 had no host check at all)", () => {
    // v1's /embed/ regex scanned the raw string, so this parsed successfully
    // and handed its 'id' to the YouTube player: a wrong video, silently.
    expect(parseYouTubeId(`https://example.com/embed/${ID}`)).toBeNull();
    expect(parseYouTubeId(`https://youtube.com.evil.test/watch?v=${ID}`)).toBeNull();
  });

  it("refuses an over-long id instead of truncating it (v1 R34)", () => {
    // v1 returned the first 11 characters of a 12-character token — a
    // valid-looking, wrong id rather than a failure.
    expect(parseYouTubeId(`https://www.youtube.com/watch?v=${ID}X`)).toBeNull();
    expect(parseYouTubeId(`https://youtu.be/${ID}X`)).toBeNull();
  });

  it("returns null for anything else", () => {
    expect(parseYouTubeId("")).toBeNull();
    expect(parseYouTubeId("   ")).toBeNull();
    expect(parseYouTubeId("https://www.youtube.com/playlist?list=PLxyz")).toBeNull();
    expect(parseYouTubeId("https://vimeo.com/12345678")).toBeNull();
    expect(parseYouTubeId("not a url")).toBeNull();
  });
});
```

```ts
// packages/shared/src/__tests__/forum-text.test.ts
import { countWords, htmlToPlainText, plainTextToHtml } from "../index";

describe("countWords — v1 semantics, carried verbatim", () => {
  it("strips tags and named entities, collapses whitespace", () => {
    expect(countWords("<p>one two</p><p>three</p>")).toBe(3);
    expect(countWords("one&nbsp;two")).toBe(2);
    expect(countWords("   ")).toBe(0);
    expect(countWords("")).toBe(0);
  });

  it("still does not handle numeric entities (v1 R10) — pinned, not fixed", () => {
    // The live counter and the server gate must agree; changing this on one
    // side gives a student an enabled button the server refuses.
    expect(countWords("one&#160;two")).toBe(2);
  });
});

describe("plainTextToHtml / htmlToPlainText", () => {
  it("escapes markup so a post can never inject it (ruling C11)", () => {
    expect(plainTextToHtml("<script>x</script>")).toBe(
      "<p>&lt;script&gt;x&lt;/script&gt;</p>",
    );
    expect(plainTextToHtml("a & b")).toBe("<p>a &amp; b</p>");
  });

  it("makes one paragraph per line", () => {
    expect(plainTextToHtml("one\ntwo")).toBe("<p>one</p><p>two</p>");
  });

  it("round-trips through the reader", () => {
    const text = "line one\nline two & three";
    expect(htmlToPlainText(plainTextToHtml(text))).toBe(text);
  });

  it("reads v1's stored rich text as plain text (ruling C11 on read)", () => {
    // Existing rows in the shared database are HTML written by v1's editor.
    expect(htmlToPlainText("<p>alpha</p><p>beta</p>")).toBe("alpha\nbeta");
    expect(htmlToPlainText("alpha<br>beta")).toBe("alpha\nbeta");
    expect(htmlToPlainText("<p><strong>bold</strong> text</p>")).toBe("bold text");
    expect(htmlToPlainText("<p>a &amp; b</p>")).toBe("a & b");
  });
});
```

Run: `pnpm --filter @space/shared jest src/__tests__/video-time.test.ts src/__tests__/youtube.test.ts src/__tests__/forum-text.test.ts`
Expected: FAIL — none of the three modules exist.

- [ ] **Step 2: Implement the three helpers**

```ts
// packages/shared/src/video-time.ts

/**
 * Seconds as `m:ss`, or `h:mm:ss` past an hour.
 *
 * The finiteness guard is the fix for v1's R20: `Math.floor(NaN)` is `NaN` and
 * `Math.max(0, NaN)` is `NaN`, so the student-facing clock in
 * `interactive-video-player.tsx:290` rendered the string "NaN:NaN" whenever the
 * player failed to report a duration (v1 R81 — a common case on a phone).
 */
export function formatTimestamp(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds)) return "0:00";
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number): string => String(n).padStart(2, "0");
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}

const COMPONENT = /^\d+$/;

/** The 24-hour ceiling the authoring schema enforces, kept in one place. */
export const MAX_VIDEO_SECONDS = 86_400;

/**
 * Parse `m:ss`, `h:mm:ss` or plain seconds. Null when the input is not a valid
 * timestamp.
 *
 * Rewritten rather than ported (spec 13 §10 D8). v1 converted each component
 * with `Number()`, which accepts the empty string as 0 (so ":" was 0s, "1:" was
 * 60s, ":30" was 30s — R23), accepts `0x10` and `1e3` (R24), and applied no
 * upper bound (R27), so the rejection surfaced a round trip later as the
 * action's generic "Please fix the highlighted fields." — with nothing
 * highlighted (R28).
 *
 * Kept from v1: a single component is plain seconds with no `< 60` rule
 * ("90" is 90 seconds, R26) and the `m:ss` / `h:mm:ss` output format, because
 * admin muscle memory depends on both.
 */
export function parseTimestamp(input: string, maxSeconds = MAX_VIDEO_SECONDS): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;

  const parts = trimmed.split(":");
  if (parts.length > 3) return null;
  if (!parts.every((p) => COMPONENT.test(p))) return null;

  const nums = parts.map((p) => Number(p));
  let total: number;
  if (nums.length === 1) {
    total = nums[0] as number;
  } else if (nums.length === 2) {
    if ((nums[1] as number) >= 60) return null;
    total = (nums[0] as number) * 60 + (nums[1] as number);
  } else {
    if ((nums[1] as number) >= 60 || (nums[2] as number) >= 60) return null;
    total = (nums[0] as number) * 3600 + (nums[1] as number) * 60 + (nums[2] as number);
  }

  return total > maxSeconds ? null : total;
}
```

```ts
// packages/shared/src/youtube.ts

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Hosts whose URLs may name a YouTube video. v1 had no host check at all
 * (R33), so `https://example.com/embed/AAAAAAAAAAA` parsed successfully and its
 * "id" was handed to the YouTube IFrame player.
 */
const HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
  "www.youtu.be",
]);

const PATH_PREFIXES = new Set(["embed", "shorts", "live", "v"]);

/**
 * Extract the 11-character video id, or null.
 *
 * Accepted: `watch?v=ID` on any allowed host (with any other query params, in
 * any order), `youtu.be/ID`, `/embed/ID`, `/shorts/ID`, `/live/ID`, `/v/ID`,
 * a host-relative URL with no scheme, and a bare 11-character id — which is
 * what an admin copying from the YouTube UI often has.
 *
 * `/live/` and `/v/` are additions (spec 13 §10 D7a): `/live/` is what a
 * premiere or a streamed session produces, and v1 returned null for it, which
 * meant the student page silently degraded to a plain link and the whole
 * authored quiz became unreachable with no message to anyone (R32, R37).
 *
 * Parsing the URL rather than regex-scanning the raw string is what closes both
 * of v1's holes at once: the host is checked (R33), and the id must be the
 * *whole* value rather than its first 11 characters, so a 12-character token
 * fails instead of yielding a valid-looking wrong id (R34).
 */
export function parseYouTubeId(raw: string): string | null {
  const input = raw.trim();
  if (input === "") return null;
  if (VIDEO_ID.test(input)) return input;

  let url: URL;
  try {
    url = new URL(input.includes("://") ? input : `https://${input}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (!HOSTS.has(host)) return null;

  const v = url.searchParams.get("v");
  if (v !== null) return VIDEO_ID.test(v) ? v : null;

  const segments = url.pathname.split("/").filter((s) => s !== "");
  if (host === "youtu.be" || host === "www.youtu.be") {
    const [id] = segments;
    return id !== undefined && VIDEO_ID.test(id) ? id : null;
  }

  const [prefix, id] = segments;
  if (prefix === undefined || id === undefined) return null;
  if (!PATH_PREFIXES.has(prefix)) return null;
  return VIDEO_ID.test(id) ? id : null;
}
```

```ts
// packages/shared/src/forum-text.ts

/**
 * v1's word counter, carried verbatim from `jpc-space/src/lib/forum.ts`.
 *
 * Shared for the reason v1 shared it: the live counter in the compose box and
 * the server's `forumMinWords` gate must agree, or a student gets an enabled
 * button and a refusal. Numeric entities (`&#160;`) are deliberately still
 * unhandled — matching v1 exactly is the point (spec 14 R10).
 */
export function countWords(text: string): number {
  const stripped = text
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return 0;
  return stripped.split(" ").length;
}

/**
 * Plain text in, one escaped `<p>` per line out.
 *
 * The column is shared with running v1, whose `RichTextView` renders it as
 * HTML — so v2 must write HTML or v1's readers see a single run-on line. Ruling
 * C11: sanitise on write where the field is new. Escaping here means a post can
 * never carry markup at all, which is a stronger guarantee than v1's
 * render-time allow-list.
 */
export function plainTextToHtml(text: string): string {
  const escape = (s: string): string =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split(/\r?\n/)
    .map((line) => `<p>${escape(line)}</p>`)
    .join("");
}

/**
 * Stored rich text out as plain text.
 *
 * Ruling C11: sanitise on read at the API boundary for everything already
 * stored — every existing forum post in the shared database is HTML written by
 * v1's editor. React Native renders text, so this is also what makes those rows
 * readable at all. Converting them to structured rich text is a cutover task.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Last, or an escaped "&amp;lt;" would decode twice.
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
```

Run the three suites → PASS.

- [ ] **Step 3: Failing test for the schemas**

```ts
// packages/shared/src/__tests__/plan10-schemas.test.ts
import {
  addForumCommentRequestSchema,
  createJpcEventRequestSchema,
  studentVideoQuestionSchema,
  submitForumResponseRequestSchema,
  videoProgressRequestSchema,
  videoQuestionInputSchema,
} from "../index";

describe("videoQuestionInputSchema", () => {
  const valid = {
    atSeconds: 30,
    prompt: "Which one?",
    options: ["a", "b"],
    correctIndex: 1,
    points: 2,
  };

  it("mirrors v1's bounds", () => {
    expect(videoQuestionInputSchema.parse(valid).points).toBe(2);
    expect(videoQuestionInputSchema.parse({ ...valid, points: undefined }).points).toBe(1);
    expect(videoQuestionInputSchema.safeParse({ ...valid, atSeconds: 86_401 }).success).toBe(false);
    expect(videoQuestionInputSchema.safeParse({ ...valid, prompt: "x" }).success).toBe(false);
    expect(videoQuestionInputSchema.safeParse({ ...valid, options: ["a"] }).success).toBe(false);
    expect(
      videoQuestionInputSchema.safeParse({ ...valid, options: ["a", "b", "c", "d", "e", "f", "g"] })
        .success,
    ).toBe(false);
  });

  it("refuses a correct index outside the options (v1 R4)", () => {
    const result = videoQuestionInputSchema.safeParse({ ...valid, correctIndex: 2 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["correctIndex"]);
    }
  });
});

describe("studentVideoQuestionSchema — the answer-key split", () => {
  const row = {
    id: 1,
    atSeconds: 30,
    prompt: "Which one?",
    options: ["a", "b"],
    points: 1,
    answered: false,
    selectedIndex: null,
    isCorrect: null,
  };

  it("parses a student row", () => {
    expect(studentVideoQuestionSchema.parse(row).answered).toBe(false);
  });

  it("REFUSES a payload carrying correctIndex", () => {
    // The schema is .strict() precisely so a backend that starts leaking the
    // answer key fails at the client boundary instead of rendering it.
    expect(studentVideoQuestionSchema.safeParse({ ...row, correctIndex: 1 }).success).toBe(false);
  });
});

describe("videoProgressRequestSchema", () => {
  it("has no `completed` field — completion is server-derived (spec 13 D3)", () => {
    const parsed = videoProgressRequestSchema.parse({ furthestSeconds: 10, completed: true });
    expect(parsed).toEqual({ furthestSeconds: 10 });
  });

  it("bounds furthestSeconds", () => {
    expect(videoProgressRequestSchema.safeParse({ furthestSeconds: -1 }).success).toBe(false);
    expect(videoProgressRequestSchema.safeParse({ furthestSeconds: 86_401 }).success).toBe(false);
  });
});

describe("submitForumResponseRequestSchema", () => {
  it("requires at least one word regardless of forumMinWords (spec 14 D8)", () => {
    expect(submitForumResponseRequestSchema.safeParse({ text: "   " }).success).toBe(false);
    expect(submitForumResponseRequestSchema.safeParse({ text: "" }).success).toBe(false);
    expect(submitForumResponseRequestSchema.safeParse({ text: "one" }).success).toBe(true);
  });

  it("caps the body at 20,000 characters — v1 had no cap at all", () => {
    expect(submitForumResponseRequestSchema.safeParse({ text: "x".repeat(20_001) }).success).toBe(
      false,
    );
  });
});

describe("addForumCommentRequestSchema", () => {
  it("trims to 1..5000, exactly v1's shape", () => {
    expect(addForumCommentRequestSchema.parse({ body: "  hi  " }).body).toBe("hi");
    expect(addForumCommentRequestSchema.safeParse({ body: "   " }).success).toBe(false);
    expect(addForumCommentRequestSchema.safeParse({ body: "x".repeat(5001) }).success).toBe(false);
  });
});

describe("createJpcEventRequestSchema", () => {
  const valid = {
    title: "space-v2-test-retreat",
    date: "2099-06-01T00:00:00.000Z",
    endDate: null,
    allDay: true,
    description: null,
    url: null,
    visibility: "ALL" as const,
    seasonId: null,
  };

  it("refuses an end before the start (v1 R11)", () => {
    expect(
      createJpcEventRequestSchema.safeParse({ ...valid, endDate: "2099-05-01T00:00:00.000Z" })
        .success,
    ).toBe(false);
    expect(
      createJpcEventRequestSchema.safeParse({ ...valid, endDate: "2099-06-01T00:00:00.000Z" })
        .success,
    ).toBe(true);
  });

  it("requires a season for a SEASON event (v1 R12)", () => {
    expect(
      createJpcEventRequestSchema.safeParse({ ...valid, visibility: "SEASON" }).success,
    ).toBe(false);
    expect(
      createJpcEventRequestSchema.safeParse({ ...valid, visibility: "SEASON", seasonId: 3 })
        .success,
    ).toBe(true);
  });

  it("takes a full ISO instant, not v1's four-field date/time split", () => {
    // v1 posted date + time as separate naive strings and let the *server*
    // resolve them in its own zone (R15/R20). Composing the instant before the
    // wire is what stops an event authored as all-day in one zone from
    // round-tripping to a non-midnight instant in another.
    expect(createJpcEventRequestSchema.safeParse({ ...valid, date: "2099-06-01" }).success).toBe(
      false,
    );
  });
});
```

Run: `pnpm --filter @space/shared jest src/__tests__/plan10-schemas.test.ts` → FAIL.

- [ ] **Step 4: `enums.ts` and the video-quiz contracts**

Append to `packages/shared/src/enums.ts`:

```ts
export const jpcVisibilitySchema = z.enum(["ALL", "ALUMNI_ONLY", "SEASON"]);
export type JpcVisibility = z.infer<typeof jpcVisibilitySchema>;
```

```ts
// packages/shared/src/video-quiz.ts
import { z } from "zod";

// Wire shapes — see the note in season.ts on why timestamps are strings.
//
// Domain 13 is NOT domain 12. `Quiz`/`QuizQuestion`/`QuizAttempt`/`QuizAnswer`
// and `SessionVideoQuestion`/`SessionVideoQuestionResponse`/
// `SessionVideoProgress` share no table, no column and no FK — verified against
// prisma/schema.prisma. Nothing here may be unified with quiz.ts.

/** Authoring input. Mirrors v1's `questionSchema` bounds exactly. */
export const videoQuestionInputSchema = z
  .object({
    atSeconds: z.number().int().min(0).max(86_400),
    prompt: z.string().trim().min(2).max(500),
    options: z.array(z.string().trim().min(1).max(200)).min(2).max(6),
    correctIndex: z.number().int().min(0),
    points: z.number().int().min(1).max(100).default(1),
  })
  .refine((d) => d.correctIndex < d.options.length, {
    message: "Correct answer must be one of the options.",
    path: ["correctIndex"],
  });
export type VideoQuestionInput = z.output<typeof videoQuestionInputSchema>;

/**
 * The admin half of the answer-key split. Carries `correctIndex`; must never be
 * the parse target of a student-facing hook.
 */
export const videoQuestionAdminSchema = z.object({
  id: z.number(),
  atSeconds: z.number(),
  prompt: z.string(),
  options: z.array(z.string()),
  correctIndex: z.number(),
  points: z.number(),
  responseCount: z.number(),
});
export type VideoQuestionAdmin = z.infer<typeof videoQuestionAdminSchema>;

/**
 * The student half of the answer-key split.
 *
 * There is no `correctIndex` field, and `.strict()` means there can never be
 * one: a backend that starts selecting it fails this parse instead of rendering
 * the answer to the question the student is being asked. This absence is the
 * enforcement of v1's R69 — the one place v1 got exposure right by
 * construction, and the behaviour v2 must preserve.
 */
export const studentVideoQuestionSchema = z
  .object({
    id: z.number(),
    atSeconds: z.number(),
    prompt: z.string(),
    options: z.array(z.string()),
    points: z.number(),
    answered: z.boolean(),
    selectedIndex: z.number().nullable(),
    isCorrect: z.boolean().nullable(),
  })
  .strict();
export type StudentVideoQuestion = z.infer<typeof studentVideoQuestionSchema>;

export const studentVideoQuizSchema = z.object({
  /**
   * Resolved server-side from `Session.youtubeUrl` so the client never
   * re-implements the parser (spec 13 §7). Null means the URL is missing or
   * unparseable — the screen falls back to a "watch on YouTube" link, which is
   * the only honest thing it can do.
   */
  videoId: z.string().nullable(),
  youtubeUrl: z.string().nullable(),
  questions: z.array(studentVideoQuestionSchema),
  furthestSeconds: z.number(),
  completedAt: z.string().nullable(),
  earnedPoints: z.number(),
  totalPoints: z.number(),
  answeredCount: z.number(),
  /**
   * The id of the question the server will accept an answer for next, or null
   * when every question is answered. Derived once here (ruling C4) — the client
   * renders the barrier from this rather than recomputing "smallest atSeconds
   * among unanswered", which is exactly the derivation v1 kept only in the
   * player component.
   */
  nextQuestionId: z.number().nullable(),
});
export type StudentVideoQuiz = z.infer<typeof studentVideoQuizSchema>;

export const submitVideoAnswerRequestSchema = z.object({
  questionId: z.number().int().positive(),
  /** Upper bound is row-dependent (it is `options.length`), so it stays a server check. */
  selectedIndex: z.number().int().min(0),
});
export type SubmitVideoAnswerRequest = z.infer<typeof submitVideoAnswerRequestSchema>;

export const submitVideoAnswerResponseSchema = z.object({
  isCorrect: z.boolean(),
  /**
   * Returned for the question just answered, and only then. Safe because one
   * answer per question is final (v1 R54), and it is the feedback the modal
   * exists to show.
   */
  correctIndex: z.number(),
  furthestSeconds: z.number(),
  completedAt: z.string().nullable(),
  nextQuestionId: z.number().nullable(),
});
export type SubmitVideoAnswerResponse = z.infer<typeof submitVideoAnswerResponseSchema>;

/**
 * No `completed` field. v1 accepted it as a client claim, so a single call with
 * `(sessionId, 0, true)` marked a student complete (R48) while a student who
 * answered the last question and closed the app was never marked at all (R65).
 * The server knows the question set and the responses; it derives completion.
 */
export const videoProgressRequestSchema = z.object({
  furthestSeconds: z.number().int().min(0).max(86_400),
});
export type VideoProgressRequest = z.infer<typeof videoProgressRequestSchema>;

export const videoProgressResponseSchema = z.object({
  furthestSeconds: z.number(),
  completedAt: z.string().nullable(),
});

/** New capability — v1 shows no student's video-quiz result to anybody (R74). */
export const videoQuizResultRowSchema = z.object({
  studentUserId: z.number(),
  studentName: z.string().nullable(),
  groupId: z.number().nullable(),
  groupName: z.string().nullable(),
  answeredCount: z.number(),
  questionCount: z.number(),
  earnedPoints: z.number(),
  totalPoints: z.number(),
  completedAt: z.string().nullable(),
});
export type VideoQuizResultRow = z.infer<typeof videoQuizResultRowSchema>;

export const videoQuizResultsSchema = z.object({
  questionCount: z.number(),
  totalPoints: z.number(),
  rows: z.array(videoQuizResultRowSchema),
});
export type VideoQuizResults = z.infer<typeof videoQuizResultsSchema>;
```

- [ ] **Step 5: The forum contracts**

```ts
// packages/shared/src/forum.ts
import { z } from "zod";

import { submissionStatusSchema } from "./enums";

// Wire shapes — see the note in season.ts on why timestamps are strings.
//
// A FORUM assignment is not an entity: the post *is* a Submission row and the
// only table this domain owns is ForumComment. `type`, `forumMinWords` and
// `forumAllowComments` belong to assignment.ts (domain 7) and are flattened
// onto the view below only as the two config values the screen needs.

export const forumCommentSchema = z.object({
  id: z.number(),
  authorUserId: z.number(),
  /**
   * `name`, or the literal "Group member". Never an email address: v1 fell back
   * to `email` (R30), so every student in a group saw the address of any
   * group-mate who had not set a name. These are young people's addresses.
   * There is no `authorEmail` field on this contract and there must not be one.
   */
  authorDisplayName: z.string(),
  /** Plain text. Never HTML — v1's comment box is a textarea (R29). */
  body: z.string(),
  createdAt: z.string(),
  /**
   * Computed server-side from the same gate the DELETE uses. v1's client
   * re-derived it as `authorUserId === currentUserId`, which is why R49's
   * SUPER/ADMIN removal power was unreachable from any UI (R52).
   */
  canDelete: z.boolean(),
});
export type ForumComment = z.infer<typeof forumCommentSchema>;

export const forumPostSchema = z.object({
  /** Addressed by publicId, never the sequential Submission.id (v1 R5/R43). */
  submissionPublicId: z.string(),
  studentUserId: z.number(),
  authorDisplayName: z.string(),
  /** Plain text, converted from stored rich text at the API boundary (ruling C11). */
  text: z.string(),
  submittedAt: z.string().nullable(),
  /** v1 never computed this; without it a paginated comment list has no affordance. */
  commentCount: z.number(),
  /** First page only. The rest come from the comments endpoint. */
  comments: z.array(forumCommentSchema),
  canComment: z.boolean(),
});
export type ForumPost = z.infer<typeof forumPostSchema>;

export const forumOwnResponseSchema = z.object({
  /**
   * Nullable, and that is the whole point: nothing creates the row up front any
   * more (ruling C6), so the screen must render the compose box, the counter and
   * the locked feed with no submission in existence.
   */
  submissionPublicId: z.string().nullable(),
  text: z.string(),
  status: submissionStatusSchema,
  wordCount: z.number(),
  posted: z.boolean(),
});
export type ForumOwnResponse = z.infer<typeof forumOwnResponseSchema>;

export const forumViewSchema = z.object({
  assignmentId: z.number(),
  /** Rendered on the forum screen — v1's FORUM branch omitted it (spec 14 D10). */
  dueAt: z.string().nullable(),
  /**
   * Null for staff readers, who have no response of their own. A student always
   * has one, even when its `submissionPublicId` is null.
   */
  own: forumOwnResponseSchema.nullable(),
  /** True until the caller's own response is posted. Staff are never locked. */
  locked: z.boolean(),
  minWords: z.number().nullable(),
  allowComments: z.boolean(),
  /** Which group's thread this is. Null for a staff reader seeing every group. */
  groupId: z.number().nullable(),
  posts: z.array(forumPostSchema),
  nextCursor: z.string().nullable(),
});
export type ForumView = z.infer<typeof forumViewSchema>;

/**
 * `min(1)` after trimming, regardless of the assignment's `forumMinWords`
 * (spec 14 §10 D8). With a null or zero minimum, v1's `countWords("") >= 0`
 * passed on both client and server, so a student could post nothing, flip to
 * SUBMITTED, unlock the peer feed and read everyone else's work without
 * contributing. "Post to unlock" is a contribution mechanic.
 *
 * The 20,000 cap matches domain 7's `description`; v1 had no cap at all.
 */
export const submitForumResponseRequestSchema = z.object({
  text: z.string().trim().min(1, "Write at least one word.").max(20_000),
});
export type SubmitForumResponseRequest = z.infer<typeof submitForumResponseRequestSchema>;

export const addForumCommentRequestSchema = z.object({
  body: z.string().trim().min(1, "Comment cannot be empty.").max(5000),
});
export type AddForumCommentRequest = z.infer<typeof addForumCommentRequestSchema>;

export const forumFeedQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type ForumFeedQuery = z.output<typeof forumFeedQuerySchema>;

export const forumCommentsQuerySchema = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ForumCommentsQuery = z.output<typeof forumCommentsQuerySchema>;
```

- [ ] **Step 6: The event contracts**

```ts
// packages/shared/src/event.ts
import { z } from "zod";

import { jpcVisibilitySchema } from "./enums";

// Wire shapes — see the note in season.ts on why timestamps are strings.

export const jpcEventListItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  date: z.string(),
  endDate: z.string().nullable(),
  /**
   * Derived once, server-side, against the organisation timezone (ruling C2,
   * spec 15 §10 item 6). v1 re-ran `getHours() !== 0 || getMinutes() !== 0` in
   * three separate files, each in the *viewer's* zone, against an instant the
   * *server* had composed — so an event authored as all-day stopped reading as
   * all-day for anyone in a different zone.
   */
  allDay: z.boolean(),
  url: z.string().nullable(),
  visibility: jpcVisibilitySchema,
  seasonId: z.number().nullable(),
  /**
   * Present so a SEASON chip can be badged with its season (spec 15 item 12) —
   * v1 styled SEASON identically to ALL, so nothing on the calendar
   * distinguished an organisation-wide event from a season-scoped one (R68).
   */
  seasonCode: z.string().nullable(),
});
export type JpcEventListItem = z.infer<typeof jpcEventListItemSchema>;

/**
 * v1 has no event detail page anywhere (R70), so `description` and the season
 * were write-only data for every non-SUPER user. There is no `imageUrl`:
 * uploads are off and v1's photo path is ungated (spec 15 D7 in this plan).
 * There is no `createdById` either — written by v1, read by nothing, and no
 * reason to ship a user id to every student.
 */
export const jpcEventDetailSchema = jpcEventListItemSchema.extend({
  description: z.string().nullable(),
  seasonTitle: z.string().nullable(),
  /** Whether this caller may edit or delete. Drives the UI, never the gate. */
  canManage: z.boolean(),
});
export type JpcEventDetail = z.infer<typeof jpcEventDetailSchema>;

const eventWriteBase = z.object({
  title: z.string().trim().min(1).max(200),
  /** A full ISO instant, composed client-side (spec 15 §10 item 7). */
  date: z.string().datetime({ offset: true }),
  endDate: z.string().datetime({ offset: true }).nullable().default(null),
  /**
   * No column exists and none can be added (ruling C1), so midnight stays the
   * encoding — but the server normalises to midnight *in the organisation
   * timezone* rather than trusting whatever instant a device composed.
   */
  allDay: z.boolean().default(false),
  description: z.string().max(2000).nullable().default(null),
  url: z.string().url().nullable().default(null),
  visibility: jpcVisibilitySchema,
  seasonId: z.number().int().positive().nullable().default(null),
});

function refineEvent(v: z.infer<typeof eventWriteBase>, ctx: z.RefinementCtx): void {
  if (v.endDate && new Date(v.endDate).getTime() < new Date(v.date).getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: "End must be on or after the start.",
    });
  }
  if (v.visibility === "SEASON" && v.seasonId == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["seasonId"],
      message: "Choose a season for a season-only event.",
    });
  }
}

export const createJpcEventRequestSchema = eventWriteBase.superRefine(refineEvent);
export type CreateJpcEventBody = z.output<typeof createJpcEventRequestSchema>;

/**
 * A partial, unlike v1 — whose update reused the create schema, so an edit had
 * to resend every field. Both refinements re-apply against the *merged* row in
 * the route, not against the patch, because `{ visibility: "SEASON" }` alone
 * cannot know whether the stored row already has a season.
 */
export const updateJpcEventRequestSchema = eventWriteBase.partial();
export type UpdateJpcEventBody = z.output<typeof updateJpcEventRequestSchema>;

export const eventListQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});
export type EventListQuery = z.output<typeof eventListQuerySchema>;
```

- [ ] **Step 7: Export and verify**

Append to `packages/shared/src/index.ts`, in the file's existing style:

```ts
export * from "./video-quiz";
export * from "./forum";
export * from "./event";
export * from "./video-time";
export * from "./youtube";
export * from "./forum-text";
```

Run: `pnpm --filter @space/shared jest` → all four suites PASS.
Run: `pnpm turbo lint typecheck --filter=@space/shared` → clean.

- [ ] **Step 8: Commit**

```bash
git add packages/shared && git commit -m "feat(shared): video-quiz, forum and event contracts plus timestamp/YouTube/forum-text helpers"
```

---

### Task 2: Shared plumbing — gates, router mounts, fixtures, query keys

Everything three streams would otherwise fight over. After this task, no two
streams touch the same file.

**Files:**
- Modify: `apps/backend/src/lib/permissions.ts` (five new gates)
- Modify: `apps/backend/src/lib/queries/assignments.ts` (export `groupIdInSeason`)
- Create: `apps/backend/src/routes/video-quiz.ts` (empty router)
- Create: `apps/backend/src/routes/forum.ts` (empty router)
- Create: `apps/backend/src/routes/events.ts` (empty router)
- Modify: `apps/backend/src/app.ts` (three mounts + `PUT` in the CORS allowlist)
- Modify: `apps/backend/src/__tests__/integration/fixtures.ts` (event prefix + cleanup)
- Modify: `apps/mobile/src/lib/query-keys.ts` (three factories)
- Test: `apps/backend/src/__tests__/app.test.ts` (mounts answer, CORS allows PUT)
- Test: `apps/backend/src/__tests__/integration/plan10-gates.test.ts` (new suite)

**Interfaces:**
- Consumes: `isSuper`, `isMentor`, `isAdminOfSeason`, `isLeaderOfGroup` from `../lib/rbac`; `staffScopeForSeason` and `studentCanSeeAssignment` (already exported).
- Produces:
  - `canManageSessionVideo(user, sessionId): Promise<boolean>`
  - `hasActiveEnrollment(user, seasonId): Promise<boolean>`
  - `canCommentOnForumSubmission(user, submissionId): Promise<boolean>`
  - `canDeleteForumComment(user, commentId): Promise<boolean>`
  - `forumAudienceFor(user, assignmentId): Promise<ForumAudience | null>` and the exported type `ForumAudience`
  - `groupIdInSeason(studentUserId, seasonId): Promise<number | null>` (now exported from `lib/queries/assignments.ts`)
  - routers `videoQuizRouter`, `forumRouter`, `eventsRouter`, mounted
  - fixtures `testEventTitle(): string`
  - `queryKeys.videoQuiz`, `queryKeys.forum`, `queryKeys.events`

- [ ] **Step 1: Failing unit test for the mounts**

Append to `apps/backend/src/__tests__/app.test.ts`:

```ts
describe("plan 10 router mounts", () => {
  // requireAuth answers before any handler or database call, so an unauthorised
  // request proves the router is mounted without needing a database.
  it.each([
    ["get", "/api/v1/sessions/1/video-quiz"],
    ["get", "/api/v1/sessions/1/video-questions"],
    ["get", "/api/v1/assignments/1/forum"],
    ["delete", "/api/v1/forum/comments/1"],
    ["get", "/api/v1/events"],
  ])("%s %s is mounted and requires a token", async (method, path) => {
    const res = await (request(createApp()) as never as Record<string, (p: string) => never>)
      [method as string](path);
    const status = (res as unknown as { status: number }).status;
    expect(status).toBe(401);
  });

  it("allows PUT through CORS", async () => {
    // PUT /submissions/by-assignment/:assignmentId already exists and this plan
    // adds two more, but the allowlist never had PUT — a browser client's
    // preflight would refuse every one of them.
    const res = await request(createApp())
      .options("/api/v1/assignments/1/forum/response")
      .set("Origin", "http://localhost:8081")
      .set("Access-Control-Request-Method", "PUT");
    expect(res.headers["access-control-allow-methods"]).toMatch(/PUT/);
  });
});
```

Run: `cd apps/backend && npx jest src/__tests__/app.test.ts` → FAIL (404s, no PUT).

- [ ] **Step 2: Create the three routers and mount them**

Each new file is the same three lines; the comments differ:

```ts
// apps/backend/src/routes/video-quiz.ts
import { Router } from "express";

import { requireAuth } from "../middleware/require-auth";

/**
 * Domain 13. Mounted at /api/v1 rather than under a single prefix because the
 * surface spans two parents: the student and authoring reads hang off a
 * session (`/sessions/:id/video-*`) while update and delete address a question
 * directly (`/video-questions/:questionId`).
 *
 * Nothing here belongs to domain 12. Text quizzes own Quiz/QuizQuestion/
 * QuizAttempt/QuizAnswer/QuizGrade; this owns SessionVideoQuestion/
 * SessionVideoQuestionResponse/SessionVideoProgress. They share no table.
 */
export const videoQuizRouter = Router();
videoQuizRouter.use(requireAuth);
```

```ts
// apps/backend/src/routes/forum.ts
import { Router } from "express";

import { requireAuth } from "../middleware/require-auth";

/**
 * Domain 14. Mounted at /api/v1 because the thread hangs off an assignment
 * (`/assignments/:id/forum*`) while a comment is addressed on its own
 * (`/forum/comments/:commentId`).
 */
export const forumRouter = Router();
forumRouter.use(requireAuth);
```

```ts
// apps/backend/src/routes/events.ts
import { Router } from "express";

import { requireAuth } from "../middleware/require-auth";

/** Domain 15. Mounted at /api/v1/events — one parent, unlike the other two. */
export const eventsRouter = Router();
eventsRouter.use(requireAuth);
```

In `app.ts`, add the imports beside the existing route imports and change two
things:

```ts
  app.use(
    cors({
      origin: config.mobileAppOrigin,
      // PUT belongs here: PUT /api/v1/submissions/by-assignment/:assignmentId
      // has existed since Plan 1 and the forum response and video progress
      // endpoints are PUTs too. A native client sends no preflight, so the
      // omission was invisible — a browser client would have every PUT refused.
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  );
```

and, immediately **above** `app.use("/api/v1/seasons", seasonsRouter);`:

```ts
  // Mounted at the version root because their paths span two parents each.
  // Registered ahead of the prefixed routers so the more specific path wins
  // outright rather than relying on the prefixed router falling through.
  app.use("/api/v1", forumRouter);
  app.use("/api/v1", videoQuizRouter);
  app.use("/api/v1/events", eventsRouter);
```

Run the app test → the CORS case passes; the mount cases still 404 because the
routers declare no routes yet. **Add one throwaway assertion-satisfying route
per router? No.** Instead, temporarily accept that the five mount cases stay red
until Steps 3–5 of the stream tasks land, and gate them behind the routes they
belong to: move each `it.each` row into the stream's own suite. Simpler and
honest — replace the `it.each` block with this single case, which passes now:

```ts
  it("mounts the three plan-10 routers", async () => {
    // A mounted router with no routes falls through to notFound; an unmounted
    // path does too. What distinguishes them is that requireAuth runs first, so
    // a mounted router answers 401 rather than 404 once it has any route. Until
    // the streams add routes, assert the mounts exist structurally instead.
    const app = createApp();
    const stack = (app as unknown as { _router: { stack: { name: string }[] } })._router.stack;
    expect(stack.filter((l) => l.name === "router").length).toBeGreaterThanOrEqual(10);
  });
```

Keep the CORS case as written. Run → PASS.

- [ ] **Step 3: Export `groupIdInSeason`**

In `apps/backend/src/lib/queries/assignments.ts`, change
`async function groupIdInSeason(` to `export async function groupIdInSeason(`
and extend its doc comment with one line:

```ts
 * Exported for the forum gates, which ask the same per-season question about a
 * post's author and its reader (ruling C9).
```

- [ ] **Step 4: Failing integration test for the five gates**

```ts
// apps/backend/src/__tests__/integration/plan10-gates.test.ts
import { createApp } from "../../app";
import { db } from "../../db/client";
import type { SessionUser } from "../../lib/auth/tokens";
import {
  canCommentOnForumSubmission,
  canDeleteForumComment,
  canManageSessionVideo,
  forumAudienceFor,
  hasActiveEnrollment,
} from "../../lib/permissions";
import { newPublicId } from "../../lib/public-id";
import { cleanupTestData, createTestSeason, createTestUser } from "./fixtures";

jest.setTimeout(60000);
createApp(); // config side effects, same as the other suites

let seasonId: number;
let sessionId: number;
let groupAId: number;
let groupBId: number;
let assignmentId: number;
let postSubmissionId: number;
let commentId: number;

let author: SessionUser;
let groupMate: SessionUser;
let outsider: SessionUser;
let dropped: SessionUser;
let leaderA: SessionUser;
let leaderB: SessionUser;
let admin: SessionUser;
let mentor: SessionUser;
let superUser: SessionUser;

function asUser(
  id: number,
  role: SessionUser["role"],
  overrides: Partial<SessionUser> = {},
): SessionUser {
  return {
    userId: id,
    role,
    seasonAdminIds: [],
    groupLeaderIds: [],
    activeSeasonId: null,
    graduationYear: null,
    ...overrides,
  } as SessionUser;
}

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;

  const authorUser = await createTestUser("fauthor", "STUDENT");
  const mateUser = await createTestUser("fmate", "STUDENT");
  const outsiderUser = await createTestUser("foutsider", "STUDENT");
  const droppedUser = await createTestUser("fdropped", "STUDENT");
  const leaderAUser = await createTestUser("fleadera", "LEADER");
  const leaderBUser = await createTestUser("fleaderb", "LEADER");
  const adminUser = await createTestUser("fadmin", "ADMIN");
  const mentorUser = await createTestUser("fmentor", "MENTOR");
  const superRow = await createTestUser("fsuper", "SUPER");

  const groupA = await db.group.create({
    data: { seasonId, name: "Group A", leaders: { create: { userId: leaderAUser.id } } },
    select: { id: true },
  });
  const groupB = await db.group.create({
    data: { seasonId, name: "Group B", leaders: { create: { userId: leaderBUser.id } } },
    select: { id: true },
  });
  groupAId = groupA.id;
  groupBId = groupB.id;

  await db.seasonAdmin.create({ data: { seasonId, userId: adminUser.id } });
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: authorUser.id, groupId: groupA.id, status: "ACTIVE" },
      { seasonId, studentUserId: mateUser.id, groupId: groupA.id, status: "ACTIVE" },
      { seasonId, studentUserId: outsiderUser.id, groupId: groupB.id, status: "ACTIVE" },
      { seasonId, studentUserId: droppedUser.id, groupId: groupA.id, status: "WITHDRAWN" },
    ],
  });

  const session = await db.session.create({
    data: {
      seasonId,
      title: "space-v2-test-video-session",
      startsAt: new Date("2099-03-01T18:00:00.000Z"),
      durationMinutes: 90,
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    },
    select: { id: true },
  });
  sessionId = session.id;

  const assignment = await db.assignment.create({
    data: {
      seasonId,
      title: "space-v2-test-forum-assignment",
      type: "FORUM",
      forumMinWords: 5,
      forumAllowComments: true,
      isAllGroups: true,
    },
    select: { id: true },
  });
  assignmentId = assignment.id;

  const post = await db.submission.create({
    data: {
      assignmentId,
      studentUserId: authorUser.id,
      publicId: newPublicId(),
      status: "SUBMITTED",
      submittedAt: new Date(),
      text: "<p>space-v2-test post body</p>",
    },
    select: { id: true },
  });
  postSubmissionId = post.id;

  const comment = await db.forumComment.create({
    data: { submissionId: post.id, authorUserId: mateUser.id, body: "space-v2-test comment" },
    select: { id: true },
  });
  commentId = comment.id;

  author = asUser(authorUser.id, "STUDENT", { activeSeasonId: seasonId });
  groupMate = asUser(mateUser.id, "STUDENT", { activeSeasonId: seasonId });
  outsider = asUser(outsiderUser.id, "STUDENT", { activeSeasonId: seasonId });
  dropped = asUser(droppedUser.id, "STUDENT", { activeSeasonId: seasonId });
  leaderA = asUser(leaderAUser.id, "LEADER", { groupLeaderIds: [groupA.id] });
  leaderB = asUser(leaderBUser.id, "LEADER", { groupLeaderIds: [groupB.id] });
  admin = asUser(adminUser.id, "ADMIN", { seasonAdminIds: [seasonId] });
  mentor = asUser(mentorUser.id, "MENTOR");
  superUser = asUser(superRow.id, "SUPER");
});

afterAll(async () => {
  await cleanupTestData();
});

describe("canManageSessionVideo", () => {
  it("admits SUPER and the season's ADMIN, and nobody else", async () => {
    expect(await canManageSessionVideo(superUser, sessionId)).toBe(true);
    expect(await canManageSessionVideo(admin, sessionId)).toBe(true);
    // v1's gate is season-scoped ADMIN + SUPER only — a group LEADER who runs
    // the session cannot author its questions, and a MENTOR who reads
    // everything cannot either.
    expect(await canManageSessionVideo(leaderA, sessionId)).toBe(false);
    expect(await canManageSessionVideo(mentor, sessionId)).toBe(false);
    expect(await canManageSessionVideo(author, sessionId)).toBe(false);
  });

  it("is false for a session that does not exist", async () => {
    expect(await canManageSessionVideo(admin, 987_654_321)).toBe(false);
  });
});

describe("hasActiveEnrollment", () => {
  it("requires an ACTIVE enrolment, not merely an enrolment row", async () => {
    // v1 gated answering on canAccessSeason, whose student branch accepts ANY
    // SeasonEnrollment row regardless of status, while the page that rendered
    // the player required status ACTIVE — so a dropped student failed the page
    // and passed the action (spec 13 R51 / D9).
    expect(await hasActiveEnrollment(author, seasonId)).toBe(true);
    expect(await hasActiveEnrollment(dropped, seasonId)).toBe(false);
  });

  it("is false for every non-student role", async () => {
    expect(await hasActiveEnrollment(admin, seasonId)).toBe(false);
    expect(await hasActiveEnrollment(superUser, seasonId)).toBe(false);
  });
});

describe("canCommentOnForumSubmission", () => {
  it("admits a group-mate, SUPER, the season ADMIN and the author's LEADER", async () => {
    expect(await canCommentOnForumSubmission(groupMate, postSubmissionId)).toBe(true);
    expect(await canCommentOnForumSubmission(superUser, postSubmissionId)).toBe(true);
    expect(await canCommentOnForumSubmission(admin, postSubmissionId)).toBe(true);
    // Widening, taken deliberately (spec 14 D3): in v1 LEADER falls through to
    // `return false`, so a leader cannot join the discussion of a group they
    // lead — an omission, not a policy.
    expect(await canCommentOnForumSubmission(leaderA, postSubmissionId)).toBe(true);
  });

  it("refuses another group's student, another group's leader, and a mentor", async () => {
    expect(await canCommentOnForumSubmission(outsider, postSubmissionId)).toBe(false);
    expect(await canCommentOnForumSubmission(leaderB, postSubmissionId)).toBe(false);
    // MENTOR stays read-only, consistent with their posture elsewhere.
    expect(await canCommentOnForumSubmission(mentor, postSubmissionId)).toBe(false);
  });

  it("refuses when the target is still a DRAFT (v1 R43)", async () => {
    // v1 read only `assignmentId` from the target, so a student who satisfied
    // the group and post-first rules could comment on a group-mate's unposted
    // draft by naming its sequential id.
    const draft = await db.submission.create({
      data: {
        assignmentId,
        studentUserId: outsider.userId,
        publicId: newPublicId(),
        status: "DRAFT",
      },
      select: { id: true },
    });
    expect(await canCommentOnForumSubmission(groupMate, draft.id)).toBe(false);
  });

  it("refuses when comments are switched off on the assignment", async () => {
    const quiet = await db.assignment.create({
      data: {
        seasonId,
        title: "space-v2-test-quiet-forum",
        type: "FORUM",
        forumAllowComments: false,
        isAllGroups: true,
      },
      select: { id: true },
    });
    const post = await db.submission.create({
      data: {
        assignmentId: quiet.id,
        studentUserId: author.userId,
        publicId: newPublicId(),
        status: "SUBMITTED",
        submittedAt: new Date(),
        text: "<p>space-v2-test</p>",
      },
      select: { id: true },
    });
    expect(await canCommentOnForumSubmission(groupMate, post.id)).toBe(false);
    expect(await canCommentOnForumSubmission(superUser, post.id)).toBe(false);
  });
});

describe("canDeleteForumComment", () => {
  it("admits the author, SUPER, the season ADMIN and the post author's LEADER", async () => {
    expect(await canDeleteForumComment(groupMate, commentId)).toBe(true);
    expect(await canDeleteForumComment(superUser, commentId)).toBe(true);
    expect(await canDeleteForumComment(admin, commentId)).toBe(true);
    expect(await canDeleteForumComment(leaderA, commentId)).toBe(true);
  });

  it("refuses everyone else, including the post's own author", async () => {
    expect(await canDeleteForumComment(author, commentId)).toBe(false);
    expect(await canDeleteForumComment(outsider, commentId)).toBe(false);
    expect(await canDeleteForumComment(leaderB, commentId)).toBe(false);
    expect(await canDeleteForumComment(mentor, commentId)).toBe(false);
  });
});

describe("forumAudienceFor", () => {
  it("gives a student their own season group", async () => {
    expect(await forumAudienceFor(author, assignmentId)).toEqual({
      kind: "student",
      groupId: groupAId,
    });
  });

  it("refuses a student with no ACTIVE enrolment", async () => {
    expect(await forumAudienceFor(dropped, assignmentId)).toBeNull();
  });

  it("gives a leader only the groups they lead in this season", async () => {
    expect(await forumAudienceFor(leaderA, assignmentId)).toEqual({
      kind: "staff",
      groupIds: [groupAId],
    });
    expect(await forumAudienceFor(leaderB, assignmentId)).toEqual({
      kind: "staff",
      groupIds: [groupBId],
    });
  });

  it("gives SUPER, the season ADMIN and a MENTOR every group", async () => {
    for (const staff of [superUser, admin, mentor]) {
      expect(await forumAudienceFor(staff, assignmentId)).toEqual({
        kind: "staff",
        groupIds: null,
      });
    }
  });
});
```

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern plan10-gates` → FAIL (no exports).

- [ ] **Step 5: Implement the gates**

Append to `apps/backend/src/lib/permissions.ts` (it already imports `db`,
`SessionUser`, and the rbac predicates; add `groupIdInSeason` and
`studentCanSeeAssignment` from `./queries/assignments`):

```ts
/**
 * Authoring interactive video questions on a session.
 *
 * Season-scoped ADMIN + SUPER only — not a group LEADER, not a MENTOR. Ported
 * from v1's `canManageSessionVideo`, which is one of the gates v1 got right;
 * what v1 lacked was any gate on the *reads*, one of which carries the answer
 * key for every question (spec 13 R68/R73).
 */
export async function canManageSessionVideo(
  user: SessionUser,
  sessionId: number,
): Promise<boolean> {
  if (isSuper(user)) return true;
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { seasonId: true },
  });
  if (!session) return false;
  return isAdminOfSeason(user, session.seasonId);
}

/**
 * A student with a live place in this season.
 *
 * Deliberately stricter than `canAccessSeason`, whose student branch accepts
 * any `SeasonEnrollment` row whatever its status. v1 gated the video answer and
 * progress actions on that looser predicate while the page that rendered the
 * player required `status: "ACTIVE"` — so a dropped or completed student could
 * not open the page and could still answer (spec 13 R51, §10 D9). This is the
 * rule v1 intended, made real.
 *
 * If alumni are ever meant to keep access to a past season's material, that is
 * a separate named rule, not a side effect of a permissive gate.
 */
export async function hasActiveEnrollment(user: SessionUser, seasonId: number): Promise<boolean> {
  if (user.role !== "STUDENT") return false;
  const enrollment = await db.seasonEnrollment.findUnique({
    where: { studentUserId_seasonId: { studentUserId: user.userId, seasonId } },
    select: { status: true },
  });
  return enrollment?.status === "ACTIVE";
}

/**
 * Who may comment on a forum post.
 *
 * v1's `canCommentOnForumSubmission` is the one gate in domain 14 that would
 * have survived an API — it re-reads the target, re-checks the type and the
 * flag, and compares live group membership. Two changes:
 *
 *  1. Membership resolves through `SeasonEnrollment`, not `GroupStudent`
 *     (ruling C9). `GroupStudent.studentUserId` is `@unique` across the whole
 *     database, so it answers "what group is this student in now" — the wrong
 *     question for an assignment in a season they may since have left.
 *  2. LEADER is admitted for groups they lead (spec 14 §10 D3). In v1 both
 *     LEADER and MENTOR fall through to `return false`, so a leader cannot
 *     participate in — or moderate — the discussion of their own group. That is
 *     an omission by missing `if`, not a policy. MENTOR stays read-only.
 *
 * Also new: a DRAFT target is refused. v1 read only `assignmentId` from the
 * target row, so a group-mate's unposted draft was a valid comment target for
 * anyone who could name its sequential id (spec 14 R43).
 */
export async function canCommentOnForumSubmission(
  user: SessionUser,
  submissionId: number,
): Promise<boolean> {
  const sub = await db.submission.findUnique({
    where: { id: submissionId },
    select: {
      studentUserId: true,
      status: true,
      assignment: { select: { seasonId: true, type: true, forumAllowComments: true } },
    },
  });
  if (!sub) return false;
  if (sub.assignment.type !== "FORUM" || !sub.assignment.forumAllowComments) return false;
  if (sub.status === "DRAFT") return false;

  if (isSuper(user)) return true;
  if (isAdminOfSeason(user, sub.assignment.seasonId)) return true;

  const authorGroupId = await groupIdInSeason(sub.studentUserId, sub.assignment.seasonId);
  if (authorGroupId === null) return false;

  if (user.role === "LEADER") return isLeaderOfGroup(user, authorGroupId);
  if (user.role === "STUDENT") {
    const mine = await groupIdInSeason(user.userId, sub.assignment.seasonId);
    return mine !== null && mine === authorGroupId;
  }
  return false;
}

/**
 * Who may remove a comment.
 *
 * v1: the author, SUPER, or an ADMIN of the assignment's season — but the
 * delete control renders only for the viewer's own comments and no staff screen
 * shows a thread at all, so the staff half of that rule has never been
 * exercisable (spec 14 R49/R52/R53). LEADER is added for the same reason as
 * above. The post's own author is NOT admitted for someone else's comment:
 * owning a thread is not moderating it.
 */
export async function canDeleteForumComment(
  user: SessionUser,
  commentId: number,
): Promise<boolean> {
  const comment = await db.forumComment.findUnique({
    where: { id: commentId },
    select: {
      authorUserId: true,
      submission: {
        select: { studentUserId: true, assignment: { select: { seasonId: true } } },
      },
    },
  });
  if (!comment) return false;
  if (comment.authorUserId === user.userId) return true;
  if (isSuper(user)) return true;

  const seasonId = comment.submission.assignment.seasonId;
  if (isAdminOfSeason(user, seasonId)) return true;

  if (user.role === "LEADER") {
    const authorGroupId = await groupIdInSeason(comment.submission.studentUserId, seasonId);
    return authorGroupId !== null && isLeaderOfGroup(user, authorGroupId);
  }
  return false;
}

/**
 * Whose posts this caller may read on a forum assignment.
 *
 * `groupIds: null` means every group in the season. The staff arm is new
 * capability — v1 has no staff forum screen whatsoever, so nobody could see a
 * thread to moderate it (spec 14 §10 D2/D3).
 */
export type ForumAudience =
  | { kind: "student"; groupId: number | null }
  | { kind: "staff"; groupIds: number[] | null };

export async function forumAudienceFor(
  user: SessionUser,
  assignmentId: number,
): Promise<ForumAudience | null> {
  const assignment = await db.assignment.findFirst({
    where: { id: assignmentId, deletedAt: null, type: "FORUM" },
    select: { seasonId: true, isAllGroups: true, targets: { select: { groupId: true } } },
  });
  if (!assignment) return null;

  if (isSuper(user) || isMentor(user) || isAdminOfSeason(user, assignment.seasonId)) {
    return { kind: "staff", groupIds: null };
  }

  if (user.role === "LEADER") {
    const scope = await staffScopeForSeason(user, assignment.seasonId);
    if (scope === null || scope.kind !== "groups") return null;
    return { kind: "staff", groupIds: scope.groupIds };
  }

  if (user.role !== "STUDENT") return null;
  if (!(await hasActiveEnrollment(user, assignment.seasonId))) return null;
  // The targeting rule v1 enforced only by refusing to render the page (R15),
  // from the same helper the assignment reads use.
  const targeted = await studentCanSeeAssignment(
    user.userId,
    assignment.seasonId,
    assignment.isAllGroups,
    assignment.targets.map((t) => t.groupId),
  );
  if (!targeted) return null;
  return { kind: "student", groupId: await groupIdInSeason(user.userId, assignment.seasonId) };
}
```

Run the gates suite → PASS.

- [ ] **Step 6: Fixtures — the leak `cleanupTestData` cannot currently reach**

In `apps/backend/src/__tests__/integration/fixtures.ts`, add beside
`testSeasonCode`:

```ts
/**
 * JpcEvent has no code or email column, so the prefix lives in its title.
 *
 * This matters more than it looks: `JpcEvent.season` is `onDelete: SetNull`, so
 * deleting a test season does not remove its events — it nulls their `seasonId`
 * and leaves the rows behind in a database jpc-space is live against. Every
 * event fixture must go through this helper or `cleanupTestData` cannot find it.
 */
export function testEventTitle(label: string): string {
  return `${TEST_PREFIX}${label}-${randomUUID()}`;
}
```

and, inside `cleanupTestData`'s `if (seasonIds.length > 0)` block, **above** the
existing `db.attendance.deleteMany` line:

```ts
    // Video-quiz and forum rows cascade from Session and Submission, both of
    // which are deleted below — but three of these tables hold onDelete:
    // Restrict relations to User, so a row that survives its parent's delete
    // makes the user delete at the end of this function throw and strands test
    // fixtures in the shared database. Removing them explicitly first means the
    // cleanup never depends on cascade ordering being right.
    await db.sessionVideoQuestionResponse.deleteMany({
      where: { question: { session: inSeasons } },
    });
    await db.sessionVideoProgress.deleteMany({ where: { session: inSeasons } });
    await db.sessionVideoQuestion.deleteMany({ where: { session: inSeasons } });
    await db.forumComment.deleteMany({ where: { submission: { assignment: inSeasons } } });
```

and, at the **top** of the function (before the season lookup, because events
survive their season):

```ts
  await db.jpcEvent.deleteMany({ where: { title: { startsWith: TEST_PREFIX } } });
```

Re-run the gates suite → still PASS (it now also proves the cleanup does not
throw on the new deletes).

- [ ] **Step 7: Mobile query keys**

Append three factories inside `queryKeys` in
`apps/mobile/src/lib/query-keys.ts`, in the file's existing style:

```ts
  videoQuiz: {
    all: ["video-quiz"] as const,
    forSession: (sessionId: number) => [...queryKeys.videoQuiz.all, "student", sessionId] as const,
    questions: (sessionId: number) => [...queryKeys.videoQuiz.all, "admin", sessionId] as const,
    results: (sessionId: number) => [...queryKeys.videoQuiz.all, "results", sessionId] as const,
  },
  forum: {
    all: ["forum"] as const,
    thread: (assignmentId: number) => [...queryKeys.forum.all, "thread", assignmentId] as const,
    comments: (assignmentId: number, postPublicId: string) =>
      [...queryKeys.forum.all, "comments", assignmentId, postPublicId] as const,
  },
  events: {
    all: ["events"] as const,
    list: () => [...queryKeys.events.all, "list"] as const,
    detail: (id: number) => [...queryKeys.events.all, "detail", id] as const,
  },
```

- [ ] **Step 8: Verify and commit**

Run: `pnpm turbo lint typecheck test:unit --filter=@space/backend --filter=@space/mobile` → clean.
Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern plan10-gates` → PASS.

```bash
git add apps/backend apps/mobile && git commit -m "feat(backend): plan-10 permission gates, router mounts, PUT in CORS, event-safe fixtures"
```

---

## Stream A — Video quizzes (Tasks 3–5)

### Task 3: Video quiz — the student surface, with the gate that v1 never had

**Files:**
- Create: `apps/backend/src/lib/queries/video-quiz.ts`
- Modify: `apps/backend/src/routes/video-quiz.ts`
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: `apps/backend/src/__tests__/integration/video-quiz-routes.test.ts`

**Interfaces:**
- Consumes: `canManageSessionVideo`, `hasActiveEnrollment` (Task 2); `parseYouTubeId`, `studentVideoQuizSchema`'s shape, `submitVideoAnswerRequestSchema`, `videoProgressRequestSchema` (Task 1); `parseId`, `apiOk`/`apiError`.
- Produces:
  - `loadStudentVideoQuiz(sessionId, studentUserId): Promise<StudentVideoQuizData | null>` in `lib/queries/video-quiz.ts`, and the exported interfaces `StudentVideoQuizData`, `VideoQuizQuestionRow`
  - `GET /api/v1/sessions/:id/video-quiz`
  - `POST /api/v1/sessions/:id/video-quiz/answers`
  - `PUT /api/v1/sessions/:id/video-quiz/progress`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/backend/src/__tests__/integration/video-quiz-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let sessionId: number;
let q1: number;
let q2: number;
let q3: number;
let studentId: number;
let studentToken: string;
let droppedToken: string;
let adminToken: string;
let leaderToken: string;

async function resetAnswers(): Promise<void> {
  await db.sessionVideoQuestionResponse.deleteMany({ where: { question: { sessionId } } });
  await db.sessionVideoProgress.deleteMany({ where: { sessionId } });
}

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;

  const student = await createTestUser("vqstudent", "STUDENT");
  const droppedStudent = await createTestUser("vqdropped", "STUDENT");
  const admin = await createTestUser("vqadmin", "ADMIN");
  const leader = await createTestUser("vqleader", "LEADER");
  studentId = student.id;

  const group = await db.group.create({
    data: { seasonId, name: "Group A", leaders: { create: { userId: leader.id } } },
    select: { id: true },
  });
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: student.id, groupId: group.id, status: "ACTIVE" },
      { seasonId, studentUserId: droppedStudent.id, groupId: group.id, status: "WITHDRAWN" },
    ],
  });

  const session = await db.session.create({
    data: {
      seasonId,
      title: "space-v2-test-video-session",
      startsAt: new Date("2099-03-01T18:00:00.000Z"),
      durationMinutes: 90,
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    },
    select: { id: true },
  });
  sessionId = session.id;

  const created = await db.$transaction([
    db.sessionVideoQuestion.create({
      data: {
        sessionId,
        atSeconds: 30,
        prompt: "space-v2-test q1",
        options: ["a", "b"],
        correctIndex: 0,
        points: 2,
      },
      select: { id: true },
    }),
    db.sessionVideoQuestion.create({
      data: {
        sessionId,
        atSeconds: 60,
        prompt: "space-v2-test q2",
        options: ["a", "b", "c"],
        correctIndex: 2,
        points: 3,
      },
      select: { id: true },
    }),
    db.sessionVideoQuestion.create({
      data: {
        sessionId,
        atSeconds: 90,
        prompt: "space-v2-test q3",
        options: ["a", "b"],
        correctIndex: 1,
        points: 1,
      },
      select: { id: true },
    }),
  ]);
  q1 = created[0].id;
  q2 = created[1].id;
  q3 = created[2].id;

  studentToken = await login(app, student.email);
  droppedToken = await login(app, droppedStudent.email);
  adminToken = await login(app, admin.email);
  leaderToken = await login(app, leader.email);
});

beforeEach(resetAnswers);

afterAll(async () => {
  await cleanupTestData();
});

describe("GET /api/v1/sessions/:id/video-quiz", () => {
  it("never sends the answer key to a student", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/video-quiz`)
      .set("authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.questions).toHaveLength(3);
    // The whole point of the split. Assert on the serialised body, not on a
    // property read, so an undefined-but-present key still fails.
    expect(JSON.stringify(res.body)).not.toMatch(/correctIndex/);
    for (const q of res.body.data.questions) {
      expect(Object.keys(q).sort()).toEqual(
        ["answered", "atSeconds", "id", "isCorrect", "options", "points", "prompt", "selectedIndex"],
      );
    }
  });

  it("resolves the video id server-side so the client never parses a URL", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/video-quiz`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.body.data.videoId).toBe("dQw4w9WgXcQ");
  });

  it("names the next answerable question and totals the points", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/video-quiz`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.body.data.nextQuestionId).toBe(q1);
    expect(res.body.data.totalPoints).toBe(6);
    expect(res.body.data.earnedPoints).toBe(0);
    expect(res.body.data.answeredCount).toBe(0);
    expect(res.body.data.furthestSeconds).toBe(0);
    expect(res.body.data.completedAt).toBeNull();
  });

  it("refuses a student whose enrolment is not ACTIVE (spec 13 D9)", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/video-quiz`)
      .set("authorization", `Bearer ${droppedToken}`);
    expect(res.status).toBe(403);
  });

  it("refuses staff — this is the student view, and staff have the other one", async () => {
    for (const token of [adminToken, leaderToken]) {
      const res = await request(app)
        .get(`/api/v1/sessions/${sessionId}/video-quiz`)
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });

  it("404s an unknown session", async () => {
    const res = await request(app)
      .get("/api/v1/sessions/987654321/video-quiz")
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/sessions/:id/video-quiz/answers", () => {
  it("grades the first question and advances the barrier", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/video-quiz/answers`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ questionId: q1, selectedIndex: 0 });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      isCorrect: true,
      correctIndex: 0,
      furthestSeconds: 30,
      nextQuestionId: q2,
      completedAt: null,
    });
  });

  it("REFUSES an answer out of order — the gate v1 has only in the browser", async () => {
    // v1's barrier lives entirely in interactive-video-player.tsx; the action
    // never reads progress, never compares atSeconds and never checks order
    // (spec 13 R47). Behind an API that makes answering every question on a
    // session, having played no video at all, one scripted loop.
    const skip = await request(app)
      .post(`/api/v1/sessions/${sessionId}/video-quiz/answers`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ questionId: q3, selectedIndex: 1 });

    expect(skip.status).toBe(409);
    expect(skip.body.error.code).toBe("out_of_order");
    expect(await db.sessionVideoQuestionResponse.count({ where: { questionId: q3 } })).toBe(0);
  });

  it("replays a recorded answer instead of throwing on the unique constraint", async () => {
    // One answer per question, forever (v1 R54) — but v1 does not catch the
    // constraint violation, so a double tap surfaces a raw Prisma error
    // (spec 13 §10 D14). A double tap on a phone is far more likely than a
    // double click on a mouse.
    await request(app)
      .post(`/api/v1/sessions/${sessionId}/video-quiz/answers`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ questionId: q1, selectedIndex: 0 });

    const again = await request(app)
      .post(`/api/v1/sessions/${sessionId}/video-quiz/answers`)
      .set("authorization", `Bearer ${studentToken}`)
      // A different index: the recorded verdict must win, not this one.
      .send({ questionId: q1, selectedIndex: 1 });

    expect(again.status).toBe(200);
    expect(again.body.data.isCorrect).toBe(true);
    expect(await db.sessionVideoQuestionResponse.count({ where: { questionId: q1 } })).toBe(1);
  });

  it("derives completion when the last question is answered (spec 13 D3)", async () => {
    for (const [questionId, selectedIndex] of [
      [q1, 0],
      [q2, 2],
      [q3, 0],
    ] as const) {
      await request(app)
        .post(`/api/v1/sessions/${sessionId}/video-quiz/answers`)
        .set("authorization", `Bearer ${studentToken}`)
        .send({ questionId, selectedIndex });
    }

    const view = await request(app)
      .get(`/api/v1/sessions/${sessionId}/video-quiz`)
      .set("authorization", `Bearer ${studentToken}`);

    expect(view.body.data.completedAt).not.toBeNull();
    expect(view.body.data.nextQuestionId).toBeNull();
    expect(view.body.data.answeredCount).toBe(3);
    // q3 answered wrongly: 2 + 3 earned out of 6.
    expect(view.body.data.earnedPoints).toBe(5);
  });

  it("refuses an index outside the stored options", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/video-quiz/answers`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ questionId: q1, selectedIndex: 5 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_answer");
  });

  it("404s a question that belongs to another session", async () => {
    // v1 addresses questions by bare id, which is what lets an authenticated
    // caller tell an existing question from a missing one (spec 13 R52).
    const other = await db.session.create({
      data: {
        seasonId,
        title: "space-v2-test-other-session",
        startsAt: new Date("2099-04-01T18:00:00.000Z"),
        durationMinutes: 60,
      },
      select: { id: true },
    });
    const res = await request(app)
      .post(`/api/v1/sessions/${other.id}/video-quiz/answers`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ questionId: q1, selectedIndex: 0 });
    expect(res.status).toBe(404);
  });

  it("refuses a dropped student and any staff role", async () => {
    for (const token of [droppedToken, adminToken, leaderToken]) {
      const res = await request(app)
        .post(`/api/v1/sessions/${sessionId}/video-quiz/answers`)
        .set("authorization", `Bearer ${token}`)
        .send({ questionId: q1, selectedIndex: 0 });
      expect(res.status).toBe(403);
    }
  });
});

describe("PUT /api/v1/sessions/:id/video-quiz/progress", () => {
  it("moves furthestSeconds forward and never backward (spec 13 D4)", async () => {
    const up = await request(app)
      .put(`/api/v1/sessions/${sessionId}/video-quiz/progress`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ furthestSeconds: 45 });
    expect(up.status).toBe(200);
    expect(up.body.data.furthestSeconds).toBe(45);

    const down = await request(app)
      .put(`/api/v1/sessions/${sessionId}/video-quiz/progress`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ furthestSeconds: 10 });
    expect(down.body.data.furthestSeconds).toBe(45);
  });

  it("cannot be used to claim completion (spec 13 D3)", async () => {
    const res = await request(app)
      .put(`/api/v1/sessions/${sessionId}/video-quiz/progress`)
      .set("authorization", `Bearer ${studentToken}`)
      // v1's action took `completed` on trust: one call with (sessionId, 0,
      // true) marked a student complete (R48).
      .send({ furthestSeconds: 0, completed: true });

    expect(res.status).toBe(200);
    expect(res.body.data.completedAt).toBeNull();
    const row = await db.sessionVideoProgress.findUnique({
      where: { sessionId_studentUserId: { sessionId, studentUserId: studentId } },
      select: { completedAt: true },
    });
    expect(row?.completedAt ?? null).toBeNull();
  });

  it("is idempotent — the same value twice changes nothing", async () => {
    const first = await request(app)
      .put(`/api/v1/sessions/${sessionId}/video-quiz/progress`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ furthestSeconds: 20 });
    const second = await request(app)
      .put(`/api/v1/sessions/${sessionId}/video-quiz/progress`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ furthestSeconds: 20 });
    expect(second.body.data).toEqual(first.body.data);
  });
});
```

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern video-quiz-routes` → FAIL (404s).

- [ ] **Step 2: The query module**

```ts
// apps/backend/src/lib/queries/video-quiz.ts
import { parseYouTubeId } from "../../../../../packages/shared/src/index";
import { db } from "../../db/client";

export interface VideoQuizQuestionRow {
  id: number;
  atSeconds: number;
  prompt: string;
  options: string[];
  points: number;
  answered: boolean;
  selectedIndex: number | null;
  isCorrect: boolean | null;
}

export interface StudentVideoQuizData {
  seasonId: number;
  videoId: string | null;
  youtubeUrl: string | null;
  questions: VideoQuizQuestionRow[];
  furthestSeconds: number;
  completedAt: Date | null;
  earnedPoints: number;
  totalPoints: number;
  answeredCount: number;
  nextQuestionId: number | null;
}

/**
 * The student's view of a session's video quiz.
 *
 * The select list is the enforcement of the answer-key split: `correctIndex`
 * is not read here, so it cannot be forwarded by accident. v1's equivalent got
 * this right too (spec 13 R69) — what it lacked was any authorization, because
 * the only caller was a server component whose page had already checked
 * (R73). Behind an endpoint that gate has to exist, and it lives in the route.
 *
 * `nextQuestionId` is the barrier, derived once (ruling C4). v1 recomputed it
 * inside the player component and nowhere else, which is why the gate
 * evaporated the moment an API existed.
 */
export async function loadStudentVideoQuiz(
  sessionId: number,
  studentUserId: number,
): Promise<StudentVideoQuizData | null> {
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { seasonId: true, youtubeUrl: true },
  });
  if (!session) return null;

  const [questions, responses, progress] = await Promise.all([
    db.sessionVideoQuestion.findMany({
      where: { sessionId },
      // atSeconds is indexed but NOT unique — two questions may share a
      // timestamp (spec 13 R13), so id is the tiebreak that makes "the next
      // question" a single deterministic answer on the server and the client.
      orderBy: [{ atSeconds: "asc" }, { id: "asc" }],
      select: { id: true, atSeconds: true, prompt: true, options: true, points: true },
    }),
    db.sessionVideoQuestionResponse.findMany({
      where: { studentUserId, question: { sessionId } },
      select: { questionId: true, selectedIndex: true, isCorrect: true },
    }),
    db.sessionVideoProgress.findUnique({
      where: { sessionId_studentUserId: { sessionId, studentUserId } },
      select: { furthestSeconds: true, completedAt: true },
    }),
  ]);

  const byQuestion = new Map(responses.map((r) => [r.questionId, r]));
  let earnedPoints = 0;
  let totalPoints = 0;
  let nextQuestionId: number | null = null;

  const rows: VideoQuizQuestionRow[] = questions.map((q) => {
    totalPoints += q.points;
    const r = byQuestion.get(q.id);
    if (r?.isCorrect) earnedPoints += q.points;
    if (r === undefined && nextQuestionId === null) nextQuestionId = q.id;
    return {
      id: q.id,
      atSeconds: q.atSeconds,
      prompt: q.prompt,
      options: q.options,
      points: q.points,
      answered: r !== undefined,
      selectedIndex: r?.selectedIndex ?? null,
      isCorrect: r?.isCorrect ?? null,
    };
  });

  return {
    seasonId: session.seasonId,
    // Resolved once, here. v1 parsed the URL in the page and handed the id to
    // the player; a React Native client re-implementing that parser is how the
    // two drift (spec 13 §7).
    videoId: session.youtubeUrl ? parseYouTubeId(session.youtubeUrl) : null,
    youtubeUrl: session.youtubeUrl,
    questions: rows,
    furthestSeconds: progress?.furthestSeconds ?? 0,
    completedAt: progress?.completedAt ?? null,
    earnedPoints,
    totalPoints,
    answeredCount: responses.length,
    nextQuestionId,
  };
}
```

- [ ] **Step 3: The three student routes**

In `apps/backend/src/routes/video-quiz.ts`:

```ts
import { db } from "../db/client";
import { Prisma } from "../generated/prisma/client";
import { apiError, apiOk } from "../lib/api-response";
import { parseId } from "../lib/parse-id";
import { hasActiveEnrollment } from "../lib/permissions";
import { loadStudentVideoQuiz } from "../lib/queries/video-quiz";
import { requireUser } from "../middleware/require-auth";
import {
  submitVideoAnswerRequestSchema,
  videoProgressRequestSchema,
} from "../../../../packages/shared/src/index";

/**
 * The student gate, in one place: STUDENT role, session exists, ACTIVE
 * enrolment in its season. Returns the session's seasonId, or null after
 * having already answered the request.
 */
async function requireStudentOnSession(
  req: Parameters<typeof requireUser>[0],
  res: Parameters<typeof apiError>[0],
  sessionId: number,
): Promise<{ seasonId: number } | null> {
  const user = requireUser(req);
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { seasonId: true },
  });
  if (!session) {
    apiError(res, "not_found", "Session not found.", 404);
    return null;
  }
  // Role first, then enrolment. v1 looked the question up before checking the
  // role, which let any authenticated caller tell an existing question id from
  // a missing one (spec 13 R52).
  if (!(await hasActiveEnrollment(user, session.seasonId))) {
    apiError(res, "forbidden", "You don't have access to this.", 403);
    return null;
  }
  return session;
}

videoQuizRouter.get("/sessions/:id/video-quiz", async (req, res) => {
  const user = requireUser(req);
  const sessionId = parseId(req.params.id);
  if (sessionId === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  const gate = await requireStudentOnSession(req, res, sessionId);
  if (gate === null) return undefined;

  const data = await loadStudentVideoQuiz(sessionId, user.userId);
  if (data === null) return apiError(res, "not_found", "Session not found.", 404);

  return apiOk(res, {
    videoId: data.videoId,
    youtubeUrl: data.youtubeUrl,
    questions: data.questions,
    furthestSeconds: data.furthestSeconds,
    completedAt: data.completedAt,
    earnedPoints: data.earnedPoints,
    totalPoints: data.totalPoints,
    answeredCount: data.answeredCount,
    nextQuestionId: data.nextQuestionId,
  });
});
```

`POST /sessions/:id/video-quiz/answers` — the order of the checks *is* the
behaviour, so implement them in exactly this sequence:

1. `parseId`, then `requireStudentOnSession`.
2. Parse the body with `submitVideoAnswerRequestSchema`; 400 `bad_request`.
3. Load the question with
   `db.sessionVideoQuestion.findFirst({ where: { id: body.questionId, sessionId }, select: { id: true, atSeconds: true, options: true, correctIndex: true } })`.
   Missing → 404 `not_found`. **Scoping the lookup by `sessionId` is what makes
   a mismatched pair a 404 rather than a silent success** (spec 13 §7).
4. Range-check `selectedIndex` against `question.options.length` — from the row,
   never from the client (v1 R53). Out of range → 400 `invalid_answer`.
5. **Replay before ordering.** Look up the existing response; if present, return
   `{ isCorrect: existing.isCorrect, correctIndex: question.correctIndex, ... }`
   with the current progress. This must precede the ordering gate, or
   re-answering an earlier question would 409 instead of replaying.
6. **The ordering gate (D-13.2).** Load `loadStudentVideoQuiz(sessionId, userId)`
   and compare `data.nextQuestionId !== question.id` → 409 `out_of_order`,
   message `"Answer the earlier questions first."`.
7. Write, in one interactive transaction:

```ts
  const isCorrect = body.selectedIndex === question.correctIndex;
  const isLast = data.answeredCount + 1 === data.questions.length;

  let progress: { furthestSeconds: number; completedAt: Date | null };
  try {
    progress = await db.$transaction(async (tx) => {
      await tx.sessionVideoQuestionResponse.create({
        data: {
          questionId: question.id,
          studentUserId: user.userId,
          selectedIndex: body.selectedIndex,
          isCorrect,
        },
      });
      const current = await tx.sessionVideoProgress.findUnique({
        where: { sessionId_studentUserId: { sessionId, studentUserId: user.userId } },
        select: { furthestSeconds: true, completedAt: true },
      });
      // Math.max, never `{ set: ... }`. v1 wrote the question's atSeconds
      // absolutely (spec 13 R57), twenty lines above a comment promising
      // furthestSeconds "only ever moves forward" — unreachable through its own
      // UI because the barrier forced ascending order, trivially reachable
      // through an API.
      const furthestSeconds = Math.max(current?.furthestSeconds ?? 0, question.atSeconds);
      // Completion is derived here and asserted nowhere (spec 13 D3).
      const completedAt = current?.completedAt ?? (isLast ? new Date() : null);
      return tx.sessionVideoProgress.upsert({
        where: { sessionId_studentUserId: { sessionId, studentUserId: user.userId } },
        create: { sessionId, studentUserId: user.userId, furthestSeconds, completedAt },
        update: { furthestSeconds, completedAt },
        select: { furthestSeconds: true, completedAt: true },
      });
    });
  } catch (err) {
    // The unique index on (questionId, studentUserId) IS the "one answer, no
    // retries" rule. A double tap losing that race must read as the answer it
    // already recorded, not as a 500 (spec 13 §10 D14).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const recorded = await db.sessionVideoQuestionResponse.findUnique({
        where: {
          questionId_studentUserId: { questionId: question.id, studentUserId: user.userId },
        },
        select: { isCorrect: true },
      });
      const after = await loadStudentVideoQuiz(sessionId, user.userId);
      return apiOk(res, {
        isCorrect: recorded?.isCorrect ?? isCorrect,
        correctIndex: question.correctIndex,
        furthestSeconds: after?.furthestSeconds ?? 0,
        completedAt: after?.completedAt ?? null,
        nextQuestionId: after?.nextQuestionId ?? null,
      });
    }
    throw err;
  }
```

8. Respond with `{ isCorrect, correctIndex: question.correctIndex, furthestSeconds: progress.furthestSeconds, completedAt: progress.completedAt, nextQuestionId }`, recomputing `nextQuestionId` as the id after this one in the ordered list (or null when `isLast`). **`correctIndex` here is the only path by which the answer key reaches a student, and only for the question they just answered** — safe because the first answer is final.

`PUT /sessions/:id/video-quiz/progress`:

```ts
videoQuizRouter.put("/sessions/:id/video-quiz/progress", async (req, res) => {
  const user = requireUser(req);
  const sessionId = parseId(req.params.id);
  if (sessionId === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  const gate = await requireStudentOnSession(req, res, sessionId);
  if (gate === null) return undefined;

  const parsed = videoProgressRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid progress.", 400);

  // PUT, not PATCH: the write is idempotent and monotone, so repeating it with
  // the same value is a no-op — which matters under React Query's
  // refetch-on-focus behaviour. Read-then-write inside a transaction, because
  // v1 did it outside one and two concurrent saves (visibilitychange and
  // unmount fire together) could persist the lower value (spec 13 R64).
  const progress = await db.$transaction(async (tx) => {
    const current = await tx.sessionVideoProgress.findUnique({
      where: { sessionId_studentUserId: { sessionId, studentUserId: user.userId } },
      select: { furthestSeconds: true, completedAt: true },
    });
    const furthestSeconds = Math.max(current?.furthestSeconds ?? 0, parsed.data.furthestSeconds);
    return tx.sessionVideoProgress.upsert({
      where: { sessionId_studentUserId: { sessionId, studentUserId: user.userId } },
      // completedAt is untouched on both branches. This endpoint cannot set it
      // and cannot clear it: the answer endpoint derives it (spec 13 D3), and
      // v1's client-asserted boolean does not exist on the contract at all.
      create: { sessionId, studentUserId: user.userId, furthestSeconds },
      update: { furthestSeconds },
      select: { furthestSeconds: true, completedAt: true },
    });
  });

  return apiOk(res, progress);
});
```

- [ ] **Step 4: Run the suite → PASS.** Then
`pnpm turbo lint typecheck test:unit --filter=@space/backend` → clean.

- [ ] **Step 5: OpenAPI, same commit.** Add the three paths and the
`StudentVideoQuiz`, `SubmitVideoAnswerRequest`, `SubmitVideoAnswerResponse` and
`VideoProgressRequest` schemas to `src/docs/openapi.ts` in the file's house
style. The prose must say three things a reader cannot infer: that
`correctIndex` is absent from the student payload by design and returned only
for a question just answered; that `out_of_order` (409) is the server-side
barrier and what it does and does not prove; and that `completed` is not an
accepted field.

- [ ] **Step 6: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): student video quiz with a server-side ordering gate and derived completion"
```

---
