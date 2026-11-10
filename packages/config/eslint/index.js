const tsPlugin = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");
const prettier = require("eslint-config-prettier");

module.exports = [
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  // Size rules (refactor Wave 2; errors since Wave 7). max-lines holds every file,
  // tests included, to the 400-line rule, and max-depth caps nesting at 3. The
  // per-function rules skip tests, where a describe callback is long by design,
  // and stay warnings: getting them to zero needs refactors the owner skipped
  // (D8). Generated code, migrations and the hand-written OpenAPI data are out of
  // scope.
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["**/src/generated/**", "**/prisma/migrations/**"],
    rules: {
      "max-lines": ["error", { max: 400, skipBlankLines: false, skipComments: false }],
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["**/src/generated/**", "**/prisma/migrations/**", "**/__tests__/**", "**/src/docs/**"],
    rules: {
      "max-lines-per-function": ["warn", { max: 50, skipBlankLines: true, skipComments: true, IIFEs: true }],
      "max-depth": ["error", 3],
      complexity: ["warn", 15],
    },
  },
  prettier,
];
