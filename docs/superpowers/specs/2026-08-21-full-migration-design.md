# space-v2 — Full Migration Design

**Date:** 2026-08-21
**Status:** Draft — supersedes the scope section of
`2026-08-20-space-v2-monorepo-design.md`, which described a mobile-first
*subset*. This describes replacing jpc-space entirely.

## Purpose

`jpc-space` (Next.js 16 web portal) is retired. Everything it does moves into
this monorepo: `apps/backend` becomes the complete API, `apps/mobile` becomes
the complete user interface. There is no admin web app — admin and super
surfaces are React Native screens like every other.

Both apps continue to run against the same Postgres database as jpc-space
until jpc-space is switched off.

## Hard constraints

- **`D:\Projects\JPC\jpc-space` is read-only.** It is the reference
  implementation and the authority on behaviour. Read it constantly; never
  write to it — no edits, no refactors, no new files, no git operations.
- **No database migrations.** `prisma/migrations/` stays a verbatim copy of
  v1's while both systems share the database.
- **Token compatibility with v1** holds until jpc-space is switched off.
- **Everything in the mobile app.** All of v1's page surface, admin and super
  included.

## What "everything" actually is

Measured, not estimated:

| Surface | Count | Lines |
|---|---|---|
| Server action functions | 76 | 3,760 |
| Query functions | 38 | 2,575 |
| All of v1 `lib/` | 70 files | 9,230 |
| Web pages | 104 | — |
| **Already ported** (`/api/v1`) | 23 operations | 3,446 |

Pages by area: admin 33, super 23, student 14, leader 13, mentor 7, alumni 7,
auth/misc 7.

## This is not a port

The completed `/api/v1` migration was mechanical: v1 had 18 route files, they
became 18 Express routers, and each was diffed against its source. Fidelity
was checkable line by line.

**The remaining work has no such contract.** Server actions are Next.js RPC
bound to form submissions — they have no HTTP surface, no status codes, no
request schema. Migrating them means *designing* an API for 76 functions that
never had one. Likewise 104 web pages do not translate to React Native; they
are redesigned.

Consequences for how the work runs:

- **Design before code, per domain.** Without a written contract first, 18
  domains built independently produce 18 inconsistent APIs.
- **Verification changes.** "Diff against v1's route file" is replaced by
  "read v1's action, restate its rules, prove them with tests." The business
  rules in those 3,760 lines are the asset — the transport is incidental.
- **v1 stays readable throughout.** Every domain's spec cites the v1 source it
  derives from, so a reviewer can check the rules were carried over.

## Architecture

### API shape

The existing `/api/v1` conventions hold and are not renegotiated per domain:

- Envelope: `{ data }` / `{ error: { code, message } }`
- Bearer access token, 15-minute TTL, refresh rotation
- Two-layer authorization: `lib/rbac.ts` (pure, token claims) and
  `lib/permissions.ts` (database-backed row/scope gates)
- Zod request schemas in `packages/shared`, consumed by both apps
- `parseId` for numeric params; opaque ids passed through

Server actions become REST resources, not RPC endpoints. A `season-actions.ts`
with `createSeason`/`updateSeason`/`archiveSeason` becomes
`POST/PATCH /api/v1/seasons` and a status transition — not
`POST /api/v1/createSeason`.

### Mobile foundation gaps

`apps/mobile` today has expo-router, React Query, Zustand, axios and
secure-store. It has **one real screen**. The following are absent and are
prerequisites for the domain work, not incidental:

| Need | Why | Used by |
|---|---|---|
| Forms + validation | 76 actions are mostly form submissions | every write screen |
| UI primitives | buttons, inputs, sheets, lists, empty/error states | all 104 |
| Date handling + picker | sessions, seasons, due dates | most domains |
| Tables / dense lists | rosters, trackers, reports | admin, leader |
| Charts | reports and super dashboards | reports, super |
| Document picker | CSV student/group import | admin |
| File save / share | spreadsheet and season exports | admin, super |
| Role-aware navigation | five roles see different apps | shell |

Two of these deserve flagging as genuinely awkward in React Native and are the
known cost of the "everything in mobile" decision: **CSV import** (pick a file,
preview rows, correct errors, commit) and **reports/exports** (render tables
and charts, produce a spreadsheet, hand it to the user). They are possible;
they are not cheap, and they will not feel like their web equivalents.

## Domains

Each is a vertical slice: API endpoints, shared contracts, and the screens
that consume them, shipped together. Ordered by dependency and value.

| # | Domain | v1 source | API status |
|---|---|---|---|
| 1 | Shell & auth | `auth/`, login pages | done |
| 2 | Seasons | `season-actions`, `seasons-query`, `season-history-query` | read done |
| 3 | Sessions | `session-actions`, `sessions-query`, `recurrence` | read done |
| 4 | Attendance & check-in | `attendance-actions` | done |
| 5 | Groups | `group-actions`, `groups-query` | read done |
| 6 | Students & enrollment | `student-actions`, `students-query`, `enrollment-actions` | none |
| 7 | Assignments | `assignment-actions`, `assignments-query` | read done |
| 8 | Submissions | `submission-actions`, `submissions-query` | done |
| 9 | Notes | `note-actions`, `engagement` | none |
| 10 | Notifications | `notification-actions`, `notifications` | partial |
| 11 | Invites & users | `invite-actions`, `user-actions`, `invites`, `roles` | none |
| 12 | Quizzes | `quiz-actions` (12 fns), `quiz-query` | none |
| 13 | Video quizzes | `video-quiz-actions`, `video-quiz-query`, `video-time` | none |
| 14 | Forum | `forum-actions`, `forum-query`, `forum` | none |
| 15 | JPC events | `jpc-event-actions`, `jpc-events-query` | none |
| 16 | Imports | `student-import*`, `group-import*`, `spreadsheet` | none |
| 17 | Reports & exports | `reports-query`, `super-reports-query`, `season-export` | none |
| 18 | Settings | `settings-actions` | none |

"read done" means the `/api/v1` GET endpoints exist from the completed port;
the writes do not.

## Phasing

Each phase ends with something usable on a device, not a layer.

**Phase 0 — Foundation.** Mobile shell: role-aware navigation, auth guard,
session restore, UI primitives, forms, dates, error/empty/loading states,
React Query wiring. No new endpoints. Nothing else can start without it.

**Phase 1 — Student.** Domains 2–4, 7–8 read paths plus submission writes.
The APIs largely exist already, so this is mostly UI and is the fastest route
to a real app in someone's hands.

**Phase 2 — Leader.** Attendance marking, group roster, submission review.
Adds the first substantial write surface.

**Phase 3 — Admin core.** Domains 5–6, plus season/session/assignment writes.
The largest API design effort.

**Phase 4 — Engagement.** Domains 9–15: notes, notifications, invites, users,
quizzes, video quizzes, forum, events.

**Phase 5 — Admin heavy.** Domains 16–18: imports, reports, exports, settings.
Deliberately last — highest effort, worst mobile fit, smallest audience.

**Phase 6 — Cutover.** Parity check against jpc-space, then switch it off.

## Definition of done, per domain

1. A short spec citing the v1 source and restating its business rules
2. Shared Zod contracts in `packages/shared`
3. Endpoints with `rbac`/`permissions` gates and integration tests
4. Screens with component tests
5. The v1 rules demonstrably preserved — a reviewer can check each rule
   against the cited source

## Risks

- **Scale.** 3–4× the backend work already done, plus an app that currently
  has one screen. Phasing exists so value lands before it is all finished.
- **No contract to diff against.** The mitigation is per-domain specs citing
  v1, and reviewers checking rules rather than shapes.
- **Admin-on-mobile.** CSV import and reports are the two that will hurt.
  Scheduled last so the decision can be revisited with real usage.
- **Shared database during transition.** Two systems writing one database.
  Business rules must not diverge; that is what the rule-restatement step in
  each domain spec is for.
- **Staging database reliability.** Already cost significant time in the
  `/api/v1` port. Integration suites need to tolerate it or run against a
  disposable database.
