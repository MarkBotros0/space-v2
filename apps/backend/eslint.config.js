module.exports = [
  ...require("@space/config/eslint"),
  { ignores: ["src/generated/**"] },
  // Refactor Wave 7 guardrails. A soft-delete filter is spelled with lib/db/live.ts's
  // fragments, never a literal `deletedAt: null` inside a `where` (a write or a
  // response body may still say it). A transaction lives in a lib/<domain>/ service,
  // never in a route handler.
  {
    files: ["src/**/*.ts"],
    ignores: ["src/__tests__/**", "src/lib/db/live.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Property[key.name='where'] Property[key.name='deletedAt'][value.raw='null']",
          message: "Use liveUser / liveSeason / liveAssignment from lib/db/live.ts, not a literal deletedAt: null.",
        },
      ],
    },
  },
  {
    files: ["src/routes/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Property[key.name='where'] Property[key.name='deletedAt'][value.raw='null']",
          message: "Use liveUser / liveSeason / liveAssignment from lib/db/live.ts, not a literal deletedAt: null.",
        },
        {
          selector: "MemberExpression[property.name='$transaction']",
          message: "Put the transaction in a lib/<domain>/ service; route handlers don't open one.",
        },
      ],
    },
  },
];
