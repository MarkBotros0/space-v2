# Domain NN — <Name>

> Status: draft · Phase: <n> · v1 API status: <done | read done | partial | none>

## 1. v1 source

Every file this domain lives in, with a one-line description of what it holds.
Cite as `src/lib/foo.ts:12-40` — a reviewer must be able to open the citation
and see the rule. Include the pages that consume it, not just the lib.

| File | Holds |
|---|---|
| | |

## 2. Data model

The Prisma models this domain reads or writes, the fields that carry meaning
(skip `id`/`createdAt` boilerplate unless a rule depends on it), the relations
it traverses, and the enums it constrains against. Name the model exactly as
`prisma/schema.prisma` names it. Flag any field v1 writes but never reads, and
any field that is nullable in the schema but treated as required in code.

## 3. Business rules

The load-bearing section. Number every rule `R1`, `R2`, … Each rule is one
sentence of behaviour plus a citation. A reviewer checks the rule against the
citation; if they cannot, the rule is written wrong.

Cover: validation, defaults, derived values, ordering, filtering, state
transitions, cascade/cleanup behaviour, uniqueness, time-window logic,
notification side effects, and anything computed rather than stored.

- **R1.** <rule> — `src/lib/foo.ts:31`
- **R2.** …

Call out rules that are **implicit** — enforced by a query's `where` clause or
by which page renders a control, rather than by an explicit check. Those are
the ones a port silently drops. Mark them `(implicit)`.

## 4. Authorization

Who may do what. One row per operation. Distinguish **role gates** (pure, from
the token's claims — `rbac.ts`) from **row-scoped gates** (need a database read
to check ownership or scope — `permissions.ts`).

| Operation | Roles | Row-scoped condition | v1 citation |
|---|---|---|---|
| | | | |

State explicitly where v1 enforces nothing and relies on the UI not rendering
the control. Those become real gates in v2 — say so.

## 5. Read surface

Each query: what it returns, its shape, its ordering, and how the shape differs
per role (v1 often withholds fields from students). Note N+1s and any query that
returns more than the page renders.

## 6. Write surface

Each action: inputs, validation, what it writes, what it cascades to, what it
notifies, and what it returns. Note non-atomic sequences — where v1 does several
writes without a transaction and a failure mid-way leaves inconsistent rows.

## 7. Proposed API

Endpoints for v2. Mark each **exists** (already ported — give the file:line in
`apps/backend/src/routes/`), **partial**, or **new**. Follow the response
envelope in `CLAUDE.md`: `{ "data": ... }` / `{ "error": { "code", "message" } }`.

| Method | Path | Status | Auth | Request | Response |
|---|---|---|---|---|---|
| | | | | | |

Where an existing endpoint's shape does not match what the screens need, say so
here rather than proposing a second endpoint.

## 8. Proposed shared contracts

Zod schemas for `packages/shared/src/<domain>.ts`. Name them and describe their
fields in prose or a field table — **do not write the schema code**; Wave B
writes it. Note which existing schemas in `packages/shared` this domain must
reuse rather than redefine, and which existing bare `interface` should convert
to Zod as part of this domain (per the convention in `CLAUDE.md`).

## 9. Screens

v1 page → v2 route. The v2 tree is flat and role-driven: one route per
*destination*, with role branches inside. Several v1 pages therefore collapse
into one v2 route. Detail routes (`[id]`, `[publicId]`, `[token]`) mostly do
**not exist yet** in `apps/mobile/app/(app)/` — flag every one this domain needs.

| v1 page(s) | v2 route | Exists? | Roles | Notes |
|---|---|---|---|---|

## 10. Open questions and divergences

Where v1 is inconsistent, buggy, or where the mobile port should deliberately
differ. Each with a recommendation. This is where you flag things a v2
implementer would otherwise reproduce faithfully by mistake.

---

## Writing rules

- **Cite or cut.** A claim about v1 behaviour without a `file:line` is a guess.
  If you could not find it, write "not found in v1" — do not infer it.
- **Rules, not shapes.** The reviewer's job is checking each rule against its
  citation. Prose describing "how it works" is not a rule.
- **No code.** No TypeScript, no Zod, no SQL. Field tables and endpoint tables
  only. Wave B writes the code from this.
- **Say when v1 is wrong.** Section 10 exists so defects get decided, not ported.
