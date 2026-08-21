# Phase 0 — Mobile Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `apps/mobile` from a login screen plus a placeholder into a shell that can host the product — brand theme, UI primitives, session restore, a role-aware tab navigator, forms, and query defaults — so every later domain is screens and endpoints rather than scaffolding.

**Architecture:** v1's `lib/navigation.ts` is pure data with no React or Next.js imports, so it moves into `packages/shared` and drives the tab bar directly. Routes are **flat and role-driven** rather than role-prefixed (see Decision D1). The root layout gains a boot gate that restores tokens, fetches `/api/v1/me`, and routes to the app or to login before anything renders.

**Tech Stack:** Expo SDK 54, expo-router 6, React Query 5, Zustand 5, react-hook-form + @hookform/resolvers, date-fns, @testing-library/react-native.

**Spec:** `docs/superpowers/specs/2026-08-21-full-migration-design.md`

---

## Global Constraints

- **`D:\Projects\JPC\jpc-space` is READ-ONLY.** Reference implementation and the authority on behaviour. Read it constantly; never write to it — no edits, no refactors, no new files, no git operations. If something there looks wrong, report it.
- **Never create or apply a database migration.** Nothing under `apps/backend/prisma/` may be edited. The database is shared live with jpc-space.
- **Never print secrets** — no `AUTH_SECRET`, `DATABASE_URL`, real tokens, or password hashes in reports, commits, or logs.
- **Integration tests may only touch rows they created**, via the `space-v2-test-` prefix and the existing `fixtures.ts`. Do not modify that file.
- **Response envelope:** success `{ data }`, failure `{ error: { code, message } }`.
- **Value imports of `@space/shared` from `apps/backend/src` must be relative** (`../../../../packages/shared/src/index`), never the bare package name. Type-only imports are erased and unaffected. The mobile app imports `@space/shared` by package name normally — this rule is backend-only.
- **No `@/` path alias in either app.** Relative imports only. An alias Jest resolves but Metro does not would pass tests and break the running app.
- **`packages/shared` has no build step.** `main` is `src/index.ts`; Metro and ts-node consume the TypeScript directly. Nothing added there may import from `react`, `react-native`, `express`, or Prisma — it is consumed by both apps and must stay platform-neutral.
- **CommonJS output in the backend.** No ESM-only dependencies there. The mobile app is bundled by Metro and has no such limit.
- Use `git add -A` when committing, never a narrowed path.
- **Verification output must be genuine.** Paste real captured terminal output. Never reconstruct.

---

## Decisions this plan locks in

**D1 — Flat routes, role-driven content.** v1 prefixes every path by role
(`/student/calendar`, `/admin/calendar`). Mirroring that on mobile means six
role folders × five tabs ≈ 30 route files, most of them near-duplicates, and
expo-router's `Tabs` needs the files to exist.

Instead there is one route per *destination* (`/calendar`, `/students`,
`/more`, …) and the screen renders what the caller's role should see. The tab
bar shows `navFor(user).tabs`, so a student and an admin land on different tab
sets pointing at the same route files.

Cost: each screen carries a role branch. Benefit: ~14 route files instead of
~30, one place per destination, and adding a role later changes data, not the
file tree.

**D2 — `graduationYear` is added to `GET /api/v1/me`.** `navFor()` distinguishes
an alumnus from an active student by `role === "STUDENT" && graduationYear != null`.
That field is in the JWT claims but **`/me` does not return it** — its `scopes`
block carries only `seasonAdminIds`, `groupLeaderIds`, `activeSeasonId`. The
alternatives were decoding the JWT on-device (more moving parts, and the client
then trusts claims it cannot verify) or a separate request. Adding one field to
`/me` is additive, backwards-compatible, and keeps the client reading one
source. Task 1 does it.

**D3 — The session store holds scopes, not just the user.** Today it holds
`AuthUser` (id, name, email, role) only. Role alone cannot answer "is this an
alumnus", "which seasons do I administer", or "which groups do I lead" — all
of which gate navigation and screen content. The store mirrors `/me`.

**D4 — Deferred to the domain that needs them.** Date *pickers*, charts,
document pickers and file export are not in Phase 0. Only date *formatting*
lands here, because Phase 1 renders session times. Building a chart library
integration before a single report screen exists is speculative.

---

## File Structure

**Created in `packages/shared/src/`:**

| File | Responsibility |
|---|---|
| `navigation.ts` | `NavIconName`, `NavItem`, `RoleNav`, `navByRole`, `navFor` — ported from v1, hrefs rewritten flat |

**Created in `apps/mobile/src/`:**

| File | Responsibility |
|---|---|
| `theme/tokens.ts` | Brand colours, spacing, radii, typography scale — from v1's `globals.css` |
| `theme/index.ts` | `useTheme()` and the provider |
| `ui/Text.tsx` | Typography component bound to the scale |
| `ui/Button.tsx` | Primary/secondary/ghost, loading and disabled states |
| `ui/Input.tsx` | Text field with label and error slot |
| `ui/Card.tsx` | Surface container |
| `ui/Screen.tsx` | Safe-area page wrapper with scroll and refresh |
| `ui/states.tsx` | `LoadingState`, `EmptyState`, `ErrorState` |
| `ui/index.ts` | Barrel |
| `lib/format.ts` | Date/time formatting used across screens |
| `lib/query-client.ts` | `QueryClient` factory with shared defaults |
| `hooks/use-session.ts` | Boot/restore, login, logout |
| `components/RoleTabs.tsx` | Tab bar rendered from `navFor(user).tabs` |

**Modified:**

| File | Change |
|---|---|
| `apps/backend/src/routes/me.ts` | Return `graduationYear` in `scopes` |
| `packages/shared/src/auth.ts` | `meResponseSchema` including `graduationYear` |
| `packages/shared/src/index.ts` | Re-export `./navigation` |
| `apps/mobile/src/store/session.ts` | Hold scopes and boot status |
| `apps/mobile/app/_layout.tsx` | Providers + boot gate |
| `apps/mobile/app/index.tsx` | Route on restored session rather than always to login |
| `apps/mobile/app/login.tsx` | Use the new primitives and form stack |
| `apps/mobile/package.json` | Add react-hook-form, @hookform/resolvers, date-fns |

---

### Task 1: `/api/v1/me` returns `graduationYear`

Without it the client cannot tell an alumnus from an active student, and
`navFor()` — the function that decides which tab bar to show — depends on
exactly that distinction. See Decision D2.

**Files:**
- Modify: `apps/backend/src/routes/me.ts`
- Modify: `packages/shared/src/auth.ts`
- Test: `apps/backend/src/__tests__/integration/me-routes.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `requireUser`; `SessionUser` from `lib/auth/tokens` (already carries `graduationYear`).
- Produces, from `packages/shared/src/auth.ts`:
  - `meScopesSchema` — `{ seasonAdminIds: number[]; groupLeaderIds: number[]; activeSeasonId: number | null; graduationYear: number | null }`
  - `meUserSchema` — `{ id, name, email, role, avatarPath: string | null }`
  - `meResponseSchema` — `{ user: MeUser | null; scopes: MeScopes }`
  - Types `MeScopes`, `MeUser`, `MeResponse`

- [ ] **Step 1: Write the failing test**

Add to `apps/backend/src/__tests__/integration/me-routes.test.ts`, inside the
existing `describe("GET /api/v1/me")`:

```ts
  it("returns graduationYear in scopes", async () => {
    const res = await request(app).get("/api/v1/me").set("authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    // Null for an active student — the field must be present and explicit,
    // not absent, so the client can distinguish "not graduated" from
    // "the server did not tell me".
    expect(res.body.data.scopes).toEqual({
      seasonAdminIds: [],
      groupLeaderIds: [],
      activeSeasonId: null,
      graduationYear: null,
    });
  });
```

Also update the existing `"returns the user record and scopes for a valid token"`
assertion in that file, which asserts `scopes` with `toEqual` and will now fail
because of the extra key. Add `graduationYear: null` to it.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/backend && pnpm jest --config jest.integration.config.js --runInBand --testPathPattern me-routes
```

Expected: both cases fail on a missing `graduationYear` key.

- [ ] **Step 3: Add the field to the route**

Modify `apps/backend/src/routes/me.ts` — the `scopes` block becomes:

```ts
    scopes: {
      seasonAdminIds: user.seasonAdminIds,
      groupLeaderIds: user.groupLeaderIds,
      activeSeasonId: user.activeSeasonId,
      // The client distinguishes an alumnus from an active student by
      // role === "STUDENT" && graduationYear != null. Without this field it
      // would have to decode the JWT itself to find out.
      graduationYear: user.graduationYear,
    },
```

`SessionUser` already carries `graduationYear` — `verifyAccessToken` reads it
from the token claims — so no other change is needed.

- [ ] **Step 4: Add the shared contract**

Append to `packages/shared/src/auth.ts`:

```ts
export const meScopesSchema = z.object({
  seasonAdminIds: z.array(z.number().int()),
  groupLeaderIds: z.array(z.number().int()),
  activeSeasonId: z.number().int().nullable(),
  /** Set when a student has graduated. Non-null means alumnus. */
  graduationYear: z.number().int().nullable(),
});
export type MeScopes = z.infer<typeof meScopesSchema>;

export const meUserSchema = authUserSchema.extend({
  avatarPath: z.string().nullable(),
});
export type MeUser = z.infer<typeof meUserSchema>;

export const meResponseSchema = z.object({
  // Null when the row was deleted inside the access token's 15-minute window.
  user: meUserSchema.nullable(),
  scopes: meScopesSchema,
});
export type MeResponse = z.infer<typeof meResponseSchema>;
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd apps/backend && pnpm jest --config jest.integration.config.js --runInBand --testPathPattern me-routes
```

Expected: PASS — 8 tests.

- [ ] **Step 6: Update the OpenAPI document**

In `apps/backend/src/docs/openapi.ts`, the `/api/v1/me` response `scopes`
properties gain:

```ts
                    graduationYear: {
                      type: ["integer", "null"],
                      description: "Set when a student has graduated; non-null means alumnus.",
                    },
```

- [ ] **Step 7: Checks and commit**

```bash
pnpm turbo build lint typecheck test:unit --filter=@space/backend --filter=@space/shared
```

```bash
git add -A && git commit -m "feat(api): return graduationYear from /me so clients can identify alumni"
```

---

### Task 2: Shared role navigation

v1's `lib/navigation.ts` is pure data — it imports only types, no React and no
Next.js — so it moves into `packages/shared` almost verbatim and drives the
mobile tab bar directly. **Read
`D:\Projects\JPC\jpc-space\src\lib\navigation.ts` before writing this**; it is
the source and it must not be edited.

**Files:**
- Create: `packages/shared/src/navigation.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/__tests__/navigation.test.ts`

**Interfaces:**
- Produces: `NavIconName`, `NavItem`, `RoleNav`, `navByRole`, `navFor(user): RoleNav`
- Consumes: `UserRole` from `./auth`

**The one adaptation — hrefs are flat.** v1's items point at
`/student/calendar`, `/admin/calendar`, and so on. Per Decision D1 there is one
route per destination, so the ported items point at `/calendar`. Everything
else — the item order, the labels, the icon names, the five-tab shape with Home
centred, the alumni rule — is carried over unchanged.

`navFor` takes only the fields it needs rather than v1's whole `SessionUser`,
because `packages/shared` must not depend on the backend's token type.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/__tests__/navigation.test.ts`:

```ts
import { navByRole, navFor } from "../navigation";

const base = { role: "STUDENT" as const, graduationYear: null as number | null };

describe("navFor", () => {
  it("returns the alumni nav for a graduated student", () => {
    const nav = navFor({ role: "STUDENT", graduationYear: 2024 });
    expect(nav.tabs.map((t) => t.label)).toEqual([
      "Events",
      "History",
      "Home",
      "Profile",
      "More",
    ]);
  });

  it("returns the student nav for an active student", () => {
    const nav = navFor(base);
    expect(nav).toBe(navByRole.STUDENT);
  });

  it("ignores graduationYear for non-students", () => {
    // Only a STUDENT can be an alumnus. A LEADER with a graduation year is a
    // graduate who now leads — they get the leader app.
    expect(navFor({ role: "LEADER", graduationYear: 2024 })).toBe(navByRole.LEADER);
  });

  it("gives every role exactly five tabs with Home in the middle", () => {
    for (const [role, nav] of Object.entries(navByRole)) {
      expect(nav.tabs).toHaveLength(5);
      expect(nav.tabs[2]?.label).toBe("Home");
      expect(nav.sidebar.length).toBeGreaterThan(0);
      expect(role).toEqual(expect.any(String));
    }
  });

  it("uses flat hrefs, not v1's role-prefixed ones", () => {
    // Decision D1: one route per destination, content varies by role.
    for (const nav of Object.values(navByRole)) {
      for (const item of [...nav.tabs, ...nav.sidebar]) {
        expect(item.href).toMatch(/^\/[a-z0-9-]+(\/[a-z0-9-]+)*$/);
        expect(item.href).not.toMatch(/^\/(super|admin|leader|student|mentor|alumni)\//);
      }
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd packages/shared && pnpm jest src/__tests__/navigation.test.ts
```

Expected: FAIL — "Cannot find module '../navigation'".

- [ ] **Step 3: Port the module**

Create `packages/shared/src/navigation.ts`. Copy v1's structure, keeping every
label, order and icon. Rewrite each `href` to drop the role prefix
(`/student/calendar` → `/calendar`, `/super/students/alumni` →
`/students/alumni`). Header comment:

```ts
import type { UserRole } from "./auth";

/**
 * Role navigation, ported from jpc-space's src/lib/navigation.ts.
 *
 * That module is pure data — no React, no Next.js — so it moves here unchanged
 * apart from one thing: hrefs are flat. v1 prefixes every path by role
 * (/student/calendar, /admin/calendar); this app has one route per destination
 * and varies the content by role, so the same item is /calendar for everyone.
 * See Decision D1 in the Phase 0 plan.
 *
 * `tabs` is already mobile-shaped in v1: five entries with Home centred.
 */
```

Define `navFor` against a narrow input so this package keeps no dependency on
the backend's `SessionUser`:

```ts
export interface NavAudience {
  role: UserRole;
  graduationYear: number | null;
}

/** An alumnus is a graduated student — role stays STUDENT, graduationYear is set. */
export function navFor(user: NavAudience): RoleNav {
  if (user.role === "STUDENT" && user.graduationYear != null) return ALUMNI;
  return navByRole[user.role];
}
```

Note `ALUMNI` is deliberately **not** in `navByRole` — it is not a `UserRole`,
it is a state of one. Keep v1's comment saying so.

- [ ] **Step 4: Re-export and verify**

Add `export * from "./navigation";` to `packages/shared/src/index.ts`, then:

```bash
cd packages/shared && pnpm jest src/__tests__/navigation.test.ts
```

Expected: PASS — 5 tests.

- [ ] **Step 5: Checks and commit**

```bash
pnpm turbo lint typecheck test:unit --filter=@space/shared --filter=@space/mobile
```

```bash
git add -A && git commit -m "feat(shared): port v1 role navigation with flat routes"
```

---

### Task 3: Brand theme

The palette is v1's, taken from `D:\Projects\JPC\jpc-space\src\app\globals.css`
(read-only — read it, copy the values). Carrying the same navy and teal means
the two apps look like one product during the transition.

**Files:**
- Create: `apps/mobile/src/theme/tokens.ts`
- Create: `apps/mobile/src/theme/index.ts`
- Test: `apps/mobile/src/__tests__/theme.test.ts`

**Interfaces:**
- Produces: `colors`, `spacing`, `radii`, `typography`, `type Theme`, `ThemeProvider`, `useTheme()`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/__tests__/theme.test.ts`:

```ts
import { colors, radii, spacing, typography } from "../theme/tokens";

describe("theme tokens", () => {
  it("anchors the brand on v1's logo colours", () => {
    // From jpc-space/src/app/globals.css — the navy is the logo background and
    // the teal the monogram. Changing these makes the two apps look unrelated
    // while both are live.
    expect(colors.brand.navy[900]).toBe("#1F3260");
    expect(colors.brand.teal[500]).toBe("#7DCED1");
  });

  it("exposes a full ramp for each brand colour", () => {
    for (const ramp of [colors.brand.navy, colors.brand.teal, colors.neutral]) {
      for (const step of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const) {
        expect(ramp[step]).toMatch(/^#[0-9A-F]{6}$/i);
      }
    }
  });

  it("provides semantic colours for status, named as v1 names them", () => {
    // v1's globals.css calls the destructive ramp `error`, not `danger`, and
    // also ships `info` and `purple`. Matching its vocabulary means a
    // developer reading both codebases sees one set of names.
    for (const key of ["success", "warning", "error", "info"] as const) {
      expect(colors[key][500]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it("uses a 4pt spacing scale", () => {
    expect(spacing.xs).toBe(4);
    expect(spacing.sm).toBe(8);
    expect(spacing.md).toBe(16);
    expect(spacing.lg).toBe(24);
    expect(spacing.xl).toBe(32);
  });

  it("defines the type scale used by the Text primitive", () => {
    for (const key of ["display", "title", "heading", "body", "label", "caption"] as const) {
      expect(typography[key].fontSize).toBeGreaterThan(0);
      expect(typography[key].lineHeight).toBeGreaterThanOrEqual(typography[key].fontSize);
    }
  });

  it("defines radii", () => {
    expect(radii.sm).toBeGreaterThan(0);
    expect(radii.full).toBeGreaterThanOrEqual(999);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/mobile && pnpm jest src/__tests__/theme.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the tokens**

Create `apps/mobile/src/theme/tokens.ts`. Copy the navy, teal, neutral,
success, warning and danger ramps verbatim from v1's `globals.css`. Shape:

```ts
/**
 * Brand tokens, taken from jpc-space's src/app/globals.css.
 *
 * The navy is the logo background and the teal the monogram — they are the
 * product's identity, not arbitrary choices. Both apps are live during the
 * transition, so these must match or the two look unrelated.
 */
export const colors = {
  brand: {
    navy: { 50: "#ECEFF7", /* … through … */ 950: "#142048" },
    teal: { 50: "#F2FAFA", /* … */ 950: "#103436" },
  },
  neutral: { 50: "#FAFAFB", /* … */ 950: "#0B0F19" },
  // v1's semantic ramp names, kept verbatim: success, warning, error, info,
  // purple. Note it is `error`, not `danger`.
  success: { /* emerald ramp from globals.css */ },
  warning: { /* amber ramp */ },
  error: { 50: "#FEF2F2", /* … */ 500: "#EF4444", /* … */ },
  info: { /* from globals.css */ },
  purple: { /* from globals.css — used by charts and accents */ },
  white: "#FFFFFF",
  black: "#000000",
} as const;

/** 4pt scale. Every margin and padding in the app comes from here. */
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const radii = { sm: 6, md: 10, lg: 16, full: 9999 } as const;

export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: "700" },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "700" },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: "600" },
  body: { fontSize: 16, lineHeight: 22, fontWeight: "400" },
  label: { fontSize: 14, lineHeight: 18, fontWeight: "500" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "400" },
} as const;
```

Copy every ramp `globals.css` defines, using its names. Do not rename `error`
to `danger` or invent ramps it does not have.

- [ ] **Step 4: Write the provider**

Create `apps/mobile/src/theme/index.ts` exporting a `Theme` type, a
`ThemeProvider`, and `useTheme()`. Keep it a single light theme for now — dark
mode is not in Phase 0 and a provider with one value is enough to make adding
it later a change in one file rather than everywhere.

- [ ] **Step 5: Green, then checks and commit**

```bash
cd apps/mobile && pnpm jest src/__tests__/theme.test.ts
```

```bash
pnpm turbo lint typecheck test:unit --filter=@space/mobile
```

```bash
git add -A && git commit -m "feat(mobile): add brand theme tokens from v1"
```

---

### Task 4: UI primitives

Every screen in the product is built from these. They exist so that a domain
task writes `<Button loading>` rather than re-deriving a pressable with a
spinner, and so loading, empty and error states look the same everywhere
instead of being improvised 104 times.

**Files:**
- Create: `apps/mobile/src/ui/Text.tsx`, `Button.tsx`, `Input.tsx`, `Card.tsx`, `Screen.tsx`, `states.tsx`, `index.ts`
- Test: `apps/mobile/src/__tests__/ui.test.tsx`

**Interfaces:**
- `Text` — `variant` from the typography scale, `color`, `children`
- `Button` — `title`, `onPress`, `variant: "primary" | "secondary" | "ghost"`, `loading`, `disabled`
- `Input` — `label`, `value`, `onChangeText`, `error`, plus `TextInput` props
- `Card` — surface with padding and radius
- `Screen` — safe-area wrapper, optional `scroll` and `onRefresh`
- `LoadingState`, `EmptyState` (`title`, `message`, optional `action`), `ErrorState` (`message`, `onRetry`)

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/__tests__/ui.test.tsx`. Test behaviour, not styling:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";

import { Button, EmptyState, ErrorState, Input, LoadingState } from "../ui";

describe("Button", () => {
  it("calls onPress when pressed", () => {
    const onPress = jest.fn();
    render(<Button title="Save" onPress={onPress} />);
    fireEvent.press(screen.getByText("Save"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not call onPress while loading", () => {
    // A double-submit on a slow network is the single most common way to
    // create duplicate rows, so the guard belongs in the primitive.
    const onPress = jest.fn();
    render(<Button title="Save" onPress={onPress} loading />);
    fireEvent.press(screen.getByLabelText("Save"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("does not call onPress when disabled", () => {
    const onPress = jest.fn();
    render(<Button title="Save" onPress={onPress} disabled />);
    fireEvent.press(screen.getByLabelText("Save"));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe("Input", () => {
  it("renders its label and reports changes", () => {
    const onChangeText = jest.fn();
    render(<Input label="Email" value="" onChangeText={onChangeText} />);
    fireEvent.changeText(screen.getByLabelText("Email"), "a@b.test");
    expect(onChangeText).toHaveBeenCalledWith("a@b.test");
  });

  it("shows an error message when given one", () => {
    render(<Input label="Email" value="" onChangeText={jest.fn()} error="Required" />);
    expect(screen.getByText("Required")).toBeTruthy();
  });
});

describe("states", () => {
  it("EmptyState shows its title and message", () => {
    render(<EmptyState title="No sessions" message="Nothing scheduled yet." />);
    expect(screen.getByText("No sessions")).toBeTruthy();
    expect(screen.getByText("Nothing scheduled yet.")).toBeTruthy();
  });

  it("ErrorState retries", () => {
    const onRetry = jest.fn();
    render(<ErrorState message="Could not load." onRetry={onRetry} />);
    fireEvent.press(screen.getByText("Try again"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("LoadingState is announced to screen readers", () => {
    render(<LoadingState />);
    expect(screen.getByLabelText("Loading")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run and watch them fail**

```bash
cd apps/mobile && pnpm jest src/__tests__/ui.test.tsx
```

- [ ] **Step 3: Implement the primitives**

Build each against the theme — no hard-coded colours or sizes; every value
comes from `tokens.ts`. Requirements the tests pin:

- `Button` must set `accessibilityLabel` to its title and set
  `accessibilityState={{ disabled, busy: loading }}`, and must not fire
  `onPress` while `loading` or `disabled`.
- `Input` must associate its label via `accessibilityLabel` so
  `getByLabelText` finds the field, and render `error` as visible text.
- `LoadingState` must carry `accessibilityLabel="Loading"`.
- `ErrorState`'s retry control must read "Try again".

- [ ] **Step 4: Green, then checks and commit**

```bash
cd apps/mobile && pnpm jest src/__tests__/ui.test.tsx
```

```bash
pnpm turbo lint typecheck test:unit --filter=@space/mobile
```

```bash
git add -A && git commit -m "feat(mobile): add UI primitives and shared states"
```

---

### Task 5: Session store carries scopes and boot status

The store holds `AuthUser` today — id, name, email, role. Role alone cannot
answer "is this an alumnus" (needs `graduationYear`), "which seasons do I
administer", or "which groups do I lead", and all three gate what the app
shows. It also has no notion of "still restoring", so the UI cannot tell a
signed-out user from one whose tokens are being checked. See Decision D3.

**Files:**
- Modify: `apps/mobile/src/store/session.ts`
- Test: `apps/mobile/src/__tests__/session-store.test.ts`

**Interfaces:**
- Produces:
  - `type BootStatus = "idle" | "restoring" | "authenticated" | "anonymous"`
  - `useSessionStore` — `{ status, user: MeUser | null, scopes: MeScopes | null, setSession(user, scopes), clear(), setStatus(status) }`
  - `useIsAlumnus()` — derived selector
  - `useNav()` — returns `navFor` for the current user, or null when anonymous

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/__tests__/session-store.test.ts`:

```ts
import { navByRole } from "@space/shared";

import { useSessionStore } from "../store/session";

const user = { id: 1, name: "A", email: "a@b.test", role: "STUDENT" as const, avatarPath: null };
const scopes = {
  seasonAdminIds: [],
  groupLeaderIds: [],
  activeSeasonId: null,
  graduationYear: null as number | null,
};

beforeEach(() => {
  useSessionStore.getState().clear();
});

describe("session store", () => {
  it("starts idle with no user", () => {
    expect(useSessionStore.getState().status).toBe("idle");
    expect(useSessionStore.getState().user).toBeNull();
    expect(useSessionStore.getState().scopes).toBeNull();
  });

  it("setSession stores both halves and marks authenticated", () => {
    useSessionStore.getState().setSession(user, scopes);
    const s = useSessionStore.getState();
    expect(s.user).toEqual(user);
    expect(s.scopes).toEqual(scopes);
    expect(s.status).toBe("authenticated");
  });

  it("clear resets to anonymous, not idle", () => {
    // idle means "not yet checked"; anonymous means "checked, nobody home".
    // Conflating them makes the boot gate loop or flash the login screen.
    useSessionStore.getState().setSession(user, scopes);
    useSessionStore.getState().clear();
    const s = useSessionStore.getState();
    expect(s.status).toBe("anonymous");
    expect(s.user).toBeNull();
    expect(s.scopes).toBeNull();
  });

  it("resolves the nav for the signed-in user", () => {
    useSessionStore.getState().setSession(user, scopes);
    expect(useSessionStore.getState().nav()).toBe(navByRole.STUDENT);
  });

  it("resolves the alumni nav for a graduated student", () => {
    useSessionStore.getState().setSession(user, { ...scopes, graduationYear: 2024 });
    const nav = useSessionStore.getState().nav();
    expect(nav?.tabs.map((t) => t.label)).toEqual(["Events", "History", "Home", "Profile", "More"]);
  });

  it("has no nav when anonymous", () => {
    expect(useSessionStore.getState().nav()).toBeNull();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd apps/mobile && pnpm jest src/__tests__/session-store.test.ts
```

- [ ] **Step 3: Rewrite the store**

`nav()` lives on the store rather than in each screen so the alumni rule is
applied in exactly one place.

```ts
import { create } from "zustand";
import { navFor, type MeScopes, type MeUser, type RoleNav } from "@space/shared";

/**
 * `idle` means the app has not yet looked for a stored session; `anonymous`
 * means it looked and there was none. The boot gate needs to tell those apart
 * — treating idle as anonymous flashes the login screen at a signed-in user
 * on every cold start.
 */
export type BootStatus = "idle" | "restoring" | "authenticated" | "anonymous";

interface SessionState {
  status: BootStatus;
  user: MeUser | null;
  scopes: MeScopes | null;
  setStatus: (status: BootStatus) => void;
  setSession: (user: MeUser, scopes: MeScopes) => void;
  clear: () => void;
  nav: () => RoleNav | null;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  status: "idle",
  user: null,
  scopes: null,
  setStatus: (status) => set({ status }),
  setSession: (user, scopes) => set({ user, scopes, status: "authenticated" }),
  clear: () => set({ user: null, scopes: null, status: "anonymous" }),
  nav: () => {
    const { user, scopes } = get();
    if (!user || !scopes) return null;
    return navFor({ role: user.role, graduationYear: scopes.graduationYear });
  },
}));
```

- [ ] **Step 4: Green, then commit**

```bash
cd apps/mobile && pnpm jest src/__tests__/session-store.test.ts
```

```bash
git add -A && git commit -m "feat(mobile): session store carries scopes and boot status"
```

---

### Task 6: Boot gate — restore the session before anything renders

Today `app/index.tsx` redirects to `/login` unconditionally, so a user with
perfectly good tokens in secure storage is asked to sign in on every cold
start. The root layout also renders its `Stack` immediately, so there is no
point at which the app can decide where to send someone.

**Files:**
- Create: `apps/mobile/src/hooks/use-session.ts`
- Modify: `apps/mobile/app/_layout.tsx`
- Modify: `apps/mobile/app/index.tsx`
- Test: `apps/mobile/src/__tests__/use-session.test.tsx`

**Interfaces:**
- Produces: `useBootSession()` — runs once, restores or clears; `useLogin()`, `useLogout()`
- Consumes: `loadAccessToken`, `clearSession` from `../lib/token-storage`; `apiClient` from `../lib/api-client`; `meResponseSchema` from `@space/shared`

**The flow:**

1. status `idle` → `restoring`
2. No stored access token → `clear()` → `anonymous`. Do not call the API.
3. Token present → `GET /api/v1/me`. The api-client's refresh interceptor
   already handles a 401 by rotating and retrying once, so this needs no
   retry logic of its own.
4. Success → parse with `meResponseSchema`, `setSession`
5. Failure, or `user: null` (the row was deleted inside the token's window) →
   `clearSession()` and `clear()`

Parsing with the schema rather than casting matters: it is the same discipline
`api-client.ts` already applies to login, and it means a backend drift fails
loudly at the boundary instead of putting a malformed object in the store.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/__tests__/use-session.test.tsx`. Mock the api-client
and token storage; assert on the store's resulting state.

```tsx
import { renderHook, waitFor } from "@testing-library/react-native";

const get = jest.fn();
jest.mock("../lib/api-client", () => ({ apiClient: { get: (...a: unknown[]) => get(...a) } }));

const loadAccessToken = jest.fn();
const clearSession = jest.fn();
jest.mock("../lib/token-storage", () => ({
  loadAccessToken: () => loadAccessToken(),
  clearSession: () => clearSession(),
}));

import { useSessionStore } from "../store/session";
import { useBootSession } from "../hooks/use-session";

const me = {
  user: { id: 1, name: "A", email: "a@b.test", role: "STUDENT", avatarPath: null },
  scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: null, graduationYear: null },
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState({ status: "idle", user: null, scopes: null });
});

it("goes anonymous without calling the API when there is no token", async () => {
  loadAccessToken.mockResolvedValue(null);
  renderHook(() => useBootSession());
  await waitFor(() => expect(useSessionStore.getState().status).toBe("anonymous"));
  expect(get).not.toHaveBeenCalled();
});

it("restores the session from /me when a token is stored", async () => {
  loadAccessToken.mockResolvedValue("tok");
  get.mockResolvedValue({ data: { data: me } });
  renderHook(() => useBootSession());
  await waitFor(() => expect(useSessionStore.getState().status).toBe("authenticated"));
  expect(useSessionStore.getState().user).toEqual(me.user);
  expect(useSessionStore.getState().scopes).toEqual(me.scopes);
});

it("clears stored tokens when /me rejects", async () => {
  loadAccessToken.mockResolvedValue("stale");
  get.mockRejectedValue(new Error("401"));
  renderHook(() => useBootSession());
  await waitFor(() => expect(useSessionStore.getState().status).toBe("anonymous"));
  expect(clearSession).toHaveBeenCalled();
});

it("treats a null user as signed out", async () => {
  // /me returns { user: null } when the row was deleted inside the access
  // token's 15-minute window. The token still verifies, so only this check
  // stops the app rendering a session for a user who no longer exists.
  loadAccessToken.mockResolvedValue("tok");
  get.mockResolvedValue({ data: { data: { ...me, user: null } } });
  renderHook(() => useBootSession());
  await waitFor(() => expect(useSessionStore.getState().status).toBe("anonymous"));
  expect(clearSession).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd apps/mobile && pnpm jest src/__tests__/use-session.test.tsx
```

- [ ] **Step 3: Implement the hook, then wire the gate**

`useBootSession` runs its effect once (guard on `status === "idle"`).

`app/_layout.tsx` calls it, and while `status` is `idle` or `restoring` renders
`<LoadingState />` instead of the `Stack` — that is the whole point of the
gate. Wrap in `ThemeProvider` and `QueryClientProvider`.

**Known gap between Task 6 and Task 7 (controller ruling P2).** The redirect
target below, `/dashboard`, is created by Task 7. Between these two tasks the
app is not runnable on a device for an authenticated user — the redirect points
at a route that does not exist yet. Tests and typecheck still pass, and Task 7
performs the device check. Do not "fix" this by pointing at `/home`; that file
is deleted in Task 7.

`app/index.tsx` becomes:

```tsx
export default function Index() {
  const status = useSessionStore((s) => s.status);
  if (status === "authenticated") return <Redirect href="/dashboard" />;
  return <Redirect href="/login" />;
}
```

- [ ] **Step 4: Green, then checks and commit**

```bash
cd apps/mobile && pnpm jest src/__tests__/use-session.test.tsx
```

```bash
pnpm turbo lint typecheck test:unit --filter=@space/mobile
```

```bash
git add -A && git commit -m "feat(mobile): restore the session on launch instead of always showing login"
```

---

### Task 7: Role-aware tab navigation

The shell that every Phase 1+ screen plugs into. The tab bar is rendered from
`navFor(user).tabs`, so a student and an admin see different tabs pointing at
the same route files (Decision D1).

**Files:**
- Create: `apps/mobile/app/(app)/_layout.tsx`
- Create: one placeholder route per destination (list below)
- Create: `apps/mobile/src/components/NavIcon.tsx`
- Test: `apps/mobile/src/__tests__/role-tabs.test.tsx`

**Interfaces:**
- Produces: the `(app)` route group with a `Tabs` navigator; `NavIcon` mapping `NavIconName` → a glyph

**Routes to create.** The union of every `href` across all six role navs —
count them from `packages/shared/src/navigation.ts` rather than trusting this
list, and create exactly the set that appears there. Expected destinations:

`dashboard`, `calendar`, `events`, `seasons`, `season`, `groups`, `students`,
`students/alumni`, `students/dropped`, `users`, `assignments`, `submissions`,
`quizzes`, `reports`, `history`, `notes`, `profile`, `settings`, `more`

Each is a placeholder for now: a `Screen` with the destination name and an
`EmptyState` saying it is not built yet. They exist so the navigator resolves
and so Phase 1 replaces content rather than creating files.

**Guard.** `(app)/_layout.tsx` redirects to `/login` when `status` is
`anonymous`. The boot gate in Task 6 has already run by the time this mounts,
so it never sees `idle`.

**Delete `apps/mobile/app/home.tsx` (controller ruling P3).** It is the
scaffold's placeholder home screen, replaced by `(app)/dashboard`. Left in
place it is an unreachable route that a future reader will mistake for the
real one. Its only consumer was `app/index.tsx`, which Task 6 has already
repointed at `/dashboard`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/__tests__/role-tabs.test.tsx`. Test the tab *derivation*
— what the navigator is told to show — rather than expo-router's rendering,
which is not this app's code:

```tsx
import { navByRole, navFor } from "@space/shared";

import { useSessionStore } from "../store/session";

const scopes = {
  seasonAdminIds: [],
  groupLeaderIds: [],
  activeSeasonId: null,
  graduationYear: null as number | null,
};
const user = (role: "STUDENT" | "ADMIN" | "LEADER") => ({
  id: 1,
  name: "A",
  email: "a@b.test",
  role,
  avatarPath: null,
});

beforeEach(() => useSessionStore.getState().clear());

describe("role tabs", () => {
  it("shows the student tabs for a student", () => {
    useSessionStore.getState().setSession(user("STUDENT"), scopes);
    expect(useSessionStore.getState().nav()).toBe(navByRole.STUDENT);
  });

  it("shows different tabs for an admin than a student", () => {
    const student = navByRole.STUDENT.tabs.map((t) => t.href);
    const admin = navByRole.ADMIN.tabs.map((t) => t.href);
    expect(admin).not.toEqual(student);
  });

  it("every tab href has a route file", () => {
    // Guards Decision D1: the tab bar is data-driven, so a nav item pointing
    // at a route nobody created is a runtime crash, not a type error.
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const appDir = path.resolve(__dirname, "../../app/(app)");

    const hrefs = new Set<string>();
    for (const nav of Object.values(navByRole)) {
      for (const item of [...nav.tabs, ...nav.sidebar]) hrefs.add(item.href);
    }
    for (const item of navFor({ role: "STUDENT", graduationYear: 2024 }).tabs) {
      hrefs.add(item.href);
    }

    const missing = [...hrefs].filter(
      (href) => !fs.existsSync(path.join(appDir, `${href.slice(1)}.tsx`)) &&
        !fs.existsSync(path.join(appDir, href.slice(1), "index.tsx")),
    );
    expect(missing).toEqual([]);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd apps/mobile && pnpm jest src/__tests__/role-tabs.test.tsx
```

Expected: the third case fails listing every missing route.

- [ ] **Step 3: Create the layout and the placeholders**

`(app)/_layout.tsx` reads `nav()` from the store and renders a `Tabs` with a
`Tabs.Screen` per entry, hiding every other route from the bar
(`href: null`) so the non-tab destinations stay reachable by navigation but do
not appear in it.

`NavIcon` maps each `NavIconName` to a glyph. Expo ships
`@expo/vector-icons` with the SDK — use it rather than adding a dependency, and
keep the mapping exhaustive so a new icon name is a type error.

- [ ] **Step 4: Green, then check it on a device**

```bash
cd apps/mobile && pnpm jest src/__tests__/role-tabs.test.tsx
```

Then run the app and sign in as a real staging student:

```bash
pnpm --filter @space/mobile dev
```

Confirm: the five student tabs appear, Home is centred, each tab opens its
placeholder, and a relaunch goes straight past login. Paste what you saw —
this is the first task whose result is only partly visible from tests.

- [ ] **Step 5: Checks and commit**

```bash
pnpm turbo lint typecheck test:unit --filter=@space/mobile
```

```bash
git add -A && git commit -m "feat(mobile): role-aware tab navigation with placeholder routes"
```

---

### Task 8: Forms, query defaults, and the login screen

The last foundation piece. Every write screen in the product is a form over a
shared Zod schema, and every read screen is a query — both deserve one wiring
rather than 104 improvisations. The login screen is rebuilt on the new stack as
the first consumer, which proves it works end to end.

**Files:**
- Modify: `apps/mobile/package.json` (add `react-hook-form`, `@hookform/resolvers`, `date-fns`)
- Create: `apps/mobile/src/lib/query-client.ts`
- Create: `apps/mobile/src/lib/format.ts`
- Create: `apps/mobile/src/ui/Form.tsx`
- Modify: `apps/mobile/app/_layout.tsx`, `apps/mobile/app/login.tsx`
- Test: `apps/mobile/src/__tests__/form.test.tsx`, `apps/mobile/src/__tests__/format.test.ts`

**Interfaces:**
- `createQueryClient()` — defaults: `retry: 1`, `staleTime: 30_000`, no refetch on window focus (meaningless on mobile)
- `FormField` — binds a `react-hook-form` controller to `Input`, showing the resolver's message as the field error
- `formatSessionTime`, `formatDate`, `formatDueDate` — the formatting Phase 1 needs

- [ ] **Step 1: Add the dependencies**

```bash
pnpm --filter @space/mobile add react-hook-form @hookform/resolvers date-fns
```

- [ ] **Step 2: Write the failing tests**

`format.test.ts` pins the display rules Phase 1 depends on — including the one
that matters: the API sends ISO strings, not `Date`s.

```ts
import { formatDate, formatDueDate, formatSessionTime } from "../lib/format";

describe("format", () => {
  it("formats an ISO string from the API, not a Date", () => {
    // Every timestamp crossing the wire is a string; a formatter that only
    // accepts Date would force every screen to parse first.
    expect(formatSessionTime("2026-03-01T18:00:00.000Z")).toEqual(expect.any(String));
  });

  it("renders a due date as a calendar day", () => {
    expect(formatDueDate("2026-04-01T00:00:00.000Z")).toContain("2026");
  });

  it("returns a placeholder for a null timestamp rather than throwing", () => {
    // dueAt, submittedAt, reviewedAt and checkedInAt are all nullable.
    expect(formatDate(null)).toBe("—");
  });
});
```

`form.test.tsx` proves validation surfaces and submission carries parsed values:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { loginRequestSchema } from "@space/shared";

import { TestLoginForm } from "./helpers/TestLoginForm";

it("shows the schema's error and blocks submit", async () => {
  const onSubmit = jest.fn();
  render(<TestLoginForm schema={loginRequestSchema} onSubmit={onSubmit} />);
  fireEvent.changeText(screen.getByLabelText("Email"), "not-an-email");
  fireEvent.press(screen.getByText("Sign in"));
  await waitFor(() => expect(screen.getByText(/email/i)).toBeTruthy());
  expect(onSubmit).not.toHaveBeenCalled();
});

it("submits parsed values when valid", async () => {
  const onSubmit = jest.fn();
  render(<TestLoginForm schema={loginRequestSchema} onSubmit={onSubmit} />);
  fireEvent.changeText(screen.getByLabelText("Email"), "a@b.test");
  fireEvent.changeText(screen.getByLabelText("Password"), "secret");
  fireEvent.press(screen.getByText("Sign in"));
  await waitFor(() =>
    expect(onSubmit).toHaveBeenCalledWith({ email: "a@b.test", password: "secret" }),
  );
});
```

Write `helpers/TestLoginForm.tsx` as a minimal harness over `FormField` — the
point is the wiring, not the login screen.

- [ ] **Step 3: Implement, then rebuild login on it**

Rewrite `app/login.tsx` to use `Screen`, `Input` via `FormField`, `Button` with
`loading`, and `ErrorState` for a failed attempt. Keep the existing behaviour:
on success store the tokens, set the session, and navigate.

The existing `login-screen.test.tsx` must keep passing. If it breaks because
the markup changed, update its queries — but do not weaken what it asserts.

- [ ] **Step 4: Full verification**

```bash
cd apps/mobile && pnpm jest
```

```bash
pnpm turbo build lint typecheck test:unit --force
```

Then a real device pass: sign in with a staging account, kill the app, relaunch,
and confirm it lands in the tabs without asking again. Paste what you saw.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(mobile): form stack, query defaults, and login rebuilt on the primitives"
```

---

## Self-Review

Checked against `docs/superpowers/specs/2026-08-21-full-migration-design.md`'s
Phase 0 definition — "role-aware navigation, auth guard, session restore, UI
primitives, forms, dates, error/empty/loading states, React Query wiring":

- Role-aware navigation → Tasks 2, 7
- Auth guard and session restore → Tasks 5, 6
- UI primitives and states → Tasks 3, 4
- Forms → Task 8
- Dates → Task 8 (`format.ts`); pickers deferred per Decision D4
- React Query wiring → Task 8

Two things the spec did not anticipate, both found while reading the source and
both carried as tasks rather than discovered mid-build: `/me` does not return
`graduationYear` (Task 1), and the session store cannot represent "still
checking" (Task 5).

Not in Phase 0, deliberately: charts, document picker, file export, dark mode,
offline cache. Each belongs to the domain that first needs it.

Interfaces are consistent across tasks — `MeUser`/`MeScopes` defined in Task 1
are what Task 5 stores and Task 6 fetches; `navFor` from Task 2 is what Task 5
exposes and Task 7 renders.
