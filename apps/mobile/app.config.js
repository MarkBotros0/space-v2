/**
 * Extends app.json (Expo passes it in as `config`) with the one plugin whose
 * options depend on the build environment: Sentry's.
 *
 * The plugin adds a source-map / debug-file upload step to release builds.
 * That step fails the build when it has no credentials, so it is switched
 * off unless SENTRY_AUTH_TOKEN is present — a build without any Sentry
 * variables behaves exactly as it did before Sentry. Organization and
 * project come from SENTRY_ORG / SENTRY_PROJECT (set beside the token in
 * EAS); they are passed explicitly, even when undefined, so the plugin does
 * not warn about them on every `expo start`.
 *
 * Runtime reporting is separate and keyed on EXPO_PUBLIC_SENTRY_DSN
 * (src/lib/sentry.ts).
 */
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    [
      "@sentry/react-native/expo",
      {
        url: "https://sentry.io/",
        organization: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        disableAutoUpload: !process.env.SENTRY_AUTH_TOKEN,
      },
    ],
  ],
});
