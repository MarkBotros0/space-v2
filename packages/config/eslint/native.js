const base = require("./index.js");
const react = require("eslint-plugin-react");
const reactHooks = require("eslint-plugin-react-hooks");
const reactNative = require("eslint-plugin-react-native");

module.exports = [
  ...base,
  {
    files: ["**/*.tsx"],
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-native": reactNative,
    },
    settings: { react: { version: "detect" } },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react/jsx-uses-react": "off",
      "react/react-in-jsx-scope": "off",
    },
  },
];
