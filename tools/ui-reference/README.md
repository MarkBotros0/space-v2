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

## Privacy

Everything under `~/projects/JPC/.v1-reference/` contains user data: never
commit it, never publish it. `jpc-space` itself is read-only — these scripts
only read it.
