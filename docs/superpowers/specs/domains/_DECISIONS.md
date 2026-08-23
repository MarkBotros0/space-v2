# Cross-cutting rulings — binding on every domain

Wave A's seventeen specs raise roughly 170 open questions in their section 10s.
Most are local to one domain: **the Wave B implementer follows the
recommendation in their own domain's spec**, and flags in their report anything
they think is wrong.

The rulings below are different. Each one is depended on by several domains, so
leaving them to the implementer means several implementers deciding the same
question differently. They are binding. Where a domain spec's section 10
recommends something that contradicts a ruling here, **this document wins** —
say so in your report rather than silently following the spec.

---

## C1 — The schema is frozen. Everything else follows from this.

No migration, no new column, no new enum value, no index. `prisma/migrations/`
is a verbatim copy of v1's and the database is shared with a running production
system.

So when a defect's clean fix is a new column, the ruling is **not** "add the
column". It is: correct what can be corrected inside the current schema, and
record the rest as a cutover task. Several rulings below are shaped by this and
say so explicitly.

Anything you cannot fix without a migration goes in your report under
"deferred to cutover", with the column it needs. Do not work around a missing
column by overloading an existing one.

## C2 — One organisation timezone, held in config, applied server-side.

v1 stores no timezone anywhere. A deadline is composed in the author's browser
zone, recurrence is spaced in the server's zone, and everything is rendered in
each reader's zone. On a laptop in one office that mostly cancels out. On
phones it does not.

**Ruling.** Instants are stored and transported as UTC ISO-8601 — unchanged,
since that is what the columns already hold. Every *wall-clock* derivation —
"is this overdue", "which day does this belong to", "what does the next
occurrence land on", any bucketing by day/week/month — resolves against a
single organisation timezone, read from config on the server. Never the
device's zone. Never the server's incidental zone.

The client formats for display and derives nothing. If a screen needs to know
whether something is overdue, the API tells it.

This is the ruling that prevents a student in a different timezone seeing a
different deadline from their leader, and it is why C3 and C4 are server-side.

## C3 — Lateness is measured from the session start, and v2's divergence from v1 is deliberate.

v1 computes `lateMinutes` as minutes since **`checkInOpenAt`** — since an admin
pressed a button — with no threshold. A student who arrives on time is `LATE`
if the console was opened a minute early, and the absence budget then consumes
those minutes as if they were real.

**Ruling.** v2 measures from `session.startsAt`. `lateThresholdMinutes` was
specified in v1's design and never shipped as a column, so under C1 the
threshold is zero for now and the *instant* is what gets corrected.

This creates a real divergence: rows v1 writes and rows v2 writes will mean
different things in the same column while both systems run. That is accepted
deliberately — continuing to write "minutes since a button press" into a column
every reader interprets as "minutes late" is the worse option. Record it as a
cutover task: a backfill, and a threshold column, both post-migration-freeze.

Reports must not present v1-era and v2-era `lateMinutes` as one series without
saying so.

## C4 — Derived values are computed once, server-side, and travel on the contract.

Wave A found the same shape repeatedly: a value with no column, re-derived at
every render site, with the derivations drifting apart. `submittedAt > dueAt`
is computed at five separate sites. "At risk" is defined three times and the
three disagree. "Submission %" is three different numbers under one name.

**Ruling.** If a value is derived rather than stored, the API derives it once
and puts it on the response. `isLate`, `isOverdue`, engagement bands, attendance
percentages, completion counts. The client renders what it is given.

Two consequences:
- A React Native client cannot re-derive these, so they must be on the wire.
  Adding a computed field to a response is not scope creep here; it is the
  ruling.
- When two domains need the same derived value, it is defined in **one**
  place in `packages/shared` and both consume it. Do not define a second.

## C5 — "Submission %" means: completed submissions ÷ assignments targeted at that student.

Of the three definitions Wave A found, this is the only one that answers the
question a reader thinks it answers. The season-wide denominator counts
assignments the student was never given.

Any percentage that can exceed 100 is a bug, not a display quirk — clamp is not
the fix, the denominator is.

## C6 — A GET never writes.

v1 creates rows while rendering pages: a `DRAFT` submission on opening an
assignment, a notification marked read on opening the inbox. Under React Query,
which refetches on mount, on window focus and on reconnect, each of those
becomes a write every time the user tabs back to the app.

**Ruling.** No read endpoint performs a write, without exception. Where v1
relied on the side effect, it becomes an explicit write the screen calls —
preferring a lazy upsert on the resource's own `PUT`/`PATCH` over a separate
creation endpoint, so there is one path in and it is idempotent.

Do not port v1's read-then-create-then-catch pattern. Use a real upsert on the
natural unique key.

## C7 — A claim grants nothing without the role that can hold it.

Already implemented in `apps/backend/src/lib/rbac.ts` — stated here because
every domain's authorization builds on it.

`seasonAdminIds` and `groupLeaderIds` are grants, not identity. `loadScopes`
reads the join tables with no role filter and v1 writes them from unvalidated
input, so a row naming a student is reachable. `isAdminOfSeason` and
`isLeaderOfGroup` therefore test the role alongside the claim.

Two things follow for new code:
- **Never test a claim array directly.** Go through the `rbac.ts` predicates.
- **A role change does not revoke a live token.** No session-invalidation column
  exists, so under C1 the mitigation is TTL: access tokens are 900s, and the
  refresh path must re-derive claims from the database rather than copying them
  forward. If you touch refresh, verify that.

## C8 — Authorization is row-scoped at the API, and response shapes narrow by role.

The single most common finding in Wave A: v1 enforces a rule by which page
renders a control, or by a `where` clause in one page's query, while the action
underneath checks nothing. That protection evaporates the moment an endpoint
exists. Three such gaps had already shipped into v2 and are now fixed.

**Ruling.** Two obligations on every endpoint you write:

1. **Gate the row, not just the route.** A leader may mark attendance — for
   *their* students. An admin may edit a season — *theirs*. Put the check in
   `lib/permissions.ts`, and gate the write path independently of the read
   path: narrowing a list only hides rows, it does not stop a caller who
   already knows an id.
2. **Narrow the payload, not just the access.** When v1 showed a role a smaller
   version of something, the endpoint returns the smaller version. Do not serve
   the staff shape to a student because the gate happened to admit them — that
   is exactly how `GET /groups/:id` came to hand every student their whole
   group's email addresses.

## C9 — Season-scoped membership resolves through `SeasonEnrollment`, never `GroupStudent`.

`GroupStudent.studentUserId` is `@unique` — a student belongs to one group in
the entire database, not one per season. `SeasonEnrollment.groupId` records the
per-season fact and v1 consults it for almost nothing.

**Ruling.** Any question of the form "is this student in this group *for this
season*" resolves through `SeasonEnrollment`. `GroupStudent` may answer only
"what is this student's current group", and even then treat it as advisory.

Fixing the uniqueness is a migration, so under C1 it is a cutover task. Until
then, do not build anything that depends on `GroupStudent` being season-aware,
because it is not.

## C10 — Recurrence is season-scoped.

`session-actions.ts` selects a recurrence series on `recurrenceGroupId` alone,
and season duplication clones the id, so editing a series in a running season
rewrites the sessions of every season duplicated from it — and gates on the
anchor's season only, making it a cross-season privilege escalation too.

**Ruling.** Every sibling lookup filters on `seasonId` as well as
`recurrenceGroupId`, and duplication mints a fresh group id. Both halves, or
the hole stays open.

## C11 — Nothing renders as HTML.

Note bodies, notification content and invite emails are unsanitised HTML in v1,
some of it rendered with `dangerouslySetInnerHTML`, some interpolated straight
into mail.

**Ruling.** React Native renders text, so there is no `dangerouslySetInnerHTML`
to inherit — but the API must not pass HTML through untouched either, because
the same fields feed email. Sanitise on write where the field is new, and on
read at the API boundary for everything already stored. Escape on every mail
interpolation.

Converting stored HTML to structured rich text is a migration, so under C1 it
is a cutover task.

## C12 — Dead code in v1 is not a specification.

Wave A found several exported actions with no caller anywhere —
`softDeleteAssignmentAction`, `deleteSessionAction`, `deleteGroupAction`,
`deleteQuizAction`. Their semantics have never executed in production, so their
behaviour is not evidence of intent: it is untested code that happens to
compile.

**Ruling.** Do not port an unreachable action's behaviour as though it were a
requirement. If v2 needs the capability, design it — cascade, blocking
conditions and all — and say in your report that you did. If v2 does not need
it yet, leave it out.

---

## What to do with a decision this document does not cover

Follow your domain spec's section 10 recommendation. If your spec offers
options without a recommendation, pick the one consistent with the rulings
above, implement it, and put the choice and its reasoning at the top of your
report so it can be reviewed rather than discovered later.
