import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Extends app.json. The only dynamic part: when `E2E_BUILD=1` (the CI Maestro
 * build), allow cleartext HTTP so the release APK can reach the plain-http test
 * backend on the runner. Real builds never set it, so production traffic stays
 * HTTPS-only.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  plugins: [
    ...(config.plugins ?? []),
    ...(process.env.E2E_BUILD === "1"
      ? [
          ["expo-build-properties", { android: { usesCleartextTraffic: true } }] as [
            string,
            unknown,
          ],
        ]
      : []),
  ],
});
