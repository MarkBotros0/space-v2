module.exports = {
  preset: "jest-expo",
  testMatch: ["**/__tests__/**/*.test.tsx", "**/__tests__/**/*.test.ts"],
  // Jest's 5s default is not enough for a React Native render test when the
  // whole turbo graph is running in parallel — the suites pass alone and pass
  // under `turbo test:unit` alone, but flake in a full `turbo build lint
  // typecheck test:unit` on a small machine (Vercel's build box is 2 cores).
  // The work is CPU-bound, not hung, so a larger budget is the right fix.
  testTimeout: 30000,
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  // app/_layout.tsx imports ../global.css (NativeWind); Jest cannot parse CSS.
  // lucide-react-native's "react-native" export is ESM (.mjs), which Jest does
  // not transform; tests use its CommonJS build (Metro keeps the ESM one).
  moduleNameMapper: {
    "\\.css$": "<rootDir>/__mocks__/style-mock.js",
    "^lucide-react-native$": require.resolve("lucide-react-native"),
  },
  transformIgnorePatterns: [
    "node_modules/(?!(\\.pnpm|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|nativewind|react-native-css-interop))",
  ],
};
