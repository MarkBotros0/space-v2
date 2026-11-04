const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

// Expo's default config detects the pnpm workspace on its own: watchFolders
// already lists the root node_modules and every workspace package
// (packages/shared included), and nodeModulesPaths covers this app's and the
// root's node_modules. Overriding either drops entries Expo adds and
// expo-doctor flags it, so neither is set here.
const config = getDefaultConfig(__dirname);

// inlineRem 16: v1 is a browser app where 1rem = 16px. NativeWind's native
// default is 14, which would shrink every rem-based class (text-[0.8rem], …).
module.exports = withNativeWind(config, { input: "./global.css", inlineRem: 16 });
