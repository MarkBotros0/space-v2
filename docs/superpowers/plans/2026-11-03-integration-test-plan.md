# Integration test plan (proposal)

Status: proposed, nothing implemented. Measured 2026-11-03 on main, local Postgres with v1's migrations applied.

## Baseline

43 suites, 784 tests, all passing. Lines 95%, branches 73% (1760 of 2424). Lines are not the gap; branches are. Each uncovered branch is usually an error path, a role the test never used, or a missing-row case.

## Uncovered branches, by file

| File | Uncovered / total branches | What is typically missing |
|---|---|---|
| `routes/quizzes.ts` | 103 / 306 | the largest gap: grading, scope and validation paths |
| `routes/users.ts` | 45 / 118 | role changes, deactivation, bad input, self-edit rules |
| `routes/students.ts` + `queries/students.ts` | 63 / 281 | filters, other-season and other-group access |
| `routes/video-quiz.ts` + `queries/video-quiz.ts` | 39 / 99 | attempt rules, missing quiz, wrong role |
| `routes/seasons.ts` | 28 / 98 | archive/activate rules, duplicate codes |
| `routes/sessions.ts` | 26 / 130 | recurrence, reschedule, check-in windows |
| `routes/submissions.ts` | 19 / 89 | review/return edge cases, access by role |
| `routes/events.ts` | 17 / 47 | alumni-only visibility, all-day events |
| `routes/forum.ts` + `queries/forum.ts` | 31 / 98 | moderation and ownership |
| `routes/engagement.ts`, `notes.ts`, `imports.ts`, `me.ts`, `auth.ts`, `assignments.ts`, `groups.ts` | 6 to 12 each | validation errors, 404s, forbidden roles |

## Principles for every new test

1. **Role matrix.** For each endpoint touched, exercise every role (student, alumnus, leader of this group, leader of another group, mentor, season admin of this season, season admin of another, super) and assert allowed or the exact 403/404.
2. **Error envelope.** Assert the `{ error: { code, message } }` shape and status for each failure, never only the status.
3. **Privacy rules from the register.** Students never see staff notes; other-group leaders see nothing.
4. **Fake data only** (the repo is public), created through `fixtures.ts` and cleaned by the existing prefix convention.
5. **Local or throwaway Postgres only**, never staging. A staging run stays in the owner backlog.

## PR split (each from main, not stacked)

| PR | Scope | New tests (est.) |
|---|---|---|
| I1 | Quizzes: grading, scope, validation, role matrix | ~45 |
| I2 | Users, auth, me: role change, deactivation, self-service, rate-limit and error paths | ~35 |
| I3 | Students, seasons, sessions: filters, cross-season/group access, recurrence, check-in windows | ~45 |
| I4 | Video quiz, events, engagement, notes, forum, imports: error paths and visibility | ~50 |
| I5 | Submissions and assignments: review/return edges and a cross-role access matrix | ~30 |

About 205 tests. Target: branch coverage from 73% to about 85%. Suggested order I1 to I5 by gap size; I2 first if security matters more than size.

## Also

- Run with the "Integration tests (on demand)" workflow, not on every PR.
- Cheap pure-logic leftovers for the unit side: `lib/email.ts` (16 of 19 branches), `imports/delimited.ts` (14 of 24), `org-time.ts` (9 of 24). Folded into I4 and I2.
- Open question: v1 behaviour is the reference for expected results. Where the current backend's behaviour looks wrong, the test is written to v1 and the discrepancy is reported rather than silently pinned.
