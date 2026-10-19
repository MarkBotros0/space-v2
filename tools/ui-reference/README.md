# ui-reference — v1 screenshots, tokens and the v2 capture rig

Reference material for the mobile UI rebuild
(`docs/superpowers/specs/2026-10-14-mobile-ui-v1-match-design.md`).
Not part of the pnpm workspace; install with `npm install` here.

The database is the shared **test** database: scripts read `DATABASE_URL`
from `~/projects/JPC/jpc-space/.env` themselves and never print it.

## v1 reference (Plan 00)

```
./setup-v1.sh          # copy jpc-space -> ~/projects/JPC/.v1-reference/app, .env.local, npm ci
./start-v1.sh          # production build on http://127.0.0.1:3100 (tmux: jpc-space-v1-ref)
npm run pick-users     # one user per role -> .v1-reference/users.json (read-only query)
npm test
```

Capture, one tmux session per role (a slow page then costs one role, not the run):

```
for r in student alumni leader admin super mentor; do
  tmux new -d -s jpc-space-v1-cap-$r "node capture.mjs --role $r 2>&1 | tee ~/logs/jpc-space-v1-capture-$r.log"
done
# pages the link crawl cannot reach (notifications, signed-out pages, JS-linked details):
for r in public student alumni leader admin super mentor; do node capture.mjs --role $r --extra; done
node merge-manifest.mjs   # manifest.<role>[.extra].json -> manifest.json, patterns re-derived, deduped
npm run export-tokens     # -> docs/superpowers/ui-rebuild/v1-tokens.json (committed)
npm run screen-map        # -> docs/superpowers/ui-rebuild/screen-map.md (committed)
```

Hand-review of the screen map lives in `screen-map.mjs` (`EXPLICIT`,
`SECTION_OF`, `NOTES`), never in the generated `.md`, so a re-run keeps it.

**Screenshot artefact:** the copy runs with `DEV_USER_SWITCHER=1`, so every
signed-in page shows a yellow "switch user" icon in the top bar, and a page's
first dialog shot is usually that menu. Neither is part of v1's real UI —
ignore both when comparing.

## v2 capture rig (Plan 01)

```
./emulator.sh [--wipe]                 # AVD jpc-ui on emulator-5558, forced to 375dp wide
./backend.sh                           # v2 backend on :4100 (tmux: jpc-space-backend-ref)
node set-reference-passwords.mjs       # known password for the six reference users (originals saved)
node restore-reference-passwords.mjs   # put the originals back — run when captures are done
./capture-v2.sh <role|public> <light|dark> <route> <name> [shots]  # -> ~/projects/JPC/.v2-captures/batch-2/<role>/<theme>/
./batch-2-pairs.sh                     # -> compare-batch-2.html (send privately, never publish)
```

JPC's Metro runs on port 8095 (`npx expo start --dev-client --port 8095`); build
the debug APK with `./gradlew assembleDebug -PreactNativeDevServerPort=8095` and
install with `adb -s emulator-5558 install -r …`. `expo run:android` picks
whichever emulator it likes — don't use it. The `nanny-e2e` (5554) and
`egx-ui` (5556) emulators and Metro on 8081/8090 belong to other projects.

## UI sweep

```
node ui-sweep.mjs                                                  # every flow, all 16 cells
node ui-sweep.mjs --cells=small-1.3-3btn-light,iphone-1.0-gesture-dark --flows=s02
node ui-sweep.mjs --into=<run folder> --cells=small --flows=s02    # re-run into an earlier sheet
node ui-sweep.mjs --restore                                        # put the device back after a crash
```

Not the v1 comparison and not a test. It runs `apps/mobile/.maestro/sweep/s*.yaml` on emulator-5558
across a matrix and screenshots every state, so someone can *look* at what the v1 match can't show:
small phones, font scale, the Android nav bar, the keyboard and dark mode. The `ui-sweep` skill
(`.claude/skills/ui-sweep/`) covers when to run it, writing flows and reviewing the shots.

| Axis | Values | How |
|---|---|---|
| Screen | `small` 360×640 dp (`720x1280` @ 320) · `iphone` 375×812 dp (`1125x2436` @ 480, this rig's default) | `wm size` / `wm density` |
| Font scale | 1.0 · 1.3 (the app sets no cap) | `settings put system font_scale` |
| Navigation | `3btn` · `gesture` | `cmd overlay enable-exclusive` |
| Theme | `light` · `dark` | `cmd uimode night` |

Cell ids are `<screen>-<font>-<nav>-<theme>`; `--cells` and `--flows` take comma-separated prefixes.
Needs the emulator and Metro on 8095; flows that sign in also need `./backend.sh` and
`set-reference-passwords.mjs` (the runner refuses them otherwise). It passes `<ROLE>_EMAIL` for every
role in `users.json`, `PASSWORD` (blanked in its output) and `THEME` to each flow. Flows never save:
the database is shared with v1. Keyboard shots need the soft keyboard, so the runner turns on
`show_ime_with_hard_keyboard`. It saves the device's settings to `.device-before.json` and restores
them at the end, also on Ctrl+C.

Output: `~/projects/JPC/.v2-captures/ui-sweep/<timestamp>/` — one folder per cell, `results.json` and
`index.html` (one row per state, one column per cell). A flow that stops early leaves
`<sNN>-zz-FAILED.png`. Same privacy as the rest of `.v2-captures/`: real users, never commit or publish.
Android only; iOS is not covered.

**Without the devbox:** `.github/workflows/ui-sweep.yml` runs the sweep on a GitHub-hosted emulator
(Actions → "UI sweep" → Run workflow; pick cells and flows) against a release APK. A full run splits the
16 cells over four parallel jobs and joins them with `build-sheet.mjs` into one self-contained page, the
`ui-sweep-contact-sheet` artifact (`ui-sweep.html`, screenshots embedded, one section per flow). It never touches the shared test database: the job migrates a
throwaway Postgres and seeds fake users for every role (`apps/backend/scripts/seed-sweep.ts`, which
refuses non-local hosts). The repo is public, so its artifacts are too, which is why only fake data may
appear in them. `UI_SWEEP_USERS_FILE` and `UI_SWEEP_PASSWORD` point the runner at those fake users;
`UI_SWEEP_ADB`, `UI_SWEEP_MAESTRO`, `UI_SWEEP_DEVICE`,
`UI_SWEEP_OUTPUT` and `UI_SWEEP_NO_METRO=1` override the devbox defaults.

## Privacy

Everything under `~/projects/JPC/.v1-reference/` contains user data: never
commit it, never publish it. `jpc-space` itself is read-only — these scripts
only read it.
