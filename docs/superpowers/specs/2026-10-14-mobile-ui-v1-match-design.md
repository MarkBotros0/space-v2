# Mobile UI rebuild: match v1 exactly — design

Date: 2026-10-14 · Status: draft for owner review

## 1. Why

The first TestFlight build (0.1.0 (2), 2026-10-14) showed that the mobile app
does not look like v1 (`jpc-space`). The migration plans ported v1's
behaviour and its colour/spacing tokens (Phase 0, Task 3) but never a v1
screen: no plan had a visual reference or a side-by-side check, and Phase 0
chose its own navigation (flat bottom tab bar) and its own primitives
(`apps/mobile/src/ui/`).

Owner ruling (2026-10-14): **v2's UI must match v1 exactly** wherever the
functionality exists in v1. Where it does not exist in v1, v2 gets new UI
built from v1's design concepts.

## 2. Scope

In scope: `apps/mobile` rendering only.

| Case | Rule |
|---|---|
| Feature exists in v1 | Reproduce v1's page at a 375px phone viewport exactly — layout, components, copy, icons, font, light and dark themes, loading / empty / error states, modals. |
| Feature is v2-only (no v1 page) | New design composed only of v1's components and patterns. A mockup is approved by the owner before it is built. |
| Behaviour differs from v1 (owner kept v2 behaviour, 2026-10-10, PR #21) | v2's data and flow, presented the way v1 presents the nearest equivalent. |

Unchanged: `apps/backend`, the API, `packages/shared` contracts, data hooks,
Zod parsing at the client boundary, query keys, `navFor(user)` and the route
tree's role logic.

Out of scope: backend changes; adding v1 pages that v2 lacks (they are
listed as gaps for the owner to decide); Google Play release work; push
notifications.

## 3. Sub-projects and order

Each sub-project gets its own implementation plan and PR. Batches 2–6 each
end with a TestFlight build.

0. **Reference capture** — v1 screenshots and the screen map (§4).
1. **Foundations** — styling system, tokens, font, icons, shell, ported
   components, showcase (§5). Ends with TestFlight build.
2. **Student** screens.
3. **Leader** screens.
4. **Admin** screens.
5. **Super** screens.
6. **Mentor and alumni** screens.

During batches 2–6 the app mixes rebuilt and not-yet-rebuilt screens; that is
accepted.

## 4. Reference capture (sub-project 0)

**v1 runs from a copy, against a database branch.**

- v1 is copied (no `.git`, no `node_modules`, no `.next`) to
  `~/projects/JPC/.v1-reference/`, outside every repo. Dependencies are
  installed and the dev server runs there. `JPC/jpc-space` itself is never
  written to and no git command runs in it.
- `DATABASE_URL` points at the Neon branch `v1-ui-reference` (a copy-on-write
  branch of production, created by the owner, URL stored in
  `~/.secrets/jpc-v1-reference-db-url`). Before starting, a script confirms
  the branch host differs from production's without printing either URL.
  Production is never written to; v1's user switcher writes `lastLoginAt`,
  which lands on the branch.
- `DEV_USER_SWITCHER=1` lets the capture script act as any user without a
  password. `AUTH_SECRET` is a fresh local value (the copy never issues
  tokens anything else trusts). Email credentials are left unset.

**Capture.** A Playwright script, at a 375×812 viewport in light and dark
themes:

- picks one real user per role — student, leader, admin, super, mentor,
  alumni — choosing users with enough data that lists are populated;
- visits every page that role can reach (from v1's route tree and
  `lib/navigation.ts`) and screenshots it full-page;
- additionally captures, where the data allows: opened modals and sheets,
  the More menu, empty states, validation errors on forms.

**Screen map.** `docs/superpowers/ui-rebuild/screen-map.md` lists every v1
page: v1 route and component file, v2 route file, role(s), screenshot paths,
and a status — `match v1`, `v2-only`, or `v1-only (not in v2)`. v2 currently
has 55 route files against v1's 106 `page.tsx` files, because Phase 0 merged
role-prefixed pages into one destination per screen; the map records which v1
pages each v2 screen covers.

**Privacy.** Screenshots show real student data. They stay under
`.v1-reference/` on the devbox, are never committed, never published as an
artifact, and are referenced from the screen map by path only.

## 5. Foundations (sub-project 1)

**Styling system: NativeWind**, configured from v1's
`src/app/globals.css` `@theme` block and `.dark` overrides — colours (brand
navy/teal ramps, neutrals, success/warning/error/info, role colours,
sidebar/card/background semantic colours), radii, shadows, font sizes — so
v1's class strings port nearly verbatim.

- First task is a spike: confirm which NativeWind release handles v1's
  Tailwind v4 class names and `@theme` tokens on Expo SDK 54 /
  React Native 0.81 with the new architecture. The spike's result fixes the
  version; it is reported to the owner before Foundations continues.
- Classes with no native equivalent get a named fallback: `backdrop-blur`
  → `expo-blur`; `hover:` → pressed state; `md:`/`lg:` breakpoints are
  dropped (phone width only).
- **Theme**: follows the device setting, with v1's manual toggle
  (`theme-toggle.tsx`) available in settings, persisted on device.

**Font**: Geist (v1's `next/font/google` choice in `src/app/layout.tsx`)
loaded with `expo-font`; Geist Mono where v1 uses it.

**Icons**: `lucide-react-native`, using the same icon names as v1's
`lucide-react` imports.

**Shell** — ported from v1's `src/components/layout/`:

- top bar, page header, More menu, user menu, notification bell;
- the floating pill tab bar from `shell-frame.tsx` (inset 16px, fully
  rounded, translucent navy with blur, safe-area aware). It replaces the
  current `(app)/_layout.tsx` tab bar. Items still come from `navFor(user)`.

**Components** — every file in v1's `src/components/ui/` gets a React Native
counterpart with the same name, variants and sizes: attendance-pill, avatar,
badge, button, card, charts, chip-input, combobox, confirm-dialog,
data-table, date-picker, empty-state, field, file-upload, form-field, input,
label, logo, modal, multi-select, password-input, progress, progress-ring,
rich-text-editor, rich-text-view, select, separator, skeleton,
submission-status-badge, switch, tabs, textarea, theme-toggle, time-picker,
toaster. Where v1 depends on browser-only behaviour (Base UI popovers,
`<input type=date>`), the native control is styled to look like v1's. v1's
`modal` already renders as a bottom sheet on phones; the port is a native
sheet with the same look.

**Showcase**: a hidden developer route renders every component in light and
dark, the counterpart of v1's `src/app/dev/design-system/`. It is compared
side by side with v1's design-system page before any product screen is
rebuilt.

**Retirement of the current UI**: `src/ui/` (Button, Card, Form, Input,
Screen, Sheet, states, Text) and `src/theme/` stay until no screen imports
them, then they are deleted in the batch that frees them.

## 6. Rebuilding a screen (batches 2–6)

For each v2 screen in the batch:

1. Read v1's page component(s) in `.v1-reference/` and its screenshots.
2. Rewrite the screen's rendering with the ported components and v1's class
   strings. Hooks, query keys, Zod parsing, permissions and navigation stay.
3. Capture the v2 screen (§7) in the same roles, themes and states as v1.
4. Compare. The screen is done only when there is no visible difference
   apart from unavoidable platform details — status bar, native scroll
   bounce, keyboard. Any remaining difference is written in the batch's gap
   note, never left silent.

v2-only screens: a mockup built from ported components is shown to the owner
and approved before the screen is built.

## 7. Acceptance and tooling

**v2 capture runs on a dedicated Android emulator on the devbox** (the
devbox cannot run an iOS simulator):

- New AVD `jpc-ui`, same system image as the existing `nanny-e2e` AVD, LCD
  density set so the logical width is 375dp. Headless, same flags as the
  devbox's other emulators (`-no-window -gpu swiftshader_indirect
  -no-snapshot-load -no-snapshot-save -no-audio -no-boot-anim`), port 5558,
  tmux session `jpc-space-emulator`, log `~/logs/jpc-space-emulator.log`.
- The `nanny-e2e` (5554) and `egx-ui` (5556) emulators belong to other
  projects and are never touched.
- Maestro (`~/.maestro/bin/maestro`) flows open each screen as the right
  user and state and take the screenshot, so captures repeat after every
  change.
- The app talks to a local v2 backend pointed at the same Neon branch, so v1
  and v2 screenshots show the same data.

**Comparison page**: per batch, an HTML page showing v1 and v2 side by side
for every screen, role, theme and state, with the gap note. Kept on the
devbox and sent to the owner as a private file — never published, because
it contains real student data.

**Owner review**: at the end of each batch the owner reviews the comparison
page, then the batch's TestFlight build on iOS.

## 8. Testing and delivery

- Behaviour tests (hooks, permissions, navigation, API client) keep passing
  unchanged.
- Screen tests are updated to the new markup; tests that only asserted old
  styling are replaced, not kept.
- Each batch ends with `pnpm typecheck`, `pnpm lint` and `pnpm test:unit`
  green, then a PR into `main`. Pushing asks the owner first, with
  `gh auth switch --hostname github.com --user MarkBotros0` in the same
  command.
- The `space-v2` `CLAUDE.md` "Mobile conventions" section is updated in the
  Foundations PR: NativeWind and the ported components replace `useTheme()`
  and `src/ui/`, and every screen change requires a side-by-side check
  against v1.

## 9. Risks

- **NativeWind and Tailwind v4.** If no NativeWind release handles v1's v4
  classes on SDK 54 reliably, Foundations falls back to translating v1's
  tokens into a NativeWind config on the Tailwind version it supports and
  renaming the few classes that differ; the spike decides this before any
  component is ported.
- **Android vs iOS rendering.** Acceptance runs on Android; fonts and tokens
  are identical, but shadows and blur render differently on iOS. Each
  batch's TestFlight review is the iOS check.
- **Mixed UI during the rollout.** Testers see old and new screens side by
  side until batch 6. Accepted by the owner (release by role, 2026-10-14).
- **Branch data drift.** The Neon branch is a snapshot; if v1 screenshots are
  re-taken later, they and the v2 captures must use the same branch.
