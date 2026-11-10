module.exports = [
  ...require("@space/config/eslint-native"),
  // Refactor Wave 7 boundary: screens, routes and the kit read data through src/hooks/,
  // never the HTTP plumbing (lib/api-client, lib/api-request) or axios itself.
  {
    files: [
      "app/**/*.{ts,tsx}",
      "src/screens/**/*.{ts,tsx}",
      "src/components/**/*.{ts,tsx}",
      "src/design/**/*.{ts,tsx}",
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
          ],
        },
      ],
    },
  },
];
