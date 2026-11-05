/**
 * Jest resolver: React Native's (which jest-expo sets and a `resolver` here
 * would otherwise replace), plus the rule Reanimated and Worklets ship in
 * their own `jest/resolver.js`.
 *
 * Since Expo SDK 58 (Reanimated 4.7, Worklets 0.13) both initialise
 * native-only pieces on import, which throws under Jest; their resolvers make
 * Jest load the web build of those files instead, by dropping the `.native`
 * extensions. Theirs can't be used as they are: they test whether the
 * importing directory's path *contains* the package name, and pnpm's
 * `.pnpm/<pkg>@<ver>_<peers>` folder names carry their peers' names too, so
 * NativeWind's css-interop (a Reanimated peer) got its web runtime and every
 * suite failed. Here the match is on the package's own `node_modules/<name>/`
 * directory.
 */
const reactNativeResolver = require("@react-native/jest-preset/jest/resolver");

const inPackage = (name) => new RegExp(`[\\\\/]node_modules[\\\\/]${name}[\\\\/]`);
const IN_WORKLETS = inPackage("react-native-worklets");
const IN_REANIMATED = inPackage("react-native-reanimated");

// react-native-reanimated/jest/resolver.js (4.7): files Reanimated resolves to
// their web build under Jest.
const REANIMATED_WEB_ONLY = [
  "initializers",
  "mutables",
  "mappers",
  "ConfigHelper",
  "UpdateLayoutAnimations",
  "useAnimatedRef",
  "useAnimatedStyle",
  "WorkletEventHandler",
  "JSPropsUpdater",
  "updateProps",
  "util",
  "css/component/AnimatedComponent",
];

function webOnly(request, options) {
  if (request === "react-native-worklets" || request.startsWith("react-native-worklets/")) return true;
  if (IN_WORKLETS.test(options.basedir)) return true;
  if (!request.startsWith(".") || !IN_REANIMATED.test(options.basedir)) return false;
  const basename = request.split("/").pop();
  return REANIMATED_WEB_ONLY.some((entry) => (entry.includes("/") ? request.endsWith(entry) : basename === entry));
}

module.exports = (request, options) =>
  reactNativeResolver(
    request,
    webOnly(request, options)
      ? { ...options, extensions: options.extensions?.filter((ext) => !ext.includes("native")) }
      : options,
  );
