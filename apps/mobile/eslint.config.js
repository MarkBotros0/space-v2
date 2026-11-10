module.exports = [
  ...require("@space/config/eslint-native"),
  // Refactor Wave 7 boundary: screens, routes and the kit read data through src/hooks/,
  // never the HTTP plumbing (lib/api-client, lib/api-request) or axios itself.
  {
    files: ["app/**/*.{ts,tsx}", "src/screens/**/*.{ts,tsx}", "src/design/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "axios", message: "Only the API plumbing in src/lib imports axios." }],
          patterns: [
            {
              group: ["**/lib/api-client", "**/lib/api-request"],
              message: "Read and write through a hook in src/hooks/, not the API client.",
            },
          ],
        },
      ],
    },
  },
  // The design kit (src/design) is presentational: it never reads data or app state, and never
  // reaches up into a screen. The four shell pieces below render the signed-in user's chrome and
  // are the named exceptions.
  {
    files: ["src/design/**/*.{ts,tsx}"],
    ignores: [
      "src/design/layout/home-actions.tsx",
      "src/design/layout/more-menu.tsx",
      "src/design/layout/dev-user-switcher.tsx",
      "src/design/layout/route-states.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "axios", message: "Only the API plumbing in src/lib imports axios." }],
          patterns: [
            {
              group: ["**/lib/api-client", "**/lib/api-request"],
              message: "Read and write through a hook in src/hooks/, not the API client.",
            },
            {
              group: ["**/hooks/*", "**/hooks/**", "**/store/*", "**/screens/*", "**/screens/**"],
              message:
                "src/design is the presentational kit: take data as props; data-bound views live in src/screens/<feature>/.",
            },
          ],
        },
      ],
    },
  },
];
