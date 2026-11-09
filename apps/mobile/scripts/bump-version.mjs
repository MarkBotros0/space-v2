// apps/mobile/scripts/bump-version.mjs
//
// Owner, 2026-11-09: the version and the build number always move together:
// version 1.0.N ships as iOS buildNumber N and Android versionCode N.
// `pnpm --filter @space/mobile version:bump` raises all three by one; run it
// before every store build (see .claude/skills/release-app). Versioning is
// local (eas.json appVersionSource "local"), so EAS never changes them itself.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appJsonPath = fileURLToPath(new URL("../app.json", import.meta.url));

/** The build number a version stands for, or null when the three disagree. */
export function lockstepBuild(expo) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(expo.version ?? "");
  if (!match) return null;
  const n = Number(match[3]);
  if (expo.ios?.buildNumber !== String(n)) return null;
  if (expo.android?.versionCode !== n) return null;
  return n;
}

const app = JSON.parse(readFileSync(appJsonPath, "utf8"));
const current = lockstepBuild(app.expo);
if (current === null) {
  console.error(
    `app.json is out of step: version ${app.expo.version}, ios.buildNumber ${app.expo.ios?.buildNumber}, ` +
      `android.versionCode ${app.expo.android?.versionCode}. Fix them by hand so all three end in the same N.`,
  );
  process.exit(1);
}
const next = current + 1;
const [major, minor] = app.expo.version.split(".");
app.expo.version = `${major}.${minor}.${next}`;
app.expo.ios.buildNumber = String(next);
app.expo.android.versionCode = next;
writeFileSync(appJsonPath, JSON.stringify(app, null, 2) + "\n");
console.log(`version ${app.expo.version}, build ${next}`);
