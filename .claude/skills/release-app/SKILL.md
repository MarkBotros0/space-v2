---
name: release-app
description: Build the JPC Space mobile app on EAS and submit it to App Store Connect / TestFlight. Use when asked to release, ship, publish, build for the store, or submit the app on EAS.
---

# Release the mobile app (EAS Build + Submit)

iOS only so far. Android has no Play submit setup (no service-account key) — say so
and ask before attempting it.

## Facts

| What | Value |
|---|---|
| App dir | `apps/mobile` (run every `eas` command from here) |
| Expo account / project | `kdaniel5` / `@kdaniel5/space-v2` (`633d9f9f-6744-45c9-854e-fa12c1025e52`) |
| Expo token | `~/.secrets/expo-token-space-v2` — pass as `EXPO_TOKEN`. The globally logged-in `eas` user (`markbotros.aigorithm`) has **no access** to this project; without the token every command fails with "Entity Not Authorized" |
| Bundle id | `com.jpc.space` |
| App Store Connect app (Apple ID) | `6822659075`, SKU `EX1791968610038` — set as `submit.production.ios.ascAppId` in `eas.json` |
| Apple team | `932V894DYN` (Mark Botros, Individual) |
| ASC API key | stored on EAS servers (Key ID `CRK9566Q82`), picked up automatically |
| Versioning | `appVersionSource: remote` + `autoIncrement` — EAS bumps the build number; marketing version is `expo.version` in `app.json` |

Never print the token's value or commit it; read it from the file at run time.

## Steps

1. **Pre-flight** (repo root): working tree clean, on the commit you mean to ship.
   ```bash
   git status --short && git log -1 --oneline
   pnpm --filter @space/mobile typecheck && pnpm --filter @space/mobile lint
   ```
   Ask whether to bump `expo.version` in `apps/mobile/app.json` if the user hasn't said.

2. **Build + auto-submit** in tmux (takes ~10–20 min):
   ```bash
   mkdir -p ~/logs; tmux kill-session -t space-v2-eas-release 2>/dev/null
   tmux new -d -s space-v2-eas-release "cd /home/mark/projects/JPC/space-v2/apps/mobile && EXPO_TOKEN=\$(cat ~/.secrets/expo-token-space-v2) eas build --platform ios --profile production --auto-submit --non-interactive 2>&1 | tee ~/logs/space-v2-eas-release.log; echo EXIT=\${PIPESTATUS[0]} >> ~/logs/space-v2-eas-release.log"
   ```
   Tell the user the session name and log path. Watch the log for
   `Build finished|failed|Submission|successfully uploaded|EXIT=`.

3. **Check status** of a build if needed:
   ```bash
   cd apps/mobile && EXPO_TOKEN=$(cat ~/.secrets/expo-token-space-v2) eas build:list --platform ios --limit 5 --non-interactive
   EXPO_TOKEN=$(cat ~/.secrets/expo-token-space-v2) eas build:view <build-id>
   ```

4. **Submit an existing build** (if auto-submit failed or the build was made without it) — no rebuild:
   ```bash
   cd apps/mobile && EXPO_TOKEN=$(cat ~/.secrets/expo-token-space-v2) eas submit --platform ios --profile production --id <build-id> --non-interactive
   ```

5. **Report**: version + build number, commit, submission URL, and that Apple
   processing takes ~5–10 min before it appears at
   https://appstoreconnect.apple.com/apps/6822659075/testflight/ios

## Gotchas

- `--non-interactive` without `ascAppId` fails with "Set ascAppId in the submit
  profile". Interactive mode instead asks for an Apple ID password + 2FA, which
  Claude cannot enter — keep `ascAppId` in `eas.json`.
- The ASC API key only works for submit; any step that needs an Apple Developer
  **login** (new credentials, expired cert/profile — both currently expire
  2027-10-14) must be done by the user: `tmux attach -t <session>`.
- eas-cli has no `--no-wait=false`; omit `--no-wait` to wait.
- Pushing to git: `gh auth switch --user MarkBotros0 && git push`.
