# UI Plan 01 — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the mobile app v1's exact visual system — NativeWind configured with v1's resolved tokens, Geist, Lucide, v1's shell with the floating pill tab bar, and React Native ports of all 35 v1 UI components — verified on a showcase screen against v1's design-system page, and wire the new shell into the app.

**Architecture:** NativeWind 4.2 (Tailwind 3.4 engine) with a theme generated from `docs/superpowers/ui-rebuild/v1-tokens.json` (Plan 00), recreating v1's Tailwind v4 scale names so v1's class strings port verbatim. Semantic colours are CSS variables switched by a `dark` class for light/dark. Everything new lives in `apps/mobile/src/design/` with v1's file names; the old `src/ui/` and `src/theme/` stay until screen batches stop importing them. Visual acceptance runs on a dedicated headless Android emulator (`jpc-ui`, 375dp wide) against a local v2 backend on the Neon branch.

**Tech Stack:** Expo SDK 54, React Native 0.81 (new architecture), expo-router 6, NativeWind 4.2.7, tailwindcss 3.4.19, react-native-reanimated (SDK 54's version via `expo install`), class-variance-authority 0.7.1, tailwind-merge (v3 line — same as v1), clsx 2, lucide-react-native, expo-blur, `@expo-google-fonts/geist`, `@expo-google-fonts/geist-mono`, sonner-native, @10play/tentap-editor, react-native-render-html, Maestro, Jest (jest-expo).

**Spec:** `docs/superpowers/specs/2026-10-14-mobile-ui-v1-match-design.md` (§5, §7, §8)

**Prerequisite:** Plan 00 complete — `docs/superpowers/ui-rebuild/v1-tokens.json` and `screen-map.md` committed, v1 copy running on `http://localhost:3100` (tmux `jpc-space-v1-ref`), screenshots under `~/projects/JPC/.v1-reference/shots/`.

## Global Constraints

- `~/projects/JPC/jpc-space` is READ-ONLY. Read v1 source from the copy at `~/projects/JPC/.v1-reference/app/` (identical content).
- Match v1 exactly at 375px: same class strings, same variants and sizes, same icons, same copy. Deviations only where React Native cannot do what the web does, each written in the task's "Native differences" list.
- Phone width only: drop `md:`/`lg:`/`xl:` classes when porting; keep the base (mobile) classes.
- No `@/` path alias; relative imports only (space-v2 CLAUDE.md).
- No `process.env` outside `src/lib/` config files; `EXPO_PUBLIC_*` reads go in `src/lib/app-config.ts`.
- Never `as Href` / `as any` to silence typed routes.
- New UI code goes under `apps/mobile/src/design/`; file names copy v1's (`button.tsx`, `card.tsx`, …).
- The `nanny-e2e` (5554) and `egx-ui` (5556) emulators and Metro 8081 belong to other projects — never touch them. JPC uses emulator port 5558, Metro 8090, backend 4100.
- Long-running processes in tmux, logged to `~/logs/jpc-space-<task>.log`.
- Screenshots containing real data stay under `~/projects/JPC/.v1-reference/` (v1) and `~/projects/JPC/.v2-captures/` (v2). Never commit, never publish.
- Ask the owner before any push; push with `gh auth switch --hostname github.com --user MarkBotros0 && git push …`.
- Gate: Task 2 (spike) ends with a report to the owner; do not start Task 3 until the owner has seen it.

## Review Focus

- **Device in dark mode at first launch with no saved preference** → the app opens dark (system), not light; pinned in Task 4's tests.
- **Role with more than 5 tabs** → floating bar shows the first 5 exactly like v1 (`tabItems.slice(0, 5)`), rest reachable via More; pinned in Task 5's tests.
- **Long translated/user text in buttons, badges and tab labels** (Arabic names, long season titles) → truncates on one line like v1 (`whitespace-nowrap` / `truncate`), never wraps the tab bar; pinned in Task 6's and Task 5's tests.
- **Font weight on Android** → `font-semibold` text renders in Geist SemiBold, not synthetic bold of Regular; pinned in Task 4's tests (class → fontFamily mapping).
- **Opacity-modified semantic colours** (`bg-primary/92`, `bg-destructive/10`, `bg-sidebar/75`) → render translucent, not opaque; pinned in Task 3's tests (generated config uses `<alpha-value>`).

---

## File Structure

```
apps/mobile/
  babel.config.js                 # + nativewind jsxImportSource and babel plugin
  metro.config.js                 # + withNativeWind(input: global.css, inlineRem: 16)
  tailwind.config.js              # requires src/design/theme/tailwind-theme.js
  global.css                      # GENERATED: @tailwind layers + :root / .dark:root variables
  nativewind-env.d.ts             # nativewind types
  scripts/generate-design-tokens.mjs   # v1-tokens.json -> global.css + tailwind-theme.js
  src/design/
    theme/tailwind-theme.js       # GENERATED: colors, radius, shadows, fonts, font-weight plugin
    theme/theme-mode.ts           # useThemeMode(): light | dark | system, persisted
    theme/fonts.ts                # GEIST_FONTS map for useFonts()
    lib/cn.ts                     # cn() = twMerge(clsx())
    lib/shadow.ts                 # SHADOWS + shadowStyle() for v1's shadow tokens
    icons/nav-icon.tsx            # v1 nav-link iconMap with lucide-react-native
    layout/shell-frame.tsx        # main content container (px-4 pt-4 pb-24)
    layout/floating-tab-bar.tsx   # v1 mobile nav pill
    layout/nav-link.tsx           # tab variant of v1 NavLink
    layout/top-bar.tsx
    layout/page-header.tsx
    layout/more-menu.tsx
    layout/user-menu.tsx
    layout/notification-bell.tsx
    ui/<one file per v1 components/ui file>.tsx
    ui/index.ts
  app/dev/design-system.tsx       # showcase (hidden unless EXPO_PUBLIC_SHOW_DEV_ROUTES=1)
  .maestro/                       # flows: login-as.yaml, capture-showcase.yaml
tools/ui-reference/
  set-reference-passwords.mjs     # branch-only: known password for the reference users
  compare.mjs                     # builds the side-by-side comparison HTML
```

---

### Task 1: JPC emulator, local backend on the branch, baseline dev build

**Files:**
- Create: `tools/ui-reference/set-reference-passwords.mjs`, `apps/mobile/.maestro/login-as.yaml`, `tools/ui-reference/emulator.sh`, `tools/ui-reference/backend.sh`
- Modify: `apps/mobile/.gitignore` (add `/android`, `/ios`)

**Interfaces:**
- Produces: emulator `emulator-5558` (AVD `jpc-ui`, 1125×2436 @ 480dpi = 375×812dp); local backend `http://localhost:4100` (emulator sees it as `http://10.0.2.2:4100`); reference users on the branch share the password in `~/.secrets/jpc-v1-reference-password`; Maestro flow `login-as.yaml` taking `EMAIL` and `PASSWORD`.

- [ ] **Step 1: Create the AVD**

```bash
AVD=~/.android/avd
cp -r $AVD/nanny-e2e.avd $AVD/jpc-ui.avd
sed "s#nanny-e2e#jpc-ui#g" $AVD/nanny-e2e.ini > $AVD/jpc-ui.ini
rm -rf $AVD/jpc-ui.avd/*.lock $AVD/jpc-ui.avd/snapshots
rm -f $AVD/jpc-ui.avd/userdata-qemu.img* $AVD/jpc-ui.avd/cache.img*
sed -i 's/^hw.lcd.density = .*/hw.lcd.density = 480/; s/^hw.lcd.width = .*/hw.lcd.width = 1125/; s/^hw.lcd.height = .*/hw.lcd.height = 2436/; s/^AvdId = .*/AvdId = jpc-ui/; s/^avd.ini.displayname = .*/avd.ini.displayname = jpc-ui/' $AVD/jpc-ui.avd/config.ini
grep -E "hw.lcd|AvdId" $AVD/jpc-ui.avd/config.ini
```

Expected: density 480, width 1125, height 2436, AvdId jpc-ui. (1125 / (480/160) = 375dp.)

- [ ] **Step 2: Emulator script and boot**

`tools/ui-reference/emulator.sh`:

```bash
#!/usr/bin/env bash
# Boots the JPC-only emulator on port 5558. Never touches nanny-e2e/egx-ui.
set -euo pipefail
tmux kill-session -t jpc-space-emulator 2>/dev/null || true
tmux new -d -s jpc-space-emulator "~/Android/Sdk/emulator/emulator -avd jpc-ui -port 5558 -no-window -gpu swiftshader_indirect -no-snapshot-load -no-snapshot-save -no-audio -no-boot-anim 2>&1 | tee ~/logs/jpc-space-emulator.log"
ADB=~/Android/Sdk/platform-tools/adb
for i in $(seq 1 120); do
  [ "$($ADB -s emulator-5558 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] && break
  sleep 3
done
$ADB -s emulator-5558 shell svc wifi disable   # nanny-app lab: host routing breaks with emulated Wi-Fi on
$ADB -s emulator-5558 shell wm size
$ADB -s emulator-5558 shell wm density
```

Run: `chmod +x tools/ui-reference/emulator.sh && tools/ui-reference/emulator.sh`
Expected: `Physical size: 1125x2436`, `Physical density: 480`.

- [ ] **Step 3: Known password for the reference users (branch only)**

`tools/ui-reference/set-reference-passwords.mjs`:

```js
// Sets one known bcrypt password on the Plan-00 reference users, ON THE NEON
// BRANCH ONLY, so the v2 app can log in as them. Guarded like setup-v1.sh.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import pg from "pg";
import { assertBranchNotProduction } from "./lib/guard.mjs";
import { BRANCH_URL_FILE, USERS_FILE, V1_SOURCE_DIR } from "./lib/paths.mjs";

const PASSWORD_FILE = path.join(os.homedir(), ".secrets/jpc-v1-reference-password");
const branch = readFileSync(BRANCH_URL_FILE, "utf8").trim();
const prodEnv = readFileSync(path.join(V1_SOURCE_DIR, ".env"), "utf8");
assertBranchNotProduction(branch, (prodEnv.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m) ?? [])[1] ?? "");

if (!existsSync(PASSWORD_FILE)) {
  writeFileSync(PASSWORD_FILE, randomBytes(18).toString("base64url"), { mode: 0o600 });
}
const password = readFileSync(PASSWORD_FILE, "utf8").trim();
const hash = await bcrypt.hash(password, 10);
const users = Object.values(JSON.parse(readFileSync(USERS_FILE, "utf8"))).filter(Boolean);

const client = new pg.Client({ connectionString: branch });
await client.connect();
const { rowCount } = await client.query(
  `update "User" set "passwordHash" = $1 where email = any($2::text[])`,
  [hash, users.map((u) => u.email)],
);
await client.end();
console.log(`updated ${rowCount} reference users on the branch`);
```

Add `"bcryptjs": "3.0.3"` to `tools/ui-reference/package.json` dependencies, `npm install`, then run: `cd tools/ui-reference && node set-reference-passwords.mjs`
Expected: `updated N reference users on the branch` where N = roles found in Plan 00.

- [ ] **Step 4: Local backend on the branch**

`tools/ui-reference/backend.sh`:

```bash
#!/usr/bin/env bash
# v2 backend on :4100 against the Neon branch. Secrets read from files only.
set -euo pipefail
cd ~/projects/JPC/space-v2/apps/backend
tmux kill-session -t jpc-space-backend-ref 2>/dev/null || true
tmux new -d -s jpc-space-backend-ref "DATABASE_URL=\"\$(cat ~/.secrets/jpc-v1-reference-db-url)\" AUTH_SECRET=\"\$(openssl rand -base64 32)\" PORT=4100 MOBILE_APP_ORIGIN='*' pnpm dev 2>&1 | tee ~/logs/jpc-space-backend-ref.log"
for i in $(seq 1 60); do
  curl -s -m 3 http://localhost:4100/health | grep -q '"up"' && { echo "backend up on :4100 (branch)"; exit 0; }
  sleep 2
done
echo "backend did not report database up; see ~/logs/jpc-space-backend-ref.log"; exit 1
```

Run: `chmod +x tools/ui-reference/backend.sh && tools/ui-reference/backend.sh`
Expected: `backend up on :4100 (branch)`.

- [ ] **Step 5: Baseline Android dev build on the emulator**

Append to `apps/mobile/.gitignore`:

```
/android
/ios
```

Run (tmux, it takes several minutes):

```bash
tmux new -d -s jpc-space-android-dev "cd ~/projects/JPC/space-v2/apps/mobile && EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:4100 npx expo run:android --device emulator-5558 --port 8090 2>&1 | tee ~/logs/jpc-space-android-dev.log"
```

If `--device` does not accept the serial, use `ANDROID_SERIAL=emulator-5558` in the environment instead. Expected: build succeeds, app opens on the login screen. Verify: `mkdir -p ~/projects/JPC/.v2-captures && ~/Android/Sdk/platform-tools/adb -s emulator-5558 exec-out screencap -p > ~/projects/JPC/.v2-captures/baseline-login.png` and view it with the Read tool.

- [ ] **Step 6: Maestro login flow**

`apps/mobile/.maestro/login-as.yaml`:

```yaml
appId: com.jpc.space
---
- launchApp:
    clearState: true
- tapOn:
    id: "login-email"
- inputText: ${EMAIL}
- tapOn:
    id: "login-password"
- inputText: ${PASSWORD}
- tapOn:
    id: "login-submit"
- extendedWaitUntil:
    notVisible:
      id: "login-submit"
    timeout: 20000
```

If the login screen's inputs lack these `testID`s, add `testID="login-email"`, `testID="login-password"`, `testID="login-submit"` in `apps/mobile/app/login.tsx` (no other change) and reload.

Run:

```bash
cd ~/projects/JPC/space-v2/apps/mobile && ANDROID_SERIAL=emulator-5558 ~/.maestro/bin/maestro test \
  -e EMAIL="$(node -e "console.log(require(process.env.HOME+'/projects/JPC/.v1-reference/users.json').student.email)")" \
  -e PASSWORD="$(cat ~/.secrets/jpc-v1-reference-password)" .maestro/login-as.yaml
```

Expected: flow passes; the dashboard is on screen.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/.gitignore apps/mobile/.maestro/login-as.yaml apps/mobile/app/login.tsx tools/ui-reference/set-reference-passwords.mjs tools/ui-reference/emulator.sh tools/ui-reference/backend.sh tools/ui-reference/package.json tools/ui-reference/package-lock.json
git commit -m "chore(ui-reference): JPC emulator, branch backend and Maestro login"
```

---

### Task 2: Spike — NativeWind 4.2 on SDK 54 with v1's patterns (GATE)

**Files:**
- Modify: `apps/mobile/package.json`, `apps/mobile/babel.config.js`, `apps/mobile/metro.config.js`, `apps/mobile/jest.config.js`, `apps/mobile/app/_layout.tsx` (import `../global.css`)
- Create: `apps/mobile/tailwind.config.js`, `apps/mobile/global.css` (hand-written for the spike; Task 3 regenerates it), `apps/mobile/nativewind-env.d.ts`, `apps/mobile/src/__tests__/nativewind-smoke.test.tsx`, `apps/mobile/app/dev/spike.tsx` (deleted at the end of the task)

**Questions this task answers** (report each yes/no with evidence):
1. Does NativeWind 4.2.7 build and run on SDK 54 / RN 0.81 new architecture with the installed Reanimated?
2. Do CSS-variable colours with opacity modifiers render translucent (`bg-primary/92`, `bg-sidebar/75`)?
3. Does `dark:` follow the class set by `colorScheme.set("dark")`?
4. Does `rounded-2xl`, arbitrary values (`text-[0.8rem]`, `h-16`) and `inlineRem: 16` give the same pixel sizes as v1 (0.8rem = 12.8px)?
5. Do shadow classes produce a visible shadow on Android (RN 0.81 `boxShadow`)? If not, `lib/shadow.ts` (Task 3) applies `style.boxShadow` directly.
6. Does Jest render a component using `className` without crashing?

- [ ] **Step 1: Install**

```bash
cd ~/projects/JPC/space-v2/apps/mobile
npx expo install nativewind@4.2.7 react-native-reanimated
pnpm add -D tailwindcss@3.4.19
pnpm add class-variance-authority@0.7.1 clsx@2.1.1 tailwind-merge@^3.6.0
```

If `expo install` reports Reanimated 4 needs `react-native-worklets`, run `npx expo install react-native-worklets`.

- [ ] **Step 2: Configure**

`apps/mobile/babel.config.js`:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
  };
};
```

`apps/mobile/metro.config.js` — keep the existing workspace settings and wrap the export:

```js
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// inlineRem 16: v1 is a browser app where 1rem = 16px. NativeWind's native
// default is 14, which would shrink every rem-based class (text-[0.8rem], …).
module.exports = withNativeWind(config, { input: "./global.css", inlineRem: 16 });
```

`apps/mobile/nativewind-env.d.ts`:

```ts
/// <reference types="nativewind/types" />
```

Spike `apps/mobile/tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "rgb(var(--primary) / <alpha-value>)",
        sidebar: "rgb(var(--sidebar) / <alpha-value>)",
        background: "rgb(var(--background) / <alpha-value>)",
        "brand-teal-500": "#7DCED1",
      },
      borderRadius: { "2xl": "18px" },
    },
  },
};
```

Spike `apps/mobile/global.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --primary: 0 56 132;
  --sidebar: 31 50 96;
  --background: 249 252 255;
}
.dark:root {
  --primary: 22 187 188;
  --sidebar: 6 28 49;
  --background: 0 18 38;
}
```

Add `import "../global.css";` as the first line of `apps/mobile/app/_layout.tsx`.

`apps/mobile/jest.config.js` — add `nativewind` and `react-native-css-interop` to the `transformIgnorePatterns` allow-list group (the `(?!(...))` list), i.e. append `|nativewind|react-native-css-interop` before `|react-native-svg`.

- [ ] **Step 3: Spike screen**

`apps/mobile/app/dev/spike.tsx`:

```tsx
import { Pressable, Text, View } from "react-native";
import { colorScheme } from "nativewind";

export default function Spike() {
  return (
    <View className="flex-1 gap-4 bg-background p-4 pt-16">
      <View className="h-16 rounded-full bg-sidebar/75" />
      <View className="h-16 rounded-2xl bg-primary/92 shadow-lg" />
      <Text className="text-[0.8rem] text-primary dark:text-brand-teal-500">0.8rem text</Text>
      <Pressable testID="toggle" onPress={() => colorScheme.toggle()} className="h-10 rounded-lg bg-brand-teal-500" />
    </View>
  );
}
```

- [ ] **Step 4: Jest smoke test**

`apps/mobile/src/__tests__/nativewind-smoke.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import { Text, View } from "react-native";

it("renders className-styled components under jest", () => {
  render(
    <View className="rounded-2xl bg-primary/92 p-4">
      <Text className="text-[0.8rem]">hello</Text>
    </View>,
  );
  expect(screen.getByText("hello")).toBeTruthy();
});
```

Run: `pnpm --filter @space/mobile exec jest src/__tests__/nativewind-smoke.test.tsx`
Expected: PASS. If it fails to transform, fix `transformIgnorePatterns` (Step 2) until it passes.

- [ ] **Step 5: Run on the emulator and measure**

Rebuild (native deps changed): re-run Task 1 Step 5's command. Open the spike: `~/Android/Sdk/platform-tools/adb -s emulator-5558 shell am start -a android.intent.action.VIEW -d "spacev2://dev/spike"`. Capture light, tap `toggle` (Maestro `tapOn: {id: toggle}` or `adb shell input tap`), capture dark. View both with the Read tool and answer questions 1–5. For question 4, measure the text height in the capture: 0.8rem at 16px root on a 3× device ≈ 38px glyph box.

- [ ] **Step 6: Report to the owner (GATE)**

Write the six answers with the two screenshots' paths in the chat. Decision rule for question 5: if shadows are invisible, Task 3 implements `lib/shadow.ts` and components apply it via `style`. If question 1, 2 or 3 is "no", stop: report the failure and propose NativeWind `5.0.0-rc` as the alternative, with its risk (release candidate). Wait for the owner before Task 3.

- [ ] **Step 7: Commit (spike screen removed)**

```bash
rm apps/mobile/app/dev/spike.tsx
git add apps/mobile/package.json ../../pnpm-lock.yaml apps/mobile/babel.config.js apps/mobile/metro.config.js apps/mobile/jest.config.js apps/mobile/tailwind.config.js apps/mobile/global.css apps/mobile/nativewind-env.d.ts apps/mobile/app/_layout.tsx apps/mobile/src/__tests__/nativewind-smoke.test.tsx
git commit -m "chore(mobile): add NativeWind 4.2 (spike verified on SDK 54)"
```

(Run `git add` from the repo root with repo-relative paths.)

---

### Task 3: Generate the theme from v1's tokens

**Files:**
- Create: `apps/mobile/scripts/generate-design-tokens.mjs`, `apps/mobile/src/design/theme/tailwind-theme.js` (generated), `apps/mobile/src/design/lib/shadow.ts`, `apps/mobile/src/__tests__/design-tokens.test.ts`
- Modify: `apps/mobile/tailwind.config.js`, `apps/mobile/global.css` (generated), `apps/mobile/package.json` (script `design:tokens`)

**Interfaces:**
- Consumes: `docs/superpowers/ui-rebuild/v1-tokens.json` (Plan 00 shape `V1Tokens`).
- Produces: `tailwind-theme.js` exporting `{ colors, borderRadius, boxShadow, fontFamily, fontWeightPlugin }`; `SHADOWS: Record<"soft"|"pop"|"lift"|"xs"|"sm"|"md"|"lg", string>` and `shadowStyle(name): { boxShadow: string }` from `lib/shadow.ts`.

**Mapping rules** (v1 Tailwind v4 → this Tailwind 3 config):
- Every semantic token (`primary`, `card`, `sidebar`, …) → CSS variable as an RGB triplet in `global.css` (`:root` light, `.dark:root` dark) and `"rgb(var(--x) / <alpha-value>)"` in the theme. Tokens whose resolved value has alpha (e.g. dark `border: rgba(255,255,255,0.08)`) get `--x: 255 255 255` plus a separate `--x-alpha: 0.08`, and the colour becomes `"rgb(var(--x) / var(--x-alpha))"` — an opacity modifier on those is not used anywhere in v1 (verify with `grep -rn "border-border/\|bg-input/" ~/projects/JPC/.v1-reference/app/src`; if it is, keep the modifier by emitting the colour as a function: `({ opacityValue }) => opacityValue ? \`rgb(var(--x) / calc(var(--x-alpha) * ${opacityValue}))\` : …`).
- Ramps (`brand-navy-50…950`, `brand-teal`, `neutral`, `success`, `warning`, `error`, `info`, `purple`) and `role-*` → literal hex (identical in both themes).
- Radius: `rounded-sm/md/lg/xl/2xl/3xl/4xl` from `tokens.radius`; also v4 defaults `xs: 2px`, `DEFAULT: 4px`, `full: 9999px`.
- Shadows: v1's `shadow-[var(--shadow-soft)]` etc. become classes `shadow-soft`, `shadow-pop`, `shadow-lift`; v4 named shadows `xs, sm, md, lg, xl` use Tailwind v4's values.
- Font weights: core `fontWeight` plugin disabled; a plugin defines `font-normal|medium|semibold|bold` as both `fontFamily` (Geist face) and `fontWeight`, so Android picks the right face.
- `ring-N ring-<colour>` has no React Native equivalent: ported components write `border-N border-<colour>` instead (porting rule, Task 6).

- [ ] **Step 1: Write the failing test**

`apps/mobile/src/__tests__/design-tokens.test.ts`:

```ts
import tokens from "../../../../docs/superpowers/ui-rebuild/v1-tokens.json";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const theme = require("../design/theme/tailwind-theme.js");
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.join(__dirname, "../../global.css"), "utf8");

describe("generated design tokens", () => {
  it("semantic colours are CSS variables with an alpha slot", () => {
    expect(theme.colors.primary).toBe("rgb(var(--primary) / <alpha-value>)");
    expect(theme.colors.sidebar).toBe("rgb(var(--sidebar) / <alpha-value>)");
  });

  it("light and dark values come from v1-tokens.json", () => {
    const hexToTriplet = (hex: string) =>
      [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");
    expect(css).toContain(`--card: ${hexToTriplet(tokens.light.card)};`);
    const darkBlock = css.slice(css.indexOf(".dark:root"));
    expect(darkBlock).toContain(`--background: ${hexToTriplet(tokens.dark.background)};`);
  });

  it("ramps are literal hex identical to v1", () => {
    expect(theme.colors["brand-navy"]["900"]).toBe("#1F3260");
    expect(theme.colors["brand-teal"]["500"]).toBe("#7DCED1");
    expect(theme.colors.role.leader).toBe(tokens.light["role-leader"]);
  });

  it("radius scale is v1's, in px", () => {
    expect(theme.borderRadius.lg).toBe(`${tokens.radius.lg}px`);
    expect(theme.borderRadius["2xl"]).toBe(`${tokens.radius["2xl"]}px`);
    expect(theme.borderRadius.DEFAULT).toBe("4px");
  });

  it("v1 shadow tokens exist as named shadows", () => {
    expect(theme.boxShadow.soft).toBe(tokens.shadows.soft);
    expect(theme.boxShadow.lift).toBe(tokens.shadows.lift);
  });

  it("font weights map to Geist faces", () => {
    expect(theme.fontWeightUtilities[".font-semibold"]).toEqual({
      fontFamily: "Geist_600SemiBold",
      fontWeight: "600",
    });
    expect(theme.fontWeightUtilities[".font-normal"].fontFamily).toBe("Geist_400Regular");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @space/mobile exec jest src/__tests__/design-tokens.test.ts`
Expected: FAIL — cannot find `../design/theme/tailwind-theme.js`.

- [ ] **Step 3: Write the generator**

`apps/mobile/scripts/generate-design-tokens.mjs`:

```js
// Generates global.css and src/design/theme/tailwind-theme.js from v1's
// resolved tokens (docs/superpowers/ui-rebuild/v1-tokens.json, Plan 00).
// Re-run after re-exporting tokens: `pnpm --filter @space/mobile design:tokens`.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const mobile = path.resolve(here, "..");
const tokens = JSON.parse(readFileSync(path.resolve(mobile, "../../docs/superpowers/ui-rebuild/v1-tokens.json"), "utf8"));

const SEMANTIC = [
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
  "primary", "primary-foreground", "secondary", "secondary-foreground", "muted",
  "muted-foreground", "accent", "accent-foreground", "destructive", "border", "input", "ring",
  "sidebar", "sidebar-foreground", "sidebar-primary", "sidebar-primary-foreground",
  "sidebar-accent", "sidebar-accent-foreground", "sidebar-border", "sidebar-ring",
];
const RAMPS = ["brand-navy", "brand-teal", "neutral", "success", "warning", "error", "info", "purple"];
const STEPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];
const ROLES = ["super", "admin", "leader", "student", "mentor"];

function parse(value) {
  if (value.startsWith("#")) {
    return { rgb: [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)), alpha: 1 };
  }
  const m = value.match(/rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/);
  if (!m) throw new Error(`Unrecognised colour ${value}`);
  return { rgb: m.slice(1, 4).map(Number), alpha: Number(m[4]) };
}

function varsBlock(selector, theme) {
  const lines = SEMANTIC.map((name) => {
    const { rgb, alpha } = parse(tokens[theme][name]);
    const base = `  --${name}: ${rgb.join(" ")};`;
    return alpha < 1 ? `${base}\n  --${name}-alpha: ${alpha};` : `${base}\n  --${name}-alpha: 1;`;
  });
  return `${selector} {\n${lines.join("\n")}\n}`;
}

const css = [
  "/* GENERATED by scripts/generate-design-tokens.mjs from v1-tokens.json. Do not edit. */",
  "@tailwind base;",
  "@tailwind components;",
  "@tailwind utilities;",
  "",
  varsBlock(":root", "light"),
  "",
  varsBlock(".dark:root", "dark"),
  "",
].join("\n");

const colors = {};
for (const name of SEMANTIC) {
  const translucentSomewhere = parse(tokens.light[name]).alpha < 1 || parse(tokens.dark[name]).alpha < 1;
  colors[name] = translucentSomewhere
    ? `rgb(var(--${name}) / var(--${name}-alpha))`
    : `rgb(var(--${name}) / <alpha-value>)`;
}
for (const ramp of RAMPS) {
  colors[ramp] = Object.fromEntries(STEPS.map((s) => [s, tokens.light[`${ramp}-${s}`]]));
}
colors.role = {};
for (const r of ROLES) {
  colors.role[r] = tokens.light[`role-${r}`];
  colors.role[`${r}-foreground`] = tokens.light[`role-${r}-foreground`];
}
colors.white = "#FFFFFF";
colors.black = "#000000";
colors.transparent = "transparent";

const borderRadius = {
  none: "0px", xs: "2px", DEFAULT: "4px", full: "9999px",
  ...Object.fromEntries(Object.entries(tokens.radius).map(([k, v]) => [k, `${v}px`])),
};

// Tailwind v4's named shadows (v1 writes v4 names) plus v1's own tokens.
const boxShadow = {
  xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  sm: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
  md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
  xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
  none: "none",
  soft: tokens.shadows.soft,
  pop: tokens.shadows.pop,
  lift: tokens.shadows.lift,
};

const FACES = { normal: ["400", "Geist_400Regular"], medium: ["500", "Geist_500Medium"],
  semibold: ["600", "Geist_600SemiBold"], bold: ["700", "Geist_700Bold"] };
const fontWeightUtilities = Object.fromEntries(
  Object.entries(FACES).map(([k, [weight, family]]) => [`.font-${k}`, { fontFamily: family, fontWeight: weight }]),
);

const js = `// GENERATED by scripts/generate-design-tokens.mjs from v1-tokens.json. Do not edit.
const plugin = require("tailwindcss/plugin");

const colors = ${JSON.stringify(colors, null, 2)};
const borderRadius = ${JSON.stringify(borderRadius, null, 2)};
const boxShadow = ${JSON.stringify(boxShadow, null, 2)};
const fontFamily = { sans: ["Geist_400Regular"], mono: ["GeistMono_400Regular"] };
const fontWeightUtilities = ${JSON.stringify(fontWeightUtilities, null, 2)};
const fontWeightPlugin = plugin(({ addUtilities }) => addUtilities(fontWeightUtilities));

module.exports = { colors, borderRadius, boxShadow, fontFamily, fontWeightUtilities, fontWeightPlugin };
`;

writeFileSync(path.join(mobile, "global.css"), css);
mkdirSync(path.join(mobile, "src/design/theme"), { recursive: true });
writeFileSync(path.join(mobile, "src/design/theme/tailwind-theme.js"), js);
console.log("design tokens generated");
```

Add to `apps/mobile/package.json` scripts: `"design:tokens": "node scripts/generate-design-tokens.mjs"`.

`apps/mobile/tailwind.config.js` (replaces the spike config):

```js
const theme = require("./src/design/theme/tailwind-theme.js");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  corePlugins: { fontWeight: false },
  theme: {
    colors: theme.colors,
    borderRadius: theme.borderRadius,
    boxShadow: theme.boxShadow,
    fontFamily: theme.fontFamily,
  },
  plugins: [theme.fontWeightPlugin],
};
```

`apps/mobile/src/design/lib/shadow.ts`:

```ts
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { boxShadow } = require("../theme/tailwind-theme.js") as { boxShadow: Record<string, string> };

export type ShadowName = "xs" | "sm" | "md" | "lg" | "xl" | "soft" | "pop" | "lift";

export const SHADOWS = boxShadow as Record<ShadowName, string>;

/**
 * Fallback for when NativeWind's shadow classes do not render (Task 2,
 * question 5). React Native 0.81 accepts CSS box-shadow strings natively.
 */
export function shadowStyle(name: ShadowName): { boxShadow: string } {
  return { boxShadow: SHADOWS[name] };
}
```

- [ ] **Step 4: Generate and run the tests**

Run: `pnpm --filter @space/mobile design:tokens && pnpm --filter @space/mobile exec jest src/__tests__/design-tokens.test.ts`
Expected: `design tokens generated`, then PASS (6 tests). If the JSON import fails, add `"resolveJsonModule": true` to `apps/mobile/tsconfig.json` `compilerOptions`.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/scripts/generate-design-tokens.mjs apps/mobile/src/design/theme/tailwind-theme.js apps/mobile/src/design/lib/shadow.ts apps/mobile/tailwind.config.js apps/mobile/global.css apps/mobile/package.json apps/mobile/src/__tests__/design-tokens.test.ts
git commit -m "feat(mobile): NativeWind theme generated from v1 tokens"
```

---

### Task 4: Fonts, theme mode, `cn`, base text

**Files:**
- Create: `apps/mobile/src/design/theme/fonts.ts`, `apps/mobile/src/design/theme/theme-mode.ts`, `apps/mobile/src/design/lib/cn.ts`, `apps/mobile/src/__tests__/theme-mode.test.tsx`, `apps/mobile/src/__tests__/cn.test.ts`
- Modify: `apps/mobile/app/_layout.tsx` (load fonts before the Gate renders; apply saved theme), `apps/mobile/package.json`

**Interfaces:**
- Produces: `GEIST_FONTS` (object for `useFonts`); `cn(...inputs: ClassValue[]): string`; `useThemeMode(): { mode: ThemeMode; resolved: "light" | "dark"; setMode(m: ThemeMode): Promise<void> }` with `type ThemeMode = "light" | "dark" | "system"`; `THEME_STORAGE_KEY = "theme"`; `applyStoredThemeMode(): Promise<void>`.

- [ ] **Step 1: Install**

```bash
cd ~/projects/JPC/space-v2/apps/mobile
npx expo install expo-font @expo-google-fonts/geist @expo-google-fonts/geist-mono
```

- [ ] **Step 2: Write failing tests**

`apps/mobile/src/__tests__/cn.test.ts`:

```ts
import { cn } from "../design/lib/cn";

describe("cn", () => {
  it("merges conflicting tailwind classes, last wins (v1 lib/utils semantics)", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });
  it("drops falsy values", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });
  it("treats the custom font weights as one group", () => {
    expect(cn("font-medium", "font-semibold")).toBe("font-semibold");
  });
});
```

`apps/mobile/src/__tests__/theme-mode.test.tsx`:

```tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";

const mockSet = jest.fn();
let mockSystem: "light" | "dark" = "dark";
jest.mock("nativewind", () => ({
  colorScheme: { set: (v: string) => mockSet(v) },
  useColorScheme: () => ({ colorScheme: mockSystem }),
}));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

import { THEME_STORAGE_KEY, applyStoredThemeMode, useThemeMode } from "../design/theme/theme-mode";

beforeEach(async () => {
  mockSet.mockClear();
  await AsyncStorage.clear();
});

it("defaults to system when nothing is stored", async () => {
  const { result } = renderHook(() => useThemeMode());
  await waitFor(() => expect(result.current.mode).toBe("system"));
  expect(result.current.resolved).toBe("dark");
});

it("applies system on first launch with no preference", async () => {
  await applyStoredThemeMode();
  expect(mockSet).toHaveBeenCalledWith("system");
});

it("persists and applies an explicit choice", async () => {
  const { result } = renderHook(() => useThemeMode());
  await act(() => result.current.setMode("light"));
  expect(await AsyncStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  expect(mockSet).toHaveBeenLastCalledWith("light");
});

it("ignores a corrupt stored value", async () => {
  await AsyncStorage.setItem(THEME_STORAGE_KEY, "purple");
  await applyStoredThemeMode();
  expect(mockSet).toHaveBeenCalledWith("system");
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @space/mobile exec jest src/__tests__/cn.test.ts src/__tests__/theme-mode.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement**

`apps/mobile/src/design/lib/cn.ts`:

```ts
import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// font-normal/medium/semibold/bold are custom utilities here (they set the
// Geist face too); tell tailwind-merge they are still one font-weight group.
const twMerge = extendTailwindMerge({
  override: { classGroups: { "font-weight": [{ font: ["normal", "medium", "semibold", "bold"] }] } },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

`apps/mobile/src/design/theme/fonts.ts`:

```ts
import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
} from "@expo-google-fonts/geist";
import { GeistMono_400Regular } from "@expo-google-fonts/geist-mono";

/** Face names must match the fontFamily values in the generated tailwind theme. */
export const GEIST_FONTS = {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
  GeistMono_400Regular,
};
```

`apps/mobile/src/design/theme/theme-mode.ts`:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colorScheme, useColorScheme } from "nativewind";
import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

/** Same key and values as v1's theme-provider.tsx. */
export const THEME_STORAGE_KEY = "theme";

function isMode(v: unknown): v is ThemeMode {
  return v === "light" || v === "dark" || v === "system";
}

async function readMode(): Promise<ThemeMode> {
  try {
    const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    return isMode(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

/** Called once at boot, before first paint of the app. */
export async function applyStoredThemeMode(): Promise<void> {
  colorScheme.set(await readMode());
}

export function useThemeMode() {
  const { colorScheme: resolved } = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    void readMode().then(setModeState);
  }, []);

  const setMode = useCallback(async (next: ThemeMode) => {
    setModeState(next);
    colorScheme.set(next);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, next);
  }, []);

  return { mode, resolved: resolved === "dark" ? "dark" : "light", setMode } as const;
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @space/mobile exec jest src/__tests__/cn.test.ts src/__tests__/theme-mode.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 6: Boot wiring**

In `apps/mobile/app/_layout.tsx`, keep the existing BOOT GATE comment and structure; add font loading and theme application so nothing renders before both are ready:

```tsx
import "../global.css";
import { useFonts } from "expo-font";
import { useEffect, useState } from "react";
// …existing imports…
import { GEIST_FONTS } from "../src/design/theme/fonts";
import { applyStoredThemeMode } from "../src/design/theme/theme-mode";

export default function RootLayout() {
  const [fontsLoaded] = useFonts(GEIST_FONTS);
  const [themeApplied, setThemeApplied] = useState(false);
  useEffect(() => {
    void applyStoredThemeMode().finally(() => setThemeApplied(true));
  }, []);
  if (!fontsLoaded || !themeApplied) return null; // splash screen stays up meanwhile

  return (
    // …existing ThemeProvider / QueryClientProvider / SafeAreaProvider / Gate tree, unchanged…
  );
}
```

Run: `pnpm --filter @space/mobile exec jest src/__tests__/boot-gate.test.tsx` — if it fails because `useFonts` is unmocked, add to the test file `jest.mock("expo-font", () => ({ useFonts: () => [true] }));` and `jest.mock("../design/theme/theme-mode", () => ({ applyStoredThemeMode: () => Promise.resolve() }));` (paths relative to the test). Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/design/lib/cn.ts apps/mobile/src/design/theme/fonts.ts apps/mobile/src/design/theme/theme-mode.ts apps/mobile/app/_layout.tsx apps/mobile/package.json pnpm-lock.yaml apps/mobile/src/__tests__/cn.test.ts apps/mobile/src/__tests__/theme-mode.test.tsx apps/mobile/src/__tests__/boot-gate.test.tsx
git commit -m "feat(mobile): Geist fonts, v1 theme mode and cn()"
```

---

### Task 5: Icons and the v1 shell

**Files:**
- Create: `apps/mobile/src/design/icons/nav-icon.tsx`, `apps/mobile/src/design/layout/{nav-link,floating-tab-bar,shell-frame,top-bar,page-header,more-menu,user-menu,notification-bell}.tsx`, `apps/mobile/src/__tests__/floating-tab-bar.test.tsx`, `apps/mobile/src/__tests__/page-header.test.tsx`
- Modify: `apps/mobile/package.json`

**Interfaces:**
- Consumes: `NavItem`, `NavIconName` from `@space/shared`; `cn`; `useSessionStore` (`s.nav()`, `s.user`).
- Produces:
  - `NavIcon({ name: NavIconName; size?: number; className?: string })`
  - `FloatingTabBar(props: BottomTabBarProps & { items: NavItem[] })` — pass as `Tabs` `tabBar` prop.
  - `ShellFrame({ children, scroll?: boolean })` — v1 `<main>` padding (`px-4 pb-24 pt-4`).
  - `TopBar()`, `PageHeader({ title: string; description?: string; actions?: ReactNode })`, `MoreMenu()`, `UserMenu()`, `NotificationBell()`.

**Porting source:** `~/projects/JPC/.v1-reference/app/src/components/layout/*.tsx` and the screenshots `shots/<role>/{light,dark}/*` (bottom of every page shows the tab bar; open a `__dialog-*` shot for the user menu / More menu).

- [ ] **Step 1: Install**

```bash
cd ~/projects/JPC/space-v2/apps/mobile
pnpm add lucide-react-native
npx expo install expo-blur
```

- [ ] **Step 2: Nav icons (exact v1 map)**

`apps/mobile/src/design/icons/nav-icon.tsx`:

```tsx
import type { NavIconName } from "@space/shared";
import {
  Bell,
  Calendar,
  CalendarDays,
  CheckCheck,
  ClipboardList,
  FileText,
  Folders,
  GraduationCap,
  History,
  Home,
  LayoutDashboard,
  MoreHorizontal,
  Notebook,
  PenLine,
  Settings,
  Sparkles,
  User,
  UserCheck,
  UserMinus,
  Users,
  type LucideIcon,
} from "lucide-react-native";

/**
 * v1 src/components/layout/nav-link.tsx iconMap, verbatim. `attendance` and
 * `notifications` are v2 NavIconNames with no v1 entry: before using
 * CheckCheck/Bell, open v1's navigation.ts and nav-link.tsx in the reference
 * copy — if v1 renders those destinations with another icon, use that one.
 */
const ICONS: Record<NavIconName, LucideIcon> = {
  home: Home,
  dashboard: LayoutDashboard,
  users: Users,
  calendar: Calendar,
  events: CalendarDays,
  assignments: ClipboardList,
  attendance: CheckCheck,
  submissions: FileText,
  history: History,
  profile: User,
  reports: FileText,
  groups: Folders,
  season: Sparkles,
  students: GraduationCap,
  alumni: UserCheck,
  dropped: UserMinus,
  notes: Notebook,
  notifications: Bell,
  quizzes: PenLine,
  more: MoreHorizontal,
  settings: Settings,
};

export function NavIcon({ name, size = 20, className }: { name: NavIconName; size?: number; className?: string }) {
  const Icon = ICONS[name];
  return <Icon size={size} className={className} strokeWidth={2} />;
}
```

`lucide-react-native` icons accept `className` only with NativeWind's `cssInterop`; add once at the top of `nav-icon.tsx` after imports:

```tsx
import { cssInterop } from "nativewind";
for (const Icon of Object.values(ICONS)) {
  cssInterop(Icon, { className: { target: "style", nativeStyleToProp: { color: true } } });
}
```

- [ ] **Step 3: Failing tests for the tab bar**

`apps/mobile/src/__tests__/floating-tab-bar.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { NavItem } from "@space/shared";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { FloatingTabBar } from "../design/layout/floating-tab-bar";

const items: NavItem[] = [
  { href: "/calendar", label: "Calendar", icon: "calendar" },
  { href: "/assignments", label: "Assignments", icon: "assignments" },
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/history", label: "History", icon: "history" },
  { href: "/profile", label: "Profile", icon: "profile" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

function renderBar(activeRoute = "dashboard", navigate = jest.fn()) {
  const state = {
    index: 0,
    routes: [{ key: activeRoute, name: activeRoute }],
  };
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 0, left: 0, right: 0, bottom: 34 } }}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <FloatingTabBar items={items} state={state as any} navigation={{ navigate } as any} descriptors={{} as any} insets={{ top: 0, left: 0, right: 0, bottom: 34 }} />
    </SafeAreaProvider>,
  );
  return navigate;
}

it("shows at most five tabs, like v1 tabItems.slice(0, 5)", () => {
  renderBar();
  expect(screen.getAllByRole("tab")).toHaveLength(5);
  expect(screen.queryByLabelText("Settings")).toBeNull();
});

it("marks the current route as selected", () => {
  renderBar("history");
  expect(screen.getByLabelText("History").props.accessibilityState).toMatchObject({ selected: true });
  expect(screen.getByLabelText("Home").props.accessibilityState).toMatchObject({ selected: false });
});

it("navigates to the tab's route name on press", () => {
  const navigate = renderBar();
  fireEvent.press(screen.getByLabelText("Calendar"));
  expect(navigate).toHaveBeenCalledWith("calendar");
});

it("labels stay one line however long they are", () => {
  renderBar();
  const label = screen.getByText("Assignments");
  expect(label.props.numberOfLines).toBe(1);
});
```

`apps/mobile/src/__tests__/page-header.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { PageHeader } from "../design/layout/page-header";

it("renders title, description and actions", () => {
  render(<PageHeader title="Calendar" description="All sessions" actions={<Text>New</Text>} />);
  expect(screen.getByRole("header")).toHaveTextContent("Calendar");
  expect(screen.getByText("All sessions")).toBeTruthy();
  expect(screen.getByText("New")).toBeTruthy();
});

it("omits the description when not given", () => {
  render(<PageHeader title="Calendar" />);
  expect(screen.queryByText("All sessions")).toBeNull();
});
```

Run: `pnpm --filter @space/mobile exec jest src/__tests__/floating-tab-bar.test.tsx src/__tests__/page-header.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement the tab bar from v1**

`apps/mobile/src/design/layout/nav-link.tsx` — port v1's `NavLink` `variant === "tab"` branch: copy its class strings verbatim (they are already phone-sized), replace `Link` with `Pressable`, `usePathname` with the `active` prop, `motion` indicator with a plain `View` (an animated indicator is optional polish — skip it unless the v1 screenshot shows a visible indicator, in which case use `Animated.View` from reanimated with the same `springSoft` values from v1 `lib/motion.ts`). Signature:

```tsx
export function NavLink(props: { label: string; icon: NavIconName; active: boolean; featured?: boolean; onPress: () => void }): JSX.Element
```

The `Pressable` gets `accessibilityRole="tab"`, `accessibilityLabel={label}`, `accessibilityState={{ selected: active }}`; the label `Text` gets `numberOfLines={1}`.

`apps/mobile/src/design/layout/floating-tab-bar.tsx`:

```tsx
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import type { NavItem } from "@space/shared";
import { BlurView } from "expo-blur";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { routeNameForHref } from "../../../app/(app)/_layout";
import { cn } from "../lib/cn";
import { shadowStyle } from "../lib/shadow";
import { NavLink } from "./nav-link";

/**
 * v1 shell-frame.tsx mobile nav:
 *   fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 mx-auto
 *   flex h-16 max-w-md items-center rounded-full bg-sidebar/75 px-2
 *   text-sidebar-foreground shadow-[var(--shadow-lift)] ring-1 ring-white/10
 *   backdrop-blur-xl backdrop-saturate-150
 * Native differences: ring → border; backdrop-blur-xl → BlurView intensity 40
 * under the translucent fill; backdrop-saturate has no native equivalent.
 */
export function FloatingTabBar({ items, state, navigation }: BottomTabBarProps & { items: NavItem[] }) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;
  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-4 items-center"
      style={{ bottom: Math.max(16, insets.bottom) }}
    >
      <View
        className={cn("h-16 w-full max-w-md flex-row items-center overflow-hidden rounded-full border border-white/10 px-2")}
        style={shadowStyle("lift")}
      >
        <BlurView intensity={40} tint="dark" className="absolute inset-0" />
        <View className="absolute inset-0 bg-sidebar/75" />
        {items.slice(0, 5).map((item) => {
          const name = routeNameForHref(item.href);
          return (
            <NavLink
              key={item.href}
              label={item.label}
              icon={item.icon}
              featured={item.icon === "home"}
              active={current === name}
              onPress={() => navigation.navigate(name as never)}
            />
          );
        })}
      </View>
    </View>
  );
}
```

If importing from `app/(app)/_layout` creates a require cycle (the layout will import this file in Task 10), move `routeNameForHref` and `DIRECTORY_ROUTE_HREFS` into `apps/mobile/src/lib/route-names.ts`, re-export them from the layout (existing tests import them from there), and import from `../../lib/route-names` here.

- [ ] **Step 5: Port the remaining shell files**

For each file, read the v1 source and the matching screenshot, copy the JSX structure and class strings (dropping `md:`/`lg:`), and apply the porting rules from Task 6 Step 1. Each keeps v1's copy verbatim.

| v2 file | v1 source | Notes |
|---|---|---|
| `shell-frame.tsx` | `shell-frame.tsx` `<main>` | `ScrollView` (when `scroll`) with `contentContainerClassName="px-4 pb-24 pt-4"`, `className="flex-1 bg-background"`; top inset from `useSafeAreaInsets`. `pb-24` keeps content clear of the floating bar. |
| `top-bar.tsx` | `top-bar.tsx` | Mobile branch only. Logo, title area, `NotificationBell`, `UserMenu`. |
| `page-header.tsx` | `page-header.tsx` | Title `Text` has `accessibilityRole="header"`. |
| `more-menu.tsx` | `more-menu.tsx` | Opens the `Modal` sheet (Task 8); items from `nav.sidebar` not in `nav.tabs`, same grouping and order as v1. Until Task 8 lands, build it with RN `Modal` directly and switch to `design/ui/modal` in Task 8 Step 4. |
| `user-menu.tsx` | `user-menu.tsx` | Avatar trigger + sheet; includes v1's theme toggle entry and sign-out (calls the existing `useSessionStore` logout). |
| `notification-bell.tsx` | `notification-bell.tsx` | Bell icon + unread count badge from the existing notifications hook in `src/hooks/`; press navigates to `/notifications`. |

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @space/mobile exec jest src/__tests__/floating-tab-bar.test.tsx src/__tests__/page-header.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/design/icons apps/mobile/src/design/layout apps/mobile/src/__tests__/floating-tab-bar.test.tsx apps/mobile/src/__tests__/page-header.test.tsx apps/mobile/package.json pnpm-lock.yaml
git commit -m "feat(mobile): v1 shell — floating tab bar, top bar, page header, menus"
```

---

### Task 6: Display components

**Files:**
- Create in `apps/mobile/src/design/ui/`: `button.tsx`, `card.tsx`, `badge.tsx`, `separator.tsx`, `label.tsx`, `avatar.tsx`, `logo.tsx`, `skeleton.tsx`, `progress.tsx`, `progress-ring.tsx`, `attendance-pill.tsx`, `submission-status-badge.tsx`, `empty-state.tsx`, `index.ts`
- Test: `apps/mobile/src/__tests__/design-display.test.tsx`

**Interfaces:**
- Produces (exported from `design/ui/index.ts`, names identical to v1's exports): `Button`, `buttonVariants`, `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `Badge`, `badgeVariants`, `Separator`, `Label`, `Avatar` (+ v1's sub-exports), `Logo`, `Skeleton`, `Progress`, `ProgressRing`, `AttendancePill`, `SubmissionStatusBadge`, `EmptyState`. Props mirror v1's minus DOM-only props; `onClick` → `onPress`; every component takes `className`.

- [ ] **Step 1: Porting rules (apply to every component in Tasks 5–9)**

| v1 (web) | v2 (React Native) |
|---|---|
| `div`, `span` (block) | `View` |
| text inside any element | `Text` with the text classes moved onto it (RN does not inherit text styles from `View`) |
| `button` / Base UI `Button` | `Pressable` with `accessibilityRole="button"` |
| `a` / `Link` | `Pressable` + `router.push(href)` with a typed `Href` |
| `img` / `next/image` | `Image` from `react-native` |
| `cva(...)` | same `cva(...)`, same variant names and class strings |
| `cn(...)` from `@/lib/utils` | `cn` from `../lib/cn` |
| `md:` `lg:` `xl:` classes | delete |
| `hover:` `focus-visible:` `aria-*:` `group-hover:` `has-*:` `in-data-*:` `[&_svg]:` | delete; if `hover:` changes colour, apply the same class under `active:` (pressed) only when v1's `active:` is absent |
| `active:scale-[0.98] active:translate-y-px` | keep (`active:` works on `Pressable` in NativeWind) |
| `ring-N ring-X` | `border-N border-X` |
| `shadow-[var(--shadow-soft)]` | `shadow-soft` (or `style={shadowStyle("soft")}` if Task 2 Q5 = no) |
| `transition-*`, `duration-*`, `ease-*` | delete (no CSS transitions on native) |
| `whitespace-nowrap` / `truncate` | keep the class and set `numberOfLines={1}` on the `Text` |
| `size-N` | keep (`size-*` exists in Tailwind 3.4) |
| SVG icons from `lucide-react` | same names from `lucide-react-native`; `[&_svg]:size-4` → `size={16}` prop |
| `data-slot="..."` | `testID` only where a test needs it |

"Native differences" for each component are listed as a comment block at the top of its file, in the same format as `floating-tab-bar.tsx`.

- [ ] **Step 2: Write the failing tests**

`apps/mobile/src/__tests__/design-display.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";

import {
  AttendancePill,
  Badge,
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Progress,
  SubmissionStatusBadge,
} from "../design/ui";

describe("Button", () => {
  it("keeps v1's variant classes", () => {
    expect(buttonVariants({ variant: "default" })).toContain("bg-primary");
    expect(buttonVariants({ variant: "outline" })).toContain("border-border");
    expect(buttonVariants({ variant: "destructive" })).toContain("bg-destructive/10");
    expect(buttonVariants({ size: "default" })).toContain("h-8");
    expect(buttonVariants({ size: "lg" })).toContain("h-9");
    expect(buttonVariants({ size: "icon" })).toContain("size-8");
  });

  it("drops web-only classes", () => {
    const all = buttonVariants({ variant: "default", size: "default" });
    expect(all).not.toMatch(/hover:|focus-visible:|aria-|md:|transition/);
  });

  it("presses and reports disabled", () => {
    const onPress = jest.fn();
    render(<Button onPress={onPress}>Save</Button>);
    fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(onPress).toHaveBeenCalledTimes(1);

    render(<Button disabled onPress={onPress}>Locked</Button>);
    expect(screen.getByRole("button", { name: "Locked" }).props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("keeps a long label on one line", () => {
    render(<Button>A very long button label that would wrap on a phone</Button>);
    expect(screen.getByText(/very long button/).props.numberOfLines).toBe(1);
  });
});

describe("Card", () => {
  it("renders header, title and content", () => {
    render(
      <Card>
        <CardHeader><CardTitle>Week 3</CardTitle></CardHeader>
        <CardContent />
      </Card>,
    );
    expect(screen.getByText("Week 3")).toBeTruthy();
  });
});

describe("status components", () => {
  it("Badge renders its text on one line", () => {
    render(<Badge>Leader</Badge>);
    expect(screen.getByText("Leader").props.numberOfLines).toBe(1);
  });

  it("SubmissionStatusBadge shows v1's label for each status", () => {
    // Labels must equal v1 submission-status-badge.tsx's map — read it and
    // list every status here.
    render(<SubmissionStatusBadge status="SUBMITTED" />);
    expect(screen.getByText(/submitted/i)).toBeTruthy();
  });

  it("AttendancePill renders a percentage", () => {
    render(<AttendancePill value={72} />);
    expect(screen.getByText(/72/)).toBeTruthy();
  });

  it("Progress exposes its value to accessibility", () => {
    render(<Progress value={40} />);
    expect(screen.getByRole("progressbar").props.accessibilityValue).toMatchObject({ now: 40, min: 0, max: 100 });
  });

  it("EmptyState shows title and description", () => {
    render(<EmptyState title="No sessions" description="Nothing scheduled" />);
    expect(screen.getByText("No sessions")).toBeTruthy();
    expect(screen.getByText("Nothing scheduled")).toBeTruthy();
  });
});
```

Before running, open each v1 component and adjust prop names in this test to v1's actual props (e.g. if v1's `AttendancePill` takes `percent` not `value`, use `percent` in both test and port). The test must match v1's API, not the other way round.

Run: `pnpm --filter @space/mobile exec jest src/__tests__/design-display.test.tsx`
Expected: FAIL — `../design/ui` not found.

- [ ] **Step 3: Worked example — Button**

`apps/mobile/src/design/ui/button.tsx`:

```tsx
/**
 * Port of v1 src/components/ui/button.tsx.
 * Native differences: hover/focus/aria/has-/in-data-/[&_svg] classes removed;
 * transitions removed; icons take size props (xs/sm/icon-xs: 12, sm/icon-sm: 14,
 * others: 16) instead of [&_svg]:size-*; rounded-[min(var(--radius-md),10px)]
 * → rounded-md (radius-md is 8px, already below both caps).
 */
import { cva, type VariantProps } from "class-variance-authority";
import { Children, type ReactNode, isValidElement } from "react";
import { Pressable, Text, type PressableProps } from "react-native";

import { cn } from "../lib/cn";
import { shadowStyle } from "../lib/shadow";

const buttonVariants = cva(
  "relative shrink-0 flex-row items-center justify-center rounded-lg border border-transparent active:translate-y-px active:scale-[0.98] disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary",
        outline: "border-border bg-background active:bg-muted dark:border-input dark:bg-input/30",
        secondary: "bg-secondary",
        ghost: "active:bg-muted",
        destructive: "bg-destructive/10 dark:bg-destructive/20",
        link: "",
      },
      size: {
        default: "h-8 gap-1.5 px-2.5",
        xs: "h-6 gap-1 rounded-md px-2",
        sm: "h-7 gap-1 rounded-md px-2.5",
        lg: "h-9 gap-1.5 px-2.5",
        icon: "size-8",
        "icon-xs": "size-6 rounded-md",
        "icon-sm": "size-7 rounded-md",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

const buttonTextVariants = cva("text-sm font-medium", {
  variants: {
    variant: {
      default: "text-primary-foreground",
      outline: "text-foreground",
      secondary: "text-secondary-foreground",
      ghost: "text-foreground",
      destructive: "text-destructive",
      link: "text-primary underline",
    },
    size: {
      default: "", xs: "text-xs", sm: "text-[0.8rem]", lg: "",
      icon: "", "icon-xs": "", "icon-sm": "", "icon-lg": "",
    },
  },
  defaultVariants: { variant: "default", size: "default" },
});

type ButtonProps = Omit<PressableProps, "children"> &
  VariantProps<typeof buttonVariants> & { className?: string; textClassName?: string; children?: ReactNode };

function Button({ className, textClassName, variant = "default", size = "default", children, disabled, ...props }: ButtonProps) {
  const elevated = variant === "default" || variant === "secondary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      className={cn(buttonVariants({ variant, size }), className)}
      style={elevated ? shadowStyle("soft") : undefined}
      {...props}
    >
      {Children.map(children, (child) =>
        typeof child === "string" || typeof child === "number" ? (
          <Text numberOfLines={1} className={cn(buttonTextVariants({ variant, size }), textClassName)}>
            {child}
          </Text>
        ) : isValidElement(child) ? (
          child
        ) : null,
      )}
    </Pressable>
  );
}

export { Button, buttonVariants, buttonTextVariants };
```

- [ ] **Step 4: Worked example — Card**

`apps/mobile/src/design/ui/card.tsx`:

```tsx
/**
 * Port of v1 src/components/ui/card.tsx.
 * Native differences: ring-1 ring-border → border border-border; md: padding
 * dropped (p-4 kept); interactive hover lift → active:opacity-90.
 */
import type { ReactNode } from "react";
import { Pressable, Text, View, type ViewProps } from "react-native";

import { cn } from "../lib/cn";
import { shadowStyle } from "../lib/shadow";

type Box = ViewProps & { className?: string; children?: ReactNode };

function Card({ className, interactive, onPress, ...props }: Box & { interactive?: boolean; onPress?: () => void }) {
  const base = cn("rounded-2xl border border-border bg-card", className);
  if (interactive || onPress) {
    return <Pressable accessibilityRole="button" onPress={onPress} className={cn(base, "active:opacity-90")} style={shadowStyle("soft")} {...props} />;
  }
  return <View className={base} style={shadowStyle("soft")} {...props} />;
}

function CardHeader({ className, ...props }: Box) {
  return <View className={cn("flex-col gap-1.5 p-4", className)} {...props} />;
}

function CardTitle({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <Text accessibilityRole="header" className={cn("text-base font-semibold leading-tight tracking-tight text-card-foreground", className)}>
      {children}
    </Text>
  );
}

function CardDescription({ className, children }: { className?: string; children?: ReactNode }) {
  return <Text className={cn("text-sm text-muted-foreground", className)}>{children}</Text>;
}

function CardContent({ className, ...props }: Box) {
  return <View className={cn("p-4 pt-0", className)} {...props} />;
}

function CardFooter({ className, ...props }: Box) {
  return <View className={cn("flex-row items-center gap-2 border-t border-border p-4", className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
```

- [ ] **Step 5: Port the rest of the display set**

Apply the rules in Step 1, keeping v1's export names, props and variants. Per-component notes:

| v2 file | v1 file | Notes |
|---|---|---|
| `badge.tsx` | `badge.tsx` | `cva` verbatim minus web classes; text `numberOfLines={1}`. Role colours use `bg-role-<role>` / `text-role-<role>-foreground`. |
| `separator.tsx` | `separator.tsx` | `View` `h-px w-full bg-border` (or `w-px h-full` vertical), `accessibilityRole="none"`. |
| `label.tsx` | `label.tsx` | `Text` with v1 classes. |
| `avatar.tsx` | `avatar.tsx` | `Image` with fallback initials; reuse `src/lib/initials.ts` if v1's rule matches (compare both). |
| `logo.tsx` | `logo.tsx` | Render v1's logo asset: copy `public/jpc-logo.jpg` (or the SVG v1 uses) from the reference copy into `apps/mobile/assets/` — check `logo.tsx` for which file and size. |
| `skeleton.tsx` | `skeleton.tsx` | v1 `.jpc-shimmer`: a `View bg-muted` with a reanimated looping opacity 1 → 0.6 → 1 over 1.6s (closest native equivalent of the gradient sweep; note it). |
| `progress.tsx` | `progress.tsx` | `accessibilityRole="progressbar"`, `accessibilityValue={{ min: 0, max: 100, now: value }}`. |
| `progress-ring.tsx` | `progress-ring.tsx` | `react-native-svg` `Circle` with the same radius, stroke width and dash maths as v1's SVG. |
| `attendance-pill.tsx` | `attendance-pill.tsx` | Same thresholds and colours as v1. |
| `submission-status-badge.tsx` | `submission-status-badge.tsx` | Same status → label/colour map, every status. |
| `empty-state.tsx` | `empty-state.tsx` | Same icon, title, description, action slot. |

`apps/mobile/src/design/ui/index.ts` re-exports every component file in this folder (`export * from "./button";` …), updated by each of Tasks 6–9.

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @space/mobile exec jest src/__tests__/design-display.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/design/ui apps/mobile/assets apps/mobile/src/__tests__/design-display.test.tsx
git commit -m "feat(mobile): port v1 display components"
```

---

### Task 7: Form components

**Files:**
- Create in `apps/mobile/src/design/ui/`: `input.tsx`, `password-input.tsx`, `textarea.tsx`, `field.tsx`, `form-field.tsx`, `switch.tsx`, `select.tsx`, `combobox.tsx`, `multi-select.tsx`, `chip-input.tsx`, `date-picker.tsx`, `time-picker.tsx`, `file-upload.tsx`
- Modify: `apps/mobile/src/design/ui/index.ts`
- Test: `apps/mobile/src/__tests__/design-forms.test.tsx`

**Interfaces:**
- Consumes: `cn`, `Button`, `Label`, and (for pickers) `Modal` sheet — if Task 8 is not done yet, the pickers' sheet uses RN `Modal` with the same classes and is switched to `design/ui/modal` in Task 8 Step 4.
- Produces: v1's exports with v1's prop names. Controlled inputs use `value` + `onChangeText` (RN) — `form-field.tsx` keeps v1's react-hook-form integration (v2 already uses react-hook-form + Zod; see `src/ui/Form.tsx` for the existing pattern and `src/__tests__/form.test.tsx`).

- [ ] **Step 1: Write the failing tests**

`apps/mobile/src/__tests__/design-forms.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";

import { DatePicker, Input, MultiSelect, PasswordInput, Select, Switch } from "../design/ui";

it("Input forwards typed text", () => {
  const onChangeText = jest.fn();
  render(<Input accessibilityLabel="Email" onChangeText={onChangeText} />);
  fireEvent.changeText(screen.getByLabelText("Email"), "a@b.c");
  expect(onChangeText).toHaveBeenCalledWith("a@b.c");
});

it("Input marks invalid state for screen readers", () => {
  render(<Input accessibilityLabel="Email" aria-invalid />);
  expect(screen.getByLabelText("Email").props.accessibilityState).toMatchObject({ invalid: true });
});

it("PasswordInput toggles visibility", () => {
  render(<PasswordInput accessibilityLabel="Password" />);
  expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(true);
  fireEvent.press(screen.getByRole("button", { name: /show password/i }));
  expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(false);
});

it("Switch toggles", () => {
  const onCheckedChange = jest.fn();
  render(<Switch accessibilityLabel="Email me" checked={false} onCheckedChange={onCheckedChange} />);
  fireEvent.press(screen.getByRole("switch"));
  expect(onCheckedChange).toHaveBeenCalledWith(true);
});

it("Select opens its options and reports a choice", () => {
  const onValueChange = jest.fn();
  render(
    <Select
      accessibilityLabel="Group"
      value={null}
      onValueChange={onValueChange}
      options={[{ value: "a", label: "Group A" }, { value: "b", label: "Group B" }]}
      placeholder="Choose a group"
    />,
  );
  fireEvent.press(screen.getByText("Choose a group"));
  fireEvent.press(screen.getByText("Group B"));
  expect(onValueChange).toHaveBeenCalledWith("b");
});

it("MultiSelect toggles several options", () => {
  const onValueChange = jest.fn();
  render(
    <MultiSelect
      accessibilityLabel="Tags"
      value={["a"]}
      onValueChange={onValueChange}
      options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]}
    />,
  );
  fireEvent.press(screen.getByLabelText("Tags"));
  fireEvent.press(screen.getByText("B"));
  expect(onValueChange).toHaveBeenCalledWith(["a", "b"]);
});

it("DatePicker shows the formatted value like v1", () => {
  render(<DatePicker accessibilityLabel="Start" value={new Date(2026, 9, 14)} onChange={() => {}} />);
  // Format string must equal v1 date-picker.tsx's display format.
  expect(screen.getByLabelText("Start")).toHaveTextContent(/14/);
});
```

As in Task 6: adjust prop names to v1's actual APIs before implementing (open each v1 file). Run and expect FAIL (exports missing).

- [ ] **Step 2: Port**

Apply Task 6's porting rules. Per-component notes:

| v2 file | v1 file | Notes |
|---|---|---|
| `input.tsx` | `input.tsx` | `TextInput`; v1 classes on the `TextInput`; `placeholderTextColor` = muted-foreground (read from the theme via `useColorScheme` + `tailwind-theme.js` colours, since placeholder colour is a prop not a style); `aria-invalid` → `accessibilityState.invalid` + v1's invalid border class. |
| `password-input.tsx` | `password-input.tsx` | `secureTextEntry` toggle; eye icon button with v1's aria-label text. |
| `textarea.tsx` | `textarea.tsx` | `TextInput multiline textAlignVertical="top"`. |
| `field.tsx`, `form-field.tsx` | same | Label + control + description + error text, same spacing; error `Text` exposed via `accessibilityHint` on the control (keeps the existing testing convention in CLAUDE.md). |
| `switch.tsx` | `switch.tsx` | Custom `Pressable` track + thumb with v1's sizes/colours (RN `Switch` cannot match v1's look); `accessibilityRole="switch"`, `accessibilityState.checked`. |
| `select.tsx` | `select.tsx` | Trigger styled like v1's; options in the sheet; same check icon for the selected option. |
| `combobox.tsx` | `combobox.tsx` | Sheet with a search `Input` at the top filtering options, same empty text as v1. |
| `multi-select.tsx` | `multi-select.tsx` | Sheet with checkable rows; trigger shows chips/count like v1. |
| `chip-input.tsx` | `chip-input.tsx` | `TextInput` + chips; add on submit/comma like v1; remove on chip × press. |
| `date-picker.tsx` | `date-picker.tsx` | Port v1's own month calendar grid (it is custom, built on date-fns) inside the sheet; same header, chevrons, day cells, today/selected styles, same display format. Do not use the native OS picker — it cannot look like v1. |
| `time-picker.tsx` | `time-picker.tsx` | Port v1's hour/minute UI as built; if v1 uses `<input type="time">`, use `@react-native-community/datetimepicker` (already installed) in `mode="time"` behind a trigger styled like v1's input — note it as a native difference. |
| `file-upload.tsx` | `file-upload.tsx` | Visual port only (dropzone look as a pressable area). Uploads stay off (`ENABLE_UPLOADS=false`); `onPress` calls the `onSelect` prop which screens wire later. |

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @space/mobile exec jest src/__tests__/design-forms.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/design/ui apps/mobile/src/__tests__/design-forms.test.tsx
git commit -m "feat(mobile): port v1 form components"
```

---

### Task 8: Overlays and feedback

**Files:**
- Create in `apps/mobile/src/design/ui/`: `modal.tsx`, `confirm-dialog.tsx`, `toaster.tsx`, `tabs.tsx`
- Modify: `apps/mobile/src/design/ui/index.ts`, `apps/mobile/app/_layout.tsx` (mount `Toaster`), any Task 5/7 file that used RN `Modal` as a stand-in
- Test: `apps/mobile/src/__tests__/design-overlays.test.tsx`

**Interfaces:**
- Produces: v1's `Modal`, `ModalTrigger`, `ModalContent`, `ModalHeader`, `ModalTitle`, `ModalDescription`, `ModalFooter` (controlled with `open` / `onOpenChange` like Base UI Dialog); `ConfirmDialog`; `Toaster` + `toast` (same call signature as v1's `sonner` usage: `toast.success(msg)`, `toast.error(msg)`); `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`.

- [ ] **Step 1: Install**

```bash
cd ~/projects/JPC/space-v2/apps/mobile
pnpm add sonner-native
npx expo install react-native-gesture-handler
```

- [ ] **Step 2: Write the failing tests**

`apps/mobile/src/__tests__/design-overlays.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { ConfirmDialog, Modal, ModalContent, ModalTitle, Tabs, TabsContent, TabsList, TabsTrigger } from "../design/ui";

it("Modal renders content only when open and closes on backdrop press", () => {
  const onOpenChange = jest.fn();
  const { rerender } = render(
    <Modal open={false} onOpenChange={onOpenChange}>
      <ModalContent><ModalTitle>Edit group</ModalTitle></ModalContent>
    </Modal>,
  );
  expect(screen.queryByText("Edit group")).toBeNull();
  rerender(
    <Modal open onOpenChange={onOpenChange}>
      <ModalContent><ModalTitle>Edit group</ModalTitle></ModalContent>
    </Modal>,
  );
  expect(screen.getByText("Edit group")).toBeTruthy();
  fireEvent.press(screen.getByTestId("modal-backdrop"));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it("ConfirmDialog calls onConfirm and not on cancel", () => {
  const onConfirm = jest.fn();
  render(<ConfirmDialog open title="Delete note?" confirmLabel="Delete" onConfirm={onConfirm} onOpenChange={() => {}} />);
  fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
  expect(onConfirm).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole("button", { name: "Delete" }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

it("Tabs switch content", () => {
  render(
    <Tabs defaultValue="a">
      <TabsList>
        <TabsTrigger value="a">Upcoming</TabsTrigger>
        <TabsTrigger value="b">Past</TabsTrigger>
      </TabsList>
      <TabsContent value="a"><Text>upcoming list</Text></TabsContent>
      <TabsContent value="b"><Text>past list</Text></TabsContent>
    </Tabs>,
  );
  expect(screen.getByText("upcoming list")).toBeTruthy();
  fireEvent.press(screen.getByRole("tab", { name: "Past" }));
  expect(screen.getByText("past list")).toBeTruthy();
  expect(screen.queryByText("upcoming list")).toBeNull();
});
```

Adjust `ConfirmDialog` prop names to v1's (`confirm-dialog.tsx`) before implementing. Run and expect FAIL.

- [ ] **Step 3: Port**

| v2 file | v1 file | Notes |
|---|---|---|
| `modal.tsx` | `modal.tsx` | v1's mobile rendering is a bottom sheet: RN `Modal transparent animationType="slide"`, a full-screen `Pressable` backdrop (`testID="modal-backdrop"`, v1's overlay colour/opacity) and the sheet `View` with v1's mobile classes (radius, padding, drag-handle bar if v1 shows one in the `__dialog-*` screenshots). Respect the bottom safe-area inset. |
| `confirm-dialog.tsx` | `confirm-dialog.tsx` | Built on `Modal`; same copy defaults ("Cancel" etc.) as v1. |
| `toaster.tsx` | `toaster.tsx` | `sonner-native`'s `Toaster` with v1's position, colours (light/dark via `useThemeMode().resolved`), radius and font; re-export `toast`. |
| `tabs.tsx` | `tabs.tsx` | Controlled/uncontrolled like Base UI; triggers `accessibilityRole="tab"`, `accessibilityState.selected`; v1's list/trigger classes. |

Then replace the RN `Modal` stand-ins in `more-menu.tsx`, `user-menu.tsx` and the Task 7 pickers with `design/ui/modal`. Mount `<Toaster />` inside `SafeAreaProvider` in `app/_layout.tsx`, wrapping the tree in `GestureHandlerRootView` (`flex-1`) as sonner-native requires.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @space/mobile exec jest src/__tests__/design-overlays.test.tsx src/__tests__/design-forms.test.tsx src/__tests__/boot-gate.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/design apps/mobile/app/_layout.tsx apps/mobile/package.json pnpm-lock.yaml apps/mobile/src/__tests__/design-overlays.test.tsx
git commit -m "feat(mobile): port v1 modal, confirm dialog, toaster and tabs"
```

---

### Task 9: Data, rich text, charts, theme toggle

**Files:**
- Create in `apps/mobile/src/design/ui/`: `data-table.tsx`, `charts.tsx`, `rich-text-view.tsx`, `rich-text-editor.tsx`, `theme-toggle.tsx`
- Modify: `apps/mobile/src/design/ui/index.ts`
- Test: `apps/mobile/src/__tests__/design-data.test.tsx`

**Interfaces:**
- Produces: v1's exports with v1's props. `RichTextView({ html: string })`, `RichTextEditor({ value: string; onChange(html: string): void; placeholder?: string })`, `ThemeToggle()` using `useThemeMode`.

- [ ] **Step 1: Install**

```bash
cd ~/projects/JPC/space-v2/apps/mobile
pnpm add react-native-render-html @10play/tentap-editor
```

(`react-native-webview` is already installed; tentap needs it.)

- [ ] **Step 2: Write the failing tests**

`apps/mobile/src/__tests__/design-data.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";

const mockSetMode = jest.fn();
jest.mock("../design/theme/theme-mode", () => ({
  useThemeMode: () => ({ mode: "system", resolved: "light", setMode: mockSetMode }),
}));

import { DataTable, RichTextView, ThemeToggle } from "../design/ui";

it("DataTable renders headers and rows", () => {
  render(
    <DataTable
      columns={[{ key: "name", header: "Name" }, { key: "pct", header: "Attendance" }]}
      rows={[{ id: 1, name: "Mina", pct: "90%" }]}
    />,
  );
  expect(screen.getByText("Name")).toBeTruthy();
  expect(screen.getByText("Mina")).toBeTruthy();
});

it("DataTable shows v1's empty text with no rows", () => {
  render(<DataTable columns={[{ key: "name", header: "Name" }]} rows={[]} />);
  // Text must equal v1 data-table.tsx's empty message.
  expect(screen.getByText(/no/i)).toBeTruthy();
});

it("RichTextView renders sanitised HTML text and drops scripts", () => {
  render(<RichTextView html={'<p>Hello <strong>class</strong></p><script>alert(1)</script>'} />);
  expect(screen.getByText(/Hello/)).toBeTruthy();
  expect(screen.queryByText(/alert/)).toBeNull();
});

it("ThemeToggle switches mode", () => {
  render(<ThemeToggle />);
  fireEvent.press(screen.getByRole("button", { name: /dark/i }));
  expect(mockSetMode).toHaveBeenCalledWith("dark");
});
```

Adjust `DataTable` props to v1's API before implementing. Run and expect FAIL.

- [ ] **Step 3: Port**

| v2 file | v1 file | Notes |
|---|---|---|
| `data-table.tsx` | `data-table.tsx` | Horizontal `ScrollView` around a header row + rows with v1's cell classes; same empty state. |
| `charts.tsx` | `charts.tsx` | v1 uses Recharts. Recreate each chart type v1 exports with `react-native-svg` (paths, bars, axes, labels) using the same colours, bar radius, gridlines and label font sizes as v1's screenshot; tooltips (hover) are dropped — note it. |
| `rich-text-view.tsx` | `rich-text-view.tsx` | `react-native-render-html` with v1's sanitisation rules (same allowed tags as v1's sanitiser — find it via v1 imports) and tag styles matching v1's typography classes. |
| `rich-text-editor.tsx` | `rich-text-editor.tsx` | `@10play/tentap-editor` (Tiptap, same schema family as v1's StarterKit + Link) with v1's toolbar buttons in v1's order and icons; outputs HTML. |
| `theme-toggle.tsx` | `theme-toggle.tsx` | Same options (light / dark / system) and icons; buttons labelled for accessibility with v1's labels. |

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @space/mobile exec jest src/__tests__/design-data.test.tsx`
Expected: PASS. If `react-native-render-html` or tentap fail to transform under Jest, add them to `transformIgnorePatterns` and, for tentap (WebView-based), mock it in the test with a minimal component — the editor is verified visually in Task 10.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/design/ui apps/mobile/package.json pnpm-lock.yaml apps/mobile/jest.config.js apps/mobile/src/__tests__/design-data.test.tsx
git commit -m "feat(mobile): port v1 data table, charts, rich text and theme toggle"
```

---

### Task 10: Showcase and side-by-side check against v1's design-system page

**Files:**
- Create: `apps/mobile/app/dev/design-system.tsx`, `apps/mobile/.maestro/capture-showcase.yaml`, `tools/ui-reference/compare.mjs`, `apps/mobile/src/__tests__/design-showcase.test.tsx`
- Modify: `apps/mobile/src/lib/app-config.ts` (add `showDevRoutes`)

**Interfaces:**
- Consumes: every `design/ui` export; v1's `/dev/design-system` screenshots from Plan 00 (`shots/super/{light,dark}/dev__design-system.png`).
- Produces: `showDevRoutes(): boolean` (reads `EXPO_PUBLIC_SHOW_DEV_ROUTES === "1"`); `compare.mjs` CLI `node compare.mjs --out <file.html> --pair <label> <v1.png> <v2.png> [--pair …]`.

- [ ] **Step 1: Failing test**

`apps/mobile/src/__tests__/design-showcase.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";

jest.mock("../lib/app-config", () => ({ ...jest.requireActual("../lib/app-config"), showDevRoutes: () => false }));
jest.mock("expo-router", () => ({ Redirect: () => null }));

import DesignSystem from "../../app/dev/design-system";

it("is unreachable when dev routes are off", () => {
  render(<DesignSystem />);
  expect(screen.queryByText(/Buttons/)).toBeNull();
});
```

Run: expect FAIL (module missing).

- [ ] **Step 2: Build the showcase**

`apps/mobile/src/lib/app-config.ts` — add:

```ts
export function showDevRoutes(): boolean {
  return process.env.EXPO_PUBLIC_SHOW_DEV_ROUTES === "1";
}
```

`apps/mobile/app/dev/design-system.tsx`: if `!showDevRoutes()` return `<Redirect href="/" />`. Otherwise render, inside `ShellFrame scroll`, the same sections, in the same order, with the same sample content as v1's `src/app/dev/design-system/page.tsx` (and its `swatches.ts`, `form.tsx`, `modal-demo.tsx`, `identity-demo.tsx`) — read those files and mirror them section by section using the ported components. Include the theme toggle at the top so both themes can be captured.

Run the test: PASS.

- [ ] **Step 3: Capture flow**

`apps/mobile/.maestro/capture-showcase.yaml`:

```yaml
appId: com.jpc.space
---
- openLink: spacev2://dev/design-system
- extendedWaitUntil:
    visible: "Buttons"
    timeout: 15000
- takeScreenshot: ${OUT_DIR}/showcase-light
- tapOn:
    text: "Dark"
- takeScreenshot: ${OUT_DIR}/showcase-dark
```

Maestro screenshots the viewport only; for long pages add `- scroll` + numbered `takeScreenshot` steps until the end of the page (v1's capture is full-page — the comparison page stacks v2's viewport shots).

Rebuild with dev routes on and capture:

```bash
mkdir -p ~/projects/JPC/.v2-captures/foundations
tmux new -d -s jpc-space-android-dev "cd ~/projects/JPC/space-v2/apps/mobile && EXPO_PUBLIC_SHOW_DEV_ROUTES=1 EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:4100 npx expo run:android --device emulator-5558 --port 8090 2>&1 | tee ~/logs/jpc-space-android-dev.log"
# once the app is up:
cd ~/projects/JPC/space-v2/apps/mobile && ANDROID_SERIAL=emulator-5558 ~/.maestro/bin/maestro test -e OUT_DIR=$HOME/projects/JPC/.v2-captures/foundations .maestro/capture-showcase.yaml
```

- [ ] **Step 4: Comparison page builder**

`tools/ui-reference/compare.mjs`:

```js
// Builds a self-contained HTML page with v1 and v2 screenshots side by side.
// Images are embedded as data URIs so the file can be sent as one attachment.
// Output contains real data: write it under ~/projects/JPC/.v2-captures only.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
if (outIdx < 0) throw new Error("usage: compare.mjs --out <file.html> --pair <label> <v1.png> <v2.png> […]");
const out = args[outIdx + 1];
const pairs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--pair") pairs.push({ label: args[i + 1], v1: args[i + 2], v2: args[i + 3] });
}
const img = (p) => `data:image/png;base64,${readFileSync(p).toString("base64")}`;
const rows = pairs
  .map((p) => `<section><h2>${p.label}</h2><div class="pair"><figure><figcaption>v1</figcaption><img src="${img(p.v1)}"></figure><figure><figcaption>v2</figcaption><img src="${img(p.v2)}"></figure></div></section>`)
  .join("\n");
writeFileSync(
  out,
  `<!doctype html><meta charset="utf-8"><title>v1 vs v2</title>
<style>body{font-family:system-ui;margin:16px;background:#f4f4f6}section{margin-bottom:32px}
.pair{display:flex;gap:16px;align-items:flex-start}figure{margin:0}img{width:375px;border:1px solid #ccc}</style>
${rows}`,
);
console.log(`wrote ${out} (${pairs.length} pairs) from ${path.basename(process.argv[1])}`);
```

Run:

```bash
S=~/projects/JPC/.v1-reference/shots/super; C=~/projects/JPC/.v2-captures/foundations
node tools/ui-reference/compare.mjs --out $C/compare-foundations.html \
  --pair "Design system — light" $S/light/dev__design-system.png $C/showcase-light.png \
  --pair "Design system — dark"  $S/dark/dev__design-system.png  $C/showcase-dark.png
```

- [ ] **Step 5: Compare and fix**

Open both image pairs with the Read tool. For every visible difference (size, colour, spacing, radius, font, icon, copy) fix the ported component and re-capture, until the only differences are the platform ones listed in each component's "Native differences" comment. Write any remaining difference into `docs/superpowers/ui-rebuild/gaps-foundations.md` (component, difference, reason). Commit that file.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/dev/design-system.tsx apps/mobile/src/lib/app-config.ts apps/mobile/.maestro/capture-showcase.yaml tools/ui-reference/compare.mjs apps/mobile/src/__tests__/design-showcase.test.tsx docs/superpowers/ui-rebuild/gaps-foundations.md
git commit -m "feat(mobile): design-system showcase matched against v1"
```

---

### Task 11: Wire the shell into the app, update docs, ship the batch

**Files:**
- Modify: `apps/mobile/app/(app)/_layout.tsx` (use `FloatingTabBar` via `tabBar`), `apps/mobile/src/__tests__/app-layout.test.tsx` (if it asserted the old bar), `CLAUDE.md` (space-v2 root, "Mobile conventions")
- Delete: `apps/mobile/src/components/NavIcon.tsx` once nothing imports it (grep first)

**Interfaces:**
- Consumes: `FloatingTabBar`, `NavIcon` (design), `routeNameForHref`.

- [ ] **Step 1: Failing layout test**

Add to `apps/mobile/src/__tests__/app-layout.test.tsx` (follow the file's existing render setup for `AppLayout`):

```tsx
it("renders v1's floating tab bar with the role's tabs", async () => {
  // existing helper that renders AppLayout signed in as a student
  await renderAppLayoutAs("STUDENT");
  expect(screen.getAllByRole("tab").length).toBeGreaterThan(0);
  expect(screen.getAllByRole("tab").length).toBeLessThanOrEqual(5);
});
```

If the file has no such helper, render `AppLayout` the way its existing tests do and assert on `getAllByRole("tab")`. Run and expect FAIL (the default bar does not render `role="tab"` elements with these labels in the same structure).

- [ ] **Step 2: Use the floating bar**

In `apps/mobile/app/(app)/_layout.tsx`, keep all existing comments, ordering logic, `href: null` rules and redirects; change only the `Tabs` element:

```tsx
<Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <FloatingTabBar {...props} items={tabs} />}>
```

and drop the `tabBarIcon` option (the floating bar renders icons itself). Remove the `NavIcon` import from the old component. Run: `pnpm --filter @space/mobile exec jest src/__tests__/app-layout.test.tsx src/__tests__/role-tabs.test.tsx` → PASS.

- [ ] **Step 3: Update CLAUDE.md**

In space-v2 `CLAUDE.md`, replace the "Mobile conventions" paragraphs about `useTheme()` / `src/ui` primitives / `Screen` edges with:

```markdown
**UI matches v1 exactly** (owner ruling 2026-10-14, spec
`docs/superpowers/specs/2026-10-14-mobile-ui-v1-match-design.md`). Styling is
NativeWind with a theme generated from v1's resolved tokens
(`pnpm --filter @space/mobile design:tokens`). Components live in
`src/design/` under v1's file names and keep v1's class strings, variants and
copy; porting rules are in `docs/superpowers/plans/2026-10-14-ui-plan-01-foundations.md`
Task 6. A screen is done only after a side-by-side capture against v1
(`tools/ui-reference/`). `src/ui/` and `src/theme/` are legacy and are deleted
when the last screen stops importing them.
```

Keep the rest of the section (typed routes, data fetching, Zod contracts, testing notes) as is.

- [ ] **Step 4: Full checks**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit` from the repo root.
Expected: all green. Fix any failure before continuing (do not skip tests).

- [ ] **Step 5: Capture the shell on real screens**

With the dev build running, use `login-as.yaml` for the student and admin reference users and `takeScreenshot` the dashboard in light and dark; build `compare-shell.html` with `compare.mjs` pairing them with v1's role home screenshots (`shots/<role>/{light,dark}/<role>.png` or the role's landing pattern from the manifest). Only the shell (top bar, tab bar) is expected to match at this stage — screen bodies change in batches 2–6. Note shell differences in `gaps-foundations.md` and fix them.

- [ ] **Step 6: Commit, PR, TestFlight**

```bash
git add apps/mobile/app/'(app)'/_layout.tsx apps/mobile/src/__tests__/app-layout.test.tsx CLAUDE.md docs/superpowers/ui-rebuild/gaps-foundations.md
git rm apps/mobile/src/components/NavIcon.tsx   # only if grep shows no importers
git commit -m "feat(mobile): v1 floating tab bar in the app shell"
```

Send the owner `compare-foundations.html` and `compare-shell.html` (private files, not artifacts). Ask before pushing; then push the branch, open the PR, and after merge run the iOS TestFlight build as in the release runbook (tmux `jpc-space-ios-build`, `EXPO_TOKEN` from `~/.secrets/expo-token-space-v2`, `eas build --profile production --platform ios --auto-submit`).
