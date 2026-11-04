const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const { withNativeWind } = require("nativewind/metro");

// getSentryExpoConfig is Expo's getDefaultConfig plus Sentry's debug-id
// serializer, which stamps each bundle so uploaded source maps match it. It
// needs no credentials and sends nothing; uploading is the build step's job
// (app.config.js).
//
// Expo's default config detects the pnpm workspace on its own: watchFolders
// already lists the root node_modules and every workspace package
// (packages/shared included), and nodeModulesPaths covers this app's and the
// root's node_modules. Overriding either drops entries Expo adds and
// expo-doctor flags it, so neither is set here.
const config = getSentryExpoConfig(__dirname);

// inlineRem 16: v1 is a browser app where 1rem = 16px. NativeWind's native
// default is 14, which would shrink every rem-based class (text-[0.8rem], …).
module.exports = withNativeWind(config, { input: "./global.css", inlineRem: 16 });
