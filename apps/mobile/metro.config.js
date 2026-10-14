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
